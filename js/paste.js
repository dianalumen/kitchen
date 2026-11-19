// Multi-line paste (M7.1): a paste with line breaks becomes one entry per line, with a preview
// sheet before anything is added and one undo for the whole batch. Single-line pastes are left
// to the browser, so they behave exactly as before.
import { t } from "./i18n.js";
import { esc, icon, openSheet, undoToast } from "./ui.js";
import { state, updateRow, deleteRows } from "./store.js";
import { splitLines } from "./parse.js";

// Calls handler(lines, event) for a paste of two or more lines; anything else pastes as usual.
export function onMultiPaste(el, handler, { when } = {}) {
  el.addEventListener("paste", (e) => {
    if (when && !when(e)) return;
    const text = e.clipboardData ? e.clipboardData.getData("text/plain") || e.clipboardData.getData("text") : "";
    const lines = splitLines(text);
    if (lines.length < 2) return;
    e.preventDefault();
    handler(lines, e);
  });
}

// Sheet with the lines; each can be removed. entries: [{ text, sub? }]. The button names the result
// ("Dodaj 7 pozycji") and calls onConfirm(kept indexes). Opens over the current sheet.
export function previewBatch({ entries, buttonKey, onConfirm }) {
  let kept = entries.map((_, i) => i);
  const rowsHtml = () => kept.map((i) => {
    const e = entries[i];
    return '<div class="pvrow" data-i="' + i + '"><span class="nm">' + esc(e.text) + (e.sub ? '<span class="mn">' + esc(e.sub) + "</span>" : "") + "</span>" +
      '<button type="button" class="round" data-rm aria-label="' + esc(t("paste_remove", { name: e.text })) + '">' + icon("trash") + "</button></div>";
  }).join("");
  openSheet({
    title: t("paste_title"),
    stack: true,
    body: '<p>' + esc(t("paste_hint")) + '</p><div class="pv" data-pv>' + rowsHtml() + '</div>' +
      '<button type="button" class="btn black wide" data-ok autofocus></button>',
    onMount(sheet, close) {
      const box = sheet.querySelector("[data-pv]");
      const ok = sheet.querySelector("[data-ok]");
      const label = () => { ok.textContent = t(buttonKey, { n: kept.length }); };
      label();
      box.addEventListener("click", (e) => {
        const b = e.target.closest("[data-rm]");
        if (!b) return;
        const next = b.closest(".pvrow").nextElementSibling || b.closest(".pvrow").previousElementSibling;
        kept = kept.filter((i) => i !== Number(b.closest(".pvrow").dataset.i));
        if (!kept.length) { close(); return; }
        box.innerHTML = rowsHtml();
        label();
        const again = next && box.querySelector('[data-i="' + next.dataset.i + '"] [data-rm]');
        if (again) again.focus({ preventScroll: true });
      });
      ok.addEventListener("click", () => { const k = kept.slice(); close(); onConfirm(k); });
    }
  });
}

// Undo for a batch that went through the store: remember the collection before, and undo deletes
// the rows that were added and puts back the listed fields of rows that were merged into.
export const snapshot = (coll) => new Map(state[coll].map((r) => [r.id, { ...r }]));

export function undoBatch(coll, snap, fields) {
  const added = [];
  for (const r of state[coll]) {
    const old = snap.get(r.id);
    if (!old) { added.push(r.id); continue; }
    const patch = {};
    for (const f of fields) if ((old[f] ?? null) !== (r[f] ?? null)) patch[f] = old[f] ?? null;
    if (Object.keys(patch).length) updateRow(coll, r.id, patch);
  }
  if (added.length) deleteRows(coll, added);
}

// "Dodano 7 pozycji" with Cofnij.
export function batchToast(messageKey, n, onUndo) {
  undoToast(t(messageKey, { n }), onUndo);
}
