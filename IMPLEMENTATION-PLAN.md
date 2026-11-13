# Implementation plan — kitchen

How we get from the docs to an app we use every day. **What** we build is in [PRODUCT.md](PRODUCT.md), **how** in [TECH-GUIDELINES.md](TECH-GUIDELINES.md), **how it looks** in [DESIGN.md](DESIGN.md) and on the [design canvas](https://claude.ai/artifact/YbZ1pd22wgBKPT8NK55e1L).

## Status

| Step | State |
|---|---|
| Docs: product, tech guidelines, plan | ✅ done |
| Design: wireframes of every v1 screen + hi-fi proposals A–D | ✅ done, **direction A "Leaflet" chosen** (2026-11-12) with the Matcha accent and the UX copy rules |
| M0 Setup | ✅ done (repo, Pages deploy, Supabase project, secrets) |
| M1 Database | ✅ done (schema applied in Supabase, 192/192 checks in `tests.sql` pass, merged 2026-11-13) |
| M2 App shell | 🔄 in progress |
| M3–M7 (v1), M8–M9 (v2) | pending |

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
| M8–M9 (v2) | Opus 5.5 | high | New design + aggregation RPC |

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

## v2 (starts only after M7)

### M8 · Meal plan
- [C] Hi-fi design of the Plan tab on the canvas first (only the **V2** wireframe exists), then `meal_plan` table + RLS/grant/realtime; a 4th tab **Plan** (rightmost) with a week strip (Leaflet `.week` pattern), meals per day with "3/6 w domu", add a recipe from a sheet with servings.
- **Done when:** we plan one full week in the app.

### M9 · Shopping list from the plan
- [C] RPC `add_plan_to_list(from, to)`: sums ingredients of all planned meals, scales by servings, subtracts the pantry, merges with what's already on the list; preview sheet before adding.
- **Done when:** one weekly shop is done from a list generated from the plan, without adding anything by hand that the plan should have covered.

---

## Working rules for every milestone

- Branch `m<N>-<short-name>` → PR → merge to deploy. Commit messages and PRs in English.
- Each PR updates `demoBackend()` so `?demo` always shows the latest features.
- UI changes are checked against the A board on the canvas; a deliberate deviation is recorded in DESIGN.md.
- Any schema change: `schema.sql` (idempotent) + `tests.sql` rerun, per the checklist in TECH-GUIDELINES §13.
- Bump the service-worker cache version when shipped files change.
- After each milestone, a short note in `CHANGELOG.md`.
