create table if not exists public.operation_workstreams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  owner_id text references public.profiles(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'paused', 'completed', 'archived')),
  created_by text references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.operation_tasks (
  id uuid primary key default gen_random_uuid(),
  workstream_id uuid references public.operation_workstreams(id) on delete set null,
  title text not null,
  description text,
  assignee_id text references public.profiles(id) on delete set null,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'blocked', 'completed', 'cancelled')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  due_date date,
  created_by text references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.operation_approvals (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.operation_tasks(id) on delete set null,
  title text not null,
  requester_id text references public.profiles(id) on delete set null,
  reviewer_id text references public.profiles(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  due_date date,
  notes text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table if not exists public.operation_resources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  resource_type text not null default 'shared_resource',
  owner_id text references public.profiles(id) on delete set null,
  status text not null default 'available' check (status in ('available', 'in_use', 'maintenance', 'retired')),
  notes text,
  created_by text references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.operation_activity (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  actor_id text references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.operation_workstreams enable row level security;
alter table public.operation_tasks enable row level security;
alter table public.operation_approvals enable row level security;
alter table public.operation_resources enable row level security;
alter table public.operation_activity enable row level security;

do $$
declare table_name text;
begin
  foreach table_name in array array['operation_workstreams','operation_tasks','operation_approvals','operation_resources','operation_activity'] loop
    execute format('drop policy if exists "Authenticated staff can view %s" on public.%I', table_name, table_name);
    execute format('drop policy if exists "Operations managers can manage %s" on public.%I', table_name, table_name);
    execute format('create policy "Authenticated staff can view %s" on public.%I for select to authenticated using (true)', table_name, table_name);
    execute format('create policy "Operations managers can manage %s" on public.%I for all to authenticated using (exists (select 1 from public.profiles where id = auth.uid()::text and system_role in (''admin'', ''coordinator''))) with check (exists (select 1 from public.profiles where id = auth.uid()::text and system_role in (''admin'', ''coordinator'')))', table_name, table_name);
  end loop;
end $$;

create policy "Staff can create operation tasks"
  on public.operation_tasks for insert to authenticated
  with check (created_by = auth.uid()::text or assignee_id = auth.uid()::text);
create policy "Staff can update assigned operation tasks"
  on public.operation_tasks for update to authenticated
  using (assignee_id = auth.uid()::text)
  with check (assignee_id = auth.uid()::text);

grant select, insert, update on public.operation_workstreams to authenticated;
grant select, insert, update on public.operation_tasks to authenticated;
grant select, insert, update on public.operation_approvals to authenticated;
grant select, insert, update on public.operation_resources to authenticated;
grant select, insert on public.operation_activity to authenticated;
