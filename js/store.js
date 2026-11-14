// App state, optimistic writes and realtime patching.
//
// The UI reads `state` and calls the write helpers below; it never calls the backend for table
// data directly. Every write is applied locally first (instant UI), then saved; on error the change
// is rolled back, a toast explains it and the data is reloaded. Realtime events patch one row at a
// time and skip the echo of this device's own writes (same row id + same updated_at).
import { t } from "./i18n.js";
import { toast, undoToast } from "./ui.js";

export const state = {
  demo: false,
  user: null,          // { id, email }
  household: null,     // { id, name, code }
  members: [],         // [{ userId, email, joinedAt }]
  settings: null,      // { defaultServings, expiringSoonDays, accent, updatedAt }
  categories: [],
  categoryRules: [],
  units: [],
  shopping: [],
  pantry: [],
  recipes: [],
  ingredients: [],
  steps: [],
  online: navigator.onLine, // browser network state
  live: false,              // realtime channel subscribed
  loaded: false
};

// Collections that hold a list of rows with an `id` (realtime patches these by id).
export const COLLECTIONS = ["categories", "categoryRules", "units", "shopping", "pantry", "recipes", "ingredients", "steps"];

let backend = null;
let reload = () => {};
export function useBackend(b, reloadFn) { backend = b; reload = reloadFn || reload; }
export const getBackend = () => backend;

// ---------------------------------------------------------------------------
// Change notification: views re-render once per frame for any batch of changes.
// ---------------------------------------------------------------------------
const listeners = new Set();
let dirty = new Set();
let scheduled = false;

export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function changed(...what) {
  what.forEach((w) => dirty.add(w));
  if (scheduled) return;
  scheduled = true;
  // Next frame, or a short timer when frames are paused (background tab), whichever comes first.
  const flush = () => {
    if (!scheduled) return;
    scheduled = false;
    const batch = dirty;
    dirty = new Set();
    listeners.forEach((fn) => fn(batch));
  };
  requestAnimationFrame(flush);
  setTimeout(flush, 50);
}

export function setData(d) {
  Object.assign(state, d, { loaded: true });
  changed("all");
}

// ---------------------------------------------------------------------------
// Local row helpers
// ---------------------------------------------------------------------------
export const byId = (coll, id) => state[coll].find((r) => r.id === id);

function putLocal(coll, row) {
  const arr = state[coll];
  const i = arr.findIndex((r) => r.id === row.id);
  if (i < 0) arr.push(row); else arr[i] = row;
}

function dropLocal(coll, id) {
  const i = state[coll].findIndex((r) => r.id === id);
  if (i >= 0) state[coll].splice(i, 1);
}

export const newId = () =>
  (crypto.randomUUID ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)));

// Timestamps from REST ("2026-11-13T10:00:00.123456+00:00") and realtime may be formatted
// differently; compare them as milliseconds.
export function stamp(s) {
  if (!s) return 0;
  const iso = String(s).replace(" ", "T").replace(/(\.\d{3})\d+/, "$1").replace(/([+-]\d\d)$/, "$1:00");
  return Date.parse(iso) || 0;
}

// Rows with a write in flight ignore realtime events until the server answers, so a quick
// tick-untick never flickers back to an older state.
const pending = new Map();
const busy = (id, d) => { const n = (pending.get(id) || 0) + d; if (n > 0) pending.set(id, n); else pending.delete(id); };

// ---------------------------------------------------------------------------
// Optimistic writes
// ---------------------------------------------------------------------------
async function persist(id, save, onSaved, rollback, what) {
  busy(id, 1);
  try {
    const saved = await save();
    busy(id, -1);
    if (saved) onSaved(saved);
    changed(what);
    return saved || true;
  } catch (err) {
    busy(id, -1);
    console.warn("Write failed", err);
    rollback();
    changed(what);
    toast(errorText(err, "toast_not_saved"));
    reload();
    return null;
  }
}

// Insert a row; returns the saved row (or null on failure).
export function insertRow(coll, fields) {
  const row = { id: newId(), createdAt: new Date().toISOString(), ...fields };
  putLocal(coll, row);
  changed(coll);
  return persist(row.id, () => backend.insert(coll, row), (s) => putLocal(coll, s), () => dropLocal(coll, row.id), coll);
}

// Update fields of a row.
export function updateRow(coll, id, patch) {
  const before = byId(coll, id);
  if (!before) return Promise.resolve(null);
  putLocal(coll, { ...before, ...patch });
  changed(coll);
  return persist(id, () => backend.update(coll, id, patch), (s) => putLocal(coll, s), () => putLocal(coll, before), coll);
}

// Delete a row for real; with `undoLabel` an undo toast offers to put it back (same id).
export async function deleteRow(coll, id, { undoLabel } = {}) {
  const before = byId(coll, id);
  if (!before) return null;
  dropLocal(coll, id);
  changed(coll);
  const ok = await persist(id, () => backend.remove(coll, id), () => {}, () => putLocal(coll, before), coll);
  if (ok && undoLabel) undoToast(undoLabel, () => insertRow(coll, before));
  return ok;
}

// Shared household settings (accent, thresholds).
export function saveSettings(patch) {
  const before = state.settings;
  state.settings = { ...before, ...patch };
  changed("settings");
  return persist("settings", () => backend.saveSettings(patch), (s) => { state.settings = s; },
    () => { state.settings = before; }, "settings");
}

// ---------------------------------------------------------------------------
// Realtime: patch one row per event
// ---------------------------------------------------------------------------
export function applyRemote(coll, type, row, old) {
  if (coll === "household") {
    if (type === "UPDATE" && row) { state.household = { ...state.household, ...row }; changed("household"); }
    return;
  }
  if (coll === "settings") {
    if (!row || pending.has("settings")) return;
    if (state.settings && stamp(state.settings.updatedAt) === stamp(row.updatedAt)) return;
    state.settings = row;
    changed("settings");
    return;
  }
  if (coll === "members") {
    if (type === "DELETE") state.members = state.members.filter((m) => m.userId !== (old && old.userId));
    else if (row && !state.members.some((m) => m.userId === row.userId)) state.members.push(row);
    changed("members");
    return;
  }
  if (!COLLECTIONS.includes(coll)) return;
  if (type === "DELETE") {
    const id = old && old.id;
    if (!id || pending.has(id) || !byId(coll, id)) return;
    dropLocal(coll, id);
  } else {
    if (!row || pending.has(row.id)) return;
    const cur = byId(coll, row.id);
    if (cur && stamp(cur.updatedAt) === stamp(row.updatedAt)) return; // our own echo
    putLocal(coll, row);
  }
  changed(coll);
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------
const CODES = ["NOT_SIGNED_IN", "NO_HOUSEHOLD", "ALREADY_IN_HOUSEHOLD", "BAD_NAME", "BAD_CODE", "BAD_SERVINGS", "NOT_FOUND"];

// RPC errors carry short English codes (schema.sql §7); map them to Polish, else use the fallback.
export function errorText(err, fallbackKey = "err_generic") {
  const msg = String((err && err.message) || err || "");
  const code = CODES.find((c) => msg.includes(c));
  return t(code ? "err_" + code : fallbackKey);
}
