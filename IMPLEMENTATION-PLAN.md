# Implementation plan — kitchen

How we get from the docs to an app we use every day. **What** we build is in [PRODUCT.md](PRODUCT.md), **how** in [TECH-GUIDELINES.md](TECH-GUIDELINES.md), **how it looks** in [DESIGN.md](DESIGN.md) and on the [design canvas](https://claude.ai/artifact/YbZ1pd22wgBKPT8NK55e1L).

## Status

| Step | State |
|---|---|
| Docs: product, tech guidelines, plan | ✅ done |
| Design: wireframes of every v1 screen + hi-fi proposals A–D | ✅ done, **direction A "Leaflet" chosen** (2026-11-12) with the Matcha accent and the UX copy rules |
| M0 Setup | ✅ done (repo, Pages deploy, Supabase project, secrets) |
| M1 Database | ✅ done (schema applied in Supabase, 192/192 checks in `tests.sql` pass, merged 2026-11-13) |
| M2 App shell | ✅ done (shell, auth, household, settings, demo, PWA; merged 2026-11-14; [D] accounts, joining and phone install done 2026-11-14) |
| M3 Shopping list | ✅ done (merged 2026-11-14; [D] shopping trip with both phones done 2026-11-14) |
| M4 Pantry | ✅ done (merged 2026-11-15 with the phone-test fixes; [D] phone check done 2026-11-15) — one known issue: the iPhone keyboard covers sheet fields, see Known issues |
| M5 Recipes | ✅ merged 2026-11-15; [D] phone test pending (recipes are empty until the M6 import) |
| M6 Import | ✅ merged 2026-11-15 (script verified against `schema.sql` in a throwaway local Postgres); [D] run the generated SQL once in the SQL Editor |
| M7 Release v1 | ✅ merged and tagged `v1.0.0` 2026-11-16; [D] two weeks of everyday use running (until ~2026-11-30) |
| v1.1: M7.1–M7.3 | planned 2026-11-19: multi-line paste, dietitian recipes with macros, macro estimates for other recipes |
| M8–M9 (v2) | pending, after v1.1 |

### How milestones run

Every milestone runs in **its own Claude Code session**, started from the coordinating session once the previous milestone is merged and its [D] steps are done. Model and effort are matched to the work:

| Milestone | Model | Effort | Why |
|---|---|---|---|
| M0 Setup | Sonnet 5.5 | medium | Mechanical scaffolding from a known template (3d-print) |
| M1 Database | Opus 5.5 | high | RLS, RPCs and the access tests are where home-app failed |
| M2 App shell | Opus 5.5 | high | Architecture every later milestone builds on; matching the A board |
| M3 Shopping list | Opus 5.5 | high | Realtime + optimistic UI + parsing; the most-used screen |
| M4 Pantry | Sonnet 5.5 | high | Follows patterns set in M2–M3 |
| M5 Recipes | Opus 5.5 | high | Most screens, scaling, editor, Storage, wake lock |
| M6 Import | Sonnet 5.5 | medium | Data mapping already specified in PRODUCT.md §4 |
| M7 Release v1 | Opus 5.5 | high | Review against design, copy rules and performance budget |
| M7.1 Multi-line paste | Sonnet 5.5 | medium | Small, follows the existing parser and sheets |
| M7.2 Dietitian recipes | Opus 5.5 | high | Schema change, import of personal data, recipe view changes |
| M7.3 Macro estimates | Opus 5.5 | high | Nutrition reference data and matching; accuracy is checked against the dietitian's numbers |
| M8–M9 (v2) | Opus 5.5 | high | New design, people and kcal portions, aggregation RPC |

Screen IDs used below (L1–L4, P1–P3, R1–R4, O1, O2, S1, V2) are the wireframe IDs in [DESIGN.md §1](DESIGN.md#1-screen-inventory-wireframes). The hi-fi reference for every screen is the **A — Leaflet** board; where the wireframe and the A board differ, A wins.

Legend: **[D]** = Diana does it (accounts, clicks in GitHub/Supabase, testing on phones) · **[C]** = Claude does it (code, SQL, docs) · **Done when** = the milestone's acceptance check.

```
M0 Setup ─► M1 Database ─► M2 App shell ─► M3 Shopping list ─► M4 Pantry ─► M5 Recipes ─► M6 Import ─► M7 Release v1
                                  │                                                                         │
                                  └──────────── demo mode lets UI work go ahead without data ───────────────┘
                                                                                                    M8 Meal plan ─► M9 List from plan (v2)
```

Every milestone is one branch and one pull request into `main`. Merging to `main` deploys, so `main` is always the version on the phone.

---

## Decisions

| # | Question | Decision |
|---|---|---|
| 1 | Pantry quantities: exact amounts or have/low/out? | Optional amount + a "low" flag (PRODUCT.md §5) — default, unless changed |
| 2 | Shopping list category order | Fixed order per household, reorder in settings — default, unless changed |
| 3 | Default accent color | ✅ **Matcha** — `#D4F09F` light, `#B5DC6E` dark; settings offer 6 swatches (Matcha, Pomidor, Morela, Lawenda, Mięta, Słonecznik) |
| 4 | UI name on the home screen | "Kuchnia" — default, unless changed |
| 5 | Repo visibility on GitHub | Public (no keys in the repo, Pages works on the free plan) — default, unless changed |
| 6 | UI direction | ✅ **A — Leaflet**: Instrument Sans only (no serif accent words), 24 px cards on `--soft`, ink pills, dark floating tab bar, bottom sheets |
| 7 | Category colors | ✅ No colored category dots or fills; categories are plain text headers. The accent means only "selected / done / primary"; warnings ("Zużyj wkrótce") use a soft tile with a small orange dot `#E0662E` |
| 8 | UI copy | ✅ Rules in [DESIGN.md §3](DESIGN.md#ux-copy-rules-apply-to-every-direction): counts as `3/6`, 1–2 word labels, no brackets and no `·`, buttons say the result ("Dodaj 3 do listy") |

---

## M0 · Setup

| | Task |
|---|---|
| [C] | `git init`, `.gitignore` (`config.js`, `*.backup`, `supabase/seed/*.sql`, `.DS_Store`), `README.md` with setup steps, `config.example.js`, the Pages workflow from 3d-print adapted to this file list. First commit with the docs. |
| [D] | Create the GitHub repo `dianalumen/kitchen` and push (or let Claude push once `gh` is signed in). |
| [D] | Create a **new** Supabase project (don't reuse the old home-app one). |
| [D] | Add repo secrets `SUPABASE_URL` and `SUPABASE_KEY` (publishable key). |
| [D] | *Settings → Pages* → source **GitHub Actions**. |
| [D] | Supabase *Auth → URL Configuration*: Site URL `https://dianalumen.github.io/kitchen/`, redirect URLs for Pages and `http://localhost:8000/**`. |

**Done when:** a push to `main` deploys a placeholder page to `https://dianalumen.github.io/kitchen/` and `config.js` there contains the project URL.

## M1 · Database

| | Task |
|---|---|
| [C] | `supabase/schema.sql`, idempotent: households, members, settings; `categories`, `category_rules`, `units`, `shopping_items`, `pantry_items`, `recipes`, `recipe_ingredients`, `recipe_steps`. RLS, grants and realtime for every table. |
| [C] | RPCs: `create_household`, `join_household`, `new_household_code`, `rename_household`, `move_checked_to_pantry`, `add_recipe_to_list`. |
| [C] | Default categories and units are seeded inside `create_household`, so every new household starts usable. |
| [C] | `supabase/tests.sql`: a script that simulates two users in one household and a third user outside it, and checks that the outsider sees nothing and both members can insert, update and delete each other's rows. |
| [D] | Run `schema.sql` and `tests.sql` in the SQL Editor; send Claude the output if anything fails. |

**Done when:** the test script passes. That is the check for the access problems that killed home-app, so it runs again after every schema change.

## M2 · App shell

| | Task |
|---|---|
| [C] | `styles.css`: tokens from the A board (light/dark) with the fixes from DESIGN.md — `--accent` Matcha per theme, `--muted #6E6C65`, warning dot `#E0662E`; components ported from Leaflet: `.app`, `.ttl`/`.eyebrow`, `.card` with the tick fill, `.chip`, `.seg`, `.tabbar`, `.sheet`/`.scrim`, `.btn`, view transitions; `prefers-reduced-motion`. |
| [C] | `index.html`, `app.js` structure: state, `backend` interface (`sbBackend` + `demoBackend`), view router, tab bar (Lista · Spiżarnia · Przepisy; hidden on recipe detail, cooking mode and while typing), bottom sheet, undo toast. |
| [C] | `i18n/pl.js` written to the UX copy rules from the start (one place to check them). |
| [C] | Auth and household: **O1** sign in / sign up / reset password, **O2** create or join with code. **S1** settings sheet: household name, invite code with *Udostępnij*, members, theme Auto/Jasny/Ciemny, the 6 accent swatches, categories & order, sign out. |
| [C] | Offline pill under the title (L4), optimistic-write helper with rollback, realtime row patching. |
| [C] | `manifest.webmanifest`, icons (incl. maskable, Matcha-based), `sw.js`. |
| [D] | Install on both phones from Pages, create the household, join with the code from the second phone. |

**Done when:** both phones are signed in to the same household, the app installs to the home screen, `?demo` opens without an account, and the shell matches the A board in light and dark.

## M3 · Shopping list

| | Task |
|---|---|
| [C] | **L2** add field "Dodaj produkt" pinned on top with autocomplete (pantry "w domu 1 l", history "ostatnio", new item with auto-category). Amount + unit optional, parsed from text like `mleko 2 l`; the tip shows once in the empty state. |
| [C] | **L1** items grouped by category in aisle order; tap to tick (accent fill from the tap point, ~600 ms to undo by tapping again, then into "Kupione 3" with *Wyczyść* / *Do spiżarni*). |
| [C] | **L3** edit sheet (name, amount + unit chips, category, note, *Usuń* / *Zapisz*); **L4** empty state "Wszystko kupione" and undo toast. |
| [C] | Category order and editing in settings. |
| [D] | One real shopping trip with both phones: one person adds at home, the other ticks in the store. |

**Done when:** a change on one phone shows on the other in about a second, ticking is instant even on a weak connection, and nothing needs a page reload.

## M4 · Pantry

| | Task |
|---|---|
| [C] | **P1** search and category chips; rows with values right-aligned in tabular numerals ("1 kg", "lis", "8 dni"). |
| [C] | "Zużyj wkrótce" and "Mało" tiles/sections at the top, only when non-empty (threshold from household settings). |
| [C] | **P2** item sheet: big −/+ stepper, *Mało* toggle, *Termin* with *Dzień / Miesiąc*, *Dodaj do listy*, *Usuń* with undo. **P3** no-results state with *Dodaj do spiżarni* / *Dodaj do listy*. |
| [C] | *Move to pantry* from M3 merges with existing items by name. |

**Done when:** a full pantry of ~150 items scrolls and filters without lag on a phone, and bought items land in the pantry without duplicates.

## M5 · Recipes

| | Task |
|---|---|
| [C] | **R1** 2-column card grid, meal-type chips (Wszystkie, Śniadanie, Obiad, Kolacja), search by title or ingredient; card line "Obiad, 30 min, 3/6". Recipes without a photo get the accent tile with a meal-type glyph. |
| [C] | **R2** recipe view: servings stepper that scales amounts, ingredients with have/missing shown by icon only, "3/6 w domu", dock *Dodaj 3 do listy* + *Gotuj*. |
| [C] | **R3** recipe editor in an 88 vh sheet: photo, name, meal type, time, servings, ingredients (amount, unit, name, section) and steps with drag handles; photo upload with in-browser resize to Storage. |
| [C] | **R4** cooking mode: "Krok 2/5" with progress segments, big step text, ingredients for the step, timer, screen wake lock, *Wstecz* / *Dalej*. |

**Done when:** we cook one recipe from the app start to finish, and "Add missing to list" adds only what the pantry really lacks.

## M6 · Import from home-app

| | Task |
|---|---|
| [C] | `tools/import_home_app.py`: reads the dump with `pgdump_read.py`, applies the mapping in PRODUCT.md §4 (recipes, ingredients, pantry without the fridge, 7 open shopping items, category rules, merged categories), writes `supabase/seed/home_app_import.sql` (git-ignored). |
| [C] | Dry run: print counts and a sample of each table before writing SQL; the generated SQL is safe to run twice (skips rows that already exist). |
| [D] | Review the dry-run summary, run the SQL once in the SQL Editor. |

**Done when:** the app shows the 11 recipes, ~155 pantry items and the open shopping items, and the counts match the dry run.

> M6 can run any time after M1. It is placed after M5 so the import targets the final shape of the tables.

## M7 · Release v1

| | Task |
|---|---|
| [C] | Pass over every screen in light and dark, at 320 px and 480 px width, with VoiceOver labels and reduced motion; compare each screen with the A board and every string with the UX copy rules. |
| [C] | Performance check against the budget (first paint < 1 s on 4G, tap feedback < 100 ms) and fixes. |
| [C] | README with setup, local development and the import; tag `v1.0.0`. |
| [D] | Two weeks of everyday use; collect what's annoying in a GitHub issue (one issue per thing). |

**Done when:** both of us used the list, pantry and recipes for two weeks without going back to notes or another app. Fixes from those two weeks ship as `v1.0.x`.

---

## v1.1 (during and after the two weeks of use, before v2)

Feedback from the first days of use (2026-11-19). They run in this order; each is its own branch and session.

### M7.1 · Multi-line paste

| | Task |
|---|---|
| [C] | Pasting text with line breaks into an add field creates **one item per line**. Use it for the shopping list add (L1), the pantry add sheet (P3), and recipe ingredients and steps (R3). Empty lines are dropped. Bullet and number prefixes are stripped: `-`, `•`, `*`, `–`, `1.`, `1)`, `[ ]`. Each line goes through the existing `parseItem()`, so "mąka 0,5 kg" still gets an amount and unit. |
| [C] | Before adding more than one item, show a preview sheet with the lines; any line can be removed. The button says the result: *Dodaj 7 pozycji*. Undo removes the whole batch. |
| [C] | Steps in R3: a single pasted paragraph without line breaks shows *Podziel na kroki*, which splits it by sentence into steps. |
| [C] | Tests in `tests/parse.html` for the line splitter: bullets, numbering, Windows line breaks, empty lines, and a single line, which must behave as today. |

**Done when:** a list copied from Notes or a chat lands on the shopping list as separate items with amounts, and a pasted recipe text becomes separate ingredients and steps.

### M7.2 · Dietitian recipes with macros

Source: the user's meal-plan artifact (a private claude.ai artifact; the coordinating session has the link — never put it in the public repo). It holds 7 days × 4 meals = 28 meals. Each meal has 1–3 dishes, ingredients in grams plus a household measure ("2 łyżki"), steps, the dietitian's notes, and macros per meal: kcal, protein, fat, carbs, fiber. The user already swapped several dishes for their own versions with recalculated macros. **This is personal health data:** the saved copy and the generated SQL are never committed.

| | Task |
|---|---|
| [C] | **Schema:** `recipes` gets macros per serving (`kcal`, `protein_g`, `fat_g`, `carbs_g`, `fiber_g`, numeric, nullable) and `macros_source` (`'dietitian'` or `'estimated'`). `recipe_ingredients` gets `grams` (numeric, nullable) for the weight used in macro math. Update `schema.sql` (idempotent) and `tests.sql`. |
| [C] | **Import** via `tools/import_dietitian.py`, the same pattern as M6. It reads a local copy of the artifact HTML (`*.html` under `supabase/seed/`, git-ignored), takes the **current version of each meal** (the user's swap when there is one, otherwise the original), and writes `supabase/seed/dietitian_import.sql`. Dry run by default; safe to run twice. |
| [C] | **Mapping:** one recipe per meal, so the dietitian's macros stay exact. The title is the main dish. Side dishes ("Brokuł z oliwą i czosnkiem") become ingredient sections, with their steps after the main dish's steps. `tags = {'Dietetyk'}`, `servings = 1`, `macros_source = 'dietitian'`, the dietitian's dish notes go to `notes`, the time is the longest dish time, and the brownie keeps its 5-portion note. Ingredients: `grams` is always set. `amount` and `unit` hold the household measure when it is countable (szt., ząbek, kromka, plaster); otherwise the grams. |
| [C] | **Meal types:** Śniadanie → `breakfast`, Drugie śniadanie → `snack`, Obiad → `lunch`, Kolacja → `dinner`. The label stays "Przekąska"; the dietitian's second breakfasts simply live there. |
| [C] | **UI:** R1 gets a *Dietetyk* chip next to the meal-type chips. R2 shows macros per serving under the title ("520 kcal", then B 41 g, T 15 g, W 50 g, Bł 9 g) scaled by the servings stepper, plus a small *Dietetyk* label. R3 lets you edit the macros by hand. Follow the copy rules: no brackets, no `·`. |
| [D] | Save the artifact page locally (the coordinating session can do it), run the generated SQL once in the SQL Editor, and check the 28 recipes in the app. |

**Done when:** the app shows 28 recipes with the *Dietetyk* label and the macros match the dietitian's numbers.

### M7.3 · Macro estimates for other recipes

| | Task |
|---|---|
| [C] | **Reference table** `foods`: global and read-only for clients, not per household. Columns: name, aliases, kcal/protein/fat/carbs/fiber per 100 g, and grams per household unit (an egg 56 g, a spoon of oil 10 g, a clove of garlic 5 g, …). About 150 common ingredients, taken from an **open data source**, never typed in by hand: **USDA FoodData Central** (Foundation / SR Legacy, CC0) first, and **CIQUAL** (ANSES, Licence Ouverte) where USDA lacks a food. Polish names and aliases are added on top. A generator script `tools/build_foods.py` downloads the source files, keeps the needed foods, records the source id per row, and writes the seed SQL. The source, version and licence go into README. Grams per household unit come from the source's portion data when it has them. Covers every ingredient of the dietitian recipes and of the 11 imported home-app recipes. |
| [C] | **Matching:** an ingredient's name maps to a food via its aliases. `recipe_ingredients.food_id` stores a match that was picked by hand in R3 when the automatic one is wrong or missing. Grams come from `grams`, from amount + unit, or from the food's grams per unit. |
| [C] | **Estimate:** a recipe without dietitian macros shows "ok. 480 kcal" plus B/T/W, and "2 składniki bez danych" when some ingredients have no match. Estimates are computed in the browser and never overwrite dietitian numbers. |
| [C] | **Accuracy check:** compute estimates for the 28 dietitian meals and compare them with the dietitian's macros. The target is kcal within 10% for at least 24 of 28; record the result in CHANGELOG. |

**Done when:** every recipe shows macros (exact or "ok."), and the dietitian check meets the target.

> M8 Meal plan later builds on this: the four slots from the dietitian's plan (Śniadanie, Przekąska, Obiad, Kolacja) and daily macro totals.

---

## v2 (starts only after M7)

### M8 · Meal plan for several days and several people

| | Task |
|---|---|
| [C] | **Design first:** a hi-fi Plan tab on the canvas (only the **V2** wireframe exists). It covers the range picker, a day with 4 slots, the add-meal sheet, the people settings, and the "what's at home" step from M9. Record it in DESIGN.md. |
| [C] | **Range, not only a week:** plan any span of days, e.g. *Pn–Śr* or 5 days from tomorrow. The default is the next 7 days. A 4th tab **Plan** (rightmost) with a day strip (Leaflet `.week` pattern) scrolls across the range. |
| [C] | **Slots per day:** Śniadanie, Przekąska, Obiad, Kolacja. Przekąska is where the dietitian's second breakfast goes. Any slot can stay empty or hold more than one recipe. Each meal shows "3/6 w domu". Copy a day to another day, or repeat a meal for the next days (the dietitian allows the same meals 2 days in a row). |
| [C] | **People:** a household list of people who eat, in settings: name, plus an **optional** daily kcal target. Both of you are there by default, and you can add a person, e.g. a guest for one day. Each planned meal says who eats it; the default is everyone. Servings = the number of people when nobody has a kcal target. |
| [C] | **Portions by kcal (optional):** when a person has a kcal target and the recipe has macros (M7.2/M7.3), that person's portion is scaled so the day hits the target. The slot shares come from the dietitian plan: about 25% breakfast, 15% Przekąska, 35% lunch, 25% dinner, editable in settings. The meal shows the portion per person, e.g. "Ania 1,2 porcji, Ola 0,8 porcji", and the total servings that M9 uses. Without a target or without macros, a portion is 1. |
| [C] | **Day totals:** kcal and B/T/W per person per day, using "ok." when any part is estimated. |
| [C] | **Schema:** `meal_people` (name, `kcal_target` nullable, position), `meal_plan` (date, slot, recipe, position), `meal_plan_people` (which people eat, with the computed portion), plus slot shares on the household. RLS, grants and realtime as for the other tables; tests in `tests.sql`. |

**Done when:** we plan 4 days for 2 people, one of us with a kcal target, and the portions and day totals make sense.

### M9 · Shopping list from the plan, with a "what's at home" step

| | Task |
|---|---|
| [C] | **Pick the range:** *Lista z planu*, by default the planned days from today; any subset of days can be picked. |
| [C] | **Calculation** (RPC `plan_shopping_preview(from, to)`): sums the ingredients of all planned meals in the range, scaled by the total servings from M8. It merges the same ingredient across recipes and converts units where possible (g/kg, ml/l, szt.), then compares with the pantry and with what is already on the list. |
| [C] | **"What's at home" step:** a checklist sheet before anything is added. Every needed ingredient shows the needed amount and the pantry amount. Ingredients the pantry clearly covers start **unchecked**, as "w domu". Everything else starts checked, and spices and staples ("sól", "pieprz", "oliwa") start unchecked. Tap to flip any line. The button says the result: *Dodaj 14 do listy*. |
| [C] | **Adding:** merges with items already on the list (the amount is increased, not duplicated), keeps a link to the plan for "z planu" grouping, and Undo removes the whole batch. |

**Done when:** one shop for a 4-day plan is done from the generated list, with nothing added by hand that the plan should have covered and nothing bought that was already at home.

---

## Working rules for every milestone

- Branch `m<N>-<short-name>` → PR → merge to deploy. Commit messages and PRs in English.
- Each PR updates `demoBackend()` so `?demo` always shows the latest features.
- UI changes are checked against the A board on the canvas; a deliberate deviation is recorded in DESIGN.md.
- Any schema change: `schema.sql` (idempotent) + `tests.sql` rerun, per the checklist in TECH-GUIDELINES §13.
- Bump the service-worker cache version when shipped files change.
- After each milestone, a short note in `CHANGELOG.md`.

---

## Known issues (open)

None right now. New ones from the two weeks of use go into GitHub issues, one issue per thing.

## Resolved

- **Keyboard covered sheet fields on iPhone** (found in M4, 2026-11-15; fixed in M7, commit `e411caf`). Reproduced in the iOS 27.2 Simulator (iPhone 17, Safari, `?demo`). There were two causes. First, the M4 rule that moved the sheet on `:focus` changed the layout between touch start and click, so the click landed on the scrim and closed the sheet. Second, the fixed scrim kept the layout viewport's height, so the sheet stayed behind the keyboard. Fix: `followKeyboard()` in `js/ui.js` changes nothing on focus. Once `visualViewport` reports the keyboard, the scrim takes the visible area, so the sheet rests on the keyboard and the field scrolls into view inside it. The scrim closes a sheet only when the tap started on it. Verified in the Simulator: the list edit sheet (name and note), the pantry add sheet, and the recipe editor (name, times, link). **Still to check on the real iPhones**, especially the home-screen app, which was not tested in the Simulator. `?debug` shows the build stamp `kbd-5`.
