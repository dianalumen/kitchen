# Product plan — kitchen app (shopping list, pantry, recipes)

A shared kitchen app for two people. It replaces the old **home-app** ("Domowy porządek", built with Lovable), which was abandoned because of access problems, too many features, lag and a design that didn't work.

Technical rules are in [TECH-GUIDELINES.md](TECH-GUIDELINES.md). This file covers **what** we build and **why**.

---

## 1. Scope

### v1 — core (build first)
1. **Shopping list** — one shared list, live sync between both phones.
2. **Pantry** — what we have at home, with quantity and best-before date.
3. **Recipes** — title, meal type, ingredients with amounts, optional steps and photo.

Plus the glue that makes these three worth having together:
- tick a bought item → optionally add it to the pantry;
- from a recipe → "add missing ingredients to the shopping list" (compares with the pantry);
- auto-category for new items from keyword rules (carried over from the old app).

### v2 — after v1 is in daily use
4. **Meal plan** — assign recipes to days and meals for the week.
5. **Shopping list from the plan** — sum the ingredients of the planned recipes, subtract what is in the pantry, add the rest to the list.

### Dropped
- **Fridge** (`Lodówka` location, fridge/fresh expiry alerts) — didn't work in practice.
- **Pharmacy** (`Apteczka`), **routines / calendar**, **rats** (now in ogonki), **saved notes**, **generic to-do lists** (`Do zrobienia`, `Sprzątanie`, `Szycie`, `3D Orders`, `Wyjazd`…), **list assignees and time estimates**, **home-screen widgets**.
- The old UI as a whole (see section 3).

Rule of thumb for anything new: it gets in only if it helps **buy, store or cook food**, and only after v1 is used every week.

---

## 2. Lessons from home-app

| Problem | Cause found in the code / data | What we do instead |
|---|---|---|
| **Access problems** between the two of us | Per-row ownership: `owner_id` + `is_shared` on `lists`, `list`, `saved`. Inserts required `owner_id = auth.uid()` but the column had no default; only the owner could delete an item, so one person couldn't clear items the other added. Some tables (`pantry`, `cookbook`) were open to *any* signed-in user, others only to the owner — two different models at once. | One **household**. Every row belongs to the household, both members can do everything. `household_id` defaults to `current_household()` — the frontend never sends it. |
| Keys in the repo | `.env` with the Supabase URL and key, and `.env` is not in `.gitignore`. | Keys only in GitHub repo secrets (TECH-GUIDELINES §4). |
| Too many features | 11 sections (list, kitchen, pharmacy, calendar, routines, recipes, saved, pets, settings…) in one app. | 3 sections in v1, 1 more in v2. |
| Lag | React + ~30 Radix/shadcn packages + react-query refetching on every change; drag-and-drop, carousels, charts bundled even when unused. | Plain JS, no build step; optimistic UI (change appears instantly, saved in the background); realtime updates patch local state instead of reloading everything. |
| Messy data | Soft-delete flag `deleted` everywhere (64 of 231 pantry rows, 188 of 291 list rows are deleted); two shopping lists (`Zakupy` and `Shopping`); categories in two languages (`Obiad` / `Dinner`); ingredients stored twice (`items_required` text + `cookbook_ingredients`); best-before as free text (`2026-05` or `2026-05-25`). | Hard delete (with undo toast); one shopping list; English enum values (TECH-GUIDELINES §0); ingredients only in their own table; best-before as a real `date` plus precision. |
| Polish-only identifiers | Tables and values like `Spiżarnia`, `Kolacja`, assignee check `('Diana', 'Gienek')`. | English names, Polish only in UI translations and user data. |

---

## 3. UI/UX direction

**Decided 2026-11-12: direction A — "Leaflet"**, based on **[Leaflet](https://github.com/dianalumen/leaflet)** (own project), with the Matcha accent. Screens, alternatives considered and the UX copy rules: [DESIGN.md](DESIGN.md) and the [design canvas](https://claude.ai/artifact/YbZ1pd22wgBKPT8NK55e1L).

What that means concretely:
- **One phone column**, max ~480 px wide, centered on larger screens.
- **Big, calm type.** Screen titles ~34 px, medium weight, tight letter-spacing (Leaflet `.ttl`), plain sans with no serif accent words.
- **Soft rounded surfaces.** Cards with 22–26 px radius on a soft neutral (`--soft`), no borders and no shadows.
- **Ink + one accent.** Near-black "ink" pills for primary actions, one accent color (Matcha by default, 6 swatches in settings) that means only "selected / done / primary". Warnings use a soft tile with a small orange dot. Categories have no colors.
- **Short copy.** Counts as `3/6`, 1–2 word labels ("Zużyj wkrótce", "Mało"), no brackets and no `·`, buttons say the result ("Dodaj 3 do listy").
- **Floating tab bar.** Dark pill at the bottom with 3 icons in v1 (List · Pantry · Recipes), 4 in v2 (+ Plan); the active tab is filled with the accent (Leaflet `.tabbar`).
- **Bottom sheets** for add/edit (Leaflet `.sheet`: 30 px top radius, grab handle, max 88 vh) — never full-page forms.
- **Instant feedback.** `:active` scale on every tappable thing, check-off animation on list items, undo toast instead of "are you sure?" dialogs.
- **Wolt-style** recipe cards: photo (or category color) on top, name, meal type and time underneath; horizontal chips to filter.
- **Revolut-style** lists: grouped rows with an icon circle on the left, name + secondary line, value on the right (quantity, date).
- Light and dark theme from tokens, following the system by default.
- 44 px minimum touch targets, visible focus, respects `prefers-reduced-motion`.

### Screens (v1)
1. **List** — "add item" field always at the top with autocomplete (pantry + history + category rules), items grouped by category (store-aisle order), tap to tick, ticked items collapse into "Bought (n)" with "Clear" and "Move to pantry".
2. **Pantry** — search, category chips, rows with quantity and best-before; "running low / expiring soon" section at the top; swipe or tap → sheet with −/+ quantity, "Add to shopping list", delete.
3. **Recipes** — grid of cards, filter chips by meal type; recipe screen with servings stepper (scales amounts), ingredients marked "have / missing" from the pantry, one button "Add missing to list"; cooking mode with large steps and screen wake lock.
4. **Settings** (from a small icon in the header, not a tab) — household name, invite code, members, theme, accent, sign out.

---

## 4. Data from the old app

Source: `domowy-porzadek-pwa_261112.backup` (pg_dump, custom format, Postgres 17). Contents relevant to v1:

| Old table | Rows (active) | What happens |
|---|---|---|
| `cookbook` | 11 recipes | → `recipes`. `category` → `meal_type`: `Obiad` → `lunch`, `Kolacja` → `dinner`, `Dinner` → `dinner`, `Breakfast` → `breakfast`. `items_required` dropped (duplicate of ingredients). |
| `cookbook_ingredients` | 60 | → `recipe_ingredients` (name, amount, unit, position). Only 13 have an amount — fill the rest in the app later. |
| `pantry` | 167 active: 155 in `Spiżarnia`, 12 in `Lodówka` | → `pantry_items`. Spiżarnia items imported; fridge items **not** imported (fridge is dropped, and they are months old). Best-before: `YYYY-MM` → last day of that month with precision `month`; `YYYY-MM-DD` → that day with precision `day`. |
| `list` (shopping lists `Zakupy` + `Shopping`) | 7 unticked | → `shopping_items` in the one shopping list. Ticked and deleted rows are dropped; the rest of `list` (other to-do lists) is dropped. |
| `category_rules` | 247 (162 pantry, 38 fridge, 47 pharmacy) | Pantry + fridge rules → `category_rules` (fridge rules still classify shopping items). Pharmacy rules dropped. |
| categories (from rules + pantry) | ~18 names | → `categories` table per household, with position (aisle order) and color. Near-duplicates merged on import: `Nabiał` + `Nabiał i mleko`, `Płatki i przekąski` + `Płatki / owsianki`, `Owoce` + `Warzywa` + `Owoce i warzywa`. |
| `units` | 12 | → seed list of units (`szt`, `g`, `dag`, `kg`, `ml`, `l`, `opak`, `łyżka`, `łyżeczka`, `szklanka`, `pęczek`, `plaster`). Unit codes are data, labels go through translations. |
| `app_settings` | 4 | Dropped (only fridge/pharmacy alert thresholds); pantry "expiring soon" threshold becomes a household setting. |
| everything else (`pharmacy`, `routines*`, `rats*`, `saved`, `lists` other than shopping, `auth.*`, `storage.*`) | — | Not migrated. No user accounts are copied: both of us sign up fresh in the new Supabase project. |

**How:** a one-off script `tools/import_home_app.py` reads the dump (no `pg_restore` needed; the custom-format reader already exists), applies the mapping above and writes `supabase/seed/home_app_import.sql`. That file inserts into a given household (`select … from households where code = :code`) and is run once in the SQL Editor after both of us have joined. **The dump and the generated SQL contain personal data and are never committed** (`.gitignore`: `*.backup`, `supabase/seed/*.sql`).

---

## 5. Open decisions

- ~~**Name.**~~ Decided: repo and folder `kitchen`. The UI name can still be Polish (e.g. "Kuchnia").
- **Category order** for the shopping list: one fixed order per household (drag to reorder in settings), or learned from the order items get ticked off in the store. v1: fixed order.
- **Pantry quantities**: track exact amounts (`500 g`) or just "have / low / out". The old data has amounts on only 53 of 167 items, so v1 makes quantity optional and adds a simple "low" flag.
