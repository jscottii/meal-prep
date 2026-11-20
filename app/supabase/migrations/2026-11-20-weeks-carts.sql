-- Upcoming weeks: one row each, so saving this week's plan (or a checkmark) can never wipe them.
create table if not exists upcoming_weeks (
  household_id uuid not null references households on delete cascade default my_household(),
  start date not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (household_id, start)
);
-- bring over any weeks that were stored inside the weekly plan
insert into upcoming_weeks(household_id, start, data)
select w.household_id, (x->>'start')::date, x from week_plan w, jsonb_array_elements(coalesce(w.data->'weeks', '[]'::jsonb)) x
on conflict do nothing;

-- What you actually put in the cart: amount, unit and price per unit
alter table purchases add column if not exists qty numeric;
alter table purchases add column if not exists unit text;
alter table purchases add column if not exists unit_price numeric;

-- Carts for projects and one-off meals (a party, Thanksgiving, chili for 40)
create table if not exists carts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households on delete cascade default my_household(),
  name text not null,
  people int,
  event_date date,
  budget numeric,
  recipes jsonb not null default '[]'::jsonb,   -- [{ id, portions }]
  lines jsonb not null default '[]'::jsonb,     -- [{ key, item_id, name, qty, unit, unit_price, total, done, store, recipe }]
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ declare t text; begin
  foreach t in array array['upcoming_weeks','carts'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "household rows" on %I', t);
    execute format('create policy "household rows" on %I for all using (household_id = my_household()) with check (household_id = my_household())', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
    execute format('revoke truncate, trigger, references on %I from authenticated, anon', t);
    execute format('alter table %I replica identity full', t);
    begin execute format('alter publication supabase_realtime add table %I', t); exception when duplicate_object then null; end;
  end loop;
end $$;

-- recipes remember their cuisine and where they came from
alter table recipes add column if not exists cuisine text;
