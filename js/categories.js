// Categories and their order (from the settings sheet): rename, add, delete with undo, and reorder
// by dragging the handle (pointer events, so it works with a finger and a mouse) or with the arrow
// keys on the focused handle. The order is the aisle order of the shopping list (categories.position).
import { t } from "./i18n.js";
import { esc, icon, openSheet, toast, undoToast } from "./ui.js";
import { state, onChange, insertRow, updateRow, insertRows, updateRows, optimistic, putLocal, dropLocal, getBackend } from "./store.js";
import { openSettings } from "./settings.js";
import { nameKey } from "./parse.js";

const sorted = () => [...state.categories].sort((a, b) => a.position - b.position || String(a.name).localeCompare(b.name, "pl"));
const usage = (id) => state.shopping.filter((s) => s.categoryId === id).length + state.pantry.filter((p) => p.categoryId === id).length;

function rowsHtml() {
  return sorted().map((c) => {
    const n = usage(c.id);
    return '<div class="catrow" data-id="' + esc(c.id) + '">' +
      '<button type="button" class="handle" data-handle aria-label="' + esc(t("cat_move", { name: c.name })) + '">' + icon("grip") + "</button>" +
      '<button type="button" class="nm" data-rename aria-label="' + esc(t("cat_rename") + ", " + c.name) + '">' + esc(c.name) +
      (n ? "<small>" + esc(t("cat_items", { n })) + "</small>" : "") + "</button>" +
      '<button type="button" class="round" data-delete aria-label="' + esc(t("cat_delete", { name: c.name })) + '">' + icon("trash") + "</button></div>";
  }).join("");
}

export function openCategories() {
  let off = null;
  openSheet({
    title: t("set_categories"),
    tall: true,
    body:
      "<p>" + esc(t("cat_hint")) + "</p>" +
      '<div class="stack cats" data-cats>' + rowsHtml() + "</div>" +
      '<form class="tin" data-add autocomplete="off" novalidate style="margin-top:4px">' +
      '<input name="name" maxlength="40" enterkeyhint="done" placeholder="' + esc(t("cat_add")) + '" aria-label="' + esc(t("cat_add")) + '">' +
      '<button class="go" type="submit" aria-label="' + esc(t("cat_add")) + '">' + icon("plus") + "</button></form>",
    onMount(sheet) {
      const box = sheet.querySelector("[data-cats]");
      let dragging = false;
      const repaint = () => {
        if (dragging) return;
        const a = document.activeElement;
        const keep = a && box.contains(a) && a.closest(".catrow")
          ? { id: a.closest(".catrow").dataset.id, attr: ["data-handle", "data-rename", "data-delete"].find((k) => a.hasAttribute(k)) } : null;
        box.innerHTML = rowsHtml();
        if (keep) {
          const el = box.querySelector('.catrow[data-id="' + CSS.escape(keep.id) + '"] [' + keep.attr + "]");
          if (el) el.focus({ preventScroll: true });
        }
      };
      off = onChange((c) => { if (c.has("all") || c.has("categories") || c.has("shopping") || c.has("pantry")) repaint(); });

      box.addEventListener("click", (e) => {
        const row = e.target.closest(".catrow");
        if (!row) return;
        const id = row.dataset.id;
        if (e.target.closest("[data-rename]")) return renameSheet(id);
        if (e.target.closest("[data-delete]")) return removeCategory(id);
      });

      // Arrow keys on a focused handle move the category one place.
      box.addEventListener("keydown", (e) => {
        const h = e.target.closest("[data-handle]");
        if (!h || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
        e.preventDefault();
        const ids = sorted().map((c) => c.id);
        const id = h.closest(".catrow").dataset.id;
        const i = ids.indexOf(id), j = i + (e.key === "ArrowUp" ? -1 : 1);
        if (j < 0 || j >= ids.length) return;
        ids.splice(i, 1);
        ids.splice(j, 0, id);
        saveOrder(ids);
      });

      initDrag(sheet, box, (on) => { dragging = on; if (!on) repaint(); });

      const form = sheet.querySelector("[data-add]");
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const name = form.name.value.replace(/\s+/g, " ").trim();
        if (!validName(name)) return;
        form.name.value = "";
        const last = sorted().pop();
        insertRow("categories", { name, nameKey: nameKey(name), position: (last ? last.position : 0) + 1 });
      });
    },
    onClose(replaced) { if (off) off(); if (!replaced) openSettings(); }
  });
}

function validName(name, exceptId) {
  if (!name || name.length > 40) { toast(t("cat_err_name")); return false; }
  if (state.categories.some((c) => c.id !== exceptId && nameKey(c.name) === nameKey(name))) { toast(t("cat_exists")); return false; }
  return true;
}

// New positions 1…n in the given order; only rows whose position changes are written.
function saveOrder(ids) {
  ids.forEach((id, i) => {
    const c = state.categories.find((x) => x.id === id);
    if (c && c.position !== i + 1) updateRow("categories", id, { position: i + 1 });
  });
}

// ---------------------------------------------------------------------------
// Drag to reorder: the row follows the finger, the others slide out of the way, and the sheet
// scrolls when the finger is near its top or bottom edge.
// ---------------------------------------------------------------------------
function initDrag(sheet, box, setDragging) {
  let d = null;
  box.addEventListener("pointerdown", (e) => {
    const h = e.target.closest("[data-handle]");
    if (!h || e.button > 0) return;
    e.preventDefault();
    const row = h.closest(".catrow");
    const rows = [...box.querySelectorAll(".catrow")];
    const rects = rows.map((r) => r.getBoundingClientRect());
    const from = rows.indexOf(row);
    d = { row, rows, rects, from, to: from, startY: e.clientY, startScroll: sheet.scrollTop, y: e.clientY, raf: 0 };
    h.setPointerCapture(e.pointerId);
    row.classList.add("drag");
    rows.forEach((r) => { if (r !== row) r.classList.add("shift"); });
    setDragging(true);
    if (navigator.vibrate) navigator.vibrate(8);
    const tickScroll = () => {
      if (!d) return;
      const s = sheet.getBoundingClientRect();
      const edge = 56;
      if (d.y < s.top + edge) sheet.scrollTop -= 6;
      else if (d.y > s.bottom - edge) sheet.scrollTop += 6;
      move();
      d.raf = requestAnimationFrame(tickScroll);
    };
    d.raf = requestAnimationFrame(tickScroll);
  });
  const move = () => {
    if (!d) return;
    const dy = d.y - d.startY + (sheet.scrollTop - d.startScroll);
    d.row.style.transform = "translateY(" + dy + "px)";
    const r0 = d.rects[d.from];
    const mid = r0.top + r0.height / 2 + dy;
    let to = d.from;
    d.rects.forEach((r, i) => {
      const m = r.top + r.height / 2;
      if (i < d.from && mid < m) to = Math.min(to, i);
      if (i > d.from && mid > m) to = Math.max(to, i);
    });
    d.to = to;
    const step = r0.height + 2; // row height + gap
    d.rows.forEach((r, i) => {
      if (r === d.row) return;
      let shift = 0;
      if (d.from < to && i > d.from && i <= to) shift = -step;
      if (d.from > to && i < d.from && i >= to) shift = step;
      r.style.transform = shift ? "translateY(" + shift + "px)" : "";
    });
  };
  box.addEventListener("pointermove", (e) => { if (d) { d.y = e.clientY; move(); } });
  const end = () => {
    if (!d) return;
    cancelAnimationFrame(d.raf);
    const { rows, from, to } = d;
    rows.forEach((r) => { r.style.transform = ""; r.classList.remove("drag", "shift"); });
    d = null;
    if (from !== to) {
      const ids = rows.map((r) => r.dataset.id);
      const [id] = ids.splice(from, 1);
      ids.splice(to, 0, id);
      saveOrder(ids);
    }
    setDragging(false);
  };
  box.addEventListener("pointerup", end);
  box.addEventListener("pointercancel", end);
  box.addEventListener("lostpointercapture", end);
}

// ---------------------------------------------------------------------------
// Rename and delete
// ---------------------------------------------------------------------------
function renameSheet(id) {
  const c = state.categories.find((x) => x.id === id);
  if (!c) return;
  openSheet({
    title: t("cat_rename"),
    body: '<form class="stack" novalidate style="gap:12px"><input class="fld" name="name" maxlength="40" autocomplete="off" aria-label="' + esc(t("cat_rename")) + '" value="' + esc(c.name) + '" autofocus>' +
      '<button class="btn black wide" type="submit">' + esc(t("save")) + "</button></form>",
    onMount(sheet, close) {
      sheet.querySelector("form").addEventListener("submit", (e) => {
        e.preventDefault();
        const name = e.target.name.value.replace(/\s+/g, " ").trim();
        if (name === c.name) { close(); return; }
        if (!validName(name, id)) return;
        updateRow("categories", id, { name, nameKey: nameKey(name) });
        close();
      });
    },
    onClose(replaced) { if (!replaced) openCategories(); }
  });
}

// Deleting a category: its items fall back to uncategorized and its rules go (the database does
// both: on delete set null / cascade). Undo puts the category, its rules and the item links back.
async function removeCategory(id) {
  const cat = state.categories.find((x) => x.id === id);
  if (!cat) return;
  const rules = state.categoryRules.filter((r) => r.categoryId === id);
  const shop = state.shopping.filter((s) => s.categoryId === id);
  const pantry = state.pantry.filter((p) => p.categoryId === id);
  const ok = await optimistic({
    ids: [id, ...rules.map((r) => r.id), ...shop.map((s) => s.id), ...pantry.map((p) => p.id)],
    what: "categories",
    apply: () => {
      dropLocal("categories", id);
      rules.forEach((r) => dropLocal("categoryRules", r.id));
      shop.forEach((s) => putLocal("shopping", { ...s, categoryId: null }));
      pantry.forEach((p) => putLocal("pantry", { ...p, categoryId: null }));
    },
    save: () => getBackend().remove("categories", id),
    rollback: () => {
      putLocal("categories", cat);
      rules.forEach((r) => putLocal("categoryRules", r));
      shop.forEach((s) => putLocal("shopping", s));
      pantry.forEach((p) => putLocal("pantry", p));
    }
  });
  if (!ok) return;
  undoToast(t("toast_deleted", { name: cat.name }), async () => {
    if (!(await insertRows("categories", [cat]))) return;
    if (rules.length) insertRows("categoryRules", rules);
    if (shop.length) updateRows("shopping", shop.map((s) => s.id), { categoryId: id });
    if (pantry.length) updateRows("pantry", pantry.map((p) => p.id), { categoryId: id });
  });
}
