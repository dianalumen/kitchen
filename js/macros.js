// Macro estimates from the foods reference table (M7.3). Pure functions, no state, so
// tests/macros.html can run them on their own.
//
// An ingredient's food is the one picked by hand in R3 (foodId), otherwise the food whose name
// or alias is the longest run of whole words inside the ingredient's name ("Filet z piersi
// kurczaka zagrodowy" → "filet z piersi kurczaka"). Matching ignores case, Polish diacritics and
// punctuation, so "(suszona)" and "suszona" are the same.
//
// Its grams come from, in order: the stored grams (dietitian recipes), the amount in g, dag or
// kg, the amount in ml or l times the food's density, or the amount times the food's grams per
// household unit (szt, łyżka, …; an amount without a unit counts as szt). Salt, spices, herbs
// and water (trace foods) with no usable amount count as nothing; any other ingredient without a
// food or without grams is "no data".
//
// Sections named "Na 5 porcji" or "…, na 5 porcji" hold a batch: their grams are divided by 5.

const WEIGHT = { g: 1, dag: 10, kg: 1000 };
const VOLUME = { ml: 1, l: 1000 };
export const NUTRIENTS = ["kcal", "proteinG", "fatG", "carbsG", "fiberG"];

// "Mielona słodka papryka (suszona), 1,5%" → "mielona slodka papryka suszona 1 5"
export function normName(s) {
  return String(s ?? "").toLowerCase().replace(/ł/g, "l").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

// Index for matching: [{ words: ["filet","z","piersi"], food }], longest first. Built once per
// foods array (cached on the array).
function indexOf(foods) {
  if (foods._index) return foods._index;
  const out = [];
  foods.forEach((food, order) => {
    const seen = new Set();
    for (const a of [food.name, ...(food.aliases || [])]) {
      const k = normName(a);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push({ key: k, words: k.split(" "), food, order });
    }
  });
  out.sort((a, b) => b.words.length - a.words.length || b.key.length - a.key.length || a.order - b.order);
  Object.defineProperty(foods, "_index", { value: out, enumerable: false });
  return out;
}

// Does `needle` occur in `hay` as a run that starts before index `before`?
const runFrom = (hay, needle, before) => {
  for (let i = 0; i < before && i + needle.length <= hay.length; i++) {
    let ok = true;
    for (let j = 0; j < needle.length && ok; j++) ok = hay[i + j] === needle[j];
    if (ok) return true;
  }
  return false;
};

// The food for an ingredient name, or null. The note may make the match longer, as long as the
// run starts in the name: "Dynia" + "pestki łuskane" → pumpkin seeds, not pumpkin.
export function matchFood(name, foods, note = null) {
  const k = normName(name);
  if (!k || !foods || !foods.length) return null;
  const words = k.split(" ");
  const all = note ? words.concat(normName(note).split(" ").filter(Boolean)) : words;
  for (const e of indexOf(foods)) if (runFrom(all, e.words, words.length)) return e.food;
  return null;
}

export function foodFor(ing, foods) {
  if (ing.foodId) {
    const f = foods.find((x) => x.id === ing.foodId);
    if (f) return f;
  }
  return matchFood(ing.name, foods, ing.note);
}

// Grams of an ingredient for this food, or null when unknown.
export function gramsOf(ing, food) {
  if (ing.grams != null && ing.grams > 0) return ing.grams;
  const amount = ing.amount;
  if (amount == null || !(amount > 0)) return null;
  const unit = ing.unit || null;
  if (unit && WEIGHT[unit]) return amount * WEIGHT[unit];
  const units = (food && food.units) || {};
  if (unit && VOLUME[unit]) return units.ml ? amount * VOLUME[unit] * units.ml : null;
  const per = units[unit || "szt"];
  return per ? amount * per : null;
}

// "Na 5 porcji" or "Sos, na 2,5 porcji" → 5 / 2.5; anything else → 1.
export function batchOf(section) {
  const m = /(?:^|,\s*)na\s+(\d+(?:[.,]\d+)?)\s+porcj/i.exec(String(section || ""));
  const n = m ? Number(m[1].replace(",", ".")) : 1;
  return n > 0 ? n : 1;
}

// Estimate for a whole recipe, per serving:
//   { kcal, proteinG, fatG, carbsG, fiberG, missing: [ingredients], counted, total, rows }
// rows: one per ingredient { ing, food, grams, auto } (auto: the food was matched by name).
export function estimateRecipe(recipe, ingredients, foods) {
  const sum = { kcal: 0, proteinG: 0, fatG: 0, carbsG: 0, fiberG: 0 };
  const missing = [], rows = [];
  let counted = 0;
  for (const ing of ingredients) {
    const food = foods && foods.length ? foodFor(ing, foods) : null;
    const grams = food ? gramsOf(ing, food) : null;
    rows.push({ ing, food, grams, auto: !!food && !(ing.foodId && food.id === ing.foodId) });
    if (!food || grams == null) {
      if (food && food.trace) continue; // a pinch of salt: nothing to count, nothing missing
      missing.push(ing);
      continue;
    }
    const k = grams / 100 / batchOf(ing.section);
    sum.kcal += food.kcal * k;
    sum.proteinG += food.proteinG * k;
    sum.fatG += food.fatG * k;
    sum.carbsG += food.carbsG * k;
    sum.fiberG += (food.fiberG || 0) * k;
    counted++;
  }
  const servings = recipe.servings || 1;
  const out = { missing, counted, total: ingredients.length, rows };
  for (const n of NUTRIENTS) out[n] = Math.round(sum[n] / servings * 10) / 10;
  return out;
}
