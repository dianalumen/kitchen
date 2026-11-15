# Changelog

## M6 · Import from home-app — 2026-11-15

- `tools/import_home_app.py <dump> [--write]`: reads the old backup with `pgdump_read.py` (needs `zstandard`), applies PRODUCT.md §4 and prints a dry-run summary (rows per target table plus samples). With `--write` it generates `supabase/seed/home_app_import.sql` (git-ignored; personal data).
- Dry run: 11 recipes, 60 recipe ingredients, 155 pantry items (Spiżarnia only), 7 open shopping items, 187 category rules, 12 units, 13 categories used.
- Old categories map onto the 17 seeded ones (merging the near-duplicates). "Sosy i przyprawy" is split per item into Przyprawy and Oleje i sosy. Duplicate keywords across pantry, fridge and the merged categories keep the first (pantry before fridge). Shopping items get a category from the rules where one matches; a link in the old description becomes the note.
- The SQL: invite code in one literal at the top, one transaction, one `DO` block; ids derived with `md5(household_id || old id)` and `on conflict do nothing`, categories, units and keywords matched by name, so a second run adds nothing. It ends with a table of rows added and skipped per table.
- Verified by loading `schema.sql` into a throwaway local Postgres and running the SQL against a household made by `create_household`: all constraints and composite foreign keys pass, second run adds 0 rows, wrong code rolls back with an error.
- No schema or app change.

## M5 · Recipes — 2026-11-15

- **R1** `js/views/recipes.js`: 2-column card grid with search (title or ingredient name, instant) and meal-type chips (Wszystkie, Śniadanie, Obiad, Kolacja; Przekąska only when a recipe has it). Card line "Obiad, 30 min, 3/6". Recipes without a photo get the accent tile with a meal-type glyph (cup, pot, bowl, apple). Cards are reconciled by key, so a realtime event repaints one card. Empty and no-results states; + in the header opens the editor.
- **R2** recipe view: photo hero with back and edit, servings stepper (1–100, scales every amount, rounded to 0.01 like the RPC), ingredients grouped by section with have/missing by icon only (same rule as `add_recipe_to_list`), "na liście" under a missing item that is already on the list, "3/6 w domu", steps with timer tags, source link. Dock: *Dodaj N do listy* + *Gotuj*.
- *Dodaj N do listy* goes through `addToList()` (with `recipe_id` and the guessed category), so it adds only what the pantry lacks and the list doesn't have yet; a second tap never doubles amounts. Undo toast removes what it added.
- **R3** `js/recipe-editor.js`: tall sheet that scrolls inside, *Zapisz* in a sticky head. Photo, name, meal type, prep and cook minutes, servings, ingredients and section headers, steps with optional timer minutes, source link, *Usuń przepis* (undo restores the recipe with its ingredients and steps). Ingredients are added with the list's parser (`ryż 150 g`); a comma and a space start the note (`pomidory, w puszce`). Rows, sections and steps reorder by dragging the handle (`js/drag.js`, rows of any height) or with arrow keys on the handle. A tap on the scrim does not close the editor; closing with changes shows "Zmiany odrzucone" with *Przywróć*.
- Save: the recipe, its ingredients and steps are one optimistic write (`saveRecipe` in `js/recipes-data.js`); only changed rows are sent, as upserts (safe to retry from the offline queue), removed rows are deleted. Backends got `saveRecipe`, `uploadImage`, `removeImage`, `imageUrl`.
- Photos: resized in the browser (long side 1600 px, JPEG 0.82) and uploaded to `recipe-images/<household_id>/<timestamp>-<random>.jpg` as part of the save, so an offline save retries the upload too. The photo shows at once from memory. A replaced or removed photo is deleted from Storage after the save; a deleted recipe's photo after the undo window.
- **R4** `js/views/cook.js` (`#cook/<id>/<servings>`): "Krok 2/5" with progress segments (tap to jump), 31 px step text, the ingredients the step mentions (matched by word stem, scaled to the chosen servings), timer for steps with minutes (start, pause, reset; vibration, beep and a toast at the end; keeps running on other steps with a pill to jump back), Screen Wake Lock with "Ekran nie zgaśnie", big *Wstecz* / *Dalej*, swipe and arrow keys.
- Shell: views may have `unmount()` (cooking mode releases the wake lock and stops the timer). `sync()` moved from the pantry to `js/ui.js`; `openSheet` got `headHtml`, `sticky` and `cls`.
- `?demo`: 8 recipes (sections in Naleśniki, a snack, ingredients missing, low, on the list), `addRecipeToList` now follows the RPC's rules, photos are kept in the tab. Unit forms for `ząbek` and `szczypta`.
- No schema change. `sw.js` cache `kitchen-v5` with the four new modules.
- Known issue unchanged: the iPhone keyboard can cover sheet fields. The editor uses the existing "sheet moves to the top half while a field has focus" rule and scrolls the focused field into view inside the sheet.

## M4 · Pantry — 2026-11-14

- **P1** `js/views/pantry.js`: search (matches `name_key`, instant), horizontally scrolling category chips (only categories that have items), "Zużyj wkrótce" and "Mało" tiles and sections first (only when non-empty), then rows by category in aisle order. Rows show name + muted second line, values right-aligned in tabular numerals ("1 kg", "20 lis / 8 dni", "lis 2026 / do końca mies.", "po terminie"). The body is reconciled by key (`sync()`), so a repaint replaces only the rows whose markup changed; 6 searches over 59 rows take ~9 ms.
- "Zużyj wkrótce" = best-before within the household threshold or past. A month-precision date counts as the last day of that month (stored that way, so the same test serves both precisions). "Mało" = `low` or amount 0.
- **P2** item sheet: big −/+ stepper (step by unit: 1 for szt/opak/spoons, 10 or 50 for g and ml, 0.25 kg, 0.5 l, 5 dag), unit chips, *Mało* switch, *Termin* with *Dzień / Miesiąc* (date input, or month + year selects), *Bez terminu*, category, note, *Dodaj do listy* (merges with an item on the list by name, or puts a bought one back) and *Usuń* with undo. Changes are live: one write per burst, sent after a short pause or when the sheet closes.
- **P3** no-results state "Nie ma „…”" with *Dodaj do spiżarni* and *Dodaj do listy* (the text goes through the list's parser). The + button in the header opens the same add sheet: `kuskus 500 g`, category guessed from the same rules as the list (changeable, and a manual pick teaches the household). A name already in the pantry gets the amount added instead of a second row.
- Settings: "Zużyj wkrótce" threshold in days (1–30).
- Shared code: `js/pickers.js` (category/unit helpers, unit chips, category field) now used by the list's edit sheet and the pantry; `addToList()` in `js/views/list.js` is the one place that merges into the shopping list.
- `?demo`: 57 pantry items with month-precision dates, expired, due today, low and zero amounts; moving bought items merges "Masło" into the pantry row.
- `sw.js` cache `kitchen-v3` with `js/pickers.js`.
- Known issue, postponed: the iPhone keyboard still covers sheet fields (see IMPLEMENTATION-PLAN, Known issues).

## M3 · Shopping list — 2026-11-14

- **L2** add field pinned on top (sticky): `js/parse.js` reads `name amount unit` (`mleko 2 l`, `jajka 10`, `mąka 0,5 kg`, `2 l mleka`, `sok 1,5l`, `1/2`, comma decimals, plural spellings like `2 łyżki`), using only the household's unit codes. Autocomplete from the list ("na liście", "kupione"), the pantry ("w domu 1 l", "mało w domu") and recent adds ("ostatnio"), plus "Dodaj „…”" with the guessed category. Enter adds what was typed; a name already on the list is merged instead of duplicated (amounts added when units match), a bought one goes back on the list.
- Category guess: same name in the pantry, on the list or in recent adds, else the longest `category_rules` keyword in the name. Picking a category in the edit sheet saves a rule for that name, so the next add gets it on both phones.
- **L1** groups in `categories.position` order, uncategorized items in "Inne". Tap fills the card with the accent from the tap point; a second tap within 600 ms undoes; then the row fades and moves into "Kupione 3", which expands to the bought rows (tap to put back) and has *Wyczyść* (bulk delete with undo) and *Do spiżarni* (`move_checked_to_pantry`, toast with the count).
- **L3** edit sheet (icon on the left of a row, or hold the row): name, amount + unit chips, category picker, note, *Usuń* with undo, *Zapisz*.
- **L4** empty state "Wszystko kupione" with the `mleko 2 l` tip and *Przepisy*; eyebrow "Nic do kupienia".
- Categories sheet in settings (`js/categories.js`): rename, add, delete with undo (restores the category, its rules and the item links), reorder by dragging the handle (pointer events) or arrow keys on the handle.
- Store: `optimistic()` for multi-row writes, `insertRows` / `updateRows` / `deleteRows` (one request each); backends got `insertMany`, `updateMany`, `removeMany`. Writes that fail because the network is gone stay applied and wait in an in-memory queue, sent in order on reconnect, visibility or every 15 s; the offline pill then says "zapisze się później".
- List repaints only when its markup changes and reuse row elements, so realtime events never restart a tick or move focus.
- Units with Polish forms (`2 łyżki`, `5 łyżek`, `1,5 łyżki`) via `unit_forms` in `i18n/pl.js` (pantry and recipes use it too).
- `?demo`: demo backend simulates the RPC's realtime events and the foreign-key cascades of a category delete, and fails writes with a network error while the browser is offline.
- `tests/parse.html` (not deployed): 36 checks for the parser, rule matching and suggestions.
- `sw.js` cache `kitchen-v2` with the two new modules.

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
