-- Project tasks: description, start date, subtasks, dependencies and comments.
alter table public.program_tasks
  add column if not exists description text,
  add column if not exists start_date date,
  add column if not exists parent_task_id uuid references public.program_tasks(id) on delete cascade,
  add constraint program_tasks_not_own_parent check (parent_task_id is null or parent_task_id <> id),
  add constraint program_tasks_dates_ordered check (start_date is null or due_date is null or start_date <= due_date);

create index if not exists program_tasks_parent_idx on public.program_tasks(parent_task_id);

create table if not exists public.program_task_dependencies (
  task_id uuid not null references public.program_tasks(id) on delete cascade,
  depends_on_task_id uuid not null references public.program_tasks(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, depends_on_task_id),
  check (task_id <> depends_on_task_id)
);

create table if not exists public.program_task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.program_tasks(id) on delete cascade,
  author_id text not null default auth.uid()::text,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists program_task_comments_task_idx on public.program_task_comments(task_id, created_at);

-- Reject dependency cycles.
create or replace function public.program_task_dependency_guard() returns trigger language plpgsql as $$
begin
  if exists (
    with recursive chain(id) as (
      select new.depends_on_task_id
      union
      select d.depends_on_task_id from public.program_task_dependencies d join chain c on d.task_id = c.id
    ) select 1 from chain where id = new.task_id
  ) then
    raise exception 'Dependency would create a cycle';
  end if;
  return new;
end $$;
drop trigger if exists program_task_dependency_guard on public.program_task_dependencies;
create trigger program_task_dependency_guard before insert on public.program_task_dependencies for each row execute function public.program_task_dependency_guard();

-- Who may edit a task: admins/coordinators, directors, Projects editors, or the assignee.
create or replace function public.can_edit_program_task(p_task uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_app_access('programs', 'edit')
    or exists (
      select 1 from public.program_tasks t
      left join public.program_projects p on p.id = t.project_id
      left join public.program_divisions d on d.id = p.division_id
      where t.id = p_task and (t.assignee_id = auth.uid()::text or d.director_id = auth.uid()::text)
    );
$$;

alter table public.program_task_dependencies enable row level security;
alter table public.program_task_comments enable row level security;

drop policy if exists "Project editors manage program_tasks" on public.program_tasks;
create policy "Project editors manage program_tasks" on public.program_tasks for all to authenticated
  using (public.can_edit_program_task(id)) with check (public.has_app_access('programs', 'edit') or assignee_id = auth.uid()::text);

drop policy if exists "staff read task dependencies" on public.program_task_dependencies;
create policy "staff read task dependencies" on public.program_task_dependencies for select to authenticated using (true);
drop policy if exists "task editors manage dependencies" on public.program_task_dependencies;
create policy "task editors manage dependencies" on public.program_task_dependencies for all to authenticated
  using (public.can_edit_program_task(task_id)) with check (public.can_edit_program_task(task_id));

drop policy if exists "staff read task comments" on public.program_task_comments;
create policy "staff read task comments" on public.program_task_comments for select to authenticated using (true);
drop policy if exists "staff add task comments" on public.program_task_comments;
create policy "staff add task comments" on public.program_task_comments for insert to authenticated with check (author_id = auth.uid()::text);
drop policy if exists "authors delete task comments" on public.program_task_comments;
create policy "authors delete task comments" on public.program_task_comments for delete to authenticated
  using (author_id = auth.uid()::text or public.has_app_access('programs', 'manage'));
