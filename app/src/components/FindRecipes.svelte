<script>
  import { untrack } from 'svelte';
  import { app, saveSettings, importRecipes, importRecipeUrl, callProxy, toast } from '../lib/db.svelte.js';
  import { CUISINES, MEAL_TYPES, findIdeas, mealDetail, fromMealDb } from '../lib/discover.js';
  // onadd(recipe) — called for each recipe added (e.g. to drop it into a week); onbm — open the Bare Minimum weeks
  let { onadd = null, onbm = null, onclose = null } = $props();

  let liked = $state([...(app.settings.cuisines || [])]);
  let cuisine = $state(liked[0] || ''), type = $state(''), q = $state(''), link = $state('');
  let ideas = $state([]), sites = $state([]), busy = $state(''), err = $state(''), added = $state({});

  const have = (title) => app.recipes.some((r) => r.title.toLowerCase() === String(title).toLowerCase());

  async function look() {
    err = ''; busy = 'look'; sites = [];
    try {
      ideas = await findIdeas({ cuisine: q ? '' : cuisine, type: q ? '' : MEAL_TYPES.find((t) => t[0] === type)?.[1] || '', search: q.trim() });
      if (q.trim()) callProxy({ action: 'recipe-search', q: q.trim() }).then((r) => (sites = r.results || [])).catch(() => {});
      if (!ideas.length && !q) err = 'No ideas for that mix — try another meal type.';
    } catch (e) { err = e.message; }
    busy = '';
  }
  $effect(() => { cuisine; type; if (!q) untrack(look); });

  function toggleLike(c) {
    liked = liked.includes(c) ? liked.filter((x) => x !== c) : [...liked, c];
    saveSettings({ cuisines: liked }).catch(() => {});
  }
  async function addIdea(i) {
    busy = i.id; err = '';
    try { const m = await mealDetail(i.id); const [r] = await importRecipes([fromMealDb(m)], 'mdb'); added[i.id] = true; toast(`✓ ${r.title} added`); onadd?.(r); }
    catch (e) { err = e.message; }
    busy = '';
  }
  async function addLink(url) {
    busy = url; err = '';
    try { const [r] = await importRecipeUrl(url); added[url] = true; link = ''; toast(`✓ ${r.title} added`); onadd?.(r); }
    catch (e) { err = e.message; }
    busy = '';
  }
</script>

<div class="card">
  <div class="spread"><h3 style="margin:0">Find recipes</h3>{#if onclose}<button class="quiet" onclick={onclose}>Done</button>{/if}</div>
  {#if err}<div class="err">⚠️ {err}</div>{/if}

  <p class="small muted" style="margin:8px 0 4px">Cuisines you like <span class="small">(tap ♥ to save; suggestions lean toward these)</span></p>
  <div class="chips">
    {#each CUISINES as [c]}
      <button class="chip" class:on={cuisine === c && !q} onclick={() => { q = ''; cuisine = cuisine === c ? '' : c; }}>{liked.includes(c) ? '♥ ' : ''}{c}</button>
    {/each}
  </div>
  {#if cuisine}<button class="quiet small" onclick={() => toggleLike(cuisine)}>{liked.includes(cuisine) ? '♥ Saved — tap to remove' : `♡ I like ${cuisine} food`}</button>{/if}

  <p class="small muted" style="margin:8px 0 4px">Meal type</p>
  <div class="chips">
    {#each MEAL_TYPES as [t]}<button class="chip" class:on={type === t && !q} onclick={() => { q = ''; type = type === t ? '' : t; }}>{t}</button>{/each}
  </div>

  <form class="row" style="margin-top:10px;gap:6px" onsubmit={(e) => { e.preventDefault(); look(); }}>
    <input placeholder="Search: tacos, curry, chili…" bind:value={q} style="flex:1;min-width:160px" />
    <button disabled={!q.trim() || busy === 'look'}>{#if busy === 'look'}<span class="spinner"></span>{/if} Search</button>
  </form>

  <form class="row" style="margin-top:6px;gap:6px" onsubmit={(e) => { e.preventDefault(); if (link.trim()) addLink(link.trim()); }}>
    <input type="url" placeholder="Or paste a recipe link (Allrecipes, Food Network, BBC Good Food…)" bind:value={link} style="flex:1;min-width:160px" />
    <button class="ghost" disabled={!link.trim() || !!busy}>{#if busy === link.trim()}<span class="spinner"></span>{/if} Add</button>
  </form>
  {#if onbm}<p class="small" style="margin:6px 0 0"><button class="quiet" onclick={onbm}>Bring in a full week from the Bare Minimum →</button></p>{/if}

  {#if busy === 'look' && !ideas.length}<p class="small muted"><span class="spinner"></span> Looking…</p>{/if}
  <div class="ideas">
    {#each ideas.slice(0, 24) as i (i.id)}
      <div class="idea">
        <img src={i.thumb + '/preview'} alt="" loading="lazy" />
        <div style="flex:1;min-width:0"><b class="small">{i.title}</b>{#if i.area}<div class="small muted">{i.area}</div>{/if}</div>
        {#if added[i.id] || have(i.title)}<span class="small muted">✓ Added</span>
        {:else}<button class="ghost" style="padding:6px 10px" onclick={() => addIdea(i)} disabled={!!busy}>{#if busy === i.id}<span class="spinner"></span>{:else}+{/if}</button>{/if}
      </div>
    {/each}
  </div>
  {#if sites.length}
    <p class="small muted" style="margin:10px 0 4px">From recipe sites</p>
    {#each sites as s (s.url)}
      <div class="idea">
        <div style="flex:1;min-width:0"><b class="small">{s.title}</b><div class="small muted">{s.site} · <a href={s.url} target="_blank" rel="noopener">view</a></div></div>
        {#if added[s.url] || have(s.title)}<span class="small muted">✓ Added</span>
        {:else}<button class="ghost" style="padding:6px 10px" onclick={() => addLink(s.url)} disabled={!!busy}>{#if busy === s.url}<span class="spinner"></span>{:else}+{/if}</button>{/if}
      </div>
    {/each}
  {/if}
  <p class="small muted" style="margin-top:8px">Added recipes go into your library switched off, with their shopping items. Recipe ideas from TheMealDB.</p>
</div>

<style>
  .chips { display: flex; flex-wrap: wrap; gap: 4px; }
  .ideas { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 6px; margin-top: 10px; }
  .idea { display: flex; align-items: center; gap: 8px; padding: 6px; border: 1px solid var(--line, #e5e7eb); border-radius: 10px; margin-bottom: 4px; }
  .idea img { width: 48px; height: 48px; border-radius: 8px; object-fit: cover; flex: none; }
</style>
