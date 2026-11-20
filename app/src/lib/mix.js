// "Pick for me": a week of recipes that share ingredients (less to buy, less waste) but still vary
// in protein, cuisine and style from day to day.
const PROTEINS = [['chicken', /chicken/], ['beef', /beef|steak|brisket|mince/], ['pork', /pork|sausage|bacon|ham\b|chorizo/], ['fish', /salmon|fish|cod|tuna|tilapia|halibut/],
  ['shrimp', /shrimp|prawn/], ['turkey', /turkey/], ['lamb', /lamb/], ['tofu', /tofu|tempeh/], ['beans', /bean|lentil|chickpea/], ['egg', /\begg/]];
const STYLES = [['pasta', /pasta|rigatoni|spaghetti|penne|noodle|lasagn|mac/], ['bowl', /bowl|rice|farro|quinoa/], ['soup', /soup|stew|chili|curry/],
  ['bake', /bake|casserole|roast|sheet.?pan/], ['taco', /taco|burrito|enchilada|quesadilla|wrap/], ['salad', /salad/], ['sandwich', /sandwich|burger|slider|sub\b/]];
const tag = (list, text) => (list.find(([, re]) => re.test(text)) || ['other'])[0];
const kindOf = (r) => { const w = String(r?.when || '').toLowerCase(); return /breakfast/.test(w) ? 'breakfast' : /snack|dessert|treat|side/.test(w) ? 'snack' : 'main'; };

/**
 * recipes: saved recipes; need: { breakfast, main, snack } counts; pantryIds: Set of item ids on hand;
 * liked: cuisines; recent: Set of recipe ids used lately. Returns recipe ids.
 */
export function pickMix({ recipes, need, pantryIds = new Set(), liked = [], recent = new Set(), usePantry = false }) {
  const info = recipes.map((r) => {
    const text = `${r.title} ${(r.ing || []).join(' ')}`.toLowerCase();
    return { r, kind: kindOf(r), items: new Set(Object.keys(r.items || {})), protein: tag(PROTEINS, text), style: tag(STYLES, text), cuisine: String(r.cuisine || '').toLowerCase() };
  });
  const likedL = liked.map((c) => c.toLowerCase());
  const chosen = [], pool = new Set();
  const score = (x) => {
    const n = x.items.size || 1;
    const shared = [...x.items].filter((i) => pool.has(i)).length / n;                       // overlap with what's already on the list
    const onHand = usePantry ? [...x.items].filter((i) => pantryIds.has(i)).length / n : 0;  // uses up the pantry
    const same = chosen.filter((c) => c.kind === x.kind);
    const repeat = same.filter((c) => c.protein === x.protein && x.protein !== 'other').length * 0.6
      + same.filter((c) => c.style === x.style && x.style !== 'other').length * 0.45
      + same.filter((c) => c.cuisine && c.cuisine === x.cuisine).length * 0.3;
    const fav = x.cuisine && likedL.some((c) => x.cuisine.includes(c) || c.includes(x.cuisine)) ? 0.25 : 0;
    const fresh = recent.has(x.r.id) ? -0.5 : 0;
    return shared * 1.2 + onHand * 1.5 + fav + fresh - repeat + Math.random() * 0.35;
  };
  for (const kind of ['main', 'breakfast', 'snack']) {
    for (let i = 0; i < (need[kind] || 0); i++) {
      const cands = info.filter((x) => x.kind === kind && !chosen.includes(x));
      if (!cands.length) break;
      const best = cands.map((x) => [x, score(x)]).sort((a, b) => b[1] - a[1])[0][0];
      chosen.push(best); best.items.forEach((id) => pool.add(id));
    }
  }
  return { ids: chosen.map((x) => x.r.id), short: Object.fromEntries(['main', 'breakfast', 'snack'].map((k) => [k, Math.max(0, (need[k] || 0) - chosen.filter((x) => x.kind === k).length)])),
    shared: [...pool].filter((id) => chosen.filter((x) => x.items.has(id)).length > 1).length };
}

/** How many different recipes a week needs: mains so leftovers don't repeat more than ~2 days. */
export function recipesNeeded(shape, people, recipes) {
  const days = shape.to - shape.from + 1;
  const mainMeals = days * shape.meals.filter((m) => m !== 'breakfast').length;
  const avgServ = (() => { const v = recipes.filter((r) => kindOf(r) === 'main').map((r) => Number(r.servings) || 4); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 4; })();
  const mealsPerRecipe = Math.max(1, Math.min(3, Math.round(avgServ / Math.max(1, people))));
  return { main: Math.max(1, Math.min(6, Math.ceil(mainMeals / Math.max(mealsPerRecipe, 2)))), breakfast: shape.meals.includes('breakfast') ? 1 : 0, snack: shape.snack ? 1 : 0 };
}
