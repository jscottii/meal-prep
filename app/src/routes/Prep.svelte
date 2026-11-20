<script module>
  function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
</script>

<script>
  import { untrack } from 'svelte';
  import { app, portions, guideFor, loadGuide, updatePrep, toast, removePantry, addPantry } from '../lib/db.svelte.js';
  import { usedByRecipes } from '../lib/pantry.js';
  import { scaleLine, scaleStepHtml, prepLists, cookMinutes, alignSteps, isPrepStep, durationOf, equipmentFor, stepMinutes, fmtMins } from '../lib/cookday.js';
  import { unlockAudio, holdAwake } from '../lib/timers.js';
  import { tap } from '../lib/native.js';
  import Tonight from '../components/Tonight.svelte';
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
  let gear = $derived(equipmentFor(recipes));
  // after cooking: what came out of the pantry
  let used = $derived(usedByRecipes(recipes, app.pantry, app.items));
  let usedSel = $state({});
  let pantryDone = $state(false);
  $effect(() => { const prev = untrack(() => usedSel), m = {}; used.forEach((u) => (m[u.p.id] = prev[u.p.id] ?? u.usedUp)); usedSel = m; });
  async function updatePantryAfterCooking() {
    const ids = used.filter((u) => usedSel[u.p.id]).map((u) => u.p.id);
    try {
      if (ids.length) await removePantry(ids);
      // the cooked meals themselves go in, so the Pantry shows what's ready to eat
      await addPantry(recipes.map((r) => ({ name: `${shortTitle(r.title)} (cooked)`, amount: '', place: /yes/i.test(r.freeze || '') && /freez/i.test(r.title + r.ing.join(' ')) ? 'freezer' : 'fridge', use_by: fridgeDays(r) })));
      pantryDone = true; toast(`✓ Pantry updated: ${ids.length} used up, ${recipes.length} meals added`);
    } catch (e) { err = e.message; }
  }
  const fridgeDays = (r) => { const m = String(r.fridge || '').match(/(\d+)(?:\s*[–-]\s*(\d+))?\s*day/i); if (!m) return null; const d = new Date(); d.setDate(d.getDate() + Number(m[1])); return d.toISOString().slice(0, 10); };

  // keep the screen on while this tab is open (your choice, remembered on this device)
  let awake = $state(localStorage.getItem('mp-awake') !== '0');
  $effect(() => {
    localStorage.setItem('mp-awake', awake ? '1' : '0');
    if (!awake) return;
    const stop = holdAwake();
    return stop;
  });
  const firstWords = (t) => { const w = String(t).split(/[.;:]/)[0]; return w.length > 60 ? w.slice(0, 57) + '…' : w; };

  /* ---------- the step-by-step plan: the game plan's own steps, with each recipe's matching steps inside ---------- */
  let steps = $derived.by(() => {
    const out = [], covered = new Set(), before = [];
    guides.forEach((g) => g.guide?.sections.forEach((s) => { if (/before you start|bare minimum/i.test(s.title)) before.push(s); }));
    out.push({ kind: 'setup', title: 'Get set up', before, mins: 10, approx: true });
    const timeSteps = [];
    guides.forEach((g) => {
      if (!g.guide) return;
      const items = [];
      g.guide.sections.forEach((s, si) => s.kind === 'timeline' && s.items.forEach((it, ii) => items.push({ ...it, key: `t|${g.url}|${si}|${ii}`, text: `${it.label ? it.label + ' — ' : ''}${it.text}` })));
      if (!items.length) return;
      const cooking = items.map((it, idx) => ({ text: it.text, idx })).filter((x) => !isPrepStep(x.text));
      const subs = items.map(() => []);
      g.mine.forEach((r) => {
        const a = alignSteps(r, cooking, recipes);
        if (!a) return;
        covered.add(r.id);
        a.forEach((idx, j) => { let e = subs[idx].find((x) => x.r.id === r.id); if (!e) subs[idx].push((e = { r, js: [] })); e.js.push(j); });
      });
      const mins = stepMinutes(items);
      items.forEach((it, idx) => {
        // no next step to measure against (usually dinner): estimate from its recipe steps, else 15 min
        let m = mins[idx], approx = false;
        if (m == null) { const d = subs[idx].flatMap((e) => e.js.map((j) => durationOf(e.r.steps[j])?.maxMins || 0)); m = Math.max(15, ...d); approx = true; }
        timeSteps.push({ kind: 'time', key: it.key, mins: m, approx, title: firstWords(it.text), text: it.text, subs: subs[idx], prep: isPrepStep(it.text) });
      });
    });
    // knife prep + seasonings go on the plan's "chop everything" step, or get their own steps before it
    const chop = timeSteps.find((t) => t.prep);
    if (chop) { chop.knife = lists.knife.length > 0; chop.spices = lists.spices.length > 0; }
    else {
      const cuts = lists.knife.reduce((a, g) => a + g.items.length, 0);
      if (lists.knife.length) out.push({ kind: 'knife', title: 'Knife prep', mins: Math.max(10, Math.round(cuts * 3 / 5) * 5), approx: true });
      if (lists.spices.length) out.push({ kind: 'spices', title: 'Measure the seasonings', mins: Math.max(5, lists.spices.length * 2), approx: true });
    }
    out.push(...timeSteps);
    // recipes the game plan doesn't cover: longest cook first, so the oven works while you do the rest
    recipes.filter((r) => !covered.has(r.id)).sort((a, b) => cookMinutes(b) - cookMinutes(a))
      .forEach((r) => out.push({ kind: 'recipe', title: r.title, mins: cookMinutes(r) + 5 * r.steps.length, approx: true, subs: [{ r, js: r.steps.map((_, j) => j) }] }));
    out.push({ kind: 'pack', title: 'Pack it up', mins: 15, approx: true });
    out.forEach((st) => (st.label = `${fmtMins(st.mins, st.approx)}${st.mins ? ' · ' : ''}${st.title}`));
    return out;
  });

  const subKeys = (st) => (st.subs || []).flatMap((e) => e.js.map((j) => `s|${e.r.id}|${j}`));
  const knifeKeys = () => lists.knife.flatMap((g) => g.items.map((_, ii) => `k|${g.key}|${ii}`));
  const spiceKeys = () => lists.spices.map((x) => `sp|${x.id}`);
  // the checkmarks that belong to a step, so it can show as done
  function stepKeys(st) {
    if (st.kind === 'setup') return [...gear.items.map((e) => `e|${e.name}`), 'e|basics', ...lists.setup.flatMap((g, gi) => g.items.map((_, ii) => `u|${gi}|${ii}`))];
    if (st.kind === 'knife') return knifeKeys();
    if (st.kind === 'spices') return spiceKeys();
    if (st.kind === 'time') return [st.key, ...(st.knife ? knifeKeys() : []), ...(st.spices ? spiceKeys() : []), ...subKeys(st)];
    if (st.kind === 'recipe') return subKeys(st);
    return [];
  }
  const stepDone = (st) => { const k = stepKeys(st); return k.length > 0 && k.every((x) => done[x]); };
  let allKeys = $derived(steps.flatMap((st) => stepKeys(st)));
  let doneCount = $derived(allKeys.filter((k) => done[k]).length);
  let totalMins = $derived(steps.reduce((a, st) => a + (st.mins || 0), 0));
  let leftMins = $derived(steps.filter((st) => !stepDone(st)).reduce((a, st) => a + (st.mins || 0), 0));
  let firstUndone = $derived.by(() => { const i = steps.findIndex((st) => stepKeys(st).some((k) => !done[k])); return i < 0 ? steps.length - 1 : i; });
  // which step a checkmark lives on (so ticking the last item on a step ticks the step in the overview)
  let owner = $derived.by(() => { const m = {}; steps.forEach((st) => stepKeys(st).forEach((k) => { if (!m[k]) m[k] = st; })); return m; });

  // a timer for steps that cook for a set time
  function timerFor(key) {
    const [kind, id, j] = key.split('|');
    if (kind !== 's') return null;
    const r = recipes.find((x) => x.id === id), text = r?.steps[Number(j)];
    const d = text && durationOf(text);
    return d ? { label: `${shortTitle(r.title)}: ${firstWords(text)}`, ...d } : null;
  }
  const shortTitle = (t) => String(t).split(/,|\s[–—-]\s/)[0];

  const big = $derived(app.settings.audience === 'group');
  let mode = $state(localStorage.getItem('mp-prep-mode') || (untrack(() => app.settings.audience) === 'group' ? 'steps' : 'simple'));
  $effect(() => { if (big && mode === 'simple') mode = 'steps'; if (!big && mode === 'overview') mode = 'simple'; });
  let totalPortions = $derived(Object.values(por).reduce((a, x) => a + (x.portions || 0), 0));
  let at = $state(Number(localStorage.getItem('mp-prep-step')) || 0);
  function resume() { mode = 'steps'; at = firstUndone; window.scrollTo(0, 0); }
  $effect(() => { localStorage.setItem('mp-prep-mode', mode); localStorage.setItem('mp-prep-step', String(at)); });
  let idx = $derived(Math.min(at, steps.length - 1));
  let cur = $derived(steps[idx]);
  function move(d) { at = Math.max(0, Math.min(steps.length - 1, idx + d)); window.scrollTo(0, 0); }
  // "Done → Next": tick everything on this step (and start timers for anything cooking), then move on
  async function doneNext() {
    unlockAudio();
    const keys = stepKeys(cur).filter((k) => !done[k]), timers = {};
    keys.forEach((k) => { const t = timerFor(k); if (t) timers[k] = t; });
    if (keys.length) try { await updatePrep(keys, [], timers); } catch (e) { err = e.message; }
    move(1);
  }

  let loading = $state(''), err = $state('');
  async function fetchGuide(url) {
    loading = url; err = '';
    try { await loadGuide(url); toast('✓ Cook-day plan loaded'); } catch (e) { err = e.message; }
    loading = '';
  }
  async function tick(key, on) {
    unlockAudio(); if (on) tap();
    const t = on ? timerFor(key) : null, onKeys = on ? [key] : [], offKeys = on ? [] : [key];
    // finishing the last item on a step ticks that step in the overview (and unticking one unticks it)
    const st = owner[key];
    if (st?.kind === 'time' && key !== st.key) {
      if (on && stepKeys(st).every((k) => k === key || k === st.key || done[k])) onKeys.push(st.key);
      if (!on && done[st.key]) offKeys.push(st.key);
    }
    try { await updatePrep(onKeys, offKeys, t ? { [key]: t } : {}); } catch (e) { err = e.message; }
  }
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

{#snippet knifeList()}
  {#each lists.knife as g}
    <div class="card">
      <h3>🔪 {g.name}</h3>
      <p class="small muted" style="margin:0 0 4px">{g.how}</p>
      {#each g.items as it, ii}{@render box(`k|${g.key}|${ii}`, `<b>${esc(it.text)}</b>${it.cut ? ` — ${esc(it.cut)}` : ''} <span class="muted">· ${esc(it.recipe)}</span>${it.note ? `<br><span class="small">${esc(it.note)}</span>` : ''}${it.from ? ` <span class="pill">${it.from === 'steps' ? 'from the recipe' : 'usual prep'}</span>` : ''}`)}{/each}
    </div>
  {/each}
{/snippet}

{#snippet spiceList()}
  <p class="small muted" style="margin-top:0">Measure each recipe's seasonings into its own small bowl and label it, so you just tip it in when the recipe calls for it.</p>
  {#each lists.spices as x}
    <div class="card">
      {@render box(`sp|${x.id}`, `<b>${esc(x.recipe)}</b>`)}
      <ul style="margin:0 0 4px;padding-left:50px">{#each x.items as y}<li class="small">{y}</li>{/each}</ul>
    </div>
  {/each}
{/snippet}

{#snippet subBlock(e)}
  {@const r = e.r}
  {@const k = kOf[r.id] || 1}
  <div class="card">
    <h3 style="margin-bottom:4px">{r.title} <span class="pill" class:acc={k !== 1}>{times(k)}</span></h3>
    {#if r.ing.length}
      <details open={e.js[0] === 0}>
        <summary class="small muted">Ingredients{k !== 1 ? (k === 0.5 ? ' (already halved)' : ` (already ×${k})`) : ''}</summary>
        <ul style="margin:4px 0 0;padding-left:18px">
          {#each r.ing as x}{#if /:$/.test(String(x).trim())}<li class="small" style="list-style:none;margin:6px 0 0 -18px"><b>{x}</b></li>{:else}<li class="small">{scaleLine(x, k)}</li>{/if}{/each}
        </ul>
      </details>
    {/if}
    {#each e.js as j}
      {@const d = durationOf(r.steps[j])}
      {@render box(`s|${r.id}|${j}`, `${scaleStepHtml(r.steps[j], k)}${d ? ` <span class="pill acc">⏱ ${d.mins === d.maxMins ? d.mins : `${d.mins}–${d.maxMins}`} min timer</span>` : ''}`)}
    {/each}
    {#if e.js.includes(r.steps.length - 1)}
      {#if r.fridge || r.freeze}<p class="small muted">{r.fridge ? `🧊 Fridge: ${r.fridge}` : ''}{r.fridge && r.freeze ? ' · ' : ''}{r.freeze ? `❄️ Freezer: ${r.freeze}` : ''}</p>{/if}
      {#if r.tip}<p class="small muted">💡 {r.tip}</p>{/if}
    {/if}
  </div>
{/snippet}

<div class="page wide" style="padding-bottom:calc(var(--nav) + 90px)">
  <h1>{!big && mode === 'simple' ? "What's for dinner" : 'Cook day'}</h1>
  {#if !recipes.length}
    <p class="muted">No recipes picked for this week yet.</p>
    <button onclick={() => go('plan')}>Plan the week</button>
  {:else}
    <div class="row" style="justify-content:space-between;margin-bottom:8px">
      <div class="seg">
        {#if !big}<button class:on={mode === 'simple'} onclick={() => (mode = 'simple')}>Tonight</button>{/if}
        <button class:on={mode === 'steps'} onclick={resume}>Step by step</button>
        {#if big}<button class:on={mode === 'overview'} onclick={() => (mode = 'overview')}>Overview</button>{/if}
      </div>
      <label class="row small" style="gap:6px;cursor:pointer" title="Stops the screen from dimming while you cook">
        <span class="switch"><input type="checkbox" bind:checked={awake} /><span></span></span> Keep screen on
      </label>
    </div>
    {#if big}
      <div class="card crowd nocollapse">
        <div class="row" style="gap:16px">
          <div class="stat"><b>{totalPortions || '—'}</b><span>portions</span></div>
          <div class="stat"><b>{recipes.length}</b><span>recipes</span></div>
          <div class="stat"><b>{fmtMins(totalMins)}</b><span>hands-on + cooking</span></div>
          <div class="stat"><b>{gear.items.reduce((a, e) => a + (e.count || 1), 0)}</b><span>pans & tools</span></div>
        </div>
        <div class="small" style="margin-top:8px">{#each recipes as r}<div>• <b>{shortTitle(r.title)}</b> — {por[r.id]?.portions || r.servings || '?'} portions = {times(kOf[r.id])}{r.servings ? ` (recipe serves ${r.servings})` : ''}</div>{/each}</div>
        <p class="small muted" style="margin:6px 0 0">Every amount in the steps below is already scaled for your group.</p>
      </div>
    {/if}
    {#if mode !== 'simple'}
    <p class="small muted" style="margin:-2px 0 6px">{doneCount} of {allKeys.length} done · about {fmtMins(totalMins)} total{leftMins && leftMins < totalMins ? `, ${fmtMins(leftMins)} to go` : ''}</p>
    <div style="height:6px;background:#efe7dc;border-radius:99px;overflow:hidden;margin-bottom:10px"><div style="height:100%;background:var(--green);width:{allKeys.length ? (doneCount / allKeys.length) * 100 : 0}%"></div></div>
    {/if}
    {#if err}<div class="err">⚠️ {err}</div>{/if}
    {#if mode === 'simple'}
      <Tonight onsteps={resume} />
      <details><summary class="small" style="margin:8px 0">All of this week's recipes ({recipes.length})</summary>
        {#each recipes as r}{@render recipeBlock(r)}{/each}
      </details>
    {:else}
    {#each missingGuides as g}
      <div class="note small">The cook-day plan for <b>{g.mine.map((r) => r.title).join(', ')}</b> isn't saved yet, so those recipes are listed one at a time.
        <button class="quiet" onclick={() => fetchGuide(g.url)} disabled={loading === g.url}>{#if loading === g.url}<span class="spinner"></span>{/if} Load its plan</button></div>
    {/each}

    {#if mode === 'steps' && cur}
     <div class="prep-grid"><div>
      <p class="small muted" style="margin:0">Step {idx + 1} of {steps.length}</p>
      <p class="small" style="margin:6px 0 0;color:var(--accent);font-weight:650">⏱ {fmtMins(cur.mins, cur.approx) || '—'}</p>
      <h2 style="margin:2px 0 10px">{stepDone(cur) ? '✓ ' : ''}{cur.title}</h2>

      {#if cur.kind === 'setup'}
        <div class="card">
          <p class="small" style="margin-top:0">Clear the counters and empty the dishwasher so you have somewhere to put dirty pans.</p>
          {#if gear.temps.length}<p class="small"><b>🔥 Oven today:</b> {gear.temps.join(', ')} — preheat to the first one in your plan.</p>{/if}
          <h3 style="margin-top:10px">🍳 Pans and appliances</h3>
          {#each gear.items as e}{@render box(`e|${e.name}`, `<b>${esc(e.name)}</b>${e.count > 1 ? ` ×${e.count}` : ''}${e.optional ? ' <span class="pill">optional</span>' : ''} <span class="muted">· ${esc(e.recipes.map(shortTitle).join(', '))}</span>`, true)}{/each}
          {@render box('e|basics', '<b>Cutting board, chef’s knife, measuring cups and spoons</b>', true)}
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
        {@render knifeList()}
      {:else if cur.kind === 'spices'}
        {@render spiceList()}
      {:else if cur.kind === 'time'}
        <div class="card plan-step">{@render box(cur.key, esc(cur.text))}</div>
        {#if cur.knife}<h3 style="margin:14px 0 6px">🔪 What to cut</h3>{@render knifeList()}{/if}
        {#if cur.spices}<h3 style="margin:14px 0 6px">🥄 Measure the seasonings</h3>{@render spiceList()}{/if}
        {#if cur.subs.length > 1}<p class="small muted">Working on {cur.subs.length} recipes at once — do these together.</p>{/if}
        {#each cur.subs as e}{@render subBlock(e)}{/each}
      {:else if cur.kind === 'recipe'}
        {#each cur.subs as e}{@render subBlock(e)}{/each}
      {:else if cur.kind === 'pack'}
        <div class="card">
          <p class="small" style="margin-top:0">Let hot food cool (no more than an hour on the counter) before lidding it, then fridge or freeze. Label freezer containers with the name and date.</p>
          {#each recipes as r}
            <div class="list-row"><div class="grow"><b class="small">{r.title}</b><div class="small muted">{r.fridge ? `🧊 Fridge: ${r.fridge}` : '🧊 Fridge'}{r.freeze ? ` · ❄️ Freezer: ${r.freeze}` : ''}</div></div></div>
          {/each}
          <h3 style="margin-top:14px">🥫 Update your pantry</h3>
          {#if pantryDone}
            <p class="ok small">✓ Done. The cooked meals are in your Pantry with their fridge dates.</p>
          {:else}
            <p class="small muted" style="margin:0 0 4px">Checked = used up today. Staples (spices, oil, freezer items) stay unless you check them.</p>
            {#each used as u}
              <label class="check"><input type="checkbox" bind:checked={usedSel[u.p.id]} /><span class="small">{u.p.name}</span></label>
            {/each}
            <button style="margin-top:8px" onclick={updatePantryAfterCooking}>Update pantry{used.length ? ` (${used.filter((u) => usedSel[u.p.id]).length} used up)` : ''}</button>
          {/if}
          {#each guides as g}{#each g.guide?.sections || [] as s}{#if /where it all goes|freeze|storage/i.test(s.title)}
            <h3 style="margin-top:12px">{s.title}</h3>
            <ul style="margin:0;padding-left:18px">{#each s.items as it}<li class="small" style="margin:4px 0">{#if it.label}<b>{it.label}</b> — {/if}{it.text}</li>{/each}</ul>
          {/if}{/each}{/each}
        </div>
      {/if}

      <div class="stepnav">
        <button class="ghost" onclick={() => move(-1)} disabled={idx === 0}>← Back</button>
        <select value={idx} onchange={(e) => { at = Number(e.currentTarget.value); window.scrollTo(0, 0); }} aria-label="Jump to step">{#each steps as s, i}<option value={i}>{i + 1}. {stepDone(s) ? '✓ ' : ''}{s.label}</option>{/each}</select>
        <button onclick={doneNext}>{idx >= steps.length - 1 ? 'Done ✓' : 'Done → Next'}</button>
      </div>
     </div>
     <aside class="prep-aside card">
       <h3>All steps</h3>
       {#each steps as s, i}<button class:on={i === idx} class:done={stepDone(s)} onclick={() => { at = i; window.scrollTo(0, 0); }}>{stepDone(s) ? '✓' : i + 1}. {s.label}</button>{/each}
     </aside></div>
    {:else}
      <button style="width:100%;margin-bottom:10px" onclick={resume}>▶ {doneCount ? 'Pick up where you left off' : 'Start cooking'}: step {firstUndone + 1} · {steps[firstUndone]?.label}</button>
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
                {@const mins = stepMinutes(s.items)}
                {#each s.items as it, ii}{@render box(`t|${g.url}|${si}|${ii}`, `${mins[ii] ? `<b>${fmtMins(mins[ii])}</b> · ` : ''}${it.label ? `<b>${esc(it.label)}</b> — ` : ''}${esc(it.text)}`)}{/each}
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
  {/if}
</div>
