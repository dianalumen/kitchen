// Category and unit helpers and the two sheet fields built on them (unit chips, category picker).
// Shared by the shopping-list edit sheet (L3) and the pantry sheets (P2, add), so both look and
// behave the same.
import { t } from "./i18n.js";
import { esc, icon, categoryGlyph } from "./ui.js";
import { state } from "./store.js";
import { nameKey } from "./parse.js";

export const sortedCats = () => [...state.categories].sort((a, b) => a.position - b.position || String(a.name).localeCompare(b.name, "pl"));
export const catById = (id) => (id ? state.categories.find((c) => c.id === id) : null);
// Items without a category join the household's "Inne" category when it exists, else get their
// own "Inne" group at the end.
export const otherCat = () => state.categories.find((c) => c.nameKey === "inne" || nameKey(c.name) === "inne");
export const catName = (id) => { const c = catById(id); return c ? c.name : t("list_no_category"); };
export const unitCodes = () => [...state.units].sort((a, b) => a.position - b.position).map((u) => u.code);

// ---------------------------------------------------------------------------
// Unit chips: tap a chip to pick, tap it again for no unit.
// ---------------------------------------------------------------------------
export function unitChipsHtml(unit, labelId) {
  const codes = unitCodes();
  if (unit && !codes.includes(unit)) codes.unshift(unit);
  return '<div class="chips" role="group" aria-labelledby="' + esc(labelId) + '" data-units>' + codes.map((c) =>
    '<button type="button" class="chip" data-unit="' + esc(c) + '" aria-pressed="' + (c === unit) + '">' + esc(c) + "</button>").join("") + "</div>";
}

// onPick(unit|null) is called after the chips are updated.
export function bindUnitChips(sheet, unit, onPick) {
  const units = sheet.querySelector("[data-units]");
  const show = () => {
    const sel = units.querySelector('[aria-pressed="true"]');
    if (sel) {
      const a = units.getBoundingClientRect(), b = sel.getBoundingClientRect();
      units.scrollLeft = Math.max(0, b.left - a.left - a.width / 2 + b.width / 2);
    }
  };
  show();
  units.addEventListener("click", (e) => {
    const b = e.target.closest("[data-unit]");
    if (!b) return;
    unit = unit === b.dataset.unit ? null : b.dataset.unit;
    units.querySelectorAll("[data-unit]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.unit === unit)));
    onPick(unit);
  });
}

// ---------------------------------------------------------------------------
// Category field: a pill that opens the list of categories under it.
// ---------------------------------------------------------------------------
export function categoryFieldHtml(categoryId) {
  return '<span class="lbl">' + esc(t("list_category")) + "</span>" +
    '<button type="button" class="fld pick" data-pick aria-expanded="false"><span class="ic">' + icon(categoryGlyph(categoryId ? catName(categoryId) : "")) + "</span>" +
    '<span class="nm" data-catname>' + esc(catName(categoryId)) + "</span>" + icon("down", "chev") + "</button>" +
    "<div data-catlist hidden></div>";
}

export function bindCategoryField(sheet, categoryId, onPick) {
  const pick = sheet.querySelector("[data-pick]");
  const list = sheet.querySelector("[data-catlist]");
  let picking = false;
  const catList = () => '<div class="group catpick" role="radiogroup" aria-label="' + esc(t("list_category")) + '">' +
    sortedCats().map((c) => '<button type="button" class="rowbtn" role="radio" data-cat="' + esc(c.id) + '" aria-checked="' + (c.id === categoryId) + '">' +
      '<span class="ic">' + icon(categoryGlyph(c.name)) + '</span><span class="nm">' + esc(c.name) + "</span>" +
      (c.id === categoryId ? icon("check", "sel") : "") + "</button>").join("") + "</div>";
  pick.addEventListener("click", () => {
    picking = !picking;
    pick.setAttribute("aria-expanded", String(picking));
    list.innerHTML = picking ? catList() : "";
    list.hidden = !picking;
    if (picking) { const sel = list.querySelector('[aria-checked="true"]') || list.querySelector("[data-cat]"); if (sel) sel.focus({ preventScroll: true }); }
  });
  list.addEventListener("click", (e) => {
    const b = e.target.closest("[data-cat]");
    if (!b) return;
    categoryId = b.dataset.cat === categoryId ? null : b.dataset.cat; // tap again for no category
    sheet.querySelector("[data-catname]").textContent = catName(categoryId);
    pick.querySelector(".ic").innerHTML = icon(categoryGlyph(categoryId ? catName(categoryId) : ""));
    picking = false;
    pick.setAttribute("aria-expanded", "false");
    list.hidden = true;
    list.innerHTML = "";
    pick.focus({ preventScroll: true });
    onPick(categoryId);
  });
}
