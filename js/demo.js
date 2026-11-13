// demoBackend(): the same API as sbBackend (js/backend.js) with realistic Polish sample data held
// in memory. Used by ?demo; it never touches Supabase and nothing is saved. Later milestones extend
// the sample data and the methods so ?demo always shows the latest features.
import { newId } from "./store.js";

const CATEGORIES = [
  "Owoce i warzywa", "Pieczywo", "Nabiał", "Mięso i wędliny", "Ryby", "Mrożonki", "Makaron, ryż i kasze",
  "Pieczenie", "Przyprawy", "Oleje i sosy", "Konserwy", "Płatki i przekąski", "Słodycze", "Napoje",
  "Kawa i herbata", "Chemia", "Inne"
];
const UNITS = ["szt", "g", "dag", "kg", "ml", "l", "opak", "łyżka", "łyżeczka", "szklanka", "pęczek", "plaster"];

// keyword → category (a rule matches when the keyword is part of the item name; the longest wins)
const RULES = {
  "Owoce i warzywa": ["cukinia", "cebula", "pomidor", "banan", "jabłk", "czosnek", "marchew", "ziemniak", "papryka", "cytryn", "szpinak"],
  "Pieczywo": ["chleb", "bułk", "bagietk", "tortill"],
  "Nabiał": ["mleko", "jogurt", "ser", "masło", "jajka", "śmietan", "twaróg"],
  "Mięso i wędliny": ["kurczak", "szynk", "boczek", "mięso mielone"],
  "Ryby": ["krewetk", "łosoś", "tuńczyk", "dorsz"],
  "Mrożonki": ["mrożon", "lody"],
  "Makaron, ryż i kasze": ["makaron", "ryż", "kasza", "kuskus", "spaghetti"],
  "Pieczenie": ["mąka", "cukier", "drożdże", "proszek do pieczenia"],
  "Przyprawy": ["pieprz", "sól", "papryka słodka", "kmin", "cynamon", "pasta miso", "curry"],
  "Oleje i sosy": ["oliwa", "olej", "sos sojowy", "ocet", "ketchup", "musztarda"],
  "Konserwy": ["mleko kokosowe", "pomidory w puszce", "ciecierzyca", "fasola"],
  "Płatki i przekąski": ["płatki owsiane", "musli", "orzechy", "chipsy"],
  "Słodycze": ["czekolad", "ciastk"],
  "Napoje": ["woda", "sok"],
  "Kawa i herbata": ["kawa", "herbata"],
  "Chemia": ["płyn do naczyń", "papier toaletowy", "gąbk"]
};

function iso(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}
function monthEnd(monthsFromNow) {
  const d = new Date();
  const end = new Date(d.getFullYear(), d.getMonth() + 1 + monthsFromNow, 0);
  return end.getFullYear() + "-" + String(end.getMonth() + 1).padStart(2, "0") + "-" + String(end.getDate()).padStart(2, "0");
}

function sampleData() {
  const now = Date.now();
  const ts = (minAgo) => new Date(now - minAgo * 60000).toISOString();
  const categories = CATEGORIES.map((name, i) => ({ id: "cat-" + i, name, nameKey: name.toLowerCase(), position: i + 1, updatedAt: ts(9000) }));
  const cat = (name) => categories.find((c) => c.name === name).id;
  const categoryRules = [];
  for (const [c, words] of Object.entries(RULES)) {
    for (const w of words) categoryRules.push({ id: "rule-" + categoryRules.length, keyword: w, keywordKey: w, categoryId: cat(c), updatedAt: ts(9000) });
  }
  const units = UNITS.map((code, i) => ({ id: "unit-" + i, code, position: i + 1, updatedAt: ts(9000) }));

  const item = (name, amount, unit, category, extra = {}) => ({
    id: newId(), name, nameKey: name.toLowerCase(), amount, unit, categoryId: category ? cat(category) : null,
    checked: false, checkedAt: null, note: null, recipeId: null, createdBy: "demo-you", ...extra
  });
  let age = 400;
  const shopping = [
    item("Cukinia", 2, "szt", "Owoce i warzywa"),
    item("Cebula dymka", 1, "pęczek", "Owoce i warzywa"),
    item("Mleko bez laktozy 3,2%", 2, "l", "Nabiał", { note: "łaciate" }),
    item("Jogurt grecki", 400, "g", "Nabiał", { createdBy: "demo-partner" }),
    item("Krewetki", 400, "g", "Ryby", { note: "do ryżu" }),
    item("Chleb żytni", 1, "szt", "Pieczywo", { checked: true, checkedAt: ts(30) }),
    item("Banany", 6, "szt", "Owoce i warzywa", { checked: true, checkedAt: ts(28), createdBy: "demo-partner" }),
    item("Masło", 1, "opak", "Nabiał", { checked: true, checkedAt: ts(25) })
  ].map((r) => ({ ...r, createdAt: ts((age -= 20)), updatedAt: ts(age) }));

  const p = (name, amount, unit, category, extra = {}) => ({
    id: newId(), name, nameKey: name.toLowerCase(), amount, unit, categoryId: cat(category),
    bestBefore: null, bestBeforePrecision: "day", low: false, note: null, createdBy: "demo-you",
    createdAt: ts(20000), updatedAt: ts(20000), ...extra
  });
  const pantry = [
    p("Mleko kokosowe", 400, "ml", "Konserwy", { bestBefore: iso(6) }),
    p("Pasta miso", 1, "opak", "Przyprawy", { bestBefore: monthEnd(0), bestBeforePrecision: "month" }),
    p("Kuskus", 200, "g", "Makaron, ryż i kasze", { low: true }),
    p("Oliwa z oliwek", null, null, "Oleje i sosy", { low: true, note: "¼ butelki" }),
    p("Ryż jaśminowy", 1, "kg", "Makaron, ryż i kasze", { bestBefore: monthEnd(12), bestBeforePrecision: "month" }),
    p("Ryż do sushi", 500, "g", "Makaron, ryż i kasze"),
    p("Kasza gryczana", 400, "g", "Makaron, ryż i kasze"),
    p("Makaron spaghetti", 500, "g", "Makaron, ryż i kasze", { bestBefore: monthEnd(8), bestBeforePrecision: "month" }),
    p("Płatki owsiane", 500, "g", "Płatki i przekąski"),
    p("Orzechy włoskie", 150, "g", "Płatki i przekąski"),
    p("Sos sojowy", 250, "ml", "Oleje i sosy"),
    p("Olej rzepakowy", 1, "l", "Oleje i sosy"),
    p("Ocet ryżowy", 150, "ml", "Oleje i sosy"),
    p("Czosnek", 1, "szt", "Owoce i warzywa"),
    p("Cebula", 3, "szt", "Owoce i warzywa"),
    p("Jabłka", 4, "szt", "Owoce i warzywa"),
    p("Pomidory w puszce", 2, "szt", "Konserwy", { bestBefore: monthEnd(14), bestBeforePrecision: "month" }),
    p("Ciecierzyca", 1, "szt", "Konserwy"),
    p("Mąka pszenna", 1, "kg", "Pieczenie"),
    p("Cukier", 0, "kg", "Pieczenie"),
    p("Pieprz czarny", 1, "opak", "Przyprawy"),
    p("Papryka słodka", 1, "opak", "Przyprawy"),
    p("Kmin rzymski", 1, "opak", "Przyprawy"),
    p("Cynamon", 1, "opak", "Przyprawy"),
    p("Jajka", 6, "szt", "Nabiał", { bestBefore: iso(12) }),
    p("Ser feta", 200, "g", "Nabiał", { bestBefore: iso(3) }),
    p("Nori", 10, "szt", "Inne"),
    p("Kawa ziarnista", 250, "g", "Kawa i herbata"),
    p("Herbata zielona", 1, "opak", "Kawa i herbata")
  ];

  const recipes = [];
  const ingredients = [];
  const steps = [];
  const recipe = (title, mealType, servings, prep, cook, ings, stepTexts, extra = {}) => {
    const id = newId();
    recipes.push({
      id, title, mealType, servings, prepMinutes: prep, cookMinutes: cook, description: null, sourceUrl: null,
      imagePath: null, tags: [], favorite: false, notes: null, createdBy: "demo-you", createdAt: ts(30000), updatedAt: ts(30000), ...extra
    });
    ings.forEach(([name, amount, unit, note, section], i) => ingredients.push({
      id: newId(), recipeId: id, position: i + 1, name, nameKey: name.toLowerCase(), amount, unit, note: note || null,
      section: section || null, updatedAt: ts(30000)
    }));
    stepTexts.forEach((s, i) => {
      const [text, timer] = Array.isArray(s) ? s : [s, null];
      steps.push({ id: newId(), recipeId: id, position: i + 1, text, timerMinutes: timer, updatedAt: ts(30000) });
    });
  };
  recipe("Ryż z krewetkami i cukinią", "lunch", 2, 10, 20, [
    ["Ryż jaśminowy", 150, "g"], ["Krewetki", 200, "g"], ["Cukinia", 1, "szt"], ["Czosnek", 2, "ząbki"],
    ["Sos sojowy", 2, "łyżka"], ["Cebula dymka", 2, "szt"]
  ], [
    ["Ugotuj ryż według przepisu na opakowaniu.", 15],
    "Pokrój cukinię w półplasterki, czosnek drobno posiekaj.",
    ["Podsmaż krewetki na oleju, aż się zarumienią, i odłóż.", 3],
    ["Na tej samej patelni smaż cukinię z czosnkiem.", 5],
    "Dodaj ryż, krewetki i sos sojowy, wymieszaj. Posyp dymką."
  ]);
  recipe("Owsianka z jabłkiem", "breakfast", 2, 5, 10, [
    ["Płatki owsiane", 100, "g"], ["Mleko bez laktozy 3,2%", 400, "ml"], ["Jabłka", 1, "szt"],
    ["Cynamon", 1, "łyżeczka"], ["Orzechy włoskie", 30, "g"]
  ], [
    ["Zagotuj mleko z płatkami i gotuj, mieszając.", 5],
    "Zetrzyj jabłko, dodaj z cynamonem.",
    "Posyp posiekanymi orzechami."
  ]);
  recipe("Onigiri", "dinner", 2, 20, 20, [
    ["Ryż do sushi", 300, "g"], ["Ocet ryżowy", 2, "łyżka"], ["Nori", 4, "szt"], ["Tuńczyk", 1, "szt", "w puszce"]
  ], [
    ["Ugotuj ryż i dopraw octem.", 20],
    "Wymieszaj tuńczyka z odrobiną majonezu.",
    "Uformuj trójkąty z nadzieniem w środku i owiń paskiem nori."
  ]);
  recipe("Szakszuka z fetą", "breakfast", 2, 10, 15, [
    ["Pomidory w puszce", 1, "szt"], ["Jajka", 4, "szt"], ["Cebula", 1, "szt"], ["Czosnek", 1, "ząbek"],
    ["Kmin rzymski", 1, "łyżeczka"], ["Papryka słodka", 1, "łyżeczka"], ["Ser feta", 100, "g"]
  ], [
    "Zeszklij cebulę z czosnkiem i przyprawami.",
    ["Dodaj pomidory i duś, aż sos zgęstnieje.", 8],
    ["Zrób dołki, wbij jajka i przykryj.", 6],
    "Posyp fetą i podawaj z chlebem."
  ]);
  recipe("Spaghetti aglio e olio", "dinner", 2, 5, 12, [
    ["Makaron spaghetti", 200, "g"], ["Oliwa z oliwek", 4, "łyżka"], ["Czosnek", 4, "ząbki"], ["Natka pietruszki", 1, "pęczek"]
  ], [
    ["Ugotuj makaron al dente.", 9],
    "Na oliwie podgrzej plasterki czosnku, aż się zezłocą.",
    "Wymieszaj makaron z oliwą i natką."
  ]);

  return {
    household: { id: "demo", name: "Nasza kuchnia", code: "K7Q2MX4P", createdAt: ts(60000) },
    members: [
      { userId: "demo-you", email: "ala@przyklad.pl", joinedAt: ts(60000) },
      { userId: "demo-partner", email: "gienek@przyklad.pl", joinedAt: ts(59000) }
    ],
    settings: { defaultServings: 2, expiringSoonDays: 7, accent: "matcha", updatedAt: ts(60000) },
    categories, categoryRules, units, shopping, pantry, recipes, ingredients, steps
  };
}

export const DEMO_USER = { id: "demo-you", email: "ala@przyklad.pl" };

export function demoBackend() {
  const data = sampleData();
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const wait = (ms = 120) => new Promise((r) => setTimeout(r, ms));
  const stampNow = () => new Date().toISOString();
  const keyed = (row) => {
    const r = { ...row, updatedAt: stampNow() };
    if ("name" in r) r.nameKey = String(r.name).trim().toLowerCase();
    if ("keyword" in r) r.keywordKey = String(r.keyword).trim().toLowerCase();
    return r;
  };
  const find = (coll, id) => data[coll].find((r) => r.id === id);

  return {
    kind: "demo",
    async load() { await wait(); return clone(data); },
    async insert(coll, row) {
      await wait(80);
      const r = keyed({ ...row, id: row.id || newId(), createdAt: row.createdAt || stampNow() });
      if (coll === "shopping") r.checkedAt = r.checked ? stampNow() : null;
      data[coll].push(r);
      return clone(r);
    },
    async update(coll, id, patch) {
      await wait(80);
      const r = find(coll, id);
      if (!r) throw new Error("NOT_FOUND");
      if (coll === "shopping" && "checked" in patch && patch.checked !== r.checked) r.checkedAt = patch.checked ? stampNow() : null;
      Object.assign(r, keyed({ ...r, ...patch }));
      return clone(r);
    },
    async remove(coll, id) {
      await wait(80);
      data[coll] = data[coll].filter((r) => r.id !== id);
      if (coll === "recipes") {
        data.ingredients = data.ingredients.filter((r) => r.recipeId !== id);
        data.steps = data.steps.filter((r) => r.recipeId !== id);
      }
      return true;
    },
    async saveSettings(patch) { await wait(80); Object.assign(data.settings, patch, { updatedAt: stampNow() }); return clone(data.settings); },
    async createHousehold() { return clone(data.household); },
    async joinHousehold() { return clone(data.household); },
    async renameHousehold(name) {
      await wait(80);
      const n = String(name || "").trim();
      if (n.length < 1 || n.length > 60) throw new Error("BAD_NAME");
      data.household.name = n;
      return clone(data.household);
    },
    async newCode() {
      await wait(200);
      const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      data.household.code = Array.from({ length: 8 }, () => A[Math.floor(Math.random() * A.length)]).join("");
      return data.household.code;
    },
    async moveCheckedToPantry() {
      // Simplified version of the RPC: merge by name, add amounts when units match.
      await wait();
      const bought = data.shopping.filter((s) => s.checked);
      for (const s of bought) {
        const key = s.name.trim().toLowerCase();
        const hit = data.pantry.find((x) => x.nameKey === key && x.unit === s.unit) || data.pantry.find((x) => x.nameKey === key);
        if (hit) {
          if (hit.amount == null || hit.amount === 0) { hit.amount = s.amount; hit.unit = s.unit; }
          else if (hit.unit === s.unit && s.amount != null) hit.amount += s.amount;
          Object.assign(hit, { low: false, updatedAt: stampNow() });
        } else {
          data.pantry.push(keyed({ id: newId(), name: s.name, amount: s.amount, unit: s.unit, categoryId: s.categoryId,
            bestBefore: null, bestBeforePrecision: "day", low: false, note: null, createdAt: stampNow() }));
        }
      }
      data.shopping = data.shopping.filter((s) => !s.checked);
      return bought.length;
    },
    async addRecipeToList() { await wait(); return { added: 0, merged: 0, skipped: 0 }; },
    subscribe(householdId, onRow, onStatus) { setTimeout(() => onStatus(true), 0); },
    unsubscribe() {},
    async signOut() {}
  };
}
