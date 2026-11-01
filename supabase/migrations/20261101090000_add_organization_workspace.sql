create table if not exists public.organization_departments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  head_id text references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.organization_positions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  department_id uuid references public.organization_departments(id) on delete set null,
  reports_to_id text references public.profiles(id) on delete set null,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create table if not exists public.organization_employee_records (
  user_id text primary key references public.profiles(id) on delete cascade,
  position_id uuid references public.organization_positions(id) on delete set null,
  manager_id text references public.profiles(id) on delete set null,
  employment_type text not null default 'staff',
  start_date date,
  notes text,
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_onboarding (
  id uuid primary key default gen_random_uuid(),
  employee_id text not null references public.profiles(id) on delete cascade,
  title text not null,
  status text not null default 'not_started',
  due_date date,
  created_at timestamptz not null default now()
);

create table if not exists public.organization_absences (
  id uuid primary key default gen_random_uuid(),
  employee_id text not null references public.profiles(id) on delete cascade,
  leave_type text not null,
  starts_on date not null,
  ends_on date not null,
  status text not null default 'requested',
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.organization_records (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  record_type text not null,
  owner_id text references public.profiles(id) on delete set null,
  status text not null default 'active',
  description text,
  created_at timestamptz not null default now()
);

alter table public.organization_departments enable row level security;
alter table public.organization_positions enable row level security;
alter table public.organization_employee_records enable row level security;
alter table public.organization_onboarding enable row level security;
alter table public.organization_absences enable row level security;
alter table public.organization_records enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'organization_departments',
    'organization_positions',
    'organization_employee_records',
    'organization_onboarding',
    'organization_absences',
    'organization_records'
  ] loop
    execute format('drop policy if exists "Authenticated staff can manage %s" on public.%I', table_name, table_name);
    execute format('create policy "Authenticated staff can manage %s" on public.%I for all to authenticated using (true) with check (true)', table_name, table_name);
  end loop;
end $$;

create table if not exists public.organization_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  document_type text not null check (document_type in ('policy', 'contract', 'handbook', 'form')),
  description text,
  content text,
  storage_path text,
  version text not null default '1.0',
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  requires_signature boolean not null default false,
  requires_acknowledgement boolean not null default true,
  required_onboarding boolean not null default false,
  created_by text references public.profiles(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_document_responses (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.organization_documents(id) on delete cascade,
  user_id text not null references public.profiles(id) on delete cascade,
  response_type text not null check (response_type in ('signed', 'acknowledged')),
  signed_name text,
  signature_data text,
  signed_at timestamptz,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  unique (document_id, user_id)
);

create table if not exists public.organization_document_assignments (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.organization_documents(id) on delete cascade,
  user_id text not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'completed', 'dismissed')),
  assigned_by text references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (document_id, user_id)
);

alter table public.organization_documents enable row level security;
alter table public.organization_document_responses enable row level security;
alter table public.organization_document_assignments enable row level security;

create policy "Authenticated staff can view organization documents"
  on public.organization_documents for select to authenticated using (status = 'published' or created_by = auth.uid()::text);
create policy "Workspace admins can manage organization documents"
  on public.organization_documents for all to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid()::text and system_role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid()::text and system_role = 'admin'));
create policy "Staff can view document responses"
  on public.organization_document_responses for select to authenticated using (
    user_id = auth.uid()::text
    or exists (select 1 from public.profiles where id = auth.uid()::text and system_role = 'admin')
  );
create policy "Staff can submit document responses"
  on public.organization_document_responses for insert to authenticated with check (user_id = auth.uid()::text);
create policy "Staff can update document responses"
  on public.organization_document_responses for update to authenticated using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);
create policy "Staff can view assigned documents"
  on public.organization_document_assignments for select to authenticated using (
    user_id = auth.uid()::text
    or exists (select 1 from public.profiles where id = auth.uid()::text and system_role = 'admin')
  );
create policy "Workspace admins can manage document assignments"
  on public.organization_document_assignments for all to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid()::text and system_role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid()::text and system_role = 'admin'));
create policy "Staff can complete assigned documents"
  on public.organization_document_assignments for update to authenticated
  using (user_id = auth.uid()::text)
  with check (user_id = auth.uid()::text);

insert into storage.buckets (id, name, public)
values ('organization-documents', 'organization-documents', false)
on conflict (id) do nothing;

create policy "Authenticated staff can read organization documents"
  on storage.objects for select to authenticated
  using (bucket_id = 'organization-documents');
create policy "Authenticated staff can upload organization documents"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'organization-documents'
    and exists (select 1 from public.profiles where id = auth.uid()::text and system_role = 'admin')
  );
