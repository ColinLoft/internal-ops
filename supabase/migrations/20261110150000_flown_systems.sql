-- Additive, re-runnable Flown Systems inventory and sampled monitoring.
create table if not exists public.flown_systems (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 160),
  description text not null default '' check (char_length(description) <= 5000),
  owner_id text references public.profiles(id) on delete set null,
  category text not null default 'other' check (category in ('application','website','infrastructure','integration','other')),
  environment text not null default 'production' check (environment in ('production','staging','development','other')),
  url text not null default '' check (char_length(url) <= 2048),
  monitor_url text not null default '' check (char_length(monitor_url) <= 2048),
  monitoring_enabled boolean not null default false,
  created_by text not null default auth.uid()::text references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not monitoring_enabled or monitor_url <> '')
);
create table if not exists public.flown_system_incidents (
  id uuid primary key default gen_random_uuid(),
  system_id uuid not null references public.flown_systems(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 200),
  notes text not null default '' check (char_length(notes) <= 5000),
  severity text not null default 'minor' check (severity in ('minor','major','critical')),
  status text not null default 'investigating' check (status in ('investigating','identified','monitoring','resolved')),
  started_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_by text not null default auth.uid()::text references public.profiles(id),
  updated_at timestamptz not null default now(),
  check ((status = 'resolved') = (resolved_at is not null)),
  check (resolved_at is null or resolved_at >= started_at)
);
create table if not exists public.flown_system_maintenance (
  id uuid primary key default gen_random_uuid(),
  system_id uuid not null references public.flown_systems(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 200),
  notes text not null default '' check (char_length(notes) <= 5000),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled','in_progress','completed','cancelled')),
  created_by text not null default auth.uid()::text references public.profiles(id),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create table if not exists public.flown_system_checks (
  id uuid primary key default gen_random_uuid(),
  system_id uuid not null references public.flown_systems(id) on delete cascade,
  checked_at timestamptz not null default now(),
  endpoint_url text not null,
  outcome text not null check (outcome in ('up','down','blocked')),
  http_status integer check (http_status between 100 and 599),
  latency_ms integer check (latency_ms between 0 and 30000),
  error text,
  trigger_source text not null check (trigger_source in ('manual','scheduled'))
);
create index if not exists flown_checks_history_idx on public.flown_system_checks(system_id, checked_at desc);
create index if not exists flown_incidents_system_idx on public.flown_system_incidents(system_id, started_at desc);
create index if not exists flown_maintenance_system_idx on public.flown_system_maintenance(system_id, starts_at desc);

create or replace function public.flown_systems_active_staff()
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.profiles where id = auth.uid()::text and account_status = 'active'); $$;
revoke all on function public.flown_systems_active_staff() from public, anon;
grant execute on function public.flown_systems_active_staff() to authenticated, service_role;

create or replace function public.flown_systems_touch()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); new.created_by = old.created_by; return new; end;
$$;
do $$
declare t text;
begin
  foreach t in array array['flown_systems','flown_system_incidents','flown_system_maintenance'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Active staff manage systems" on public.%I', t);
    execute format('drop policy if exists "Active staff view systems" on public.%I', t);
    execute format('drop policy if exists "Active staff create systems" on public.%I', t);
    execute format('drop policy if exists "Active staff update systems" on public.%I', t);
    execute format('drop policy if exists "Active staff delete systems" on public.%I', t);
    execute format('create policy "Active staff view systems" on public.%I for select to authenticated using (public.flown_systems_active_staff())', t);
    execute format('create policy "Active staff create systems" on public.%I for insert to authenticated with check (public.flown_systems_active_staff() and created_by = auth.uid()::text)', t);
    execute format('create policy "Active staff update systems" on public.%I for update to authenticated using (public.flown_systems_active_staff()) with check (public.flown_systems_active_staff())', t);
    execute format('create policy "Active staff delete systems" on public.%I for delete to authenticated using (public.flown_systems_active_staff())', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop trigger if exists flown_systems_updated_at on public.%I', t);
    execute format('create trigger flown_systems_updated_at before update on public.%I for each row execute function public.flown_systems_touch()', t);
  end loop;
end $$;
alter table public.flown_system_checks enable row level security;
drop policy if exists "Active staff view checks" on public.flown_system_checks;
create policy "Active staff view checks" on public.flown_system_checks for select to authenticated using (public.flown_systems_active_staff());
revoke all on public.flown_system_checks from anon, authenticated;
grant select on public.flown_system_checks to authenticated;
grant all on public.flown_systems, public.flown_system_incidents, public.flown_system_maintenance, public.flown_system_checks to service_role;

-- Aggregate in SQL: the browser's row limit must never inflate the uptime percentage.
-- Only the current endpoint's observations count; blocked checks are not downtime samples.
create or replace function public.flown_system_monitor_summary()
returns table(system_id uuid, sample_count bigint, up_count bigint, blocked_count bigint, avg_latency_ms numeric, latest_check jsonb)
language sql stable security invoker set search_path = public as $$
select s.id,
  count(c.id) filter (where c.outcome in ('up','down')),
  count(c.id) filter (where c.outcome = 'up'),
  count(c.id) filter (where c.outcome = 'blocked'),
  round(avg(c.latency_ms) filter (where c.outcome = 'up')),
  (select to_jsonb(l) from public.flown_system_checks l
   where l.system_id = s.id and l.endpoint_url = s.monitor_url
   order by l.checked_at desc limit 1)
from public.flown_systems s left join public.flown_system_checks c
on c.system_id = s.id and c.endpoint_url = s.monitor_url and c.checked_at >= now() - interval '30 days'
group by s.id;
$$;
revoke all on function public.flown_system_monitor_summary() from public, anon;
grant execute on function public.flown_system_monitor_summary() to authenticated, service_role;

-- Atomic leases bound overlapping scheduled/manual runs. No client access.
create table if not exists public.flown_system_monitor_leases (
  system_id uuid primary key references public.flown_systems(id) on delete cascade,
  leased_until timestamptz not null
);
alter table public.flown_system_monitor_leases enable row level security;
revoke all on public.flown_system_monitor_leases from anon, authenticated;
grant all on public.flown_system_monitor_leases to service_role;
create or replace function public.flown_system_claim_check(target_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare claimed uuid;
begin
  insert into public.flown_system_monitor_leases(system_id, leased_until)
  values (target_id, now() + interval '60 seconds')
  on conflict (system_id) do update set leased_until = excluded.leased_until
  where flown_system_monitor_leases.leased_until <= now()
  returning system_id into claimed;
  return claimed is not null; 
end; $$;
revoke all on function public.flown_system_claim_check(uuid) from public, anon, authenticated;
grant execute on function public.flown_system_claim_check(uuid) to service_role;

create or replace function public.flown_system_due_checks()
returns setof public.flown_systems language sql stable security definer set search_path = public as $$
select s.* from public.flown_systems s
left join public.flown_system_monitor_leases l on l.system_id = s.id
where s.monitoring_enabled and s.monitor_url <> ''
  and (l.leased_until is null or l.leased_until <= now())
order by coalesce(l.leased_until, 'epoch'::timestamptz), s.id limit 20;
$$;
revoke all on function public.flown_system_due_checks() from public, anon, authenticated;
grant execute on function public.flown_system_due_checks() to service_role;
