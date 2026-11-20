<script>
  import { app, need, itemById, saveReceipt, toast } from '../lib/db.svelte.js';
  import { parseReceiptText, matchReceipt } from '../lib/receipts.js';
  import { trip } from '../lib/trip.svelte.js';
  let { go, onclose = null } = $props();

  let storeId = $state(''), file = $state(null), preview = $state(''), step = $state(''), pct = $state(0), rows = $state(null), err = $state(''), text = $state(''), date = $state(new Date().toISOString().slice(0, 10)), saving = $state(false), done = $state(null);
  let n = $derived(need());
  let planned = $derived.by(() => {   // items the trip planned at this store
    const plan = trip.result?.[trip.choice] || trip.result?.best;
    const st = plan?.stores?.find((s) => s.id === storeId);
    return st ? st.items.map((i) => i.id) : [];
  });
  const fmt = (x) => (x == null || x === '' ? '—' : '$' + Number(x).toFixed(2));

  async function read() {
    if (!file) return;
    err = ''; rows = null; done = null; step = 'Loading text reader…'; pct = 0;
    try {
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('eng', 1, { logger: (m) => { if (m.status === 'recognizing text') { step = 'Reading receipt…'; pct = Math.round(m.progress * 100); } } });
      const { data } = await worker.recognize(file);
      await worker.terminate();
      text = data.text; build();
    } catch (e) { err = 'Couldn’t read the photo: ' + (e.message || e); }
    step = '';
  }
  function build() {
    const parsed = parseReceiptText(text);
    if (parsed.date) date = parsed.date;
    const items = app.items.map((i) => ({ id: i.id, name: i.name, q: i.q, must: i.must }));
    const m = matchReceipt(parsed.lines, items);   // { itemId: { i, price, text } }
    const usedLines = new Set(Object.values(m).map((x) => x.i));
    const list = Object.entries(m).map(([id, x]) => ({ itemId: id, line: x.text, paid: x.price, status: 'found' }));
    planned.forEach((id) => { if (!m[id]) list.push({ itemId: id, line: '', paid: '', status: 'skip', missing: true }); });
    parsed.lines.filter((l) => !usedLines.has(l.i)).slice(0, 25).forEach((l) => list.push({ itemId: '', line: l.text, paid: l.price, status: 'skip' }));
    rows = list.map((r) => ({ ...r, sel: false }));
    if (!list.length) err = 'No prices found in that photo. Try a sharper, flatter photo, or paste the text.';
  }
  let selCount = $derived(rows ? rows.filter((r) => r.sel).length : 0);
  function selectAll(on) { rows.forEach((r) => (r.sel = on)); }
  function selectWhere(f) { rows.forEach((r) => (r.sel = f(r))); }
  function label(status) {
    let n = 0; const picked = selCount;
    rows.forEach((r) => { if (!r.sel) return; if (status !== 'skip' && !r.itemId) return; r.status = status; r.sel = false; n++; });
    const skipped = picked - n;
    toast(`✓ ${n} marked ${status === 'found' ? 'bought' : status === 'notfound' ? 'not in stock' : 'ignore'}${skipped > 0 ? ` · ${skipped} need an item picked first` : ''}`);
  }
  function pick(e) { file = e.currentTarget.files?.[0] || null; e.currentTarget.value = ''; if (file) { preview = URL.createObjectURL(file); read(); } }
  async function save() {
    saving = true;
    try {
      done = await saveReceipt(storeId, rows.filter((r) => r.itemId && r.status !== 'skip').map((r) => ({ ...r, paid: r.status === 'found' ? r.paid : null })), date);
      toast(`✓ Saved ${done.bought} prices`);
    } catch (e) { err = e.message; }
    saving = false;
  }
</script>

<div>
  <h2 style="margin-top:0">🧾 Done shopping? Check your receipt</h2>
  <p class="small muted" style="margin-top:0">Snap the receipt and the app saves what you really paid, so next week’s trip and prices are more accurate. Optional.</p>
  <p class="muted">Snap your receipt. The app reads it right on your phone, checks each price against what it planned, and notes anything the store didn't have.</p>
  {#if err}<div class="err">⚠️ {err}</div>{/if}
  {#if done}
    <div class="ok">✓ {done.bought} items marked bought with their real prices{done.saved - done.bought ? `, ${done.saved - done.bought} marked not found (skipped at this store for 30 days)` : ''}. <button class="quiet" onclick={() => { trip.result = null; onclose ? onclose() : go('trip'); }}>Close</button></div>
  {/if}
  <div class="card">
    <div class="grid2">
      <label class="f">Store<select bind:value={storeId}><option value="">Choose…</option>{#each app.stores as s}<option value={s.id}>{s.short}</option>{/each}</select></label>
      <label class="f">Date<input type="date" bind:value={date} /></label>
    </div>
    <div class="row" style="margin-top:6px;gap:8px;flex-wrap:wrap">
      <label class="btn" class:ghost={!storeId}>📷 Take photo<input type="file" accept="image/*" capture="environment" hidden onchange={pick} disabled={!storeId} /></label>
      <label class="btn ghost">🖼️ Choose from photos<input type="file" accept="image/*" hidden onchange={pick} disabled={!storeId} /></label>
    </div>
    {#if !storeId}<p class="small muted">Pick the store first.</p>{/if}
    {#if step}<p class="row small"><span class="spinner"></span> {step} {pct ? pct + '%' : ''}</p>{/if}
    {#if preview}<img src={preview} alt="receipt" style="max-width:120px;border-radius:8px;margin-top:8px;border:1px solid var(--line)" />{/if}
    <details style="margin-top:8px"><summary class="small muted">Or paste receipt text</summary><textarea bind:value={text}></textarea><button class="ghost" onclick={build} disabled={!storeId || !text}>Check this text</button></details>
  </div>

  {#if rows}
    <div class="card">
      <h3>Check the matches</h3>
      <p class="small muted" style="margin-top:0">Planned items missing from the receipt are set to <b>Ignore</b>. Change them to <b>Not in stock</b> only if the store didn't have them.</p>
      <div class="row small" style="margin-bottom:6px">
        Select:
        <button class="quiet" onclick={() => selectAll(true)}>All</button>
        <button class="quiet" onclick={() => selectWhere((r) => r.missing)}>Missing</button>
        <button class="quiet" onclick={() => selectWhere((r) => !r.itemId)}>Not on list</button>
        <button class="quiet" onclick={() => selectAll(false)}>None</button>
      </div>
      {#if selCount}
        <div class="bulkbar">
          <b>{selCount} selected</b>
          <button onclick={() => label('found')}>Bought</button>
          <button class="ghost" onclick={() => label('notfound')}>Not in stock</button>
          <button class="ghost" onclick={() => label('skip')}>Ignore</button>
        </div>
      {/if}
      <div class="tw"><table>
        <thead><tr><th style="width:28px"><input type="checkbox" checked={selCount === rows.length} onchange={(e) => selectAll(e.currentTarget.checked)} aria-label="Select all" /></th><th>Item</th><th class="num">Planned</th><th class="num">Paid</th><th>Had it?</th></tr></thead>
        <tbody>
          {#each rows as r}
            {@const pl = r.itemId ? app.prices[r.itemId]?.[storeId]?.price : null}
            <tr style:opacity={r.status === 'skip' ? 0.6 : 1} style:background={r.sel ? 'var(--accent-soft)' : ''}>
              <td><input type="checkbox" bind:checked={r.sel} style="width:20px;height:20px" /></td>
              <td><select bind:value={r.itemId} onchange={() => { if (r.itemId && r.status === 'skip') r.status = 'found'; if (!r.itemId) r.status = 'skip'; }}><option value="">— not on my list —</option>{#each app.items as it}<option value={it.id}>{it.name}</option>{/each}</select>
                {#if r.line}<div class="small muted">{r.line}</div>{:else if r.missing}<div class="small muted">planned · not on receipt</div>{/if}</td>
              <td class="num small">{fmt(pl)}</td>
              <td class="num"><input type="number" step="0.01" bind:value={r.paid} style="width:84px" disabled={r.status === 'notfound'} />
                {#if pl != null && r.paid !== '' && r.paid != null && r.status === 'found'}<div class="small" style:color={r.paid > pl ? 'var(--red)' : 'var(--green)'}>{r.paid > pl ? '+' : ''}{(r.paid - pl).toFixed(2)}</div>{/if}</td>
              <td><select bind:value={r.status} style="width:110px"><option value="found">Bought</option><option value="notfound">Not in stock</option><option value="skip">Ignore</option></select></td>
            </tr>
          {/each}
        </tbody>
      </table></div>
      <button style="margin-top:10px" onclick={save} disabled={saving || !storeId}>{#if saving}<span class="spinner"></span>{/if} Save receipt</button>
    </div>
  {/if}
</div>
