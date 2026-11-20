<script>
  import { app, saveSettings, itemById, recipeById, savePlan, listBareMinimum, importBareMinimum, toast, owned } from '../lib/db.svelte.js';
  import { rankByPantry, daysLeft } from '../lib/pantry.js';
  import Weeks from './Weeks.svelte';
  import Calendar from '../components/Calendar.svelte';
  import { ui } from '../lib/ui.svelte.js';
  import FindRecipes from '../components/FindRecipes.svelte';
  let finding = $state(false);
  import { trip, planTrip } from '../lib/trip.svelte.js';
  let { go } = $props();
  let focusWeek = $state('');   // a future week opened from the calendar

  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'];
  const kind = (r) => { const w = String(r?.when || '').toLowerCase(); return /breakfast/.test(w) ? 'breakfast' : /snack|dessert|treat/.test(w) ? 'snack' : 'main'; };
  const short = (r) => (r ? String(r.title).replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+with .*$/i, '').trim() : '');
  const weekOf = (r) => { const m = String(r.id).match(/^bm(\d\d)(\d\d)-/); return m ? `${['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m[1]]} ${+m[2]} week` : r.custom ? 'yours' : 'Thanksgiving week'; };

  // the plan in one sentence: "Prep 2 meals for 5 people, Mon–Fri" (+ snack)
  const DEFAULT_MEALS = { 1: ['dinner'], 2: ['lunch', 'dinner'], 3: ['breakfast', 'lunch', 'dinner'] };
  let shape = $state({ meals: ['lunch', 'dinner'], snack: false, from: 0, to: 4, ...(app.plan.shape || app.settings.planShape || {}) });
  function autoFill(recipes, household) {
    household = Math.max(1, Number(household) || 1);
    const on = new Set([...shape.meals, ...(shape.snack ? ['snack'] : [])]);
    const all = DAYS.map((d) => ({ day: d, people: household, breakfast: '', lunch: '', dinner: '', snack: '' }));
    const grid = all.slice(shape.from, shape.to + 1), g = { breakfast: [], snack: [], main: [] };
    recipes.forEach((r) => g[kind(r)].push(r));
    ['breakfast', 'snack'].forEach((k) => on.has(k) && g[k].length && grid.forEach((d, i) => (d[k] = g[k][i % g[k].length].id)));
    const q = g.main.map((r) => ({ id: r.id, left: Math.max(1, Math.round((Number(r.servings) || household) / household)) }));
    const slots = [...(on.has('dinner') ? grid.map((d) => [d, 'dinner']) : []), ...(on.has('lunch') ? grid.map((d) => [d, 'lunch']) : [])];
    let qi = 0;
    slots.forEach((sl) => { for (let t = 0; t < q.length; t++) { const x = q[qi++ % q.length]; if (x.left > 0) { sl[0][sl[1]] = x.id; x.left--; return; } } });
    if (!on.has('breakfast')) grid.forEach((d) => (d.breakfast = ''));
    return all;
  }
  function reshape(patch) {
    Object.assign(shape, patch);
    if (shape.to < shape.from) shape.to = shape.from;
    days = autoFill(picked, household);
  }
  function setMealCount(n) { reshape({ meals: DEFAULT_MEALS[n] }); }
  function toggleMeal(m) { const has = shape.meals.includes(m); if (has && shape.meals.length === 1) return; reshape({ meals: has ? shape.meals.filter((x) => x !== m) : ['breakfast', 'lunch', 'dinner'].filter((x) => x === m || shape.meals.includes(x)) }); }
  const D3 = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  let goalOn = $state(!!app.settings.calorieGoal), goal = $state(app.settings.calorieGoal || 600);
  const cal = (r) => Number(r.calories) || 0;

  // working copy of the plan
  const onPlan = new Set(); (app.plan.days || []).forEach((d) => SLOTS.forEach((s) => d[s] && onPlan.add(d[s])));
  let sel = $state(Object.fromEntries(app.recipes.filter((r) => r.active || onPlan.has(r.id)).map((r) => [r.id, true])));
  let household = $state(Number(app.plan.household || app.settings.householdSize) || 3);
  let days = $state(app.plan.days?.length ? app.plan.days.map((d) => ({ ...d })) : autoFill(app.recipes.filter((r) => r.active), household));
  let posts = $state(null), loading = $state(false), importing = $state(''), msg = $state(''), err = $state(''), saving = $state(false);
  let pantry = $state(''), sourceUrl = $state('');

  let picked = $derived(app.recipes.filter((r) => sel[r.id]));
  let por = $derived.by(() => { const o = {}; days.forEach((d) => SLOTS.forEach((s) => d[s] && (o[d[s]] = (o[d[s]] || 0) + (Number(d.people) || 0)))); return o; });
  let similar = $derived.by(() => {
    const pool = new Set(); picked.forEach((r) => Object.keys(r.items).forEach((i) => pool.add(i)));
    app.items.forEach((i) => owned(i) && pool.add(i.id));
    return app.recipes.filter((r) => !sel[r.id] && Object.keys(r.items).length).map((r) => {
      const ids = Object.keys(r.items), shared = ids.filter((i) => pool.has(i));
      return { r, shared, total: ids.length, score: shared.length / ids.length + shared.length * 0.02 };
    }).sort((a, b) => b.score - a.score).slice(0, 10);
  });

  // recipes ranked by what's already in the pantry
  const priceOf = (id) => { const row = app.prices[id] || {}; const v = Object.values(row).map((e) => e?.price).filter((x) => x > 0); return v.length ? Math.min(...v) : 0; };
  let fromPantry = $derived(app.pantry.length ? rankByPantry(app.recipes, app.pantry, app.items, priceOf).slice(0, 8) : []);
  let useSoon = $derived(app.pantry.filter((p) => { const d = daysLeft(p.use_by); return d != null && d <= 3; }));
  let showPantry = $state(true);

  async function loadPosts() { loading = true; err = ''; try { posts = await listBareMinimum(); } catch (e) { err = e.message; } loading = false; }
  async function bring(p, use) {
    importing = p.slug; err = ''; msg = '';
    try {
      const imp = p.recipeIds ? { recipeIds: p.recipeIds, title: p.title, url: p.url, already: true } : await importBareMinimum(p.slug);
      p.recipeIds = imp.recipeIds;
      if (use) { sel = Object.fromEntries(imp.recipeIds.map((id) => [id, true])); days = autoFill(picked, household); pantry = imp.pantry || ''; sourceUrl = imp.url; }
      msg = imp.already ? `✓ Picked the ${p.date} week and spread it over Monday–Friday.` :
        `✓ Brought in ${imp.recipeIds.length} recipes and ${imp.newItems} new shopping items${imp.reused ? ` (${imp.reused} matched to items you already track)` : ''}. ${use ? 'They’re picked and spread over Monday–Friday — adjust anything, then press Start.' : 'They’re in the options below.'}`;
    } catch (e) { err = e.message; }
    importing = '';
  }
  function toggle(id) {
    if (sel[id]) { delete sel[id]; days.forEach((d) => SLOTS.forEach((s) => d[s] === id && (d[s] = ''))); } else sel[id] = true;
    msg = '';
  }
  function setHousehold(v) { const nv = Math.max(1, Number(v) || 1); days.forEach((d) => { if (Number(d.people) === Number(household)) d.people = nv; }); household = nv; }
  async function save(startNew) {
    if (!picked.length) { err = 'Pick at least one recipe.'; return; }
    saving = true; err = '';
    try {
      await savePlan({ household, shape: $state.snapshot(shape), days: $state.snapshot(days), selected: Object.keys(sel), startNewWeek: startNew, pantry, sourceUrl });
      trip.result = null;
      if (startNew) { go('trip'); planTrip(); } else toast('✓ Plan saved');
    } catch (e) { err = e.message; }
    saving = false;
  }
  const opts = (slot) => { const want = slot === 'breakfast' ? 'breakfast' : slot === 'snack' ? 'snack' : 'main'; return picked.slice().sort((a, b) => (kind(b) === want) - (kind(a) === want)); };
</script>

<div class="page">
  <div class="spread">
    <h1>Plan the week</h1>
    <div class="row" style="gap:6px">
      <button class="ghost iconbtn" title="Saved recipes" aria-label="Saved recipes" onclick={() => go('recipes')}>📖</button>
      <button class="ghost iconbtn" title="Plan ahead: next 6 weeks" aria-label="Plan ahead" onclick={() => { ui.calendar = !ui.calendar; focusWeek = ''; }}>📅<sup>+</sup></button>
    </div>
  </div>
  {#if ui.calendar && !focusWeek}
    <Calendar onpick={(start) => (focusWeek = start)} onthis={() => (ui.calendar = false)} onclose={() => (ui.calendar = false)} />
  {:else if ui.calendar && focusWeek}
    <button class="quiet" onclick={() => (focusWeek = '')}>← All 6 weeks</button>
    <Weeks {go} focus={focusWeek} showThisWeek={() => { ui.calendar = false; focusWeek = ''; }} />
  {:else}
  <p class="muted">Pick recipes, say who's eating when, and the shopping list and trip rebuild to match.</p>
  {#if err}<div class="err">⚠️ {err}</div>{/if}
  {#if msg}<div class="ok">{msg}</div>{/if}

  <div class="card">
    <div class="spread"><h3 style="margin:0">🥫 Cook from your pantry</h3>{#if fromPantry.length}<button class="quiet" onclick={() => (showPantry = !showPantry)}>{showPantry ? 'Hide' : 'Show'}</button>{/if}</div>
    {#if !app.pantry.length}
      <p class="small muted">Add what you already have and this ranks recipes by what they use up, so you only buy the gap. <button class="quiet" onclick={() => go('pantry')}>Fill your pantry →</button></p>
    {:else if !fromPantry.length}
      <p class="small muted">None of your recipes use what's in your pantry yet. Bring in a new week below, then check back. <button class="quiet" onclick={() => go('pantry')}>Pantry →</button></p>
    {:else if showPantry}
      {#if useSoon.length}<p class="small" style="margin:6px 0">⏳ Use soon: <b>{useSoon.map((p) => p.name).join(', ')}</b></p>{/if}
      {#each fromPantry as x}
        <div class="list-row">
          <div class="grow">
            <b>{x.r.title}</b> <span class="pill" class:live={x.share >= 0.5}>{Math.round(x.share * 100)}% on hand</span>
            {#each x.useUp as u}<span class="pill acc" style="margin-left:4px">uses up {u.toLowerCase()}</span>{/each}
            <div class="small muted">Have: {x.got.join(', ')}</div>
            {#if x.need.length}<div class="small muted">Buy: {x.need.slice(0, 5).join(', ')}{x.need.length > 5 ? ` +${x.need.length - 5} more` : ''}</div>{/if}
          </div>
          <button class={sel[x.r.id] ? 'ghost' : ''} onclick={() => { toggle(x.r.id); if (sel[x.r.id]) days = autoFill(picked, household); }}>{sel[x.r.id] ? '✓ Added' : 'Add'}</button>
        </div>
      {/each}
      <p class="small muted" style="margin-bottom:0">Ranked by how much of each recipe you already have (by cost), plus anything about to go bad.</p>
    {/if}
  </div>

  <div class="card">
    <h3>1 · New from <i>the bare minimum</i></h3>
    {#if !posts}
      <p class="small muted">Tim posts a full week of meals with a shopping list most Fridays.</p>
      <button onclick={loadPosts} disabled={loading}>{#if loading}<span class="spinner"></span> Checking…{:else}Check for new weeks{/if}</button>
    {:else}
      {#each posts.slice(0, 8) as p}
        <div class="list-row">
          <div class="grow"><b>{p.title.replace(/^A Full Week of Meals \+ A Shopping List:?\s*/i, 'Week of ')}</b> <span class="small muted">{p.date}</span>
            {#if !p.free}<span class="pill">subscribers</span>{/if}{#if p.recipeIds}<span class="pill live">in your recipes</span>{/if}
            <div class="small muted">{p.subtitle}</div></div>
          {#if p.free}
            <div class="row" style="flex:none">
              <button onclick={() => bring(p, true)} disabled={!!importing}>{#if importing === p.slug}<span class="spinner"></span>{:else}Use{/if}</button>
              {#if !p.recipeIds}<button class="ghost" onclick={() => bring(p, false)} disabled={!!importing}>+ Options</button>{/if}
            </div>
          {:else}<a class="small" href={p.url} target="_blank" rel="noopener">Read ↗</a>{/if}
        </div>
      {/each}
      <p class="small muted">"Use" brings in that week's 5 recipes and shopping list and picks them. "+ Options" just adds them to your library to mix and match.</p>
    {/if}
    <p style="margin:10px 0 0"><button class="ghost" onclick={() => (finding = !finding)}>🔎 Find recipes by cuisine, search, or link</button></p>
  </div>
  {#if finding}<FindRecipes onclose={() => (finding = false)} onadd={(r) => { if (!sel[r.id]) toggle(r.id); }} />{/if}

  <div class="card">
    <h3>2 · This week's recipes <span class="small muted" style="font-weight:400">({picked.length} picked — tap to remove)</span></h3>
    {#each picked as r}<button class="chip on" onclick={() => toggle(r.id)}>✓ <span><b>{short(r)}</b><br><span class="small muted">{r.when} · makes {r.servings || '?'} · {weekOf(r)}</span></span></button>{:else}<p class="small muted">Nothing picked yet.</p>{/each}
    {#if similar.length}
      <h3 style="margin-top:14px">Similar options <span class="small muted" style="font-weight:400">— share the most ingredients with what you picked</span></h3>
      {#each similar as x}
        <button class="chip" onclick={() => toggle(x.r.id)}>+ <span><b>{short(x.r)}</b><br><span class="small muted">{x.r.when} · {weekOf(x.r)} · shares {x.shared.length} of {x.total}{x.shared.length ? ': ' + x.shared.slice(0, 3).map((i) => itemById(i)?.name.toLowerCase()).join(', ') : ''}</span></span></button>
      {/each}
    {/if}
  </div>

  <div class="card">
    <h3 style="margin:0">3 · Who's eating, and when</h3>
    <p class="sentence">
      Prep
      <select class="inl" value={shape.meals.length} onchange={(e) => setMealCount(+e.currentTarget.value)}>{#each [1, 2, 3] as n}<option value={n}>{n}</option>{/each}</select>
      meal{shape.meals.length === 1 ? '' : 's'} a day for
      <input class="inl" type="number" min="1" max={app.settings.audience === 'group' ? 500 : 20} value={household} onchange={(e) => { setHousehold(e.currentTarget.value); days = autoFill(picked, household); }} style="width:3.4em" />
      {household === 1 ? 'person' : 'people'},
      <select class="inl" value={shape.from} onchange={(e) => reshape({ from: +e.currentTarget.value })}>{#each D3 as d, i}<option value={i}>{d}</option>{/each}</select>–<select class="inl" value={shape.to} onchange={(e) => reshape({ to: +e.currentTarget.value })}>{#each D3 as d, i}{#if i >= shape.from}<option value={i}>{d}</option>{/if}{/each}</select>.
    </p>
    <div class="row" style="gap:4px;margin:4px 0 6px">
      {#each ['breakfast', 'lunch', 'dinner'] as m}<button class="chip" class:on={shape.meals.includes(m)} onclick={() => toggleMeal(m)}>{m[0].toUpperCase() + m.slice(1)}</button>{/each}
      <button class="chip" class:on={shape.snack} onclick={() => reshape({ snack: !shape.snack })}>{shape.snack ? '✓ Snack' : '+ Add a snack'}</button>
    </div>
    {#if !app.settings.calorieAsked && !goalOn}
      <p class="small" style="margin:6px 0">Want a calorie goal for each meal? <button class="quiet" onclick={() => (goalOn = true)}>Yes</button> <button class="quiet" onclick={() => saveSettings({ calorieAsked: true })}>No thanks</button></p>
    {:else if goalOn}
      <p class="sentence small" style="margin:6px 0">Aim for about <input class="inl" type="number" min="100" step="50" bind:value={goal} style="width:4.5em" onchange={() => saveSettings({ calorieGoal: +goal || null, calorieAsked: true })} /> calories per meal.
        <button class="quiet" onclick={() => { goalOn = false; saveSettings({ calorieGoal: null, calorieAsked: true }); }}>Remove</button></p>
      {#if picked.length}<p class="small muted" style="margin:0 0 6px">{picked.filter(cal).length ? picked.filter(cal).map((r) => `${short(r)}: ${cal(r)} cal ${cal(r) <= goal * 1.1 ? '✓' : '↑'}`).join(' · ') : 'Recipes you save from a link show their calories here when the site lists them.'}</p>{/if}
    {/if}
    <details open={app.settings.audience === 'group'}><summary class="small">Adjust day by day</summary>
    <div class="tw"><table class="wk">
      <thead><tr><th>Day</th><th>People</th><th>Breakfast</th><th>Lunch</th><th>Dinner</th><th>Snack</th></tr></thead>
      <tbody>
        {#each days as d}
          <tr>
            <td><b>{d.day.slice(0, 3)}</b></td>
            <td><span class="ppl"><button onclick={() => (d.people = Math.max(0, d.people - 1))}>−</button><b style="min-width:18px;text-align:center" style:color={Number(d.people) !== Number(household) ? 'var(--accent)' : ''}>{d.people}</b><button onclick={() => (d.people = Math.min(app.settings.audience === 'group' ? 500 : 30, d.people + 1))}>+</button></span></td>
            {#each SLOTS as s}
              <td><select bind:value={d[s]}><option value="">—</option>{#each opts(s) as r}<option value={r.id}>{short(r)}</option>{/each}</select></td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table></div>
    <p class="small muted">Tap − / + for guests or a night out. Set a meal to — if you're eating out.</p>
    </details>
    {#if picked.length && app.settings.audience === 'group'}
      <h3 style="margin-top:12px">How much to make</h3>
      <table><thead><tr><th>Recipe</th><th class="num">Portions</th><th class="num">Makes</th><th class="num">Make</th></tr></thead><tbody>
        {#each picked as r}{@const p = por[r.id] || 0}
          <tr><td>{short(r)}</td><td class="num">{p}</td><td class="num">{r.servings || '?'}</td><td class="num"><b>{p ? (r.servings ? Math.round((p / r.servings) * 100) / 100 + '×' : '1×') : '1×'}</b></td></tr>
        {/each}
      </tbody></table>
      <p class="small muted">The shopping list scales the same way, rounded to whole packages.</p>
    {/if}
  </div>

  <div class="card">
    <h3>4 · Ready?</h3>
    <p class="small muted"><b>Start the week</b> saves this plan and clears last week's checkmarks (history is kept).</p>
    <div class="row"><button onclick={() => save(true)} disabled={saving}>{#if saving}<span class="spinner"></span>{/if} 🛒 Start the week</button><button class="ghost" onclick={() => save(false)} disabled={saving}>Save plan</button></div>
  </div>
  {/if}
</div>
