create table if not exists public.program_divisions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  director_id text references public.profiles(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  created_at timestamptz not null default now()
);

create table if not exists public.program_teams (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.program_divisions(id) on delete cascade,
  name text not null,
  lead_id text references public.profiles(id) on delete set null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.program_projects (
  id uuid primary key default gen_random_uuid(),
  division_id uuid references public.program_divisions(id) on delete set null,
  team_id uuid references public.program_teams(id) on delete set null,
  name text not null,
  description text,
  owner_id text references public.profiles(id) on delete set null,
  status text not null default 'planning' check (status in ('planning', 'active', 'at_risk', 'completed', 'archived')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  start_date date,
  end_date date,
  progress integer not null default 0 check (progress between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.program_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.program_projects(id) on delete cascade,
  assignee_id text references public.profiles(id) on delete set null,
  title text not null,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'blocked', 'completed')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  due_date date,
  progress integer not null default 0 check (progress between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.program_budgets (
  id uuid primary key default gen_random_uuid(),
  division_id uuid references public.program_divisions(id) on delete cascade,
  project_id uuid references public.program_projects(id) on delete cascade,
  fiscal_year integer not null,
  allocated numeric(12,2) not null default 0,
  committed numeric(12,2) not null default 0,
  spent numeric(12,2) not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.program_milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.program_projects(id) on delete cascade,
  title text not null,
  due_date date,
  status text not null default 'upcoming' check (status in ('upcoming', 'in_progress', 'complete', 'at_risk')),
  created_at timestamptz not null default now()
);

create table if not exists public.program_documents (
  id uuid primary key default gen_random_uuid(),
  division_id uuid references public.program_divisions(id) on delete cascade,
  project_id uuid references public.program_projects(id) on delete cascade,
  title text not null,
  document_type text not null default 'guide',
  description text,
  url text,
  status text not null default 'active' check (status in ('draft', 'active', 'archived')),
  created_by text references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.program_performance (
  id uuid primary key default gen_random_uuid(),
  division_id uuid references public.program_divisions(id) on delete cascade,
  project_id uuid references public.program_projects(id) on delete cascade,
  metric_name text not null,
  target numeric not null default 0,
  actual numeric not null default 0,
  unit text not null default 'count',
  period text not null,
  created_at timestamptz not null default now()
);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'program_divisions', 'program_teams', 'program_projects', 'program_tasks',
    'program_budgets', 'program_milestones', 'program_documents', 'program_performance'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists "Authenticated staff can read %s" on public.%I', table_name, table_name);
    execute format('drop policy if exists "Program administrators can manage %s" on public.%I', table_name, table_name);
    execute format('create policy "Authenticated staff can read %s" on public.%I for select to authenticated using (true)', table_name, table_name);
    execute format(
      'create policy "Program administrators can manage %s" on public.%I for all to authenticated using (exists (select 1 from public.profiles where id = auth.uid()::text and system_role in (''admin'', ''coordinator''))) with check (exists (select 1 from public.profiles where id = auth.uid()::text and system_role in (''admin'', ''coordinator'')))',
      table_name, table_name
    );
  end loop;
end $$;
