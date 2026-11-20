<script>
  import { untrack } from 'svelte';
  import { app, need, saveWeeks, startUpcoming, toast, owned } from '../lib/db.svelte.js';
  import { neededUnits, autoFillPlan } from '../lib/planner.js';
  import { covers } from '../lib/pantry.js';
  import { linesFor, orderInstacart, orderAmazon, copyAndOpen, shareList, STORES_LINKS } from '../lib/order.js';
  let { go, showThisWeek } = $props();

  const SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'];
  const DAYS5 = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const monday = (d = new Date()) => { const x = new Date(d); x.setHours(12, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
  const addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); const x = new Date(y, m - 1, d, 12); x.setDate(x.getDate() + n); return iso(x); };
  const nice = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); };
  const thisWeek = app.plan.weekOf || iso(monday());

  let weeks = $state(structuredClone($state.snapshot(app.plan.weeks || [])).sort((a, b) => a.start.localeCompare(b.start)));
  let open = $state({}), busy = $state(''), err = $state('');

  // save a moment after the last change
  let t = null;
  $effect(() => { const snap = $state.snapshot(weeks); untrack(() => { clearTimeout(t); t = setTimeout(() => saveWeeks(snap).catch((e) => (err = e.message)), 600); }); });

  const byId = (id) => app.recipes.find((r) => r.id === id);
  const kind = (r) => { const w = String(r?.when || '').toLowerCase(); return /breakfast/.test(w) ? 'breakfast' : /snack|dessert|treat/.test(w) ? 'snack' : 'main'; };
  const priceOf = (id) => { const v = Object.values(app.prices[id] || {}).map((e) => e?.price).filter((x) => x > 0); return v.length ? Math.min(...v) : 0; };

  function addWeek() {
    const last = weeks.at(-1)?.start || thisWeek;
    weeks.push({ start: addDays(last, 7), household: Number(app.plan.household) || 3, selected: [], days: autoFillPlan([], Number(app.plan.household) || 3, DAYS5).days });
    open[weeks.at(-1).start] = true;
  }
  function removeWeek(w) { weeks.splice(weeks.indexOf(w), 1); }
  function spread(w) { w.days = autoFillPlan(w.selected.map(byId).filter(Boolean), w.household, DAYS5).days; }
  function toggleRecipe(w, id) { const i = w.selected.indexOf(id); if (i >= 0) w.selected.splice(i, 1); else w.selected.push(id); spread(w); }
  function setPeople(w, v) { const nv = Math.max(1, Number(v) || 1); w.days.forEach((d) => { if (Number(d.people) === Number(w.household)) d.people = nv; }); w.household = nv; }
  // fill a week with recipes you haven't had lately: one breakfast, up to three mains
  function suggest(w) {
    const recent = new Set([...(app.plan.days || []).flatMap((d) => SLOTS.map((s) => d[s])), ...weeks.filter((x) => x !== w).flatMap((x) => x.selected)]);
    const fresh = app.recipes.filter((r) => !recent.has(r.id));
    const pool = fresh.length >= 3 ? fresh : app.recipes;
    const pick = [...pool.filter((r) => kind(r) === 'breakfast').slice(0, 1), ...pool.filter((r) => kind(r) === 'main').slice(0, 3)];
    w.selected = pick.map((r) => r.id); spread(w);
  }

  // each week's shopping list (only the recipes placed in that week)
  const offPlan = $derived(app.recipes.map((r) => ({ ...r, active: false })));
  function listFor(w) { return neededUnits(offPlan, { days: w.days }); }
  function summary(n, first) {
    const lines = linesFor(n);
    const have = first ? lines.filter((l) => covers(app.pantry, l.id)) : [];
    const buy = lines.filter((l) => !have.includes(l));
    const cost = buy.reduce((a, l) => a + priceOf(l.id) * l.count, 0);
    return { lines, buy, have, cost };
  }
  let current = $derived(summary(Object.fromEntries(Object.entries(need()).filter(([id]) => !owned(app.items.find((i) => i.id === id) || {}))), false));

  async function order(how, title, lines) {
    err = ''; busy = title + how;
    try {
      if (how === 'instacart') { const r = await orderInstacart(title, lines); if (r.test) toast('Opened Instacart’s test site — use a live key for real orders'); }
      else if (how === 'amazon') orderAmazon(lines);
      else if (how === 'walmart' || how === 'safeway') { await copyAndOpen(title, lines, STORES_LINKS[how]); toast('✓ List copied — paste it into the store’s search'); }
      else if ((await shareList(title, lines)) === 'copied') toast('✓ List copied');
    } catch (e) { err = e.message; }
    busy = '';
  }
  async function makeCurrent(w) {
    busy = 'start' + w.start;
    try { await startUpcoming(w.start); weeks = structuredClone($state.snapshot(app.plan.weeks || [])); toast(`✓ Week of ${nice(w.start)} is now this week`); go('trip'); } catch (e) { err = e.message; }
    busy = '';
  }
</script>

{#snippet orderBar(title, lines)}
  {#if lines.length}
    <div class="row" style="gap:6px;margin-top:8px">
      {#if app.hasInstacartKey}
        <button onclick={() => order('instacart', title, lines)} disabled={!!busy}>{#if busy === title + 'instacart'}<span class="spinner"></span>{/if} Instacart</button>
      {:else}
        <button class="ghost" onclick={() => go('more')} title="Costco same-day, Safeway, Sprouts and more">Instacart: set up</button>
      {/if}
      <button class="ghost" onclick={() => order('amazon', title, lines)}>Amazon Fresh / Whole Foods</button>
      <button class="ghost" onclick={() => order('walmart', title, lines)}>Walmart</button>
      <button class="ghost" onclick={() => order('safeway', title, lines)}>Safeway</button>
      <button class="quiet" onclick={() => order('share', title, lines)}>Share list</button>
    </div>
    <p class="small muted" style="margin:4px 0 0">Instacart lets you pick the store (Costco same-day, Safeway, Sprouts…) and check out there. Walmart and Safeway.com: the list is copied for you to paste.</p>
  {/if}
{/snippet}

{#snippet listView(sum)}
  <details>
    <summary class="small"><b>{sum.buy.length} items to buy</b>{sum.cost ? ` · about $${Math.round(sum.cost)}` : ''}{sum.have.length ? ` · ${sum.have.length} already in your pantry` : ''}</summary>
    {#each [...new Set(sum.lines.map((l) => l.cat))] as cat}
      <p class="small muted" style="margin:8px 0 2px">{cat}</p>
      {#each sum.lines.filter((l) => l.cat === cat) as l}
        <div class="small" style:opacity={sum.have.includes(l) ? 0.45 : 1} style:text-decoration={sum.have.includes(l) ? 'line-through' : ''}>☐ {l.name}{l.qty ? ` — ${l.qty}` : ''}{l.count > 1 ? ` · buy ${l.count}` : ''}</div>
      {/each}
    {/each}
  </details>
{/snippet}

<div>
  {#if err}<div class="err">⚠️ {err}</div>{/if}

  <div class="card">
    <div class="spread"><h3 style="margin:0">This week <span class="small muted" style="font-weight:400">· {nice(thisWeek)}</span></h3><button class="quiet" onclick={showThisWeek}>Edit →</button></div>
    <p class="small muted" style="margin:4px 0">{app.recipes.filter((r) => r.active).map((r) => r.title).join(' · ') || 'Nothing planned yet.'}</p>
    {#if current.lines.length}{@render listView(current)}{@render orderBar(`WFD · week of ${nice(thisWeek)}`, current.buy)}{:else}<p class="small muted">Everything for this week is bought.</p>{/if}
  </div>

  {#each weeks as w, wi (w.start)}
    {@const sum = summary(listFor(w), wi === 0)}
    <div class="card">
      <div class="spread">
        <h3 style="margin:0">Week of {nice(w.start)}</h3>
        <div class="row" style="gap:4px">
          {#if wi === 0}<button class="ghost" style="padding:7px 11px" onclick={() => makeCurrent(w)} disabled={!w.selected.length || !!busy}>{#if busy === 'start' + w.start}<span class="spinner"></span>{/if} Start this week</button>{/if}
          <button class="quiet" aria-label="Remove week" onclick={() => removeWeek(w)}>✕</button>
        </div>
      </div>

      <div class="row small" style="margin:8px 0;gap:8px">
        People <div class="ppl"><button class="ghost" style="padding:4px 10px" onclick={() => setPeople(w, w.household - 1)}>−</button> <b>{w.household}</b> <button class="ghost" style="padding:4px 10px" onclick={() => setPeople(w, w.household + 1)}>+</button></div>
        <button class="quiet" onclick={() => suggest(w)}>✨ Suggest recipes</button>
      </div>

      <div>
        {#each w.selected as id}{@const r = byId(id)}{#if r}<button class="chip on" onclick={() => toggleRecipe(w, id)}>✓ {r.title}</button>{/if}{/each}
        <select style="width:auto;margin-top:6px" value="" onchange={(e) => { if (e.currentTarget.value) toggleRecipe(w, e.currentTarget.value); e.currentTarget.value = ''; }}>
          <option value="">+ Add a recipe…</option>
          {#each app.recipes.filter((r) => !w.selected.includes(r.id)) as r}<option value={r.id}>{r.title}{r.when ? ` · ${r.when}` : ''}</option>{/each}
        </select>
      </div>

      {#if w.selected.length}
        <details style="margin-top:8px" bind:open={open[w.start]}>
          <summary class="small">Days: {w.days.filter((d) => d.dinner || d.lunch).length} lunches/dinners planned, {w.days.filter((d) => d.breakfast).length} breakfasts</summary>
          <div class="tw"><table class="small" style="margin-top:6px">
            <thead><tr><th>Day</th><th>People</th>{#each SLOTS as s}<th>{s}</th>{/each}</tr></thead>
            <tbody>
              {#each w.days as d}
                <tr>
                  <td>{d.day.slice(0, 3)}</td>
                  <td><input type="number" min="0" style="width:56px;padding:4px" bind:value={d.people} /></td>
                  {#each SLOTS as s}
                    <td><select style="padding:4px;min-width:110px" bind:value={d[s]}><option value="">—</option>{#each w.selected as id}{@const r = byId(id)}{#if r}<option value={id}>{r.title.slice(0, 28)}</option>{/if}{/each}</select></td>
                  {/each}
                </tr>
              {/each}
            </tbody>
          </table></div>
        </details>
        <div style="margin-top:8px">{@render listView(sum)}</div>
        {@render orderBar(`WFD · week of ${nice(w.start)}`, sum.buy)}
      {:else}
        <p class="small muted">Pick recipes or tap ✨ Suggest. The shopping list for this week appears here.</p>
      {/if}
    </div>
  {/each}

  <div class="row">
    <button onclick={addWeek} disabled={weeks.length >= 6}>+ Add week of {nice(addDays(weeks.at(-1)?.start || thisWeek, 7))}</button>
    {#if app.recipes.length < 8}<button class="quiet" onclick={showThisWeek}>Bring in more Bare Minimum weeks →</button>{/if}
  </div>
  <p class="small muted">Plan up to six weeks ahead. Each week keeps its own shopping list; when a week arrives, tap <b>Start this week</b> and it becomes your trip and cook day.</p>
</div>
