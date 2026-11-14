// Shopping list (L1–L4). M2 placeholder: header, add field, items grouped by category in aisle
// order with the tick fill, and the "Kupione" count. M3 replaces the body with the full screen
// (autocomplete, amount parsing, edit sheet, Wyczyść / Do spiżarni, undo).
import { t } from "../i18n.js";
import { esc, icon, categoryGlyph } from "../ui.js";
import { fmtAmount } from "../i18n.js";
import { state, insertRow, updateRow } from "../store.js";
import { header, setEyebrow, settingsButton, registerView } from "../shell.js";

const TICK_DELAY = 600; // ms to change your mind before a ticked item moves to "Kupione"
const ticking = new Map();

// Longest category rule whose keyword is part of the name wins (same as the database).
export function guessCategory(name) {
  const key = String(name).trim().toLowerCase();
  let best = null;
  for (const r of state.categoryRules) {
    if (key.includes(r.keywordKey) && (!best || r.keywordKey.length > best.keywordKey.length)) best = r;
  }
  return best ? best.categoryId : null;
}

const toBuy = () => state.shopping.filter((s) => !s.checked);

function mount(root) {
  root.innerHTML =
    header({ eyebrow: t("list_to_buy", { n: toBuy().length }), title: t("list_title"), buttons: [settingsButton()] }) +
    '<form class="tin" data-hide-tabbar autocomplete="off">' +
    '<input name="item" type="text" enterkeyhint="done" placeholder="' + esc(t("list_add")) + '" aria-label="' + esc(t("list_add")) + '">' +
    '<button class="go" type="submit" aria-label="' + esc(t("list_add_go")) + '">' + icon("plus") + "</button></form>" +
    '<div class="stack" data-body></div>';
  root.querySelector("form").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = e.target.item;
    const name = input.value.trim();
    if (!name) { input.focus(); return; }
    input.value = "";
    insertRow("shopping", { name, categoryId: guessCategory(name), checked: false });
  });
  root.querySelector("[data-body]").addEventListener("click", onTap);
  paint(root);
}

function update(root) {
  setEyebrow(root, t("list_to_buy", { n: toBuy().length }));
  paint(root);
}

function paint(root) {
  const body = root.querySelector("[data-body]");
  const items = toBuy();
  const bought = state.shopping.length - items.length;
  const order = new Map(state.categories.map((c) => [c.id, c]));
  const groups = new Map();
  for (const it of items) {
    const key = order.has(it.categoryId) ? it.categoryId : "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(it);
  }
  const sorted = [...groups.entries()].sort(([a], [b]) =>
    (a ? order.get(a).position : 1e9) - (b ? order.get(b).position : 1e9));

  let html = "";
  if (!items.length) {
    html += '<div class="empty"><span class="ic">' + icon("check") + "</span><b>" + esc(t("list_empty_title")) + "</b><span>" + esc(t("list_empty_tip")) + "</span></div>";
  }
  for (const [catId, rows] of sorted) {
    const name = catId ? order.get(catId).name : t("list_no_category");
    html += '<section class="cards"><div class="sechead"><h2>' + esc(name) + '</h2><span>' + rows.length + "</span></div>";
    rows.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    for (const it of rows) {
      const sub = [fmtAmount(it.amount, it.unit), it.note].filter(Boolean).join(", ");
      const pressed = ticking.has(it.id);
      html += '<button type="button" class="card" data-id="' + esc(it.id) + '" aria-pressed="' + pressed + '">' +
        '<span class="fill" aria-hidden="true"></span><span class="ic">' + icon(categoryGlyph(catId ? name : "")) + "</span>" +
        '<span class="nm">' + esc(it.name) + (sub ? '<span class="mn">' + esc(sub) + "</span>" : "") + "</span>" +
        '<span class="ck">' + icon("check") + "</span></button>";
    }
    html += "</section>";
  }
  if (bought) {
    html += '<div class="bought"><span class="t">' + icon("down") + "<span>" + esc(t("list_bought")) + "<b>" + bought + "</b></span></span></div>";
  }
  body.innerHTML = html;
}

// Tap: fill from the tap point; a second tap within TICK_DELAY undoes it, otherwise it is saved.
function onTap(e) {
  const card = e.target.closest(".card[data-id]");
  if (!card) return;
  const id = card.dataset.id;
  if (ticking.has(id)) {
    clearTimeout(ticking.get(id));
    ticking.delete(id);
    card.setAttribute("aria-pressed", "false");
    return;
  }
  const r = card.getBoundingClientRect();
  const x = e.clientX ? e.clientX - r.left : r.width - 30;
  const y = e.clientY ? e.clientY - r.top : r.height / 2;
  card.style.setProperty("--x", x + "px");
  card.style.setProperty("--y", y + "px");
  card.setAttribute("aria-pressed", "true");
  if (navigator.vibrate) navigator.vibrate(8);
  ticking.set(id, setTimeout(() => {
    ticking.delete(id);
    updateRow("shopping", id, { checked: true });
  }, TICK_DELAY));
}

registerView("list", { tab: true, mount, update });
