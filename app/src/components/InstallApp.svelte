<script>
  import { install, promptInstall, browserKind } from '../lib/install.svelte.js';
  import { toast } from '../lib/db.svelte.js';
  let { compact = false } = $props();
  const kind = browserKind();
  let open = $state(!compact);
  async function go() { if (await promptInstall()) toast('✓ Installed — look for WFD on your home screen'); }
  async function copy() { try { await navigator.clipboard.writeText(location.origin + location.pathname); toast('✓ Link copied — paste it into Safari'); } catch { toast(location.origin + location.pathname); } }
</script>

{#if install.installed}
  {#if !compact}<p class="ok small">✓ You're using the installed app.</p>{/if}
{:else}
  <div class="card install">
    <div class="spread">
      <b>📲 Install the app</b>
      {#if install.prompt}<button onclick={go}>Install</button>
      {:else if compact}<button class="quiet" onclick={() => (open = !open)}>{open ? 'Hide' : 'How?'}</button>{/if}
    </div>
    {#if !install.prompt && open}
      {#if kind === 'ios-safari'}
        <ol class="small">
          <li>Tap the <b>Share</b> button <span class="ico">⬆︎</span> in Safari's toolbar. On iOS 26, if you don't see it, tap <b>•••</b> at the bottom right first, then <b>Share</b>.</li>
          <li>Scroll down the list and tap <b>Add to Home Screen</b>. (Not there? Tap <b>Edit Actions</b> at the bottom and add it.)</li>
          <li>Leave <b>Open as Web App</b> on, then tap <b>Add</b>.</li>
        </ol>
      {:else if kind === 'ios-chrome'}
        <ol class="small">
          <li>Tap the <b>Share</b> button <span class="ico">⬆︎</span> at the right end of Chrome's address bar.</li>
          <li>Tap <b>Add to Home Screen</b>, then <b>Add</b>.</li>
          <li>Don't see it? Update Chrome, or open this page in <b>Safari</b> instead.</li>
        </ol>
      {:else if kind === 'ios-inapp' || kind === 'ios-other'}
        <p class="small">You're in a browser inside another app, which can't install apps. Open this page in <b>Safari</b> first: tap <b>•••</b> or the compass icon and choose <b>Open in Safari</b>, or copy the link.</p>
        <button class="ghost" onclick={copy}>Copy link</button>
      {:else if kind === 'android'}
        <ol class="small">
          <li>In Chrome, tap the <b>⋮</b> menu at the top right.</li>
          <li>Tap <b>Install app</b> (or <b>Add to Home screen</b>), then <b>Install</b>.</li>
        </ol>
      {:else}
        <p class="small">In Chrome or Edge, click the install icon <span class="ico">⊕</span> at the right end of the address bar, or open the <b>⋮</b> menu → <b>Cast, save and share</b> → <b>Install page as app</b>. On a Mac in Safari: <b>File → Add to Dock</b>.</p>
      {/if}
      <p class="small muted" style="margin-bottom:0">Installed, it opens full screen like a normal app, keeps you signed in, and can show timer notifications.</p>
    {/if}
  </div>
{/if}

<style>
  .install ol { padding-left: 20px; margin: 8px 0; }
  .install li { margin: 6px 0; }
  .ico { display: inline-block; border: 1px solid var(--line); border-radius: 6px; padding: 0 5px; background: #fff; }
</style>
