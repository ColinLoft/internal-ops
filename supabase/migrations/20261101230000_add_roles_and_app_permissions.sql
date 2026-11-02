-- Roles, responsibilities and access are separate concepts: job titles live on
-- profiles, access is granted through roles that carry per-application levels.
create table if not exists public.workspace_roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 1 and 80),
  description text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_role_permissions (
  role_id uuid not null references public.workspace_roles(id) on delete cascade,
  app text not null check (app in (
    'insights', 'organization', 'programs', 'engineering', 'operations',
    'customers', 'gtm', 'support', 'finance', 'legal', 'systems'
  )),
  level text not null check (level in ('view', 'edit', 'manage')),
  primary key (role_id, app)
);

create table if not exists public.workspace_role_assignments (
  user_id text not null references public.profiles(id) on delete cascade,
  role_id uuid not null references public.workspace_roles(id) on delete cascade,
  assigned_by text references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

create index if not exists workspace_role_assignments_role_idx on public.workspace_role_assignments (role_id);

-- 0 none, 1 view, 2 edit, 3 manage. Workspace admins and coordinators keep full
-- access so existing behavior is unchanged; roles grant access to everyone else.
create or replace function public.app_access_level(p_app text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(max(level_rank), 0)
  from (
    select 3 as level_rank
    from public.profiles
    where id = auth.uid()::text and system_role in ('admin', 'coordinator')
    union all
    select case p.level when 'manage' then 3 when 'edit' then 2 else 1 end
    from public.workspace_role_assignments a
    join public.workspace_role_permissions p on p.role_id = a.role_id
    where a.user_id = auth.uid()::text and p.app = p_app
  ) grants;
$$;

create or replace function public.has_app_access(p_app text, p_min text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.app_access_level(p_app) >= case p_min when 'manage' then 3 when 'edit' then 2 else 1 end;
$$;

create or replace function public.is_workspace_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid()::text and system_role = 'admin');
$$;

alter table public.workspace_roles enable row level security;
alter table public.workspace_role_permissions enable row level security;
alter table public.workspace_role_assignments enable row level security;

drop policy if exists "staff can view roles" on public.workspace_roles;
drop policy if exists "admins manage roles" on public.workspace_roles;
drop policy if exists "staff can view role permissions" on public.workspace_role_permissions;
drop policy if exists "admins manage role permissions" on public.workspace_role_permissions;
drop policy if exists "view own or admin role assignments" on public.workspace_role_assignments;
drop policy if exists "admins manage role assignments" on public.workspace_role_assignments;

create policy "staff can view roles" on public.workspace_roles for select to authenticated using (true);
create policy "admins manage roles" on public.workspace_roles for all to authenticated
  using (public.is_workspace_admin()) with check (public.is_workspace_admin());
create policy "staff can view role permissions" on public.workspace_role_permissions for select to authenticated using (true);
create policy "admins manage role permissions" on public.workspace_role_permissions for all to authenticated
  using (public.is_workspace_admin()) with check (public.is_workspace_admin());
create policy "view own or admin role assignments" on public.workspace_role_assignments for select to authenticated
  using (user_id = auth.uid()::text or public.is_workspace_admin());
create policy "admins manage role assignments" on public.workspace_role_assignments for all to authenticated
  using (public.is_workspace_admin()) with check (public.is_workspace_admin());

revoke all on public.workspace_roles, public.workspace_role_permissions, public.workspace_role_assignments from anon;
grant select, insert, update, delete on public.workspace_roles, public.workspace_role_permissions, public.workspace_role_assignments to authenticated;

-- Starter roles; admins can edit or remove them.
insert into public.workspace_roles (name, description) values
  ('Finance team', 'Manages budgets, expenses and funding records.'),
  ('Legal & compliance', 'Manages contracts, policies and compliance records.'),
  ('Support agent', 'Triages and resolves support tickets.')
on conflict (name) do nothing;

insert into public.workspace_role_permissions (role_id, app, level)
select r.id, v.app, v.level
from public.workspace_roles r
join (values
  ('Finance team', 'finance', 'manage'),
  ('Legal & compliance', 'legal', 'manage'),
  ('Support agent', 'support', 'edit')
) as v(role_name, app, level) on v.role_name = r.name
on conflict do nothing;

-- Route existing record- and ticket-level policies through app access.
create or replace function public.is_support_agent()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_app_access('support', 'edit');
$$;

do $$
declare
  rec record;
begin
  for rec in select * from (values
    ('finance_records', 'finance'),
    ('legal_records', 'legal'),
    ('engineering_records', 'engineering')
  ) as t(table_name, app) loop
    execute format('drop policy if exists "staff can view permitted %s" on public.%I', rec.table_name, rec.table_name);
    execute format('drop policy if exists "authenticated staff can view %s" on public.%I', rec.table_name, rec.table_name);
    execute format('drop policy if exists "staff can manage own %s" on public.%I', rec.table_name, rec.table_name);
    if rec.table_name = 'engineering_records' then
      execute format('create policy "authenticated staff can view %s" on public.%I for select to authenticated using (true)', rec.table_name, rec.table_name);
    else
      execute format(
        'create policy "staff can view permitted %s" on public.%I for select to authenticated using (created_by = auth.uid()::text or owner_id = auth.uid()::text or public.has_app_access(%L, ''view''))',
        rec.table_name, rec.table_name, rec.app
      );
    end if;
    execute format(
      'create policy "staff can manage own %s" on public.%I for all to authenticated using (created_by = auth.uid()::text or public.has_app_access(%L, ''edit'')) with check (created_by = auth.uid()::text or public.has_app_access(%L, ''edit''))',
      rec.table_name, rec.table_name, rec.app, rec.app
    );
  end loop;
end $$;
