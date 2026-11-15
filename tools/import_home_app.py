"""One-off import of the old home-app data into a kitchen household (M6).

usage:
  python3 -I tools/import_home_app.py <dump.backup>            # dry run: counts and samples
  python3 -I tools/import_home_app.py <dump.backup> --write    # also writes supabase/seed/home_app_import.sql

Needs `zstandard` (pip install zstandard, in a virtualenv): Supabase dumps are
zstd-compressed. The dump is read with tools/pgdump_read.py (no pg_restore).

The mapping is PRODUCT.md section 4. The generated SQL targets ONE household, picked
by the invite code written at the top of the file, runs in one transaction and is safe
to run twice (see the header of the generated file). The dump and the generated SQL
contain personal data: both are git-ignored and must never be committed.
"""
import argparse, os, re, subprocess, sys, tempfile
from calendar import monthrange
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_PATH = os.path.join(HERE, "..", "supabase", "seed", "home_app_import.sql")

# --- mapping tables (PRODUCT.md section 4) ---------------------------------

MEAL_TYPE = {"Obiad": "lunch", "Kolacja": "dinner", "Dinner": "dinner", "Breakfast": "breakfast"}

# Old category name -> one of the 17 categories seeded by create_household (schema.sql).
# Near-duplicates merge here: Nabiał + Nabiał i mleko, Płatki i przekąski + Płatki / owsianki,
# Owoce + Warzywa + Owoce i warzywa. "Sosy i przyprawy" is split per item, see SPICE_WORDS.
CATEGORY_MAP = {
    "Owoce": "Owoce i warzywa", "Warzywa": "Owoce i warzywa", "Owoce i warzywa": "Owoce i warzywa",
    "Pieczywo": "Pieczywo",
    "Nabiał": "Nabiał", "Nabiał i mleko": "Nabiał", "Sery": "Nabiał",
    "Wędliny i mięso": "Mięso i wędliny",
    "Makarony i ryż": "Makaron, ryż i kasze", "Kasze i zboża": "Makaron, ryż i kasze",
    "Sosy i dipy": "Oleje i sosy",
    "Przetwory i konserwy": "Konserwy", "Warzywa i strączki (konserwy)": "Konserwy",
    "Ryby i mięso (konserwy)": "Konserwy",
    "Płatki i przekąski": "Płatki i przekąski", "Płatki / owsianki": "Płatki i przekąski",
    "Przekąski": "Płatki i przekąski",
    "Czekolada i słodycze": "Słodycze",
    "Napoje": "Napoje", "Syropy": "Napoje", "Waterdrop": "Napoje",
    "Kawa": "Kawa i herbata", "Herbaty": "Kawa i herbata",
    "Inne": "Inne",
}
MIXED = "Sosy i przyprawy"   # sauces, oils and spices in one old category
SPICE_WORDS = ("sól", "pieprz", "kurkuma", "cynamon", "imbir", "curry", "masala", "tikka", "przypraw")
# Aisle order of the 17 seeded categories (used only if one of them is missing in the household).
AISLE = ["Owoce i warzywa", "Pieczywo", "Nabiał", "Mięso i wędliny", "Ryby", "Mrożonki",
         "Makaron, ryż i kasze", "Pieczenie", "Przyprawy", "Oleje i sosy", "Konserwy",
         "Płatki i przekąski", "Słodycze", "Napoje", "Kawa i herbata", "Chemia", "Inne"]
UNITS = ["szt", "g", "dag", "kg", "ml", "l", "opak", "łyżka", "łyżeczka", "szklanka", "pęczek", "plaster"]
SHOPPING_LISTS = ("Zakupy", "Shopping")


def target_category(old, text=""):
    """Old category (+ the item's own text for the mixed one) -> seeded category name."""
    if old == MIXED:
        return "Przyprawy" if any(w in text.lower() for w in SPICE_WORDS) else "Oleje i sosy"
    if old in CATEGORY_MAP:
        return CATEGORY_MAP[old]
    return old.strip()   # unknown name: imported as its own new category


# --- reading the dump -------------------------------------------------------

def unescape(v):
    if v == "\\N":
        return None
    if "\\" not in v:
        return v
    return re.sub(r"\\(.)", lambda m: {"t": "\t", "n": "\n", "r": "\r"}.get(m.group(1), m.group(1)), v)


def load_dump(path):
    """Return {table: [row dict]} for the tables the import needs."""
    with tempfile.TemporaryDirectory() as tmp:   # holds personal data: removed when done
        r = subprocess.run([sys.executable, "-I", os.path.join(HERE, "pgdump_read.py"), path, tmp],
                           capture_output=True, text=True)
        if r.returncode:
            sys.exit("pgdump_read.py failed (is `zstandard` installed in this Python?):\n" + r.stderr[-600:])
        tables = {}
        for name in ("cookbook", "cookbook_ingredients", "pantry", "list", "lists", "category_rules", "units"):
            with open(os.path.join(tmp, "data", f"public.{name}.tsv"), encoding="utf-8") as f:
                head = f.readline()
                cols = [c.strip() for c in head[head.index("(") + 1:head.index(")")].split(",")]
                rows = []
                for line in f:
                    line = line.rstrip("\n")
                    if line == "\\.":
                        break
                    if line:
                        rows.append(dict(zip(cols, (unescape(v) for v in line.split("\t")))))
                tables[name] = rows
        return tables


# --- mapping ----------------------------------------------------------------

def best_before(text):
    """'YYYY-MM' -> (last day of month, 'month'); 'YYYY-MM-DD' -> (day, 'day'); else (None, 'day')."""
    t = (text or "").strip()
    m = re.fullmatch(r"(\d{4})-(\d{2})", t)
    if m and 1 <= int(m[2]) <= 12:
        return f"{m[1]}-{m[2]}-{monthrange(int(m[1]), int(m[2]))[1]:02d}", "month"
    m = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", t)
    if m:
        try:
            monthrange(int(m[1]), int(m[2]))
            if 1 <= int(m[3]) <= monthrange(int(m[1]), int(m[2]))[1]:
                return t, "day"
        except ValueError:
            pass
    return None, "day"


def num(v):
    return None if v in (None, "") else v


def clip(v, n):
    v = (v or "").strip()
    return v[:n] or None


def build(t):
    """Apply the mapping. Returns a dict of target tables -> list of row dicts, plus notes."""
    out, notes = {}, []

    # recipes + ingredients
    recipes = [r for r in t["cookbook"] if r["deleted"] == "f"]
    live = {r["id"] for r in recipes}
    out["recipes"] = [dict(key=r["id"], title=clip(r["name"], 120), meal_type=MEAL_TYPE.get(r["category"]),
                           description=clip(r["description"], 2000), created_at=r["created_at"])
                      for r in recipes]
    for r in recipes:
        if r["category"] not in MEAL_TYPE:
            notes.append(f"recipe with unknown category {r['category']!r}: meal_type left empty")
    ings = sorted((i for i in t["cookbook_ingredients"] if i["recipe_id"] in live),
                  key=lambda i: (i["recipe_id"], int(i["sort_order"] or 0)))
    pos = Counter()
    out["recipe_ingredients"] = []
    for i in ings:
        amount = num(i["quantity"])
        if amount is not None and float(amount) <= 0:
            amount = None
        out["recipe_ingredients"].append(dict(key=i["id"], recipe_key=i["recipe_id"], position=pos[i["recipe_id"]],
                                              amount=amount, unit=clip(i["unit"], 20), name=clip(i["name"], 120)))
        pos[i["recipe_id"]] += 1

    # category rules: pantry first, then fridge (fridge rules still classify shopping items); pharmacy dropped.
    rules, seen = [], set()
    for loc in ("Spiżarnia", "Lodówka"):
        for r in t["category_rules"]:
            if r["location"] != loc:
                continue
            kw = clip(r["keyword"], 60)
            if not kw or kw.lower() in seen:     # (household_id, keyword_key) is unique
                continue
            seen.add(kw.lower())
            rules.append(dict(keyword=kw, category=target_category(r["category"], kw)))
    out["category_rules"] = rules

    def classify(name):   # same rule as the app: longest keyword that is a substring of the name wins
        n = name.lower().strip()
        best = max((r for r in rules if r["keyword"].lower() in n), key=lambda r: len(r["keyword"]), default=None)
        return best["category"] if best else None

    # pantry: Spiżarnia only, not deleted
    out["pantry_items"] = []
    for p in t["pantry"]:
        if p["deleted"] != "f" or p["location"] != "Spiżarnia":
            continue
        bb, prec = best_before(p["expires"])
        if p["expires"] and not bb:
            notes.append("pantry best-before in an unknown format was dropped")
        q = num(p["quantity"])
        if q is not None and float(q) < 0:
            q = None
        out["pantry_items"].append(dict(
            key=p["id"], name=clip(p["name"], 120), amount=q, unit=clip(p["unit"], 20),
            category=target_category(p["category"], p["name"]), best_before=bb, precision=prec,
            note=clip(p["note"], 500), created_at=p["created_at"]))

    # shopping: open (not done, not deleted) items of the two shopping lists
    shop_ids = {l["id"] for l in t["lists"] if l["name"] in SHOPPING_LISTS and l["deleted"] == "f"}
    out["shopping_items"] = []
    for s in sorted(t["list"], key=lambda s: s["created_at"]):
        if s["list_id"] not in shop_ids or s["deleted"] != "f" or s["done"] != "f":
            continue
        out["shopping_items"].append(dict(key=s["id"], name=clip(s["name"], 120), category=classify(s["name"]),
                                          note=clip(s["description"], 500), created_at=s["created_at"]))

    # units: the 12 codes of PRODUCT.md (checked against the old table)
    old_units = {u["name"] for u in t["units"] if u["deleted"] in (None, "f")}
    if old_units != set(UNITS):
        notes.append(f"old units differ from the seed list: {sorted(old_units ^ set(UNITS))}")
    out["units"] = [dict(code=c, position=i + 1) for i, c in enumerate(UNITS)]

    # categories actually referenced (all other seeded ones are left untouched)
    used = {r["category"] for r in rules} | {p["category"] for p in out["pantry_items"]} \
        | {s["category"] for s in out["shopping_items"] if s["category"]}
    out["categories"] = [dict(name=n) for n in sorted(used, key=lambda n: (AISLE.index(n) if n in AISLE else 99, n))]
    return out, notes


# --- SQL --------------------------------------------------------------------

def q(v):
    """SQL literal."""
    if v is None:
        return "null"
    return "'" + str(v).replace("'", "''") + "'"


def values(rows, cols):
    return ",\n    ".join("(" + ", ".join(q(r[c]) for c in cols) + ")" for r in rows)


def gen_sql(d):
    def step(table, body):
        # each step records how many rows it added; the rest already existed
        return f"""
  {body.rstrip()}
  get diagnostics n = row_count;
  insert into import_result values ('{table}', n, {len(d[table])} - n);
"""

    cats = values(d["categories"], ["name"])
    sql = f"""-- kitchen: import of the old home-app data (M6). GENERATED by tools/import_home_app.py.
-- Contains personal data: never commit this file.
--
-- HOW TO RUN (once, after both of you have signed up and joined the household):
--   1. Put the household invite code between the quotes on the line marked <== EDIT.
--   2. Paste the whole file into the Supabase SQL Editor and press Run.
--   3. The last result table lists, per table, how many rows were added and how many
--      already existed. Any error rolls everything back.
-- Safe to run twice: every row has an id derived from the household and the old row,
-- and categories, units and keywords are matched by name, so existing rows are skipped.
-- (A row you deleted in the app comes back if you run the file again.)
-- Runs as postgres in the SQL Editor, so RLS does not apply; household_id is always
-- set explicitly because current_household() is null there.

begin;

create temp table import_result (tbl text, added integer, skipped integer) on commit drop;

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
  -- Without this lock two parallel runs could both pass the "already exists" check.
  perform pg_advisory_xact_lock(hashtext('kitchen-import'), hashtext(h::text));

  -- Categories: the 17 seeded ones are reused; a missing one is created at the end of the list.
{step("categories", f'''insert into public.categories (household_id, name, position)
  select h, v.name, (select coalesce(max(position), 0) from public.categories where household_id = h) + row_number() over ()
  from (values
    {cats}
  ) as v(name)
  where not exists (select 1 from public.categories c where c.household_id = h and c.name_key = lower(trim(v.name)));''')}
{step("units", f'''insert into public.units (household_id, code, position)
  select h, v.code, v.position::integer
  from (values
    {values(d["units"], ["code", "position"])}
  ) as v(code, position)
  on conflict (household_id, code) do nothing;''')}
{step("category_rules", f'''insert into public.category_rules (household_id, keyword, category_id)
  select h, v.keyword, c.id
  from (values
    {values(d["category_rules"], ["keyword", "category"])}
  ) as v(keyword, category)
  join public.categories c on c.household_id = h and c.name_key = lower(trim(v.category))
  on conflict (household_id, keyword_key) do nothing;''')}
{step("recipes", f'''insert into public.recipes (id, household_id, title, meal_type, description, created_by, created_at)
  select md5(h::text || ':recipe:' || v.key)::uuid, h, v.title, v.meal_type, v.description, null, v.created_at::timestamptz
  from (values
    {values(d["recipes"], ["key", "title", "meal_type", "description", "created_at"])}
  ) as v(key, title, meal_type, description, created_at)
  on conflict (id) do nothing;''')}
{step("recipe_ingredients", f'''insert into public.recipe_ingredients (id, household_id, recipe_id, position, amount, unit, name)
  select md5(h::text || ':ingredient:' || v.key)::uuid, h, md5(h::text || ':recipe:' || v.recipe_key)::uuid,
         v.position::integer, v.amount::numeric, v.unit, v.name
  from (values
    {values(d["recipe_ingredients"], ["key", "recipe_key", "position", "amount", "unit", "name"])}
  ) as v(key, recipe_key, position, amount, unit, name)
  on conflict (id) do nothing;''')}
{step("pantry_items", f'''insert into public.pantry_items (id, household_id, name, amount, unit, category_id, best_before,
                                  best_before_precision, note, created_by, created_at)
  select md5(h::text || ':pantry:' || v.key)::uuid, h, v.name, v.amount::numeric, v.unit, c.id, v.best_before::date,
         v.precision, v.note, null, v.created_at::timestamptz
  from (values
    {values(d["pantry_items"], ["key", "name", "amount", "unit", "category", "best_before", "precision", "note", "created_at"])}
  ) as v(key, name, amount, unit, category, best_before, precision, note, created_at)
  left join public.categories c on c.household_id = h and c.name_key = lower(trim(v.category))
  on conflict (id) do nothing;''')}
{step("shopping_items", f'''insert into public.shopping_items (id, household_id, name, category_id, note, created_by, created_at)
  select md5(h::text || ':shopping:' || v.key)::uuid, h, v.name, c.id, v.note, null, v.created_at::timestamptz
  from (values
    {values(d["shopping_items"], ["key", "name", "category", "note", "created_at"])}
  ) as v(key, name, category, note, created_at)
  left join public.categories c on c.household_id = h and c.name_key = lower(trim(v.category))
  on conflict (id) do nothing;''')}
end
$import$;

select tbl as "table", added, skipped from import_result order by case tbl
  when 'categories' then 1 when 'units' then 2 when 'category_rules' then 3 when 'recipes' then 4
  when 'recipe_ingredients' then 5 when 'pantry_items' then 6 else 7 end;

commit;
"""
    return sql


# --- main -------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("dump", help="pg_dump custom-format backup of the old home-app")
    ap.add_argument("--write", action="store_true", help="write supabase/seed/home_app_import.sql")
    ap.add_argument("--samples", type=int, default=3, help="sample rows per table in the dry run (default 3)")
    a = ap.parse_args()

    d, notes = build(load_dump(a.dump))
    show = {"categories": ["name"], "units": ["code", "position"], "category_rules": ["keyword", "category"],
            "recipes": ["title", "meal_type"], "recipe_ingredients": ["name", "amount", "unit", "position"],
            "pantry_items": ["name", "amount", "unit", "category", "best_before", "precision"],
            "shopping_items": ["name", "category", "note"]}
    print("DRY RUN: rows that would be added to an empty household\n")
    for table, cols in show.items():
        rows = d[table]
        print(f"{table}: {len(rows)}")
        for r in rows[:a.samples]:
            print("    " + " | ".join(str(r[c]) for c in cols))
    print("\ncategory split of imported pantry items:")
    for name, n in Counter(p["category"] for p in d["pantry_items"]).most_common():
        print(f"    {n:4d}  {name}")
    print("pantry items with a best-before date:", sum(1 for p in d["pantry_items"] if p["best_before"]),
          "| with an amount:", sum(1 for p in d["pantry_items"] if p["amount"] is not None))
    print("shopping items with a category:", sum(1 for s in d["shopping_items"] if s["category"]), "of", len(d["shopping_items"]))
    for n, c in Counter(notes).items():
        print(f"note: {c}x {n}")
    if a.write:
        os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
        with open(OUT_PATH, "w", encoding="utf-8") as f:
            f.write(gen_sql(d))
        print("\nwritten:", os.path.relpath(OUT_PATH), "(git-ignored; contains personal data)")
    else:
        print("\n(dry run: nothing written; add --write to generate the SQL)")


if __name__ == "__main__":
    main()
