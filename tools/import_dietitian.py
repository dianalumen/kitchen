"""One-off import of the dietitian's 7-day meal plan as 28 recipes with macros (M7.2).

usage:
  python3 -I tools/import_dietitian.py supabase/seed/dietitian-plan.html            # dry run
  python3 -I tools/import_dietitian.py supabase/seed/dietitian-plan.html --write    # also writes the SQL

The input is a saved copy of the meal-plan page. It holds `window.JL_DATA` (days, and 28 meals
with id "<day>-<slot>", macros `m` = [kcal, protein, fat, carbs, fiber] and dishes `d`) and a
`<script id="state">` JSON whose `mods` hold the user's own replacements per meal. The current
version of a meal is `mods[id].dishes` + `mods[id].macros` when present, otherwise the original.
The free-text `note` of a mod is personal feedback and is never read into the output.

Mapping (IMPLEMENTATION-PLAN M7.2): one recipe per meal, so the dietitian's macros stay exact.
The title is the main dish; side dishes become ingredient sections, with their steps after the
main dish's steps. Tag Dietetyk, servings 1, macros_source 'dietitian'. Every ingredient keeps
its grams; amount + unit hold the household measure when it is countable (szt., ząbek, kromka,
plaster) and a whole or half number, otherwise the grams (the measure then goes into the note).

The generated SQL targets ONE household, picked by the invite code at the top of the file, runs
in one transaction and is safe to run twice. The saved page and the generated SQL contain
personal health data: everything in supabase/seed/ except its README is git-ignored.
"""
import argparse, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_PATH = os.path.join(HERE, "..", "supabase", "seed", "dietitian_import.sql")

MEAL_TYPE = {"sn": "breakfast", "ds": "snack", "ob": "lunch", "ko": "dinner"}
SLOT_ORDER = ["sn", "ds", "ob", "ko"]
TAG = "Dietetyk"

# Countable household measures -> the unit stored in the app ("2 plasterki" -> 2 plaster).
COUNTABLE = {
    "szt": "szt", "szt.": "szt", "sztuka": "szt", "sztuki": "szt", "sztuk": "szt",
    "ząbek": "ząbek", "ząbki": "ząbek", "ząbka": "ząbek", "ząbków": "ząbek",
    "kromka": "kromka", "kromki": "kromka", "kromek": "kromka",
    "plaster": "plaster", "plastry": "plaster", "plastrów": "plaster",
    "plasterek": "plaster", "plasterki": "plaster", "plasterków": "plaster",
}
# A dish whose name has one of these is a main dish (protein), e.g. "Udko z kurczaka" over "Puree".
MAIN_WORDS = ("kurczak", "udko", "indyk", "łosoś", "dorsz", "ryba", "tuńczyk", "krewetk", "wołow",
              "schab", "wieprz", "mięs", "jaj", "tofu", "tempeh", "szakszuk", "carne")
# Dish notes that only make sense on the plan page itself are left out.
PAGE_ONLY_NOTE = re.compile(r"zakładc", re.I)


# --- reading the page -------------------------------------------------------

def _end_of_literal(text, start):
    """Index just past the object/array literal that starts at text[start]."""
    depth, quote, j = 0, None, start
    while j < len(text):
        c = text[j]
        if quote:
            if c == "\\":
                j += 2
                continue
            if c == quote:
                quote = None
        elif c in "\"'":
            quote = c
        elif c in "{[":
            depth += 1
        elif c in "}]":
            depth -= 1
            if depth == 0:
                return j + 1
        j += 1
    raise ValueError("unterminated literal")


def js_to_json(lit):
    """The page's data is a JS object literal: quote bare keys, drop trailing commas."""
    out, quote, j = [], None, 0
    while j < len(lit):
        c = lit[j]
        if quote:
            out.append(c)
            if c == "\\":
                out.append(lit[j + 1])
                j += 2
                continue
            if c == quote:
                quote = None
            j += 1
            continue
        if c in "\"'":
            if c == "'":
                raise ValueError("single-quoted strings are not supported")
            quote = c
            out.append(c)
            j += 1
            continue
        m = re.match(r"[A-Za-z_$][\w$]*", lit[j:])
        if m and not (out and re.match(r"[\w$]", out[-1])):
            word, k = m.group(0), j + len(m.group(0))
            out.append('"' + word + '"' if lit[k:].lstrip().startswith(":") else word)
            j = k
            continue
        out.append(c)
        j += 1
    return re.sub(r",(\s*[}\]])", r"\1", "".join(out))


def load_page(path):
    with open(path, encoding="utf-8") as f:
        html = f.read()
    marker = "window.JL_DATA="
    i = html.find(marker)
    if i < 0:
        sys.exit("No window.JL_DATA in this file. Is it the saved meal-plan page?")
    start = i + len(marker)
    data = json.loads(js_to_json(html[start:_end_of_literal(html, start)]))
    m = re.search(r'<script id="state" type="application/json">(.*?)</script>', html, re.S)
    mods = {}
    if m and m.group(1).strip():
        state = json.loads(m.group(1))
        # Only dishes and macros are read; the user's own notes stay out.
        mods = {k: {kk: v[kk] for kk in ("dishes", "macros") if kk in v} for k, v in (state.get("mods") or {}).items()}
    return data, mods


# --- mapping ----------------------------------------------------------------

def clip(v, n):
    v = re.sub(r"\s+", " ", str(v or "")).strip()
    return v[:n].rstrip() or None


def num(text):
    return float(text.replace(",", "."))


def fmt(n):
    """2.0 -> '2', 0.5 -> '0,5' (Polish decimal comma, as the page writes it)."""
    return (str(int(n)) if n == int(n) else str(n)).replace(".", ",")


def pick_main(dishes):
    """Index of the main dish: the first whose name names a protein, else the first dish."""
    for k, d in enumerate(dishes):
        if any(w in d["n"].lower() for w in MAIN_WORDS):
            return k
    return 0


def title_for(dishes, main):
    # Plain foods with no cooking (chocolate, mandarins, walnuts): name them all.
    if len(dishes) > 1 and all(not d.get("t") and not d.get("s") for d in dishes):
        names = [dishes[0]["n"]] + [d["n"][:1].lower() + d["n"][1:] for d in dishes[1:]]
        joined = ", ".join(names[:-1]) + " i " + names[-1]
        if len(joined) <= 120:
            return joined
    return clip(dishes[main]["n"], 120)


def ingredient(row, section):
    """[name, grams, household measure] -> recipe_ingredients row."""
    name, grams, measure = row[0], row[1], (row[2] if len(row) > 2 else "") or ""
    base, _, descr = str(name).partition(", ")    # "Łosoś, świeży" -> name + note, like the editor
    grams = float(grams) if grams not in (None, "") else None
    if grams is not None and grams <= 0:
        grams = None
    amount = unit = None
    measure = re.sub(r"\s+", " ", measure).strip()
    m = re.fullmatch(r"(\d+(?:[.,]\d+)?)\s*(.+)", measure)
    countable = False
    if m and m.group(2).lower() in COUNTABLE:
        n = num(m.group(1))
        if n > 0 and (n * 2) == int(n * 2):          # whole or half: "1 szt.", "0,5 szt."
            amount, unit, countable = n, COUNTABLE[m.group(2).lower()], True
    if not countable and grams is not None:
        amount, unit = round(grams, 2), "g"
    note_parts = [descr] if descr else []
    if not countable and measure and not re.fullmatch(r"[\d.,]+\s*g", measure):
        note_parts.append(measure)
    return dict(name=clip(base, 120), amount=amount, unit=unit, grams=None if grams is None else round(grams, 2),
                note=clip(", ".join(note_parts), 200), section=section, measure=measure, countable=countable)


def build(data, mods):
    days = {d["k"]: i for i, d in enumerate(data["days"])}
    recipes, notes = [], []
    meals = sorted(data["meals"], key=lambda m: (days.get(m["id"].split("-")[0], 99),
                                                  SLOT_ORDER.index(m["id"].split("-")[1])))
    for meal in meals:
        mid = meal["id"]
        day, slot = mid.split("-")
        mod = mods.get(mid, {})
        swapped = bool(mod.get("dishes"))
        dishes = mod.get("dishes") or meal["d"]
        macros = mod.get("macros") if mod.get("dishes") and mod.get("macros") else meal["m"]
        if mod.get("dishes") and not mod.get("macros"):
            notes.append(f"{mid}: swapped dishes without macros; the original macros are used")
        main = pick_main(dishes)
        order = [main] + [k for k in range(len(dishes)) if k != main]
        ings, steps, dish_notes = [], [], []
        for k in order:
            d = dishes[k]
            batch = d.get("batch")
            if k == main:
                section = f"Na {fmt(batch)} porcji" if batch and batch != 1 else None
            else:
                section = clip(d["n"] + (f", na {fmt(batch)} porcji" if batch and batch != 1 else ""), 60)
            for row in d.get("i") or []:
                ing = ingredient(row, section)
                if ing["name"]:
                    ings.append(ing)
            for n, s in enumerate(d.get("s") or []):
                text = clip(s, 4000)
                if not text:
                    continue
                if k != main and n == 0:     # say which side dish the steps belong to
                    text = clip(d["n"] + ": " + text[:1].lower() + text[1:], 4000)
                steps.append(text)
            if d.get("note") and not PAGE_ONLY_NOTE.search(d["note"]):
                dish_notes.append(clip(d["note"], 1000))
        kcal, protein, fat, carbs, fiber = (round(float(x), 1) for x in macros[:5])
        mins = max((int(d.get("t") or 0) for d in dishes), default=0)
        recipes.append(dict(
            key=mid, day=day, slot=slot, swapped=swapped, title=title_for(dishes, main),
            meal_type=MEAL_TYPE[slot], prep_minutes=mins or None, notes=clip("\n".join(dish_notes), 4000),
            kcal=kcal, protein_g=protein, fat_g=fat, carbs_g=carbs, fiber_g=fiber,
            ingredients=ings, steps=steps, dishes=[dishes[k]["n"] for k in order]))
    return recipes, notes


# --- SQL --------------------------------------------------------------------

def q(v):
    if v is None:
        return "null"
    if isinstance(v, (int, float)):
        return repr(v)
    return "'" + str(v).replace("'", "''") + "'"


def values(rows, cols):
    return ",\n      ".join("(" + ", ".join(q(r[c]) for c in cols) + ")" for r in rows)


def gen_sql(recipes):
    rec_rows = values(recipes, ["key", "title", "meal_type", "prep_minutes", "notes",
                                "kcal", "protein_g", "fat_g", "carbs_g", "fiber_g"])
    ing_rows = values([dict(key=r["key"], pos=p + 1, **i) for r in recipes for p, i in enumerate(r["ingredients"])],
                      ["key", "pos", "name", "amount", "unit", "grams", "note", "section"])
    step_rows = values([dict(key=r["key"], pos=p + 1, text=s) for r in recipes for p, s in enumerate(r["steps"])],
                       ["key", "pos", "text"])
    n_ing = sum(len(r["ingredients"]) for r in recipes)
    n_steps = sum(len(r["steps"]) for r in recipes)
    return f"""-- kitchen: the dietitian's meal plan as {len(recipes)} recipes with macros (M7.2).
-- GENERATED by tools/import_dietitian.py. Contains personal health data: never commit this file.
--
-- HOW TO RUN (once; needs the M7.2 schema, i.e. the macros columns from supabase/schema.sql):
--   1. Put the household invite code between the quotes on the line marked <== EDIT.
--   2. Paste the whole file into the Supabase SQL Editor and press Run.
--   3. The last result table lists, per table, how many rows were added and how many
--      already existed. Any error rolls everything back.
-- Safe to run twice: every recipe has an id derived from the household and the meal
-- ("pn-ob"), and a recipe that already exists is skipped together with its ingredients
-- and steps, so changes made in the app are kept. (A recipe deleted in the app comes back
-- if you run the file again.)
-- Runs as postgres in the SQL Editor, so RLS does not apply; household_id is always
-- set explicitly because current_household() is null there.

begin;

create temp table import_result (tbl text, added integer, skipped integer) on commit drop;
create temp table import_new (id uuid primary key) on commit drop;

do $import$
declare
  v_code text := 'XXXXXXXX';   -- <== EDIT: the 8-character invite code of your household
  h      uuid;
  n      integer;
begin
  select id into h from public.households
  where code = upper(regexp_replace(v_code, '[^A-Za-z0-9]', '', 'g'));
  if h is null then
    raise exception 'No household with invite code %. Edit v_code at the top of this file.', v_code;
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'recipes' and column_name = 'macros_source') then
    raise exception 'The macros columns are missing. Run the M7.2 schema SQL first.';
  end if;
  -- Without this lock two parallel runs could both pass the "already exists" check.
  perform pg_advisory_xact_lock(hashtext('kitchen-import-dietitian'), hashtext(h::text));

  with ins as (
    insert into public.recipes (id, household_id, title, meal_type, servings, prep_minutes, tags, notes,
                                kcal, protein_g, fat_g, carbs_g, fiber_g, macros_source, created_by)
    select md5(h::text || ':dietitian:' || v.key)::uuid, h, v.title, v.meal_type, 1, v.prep_minutes::integer,
           array['{TAG}'], v.notes, v.kcal::numeric, v.protein_g::numeric, v.fat_g::numeric, v.carbs_g::numeric,
           v.fiber_g::numeric, 'dietitian', null
    from (values
      {rec_rows}
    ) as v(key, title, meal_type, prep_minutes, notes, kcal, protein_g, fat_g, carbs_g, fiber_g)
    on conflict (id) do nothing
    returning id
  )
  insert into import_new select id from ins;
  get diagnostics n = row_count;
  insert into import_result values ('recipes', n, {len(recipes)} - n);

  -- Ingredients and steps only for the recipes added just now.
  insert into public.recipe_ingredients (id, household_id, recipe_id, position, name, amount, unit, grams, note, section)
  select md5(h::text || ':dietitian-ing:' || v.key || ':' || v.pos)::uuid, h, md5(h::text || ':dietitian:' || v.key)::uuid,
         v.pos::integer, v.name, v.amount::numeric, v.unit, v.grams::numeric, v.note, v.section
  from (values
      {ing_rows}
  ) as v(key, pos, name, amount, unit, grams, note, section)
  where md5(h::text || ':dietitian:' || v.key)::uuid in (select id from import_new)
  on conflict (id) do nothing;
  get diagnostics n = row_count;
  insert into import_result values ('recipe_ingredients', n, {n_ing} - n);

  insert into public.recipe_steps (id, household_id, recipe_id, position, text)
  select md5(h::text || ':dietitian-step:' || v.key || ':' || v.pos)::uuid, h, md5(h::text || ':dietitian:' || v.key)::uuid,
         v.pos::integer, v.text
  from (values
      {step_rows}
  ) as v(key, pos, text)
  where md5(h::text || ':dietitian:' || v.key)::uuid in (select id from import_new)
  on conflict (id) do nothing;
  get diagnostics n = row_count;
  insert into import_result values ('recipe_steps', n, {n_steps} - n);
end
$import$;

select tbl as "table", added, skipped from import_result order by case tbl
  when 'recipes' then 1 when 'recipe_ingredients' then 2 else 3 end;

commit;
"""


# --- main -------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("page", help="saved copy of the meal-plan page (.html), e.g. supabase/seed/dietitian-plan.html")
    ap.add_argument("--write", action="store_true", help="write supabase/seed/dietitian_import.sql")
    ap.add_argument("--samples", type=int, default=2, help="sample recipes shown in the dry run (default 2)")
    a = ap.parse_args()

    data, mods = load_page(a.page)
    recipes, notes = build(data, mods)
    ings = [i for r in recipes for i in r["ingredients"]]
    print("DRY RUN: rows that would be added to a household without these recipes\n")
    print("recipes:", len(recipes), "| using the user's swap:", sum(r["swapped"] for r in recipes),
          "| original:", sum(not r["swapped"] for r in recipes))
    for mt in ("breakfast", "snack", "lunch", "dinner"):
        print(f"    {mt}: {sum(r['meal_type'] == mt for r in recipes)}")
    print("recipe_ingredients:", len(ings), "| with grams:", sum(i["grams"] is not None for i in ings),
          "| household measure as amount:", sum(i["countable"] for i in ings),
          "| grams as amount:", sum(i["unit"] == "g" for i in ings),
          "| in a side-dish section:", sum(i["section"] is not None for i in ings))
    print("recipe_steps:", sum(len(r["steps"]) for r in recipes))
    print("recipes with notes:", sum(bool(r["notes"]) for r in recipes),
          "| with more than one dish:", sum(len(r["dishes"]) > 1 for r in recipes))
    print("\nrecipes (title <- dishes, kcal):")
    for r in recipes:
        extra = "" if len(r["dishes"]) == 1 else "  <- " + " + ".join(r["dishes"])
        print(f"    {r['key']:6s} {r['meal_type']:9s} {r['kcal']:6.1f} kcal  {r['title']}{extra}")
    for r in recipes[:a.samples]:
        print(f"\nsample {r['key']}: {r['title']}, {r['prep_minutes']} min, "
              f"B {r['protein_g']} T {r['fat_g']} W {r['carbs_g']} Bł {r['fiber_g']}")
        for i in r["ingredients"]:
            print(f"    {i['section'] or '':28s} {i['name']} | {i['amount']} {i['unit']} | {i['grams']} g | {i['note'] or ''}")
        for n, s in enumerate(r["steps"], 1):
            print(f"    {n}. {s[:90]}")
    for n in notes:
        print("note:", n)
    bad = [r["key"] for r in recipes if not r["ingredients"] or r["kcal"] <= 0]
    if bad:
        print("WARNING: recipes without ingredients or kcal:", ", ".join(bad))
    if a.write:
        os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
        with open(OUT_PATH, "w", encoding="utf-8") as f:
            f.write(gen_sql(recipes))
        print("\nwritten:", os.path.relpath(OUT_PATH), "(git-ignored; contains personal health data)")
    else:
        print("\n(dry run: nothing written; add --write to generate the SQL)")


if __name__ == "__main__":
    main()
