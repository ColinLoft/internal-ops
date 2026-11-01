create table if not exists public.gtm_records (
  id uuid primary key default gen_random_uuid(),
  area text not null check (area in ('marketing','communications','brand','content','partnerships','business-development')),
  name text not null,
  description text,
  owner_id text references public.profiles(id) on delete set null,
  status text not null default 'planned',
  stage text,
  due_date date,
  created_by text references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gtm_activity (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  record_type text not null,
  record_id uuid references public.gtm_records(id) on delete set null,
  actor_id text references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.gtm_records enable row level security;
alter table public.gtm_activity enable row level security;

drop policy if exists "Authenticated staff can view GTM records" on public.gtm_records;
drop policy if exists "GTM managers can manage GTM records" on public.gtm_records;
drop policy if exists "Authenticated staff can view GTM activity" on public.gtm_activity;
drop policy if exists "GTM managers can manage GTM activity" on public.gtm_activity;

create policy "Authenticated staff can view GTM records"
  on public.gtm_records for select to authenticated using (true);
create policy "GTM managers can manage GTM records"
  on public.gtm_records for all to authenticated
  using (
    owner_id = auth.uid()::text
    or exists (select 1 from public.profiles where id = auth.uid()::text and system_role in ('admin', 'coordinator'))
  )
  with check (
    created_by = auth.uid()::text
    or owner_id = auth.uid()::text
    or exists (select 1 from public.profiles where id = auth.uid()::text and system_role in ('admin', 'coordinator'))
  );

create policy "Authenticated staff can view GTM activity"
  on public.gtm_activity for select to authenticated using (true);
create policy "GTM managers can manage GTM activity"
  on public.gtm_activity for all to authenticated
  using (
    actor_id = auth.uid()::text
    or exists (select 1 from public.profiles where id = auth.uid()::text and system_role in ('admin', 'coordinator'))
  )
  with check (
    actor_id = auth.uid()::text
    or exists (select 1 from public.profiles where id = auth.uid()::text and system_role in ('admin', 'coordinator'))
  );

grant select, insert, update, delete on public.gtm_records to authenticated;
grant select, insert, update, delete on public.gtm_activity to authenticated;
