# Changelog

## M2 · App shell — 2026-11-13

- `styles.css`: direction A tokens (Matcha accent per theme, `--muted #6E6C65`, `--warn-dot`), light/dark via `prefers-color-scheme` and `[data-theme]`, six accent swatches via `[data-accent]`, `prefers-reduced-motion`; Leaflet components ported at A-board sizes (`.app`, `.ttl`/`.eyebrow`, `.card` with the tick fill, `.chip`, `.seg`, `.tile`, `.group`/`.rowbtn`, `.tabbar`, `.sheet`/`.scrim`, `.btn`, toast, view transitions).
- `index.html` + `app.js` + ES modules in `js/`: state store with optimistic writes and rollback (`insertRow`, `updateRow`, `deleteRow` with undo, `saveSettings`), realtime row patching on one channel per household with own-echo skipping by `updated_at`, reload on `visibilitychange` / reconnect, offline pill.
- `backend` interface: `sbBackend(sb)` (Supabase, row mapping in one place) and `demoBackend()` (same API, Polish sample data: 8 list items, 29 pantry items, 5 recipes with ingredients and steps).
- Router with the three tabs and the tab bar (hidden on the recipe view and while typing in the add field); placeholder screens for the list (add + tick), pantry (search, chips, alert tiles, grouped rows) and recipes (grid, read-only recipe view) for M3–M5 to build on.
- O1 sign in / sign up / reset password (`PASSWORD_RECOVERY`, `storageKey: "kitchen.auth"`, tokens stripped from the URL); O2 create a household or join with a code (RPC error codes in Polish); S1 settings sheet (rename, invite code with share/copy and a new code, members, theme per device, accent per household, categories in order as a read-only placeholder, sign out).
- `?demo` with the demo banner; never loads `config.js` or Supabase.
- `i18n/pl.js` holds every UI string, written to the UX copy rules.
- PWA: `manifest.webmanifest` ("Kuchnia", `lang: pl`), Matcha icons incl. maskable (`tools/make_icons.py`, no dependencies), `sw.js` network-first, same origin only, cache `kitchen-v1`.
- Pages workflow publishes `js/` too and now fails if a listed file is missing.

## M1 · Database — 2026-11-13

- Added `supabase/schema.sql` (idempotent): `households`, `household_members`, `current_household()`, `household_settings`, `categories`, `category_rules`, `units`, `shopping_items`, `pantry_items`, `recipes`, `recipe_ingredients`, `recipe_steps`.
- Every data table: `household_id default current_household()`, RLS with one `for all` policy on the household, explicit grants to `authenticated` only (no TRUNCATE), `updated_at` trigger, realtime. `households` / `household_members` are read-only for clients.
- `name_key` generated columns (`lower(trim(name))`) with indexes; same-household composite foreign keys for `category_id` and `recipe_id`; `checked_at` maintained by a trigger.
- RPCs: `create_household` (seeds settings, 17 Polish default categories in aisle order and 12 units), `join_household`, `new_household_code`, `rename_household`, `move_checked_to_pantry`, `add_recipe_to_list`.
- Storage bucket `recipe-images` (public, 5 MB, JPEG/PNG/WebP) in a shared `<household_id>/` folder: any member can read, upload, replace and delete, nobody else can write.
- Revoked client access to Supabase's `rls_auto_enable()` event-trigger function (installed by "Enable automatic RLS").
- Added `supabase/tests.sql`: impersonates two members, an outsider, a user without a household and `anon`, and reports PASS/FAIL for every table and RPC; all test data is rolled back.
- TECH-GUIDELINES §5.2 updated to the built schema (no category colors, column names, RPC merge rules).

## M0 · Setup — 2026-11-12

- Initialised the git repository (default branch `main`) with the product, technical, design and planning docs and `tools/`.
- Added `.gitignore` (`config.js`, `*.backup`, `supabase/seed/*.sql`, `.DS_Store`).
- Added `config.example.js`; the real `config.js` is never committed.
- Added the GitHub Pages workflow (`.github/workflows/pages.yml`): writes `config.js` from the `SUPABASE_URL` / `SUPABASE_KEY` secrets and publishes an explicit list of files.
- Added a placeholder `index.html` that reports whether `config.js` was loaded.
- Added `README.md` with setup and local development instructions.
