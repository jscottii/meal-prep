-- WFD Plus (ad-free). One row per person; written only by the server (Stripe webhook / store receipts).
create table if not exists entitlements (
  user_id uuid primary key references auth.users on delete cascade,
  plus boolean not null default false,
  source text,                 -- 'stripe' | 'app_store' | 'play' | 'gift'
  stripe_customer text,
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table entitlements enable row level security;
drop policy if exists "read own entitlement" on entitlements;
create policy "read own entitlement" on entitlements for select using (user_id = auth.uid());
grant select on entitlements to authenticated;
revoke insert, update, delete, truncate on entitlements from authenticated, anon;
