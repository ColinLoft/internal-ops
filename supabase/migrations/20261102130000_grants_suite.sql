-- Grants suite: prospects, contacts (POCs), application requirements, resources, automation settings, CRM sync. Safe to re-run.

alter table public.program_tasks add column if not exists source_ref text;
create unique index if not exists program_tasks_source_ref_idx on public.program_tasks (source_ref) where source_ref is not null;

-- ---------------------------------------------------------------------------
-- Prospects ("possible grants")
-- ---------------------------------------------------------------------------
create table if not exists public.grant_prospects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 300),
  funder_name text,
  funder_org_id uuid references public.crm_organizations(id) on delete set null,
  url text,
  deadline date,
  amount_min numeric(14,2),
  amount_max numeric(14,2),
  focus_areas text,
  eligibility text,
  fit_score integer check (fit_score between 0 and 100),
  fit_notes text,
  status text not null default 'new' check (status in ('new', 'reviewing', 'pursuing', 'passed', 'converted')),
  source text,
  notes text,
  owner_id text references public.profiles(id) on delete set null,
  grant_id uuid references public.grants(id) on delete set null,
  created_by text default auth.uid()::text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists grant_prospects_status_idx on public.grant_prospects (status, deadline);

-- ---------------------------------------------------------------------------
-- Points of contact per grant
-- ---------------------------------------------------------------------------
create table if not exists public.grant_contacts (
  id uuid primary key default gen_random_uuid(),
  grant_id uuid not null references public.grants(id) on delete cascade,
  crm_contact_id uuid references public.crm_contacts(id) on delete set null,
  name text not null,
  role text not null default 'program_officer',
  title text,
  email text,
  phone text,
  is_primary boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists grant_contacts_grant_idx on public.grant_contacts (grant_id);

-- ---------------------------------------------------------------------------
-- Application requirements / checklist
-- ---------------------------------------------------------------------------
create table if not exists public.grant_requirements (
  id uuid primary key default gen_random_uuid(),
  grant_id uuid not null references public.grants(id) on delete cascade,
  title text not null,
  kind text not null default 'document' check (kind in ('document', 'narrative', 'budget', 'letter', 'form', 'attachment', 'other')),
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done', 'na')),
  due_date date,
  assignee_id text references public.profiles(id) on delete set null,
  notes text,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists grant_requirements_grant_idx on public.grant_requirements (grant_id, position);

-- ---------------------------------------------------------------------------
-- Resource library (boilerplate, templates, directories, links)
-- ---------------------------------------------------------------------------
create table if not exists public.grant_resources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default 'boilerplate' check (category in ('boilerplate', 'template', 'directory', 'guide', 'document', 'link')),
  body text,
  url text,
  tags text[] not null default '{}',
  created_by text default auth.uid()::text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Automation settings (single row)
-- ---------------------------------------------------------------------------
create table if not exists public.grant_settings (
  id integer primary key default 1 check (id = 1),
  follow_up_days_after_apply integer not null default 14 check (follow_up_days_after_apply between 1 and 365),
  report_reminder_days integer not null default 14 check (report_reminder_days between 1 and 180),
  deadline_reminder_days integer not null default 7 check (deadline_reminder_days between 1 and 180),
  task_on_apply boolean not null default true,
  task_on_decline boolean not null default true,
  remind_reports boolean not null default true,
  remind_deadlines boolean not null default true,
  remind_follow_ups boolean not null default true,
  sync_crm boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.grant_settings (id) values (1) on conflict (id) do nothing;

do $$
declare t text;
begin
  foreach t in array array['grant_prospects','grant_contacts','grant_requirements','grant_resources','grant_settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Finance staff read %s" on public.%I', t, t);
    execute format('create policy "Finance staff read %s" on public.%I for select to authenticated using (public.has_app_access(''finance'', ''view''))', t, t);
    execute format('drop policy if exists "Finance staff manage %s" on public.%I', t, t);
    execute format('create policy "Finance staff manage %s" on public.%I for all to authenticated using (public.has_app_access(''finance'', ''edit'')) with check (public.has_app_access(''finance'', ''edit''))', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Stage automation: applied and declined
-- ---------------------------------------------------------------------------
create or replace function public.grant_stage_automation()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  cfg public.grant_settings;
  assignee text;
begin
  if new.stage is not distinct from old.stage then return new; end if;
  select * into cfg from public.grant_settings where id = 1;
  assignee := coalesce(new.owner_id, new.secured_by_id, new.created_by);

  if new.stage = 'applied' then
    new.application_submitted_at := coalesce(new.application_submitted_at, current_date);
    if cfg.remind_follow_ups and new.next_follow_up_at is null then
      new.next_follow_up_at := current_date + cfg.follow_up_days_after_apply;
    end if;
    if cfg.task_on_apply then
      insert into public.program_tasks (title, description, assignee_id, priority, due_date, status, progress, project_id, grant_id, source, source_ref, created_by)
      values ('Confirm ' || coalesce(new.funder_name, new.name) || ' received the application', 'Check that the funder received the full application and ask when to expect a decision.', assignee, 'medium', current_date + cfg.follow_up_days_after_apply, 'not_started', 0, new.project_id, new.id, 'grant_automation', 'applied:' || new.id, coalesce(new.created_by, assignee))
      on conflict do nothing;
    end if;
  elsif new.stage = 'declined' then
    new.decision_at := coalesce(new.decision_at, current_date);
    if cfg.task_on_decline then
      insert into public.program_tasks (title, description, assignee_id, priority, due_date, status, progress, project_id, grant_id, source, source_ref, created_by)
      values ('Thank ' || coalesce(new.funder_name, new.name) || ' and ask for feedback', 'Send a gracious note, ask for feedback on the application, and keep the relationship warm for next time.', assignee, 'medium', current_date + 7, 'not_started', 0, new.project_id, new.id, 'grant_automation', 'declined:' || new.id, coalesce(new.created_by, assignee))
      on conflict do nothing;
    end if;
  elsif new.stage = 'awarded' then
    new.decision_at := coalesce(new.decision_at, current_date);
    new.award_date := coalesce(new.award_date, current_date);
  end if;
  return new;
end $$;
drop trigger if exists grants_stage_automation on public.grants;
create trigger grants_stage_automation before update of stage on public.grants for each row execute function public.grant_stage_automation();

-- ---------------------------------------------------------------------------
-- Mirror logged emails, calls and meetings into the CRM funder record
-- ---------------------------------------------------------------------------
create or replace function public.grant_event_to_crm()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  g public.grants;
  cfg public.grant_settings;
begin
  if new.event_type not in ('email_sent', 'email_received', 'call', 'meeting') then return new; end if;
  select * into cfg from public.grant_settings where id = 1;
  if not coalesce(cfg.sync_crm, true) then return new; end if;
  select * into g from public.grants where id = new.grant_id;
  if g.funder_org_id is null then return new; end if;
  insert into public.crm_interactions (organization_id, contact_id, kind, subject, body, occurred_at, owner_id, created_by)
  values (g.funder_org_id, g.contact_id, case when new.event_type like 'email%' then 'email' else new.event_type end, left('[Grant: ' || g.name || '] ' || new.title, 300), new.body, new.event_date, g.owner_id, coalesce(new.created_by, g.created_by, g.owner_id));
  return new;
exception when others then
  return new;
end $$;
drop trigger if exists grant_events_to_crm on public.grant_events;
create trigger grant_events_to_crm after insert on public.grant_events for each row execute function public.grant_event_to_crm();

-- ---------------------------------------------------------------------------
-- Reminder automation. The Grants app calls this when it loads; it is idempotent.
-- ---------------------------------------------------------------------------
create or replace function public.grant_run_automations()
returns integer language plpgsql security definer set search_path = public as $$
declare
  cfg public.grant_settings;
  created integer := 0;
  r record;
  n integer;
begin
  if not public.has_app_access('finance', 'edit') then return 0; end if;
  select * into cfg from public.grant_settings where id = 1;

  update public.grant_reports set status = 'overdue' where status = 'upcoming' and due_date < current_date;

  if cfg.remind_reports then
    for r in
      select rep.id, rep.title, rep.due_date, g.id as grant_id, g.name, g.project_id, coalesce(g.owner_id, g.secured_by_id, g.created_by) as assignee, g.created_by
      from public.grant_reports rep join public.grants g on g.id = rep.grant_id
      where rep.status in ('upcoming', 'overdue') and rep.due_date <= current_date + cfg.report_reminder_days
    loop
      insert into public.program_tasks (title, description, assignee_id, priority, due_date, status, progress, project_id, grant_id, source, source_ref, created_by)
      values ('Submit report: ' || r.title || ' (' || r.name || ')', 'Grant report due ' || r.due_date, r.assignee, 'high', r.due_date, 'not_started', 0, r.project_id, r.grant_id, 'grant_automation', 'report:' || r.id, coalesce(r.created_by, r.assignee))
      on conflict do nothing;
      get diagnostics n = row_count; created := created + n;
    end loop;
  end if;

  if cfg.remind_follow_ups then
    for r in
      select g.id, g.name, g.funder_name, g.project_id, g.next_follow_up_at, coalesce(g.owner_id, g.secured_by_id, g.created_by) as assignee, g.created_by
      from public.grants g
      where g.next_follow_up_at is not null and g.next_follow_up_at <= current_date + 2 and g.stage not in ('declined', 'closed')
    loop
      insert into public.program_tasks (title, description, assignee_id, priority, due_date, status, progress, project_id, grant_id, source, source_ref, created_by)
      values ('Follow up with ' || coalesce(r.funder_name, r.name), 'Scheduled follow-up for ' || r.name, r.assignee, 'medium', r.next_follow_up_at, 'not_started', 0, r.project_id, r.id, 'grant_automation', 'followup:' || r.id || ':' || r.next_follow_up_at, coalesce(r.created_by, r.assignee))
      on conflict do nothing;
      get diagnostics n = row_count; created := created + n;
    end loop;
  end if;

  if cfg.remind_deadlines then
    for r in
      select p.id, p.name, p.deadline, coalesce(p.owner_id, p.created_by) as assignee, p.created_by
      from public.grant_prospects p
      where p.status in ('reviewing', 'pursuing') and p.deadline is not null and p.deadline between current_date and current_date + cfg.deadline_reminder_days
    loop
      insert into public.program_tasks (title, description, assignee_id, priority, due_date, status, progress, source, source_ref, created_by)
      values ('Grant deadline approaching: ' || r.name, 'Decide whether to apply and prepare the application before ' || r.deadline, r.assignee, 'high', r.deadline, 'not_started', 0, 'grant_automation', 'prospect:' || r.id, coalesce(r.created_by, r.assignee))
      on conflict do nothing;
      get diagnostics n = row_count; created := created + n;
    end loop;
  end if;
  return created;
end $$;
grant execute on function public.grant_run_automations() to authenticated;
