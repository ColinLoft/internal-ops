-- Full project management, grants, and finance upgrades. Safe to re-run.

-- ---------------------------------------------------------------------------
-- Projects and tasks: richer fields, speed, and write access
-- ---------------------------------------------------------------------------
alter table public.program_projects
  add column if not exists notes text,
  add column if not exists budget_amount numeric(14,2),
  add column if not exists health text,
  add column if not exists created_by text default auth.uid()::text;

alter table public.program_tasks
  add column if not exists description text,
  add column if not exists notes text,
  add column if not exists estimate_hours numeric(8,2),
  add column if not exists completed_at timestamptz,
  add column if not exists created_by text default auth.uid()::text,
  add column if not exists grant_id uuid,
  add column if not exists source text;

create index if not exists program_tasks_project_idx on public.program_tasks (project_id);
create index if not exists program_tasks_assignee_idx on public.program_tasks (assignee_id);
create index if not exists program_tasks_parent_idx on public.program_tasks (parent_task_id);
create index if not exists program_tasks_due_idx on public.program_tasks (due_date);

-- Anyone signed in can create tasks for themselves or that they own; role holders manage everything.
drop policy if exists "Staff create their own tasks" on public.program_tasks;
create policy "Staff create their own tasks" on public.program_tasks
  for insert to authenticated
  with check (created_by = auth.uid()::text or assignee_id = auth.uid()::text);

drop policy if exists "Role access manages program_tasks" on public.program_tasks;
create policy "Role access manages program_tasks" on public.program_tasks
  for all to authenticated
  using (public.has_app_access('programs', 'edit'))
  with check (public.has_app_access('programs', 'edit'));

drop policy if exists "Task owners update their tasks" on public.program_tasks;
create policy "Task owners update their tasks" on public.program_tasks
  for update to authenticated
  using (created_by = auth.uid()::text or assignee_id = auth.uid()::text)
  with check (created_by = auth.uid()::text or assignee_id = auth.uid()::text);

drop policy if exists "Task owners delete their tasks" on public.program_tasks;
create policy "Task owners delete their tasks" on public.program_tasks
  for delete to authenticated
  using (created_by = auth.uid()::text);

drop policy if exists "Staff read program tasks" on public.program_tasks;
create policy "Staff read program tasks" on public.program_tasks
  for select to authenticated using (true);

drop policy if exists "Staff read program projects" on public.program_projects;
create policy "Staff read program projects" on public.program_projects
  for select to authenticated using (true);

drop policy if exists "Staff create projects" on public.program_projects;
create policy "Staff create projects" on public.program_projects
  for insert to authenticated with check (created_by = auth.uid()::text or owner_id = auth.uid()::text);

drop policy if exists "Project owners update projects" on public.program_projects;
create policy "Project owners update projects" on public.program_projects
  for update to authenticated
  using (created_by = auth.uid()::text or owner_id = auth.uid()::text)
  with check (created_by = auth.uid()::text or owner_id = auth.uid()::text);

create table if not exists public.project_members (
  project_id uuid not null references public.program_projects(id) on delete cascade,
  user_id text not null references public.profiles(id) on delete cascade,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
alter table public.project_members enable row level security;
drop policy if exists "Staff read project members" on public.project_members;
create policy "Staff read project members" on public.project_members for select to authenticated using (true);
drop policy if exists "Project people manage members" on public.project_members;
create policy "Project people manage members" on public.project_members for all to authenticated
  using (
    public.has_app_access('programs', 'edit')
    or exists (select 1 from public.program_projects p where p.id = project_id and (p.owner_id = auth.uid()::text or p.created_by = auth.uid()::text))
  )
  with check (
    public.has_app_access('programs', 'edit')
    or exists (select 1 from public.program_projects p where p.id = project_id and (p.owner_id = auth.uid()::text or p.created_by = auth.uid()::text))
  );

-- ---------------------------------------------------------------------------
-- Shared work-record tables (projects, tasks and grants)
-- ---------------------------------------------------------------------------
create or replace function public.can_view_entity(p_type text)
returns boolean language sql stable security definer set search_path = public as $$
  select case when p_type = 'grant' then public.has_app_access('finance', 'view') else true end;
$$;

create table if not exists public.entity_comments (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('project', 'task', 'grant')),
  entity_id uuid not null,
  body text not null check (char_length(body) between 1 and 8000),
  created_by text not null default auth.uid()::text,
  created_at timestamptz not null default now()
);
create table if not exists public.entity_activity (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('project', 'task', 'grant')),
  entity_id uuid not null,
  action text not null,
  detail text,
  created_by text default auth.uid()::text,
  created_at timestamptz not null default now()
);
create table if not exists public.entity_time_entries (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('project', 'task', 'grant')),
  entity_id uuid not null,
  minutes integer not null check (minutes > 0 and minutes <= 1440),
  note text,
  entry_date date not null default current_date,
  created_by text not null default auth.uid()::text,
  created_at timestamptz not null default now()
);
create table if not exists public.entity_attachments (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('project', 'task', 'grant')),
  entity_id uuid not null,
  name text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  created_by text not null default auth.uid()::text,
  created_at timestamptz not null default now()
);
create table if not exists public.entity_links (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('project', 'task', 'grant')),
  entity_id uuid not null,
  link_type text not null check (link_type in ('drive', 'calendar', 'finance', 'url', 'email', 'project', 'task')),
  target_id text,
  label text not null,
  url text,
  created_by text not null default auth.uid()::text,
  created_at timestamptz not null default now()
);
create table if not exists public.entity_checklist (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('project', 'task', 'grant')),
  entity_id uuid not null,
  text text not null,
  done boolean not null default false,
  position integer not null default 0,
  created_by text not null default auth.uid()::text,
  created_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['entity_comments','entity_activity','entity_time_entries','entity_attachments','entity_links','entity_checklist'] loop
    execute format('create index if not exists %I on public.%I (entity_type, entity_id, created_at desc)', t || '_entity_idx', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Read %s" on public.%I', t, t);
    execute format('create policy "Read %s" on public.%I for select to authenticated using (public.can_view_entity(entity_type))', t, t);
    execute format('drop policy if exists "Add %s" on public.%I', t, t);
    execute format('create policy "Add %s" on public.%I for insert to authenticated with check (created_by = auth.uid()::text and public.can_view_entity(entity_type))', t, t);
    execute format('drop policy if exists "Change %s" on public.%I', t, t);
    execute format('create policy "Change %s" on public.%I for update to authenticated using (public.can_view_entity(entity_type) and (created_by = auth.uid()::text or public.is_workspace_admin() or entity_type <> ''grant'')) with check (public.can_view_entity(entity_type))', t, t);
    execute format('drop policy if exists "Remove %s" on public.%I', t, t);
    execute format('create policy "Remove %s" on public.%I for delete to authenticated using (public.can_view_entity(entity_type) and (created_by = auth.uid()::text or public.is_workspace_admin()))', t, t);
  end loop;
end $$;

-- Private bucket for project/task/grant files and images.
insert into storage.buckets (id, name, public)
values ('work-files', 'work-files', false)
on conflict (id) do nothing;

drop policy if exists "Staff read work files" on storage.objects;
create policy "Staff read work files" on storage.objects for select to authenticated
  using (bucket_id = 'work-files');
drop policy if exists "Staff upload work files" on storage.objects;
create policy "Staff upload work files" on storage.objects for insert to authenticated
  with check (bucket_id = 'work-files' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Staff delete own work files" on storage.objects;
create policy "Staff delete own work files" on storage.objects for delete to authenticated
  using (bucket_id = 'work-files' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- Finance: richer record columns
-- ---------------------------------------------------------------------------
alter table public.finance_records
  add column if not exists category text,
  add column if not exists vendor text,
  add column if not exists record_date date,
  add column if not exists project_id uuid references public.program_projects(id) on delete set null,
  add column if not exists grant_id uuid;
create index if not exists finance_records_type_idx on public.finance_records (record_type, record_date);

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
create table if not exists public.grants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 300),
  funder_name text,
  funder_org_id uuid references public.crm_organizations(id) on delete set null,
  contact_id uuid references public.crm_contacts(id) on delete set null,
  contact_name text,
  contact_email text,
  contact_phone text,
  funder_emails text[] not null default '{}',
  website_url text,
  portal_url text,
  application_url text,
  stage text not null default 'prospect' check (stage in ('prospect', 'researching', 'preparing', 'applied', 'under_review', 'awarded', 'declined', 'reporting', 'closed')),
  source text,
  source_detail text,
  secured_by_id text references public.profiles(id) on delete set null,
  owner_id text references public.profiles(id) on delete set null,
  amount_requested numeric(14,2),
  amount_awarded numeric(14,2),
  in_kind_requested text,
  in_kind_awarded text,
  match_required text,
  restrictions text,
  obligations text,
  application_submitted_at date,
  decision_due_at date,
  decision_at date,
  award_date date,
  term_start date,
  term_end date,
  next_follow_up_at date,
  funder_response text,
  decision_notes text,
  notes text,
  project_id uuid references public.program_projects(id) on delete set null,
  award_tasks_created_at timestamptz,
  created_by text default auth.uid()::text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists grants_stage_idx on public.grants (stage);
create index if not exists grants_follow_up_idx on public.grants (next_follow_up_at);

create table if not exists public.grant_events (
  id uuid primary key default gen_random_uuid(),
  grant_id uuid not null references public.grants(id) on delete cascade,
  event_type text not null default 'note' check (event_type in ('note', 'email_sent', 'email_received', 'application', 'call', 'meeting', 'decision', 'payment', 'report', 'follow_up', 'stage_change', 'document')),
  title text not null,
  body text,
  event_date timestamptz not null default now(),
  email_message_id uuid,
  email_from text,
  email_to text,
  email_subject text,
  created_by text default auth.uid()::text,
  created_at timestamptz not null default now()
);
create index if not exists grant_events_grant_idx on public.grant_events (grant_id, event_date desc);

create table if not exists public.grant_payments (
  id uuid primary key default gen_random_uuid(),
  grant_id uuid not null references public.grants(id) on delete cascade,
  amount numeric(14,2) not null check (amount >= 0),
  status text not null default 'expected' check (status in ('expected', 'received')),
  expected_date date,
  received_date date,
  method text,
  reference text,
  notes text,
  created_by text default auth.uid()::text,
  created_at timestamptz not null default now()
);
create index if not exists grant_payments_grant_idx on public.grant_payments (grant_id);

create table if not exists public.grant_reports (
  id uuid primary key default gen_random_uuid(),
  grant_id uuid not null references public.grants(id) on delete cascade,
  title text not null,
  due_date date,
  submitted_at date,
  status text not null default 'upcoming' check (status in ('upcoming', 'submitted', 'accepted', 'overdue')),
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists grant_reports_grant_idx on public.grant_reports (grant_id);

create table if not exists public.grant_task_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  days_after_award integer not null default 0 check (days_after_award between 0 and 730),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  assign_to text not null default 'owner' check (assign_to in ('owner', 'secured_by', 'creator')),
  enabled boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['grants','grant_events','grant_payments','grant_reports','grant_task_templates'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Finance staff read %s" on public.%I', t, t);
    execute format('create policy "Finance staff read %s" on public.%I for select to authenticated using (public.has_app_access(''finance'', ''view''))', t, t);
    execute format('drop policy if exists "Finance staff manage %s" on public.%I', t, t);
    execute format('create policy "Finance staff manage %s" on public.%I for all to authenticated using (public.has_app_access(''finance'', ''edit'')) with check (public.has_app_access(''finance'', ''edit''))', t, t);
  end loop;
end $$;

insert into public.grant_task_templates (title, description, days_after_award, priority, assign_to, position)
select * from (values
  ('Send a thank-you card or letter to the funder', 'Personal thanks from the team that secured the award.', 3, 'high', 'secured_by', 1),
  ('Log the award with the bank and accounting', 'Record the award and expected payments in the bank and accounting records.', 5, 'high', 'owner', 2),
  ('Sign and return the award agreement', 'Review the terms, sign, and send back any required paperwork.', 7, 'high', 'owner', 3),
  ('Add the grant budget to Finance', 'Create the budget and tag future expenses to this grant.', 7, 'medium', 'owner', 4),
  ('Calendar the reporting deadlines', 'Add every report and compliance deadline to the grant and calendar.', 14, 'medium', 'owner', 5),
  ('Schedule a kickoff or check-in call with the funder', 'Confirm expectations, contacts and reporting cadence.', 30, 'medium', 'owner', 6)
) as v(title, description, days_after_award, priority, assign_to, position)
where not exists (select 1 from public.grant_task_templates);

alter table public.program_tasks drop constraint if exists program_tasks_grant_fk;
alter table public.program_tasks add constraint program_tasks_grant_fk foreign key (grant_id) references public.grants(id) on delete set null;
alter table public.finance_records drop constraint if exists finance_records_grant_fk;
alter table public.finance_records add constraint finance_records_grant_fk foreign key (grant_id) references public.grants(id) on delete set null;

create or replace function public.touch_grant()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists grants_touch on public.grants;
create trigger grants_touch before update on public.grants for each row execute function public.touch_grant();

-- When a grant is awarded, create the configured follow-up tasks once.
create or replace function public.grant_award_tasks()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  tpl record;
  assignee text;
begin
  if new.stage = 'awarded' and (tg_op = 'INSERT' or old.stage is distinct from 'awarded') and new.award_tasks_created_at is null then
    for tpl in select * from public.grant_task_templates where enabled order by position, created_at loop
      assignee := case tpl.assign_to
        when 'secured_by' then coalesce(new.secured_by_id, new.owner_id, new.created_by)
        when 'creator' then new.created_by
        else coalesce(new.owner_id, new.secured_by_id, new.created_by)
      end;
      insert into public.program_tasks (title, description, assignee_id, priority, due_date, status, progress, project_id, grant_id, source, created_by)
      values (tpl.title, tpl.description, assignee, tpl.priority, current_date + tpl.days_after_award, 'not_started', 0, new.project_id, new.id, 'grant_award', coalesce(new.created_by, assignee));
    end loop;
    insert into public.grant_events (grant_id, event_type, title, body, created_by)
    values (new.id, 'stage_change', 'Award follow-up tasks created', 'Tasks were created from the award checklist in Grants settings.', null);
    update public.grants set award_tasks_created_at = now() where id = new.id;
  end if;
  return null;
end $$;
drop trigger if exists grants_award_tasks on public.grants;
create trigger grants_award_tasks after insert or update of stage on public.grants for each row execute function public.grant_award_tasks();
