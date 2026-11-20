<script>
  // Edit what you actually bought: amount + unit, and either the price per unit or the total.
  // "2.3 lb at $3.99/lb" or "3 cans for $4.50" — change any one and the others follow.
  let { line, onsave, oncancel, large = false } = $props();
  const UNITS = ['each', 'pack', 'bag', 'box', 'can', 'jar', 'bottle', 'bunch', 'dozen', 'lb', 'oz', 'kg', 'g', 'gal', 'qt', 'fl oz', 'L', 'case', 'tray'];
  const r2 = (x) => Math.round(Number(x) * 100) / 100;
  let qty = $state(line.qty ?? 1), unit = $state(line.unit || 'each');
  let total = $state(line.total ?? (line.unit_price != null ? r2((line.qty ?? 1) * line.unit_price) : ''));
  let each = $state(line.unit_price ?? (line.total != null && (line.qty ?? 1) ? r2(line.total / (line.qty ?? 1)) : ''));
  let lead = $state(line.unit_price != null && line.total == null ? 'each' : 'total'); // which price you typed last
  function fromEach() { lead = 'each'; if (each !== '' && qty) total = r2(qty * each); }
  function fromTotal() { lead = 'total'; if (total !== '' && qty) each = r2(total / qty); }
  function fromQty() { if (!qty) return; if (lead === 'each' && each !== '') total = r2(qty * each); else if (total !== '') each = r2(total / qty); }
  function save(e) {
    e?.preventDefault();
    onsave({ qty: Number(qty) || 1, unit, unit_price: each === '' ? null : Number(each), total: total === '' ? null : Number(total) });
  }
</script>

<form class="cart-edit" onsubmit={save}>
  <div class="ce-grid">
    <label class="f">Amount<input type="number" inputmode="decimal" step="any" min="0" bind:value={qty} oninput={fromQty} /></label>
    <label class="f">Unit<select bind:value={unit}>{#each UNITS as u}<option value={u}>{u}</option>{/each}</select></label>
    <label class="f">Price per {unit}<input type="number" inputmode="decimal" step="0.01" min="0" placeholder="$" bind:value={each} oninput={fromEach} /></label>
    <label class="f">Total<input type="number" inputmode="decimal" step="0.01" min="0" placeholder="$" bind:value={total} oninput={fromTotal} /></label>
  </div>
  {#if large && qty && each !== ''}<p class="small muted" style="margin:0 0 6px">{qty} {unit} × ${Number(each).toFixed(2)} = ${Number(total || 0).toFixed(2)}</p>{/if}
  <div class="row"><button type="submit">Save</button><button type="button" class="quiet" onclick={oncancel}>Cancel</button></div>
</form>

<style>
  .cart-edit { background: #fff; border: 1px solid var(--line); border-radius: 12px; padding: 10px; margin: 6px 0 10px 30px; }
  .ce-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 10px; }
  @media (min-width: 640px) { .ce-grid { grid-template-columns: 0.8fr 1fr 1fr 1fr; } }
</style>
