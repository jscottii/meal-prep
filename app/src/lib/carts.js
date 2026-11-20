// Project carts (a party, Thanksgiving, chili for 40): lines from recipes scaled to the headcount, plus anything typed in.
import { scaleLine } from './cookday.js';

const r2 = (x) => Math.round(Number(x) * 100) / 100;
const AMT = /^((?:\d+\s+)?\d+(?:[./]\d+)?|[½¼¾⅓⅔])\s*(lbs?|pounds?|oz|ounces?|kg|g|bags?|cans?|jars?|boxes?|packs?|packages?|bunch(?:es)?|heads?|dozen|cups?|gallons?|gal|qts?|quarts?|bottles?|cartons?|loaf|loaves|blocks?|sticks?|cases?|trays?|each)?\b/i;
const UNIT = { lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb', oz: 'oz', ounce: 'oz', ounces: 'oz', kg: 'kg', g: 'g', gallon: 'gal', gallons: 'gal', gal: 'gal', qt: 'qt', qts: 'qt', quart: 'qt', quarts: 'qt', dozen: 'dozen' };
const num = (s) => { s = String(s).trim(); const u = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 }; if (u[s]) return u[s]; const m = s.match(/^(\d+)\s+(\d+)\/(\d+)$/); if (m) return +m[1] + m[2] / m[3]; const f = s.match(/^(\d+)\/(\d+)$/); if (f) return f[1] / f[2]; return Number(s) || 1; };
/** "2 lb ground beef" → { qty: 2, unit: 'lb' }; "3 cans beans" → { qty: 3, unit: 'can' } */
export function readAmount(text) {
  const m = String(text || '').trim().match(AMT);
  if (!m) return { qty: 1, unit: 'each' };
  const w = (m[2] || 'each').toLowerCase();
  const unit = UNIT[w] || w.replace(/(es|s)$/, '').replace(/^package$/, 'pack').replace(/^loave$/, 'loaf').replace(/^bunche$/, 'bunch');
  return { qty: num(m[1]), unit };
}

/**
 * Lines for the recipes in a cart. recipes: [{ r, portions }]. Linked shopping items are scaled by packages
 * (rounded up); recipes without links bring their ingredient lines, scaled.
 */
export function recipeLines(recipes, items, priceOf) {
  const out = new Map();
  recipes.forEach(({ r, portions }) => {
    if (!r) return;
    const k = portions && r.servings ? portions / r.servings : 1;
    const linked = Object.entries(r.items || {});
    if (linked.length) {
      linked.forEach(([id, units]) => {
        const it = items.find((i) => i.id === id); if (!it) return;
        const add = Number(units || 1) * k;
        const e = out.get(id) || { key: 'i:' + id, item_id: id, name: it.name, qty: 0, unit: 'pack', size: it.qty || '', recipes: [] };
        e.qty += add; e.recipes.push(r.title);
        out.set(id, e);
      });
    } else {
      (r.ing || []).forEach((line) => {
        if (/:$/.test(String(line).trim())) return;
        const scaled = scaleLine(String(line), k);
        const key = 'n:' + scaled.toLowerCase();
        out.set(key, { key, item_id: null, name: scaled, qty: 1, unit: 'each', size: '', recipes: [r.title] });
      });
    }
  });
  return [...out.values()].map((e) => {
    const qty = e.item_id ? Math.max(1, Math.ceil(e.qty - 0.05)) : e.qty;
    const each = e.item_id ? priceOf(e.item_id) : 0;
    return { ...e, qty, unit_price: each || null, total: each ? r2(each * qty) : null, est: true, done: false };
  });
}

/** Rebuild a cart's recipe lines (after changing people or recipes) but keep what you typed or checked. */
export function mergeLines(oldLines, fresh) {
  const old = new Map(oldLines.map((l) => [l.key, l]));
  const manual = oldLines.filter((l) => l.manual);
  const kept = fresh.map((f) => {
    const o = old.get(f.key);
    if (!o) return f;
    // amounts you edited stay; recipe changes update the rest
    return o.est === false ? { ...f, qty: o.qty, unit: o.unit, unit_price: o.unit_price, total: o.total, est: false, done: o.done, store: o.store } : { ...f, done: o.done, store: o.store };
  });
  return [...kept, ...manual];
}

export function totals(lines) {
  const sum = (ls) => r2(ls.reduce((a, l) => a + (Number(l.total) || 0), 0));
  return { inCart: sum(lines.filter((l) => l.done)), left: sum(lines.filter((l) => !l.done)), all: sum(lines), done: lines.filter((l) => l.done).length, count: lines.length, unpriced: lines.filter((l) => l.total == null).length };
}

/** Lines in the shape the ordering buttons take. */
export const orderLines = (lines) => lines.filter((l) => !l.done).map((l) => ({ id: l.item_id || l.key, name: l.name, search: l.name.replace(/^[\d½¼¾⅓⅔./\s]+(lb|oz|cups?|tbsp|tsp|cans?|g|kg)?\s*/i, ''), count: l.unit === 'pack' || l.unit === 'each' ? Math.max(1, Math.round(l.qty)) : 1, qty: l.unit === 'pack' || l.unit === 'each' ? l.size : `${l.qty} ${l.unit}`, cat: 'List' }));
