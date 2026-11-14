// Pantry (P1–P3). M2 placeholder: header, search, category chips, the "Zużyj wkrótce" and "Mało"
// tiles, and rows grouped by category with values right-aligned. Read-only; M4 adds the item
// sheet, no-results state and editing.
import { t, fmtAmount, fmtDay, fmtMonth, daysUntil } from "../i18n.js";
import { esc, icon, categoryGlyph } from "../ui.js";
import { state } from "../store.js";
import { header, setEyebrow, settingsButton, registerView } from "../shell.js";

let query = "";
let chip = ""; // category id, "" = all

const soonDays = () => (state.settings && state.settings.expiringSoonDays) ?? 7;
// Day precision: within the household threshold. Month precision: this month or earlier.
export const isSoon = (p) => {
  if (!p.bestBefore) return false;
  if (p.bestBeforePrecision === "month") {
    const now = new Date();
    return String(p.bestBefore).slice(0, 7) <= now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
  }
  return daysUntil(p.bestBefore) <= soonDays();
};
export const isLow = (p) => p.low || p.amount === 0;

function mount(root) {
  root.innerHTML =
    header({ eyebrow: t("pantry_count", { n: state.pantry.length }), title: t("pantry_title"), buttons: [settingsButton()] }) +
    '<label class="note">' + icon("search") + '<input type="search" data-search placeholder="' + esc(t("pantry_search")) + '" aria-label="' + esc(t("pantry_search")) + '" value="' + esc(query) + '"></label>' +
    '<div class="chips" data-chips role="group"></div>' +
    '<div class="stack" data-body></div>';
  root.querySelector("[data-search]").addEventListener("input", (e) => { query = e.target.value; paint(root); });
  root.querySelector("[data-chips]").addEventListener("click", (e) => {
    const b = e.target.closest("[data-chip]");
    if (!b) return;
    chip = b.dataset.chip;
    paint(root);
  });
  paint(root);
}

function update(root) {
  setEyebrow(root, t("pantry_count", { n: state.pantry.length }));
  paint(root);
}

// "20 lis" + "8 dni" for a day; "lis 2026" + "do końca mies." for a month.
function expiry(p) {
  if (!p.bestBefore) return { date: "", rel: "" };
  if (p.bestBeforePrecision === "month") {
    const d = daysUntil(p.bestBefore);
    return { date: fmtMonth(p.bestBefore), rel: d < 0 ? t("expired") : isSoon(p) ? t("month_end") : "" };
  }
  const d = daysUntil(p.bestBefore);
  return { date: fmtDay(p.bestBefore), rel: d < 0 ? t("expired") : d === 0 ? t("today") : d <= soonDays() ? t("days", { n: d }) : "" };
}

function row(p, catName, alert) {
  const amount = fmtAmount(p.amount, p.unit);
  const e = expiry(p);
  let sub, val, small;
  if (alert) {
    sub = [catName, amount].filter(Boolean).join(", ");
    val = e.date || p.note || amount;
    small = e.rel;
  } else {
    sub = e.date ? t("pantry_until", { date: e.date }) : amount ? p.note || "" : "";
    val = amount || p.note || "";
    small = "";
  }
  if (alert && !e.date) { sub = catName; val = amount || p.note || ""; }
  return '<div class="rowbtn"><span class="ic">' + icon(categoryGlyph(catName)) + '</span><span class="nm">' + esc(p.name) +
    (sub ? '<span class="sub">' + esc(sub) + "</span>" : "") + '</span><span class="val">' + esc(val) +
    (small ? "<small>" + esc(small) + "</small>" : "") + "</span></div>";
}

function section(title, rows, html) {
  return '<div class="sechead"><h2>' + esc(title) + "</h2><span>" + rows + '</span></div><div class="group">' + html + "</div>";
}

function paint(root) {
  const cats = new Map(state.categories.map((c) => [c.id, c]));
  const catName = (p) => (cats.get(p.categoryId) || {}).name || t("list_no_category");
  const q = query.trim().toLowerCase();
  const items = state.pantry
    .filter((p) => !q || p.name.toLowerCase().includes(q))
    .filter((p) => !chip || p.categoryId === chip)
    .sort((a, b) => a.name.localeCompare(b.name, "pl"));

  // Chips: all + categories that have items, in aisle order.
  const used = new Set(state.pantry.map((p) => p.categoryId));
  const chipList = [{ id: "", name: t("pantry_all") }, ...state.categories.filter((c) => used.has(c.id))];
  root.querySelector("[data-chips]").innerHTML = chipList.map((c) =>
    '<button type="button" class="chip" data-chip="' + esc(c.id) + '" aria-pressed="' + (c.id === chip) + '">' +
    (c.id ? "<i>" + icon(categoryGlyph(c.name)) + "</i>" : "") + esc(c.name) + "</button>").join("");

  const soon = items.filter(isSoon).sort((a, b) => String(a.bestBefore).localeCompare(String(b.bestBefore)));
  const low = items.filter(isLow);
  let html = "";
  if (!q && (soon.length || low.length)) {
    html += '<div class="tiles">' +
      '<div class="tile"><div class="v">' + soon.length + '</div><div class="k">' + (soon.length ? "<i></i>" : "") + esc(t("pantry_soon")) + "</div></div>" +
      '<div class="tile"><div class="v">' + low.length + '</div><div class="k">' + esc(t("pantry_low")) + "</div></div></div>";
  }
  if (soon.length) html += section(t("pantry_soon"), soon.length, soon.map((p) => row(p, catName(p), true)).join(""));
  if (low.length) html += section(t("pantry_low"), low.length, low.map((p) => row(p, catName(p), true)).join(""));
  const byCat = new Map();
  for (const p of items) {
    const k = cats.has(p.categoryId) ? p.categoryId : "";
    if (!byCat.has(k)) byCat.set(k, []);
    byCat.get(k).push(p);
  }
  [...byCat.entries()]
    .sort(([a], [b]) => (a ? cats.get(a).position : 1e9) - (b ? cats.get(b).position : 1e9))
    .forEach(([k, rows]) => { html += section(k ? cats.get(k).name : t("list_no_category"), rows.length, rows.map((p) => row(p, catName(p), false)).join("")); });
  root.querySelector("[data-body]").innerHTML = html;
}

registerView("pantry", { tab: true, mount, update });
