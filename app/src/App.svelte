<script>
  import { app, start } from './lib/db.svelte.js';
  import Login from './routes/Login.svelte';
  import Trip from './routes/Trip.svelte';
  import Plan from './routes/Plan.svelte';
  import Prep from './routes/Prep.svelte';
  import Recipes from './routes/Recipes.svelte';
  import Receipt from './routes/Receipt.svelte';
  import Prices from './routes/Prices.svelte';
  import More from './routes/More.svelte';
  import TimerDock from './components/TimerDock.svelte';

  const TABS = [['trip', '🛒', 'Trip'], ['plan', '📅', 'Week'], ['prep', '🔪', 'Prep'], ['recipes', '🍲', 'Recipes'], ['receipt', '🧾', 'Receipt'], ['prices', '🏷️', 'Prices'], ['more', '☰', 'More']];
  let page = $state((location.hash || '').slice(1) || 'trip');
  function go(p) { page = p; history.replaceState(null, '', '#' + p); window.scrollTo(0, 0); }
  $effect(() => { const f = () => { const h = location.hash.slice(1); if (h && TABS.some((t) => t[0] === h)) page = h; }; addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); });
  start();
</script>

{#if !app.ready}
  <div class="page row" style="padding-top:30vh;justify-content:center"><span class="spinner"></span> Loading…</div>
{:else if !app.session}
  <Login />
{:else if app.error && !app.household}
  <div class="page"><div class="err">⚠️ {app.error}</div><button onclick={() => location.reload()}>Try again</button></div>
{:else}
  <TimerDock />
  {#key page}
    {#if page === 'plan'}<Plan {go} />
    {:else if page === 'prep'}<Prep {go} />
    {:else if page === 'recipes'}<Recipes />
    {:else if page === 'receipt'}<Receipt {go} />
    {:else if page === 'prices'}<Prices {go} />
    {:else if page === 'more'}<More {go} />
    {:else}<Trip {go} />{/if}
  {/key}
  <nav class="tabs">
    <div class="brand">🛒 Meal Prep Shopper</div>
    {#each TABS as [k, ic, label]}<button class:on={page === k} onclick={() => go(k)}><span class="ic">{ic}</span>{label}</button>{/each}
  </nav>
{/if}
{#if app.toast}<div class="toast">{app.toast}</div>{/if}
