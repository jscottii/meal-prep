// Trip planning: nearest stores + drive times (free maps) → optimizer → route line.
import { app, need, toast, owned } from './db.svelte.js';
import { nearestAndMatrix, routeLine, geocode } from './maps.js';
import { planTrips } from './optimizer.js';
import { scalePrices } from './planner.js';

export const trip = $state({ start: 'home', typed: '', here: null, busy: false, step: '', error: '', result: null, choice: 'best', line: null, stores: [], when: 0, geo: null });

export function startAddress() {
  if (trip.start === 'here' && trip.here) return `${trip.here.lat},${trip.here.lng}`;
  if (trip.start === 'typed' && trip.typed.trim()) return trip.typed.trim();
  return app.settings.homeAddress;
}

export function useMyLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('This device can’t share its location.'));
    navigator.geolocation.getCurrentPosition(
      (p) => { trip.here = { lat: p.coords.latitude, lng: p.coords.longitude }; trip.start = 'here'; resolve(trip.here); },
      () => reject(new Error('Location permission was denied. You can type an address instead.')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  });
}

export async function planTrip() {
  if (trip.busy) return;
  trip.busy = true; trip.error = ''; trip.step = 'Starting…';
  try {
    const s = app.settings, n = need();
    const items = app.items.filter((i) => n[i.id] > 0 && !owned(i));
    if (!items.length) { trip.result = { empty: true }; return; }
    const enabled = (Array.isArray(s.enabledStores) ? s.enabledStores : String(s.enabledStores || '').split(',')).map((x) => x.trim()).filter(Boolean);
    const stores = app.stores.filter((st) => st.enabled !== false && enabled.includes(st.id) && (!st.bulk || s.costcoMember));
    const start = startAddress(), home = s.homeAddress;
    const nm = await nearestAndMatrix(start, home, stores, s.nearestStores !== false, (t) => (trip.step = t));
    trip.geo = nm.start; trip.stores = nm.stores;
    const prices = scalePrices(app.prices, items, n, nm.stores, s.costcoMode);
    // items with no price anywhere yet: place them at a stop you're making anyway
    items.forEach((it) => {
      const row = (prices[it.id] = prices[it.id] || {});
      if (Object.values(row).some((e) => e && e.price != null && !e.notFound)) return;
      nm.stores.forEach((st) => { if (!st.bulk && !(row[st.id] && row[st.id].notFound)) row[st.id] = { price: 0, source: 'unpriced' }; });
    });
    const res = planTrips({ items, stores: nm.stores, prices, matrix: nm.matrix,
      settings: { mpg: +s.mpg, gasPrice: +s.gasPrice, timeValue: +s.timeValue, stopMinutes: +s.stopMinutes, maxStores: +s.maxStores,
        costcoMember: !!s.costcoMember, costcoMode: s.costcoMode, enabled: nm.stores.map((x) => x.id) },
      start, end: home });
    res.itemCount = items.length;
    res.alreadyHave = app.items.filter((i) => n[i.id] > 0 && owned(i)).map((i) => i.id);
    trip.result = res; trip.choice = 'best'; trip.when = Date.now();
    await drawLine();
  } catch (e) {
    trip.error = String(e.message || e);
  } finally { trip.busy = false; trip.step = ''; }
}

export function chosen() {
  const r = trip.result; if (!r || r.empty) return null;
  return r[trip.choice] || r.best;
}

export async function drawLine() {
  const p = chosen(); trip.line = null;
  if (!p || !trip.geo) return;
  const byId = Object.fromEntries(trip.stores.map((s) => [s.id, s]));
  const homeGeo = await geocode(app.settings.homeAddress).catch(() => null);
  const pts = [trip.geo, ...p.stores.map((s) => byId[s.id]), homeGeo || trip.geo].filter(Boolean);
  try { trip.line = { ...(await routeLine(pts)), pts }; } catch (_) { trip.line = { coords: null, pts }; }
}

