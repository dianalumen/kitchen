// Shopping list (L1–L4): the add field pinned on top with amount parsing and autocomplete (L2),
// items grouped by category in aisle order with the tick fill (L1), "Kupione" with Wyczyść and
// Do spiżarni, the edit sheet (L3) and the empty state (L4).
//
// Speed rules (TECH-GUIDELINES §9): every action changes local state first through the store;
// repaints reuse the existing row elements, so a realtime event never restarts a tick animation
// or steals focus.
import { t, fmtAmount } from "../i18n.js";
import { esc, icon, categoryGlyph, openSheet, toast, store, reducedMotion } from "../ui.js";
import { state, insertRow, updateRow, deleteRow, deleteRows, optimistic, putLocal, dropLocal, byId, getBackend } from "../store.js";
import { header, setEyebrow, settingsButton, registerView, go } from "../shell.js";
import { parseItem, matchRule, suggest, nameKey, toNumber } from "../parse.js";

const TICK_DELAY = 600;   // ms to change your mind before a ticked item moves to "Kupione"
const LEAVE_MS = 160;     // fade-out before the row leaves its group
const LONG_PRESS = 480;   // ms of holding a row to open the edit sheet
const RECENT_MAX = 80;

const ticking = new Map(); // id → timer
let showBought = false;
let lastHtml = "";

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------
const sortedCats = () => [...state.categories].sort((a, b) => a.position - b.position || String(a.name).localeCompare(b.name, "pl"));
const catById = (id) => (id ? state.categories.find((c) => c.id === id) : null);
// Items without a category join the household's "Inne" category when it exists, else get their
// own "Inne" group at the end.
const otherCat = () => state.categories.find((c) => c.nameKey === "inne" || nameKey(c.name) === "inne");
const catName = (id) => { const c = catById(id); return c ? c.name : t("list_no_category"); };
const unitCodes = () => [...state.units].sort((a, b) => a.position - b.position).map((u) => u.code);

// Category for a new item: the same name in the pantry, on the list or in recent history, else the
// longest matching category rule.
export function guessCategory(name) {
  const key = nameKey(name);
  if (!key) return null;
  const same = (r) => nameKey(r.name) === key && catById(r.categoryId);
  const hit = state.pantry.find(same) || state.shopping.find(same) || recent().find(same);
  return hit ? hit.categoryId : matchRule(key, state.categoryRules);
}

// ---------------------------------------------------------------------------
// Recent items (this device): names added before, offered as "ostatnio". The list itself keeps no
// history once items are cleared or moved to the pantry, so the last 80 adds are kept locally.
// ---------------------------------------------------------------------------
function recent() {
  try { const r = JSON.parse(store("recent") || "[]"); return Array.isArray(r) ? r : []; }
  catch (e) { return []; }
}
function remember(item) {
  const key = nameKey(item.name);
  const list = [{ name: item.name, amount: item.amount ?? null, unit: item.unit ?? null, categoryId: item.categoryId ?? null },
    ...recent().filter((r) => nameKey(r.name) !== key)].slice(0, RECENT_MAX);
  store("recent", JSON.stringify(list));
}

const toBuy = () => state.shopping.filter((s) => !s.checked);
const eyebrow = () => { const n = toBuy().length; return n ? t("list_to_buy", { n }) : t("list_nothing"); };

// ---------------------------------------------------------------------------
// Mount: header, the add bar, the list body
// ---------------------------------------------------------------------------
function mount(root) {
  lastHtml = "";
  root.innerHTML =
    header({ eyebrow: eyebrow(), title: t("list_title"), buttons: [settingsButton()] }) +
    '<div class="addbar">' +
    '<form class="tin" data-hide-tabbar autocomplete="off" novalidate>' +
    '<input name="item" type="text" enterkeyhint="done" autocapitalize="sentences" spellcheck="false" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="list-ac"' +
    ' placeholder="' + esc(t("list_add")) + '" aria-label="' + esc(t("list_add")) + '" maxlength="140">' +
    '<button class="go" type="submit" aria-label="' + esc(t("list_add_go")) + '">' + icon("plus") + "</button></form>" +
    '<div class="ac" id="list-ac" role="listbox" aria-label="' + esc(t("list_suggestions")) + '" hidden></div>' +
    "</div>" +
    '<div class="stack" data-body></div>';
  initAdd(root);
  initBody(root);
  paint(root);
}

function update(root, changes) {
  setEyebrow(root, eyebrow());
  paint(root);
  // Suggestions depend on the list and the pantry; refresh them while the field is in use.
  if (changes && (changes.has("all") || changes.has("pantry") || changes.has("shopping") || changes.has("categories"))) {
    const input = root.querySelector('input[name="item"]');
    if (input && document.activeElement === input && input.value.trim()) renderAc(root);
  }
}

// ---------------------------------------------------------------------------
// L2: add field with parsing and autocomplete
// ---------------------------------------------------------------------------
let options = [];
let active = -1;

function buildOptions(text) {
  const p = parseItem(text, unitCodes());
  if (!p.name) return [];
  const listSrc = state.shopping.map((s) => ({ kind: "list", id: s.id, name: s.name, categoryId: s.categoryId, tag: t(s.checked ? "list_src_bought" : "list_src_list") }));
  const pantrySrc = state.pantry.map((x) => ({
    kind: "pantry", name: x.name, categoryId: x.categoryId,
    tag: x.low || x.amount === 0 ? t("list_src_low") : x.amount != null ? t("list_src_pantry", { amount: fmtAmount(x.amount, x.unit) }) : t("list_src_pantry_any")
  }));
  const recentSrc = recent().map((r) => ({ kind: "recent", name: r.name, categoryId: r.categoryId, amount: r.amount, unit: r.unit, tag: t("list_src_recent") }));
  const found = suggest(p.name, [listSrc, pantrySrc, recentSrc], 4).map((s) => {
    const own = s.kind === "recent" && p.amount == null; // a remembered amount only when none was typed
    return {
      kind: s.kind, name: s.name, tag: s.tag, exact: s.score === 3,
      categoryId: catById(s.categoryId) ? s.categoryId : guessCategory(s.name),
      amount: own ? s.amount : p.amount, unit: own ? s.unit : p.unit
    };
  });
  const out = found;
  if (!found.some((o) => o.exact)) {
    out.push({ kind: "new", name: p.name, amount: p.amount, unit: p.unit, categoryId: guessCategory(p.name) });
  }
  return out;
}

function renderAc(root) {
  const input = root.querySelector('input[name="item"]');
  const box = root.querySelector(".ac");
  const text = input.value;
  options = text.trim() ? buildOptions(text) : [];
  if (!options.length) { hideAc(root); return; }
  // Enter adds what was typed: the exact match if there is one, else the "Dodaj „…”" row.
  const exact = options.findIndex((o) => o.exact);
  active = exact >= 0 ? exact : options.length - 1;
  box.innerHTML = options.map((o, i) => {
    const amount = fmtAmount(o.amount, o.unit);
    const sub = o.kind === "new" ? catName(o.categoryId) : [amount, catName(o.categoryId)].filter(Boolean).join(", ");
    const label = o.kind === "new"
      ? (amount ? t("list_add_new_amount", { name: o.name, amount }) : t("list_add_new", { name: o.name }))
      : o.name;
    return '<div class="acr" role="option" id="ac-' + i + '" data-opt="' + i + '" aria-selected="' + (i === active) + '">' +
      '<span class="ic">' + icon(o.kind === "new" ? "plus" : categoryGlyph(catById(o.categoryId) ? catName(o.categoryId) : "")) + "</span>" +
      '<span class="nm">' + esc(label) + '<span class="mn">' + esc(sub) + "</span></span>" +
      (o.tag ? '<span class="tag">' + esc(o.tag) + "</span>" : "") + "</div>";
  }).join("");
  box.hidden = false;
  input.setAttribute("aria-expanded", "true");
  input.setAttribute("aria-activedescendant", "ac-" + active);
}

function hideAc(root) {
  const box = root.querySelector(".ac");
  const input = root.querySelector('input[name="item"]');
  if (box) { box.hidden = true; box.innerHTML = ""; }
  if (input) { input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant"); }
  options = [];
  active = -1;
}

function setActive(root, i) {
  if (!options.length) return;
  active = (i + options.length) % options.length;
  root.querySelectorAll(".ac [data-opt]").forEach((el) => el.setAttribute("aria-selected", String(Number(el.dataset.opt) === active)));
  root.querySelector('input[name="item"]').setAttribute("aria-activedescendant", "ac-" + active);
}

function initAdd(root) {
  const form = root.querySelector("form.tin");
  const input = form.item;
  const box = root.querySelector(".ac");
  input.addEventListener("input", () => renderAc(root));
  input.addEventListener("focus", () => { if (input.value.trim()) renderAc(root); });
  input.addEventListener("blur", () => setTimeout(() => { if (document.activeElement !== input) hideAc(root); }, 120));
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" && options.length) { e.preventDefault(); setActive(root, active + 1); }
    else if (e.key === "ArrowUp" && options.length) { e.preventDefault(); setActive(root, active - 1); }
    else if (e.key === "Escape") {
      if (options.length) { e.preventDefault(); hideAc(root); }
      else if (input.value) { input.value = ""; }
      else input.blur();
    }
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!input.value.trim()) { input.focus(); return; }
    if (!options.length) renderAc(root);
    const opt = options[active] || options[options.length - 1];
    if (opt) add(root, opt);
  });
  // Keep the keyboard open when a suggestion is tapped.
  box.addEventListener("pointerdown", (e) => e.preventDefault());
  box.addEventListener("click", (e) => {
    const el = e.target.closest("[data-opt]");
    if (el) add(root, options[Number(el.dataset.opt)]);
  });
}

// Adds an option. A name already on the list is not duplicated: an open item takes the new amount
// when the units allow, a bought one goes back on the list.
function add(root, opt) {
  const input = root.querySelector('input[name="item"]');
  input.value = "";
  hideAc(root);
  input.focus({ preventScroll: true });
  const name = opt.name.trim().slice(0, 120);
  if (!name) return;
  const key = nameKey(name);
  const same = state.shopping.filter((s) => nameKey(s.name) === key);
  const open = same.find((s) => !s.checked);
  const amount = opt.amount ?? null, unit = amount != null ? opt.unit ?? null : null;
  remember({ name, amount, unit, categoryId: opt.categoryId });
  if (open) {
    let patch = null;
    if (amount != null) {
      if (open.amount == null) patch = { amount, unit };
      else if ((open.unit || null) === unit) patch = { amount: Math.round((open.amount + amount) * 1000) / 1000 };
    }
    if (patch) updateRow("shopping", open.id, patch);
    toast(t("list_already", { name: open.name }));
    flash(root, open.id);
    return;
  }
  const bought = same[0];
  if (bought) {
    updateRow("shopping", bought.id, { checked: false, ...(amount != null ? { amount, unit } : {}) });
    toast(t("list_back_on", { name: bought.name }));
    flash(root, bought.id);
    return;
  }
  insertRow("shopping", { name, amount, unit, categoryId: opt.categoryId || null, checked: false, note: null, recipeId: null });
}

// Brief highlight of a row that was merged into, after the next paint.
function flash(root, id) {
  requestAnimationFrame(() => setTimeout(() => {
    const el = root.querySelector('.card[data-id="' + CSS.escape(id) + '"]');
    if (!el) return;
    el.scrollIntoView({ block: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
    el.classList.remove("flash");
    void el.offsetWidth;
    el.classList.add("flash");
  }, 60));
}

// ---------------------------------------------------------------------------
// L1: the list
// ---------------------------------------------------------------------------
function cardHtml(it, { done = false } = {}) {
  const sub = [fmtAmount(it.amount, it.unit), it.note].filter(Boolean).join(", ");
  const glyph = icon(categoryGlyph(catById(it.categoryId) ? catName(it.categoryId) : ""));
  const on = !done && ticking.has(it.id);
  return '<div class="card' + (done ? " done" : "") + (on ? " on" : "") + '" data-id="' + esc(it.id) + '">' +
    '<span class="fill" aria-hidden="true"></span>' +
    '<button type="button" class="ic" data-edit aria-label="' + esc(t("list_edit", { name: it.name })) + '">' + glyph + "</button>" +
    '<button type="button" class="tap" data-tick aria-pressed="' + (done || on) + '" aria-label="' + esc(it.name + (sub ? ", " + sub : "")) + '">' +
    '<span class="nm"><span class="tx">' + esc(it.name) + "</span>" + (sub ? '<span class="mn">' + esc(sub) + "</span>" : "") + "</span>" +
    '<span class="ck" aria-hidden="true">' + icon("check") + "</span></button></div>";
}

function bodyHtml() {
  const items = toBuy();
  const done = state.shopping.filter((s) => s.checked);
  const other = otherCat();
  const groups = new Map();
  for (const it of items) {
    const key = catById(it.categoryId) ? it.categoryId : other ? other.id : "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(it);
  }
  const pos = (k) => (k ? catById(k).position : Infinity);
  const sorted = [...groups.entries()].sort(([a], [b]) => pos(a) - pos(b));

  let html = "";
  if (!items.length) {
    html += '<div class="empty"><span class="ic">' + icon("cart") + "</span><b>" + esc(t("list_empty_title")) + "</b>" +
      "<span>" + esc(t("list_empty_tip")) + "</span>" +
      '<button type="button" class="btn on-soft-btn" data-recipes>' + icon("book") + esc(t("list_empty_recipes")) + "</button></div>";
  }
  for (const [key, rows] of sorted) {
    rows.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    html += '<section class="cards" data-cat="' + esc(key) + '"><div class="sechead"><h2>' + esc(key ? catName(key) : t("list_no_category")) +
      '</h2><span>' + rows.length + "</span></div>" + rows.map((it) => cardHtml(it)).join("") + "</section>";
  }
  if (done.length) {
    html += '<div class="bought">' +
      '<button type="button" class="t" data-bought aria-expanded="' + showBought + '" aria-label="' + esc(t(showBought ? "list_bought_hide" : "list_bought_show")) + '">' +
      icon("down") + "<span>" + esc(t("list_bought")) + "</span><b>" + done.length + "</b></button>" +
      '<button type="button" class="btn" data-clear>' + esc(t("list_clear")) + "</button>" +
      '<button type="button" class="btn black" data-pantry>' + esc(t("list_to_pantry")) + "</button></div>";
    if (showBought) {
      done.sort((a, b) => String(b.checkedAt || "").localeCompare(String(a.checkedAt || "")));
      html += '<section class="cards" data-done>' + done.map((it) => cardHtml(it, { done: true })).join("") + "</section>";
    }
  }
  return html;
}

// Repaint only when the markup changes, and reuse row elements that look the same, so a tick in
// progress keeps its animation and a focused row keeps focus.
function paint(root) {
  const body = root.querySelector("[data-body]");
  if (!body) return;
  const html = bodyHtml();
  if (html === lastHtml) return;
  lastHtml = html;
  const old = new Map();
  body.querySelectorAll(".card[data-id]").forEach((el) => old.set(el.dataset.id, el));
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  tpl.content.querySelectorAll(".card[data-id]").forEach((fresh) => {
    const prev = old.get(fresh.dataset.id);
    if (prev && sameRow(prev, fresh)) fresh.replaceWith(prev);
  });
  const focused = document.activeElement;
  body.replaceChildren(tpl.content);
  if (focused && focused !== document.body && !document.contains(focused)) {
    // The focused row was rebuilt: put focus on its new element.
    const id = focused.closest && focused.closest(".card") && focused.closest(".card").dataset.id;
    if (id) { const el = body.querySelector('.card[data-id="' + CSS.escape(id) + '"] .tap'); if (el) el.focus({ preventScroll: true }); }
  }
}

// Same content, ignoring the tick state classes and inline position of the fill.
function sameRow(a, b) {
  const norm = (el) => {
    const c = el.cloneNode(true);
    c.classList.remove("on", "leaving", "flash");
    c.removeAttribute("style");
    c.querySelector(".tap").setAttribute("aria-pressed", "x");
    return c.outerHTML;
  };
  return norm(a) === norm(b);
}

// ---------------------------------------------------------------------------
// Tick, untick, long press, Kupione actions
// ---------------------------------------------------------------------------
let pressTimer = 0;
let pressStart = null;
let swallowClick = false;

function initBody(root) {
  const body = root.querySelector("[data-body]");
  body.addEventListener("click", (e) => {
    if (swallowClick) { swallowClick = false; return; }
    const card = e.target.closest(".card[data-id]");
    if (card) {
      const id = card.dataset.id;
      if (e.target.closest("[data-edit]")) return openEdit(id);
      if (e.target.closest("[data-tick]")) return card.classList.contains("done") ? untick(id) : tick(card, e);
      return;
    }
    if (e.target.closest("[data-bought]")) { showBought = !showBought; paint(root); return; }
    if (e.target.closest("[data-clear]")) return clearBought();
    if (e.target.closest("[data-pantry]")) return moveToPantry();
    if (e.target.closest("[data-recipes]")) return go("recipes");
  });
  // Hold a row to edit it (the icon on the left does the same with one tap).
  body.addEventListener("pointerdown", (e) => {
    const tap = e.target.closest("[data-tick]");
    if (!tap || e.button > 0) return;
    pressStart = { x: e.clientX, y: e.clientY };
    clearTimeout(pressTimer);
    const id = tap.closest(".card").dataset.id;
    pressTimer = setTimeout(() => {
      pressStart = null;
      swallowClick = true;
      setTimeout(() => { swallowClick = false; }, 800);
      if (navigator.vibrate) navigator.vibrate(12);
      openEdit(id);
    }, LONG_PRESS);
  });
  const cancel = () => { clearTimeout(pressTimer); pressStart = null; };
  body.addEventListener("pointermove", (e) => {
    if (pressStart && Math.hypot(e.clientX - pressStart.x, e.clientY - pressStart.y) > 10) cancel();
  });
  body.addEventListener("pointerup", cancel);
  body.addEventListener("pointercancel", cancel);
  body.addEventListener("contextmenu", (e) => { if (e.target.closest(".card")) e.preventDefault(); });
}

// Fill from the tap point; a second tap within TICK_DELAY undoes it, otherwise it is saved and the
// row moves into "Kupione".
function tick(card, e) {
  const id = card.dataset.id;
  const tap = card.querySelector(".tap");
  if (ticking.has(id)) {
    clearTimeout(ticking.get(id));
    ticking.delete(id);
    card.classList.remove("on", "leaving");
    tap.setAttribute("aria-pressed", "false");
    return;
  }
  const r = card.getBoundingClientRect();
  const x = e.clientX ? e.clientX - r.left : r.width - 30;
  const y = e.clientY ? e.clientY - r.top : r.height / 2;
  card.style.setProperty("--x", x + "px");
  card.style.setProperty("--y", y + "px");
  card.classList.add("on");
  tap.setAttribute("aria-pressed", "true");
  if (navigator.vibrate) navigator.vibrate(8);
  ticking.set(id, setTimeout(() => {
    const save = () => { ticking.delete(id); updateRow("shopping", id, { checked: true }); };
    if (reducedMotion()) return save();
    card.classList.add("leaving");
    ticking.set(id, setTimeout(save, LEAVE_MS));
  }, TICK_DELAY));
}

function untick(id) {
  if (navigator.vibrate) navigator.vibrate(8);
  updateRow("shopping", id, { checked: false });
}

function clearBought() {
  const ids = state.shopping.filter((s) => s.checked).map((s) => s.id);
  if (!ids.length) return;
  deleteRows("shopping", ids, { undoLabel: t("list_cleared", { n: ids.length }) });
}

// move_checked_to_pantry: bought items leave the list at once; the pantry rows arrive by realtime.
async function moveToPantry() {
  const bought = state.shopping.filter((s) => s.checked);
  if (!bought.length) return;
  const ids = bought.map((s) => s.id);
  const res = await optimistic({
    ids, what: "shopping",
    apply: () => ids.forEach((id) => dropLocal("shopping", id)),
    save: () => getBackend().moveCheckedToPantry(),
    rollback: () => bought.forEach((s) => putLocal("shopping", s))
  });
  if (res == null) return;
  const n = typeof res === "number" && res > 0 ? res : bought.length;
  toast(t("list_moved", { n }));
}

// ---------------------------------------------------------------------------
// L3: edit sheet
// ---------------------------------------------------------------------------
function openEdit(id) {
  const it = byId("shopping", id);
  if (!it) return;
  let unit = it.unit || null;
  let categoryId = catById(it.categoryId) ? it.categoryId : null;
  let picking = false;
  const codes = unitCodes();
  if (unit && !codes.includes(unit)) codes.unshift(unit);

  const unitChips = () => codes.map((c) =>
    '<button type="button" class="chip" data-unit="' + esc(c) + '" aria-pressed="' + (c === unit) + '">' + esc(c) + "</button>").join("");
  const catList = () => '<div class="group catpick" role="radiogroup" aria-label="' + esc(t("list_category")) + '">' +
    sortedCats().map((c) => '<button type="button" class="rowbtn" role="radio" data-cat="' + esc(c.id) + '" aria-checked="' + (c.id === categoryId) + '">' +
      '<span class="ic">' + icon(categoryGlyph(c.name)) + '</span><span class="nm">' + esc(c.name) + "</span>" +
      (c.id === categoryId ? icon("check", "sel") : "") + "</button>").join("") + "</div>";

  openSheet({
    title: t("list_edit_title"),
    body:
      '<form class="stack edit" novalidate style="gap:12px">' +
      '<div><label class="lbl" for="e-name">' + esc(t("list_name")) + '</label><input class="fld" id="e-name" name="name" maxlength="120" autocomplete="off" value="' + esc(it.name) + '"></div>' +
      '<div class="amtrow"><div class="amt"><label class="lbl" for="e-amount">' + esc(t("list_amount")) + '</label>' +
      '<input class="fld num" id="e-amount" name="amount" inputmode="decimal" autocomplete="off" value="' + esc(it.amount != null ? String(it.amount).replace(".", ",") : "") + '"></div>' +
      '<div class="units"><span class="lbl" id="e-unit">' + esc(t("list_unit")) + '</span><div class="chips" role="group" aria-labelledby="e-unit" data-units>' + unitChips() + "</div></div></div>" +
      '<div><span class="lbl">' + esc(t("list_category")) + '</span>' +
      '<button type="button" class="fld pick" data-pick aria-expanded="false"><span class="ic">' + icon(categoryGlyph(categoryId ? catName(categoryId) : "")) + "</span>" +
      '<span class="nm" data-catname>' + esc(catName(categoryId)) + "</span>" + icon("down", "chev") + "</button>" +
      '<div data-catlist hidden></div></div>' +
      '<div><label class="lbl" for="e-note">' + esc(t("list_note")) + '</label><input class="fld" id="e-note" name="note" maxlength="500" autocomplete="off" placeholder="' + esc(t("list_note_ph")) + '" value="' + esc(it.note || "") + '"></div>' +
      '<div class="acts"><button type="button" class="btn danger" data-delete>' + esc(t("list_delete")) + '</button><button type="submit" class="btn black">' + esc(t("save")) + "</button></div>" +
      "</form>",
    onMount(sheet, close) {
      const form = sheet.querySelector("form");
      const units = sheet.querySelector("[data-units]");
      const pick = sheet.querySelector("[data-pick]");
      const list = sheet.querySelector("[data-catlist]");
      const selUnit = units.querySelector('[aria-pressed="true"]');
      if (selUnit) {
        const a = units.getBoundingClientRect(), b = selUnit.getBoundingClientRect();
        units.scrollLeft = Math.max(0, b.left - a.left - a.width / 2 + b.width / 2);
      }
      units.addEventListener("click", (e) => {
        const b = e.target.closest("[data-unit]");
        if (!b) return;
        unit = unit === b.dataset.unit ? null : b.dataset.unit; // tap again for no unit
        units.querySelectorAll("[data-unit]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.unit === unit)));
      });
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
        categoryId = b.dataset.cat === categoryId ? null : b.dataset.cat;
        sheet.querySelector("[data-catname]").textContent = catName(categoryId);
        pick.querySelector(".ic").innerHTML = icon(categoryGlyph(categoryId ? catName(categoryId) : ""));
        picking = false;
        pick.setAttribute("aria-expanded", "false");
        list.hidden = true;
        list.innerHTML = "";
        pick.focus({ preventScroll: true });
      });
      sheet.querySelector("[data-delete]").addEventListener("click", () => {
        close();
        deleteRow("shopping", id, { undoLabel: t("toast_deleted", { name: it.name }) });
      });
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const name = form.name.value.replace(/\s+/g, " ").trim();
        if (!name) { toast(t("list_err_name")); form.name.focus(); return; }
        const rawAmount = form.amount.value.trim();
        const amount = rawAmount ? toNumber(rawAmount) : null;
        if (rawAmount && !(amount > 0 && amount < 1e6)) { toast(t("list_err_amount")); form.amount.focus(); return; }
        const note = form.note.value.trim() || null;
        const cur = byId("shopping", id) || it;
        const next = { name, amount: amount == null ? null : Math.round(amount * 1000) / 1000, unit: amount == null ? null : unit, categoryId, note };
        const patch = {};
        for (const k in next) if ((cur[k] ?? null) !== next[k]) patch[k] = next[k];
        close();
        if (!Object.keys(patch).length) return;
        updateRow("shopping", id, patch);
        if ("categoryId" in patch) learnRule(name, categoryId);
      });
    }
  });
}

// Picking a category by hand teaches the household: next time this name gets the same category
// on both phones (a category rule with the full name as its keyword).
function learnRule(name, categoryId) {
  const key = nameKey(name);
  const rule = state.categoryRules.find((r) => (r.keywordKey || nameKey(r.keyword)) === key);
  if (!categoryId) { if (rule) deleteRow("categoryRules", rule.id); return; }
  if (rule) { if (rule.categoryId !== categoryId) updateRow("categoryRules", rule.id, { categoryId }); return; }
  if (matchRule(key, state.categoryRules) === categoryId) return; // a shorter rule already says so
  insertRow("categoryRules", { keyword: key.slice(0, 60), keywordKey: key.slice(0, 60), categoryId });
}

registerView("list", { tab: true, mount, update });
