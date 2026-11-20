// Finding new recipes: TheMealDB (free, by cuisine or meal type) and any recipe page that publishes schema.org Recipe data.
const MEALDB = 'https://www.themealdb.com/api/json/v1/1';

// the cuisines people pick most; TheMealDB "areas" behind each
export const CUISINES = [
  ['American', ['American', 'Canadian']], ['Mexican', ['Mexican']], ['Italian', ['Italian']], ['Chinese', ['Chinese']],
  ['Japanese', ['Japanese']], ['Thai', ['Thai']], ['Indian', ['Indian']], ['Korean', ['South Korean']],
  ['Vietnamese', ['Vietnamese']], ['Filipino', ['Filipino']], ['Mediterranean', ['Greek', 'Turkish', 'Lebanese']],
  ['French', ['French']], ['Spanish', ['Spanish', 'Portuguese']], ['Middle Eastern', ['Egyptian', 'Moroccan', 'Tunisian', 'Syrian', 'Iranian']],
  ['Caribbean', ['Jamaican', 'Cuban', 'Puerto Rican', 'Trinidadian']], ['Latin American', ['Brazilian', 'Peruvian', 'Argentine', 'Colombian', 'Venezuelan']],
  ['British & Irish', ['British', 'Irish']], ['African', ['Kenyan', 'Nigerian', 'Ethiopian', 'South African', 'Ghanaian']],
];
export const MEAL_TYPES = [['Dinner', null], ['Breakfast', 'Breakfast'], ['Vegetarian', 'Vegetarian'], ['Seafood', 'Seafood'], ['Chicken', 'Chicken'], ['Pasta', 'Pasta'], ['Sides', 'Side'], ['Dessert', 'Dessert']];

const STAPLE = /^(salt|pepper|black pepper|water|oil|olive oil|vegetable oil|cooking spray|sugar|flour|ice)$/i;
function sectionOf(name) {
  const s = ' ' + name.toLowerCase().replace(/[^a-z ]+/g, ' ') + ' ';
  const has = (re) => re.test(s);
  if (has(/ (can|canned|jar|sauce|paste|broth|stock|dried|powder|ground (cumin|coriander|ginger|cinnamon|turmeric)|masala|spice|seasoning|vinegar|soy|rice|pasta|noodles?|beans|lentils|flour|sugar|honey|syrup|oats|nuts?) /)) return 'Pantry';
  if (has(/ frozen /)) return 'Frozen';
  if (has(/ (milk|cheese|butter|cream|yogurt|yoghurt|eggs?|parmesan|mozzarella|feta|cheddar) /)) return 'Dairy & Eggs';
  if (has(/ (onions?|garlic|peppers?|tomato(es)?|potato(es)?|carrots?|celery|lettuce|spinach|kale|cabbage|cilantro|coriander leaves|parsley|basil|mint|limes?|lemons?|ginger|chil(l)?i(es)?|mushrooms?|zucchini|squash|avocados?|apples?|bananas?|berries|scallions?|leeks?|cucumbers?|broccoli|cauliflower|shallots?|corn|herbs?|jalapenos?) /)) return 'Produce';
  if (has(/ (chicken|beef|pork|lamb|turkey|sausages?|bacon|ham|steak|mince|fish|salmon|shrimp|prawns?|tuna|cod|crab|mussels|clams|thighs|breasts?) /)) return 'Meat & Seafood';
  if (has(/ (bread|buns?|tortillas?|pitas?|baguette|rolls?) /)) return 'Bakery';
  return 'Pantry';
}
// "1 tablespoon garam masala" → "garam masala": you buy a jar, not a tablespoon
const SMALL = /^[\d\s½¼¾⅓⅔⅛./-]+\s*(teaspoons?|tsp|tablespoons?|tbsp|tbs|cups?|cloves?|pinch(es)?|dash(es)?|sprigs?|handful|stalks?|bunch)\b\.?\s*(of\s+)?/i;
const shopLine = (l) => l.replace(/\s*\((optional|or more|to taste)[^)]*\)/gi, '').replace(SMALL, '').replace(/,\s*(minced|diced|chopped|sliced|cut|peeled|grated|crushed|finely|thinly|to taste|divided|softened|melted)[^,]*$/i, '').trim();
const mealOf = (cat) => /breakfast/i.test(cat) ? 'Breakfast' : /dessert/i.test(cat) ? 'Snack' : /side|starter/i.test(cat) ? 'Side' : 'Dinner';
const splitSteps = (t) => String(t || '').split(/\r?\n+|(?<=\.)\s+(?=STEP|\d+\.)/).map((x) => x.replace(/^\s*(step\s*\d+[:.]?|\d+[.)])\s*/i, '').trim()).filter((x) => x.length > 3);

function toParsed({ title, servings, yieldText, cuisine, when, ing, steps, url, shopping }) {
  return { shopping, recipes: [{ title, servings: servings || 4, yieldText: yieldText || `${servings || 4} servings`, when, fridge: '', freeze: '', ing, steps, tip: '', url, cuisine }] };
}

/** TheMealDB meal → the shape buildImport takes. */
export function fromMealDb(m) {
  const ing = [], shopping = [];
  for (let i = 1; i <= 20; i++) {
    const name = String(m['strIngredient' + i] || '').trim(), meas = String(m['strMeasure' + i] || '').trim();
    if (!name) continue;
    ing.push(`${meas} ${name}`.trim());
    if (!STAPLE.test(name)) shopping.push({ line: shopLine(`${/^\d/.test(meas) ? meas + ' ' : ''}${name}`), section: sectionOf(name) });
  }
  return toParsed({ title: m.strMeal, servings: 4, cuisine: m.strArea, when: mealOf(m.strCategory), ing, steps: splitSteps(m.strInstructions),
    url: m.strSource || `https://www.themealdb.com/meal/${m.idMeal}`, shopping });
}

/** schema.org Recipe (from a recipe page) → the shape buildImport takes. */
export function fromJsonLd(r, url) {
  const ing = (r.recipeIngredient || r.ingredients || []).map((x) => String(x).replace(/\s+/g, ' ').trim()).filter(Boolean);
  const flat = (x) => Array.isArray(x) ? x.flatMap(flat) : x && typeof x === 'object' ? (x.itemListElement ? flat(x.itemListElement) : [x.text || x.name || '']) : [String(x || '')];
  const steps = flat(r.recipeInstructions).flatMap((t) => splitSteps(t.replace(/<[^>]+>/g, ' ')));
  const y = Array.isArray(r.recipeYield) ? r.recipeYield[0] : r.recipeYield;
  const servings = Number(String(y || '').match(/\d+/)?.[0]) || 4;
  const cat = [].concat(r.recipeCategory || []).join(' ');
  const shopping = ing.map(shopLine).filter((l) => l && !STAPLE.test(l.replace(/^[\d\s½¼¾⅓⅔./-]+/, '').trim())).map((line) => ({ line, section: sectionOf(line) }));
  return toParsed({ title: String(r.name || 'Recipe').replace(/&amp;/g, '&'), servings, yieldText: String(y || ''), cuisine: [].concat(r.recipeCuisine || [])[0] || '',
    when: mealOf(cat), ing, steps, url, shopping });
}

const get = (path) => fetch(MEALDB + path).then((r) => { if (!r.ok) throw new Error('The recipe finder is busy — try again in a moment.'); return r.json(); });
/** Recipe ideas for a cuisine and/or meal type: [{id, title, thumb, area}] */
export async function findIdeas({ cuisine, type, search }) {
  let list = [];
  if (search) list = (await get(`/search.php?s=${encodeURIComponent(search)}`)).meals || [];
  else if (cuisine) {
    const areas = (CUISINES.find((c) => c[0] === cuisine) || [cuisine, [cuisine]])[1];
    const lists = await Promise.all(areas.map((a) => get(`/filter.php?a=${encodeURIComponent(a)}`).then((j) => (j.meals || []).map((m) => ({ ...m, strArea: a }))).catch(() => [])));
    list = lists.flat();
    if (type) {   // cross with the meal type
      const t = (await get(`/filter.php?c=${encodeURIComponent(type)}`)).meals || [];
      const ok = new Set(t.map((m) => m.idMeal)); list = list.filter((m) => ok.has(m.idMeal));
    }
  } else if (type) list = (await get(`/filter.php?c=${encodeURIComponent(type)}`)).meals || [];
  return list.map((m) => ({ id: m.idMeal, title: m.strMeal, thumb: m.strMealThumb, area: m.strArea || '' }));
}
export async function mealDetail(id) { const m = (await get(`/lookup.php?i=${id}`)).meals?.[0]; if (!m) throw new Error('That recipe is gone.'); return m; }
