// Translation lookup. Polish is the only dictionary for now; English can be added as i18n/en.js.
import pl from "../i18n/pl.js";

const dict = pl;
const locale = "pl-PL";

// t("key", { n: 3 }) → string with {placeholders} filled in. Missing keys show the key itself
// so they are easy to spot.
export function t(key, vars) {
  let s = dict[key];
  if (s == null) { console.warn("Missing string:", key); return key; }
  if (Array.isArray(s)) s = s[pluralIndex(vars && vars.n)];
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? fmtVar(vars[k]) : m)) : s;
}

export function list(key) { return dict[key]; }

// Polish plural categories: 1 → one; 2–4 (not 12–14) → few; everything else → many.
function pluralIndex(n) {
  n = Math.abs(Number(n) || 0);
  if (n === 1) return 0;
  const d = n % 10, h = n % 100;
  return d >= 2 && d <= 4 && (h < 12 || h > 14) ? 1 : 2;
}

function fmtVar(v) { return typeof v === "number" ? fmtNum(v) : String(v); }

// 1.5 → "1,5"; keeps at most 2 decimals.
export function fmtNum(n) {
  return Number(n).toLocaleString(locale, { maximumFractionDigits: 2 });
}

// "2 l", "400 g", "1 pęczek"; empty when nothing is known.
export function fmtAmount(amount, unit) {
  if (amount == null || amount === "") return unit || "";
  return unit ? fmtNum(amount) + " " + unit : fmtNum(amount);
}

// Date → "20 lis".
export function fmtDay(d) {
  d = toDate(d);
  return d.getDate() + " " + dict.months_short[d.getMonth()];
}

// Date → "lis 2026".
export function fmtMonth(d) {
  d = toDate(d);
  return dict.months_short[d.getMonth()] + " " + d.getFullYear();
}

function toDate(d) {
  if (d instanceof Date) return d;
  // Plain dates ("2026-11-20") are local days, not UTC midnight.
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) { const [y, m, day] = d.split("-").map(Number); return new Date(y, m - 1, day); }
  return new Date(d);
}

// Whole days from today to the date (negative = past).
export function daysUntil(d) {
  const a = toDate(d), now = new Date();
  const ms = new Date(a.getFullYear(), a.getMonth(), a.getDate()) - new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round(ms / 864e5);
}
