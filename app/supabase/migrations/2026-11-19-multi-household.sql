-- People can belong to up to 5 households; one is "current" and everything in the app shows that one.

-- membership: one row per person per household
alter table members drop constraint if exists members_pkey;
alter table members add primary key (user_id, household_id);

-- which household you're looking at right now
create table if not exists user_prefs (
  user_id uuid primary key references auth.users on delete cascade,
  current_household uuid references households on delete set null
);
alter table user_prefs enable row level security;
drop policy if exists "own prefs" on user_prefs;
create policy "own prefs" on user_prefs for all using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update on user_prefs to authenticated;
insert into user_prefs(user_id, current_household) select user_id, household_id from members on conflict (user_id) do nothing;

-- the current household (if you're still a member of it), else your first one
create or replace function my_household() returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select p.current_household from user_prefs p join members m on m.user_id = p.user_id and m.household_id = p.current_household where p.user_id = auth.uid()),
    (select household_id from members where user_id = auth.uid() order by created_at limit 1))
$$;

-- at most 5 households each
create or replace function members_limit() returns trigger language plpgsql as $$
begin
  if (select count(*) from members where user_id = new.user_id) >= 5 then
    raise exception 'You can be in up to 5 households. Leave one first.';
  end if;
  return new;
end $$;
drop trigger if exists members_limit on members;
create trigger members_limit before insert on members for each row execute function members_limit();

-- several households can invite the same email
alter table invites drop constraint if exists invites_pkey;
alter table invites add primary key (email, household_id);

create or replace function set_current(hid uuid) returns void
language sql security definer set search_path = public as $$
  insert into user_prefs(user_id, current_household) values (auth.uid(), hid)
  on conflict (user_id) do update set current_household = excluded.current_household
$$;

-- first sign-in: join the household that invited you, or start your own
create or replace function ensure_household() returns json
language plpgsql security definer set search_path = public as $$
declare hid uuid; em text; inv uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  hid := my_household();
  if hid is not null then
    insert into user_prefs(user_id, current_household) values (auth.uid(), hid) on conflict (user_id) do nothing;
    return json_build_object('household_id', hid, 'created', false);
  end if;
  select lower(email) into em from auth.users where id = auth.uid();
  select household_id into inv from invites where lower(email) = em order by created_at limit 1;
  if inv is not null then
    insert into members(user_id, household_id, email) values (auth.uid(), inv, em);
    delete from invites where lower(email) = em and household_id = inv;
    perform set_current(inv);
    return json_build_object('household_id', inv, 'created', false);
  end if;
  insert into households default values returning id into hid;
  insert into members(user_id, household_id, email) values (auth.uid(), hid, em);
  perform set_current(hid);
  return json_build_object('household_id', hid, 'created', true);
end $$;

-- your households, with the current one marked
create or replace function list_households() returns table(id uuid, name text, members int, is_current boolean)
language sql stable security definer set search_path = public as $$
  select h.id, h.name, (select count(*)::int from members m2 where m2.household_id = h.id), h.id = my_household()
  from households h join members m on m.household_id = h.id and m.user_id = auth.uid()
  order by m.created_at
$$;

-- invites waiting for you from households you're not in yet
create or replace function my_invites() returns table(household_id uuid, name text, invited_by text)
language sql stable security definer set search_path = public as $$
  select i.household_id, h.name, (select email from members where user_id = i.invited_by limit 1)
  from invites i join households h on h.id = i.household_id
  where lower(i.email) = (select lower(email) from auth.users where id = auth.uid())
    and not exists (select 1 from members m where m.user_id = auth.uid() and m.household_id = i.household_id)
$$;

create or replace function switch_household(hid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from members where user_id = auth.uid() and household_id = hid) then raise exception 'You''re not in that household.'; end if;
  perform set_current(hid);
end $$;

create or replace function create_household(nm text) returns json
language plpgsql security definer set search_path = public as $$
declare hid uuid; em text;
begin
  if (select count(*) from members where user_id = auth.uid()) >= 5 then raise exception 'You can be in up to 5 households. Leave one first.'; end if;
  select lower(email) into em from auth.users where id = auth.uid();
  insert into households(name) values (coalesce(nullif(trim(nm), ''), 'New household')) returning id into hid;
  insert into members(user_id, household_id, email) values (auth.uid(), hid, em);
  perform set_current(hid);
  return json_build_object('household_id', hid, 'created', true);
end $$;

create or replace function accept_invite(hid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare em text;
begin
  select lower(email) into em from auth.users where id = auth.uid();
  if not exists (select 1 from invites where lower(email) = em and household_id = hid) then raise exception 'That invite is gone.'; end if;
  insert into members(user_id, household_id, email) values (auth.uid(), hid, em);
  delete from invites where lower(email) = em and household_id = hid;
  perform set_current(hid);
end $$;

create or replace function decline_invite(hid uuid) returns void
language sql security definer set search_path = public as $$
  delete from invites where household_id = hid and lower(email) = (select lower(email) from auth.users where id = auth.uid())
$$;

-- leave a household; the last one out deletes it. You must keep at least one.
create or replace function leave_household(hid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from members where user_id = auth.uid()) <= 1 then raise exception 'You need at least one household. Create or join another first.'; end if;
  delete from members where user_id = auth.uid() and household_id = hid;
  if not exists (select 1 from members where household_id = hid) then delete from households where id = hid; end if;
  update user_prefs set current_household = (select household_id from members where user_id = auth.uid() order by created_at limit 1)
    where user_id = auth.uid() and (current_household = hid or current_household is null);
end $$;

grant execute on function list_households(), my_invites(), switch_household(uuid), create_household(text), accept_invite(uuid), decline_invite(uuid), leave_household(uuid) to authenticated;
revoke execute on function set_current(uuid) from public, anon, authenticated;
