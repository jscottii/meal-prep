-- Home codes: share a short code or link and people join your household with it.
alter table households add column if not exists join_code text unique;

-- 6 characters, no look-alikes (no 0/O, 1/I/L)
create or replace function new_join_code() returns text
language plpgsql as $$
declare a text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; c text; begin
  loop
    c := '';
    for i in 1..6 loop c := c || substr(a, 1 + floor(random() * length(a))::int, 1); end loop;
    exit when not exists (select 1 from households where join_code = c);
  end loop;
  return c;
end $$;

-- your current household's code (made the first time you ask)
create or replace function get_join_code() returns text
language plpgsql security definer set search_path = public as $$
declare hid uuid := my_household(); c text; begin
  if hid is null then raise exception 'no household'; end if;
  select join_code into c from households where id = hid;
  if c is null then c := new_join_code(); update households set join_code = c where id = hid; end if;
  return c;
end $$;

-- a new code; the old one stops working
create or replace function reset_join_code() returns text
language plpgsql security definer set search_path = public as $$
declare hid uuid := my_household(); c text; begin
  if hid is null then raise exception 'no household'; end if;
  c := new_join_code(); update households set join_code = c where id = hid;
  return c;
end $$;

-- which household a code belongs to (shown before you join)
create or replace function peek_join_code(code text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('name', h.name, 'members', (select count(*) from members m where m.household_id = h.id),
    'already', exists (select 1 from members m where m.household_id = h.id and m.user_id = auth.uid()))
  from households h where h.join_code = right(upper(regexp_replace(code, '[^A-Za-z0-9]', '', 'g')), 6)
$$;

create or replace function join_with_code(code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare hid uuid; em text; begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select id into hid from households where join_code = right(upper(regexp_replace(code, '[^A-Za-z0-9]', '', 'g')), 6);
  if hid is null then raise exception 'That code doesn''t match a household. Check it, or ask for a new one.'; end if;
  if not exists (select 1 from members where user_id = auth.uid() and household_id = hid) then
    select lower(email) into em from auth.users where id = auth.uid();
    insert into members(user_id, household_id, email) values (auth.uid(), hid, em);  -- the 5-household limit applies here
    delete from invites where household_id = hid and lower(email) = em;
  end if;
  perform set_current(hid);
  return hid;
end $$;

revoke execute on function new_join_code() from public, anon, authenticated;
grant execute on function get_join_code(), reset_join_code(), peek_join_code(text), join_with_code(text) to authenticated;
