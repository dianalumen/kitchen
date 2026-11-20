// Recipes R1 and R2.
// R1: 2-column card grid with search (title or ingredient) and meal-type chips; each card shows the
// photo or the accent tile with a meal-type glyph, and "Obiad, 30 min, 3/6".
// R2: the recipe view: photo hero with back and edit, servings stepper that scales the amounts,
// ingredients marked have/missing by icon (from the pantry), steps, and the dock with
// "Dodaj N do listy" and "Gotuj" (R4, js/views/cook.js). The editor (R3) is js/recipe-editor.js.
//
// Repaints are keyed (grid cards) or compared by markup (R2 blocks), so a realtime event only
// touches what changed and the search field keeps focus.
import { t, fmtAmount } from "../i18n.js";
import { esc, icon, sync } from "../ui.js";
import { state, byId } from "../store.js";
import { header, setEyebrow, settingsButton, registerView, go, on } from "../shell.js";
import { nameKey } from "../parse.js";
import {
  MEALS, mealGlyph, haveIt, onList, stepsOf, recipeStats, metaLine, scaled, missingToAdd, addMissingToList, photoUrl,
  DIET_TAG, isDietitian, recipeMacros, scaleMacros
} from "../recipes-data.js";
import { openEditor } from "../recipe-editor.js";

const collator = new Intl.Collator("pl");
let meal = "";
let diet = false; // the Dietetyk chip, on top of the meal type
let query = "";

// Photo with the glyph tile behind it; a photo that fails to load (offline) is removed, so the
// tile shows instead.
export function photoHtml(r, cls = "") {
  const url = photoUrl(r.imagePath);
  return icon(mealGlyph(r.mealType), cls) + (url ? '<img src="' + esc(url) + '" alt="" loading="lazy" decoding="async">' : "");
}
function dropBrokenImages(root) {
  root.addEventListener("error", (e) => { if (e.target.tagName === "IMG") e.target.remove(); }, true);
}

// ---------------------------------------------------------------- R1 grid
function mountGrid(root) {
  root.innerHTML =
    header({
      eyebrow: t("recipes_count", { n: state.recipes.length }), title: t("recipes_title"),
      buttons: [{ act: "recipe-new", icon: "plus", label: t("recipe_new") }, settingsButton()]
    }) +
    '<label class="note" data-hide-tabbar>' + icon("search") + '<input type="search" data-search placeholder="' + esc(t("recipes_search")) + '" aria-label="' + esc(t("recipes_search")) +
    '" enterkeyhint="search" autocomplete="off" value="' + esc(query) + '"></label>' +
    '<div class="chips" data-chips role="group" aria-label="' + esc(t("recipe_meal")) + '"></div><div class="grid" data-body></div>';
  root.querySelector("[data-search]").addEventListener("input", (e) => { query = e.target.value; paintGrid(root); });
  root.querySelector("[data-chips]").addEventListener("click", (e) => {
    const b = e.target.closest("[data-meal]");
    if (b) { meal = b.dataset.meal; if (!meal) diet = false; paintGrid(root); }
    if (e.target.closest("[data-diet]")) { diet = !diet; paintGrid(root); }
  });
  dropBrokenImages(root);
  paintGrid(root);
}

function matches(r, q) {
  if (!q) return true;
  if (nameKey(r.title).includes(q)) return true;
  return state.ingredients.some((i) => i.recipeId === r.id && (i.nameKey || nameKey(i.name)).includes(q));
}

function cardHtml(r) {
  return '<button type="button" class="rcard" data-k="' + esc(r.id) + '" data-act="open-recipe" data-id="' + esc(r.id) + '">' +
    '<span class="ph">' + photoHtml(r) + "</span><b>" + esc(r.title) + "</b><span>" + esc(metaLine(r, true)) + "</span></button>";
}

function paintGrid(root) {
  const body = root.querySelector("[data-body]");
  if (!body) return;
  // Chips: Wszystkie, Śniadanie, Obiad, Kolacja; Przekąska only when a recipe has it.
  const meals = MEALS.filter((m) => m !== "snack" || state.recipes.some((r) => r.mealType === "snack"));
  if (meal && !meals.includes(meal)) meal = "";
  // Dietetyk: a toggle next to the meal chips, only when some recipe carries the tag.
  const hasDiet = state.recipes.some(isDietitian);
  if (!hasDiet) diet = false;
  const chips = root.querySelector("[data-chips]");
  const sig = meals.join() + (hasDiet ? ",diet" : "");
  if (chips._s !== sig) {
    chips._s = sig;
    chips.innerHTML = ["", ...meals].map((m) =>
      '<button type="button" class="chip" data-meal="' + m + '" aria-pressed="false">' + esc(t(m ? "meal_" + m : "recipes_all")) + "</button>").join("") +
      (hasDiet ? '<button type="button" class="chip" data-diet aria-pressed="false">' + esc(DIET_TAG) + "</button>" : "");
  }
  chips.querySelectorAll("[data-meal]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.meal === meal && (meal !== "" || !diet))));
  const dietChip = chips.querySelector("[data-diet]");
  if (dietChip) dietChip.setAttribute("aria-pressed", String(diet));

  const q = nameKey(query);
  const list = state.recipes.filter((r) => (!meal || r.mealType === meal) && (!diet || isDietitian(r)) && matches(r, q))
    .sort((a, b) => collator.compare(a.title, b.title));
  body.classList.toggle("is-empty", !list.length);
  if (list.length) { sync(body, list.map((r) => ({ key: r.id, html: cardHtml(r) }))); return; }
  let html;
  if (q) html = '<div class="empty" data-k="empty"><span class="ic">' + icon("search") + "</span><b>" + esc(t("recipes_none", { q: query.trim() })) + "</b><span>" + esc(t("recipes_zero")) + "</span></div>";
  else if (state.recipes.length) html = '<div class="empty" data-k="empty"><span class="ic">' + icon("book") + "</span><b>" + esc(t("pantry_nothing")) + "</b></div>";
  else html = '<div class="empty" data-k="empty"><span class="ic">' + icon("book") + "</span><b>" + esc(t("recipes_empty_title")) + "</b><span>" + esc(t("recipes_empty_tip")) +
    '</span><button type="button" class="btn black" data-act="recipe-new">' + icon("plus") + esc(t("recipe_new")) + "</button></div>";
  sync(body, [{ key: "empty", html }]);
}

registerView("recipes", {
  tab: true,
  mount: mountGrid,
  update(root) { setEyebrow(root, t("recipes_count", { n: state.recipes.length })); paintGrid(root); }
});

// ---------------------------------------------------------------- R2 recipe view
let cur = { id: null, servings: 2 };

const setHtml = (el, html) => { if (el && el._h !== html) { el._h = html; el.innerHTML = html; } };

function mountRecipe(root, [id]) {
  const r = byId("recipes", id);
  if (!r) { location.replace("#recipes"); return; }
  if (cur.id !== id) cur = { id, servings: r.servings || 2 };
  root.innerHTML =
    '<div class="photo" data-photo></div>' +
    '<div data-head></div>' +
    '<div data-macros></div>' +
    '<div class="serv"><span class="lbl" id="r-serv">' + esc(t("recipe_servings")) + "</span>" +
    '<div class="step sm" role="group" aria-labelledby="r-serv"><button type="button" class="round" data-serv="-1" aria-label="' + esc(t("recipe_fewer")) + '">' + icon("minus") + "</button>" +
    '<span class="v" data-servings aria-live="polite"></span>' +
    '<button type="button" class="round" data-serv="1" aria-label="' + esc(t("recipe_more")) + '">' + icon("plus") + "</button></div></div>" +
    '<div data-ings></div><div data-steps></div><div data-notes></div><div data-src></div>' +
    '<div class="dock" data-dock></div>';
  root.querySelector(".serv").addEventListener("click", (e) => {
    const b = e.target.closest("[data-serv]");
    if (!b) return;
    const n = Math.min(100, Math.max(1, cur.servings + Number(b.dataset.serv)));
    if (n === cur.servings) return;
    cur.servings = n;
    paintRecipe(root);
  });
  dropBrokenImages(root);
  paintRecipe(root);
}

function paintRecipe(root) {
  const r = byId("recipes", cur.id);
  if (!r) { location.replace("#recipes"); return; }
  const url = photoUrl(r.imagePath);
  setHtml(root.querySelector("[data-photo]"),
    '<button type="button" class="round" data-act="back-recipes" aria-label="' + esc(t("back")) + '">' + icon("back") + "</button>" +
    '<button type="button" class="round edit" data-act="edit-recipe" data-id="' + esc(r.id) + '" aria-label="' + esc(t("recipe_edit")) + '">' + icon("edit") + "</button>" +
    icon(mealGlyph(r.mealType), "big") + (url ? '<img src="' + esc(url) + '" alt="">' : ""));
  root.querySelector("[data-photo]").classList.toggle("has-img", !!url);

  setHtml(root.querySelector("[data-head]"),
    '<div class="eyebrow">' + esc(metaLine(r, false)) + '</div><h1 class="ttl ttl-sm">' + esc(r.title) + "</h1>" +
    (r.description ? '<p class="desc">' + esc(r.description) + "</p>" : ""));

  setHtml(root.querySelector("[data-macros]"), macrosHtml(r, cur.servings));

  const sv = root.querySelector("[data-servings]");
  const svText = String(cur.servings);
  if (sv.textContent !== svText) sv.textContent = svText;
  root.querySelector('[data-serv="-1"]').disabled = cur.servings <= 1;
  root.querySelector('[data-serv="1"]').disabled = cur.servings >= 100;

  // Ingredients, grouped by section in recipe order.
  const s = recipeStats(r);
  let ingHtml = "";
  if (s.total) {
    let sec = null, rows = "";
    for (const i of s.ings) {
      if ((i.section || null) !== sec) { sec = i.section || null; if (sec) rows += '<div class="lbl">' + esc(sec) + "</div>"; }
      const key = i.nameKey || nameKey(i.name);
      const have = haveIt(key);
      const sub = [i.note, !have && onList(key) ? t("recipe_on_list") : ""].filter(Boolean).join(", ");
      rows += '<div class="rowbtn"><span class="ic ' + (have ? "have" : "miss") + '" role="img" aria-label="' + esc(t(have ? "recipe_have" : "recipe_missing")) + '">' + (have ? icon("check") : "") + "</span>" +
        '<span class="nm' + (have ? " hv" : "") + '">' + esc(i.name) + (sub ? '<span class="sub">' + esc(sub) + "</span>" : "") + "</span>" +
        '<span class="val">' + esc(fmtAmount(scaled(i.amount, r, cur.servings), i.unit)) + "</span></div>";
    }
    ingHtml = '<div class="sechead"><h2>' + esc(t("recipe_ingredients")) + "</h2><span>" + esc(t("recipes_at_home", { have: s.have, total: s.total })) + "</span></div>" +
      '<div class="group ing">' + rows + "</div>";
  }
  setHtml(root.querySelector("[data-ings]"), ingHtml);

  const steps = stepsOf(r.id);
  setHtml(root.querySelector("[data-steps]"), steps.length
    ? '<div class="sechead"><h2>' + esc(t("recipe_steps")) + "</h2><span>" + esc(t("recipe_steps_n", { n: steps.length })) + "</span></div>" +
      '<ol class="steps">' + steps.map((st, n) => '<li><span class="n">' + (n + 1) + "</span><p>" + esc(st.text) +
        (st.timerMinutes ? ' <span class="tag">' + icon("timer") + esc(t("minutes", { n: st.timerMinutes })) + "</span>" : "") + "</p></li>").join("") + "</ol>"
    : "");

  setHtml(root.querySelector("[data-notes]"), r.notes
    ? '<div class="sechead"><h2>' + esc(t("recipe_notes")) + '</h2></div><p class="rnotes">' + esc(r.notes) + "</p>" : "");

  setHtml(root.querySelector("[data-src]"), r.sourceUrl && /^https?:\/\//i.test(r.sourceUrl)
    ? '<a class="srclink" href="' + esc(r.sourceUrl) + '" target="_blank" rel="noopener noreferrer">' + icon("link") + esc(t("recipe_source")) + "</a>" : "");

  // Dock: Dodaj N do listy (only what the pantry lacks and the list doesn't have yet) + Gotuj.
  const n = missingToAdd(r).length;
  const missing = s.total - s.have;
  let add = "";
  if (n) add = '<button type="button" class="btn black" data-act="recipe-add-missing">' + icon("cart") + esc(t("recipe_add_n", { n })) + "</button>";
  else if (missing) add = '<button type="button" class="btn" disabled>' + icon("check") + esc(t("recipe_all_on_list")) + "</button>";
  const cook = steps.length ? '<button type="button" class="btn accent" data-act="recipe-cook">' + icon("play") + esc(t("recipe_cook")) + "</button>" : "";
  setHtml(root.querySelector("[data-dock]"), add || cook ? '<div class="in">' + add + cook + "</div>" : "");
  root.querySelector("[data-dock]").hidden = !(add || cook);
}

// Macros for the chosen servings: "520 kcal" (or "ok. 480 kcal" when estimated), then B, T, W and
// Bł in grams, and a small Dietetyk label when the numbers are the dietitian's. A recipe without
// stored macros gets an estimate from the foods table (M7.3) plus "2 składniki bez danych" for
// ingredients with no food or no weight; that line opens the editor, where they can be fixed.
function macrosHtml(r, servings) {
  const base = recipeMacros(r);
  if (!base) return "";
  const computed = base.source === "computed";
  if (computed && !state.foods.length) return ""; // foods not loaded: nothing to say
  const missing = computed && base.missing.length
    ? '<button type="button" class="mmiss" data-act="edit-recipe" data-focus="foods" data-id="' + esc(r.id) + '">' + esc(t("macro_missing", { n: base.missing.length })) + "</button>" : "";
  if (computed && !base.counted) return '<div class="macros">' + missing + "</div>";
  const m = scaleMacros(base, servings);
  const exact = base.source === "dietitian";
  const kcal = t(exact || (!computed && !r.macrosSource) ? "macro_kcal" : "macro_kcal_est", { n: m.kcal });
  const parts = [["proteinG", "macro_p"], ["fatG", "macro_f"], ["carbsG", "macro_c"], ["fiberG", "macro_fib"]]
    .filter(([k]) => m[k] != null)
    .map(([k, key]) => '<span class="mc" aria-label="' + esc(t(key + "_long", { n: m[k] })) + '"><b aria-hidden="true">' + esc(t(key)) + '</b><span aria-hidden="true">' + esc(t("macro_g", { n: m[k] })) + "</span></span>");
  return '<div class="macros"><div class="kc"><b>' + esc(kcal) + "</b>" +
    (exact ? '<span class="src">' + esc(t("macro_src_dietitian")) + "</span>" : "") + "</div>" +
    (parts.length ? '<div class="mcs">' + parts.join("") + "</div>" : "") + missing + "</div>";
}

registerView("recipe", {
  tab: false,
  mount: mountRecipe,
  update(root) { paintRecipe(root); }
});

on({
  "open-recipe": (el) => go("recipe", el.dataset.id),
  "back-recipes": () => (history.length > 1 ? history.back() : go("recipes")),
  "recipe-new": () => openEditor(null),
  "edit-recipe": (el) => openEditor(el.dataset.id, null, el.dataset.focus || null),
  "recipe-add-missing": () => { const r = byId("recipes", cur.id); if (r) addMissingToList(r, cur.servings); },
  "recipe-cook": () => go("cook", cur.id, cur.servings)
});
