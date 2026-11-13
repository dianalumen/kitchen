# Changelog

## M1 · Database — 2026-11-13

- Added `supabase/schema.sql` (idempotent): `households`, `household_members`, `current_household()`, `household_settings`, `categories`, `category_rules`, `units`, `shopping_items`, `pantry_items`, `recipes`, `recipe_ingredients`, `recipe_steps`.
- Every data table: `household_id default current_household()`, RLS with one `for all` policy on the household, explicit grants to `authenticated` only (no TRUNCATE), `updated_at` trigger, realtime. `households` / `household_members` are read-only for clients.
- `name_key` generated columns (`lower(trim(name))`) with indexes; same-household composite foreign keys for `category_id` and `recipe_id`; `checked_at` maintained by a trigger.
- RPCs: `create_household` (seeds settings, 17 Polish default categories in aisle order and 12 units), `join_household`, `new_household_code`, `rename_household`, `move_checked_to_pantry`, `add_recipe_to_list`.
- Storage bucket `recipe-images` (public, 5 MB, JPEG/PNG/WebP) with own-folder read/upload/delete policies.
- Added `supabase/tests.sql`: impersonates two members, an outsider, a user without a household and `anon`, and reports PASS/FAIL for every table and RPC; all test data is rolled back.
- TECH-GUIDELINES §5.2 updated to the built schema (no category colors, column names, RPC merge rules).

## M0 · Setup — 2026-11-12

- Initialised the git repository (default branch `main`) with the product, technical, design and planning docs and `tools/`.
- Added `.gitignore` (`config.js`, `*.backup`, `supabase/seed/*.sql`, `.DS_Store`).
- Added `config.example.js`; the real `config.js` is never committed.
- Added the GitHub Pages workflow (`.github/workflows/pages.yml`): writes `config.js` from the `SUPABASE_URL` / `SUPABASE_KEY` secrets and publishes an explicit list of files.
- Added a placeholder `index.html` that reports whether `config.js` was loaded.
- Added `README.md` with setup and local development instructions.
