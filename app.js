// kitchen — app entry point. Boots demo or Supabase, runs the auth and household gates, then the
// shell (router, tab bar, settings) with realtime sync. See TECH-GUIDELINES §6 and §9.
import { t } from "./js/i18n.js";
import { $, store, applyTheme, applyAccent, closeSheet } from "./js/ui.js";
import { state, useBackend, setData, applyRemote, onChange } from "./js/store.js";
import { sbBackend } from "./js/backend.js";
import { demoBackend, DEMO_USER } from "./js/demo.js";
import { buildTabbar, startRouter, paintDemoBanner, paintStatus, on } from "./js/shell.js";
import { initGates, hideGates, authGate, resetGate, householdGate, errorGate, authError } from "./js/gates.js";
import { initSettings, openSettings } from "./js/settings.js";
import "./js/views/list.js";
import "./js/views/pantry.js";
import "./js/views/recipes.js";

const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm";

let B = null;
let started = false;

// ---------------------------------------------------------------------------
// Theme first, so nothing flashes in the wrong colors
// ---------------------------------------------------------------------------
applyTheme(store("theme"));
applyAccent(store("accent"));
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => applyTheme(store("theme")));
onChange((c) => {
  if ((c.has("settings") || c.has("all")) && state.settings) applyAccent(state.settings.accent);
});

// ---------------------------------------------------------------------------
// Loading data and entering the app
// ---------------------------------------------------------------------------
async function enter() {
  let d;
  try { d = await B.load(state.user); }
  catch (e) { console.warn(e); errorGate("db", e.message || String(e)); return; }
  if (d.noHousehold) { householdGate(); return; }
  setData(d);
  hideGates();
  if (!started) {
    started = true;
    buildTabbar();
    paintDemoBanner();
    startRouter();
  }
  B.subscribe(state.household.id, applyRemote, onLive);
}

// Full reload: on reconnect, after a failed write and when the app comes back to the front.
let reloading = null;
async function reload() {
  if (!B || !state.loaded || reloading) return reloading;
  reloading = (async () => {
    try {
      const d = await B.load(state.user);
      if (!d.noHousehold) setData(d);
    } catch (e) { console.warn("Reload failed", e); }
    finally { reloading = null; }
  })();
  return reloading;
}

// Realtime channel status. Events missed while the channel was down are caught up by a reload.
let everLive = false;
function onLive(live) {
  const recovered = live && !state.live && everLive;
  state.live = live;
  if (live) { if (recovered) reload(); everLive = true; }
  paintStatus();
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && !state.demo) reload();
});
window.addEventListener("online", () => { state.online = true; paintStatus(); reload(); });
window.addEventListener("offline", () => { state.online = false; paintStatus(); });

// ---------------------------------------------------------------------------
// Shell actions
// ---------------------------------------------------------------------------
async function signOut() {
  closeSheet();
  if (state.demo) { location.replace(location.pathname); return; }
  try { await B.signOut(); } catch (e) { console.warn(e); }
  store("tab", null);
  location.replace(location.pathname);
}

on({
  settings: () => openSettings(),
  "demo-exit": () => location.replace(location.pathname)
});
initSettings({ signOut });

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
function loadScript(src) {
  return new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = s.onerror = () => resolve();
    document.head.appendChild(s);
  });
}

function getConfig() {
  const c = window.APP_CONFIG;
  return c && c.url && c.key && !/your-project|your-publishable/i.test(c.url + c.key) ? c : null;
}

// Remove auth tokens (and errors) from the address bar after an e-mail link.
function stripAuthHash() {
  if (/access_token|refresh_token|type=|error=|error_code=/.test(location.hash)) {
    history.replaceState(null, "", location.pathname + location.search);
  }
}

async function start() {
  if (new URLSearchParams(location.search).has("demo")) {
    // Demo never loads config.js or supabase-js.
    state.demo = true;
    state.user = DEMO_USER;
    B = demoBackend();
    useBackend(B, reload);
    await enter();
    return;
  }

  await loadScript("config.js");
  const cfg = getConfig();
  initGates({ backend: null, onSignedIn, onHousehold: enter, signOut });
  if (!cfg) { errorGate("setup"); return; }

  let createClient;
  try { ({ createClient } = await import(SUPABASE_JS)); }
  catch (e) { errorGate("offline"); return; }

  const sb = createClient(cfg.url, cfg.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "kitchen.auth" }
  });
  B = sbBackend(sb);
  useBackend(B, reload);
  initGates({ backend: B, onSignedIn, onHousehold: enter, signOut });

  const hash = location.hash;
  let recovering = /type=recovery/.test(hash);
  const linkError = /error_code=|error=/.test(hash) ? t("auth_err_link") : "";
  B.onAuth((event, session) => {
    if (event === "PASSWORD_RECOVERY") {
      recovering = true;
      state.user = session && session.user;
      stripAuthHash();
      resetGate();
    }
  });

  let session = null;
  try { session = await B.getSession(); }
  catch (e) { stripAuthHash(); authGate("signin", authError(e)); return; }
  stripAuthHash();
  if (recovering && session) { state.user = session.user; resetGate(); return; }
  if (session && session.user) { await onSignedIn(session.user); return; }
  authGate("signin", linkError);
}

async function onSignedIn(user) {
  state.user = { id: user.id, email: user.email };
  await enter();
}

// Service worker: only on https (GitHub Pages), never in demo previews over http.
if ("serviceWorker" in navigator && location.protocol === "https:") {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}

start().catch((e) => { console.error(e); errorGate("db", e.message || String(e)); });
