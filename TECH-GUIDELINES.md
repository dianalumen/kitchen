# Technical guidelines — kitchen app (PWA + Supabase)

Derived from an analysis of three existing projects:

- **[ogonki](https://github.com/dianalumen/ogonki)** — rat health tracker (Polish UI, `app.js` + `styles.css`, Supabase migrations)
- **[3d-print](https://github.com/dianalumen/3d-print)** — 3D print queue (English UI, single `index.html`, deployed by GitHub Actions)
- **home-app** ("Domowy porządek") — the previous kitchen/home app (Lovable, React + shadcn); abandoned. What went wrong is in [PRODUCT.md §2](PRODUCT.md#2-lessons-from-home-app).

The new project (shopping list, pantry and recipes, shared by two people) follows **3d-print** as the technical model, adopts a few good habits from ogonki, and takes its visual direction from **[Leaflet](https://github.com/dianalumen/leaflet)**. Scope and roadmap are in [PRODUCT.md](PRODUCT.md).

---

## 0. Language

**Everything in the project is written in English, except translations and user data.**

| In English | Not necessarily in English |
|---|---|
| Code: identifiers, functions, variables, CSS classes, file and folder names | UI strings in translation dictionaries (e.g. `i18n/pl.js` or the `pl` entry of the strings object) |
| Comments | Data entered by users (recipe titles, ingredients, notes) |
| Documentation: `README.md`, this file, any other `.md` | Example/demo data, if it is meant to look like real Polish user content |
| Database: table and column names, enum/`check` values, function names, error codes, SQL comments | |
| Commit messages, branch names, PR and issue titles/descriptions | |
| GitHub Actions workflow names, steps, error messages | |
| Repository name (`kitchen`) | |
| `localStorage` keys, cache names, storage bucket names | |

Practical consequences:
- **Enum values in the database are English** (`'breakfast'`, `'lunch'`, `'dinner'`), translated only in the UI. Ogonki started with Polish values (`'objawy'`, `'wizyta'`) and needed a separate migration (`english_values.sql`) to fix them.
- **No hard-coded UI text in code.** Every visible string goes through `t("key")`; keys are English, values live in the translation dictionary.
- The app's default UI language is Polish (`lang="pl"`), and English UI should be possible by adding a dictionary.
- `manifest.webmanifest` `name` / `description` are user-facing, so they may be Polish; `lang` matches.

---

## 1. Summary: what we take from where

| Area | ogonki | 3d-print | **Recipes (new)** |
|---|---|---|---|
| Supabase keys | `config.js` **committed to the repo** | repo secrets → `config.js` generated in CI | **like 3d-print** |
| Deploy | GitHub Pages from a branch (no workflow) | GitHub Actions → Pages | **like 3d-print** |
| Sharing | email allowlist in `members` table | "household" + invite code | **like 3d-print** |
| Schema | numbered migrations in `supabase/migrations/` | one idempotent `supabase/schema.sql` | **idempotent `schema.sql`, plus migrations once there is production data** (section 5.8) |
| File layout | `index.html` + `app.js` + `styles.css` | everything in `index.html` | **separate files like ogonki** (section 3) |
| supabase-js | UMD `<script>` from CDN | ESM `import()` from CDN, pinned version | **like 3d-print** |
| Realtime | one channel on the whole `public` schema | channel per household, listener per table | **like 3d-print** |
| Photos | — | Storage bucket, one folder per user | **like 3d-print** |
| Demo mode | — | `?demo`, sample data never saved | **like 3d-print** |
| Dark mode | CSS tokens + `prefers-color-scheme` | same | **same** |
| Code/docs language | mixed (Polish enum values, Polish UI strings inline) | English | **English (section 0)** |

---

## 2. Stack

- **Frontend:** plain HTML + CSS + JavaScript (ES modules). **No framework and no build step** — no npm, bundler or TypeScript. The app must run from a plain static file server.
- **Backend:** [Supabase](https://supabase.com) — Postgres, Auth (email + password), Realtime, Storage. All authorization lives in the database (RLS + RPC functions); no custom server.
- **Supabase client:** `@supabase/supabase-js` loaded dynamically from a CDN, **pinned to an exact version**:
  ```js
  const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm";
  const { createClient } = await import(SUPABASE_JS);
  ```
  If the import fails (no network), show a "no connection" screen instead of a blank page (as 3d-print does).
- **Hosting:** GitHub Pages, deployed by GitHub Actions.
- **PWA:** `manifest.webmanifest` + `sw.js` (network-first, cache only as an offline fallback).

---

## 3. Repository layout

```
kitchen/
├── index.html              # page skeleton, meta, manifest, <script type="module" src="app.js">
├── app.js                  # app logic (ES module)
├── styles.css              # color tokens + styles
├── i18n/
│   ├── pl.js               # Polish UI strings
│   └── en.js               # English UI strings (optional at first)
├── sw.js                   # service worker
├── manifest.webmanifest
├── config.example.js       # config template — committed
├── icons/
│   ├── icon.svg
│   ├── icon-192.png
│   ├── icon-512.png
│   ├── maskable-512.png    # ogonki has it, 3d-print doesn't — worth having
│   └── apple-touch-icon.png
├── supabase/
│   ├── schema.sql          # single source of truth for the database
│   └── seed/               # generated import SQL — git-ignored (personal data)
├── tools/
│   ├── pgdump_read.py      # reads pg_dump custom-format archives without pg_restore
│   └── import_home_app.py  # old home-app dump → supabase/seed/home_app_import.sql
├── .github/workflows/pages.yml
├── .gitignore              # contains: config.js, *.backup, supabase/seed/*.sql
└── README.md               # 4-step setup (like 3d-print)
```

**Why separate files instead of one `index.html` like 3d-print:** 3d-print has ~1,760 lines in one file. It works, but it is getting hard to edit and to read diffs. This app has more views (shopping list, pantry, recipes, recipe editor, later the meal plan), so splitting into `app.js` / `styles.css` from day one pays off.

**Why not React like home-app:** home-app was React + Vite + ~30 shadcn/Radix packages + react-query, generated by Lovable. It lagged, needed a build, and most of the code was library components nobody touched. No build step keeps the app small and fast, and every file in the repo is one we understand. If `app.js` grows past ~1,500 lines, split it into ES modules (`db.js`, `ui.js`, …) — still without a bundler.

**Keep the root clean:** no loose SQL files at the repo root (ogonki has `20261103000300_members_own_name.sql` both at the root and in `supabase/migrations/`). Everything database-related lives in `supabase/`.

---

## 4. Keys and configuration — the key change from ogonki

### Rule
**No keys and no Supabase project URL in the repository.** They live in *Settings → Secrets and variables → Actions*, and the workflow writes `config.js` at deploy time.

### How it looks

`config.example.js` (committed):
```js
// Copy this file to config.js and fill in your Supabase project values
// (Project Settings → API keys). config.js is git-ignored.
// On GitHub Pages, the deploy workflow writes config.js from repository secrets instead.
// Use the publishable (anon) key only. Never put the service_role or secret key here.
window.APP_CONFIG = {
  url: "https://your-project-ref.supabase.co",
  key: "your-publishable-key"
};
```

`.gitignore`:
```
config.js
```

GitHub repository secrets:
- `SUPABASE_URL` — project URL
- `SUPABASE_KEY` — the **publishable / anon** key (never `service_role`)

### A note on security
The anon key ends up in the user's browser anyway, so it is not secret in the strict sense — **the real protection of the data is RLS in the database**. Keeping it out of the repo still means: no key in git history, rotation without commits, the option to point at a different Supabase project (e.g. a test one) without code changes, and no secret-scanner alerts.

> **To do in ogonki:** the anon key is committed in `config.js` and in commit history ("Update Supabase configuration values"). Move ogonki to the 3d-print model and rotate the key in Supabase.

---

## 5. Database (Supabase)

### 5.1. Sharing model: household + invite code

Taken from 3d-print, not ogonki:

- `households` (id, name, **code** — unique 8-character invite code)
- `household_members` (user_id → `auth.users`, household_id, email)
- `current_household()` returns the signed-in user's household
- RPCs: `create_household(name)`, `join_household(code)`, `new_household_code()`, `rename_household(name)`

**Why not an email allowlist like ogonki:** in ogonki the first member has to be added by hand in SQL, and data is not partitioned at all (every member sees everything in one shared space). The household model is self-service: I create a "Kitchen", the other person enters the code, and we both see the same data. The same database could also serve other pairs later.

**Why not per-row ownership like home-app:** home-app had `owner_id` + `is_shared` on each row. Inserts failed unless the frontend sent `owner_id`, only the owner could delete, and some tables were open to any signed-in user. That is where the access problems came from. **Rule: no `owner_id`-based permissions. Every member of a household can read and change every row of that household.** `created_by` may be stored for display ("added by …"), never for access control.

### 5.2. Domain tables

Every data table has:
```sql
household_id uuid not null references public.households(id) on delete cascade
  default public.current_household()
```
Thanks to `default current_household()`, the frontend never has to send `household_id` on insert.

**v1**
- `categories` — name, position (store-aisle order), color. Per household, user-editable; names are user data, so they may be Polish.
- `category_rules` — keyword → category_id. Used to auto-categorize new shopping and pantry items. Seeded from the old app.
- `units` — code (`g`, `szt`, `łyżka`…), position. Codes are data; display labels go through translations.
- `shopping_items` — name, amount, unit, category_id, checked, checked_at, note, `recipe_id` (optional — where it came from), `created_by`, `created_at`.
- `pantry_items` — name, amount, unit, category_id, `best_before date`, `best_before_precision` (`'day' | 'month'`), `low boolean`, note, `created_at`, `updated_at`.
- `recipes` — title, `meal_type` (`'breakfast' | 'lunch' | 'dinner' | 'snack'`), description, servings, prep/cook time, source (link), image, tags (`text[]`), favorite, notes, `created_by`, `created_at`, `updated_at`.
- `recipe_ingredients` — recipe_id, position, amount (`numeric`), unit, name, note (e.g. "chopped"), section (e.g. "dough", "frosting").
- `recipe_steps` — recipe_id, position, text, optional timer in minutes.
- `household_settings` — shared preferences (default servings, "expiring soon" threshold in days, accent color).

**v2**
- `meal_plan` — date, `meal_type`, recipe_id, servings.
- `cook_log` (optional) — recipe_id, date, rating, note ("too salty, less next time").

**Not in this app:** no fridge/location column, no pharmacy, no routines, no generic to-do lists (see [PRODUCT.md §1](PRODUCT.md#1-scope)).

**No soft delete.** home-app kept `deleted = true` rows forever (more than half the data). Deletes are real; the UI shows an undo toast for a few seconds and re-inserts the row if undo is tapped.

**Matching ingredients to pantry and shopping items** (for "have / missing" and for the v2 list from the plan) is by normalized name: lowercase, trimmed, Polish diacritics kept, simple plural handling done in JS. Store `name` as typed; compute the normalized key in a generated column `name_key text generated always as (lower(trim(name))) stored` and index it.

Ingredients and steps are separate tables (not `jsonb`) — easier to scale servings, build a shopping list and search by ingredient. (3d-print stores filament usage in `jsonb`; that would not work well for recipes.)

**Multi-step actions as RPCs** (atomic, one round trip):
- `move_checked_to_pantry()` — ticked shopping items → pantry (merging with an existing item of the same `name_key` by adding amounts when units match), then delete them from the list.
- `add_recipe_to_list(recipe_id, servings)` — scales amounts, skips what the pantry already has, merges with items already on the list.
- v2: `add_plan_to_list(from date, to date)` — same as above for every planned meal in the range, summed per ingredient.

Validation in the database via `check` constraints (as in ogonki: `char_length(title) between 1 and 120`, `servings between 1 and 100`, etc.).

### 5.3. RLS — mandatory on every table

```sql
alter table public.recipes enable row level security;

drop policy if exists "own recipes" on public.recipes;
create policy "own recipes" on public.recipes
  for all to authenticated
  using (household_id = public.current_household())
  with check (household_id = public.current_household());
```

Child tables (`recipe_ingredients`, `recipe_steps`) either carry their own `household_id`, or the policy checks the parent via `exists (select 1 from recipes r where r.id = recipe_id and r.household_id = current_household())`. Simpler and faster: **give every table a `household_id`**.

### 5.4. GRANT — don't forget it

Ogonki hit "permission denied for table cage_done" because new tables were never granted to the API role (fixed later by `grant_new_tables.sql`). Rule: **every new table gets its `grant` in the same file**:

```sql
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.recipes, public.recipe_ingredients, ... to authenticated;
```

Never grant anything to `anon`.

### 5.5. RPC functions

Pattern from 3d-print:
```sql
create or replace function public.xxx(...)
returns ... language plpgsql security definer set search_path = public as $$ ... $$;

revoke execute on function public.xxx(...) from anon, public;
grant  execute on function public.xxx(...) to authenticated;
```
- always `security definer` + `set search_path = public`
- always check `auth.uid() is null → raise exception 'NOT_SIGNED_IN'`
- always filter by `current_household()`
- errors as short English codes (`'BAD_CODE'`, `'NOT_FOUND'`), translated in the UI

Multi-table operations are RPCs (atomic), e.g. "add a recipe's ingredients to the shopping list" or "save a recipe with its ingredients and steps".

### 5.6. Realtime

```sql
do $$ declare t text; begin
  foreach t in array array['shopping_items','pantry_items','recipes','recipe_ingredients','recipe_steps','categories','household_settings'] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
```
Client side: one channel named per household with a listener per table (like 3d-print), not `{ schema: 'public' }` for everything (like ogonki). The channel status (`SUBSCRIBED` or not) drives a "live / offline" indicator. Also reload data on `visibilitychange` when the app comes back from the background.

The shopping list is the main realtime use case — one person ticks items off in the store, the other sees it at home immediately.

### 5.7. Storage (dish photos)

Pattern from 3d-print: bucket `recipe-images`, path `<user_id>/<timestamp>-<random>.<ext>`, policies allowing upload and delete only in your own folder. Public bucket (the image URL is enough to display it), since food photos aren't sensitive; if that changes, use a private bucket + `createSignedUrl`.

**Resize photos in the browser before upload** (canvas → JPEG/WebP, max ~1600 px) so 5 MB phone photos don't eat the free-tier quota.

### 5.8. Schema management

- `supabase/schema.sql` is **idempotent**: `create table if not exists`, `create or replace function`, `drop policy if exists` + `create policy`, `on conflict do nothing`. It can be re-run in the SQL Editor without losing data (as in 3d-print).
- Once there is real data and the schema starts changing → also add numbered migrations in `supabase/migrations/YYYYMMDDHHMMSS_description.sql` (like ogonki), also idempotent, and keep `schema.sql` updated to the target state.
- Every schema change: table + RLS + grant + realtime in **one** file.

---

## 6. Authentication

- Supabase Auth, email + password (`signUp` / `signInWithPassword`), plus "forgot password" (handle `PASSWORD_RECOVERY` like 3d-print).
- Client:
  ```js
  createClient(cfg.url, cfg.key, { auth: {
    persistSession: true, autoRefreshToken: true, detectSessionInUrl: true,
    storageKey: "kitchen.auth"   // own key so it doesn't clash with other apps on the same origin
  }});
  ```
  `storageKey` matters: ogonki, 3d-print and recipes all live on `dianalumen.github.io`, so they share `localStorage`.
- After returning from an email link: strip `access_token` from the URL (`history.replaceState`).
- In Supabase → *Authentication → URL Configuration*: *Site URL* = the Pages address, *Redirect URLs* = `https://dianalumen.github.io/<repo>/**`.

---

## 7. Deploy — GitHub Actions → Pages

Copy `.github/workflows/pages.yml` from 3d-print and change the list of copied files:

```yaml
- name: Assemble site
  env:
    SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
    SUPABASE_KEY: ${{ secrets.SUPABASE_KEY }}
  run: |
    mkdir _site
    cp index.html app.js styles.css sw.js manifest.webmanifest _site/
    cp -r icons i18n _site/
    if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_KEY" ]; then
      echo "::error::Add SUPABASE_URL and SUPABASE_KEY in Settings > Secrets and variables > Actions."
      exit 1
    fi
    printf 'window.APP_CONFIG = { url: "%s", key: "%s" };\n' "$SUPABASE_URL" "$SUPABASE_KEY" > _site/config.js
```

Everything else unchanged: `permissions: pages: write, id-token: write`, `concurrency: pages`, `actions/configure-pages`, `upload-pages-artifact`, `deploy-pages`. In *Settings → Pages*, set the source to **GitHub Actions**.

The workflow copies files **by explicit list**, so nothing else from the repo (e.g. `supabase/`, `README.md`) is published by accident. Every new frontend file must be added to that list.

---

## 8. PWA

### Manifest
`name`, `short_name`, `lang: "pl"`, `start_url: "./"`, `scope: "./"`, `display: "standalone"`, `theme_color` / `background_color`, icons 192, 512 and **maskable 512**. Relative paths (`./`), because the app lives under `/<repo>/`.

### Service worker (3d-print pattern)
- **network-first** for app files, cache only as an offline fallback (users get the new version right after a deploy);
- **never cache other origins** — Supabase, CDN — only `url.origin === location.origin`;
- `GET` only;
- versioned cache name (`kitchen-v1`), bumped whenever the `SHELL` list changes; `activate` deletes old caches, `skipWaiting()` + `clients.claim()`;
- register only on `https:`.

Worth considering: reading recipes in the kitchen with no signal. For v1 an offline message is enough; later, keep recently loaded recipes in IndexedDB as a read-only cache.

### index.html meta
```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#FFFFFF" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#16181B" media="(prefers-color-scheme: dark)">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Kuchnia">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
```

### Kitchen-specific features
- **Screen Wake Lock API** (`navigator.wakeLock.request("screen")`) in cooking mode — the screen stays on while your hands are covered in flour.
- Large buttons and type in cooking mode, step by step.

---

## 9. Frontend code architecture

### Data layer behind one interface (3d-print pattern)
```js
function sbBackend(sb)  { return { load, insertRecipe, updateRecipe, deleteRecipe, ..., subscribe, signOut }; }
function demoBackend()  { return { /* same API, in-memory data */ }; }
let backend = demo ? demoBackend() : sbBackend(sb);
```
- The UI only calls `backend.*`, never `sb.from(...)` directly.
- Row ↔ object mapping in one place (`fromRow` / `toRow`): snake_case in the database, camelCase in JS.
- A `must()` helper turns `{ data, error }` into a thrown error.
- One wrapper around writes catches errors, shows a "No connection — that change wasn't saved" toast (translated), then reloads data.

### Performance (home-app lagged — this one must not)
- **Optimistic UI:** apply every change to local state and re-render first, then save. On error, roll back and show a toast.
- **Realtime patches, not reloads:** a `postgres_changes` event updates the one affected row in local state; full reload only on reconnect and on `visibilitychange`.
- **Render only the current view**, and inside long lists (pantry has 150+ items) update the changed row instead of rebuilding the whole list.
- Ignore echo: realtime events for a change this device just made are skipped (match by row id + `updated_at`).
- Budget: first paint < 1 s on a phone over 4G, tap-to-feedback < 100 ms. No dependency other than supabase-js and one font family.
- Animate only `transform` and `opacity`.

### Demo mode
`?demo` in the URL → `demoBackend()` with sample recipes and a banner "Example data — nothing is saved". Useful for showing the app without an account and for testing UI without a database.

### UI security
- Every string from the database goes through `esc()` before going into `innerHTML` (both projects do this — stick to it strictly; recipes pasted from the web are a classic source of stray HTML).
- Source links: `rel="noopener noreferrer"`, `http(s):` only.

### Local state
- `localStorage` only for per-device preferences (theme, last tab); every read/write in `try/catch`; keys prefixed `kitchen.`.
- Shared data lives only in Supabase.

### Strings / i18n
All UI strings in dictionaries (`t("key")`) as in 3d-print, with English keys. Polish is the default UI language; no text hard-coded in the code (see section 0).

---

## 10. Look and feel

Chosen direction: **A — "Leaflet"** (decided 2026-11-12). The screens, the reasons and the UX copy rules are in [DESIGN.md](DESIGN.md); the source of truth for how each screen looks is the **A — Leaflet** board on the [design canvas](https://claude.ai/artifact/YbZ1pd22wgBKPT8NK55e1L). This section is the implementation side.

### Tokens (from the A board)
```css
:root{
  --accent:#D4F09F;            /* Matcha by default; user-chosen from 6 swatches, stored in household_settings */
  --on-accent:#141414;         /* text on the accent fill, whatever accent is picked */
  --bg:#FFFFFF; --soft:#F4F3EF; --ink:#141414; --on-ink:#FFFFFF;
  --muted:#6E6C65;             /* darker than Leaflet's #77756E: 4.6:1 on --soft */
  --line:#E9E7E1; --faint:#C9C7C0; --bar:#141414; --danger:#C8323A;
  --warn-dot:#E0662E;          /* "Zużyj wkrótce" marker; never the accent */
  --f-sans:"Instrument Sans",system-ui,sans-serif;
  color-scheme:light;
}
@media (prefers-color-scheme: dark){ :root:not([data-theme="light"]){ /* same values as [data-theme="dark"] */ } }
:root[data-theme="dark"]{ --accent:#B5DC6E; --bg:#121211; --soft:#22211E; --ink:#F2F0EA; --on-ink:#141414; --muted:#A6A39B; --line:#34332F; --faint:#5C5A55; --bar:#2A2926; --danger:#FF8A8A; color-scheme:dark; }
```
Accent swatches (settings): Matcha `#D4F09F` / `#B5DC6E`, Pomidor `#FF8A65`, Morela `#FFB86B`, Lawenda `#B4A5FF`, Mięta `#7EDCC0`, Słonecznik `#FFD84D`.

Type: titles 34/500, rows 17/600, secondary 13/500. No serif accent words.

### Meaning of color
- The **accent** means only "selected / done / primary": the active tab, a ticked item, the main tile. Never a warning.
- **Warnings** ("Zużyj wkrótce", "Mało") are a soft tile with a small `--warn-dot`, not a colored fill.
- **Categories have no colors:** plain text headers and chips, no colored dots or fills.

### Components to reuse from Leaflet
- `.app` — one column, `max-width:480px`, 16 px side gutter with safe-area insets, bottom padding for the tab bar.
- `.ttl` — 34 px / 500 / `-0.025em` screen titles (plain sans, no `em` accent); `.eyebrow` above them carries only the key number ("5 do kupienia").
- `.card` — 24 px radius on `--soft`, 44 px icon circle on the left, `:active{transform:scale(.975)}`; check-off fill animation reused for shopping items.
- `.chip` / `.seg` — filters (category, meal type) and segmented controls.
- `.tabbar` — floating dark pill, active tab filled with `--accent`.
- `.sheet` + `.scrim` — bottom sheet for every add/edit form.
- `.btn` / `.btn.black` — pill buttons, ink for the primary action.
- view transitions `.enter` / `.fwd` / `.bwd` (translate + fade, ≤ 0.42 s).

### General rules
- Colors only via tokens; light and dark both checked for every screen.
- `env(safe-area-inset-*)` for the iPhone notch and home indicator.
- Minimum touch target 44 px; visible `:focus-visible` outline.
- Font: Instrument Sans only, from Google Fonts with `display=swap`, falling back to `system-ui` so the app still looks right offline.
- UI strings follow the UX copy rules in DESIGN.md (counts as `3/6`, no brackets, no `·`, buttons say the result).
- `font-variant-numeric: tabular-nums` for amounts, dates and times.
- `@media (prefers-reduced-motion: reduce)` turns animations off.
- No borders and no drop shadows on cards; hierarchy comes from size, weight and the soft fill.

---

## 11. Local development

```sh
cp config.example.js config.js     # then fill in the URL and the publishable key
python3 -m http.server 8000
```
Open <http://localhost:8000> or <http://localhost:8000/?demo>.

In Supabase → *Redirect URLs*, also add `http://localhost:8000/**` so email links work locally.

---

## 12. Project setup checklist

1. New GitHub repo `kitchen`, `.gitignore` containing `config.js`.
2. New Supabase project (separate, not shared with ogonki / 3d-print).
3. SQL Editor → run `supabase/schema.sql`.
4. GitHub → *Settings → Secrets and variables → Actions*: `SUPABASE_URL`, `SUPABASE_KEY` (publishable).
5. GitHub → *Settings → Pages*: source **GitHub Actions**.
6. Supabase → *Authentication → URL Configuration*: Site URL + Redirect URLs (Pages and localhost).
7. Push to `main` → deploy.
8. Sign up → create a household → send the code to the other person → they sign up and join with the code.
9. Import old data: `python3 tools/import_home_app.py <dump.backup>` → run the generated `supabase/seed/home_app_import.sql` once in the SQL Editor (see [PRODUCT.md §4](PRODUCT.md#4-data-from-the-old-app)).

## 13. Checklist for every change

- [ ] new code, comments, docs, SQL and commit message are in English (section 0)
- [ ] new UI text added to the translation dictionaries, not hard-coded
- [ ] table has `household_id … default current_household()`
- [ ] `enable row level security` + policy with `using` and `with check`
- [ ] `grant select, insert, update, delete … to authenticated`
- [ ] added to the `supabase_realtime` publication (if it should update live)
- [ ] new RPC: `security definer`, `set search_path = public`, `revoke … from anon, public`, `grant … to authenticated`
- [ ] SQL file is idempotent (safe to run twice)
- [ ] `demoBackend()` updated with new fields
- [ ] new frontend files added to the workflow and to `SHELL` in `sw.js` (+ cache version bumped)
