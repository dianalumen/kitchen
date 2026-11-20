// R3: recipe editor in a tall bottom sheet (88 vh, scrolls inside; Zapisz stays in the sticky
// head). Photo (resized in the browser, uploaded with the save), name, meal type, prep and cook
// time, servings, ingredients with section headers, and steps with optional timers. Ingredients,
// sections and steps reorder by dragging their handle.
//
// The editor works on a draft; nothing is written until Zapisz, then the recipe, its ingredients
// and steps go out as one optimistic write (saveRecipe in js/recipes-data.js). Closing with
// unsaved changes offers "Przywróć" in a toast, so a long recipe is never lost to a stray tap.
import { t, fmtNum } from "./i18n.js";
import { esc, icon, openSheet, toast } from "./ui.js";
import { state, byId, newId } from "./store.js";
import { go } from "./shell.js";
import { parseItem, toNumber, unitFor, splitSentences } from "./parse.js";
import { onMultiPaste, previewBatch, batchToast } from "./paste.js";
import { unitCodes } from "./pickers.js";
import { initDrag } from "./drag.js";
import {
  MEALS, mealGlyph, ingredientsOf, stepsOf, saveRecipe, deleteRecipe, photoUrl, newPhotoPath, keepLocal, resizeImage, photoError
} from "./recipes-data.js";

let seq = 0;
const key = () => "n" + ++seq;

// Units the parser knows: the household's codes plus any unit already used in a recipe ("ząbek").
function codes() {
  const set = new Set(unitCodes());
  state.ingredients.forEach((i) => { if (i.unit) set.add(i.unit); });
  return [...set];
}

// "150 g" → { amount: 150, unit: "g" }; "szczypta" → { amount: null, unit: "szczypta" }.
const NUM_RE = /^(\d+(?:[.,]\d+)?|\d+\/\d+|½|¼|¾)\s*(.*)$/;
function parseQty(text) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  if (!s) return { amount: null, unit: null };
  const m = NUM_RE.exec(s);
  const unit = (u) => (u ? (unitFor(u, codes()) || u).slice(0, 20) : null);
  if (m) {
    const n = toNumber(m[1]);
    return { amount: n > 0 && n < 1e6 ? Math.round(n * 1000) / 1000 : null, unit: unit(m[2]) };
  }
  return { amount: null, unit: unit(s) };
}
const qtyText = (amount, unit) => (amount != null ? fmtNum(amount) + (unit ? " " + unit : "") : unit || "");

// "Tuńczyk, w puszce" ↔ name "Tuńczyk" + note "w puszce". Only a comma followed by a space splits,
// so "Mleko 3,2%" stays one name.
function splitName(text) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  const i = s.search(/,\s/);
  if (i < 0) return { name: s.replace(/,$/, "").trim().slice(0, 120), note: null };
  return { name: s.slice(0, i).trim().slice(0, 120), note: s.slice(i + 1).trim().slice(0, 200) || null };
}
const nameText = (name, note) => (note ? name + ", " + note : name);

function draftFrom(id) {
  const r = id ? byId("recipes", id) : null;
  const rows = [];
  if (r) {
    let sec = null;
    for (const i of ingredientsOf(id)) {
      if ((i.section || null) !== sec) { sec = i.section || null; if (sec) rows.push({ k: key(), kind: "sec", text: sec }); }
      rows.push({ k: key(), kind: "ing", id: i.id, text: nameText(i.name, i.note), qty: qtyText(i.amount, i.unit) });
    }
  }
  return {
    id: r ? r.id : newId(),
    isNew: !r,
    title: r ? r.title : "",
    mealType: r ? r.mealType || null : null,
    servings: r ? r.servings : (state.settings && state.settings.defaultServings) || 2,
    prepMinutes: r ? r.prepMinutes ?? null : null,
    cookMinutes: r ? r.cookMinutes ?? null : null,
    sourceUrl: r ? r.sourceUrl || "" : "",
    imagePath: r ? r.imagePath || null : null,
    oldImagePath: r ? r.imagePath || null : null,
    photo: null, // { path, blob, done } for a photo picked in this editor
    rows,
    steps: r ? stepsOf(id).map((s) => ({ k: key(), id: s.id, text: s.text, timer: s.timerMinutes ? String(s.timerMinutes) : "" })) : []
  };
}

export function openEditor(id, restored = null) {
  if (id && !byId("recipes", id)) return;
  const d = restored || draftFrom(id);
  const start = JSON.stringify(restored ? draftFrom(id) : d);
  let saved = false;

  const photoHtml = () => {
    const url = photoUrl(d.imagePath);
    return '<div class="ephoto' + (url ? " has-img" : "") + '">' + icon(mealGlyph(d.mealType), "big") + (url ? '<img src="' + esc(url) + '" alt="">' : "") + "</div>" +
      '<div class="acts">' +
      '<button type="button" class="btn" data-photo-pick>' + icon("camera") + esc(t(url ? "recipe_photo_change" : "recipe_photo_add")) + "</button>" +
      (url ? '<button type="button" class="btn outline" data-photo-del>' + esc(t("recipe_photo_remove")) + "</button>" : "") + "</div>";
  };
  const mealHtml = () => MEALS.map((m) => '<button type="button" class="chip" data-meal="' + m + '" aria-pressed="' + (d.mealType === m) + '">' + esc(t("meal_" + m)) + "</button>").join("");
  const servHtml = () => '<button type="button" class="round" data-serv="-1" aria-label="' + esc(t("recipe_fewer")) + '"' + (d.servings <= 1 ? " disabled" : "") + ">" + icon("minus") + "</button>" +
    '<span class="v" aria-live="polite">' + d.servings + "</span>" +
    '<button type="button" class="round" data-serv="1" aria-label="' + esc(t("recipe_more")) + '"' + (d.servings >= 100 ? " disabled" : "") + ">" + icon("plus") + "</button>";

  const rowHtml = (row) => {
    const handle = '<button type="button" class="handle" data-handle aria-label="' + esc(t("recipe_move")) + '">' + icon("grip") + "</button>";
    const del = '<button type="button" class="round" data-del aria-label="' + esc(t("list_delete")) + '">' + icon("trash") + "</button>";
    if (row.kind === "sec") {
      return '<div class="erow sec" data-k="' + row.k + '">' + handle +
        '<input class="fld" data-f="text" maxlength="60" enterkeyhint="done" placeholder="' + esc(t("recipe_section_ph")) + '" aria-label="' + esc(t("recipe_section")) + '" value="' + esc(row.text) + '">' + del + "</div>";
    }
    return '<div class="erow" data-k="' + row.k + '">' + handle +
      '<input class="fld" data-f="text" maxlength="140" enterkeyhint="next" autocapitalize="sentences" placeholder="' + esc(t("recipe_ing_name")) + '" aria-label="' + esc(t("recipe_ing_name")) + '" value="' + esc(row.text) + '">' +
      '<input class="fld qty" data-f="qty" maxlength="30" enterkeyhint="done" placeholder="' + esc(t("list_amount")) + '" aria-label="' + esc(t("list_amount")) + '" value="' + esc(row.qty || "") + '">' + del + "</div>";
  };
  const stepHtml = (s, n) =>
    '<div class="erow estep" data-k="' + s.k + '"><div class="top">' +
    '<button type="button" class="handle" data-handle aria-label="' + esc(t("recipe_move")) + '">' + icon("grip") + "</button>" +
    '<b class="n">' + esc(t("cook_step", { n: n + 1, total: d.steps.length })) + "</b>" +
    '<label class="etimer">' + icon("timer") + '<input data-f="timer" inputmode="numeric" pattern="[0-9]*" maxlength="4" placeholder="–" aria-label="' + esc(t("recipe_timer")) + '" value="' + esc(s.timer) + '"><span>min</span></label>' +
    '<button type="button" class="round" data-del aria-label="' + esc(t("list_delete")) + '">' + icon("trash") + "</button></div>" +
    '<textarea class="fld area" data-f="text" rows="2" maxlength="4000" autocapitalize="sentences" placeholder="' + esc(t("recipe_step_ph")) + '" aria-label="' + esc(t("recipe_step_ph")) + '">' + esc(s.text) + "</textarea>" +
    '<button type="button" class="btn mini outline split" data-split hidden>' + esc(t("paste_split")) + "</button></div>";

  const num = (v) => (v == null ? "" : String(v));
  const body =
    '<div class="stack editor" style="gap:16px">' +
    '<div data-photo>' + photoHtml() + '</div><input type="file" accept="image/*" data-file hidden>' +
    '<div><label class="lbl" for="e-title">' + esc(t("list_name")) + '</label><input class="fld" id="e-title" data-title maxlength="120" autocapitalize="sentences" enterkeyhint="done" placeholder="' + esc(t("recipe_title_ph")) + '" value="' + esc(d.title) + '"' + (d.isNew && !restored ? " autofocus" : "") + "></div>" +
    '<div><span class="lbl" id="e-meal">' + esc(t("recipe_meal")) + '</span><div class="chips" role="group" aria-labelledby="e-meal" data-meals>' + mealHtml() + "</div></div>" +
    '<div class="duo even"><div><label class="lbl" for="e-prep">' + esc(t("recipe_prep")) + '</label><input class="fld" id="e-prep" data-min="prepMinutes" inputmode="numeric" pattern="[0-9]*" maxlength="4" placeholder="min" value="' + esc(num(d.prepMinutes)) + '"></div>' +
    '<div><label class="lbl" for="e-cook">' + esc(t("recipe_cook_time")) + '</label><input class="fld" id="e-cook" data-min="cookMinutes" inputmode="numeric" pattern="[0-9]*" maxlength="4" placeholder="min" value="' + esc(num(d.cookMinutes)) + '"></div></div>' +
    '<div class="serv"><span class="lbl" id="e-serv">' + esc(t("recipe_servings")) + '</span><div class="step sm" role="group" aria-labelledby="e-serv" data-servbox>' + servHtml() + "</div></div>" +
    '<section class="esec"><div class="sechead"><h2>' + esc(t("recipe_ingredients")) + '</h2><span data-ing-n></span></div>' +
    '<p class="hint">' + esc(t("recipe_ing_hint")) + "</p>" +
    '<div class="erows" data-rows></div>' +
    '<form class="tin" data-add-ing autocomplete="off" novalidate><input name="ing" maxlength="160" enterkeyhint="done" autocapitalize="sentences" placeholder="' + esc(t("recipe_ing_add")) + '" aria-label="' + esc(t("recipe_ing_add")) + '">' +
    '<button class="go" type="submit" aria-label="' + esc(t("recipe_ing_add")) + '">' + icon("plus") + "</button></form>" +
    '<button type="button" class="btn mini outline" data-add-sec>' + icon("plus") + esc(t("recipe_section_add")) + "</button></section>" +
    '<section class="esec"><div class="sechead"><h2>' + esc(t("recipe_steps")) + '</h2><span data-step-n></span></div>' +
    '<div class="erows" data-steps></div>' +
    '<button type="button" class="btn" data-add-step>' + icon("plus") + esc(t("recipe_step_add")) + "</button></section>" +
    '<div><label class="lbl" for="e-src">' + esc(t("recipe_source")) + '</label><input class="fld" id="e-src" data-src type="url" inputmode="url" maxlength="2000" autocapitalize="off" spellcheck="false" placeholder="https://" value="' + esc(d.sourceUrl) + '"></div>' +
    (d.isNew ? "" : '<button type="button" class="btn danger wide" data-delete>' + icon("trash") + esc(t("recipe_delete")) + "</button>") +
    "</div>";

  openSheet({
    title: t(d.isNew ? "recipe_new" : "recipe_edit"),
    tall: true,
    sticky: true,
    cls: "editor-sheet",
    headHtml: '<button type="button" class="btn black mini save" data-save>' + esc(t("save")) + "</button>",
    body,
    onClose() {
      if (saved) return;
      if (JSON.stringify(d) === start) return;
      toast(t("recipe_discarded"), { action: t("recipe_restore"), onAction: () => openEditor(d.isNew ? null : d.id, d), ms: 6000 });
    },
    onMount(sheet, close) {
      const rowsBox = sheet.querySelector("[data-rows]");
      const stepsBox = sheet.querySelector("[data-steps]");
      const counts = () => {
        const n = d.rows.filter((r) => r.kind === "ing").length;
        sheet.querySelector("[data-ing-n]").textContent = n ? String(n) : "";
        sheet.querySelector("[data-step-n]").textContent = d.steps.length ? String(d.steps.length) : "";
      };
      const grow = (ta) => { ta.style.height = "auto"; ta.style.height = ta.scrollHeight + 2 + "px"; };
      const paintRows = () => { rowsBox.innerHTML = d.rows.map(rowHtml).join(""); counts(); };
      const paintSteps = () => { stepsBox.innerHTML = d.steps.map(stepHtml).join(""); stepsBox.querySelectorAll("textarea").forEach(grow); counts(); };
      paintRows();
      paintSteps();
      // The sheet may not be laid out yet on the first paint; size the step boxes once it is.
      requestAnimationFrame(() => stepsBox.querySelectorAll("textarea").forEach(grow));

      // A focused field is kept in view above the keyboard by openSheet (followKeyboard in js/ui.js).

      // Photo
      const fileIn = sheet.querySelector("[data-file]");
      const photoBox = sheet.querySelector("[data-photo]");
      photoBox.addEventListener("click", (e) => {
        if (e.target.closest("[data-photo-pick]")) fileIn.click();
        if (e.target.closest("[data-photo-del]")) { d.imagePath = null; d.photo = null; photoBox.innerHTML = photoHtml(); }
      });
      photoBox.addEventListener("error", (e) => { if (e.target.tagName === "IMG") e.target.remove(); }, true);
      fileIn.addEventListener("change", async () => {
        const f = fileIn.files && fileIn.files[0];
        fileIn.value = "";
        if (!f) return;
        const btn = photoBox.querySelector("[data-photo-pick]");
        if (btn) { btn.disabled = true; btn.lastChild.textContent = t("working"); }
        try {
          const blob = await resizeImage(f);
          const path = newPhotoPath();
          keepLocal(path, blob);
          d.photo = { path, blob, done: false };
          d.imagePath = path;
        } catch (err) {
          console.warn("Photo", err);
          photoError();
        }
        photoBox.innerHTML = photoHtml();
      });

      // Simple fields
      sheet.querySelector("[data-title]").addEventListener("input", (e) => { d.title = e.target.value; });
      sheet.querySelector("[data-src]").addEventListener("input", (e) => { d.sourceUrl = e.target.value; });
      sheet.querySelectorAll("[data-min]").forEach((inp) => inp.addEventListener("input", () => {
        const v = inp.value.replace(/\D/g, "");
        if (v !== inp.value) inp.value = v;
        d[inp.dataset.min] = v ? Math.min(1440, Number(v)) : null;
      }));
      sheet.querySelector("[data-meals]").addEventListener("click", (e) => {
        const b = e.target.closest("[data-meal]");
        if (!b) return;
        d.mealType = d.mealType === b.dataset.meal ? null : b.dataset.meal;
        sheet.querySelectorAll("[data-meal]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.meal === d.mealType)));
        const ph = photoBox.querySelector(".ephoto > svg");
        if (ph) ph.outerHTML = icon(mealGlyph(d.mealType), "big");
      });
      sheet.querySelector("[data-servbox]").addEventListener("click", (e) => {
        const b = e.target.closest("[data-serv]");
        if (!b) return;
        d.servings = Math.min(100, Math.max(1, d.servings + Number(b.dataset.serv)));
        const box = sheet.querySelector("[data-servbox]");
        box.innerHTML = servHtml();
        const again = box.querySelector('[data-serv="' + b.dataset.serv + '"]');
        if (again && !again.disabled) again.focus({ preventScroll: true });
      });

      // Ingredient and section rows
      const rowOf = (el, list) => { const k = el.closest("[data-k]") && el.closest("[data-k]").dataset.k; return list.find((r) => r.k === k); };
      rowsBox.addEventListener("input", (e) => {
        const row = rowOf(e.target, d.rows);
        if (row) row[e.target.dataset.f] = e.target.value;
      });
      // Tidy the amount when leaving the field: "150g" → "150 g", "1,50 łyżki" → "1,5 łyżka".
      rowsBox.addEventListener("change", (e) => {
        if (e.target.dataset.f !== "qty") return;
        const row = rowOf(e.target, d.rows);
        if (!row) return;
        const q = parseQty(row.qty);
        row.qty = qtyText(q.amount, q.unit);
        e.target.value = row.qty;
      });
      rowsBox.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" || !e.target.matches("input")) return;
        e.preventDefault();
        if (e.target.dataset.f === "text" && !e.target.closest(".sec")) e.target.nextElementSibling.focus();
        else sheet.querySelector("[data-add-ing] input").focus();
      });
      rowsBox.addEventListener("click", (e) => {
        if (!e.target.closest("[data-del]")) return;
        const row = rowOf(e.target, d.rows);
        d.rows = d.rows.filter((r) => r !== row);
        paintRows();
      });
      initDrag(sheet, rowsBox, {
        rowSel: ".erow", gap: 6,
        onDrop(from, to) {
          if (from === to) return;
          const [r] = d.rows.splice(from, 1);
          d.rows.splice(to, 0, r);
          paintRows();
        }
      });
      // Keyboard alternative to dragging: Alt + arrow on a handle moves the row.
      const keyMove = (box, list, repaint) => box.addEventListener("keydown", (e) => {
        const h = e.target.closest("[data-handle]");
        if (!h || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
        e.preventDefault();
        const arr = list();
        const row = rowOf(h, arr);
        const i = arr.indexOf(row), j = i + (e.key === "ArrowUp" ? -1 : 1);
        if (j < 0 || j >= arr.length) return;
        arr.splice(i, 1);
        arr.splice(j, 0, row);
        repaint();
        const again = box.querySelector('[data-k="' + row.k + '"] [data-handle]');
        if (again) again.focus();
      });
      keyMove(rowsBox, () => d.rows, paintRows);

      // "Dodaj składnik": the same parser as the list ("ryż 150 g"); a comma starts the note.
      const addForm = sheet.querySelector("[data-add-ing]");
      addForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const text = addForm.ing.value;
        const p = parseItem(text, codes());
        if (!p.name) { addForm.ing.focus(); return; }
        d.rows.push({ k: key(), kind: "ing", text: p.name, qty: qtyText(p.amount, p.unit) });
        addForm.ing.value = "";
        paintRows();
        addForm.ing.focus({ preventScroll: true });
        addForm.scrollIntoView({ block: "nearest" });
      });
      // Several lines pasted into "Dodaj składnik": one ingredient per line, after a preview.
      onMultiPaste(addForm.ing, (lines) => {
        const parsed = lines.map((l) => parseItem(l, codes()));
        previewBatch({
          entries: parsed.map((p) => ({ text: p.name, sub: qtyText(p.amount, p.unit) })),
          buttonKey: "paste_add_ingredients",
          onConfirm(kept) {
            const rows = kept.map((i) => ({ k: key(), kind: "ing", text: parsed[i].name, qty: qtyText(parsed[i].amount, parsed[i].unit) }));
            d.rows.push(...rows);
            paintRows();
            addForm.scrollIntoView({ block: "nearest" });
            batchToast("paste_added_ingredients", rows.length, () => { d.rows = d.rows.filter((r) => !rows.includes(r)); paintRows(); });
          }
        });
      });
      sheet.querySelector("[data-add-sec]").addEventListener("click", () => {
        const row = { k: key(), kind: "sec", text: "" };
        d.rows.push(row);
        paintRows();
        const inp = rowsBox.querySelector('[data-k="' + row.k + '"] input');
        if (inp) inp.focus();
      });

      // Steps
      stepsBox.addEventListener("input", (e) => {
        const s = rowOf(e.target, d.steps);
        if (!s) return;
        if (e.target.dataset.f === "timer") {
          const v = e.target.value.replace(/\D/g, "");
          if (v !== e.target.value) e.target.value = v;
          s.timer = v;
        } else {
          s.text = e.target.value; grow(e.target);
          const sp = e.target.closest(".erow").querySelector("[data-split]");
          if (sp && !sp.hidden) showSplit(e.target);
        }
      });
      // Replace step `s` by one step per entry (the first keeps its timer); undo puts it back.
      const spreadSteps = (s, texts) => {
        const before = s.text;
        const extra = texts.slice(1).map((x) => ({ k: key(), text: x, timer: "" }));
        s.text = texts[0];
        d.steps.splice(d.steps.indexOf(s) + 1, 0, ...extra);
        paintSteps();
        const n = texts.length;
        batchToast("paste_added_steps", n, () => { s.text = before; d.steps = d.steps.filter((x) => !extra.includes(x)); paintSteps(); });
      };
      // A paragraph in a step offers "Podziel na kroki"; the label names how many steps it gives.
      const showSplit = (ta) => {
        const sp = ta.closest(".erow").querySelector("[data-split]");
        const n = splitSentences(ta.value).length;
        sp.hidden = n < 2 || /\n/.test(ta.value);
        if (!sp.hidden) sp.textContent = t("paste_split_to", { n });
      };
      // Several lines pasted into an empty step: one step per line, after a preview.
      onMultiPaste(stepsBox, (lines, e) => {
        const s = rowOf(e.target, d.steps);
        if (!s) return;
        previewBatch({
          entries: lines.map((text) => ({ text })),
          buttonKey: "paste_add_steps",
          onConfirm(kept) { spreadSteps(s, kept.map((i) => lines[i])); }
        });
      }, { when: (e) => e.target.matches('textarea[data-f="text"]') && !e.target.value.trim() });
      // One pasted paragraph: show "Podziel na kroki" once the text is in.
      stepsBox.addEventListener("paste", (e) => {
        const ta = e.target;
        if (!ta.matches || !ta.matches('textarea[data-f="text"]') || e.defaultPrevented) return;
        setTimeout(() => showSplit(ta), 0);
      });
      stepsBox.addEventListener("click", (e) => {
        const b = e.target.closest("[data-split]");
        if (!b) return;
        const s = rowOf(b, d.steps);
        const parts = splitSentences(s.text);
        if (!s || parts.length < 2) return;
        previewBatch({
          entries: parts.map((text) => ({ text })),
          buttonKey: "paste_split_to",
          onConfirm(kept) { spreadSteps(s, kept.map((i) => parts[i])); }
        });
      });
      stepsBox.addEventListener("click", (e) => {
        if (!e.target.closest("[data-del]")) return;
        const s = rowOf(e.target, d.steps);
        d.steps = d.steps.filter((x) => x !== s);
        paintSteps();
      });
      initDrag(sheet, stepsBox, {
        rowSel: ".erow", gap: 8,
        onDrop(from, to) {
          if (from === to) return;
          const [s] = d.steps.splice(from, 1);
          d.steps.splice(to, 0, s);
          paintSteps();
        }
      });
      keyMove(stepsBox, () => d.steps, paintSteps);
      sheet.querySelector("[data-add-step]").addEventListener("click", () => {
        const s = { k: key(), text: "", timer: "" };
        d.steps.push(s);
        paintSteps();
        const ta = stepsBox.querySelector('[data-k="' + s.k + '"] textarea');
        if (ta) ta.focus();
      });

      // Save
      sheet.querySelector("[data-save]").addEventListener("click", () => {
        const title = d.title.replace(/\s+/g, " ").trim().slice(0, 120);
        if (!title) {
          toast(t("list_err_name"));
          const inp = sheet.querySelector("[data-title]");
          inp.focus();
          inp.scrollIntoView({ block: "center" });
          return;
        }
        let src = d.sourceUrl.trim();
        if (src && !/^https?:\/\//i.test(src)) src = "https://" + src;
        if (src.length > 2000 || /\s/.test(src)) src = "";
        let section = null;
        const ingredients = [];
        for (const r of d.rows) {
          if (r.kind === "sec") { section = r.text.replace(/\s+/g, " ").trim().slice(0, 60) || null; continue; }
          const { name, note } = splitName(r.text);
          if (!name) continue;
          const q = parseQty(r.qty);
          ingredients.push({ id: r.id, name, note, amount: q.amount, unit: q.unit, section });
        }
        const steps = d.steps
          .map((s) => ({ id: s.id, text: s.text.trim().slice(0, 4000), timerMinutes: Math.min(1440, Number(s.timer) || 0) || null }))
          .filter((s) => s.text);
        saved = true;
        close();
        saveRecipe({
          recipe: {
            id: d.id, title, mealType: d.mealType, servings: d.servings,
            prepMinutes: d.prepMinutes, cookMinutes: d.cookMinutes, sourceUrl: src || null, imagePath: d.imagePath
          },
          ingredients, steps,
          photo: d.photo && d.photo.path === d.imagePath ? d.photo : null,
          oldImagePath: d.oldImagePath
        });
        if (d.isNew) go("recipe", d.id);
      });

      const del = sheet.querySelector("[data-delete]");
      if (del) del.addEventListener("click", () => {
        saved = true;
        close();
        deleteRecipe(d.id);
      });
    }
  });
}

// Pure helpers, exported for tests.
export { parseQty, splitName };
