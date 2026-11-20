<script>
  import { app, saveSettings, importRecipes } from '../lib/db.svelte.js';
  import { CUISINES, findIdeas, mealDetail, fromMealDb } from '../lib/discover.js';
  // First run (or anyone who hasn't done it): pick favorite cuisines → 15 starter meals in Saved recipes.
  let { go, onclose } = $props();
  let step = $state('pick'), liked = $state([...(app.settings.cuisines || [])]), prog = $state(0), err = $state(''), made = $state([]);
  const TOTAL = 15;
  const toggle = (c) => (liked = liked.includes(c) ? liked.filter((x) => x !== c) : [...liked, c]);

  async function build() {
    step = 'build'; err = ''; prog = 0;
    try {
      await saveSettings({ cuisines: liked });
      const have = new Set(app.recipes.map((r) => r.title.toLowerCase()));
      // mostly dinners from the cuisines you picked, plus a couple of breakfasts
      const mains = (await findIdeas({ cuisines: liked.length ? liked : ['American', 'Italian', 'Mexican', 'Chinese'] })).filter((i) => !have.has(i.title.toLowerCase()));
      const breakfasts = (await findIdeas({ types: ['Breakfast'] })).filter((i) => !have.has(i.title.toLowerCase())).slice(0, 2);
      // spread the picks evenly across the cuisines
      const byArea = {}; mains.forEach((m) => (byArea[m.area] = byArea[m.area] || []).push(m));
      const areas = Object.keys(byArea), queue = [];
      for (let i = 0; queue.length < TOTAL * 2 && areas.some((a) => byArea[a][i]); i++) areas.forEach((a) => byArea[a][i] && queue.push(byArea[a][i]));
      const out = [];
      for (const b of breakfasts) { const m = await mealDetail(b.id); const [r] = await importRecipes([fromMealDb(m)], 'mdb'); out.push(r); prog = out.length; }
      let desserts = 0;
      for (const q of queue) {
        if (out.length >= TOTAL) break;
        const m = await mealDetail(q.id);
        if (/dessert/i.test(m.strCategory) && desserts++ >= 1) continue;
        if (/side|starter/i.test(m.strCategory)) continue;
        const [r] = await importRecipes([fromMealDb(m)], 'mdb'); out.push(r); prog = out.length;
      }
      made = out;
      await saveSettings({ onboarded: true });
      step = 'done';
    } catch (e) { err = e.message; step = 'pick'; }
  }
  async function skip() { await saveSettings({ onboarded: true, onboardSkipped: true }).catch(() => {}); onclose(); }
</script>

<div class="modal-back" role="presentation">
  <div class="modal card nocollapse onboard">
    {#if step === 'pick'}
      <h2 style="margin-top:0">What do you love to eat?</h2>
      <p class="small muted" style="margin-top:0">Pick your favorite cuisines and we'll start you off with {TOTAL} meals to plan from. You can change them any time.</p>
      {#if err}<div class="err small">⚠️ {err}</div>{/if}
      <div class="row" style="gap:4px">{#each CUISINES as [c]}<button class="chip" class:on={liked.includes(c)} onclick={() => toggle(c)}>{liked.includes(c) ? '♥ ' : ''}{c}</button>{/each}</div>
      <div class="row" style="margin-top:14px">
        <button onclick={build} disabled={!liked.length}>Get my {TOTAL} meals</button>
        <button class="quiet" onclick={skip}>Not now</button>
      </div>
    {:else if step === 'build'}
      <h2 style="margin-top:0">Building your meals…</h2>
      <p class="small muted">{prog} of {TOTAL} saved</p>
      <div style="height:8px;background:var(--tint);border-radius:99px;overflow:hidden"><div style="height:100%;background:var(--accent);width:{(prog / TOTAL) * 100}%;transition:width .3s"></div></div>
    {:else}
      <h2 style="margin-top:0">✓ {made.length} meals ready</h2>
      <p class="small">{made.slice(0, 6).map((r) => r.title).join(' · ')}{made.length > 6 ? ` and ${made.length - 6} more` : ''}</p>
      <p class="small muted">They're in Saved recipes. Want us to pick this week's mix from them?</p>
      <div class="row"><button onclick={() => { onclose(); go('plan'); }}>Plan my week</button><button class="quiet" onclick={() => { onclose(); go('recipes'); }}>See them</button></div>
    {/if}
  </div>
</div>

<style>.onboard { max-width: 560px; }</style>
