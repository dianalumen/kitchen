// App shell: view router, floating tab bar, shared header, offline pill and demo banner.
//
// A view is { tab, mount(root), update(root, changes) }: mount builds the screen once when the
// route opens, update refreshes only what the changes touch (so typing in a field is never
// interrupted by a realtime event). `tab: false` hides the tab bar (recipe detail, cooking mode).
import { t } from "./i18n.js";
import { $, esc, icon, store } from "./ui.js";
import { state, onChange } from "./store.js";

const views = {};
const TABS = [
  { name: "list", icon: "list", label: "tab_list" },
  { name: "pantry", icon: "jar", label: "tab_pantry" },
  { name: "recipes", icon: "book", label: "tab_recipes" }
];
let current = null; // { name, params, view }
let actions = {};    // data-act handlers registered by views and the shell

export function registerView(name, view) { views[name] = view; }

// "#recipe/123" → { name: "recipe", params: ["123"] }
function parseHash() {
  const [name, ...params] = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  return { name: views[name] ? name : null, params };
}

export function go(name, ...params) {
  const hash = "#" + [name, ...params].join("/");
  if (location.hash === hash) render();
  else location.hash = hash;
}

export function startRouter() {
  window.addEventListener("hashchange", () => render());
  render();
}

function render(direction) {
  const r = parseHash();
  if (!r.name) {
    const last = store("tab");
    const name = TABS.some((x) => x.name === last) ? last : "list";
    history.replaceState(null, "", location.pathname + location.search + "#" + name);
    r.name = name;
  }
  const view = views[r.name];
  const prev = current;
  current = { name: r.name, params: r.params, view };
  if (TABS.some((x) => x.name === r.name)) store("tab", r.name);
  const root = $("view");
  // Into a detail screen slides forward, back out of it slides back, between tabs fades up.
  if (!direction && prev && prev.name !== r.name) {
    direction = view.tab === false && prev.view.tab !== false ? "fwd" : prev.view.tab === false && view.tab !== false ? "bwd" : "enter";
  }
  root.className = "view " + (direction || "");
  root.innerHTML = "";
  view.mount(root, r.params);
  document.body.classList.toggle("no-tabbar", view.tab === false);
  paintTabbar();
  paintStatus();
  if (prev && prev.name !== r.name) window.scrollTo(0, 0);
}

onChange((changes) => {
  if (!current || !state.loaded) return;
  if (current.view.update) current.view.update($("view"), changes);
  paintStatus();
});

// ---------------------------------------------------------------------------
// Tab bar
// ---------------------------------------------------------------------------
export function buildTabbar() {
  $("tabbar").innerHTML = '<nav aria-label="' + esc(t("tabs_label")) + '">' +
    TABS.map((x) => '<button type="button" data-tab="' + x.name + '" aria-label="' + esc(t(x.label)) + '">' + icon(x.icon) + "</button>").join("") +
    "</nav>";
  $("tabbar").addEventListener("click", (e) => {
    const b = e.target.closest("[data-tab]");
    if (b) go(b.dataset.tab);
  });
}

function paintTabbar() {
  document.querySelectorAll("#tabbar [data-tab]").forEach((b) => {
    if (current && b.dataset.tab === current.name) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
}

// The tab bar hides while typing in a field marked data-hide-tabbar (L2: the add field).
document.addEventListener("focusin", (e) => {
  if (e.target.closest && e.target.closest("[data-hide-tabbar]")) document.body.classList.add("typing");
});
document.addEventListener("focusout", (e) => {
  if (e.target.closest && e.target.closest("[data-hide-tabbar]")) document.body.classList.remove("typing");
});

// ---------------------------------------------------------------------------
// Header: eyebrow (only the key number), title, round buttons, offline pill
// ---------------------------------------------------------------------------
export function header({ eyebrow = "", title, buttons = [] }) {
  return '<div class="headrow"><div><div class="eyebrow" data-eyebrow>' + esc(eyebrow) + '</div><h1 class="ttl">' + esc(title) + "</h1></div>" +
    (buttons.length ? '<div class="acts">' + buttons.map((b) =>
      '<button type="button" class="round" data-act="' + b.act + '" aria-label="' + esc(b.label) + '">' + icon(b.icon) + "</button>").join("") + "</div>" : "") +
    "</div>" +
    '<div class="pill" data-offline role="status" hidden>' + icon("cloudOff") + esc(t("offline")) + "</div>";
}

export function setEyebrow(root, text) {
  const el = root.querySelector("[data-eyebrow]");
  if (el && el.textContent !== text) el.textContent = text;
}

export const settingsButton = () => ({ act: "settings", icon: "gear", label: t("settings") });

// Offline when the browser is offline, or the realtime channel has been down for a few seconds
// (a short grace period avoids a flash while the channel connects).
let downSince = 0;
let graceTimer = 0;
export function paintStatus() {
  const channelDown = !state.demo && state.loaded && !state.live;
  if (channelDown && !downSince) {
    downSince = Date.now();
    clearTimeout(graceTimer);
    graceTimer = setTimeout(paintStatus, 3100);
  }
  if (!channelDown) downSince = 0;
  const offline = !state.online || (channelDown && Date.now() - downSince > 3000);
  document.querySelectorAll("[data-offline]").forEach((el) => { el.hidden = !offline; });
}

// ---------------------------------------------------------------------------
// Demo banner
// ---------------------------------------------------------------------------
export function paintDemoBanner() {
  $("banner").innerHTML = state.demo
    ? '<div class="demo" role="status"><span>' + esc(t("demo_banner")) + '</span><button type="button" data-act="demo-exit">' + esc(t("demo_exit")) + "</button></div>"
    : "";
}

// ---------------------------------------------------------------------------
// Click delegation: data-act="name" → actions[name](element, event)
// ---------------------------------------------------------------------------
export function on(acts) { Object.assign(actions, acts); }

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]");
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.act];
  if (fn) fn(el, e);
});
