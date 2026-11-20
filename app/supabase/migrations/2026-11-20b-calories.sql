-- recipes can carry calories per serving (from the recipe page, when listed)
alter table recipes add column if not exists calories numeric;
