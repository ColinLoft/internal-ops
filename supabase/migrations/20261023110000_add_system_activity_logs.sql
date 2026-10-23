create table if not exists public.system_activity_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_id text references public.profiles(id) on delete set null,
  actor_name text not null,
  event_type text not null,
  target_type text,
  target_id text,
  target_name text,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists system_activity_logs_created_at_idx
  on public.system_activity_logs (created_at desc);
create index if not exists system_activity_logs_actor_created_at_idx
  on public.system_activity_logs (actor_id, created_at desc);
create index if not exists system_activity_logs_target_created_at_idx
  on public.system_activity_logs (target_id, created_at desc)
  where target_id is not null;

alter table public.system_activity_logs enable row level security;

drop policy if exists "Workspace admins can read system activity" on public.system_activity_logs;
create policy "Workspace admins can read system activity"
  on public.system_activity_logs for select to authenticated
  using (
    exists (
      select 1
      from public.profiles as profile
      where profile.id = auth.uid()::text
        and profile.system_role = 'admin'
    )
  );

drop policy if exists "Users can create their own activity entries" on public.system_activity_logs;
create policy "Users can create their own activity entries"
  on public.system_activity_logs for insert to authenticated
  with check (
    actor_id = auth.uid()::text
    and length(actor_name) between 1 and 120
    and length(event_type) between 1 and 80
    and length(summary) between 1 and 500
    and jsonb_typeof(metadata) = 'object'
  );

grant select, insert on public.system_activity_logs to authenticated;
