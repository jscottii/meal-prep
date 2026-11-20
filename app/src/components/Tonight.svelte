<script>
  import { app, portions } from '../lib/db.svelte.js';
  import { scaleLine } from '../lib/cookday.js';
  // Household mode: just tonight. What's for dinner, for how many, and how to get it on the table.
  let { onsteps } = $props();
  const DAYN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  let offset = $state(0);   // 0 = tonight, 1 = tomorrow…
  const dayName = $derived(DAYN[(new Date().getDay() + offset) % 7]);
  const day = $derived((app.plan.days || []).find((d) => d.day === dayName));
  const recipe = $derived(day?.dinner ? app.recipes.find((r) => r.id === day.dinner) : null);
  const lunch = $derived(day?.lunch && day.lunch !== day.dinner ? app.recipes.find((r) => r.id === day.lunch) : null);
  const por = $derived(portions());
  const k = $derived(recipe && recipe.servings && day?.people ? Math.max(0.5, Math.ceil((day.people / recipe.servings) * 2) / 2) : 1);
  // was it cooked earlier in the week (on a cook day or a night before)?
  const firstNight = $derived.by(() => { if (!recipe) return null; const order = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']; return (app.plan.days || []).filter((d) => d.dinner === recipe.id || d.lunch === recipe.id).sort((a, b) => order.indexOf(a.day) - order.indexOf(b.day))[0]?.day; });
  const leftovers = $derived(firstNight && firstNight !== dayName);
  let open = $state(false);
</script>

<div class="card tonight nocollapse">
  <div class="spread">
    <span class="small muted">{offset === 0 ? "Tonight's dinner" : offset === 1 ? "Tomorrow's dinner" : `${dayName}'s dinner`}</span>
    <span class="row" style="gap:2px"><button class="quiet" disabled={offset === 0} onclick={() => { offset--; open = false; }} aria-label="Previous day">‹</button><button class="quiet" disabled={offset >= 6} onclick={() => { offset++; open = false; }} aria-label="Next day">›</button></span>
  </div>
  {#if recipe}
    <h2 style="margin:2px 0 4px">{recipe.title}</h2>
    <p class="small muted" style="margin:0 0 10px">For {day.people} · {leftovers ? `leftovers from ${firstNight} — just reheat` : k === 1 ? 'one batch' : `${k}× the recipe`}{recipe.fridge ? ` · keeps ${recipe.fridge} in the fridge` : ''}</p>
    {#if leftovers}
      <p class="small" style="margin:0 0 8px">🔥 Reheat covered until hot all the way through (microwave 2–3 min per portion, or a 350°F oven for 15–20 min).</p>
    {/if}
    <div class="row" style="gap:6px">
      <button onclick={() => (open = !open)}>{open ? 'Hide recipe' : leftovers ? 'Show the recipe' : '👩‍🍳 Cook it'}</button>
      <button class="ghost" onclick={onsteps}>Batch-cook the week</button>
    </div>
    {#if open}
      <p class="small muted" style="margin:12px 0 2px">You'll need</p>
      <ul style="margin:0;padding-left:18px">{#each recipe.ing as x}{#if !/:$/.test(String(x).trim())}<li class="small">{scaleLine(x, k)}</li>{/if}{/each}</ul>
      <p class="small muted" style="margin:10px 0 2px">Steps</p>
      <ol style="margin:0;padding-left:20px">{#each recipe.steps as st}<li class="small" style="margin:4px 0">{st}</li>{/each}</ol>
      {#if recipe.tip}<p class="small muted">💡 {recipe.tip}</p>{/if}
    {/if}
    {#if lunch}<p class="small muted" style="margin:10px 0 0">Lunch: {lunch.title}</p>{/if}
  {:else}
    <h2 style="margin:2px 0 4px">Nothing planned</h2>
    <p class="small muted" style="margin:0">{day ? 'Eating out, or a free night.' : 'No plan for this week yet.'}</p>
  {/if}
</div>

<style>
  .tonight { border-color: var(--accent); }
  .tonight h2 { font: 700 24px/1.2 Georgia, serif; }
</style>
