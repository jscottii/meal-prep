<script module>
  function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
</script>

<script>
  import { app, portions, guideFor, loadGuide, setPrepDone, toast } from '../lib/db.svelte.js';
  import { scaleLine, scaleStepHtml, prepLists, cookMinutes, recipesInStep } from '../lib/cookday.js';
  let { go } = $props();

  const SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'];
  let por = $derived(portions());
  // this week's recipes: on the plan, or switched on
  let recipes = $derived.by(() => {
    const onPlan = new Set(); (app.plan.days || []).forEach((d) => SLOTS.forEach((s) => d[s] && onPlan.add(d[s])));
    return app.recipes.filter((r) => onPlan.has(r.id) || r.active);
  });
  const batches = (r) => { const p = por[r.id]; return p ? Math.max(0.5, Math.ceil(p.scale * 2) / 2) : 1; };
  const times = (k) => (k === 1 ? 'one batch' : k === 0.5 ? 'half a batch' : `${k}× the recipe`);
  let kOf = $derived(Object.fromEntries(recipes.map((r) => [r.id, batches(r)])));

  // cook-day guides for the posts these recipes came from
  let sources = $derived([...new Set(recipes.map((r) => r.source).filter(Boolean))]);
  let guides = $derived(sources.map((url) => ({ url, guide: guideFor(url), mine: recipes.filter((r) => r.source === url) })));
  const isPost = (url) => /substack\.com\/p\//.test(url);
  let missingGuides = $derived(guides.filter((g) => !g.guide && isPost(g.url)));

  let done = $derived(app.plan.prepDone || {});
  let lists = $derived(prepLists(recipes, kOf, app.items));
  const firstWords = (t) => { const w = String(t).split(/[.;:]/)[0]; return w.length > 60 ? w.slice(0, 57) + '…' : w; };

  /* ---------- the step-by-step plan ---------- */
  let steps = $derived.by(() => {
    const out = [], used = new Set(), before = [];
    guides.forEach((g) => g.guide?.sections.forEach((s) => { if (/before you start|bare minimum/i.test(s.title)) before.push(s); }));
    out.push({ kind: 'setup', title: 'Get set up', before });
    if (lists.knife.length) out.push({ kind: 'knife', title: 'Knife prep' });
    if (lists.spices.length) out.push({ kind: 'spices', title: 'Measure the seasonings' });
    guides.forEach((g) => g.guide?.sections.forEach((s, si) => {
      if (s.kind !== 'timeline') return;
      s.items.forEach((it, ii) => {
        const rs = recipesInStep(`${it.label} ${it.text}`, g.mine).filter((r) => !used.has(r.id));
        rs.forEach((r) => used.add(r.id));
        out.push({ kind: 'time', title: it.time ? `${it.time} · ${it.label || firstWords(it.text)}` : it.label || firstWords(it.text), text: it.text, key: `t|${g.url}|${si}|${ii}`, recipes: rs });
      });
    }));
    // recipes no game plan covers: longest cook first, so the oven works while you do the rest
    recipes.filter((r) => !used.has(r.id)).sort((a, b) => cookMinutes(b) - cookMinutes(a))
      .forEach((r) => out.push({ kind: 'recipe', title: r.title, recipes: [r] }));
    out.push({ kind: 'pack', title: 'Pack it up' });
    return out;
  });

  // the checkmarks that belong to a step, so it can show as done
  function stepKeys(st) {
    if (st.kind === 'setup') return lists.setup.flatMap((g, gi) => g.items.map((_, ii) => `u|${gi}|${ii}`));
    if (st.kind === 'knife') return lists.knife.flatMap((g) => g.items.map((_, ii) => `k|${g.key}|${ii}`));
    if (st.kind === 'spices') return lists.spices.map((s) => `sp|${s.id}`);
    if (st.kind === 'time') return [st.key, ...st.recipes.flatMap((r) => r.steps.map((_, j) => `s|${r.id}|${j}`))];
    if (st.kind === 'recipe') return st.recipes.flatMap((r) => r.steps.map((_, j) => `s|${r.id}|${j}`));
    return [];
  }
  const stepDone = (st) => { const k = stepKeys(st); return k.length > 0 && k.every((x) => done[x]); };
  let allKeys = $derived(steps.flatMap((st) => stepKeys(st)));
  let doneCount = $derived(allKeys.filter((k) => done[k]).length);

  let mode = $state(localStorage.getItem('mp-prep-mode') || 'steps');
  let at = $state(Number(localStorage.getItem('mp-prep-step')) || 0);
  $effect(() => { localStorage.setItem('mp-prep-mode', mode); localStorage.setItem('mp-prep-step', String(at)); });
  let idx = $derived(Math.min(at, steps.length - 1));
  let cur = $derived(steps[idx]);
  function move(d) { at = Math.max(0, Math.min(steps.length - 1, idx + d)); window.scrollTo(0, 0); }

  let loading = $state(''), err = $state('');
  async function fetchGuide(url) {
    loading = url; err = '';
    try { await loadGuide(url); toast('✓ Cook-day plan loaded'); } catch (e) { err = e.message; }
    loading = '';
  }
  async function tick(key, on) { try { await setPrepDone(key, on); } catch (e) { err = e.message; } }
</script>

{#snippet box(key, html, small = false)}
  <label class="check" style:opacity={done[key] ? 0.5 : 1}>
    <input type="checkbox" checked={!!done[key]} onchange={(e) => tick(key, e.currentTarget.checked)} />
    <span class:small style:text-decoration={done[key] ? 'line-through' : ''}>{@html html}</span>
  </label>
{/snippet}

{#snippet recipeBlock(r)}
  {@const k = kOf[r.id] || 1}
  <div class="card">
    <h3>{r.title} <span class="pill" class:acc={k !== 1}>{times(k)}</span></h3>
    {#if k !== 1}<p class="small muted" style="margin:0 0 6px">Amounts below are already {k === 0.5 ? 'halved' : `multiplied by ${k}`}.</p>{/if}
    {#if r.ing.length}
      <p class="small muted" style="margin:6px 0 2px">Ingredients</p>
      <ul style="margin:0;padding-left:18px">
        {#each r.ing as x}{#if /:$/.test(String(x).trim())}<li class="small" style="list-style:none;margin:6px 0 0 -18px"><b>{x}</b></li>{:else}<li class="small">{scaleLine(x, k)}</li>{/if}{/each}
      </ul>
    {/if}
    {#if r.steps.length}<p class="small muted" style="margin:10px 0 0">Steps</p>{/if}
    {#each r.steps as st, i}{@render box(`s|${r.id}|${i}`, scaleStepHtml(st, k), true)}{/each}
    {#if r.fridge || r.freeze}<p class="small muted">{r.fridge ? `🧊 Fridge: ${r.fridge}` : ''}{r.fridge && r.freeze ? ' · ' : ''}{r.freeze ? `❄️ Freezer: ${r.freeze}` : ''}</p>{/if}
    {#if r.tip}<p class="small muted">💡 {r.tip}</p>{/if}
  </div>
{/snippet}

<div class="page" style="padding-bottom:calc(var(--nav) + 90px)">
  <h1>Cook day</h1>
  {#if !recipes.length}
    <p class="muted">No recipes picked for this week yet.</p>
    <button onclick={() => go('plan')}>Plan the week</button>
  {:else}
    <div class="row" style="justify-content:space-between;margin-bottom:8px">
      <div class="seg">
        <button class:on={mode === 'steps'} onclick={() => (mode = 'steps')}>Step by step</button>
        <button class:on={mode === 'overview'} onclick={() => (mode = 'overview')}>Overview</button>
      </div>
      <span class="small muted">{doneCount} of {allKeys.length} done</span>
    </div>
    <div style="height:6px;background:#efe7dc;border-radius:99px;overflow:hidden;margin-bottom:10px"><div style="height:100%;background:var(--green);width:{allKeys.length ? (doneCount / allKeys.length) * 100 : 0}%"></div></div>
    {#if err}<div class="err">⚠️ {err}</div>{/if}
    {#each missingGuides as g}
      <div class="note small">The cook-day plan for <b>{g.mine.map((r) => r.title).join(', ')}</b> isn't saved yet, so those recipes are listed one at a time.
        <button class="quiet" onclick={() => fetchGuide(g.url)} disabled={loading === g.url}>{#if loading === g.url}<span class="spinner"></span>{/if} Load its plan</button></div>
    {/each}

    {#if mode === 'steps' && cur}
      <p class="small muted" style="margin:0">Step {idx + 1} of {steps.length}</p>
      <h2 style="margin:2px 0 10px">{stepDone(cur) ? '✓ ' : ''}{cur.title}</h2>

      {#if cur.kind === 'setup'}
        <div class="card">
          <p class="small" style="margin-top:0">Clear the counters, empty the dishwasher, and get out your sheet pans, pots, cutting board and storage containers.</p>
          {#each lists.setup as g, gi}
            <h3 style="margin-top:10px">{g.what}</h3>
            {#each g.items as it, ii}{@render box(`u|${gi}|${ii}`, `${esc(it.text)} <span class="muted">· ${esc(it.recipe)}</span>`, true)}{/each}
          {/each}
          {#each cur.before as s}
            <h3 style="margin-top:10px">{s.title}</h3>
            <ul style="margin:0;padding-left:18px">{#each s.items as it}<li class="small" style="margin:4px 0">{#if it.label}<b>{it.label}</b> — {/if}{it.text}</li>{/each}</ul>
          {/each}
        </div>
      {:else if cur.kind === 'knife'}
        <p class="small muted" style="margin-top:0">Do all the cutting now, before any heat goes on. Keep each recipe's pile in its own bowl.</p>
        {#each lists.knife as g}
          <div class="card">
            <h3>🔪 {g.name}</h3>
            <p class="small muted" style="margin:0 0 4px">{g.how}</p>
            {#each g.items as it, ii}{@render box(`k|${g.key}|${ii}`, `<b>${esc(it.text)}</b>${it.cut ? ` — ${esc(it.cut)}` : ''} <span class="muted">· ${esc(it.recipe)}</span>${it.note ? `<br><span class="small">${esc(it.note)}</span>` : ''}${it.from ? ` <span class="pill">${it.from === 'steps' ? 'from the recipe' : 'usual prep'}</span>` : ''}`)}{/each}
          </div>
        {/each}
      {:else if cur.kind === 'spices'}
        <p class="small muted" style="margin-top:0">Measure each recipe's seasonings into its own small bowl and label it, so you just tip it in when the recipe calls for it.</p>
        {#each lists.spices as s}
          <div class="card">
            {@render box(`sp|${s.id}`, `<b>${esc(s.recipe)}</b>`)}
            <ul style="margin:0 0 4px;padding-left:50px">{#each s.items as x}<li class="small">{x}</li>{/each}</ul>
          </div>
        {/each}
      {:else if cur.kind === 'time'}
        <div class="card">{@render box(cur.key, esc(cur.text))}</div>
        {#if /chop|cut|prep everything|knife/i.test(cur.text) && lists.knife.length}
          <p class="small muted">Your cutting list is in <a href="#prep" onclick={(e) => { e.preventDefault(); at = steps.findIndex((s) => s.kind === 'knife'); }}>Knife prep</a>.</p>
        {/if}
        {#each cur.recipes as r}{@render recipeBlock(r)}{/each}
      {:else if cur.kind === 'recipe'}
        {#each cur.recipes as r}{@render recipeBlock(r)}{/each}
      {:else if cur.kind === 'pack'}
        <div class="card">
          <p class="small" style="margin-top:0">Let hot food cool (no more than an hour on the counter) before lidding it, then fridge or freeze. Label freezer containers with the name and date.</p>
          {#each recipes as r}
            <div class="list-row"><div class="grow"><b class="small">{r.title}</b><div class="small muted">{r.fridge ? `🧊 Fridge: ${r.fridge}` : '🧊 Fridge'}{r.freeze ? ` · ❄️ Freezer: ${r.freeze}` : ''}</div></div></div>
          {/each}
          {#each guides as g}{#each g.guide?.sections || [] as s}{#if /where it all goes|freeze|storage/i.test(s.title)}
            <h3 style="margin-top:12px">{s.title}</h3>
            <ul style="margin:0;padding-left:18px">{#each s.items as it}<li class="small" style="margin:4px 0">{#if it.label}<b>{it.label}</b> — {/if}{it.text}</li>{/each}</ul>
          {/if}{/each}{/each}
        </div>
      {/if}

      <div class="stepnav">
        <button class="ghost" onclick={() => move(-1)} disabled={idx === 0}>← Back</button>
        <select value={idx} onchange={(e) => { at = Number(e.currentTarget.value); window.scrollTo(0, 0); }} aria-label="Jump to step">{#each steps as s, i}<option value={i}>{i + 1}. {stepDone(s) ? '✓ ' : ''}{s.title}</option>{/each}</select>
        <button onclick={() => move(1)} disabled={idx >= steps.length - 1}>Next →</button>
      </div>
    {:else}
      <div class="card">
        <h3>What to make</h3>
        {#each recipes as r}
          <div class="list-row">
            <div class="grow"><b>{r.title}</b>
              <div class="small muted">{r.when}{r.yield ? ` · recipe makes ${r.yield}` : ''}{por[r.id] ? ` · ${por[r.id].portions} portions planned` : ''}</div>
            </div>
            <span class="pill" class:acc={kOf[r.id] !== 1}>{times(kOf[r.id])}</span>
          </div>
        {/each}
      </div>
      {#each guides as g}
        {#if g.guide}
          {@const total = app.recipes.filter((r) => r.source === g.url).length}
          <div class="card">
            <h3>Game plan · <a href={g.url} target="_blank" rel="noopener">{g.guide.title}</a></h3>
            {#if g.mine.length < total}<p class="small muted">You're making {g.mine.length} of this post's {total} recipes, so skip the steps for the others.</p>{/if}
            {#each g.guide.sections as s, si}
              {#if s.kind === 'timeline'}
                <h3 style="margin-top:10px">{s.title}</h3>
                {#each s.items as it, ii}{@render box(`t|${g.url}|${si}|${ii}`, `${it.time ? `<b>${esc(it.time)}</b> · ` : ''}${it.label ? `<b>${esc(it.label)}</b> — ` : ''}${esc(it.text)}`)}{/each}
              {:else}
                <details style="margin-top:8px"><summary><b>{s.title}</b> <span class="small muted">({s.items.length})</span></summary>
                  <ul style="margin:6px 0 0;padding-left:18px">{#each s.items as it}<li class="small" style="margin:4px 0">{#if it.label}<b>{it.label}</b> — {/if}{it.text}</li>{/each}</ul>
                </details>
              {/if}
            {/each}
          </div>
        {/if}
      {/each}
      <div class="card">
        <h3>Recipe by recipe</h3>
        {#each recipes as r}
          <details style="border-top:1px solid var(--line);padding:8px 0"><summary><b>{r.title}</b></summary>{@render recipeBlock(r)}</details>
        {/each}
      </div>
    {/if}
  {/if}
</div>
