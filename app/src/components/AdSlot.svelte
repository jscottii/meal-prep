<script>
  import { onMount } from 'svelte';
  import { app } from '../lib/db.svelte.js';
  import { ADSENSE_CLIENT, ADSENSE_SLOT } from '../lib/config.js';
  import { isNative } from '../lib/native.js';
  // A small banner on planning screens. Never on Prep, never for WFD Plus members, off until AdSense IDs are set.
  const on = $derived(!!ADSENSE_CLIENT && !!ADSENSE_SLOT && !app.plus && !isNative());
  let el = $state(null);
  onMount(() => {
    if (!on) return;
    if (!document.querySelector('script[data-adsense]')) {
      const s = document.createElement('script');
      s.async = true; s.dataset.adsense = '1'; s.crossOrigin = 'anonymous';
      s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`;
      document.head.appendChild(s);
    }
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch {}
  });
</script>

{#if on}
  <div class="adslot" aria-label="Advertisement">
    <span class="small muted">Ad · <a href="#more" onclick={(e) => { e.preventDefault(); sessionStorage.setItem('mp-more-tab', 'settings'); location.hash = 'more'; }}>Go ad-free with WFD Plus</a></span>
    <ins bind:this={el} class="adsbygoogle" style="display:block" data-ad-client={ADSENSE_CLIENT} data-ad-slot={ADSENSE_SLOT} data-ad-format="auto" data-full-width-responsive="true"></ins>
  </div>
{/if}

<style>.adslot { margin: 16px 0; padding: 8px; border: 1px dashed var(--line); border-radius: 10px; }</style>
