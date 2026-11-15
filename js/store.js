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
  queued: 0,                // writes waiting for the network
  live: false,              // realtime channel subscribed
  loaded: false
};

// Collections that hold a list of rows with an `id` (realtime patches these by id).
export const COLLECTIONS = ["categories", "categoryRules", "units", "shopping", "pantry", "recipes", "ingredients", "steps"];

let backend = null;
let reload = () => {};
export function useBackend(b, reloadFn) { backend = b; reload = reloadFn || reload; }
export const getBackend = () => backend;
// Full reload of server data (used after an RPC that changes other tables, e.g. move to pantry).
export const refresh = () => reload();

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

export function putLocal(coll, row) {
  const arr = state[coll];
  const i = arr.findIndex((r) => r.id === row.id);
  if (i < 0) arr.push(row); else arr[i] = row;
}

export function dropLocal(coll, id) {
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
const busyAll = (ids, d) => ids.forEach((id) => busy(id, d));

// ---------------------------------------------------------------------------
// Offline queue: a write that fails because the network is gone keeps its local change and waits
// here (in memory, in order) until the connection is back. Any other error rolls back.
// ---------------------------------------------------------------------------
const queue = [];
let retryTimer = 0;

export function isNetworkError(err) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const msg = String((err && (err.message || err.details)) || err || "");
  return /failed to fetch|networkerror|load failed|network request failed|network connection was lost|fetch failed/i.test(msg);
}

function enqueue(job) {
  queue.push(job);
  state.queued = queue.length;
  changed("status");
  clearTimeout(retryTimer);
  retryTimer = setTimeout(() => flushQueue().then((empty) => { if (empty) reload(); }), 15000);
}

// Sends queued writes in order. Resolves true when the queue is empty afterwards.
let flushing = null;
export function flushQueue() {
  if (!queue.length) return Promise.resolve(true);
  if (flushing) return flushing;
  flushing = (async () => {
    while (queue.length) {
      const job = queue[0];
      try {
        const saved = await job.save();
        queue.shift();
        busyAll(job.ids, -1);
        if (saved && job.onSaved) job.onSaved(saved);
      } catch (err) {
        if (isNetworkError(err)) break; // still offline: try again later
        queue.shift();
        busyAll(job.ids, -1);
        console.warn("Queued write failed", err);
        toast(errorText(err, "toast_not_saved"));
      }
    }
    state.queued = queue.length;
    changed("status", "all");
    clearTimeout(retryTimer);
    if (queue.length) retryTimer = setTimeout(() => flushQueue().then((empty) => { if (empty) reload(); }), 15000);
    flushing = null;
    return !queue.length;
  })();
  return flushing;
}

// ---------------------------------------------------------------------------
// Optimistic writes
// ---------------------------------------------------------------------------
// The general form: `apply` changes local state, `save` writes to the backend, `rollback` undoes
// `apply`. `ids` are the rows whose realtime events wait until the write is done.
// Returns the saved value, true when queued offline, or null when it failed.
export async function optimistic({ ids = [], apply, save, onSaved, rollback, what }) {
  if (apply) apply();
  changed(what);
  busyAll(ids, 1);
  try {
    const saved = queue.length ? Promise.reject(new TypeError("Failed to fetch")) : save();
    const res = await saved;
    busyAll(ids, -1);
    if (res && onSaved) onSaved(res);
    changed(what);
    return res || true;
  } catch (err) {
    if (isNetworkError(err)) {
      enqueue({ ids, save, onSaved, what });
      return true;
    }
    busyAll(ids, -1);
    console.warn("Write failed", err);
    if (rollback) rollback();
    changed(what);
    toast(errorText(err, "toast_not_saved"));
    reload();
    return null;
  }
}

function persist(id, save, onSaved, rollback, what) {
  return optimistic({ ids: [id], save, onSaved, rollback, what });
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
  if (ok && undoLabel) undoToast(undoLabel, () => insertRows(coll, [before]));
  return ok;
}

// Insert several rows in one request (undo of a bulk delete keeps the original ids).
export function insertRows(coll, rows) {
  rows = rows.map((r) => ({ id: newId(), createdAt: new Date().toISOString(), ...r }));
  const ids = rows.map((r) => r.id);
  return optimistic({
    ids, what: coll,
    apply: () => rows.forEach((r) => putLocal(coll, r)),
    save: () => backend.insertMany(coll, rows),
    onSaved: (saved) => Array.isArray(saved) && saved.forEach((r) => putLocal(coll, r)),
    rollback: () => ids.forEach((id) => dropLocal(coll, id))
  });
}

// Delete several rows in one request; `undoLabel` offers to put them all back.
export async function deleteRows(coll, ids, { undoLabel } = {}) {
  const before = ids.map((id) => byId(coll, id)).filter(Boolean);
  if (!before.length) return null;
  ids = before.map((r) => r.id);
  const ok = await optimistic({
    ids, what: coll,
    apply: () => ids.forEach((id) => dropLocal(coll, id)),
    save: () => backend.removeMany(coll, ids),
    rollback: () => before.forEach((r) => putLocal(coll, r))
  });
  if (ok && undoLabel) undoToast(undoLabel, () => insertRows(coll, before));
  return ok;
}

// Set the same fields on several rows in one request.
export function updateRows(coll, ids, patch) {
  const before = ids.map((id) => byId(coll, id)).filter(Boolean);
  if (!before.length) return Promise.resolve(true);
  ids = before.map((r) => r.id);
  return optimistic({
    ids, what: coll,
    apply: () => before.forEach((r) => putLocal(coll, { ...r, ...patch })),
    save: () => backend.updateMany(coll, ids, patch),
    onSaved: (saved) => Array.isArray(saved) && saved.forEach((r) => putLocal(coll, r)),
    rollback: () => before.forEach((r) => putLocal(coll, r))
  });
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
