// Pantry (P1–P3): search and category chips, "Zużyj wkrótce" and "Mało" first (only when they have
// items), then rows grouped by category in aisle order. Tapping a row opens the item sheet (P2:
// stepper, Mało, Termin, category, note, Dodaj do listy, Usuń). A search with no hits offers to add
// the text to the pantry or the list (P3); the + button in the header opens the same add sheet.
//
// Speed (TECH-GUIDELINES §9): the body is reconciled, not rebuilt. Sections and rows are keyed
// elements; a repaint only touches the ones whose markup changed, so ~150 rows stay smooth and a
// realtime event for one row replaces one element.
import { t, fmtAmount, fmtNum, unitLabel, fmtDay, fmtMonth, daysUntil, list as dict } from "../i18n.js";
import { esc, icon, categoryGlyph, openSheet, toast, reducedMotion } from "../ui.js";
import { state, insertRow, updateRow, deleteRow, byId } from "../store.js";
import { header, setEyebrow, settingsButton, registerView, on } from "../shell.js";
import { parseItem, nameKey, toNumber } from "../parse.js";
import { catById, catName, unitCodes, unitChipsHtml, bindUnitChips, categoryFieldHtml, bindCategoryField } from "../pickers.js";
import { addToList, guessCategory, learnRule } from "./list.js";

let query = "";
let chip = ""; // category id, "" = all
let chipsSig = "";
let flashId = "";

const collator = new Intl.Collator("pl");
const soonDays = () => (state.settings && state.settings.expiringSoonDays) ?? 7;

// ---------------------------------------------------------------------------
// Dates. A month-precision date is stored as the last day of that month, so "within the threshold"
// is the same test for both precisions.
// ---------------------------------------------------------------------------
const pad = (n) => String(n).padStart(2, "0");
export const lastDayOf = (year, month) => { // month 1–12
  const d = new Date(year, month, 0);
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
};
function effectiveDate(p) {
  if (!p.bestBefore) return null;
  if (p.bestBeforePrecision === "month") {
    const [y, m] = String(p.bestBefore).split("-").map(Number);
    return lastDayOf(y, m);
  }
  return String(p.bestBefore).slice(0, 10);
}
export const daysLeft = (p) => { const d = effectiveDate(p); return d ? daysUntil(d) : null; };
export const isSoon = (p) => { const d = daysLeft(p); return d != null && d <= soonDays(); };
export const isLow = (p) => p.low || p.amount === 0;

// Value column for a best-before date: "20 lis" + "8 dni", "lis 2026" + "do końca mies.", "po terminie".
function expiry(p) {
  const d = daysLeft(p);
  if (d == null) return { date: "", rel: "" };
  const month = p.bestBeforePrecision === "month";
  const date = month ? fmtMonth(p.bestBefore) : fmtDay(p.bestBefore);
  let rel = "";
  if (d < 0) rel = t("expired");
  else if (d <= soonDays()) rel = month ? t("month_end") : d === 0 ? t("today") : t("days", { n: d });
  return { date, rel };
}

// ---------------------------------------------------------------------------
// Mount and paint
// ---------------------------------------------------------------------------
function mount(root) {
  chipsSig = "";
  root.innerHTML =
    header({
      eyebrow: t("pantry_count", { n: state.pantry.length }), title: t("pantry_title"),
      buttons: [{ act: "pantry-add", icon: "plus", label: t("list_add") }, settingsButton()]
    }) +
    '<label class="note" data-hide-tabbar>' + icon("search") + '<input type="search" data-search placeholder="' + esc(t("pantry_search")) + '" aria-label="' + esc(t("pantry_search")) + '" enterkeyhint="search" autocomplete="off" value="' + esc(query) + '"></label>' +
    '<div class="chips" data-chips role="group" aria-label="' + esc(t("list_category")) + '"></div>' +
    '<div class="stack pantry" data-body></div>';
  root.querySelector("[data-search]").addEventListener("input", (e) => { query = e.target.value; paint(root); });
  root.querySelector("[data-chips]").addEventListener("click", (e) => {
    const b = e.target.closest("[data-chip]");
    if (!b) return;
    chip = b.dataset.chip;
    paint(root);
  });
  root.querySelector("[data-body]").addEventListener("click", (e) => {
    const row = e.target.closest("[data-id]");
    if (row) return openItem(row.dataset.id);
    const jump = e.target.closest("[data-jump]");
    if (jump) {
      const el = root.querySelector('[data-k="' + jump.dataset.jump + '"]');
      if (el) el.scrollIntoView({ block: "start", behavior: reducedMotion() ? "auto" : "smooth" });
      return;
    }
    if (e.target.closest("[data-add-pantry]")) return openAdd(query.trim());
    if (e.target.closest("[data-add-list]")) return addQueryToList();
  });
  paint(root);
}

function update(root) {
  setEyebrow(root, t("pantry_count", { n: state.pantry.length }));
  paint(root);
}

const mk = (html) => { const tpl = document.createElement("template"); tpl.innerHTML = html.trim(); return tpl.content.firstElementChild; };

// Brings `parent`'s children in line with `items` ([{ key, html, sig?, after? }]): existing elements
// whose signature is unchanged stay as they are, new ones are created, extra ones removed.
function sync(parent, items) {
  const have = new Map();
  for (const c of parent.children) have.set(c.dataset.k, c);
  let prev = null;
  for (const it of items) {
    const sig = it.sig ?? it.html;
    let el = have.get(it.key);
    have.delete(it.key);
    if (!el) { el = mk(it.html); el._s = sig; }
    else if (el._s !== sig) { const n = mk(it.html); n._s = sig; el.replaceWith(n); el = n; }
    const want = prev ? prev.nextElementSibling : parent.firstElementChild;
    if (el !== want) parent.insertBefore(el, want);
    prev = el;
    if (it.after) it.after(el);
  }
  for (const el of have.values()) el.remove();
}

function rowHtml(p, alert) {
  const cat = catName(p.categoryId);
  const amount = fmtAmount(p.amount, p.unit);
  const e = expiry(p);
  let sub, val, small = "";
  if (alert) {
    sub = e.date ? [cat, amount].filter(Boolean).join(", ") : cat;
    val = e.date || amount || p.note || "";
    small = e.date ? e.rel : "";
  } else {
    sub = e.date ? t("pantry_until", { date: e.date }) : amount ? p.note || "" : "";
    val = amount || p.note || "";
  }
  return '<button type="button" class="rowbtn" data-k="' + esc(p.id) + '" data-id="' + esc(p.id) + '">' +
    '<span class="ic">' + icon(categoryGlyph(catById(p.categoryId) ? cat : "")) + "</span>" +
    '<span class="nm">' + esc(p.name) + (sub ? '<span class="sub">' + esc(sub) + "</span>" : "") + "</span>" +
    '<span class="val">' + esc(val) + (small ? "<small>" + esc(small) + "</small>" : "") + "</span></button>";
}

function paint(root) {
  const body = root.querySelector("[data-body]");
  if (!body) return;
  const q = nameKey(query);
  const used = new Set(state.pantry.map((p) => p.categoryId));
  if (chip && !used.has(chip)) chip = "";

  // Chips: "Wszystko" and the categories that have items, in aisle order.
  const cats = [...state.categories].sort((a, b) => a.position - b.position);
  const chipList = [{ id: "", name: t("pantry_all") }, ...cats.filter((c) => used.has(c.id))];
  const chipsEl = root.querySelector("[data-chips]");
  const sig = chipList.map((c) => c.id + c.name).join("|");
  if (sig !== chipsSig) {
    chipsSig = sig;
    chipsEl.innerHTML = chipList.map((c) =>
      '<button type="button" class="chip" data-chip="' + esc(c.id) + '" aria-pressed="false">' +
      (c.id ? "<i>" + icon(categoryGlyph(c.name)) + "</i>" : "") + esc(c.name) + "</button>").join("");
  }
  chipsEl.querySelectorAll("[data-chip]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.chip === chip)));

  const items = state.pantry
    .filter((p) => (!q || (p.nameKey || nameKey(p.name)).includes(q)) && (!chip || p.categoryId === chip))
    .sort((a, b) => collator.compare(a.name, b.name));

  const sections = []; // { key, title, rows: [{ p, alert }] }
  const alerts = new Set();
  let soon = [], low = [];
  if (!q) {
    soon = items.filter(isSoon).sort((a, b) => daysLeft(a) - daysLeft(b));
    low = items.filter(isLow);
    if (soon.length) sections.push({ key: "soon", title: t("pantry_soon"), rows: soon.map((p) => ({ p, alert: true })) });
    if (low.length) sections.push({ key: "low", title: t("pantry_low"), rows: low.map((p) => ({ p, alert: true })) });
    soon.forEach((p) => alerts.add(p.id));
    low.forEach((p) => alerts.add(p.id));
  }
  const byCat = new Map();
  for (const p of items) {
    if (alerts.has(p.id)) continue;
    const k = catById(p.categoryId) ? p.categoryId : "";
    if (!byCat.has(k)) byCat.set(k, []);
    byCat.get(k).push({ p, alert: false });
  }
  [...byCat.entries()]
    .sort(([a], [b]) => (a ? catById(a).position : 1e9) - (b ? catById(b).position : 1e9))
    .forEach(([k, rows]) => sections.push({ key: "c:" + k, title: k ? catName(k) : t("list_no_category"), rows }));

  const blocks = [];
  if (!q && (soon.length || low.length)) {
    const tile = (n, label, key, warn) =>
      '<button type="button" class="tile" data-jump="' + key + '"' + (n ? "" : " disabled") + '><div class="v">' + n + '</div><div class="k">' +
      (warn && n ? "<i></i>" : "") + esc(label) + "</div></button>";
    blocks.push({ key: "tiles", html: '<div class="tiles" data-k="tiles">' + tile(soon.length, t("pantry_soon"), "soon", true) + tile(low.length, t("pantry_low"), "low", false) + "</div>" });
  }
  for (const s of sections) {
    blocks.push({
      key: s.key,
      html: '<section class="psec" data-k="' + esc(s.key) + '"><div class="sechead"><h2>' + esc(s.title) + "</h2><span></span></div><div class=\"group\"></div></section>",
      sig: s.title,
      after(el) {
        const n = el.querySelector(".sechead span");
        if (n.textContent !== String(s.rows.length)) n.textContent = s.rows.length;
        sync(el.querySelector(".group"), s.rows.map((r) => ({ key: r.p.id, html: rowHtml(r.p, r.alert) })));
      }
    });
  }
  if (!sections.length) blocks.push({ key: "empty", html: emptyHtml(q), sig: emptyHtml(q) });
  sync(body, blocks);

  if (flashId) {
    const id = flashId;
    flashId = "";
    requestAnimationFrame(() => setTimeout(() => {
      const el = root.querySelector('[data-id="' + CSS.escape(id) + '"]');
      if (!el) return;
      el.scrollIntoView({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" });
      el.classList.remove("flash");
      void el.offsetWidth;
      el.classList.add("flash");
    }, 60));
  }
}

// P3 (search with no hits) and the empty pantry.
function emptyHtml(q) {
  if (q) {
    const text = query.trim();
    return '<div class="empty" data-k="empty"><span class="ic">' + icon("jar") + "</span><b>" + esc(t("pantry_none", { q: text })) + "</b>" +
      "<span>" + esc(t("pantry_zero")) + "</span>" +
      '<div class="acts"><button type="button" class="btn" data-add-pantry>' + esc(t("pantry_add")) + "</button>" +
      '<button type="button" class="btn black" data-add-list>' + esc(t("pantry_to_list")) + "</button></div></div>";
  }
  if (chip || state.pantry.length) return '<div class="empty" data-k="empty"><span class="ic">' + icon("jar") + "</span><b>" + esc(t("pantry_nothing")) + "</b></div>";
  return '<div class="empty" data-k="empty"><span class="ic">' + icon("jar") + "</span><b>" + esc(t("pantry_empty_title")) + "</b><span>" + esc(t("pantry_empty_tip")) +
    '</span><button type="button" class="btn black" data-add-pantry>' + icon("plus") + esc(t("pantry_add")) + "</button></div>";
}

// "Dodaj do listy" on the no-results screen: the typed text goes through the same parser as the
// list's add field.
function addQueryToList() {
  const p = parseItem(query, unitCodes());
  if (!p.name) return;
  const res = addToList({ name: p.name, amount: p.amount, unit: p.unit, categoryId: guessCategory(p.name) });
  listToast(res);
}

function listToast(res) {
  if (!res) return;
  toast(t(res.status === "new" ? "pantry_on_list" : res.status === "merged" ? "list_already" : "list_back_on", { name: res.name }));
}

// ---------------------------------------------------------------------------
// Add to the pantry (from P3 and the + button)
// ---------------------------------------------------------------------------
function openAdd(prefill = "") {
  let categoryId = null;
  let manual = false; // the category was picked by hand: stop guessing
  openSheet({
    title: t("pantry_add"),
    body:
      '<form class="stack" novalidate style="gap:12px">' +
      '<div><label class="lbl" for="a-text">' + esc(t("list_name")) + '</label>' +
      '<input class="fld" id="a-text" name="text" maxlength="140" autocomplete="off" autocapitalize="sentences" spellcheck="false" enterkeyhint="done" autofocus placeholder="' + esc(t("list_add")) + '" value="' + esc(prefill) + '"></div>' +
      '<p class="hint" data-hint></p>' +
      "<div>" + categoryFieldHtml(null) + "</div>" +
      '<button type="submit" class="btn black wide">' + esc(t("pantry_add")) + "</button></form>",
    onMount(sheet, close) {
      const form = sheet.querySelector("form");
      const hint = sheet.querySelector("[data-hint]");
      const parsed = () => parseItem(form.text.value, unitCodes());
      const setCat = (id) => {
        categoryId = id;
        sheet.querySelector("[data-catname]").textContent = catName(id);
        sheet.querySelector("[data-pick] .ic").innerHTML = icon(categoryGlyph(id ? catName(id) : ""));
      };
      // The hint shows what will be saved: "Kuskus, 500 g".
      const refresh = () => {
        const p = parsed();
        if (!manual) setCat(p.name ? guessCategory(p.name) : null);
        hint.textContent = p.name ? [p.name, fmtAmount(p.amount, p.unit)].filter(Boolean).join(", ") : t("pantry_add_tip");
      };
      bindCategoryField(sheet, null, (id) => { manual = true; categoryId = id; });
      form.text.addEventListener("input", refresh);
      refresh();
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const p = parsed();
        if (!p.name) { toast(t("list_err_name")); form.text.focus(); return; }
        close();
        addToPantry({ name: p.name.slice(0, 120), amount: p.amount, unit: p.unit, categoryId });
      });
    }
  });
}

// A name that is already in the pantry gets the amount added (same unit, or no amount yet) instead
// of a second row, like move_checked_to_pantry does for bought items.
function addToPantry({ name, amount, unit, categoryId }) {
  const key = nameKey(name);
  const hit = state.pantry.find((p) => nameKey(p.name) === key);
  if (hit) {
    const patch = {};
    if (amount != null) {
      if (hit.amount == null || hit.amount === 0) { patch.amount = amount; patch.unit = unit; }
      else if ((hit.unit || null) === (unit || null)) patch.amount = Math.round((hit.amount + amount) * 1000) / 1000;
    }
    if (hit.low) patch.low = false;
    if (!hit.categoryId && categoryId) patch.categoryId = categoryId;
    if (Object.keys(patch).length) updateRow("pantry", hit.id, patch);
    flashId = hit.id;
    toast(t(Object.keys(patch).length ? "pantry_more" : "pantry_already", { name: hit.name }));
    return;
  }
  const res = insertRow("pantry", {
    name, amount, unit: amount != null ? unit : null, categoryId: categoryId || null,
    bestBefore: null, bestBeforePrecision: "day", low: false, note: null
  });
  toast(t("pantry_added", { name }));
  if (categoryId) learnFromAdd(name, categoryId);
  query = ""; chip = "";
  const input = document.querySelector("[data-search]");
  if (input) input.value = "";
  // The new row is local at once; scroll to it after the next paint.
  const row = state.pantry.find((p) => nameKey(p.name) === key);
  if (row) flashId = row.id;
  return res;
}

// A category picked by hand for a new product teaches the household, as on the list.
function learnFromAdd(name, categoryId) {
  if (guessCategory(name) !== categoryId) learnRule(name, categoryId);
}

// ---------------------------------------------------------------------------
// P2: item sheet. Changes are live: they show in the sheet at once and are saved after a short
// pause (or when the sheet closes), as one write per burst of taps.
// ---------------------------------------------------------------------------
// Stepper size by unit: whole items by 1, weights and volumes by a sensible pinch.
export function stepFor(unit, amount) {
  const a = Number(amount) || 0;
  switch (unit) {
    case "g": return a < 100 ? 10 : 50;
    case "dag": return 5;
    case "kg": return 0.25;
    case "ml": return a < 100 ? 10 : 50;
    case "l": return 0.5;
    default: return 1;
  }
}

const round3 = (n) => Math.round(n * 1000) / 1000;

function openItem(id) {
  const it = byId("pantry", id);
  if (!it) return;
  const draft = {};   // fields changed in this sheet, not saved yet
  let timer = 0;
  const cur = () => ({ ...(byId("pantry", id) || it), ...draft });

  const flush = () => {
    clearTimeout(timer);
    timer = 0;
    const live = byId("pantry", id);
    if (!live) return;
    const patch = {};
    for (const k in draft) if ((live[k] ?? null) !== draft[k]) patch[k] = draft[k];
    for (const k in draft) delete draft[k];
    if (!Object.keys(patch).length) return;
    updateRow("pantry", id, patch);
    if ("categoryId" in patch && patch.categoryId) learnRule(live.name, patch.categoryId);
  };
  const set = (patch) => { Object.assign(draft, patch); clearTimeout(timer); timer = setTimeout(flush, 450); };

  const stepperHtml = () => {
    const c = cur();
    const v = c.amount == null ? "–" : fmtNum(c.amount);
    return '<div class="step"><button type="button" class="round" data-step="-1" aria-label="' + esc(t("pantry_less")) + '">' + icon("minus") + "</button>" +
      '<span class="v" aria-live="polite">' + esc(v) + (c.unit && c.amount != null ? "<small>" + esc(unitLabel(c.unit, c.amount)) + "</small>" : "") + "</span>" +
      '<button type="button" class="round" data-step="1" aria-label="' + esc(t("pantry_more_btn")) + '">' + icon("plus") + "</button></div>";
  };

  const c0 = cur();
  const precision0 = c0.bestBeforePrecision === "month" ? "month" : "day";
  const pickerHtml = (c) => {
    if ((c.bestBeforePrecision === "month")) {
      const [y, m] = c.bestBefore ? String(c.bestBefore).split("-").map(Number) : [0, 0];
      const now = new Date().getFullYear();
      const years = [];
      for (let yy = now - 1; yy <= now + 12; yy++) years.push(yy);
      if (y && !years.includes(y)) years.push(y);
      return '<div class="duo"><select class="fld" data-month aria-label="' + esc(t("pantry_month")) + '"><option value="">' + esc(t("pantry_month")) + "</option>" +
        dict("months_long").map((n, i) => '<option value="' + (i + 1) + '"' + (m === i + 1 ? " selected" : "") + ">" + esc(n) + "</option>").join("") + "</select>" +
        '<select class="fld" data-year aria-label="' + esc(t("pantry_year")) + '"><option value="">' + esc(t("pantry_year")) + "</option>" +
        years.sort((a, b) => a - b).map((yy) => '<option value="' + yy + '"' + (y === yy ? " selected" : "") + ">" + yy + "</option>").join("") + "</select></div>";
    }
    // A label over a transparent date input: iOS shows an empty date input as a blank box.
    const v = c.bestBefore ? String(c.bestBefore).slice(0, 10) : "";
    return '<label class="fld datefld"><span' + (v ? "" : ' class="ph"') + ">" + esc(v ? fmtDay(v) + " " + v.slice(0, 4) : t("pantry_pick_day")) + "</span>" + icon("down", "chev") +
      '<input type="date" data-day aria-label="' + esc(t("pantry_day")) + '" value="' + esc(v) + '"></label>';
  };
  const expiryHtml = () => {
    const c = cur();
    const mo = c.bestBeforePrecision === "month";
    return '<div class="seg" role="group" aria-label="' + esc(t("pantry_expiry")) + '" style="margin-bottom:8px">' +
      '<button type="button" data-prec="day" aria-pressed="' + !mo + '">' + esc(t("pantry_day")) + "</button>" +
      '<button type="button" data-prec="month" aria-pressed="' + mo + '">' + esc(t("pantry_month")) + "</button></div>" +
      pickerHtml(c) +
      (c.bestBefore ? '<button type="button" class="link" data-clear-date>' + esc(t("pantry_no_expiry")) + "</button>" : "");
  };

  openSheet({
    title: it.name,
    onClose: flush,
    body:
      '<div class="stack item" style="gap:14px">' +
      '<p class="subline">' + esc(catName(it.categoryId)) + "</p>" +
      '<div><span class="lbl" id="p-amount">' + esc(t("list_amount")) + '</span><div data-stepper>' + stepperHtml() + "</div></div>" +
      '<div class="units"><span class="lbl" id="p-unit">' + esc(t("list_unit")) + "</span>" + unitChipsHtml(it.unit || null, "p-unit") + "</div>" +
      '<button type="button" class="tgl" role="switch" data-low aria-checked="' + !!it.low + '"><span>' + esc(t("pantry_low")) + '</span><span class="sw" aria-hidden="true"><i></i></span></button>' +
      '<div><span class="lbl">' + esc(t("pantry_expiry")) + '</span><div data-expiry>' + expiryHtml() + "</div></div>" +
      "<div>" + categoryFieldHtml(catById(it.categoryId) ? it.categoryId : null) + "</div>" +
      '<div><label class="lbl" for="p-note">' + esc(t("list_note")) + '</label><input class="fld" id="p-note" name="note" maxlength="500" autocomplete="off" placeholder="' + esc(t("list_note_ph")) + '" value="' + esc(it.note || "") + '"></div>' +
      '<div class="acts"><button type="button" class="btn danger" data-delete>' + esc(t("list_delete")) + '</button>' +
      '<button type="button" class="btn" data-tolist>' + icon("cart") + esc(t("pantry_to_list")) + "</button></div>" +
      '<button type="button" class="btn black wide" data-done>' + esc(t("done")) + "</button></div>",
    onMount(sheet, close) {
      const stepper = sheet.querySelector("[data-stepper]");
      const expiryBox = sheet.querySelector("[data-expiry]");
      const lowBtn = sheet.querySelector("[data-low]");
      const redo = () => { stepper.innerHTML = stepperHtml(); };

      stepper.addEventListener("click", (e) => {
        const b = e.target.closest("[data-step]");
        if (!b) return;
        const c = cur();
        const dir = Number(b.dataset.step);
        const step = stepFor(c.unit, c.amount);
        let amount;
        if (c.amount == null) amount = dir > 0 ? step : null;
        else amount = Math.max(0, round3(c.amount + dir * step));
        if (amount === (c.amount ?? null)) return;
        set({ amount, ...(amount != null && amount > 0 && c.low && dir > 0 ? { low: false } : {}) });
        if (cur().low !== (lowBtn.getAttribute("aria-checked") === "true")) lowBtn.setAttribute("aria-checked", String(cur().low));
        redo();
        if (navigator.vibrate) navigator.vibrate(6);
      });
      bindUnitChips(sheet, it.unit || null, (u) => { set({ unit: u }); redo(); });
      lowBtn.addEventListener("click", () => {
        const on = lowBtn.getAttribute("aria-checked") !== "true";
        lowBtn.setAttribute("aria-checked", String(on));
        set({ low: on });
      });

      // Termin: Dzień / Miesiąc
      const setDate = (bestBefore, bestBeforePrecision) => { set({ bestBefore, bestBeforePrecision }); };
      expiryBox.addEventListener("click", (e) => {
        const pr = e.target.closest("[data-prec]");
        if (pr) {
          const c = cur();
          const next = pr.dataset.prec;
          if (next === (c.bestBeforePrecision || "day")) return;
          if (c.bestBefore) {
            const [y, m] = String(c.bestBefore).split("-").map(Number);
            setDate(next === "month" ? lastDayOf(y, m) : String(c.bestBefore).slice(0, 10), next);
          } else set({ bestBeforePrecision: next });
          expiryBox.innerHTML = expiryHtml();
          return;
        }
        if (e.target.closest("[data-clear-date]")) { set({ bestBefore: null }); expiryBox.innerHTML = expiryHtml(); }
      });
      expiryBox.addEventListener("change", (e) => {
        if (e.target.matches("[data-day]")) {
          setDate(e.target.value || null, "day");
          expiryBox.innerHTML = expiryHtml();
        } else if (e.target.matches("[data-month],[data-year]")) {
          const m = Number(expiryBox.querySelector("[data-month]").value);
          const y = Number(expiryBox.querySelector("[data-year]").value);
          if (m && y) { setDate(lastDayOf(y, m), "month"); expiryBox.innerHTML = expiryHtml(); }
          else if (!m && !y) { set({ bestBefore: null }); expiryBox.innerHTML = expiryHtml(); }
        }
      });

      bindCategoryField(sheet, catById(it.categoryId) ? it.categoryId : null, (cid) => set({ categoryId: cid }));
      sheet.querySelector("[name=note]").addEventListener("input", (e) => set({ note: e.target.value.trim() || null }));

      sheet.querySelector("[data-done]").addEventListener("click", () => close());
      sheet.querySelector("[data-tolist]").addEventListener("click", () => {
        const c = cur();
        close();
        listToast(addToList({ name: c.name, categoryId: c.categoryId }));
      });
      sheet.querySelector("[data-delete]").addEventListener("click", () => {
        clearTimeout(timer);
        for (const k in draft) delete draft[k];
        close();
        deleteRow("pantry", id, { undoLabel: t("toast_deleted", { name: it.name }) });
      });
    }
  });
}

on({ "pantry-add": () => openAdd() });
registerView("pantry", { tab: true, mount, update });
