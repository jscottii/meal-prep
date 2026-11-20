<script>
  import InstallApp from '../components/InstallApp.svelte';
  import { app, saveSettings, saveSerpKey, testSerpKey, invite, signOut, saveStore, toast } from '../lib/db.svelte.js';
  import { trip } from '../lib/trip.svelte.js';
  let { go } = $props();
  let tab = $state('history');
  let s = $state({ ...app.settings }), saving = $state(false);
  let key = $state(''), keyBusy = $state(false), keyMsg = $state(null);
  let wife = $state(''), invBusy = $state(false);

  let days = $derived.by(() => {
    const g = {};
    app.purchases.forEach((p) => { const k = `${p.day}|${p.store || ''}`; (g[k] = g[k] || []).push(p); });
    return Object.entries(g).map(([k, rows]) => ({ day: k.split('|')[0], store: k.split('|')[1], rows }));
  });
  const fmt = (x) => (x == null ? '—' : '$' + Number(x).toFixed(2));

  async function save() {
    saving = true;
    try { await saveSettings({ homeAddress: s.homeAddress, mpg: +s.mpg, gasPrice: +s.gasPrice, timeValue: +s.timeValue, stopMinutes: +s.stopMinutes, maxStores: +s.maxStores,
      costcoMember: !!s.costcoMember, costcoMode: s.costcoMode, householdSize: +s.householdSize, nearestStores: !!s.nearestStores, serpMonthlyLimit: +s.serpMonthlyLimit });
      trip.result = null; toast('✓ Settings saved'); }
    catch (e) { toast(e.message); }
    saving = false;
  }
  async function keyTest() {
    keyBusy = true; keyMsg = null;
    try { if (key.trim()) await saveSerpKey(key); const r = await testSerpKey(); keyMsg = r.ok ? { ok: true, text: `Key works — ${r.plan} plan${r.left != null ? `, ${r.left} searches left` : ''}.` } : { ok: false, text: r.error }; if (r.ok) key = ''; }
    catch (e) { keyMsg = { ok: false, text: e.message }; }
    keyBusy = false;
  }
  async function sendInvite() {
    invBusy = true;
    try { await invite(wife); toast(`✓ ${wife} can now sign in and will join your household`); wife = ''; } catch (e) { toast(e.message); }
    invBusy = false;
  }
  async function toggleStore(st) { st.enabled = st.enabled === false; try { await saveStore(st); trip.result = null; } catch (e) { toast(e.message); } }
</script>

<div class="page">
  <div class="seg" style="margin:6px 0 4px">
    {#each [['history', 'History'], ['stores', 'Stores'], ['settings', 'Settings']] as [k, l]}<button class:on={tab === k} onclick={() => (tab = k)}>{l}</button>{/each}
  </div>
  <button class="ghost" style="margin:6px 0 0 6px" onclick={() => go('prices')}>🏷️ Prices</button>

  {#if tab === 'history'}
    <h1>What you've bought</h1>
    {#each days as d}
      {@const pl = d.rows.reduce((a, r) => a + (Number(r.planned) || 0), 0)}{@const pd = d.rows.reduce((a, r) => a + (Number(r.paid) || 0), 0)}
      <div class="card"><div class="spread"><h3 style="margin:0">{d.store || 'Store'} · {d.day}</h3>{#if pd}<b>{fmt(pd)}</b>{/if}</div>
        {#if pd && pl}<p class="small" style:color={pd > pl ? 'var(--red)' : 'var(--green)'}>{pd > pl ? 'Paid' : 'Saved'} {fmt(Math.abs(pd - pl))} vs plan</p>{/if}
        {#each d.rows as r}<div class="list-row small"><span>{r.item}{#if r.status === 'Not found'} <span class="pill red">not in stock</span>{/if}</span><span>{r.paid != null ? fmt(r.paid) : r.planned != null ? fmt(r.planned) + ' planned' : ''}</span></div>{/each}
      </div>
    {:else}<p class="muted">Nothing yet. Tick items off on your trip, or upload a receipt after shopping.</p>{/each}

  {:else if tab === 'stores'}
    <h1>Stores</h1>
    <p class="muted small">{app.settings.nearestStores !== false ? 'Each chain uses its location nearest to where your trip starts.' : 'Using the addresses below.'} Turn a store off to leave it out of trips.</p>
    <div class="card">
      {#each app.stores as st}
        {@const loc = trip.stores.find((x) => x.id === st.id)}
        <div class="list-row">
          <div class="grow"><b>{st.short}</b>{#if st.bulk} <span class="pill acc">membership</span>{/if}
            <div class="small muted">{loc?.label || st.address}{loc?.fromStart ? ` · ${loc.fromStart.minutes} min · ${loc.fromStart.miles} mi` : ''}{loc && !loc.home ? ' · nearest' : ''}</div>
            <div class="small"><a href={st.ad} target="_blank" rel="noopener">Weekly ad ↗</a> · {st.source === 'serpapi' || st.source === 'target' ? 'live prices (SerpApi)' : 'prices from receipts'}</div></div>
          <label class="switch"><input type="checkbox" checked={st.enabled !== false} onchange={() => toggleStore(st)} /><span></span></label>
        </div>
      {/each}
    </div>

  {:else}
    <h1>Settings</h1>
    <InstallApp />
    <div class="card">
      <label class="f">Home address (trips end here)<input bind:value={s.homeAddress} /></label>
      <div class="grid2">
        <label class="f">Usually feeding (people)<input type="number" min="1" bind:value={s.householdSize} /></label>
        <label class="f">Most stops per trip<input type="number" min="1" max="6" bind:value={s.maxStores} /></label>
        <label class="f">Car MPG<input type="number" bind:value={s.mpg} /></label>
        <label class="f">Gas $/gallon<input type="number" step="0.01" bind:value={s.gasPrice} /></label>
        <label class="f">Your time ($/hour)<input type="number" bind:value={s.timeValue} /></label>
        <label class="f">Minutes per stop<input type="number" bind:value={s.stopMinutes} /></label>
        <label class="f">Store locations<select bind:value={s.nearestStores}><option value={true}>Nearest to where I start</option><option value={false}>Always the saved addresses</option></select></label>
        <label class="f">Costco<select bind:value={s.costcoMember}><option value={false}>Not a member</option><option value={true}>Member</option></select></label>
      </div>
      <button onclick={save} disabled={saving}>{#if saving}<span class="spinner"></span>{/if} Save settings</button>
    </div>

    <div class="card">
      <h3>Live prices (SerpApi)</h3>
      <p class="small">{app.hasSerpKey ? `✅ Key saved · ${app.serpUsage.n} of ${app.serpUsage.limit} searches used this month` : 'No key yet.'}</p>
      <ol class="small" style="padding-left:18px"><li>Sign up free at <a href="https://serpapi.com/users/sign_up" target="_blank" rel="noopener">serpapi.com</a> and confirm your email.</li><li>Copy your key from <a href="https://serpapi.com/manage-api-key" target="_blank" rel="noopener">Your API Key</a> (64 characters).</li><li>Paste it below and press <b>Save & test</b>.</li></ol>
      <div class="row"><input class="grow" type="password" autocomplete="off" placeholder={app.hasSerpKey ? 'Saved — paste a new key to replace' : 'Paste your SerpApi key'} bind:value={key} />
        <button onclick={keyTest} disabled={keyBusy || (!key.trim() && !app.hasSerpKey)}>{#if keyBusy}<span class="spinner"></span>{/if} {key.trim() ? 'Save & test' : 'Test'}</button></div>
      {#if keyMsg}<div class={keyMsg.ok ? 'ok' : 'err'}>{keyMsg.ok ? '✓ ' : '⚠️ '}{keyMsg.text}</div>{/if}
      <p class="small muted">Your key is stored so only the app's server can read it — it never comes back to the phone.</p>
      <label class="f">Monthly search cap (free plan = 250)<input type="number" min="0" bind:value={s.serpMonthlyLimit} onchange={save} /></label>
    </div>

    <div class="card">
      <h3>Household</h3>
      <p class="small">Signed in as <b>{app.user?.email}</b>.</p>
      {#if app.members.length > 1}<p class="small muted">Members: {app.members.map((m) => m.email).join(', ')}</p>{/if}
      {#if app.invites.length}<p class="small muted">Invited: {app.invites.map((i) => i.email).join(', ')} (they join when they first sign in)</p>{/if}
      <div class="row"><input class="grow" type="email" placeholder="Your wife's email" bind:value={wife} /><button onclick={sendInvite} disabled={invBusy || !/@/.test(wife)}>Invite</button></div>
      <p class="small muted">Then send her the app link. She signs in with that email and sees the same list, live.</p>
      <button class="ghost" style="margin-top:10px" onclick={signOut}>Sign out</button>
    </div>
  {/if}
</div>
