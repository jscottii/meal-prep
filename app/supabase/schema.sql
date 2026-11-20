-- Meal Prep Shopper — Supabase schema
-- Every row belongs to a household; you only see your own household's rows (row level security).

create table if not exists households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Our household',
  created_at timestamptz not null default now()
);

create table if not exists members (
  user_id uuid primary key references auth.users on delete cascade,
  household_id uuid not null references households on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

-- someone invited by email joins that household on first sign-in
create table if not exists invites (
  email text primary key,
  household_id uuid not null references households on delete cascade,
  invited_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now()
);

create or replace function my_household() returns uuid
language sql stable security definer set search_path = public as $$
  select household_id from members where user_id = auth.uid()
$$;

-- First sign-in: join the household you were invited to, or start a new one.
-- Returns { household_id, created } — created = true means the app should load starter data.
create or replace function ensure_household() returns json
language plpgsql security definer set search_path = public as $$
declare hid uuid; em text; inv uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select household_id into hid from members where user_id = auth.uid();
  if hid is not null then return json_build_object('household_id', hid, 'created', false); end if;
  select lower(email) into em from auth.users where id = auth.uid();
  select household_id into inv from invites where lower(email) = em;
  if inv is not null then
    insert into members(user_id, household_id, email) values (auth.uid(), inv, em);
    delete from invites where lower(email) = em;
    return json_build_object('household_id', inv, 'created', false);
  end if;
  insert into households default values returning id into hid;
  insert into members(user_id, household_id, email) values (auth.uid(), hid, em);
  return json_build_object('household_id', hid, 'created', true);
end $$;

create table if not exists settings (
  household_id uuid primary key references households on delete cascade default my_household(),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists stores (
  household_id uuid not null references households on delete cascade default my_household(),
  id text not null,
  name text, short text, address text, source text, merchant text, hours text, ad text,
  bulk boolean not null default false, enabled boolean not null default true, sort int not null default 0,
  primary key (household_id, id)
);

create table if not exists items (
  household_id uuid not null references households on delete cascade default my_household(),
  id text not null,
  cat text, name text, qty text, q text, must text[] not null default '{}', units numeric not null default 1,
  have_on date,
  primary key (household_id, id)
);

create table if not exists prices (
  household_id uuid not null references households on delete cascade default my_household(),
  item_id text not null, store_id text not null,
  price numeric, unit_price numeric, unit_needed numeric,
  source text, matched text, updated_at timestamptz default now(), checked_at timestamptz,
  locked boolean not null default false, not_found_on date,
  primary key (household_id, item_id, store_id)
);

create table if not exists recipes (
  household_id uuid not null references households on delete cascade default my_household(),
  id text not null,
  title text not null, active boolean not null default false, servings numeric, yield text, meal text,
  fridge text, "freeze" text, ing text[] not null default '{}', steps text[] not null default '{}', tip text,
  custom boolean not null default false, source text, items jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (household_id, id)
);

create table if not exists week_plan (
  household_id uuid primary key references households on delete cascade default my_household(),
  data jsonb not null default '{"days":[]}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists purchases (
  id bigint generated always as identity primary key,
  household_id uuid not null references households on delete cascade default my_household(),
  day date not null default current_date,
  store_id text, store text, item_id text, item text,
  planned numeric, paid numeric, status text, receipt_line text,
  created_at timestamptz not null default now()
);
create index if not exists purchases_household_day on purchases(household_id, day desc);

-- SerpApi key: members can write it, nobody can read it back (only the server function can)
create table if not exists household_secrets (
  household_id uuid primary key references households on delete cascade default my_household(),
  serpapi_key text,
  updated_at timestamptz not null default now()
);

create table if not exists serp_usage (
  household_id uuid not null references households on delete cascade,
  month text not null,
  n int not null default 0,
  primary key (household_id, month)
);

-- Store locations found on the map are shared by everyone (they're public places)
create table if not exists store_locations (
  chain text not null, name text, label text, lat double precision not null, lng double precision not null,
  source text default 'OpenStreetMap', created_at timestamptz not null default now(),
  primary key (chain, lat, lng)
);
create table if not exists store_areas (
  cell text primary key, searched_at timestamptz not null default now(), found int not null default 0
);

-- ---------------- row level security ----------------
alter table households enable row level security;
alter table members enable row level security;
alter table invites enable row level security;
alter table settings enable row level security;
alter table stores enable row level security;
alter table items enable row level security;
alter table prices enable row level security;
alter table recipes enable row level security;
alter table week_plan enable row level security;
alter table purchases enable row level security;
alter table household_secrets enable row level security;
alter table serp_usage enable row level security;
alter table store_locations enable row level security;
alter table store_areas enable row level security;

drop policy if exists "own household" on households;
create policy "own household" on households for all using (id = my_household()) with check (id = my_household());
drop policy if exists "see household members" on members;
create policy "see household members" on members for select using (household_id = my_household());
drop policy if exists "manage invites" on invites;
create policy "manage invites" on invites for all using (household_id = my_household()) with check (household_id = my_household());

do $$
declare t text;
begin
  foreach t in array array['settings','stores','items','prices','recipes','week_plan','purchases'] loop
    execute format('drop policy if exists "household rows" on %I', t);
    execute format('create policy "household rows" on %I for all using (household_id = my_household()) with check (household_id = my_household())', t);
  end loop;
end $$;

drop policy if exists "write own secret" on household_secrets;
create policy "write own secret" on household_secrets for insert with check (household_id = my_household());
drop policy if exists "update own secret" on household_secrets;
create policy "update own secret" on household_secrets for update using (household_id = my_household()) with check (household_id = my_household());
drop policy if exists "see own usage" on serp_usage;
create policy "see own usage" on serp_usage for select using (household_id = my_household());

drop policy if exists "read locations" on store_locations;
create policy "read locations" on store_locations for select to authenticated using (true);
drop policy if exists "add locations" on store_locations;
create policy "add locations" on store_locations for insert to authenticated with check (true);
drop policy if exists "read areas" on store_areas;
create policy "read areas" on store_areas for select to authenticated using (true);
drop policy if exists "add areas" on store_areas;
create policy "add areas" on store_areas for insert to authenticated with check (true);
drop policy if exists "update areas" on store_areas;
create policy "update areas" on store_areas for update to authenticated using (true) with check (true);

-- does this household have a SerpApi key saved? (without revealing it)
create or replace function has_serp_key() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from household_secrets where household_id = my_household() and coalesce(serpapi_key,'') <> '')
$$;

-- save the SerpApi key without ever reading it back
create or replace function set_serp_key(k text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if my_household() is null then raise exception 'no household'; end if;
  insert into household_secrets(household_id, serpapi_key, updated_at) values (my_household(), k, now())
  on conflict (household_id) do update set serpapi_key = excluded.serpapi_key, updated_at = now();
end $$;

-- ---------------- live sync between phones ----------------
do $$
declare t text;
begin
  foreach t in array array['items','prices','recipes','week_plan','purchases','settings','stores'] loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ---------------- table access for signed-in users (row level security still applies) ----------------
grant usage on schema public to authenticated;
grant select, insert, update, delete on households, members, invites, settings, stores, items, prices, recipes, week_plan, purchases to authenticated;
grant select on serp_usage to authenticated;
grant select, insert on store_locations to authenticated;
grant select, insert, update on store_areas to authenticated;
grant usage on all sequences in schema public to authenticated;
grant execute on function my_household(), ensure_household(), has_serp_key(), set_serp_key(text) to authenticated;
-- TRUNCATE ignores row level security, so nobody but the owner gets it
revoke truncate, trigger, references on all tables in schema public from authenticated, anon;
alter default privileges in schema public revoke truncate, trigger, references on tables from authenticated, anon;

-- ---------------- pantry: what's on hand ----------------
create table if not exists pantry (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households on delete cascade default my_household(),
  item_id text,
  name text not null,
  amount text,
  level text not null default 'plenty',
  place text not null default 'pantry',
  added_on date not null default current_date,
  use_by date
);
create index if not exists pantry_household on pantry(household_id);
alter table pantry enable row level security;
drop policy if exists "household rows" on pantry;
create policy "household rows" on pantry for all using (household_id = my_household()) with check (household_id = my_household());
grant select, insert, update, delete on pantry to authenticated;
alter table pantry replica identity full;
do $$ begin
  alter publication supabase_realtime add table pantry;
exception when duplicate_object then null; end $$;
