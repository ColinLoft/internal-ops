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
