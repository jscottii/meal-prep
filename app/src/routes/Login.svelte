<script>
  import { signIn, signUp } from '../lib/db.svelte.js';
  let mode = $state('in'), email = $state(localStorage.getItem('mp-email') || ''), password = $state(''), busy = $state(false), err = $state('');
  async function go(e) {
    e.preventDefault(); err = '';
    if (mode === 'up' && password.length < 8) { err = 'Use at least 8 characters.'; return; }
    busy = true;
    try { localStorage.setItem('mp-email', email.trim()); await (mode === 'in' ? signIn : signUp)(email, password); }
    catch (x) { err = x.message; busy = false; }
  }
</script>

<div class="page" style="max-width:420px;padding-top:12vh">
  <div style="font-size:44px">🛒</div>
  <h1>Meal Prep Shopper</h1>
  <p class="muted">Cook once, eat all week — and shop it in the fewest, cheapest stops.</p>
  <div class="seg" style="margin-bottom:10px">
    <button class:on={mode === 'in'} onclick={() => { mode = 'in'; err = ''; }}>Sign in</button>
    <button class:on={mode === 'up'} onclick={() => { mode = 'up'; err = ''; }}>Create account</button>
  </div>
  <form class="card" onsubmit={go}>
    <label class="f">Email<input type="email" required autocomplete="email" bind:value={email} placeholder="you@example.com" /></label>
    <label class="f">Password<input type="password" required autocomplete={mode === 'in' ? 'current-password' : 'new-password'} bind:value={password} /></label>
    <button type="submit" disabled={busy} style="width:100%">{#if busy}<span class="spinner"></span>{/if} {mode === 'in' ? 'Sign in' : 'Create account'}</button>
    {#if err}<div class="err">⚠️ {err}</div>{/if}
  </form>
  <p class="small muted">{mode === 'up' ? 'Invited by someone in your household? Use the email they invited and you\'ll join their household.' : 'You stay signed in on this device.'}</p>
</div>
