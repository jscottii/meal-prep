// Cook day: scaled measurements, knife prep (how to cut what), seasonings, and a step-by-step order.

const FR = [[0, ''], [0.125, '⅛'], [0.25, '¼'], [1 / 3, '⅓'], [0.5, '½'], [2 / 3, '⅔'], [0.75, '¾'], [1, '']];
const UNI = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875 };
const NUM = '(?:\\d+\\s*[½¼¾⅓⅔⅛⅜⅝⅞]|\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d*\\.\\d+|\\d+|[½¼¾⅓⅔⅛⅜⅝⅞])';
const UNITS = 'cups?|c\\.|tablespoons?|tbsps?|tbs|teaspoons?|tsps?|pounds?|lbs?|ounces?|oz|grams?|g|kg|ml|liters?|quarts?|qts?|pints?|cans?|jars?|cloves?|sticks?|slices?|stalks?|sprigs?|bunch(?:es)?|heads?|bulbs?|pinch(?:es)?|dash(?:es)?|handfuls?|large|medium|small|packages?|bags?|blocks?|links?';

export function parseNum(s) {
  s = String(s).trim();
  let m = s.match(/^(\d+)\s*([½¼¾⅓⅔⅛⅜⅝⅞])$/); if (m) return +m[1] + UNI[m[2]];
  m = s.match(/^(\d+)\s+(\d+)\/(\d+)$/); if (m) return +m[1] + m[2] / m[3];
  m = s.match(/^(\d+)\/(\d+)$/); if (m) return m[1] / m[2];
  if (UNI[s] != null) return UNI[s];
  return Number(s);
}

/** 1.5 → "1½", 0.33 → "⅓", 2.4 → "2½" (kitchen-friendly rounding). */
export function fmtNum(x) {
  if (!isFinite(x)) return '';
  if (x >= 10) return String(Math.round(x));
  let whole = Math.floor(x), f = x - whole, best = FR[0];
  FR.forEach((p) => { if (Math.abs(p[0] - f) < Math.abs(best[0] - f)) best = p; });
  if (best[0] === 1) { whole += 1; best = FR[0]; }
  return (whole ? String(whole) : '') + best[1] || '0';
}

/** Tidy up big spoon amounts: 3 tsp → 1 tbsp, 4 tbsp → ¼ cup. */
function tidy(x, unit) {
  const u = unit.toLowerCase();
  if (/^(tbsp|tablespoon|tbs)/.test(u) && x < 1) return [x * 3, 'tsp'];
  if (/^cups?$/.test(u) && x < 0.25) return [x * 16, 'tbsp'];
  if (/^(tsp|teaspoon)/.test(u) && x >= 3 && Math.abs(x / 3 * 4 - Math.round(x / 3 * 4)) < 0.01) return [x / 3, 'tbsp'];
  if (/^(tbsp|tablespoon|tbs)/.test(u) && x >= 4 && Math.abs(x / 16 * 12 - Math.round(x / 16 * 12)) < 0.01) return [x / 16, x / 16 > 1 ? 'cups' : 'cup'];
  return [x, unit];
}

const SING = /^(cup|can|clove|stalk|bulb|head|slice|stick|sprig|jar|package|bag|block|link|lime|lemon|orange|carrot|onion|egg|jalapeño|jalapeno|potato|tomato|zucchini|apple|pear|bunch|pinch|dash|handful|shallot|avocado|pepper|leek|pound)$/i;
function plural(w, x) {
  if (!(x > 1)) { const one = w.replace(/(ch|sh)es$/i, '$1').replace(/(potato|tomato)es$/i, '$1').replace(/s$/i, ''); return one !== w && SING.test(one) ? one : w; }
  if (!SING.test(w)) return w;
  if (/(ch|sh|sh)$/i.test(w)) return w + 'es';
  if (/(o)$/i.test(w) && /potato|tomato/i.test(w)) return w + 'es';
  if (/zucchini/i.test(w)) return w;
  return w + 's';
}
/** "2 lime" → "2 limes" for the first word after an amount. */
function fixNext(rest, x) { return rest.replace(/^(\s+(?:more\s+|large\s+|medium\s+|small\s+)?)([A-Za-zñ]+)/, (a, sp, w) => sp + plural(w, x)); }
function scaleOne(numStr, unit, k) {
  let x = parseNum(numStr) * k;
  let u = unit || '';
  if (u) [x, u] = tidy(x, u);
  return fmtNum(x) + (u ? ' ' + plural(u, x) : '');
}

function scaleInline(text, k) {
  const re = new RegExp(`(^|[^\\d/.])(${NUM})\\s+(cups?|tablespoons?|tbsps?|teaspoons?|tsps?|pounds?|lbs?|ounces?|oz|cloves?)\\b`, 'gi');
  return text.replace(re, (all, pre, n, u) => pre + scaleOne(n, u, k));
}
function scaleParens(rest, k) {
  return rest.replace(/\(([^)]*)\)/g, (all, inner) => /\b(?:oz|ounces?|lb|g|ml|inch|in\.)\b|-inch/i.test(inner) ? all
    : '(' + inner.replace(new RegExp(`(^|[\\s,])(${NUM})(?=\\s)`, 'g'), (a, pre, n) => pre + fmtNum(parseNum(n) * k)) + ')');
}

/**
 * Scale the amount at the start of an ingredient line ("1½ cups flour", "¾ to 1 cup milk",
 * "Zest and juice of 2 limes", "Pinch of salt"). Lines with no amount are returned unchanged.
 */
export function scaleLine(line, k) {
  line = String(line);
  if (!k || k === 1 || /:$/.test(line.trim())) return line;
  const range = new RegExp(`^(${NUM})\\s*(?:to|-|–)\\s*(${NUM})\\s+(${UNITS})\\b`, 'i');
  let m = line.match(range);
  if (m) return `${fmtNum(parseNum(m[1]) * k)} to ${scaleOne(m[2], m[3], k)}` + line.slice(m[0].length);
  m = line.match(new RegExp(`^(${NUM})(\\s+(?:${UNITS})\\b)?`, 'i'));
  if (m) {
    const unit = (m[2] || '').trim(), x = parseNum(m[1]) * k;
    let rest = scaleParens(line.slice(m[0].length), k);
    if (/\s—\s|\+/.test(rest)) rest = scaleInline(rest, k);
    return scaleOne(m[1], unit, k) + (unit ? rest : fixNext(rest, x));
  }
  m = line.match(new RegExp(`^((?:zest|juice|zest and juice) of\\s+)(${NUM})\\b`, 'i'));
  if (m) { const x = parseNum(m[2]) * k; return m[1] + fmtNum(x) + fixNext(line.slice(m[0].length), x); }
  m = line.match(/^(a\s+)?pinch\b/i);
  if (m && k >= 1.5) return `${Math.round(k)} pinches` + line.slice(m[0].length);
  return line;
}

/** Scale amounts written inside a step ("stir in ½ cup parmesan"). Returns HTML with scaled amounts in bold. */
export function scaleStepHtml(text, k) {
  const esc = String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  if (!k || k === 1) return esc;
  const re = new RegExp(`(^|[^\\d/.])(${NUM})\\s+(cups?|tablespoons?|tbsps?|teaspoons?|tsps?|pounds?|lbs?|ounces?|oz|cloves?)\\b`, 'gi');
  return esc.replace(re, (all, pre, n, u) => `${pre}<b>${scaleOne(n, u, k)}</b>`);
}

/* ---------------- knife prep ---------------- */
const CUTS = [
  { re: /\bfinely (?:diced|chopped)\b/i, key: 'fine', name: 'Fine dice', how: 'About ¼-inch pieces. Cut into thin planks, then thin sticks, then across into tiny cubes.' },
  { re: /\bminced\b/i, key: 'mince', name: 'Mince', how: 'As small as you can get it. Smash garlic with the flat of the knife first, then rock the blade back and forth over the pile.' },
  { re: /\bdiced\b/i, key: 'dice', name: 'Dice', how: 'About ½-inch cubes. Cut into ½-inch planks, then ½-inch sticks, then across. Even pieces cook evenly.' },
  { re: /\bcut into ([^,;(]+?(?:pieces|cubes|chunks|strips|wedges|rounds|florets))/i, key: 'cutinto', name: 'Cut to size', how: 'Cut to the size listed so everything cooks in the same time.' },
  { re: /\b(?:cubed|cut into cubes)\b/i, key: 'cube', name: 'Cube', how: 'About ½-inch cubes. For butter: cut it straight from the fridge and put it back in the fridge until you need it.' },
  { re: /\b(?:ribboned|chiffonade|cut into ribbons)\b/i, key: 'ribbon', name: 'Ribbons', how: 'Strip the leaves off the stems, stack them, roll up tight like a cigar and slice thin across the roll.' },
  { re: /\b(?:julienned|matchsticks?)\b/i, key: 'julienne', name: 'Matchsticks', how: 'Slice into ⅛-inch planks, stack a few, then cut into ⅛-inch sticks.' },
  { re: /\bthinly sliced\b/i, key: 'thin', name: 'Slice thin', how: 'About ⅛ inch, nearly see-through. Keep your fingertips curled under on the hand holding the food.' },
  { re: /\bsliced\b/i, key: 'slice', name: 'Slice', how: 'About ¼-inch slices.' },
  { re: /\b(?:roughly )?chopped\b/i, key: 'chop', name: 'Chop', how: 'Rough ½-inch pieces; they don’t need to be even. For fresh herbs: pick the leaves, bunch them up, and chop through a few times.' },
  { re: /\bstems? removed\b/i, key: 'stem', name: 'Stem', how: 'Hold the stem and pull the leaves off with your other hand, then chop the leaves.' },
  { re: /\b(?:halved|quartered|cut in half)\b/i, key: 'halve', name: 'Halve / quarter', how: 'Cut in half (or quarters) through the middle.' },
  { re: /\b(?:grated|shredded)\b/i, key: 'grate', name: 'Grate', how: 'Large holes of a box grater (skip it if you bought it already shredded). Parmesan and ginger: fine holes or a microplane.' },
  { re: /\bzest\b/i, key: 'zest', name: 'Zest, then juice', how: 'Zest first: rub the fruit over a microplane, only the colored skin. Then roll it on the counter, cut in half and squeeze over your hand to catch seeds.' },
  { re: /\bjuice(?:d)? of\b/i, key: 'juice', name: 'Juice', how: 'Roll it on the counter, cut in half and squeeze over your hand to catch the seeds.' },
  { re: /\bpeeled\b/i, key: 'peel', name: 'Peel', how: 'Peel with a vegetable peeler before cutting.' }
];
const SETUP = [
  { re: /\bsoftened\b/i, what: 'Take out to soften (about 1 hour before)' },
  { re: /\b(?:at )?room temperature\b/i, what: 'Take out to come to room temperature' },
  { re: /\bthawed\b/i, what: 'Thaw ahead (overnight in the fridge)' },
  { re: /\b(?:cans?|beans?|chickpeas?|lentils?)\b.*\b(?:drained|rinsed)\b|\bdrained\b/i, what: 'Open cans, drain and rinse in a colander' },
  { re: /\b(?:rice|quinoa|farro|barley|grains?)\b.*\brinsed\b/i, what: 'Rinse in a sieve until the water runs mostly clear' }
];

/** Strip the prep words off a line, leaving the amount + ingredient ("3 celery stalks"). */
function amountPart(line) {
  return String(line).replace(/,?\s*(?:then|plus)\b.*$/i, '').replace(/\s*\((?!\d)[^)]*\)/g, '').split(',')[0].replace(/\b(?:finely|thinly|roughly)\s+(?:diced|chopped|sliced)\s+/i, '').replace(/\b(?:chopped|diced|minced|sliced|grated|shredded)\s+(?=fresh|\w)/i, '').trim();
}

const SPICE = /\b(salt|pepper(?:corns)?|cumin|paprika|chili powder|chile powder|cayenne|oregano|thyme|basil|rosemary|sage|dill|tarragon|marjoram|cinnamon|nutmeg|allspice|cloves|ginger|turmeric|curry|coriander|cardamom|garam masala|five[- ]spice|italian seasoning|herbes|za'?atar|sumac|red pepper flakes|chili flakes|bay leaf|bay leaves|fennel seeds?|mustard seeds?|dry mustard|mustard powder|garlic powder|onion powder|vanilla|baking powder|baking soda|seasoning|spice|everything bagel|old bay|cajun|taco|ranch seasoning|msg|bouillon)\b/i;
const NOT_SPICE = /\b(fresh|chopped|leaves|sprig|bunch|bell pepper|peppers\b|jalape|red pepper\b(?! flakes)|sweet pepper|ginger root|grated ginger|frank|hot sauce|sauce)\b/i;

/**
 * recipes: [{ id, title, ing:[], steps:[] }], k: { id: batches }
 * Returns { knife: [{ key, name, how, items:[{ text, cut, recipe }] }], spices: [{ recipe, items:[text] }], setup: [{ what, items:[{text, recipe}] }] }
 */
export function prepLists(recipes, k) {
  const knife = {}, setup = {}, spices = [];
  recipes.forEach((r) => {
    const kk = k[r.id] || 1, sp = [];
    (r.ing || []).forEach((raw) => {
      const line = String(raw).trim();
      if (!line || /:$/.test(line) || /\bfor serving\b/i.test(line) && !/\b(?:diced|chopped|sliced|minced)\b/i.test(line)) return;
      const scaled = scaleLine(line, kk);
      const lab = line.match(/^([A-Za-z0-9 ]{2,24}):\s/);
      const combined = /\+|\s—\s|\sor\s\d/.test(line) || (lab && !/rub|spice|season/i.test(lab[1]));
      if (!combined && SPICE.test(line) && !NOT_SPICE.test(line)) { sp.push(scaled); return; }
      const cooked = /\b(chicken|pork|beef|turkey|brisket|lamb)\b/i.test(line) && /\bshredded\b/i.test(line);
      const c = cooked ? null : CUTS.find((x) => x.re.test(line));
      if (c) {
        const extra = c.key === 'cutinto' ? line.match(c.re)[1] : '';
        (knife[c.key] = knife[c.key] || { key: c.key, name: c.name, how: c.how, items: [] }).items.push({ text: c.key === 'zest' || c.key === 'juice' ? scaled : amountPart(scaled), cut: extra, recipe: r.title });
      }
      const s = SETUP.find((x) => x.re.test(line));
      if (s) (setup[s.what] = setup[s.what] || { what: s.what, items: [] }).items.push({ text: amountPart(scaled), recipe: r.title });
    });
    if (sp.length) spices.push({ recipe: r.title, id: r.id, items: sp });
  });
  const order = CUTS.map((c) => c.key);
  return { knife: Object.values(knife).sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key)), spices, setup: Object.values(setup) };
}

/* ---------------- step-by-step order ---------------- */
/** Minutes a recipe spends cooking (hands-off time), from "1 hr 15 min", "25 minutes" in its steps. */
export function cookMinutes(r) {
  let t = 0;
  (r.steps || []).forEach((s) => {
    const str = String(s);
    const h = str.match(/(\d+(?:\.\d+)?)\s*(?:hrs?|hours?)\b/i), m = str.match(/(\d+)\s*(?:min|minutes)\b/i);
    t += (h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0);
  });
  return t;
}

const STOP = new Set(['with', 'and', 'the', 'bowl', 'bowls', 'bake', 'baked', 'jars', 'bars', 'salad', 'easy', 'one', 'pan', 'sheet', 'loaded', 'style', 'honey', 'butter', 'cheese', 'cheesy', 'creamy', 'spiced', 'fresh', 'quick', 'chicken']);
const keyWords = (t) => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z]+/).filter((w) => w.length >= 4 && !STOP.has(w));
/** Which of the week's recipes a game-plan step is about. */
export function recipesInStep(text, recipes) {
  if (/^\s*(?:chop|cut|prep|dice|slice|wash|set up|get out|preheat)\b|\b(?:chop|cut|prep) everything\b/i.test(text)) return [];
  const t = String(text).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return recipes.filter((r) => keyWords(r.title).some((w) => new RegExp(`\\b${w.replace(/s$/, '')}`).test(t)));
}
