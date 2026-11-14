// Pure helpers for the shopping list: parsing "name amount unit" from the add field, matching
// category rules and the autocomplete ranking. No DOM and no state, so tests/parse.html can run
// them in the browser without the app.

// The same key as the database's generated name_key: lower(trim(name)).
export const nameKey = (s) => String(s ?? "").trim().toLowerCase();

// Common spellings that mean one of the household's unit codes. Only used when that code is in
// the household's units, so a household without "łyżka" never gets it.
const ALIASES = {
  "szt.": "szt", "sztuk": "szt", "sztuki": "szt", "sztuka": "szt", "x": "szt",
  "gr": "g", "gram": "g", "gramów": "g",
  "dkg": "dag", "deko": "dag",
  "kilo": "kg", "kg.": "kg",
  "litr": "l", "litry": "l", "litrów": "l", "ltr": "l",
  "opak.": "opak", "opakowanie": "opak", "opakowania": "opak", "op": "opak", "op.": "opak",
  "łyżki": "łyżka", "łyżek": "łyżka", "łyżeczki": "łyżeczka", "łyżeczek": "łyżeczka",
  "szklanki": "szklanka", "szklanek": "szklanka",
  "pęczki": "pęczek", "pęczków": "pęczek", "pęczka": "pęczek",
  "plastry": "plaster", "plastrów": "plaster", "plasterki": "plaster", "plastra": "plaster"
};

// "2", "0,5", "1.25", "1/2", "½" → number, or null.
const NUM = "(?:\\d+(?:[.,]\\d+)?|\\d+\\/\\d+|½|¼|¾)";
export function toNumber(s) {
  s = String(s ?? "").trim();
  if (s === "½") return 0.5;
  if (s === "¼") return 0.25;
  if (s === "¾") return 0.75;
  if (/^\d+\/\d+$/.test(s)) { const [a, b] = s.split("/").map(Number); return b ? a / b : null; }
  if (!/^\d+(?:[.,]\d+)?$/.test(s)) return null;
  return Number(s.replace(",", "."));
}

// Unit code for a token ("L" → "l", "łyżki" → "łyżka"), or null when it is not a unit.
export function unitFor(token, codes) {
  const k = nameKey(token);
  if (!k) return null;
  const hit = codes.find((c) => nameKey(c) === k);
  if (hit) return hit;
  const alias = ALIASES[k];
  return alias && codes.includes(alias) ? alias : null;
}

const valid = (n) => n != null && Number.isFinite(n) && n > 0 && n < 1e6;
const round = (n) => Math.round(n * 1000) / 1000;

// parseItem("mąka 0,5 kg", ["kg", …]) → { name: "mąka", amount: 0.5, unit: "kg" }
// Accepted shapes, amount and unit optional: "name 2 l", "name 2l", "name 10", "2 l name",
// "2 name". The name is never left empty: "7 l" alone stays a name. Text like "3,2%" is part
// of the name because "%" is not a unit.
export function parseItem(text, codes = []) {
  const r = parseRaw(text, codes);
  // A "name" that is only a unit or a number means the guess was wrong: keep the text as typed.
  if (!r.name || unitFor(r.name, codes) || toNumber(r.name) != null) {
    return { name: String(text ?? "").replace(/\s+/g, " ").trim(), amount: null, unit: null };
  }
  return r;
}

function parseRaw(text, codes) {
  const raw = String(text ?? "").replace(/\s+/g, " ").trim();
  const none = { name: raw, amount: null, unit: null };
  if (!raw) return none;
  const words = raw.split(" ");

  // Amount (and unit) at the end: "… 2 l", "… 2l", "… 10"
  const tail = (w) => {
    const glued = new RegExp("^(" + NUM + ")([^\\d\\s.,/].*)$").exec(w); // "2l", "0,5kg"
    if (glued) { const u = unitFor(glued[2], codes); const n = toNumber(glued[1]); if (u && valid(n)) return { amount: n, unit: u }; }
    return null;
  };
  if (words.length >= 2) {
    const last = words[words.length - 1];
    const prev = words[words.length - 2];
    const u = unitFor(last, codes);
    if (u && words.length >= 3 && valid(toNumber(prev))) {
      return { name: words.slice(0, -2).join(" "), amount: round(toNumber(prev)), unit: u };
    }
    const g = tail(last);
    if (g) return { name: words.slice(0, -1).join(" "), amount: round(g.amount), unit: g.unit };
    if (valid(toNumber(last))) return { name: words.slice(0, -1).join(" "), amount: round(toNumber(last)), unit: null };

    // Amount (and unit) at the start: "2 l mleka", "2l mleka", "2 jajka"
    const first = words[0];
    const second = words[1];
    if (valid(toNumber(first))) {
      const u2 = unitFor(second, codes);
      if (u2 && words.length >= 3) return { name: words.slice(2).join(" "), amount: round(toNumber(first)), unit: u2 };
      return { name: words.slice(1).join(" "), amount: round(toNumber(first)), unit: null };
    }
    const g2 = tail(first);
    if (g2) return { name: words.slice(1).join(" "), amount: round(g2.amount), unit: g2.unit };
  }
  return none;
}

// Longest rule whose keyword_key is a substring of the name_key wins (same as the database).
export function matchRule(key, rules) {
  key = nameKey(key);
  if (!key) return null;
  let best = null;
  for (const r of rules) {
    const k = r.keywordKey || nameKey(r.keyword);
    if (k && key.includes(k) && (!best || k.length > (best.keywordKey || nameKey(best.keyword)).length)) best = r;
  }
  return best ? best.categoryId : null;
}

// How well a name matches what was typed: 0 = no match, 3 = same, 2 = starts with it,
// 1 = a later word starts with it ("bez" finds "Mleko bez laktozy").
export function matchScore(name, query) {
  const n = nameKey(name), q = nameKey(query);
  if (!q || !n) return 0;
  if (n === q) return 3;
  if (n.startsWith(q)) return 2;
  return n.split(/[\s,.\-/()]+/).some((w) => w.startsWith(q)) ? 1 : 0;
}

// Suggestions from several sources, best first, one per name. `sources` are arrays of
// { name, …rest } already in priority order (list, pantry, recent); ties keep that order.
export function suggest(query, sources, limit = 4) {
  if (!nameKey(query)) return [];
  const seen = new Set();
  const out = [];
  sources.forEach((list, si) => {
    for (const it of list) {
      const k = nameKey(it.name);
      if (seen.has(k)) continue;
      const score = matchScore(it.name, query);
      if (!score) continue;
      seen.add(k);
      out.push({ ...it, score, si });
    }
  });
  out.sort((a, b) => b.score - a.score || a.si - b.si || nameKey(a.name).length - nameKey(b.name).length);
  return out.slice(0, limit);
}
