// Small UI helpers shared by every view: escaping, icons, bottom sheets, toasts, theme and accent.
import { t } from "./i18n.js";

export const $ = (id) => document.getElementById(id);

// Every string from the database or the user goes through esc() before innerHTML.
export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// Stroke icons from the A board (24×24, drawn with currentColor).
const PATHS = {
  gear: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  check: "M5 12l5 5 9-10",
  down: "M6 9l6 6 6-6",
  up: "M6 15l6-6 6 6",
  grip: "M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  back: "M15 6l-6 6 6 6",
  right: "M9 6l6 6-6 6",
  edit: "M4 20h4L19 9l-4-4L4 16zM13 7l4 4",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4",
  list: "M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",
  jar: "M7 3h10M8 3v3L6 9v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V9l-2-3V3M6 13h12",
  book: "M4 19V5a2 2 0 0 1 2-2h14v14H6a2 2 0 0 0-2 2 2 2 0 0 0 2 2h14M9 7h7",
  cart: "M3 4h2l2.4 11h10.8L21 7H6.2M9 20h.01M18 20h.01",
  play: "M7 4l13 8-13 8z",
  pause: "M8 5v14M16 5v14",
  timer: "M12 8v5l3 2M9 2h6M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16z",
  camera: "M4 8h3l2-3h6l2 3h3v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  link: "M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1",
  users: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2 20c0-3.5 3-6 7-6s7 2.5 7 6M16 4a3.5 3.5 0 0 1 0 7M18 14c2.5.6 4 2.8 4 6",
  bowl: "M3 11h18a9 9 0 0 1-18 0zM8 7c0-1.5 1.5-2 1.5-3.5M12.5 7c0-1.5 1.5-2 1.5-3.5M15 2l6 7",
  pot: "M4 10h16v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4zM2 10h20M9 6c0-1 1-2 1-3M14 6c0-1 1-2 1-3",
  home: "M4 11l8-7 8 7v9H4zM10 20v-6h4v6",
  key: "M8 14a4 4 0 1 1 0-8 4 4 0 0 1 0 8zM11 10h10M18 10v3M15 10v2",
  share: "M12 3v12M7 8l5-5 5 5M5 14v6h14v-6",
  refresh: "M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7",
  cloudOff: "M3 3l18 18M8 7.5A6 6 0 0 1 17.7 10H18a4 4 0 0 1 2.3 7.3M16 18H7a5 5 0 0 1-1.6-9.7",
  signOut: "M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11",
  // Category glyphs
  veg: "M12 7C8 4 4 7 5 12s4 9 7 7c3 2 6-2 7-7s-3-8-7-5zM12 7c0-2 1-4 3-4",
  dairy: "M8 3h8v3l2 3v12H6V9l2-3zM6 12h12",
  fish: "M3 12c3-5 10-6 15 0-5 6-12 5-15 0zM18 12l3-3v6zM8 11h.01",
  grain: "M12 21V9M12 9C9 9 8 6 8 4c3 0 4 2 4 5zm0 0c3 0 4-3 4-5-3 0-4 2-4 5zM12 15c-3 0-4-3-4-5 3 0 4 2 4 5zm0 0c3 0 4-3 4-5-3 0-4 2-4 5z",
  spice: "M9 3h6v3H9zM8 6h8l1 15H7zM11 10h.01M13 13h.01M11 16h.01",
  can: "M6 5h12v14H6zM6 5c0-1 2.7-2 6-2s6 1 6 2M6 10h12",
  bread: "M5 11a4 4 0 0 1 0-7h14a4 4 0 0 1 0 7v9H5zM9 11v5M15 11v5",
  meat: "M15 4a6 6 0 0 1 4 10l-6 6a4 4 0 0 1-6-6l1-1-3-3 2-2 3 3 1-1A6 6 0 0 1 15 4z",
  snow: "M12 2v20M4 6l16 12M20 6 4 18",
  drop: "M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z",
  cup: "M5 8h12v6a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5zM17 10h2a2 2 0 0 1 0 4h-2M9 3v2M13 3v2",
  candy: "M8 8h8v8H8zM8 8 4 4M16 16l4 4M16 8l4-4M8 16l-4 4",
  spray: "M9 9h6v12H9zM10 9V5h4v4M14 5h4M18 3v4",
  bag: "M5 8h14l-1 13H6zM9 8V6a3 3 0 0 1 6 0v2"
};

export function icon(name, cls) {
  const d = PATHS[name] || PATHS.bag;
  return '<svg viewBox="0 0 24 24" aria-hidden="true"' + (cls ? ' class="' + cls + '"' : "") + '><path d="' + d + '"></path></svg>';
}

// Category glyph from the category name (categories have no colors; the glyph only helps recognition).
const CAT_GLYPHS = [
  [/konserw|puszk/, "can"], [/owoc|warzyw/, "veg"], [/pieczyw|chleb/, "bread"], [/nabiał|mlek|ser/, "dairy"], [/mięs|wędlin/, "meat"],
  [/ryb/, "fish"], [/mroż/, "snow"], [/makaron|ryż|kasz|zboż|płatk/, "grain"], [/piecz/, "bread"],
  [/przypraw/, "spice"], [/olej|sos|oliw/, "drop"], [/przekąsk|słodycz/, "candy"],
  [/napoj|napój/, "cup"], [/kaw|herbat/, "cup"], [/chemi/, "spray"]
];
export function categoryGlyph(name) {
  const n = String(name || "").toLowerCase();
  for (const [re, ic] of CAT_GLYPHS) if (re.test(n)) return ic;
  return "bag";
}

// ---------------------------------------------------------------------------
// Keyed reconciling: sync(parent, [{ key, html, sig?, after? }]) brings parent's children in line
// with the items. Elements whose signature is unchanged stay as they are (no repaint, no lost
// animation), new ones are created, extra ones removed. Every item's html carries data-k="key".
// ---------------------------------------------------------------------------
export const mk = (html) => { const tpl = document.createElement("template"); tpl.innerHTML = html.trim(); return tpl.content.firstElementChild; };

export function sync(parent, items) {
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

// ---------------------------------------------------------------------------
// Bottom sheet: openSheet({ title, body, tall, onMount }) → close()
// One sheet at a time; Escape and a tap on the scrim close it.
// ---------------------------------------------------------------------------
let current = null;

// headHtml: extra buttons in the sheet head (before the close button). sticky: a tap on the scrim
// does not close it (long forms such as the recipe editor). cls: extra class on the sheet.
export function openSheet({ title, body, tall = false, onMount, onClose, label, headHtml = "", sticky = false, cls = "" }) {
  if (current) current.close(true, true);
  const opener = document.activeElement;
  const scrim = document.createElement("div");
  scrim.className = "scrim";
  scrim.innerHTML =
    '<div class="sheet' + (tall ? " tall" : "") + (cls ? " " + cls : "") + '" role="dialog" aria-modal="true" aria-label="' + esc(label || title || "") + '">' +
    '<div class="grab" aria-hidden="true"></div>' +
    (title ? '<div class="sheet-head"><h3>' + esc(title) + "</h3>" + headHtml + '<button class="round" data-sheet-close aria-label="' + esc(t("close")) + '">' + icon("plus", "x") + "</button></div>" : "") +
    '<div class="sheet-body">' + body + "</div></div>";
  document.body.appendChild(scrim);
  document.body.classList.add("sheet-open");
  const sheet = scrim.firstChild;
  let closed = false;
  // replaced = another sheet took this one's place (onClose should not navigate back then)
  const close = (instant, replaced = false) => {
    if (closed) return;
    closed = true;
    if (current && current.scrim === scrim) current = null;
    document.removeEventListener("keydown", onKey);
    const done = () => {
      scrim.remove();
      if (!current) document.body.classList.remove("sheet-open");
      if (opener && opener.focus && document.contains(opener)) opener.focus({ preventScroll: true });
      if (onClose) onClose(replaced);
    };
    if (instant || reducedMotion()) return done();
    sheet.style.animation = "";
    scrim.classList.add("closing");
    setTimeout(done, 200);
  };
  const onKey = (e) => {
    if (e.key === "Escape") close();
    if (e.key === "Tab") trapFocus(e, sheet);
  };
  document.addEventListener("keydown", onKey);
  // A tap closes the sheet only if it also started on the scrim. On iOS, focusing a field can move
  // the layout between touch start and the click, and the click then lands on the scrim.
  let downOnScrim = false;
  scrim.addEventListener("pointerdown", (e) => { downOnScrim = e.target === scrim; });
  scrim.addEventListener("click", (e) => {
    if ((e.target === scrim && downOnScrim && !sticky) || e.target.closest("[data-sheet-close]")) close();
    downOnScrim = false;
  });
  current = { scrim, close };
  followKeyboard(scrim, sheet);
  // Once it has slid in, stop the entry animation so toggling the keyboard layout never replays it.
  setTimeout(() => { if (!closed) sheet.style.animation = "none"; }, 400);
  if (onMount) onMount(sheet, close);
  const first = sheet.querySelector("[autofocus]") || sheet.querySelector("[data-sheet-close]");
  if (first) first.focus({ preventScroll: true });
  return close;
}

// The on-screen keyboard shrinks only the visual viewport on iOS; a fixed scrim keeps the layout
// viewport's height, so a bottom sheet would sit behind the keyboard. While the keyboard is up the
// scrim takes the visible area's position and height, so the sheet's bottom rests on the keyboard,
// and the focused field is scrolled into view inside the sheet. Nothing changes on focus itself
// (only once the viewport has resized), so the field under the finger stays where it was tapped.
function followKeyboard(scrim, sheet) {
  const vv = window.visualViewport;
  if (!vv) return;
  const fit = () => {
    if (!scrim.isConnected) { vv.removeEventListener("resize", fit); vv.removeEventListener("scroll", fit); return; }
    const covered = window.innerHeight - vv.height; // keyboard (and accessory bar) height
    const up = covered > 120 && vv.height > 160;
    scrim.classList.toggle("kbd", up);
    scrim.style.top = up ? vv.offsetTop + "px" : "";
    scrim.style.height = up ? vv.height + "px" : "";
    if (!up) return;
    const f = document.activeElement;
    if (!f || !sheet.contains(f) || !/^(INPUT|TEXTAREA|SELECT)$/.test(f.tagName)) return;
    const fr = f.getBoundingClientRect(), sr = sheet.getBoundingClientRect();
    if (fr.bottom > sr.bottom - 12) sheet.scrollTop += fr.bottom - sr.bottom + 16;
    else if (fr.top < sr.top + 12) sheet.scrollTop -= sr.top - fr.top + 16;
  };
  vv.addEventListener("resize", fit);
  vv.addEventListener("scroll", fit);
  sheet.addEventListener("focusin", () => setTimeout(fit, 60)); // field to field with the keyboard already up
}

export function closeSheet() { if (current) current.close(); }

function trapFocus(e, root) {
  const f = [...root.querySelectorAll('button,input,select,textarea,a[href],[tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled && x.offsetParent);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

export const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------------------------------------------------------------------------
// Toasts: toast("…") for information, undoToast("…", onUndo) for deletes.
// ---------------------------------------------------------------------------
let toastTimer = 0;

export function toast(msg, { action, onAction, ms = 3000 } = {}) {
  const el = $("toast");
  clearTimeout(toastTimer);
  el.innerHTML = '<span>' + esc(msg) + "</span>" + (action ? '<button type="button">' + esc(action) + "</button>" : "");
  el.hidden = false;
  el.classList.remove("show");
  void el.offsetWidth; // restart the entry animation
  el.classList.add("show");
  const hide = () => { el.hidden = true; el.innerHTML = ""; };
  if (action) {
    el.querySelector("button").onclick = () => { clearTimeout(toastTimer); hide(); onAction && onAction(); };
  }
  toastTimer = setTimeout(hide, ms);
}

export function undoToast(msg, onUndo) {
  toast(msg, { action: t("undo"), onAction: onUndo, ms: 5000 });
}

// ---------------------------------------------------------------------------
// Theme (per device) and accent (per household)
// ---------------------------------------------------------------------------
export const ACCENTS = ["matcha", "tomato", "apricot", "lavender", "mint", "sunflower"];

export function store(key, value) {
  try {
    if (value === undefined) return localStorage.getItem("kitchen." + key);
    if (value === null) localStorage.removeItem("kitchen." + key);
    else localStorage.setItem("kitchen." + key, value);
  } catch (e) { /* private mode: preferences just don't stick */ }
  return null;
}

export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === "light" || theme === "dark") root.dataset.theme = theme;
  else delete root.dataset.theme;
  // Keep the browser chrome in step with the chosen theme.
  const dark = theme === "dark" || (theme !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    if (theme === "light" || theme === "dark") m.setAttribute("content", dark ? "#121211" : "#FFFFFF");
    else m.setAttribute("content", m.media.includes("dark") ? "#121211" : "#FFFFFF");
  });
}

export function applyAccent(accent) {
  document.documentElement.dataset.accent = ACCENTS.includes(accent) ? accent : "matcha";
  store("accent", document.documentElement.dataset.accent); // first paint uses the last known accent
}

// ---------------------------------------------------------------------------
// ?debug: a small overlay with the numbers that decide where a sheet sits relative to the keyboard.
// For diagnosing the on-screen keyboard on a real phone; the build stamp shows which code is running.
// ---------------------------------------------------------------------------
export const BUILD = "kbd-5";
export function initDebug() {
  if (!/[?&]debug\b/.test(location.search)) return;
  const box = document.createElement("pre");
  box.style.cssText = "position:fixed;left:4px;top:60px;z-index:999;margin:0;padding:6px 8px;border-radius:8px;background:rgba(0,0,0,.75);color:#0f0;font:11px/1.3 monospace;pointer-events:none;white-space:pre";
  document.body.appendChild(box);
  const upd = () => {
    const vv = window.visualViewport, sc = document.querySelector(".scrim"), sh = document.querySelector(".sheet");
    const r = sh ? sh.getBoundingClientRect() : null;
    box.textContent = [
      "build " + BUILD,
      "inner " + innerWidth + "x" + innerHeight,
      vv ? "vv " + Math.round(vv.width) + "x" + Math.round(vv.height) + " top " + Math.round(vv.offsetTop) : "no vv",
      "scrollY " + Math.round(scrollY),
      "active " + (document.activeElement ? document.activeElement.tagName : "-"),
      sc ? "scrim " + sc.className + " " + sc.style.top + " " + sc.style.height : "no sheet",
      r ? "sheet " + Math.round(r.top) + ".." + Math.round(r.bottom) : ""
    ].join("\n");
  };
  ["resize", "scroll"].forEach((e) => { window.addEventListener(e, upd); if (window.visualViewport) window.visualViewport.addEventListener(e, upd); });
  document.addEventListener("focusin", () => setTimeout(upd, 400));
  document.addEventListener("focusout", () => setTimeout(upd, 400));
  setInterval(upd, 500);
  upd();
}
