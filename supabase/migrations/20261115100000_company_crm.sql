alter table public.crm_organizations
  add column if not exists industry text,
  add column if not exists phone text,
  add column if not exists address text;

create table if not exists public.crm_deals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crm_organizations(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  amount numeric(16,2) check (amount >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  stage text not null default 'open' check (stage in ('open', 'negotiating', 'won', 'lost')),
  expected_close date,
  notes text,
  owner_id text references public.profiles(id) on delete set null,
  created_by text not null default auth.uid()::text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists crm_deals_company_idx on public.crm_deals(organization_id, created_at desc);
drop trigger if exists crm_deals_touch on public.crm_deals;
create trigger crm_deals_touch before update on public.crm_deals
  for each row execute function public.crm_touch_updated_at();
alter table public.crm_deals enable row level security;
grant select, insert, update, delete on public.crm_deals to authenticated;

drop policy if exists "CRM deals read" on public.crm_deals;
create policy "CRM deals read" on public.crm_deals for select to authenticated
  using (public.has_app_access('customers', 'view'));
drop policy if exists "CRM deals create" on public.crm_deals;
create policy "CRM deals create" on public.crm_deals for insert to authenticated
  with check (public.has_app_access('customers', 'edit') and created_by = auth.uid()::text);
drop policy if exists "CRM deals edit" on public.crm_deals;
create policy "CRM deals edit" on public.crm_deals for update to authenticated
  using (public.has_app_access('customers', 'edit') and
    (created_by = auth.uid()::text or owner_id = auth.uid()::text or public.has_app_access('customers', 'manage')))
  with check (public.has_app_access('customers', 'edit'));
drop policy if exists "CRM deals delete" on public.crm_deals;
create policy "CRM deals delete" on public.crm_deals for delete to authenticated
  using (public.has_app_access('customers', 'manage') or
    (public.has_app_access('customers', 'edit') and created_by = auth.uid()::text));

notify pgrst, 'reload schema';
