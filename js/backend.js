// Data layer behind one interface (TECH-GUIDELINES §9). sbBackend talks to Supabase; demoBackend
// (js/demo.js) has the same API with in-memory data. The UI only calls these methods.
//
// Backend API (both):
//   load(user)                     → { noHousehold: true } | { household, members, settings, categories,
//                                     categoryRules, units, shopping, pantry, recipes, ingredients, steps }
//   insert(coll, row) / update(coll, id, patch) / remove(coll, id)   → saved row (camelCase)
//   saveSettings(patch)            → saved settings row
//   createHousehold(name) / joinHousehold(code) / renameHousehold(name) → household
//   newCode()                      → new invite code
//   moveCheckedToPantry()          → number moved
//   addRecipeToList(recipeId, servings) → { added, merged, skipped }
//   subscribe(householdId, onRow, onStatus) / unsubscribe()
//   signOut()
// sbBackend also has auth: getSession, onAuth, signIn, signUp, sendReset, setPassword.

// Collection name (JS) → table name (database).
export const TABLES = {
  categories: "categories",
  categoryRules: "category_rules",
  units: "units",
  shopping: "shopping_items",
  pantry: "pantry_items",
  recipes: "recipes",
  ingredients: "recipe_ingredients",
  steps: "recipe_steps"
};

// ---------------------------------------------------------------------------
// Row ↔ object mapping, in one place: snake_case in the database, camelCase in JS.
// ---------------------------------------------------------------------------
const camel = (k) => k.replace(/_([a-z])/g, (m, c) => c.toUpperCase());
const snake = (k) => k.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
const NUMERIC = new Set(["amount"]);
// Never written by the client: generated columns, defaults and trigger-maintained columns.
const READ_ONLY = new Set(["nameKey", "keywordKey", "householdId", "updatedAt", "checkedAt"]);

export function fromRow(r) {
  if (!r) return r;
  const o = {};
  for (const k in r) {
    const v = r[k];
    o[camel(k)] = NUMERIC.has(k) && v != null ? Number(v) : v;
  }
  return o;
}

export function toRow(o) {
  const r = {};
  for (const k in o) {
    if (READ_ONLY.has(k) || o[k] === undefined) continue;
    r[snake(k)] = o[k];
  }
  return r;
}

// ---------------------------------------------------------------------------
// Supabase
// ---------------------------------------------------------------------------
export function sbBackend(sb) {
  const must = async (p) => { const r = await p; if (r.error) throw r.error; return r.data; };
  let channel = null;
  let householdId = null;
  const here = () => location.origin + location.pathname;

  return {
    kind: "supabase",

    // Auth
    async getSession() { const { data, error } = await sb.auth.getSession(); if (error) throw error; return data.session; },
    onAuth(fn) { return sb.auth.onAuthStateChange(fn); },
    signIn: (email, password) => sb.auth.signInWithPassword({ email, password }),
    signUp: (email, password) => sb.auth.signUp({ email, password, options: { emailRedirectTo: here() } }),
    sendReset: (email) => sb.auth.resetPasswordForEmail(email, { redirectTo: here() }),
    setPassword: (password) => sb.auth.updateUser({ password }),

    async load(user) {
      const me = await must(sb.from("household_members").select("*").eq("user_id", user.id).maybeSingle());
      if (!me) return { noHousehold: true };
      householdId = me.household_id;
      const all = (table, order = "position") => must(sb.from(table).select("*").order(order));
      const [household, members, settings, categories, categoryRules, units, shopping, pantry, recipes, ingredients, steps] =
        await Promise.all([
          must(sb.from("households").select("*").eq("id", me.household_id).single()),
          must(sb.from("household_members").select("*").order("joined_at")),
          must(sb.from("household_settings").select("*").eq("household_id", me.household_id).maybeSingle()),
          all("categories"),
          all("category_rules", "keyword"),
          all("units"),
          all("shopping_items", "created_at"),
          all("pantry_items", "name"),
          all("recipes", "title"),
          all("recipe_ingredients"),
          all("recipe_steps")
        ]);
      return {
        household: fromRow(household),
        members: members.map(fromRow),
        settings: fromRow(settings) || { accent: "matcha", defaultServings: 2, expiringSoonDays: 7 },
        categories: categories.map(fromRow),
        categoryRules: categoryRules.map(fromRow),
        units: units.map(fromRow),
        shopping: shopping.map(fromRow),
        pantry: pantry.map(fromRow),
        recipes: recipes.map(fromRow),
        ingredients: ingredients.map(fromRow),
        steps: steps.map(fromRow)
      };
    },

    async insert(coll, row) { return fromRow(await must(sb.from(TABLES[coll]).insert(toRow(row)).select().single())); },
    async update(coll, id, patch) { return fromRow(await must(sb.from(TABLES[coll]).update(toRow(patch)).eq("id", id).select().single())); },
    async remove(coll, id) { await must(sb.from(TABLES[coll]).delete().eq("id", id)); return true; },
    async saveSettings(patch) {
      return fromRow(await must(sb.from("household_settings").update(toRow(patch)).eq("household_id", householdId).select().single()));
    },

    async createHousehold(name) { return fromRow(await must(sb.rpc("create_household", { p_name: name }))); },
    async joinHousehold(code) { return fromRow(await must(sb.rpc("join_household", { p_code: code }))); },
    async renameHousehold(name) { return fromRow(await must(sb.rpc("rename_household", { p_name: name }))); },
    async newCode() { return await must(sb.rpc("new_household_code")); },
    async moveCheckedToPantry() { return await must(sb.rpc("move_checked_to_pantry")); },
    async addRecipeToList(recipeId, servings) {
      return await must(sb.rpc("add_recipe_to_list", { p_recipe_id: recipeId, p_servings: servings ?? null }));
    },

    // One channel per household, one listener per table (like 3d-print). Realtime applies RLS
    // per subscriber, so only this household's rows arrive (DELETE events carry only the id).
    subscribe(householdId, onRow, onStatus) {
      this.unsubscribe();
      channel = sb.channel("kitchen-" + householdId);
      const listen = (table, coll) =>
        channel.on("postgres_changes", { event: "*", schema: "public", table }, (p) =>
          onRow(coll, p.eventType, p.new && Object.keys(p.new).length ? fromRow(p.new) : null, p.old ? fromRow(p.old) : null));
      for (const coll in TABLES) listen(TABLES[coll], coll);
      listen("households", "household");
      listen("household_members", "members");
      listen("household_settings", "settings");
      channel.subscribe((status) => onStatus(status === "SUBSCRIBED"));
    },
    unsubscribe() { if (channel) { sb.removeChannel(channel); channel = null; } },

    async signOut() { this.unsubscribe(); await sb.auth.signOut(); }
  };
}
