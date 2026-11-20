-- a project cart remembers its own cook-day progress and kitchen setup
alter table carts add column if not exists meta jsonb not null default '{}'::jsonb;
