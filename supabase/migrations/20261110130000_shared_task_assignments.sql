alter table public.program_tasks
  add column if not exists assigned_ids text[] not null default array[]::text[];

update public.program_tasks
set assigned_ids = array[assignee_id]
where assignee_id is not null and cardinality(assigned_ids) = 0;

-- Keep integrations that still write the single assignment in sync.
create or replace function public.sync_task_assignments()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if cardinality(new.assigned_ids) = 0 and new.assignee_id is not null then
      new.assigned_ids := array[new.assignee_id];
    end if;
  elsif new.assigned_ids is not distinct from old.assigned_ids
    and new.assignee_id is distinct from old.assignee_id then
    new.assigned_ids := case when new.assignee_id is null then array[]::text[] else array[new.assignee_id] end;
  end if;
  if exists (
    select 1 from unnest(new.assigned_ids) as assigned(id)
    where id is null or not exists (select 1 from public.profiles where profiles.id = assigned.id)
  ) then
    raise exception 'Assigned people must be workspace users.';
  end if;
  new.assignee_id := new.assigned_ids[1];
  return new;
end;
$$;

drop trigger if exists sync_task_assignments on public.program_tasks;
create trigger sync_task_assignments before insert or update on public.program_tasks
for each row execute function public.sync_task_assignments();

drop policy if exists "Staff update all tasks" on public.program_tasks;
create policy "Staff update all tasks" on public.program_tasks
for update to authenticated using (true) with check (true);

create or replace function public.can_edit_program_task(p_task uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select auth.uid() is not null; $$;

create index if not exists program_tasks_assigned_ids_idx on public.program_tasks using gin(assigned_ids);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'program_tasks'
  ) then
    alter publication supabase_realtime add table public.program_tasks;
  end if;
end;
$$;

notify pgrst, 'reload schema';
