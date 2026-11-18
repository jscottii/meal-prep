<script>
  import { app, portions, guideFor, loadGuide, setPrepDone, toast } from '../lib/db.svelte.js';
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

  // cook-day guides for the posts these recipes came from
  let sources = $derived([...new Set(recipes.map((r) => r.source).filter(Boolean))]);
  let guides = $derived(sources.map((url) => ({ url, guide: guideFor(url), mine: recipes.filter((r) => r.source === url) })));
  const isPost = (url) => /substack\.com\/p\//.test(url);

  let done = $derived(app.plan.prepDone || {});
  let keys = $derived.by(() => {
    const k = [];
    guides.forEach((g) => g.guide?.sections.forEach((s, si) => s.kind === 'timeline' && s.items.forEach((_, ii) => k.push(`t|${g.url}|${si}|${ii}`))));
    recipes.forEach((r) => r.steps.forEach((_, i) => k.push(`s|${r.id}|${i}`)));
    return k;
  });
  let doneCount = $derived(keys.filter((k) => done[k]).length);

  let loading = $state(''), err = $state('');
  async function fetchGuide(url) {
    loading = url; err = '';
    try { await loadGuide(url); toast('✓ Cook-day plan loaded'); } catch (e) { err = e.message; }
    loading = '';
  }
  async function tick(key, on) { try { await setPrepDone(key, on); } catch (e) { err = e.message; } }
</script>

<div class="page">
  <h1>Cook day</h1>
  {#if !recipes.length}
    <p class="muted">No recipes picked for this week yet.</p>
    <button onclick={() => go('plan')}>Plan the week</button>
  {:else}
    <p class="muted">Make everything in one session, then eat from the fridge and freezer all week. Checkmarks sync to the other phone and reset when you start a new week.</p>
    {#if err}<div class="err">⚠️ {err}</div>{/if}
    {#if keys.length}
      <div class="row small muted" style="margin:4px 0 10px">
        <div style="flex:1;height:8px;background:#efe7dc;border-radius:99px;overflow:hidden"><div style="height:100%;background:var(--green);width:{(doneCount / keys.length) * 100}%"></div></div>
        {doneCount} of {keys.length} steps
      </div>
    {/if}

    <div class="card">
      <h3>What to make</h3>
      {#each recipes as r}
        {@const k = batches(r)}
        <div class="list-row">
          <div class="grow"><b>{r.title}</b>
            <div class="small muted">{r.when}{r.yield ? ` · recipe makes ${r.yield}` : ''}{por[r.id] ? ` · ${por[r.id].portions} portions planned` : ''}</div>
            {#if r.fridge || r.freeze}<div class="small muted">{r.fridge ? `🧊 Fridge: ${r.fridge}` : ''}{r.fridge && r.freeze ? ' · ' : ''}{r.freeze ? `❄️ Freezer: ${r.freeze}` : ''}</div>{/if}
          </div>
          <span class="pill" class:acc={k !== 1}>{times(k)}</span>
        </div>
      {/each}
    </div>

    {#each guides as g}
      {#if g.guide}
        {@const total = app.recipes.filter((r) => r.source === g.url).length}
        <div class="card">
          <h3>Game plan · <a href={g.url} target="_blank" rel="noopener">{g.guide.title}</a></h3>
          {#if g.mine.length < total}
            <p class="small muted">You're making {g.mine.length} of this post's {total} recipes, so skip the steps for the others.</p>
          {/if}
          {#each g.guide.sections as s, si}
            {#if s.kind === 'timeline'}
              <h3 style="margin-top:10px">{s.title}</h3>
              {#each s.items as it, ii}
                {@const key = `t|${g.url}|${si}|${ii}`}
                <label class="check" style:opacity={done[key] ? 0.5 : 1}>
                  <input type="checkbox" checked={!!done[key]} onchange={(e) => tick(key, e.currentTarget.checked)} />
                  <span>{#if it.time}<b>{it.time}</b> · {/if}{#if it.label}<b>{it.label}</b> — {/if}<span style:text-decoration={done[key] ? 'line-through' : ''}>{it.text}</span></span>
                </label>
              {/each}
            {:else}
              <details style="margin-top:8px">
                <summary><b>{s.title}</b> <span class="small muted">({s.items.length})</span></summary>
                <ul style="margin:6px 0 0;padding-left:18px">
                  {#each s.items as it}<li class="small" style="margin:4px 0">{#if it.label}<b>{it.label}</b> — {/if}{it.text}</li>{/each}
                </ul>
              </details>
            {/if}
          {/each}
        </div>
      {:else if isPost(g.url)}
        <div class="card">
          <p class="small" style="margin-top:0">The cook-day plan for <b>{g.mine.map((r) => r.title).join(', ')}</b> isn't saved yet.</p>
          <button class="ghost" onclick={() => fetchGuide(g.url)} disabled={loading === g.url}>{#if loading === g.url}<span class="spinner"></span>{/if} Load its cook-day plan</button>
        </div>
      {/if}
    {/each}

    <div class="card">
      <h3>Recipe by recipe</h3>
      {#each recipes as r}
        {@const k = batches(r)}
        {@const left = r.steps.filter((_, i) => !done[`s|${r.id}|${i}`]).length}
        <details style="border-top:1px solid var(--line);padding:8px 0">
          <summary><b>{r.title}</b> <span class="small muted">{left ? `${left} steps left` : '✓ done'}</span></summary>
          {#if k !== 1}<div class="ok small" style="margin-top:6px">Make {times(k)}: multiply every amount by {k}.</div>{/if}
          {#if r.ing.length}
            <p class="small muted" style="margin:8px 0 2px">Ingredients</p>
            <ul style="margin:0;padding-left:18px">{#each r.ing as x}<li class="small">{x}</li>{/each}</ul>
          {/if}
          {#if r.steps.length}<p class="small muted" style="margin:10px 0 0">Steps</p>{/if}
          {#each r.steps as st, i}
            {@const key = `s|${r.id}|${i}`}
            <label class="check" style:opacity={done[key] ? 0.5 : 1}>
              <input type="checkbox" checked={!!done[key]} onchange={(e) => tick(key, e.currentTarget.checked)} />
              <span class="small" style:text-decoration={done[key] ? 'line-through' : ''}>{st}</span>
            </label>
          {/each}
          {#if r.tip}<p class="small muted">💡 {r.tip}</p>{/if}
        </details>
      {/each}
    </div>
  {/if}
</div>
