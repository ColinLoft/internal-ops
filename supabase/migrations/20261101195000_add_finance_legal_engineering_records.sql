create table if not exists public.finance_records (
  id uuid primary key default gen_random_uuid(),
  record_type text not null,
  name text not null,
  description text,
  status text not null default 'draft',
  owner_id text references public.profiles(id) on delete set null,
  amount numeric(12,2),
  due_date date,
  metadata jsonb not null default '{}'::jsonb,
  created_by text not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.legal_records (
  id uuid primary key default gen_random_uuid(),
  record_type text not null,
  name text not null,
  description text,
  status text not null default 'draft',
  owner_id text references public.profiles(id) on delete set null,
  due_date date,
  metadata jsonb not null default '{}'::jsonb,
  created_by text not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.engineering_records (
  id uuid primary key default gen_random_uuid(),
  record_type text not null,
  name text not null,
  description text,
  status text not null default 'draft',
  owner_id text references public.profiles(id) on delete set null,
  due_date date,
  metadata jsonb not null default '{}'::jsonb,
  created_by text not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
declare
  table_name text;
begin
  foreach table_name in array array['finance_records', 'legal_records', 'engineering_records'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists "Authenticated staff can view %s" on public.%I', table_name, table_name);
    execute format('drop policy if exists "Staff can manage own %s" on public.%I', table_name, table_name);
    execute format(
      'create policy "Authenticated staff can view %s" on public.%I for select to authenticated using (true)',
      table_name, table_name
    );
    execute format(
      'create policy "Staff can manage own %s" on public.%I for all to authenticated using (created_by = auth.uid()::text or exists (select 1 from public.profiles where id = auth.uid()::text and system_role in (''admin'', ''coordinator''))) with check (created_by = auth.uid()::text or exists (select 1 from public.profiles where id = auth.uid()::text and system_role in (''admin'', ''coordinator'')))',
      table_name, table_name
    );
    execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
  end loop;
end $$;
