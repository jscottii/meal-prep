<script>
  import { app, start, currentHousehold, joinWithCode, clearPendingCode, MAX_HOUSEHOLDS } from './lib/db.svelte.js';
  let joinBusy = $state(false), joinErr = $state('');
  async function doJoin() { joinBusy = true; joinErr = ''; try { await joinWithCode(app.pendingJoin.code); } catch (e) { joinErr = e.message; joinBusy = false; } }
  import Login from './routes/Login.svelte';
  import Trip from './routes/Trip.svelte';
  import Plan from './routes/Plan.svelte';
  import Prep from './routes/Prep.svelte';
  import Pantry from './routes/Pantry.svelte';
  import Recipes from './routes/Recipes.svelte';
  import Receipt from './routes/Receipt.svelte';
  import Prices from './routes/Prices.svelte';
  import More from './routes/More.svelte';
  import TimerDock from './components/TimerDock.svelte';

  const TABS = [['trip', '🛒', 'Trip'], ['plan', '📅', 'Week'], ['prep', '🔪', 'Prep'], ['pantry', '🥫', 'Pantry'], ['recipes', '🍲', 'Recipes'], ['receipt', '🧾', 'Receipt'], ['more', '☰', 'More']];
  let page = $state((location.hash || '').slice(1) || 'trip');
  function go(p) { page = p; history.replaceState(null, '', '#' + p); window.scrollTo(0, 0); }
  $effect(() => { const f = () => { const h = location.hash.slice(1); if (h && (TABS.some((t) => t[0] === h) || h === 'prices')) page = h; }; addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); });
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
  {#if app.households.length > 1 || app.myInvites.length}
    <div class="hhbar">
      {#if app.households.length > 1}<button class="quiet" onclick={() => { sessionStorage.setItem('mp-more-tab', 'settings'); go('more'); }}>🏠 {currentHousehold()?.name}</button>{/if}
      {#if app.myInvites.length}<button class="quiet" onclick={() => { sessionStorage.setItem('mp-more-tab', 'settings'); go('more'); }}>✉️ {app.myInvites.length === 1 ? `${app.myInvites[0].name} invited you` : `${app.myInvites.length} household invites`} →</button>{/if}
    </div>
  {/if}
  {#key page}
    {#if page === 'plan'}<Plan {go} />
    {:else if page === 'prep'}<Prep {go} />
    {:else if page === 'pantry'}<Pantry {go} />
    {:else if page === 'recipes'}<Recipes />
    {:else if page === 'receipt'}<Receipt {go} />
    {:else if page === 'prices'}<Prices {go} />
    {:else if page === 'more'}<More {go} />
    {:else}<Trip {go} />{/if}
  {/key}
  <nav class="tabs">
    <div class="brand"><img src="icon.svg" alt="" width="26" height="26" style="vertical-align:-7px;margin-right:8px;border-radius:6px" />What's for Dinner{#if app.households.length > 1}<button class="hh" onclick={() => { sessionStorage.setItem('mp-more-tab', 'settings'); go('more'); }}>🏠 {currentHousehold()?.name} ▾</button>{/if}</div>
    {#each TABS as [k, ic, label]}<button class:on={page === k} onclick={() => go(k)}><span class="ic">{ic}</span>{label}</button>{/each}
  </nav>
{/if}
{#if app.pendingJoin}
  <div class="modal-back">
    <div class="card modal">
      <h2>Join “{app.pendingJoin.name}”?</h2>
      <p class="small muted">{app.pendingJoin.members} member{app.pendingJoin.members === 1 ? '' : 's'}. You'll see and share its recipes, plans, pantry and shopping lists. Your current household stays in your list; switch any time in Settings.</p>
      {#if app.households.length >= MAX_HOUSEHOLDS}<p class="err small">You're in {MAX_HOUSEHOLDS} households, the most allowed. Leave one in Settings first.</p>{/if}
      {#if joinErr}<div class="err">⚠️ {joinErr}</div>{/if}
      <div class="row">
        <button onclick={doJoin} disabled={joinBusy || app.households.length >= MAX_HOUSEHOLDS}>{#if joinBusy}<span class="spinner"></span>{/if} Join</button>
        <button class="quiet" onclick={() => { clearPendingCode(); app.pendingJoin = null; }}>Not now</button>
      </div>
    </div>
  </div>
{/if}
{#if app.toast}<div class="toast">{app.toast}</div>{/if}
