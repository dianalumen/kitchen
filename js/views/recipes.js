// Recipes (R1–R4). M2 placeholder: the card grid with meal-type chips, and a read-only recipe view
// (tab bar hidden, forward/back transitions). M5 adds search, scaling, the dock, the editor,
// photos and cooking mode.
import { t, fmtAmount } from "../i18n.js";
import { esc, icon } from "../ui.js";
import { state } from "../store.js";
import { header, setEyebrow, settingsButton, registerView, go, on } from "../shell.js";

const MEALS = ["breakfast", "lunch", "dinner"];
let meal = "";

// The "have" rule must match add_recipe_to_list: a pantry item with the same name_key that is not
// low and whose amount is unknown or above 0.
export function haveIt(nameKey) {
  return state.pantry.some((p) => p.nameKey === nameKey && !p.low && (p.amount == null || p.amount > 0));
}

export function recipeStats(r) {
  const ings = state.ingredients.filter((i) => i.recipeId === r.id);
  return { total: ings.length, have: ings.filter((i) => haveIt(i.nameKey)).length, ings };
}

function metaLine(r, withCount) {
  const mins = (r.prepMinutes || 0) + (r.cookMinutes || 0);
  const parts = [];
  if (r.mealType) parts.push(t("meal_" + r.mealType));
  if (mins) parts.push(t("minutes", { n: mins }));
  if (withCount) { const s = recipeStats(r); if (s.total) parts.push(s.have + "/" + s.total); }
  return parts.join(", ");
}

// ---------------------------------------------------------------- R1 grid
function mountGrid(root) {
  root.innerHTML =
    header({ eyebrow: t("recipes_count", { n: state.recipes.length }), title: t("recipes_title"), buttons: [settingsButton()] }) +
    '<div class="chips" data-chips role="group"></div><div class="grid" data-body></div>';
  root.querySelector("[data-chips]").addEventListener("click", (e) => {
    const b = e.target.closest("[data-meal]");
    if (b) { meal = b.dataset.meal; paintGrid(root); }
  });
  paintGrid(root);
}

function paintGrid(root) {
  root.querySelector("[data-chips]").innerHTML = ["", ...MEALS].map((m) =>
    '<button type="button" class="chip" data-meal="' + m + '" aria-pressed="' + (m === meal) + '">' + esc(t(m ? "meal_" + m : "recipes_all")) + "</button>").join("");
  const list = state.recipes.filter((r) => !meal || r.mealType === meal).sort((a, b) => a.title.localeCompare(b.title, "pl"));
  root.querySelector("[data-body]").innerHTML = list.map((r) =>
    '<button type="button" class="rcard" data-act="open-recipe" data-id="' + esc(r.id) + '"><span class="ph">' + icon("bowl") + "</span><b>" + esc(r.title) + "</b><span>" + esc(metaLine(r, true)) + "</span></button>").join("");
}

registerView("recipes", {
  tab: true,
  mount: mountGrid,
  update(root) { setEyebrow(root, t("recipes_count", { n: state.recipes.length })); paintGrid(root); }
});

// ---------------------------------------------------------------- R2 recipe view (read-only)
function mountRecipe(root, [id]) {
  const r = state.recipes.find((x) => x.id === id);
  if (!r) { go("recipes"); return; }
  const s = recipeStats(r);
  s.ings.sort((a, b) => a.position - b.position);
  root.innerHTML =
    '<div class="photo"><button type="button" class="round" data-act="back-recipes" aria-label="' + esc(t("back")) + '">' + icon("back") + "</button>" + icon("bowl", "big") + "</div>" +
    '<div><div class="eyebrow">' + esc(metaLine(r, false)) + '</div><h1 class="ttl ttl-sm">' + esc(r.title) + "</h1></div>" +
    '<div class="sechead"><h2>' + esc(t("recipe_ingredients")) + "</h2><span>" + esc(t("recipes_at_home", { have: s.have, total: s.total })) + "</span></div>" +
    '<div class="group ing">' + s.ings.map((i) => {
      const have = haveIt(i.nameKey);
      return '<div class="rowbtn"><span class="ic ' + (have ? "have" : "miss") + '">' + (have ? icon("check") : "") + '</span><span class="nm' + (have ? " hv" : "") + '">' + esc(i.name) +
        (i.note ? '<span class="sub">' + esc(i.note) + "</span>" : "") + '</span><span class="val">' + esc(fmtAmount(i.amount, i.unit)) + "</span></div>";
    }).join("") + "</div>";
}

registerView("recipe", { tab: false, mount: mountRecipe, update(root) { const id = location.hash.split("/")[1]; mountRecipe(root, [id]); } });

on({
  "open-recipe": (el) => go("recipe", el.dataset.id),
  "back-recipes": () => (history.length > 1 ? history.back() : go("recipes"))
});
