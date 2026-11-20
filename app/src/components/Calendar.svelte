<script>
  import { app } from '../lib/db.svelte.js';
  // the next 6 weeks as a box calendar: each day shows what's planned; empty weeks get a +
  let { onpick, onthis, onclose } = $props();
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const mon = (() => { const x = new Date(); x.setHours(12, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; })();
  const DAYN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const todayIso = iso(new Date());
  const short = (id) => { const r = app.recipes.find((x) => x.id === id); return r ? r.title.replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+with .*$/i, '').trim() : ''; };

  let rows = $derived(Array.from({ length: 6 }, (_, w) => {
    const start = new Date(mon); start.setDate(mon.getDate() + w * 7);
    const s = iso(start);
    const plan = w === 0 ? (app.plan.days?.some((d) => d.lunch || d.dinner || d.breakfast) ? app.plan : null) : app.weeks.find((x) => x.start === s);
    const cells = DAYN.map((name, i) => {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const day = plan?.days?.find((x) => x.day === name);
      const meals = day ? ['breakfast', 'lunch', 'dinner'].map((k) => day[k]).filter(Boolean).map(short).filter(Boolean) : [];
      return { date: d.getDate(), month: d.toLocaleDateString(undefined, { month: 'short' }), iso: iso(d), meals: [...new Set(meals)] };
    });
    return { w, start: s, plan, cells };
  }));
</script>

<div class="card nocollapse cal">
  <div class="spread"><h3 style="margin:0">Next 6 weeks</h3><button class="quiet" onclick={onclose}>Close</button></div>
  <div class="cal-head">{#each ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as d}<span>{d}</span>{/each}</div>
  {#each rows as r (r.start)}
    {#if r.plan}
      <button class="cal-week" onclick={() => (r.w === 0 ? onthis() : onpick(r.start))} title={r.w === 0 ? 'This week' : 'Open this week'}>
        {#each r.cells as c}
          <span class="cal-day" class:today={c.iso === todayIso} class:past={c.iso < todayIso}>
            <b>{c.date === 1 || c === r.cells[0] ? `${c.month} ${c.date}` : c.date}</b>
            {#each c.meals.slice(0, 2) as m}<span class="cal-meal">{m}</span>{/each}
          </span>
        {/each}
      </button>
    {:else}
      <div class="cal-week empty">
        {#each r.cells as c}<span class="cal-day" class:today={c.iso === todayIso}><b>{c.date === 1 || c === r.cells[0] ? `${c.month} ${c.date}` : c.date}</b></span>{/each}
        <button class="cal-add" onclick={() => (r.w === 0 ? onthis() : onpick(r.start))} aria-label="Plan week of {r.cells[0].month} {r.cells[0].date}">＋ Plan this week</button>
      </div>
    {/if}
  {/each}
  <p class="small muted" style="margin:8px 0 0">Tap a week to change it. Each week keeps its own shopping list.</p>
</div>

<style>
  .cal-head, .cal-week { display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px; }
  .cal-head span { font-size: 11px; color: var(--muted); text-align: center; padding: 6px 0 2px; }
  .cal-week { width: 100%; background: transparent; padding: 0; margin: 3px 0; border: 0; color: var(--ink); font-weight: 400; position: relative; align-items: stretch; }
  .cal-day { display: flex; flex-direction: column; gap: 2px; min-height: 64px; border: 1px solid var(--line); border-radius: 8px; padding: 4px; text-align: left; background: var(--card); overflow: hidden; }
  button.cal-week:hover .cal-day { border-color: var(--accent); }
  .cal-day b { font-size: 11px; color: var(--muted); }
  .cal-day.today { border-color: var(--accent); }
  .cal-day.past { opacity: .55; }
  .cal-meal { font-size: 10.5px; line-height: 1.2; background: var(--accent-soft); border-radius: 4px; padding: 2px 3px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .empty .cal-day { background: transparent; border-style: dashed; }
  .cal-add { position: absolute; inset: 22px 30% 10px; padding: 4px 8px; font-size: 13px; }
  @media (min-width: 700px) { .cal-day { min-height: 84px; } .cal-meal { font-size: 12px; } }
</style>
