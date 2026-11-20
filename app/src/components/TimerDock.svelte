<script>
  import { app, clearTimer } from '../lib/db.svelte.js';
  import { alarm, keepAwake } from '../lib/timers.js';
  import { scheduleTimer, cancelTimer, isNative } from '../lib/native.js';
  let now = $state(Date.now());
  let list = $derived(Object.entries(app.plan.timers || {}).map(([key, t]) => {
    const end = t.start + t.mins * 60000, left = Math.round((end - now) / 1000);
    return { key, ...t, left, endMax: t.start + (t.maxMins || t.mins) * 60000 };
  }).sort((a, b) => a.left - b.left));
  const alerted = new Set(JSON.parse(localStorage.getItem('mp-alerted') || '[]'));
  $effect(() => {
    const id = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(id);
  });
  $effect(() => { keepAwake(list.length > 0); });
  // phone app: a real notification for each running timer (rings with the screen locked); stopped timers are cancelled
  let scheduled = new Set();
  $effect(() => {
    if (!isNative()) return;
    const live = new Set();
    Object.entries(app.plan.timers || {}).forEach(([key, t]) => { const id = key + '@' + t.start; live.add(id); if (!scheduled.has(id)) { scheduled.add(id); scheduleTimer(key, t.label, t.start + t.mins * 60000); } });
    [...scheduled].forEach((id) => { if (!live.has(id)) { scheduled.delete(id); cancelTimer(id.split('@')[0]); } });
  });
  $effect(() => {
    list.forEach((t) => {
      const id = t.key + '@' + t.start;
      if (t.left <= 0 && !alerted.has(id)) {
        alerted.add(id); localStorage.setItem('mp-alerted', JSON.stringify([...alerted].slice(-50)));
        if (now - (t.start + t.mins * 60000) < 120000) alarm(t.label);   // don't ring for timers that ended long ago
      }
    });
  });
  const mmss = (s) => { const a = Math.abs(s), h = Math.floor(a / 3600), m = Math.floor((a % 3600) / 60), x = a % 60; return (s < 0 ? '+' : '') + (h ? `${h}:${String(m).padStart(2, '0')}` : m) + ':' + String(x).padStart(2, '0'); };
</script>

{#if list.length}
  <div class="timers">
    {#each list as t (t.key)}
      <div class="timer" class:due={t.left <= 0}>
        <div class="grow">
          <div class="tl">{t.label}</div>
          {#if t.left > 0}
            <div class="bar"><div style="width:{Math.max(0, 100 - (t.left / (t.mins * 60)) * 100)}%"></div></div>
          {:else}
            <div class="small">{t.maxMins > t.mins && now < t.endMax ? `Check it — up to ${t.maxMins - t.mins} more min` : 'Done!'}</div>
          {/if}
        </div>
        <b class="tt">{t.left > 0 ? mmss(t.left) : mmss(t.left)}</b>
        <button class="x" onclick={() => clearTimer(t.key)} aria-label="Stop timer">✕</button>
      </div>
    {/each}
  </div>
{/if}

<style>
  .timers { position: sticky; top: 0; z-index: 60; display: flex; flex-direction: column; gap: 4px; padding: calc(env(safe-area-inset-top) + 6px) 10px 6px; background: rgba(247, 243, 236, .96); border-bottom: 1px solid var(--line); }
  .timer { display: flex; align-items: center; gap: 10px; background: #fff; border: 1px solid var(--line); border-radius: 12px; padding: 7px 10px; }
  .timer.due { border-color: #c0392b; background: #fdecea; animation: pulse 1s infinite alternate; }
  @keyframes pulse { to { background: #f9d6d2; } }
  .tl { font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bar { height: 4px; background: #efe7dc; border-radius: 9px; margin-top: 4px; overflow: hidden; }
  .bar div { height: 100%; background: var(--accent); }
  .tt { font-variant-numeric: tabular-nums; font-size: 18px; }
  .x { background: none; color: var(--muted, #888); padding: 4px 6px; font-size: 16px; border: 0; }
  .grow { flex: 1; min-width: 0; }
</style>
