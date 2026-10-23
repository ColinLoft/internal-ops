alter table public.profiles
  add column if not exists account_status text not null default 'active'
    check (account_status in ('active', 'suspended')),
  add column if not exists suspended_until timestamptz;

create index if not exists profiles_suspended_until_idx
  on public.profiles (suspended_until)
  where account_status = 'suspended' and suspended_until is not null;
