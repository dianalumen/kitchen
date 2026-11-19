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
    p("Herbata zielona", 1, "opak", "Kawa i herbata", { bestBefore: monthEnd(-1), bestBeforePrecision: "month" }),
    p("Jogurt naturalny", 300, "g", "Nabiał", { bestBefore: iso(-2) }),
    p("Śmietana 18%", 200, "ml", "Nabiał", { bestBefore: iso(2) }),
    p("Masło", 1, "opak", "Nabiał", { bestBefore: iso(20) }),
    p("Twaróg", 250, "g", "Nabiał", { bestBefore: iso(0) }),
    p("Szynka", 150, "g", "Mięso i wędliny", { bestBefore: iso(11) }),
    p("Tuńczyk w puszce", 3, "szt", "Konserwy", { bestBefore: monthEnd(18), bestBeforePrecision: "month" }),
    p("Fasola czerwona", 1, "szt", "Konserwy"),
    p("Mleko roślinne", 0, "l", "Nabiał"),
    p("Drożdże", 1, "opak", "Pieczenie", { low: true, bestBefore: iso(9) }),
    p("Cukier puder", 250, "g", "Pieczenie"),
    p("Proszek do pieczenia", 1, "opak", "Pieczenie", { bestBefore: monthEnd(6), bestBeforePrecision: "month" }),
    p("Sól", 1, "kg", "Przyprawy"),
    p("Curry", 1, "opak", "Przyprawy", { low: true }),
    p("Ketchup", 1, "szt", "Oleje i sosy", { bestBefore: monthEnd(3), bestBeforePrecision: "month" }),
    p("Musztarda", 1, "szt", "Oleje i sosy"),
    p("Oliwa z oliwek extra", 500, "ml", "Oleje i sosy"),
    p("Czekolada gorzka", 100, "g", "Słodycze"),
    p("Ciastka owsiane", 1, "opak", "Słodycze", { bestBefore: iso(30) }),
    p("Woda gazowana", 6, "szt", "Napoje"),
    p("Sok pomarańczowy", 1, "l", "Napoje", { bestBefore: iso(10) }),
    p("Mrożony szpinak", 2, "opak", "Mrożonki"),
    p("Ziemniaki", 2, "kg", "Owoce i warzywa"),
    p("Pomidory", 4, "szt", "Owoce i warzywa", { bestBefore: iso(12) }),
    p("Cytryny", 2, "szt", "Owoce i warzywa", { low: true }),
    p("Chleb tostowy", 1, "opak", "Pieczywo", { bestBefore: iso(-1) }),
    p("Tortille", 1, "opak", "Pieczywo", { bestBefore: iso(16) }),
    p("Płyn do naczyń", 1, "szt", "Chemia"),
    p("Papier toaletowy", 8, "szt", "Chemia", { low: true })
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
    ings.forEach(([name, amount, unit, note, section, grams], i) => ingredients.push({
      id: newId(), recipeId: id, position: i + 1, name, nameKey: name.toLowerCase(), amount, unit, note: note || null,
      section: section || null, grams: grams ?? (unit === "g" ? amount : null), updatedAt: ts(30000)
    }));
    stepTexts.forEach((s, i) => {
      const [text, timer] = Array.isArray(s) ? s : [s, null];
      steps.push({ id: newId(), recipeId: id, position: i + 1, text, timerMinutes: timer, updatedAt: ts(30000) });
    });
  };
  recipe("Ryż z krewetkami i cukinią", "lunch", 2, 10, 20, [
    ["Ryż jaśminowy", 150, "g"], ["Krewetki", 200, "g"], ["Cukinia", 1, "szt"], ["Czosnek", 2, "ząbek"],
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
    ["Makaron spaghetti", 200, "g"], ["Oliwa z oliwek", 4, "łyżka"], ["Czosnek", 4, "ząbek"], ["Natka pietruszki", 1, "pęczek"]
  ], [
    ["Ugotuj makaron al dente.", 9],
    "Na oliwie podgrzej plasterki czosnku, aż się zezłocą.",
    "Wymieszaj makaron z oliwą i natką."
  ]);

  recipe("Naleśniki z twarogiem", "breakfast", 4, 15, 20, [
    ["Mąka pszenna", 1, "szklanka", null, "Ciasto"], ["Mleko bez laktozy 3,2%", 300, "ml", null, "Ciasto"], ["Jajka", 2, "szt", null, "Ciasto"],
    ["Olej rzepakowy", 1, "łyżka", null, "Ciasto"], ["Sól", 1, "szczypta", null, "Ciasto"],
    ["Twaróg", 250, "g", null, "Nadzienie"], ["Cukier puder", 2, "łyżka", null, "Nadzienie"], ["Cytryny", 0.5, "szt", "skórka", "Nadzienie"]
  ], [
    ["Zmiksuj mąkę, mleko, jajka, olej i sól. Odstaw ciasto.", 10],
    "Rozgrzej patelnię i smaż cienkie naleśniki z obu stron.",
    "Wymieszaj twaróg z cukrem pudrem i skórką z cytryny.",
    "Posmaruj naleśniki nadzieniem i zwiń w rulony."
  ]);
  recipe("Zupa krem z dyni", "lunch", 4, 15, 30, [
    ["Dynia hokkaido", 1, "kg"], ["Cebula", 1, "szt"], ["Czosnek", 2, "ząbek"], ["Mleko kokosowe", 400, "ml"],
    ["Bulion warzywny", 1, "l"], ["Curry", 1, "łyżeczka"], ["Pestki dyni", 30, "g", "do podania"]
  ], [
    "Pokrój dynię w kostkę, cebulę i czosnek posiekaj.",
    ["Zeszklij cebulę z czosnkiem i curry.", 4],
    ["Dodaj dynię i bulion, gotuj do miękkości.", 20],
    "Wlej mleko kokosowe i zmiksuj na gładki krem.",
    "Podawaj z pestkami dyni."
  ]);
  recipe("Hummus", "snack", 4, 10, 0, [
    ["Ciecierzyca", 1, "szt", "w puszce"], ["Tahini", 2, "łyżka"], ["Cytryny", 1, "szt", "sok"], ["Czosnek", 1, "ząbek"],
    ["Oliwa z oliwek", 3, "łyżka"], ["Kmin rzymski", 0.5, "łyżeczka"]
  ], [
    "Odcedź ciecierzycę, zachowaj trochę zalewy.",
    "Zmiksuj wszystko na gładko, dolewając zalewy do konsystencji.",
    "Przełóż do miseczki i polej oliwą."
  ]);

  // Dietitian-style recipes (M7.2): made-up sample data, one serving each, macros per serving,
  // grams on every ingredient, the household measure as the amount when it is countable.
  const diet = (kcal, proteinG, fatG, carbsG, fiberG, notes = null) =>
    ({ tags: ["Dietetyk"], kcal, proteinG, fatG, carbsG, fiberG, macrosSource: "dietitian", notes });
  recipe("Pasta jajeczna ze szczypiorkiem na żytnim", "breakfast", 1, 10, 0, [
    ["Chleb żytni razowy", 2, "kromka", null, null, 80], ["Jajka", 2, "szt", null, null, 112],
    ["Jogurt naturalny", 30, "g", "1,5 łyżki"], ["Rzodkiewka", 60, "g", "4 szt."], ["Szczypiorek", 5, "g", "1 łyżka"],
    ["Sól", 1, "g", "1 szczypta"]
  ], [
    ["Ugotuj jajka na twardo.", 9],
    "Obierz i posiekaj jajka, wymieszaj z jogurtem i szczypiorkiem, dopraw.",
    "Nałóż pastę na chleb, podawaj z rzodkiewką."
  ], diet(412.6, 23.8, 13.9, 44.1, 9.2));
  recipe("Dorsz z kaszą jaglaną i fasolką", "lunch", 1, 25, 0, [
    ["Dorsz", 150, "g", "filet"], ["Oliwa z oliwek", 5, "g", "0,5 łyżki"], ["Cytryny", 0.5, "szt", "sok", null, 40],
    ["Kasza jaglana", 60, "g", "4 łyżki", "Kasza jaglana"],
    ["Fasolka szparagowa", 150, "g", "mrożona", "Fasolka z czosnkiem"], ["Czosnek", 1, "ząbek", null, "Fasolka z czosnkiem", 5],
    ["Oliwa z oliwek", 5, "g", "0,5 łyżki", "Fasolka z czosnkiem"]
  ], [
    ["Skrop rybę sokiem z cytryny i oliwą, piecz w 190°C.", 15],
    ["Kasza jaglana: przepłucz kaszę i ugotuj w dwóch szklankach wody.", 15],
    ["Fasolka z czosnkiem: ugotuj fasolkę na parze.", 8],
    "Wymieszaj fasolkę z oliwą i przeciśniętym czosnkiem."
  ], diet(548.3, 38.7, 13.2, 62.5, 10.4));
  recipe("Serek wiejski z ogórkiem i pestkami", "snack", 1, 5, 0, [
    ["Serek wiejski", 1, "szt", "lekki", null, 150], ["Ogórek", 0.5, "szt", null, null, 90],
    ["Pestki słonecznika", 10, "g", "1 łyżka"], ["Pieprz", 1, "g", "1 szczypta"]
  ], [
    "Pokrój ogórka w kostkę, wymieszaj z serkiem i posyp pestkami."
  ], diet(231.4, 19.6, 11.8, 9.7, 2.1, "Można przygotować wieczorem i wziąć do pracy."));

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
  const images = new Map(); // path → object URL
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
  // Like the real backend, writes fail with a network error while the browser is offline, so the
  // offline queue can be tried in ?demo.
  const net = () => { if (!navigator.onLine) throw new TypeError("Failed to fetch"); };
  // Realtime callback from subscribe(); used for rows the "server" changes on its own (RPC results,
  // foreign-key cascades), the way Supabase sends them to every phone.
  let emit = () => {};
  const insertOne = (coll, row) => {
    const r = keyed({ ...row, id: row.id || newId(), createdAt: row.createdAt || stampNow() });
    if (coll === "shopping") r.checkedAt = r.checked ? (row.checkedAt || stampNow()) : null;
    data[coll].push(r);
    return r;
  };
  const updateOne = (coll, id, patch) => {
    const r = find(coll, id);
    if (!r) throw new Error("NOT_FOUND");
    if (coll === "shopping" && "checked" in patch && patch.checked !== r.checked) r.checkedAt = patch.checked ? stampNow() : null;
    Object.assign(r, keyed({ ...r, ...patch }));
    return r;
  };
  const removeOne = (coll, id) => {
    data[coll] = data[coll].filter((r) => r.id !== id);
    if (coll === "recipes") {
      data.ingredients = data.ingredients.filter((r) => r.recipeId !== id);
      data.steps = data.steps.filter((r) => r.recipeId !== id);
    }
    if (coll === "categories") {
      // on delete cascade (rules) and on delete set null (items), as in schema.sql
      for (const rule of data.categoryRules.filter((x) => x.categoryId === id)) {
        data.categoryRules = data.categoryRules.filter((x) => x !== rule);
        emit("categoryRules", "DELETE", null, { id: rule.id });
      }
      for (const c of ["shopping", "pantry"]) {
        for (const it of data[c].filter((x) => x.categoryId === id)) {
          Object.assign(it, { categoryId: null, updatedAt: stampNow() });
          emit(c, "UPDATE", clone(it), null);
        }
      }
    }
  };

  return {
    kind: "demo",
    async load() { await wait(); return clone(data); },
    async insert(coll, row) { await wait(80); net(); return clone(insertOne(coll, row)); },
    async update(coll, id, patch) { await wait(80); net(); return clone(updateOne(coll, id, patch)); },
    async remove(coll, id) { await wait(80); net(); removeOne(coll, id); return true; },
    async insertMany(coll, rows) { await wait(80); net(); return rows.map((r) => clone(insertOne(coll, r))); },
    async updateMany(coll, ids, patch) { await wait(80); net(); return ids.filter((id) => find(coll, id)).map((id) => clone(updateOne(coll, id, patch))); },
    async removeMany(coll, ids) { await wait(80); net(); ids.forEach((id) => removeOne(coll, id)); return true; },
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
      net();
      const bought = data.shopping.filter((s) => s.checked);
      for (const s of bought) {
        const key = s.name.trim().toLowerCase();
        const hit = data.pantry.find((x) => x.nameKey === key && x.unit === s.unit) || data.pantry.find((x) => x.nameKey === key);
        if (hit) {
          // Same merge rules as move_checked_to_pantry in schema.sql
          if (s.amount == null) { if (hit.amount === 0) hit.amount = null; }
          else if (hit.amount == null || hit.amount === 0) { hit.amount = s.amount; hit.unit = s.unit; }
          else if (hit.unit === s.unit) hit.amount += s.amount;
          Object.assign(hit, { low: false, categoryId: hit.categoryId || s.categoryId, updatedAt: stampNow() });
          emit("pantry", "UPDATE", clone(hit), null);
        } else {
          const row = keyed({ id: newId(), name: s.name.trim(), amount: s.amount, unit: s.unit, categoryId: s.categoryId,
            bestBefore: null, bestBeforePrecision: "day", low: false, note: null, createdBy: "demo-you", createdAt: stampNow() });
          data.pantry.push(row);
          emit("pantry", "INSERT", clone(row), null);
        }
      }
      data.shopping = data.shopping.filter((s) => !s.checked);
      bought.forEach((s) => emit("shopping", "DELETE", null, { id: s.id }));
      return bought.length;
    },
    // Same rules as add_recipe_to_list in schema.sql (the app adds missing items through
    // addToList() instead; this keeps the demo backend's API complete).
    async addRecipeToList(recipeId, servings) {
      await wait();
      net();
      const r = find("recipes", recipeId);
      if (!r) throw new Error("NOT_FOUND");
      if (servings != null && (servings < 1 || servings > 100)) throw new Error("BAD_SERVINGS");
      const factor = (servings ?? r.servings) / r.servings;
      let added = 0, merged = 0, skipped = 0;
      const ings = data.ingredients.filter((i) => i.recipeId === recipeId).sort((a, b) => a.position - b.position);
      for (const ing of ings) {
        if (data.pantry.some((p) => p.nameKey === ing.nameKey && !p.low && (p.amount == null || p.amount > 0))) { skipped++; continue; }
        const amount = ing.amount == null ? null : Math.round(ing.amount * factor * 100) / 100 || null;
        const open = data.shopping.filter((x) => x.nameKey === ing.nameKey && !x.checked)
          .sort((a, b) => (b.unit === ing.unit) - (a.unit === ing.unit))[0];
        if (open) {
          if (amount != null && open.amount != null && open.unit === ing.unit) {
            Object.assign(open, { amount: open.amount + amount, updatedAt: stampNow() });
            emit("shopping", "UPDATE", clone(open), null);
          }
          merged++;
        } else {
          const p = data.pantry.find((x) => x.nameKey === ing.nameKey && x.categoryId);
          const row = insertOne("shopping", { name: ing.name.trim(), amount, unit: ing.unit, categoryId: p ? p.categoryId : null,
            checked: false, note: null, recipeId, createdBy: "demo-you" });
          emit("shopping", "INSERT", clone(row), null);
          added++;
        }
      }
      return { added, merged, skipped };
    },
    async saveRecipe({ recipe = null, ingredients = [], steps = [], removeIngredients = [], removeSteps = [] }) {
      await wait(150);
      net();
      const upsert = (coll, row) => (find(coll, row.id) ? updateOne(coll, row.id, row) : insertOne(coll, row));
      const out = { recipe: null, ingredients: [], steps: [] };
      if (recipe) out.recipe = clone(upsert("recipes", recipe));
      removeIngredients.forEach((id) => removeOne("ingredients", id));
      removeSteps.forEach((id) => removeOne("steps", id));
      out.ingredients = ingredients.map((r) => clone(upsert("ingredients", r)));
      out.steps = steps.map((r) => clone(upsert("steps", r)));
      return out;
    },
    // Photos stay in this tab: the blob is kept as an object URL under its path.
    async uploadImage(path, blob) { await wait(300); net(); images.set(path, URL.createObjectURL(blob)); return path; },
    async removeImage(path) { await wait(80); const u = images.get(path); if (u) URL.revokeObjectURL(u); images.delete(path); return true; },
    imageUrl(path) { return images.get(path) || null; },
    subscribe(householdId, onRow, onStatus) { emit = onRow; setTimeout(() => onStatus(true), 0); },
    unsubscribe() {},
    async signOut() {}
  };
}
