alter table public.workspace_role_permissions
  drop constraint if exists workspace_role_permissions_app_check;

alter table public.workspace_role_permissions
  add constraint workspace_role_permissions_app_check
  check (app in (
    'insights', 'organization', 'programs', 'engineering', 'operations',
    'customers', 'gtm', 'support', 'finance', 'legal', 'systems', 'wildfire'
  ));

insert into public.workspace_roles (name, description)
values ('Wildfire Solutions team', 'Manages wildfire opportunities, site designs, product catalog and deployments.')
on conflict (name) do nothing;

insert into public.workspace_role_permissions (role_id, app, level)
select id, 'wildfire', 'edit'
from public.workspace_roles
where name = 'Wildfire Solutions team'
on conflict (role_id, app) do nothing;

create or replace function public.my_app_access()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(app, public.app_access_level(app)), '{}'::jsonb)
  from unnest(array[
    'insights', 'organization', 'programs', 'engineering', 'operations',
    'customers', 'gtm', 'support', 'finance', 'legal', 'systems', 'wildfire'
  ]) as app;
$$;

create table if not exists public.wildfire_products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique check (char_length(sku) between 1 and 100),
  name text not null check (char_length(name) between 1 and 200),
  category text not null check (category in ('detection', 'infrastructure', 'power', 'service')),
  description text not null default '',
  specifications jsonb not null default '{}'::jsonb,
  configurations jsonb not null default '[]'::jsonb,
  compatible_accessories uuid[] not null default '{}',
  list_price numeric(14,2) not null default 0 check (list_price >= 0),
  warranty text not null default '',
  installation_requirements text not null default '',
  image_path text,
  status text not null default 'active' check (status in ('active', 'discontinued')),
  owner_id text references public.profiles(id) on delete set null,
  created_by text not null default auth.uid()::text references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wildfire_product_costs (
  product_id uuid primary key references public.wildfire_products(id) on delete cascade,
  unit_cost numeric(14,2) not null default 0 check (unit_cost >= 0),
  labor_cost numeric(14,2) not null default 0 check (labor_cost >= 0),
  updated_by text not null default auth.uid()::text references public.profiles(id) on delete restrict,
  updated_at timestamptz not null default now()
);

create table if not exists public.wildfire_properties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crm_organizations(id) on delete restrict,
  label text not null check (char_length(label) between 1 and 200),
  address text not null default '',
  city text not null default '',
  region text not null default '',
  postal_code text not null default '',
  country text not null default '',
  latitude double precision check (latitude is null or latitude between -90 and 90),
  longitude double precision check (longitude is null or longitude between -180 and 180),
  boundary_geojson jsonb,
  notes text not null default '',
  owner_id text references public.profiles(id) on delete set null,
  created_by text not null default auth.uid()::text references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wildfire_opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crm_organizations(id) on delete restrict,
  contact_id uuid references public.crm_contacts(id) on delete set null,
  property_id uuid references public.wildfire_properties(id) on delete set null,
  name text not null check (char_length(name) between 1 and 200),
  stage text not null default 'new_inquiry' check (stage in (
    'new_inquiry', 'initial_contact', 'discovery', 'site_assessment',
    'site_planning', 'quote_preparation', 'proposal_sent', 'negotiation',
    'contract_pending', 'won', 'lost'
  )),
  estimated_value numeric(14,2) check (estimated_value is null or estimated_value >= 0),
  currency text not null default 'USD' check (currency in ('USD', 'CAD', 'EUR', 'GBP')),
  expected_equipment jsonb not null default '[]'::jsonb,
  assigned_to text references public.profiles(id) on delete set null,
  expected_decision_date date,
  notes text not null default '',
  lost_reason text not null default '',
  owner_id text references public.profiles(id) on delete set null,
  created_by text not null default auth.uid()::text references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wildfire_site_plans (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.wildfire_properties(id) on delete restrict,
  opportunity_id uuid references public.wildfire_opportunities(id) on delete set null,
  name text not null check (char_length(name) between 1 and 200),
  version integer not null check (version > 0),
  status text not null default 'draft' check (status in ('draft', 'in_review', 'approved', 'archived')),
  boundary_geojson jsonb,
  coverage_assumptions text not null default '',
  notes text not null default '',
  created_by text not null default auth.uid()::text references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (property_id, name, version)
);

create table if not exists public.wildfire_site_placements (
  id uuid primary key default gen_random_uuid(),
  site_plan_id uuid not null references public.wildfire_site_plans(id) on delete cascade,
  product_id uuid references public.wildfire_products(id) on delete set null,
  placement_type text not null check (placement_type in ('camera', 'gateway', 'power', 'infrastructure', 'coverage_zone')),
  label text not null check (char_length(label) between 1 and 200),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  configuration jsonb not null default '{}'::jsonb,
  heading_degrees numeric(6,2) check (heading_degrees is null or heading_degrees between 0 and 360),
  horizontal_fov_degrees numeric(6,2) check (horizontal_fov_degrees is null or horizontal_fov_degrees between 0 and 360),
  notes text not null default '',
  created_by text not null default auth.uid()::text references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wildfire_quotes (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.wildfire_opportunities(id) on delete restrict,
  property_id uuid references public.wildfire_properties(id) on delete set null,
  site_plan_id uuid references public.wildfire_site_plans(id) on delete set null,
  version integer not null check (version > 0),
  status text not null default 'draft' check (status in (
    'draft', 'pending_approval', 'approved', 'sent', 'viewed', 'accepted', 'rejected', 'expired'
  )),
  currency text not null default 'USD' check (currency in ('USD', 'CAD', 'EUR', 'GBP')),
  discount numeric(14,2) not null default 0 check (discount >= 0),
  tax numeric(14,2) not null default 0 check (tax >= 0),
  expires_at date,
  terms text not null default '',
  created_by text not null default auth.uid()::text references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (opportunity_id, version)
);

create table if not exists public.wildfire_quote_lines (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.wildfire_quotes(id) on delete cascade,
  product_id uuid references public.wildfire_products(id) on delete set null,
  description text not null check (char_length(description) between 1 and 500),
  quantity numeric(12,2) not null check (quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  line_total numeric(16,2) generated always as (round(quantity * unit_price, 2)) stored,
  recurring boolean not null default false,
  created_by text not null default auth.uid()::text references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.wildfire_quote_costs (
  quote_id uuid primary key references public.wildfire_quotes(id) on delete cascade,
  estimated_labor numeric(14,2) not null default 0 check (estimated_labor >= 0),
  other_expenses numeric(14,2) not null default 0 check (other_expenses >= 0),
  updated_by text not null default auth.uid()::text references public.profiles(id) on delete restrict,
  updated_at timestamptz not null default now()
);

create table if not exists public.wildfire_proposals (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.wildfire_quotes(id) on delete restrict,
  contract_id uuid references public.customer_contracts(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'rejected', 'expired')),
  title text not null check (char_length(title) between 1 and 200),
  project_overview text not null default '',
  scope text not null default '',
  assumptions text not null default '',
  terms text not null default '',
  approved_at timestamptz,
  sent_at timestamptz,
  created_by text not null default auth.uid()::text references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wildfire_site_surveys (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.wildfire_properties(id) on delete restrict,
  opportunity_id uuid references public.wildfire_opportunities(id) on delete set null,
  status text not null default 'planned' check (status in ('planned', 'in_progress', 'submitted', 'reviewed')),
  survey_data jsonb not null default '{}'::jsonb,
  recommendations text not null default '',
  challenges text not null default '',
  scheduled_at timestamptz,
  completed_at timestamptz,
  assigned_to text references public.profiles(id) on delete set null,
  created_by text not null default auth.uid()::text references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wildfire_deployments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crm_organizations(id) on delete restrict,
  property_id uuid not null references public.wildfire_properties(id) on delete restrict,
  opportunity_id uuid references public.wildfire_opportunities(id) on delete set null,
  contract_id uuid references public.customer_contracts(id) on delete set null,
  site_plan_id uuid references public.wildfire_site_plans(id) on delete set null,
  status text not null default 'contract_executed' check (status in (
    'contract_executed', 'planning', 'procurement', 'preparation', 'scheduled',
    'installation', 'commissioning', 'handoff', 'completed', 'cancelled'
  )),
  assigned_to text references public.profiles(id) on delete set null,
  scheduled_at timestamptz,
  completed_at timestamptz,
  customer_accepted_at timestamptz,
  notes text not null default '',
  created_by text not null default auth.uid()::text references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wildfire_deployment_equipment (
  id uuid primary key default gen_random_uuid(),
  deployment_id uuid not null references public.wildfire_deployments(id) on delete cascade,
  product_id uuid references public.wildfire_products(id) on delete set null,
  placement_id uuid references public.wildfire_site_placements(id) on delete set null,
  serial_number text unique,
  equipment_type text not null,
  status text not null default 'planned' check (status in ('planned', 'allocated', 'installed', 'commissioned', 'removed', 'faulty')),
  installed_at timestamptz,
  configuration jsonb not null default '{}'::jsonb,
  notes text not null default '',
  created_by text not null default auth.uid()::text references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wildfire_system_alerts (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid references public.wildfire_deployment_equipment(id) on delete set null,
  support_ticket_id uuid references public.support_tickets(id) on delete set null,
  dedupe_key text not null,
  alert_type text not null,
  severity text not null check (severity in ('informational', 'warning', 'high', 'critical')),
  status text not null default 'new' check (status in ('new', 'acknowledged', 'investigating', 'maintenance_required', 'resolved', 'closed')),
  summary text not null,
  details jsonb not null default '{}'::jsonb,
  assigned_to text references public.profiles(id) on delete set null,
  created_by text default auth.uid()::text references public.profiles(id) on delete set null,
  first_detected_at timestamptz not null default now(),
  last_detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.wildfire_system_alerts
  add column if not exists created_by text default auth.uid()::text references public.profiles(id) on delete set null;

create table if not exists public.wildfire_activity (
  id bigint generated always as identity primary key,
  record_type text not null,
  record_id uuid not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  actor_id text references public.profiles(id) on delete set null,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

alter table public.support_tickets
  add column if not exists wildfire_property_id uuid references public.wildfire_properties(id) on delete set null,
  add column if not exists wildfire_deployment_id uuid references public.wildfire_deployments(id) on delete set null,
  add column if not exists wildfire_request_kind text check (wildfire_request_kind is null or wildfire_request_kind in ('equipment', 'coverage', 'service', 'account_admin'));

create index if not exists wildfire_properties_organization_idx on public.wildfire_properties (organization_id, created_at desc);
create index if not exists wildfire_opportunities_stage_idx on public.wildfire_opportunities (stage, updated_at desc);
create index if not exists wildfire_opportunities_org_idx on public.wildfire_opportunities (organization_id);
create index if not exists wildfire_site_plans_property_idx on public.wildfire_site_plans (property_id, version desc);
create index if not exists wildfire_site_placements_plan_idx on public.wildfire_site_placements (site_plan_id);
create index if not exists wildfire_quotes_opportunity_idx on public.wildfire_quotes (opportunity_id, version desc);
create index if not exists wildfire_deployments_status_idx on public.wildfire_deployments (status, updated_at desc);
create index if not exists wildfire_equipment_deployment_idx on public.wildfire_deployment_equipment (deployment_id);
create index if not exists wildfire_alerts_open_idx on public.wildfire_system_alerts (severity, last_detected_at desc) where status not in ('resolved', 'closed');
create unique index if not exists wildfire_alerts_dedupe_open_idx on public.wildfire_system_alerts (dedupe_key) where status not in ('resolved', 'closed');
create index if not exists wildfire_activity_record_idx on public.wildfire_activity (record_type, record_id, created_at desc);

drop policy if exists "wildfire read crm organizations" on public.crm_organizations;
create policy "wildfire read crm organizations" on public.crm_organizations
  for select to authenticated using (public.has_app_access('wildfire', 'view'));
drop policy if exists "wildfire read crm contacts" on public.crm_contacts;
create policy "wildfire read crm contacts" on public.crm_contacts
  for select to authenticated using (public.has_app_access('wildfire', 'view'));
drop policy if exists "wildfire read linked support tickets" on public.support_tickets;
create policy "wildfire read linked support tickets" on public.support_tickets
  for select to authenticated using (
    public.has_app_access('wildfire', 'view')
    and (wildfire_property_id is not null or wildfire_request_kind is not null)
  );

create or replace function public.wildfire_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.wildfire_record_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_data jsonb;
begin
  if tg_op = 'DELETE' then
    row_data = to_jsonb(old);
    insert into public.wildfire_activity (record_type, record_id, action, actor_id, before_data)
    values (tg_table_name, old.id, 'delete', auth.uid()::text, row_data);
    return old;
  elsif tg_op = 'UPDATE' then
    insert into public.wildfire_activity (record_type, record_id, action, actor_id, before_data, after_data)
    values (tg_table_name, new.id, 'update', auth.uid()::text, to_jsonb(old), to_jsonb(new));
    return new;
  end if;

  insert into public.wildfire_activity (record_type, record_id, action, actor_id, after_data)
  values (tg_table_name, new.id, 'insert', auth.uid()::text, to_jsonb(new));
  return new;
end;
$$;

create or replace function public.wildfire_protect_approved_records()
returns trigger
language plpgsql
as $$
declare
  record_status text;
begin
  record_status = case tg_table_name
    when 'wildfire_site_plans' then old.status
    when 'wildfire_quotes' then old.status
    when 'wildfire_proposals' then old.status
    else null
  end;
  if (tg_table_name = 'wildfire_site_plans' and record_status = 'approved')
    or (tg_table_name = 'wildfire_quotes' and record_status in ('accepted', 'rejected', 'expired'))
    or (tg_table_name = 'wildfire_proposals' and record_status in ('accepted', 'rejected', 'expired')) then
    raise exception 'Approved or completed Wildfire records are immutable. Create a new version instead.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.wildfire_protect_version_children()
returns trigger
language plpgsql
as $$
declare
  parent_status text;
  parent_id uuid;
begin
  if tg_table_name = 'wildfire_site_placements' then
    parent_id = case when tg_op = 'DELETE' then old.site_plan_id else new.site_plan_id end;
    select status into parent_status from public.wildfire_site_plans where id = parent_id;
    if parent_status = 'approved' then
      raise exception 'Placements in an approved site plan are immutable. Create a new site plan version.';
    end if;
    if tg_op = 'UPDATE' then
      if old.site_plan_id is distinct from new.site_plan_id then
        select status into parent_status from public.wildfire_site_plans where id = old.site_plan_id;
        if parent_status = 'approved' then
          raise exception 'Placements in an approved site plan are immutable. Create a new site plan version.';
        end if;
      end if;
    end if;
  else
    parent_id = case when tg_op = 'DELETE' then old.quote_id else new.quote_id end;
    select status into parent_status from public.wildfire_quotes where id = parent_id;
    if parent_status in ('accepted', 'rejected', 'expired') then
      raise exception 'Lines in a completed quote are immutable. Create a new quote version.';
    end if;
    if tg_op = 'UPDATE' then
      if old.quote_id is distinct from new.quote_id then
        select status into parent_status from public.wildfire_quotes where id = old.quote_id;
        if parent_status in ('accepted', 'rejected', 'expired') then
          raise exception 'Lines in a completed quote are immutable. Create a new quote version.';
        end if;
      end if;
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'wildfire_products', 'wildfire_properties', 'wildfire_opportunities',
    'wildfire_site_plans', 'wildfire_site_placements', 'wildfire_quotes',
    'wildfire_proposals', 'wildfire_site_surveys', 'wildfire_deployments',
    'wildfire_deployment_equipment', 'wildfire_system_alerts'
  ] loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_touch', table_name);
    execute format('create trigger %I before update on public.%I for each row execute function public.wildfire_touch_updated_at()', table_name || '_touch', table_name);
    execute format('drop trigger if exists %I on public.%I', table_name || '_activity', table_name);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.wildfire_record_activity()', table_name || '_activity', table_name);
  end loop;

  foreach table_name in array array['wildfire_site_plans', 'wildfire_quotes', 'wildfire_proposals'] loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_protect', table_name);
    execute format('create trigger %I before update or delete on public.%I for each row execute function public.wildfire_protect_approved_records()', table_name || '_protect', table_name);
  end loop;
  foreach table_name in array array['wildfire_site_placements', 'wildfire_quote_lines'] loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_protect_version', table_name);
    execute format('create trigger %I before insert or update or delete on public.%I for each row execute function public.wildfire_protect_version_children()', table_name || '_protect_version', table_name);
  end loop;

  foreach table_name in array array['wildfire_product_costs', 'wildfire_quote_costs'] loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_touch', table_name);
    execute format('create trigger %I before update on public.%I for each row execute function public.wildfire_touch_updated_at()', table_name || '_touch', table_name);
  end loop;
end $$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'wildfire_products', 'wildfire_properties', 'wildfire_opportunities',
    'wildfire_site_plans', 'wildfire_site_placements', 'wildfire_quotes',
    'wildfire_quote_lines', 'wildfire_proposals', 'wildfire_site_surveys',
    'wildfire_deployments', 'wildfire_deployment_equipment', 'wildfire_system_alerts'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists %I on public.%I', 'wildfire read ' || table_name, table_name);
    execute format('drop policy if exists %I on public.%I', 'wildfire insert ' || table_name, table_name);
    execute format('drop policy if exists %I on public.%I', 'wildfire update ' || table_name, table_name);
    execute format('drop policy if exists %I on public.%I', 'wildfire delete ' || table_name, table_name);
    execute format('create policy %I on public.%I for select to authenticated using (public.has_app_access(''wildfire'', ''view''))', 'wildfire read ' || table_name, table_name);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.has_app_access(''wildfire'', ''edit'') and created_by = auth.uid()::text)', 'wildfire insert ' || table_name, table_name);
    execute format('create policy %I on public.%I for update to authenticated using (public.has_app_access(''wildfire'', ''edit'')) with check (public.has_app_access(''wildfire'', ''edit''))', 'wildfire update ' || table_name, table_name);
    execute format('create policy %I on public.%I for delete to authenticated using (public.has_app_access(''wildfire'', ''edit''))', 'wildfire delete ' || table_name, table_name);
    execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
  end loop;
end $$;

alter table public.wildfire_product_costs enable row level security;
alter table public.wildfire_quote_costs enable row level security;
alter table public.wildfire_activity enable row level security;

drop policy if exists "wildfire managers read product costs" on public.wildfire_product_costs;
drop policy if exists "wildfire managers manage product costs" on public.wildfire_product_costs;
drop policy if exists "wildfire managers read quote costs" on public.wildfire_quote_costs;
drop policy if exists "wildfire managers manage quote costs" on public.wildfire_quote_costs;
drop policy if exists "wildfire staff read activity" on public.wildfire_activity;

create policy "wildfire managers read product costs" on public.wildfire_product_costs
  for select to authenticated using (public.has_app_access('wildfire', 'manage'));
create policy "wildfire managers manage product costs" on public.wildfire_product_costs
  for all to authenticated using (public.has_app_access('wildfire', 'manage'))
  with check (public.has_app_access('wildfire', 'manage'));
create policy "wildfire managers read quote costs" on public.wildfire_quote_costs
  for select to authenticated using (public.has_app_access('wildfire', 'manage'));
create policy "wildfire managers manage quote costs" on public.wildfire_quote_costs
  for all to authenticated using (public.has_app_access('wildfire', 'manage'))
  with check (public.has_app_access('wildfire', 'manage'));
create policy "wildfire staff read activity" on public.wildfire_activity
  for select to authenticated using (public.has_app_access('wildfire', 'view'));

grant select, insert, update, delete on public.wildfire_product_costs, public.wildfire_quote_costs to authenticated;
grant select on public.wildfire_activity to authenticated;
grant usage, select on sequence public.wildfire_activity_id_seq to authenticated;
