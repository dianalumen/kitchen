// Recipe data helpers shared by the grid (R1), the recipe view (R2), the editor (R3) and cooking
// mode (R4): the have/missing rule, scaling, saving a recipe with its ingredients and steps as one
// optimistic write, delete with undo, "add missing to the list", and photos (resize + Storage).
import { t } from "./i18n.js";
import { toast, undoToast } from "./ui.js";
import { state, byId, putLocal, dropLocal, optimistic, getBackend, newId, deleteRows, updateRows } from "./store.js";
import { nameKey } from "./parse.js";
import { addToList, guessCategory } from "./views/list.js";

export const MEALS = ["breakfast", "lunch", "dinner", "snack"];
const GLYPHS = { breakfast: "cup", lunch: "pot", dinner: "bowl", snack: "veg" };
export const mealGlyph = (m) => GLYPHS[m] || "bowl";

// ---------------------------------------------------------------------------
// Have / missing. The rule must match add_recipe_to_list in schema.sql: a pantry item with the
// same name_key that is not low and whose amount is unknown or above 0.
// ---------------------------------------------------------------------------
export function haveIt(key) {
  return state.pantry.some((p) => (p.nameKey || nameKey(p.name)) === key && !p.low && (p.amount == null || p.amount > 0));
}
// On the shopping list and not bought yet.
export function onList(key) {
  return state.shopping.some((s) => !s.checked && nameKey(s.name) === key);
}

const byPos = (a, b) => a.position - b.position || String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
export const ingredientsOf = (id) => state.ingredients.filter((i) => i.recipeId === id).sort(byPos);
export const stepsOf = (id) => state.steps.filter((s) => s.recipeId === id).sort(byPos);

export function recipeStats(r) {
  const ings = ingredientsOf(r.id);
  const have = ings.filter((i) => haveIt(i.nameKey || nameKey(i.name)));
  return { total: ings.length, have: have.length, ings };
}

export const totalMinutes = (r) => (r.prepMinutes || 0) + (r.cookMinutes || 0);

// "Obiad, 30 min, 3/6" (the count only where asked).
export function metaLine(r, withCount) {
  const parts = [];
  if (r.mealType) parts.push(t("meal_" + r.mealType));
  const mins = totalMinutes(r);
  if (mins) parts.push(t("minutes", { n: mins }));
  if (withCount) { const s = recipeStats(r); if (s.total) parts.push(s.have + "/" + s.total); }
  return parts.join(", ");
}

// Amount for `servings` portions, rounded to 0.01 like the RPC.
export function scaled(amount, r, servings) {
  if (amount == null) return null;
  const base = r.servings || 1;
  return Math.round(amount * (servings || base) / base * 100) / 100 || null;
}

// ---------------------------------------------------------------------------
// R2 dock: "Dodaj N do listy" puts the ingredients the pantry lacks on the list (through
// addToList, so names already there are not duplicated). Ingredients already on the list are left
// alone, so a second tap never doubles the amounts.
// ---------------------------------------------------------------------------
export function missingToAdd(r) {
  return ingredientsOf(r.id).filter((i) => { const k = i.nameKey || nameKey(i.name); return !haveIt(k) && !onList(k); });
}

export function addMissingToList(r, servings) {
  const todo = missingToAdd(r);
  if (!todo.length) return 0;
  const added = [], back = [];
  for (const i of todo) {
    const amount = scaled(i.amount, r, servings);
    const res = addToList({ name: i.name, amount, unit: amount != null ? i.unit : null, categoryId: guessCategory(i.name), recipeId: r.id });
    if (!res) continue;
    if (res.status === "new" && res.id) added.push(res.id);
    if (res.status === "back") back.push(res.id);
  }
  undoToast(t("recipe_added", { n: todo.length }), () => {
    if (added.length) deleteRows("shopping", added);
    if (back.length) updateRows("shopping", back, { checked: true });
  });
  return todo.length;
}

// ---------------------------------------------------------------------------
// Save: the recipe, its ingredients and its steps in one optimistic write. Only rows that changed
// are sent; removed rows are deleted. A new photo is uploaded first (inside the same write, so an
// offline save retries the upload too); the replaced photo is removed once the save is through.
// ---------------------------------------------------------------------------
const RECIPE_FIELDS = ["title", "mealType", "servings", "prepMinutes", "cookMinutes", "imagePath", "sourceUrl", "description", "notes"];
const ING_FIELDS = ["position", "name", "amount", "unit", "note", "section"];
const STEP_FIELDS = ["position", "text", "timerMinutes"];
const same = (a, b, fields) => fields.every((f) => (a[f] ?? null) === (b[f] ?? null));

export function saveRecipe({ recipe, ingredients, steps, photo = null, oldImagePath = null }) {
  const now = new Date().toISOString();
  const beforeR = byId("recipes", recipe.id) || null;
  const beforeI = ingredientsOf(recipe.id);
  const beforeS = stepsOf(recipe.id);

  const rec = { tags: [], favorite: false, createdAt: now, ...(beforeR || {}), ...recipe };
  const ings = ingredients.map((x, i) => {
    const old = x.id ? beforeI.find((b) => b.id === x.id) : null;
    return { ...(old || { id: newId(), createdAt: now }), recipeId: recipe.id, position: i + 1, name: x.name, nameKey: nameKey(x.name),
      amount: x.amount ?? null, unit: x.unit || null, note: x.note || null, section: x.section || null };
  });
  const sts = steps.map((x, i) => {
    const old = x.id ? beforeS.find((b) => b.id === x.id) : null;
    return { ...(old || { id: newId(), createdAt: now }), recipeId: recipe.id, position: i + 1, text: x.text, timerMinutes: x.timerMinutes || null };
  });

  const recipeChanged = !beforeR || !same(beforeR, rec, RECIPE_FIELDS);
  const ingsChanged = ings.filter((r) => { const b = beforeI.find((x) => x.id === r.id); return !b || !same(b, r, ING_FIELDS); });
  const stepsChanged = sts.filter((r) => { const b = beforeS.find((x) => x.id === r.id); return !b || !same(b, r, STEP_FIELDS); });
  const removeIngredients = beforeI.filter((b) => !ings.some((r) => r.id === b.id)).map((b) => b.id);
  const removeSteps = beforeS.filter((b) => !sts.some((r) => r.id === b.id)).map((b) => b.id);
  if (!recipeChanged && !ingsChanged.length && !stepsChanged.length && !removeIngredients.length && !removeSteps.length) return Promise.resolve(true);

  const B = getBackend();
  return optimistic({
    ids: [rec.id, ...ingsChanged.map((r) => r.id), ...stepsChanged.map((r) => r.id), ...removeIngredients, ...removeSteps],
    what: "recipes",
    apply: () => {
      putLocal("recipes", rec);
      removeIngredients.forEach((id) => dropLocal("ingredients", id));
      removeSteps.forEach((id) => dropLocal("steps", id));
      ingsChanged.forEach((r) => putLocal("ingredients", r));
      stepsChanged.forEach((r) => putLocal("steps", r));
    },
    save: async () => {
      if (photo && !photo.done) { await B.uploadImage(photo.path, photo.blob); photo.done = true; }
      return B.saveRecipe({ recipe: recipeChanged ? rec : null, ingredients: ingsChanged, steps: stepsChanged, removeIngredients, removeSteps });
    },
    onSaved: (res) => {
      if (res.recipe) putLocal("recipes", res.recipe);
      (res.ingredients || []).forEach((r) => putLocal("ingredients", r));
      (res.steps || []).forEach((r) => putLocal("steps", r));
      if (oldImagePath && oldImagePath !== rec.imagePath) removePhoto(oldImagePath);
    },
    rollback: () => {
      if (beforeR) putLocal("recipes", beforeR); else dropLocal("recipes", rec.id);
      ingsChanged.forEach((r) => dropLocal("ingredients", r.id));
      stepsChanged.forEach((r) => dropLocal("steps", r.id));
      beforeI.forEach((r) => putLocal("ingredients", r));
      beforeS.forEach((r) => putLocal("steps", r));
    }
  });
}

// Delete with undo. The database removes ingredients and steps with the recipe (on delete
// cascade); undo writes all three back with their ids. The photo file is removed only after the
// undo window, if the recipe is still gone.
export async function deleteRecipe(id) {
  const r = byId("recipes", id);
  if (!r) return null;
  const ings = ingredientsOf(id), sts = stepsOf(id);
  const B = getBackend();
  const putBack = () => { putLocal("recipes", r); ings.forEach((x) => putLocal("ingredients", x)); sts.forEach((x) => putLocal("steps", x)); };
  const ok = await optimistic({
    ids: [id, ...ings.map((x) => x.id), ...sts.map((x) => x.id)],
    what: "recipes",
    apply: () => { dropLocal("recipes", id); ings.forEach((x) => dropLocal("ingredients", x.id)); sts.forEach((x) => dropLocal("steps", x.id)); },
    save: () => B.remove("recipes", id),
    rollback: putBack
  });
  if (!ok) return ok;
  undoToast(t("toast_deleted", { name: r.title }), () => optimistic({
    ids: [id, ...ings.map((x) => x.id), ...sts.map((x) => x.id)],
    what: "recipes",
    apply: putBack,
    save: () => B.saveRecipe({ recipe: r, ingredients: ings, steps: sts }),
    rollback: () => { dropLocal("recipes", id); ings.forEach((x) => dropLocal("ingredients", x.id)); sts.forEach((x) => dropLocal("steps", x.id)); }
  }));
  if (r.imagePath) setTimeout(() => { if (!byId("recipes", id)) removePhoto(r.imagePath); }, 6500);
  return ok;
}

// ---------------------------------------------------------------------------
// Photos. Resized in the browser (long side 1600 px, JPEG) so phone photos don't eat the Storage
// quota; stored at "<household_id>/<timestamp>-<random>.jpg". Photos picked on this device are
// shown from memory, so they appear before (and without) the upload.
// ---------------------------------------------------------------------------
const local = new Map(); // path → object URL

export function photoUrl(path) {
  if (!path) return null;
  if (local.has(path)) return local.get(path);
  const B = getBackend();
  return B && B.imageUrl ? B.imageUrl(path) : null;
}

export function newPhotoPath() {
  const rand = Math.random().toString(36).slice(2, 8);
  return state.household.id + "/" + Date.now() + "-" + rand + ".jpg";
}

export function keepLocal(path, blob) { local.set(path, URL.createObjectURL(blob)); }

export function removePhoto(path) {
  const B = getBackend();
  if (!path || !B || !B.removeImage) return;
  B.removeImage(path).catch((e) => console.warn("Photo not removed", e));
}

export async function resizeImage(file, max = 1600, quality = 0.82) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode(); // modern browsers apply the EXIF orientation to <img>
    const w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) throw new Error("empty image");
    const k = Math.min(1, max / Math.max(w, h));
    const c = document.createElement("canvas");
    c.width = Math.round(w * k);
    c.height = Math.round(h * k);
    const ctx = c.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise((res) => c.toBlob(res, "image/jpeg", quality));
    if (!blob) throw new Error("toBlob failed");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function photoError() { toast(t("recipe_photo_err")); }

// ---------------------------------------------------------------------------
// R4: which ingredients a step mentions. Polish words change their ending ("cukinia" →
// "cukinię"), so the first two words of the name are matched by their stem.
// ---------------------------------------------------------------------------
// "mąka" → "mąk" (finds "mąkę"), "cukinia" → "cukin"; matched at the start of a word in the step.
// The second word counts only after a short first one ("ser feta"), not for "pestki dyni".
const stem = (w) => (w.length <= 3 ? w : w.slice(0, w.length <= 5 ? w.length - 1 : w.length - 2));
const words = (s) => String(s || "").toLowerCase().split(/[^\p{L}\d]+/u).filter(Boolean);
export function stepIngredients(step, ings) {
  const text = words(step.text);
  return ings.filter((i) => {
    const [a, b] = words(i.name);
    const keys = a && a.length <= 3 && b && b.length >= 4 ? [a, b] : a && a.length >= 3 ? [a] : [];
    return keys.some((w) => text.some((x) => x.startsWith(stem(w))));
  });
}
