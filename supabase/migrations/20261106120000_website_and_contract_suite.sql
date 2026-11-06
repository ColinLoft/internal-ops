create table if not exists public.website_content (
  id uuid primary key default gen_random_uuid(),
  content_type text not null check (content_type in ('policy', 'support_doc')),
  slug text not null,
  title text not null,
  summary text not null default '',
  body text not null default '',
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  updated_by text references public.profiles(id) on delete set null,
  created_by text not null default auth.uid()::text references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  unique (content_type, slug)
);

create table if not exists public.website_content_revisions (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.website_content(id) on delete cascade,
  title text not null,
  summary text not null,
  body text not null,
  status text not null,
  changed_by text references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.website_settings (
  id boolean primary key default true check (id),
  public_site_url text not null default '',
  analytics_provider text not null default 'not_connected'
    check (analytics_provider in ('not_connected', 'vercel', 'google_analytics', 'plausible', 'other')),
  analytics_dashboard_url text not null default '',
  updated_by text references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.website_settings (id) values (true) on conflict (id) do nothing;

-- Preserve existing policy summaries as drafts; legal text must be reviewed before publication.
insert into public.website_content (content_type, slug, title, summary, body, status, created_by)
select
  'policy',
  'legacy-' || id::text,
  name,
  coalesce(description, ''),
  coalesce(description, ''),
  'draft',
  created_by
from public.legal_records
where record_type in ('policy', 'policies')
on conflict (content_type, slug) do nothing;

create or replace function public.website_content_before_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    insert into public.website_content_revisions (content_id, title, summary, body, status, changed_by)
    values (old.id, old.title, old.summary, old.body, old.status, auth.uid()::text);
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid()::text;
  if new.status = 'published' and (tg_op = 'INSERT' or old.status <> 'published') then
    new.published_at := now();
  elsif new.status <> 'published' then
    new.published_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists website_content_before_update on public.website_content;
create trigger website_content_before_update before insert or update on public.website_content
for each row execute function public.website_content_before_update();

create table if not exists public.customer_contracts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.crm_organizations(id) on delete set null,
  contact_id uuid references public.crm_contacts(id) on delete set null,
  name text not null,
  contract_type text not null default 'other'
    check (contract_type in ('service', 'partnership', 'grant', 'nda', 'vendor', 'other')),
  description text not null default '',
  status text not null default 'draft'
    check (status in ('draft', 'pending_signature', 'active', 'renewal_due', 'ended', 'expired')),
  value numeric(14,2) check (value is null or value >= 0),
  currency text not null default 'USD' check (currency in ('USD', 'CAD', 'EUR', 'GBP')),
  start_date date,
  end_date date,
  renewal_date date,
  auto_renew boolean not null default false,
  counterparty_name text not null default '',
  counterparty_email text not null default '',
  owner_id text references public.profiles(id) on delete set null,
  created_by text not null default auth.uid()::text references public.profiles(id) on delete restrict,
  signature_requested_at timestamptz,
  signed_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_date is null or end_date is null or end_date >= start_date)
);

create table if not exists public.customer_contract_files (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.customer_contracts(id) on delete cascade,
  uploaded_by text not null default auth.uid()::text references public.profiles(id) on delete restrict,
  file_name text not null,
  storage_path text not null,
  file_size bigint,
  mime_type text,
  file_kind text not null default 'document' check (file_kind in ('document', 'signed_copy', 'amendment', 'other')),
  created_at timestamptz not null default now()
);

create table if not exists public.customer_contract_events (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.customer_contracts(id) on delete cascade,
  actor_id text references public.profiles(id) on delete set null,
  event_type text not null,
  details text not null default '',
  created_at timestamptz not null default now()
);

-- Retain existing contract entries while moving their management surface under Customers.
insert into public.customer_contracts (
  name, description, status, owner_id, created_by, created_at, updated_at, contract_type
)
select
  name,
  coalesce(description, ''),
  case status
    when 'active' then 'active'
    when 'expiring' then 'renewal_due'
    when 'expired' then 'expired'
    else 'draft'
  end,
  owner_id,
  created_by,
  created_at,
  updated_at,
  'other'
from public.legal_records
where record_type = 'contracts'
  and not exists (
    select 1 from public.customer_contracts c
    where c.name = legal_records.name and c.created_by = legal_records.created_by
  );

create index if not exists website_content_type_status_idx on public.website_content (content_type, status, updated_at desc);
create index if not exists website_content_revisions_content_idx on public.website_content_revisions (content_id, created_at desc);
create index if not exists customer_contracts_status_idx on public.customer_contracts (status, end_date);
create index if not exists customer_contracts_org_idx on public.customer_contracts (organization_id);
create index if not exists customer_contract_files_contract_idx on public.customer_contract_files (contract_id, created_at desc);
create index if not exists customer_contract_events_contract_idx on public.customer_contract_events (contract_id, created_at desc);

alter table public.website_content enable row level security;
alter table public.website_content_revisions enable row level security;
alter table public.website_settings enable row level security;
alter table public.customer_contracts enable row level security;
alter table public.customer_contract_files enable row level security;
alter table public.customer_contract_events enable row level security;

grant select, insert, update, delete on public.website_content to authenticated;
grant select on public.website_content to anon;
grant select on public.website_content_revisions, public.website_settings to authenticated;
grant insert, update on public.website_settings to authenticated;
grant select, insert, update, delete on public.customer_contracts to authenticated;
grant select, insert, delete on public.customer_contract_files to authenticated;
grant select, insert on public.customer_contract_events to authenticated;

drop policy if exists "Public can read published website content" on public.website_content;
create policy "Public can read published website content" on public.website_content for select
  using (status = 'published');
drop policy if exists "Legal editors manage website content" on public.website_content;
create policy "Legal editors manage website content" on public.website_content for all to authenticated
  using (public.has_app_access('legal', 'edit')) with check (public.has_app_access('legal', 'edit'));
drop policy if exists "Legal editors read website revisions" on public.website_content_revisions;
create policy "Legal editors read website revisions" on public.website_content_revisions for select to authenticated
  using (public.has_app_access('legal', 'edit'));
drop policy if exists "Legal editors manage website settings" on public.website_settings;
create policy "Legal editors manage website settings" on public.website_settings for all to authenticated
  using (public.has_app_access('legal', 'edit')) with check (public.has_app_access('legal', 'edit'));

drop policy if exists "Customer staff read contracts" on public.customer_contracts;
create policy "Customer staff read contracts" on public.customer_contracts for select to authenticated
  using (public.has_app_access('customers', 'view'));
drop policy if exists "Customer editors create contracts" on public.customer_contracts;
create policy "Customer editors create contracts" on public.customer_contracts for insert to authenticated
  with check (public.has_app_access('customers', 'edit') and created_by = auth.uid()::text);
drop policy if exists "Customer editors update contracts" on public.customer_contracts;
create policy "Customer editors update contracts" on public.customer_contracts for update to authenticated
  using (public.has_app_access('customers', 'edit')) with check (public.has_app_access('customers', 'edit'));
drop policy if exists "Customer managers delete contracts" on public.customer_contracts;
create policy "Customer managers delete contracts" on public.customer_contracts for delete to authenticated
  using (public.has_app_access('customers', 'manage'));

drop policy if exists "Customer staff read contract files" on public.customer_contract_files;
create policy "Customer staff read contract files" on public.customer_contract_files for select to authenticated
  using (public.has_app_access('customers', 'view'));
drop policy if exists "Customer editors manage contract files" on public.customer_contract_files;
create policy "Customer editors manage contract files" on public.customer_contract_files for all to authenticated
  using (public.has_app_access('customers', 'edit')) with check (public.has_app_access('customers', 'edit'));
drop policy if exists "Customer staff read contract events" on public.customer_contract_events;
create policy "Customer staff read contract events" on public.customer_contract_events for select to authenticated
  using (public.has_app_access('customers', 'view'));
drop policy if exists "Customer editors add contract events" on public.customer_contract_events;
create policy "Customer editors add contract events" on public.customer_contract_events for insert to authenticated
  with check (public.has_app_access('customers', 'edit') and actor_id = auth.uid()::text);

insert into storage.buckets (id, name, public, file_size_limit)
values ('contracts-files', 'contracts-files', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;

drop policy if exists "Customer staff read contract storage" on storage.objects;
create policy "Customer staff read contract storage" on storage.objects for select to authenticated
  using (bucket_id = 'contracts-files' and public.has_app_access('customers', 'view'));
drop policy if exists "Customer editors upload contract storage" on storage.objects;
create policy "Customer editors upload contract storage" on storage.objects for insert to authenticated
  with check (bucket_id = 'contracts-files' and public.has_app_access('customers', 'edit') and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Customer editors delete contract storage" on storage.objects;
create policy "Customer editors delete contract storage" on storage.objects for delete to authenticated
  using (bucket_id = 'contracts-files' and public.has_app_access('customers', 'edit')
    and ((storage.foldername(name))[1] = auth.uid()::text or public.has_app_access('customers', 'manage')));
