// Show amounts the way the household likes: imperial, metric, or relative (just plenty/some/low/out).
const TO_G = { lb: 453.592, lbs: 453.592, pound: 453.592, pounds: 453.592, oz: 28.3495, ounce: 28.3495, ounces: 28.3495, g: 1, gram: 1, grams: 1, kg: 1000, kilogram: 1000, kilograms: 1000 };
const TO_ML = { gal: 3785.41, gallon: 3785.41, gallons: 3785.41, qt: 946.353, quart: 946.353, quarts: 946.353, pt: 473.176, pint: 473.176, pints: 473.176, cup: 236.588, cups: 236.588,
  'fl oz': 29.5735, 'fl. oz': 29.5735, ml: 1, milliliter: 1, milliliters: 1, l: 1000, liter: 1000, liters: 1000, litre: 1000, litres: 1000 };
const METRIC = new Set(['g', 'gram', 'grams', 'kg', 'kilogram', 'kilograms', 'ml', 'milliliter', 'milliliters', 'l', 'liter', 'liters', 'litre', 'litres']);
const FRAC = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 };
const r1 = (x) => (x >= 10 ? Math.round(x) : Math.round(x * 10) / 10);

function read(str) {
  const m = String(str || '').trim().match(/^(\d+(?:\.\d+)?)?\s*([½¼¾⅓⅔⅛])?\s*(fl\.? oz|[a-zA-Z]+)\b\.?\s*(.*)$/);
  if (!m || (!m[1] && !m[2])) return null;
  const n = (Number(m[1]) || 0) + (FRAC[m[2]] || 0), u = m[3].toLowerCase().replace('fl. oz', 'fl oz');
  if (TO_G[u]) return { n, u, g: n * TO_G[u], rest: m[4] };
  if (TO_ML[u]) return { n, u, ml: n * TO_ML[u], rest: m[4] };
  return null;
}
/** "2 lb chicken" → "0.9 kg chicken" (metric) etc. Anything it can't read is shown as typed. */
export function showAmount(str, mode = 'imperial') {
  if (!str) return '';
  if (mode === 'relative') return '';
  const a = read(str); if (!a) return String(str);
  const metricNow = METRIC.has(a.u);
  if ((mode === 'metric') === metricNow) return String(str);
  const tail = a.rest ? ' ' + a.rest : '';
  if (a.g != null) {
    if (mode === 'metric') return (a.g >= 1000 ? `${r1(a.g / 1000)} kg` : `${Math.round(a.g / 5) * 5 || r1(a.g)} g`) + tail;
    const oz = a.g / 28.3495; return (oz >= 16 ? `${r1(oz / 16)} lb` : `${r1(oz)} oz`) + tail;
  }
  if (mode === 'metric') return (a.ml >= 1000 ? `${r1(a.ml / 1000)} L` : `${Math.round(a.ml / 5) * 5 || r1(a.ml)} ml`) + tail;
  const c = a.ml / 236.588; return (a.ml >= 3785 ? `${r1(a.ml / 3785.41)} gal` : a.ml >= 946 ? `${r1(a.ml / 946.353)} qt` : c >= 0.25 ? `${r1(c)} cups` : `${r1(a.ml / 29.5735)} fl oz`) + tail;
}

export const UNIT_CHOICES = {
  imperial: ['each', 'lb', 'oz', 'gal', 'qt', 'cups', 'fl oz', 'dozen', 'bunch', 'loaf', 'can', 'jar', 'bag', 'box', 'bottle', 'pack', 'carton', 'tub'],
  metric: ['each', 'kg', 'g', 'L', 'ml', 'dozen', 'bunch', 'loaf', 'can', 'jar', 'bag', 'box', 'bottle', 'pack', 'carton', 'tub'],
};
/** "1.5 lb" → { n: 1.5, unit: 'lb' } in the household's system (converted if needed). */
export function splitAmount(str, mode = 'imperial') {
  const shown = showAmount(str, mode);
  const m = String(shown || '').trim().match(/^(\d+(?:\.\d+)?)?\s*([½¼¾⅓⅔⅛])?\s*(fl oz|[a-zA-Z]+)?/);
  const FR = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 0.33, '⅔': 0.67, '⅛': 0.125 };
  const n = m && (m[1] || m[2]) ? Math.round(((Number(m[1]) || 0) + (FR[m[2]] || 0)) * 100) / 100 : null;
  let unit = (m?.[3] || 'each').toLowerCase();
  const alias = { lbs: 'lb', pound: 'lb', pounds: 'lb', ounce: 'oz', ounces: 'oz', cup: 'cups', l: 'L', liter: 'L', liters: 'L', gallon: 'gal', gallons: 'gal', quart: 'qt', quarts: 'qt', packs: 'pack', bags: 'bag', boxes: 'box', cans: 'can', jars: 'jar', bottles: 'bottle', cartons: 'carton', tubs: 'tub', bunches: 'bunch', loaves: 'loaf', eggs: 'each', large: 'each', small: 'each', medium: 'each', head: 'each', heads: 'each' };
  unit = alias[unit] || unit;
  if (!UNIT_CHOICES[mode].includes(unit)) unit = 'each';
  return { n, unit };
}

export const CONTAINERS = ['can', 'jar', 'bag', 'box', 'bottle', 'pack', 'carton', 'tub'];
export const SIZE_UNITS = { imperial: ['oz', 'fl oz', 'lb', 'ct'], metric: ['g', 'ml', 'kg', 'L', 'ct'] };
/** "2 can (15 oz)" → { n: 2, unit: 'can', size: 15, sizeUnit: 'oz' } */
export function splitContainer(str, mode = 'imperial') {
  const m = String(str || '').match(/\(([\d.]+)\s*(fl oz|[a-zA-Z]+)\)/);
  const base = splitAmount(String(str || '').replace(/\s*\(.*\)/, ''), mode);
  return { ...base, size: m ? Number(m[1]) : null, sizeUnit: m ? m[2] : SIZE_UNITS[mode][0] };
}
export function joinContainer(n, unit, size, sizeUnit) {
  if (n === '' || n == null) return '';
  return CONTAINERS.includes(unit) && size ? `${Number(n)} ${unit} (${Number(size)} ${sizeUnit})` : `${Number(n)} ${unit}`;
}
