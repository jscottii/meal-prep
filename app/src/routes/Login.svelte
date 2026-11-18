<script>
  import { signIn } from '../lib/db.svelte.js';
  let email = $state(''), sent = $state(false), busy = $state(false), err = $state('');
  async function go(e) {
    e.preventDefault(); busy = true; err = '';
    try { await signIn(email); sent = true; } catch (x) { err = x.message; }
    busy = false;
  }
</script>

<div class="page" style="max-width:420px;padding-top:12vh">
  <div style="font-size:44px">🛒</div>
  <h1>Meal Prep Shopper</h1>
  <p class="muted">Cook once, eat all week — and shop it in the fewest, cheapest stops.</p>
  {#if sent}
    <div class="ok">Check <b>{email}</b> for a sign-in link. Open it on this device and you're in. You'll stay signed in.</div>
    <button class="quiet" onclick={() => (sent = false)}>Use a different email</button>
  {:else}
    <form class="card" onsubmit={go}>
      <label class="f">Your email<input type="email" required autocomplete="email" bind:value={email} placeholder="you@example.com" /></label>
      <button type="submit" disabled={busy} style="width:100%">{#if busy}<span class="spinner"></span>{/if} Email me a sign-in link</button>
      {#if err}<div class="err">⚠️ {err}</div>{/if}
    </form>
    <p class="small muted">No password. Invited by someone in your household? Use the email they invited.</p>
  {/if}
</div>
