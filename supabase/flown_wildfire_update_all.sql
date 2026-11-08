-- Flown Ops: Forms access correction and Wildfire acquisition workflow.
-- Generated from the two current-request migrations; apply this bundle OR those
-- migrations, not both. Requires the existing Flown workspace/Wildfire baseline.
--
-- WARNING: Permanently deletes shared-mailbox automation rules/history, precisely
-- flagged internal developer bug tickets, and old Wildfire site surveys.
-- Customer tickets, deployments, quotes, opportunities and site plans are retained.
-- Screenshot objects require the separate Storage API cleanup procedure.
-- Back up the database before applying. See docs/workspace-integrations.md and
-- docs/wildfire-solutions.md for configuration and deployment steps.


-- Source: supabase/migrations/20261110160000_forms_access_and_retire_internal_tools.sql
-- Re-runnable. Apply AFTER the Company Forms, internal bug report, and email
-- workspace migrations. This permanently deletes only the retired scopes below.
begin;

create or replace function public.is_active_company_forms_staff()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and exists (
    select 1 from public.profiles
    where id = auth.uid()::text and account_status = 'active'
  );
$$;
revoke all on function public.is_active_company_forms_staff() from public, anon;
grant execute on function public.is_active_company_forms_staff() to authenticated;

-- INSERT ... RETURNING must authorize the new owner's row without asking a
-- STABLE self-query helper to find that row in the pre-insert statement snapshot.
drop policy if exists "Form collaborators can view company forms" on public.company_forms;
create policy "Form collaborators can view company forms"
  on public.company_forms for select to authenticated
  using (
    public.is_active_company_forms_staff()
    and (owner_id = auth.uid() or public.can_view_company_form(id))
  );
drop policy if exists "Staff can create company forms" on public.company_forms;
create policy "Staff can create company forms"
  on public.company_forms for insert to authenticated
  with check (owner_id = auth.uid() and public.is_active_company_forms_staff());
-- Existing editor-only UPDATE policy, immutable identity trigger, collaborator
-- grants, publication permissions, and response permissions remain unchanged.

lock table public.email_rules, public.email_mailboxes, public.system_activity_logs,
  public.support_tickets in share row exclusive mode;

-- Company Automation exposed rules for SHARED mailboxes only. There is no
-- dedicated execution-history table; its explicit audit events live here.
delete from public.system_activity_logs activity
using public.email_mailboxes mailbox
where activity.target_type = 'email_mailbox'
  and activity.target_id = mailbox.id::text
  and mailbox.mailbox_type = 'shared'
  and activity.event_type in (
    'email_rule_created', 'email_rule_enabled', 'email_rule_disabled', 'email_rule_deleted'
  );
delete from public.email_rules rules
using public.email_mailboxes mailbox
where rules.mailbox_id = mailbox.id and mailbox.mailbox_type = 'shared';

drop policy if exists "Retired shared automation rules are unavailable" on public.email_rules;
create policy "Retired shared automation rules are unavailable"
  on public.email_rules as restrictive for all to authenticated
  using (not exists (
    select 1 from public.email_mailboxes mailbox
    where mailbox.id = mailbox_id and mailbox.mailbox_type = 'shared'
  ))
  with check (not exists (
    select 1 from public.email_mailboxes mailbox
    where mailbox.id = mailbox_id and mailbox.mailbox_type = 'shared'
  ));

-- Durable, service-role-only manifest survives ticket deletion and failed Storage
-- API runs. Never DELETE storage.objects in SQL: it would orphan physical files.
create table if not exists public.retired_internal_bug_screenshot_cleanup (
  bucket_id text not null check (bucket_id = 'bug-report-screenshots'),
  object_name text not null,
  primary key (bucket_id, object_name)
);
alter table public.retired_internal_bug_screenshot_cleanup enable row level security;
revoke all on public.retired_internal_bug_screenshot_cleanup from public, anon, authenticated;
grant select, delete on public.retired_internal_bug_screenshot_cleanup to service_role;

insert into public.retired_internal_bug_screenshot_cleanup (bucket_id, object_name)
select distinct 'bug-report-screenshots', ticket.screenshot_path
from public.support_tickets ticket
join storage.objects object
  on object.bucket_id = 'bug-report-screenshots' and object.name = ticket.screenshot_path
where ticket.internal_only is true and ticket.developer_flag is true and ticket.category = 'bug'
  and ticket.screenshot_path is not null
  and not exists (
    select 1 from public.support_tickets retained
    where retained.screenshot_path = ticket.screenshot_path
      and not (retained.internal_only is true and retained.developer_flag is true and retained.category = 'bug')
  )
on conflict do nothing;

-- All three values are set by the retired submit-bug-report endpoint. Category
-- 'bug' alone, internal IT requests, and customer tickets are NOT deletion scopes.
delete from public.support_tickets
where internal_only is true and developer_flag is true and category = 'bug';
-- support_ticket_comments for these IDs cascade; linked support conversations
-- and Wildfire records survive (their ticket FK is ON DELETE SET NULL).

drop policy if exists "Retired internal bug reports cannot be created" on public.support_tickets;
create policy "Retired internal bug reports cannot be created"
  on public.support_tickets as restrictive for insert to authenticated
  with check (not (internal_only is true and developer_flag is true and category = 'bug'));
drop policy if exists "Retired internal bug reports cannot be restored" on public.support_tickets;
create policy "Retired internal bug reports cannot be restored"
  on public.support_tickets as restrictive for update to authenticated
  using (true)
  with check (not (internal_only is true and developer_flag is true and category = 'bug'));

drop policy if exists "Staff upload bug report screenshots" on storage.objects;
drop policy if exists "Permitted users read bug report screenshots" on storage.objects;
drop policy if exists "Staff delete own bug report screenshots" on storage.objects;

commit;


-- Source: supabase/migrations/20261111100000_wildfire_workflow.sql
-- Re-runnable workflow upgrade. Only legacy site-survey rows are intentionally removed.
begin;

alter table public.wildfire_opportunities
  alter column organization_id drop not null,
  add column if not exists prospect_name text not null default '',
  add column if not exists prospect_website text not null default '',
  add column if not exists prospect_email text not null default '',
  add column if not exists prospect_phone text not null default '',
  add column if not exists prospect_location text not null default '',
  add column if not exists research_notes text not null default '',
  add column if not exists source_urls jsonb not null default '[]'::jsonb;
alter table public.wildfire_properties
  alter column organization_id drop not null,
  add column if not exists opportunity_id uuid references public.wildfire_opportunities(id) on delete set null;
alter table public.wildfire_quotes
  add column if not exists proposal text not null default '',
  add column if not exists snapshot jsonb,
  add column if not exists snapshot_sha256 text,
  add column if not exists published_at timestamptz;
alter table public.wildfire_deployments
  add column if not exists quote_id uuid references public.wildfire_quotes(id) on delete restrict;
create unique index if not exists wildfire_deployment_quote_unique on public.wildfire_deployments(quote_id) where quote_id is not null;
create index if not exists wildfire_properties_opportunity_idx on public.wildfire_properties(opportunity_id);

-- Preserve all proposals, folding the latest narrative into its quote once.
drop trigger if exists wildfire_quotes_protect on public.wildfire_quotes;
update public.wildfire_quotes q set proposal = concat_ws(E'\n\n', p.title, nullif(p.project_overview, ''),
  nullif(p.scope, ''), nullif(p.assumptions, ''), nullif(p.terms, ''))
from (select distinct on (quote_id) * from public.wildfire_proposals order by quote_id, created_at desc, id desc) p
where p.quote_id = q.id and q.proposal = '' and q.snapshot is null;
update public.wildfire_quotes set snapshot_sha256=encode(sha256(convert_to(snapshot::text,'UTF8')),'hex')
where snapshot is not null and snapshot_sha256 is null;
delete from public.wildfire_site_surveys;

create or replace function public.wildfire_require_edit()
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_app_access('wildfire', 'edit') or not exists (
    select 1 from public.profiles where id = auth.uid()::text and account_status = 'active'
  ) then raise exception 'Active Wildfire editor access required.' using errcode = '42501'; end if;
end $$;
revoke all on function public.wildfire_require_edit() from public, anon;
grant execute on function public.wildfire_require_edit() to authenticated;

create or replace function public.wildfire_guard_quote()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' or new.snapshot is not null or new.snapshot_sha256 is not null or new.published_at is not null then
      raise exception 'New quotes must be unpublished drafts.';
    end if;
    return new;
  end if;
  if old.snapshot is not null or old.status <> 'draft' then
    -- The service can transition public lifecycle status, never commercial content.
    if tg_op = 'UPDATE' and auth.role() = 'service_role'
      and (to_jsonb(new) - array['status','updated_at']) = (to_jsonb(old) - array['status','updated_at'])
      and new.status in ('sent','viewed','accepted','rejected','expired') then return new; end if;
    raise exception 'Published or non-draft quotes are immutable. Create a new version.';
  end if;
  if tg_op = 'UPDATE' and (new.status <> 'draft' or new.snapshot is not null or new.snapshot_sha256 is not null or new.published_at is not null)
    and auth.role() is distinct from 'service_role' then
    raise exception 'Only the publishing service may publish a quote.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger wildfire_quotes_protect before insert or update or delete on public.wildfire_quotes
for each row execute function public.wildfire_guard_quote();

create or replace function public.wildfire_guard_quote_child()
returns trigger language plpgsql set search_path = public as $$
declare q public.wildfire_quotes;
begin
  -- Lock the parent, serializing line edits against publication and saving.
  if tg_op <> 'INSERT' then
    select * into q from public.wildfire_quotes where id = old.quote_id for update;
    if q.status <> 'draft' or q.snapshot is not null then raise exception 'Quote content is draft-only.'; end if;
  end if;
  if tg_op <> 'DELETE' then
    select * into q from public.wildfire_quotes where id = new.quote_id for update;
    if q.status <> 'draft' or q.snapshot is not null then raise exception 'Quote content is draft-only.'; end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists wildfire_quote_lines_protect_version on public.wildfire_quote_lines;
create trigger wildfire_quote_lines_protect_version before insert or update or delete on public.wildfire_quote_lines
for each row execute function public.wildfire_guard_quote_child();
drop trigger if exists wildfire_quote_costs_protect_version on public.wildfire_quote_costs;
create trigger wildfire_quote_costs_protect_version before insert or update or delete on public.wildfire_quote_costs
for each row execute function public.wildfire_guard_quote_child();
drop trigger if exists wildfire_proposals_quote_guard on public.wildfire_proposals;
create trigger wildfire_proposals_quote_guard before insert or update or delete on public.wildfire_proposals
for each row execute function public.wildfire_guard_quote_child();

create or replace function public.wildfire_create_site_plan(p_property_id uuid, p_opportunity_id uuid, p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare result uuid; prop public.wildfire_properties; opp public.wildfire_opportunities;
begin
  perform public.wildfire_require_edit();
  select * into prop from public.wildfire_properties where id = p_property_id for update;
  if not found then raise exception 'Property not found.'; end if;
  if p_opportunity_id is not null then
    select * into opp from public.wildfire_opportunities where id = p_opportunity_id for update;
    if not found then raise exception 'Opportunity not found.'; end if;
    if prop.opportunity_id is not null and prop.opportunity_id <> opp.id
      or (prop.organization_id is not null and opp.organization_id is not null and prop.organization_id <> opp.organization_id)
      then raise exception 'Property and opportunity do not match.'; end if;
    update public.wildfire_properties set opportunity_id = opp.id where id = prop.id;
    update public.wildfire_opportunities set property_id = prop.id where id = opp.id;
  end if;
  insert into public.wildfire_site_plans(property_id,opportunity_id,name,version,boundary_geojson,created_by)
  select prop.id,p_opportunity_id,trim(p_name),coalesce(max(version),0)+1,prop.boundary_geojson,auth.uid()::text
  from public.wildfire_site_plans where property_id = prop.id and name = trim(p_name)
  returning id into result;
  return result;
end $$;

create or replace function public.wildfire_create_quote_from_plan(p_site_plan_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare plan public.wildfire_site_plans; opp public.wildfire_opportunities; result uuid;
begin
  perform public.wildfire_require_edit();
  select * into plan from public.wildfire_site_plans where id = p_site_plan_id for update;
  if not found or plan.opportunity_id is null then raise exception 'Link the site plan to an opportunity first.'; end if;
  select * into opp from public.wildfire_opportunities where id = plan.opportunity_id for update;
  insert into public.wildfire_quotes(opportunity_id,property_id,site_plan_id,version,currency,created_by)
  select opp.id,plan.property_id,plan.id,coalesce(max(version),0)+1,opp.currency,auth.uid()::text
  from public.wildfire_quotes where opportunity_id = opp.id returning id into result;
  insert into public.wildfire_quote_lines(quote_id,product_id,description,quantity,unit_price,created_by)
  select result,p.id,p.name,count(*),p.list_price,auth.uid()::text
  from public.wildfire_site_placements s join public.wildfire_products p on p.id = s.product_id
  where s.site_plan_id = plan.id and s.placement_type <> 'coverage_zone'
  group by p.id,p.name,p.list_price;
  return result;
end $$;

create or replace function public.wildfire_save_quote(
  p_quote_id uuid,p_currency text,p_discount numeric,p_tax numeric,p_expires_at date,
  p_terms text,p_proposal text,p_lines jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare q public.wildfire_quotes;
begin
  perform public.wildfire_require_edit();
  select * into q from public.wildfire_quotes where id = p_quote_id for update;
  if not found or q.status <> 'draft' or q.snapshot is not null then raise exception 'Only draft quotes may be saved.'; end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) > 500 then raise exception 'Provide up to 500 quote lines.'; end if;
  update public.wildfire_quotes set currency=p_currency,discount=p_discount,tax=p_tax,expires_at=p_expires_at,
    terms=p_terms,proposal=p_proposal where id=q.id;
  delete from public.wildfire_quote_lines where quote_id=q.id;
  insert into public.wildfire_quote_lines(quote_id,product_id,description,quantity,unit_price,recurring,created_by)
  select q.id,x.product_id,x.description,x.quantity,x.unit_price,coalesce(x.recurring,false),auth.uid()::text
  from jsonb_to_recordset(p_lines) as x(product_id uuid,description text,quantity numeric,unit_price numeric,recurring boolean);
  return q.id;
end $$;

create or replace function public.wildfire_clone_quote(p_quote_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare q public.wildfire_quotes; result uuid;
begin
  perform public.wildfire_require_edit();
  select * into q from public.wildfire_quotes where id = p_quote_id;
  if not found then raise exception 'Quote not found.'; end if;
  perform 1 from public.wildfire_opportunities where id=q.opportunity_id for update;
  select * into q from public.wildfire_quotes where id=q.id for update;
  insert into public.wildfire_quotes(opportunity_id,property_id,site_plan_id,version,currency,discount,tax,expires_at,terms,proposal,created_by)
  select q.opportunity_id,q.property_id,q.site_plan_id,coalesce(max(version),0)+1,q.currency,q.discount,q.tax,q.expires_at,q.terms,q.proposal,auth.uid()::text
  from public.wildfire_quotes where opportunity_id=q.opportunity_id returning id into result;
  insert into public.wildfire_quote_lines(quote_id,product_id,description,quantity,unit_price,recurring,created_by)
  select result,product_id,description,quantity,unit_price,recurring,auth.uid()::text from public.wildfire_quote_lines where quote_id=q.id;
  return result;
end $$;

create table if not exists public.wildfire_quote_links (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.wildfire_quotes(id) on delete restrict,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_by text not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
create table if not exists public.wildfire_quote_acceptances (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null unique references public.wildfire_quotes(id) on delete restrict,
  link_id uuid not null references public.wildfire_quote_links(id) on delete restrict,
  signer_name text not null,
  signer_email text not null,
  signature_png text not null,
  signature_sha256 text not null check (signature_sha256 ~ '^[a-f0-9]{64}$'),
  snapshot jsonb not null,
  snapshot_sha256 text not null check (snapshot_sha256 ~ '^[a-f0-9]{64}$'),
  acknowledged boolean not null check (acknowledged),
  audit jsonb not null default '{}'::jsonb,
  accepted_at timestamptz not null default now()
);
alter table public.wildfire_quote_links enable row level security;
alter table public.wildfire_quote_acceptances enable row level security;
revoke all on public.wildfire_quote_links,public.wildfire_quote_acceptances from public,anon,authenticated;
grant select,insert,update on public.wildfire_quote_links to service_role;
grant select,insert on public.wildfire_quote_acceptances to service_role;

create or replace function public.wildfire_immutable_acceptance()
returns trigger language plpgsql as $$
begin raise exception 'Signature and acceptance evidence is immutable.'; end $$;
drop trigger if exists wildfire_acceptance_immutable on public.wildfire_quote_acceptances;
create trigger wildfire_acceptance_immutable before update or delete on public.wildfire_quote_acceptances
for each row execute function public.wildfire_immutable_acceptance();

create table if not exists public.wildfire_deployment_events (
  id uuid primary key default gen_random_uuid(),
  deployment_id uuid not null references public.wildfire_deployments(id) on delete restrict,
  event_type text not null check (event_type in ('quote_accepted','status_changed','note')),
  body text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_by text default auth.uid()::text references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.wildfire_deployment_tasks (
  id uuid primary key default gen_random_uuid(),
  deployment_id uuid not null references public.wildfire_deployments(id) on delete restrict,
  title text not null check (char_length(title) between 1 and 300),
  status text not null default 'todo' check (status in ('todo','in_progress','done')),
  assigned_to text references public.profiles(id) on delete set null,
  due_at timestamptz,
  notes text not null default '',
  created_by text not null default auth.uid()::text references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists wildfire_deployment_events_time_idx on public.wildfire_deployment_events(deployment_id,created_at desc);
create index if not exists wildfire_deployment_tasks_idx on public.wildfire_deployment_tasks(deployment_id,status);
alter table public.wildfire_deployment_events enable row level security;
alter table public.wildfire_deployment_tasks enable row level security;
drop policy if exists wildfire_events_read on public.wildfire_deployment_events;
create policy wildfire_events_read on public.wildfire_deployment_events for select to authenticated using(public.has_app_access('wildfire','view'));
drop policy if exists wildfire_events_note on public.wildfire_deployment_events;
create policy wildfire_events_note on public.wildfire_deployment_events for insert to authenticated
with check(public.has_app_access('wildfire','edit') and created_by=auth.uid()::text and event_type='note');
drop policy if exists wildfire_tasks_read on public.wildfire_deployment_tasks;
create policy wildfire_tasks_read on public.wildfire_deployment_tasks for select to authenticated using(public.has_app_access('wildfire','view'));
drop policy if exists wildfire_tasks_edit on public.wildfire_deployment_tasks;
drop policy if exists wildfire_tasks_insert on public.wildfire_deployment_tasks;
create policy wildfire_tasks_insert on public.wildfire_deployment_tasks for insert to authenticated
with check(public.has_app_access('wildfire','edit') and created_by=auth.uid()::text);
drop policy if exists wildfire_tasks_update on public.wildfire_deployment_tasks;
create policy wildfire_tasks_update on public.wildfire_deployment_tasks for update to authenticated
using(public.has_app_access('wildfire','edit')) with check(public.has_app_access('wildfire','edit'));
drop policy if exists wildfire_tasks_delete on public.wildfire_deployment_tasks;
create policy wildfire_tasks_delete on public.wildfire_deployment_tasks for delete to authenticated using(public.has_app_access('wildfire','edit'));
grant select,insert on public.wildfire_deployment_events to authenticated;
revoke update,delete on public.wildfire_deployment_events from authenticated;
grant select,insert,update,delete on public.wildfire_deployment_tasks to authenticated;
drop trigger if exists wildfire_events_immutable on public.wildfire_deployment_events;
create trigger wildfire_events_immutable before update or delete on public.wildfire_deployment_events for each row execute function public.wildfire_immutable_acceptance();
drop trigger if exists wildfire_tasks_touch on public.wildfire_deployment_tasks;
create trigger wildfire_tasks_touch before update on public.wildfire_deployment_tasks for each row execute function public.wildfire_touch_updated_at();
drop trigger if exists wildfire_tasks_activity on public.wildfire_deployment_tasks;
create trigger wildfire_tasks_activity after insert or update or delete on public.wildfire_deployment_tasks for each row execute function public.wildfire_record_activity();

drop policy if exists "wildfire insert wildfire_deployments" on public.wildfire_deployments;
drop policy if exists "wildfire delete wildfire_deployments" on public.wildfire_deployments;
revoke insert,delete on public.wildfire_deployments from authenticated;
create or replace function public.wildfire_guard_deployment()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op='INSERT' then
    if auth.role() is distinct from 'service_role' or not exists (
      select 1 from public.wildfire_quote_acceptances where quote_id=new.quote_id
    ) then raise exception 'Deployments are created only by quote acceptance.'; end if;
  elsif new.quote_id is distinct from old.quote_id or new.organization_id is distinct from old.organization_id
    or new.opportunity_id is distinct from old.opportunity_id or new.property_id is distinct from old.property_id
    or new.site_plan_id is distinct from old.site_plan_id or new.contract_id is distinct from old.contract_id then
    raise exception 'Deployment acceptance links are immutable.';
  end if;
  return new;
end $$;
drop trigger if exists wildfire_deployment_guard on public.wildfire_deployments;
create trigger wildfire_deployment_guard before insert or update on public.wildfire_deployments for each row execute function public.wildfire_guard_deployment();

-- Protect the source relationship graph after acceptance as well as the deployment itself.
create or replace function public.wildfire_guard_accepted_source_links()
returns trigger language plpgsql security definer set search_path = public as $$
declare linked boolean := false; changed boolean := false;
begin
  if tg_table_name='wildfire_opportunities' then
    select exists(select 1 from public.wildfire_deployments where opportunity_id=old.id and quote_id is not null) into linked;
    changed=new.organization_id is distinct from old.organization_id or new.contact_id is distinct from old.contact_id
      or new.property_id is distinct from old.property_id;
  elsif tg_table_name='wildfire_properties' then
    select exists(select 1 from public.wildfire_deployments where property_id=old.id and quote_id is not null) into linked;
    changed=new.organization_id is distinct from old.organization_id or new.opportunity_id is distinct from old.opportunity_id;
  elsif tg_table_name='wildfire_site_plans' then
    select exists(select 1 from public.wildfire_deployments where site_plan_id=old.id and quote_id is not null) into linked;
    changed=new.property_id is distinct from old.property_id or new.opportunity_id is distinct from old.opportunity_id;
  elsif tg_table_name='crm_contacts' then
    select exists(select 1 from public.wildfire_deployments d join public.wildfire_opportunities o on o.id=d.opportunity_id
      where o.contact_id=old.id and d.quote_id is not null) into linked;
    changed=new.organization_id is distinct from old.organization_id;
  end if;
  if linked and changed then raise exception 'Accepted Wildfire source relationships are immutable.'; end if;
  return new;
end $$;
do $$
declare t text;
begin
  foreach t in array array['wildfire_opportunities','wildfire_properties','wildfire_site_plans','crm_contacts'] loop
    execute format('drop trigger if exists wildfire_accepted_links_guard on public.%I',t);
    execute format('create trigger wildfire_accepted_links_guard before update on public.%I for each row execute function public.wildfire_guard_accepted_source_links()',t);
  end loop;
end $$;
create or replace function public.wildfire_deployment_status_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    insert into public.wildfire_deployment_events(deployment_id,event_type,body,metadata,created_by)
    values(new.id,'status_changed','Deployment status changed.',jsonb_build_object('from',old.status,'to',new.status),auth.uid()::text);
  end if;
  return new;
end $$;
drop trigger if exists wildfire_deployment_status_history on public.wildfire_deployments;
create trigger wildfire_deployment_status_history after update on public.wildfire_deployments for each row execute function public.wildfire_deployment_status_event();

-- Service-only publisher: captures a public whitelist, never internal costs/research.
create or replace function public.wildfire_publish_quote(p_quote_id uuid,p_token_hash text,p_actor_id text,p_expires_at timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare q public.wildfire_quotes; opp public.wildfire_opportunities; prop public.wildfire_properties;
  plan public.wildfire_site_plans; snap jsonb; lines jsonb; subtotal numeric; expiry timestamptz;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service-only RPC.' using errcode='42501'; end if;
  select * into q from public.wildfire_quotes where id=p_quote_id for update;
  if not found or q.status<>'draft' or q.snapshot is not null then raise exception 'Only draft quotes may be published.'; end if;
  select * into opp from public.wildfire_opportunities where id=q.opportunity_id for update;
  select * into prop from public.wildfire_properties where id=q.property_id for update;
  if prop.id is null then raise exception 'Quote needs a property before publishing.'; end if;
  if prop.opportunity_id is not null and prop.opportunity_id<>opp.id
    or (prop.organization_id is not null and opp.organization_id is not null and prop.organization_id<>opp.organization_id)
    then raise exception 'Quote property and opportunity do not match.'; end if;
  select * into plan from public.wildfire_site_plans where id=q.site_plan_id;
  if plan.id is not null and (plan.property_id<>prop.id or plan.opportunity_id is distinct from opp.id)
    then raise exception 'Quote site plan does not match.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('product_id',product_id,'description',description,'quantity',quantity,
    'unit_price',unit_price,'line_total',line_total,'recurring',recurring) order by created_at,id),'[]'::jsonb),
    coalesce(sum(line_total),0) into lines,subtotal from public.wildfire_quote_lines where quote_id=q.id;
  if jsonb_array_length(lines)=0 or subtotal-q.discount<0 or length(trim(q.terms))=0 then
    raise exception 'Quote needs lines, nonnegative total, and explicit terms.';
  end if;
  expiry=least(p_expires_at,coalesce((q.expires_at+1)::timestamptz,p_expires_at));
  if expiry is null or expiry<=now() or expiry>now()+interval '90 days' then raise exception 'Link expiry must be within 90 days.'; end if;
  snap=jsonb_build_object('quoteId',q.id,'version',q.version,'currency',q.currency,'discount',q.discount,'tax',q.tax,
    'subtotal',subtotal,'total',subtotal-q.discount+q.tax,'terms',q.terms,'proposal',q.proposal,'lines',lines,
    'expires_at',q.expires_at,'published_at',now(),
    'prospect',jsonb_build_object('name',coalesce(nullif(opp.prospect_name,''),(select name from public.crm_organizations where id=opp.organization_id),opp.name),
      'website',opp.prospect_website,'location',opp.prospect_location),
    'crm',jsonb_build_object('organization_id',opp.organization_id,'contact_id',opp.contact_id),
    'property',jsonb_build_object('id',prop.id,'label',prop.label,'address',prop.address,'city',prop.city,'region',prop.region,
      'postal_code',prop.postal_code,'country',prop.country,'latitude',prop.latitude,'longitude',prop.longitude,'boundary_geojson',prop.boundary_geojson),
    'site_plan',case when plan.id is null then null else jsonb_build_object('id',plan.id,'name',plan.name,'version',plan.version,
      'boundary_geojson',plan.boundary_geojson,'coverage_assumptions',plan.coverage_assumptions,
      'placements',(select coalesce(jsonb_agg(jsonb_build_object('product_id',s.product_id,'placement_type',s.placement_type,
        'label',s.label,'latitude',s.latitude,'longitude',s.longitude,'configuration',s.configuration,
        'heading_degrees',s.heading_degrees,'horizontal_fov_degrees',s.horizontal_fov_degrees) order by s.created_at,s.id),'[]'::jsonb)
        from public.wildfire_site_placements s where s.site_plan_id=plan.id)) end);
  update public.wildfire_quotes set snapshot=snap,snapshot_sha256=encode(sha256(convert_to(snap::text,'UTF8')),'hex'),published_at=now(),status='sent' where id=q.id;
  insert into public.wildfire_quote_links(quote_id,token_hash,expires_at,created_by) values(q.id,p_token_hash,expiry,p_actor_id);
  update public.wildfire_opportunities set stage='proposal_sent' where id=opp.id and stage not in ('won','lost');
  return jsonb_build_object('expiresAt',expiry);
end $$;

create or replace function public.wildfire_accept_quote(
  p_token_hash text,p_name text,p_email text,p_signature_png text,p_signature_sha256 text,
  p_snapshot_sha256 text,p_acknowledged boolean,p_audit jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare link public.wildfire_quote_links; q public.wildfire_quotes; opp public.wildfire_opportunities;
  org_id uuid; contact uuid; deployment uuid; crm_org uuid; crm_contact uuid;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service-only RPC.' using errcode='42501'; end if;
  select * into link from public.wildfire_quote_links where token_hash=p_token_hash for update;
  if not found or link.revoked_at is not null then raise exception 'Invalid or revoked quote link.'; end if;
  select * into q from public.wildfire_quotes where id=link.quote_id for update;
  -- Same valid capability may retry after acceptance (even after its original expiry).
  select id into deployment from public.wildfire_deployments where quote_id=q.id;
  if deployment is not null then return jsonb_build_object('deploymentId',deployment,'status','accepted'); end if;
  if link.expires_at<=now() or q.status not in ('sent','viewed') or q.snapshot is null then raise exception 'Quote link is no longer active.'; end if;
  if p_acknowledged is distinct from true or p_name is null or p_email is null or length(trim(p_name)) not between 2 and 200
    or length(p_email)>254 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or p_signature_png is null or length(p_signature_png)>700000 or p_signature_png not like 'data:image/png;base64,%'
    then raise exception 'Name, email, drawn PNG signature, and terms acknowledgement are required.'; end if;
  if p_snapshot_sha256 is distinct from q.snapshot_sha256
    or p_signature_sha256 is distinct from encode(sha256(decode(substring(p_signature_png from 23),'base64')),'hex')
    then raise exception 'Signature or snapshot hash does not match.'; end if;
  select * into opp from public.wildfire_opportunities where id=q.opportunity_id for update;
  -- Use only explicitly linked IDs frozen at publication; never merge by name/email.
  crm_org=nullif(q.snapshot->'crm'->>'organization_id','')::uuid;
  crm_contact=nullif(q.snapshot->'crm'->>'contact_id','')::uuid;
  if crm_contact is not null then
    select organization_id into org_id from public.crm_contacts where id=crm_contact for update;
    if not found then raise exception 'Prelinked contact no longer exists.'; end if;
    if crm_org is not null and org_id is distinct from crm_org then raise exception 'Prelinked CRM company and contact do not match.'; end if;
    crm_org=coalesce(crm_org,org_id);
  end if;
  if crm_org is not null then
    perform 1 from public.crm_organizations where id=crm_org for update;
    if not found then raise exception 'Prelinked company no longer exists.'; end if;
  else
    insert into public.crm_organizations(name,category,website,notes,owner_id,created_by)
    values(left(coalesce(nullif(q.snapshot->'prospect'->>'name',''),opp.name),200),'customer',
      nullif(q.snapshot->'prospect'->>'website',''),'Created on Wildfire quote acceptance.',opp.owner_id,q.created_by)
    returning id into crm_org;
  end if;
  if crm_contact is null then
    insert into public.crm_contacts(organization_id,name,email,phone,notes,owner_id,created_by)
    values(crm_org,trim(p_name),lower(trim(p_email)),nullif(opp.prospect_phone,''),'Signer of accepted Wildfire quote.',opp.owner_id,q.created_by)
    returning id into crm_contact;
  elsif org_id is null then
    update public.crm_contacts set organization_id=crm_org where id=crm_contact;
  end if;
  insert into public.wildfire_quote_acceptances(quote_id,link_id,signer_name,signer_email,signature_png,signature_sha256,
    snapshot,snapshot_sha256,acknowledged,audit)
  values(q.id,link.id,trim(p_name),lower(trim(p_email)),p_signature_png,p_signature_sha256,q.snapshot,p_snapshot_sha256,true,coalesce(p_audit,'{}'::jsonb));
  update public.wildfire_quotes set status='accepted' where id=q.id;
  update public.wildfire_opportunities set organization_id=crm_org,contact_id=crm_contact,stage='won' where id=opp.id;
  update public.wildfire_properties set organization_id=crm_org,opportunity_id=opp.id where id=q.property_id;
  insert into public.wildfire_deployments(quote_id,organization_id,property_id,opportunity_id,site_plan_id,status,created_by)
  values(q.id,crm_org,q.property_id,opp.id,q.site_plan_id,'contract_executed',q.created_by) returning id into deployment;
  insert into public.wildfire_deployment_events(deployment_id,event_type,body,metadata,created_by)
  values(deployment,'quote_accepted','Customer accepted the quote and terms.',
    jsonb_build_object('quote_id',q.id,'quote_version',q.version,'signer_name',trim(p_name),'snapshot_sha256',p_snapshot_sha256),null);
  return jsonb_build_object('deploymentId',deployment,'status','accepted');
end $$;

-- Explicit RPC grants (Postgres defaults new functions to PUBLIC execute).
revoke all on function public.wildfire_publish_quote(uuid,text,text,timestamptz),
  public.wildfire_accept_quote(text,text,text,text,text,text,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.wildfire_publish_quote(uuid,text,text,timestamptz),
  public.wildfire_accept_quote(text,text,text,text,text,text,boolean,jsonb) to service_role;
revoke all on function public.wildfire_create_site_plan(uuid,uuid,text),public.wildfire_create_quote_from_plan(uuid),
  public.wildfire_save_quote(uuid,text,numeric,numeric,date,text,text,jsonb),public.wildfire_clone_quote(uuid) from public,anon;
grant execute on function public.wildfire_create_site_plan(uuid,uuid,text),public.wildfire_create_quote_from_plan(uuid),
  public.wildfire_save_quote(uuid,text,numeric,numeric,date,text,text,jsonb),public.wildfire_clone_quote(uuid) to authenticated;
-- No capability or anonymous direct table access; all public access uses the Edge handler.
revoke all on public.wildfire_quotes,public.wildfire_quote_lines,public.wildfire_proposals from anon;

commit;
