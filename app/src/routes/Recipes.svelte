<script>
  import { app, portions, itemById, setRecipeActive, saveRecipe, deleteRecipe, toast } from '../lib/db.svelte.js';
  let open = $state(null), editing = $state(null), busy = $state(false), q = $state('');
  let por = $derived(portions());
  let list = $derived(app.recipes.filter((r) => !q || r.title.toLowerCase().includes(q.toLowerCase())).slice().sort((a, b) => (b.active - a.active) || String(b.createdAt).localeCompare(String(a.createdAt))));
  const blank = () => ({ id: '', title: '', when: 'Lunch/Dinner', servings: 4, yield: '', fridge: '', freeze: '', ingText: '', stepsText: '', tip: '', items: [], newItems: [] });

  function edit(r) {
    editing = r ? { ...r, ingText: r.ing.join('\n'), stepsText: r.steps.join('\n'), items: Object.entries(r.items).map(([id, u]) => ({ id, units: u })), newItems: [] } : blank();
    open = null;
  }
  async function save() {
    const e = editing; if (!e.title.trim()) { toast('Give it a name'); return; }
    busy = true;
    try {
      const items = Object.fromEntries(e.items.filter((x) => x.id).map((x) => [x.id, Number(x.units) || 1]));
      const id = await saveRecipe({ id: e.id || '', title: e.title.trim(), when: e.when, servings: Number(e.servings) || null, yield: e.yield, fridge: e.fridge, freeze: e.freeze,
        ing: e.ingText.split('\n').map((s) => s.trim()).filter(Boolean), steps: e.stepsText.split('\n').map((s) => s.trim()).filter(Boolean), tip: e.tip,
        custom: e.custom ?? true, active: e.active ?? true, source: e.source || '', items }, e.newItems.filter((n) => n.name.trim()));
      editing = null; open = id; toast('✓ Saved');
    } catch (err) { toast(err.message); }
    busy = false;
  }
  async function remove(r) { if (!confirm(`Delete "${r.title}"?`)) return; try { await deleteRecipe(r.id); open = null; } catch (e) { toast(e.message); } }
</script>

<div class="page">
  {#if editing}
    <h1>{editing.id ? 'Edit recipe' : 'New recipe'}</h1>
    <div class="card">
      <label class="f">Name<input bind:value={editing.title} /></label>
      <div class="grid2">
        <label class="f">Meal<select bind:value={editing.when}><option>Breakfast</option><option>Lunch/Dinner</option><option>Snack/Dessert</option></select></label>
        <label class="f">Makes (servings)<input type="number" min="1" bind:value={editing.servings} /></label>
        <label class="f">Fridge<input bind:value={editing.fridge} placeholder="4 days" /></label>
        <label class="f">Freezer<input bind:value={editing.freeze} placeholder="Up to 2 months" /></label>
      </div>
      <label class="f">Ingredients (one per line)<textarea bind:value={editing.ingText}></textarea></label>
      <label class="f">Steps (one per line)<textarea bind:value={editing.stepsText}></textarea></label>
      <label class="f">Tip<input bind:value={editing.tip} /></label>
    </div>
    <div class="card">
      <h3>What to buy for it</h3>
      <p class="small muted">Pick items already on your list (units = store packages for one batch), or add new ones.</p>
      {#each editing.items as x, i}
        <div class="row" style="margin:6px 0"><select class="grow" bind:value={x.id}><option value="">Choose…</option>{#each app.items.slice().sort((a, b) => a.name.localeCompare(b.name)) as it}<option value={it.id}>{it.name}</option>{/each}</select>
          <input type="number" step="0.25" min="0" bind:value={x.units} style="width:80px" /><button class="quiet" onclick={() => editing.items.splice(i, 1)}>✕</button></div>
      {/each}
      {#each editing.newItems as n, i}
        <div class="row" style="margin:6px 0"><input class="grow" placeholder="New item, e.g. Ground turkey" bind:value={n.name} />
          <select bind:value={n.cat} style="width:120px"><option>Produce</option><option>Meat</option><option>Dairy & Eggs</option><option>Frozen</option><option>Bakery</option><option>Pantry</option></select>
          <input type="number" step="0.25" min="0" bind:value={n.units} style="width:70px" /><button class="quiet" onclick={() => editing.newItems.splice(i, 1)}>✕</button></div>
      {/each}
      <div class="row"><button class="ghost" onclick={() => editing.items.push({ id: '', units: 1 })}>+ Item from my list</button><button class="ghost" onclick={() => editing.newItems.push({ name: '', cat: 'Produce', units: 1 })}>+ New item</button></div>
    </div>
    <div class="row"><button onclick={save} disabled={busy}>{#if busy}<span class="spinner"></span>{/if} Save recipe</button><button class="ghost" onclick={() => (editing = null)}>Cancel</button></div>
  {:else}
    <div class="spread"><h1>Recipes</h1><button onclick={() => edit(null)}>+ New</button></div>
    <input placeholder="Search recipes" bind:value={q} style="margin:6px 0" />
    <div class="card">
      {#each list as r}
        <div class="list-row">
          <button class="quiet grow" style="text-align:left;justify-content:flex-start;color:var(--ink);padding:0" onclick={() => (open = open === r.id ? null : r.id)}>
            <span><b>{r.title}</b><br><span class="small muted">{r.when} · makes {r.servings || '?'}{por[r.id] ? ` · this week ${por[r.id].portions} portions (${por[r.id].scale}×)` : ''}</span></span>
          </button>
          <label class="switch" title="Shop for this recipe"><input type="checkbox" checked={r.active} onchange={(e) => setRecipeActive(r.id, e.currentTarget.checked).catch((er) => toast(er.message))} /><span></span></label>
        </div>
        {#if open === r.id}
          <div style="padding:4px 0 14px">
            {#if r.tip}<p class="small muted">{r.tip}</p>{/if}
            <h3>Ingredients</h3><ul class="small">{#each r.ing as x}<li>{x}</li>{/each}</ul>
            {#if r.steps.length}<h3>Steps</h3><ol class="small">{#each r.steps as x}<li>{x}</li>{/each}</ol>{/if}
            <p class="small muted">{#if r.fridge}Fridge: {r.fridge}. {/if}{#if r.freeze}Freezer: {r.freeze}.{/if}</p>
            <p class="small"><b>Shopping:</b> {Object.entries(r.items).map(([id, u]) => `${itemById(id)?.name || id}${u !== 1 ? ` ×${u}` : ''}`).join(', ') || 'none linked'}</p>
            <div class="row">{#if r.source}<a class="small" href={r.source} target="_blank" rel="noopener">Original post ↗</a>{/if}<button class="ghost" onclick={() => edit(r)}>Edit</button><button class="ghost" onclick={() => remove(r)}>Delete</button></div>
          </div>
        {/if}
      {/each}
    </div>
  {/if}
</div>
