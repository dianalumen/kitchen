-- kitchen — database schema (Supabase, Postgres 15 or newer)
--
-- The single source of truth for the database. Run the whole file in the Supabase
-- SQL Editor. It is idempotent: running it again creates what is missing, replaces
-- functions and policies, and never drops a table or deletes data.
--
-- Access model (TECH-GUIDELINES §5): one household per user, and every member of a
-- household can read and change every row of that household. There is no per-row
-- ownership. Every data table has
--   * household_id ... default current_household()   (the client never sends it)
--   * row level security with one "for all" policy on current_household()
--   * an explicit grant to `authenticated` and nothing for `anon`
--     (the project has "Automatically expose new tables" turned OFF)
--   * a place in the supabase_realtime publication.
-- households and household_members are read-only for clients; they change only
-- through the RPCs at the end of this file.
--
-- After any change to this file, run supabase/tests.sql (TECH-GUIDELINES §13).

grant usage on schema public to authenticated;


-- ---------------------------------------------------------------------------
-- 1. Households and members
-- ---------------------------------------------------------------------------

create table if not exists public.households (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 60),
  code       text not null unique check (code ~ '^[A-Z0-9]{8}$'),
  created_at timestamptz not null default now()
);

-- One household per user: user_id is the primary key.
create table if not exists public.household_members (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  email        text,
  joined_at    timestamptz not null default now()
);

create index if not exists household_members_household_idx
  on public.household_members (household_id);

-- The signed-in user's household, or null. Security definer so that it can read
-- household_members without going through that table's own policy (which calls
-- this function).
create or replace function public.current_household()
returns uuid
language sql stable security definer set search_path = public
as $$
  select household_id from public.household_members where user_id = auth.uid()
$$;

revoke execute on function public.current_household() from public, anon;
grant  execute on function public.current_household() to authenticated;


-- ---------------------------------------------------------------------------
-- 2. Data tables
-- ---------------------------------------------------------------------------

-- Shared preferences, one row per household (created by create_household).
-- accent is a swatch key; the UI maps keys to colors and Polish names.
create table if not exists public.household_settings (
  household_id       uuid primary key default public.current_household()
                     references public.households (id) on delete cascade,
  default_servings   integer not null default 2 check (default_servings between 1 and 100),
  expiring_soon_days integer not null default 7 check (expiring_soon_days between 0 and 365),
  accent             text not null default 'matcha'
                     check (accent in ('matcha', 'tomato', 'apricot', 'lavender', 'mint', 'sunflower')),
  updated_at         timestamptz not null default now()
);

-- Shopping-list sections in store-aisle order. No colors (IMPLEMENTATION-PLAN
-- decision 7). Names are user data, so they may be Polish.
create table if not exists public.categories (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.current_household()
               references public.households (id) on delete cascade,
  name         text not null check (char_length(trim(name)) between 1 and 40),
  name_key     text generated always as (lower(trim(name))) stored,
  position     integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (household_id, id)   -- target of the same-household foreign keys below
);

create unique index if not exists categories_name_key_idx
  on public.categories (household_id, name_key);

-- Keyword -> category, for auto-categorising new shopping and pantry items.
-- A rule matches when keyword_key is a substring of the item's name_key; the
-- longest matching keyword wins.
create table if not exists public.category_rules (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.current_household()
               references public.households (id) on delete cascade,
  keyword      text not null check (char_length(trim(keyword)) between 1 and 60),
  keyword_key  text generated always as (lower(trim(keyword))) stored,
  category_id  uuid not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  foreign key (household_id, category_id)
    references public.categories (household_id, id) on delete cascade
);

create unique index if not exists category_rules_keyword_key_idx
  on public.category_rules (household_id, keyword_key);
create index if not exists category_rules_category_idx
  on public.category_rules (household_id, category_id);

-- Unit codes offered in the amount pickers. Codes are data; display labels go
-- through translations. Items store the unit as text, so deleting a unit here
-- never touches existing items.
create table if not exists public.units (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.current_household()
               references public.households (id) on delete cascade,
  code         text not null check (char_length(trim(code)) between 1 and 20),
  position     integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index if not exists units_code_idx
  on public.units (household_id, code);

create table if not exists public.recipes (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.current_household()
               references public.households (id) on delete cascade,
  title        text not null check (char_length(trim(title)) between 1 and 120),
  meal_type    text check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  description  text check (char_length(description) <= 2000),
  servings     integer not null default 2 check (servings between 1 and 100),
  prep_minutes integer check (prep_minutes between 0 and 1440),
  cook_minutes integer check (cook_minutes between 0 and 1440),
  source_url   text check (source_url ~* '^https?://' and char_length(source_url) <= 2000),
  image_path   text check (char_length(image_path) <= 300),   -- object path in the recipe-images bucket
  tags         text[] not null default '{}' check (cardinality(tags) <= 20),
  favorite     boolean not null default false,
  notes        text check (char_length(notes) <= 4000),
  created_by   uuid default auth.uid() references auth.users (id) on delete set null,  -- display only
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (household_id, id)
);

-- The one shared shopping list.
create table if not exists public.shopping_items (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.current_household()
               references public.households (id) on delete cascade,
  name         text not null check (char_length(trim(name)) between 1 and 120),
  name_key     text generated always as (lower(trim(name))) stored,
  amount       numeric check (amount > 0 and amount < 1000000),
  unit         text check (char_length(unit) between 1 and 20),
  category_id  uuid,
  checked      boolean not null default false,
  checked_at   timestamptz,   -- maintained by a trigger
  note         text check (char_length(note) <= 500),
  recipe_id    uuid,          -- the recipe the item came from, if any
  created_by   uuid default auth.uid() references auth.users (id) on delete set null,  -- display only
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  foreign key (household_id, category_id)
    references public.categories (household_id, id) on delete set null (category_id),
  foreign key (household_id, recipe_id)
    references public.recipes (household_id, id) on delete set null (recipe_id)
);

create index if not exists shopping_items_name_key_idx
  on public.shopping_items (household_id, name_key);
create index if not exists shopping_items_category_idx
  on public.shopping_items (household_id, category_id);
create index if not exists shopping_items_recipe_idx
  on public.shopping_items (household_id, recipe_id);

-- What we have at home. amount is optional (0 = run out); low is the "running
-- low" flag. best_before is a real date: for precision 'month' it is the last
-- day of that month and the UI shows only the month.
create table if not exists public.pantry_items (
  id                    uuid primary key default gen_random_uuid(),
  household_id          uuid not null default public.current_household()
                        references public.households (id) on delete cascade,
  name                  text not null check (char_length(trim(name)) between 1 and 120),
  name_key              text generated always as (lower(trim(name))) stored,
  amount                numeric check (amount >= 0 and amount < 1000000),
  unit                  text check (char_length(unit) between 1 and 20),
  category_id           uuid,
  best_before           date,
  best_before_precision text not null default 'day' check (best_before_precision in ('day', 'month')),
  low                   boolean not null default false,
  note                  text check (char_length(note) <= 500),
  created_by            uuid default auth.uid() references auth.users (id) on delete set null,  -- display only
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  foreign key (household_id, category_id)
    references public.categories (household_id, id) on delete set null (category_id)
);

create index if not exists pantry_items_name_key_idx
  on public.pantry_items (household_id, name_key);
create index if not exists pantry_items_category_idx
  on public.pantry_items (household_id, category_id);

create table if not exists public.recipe_ingredients (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.current_household()
               references public.households (id) on delete cascade,
  recipe_id    uuid not null,
  position     integer not null default 0,
  amount       numeric check (amount > 0 and amount < 1000000),
  unit         text check (char_length(unit) between 1 and 20),
  name         text not null check (char_length(trim(name)) between 1 and 120),
  name_key     text generated always as (lower(trim(name))) stored,
  note         text check (char_length(note) <= 200),     -- e.g. "posiekana"
  section      text check (char_length(section) <= 60),   -- e.g. "ciasto", "krem"
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  foreign key (household_id, recipe_id)
    references public.recipes (household_id, id) on delete cascade
);

create index if not exists recipe_ingredients_recipe_idx
  on public.recipe_ingredients (household_id, recipe_id, position);
create index if not exists recipe_ingredients_name_key_idx
  on public.recipe_ingredients (household_id, name_key);

create table if not exists public.recipe_steps (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null default public.current_household()
                references public.households (id) on delete cascade,
  recipe_id     uuid not null,
  position      integer not null default 0,
  text          text not null check (char_length(trim(text)) between 1 and 4000),
  timer_minutes integer check (timer_minutes between 1 and 1440),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  foreign key (household_id, recipe_id)
    references public.recipes (household_id, id) on delete cascade
);

create index if not exists recipe_steps_recipe_idx
  on public.recipe_steps (household_id, recipe_id, position);


-- ---------------------------------------------------------------------------
-- 3. Triggers
-- ---------------------------------------------------------------------------

-- updated_at on every update; the client uses (id, updated_at) to skip the
-- realtime echo of its own writes.
create or replace function public.set_updated_at()
returns trigger
language plpgsql set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

-- checked_at follows checked: set when an item is ticked, cleared when unticked.
create or replace function public.shopping_items_set_checked_at()
returns trigger
language plpgsql set search_path = public
as $$
begin
  if not new.checked then
    new.checked_at := null;
  elsif tg_op = 'INSERT' then
    new.checked_at := coalesce(new.checked_at, now());
  elsif not old.checked then
    new.checked_at := now();
  end if;
  return new;
end
$$;

revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.shopping_items_set_checked_at() from public, anon, authenticated;

create or replace trigger shopping_items_checked_at
  before insert or update of checked on public.shopping_items
  for each row execute function public.shopping_items_set_checked_at();


-- ---------------------------------------------------------------------------
-- 4. RLS, grants, updated_at triggers and realtime for every table
-- ---------------------------------------------------------------------------

-- households and household_members: members read their own household; nobody
-- writes directly (only the RPCs below, which run as the table owner).
alter table public.households enable row level security;
alter table public.household_members enable row level security;

drop policy if exists "members read their household" on public.households;
create policy "members read their household" on public.households
  for select to authenticated
  using (id = (select public.current_household()));

drop policy if exists "members read their household" on public.household_members;
create policy "members read their household" on public.household_members
  for select to authenticated
  using (household_id = (select public.current_household()));

revoke all on public.households, public.household_members from public, anon, authenticated;
grant select on public.households, public.household_members to authenticated;

-- Data tables: the same four things for each one. revoke-then-grant keeps the
-- privileges exact on every run (no TRUNCATE, which would bypass RLS).
do $$
declare
  t text;
begin
  foreach t in array array[
    'household_settings', 'categories', 'category_rules', 'units', 'recipes',
    'shopping_items', 'pantry_items', 'recipe_ingredients', 'recipe_steps'
  ] loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists "household members" on public.%I', t);
    execute format(
      'create policy "household members" on public.%I for all to authenticated '
      'using (household_id = (select public.current_household())) '
      'with check (household_id = (select public.current_household()))', t);

    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);

    execute format(
      'create or replace trigger %I before update on public.%I '
      'for each row execute function public.set_updated_at()', t || '_updated_at', t);
  end loop;
end
$$;

-- Realtime: every table, so both phones see changes (and renames, new members)
-- without reloading. Realtime applies the same RLS policies per subscriber.
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'publication supabase_realtime not found; skipping realtime setup';
    return;
  end if;
  foreach t in array array[
    'households', 'household_members', 'household_settings', 'categories',
    'category_rules', 'units', 'recipes', 'shopping_items', 'pantry_items',
    'recipe_ingredients', 'recipe_steps'
  ] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;


-- ---------------------------------------------------------------------------
-- 5. Storage: recipe photos
-- ---------------------------------------------------------------------------

-- Public bucket: the URL is enough to show a photo (food photos are not
-- sensitive). Files are shared by the household like every other row: uploads
-- go to "<household_id>/<timestamp>-<random>.<ext>", and any member can read,
-- upload, replace and delete files in their household's folder (so either of
-- us can change or remove a photo the other added). Nobody else can write.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recipe-images', 'recipe-images', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Policies from the first M1 draft (per-user folders).
drop policy if exists "recipe images: read own folder" on storage.objects;
drop policy if exists "recipe images: upload to own folder" on storage.objects;
drop policy if exists "recipe images: delete from own folder" on storage.objects;

drop policy if exists "recipe images: household folder read" on storage.objects;
create policy "recipe images: household folder read" on storage.objects
  for select to authenticated
  using (bucket_id = 'recipe-images'
         and (storage.foldername(name))[1] = (select public.current_household())::text);

drop policy if exists "recipe images: household folder upload" on storage.objects;
create policy "recipe images: household folder upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'recipe-images'
              and (storage.foldername(name))[1] = (select public.current_household())::text);

drop policy if exists "recipe images: household folder update" on storage.objects;
create policy "recipe images: household folder update" on storage.objects
  for update to authenticated
  using (bucket_id = 'recipe-images'
         and (storage.foldername(name))[1] = (select public.current_household())::text)
  with check (bucket_id = 'recipe-images'
              and (storage.foldername(name))[1] = (select public.current_household())::text);

drop policy if exists "recipe images: household folder delete" on storage.objects;
create policy "recipe images: household folder delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'recipe-images'
         and (storage.foldername(name))[1] = (select public.current_household())::text);


-- ---------------------------------------------------------------------------
-- 6. Supabase-managed functions in public
-- ---------------------------------------------------------------------------

-- The project setting "Enable automatic RLS" installs public.rls_auto_enable(),
-- an event-trigger function, and Supabase's default privileges make it
-- executable by anon and authenticated (so it would show up as an RPC). Client
-- roles never need EXECUTE on it: an event trigger fires its function without
-- checking the EXECUTE privilege of the role running the DDL (privileges are
-- checked only when the event trigger is created, by its superuser owner), so
-- automatic RLS keeps working. Guarded, because the function exists only while
-- that setting is on.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end
$$;


-- ---------------------------------------------------------------------------
-- 7. RPCs
-- ---------------------------------------------------------------------------
-- All: security definer, search_path = public, auth.uid() check, everything
-- filtered by the caller's household, errors as short English codes:
--   NOT_SIGNED_IN, NO_HOUSEHOLD, ALREADY_IN_HOUSEHOLD, BAD_NAME, BAD_CODE,
--   BAD_SERVINGS, NOT_FOUND
-- Call from the client with named arguments, e.g.
--   sb.rpc("add_recipe_to_list", { p_recipe_id, p_servings })

-- Internal: a new unique 8-character invite code. 32 symbols without the
-- look-alikes I, O, 0 and 1; randomness from gen_random_uuid() (strong random),
-- using only the uuid bytes that carry no version/variant bits.
create or replace function public._new_household_code()
returns text
language plpgsql volatile set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  b bytea;
  c text;
  i integer;
begin
  loop
    b := uuid_send(gen_random_uuid());
    c := '';
    foreach i in array array[0, 1, 2, 3, 4, 5, 10, 11] loop
      c := c || substr(alphabet, (get_byte(b, i) % 32) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.households where code = c);
  end loop;
  return c;
end
$$;

revoke execute on function public._new_household_code() from public, anon, authenticated;

-- Create a household for the caller and seed it so it is usable at once:
-- settings, default categories in store-aisle order, and units.
create or replace function public.create_household(p_name text)
returns public.households
language plpgsql security definer set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_name      text := trim(coalesce(p_name, ''));
  v_household public.households;
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;
  if exists (select 1 from public.household_members where user_id = v_uid) then
    raise exception 'ALREADY_IN_HOUSEHOLD';
  end if;
  if char_length(v_name) not between 1 and 60 then raise exception 'BAD_NAME'; end if;

  insert into public.households (name, code)
  values (v_name, public._new_household_code())
  returning * into v_household;

  insert into public.household_members (user_id, household_id, email)
  values (v_uid, v_household.id, (select email from auth.users where id = v_uid));

  insert into public.household_settings (household_id) values (v_household.id);

  -- Default categories (user data, Polish), in the order of a typical shop.
  insert into public.categories (household_id, name, position)
  select v_household.id, c.name, c.ord
  from unnest(array[
    'Owoce i warzywa',
    'Pieczywo',
    'Nabiał',
    'Mięso i wędliny',
    'Ryby',
    'Mrożonki',
    'Makaron, ryż i kasze',
    'Pieczenie',
    'Przyprawy',
    'Oleje i sosy',
    'Konserwy',
    'Płatki i przekąski',
    'Słodycze',
    'Napoje',
    'Kawa i herbata',
    'Chemia',
    'Inne'
  ]) with ordinality as c(name, ord);

  insert into public.units (household_id, code, position)
  select v_household.id, u.code, u.ord
  from unnest(array[
    'szt', 'g', 'dag', 'kg', 'ml', 'l', 'opak',
    'łyżka', 'łyżeczka', 'szklanka', 'pęczek', 'plaster'
  ]) with ordinality as u(code, ord);

  return v_household;
end
$$;

-- Join a household by invite code (case, spaces and dashes are ignored).
-- Joining the household you are already in returns it; any other household
-- while you are in one is ALREADY_IN_HOUSEHOLD (checked before the code, so the
-- answer never reveals whether someone else's code exists).
create or replace function public.join_household(p_code text)
returns public.households
language plpgsql security definer set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_code      text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_current   uuid;
  v_household public.households;
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;

  select household_id into v_current from public.household_members where user_id = v_uid;
  if v_current is not null then
    select * into v_household from public.households where id = v_current;
    if v_household.code = v_code then return v_household; end if;
    raise exception 'ALREADY_IN_HOUSEHOLD';
  end if;

  select * into v_household from public.households where code = v_code;
  if not found then raise exception 'BAD_CODE'; end if;

  insert into public.household_members (user_id, household_id, email)
  values (v_uid, v_household.id, (select email from auth.users where id = v_uid));

  return v_household;
end
$$;

-- Replace the invite code (the old one stops working). Returns the new code.
create or replace function public.new_household_code()
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_household uuid;
  v_code      text;
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;
  v_household := public.current_household();
  if v_household is null then raise exception 'NO_HOUSEHOLD'; end if;

  update public.households set code = public._new_household_code()
  where id = v_household
  returning code into v_code;
  return v_code;
end
$$;

create or replace function public.rename_household(p_name text)
returns public.households
language plpgsql security definer set search_path = public
as $$
declare
  v_name      text := trim(coalesce(p_name, ''));
  v_household public.households;
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;
  if public.current_household() is null then raise exception 'NO_HOUSEHOLD'; end if;
  if char_length(v_name) not between 1 and 60 then raise exception 'BAD_NAME'; end if;

  update public.households set name = v_name
  where id = public.current_household()
  returning * into v_household;
  return v_household;
end
$$;

-- Move every ticked shopping item into the pantry, then delete it from the list.
-- Each item merges into a pantry item with the same name_key (preferring one
-- with the same unit), so buying something never creates a duplicate:
--   * same unit, both amounts known  -> amounts are added
--   * pantry amount unknown or 0     -> takes the bought amount and unit
--   * bought amount unknown          -> pantry amount kept (0 becomes unknown)
--   * different units, both known    -> pantry amount kept
-- and the pantry item is no longer "low". Items with no match are inserted.
-- Returns the number of items moved.
create or replace function public.move_checked_to_pantry()
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_household uuid;
  v_item      public.shopping_items;
  v_pantry_id uuid;
  v_moved     integer := 0;
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;
  v_household := public.current_household();
  if v_household is null then raise exception 'NO_HOUSEHOLD'; end if;

  for v_item in
    select * from public.shopping_items
    where household_id = v_household and checked
    order by checked_at nulls last, created_at, id
    for update
  loop
    select p.id into v_pantry_id
    from public.pantry_items p
    where p.household_id = v_household and p.name_key = v_item.name_key
    order by (p.unit is not distinct from v_item.unit) desc, p.created_at, p.id
    limit 1
    for update;

    if found then
      update public.pantry_items set
        amount = case
                   when v_item.amount is null then nullif(amount, 0)
                   when amount is null or amount = 0 then v_item.amount
                   when unit is not distinct from v_item.unit then amount + v_item.amount
                   else amount
                 end,
        unit = case
                 when v_item.amount is not null and coalesce(amount, 0) = 0 then v_item.unit
                 else unit
               end,
        low = false,
        category_id = coalesce(category_id, v_item.category_id)
      where id = v_pantry_id;
    else
      insert into public.pantry_items (household_id, name, amount, unit, category_id, created_by)
      values (v_household, trim(v_item.name), v_item.amount, v_item.unit, v_item.category_id, v_uid);
    end if;

    delete from public.shopping_items where id = v_item.id;
    v_moved := v_moved + 1;
  end loop;

  return v_moved;
end
$$;

-- Add a recipe's ingredients to the shopping list for p_servings (default: the
-- recipe's own servings). For each ingredient, in recipe order:
--   * skipped if the pantry has it: an item with the same name_key that is not
--     "low" and whose amount is unknown or above 0 (presence only, amounts are
--     not compared)
--   * merged into an unticked list item with the same name_key (preferring the
--     same unit); amounts are added only when both are known and units match
--   * otherwise inserted with the scaled amount (rounded to 0.01), recipe_id,
--     and a category from a pantry item of the same name or else the longest
--     matching category rule.
-- Returns {"added": n, "merged": n, "skipped": n}.
create or replace function public.add_recipe_to_list(p_recipe_id uuid, p_servings integer default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_household uuid;
  v_recipe    public.recipes;
  v_factor    numeric;
  v_ing       public.recipe_ingredients;
  v_item      public.shopping_items;
  v_amount    numeric;
  v_category  uuid;
  v_added     integer := 0;
  v_merged    integer := 0;
  v_skipped   integer := 0;
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;
  v_household := public.current_household();
  if v_household is null then raise exception 'NO_HOUSEHOLD'; end if;

  select * into v_recipe from public.recipes
  where id = p_recipe_id and household_id = v_household;
  if not found then raise exception 'NOT_FOUND'; end if;

  if p_servings is not null and p_servings not between 1 and 100 then
    raise exception 'BAD_SERVINGS';
  end if;
  v_factor := coalesce(p_servings, v_recipe.servings)::numeric / v_recipe.servings;

  for v_ing in
    select * from public.recipe_ingredients
    where household_id = v_household and recipe_id = v_recipe.id
    order by position, created_at, id
  loop
    if exists (select 1 from public.pantry_items p
               where p.household_id = v_household
                 and p.name_key = v_ing.name_key
                 and not p.low
                 and (p.amount is null or p.amount > 0)) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_amount := nullif(round(v_ing.amount * v_factor, 2), 0);

    select * into v_item from public.shopping_items s
    where s.household_id = v_household and s.name_key = v_ing.name_key and not s.checked
    order by (s.unit is not distinct from v_ing.unit) desc, s.created_at, s.id
    limit 1
    for update;

    if found then
      if v_amount is not null and v_item.amount is not null
         and v_item.unit is not distinct from v_ing.unit then
        update public.shopping_items set amount = amount + v_amount where id = v_item.id;
      end if;
      v_merged := v_merged + 1;
    else
      select coalesce(
        (select p.category_id from public.pantry_items p
          where p.household_id = v_household and p.name_key = v_ing.name_key
            and p.category_id is not null
          order by p.updated_at desc
          limit 1),
        (select r.category_id from public.category_rules r
          where r.household_id = v_household and strpos(v_ing.name_key, r.keyword_key) > 0
          order by char_length(r.keyword_key) desc, r.keyword_key
          limit 1))
      into v_category;

      insert into public.shopping_items (household_id, name, amount, unit, category_id, recipe_id, created_by)
      values (v_household, trim(v_ing.name), v_amount, v_ing.unit, v_category, v_recipe.id, v_uid);
      v_added := v_added + 1;
    end if;
  end loop;

  return jsonb_build_object('added', v_added, 'merged', v_merged, 'skipped', v_skipped);
end
$$;

-- RPC privileges: signed-in users only.
revoke execute on function public.create_household(text)              from public, anon;
revoke execute on function public.join_household(text)                from public, anon;
revoke execute on function public.new_household_code()                from public, anon;
revoke execute on function public.rename_household(text)              from public, anon;
revoke execute on function public.move_checked_to_pantry()            from public, anon;
revoke execute on function public.add_recipe_to_list(uuid, integer)   from public, anon;

grant execute on function public.create_household(text)               to authenticated;
grant execute on function public.join_household(text)                 to authenticated;
grant execute on function public.new_household_code()                 to authenticated;
grant execute on function public.rename_household(text)               to authenticated;
grant execute on function public.move_checked_to_pantry()             to authenticated;
grant execute on function public.add_recipe_to_list(uuid, integer)    to authenticated;
