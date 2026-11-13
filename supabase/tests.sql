-- kitchen — access tests for supabase/schema.sql
--
-- How to run: Supabase → SQL Editor → paste this whole file → Run (after
-- schema.sql). The result grid lists every check as PASS or FAIL; row 0 is the
-- summary. If anything FAILs, copy the FAIL rows (the detail column says what
-- came back).
--
-- What it checks (TECH-GUIDELINES §5, IMPLEMENTATION-PLAN M1):
--   * two members of one household (A, B) can insert, update and delete each
--     other's rows in every data table, and both use every RPC
--   * a user in another household (C) sees and changes nothing of theirs and
--     cannot link to their rows or move rows into their household
--   * anon can read nothing and call nothing
--   * a user without a household (D) gets BAD_CODE for a wrong invite code
--   * static checks: RLS on every table, no anon privileges, realtime
--
-- Nothing is kept. The tests run inside one PL/pgSQL block whose subtransaction
-- is always rolled back at the end (a forced error, caught), so the fake users,
-- households, rows and storage objects all disappear. The rollback happens
-- inside the function rather than with a final ROLLBACK statement so that the
-- SQL Editor can still show the result grid. The helper functions live in
-- pg_temp and vanish when the editor's session ends.
--
-- Users are impersonated the way PostgREST does it: `set local role
-- authenticated` (or anon) plus the request.jwt.claims setting that auth.uid()
-- reads.

-- Switch to a user (p_uid) or to a signed-out caller (p_uid null).
create or replace function pg_temp.kt_as(p_uid uuid, p_role text default 'authenticated')
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    case when p_uid is null then json_build_object('role', p_role)
         else json_build_object('sub', p_uid, 'role', p_role) end::text, true);
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
  if p_role = 'anon' then
    set local role anon;
  else
    set local role authenticated;
  end if;
end $$;

-- Back to the editor's own role.
create or replace function pg_temp.kt_admin()
returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

-- Run a statement as the current role: 'ok <row count>' or 'error <sqlstate> <message>'.
create or replace function pg_temp.kt_exec(p_sql text)
returns text language plpgsql as $$
declare
  n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return 'ok ' || n;
exception when others then
  return 'error ' || sqlstate || ' ' || sqlerrm;
end $$;

-- Run a query as the current role and return its first value as text
-- ('NULL' for null), or 'error <sqlstate> <message>'.
create or replace function pg_temp.kt_val(p_sql text)
returns text language plpgsql as $$
declare
  v text;
begin
  execute p_sql into v;
  return coalesce(v, 'NULL');
exception when others then
  return 'error ' || sqlstate || ' ' || sqlerrm;
end $$;

create or replace function pg_temp.kt_res(p_ok boolean, p_test text, p_detail text default null)
returns jsonb language sql as $$
  select jsonb_build_object('result', case when p_ok then 'PASS' else 'FAIL' end,
                            'test', p_test, 'detail', p_detail)
$$;

-- The helpers are called while impersonating anon / authenticated.
grant execute on function pg_temp.kt_as(uuid, text), pg_temp.kt_admin(), pg_temp.kt_exec(text),
                          pg_temp.kt_val(text), pg_temp.kt_res(boolean, text, text)
  to anon, authenticated;

create or replace function pg_temp.kt_run()
returns table (nr integer, outcome text, check_name text, detail text)
language plpgsql as $$
#variable_conflict use_column
declare
  u_a uuid := gen_random_uuid();   -- member, creates the household
  u_b uuid := gen_random_uuid();   -- member, joins with the code
  u_c uuid := gen_random_uuid();   -- outsider with their own household
  u_d uuid := gen_random_uuid();   -- signed in, no household
  h_a uuid;
  h_c uuid;
  code_a text;
  code_new text;
  r_fixture uuid;
  r_pancakes uuid;
  cat_baking uuid;
  id1 text;
  id2 text;
  s text;
  t record;
  fn text;
  step text := 'start';
  log jsonb := '[]'::jsonb;
  all_tables constant text[] := array[
    'households', 'household_members', 'household_settings', 'categories', 'category_rules',
    'units', 'recipes', 'shopping_items', 'pantry_items', 'recipe_ingredients', 'recipe_steps'];
begin
  begin
    -- -----------------------------------------------------------------------
    step := '0 static checks';
    s := pg_temp.kt_val($q$
      select string_agg(c.relname, ', ') from pg_class c
      where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and not c.relrowsecurity$q$);
    log := log || pg_temp.kt_res(s = 'NULL', 'RLS is enabled on every table in public', 'tables without RLS: ' || s);

    s := pg_temp.kt_val($q$
      select string_agg(c.relname, ', ') from pg_class c
      where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'm')
        and has_table_privilege('anon', c.oid, 'select, insert, update, delete, truncate')$q$);
    log := log || pg_temp.kt_res(s = 'NULL', 'anon has no privileges on any table in public', 'tables anon can use: ' || s);

    s := pg_temp.kt_val($q$
      select string_agg(p.oid::regprocedure::text, ', ') from pg_proc p
      where p.pronamespace = 'public'::regnamespace and has_function_privilege('anon', p.oid, 'execute')$q$);
    log := log || pg_temp.kt_res(s = 'NULL', 'anon can execute no function in public', 'functions anon can run: ' || s);

    s := pg_temp.kt_val($q$
      select string_agg(c.relname, ', ') from pg_class c
      where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
        and has_table_privilege('authenticated', c.oid, 'truncate, references, trigger')$q$);
    log := log || pg_temp.kt_res(s = 'NULL', 'authenticated has no TRUNCATE/REFERENCES/TRIGGER', 'tables: ' || s);

    s := pg_temp.kt_val($q$
      select string_agg(p.oid::regprocedure::text, ', ') from pg_proc p
      where p.pronamespace = 'public'::regnamespace
        and p.proname in ('_new_household_code', 'set_updated_at', 'shopping_items_set_checked_at')
        and has_function_privilege('authenticated', p.oid, 'execute')$q$);
    log := log || pg_temp.kt_res(s = 'NULL', 'internal functions are not callable by clients', 'callable: ' || s);

    s := pg_temp.kt_val(format($q$
      select string_agg(t, ', ') from unnest(%L::text[]) t
      where not exists (select 1 from pg_publication_tables p
                        where p.pubname = 'supabase_realtime' and p.schemaname = 'public' and p.tablename = t)$q$,
      all_tables));
    log := log || pg_temp.kt_res(s = 'NULL', 'every table is in the supabase_realtime publication', 'missing: ' || s);

    s := pg_temp.kt_val($q$select public::text from storage.buckets where id = 'recipe-images'$q$);
    log := log || pg_temp.kt_res(s = 'true', 'storage bucket recipe-images exists and is public', s);

    -- -----------------------------------------------------------------------
    step := '1 fake users';
    insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
                            created_at, updated_at)
    select '00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated',
           'kitchen-test-' || u || '@example.test', '{}'::jsonb, '{}'::jsonb, now(), now()
    from unnest(array[u_a, u_b, u_c, u_d]) as u;

    -- -----------------------------------------------------------------------
    step := '2 anon';
    perform pg_temp.kt_as(null, 'anon');
    foreach fn in array all_tables loop
      s := pg_temp.kt_val(format('select count(*) from public.%I', fn));
      log := log || pg_temp.kt_res(s like 'error 42501%' or s = '0', 'anon cannot read ' || fn, s);
    end loop;
    foreach fn in array array[
      'select public.current_household()',
      'select (public.create_household(''KT'')).id',
      'select (public.join_household(''ABCDEFGH'')).id',
      'select public.new_household_code()',
      'select (public.rename_household(''KT'')).id',
      'select public.move_checked_to_pantry()',
      'select public.add_recipe_to_list(gen_random_uuid(), 2)'
    ] loop
      s := pg_temp.kt_val(fn);
      log := log || pg_temp.kt_res(s like 'error 42501%', 'anon cannot call: ' || fn, s);
    end loop;

    perform pg_temp.kt_as(null, 'authenticated');
    s := pg_temp.kt_val('select (public.create_household(''KT'')).id');
    log := log || pg_temp.kt_res(s like '%NOT_SIGNED_IN%', 'role authenticated without a user id gets NOT_SIGNED_IN', s);

    -- -----------------------------------------------------------------------
    step := '3 create and join';
    perform pg_temp.kt_as(u_a);
    s := pg_temp.kt_val('select (public.create_household(''KT kitchen'')).id');
    log := log || pg_temp.kt_res(s !~ '^error', 'A creates a household', s);
    h_a := s::uuid;

    s := pg_temp.kt_val('select count(*) from public.categories');
    log := log || pg_temp.kt_res(s = '17', 'new household has 17 default categories', s);
    s := pg_temp.kt_val('select string_agg(name, '' > '' order by position) from public.categories');
    log := log || pg_temp.kt_res(s like 'Owoce i warzywa > Pieczywo > %Inne', 'categories are in aisle order', s);
    s := pg_temp.kt_val('select string_agg(code, '' '' order by position) from public.units');
    log := log || pg_temp.kt_res(s = 'szt g dag kg ml l opak łyżka łyżeczka szklanka pęczek plaster',
                                 'new household has the 12 default units', s);
    s := pg_temp.kt_val($q$select accent || ' ' || default_servings || ' ' || expiring_soon_days from public.household_settings$q$);
    log := log || pg_temp.kt_res(s = 'matcha 2 7', 'new household has default settings (matcha)', s);
    s := pg_temp.kt_val('select (public.create_household(''Again'')).id');
    log := log || pg_temp.kt_res(s like '%ALREADY_IN_HOUSEHOLD%', 'A cannot create a second household', s);
    code_a := pg_temp.kt_val('select code from public.households');
    cat_baking := pg_temp.kt_val($q$select id from public.categories where name = 'Pieczenie'$q$)::uuid;

    perform pg_temp.kt_as(u_d);
    s := pg_temp.kt_val('select (public.create_household(''   '')).id');
    log := log || pg_temp.kt_res(s like '%BAD_NAME%', 'create_household with a blank name gets BAD_NAME', s);
    s := pg_temp.kt_val('select (public.join_household(''WRONG123'')).id');
    log := log || pg_temp.kt_res(s like '%BAD_CODE%', 'D joining with a wrong code gets BAD_CODE', s);
    s := pg_temp.kt_val('select public.current_household()');
    log := log || pg_temp.kt_res(s = 'NULL', 'D still has no household', s);
    s := pg_temp.kt_exec(format('insert into public.household_members (user_id, household_id) values (%L, %L)', u_d, h_a));
    log := log || pg_temp.kt_res(s like 'error 42501%', 'D cannot add themselves to A''s household directly', s);
    s := pg_temp.kt_val('select count(*) from public.categories');
    log := log || pg_temp.kt_res(s = '0', 'D (no household) sees no rows', s);

    perform pg_temp.kt_as(u_b);
    s := pg_temp.kt_val(format('select (public.join_household(%L)).id', lower(left(code_a, 4) || '-' || right(code_a, 4))));
    log := log || pg_temp.kt_res(s = h_a::text, 'B joins A''s household (code in lower case with a dash)', s);
    s := pg_temp.kt_val(format('select (public.join_household(%L)).id', code_a));
    log := log || pg_temp.kt_res(s = h_a::text, 'joining your own household again is a no-op', s);
    s := pg_temp.kt_val('select count(*) from public.household_members');
    log := log || pg_temp.kt_res(s = '2', 'B sees both members', s);
    s := pg_temp.kt_val('select name from public.households');
    log := log || pg_temp.kt_res(s = 'KT kitchen', 'B sees the household', s);
    s := pg_temp.kt_exec('update public.households set name = ''Hacked''');
    log := log || pg_temp.kt_res(s like 'error 42501%', 'households cannot be written directly', s);
    s := pg_temp.kt_exec('delete from public.household_members');
    log := log || pg_temp.kt_res(s like 'error 42501%', 'household_members cannot be written directly', s);

    perform pg_temp.kt_as(u_c);
    s := pg_temp.kt_val('select (public.create_household(''Other kitchen'')).id');
    log := log || pg_temp.kt_res(s !~ '^error', 'C creates a separate household', s);
    h_c := s::uuid;
    s := pg_temp.kt_val(format('select (public.join_household(%L)).id', code_a));
    log := log || pg_temp.kt_res(s like '%ALREADY_IN_HOUSEHOLD%', 'C cannot join A''s household while in their own', s);
    s := pg_temp.kt_val(format('select count(*) from public.households where id = %L', h_a));
    log := log || pg_temp.kt_res(s = '0', 'C cannot see A''s household', s);
    s := pg_temp.kt_val(format('select count(*) from public.household_members where household_id = %L', h_a));
    log := log || pg_temp.kt_res(s = '0', 'C cannot see A''s members', s);

    -- -----------------------------------------------------------------------
    step := '4 table access';
    perform pg_temp.kt_as(u_a);
    r_fixture := pg_temp.kt_val($q$insert into public.recipes (title) values ('KT fixture recipe') returning id$q$)::uuid;

    for t in
      select * from (values
        ('categories',         'name',                                  $v$'KT category :n'$v$,                                  $v$name = name || ' 2'$v$),
        ('category_rules',     'keyword, category_id',                  $v$'kt keyword :n', (select id from public.categories order by position limit 1)$v$, $v$keyword = keyword || ' 2'$v$),
        ('units',              'code',                                  $v$'kt:n'$v$,                                             'position = position + 1'),
        ('recipes',            'title, meal_type',                      $v$'KT recipe :n', 'dinner'$v$,                           $v$meal_type = 'lunch'$v$),
        ('recipe_ingredients', 'recipe_id, name, amount, unit',         $v$:recipe, 'KT ingredient :n', 100, 'g'$v$,              'amount = amount * 2'),
        ('recipe_steps',       'recipe_id, position, text',             $v$:recipe, 1, 'KT step :n'$v$,                           'position = position + 1'),
        ('shopping_items',     'name, amount, unit',                    $v$'KT item :n', 1, 'szt'$v$,                             'checked = true'),
        ('pantry_items',       'name, best_before, best_before_precision', $v$'KT pantry :n', date '2026-12-31', 'month'$v$,     'low = true')
      ) as v(tbl, cols, vals, upd)
    loop
      step := '4 table access: ' || t.tbl;

      -- A inserts a row; B reads, updates and deletes it.
      perform pg_temp.kt_as(u_a);
      id1 := pg_temp.kt_val(format('insert into public.%I (%s) values (%s) returning id', t.tbl, t.cols,
               replace(replace(t.vals, ':recipe', quote_literal(r_fixture)), ':n', 'a')));
      log := log || pg_temp.kt_res(id1 !~ '^error', t.tbl || ': A inserts without sending household_id', id1);
      continue when id1 ~ '^error';
      s := pg_temp.kt_val(format('select household_id from public.%I where id = %L', t.tbl, id1));
      log := log || pg_temp.kt_res(s = h_a::text, t.tbl || ': household_id defaults to A''s household', s);

      perform pg_temp.kt_as(u_b);
      s := pg_temp.kt_val(format('select count(*) from public.%I where id = %L', t.tbl, id1));
      log := log || pg_temp.kt_res(s = '1', t.tbl || ': B sees A''s row', s);
      s := pg_temp.kt_exec(format('update public.%I set %s where id = %L', t.tbl, t.upd, id1));
      log := log || pg_temp.kt_res(s = 'ok 1', t.tbl || ': B updates A''s row', s);

      -- C (other household) sees and changes nothing.
      perform pg_temp.kt_as(u_c);
      s := pg_temp.kt_val(format('select count(*) from public.%I where household_id = %L', t.tbl, h_a));
      log := log || pg_temp.kt_res(s = '0', t.tbl || ': C sees none of A''s rows', s);
      s := pg_temp.kt_exec(format('update public.%I set %s where id = %L', t.tbl, t.upd, id1));
      log := log || pg_temp.kt_res(s = 'ok 0', t.tbl || ': C cannot update A''s row', s);
      s := pg_temp.kt_exec(format('delete from public.%I where id = %L', t.tbl, id1));
      log := log || pg_temp.kt_res(s = 'ok 0', t.tbl || ': C cannot delete A''s row', s);
      s := pg_temp.kt_exec(format('insert into public.%I (household_id, %s) values (%L, %s)', t.tbl, t.cols, h_a,
             replace(replace(t.vals, ':recipe', quote_literal(r_fixture)), ':n', 'c')));
      log := log || pg_temp.kt_res(s like 'error%', t.tbl || ': C cannot insert into A''s household', s);

      perform pg_temp.kt_as(u_b);
      s := pg_temp.kt_exec(format('delete from public.%I where id = %L', t.tbl, id1));
      log := log || pg_temp.kt_res(s = 'ok 1', t.tbl || ': B deletes A''s row', s);

      -- B inserts a row; A updates and deletes it.
      id2 := pg_temp.kt_val(format('insert into public.%I (%s) values (%s) returning id', t.tbl, t.cols,
               replace(replace(t.vals, ':recipe', quote_literal(r_fixture)), ':n', 'b')));
      log := log || pg_temp.kt_res(id2 !~ '^error', t.tbl || ': B inserts a row', id2);
      continue when id2 ~ '^error';
      perform pg_temp.kt_as(u_a);
      s := pg_temp.kt_exec(format('update public.%I set %s where id = %L', t.tbl, t.upd, id2));
      log := log || pg_temp.kt_res(s = 'ok 1', t.tbl || ': A updates B''s row', s);
      s := pg_temp.kt_exec(format('delete from public.%I where id = %L', t.tbl, id2));
      log := log || pg_temp.kt_res(s = 'ok 1', t.tbl || ': A deletes B''s row', s);
    end loop;

    step := '4 table access: household_settings';
    perform pg_temp.kt_as(u_b);
    s := pg_temp.kt_exec($q$update public.household_settings set expiring_soon_days = 5, accent = 'mint'$q$);
    log := log || pg_temp.kt_res(s = 'ok 1', 'household_settings: B updates the shared row', s);
    perform pg_temp.kt_as(u_a);
    s := pg_temp.kt_val($q$select expiring_soon_days || ' ' || accent from public.household_settings$q$);
    log := log || pg_temp.kt_res(s = '5 mint', 'household_settings: A sees B''s change', s);
    perform pg_temp.kt_as(u_c);
    s := pg_temp.kt_val(format('select count(*) from public.household_settings where household_id = %L', h_a));
    log := log || pg_temp.kt_res(s = '0', 'household_settings: C cannot see A''s settings', s);
    s := pg_temp.kt_exec(format($q$update public.household_settings set accent = 'tomato' where household_id = %L$q$, h_a));
    log := log || pg_temp.kt_res(s = 'ok 0', 'household_settings: C cannot update A''s settings', s);
    s := pg_temp.kt_exec(format('delete from public.household_settings where household_id = %L', h_a));
    log := log || pg_temp.kt_res(s = 'ok 0', 'household_settings: C cannot delete A''s settings', s);
    perform pg_temp.kt_as(u_a);
    s := pg_temp.kt_exec('delete from public.household_settings');
    log := log || pg_temp.kt_res(s = 'ok 1', 'household_settings: A deletes the row', s);
    perform pg_temp.kt_as(u_b);
    s := pg_temp.kt_val('insert into public.household_settings default values returning household_id');
    log := log || pg_temp.kt_res(s = h_a::text, 'household_settings: B inserts it again (household_id defaulted)', s);
    perform pg_temp.kt_as(u_c);
    s := pg_temp.kt_exec(format('insert into public.household_settings (household_id) values (%L)', h_a));
    log := log || pg_temp.kt_res(s like 'error%', 'household_settings: C cannot insert for A''s household', s);

    -- -----------------------------------------------------------------------
    step := '5 cross-household references';
    perform pg_temp.kt_as(u_c);
    s := pg_temp.kt_exec(format($q$insert into public.recipe_ingredients (recipe_id, name) values (%L, 'KT stolen')$q$, r_fixture));
    log := log || pg_temp.kt_res(s like 'error 23503%', 'C cannot add an ingredient to A''s recipe (foreign key)', s);
    s := pg_temp.kt_exec(format($q$insert into public.shopping_items (name, category_id) values ('KT item', %L)$q$, cat_baking));
    log := log || pg_temp.kt_res(s like 'error 23503%', 'C cannot use A''s category (foreign key)', s);
    id1 := pg_temp.kt_val($q$insert into public.shopping_items (name) values ('KT item c') returning id$q$);
    s := pg_temp.kt_exec(format('update public.shopping_items set household_id = %L where id = %L', h_a, id1));
    log := log || pg_temp.kt_res(s like 'error 42501%', 'C cannot move their own row into A''s household', s);

    -- -----------------------------------------------------------------------
    step := '6 invite code and name';
    perform pg_temp.kt_as(u_b);
    code_new := pg_temp.kt_val('select public.new_household_code()');
    log := log || pg_temp.kt_res(code_new ~ '^[A-Z0-9]{8}$' and code_new <> code_a, 'B makes a new invite code', code_new);
    perform pg_temp.kt_as(u_d);
    s := pg_temp.kt_val(format('select (public.join_household(%L)).id', code_a));
    log := log || pg_temp.kt_res(s like '%BAD_CODE%', 'the old code no longer works', s);
    perform pg_temp.kt_as(u_b);
    s := pg_temp.kt_val('select (public.rename_household(''KT kitchen renamed'')).name');
    log := log || pg_temp.kt_res(s = 'KT kitchen renamed', 'B renames the household', s);
    s := pg_temp.kt_val('select (public.rename_household('''')).name');
    log := log || pg_temp.kt_res(s like '%BAD_NAME%', 'rename to an empty name gets BAD_NAME', s);
    perform pg_temp.kt_as(u_c);
    s := pg_temp.kt_val('select public.new_household_code()');
    s := pg_temp.kt_val('select (public.rename_household(''C renamed'')).name');
    perform pg_temp.kt_as(u_a);
    s := pg_temp.kt_val('select name || '' '' || code from public.households');
    log := log || pg_temp.kt_res(s = 'KT kitchen renamed ' || code_new,
                                 'A sees B''s rename and code; C''s RPCs did not touch A''s household', s);
    s := pg_temp.kt_val('select (public.rename_household(''KT kitchen'')).name');
    log := log || pg_temp.kt_res(s = 'KT kitchen', 'A renames the household back', s);

    -- -----------------------------------------------------------------------
    step := '7 move_checked_to_pantry';
    perform pg_temp.kt_as(u_a);
    s := pg_temp.kt_exec($q$insert into public.pantry_items (name, amount, unit, low) values ('Mleko', 1, 'l', true)$q$);
    log := log || pg_temp.kt_res(s = 'ok 1', 'setup: A adds Mleko 1 l (low) to the pantry', s);
    perform pg_temp.kt_as(u_b);
    s := pg_temp.kt_exec($q$insert into public.shopping_items (name, amount, unit, checked) values
                            (' mleko', 2, 'l', true), ('Chleb', null, null, true), ('Masło', 1, 'szt', false)$q$);
    log := log || pg_temp.kt_res(s = 'ok 3', 'setup: B adds 2 ticked items and 1 unticked to the list', s);
    s := pg_temp.kt_val($q$select (checked_at is not null)::text from public.shopping_items where name = 'Chleb'$q$);
    log := log || pg_temp.kt_res(s = 'true', 'checked_at is set when an item is ticked', s);

    perform pg_temp.kt_as(u_c);
    s := pg_temp.kt_val('select public.move_checked_to_pantry()');
    log := log || pg_temp.kt_res(s = '0', 'C''s move_checked_to_pantry moves nothing of A''s', s);
    perform pg_temp.kt_as(u_d);
    s := pg_temp.kt_val('select public.move_checked_to_pantry()');
    log := log || pg_temp.kt_res(s like '%NO_HOUSEHOLD%', 'without a household: NO_HOUSEHOLD', s);

    perform pg_temp.kt_as(u_a);
    s := pg_temp.kt_val('select public.move_checked_to_pantry()');
    log := log || pg_temp.kt_res(s = '2', 'A moves B''s 2 ticked items to the pantry', s);
    perform pg_temp.kt_as(u_b);
    s := pg_temp.kt_val($q$select (count(*) = 1 and sum(amount) = 3 and max(unit) = 'l' and not bool_or(low))::text
                             || ' ' || string_agg(name || ' ' || amount || ' ' || unit || ' low=' || low, '; ')
                           from public.pantry_items where name_key = 'mleko'$q$);
    log := log || pg_temp.kt_res(s like 'true%', 'Mleko merged into one pantry item: 3 l, not low', s);
    s := pg_temp.kt_val($q$select count(*) from public.pantry_items where name_key = 'chleb'$q$);
    log := log || pg_temp.kt_res(s = '1', 'Chleb added to the pantry', s);
    s := pg_temp.kt_val('select string_agg(name, '', '') from public.shopping_items');
    log := log || pg_temp.kt_res(s = 'Masło', 'ticked items left the list, the unticked one stayed', s);

    -- -----------------------------------------------------------------------
    step := '8 add_recipe_to_list';
    perform pg_temp.kt_as(u_b);
    r_pancakes := pg_temp.kt_val($q$insert into public.recipes (title, meal_type, servings)
                                    values ('KT pancakes', 'breakfast', 2) returning id$q$)::uuid;
    s := pg_temp.kt_exec(format($q$insert into public.recipe_ingredients (recipe_id, position, name, amount, unit) values
                                   (%1$L, 1, 'Mąka', 200, 'g'), (%1$L, 2, 'Mleko', 0.5, 'l'),
                                   (%1$L, 3, 'Jajka', 2, 'szt'), (%1$L, 4, 'Sól', null, null)$q$, r_pancakes));
    log := log || pg_temp.kt_res(s = 'ok 4', 'setup: B adds a recipe with 4 ingredients', s);
    perform pg_temp.kt_as(u_a);
    s := pg_temp.kt_exec(format($q$insert into public.category_rules (keyword, category_id) values ('mąka', %L)$q$, cat_baking));
    log := log || pg_temp.kt_res(s = 'ok 1', 'setup: A adds a rule mąka -> Pieczenie', s);
    s := pg_temp.kt_exec($q$insert into public.shopping_items (name, amount, unit) values ('Jajka', 1, 'szt')$q$);
    log := log || pg_temp.kt_res(s = 'ok 1', 'setup: A puts Jajka 1 szt on the list', s);

    s := pg_temp.kt_val(format('select public.add_recipe_to_list(%L, 4)::text', r_pancakes));
    log := log || pg_temp.kt_res(case when s like '{%' then s::jsonb = '{"added": 2, "merged": 1, "skipped": 1}'::jsonb else false end,
                                 'A adds B''s recipe for 4: Mleko skipped (in pantry), Jajka merged', s);
    perform pg_temp.kt_as(u_b);
    s := pg_temp.kt_val(format($q$select (count(*) = 1 and bool_and(amount = 400 and unit = 'g' and recipe_id = %L and category_id = %L))::text
                                    || ' ' || string_agg(name || ' ' || coalesce(amount::text, '-') || ' ' || coalesce(unit, '-'), '; ')
                                  from public.shopping_items where name_key = 'mąka'$q$, r_pancakes, cat_baking));
    log := log || pg_temp.kt_res(s like 'true%', 'Mąka added: 400 g (scaled x2), with recipe and category from the rule', s);
    s := pg_temp.kt_val($q$select (count(*) = 1 and sum(amount) = 5)::text || ' ' || string_agg(name || ' ' || amount, '; ')
                           from public.shopping_items where name_key = 'jajka'$q$);
    log := log || pg_temp.kt_res(s like 'true%', 'Jajka merged into the existing item: 1 + 4 = 5', s);
    s := pg_temp.kt_val($q$select (count(*) = 1 and bool_and(amount is null))::text from public.shopping_items where name_key = 'sól'$q$);
    log := log || pg_temp.kt_res(s = 'true', 'Sól added without an amount', s);
    s := pg_temp.kt_val($q$select count(*) from public.shopping_items where name_key = 'mleko'$q$);
    log := log || pg_temp.kt_res(s = '0', 'Mleko not added (the pantry has it)', s);

    perform pg_temp.kt_as(u_a);
    s := pg_temp.kt_exec($q$update public.pantry_items set low = true where name_key = 'mleko'$q$);
    perform pg_temp.kt_as(u_b);
    s := pg_temp.kt_val(format('select public.add_recipe_to_list(%L)::text', r_pancakes));
    log := log || pg_temp.kt_res(case when s like '{%' then s::jsonb = '{"added": 1, "merged": 3, "skipped": 0}'::jsonb else false end,
                                 'B adds it again at default servings: low Mleko now added, the rest merged', s);
    s := pg_temp.kt_val($q$select (sum(amount) filter (where name_key = 'mąka') = 600
                                and sum(amount) filter (where name_key = 'jajka') = 7
                                and sum(amount) filter (where name_key = 'mleko') = 0.5
                                and count(*) filter (where name_key = 'sól') = 1)::text
                             || ' ' || string_agg(name || ' ' || coalesce(amount::text, '-'), '; ' order by name)
                           from public.shopping_items$q$);
    log := log || pg_temp.kt_res(s like 'true%', 'list now: Mąka 600, Jajka 7, Mleko 0.5, Sól', s);

    perform pg_temp.kt_as(u_a);
    s := pg_temp.kt_val(format('select public.add_recipe_to_list(%L, 0)::text', r_pancakes));
    log := log || pg_temp.kt_res(s like '%BAD_SERVINGS%', 'servings 0 gets BAD_SERVINGS', s);
    perform pg_temp.kt_as(u_c);
    s := pg_temp.kt_val(format('select public.add_recipe_to_list(%L, 2)::text', r_pancakes));
    log := log || pg_temp.kt_res(s like '%NOT_FOUND%', 'C cannot add A''s recipe to a list: NOT_FOUND', s);

    -- -----------------------------------------------------------------------
    step := '9 storage';
    -- Lets a direct DELETE on storage.objects through Supabase's guard trigger
    -- (newer storage versions block SQL deletes unless this is set); policies
    -- still apply. Harmless where the guard does not exist.
    perform set_config('storage.allow_delete_query', 'true', true);
    perform pg_temp.kt_as(u_a);
    s := pg_temp.kt_exec(format($q$insert into storage.objects (bucket_id, name) values ('recipe-images', %L)$q$, h_a || '/kt-a.jpg'));
    log := log || pg_temp.kt_res(s = 'ok 1', 'storage: A uploads into the household folder', s);
    s := pg_temp.kt_exec(format($q$insert into storage.objects (bucket_id, name) values ('recipe-images', %L)$q$, u_a || '/kt-user.jpg'));
    log := log || pg_temp.kt_res(s like 'error 42501%', 'storage: uploads outside the household folder are refused', s);
    perform pg_temp.kt_as(u_b);
    s := pg_temp.kt_val(format($q$select count(*) from storage.objects where bucket_id = 'recipe-images' and name = %L$q$, h_a || '/kt-a.jpg'));
    log := log || pg_temp.kt_res(s = '1', 'storage: B sees A''s file', s);
    s := pg_temp.kt_exec(format($q$insert into storage.objects (bucket_id, name) values ('recipe-images', %L)$q$, h_a || '/kt-b.jpg'));
    log := log || pg_temp.kt_res(s = 'ok 1', 'storage: B uploads into the household folder', s);
    perform pg_temp.kt_as(u_c);
    s := pg_temp.kt_val(format($q$select count(*) from storage.objects where bucket_id = 'recipe-images' and name like %L$q$, h_a || '/%'));
    log := log || pg_temp.kt_res(s = '0', 'storage: C cannot list A''s household folder', s);
    s := pg_temp.kt_exec(format($q$insert into storage.objects (bucket_id, name) values ('recipe-images', %L)$q$, h_a || '/kt-c.jpg'));
    log := log || pg_temp.kt_res(s like 'error 42501%', 'storage: C cannot upload into A''s household folder', s);
    s := pg_temp.kt_exec(format($q$update storage.objects set metadata = '{}'::jsonb where bucket_id = 'recipe-images' and name = %L$q$, h_a || '/kt-a.jpg'));
    log := log || pg_temp.kt_res(s = 'ok 0', 'storage: C cannot change A''s file', s);
    s := pg_temp.kt_exec(format($q$delete from storage.objects where bucket_id = 'recipe-images' and name = %L$q$, h_a || '/kt-a.jpg'));
    log := log || pg_temp.kt_res(s = 'ok 0', 'storage: C cannot delete A''s file', s);
    perform pg_temp.kt_as(null, 'anon');
    s := pg_temp.kt_exec(format($q$insert into storage.objects (bucket_id, name) values ('recipe-images', %L)$q$, h_a || '/kt-anon.jpg'));
    log := log || pg_temp.kt_res(s like 'error 42501%', 'storage: anon cannot upload', s);
    s := pg_temp.kt_exec(format($q$delete from storage.objects where bucket_id = 'recipe-images' and name = %L$q$, h_a || '/kt-a.jpg'));
    log := log || pg_temp.kt_res(s like 'error 42501%' or s = 'ok 0', 'storage: anon cannot delete', s);
    perform pg_temp.kt_as(u_b);
    s := pg_temp.kt_exec(format($q$delete from storage.objects where bucket_id = 'recipe-images' and name = %L$q$, h_a || '/kt-a.jpg'));
    log := log || pg_temp.kt_res(s = 'ok 1', 'storage: B deletes A''s file', s);

    -- -----------------------------------------------------------------------
    step := 'done';
    perform pg_temp.kt_admin();
    raise exception using errcode = 'KT001', message = 'roll back all test data';
  exception
    when sqlstate 'KT001' then
      null;   -- expected: everything above is rolled back
    when others then
      log := log || pg_temp.kt_res(false, 'test run stopped early at step: ' || step, sqlstate || ' ' || sqlerrm);
  end;

  perform pg_temp.kt_admin();

  return query
    select 0,
           case when count(*) filter (where e->>'result' = 'FAIL') = 0 then 'PASS' else 'FAIL' end,
           'SUMMARY',
           format('%s passed, %s failed', count(*) filter (where e->>'result' = 'PASS'),
                                           count(*) filter (where e->>'result' = 'FAIL'))
    from jsonb_array_elements(log) as e
    union all
    select x.i::integer, x.e->>'result', x.e->>'test', x.e->>'detail'
    from jsonb_array_elements(log) with ordinality as x(e, i)
    order by 1;
end $$;

select * from pg_temp.kt_run();
