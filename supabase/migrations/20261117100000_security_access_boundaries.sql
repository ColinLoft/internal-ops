-- Preserve the shared active-member access model while closing legacy RLS bypasses.
create or replace function public.is_workspace_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()::text and system_role = 'admin'
      and coalesce(account_status, 'active') = 'active'
  );
$$;

create or replace function public.is_eng_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()::text and system_role in ('admin', 'coordinator')
      and coalesce(account_status, 'active') = 'active'
  );
$$;

create or replace function public.can_edit_program_task(p_task uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_app_access('programs', 'view') and exists (
    select 1 from public.program_tasks t
    left join public.program_projects p on p.id = t.project_id
    left join public.program_divisions d on d.id = p.division_id
    where t.id = p_task and (
      public.has_app_access('programs', 'edit')
      or t.created_by = auth.uid()::text
      or t.assignee_id = auth.uid()::text
      or auth.uid()::text = any(t.assigned_ids)
      or d.director_id = auth.uid()::text
    )
  );
$$;

drop policy if exists "Staff update all tasks" on public.program_tasks;
drop policy if exists "Active task editors update tasks" on public.program_tasks;
create policy "Active task editors update tasks" on public.program_tasks
for update to authenticated
using (public.can_edit_program_task(id))
with check (
  public.has_app_access('programs', 'edit')
  or created_by = auth.uid()::text
  or assignee_id = auth.uid()::text
  or auth.uid()::text = any(assigned_ids)
  or exists (
    select 1 from public.program_projects p
    join public.program_divisions d on d.id = p.division_id
    where p.id = project_id and d.director_id = auth.uid()::text
  )
);

create or replace function public.can_manage_eng_project(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_app_access('engineering', 'edit') and (
    public.is_eng_admin() or exists (
      select 1 from public.eng_projects p
      where p.id = target and (p.owner_id = auth.uid()::text or p.created_by = auth.uid()::text)
    )
  );
$$;

create or replace function public.can_review_eng(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_app_access('engineering', 'edit') and (
    public.is_eng_admin() or exists (
      select 1 from public.eng_reviews r
      join public.eng_projects p on p.id = r.project_id
      join public.eng_reviewers rv on rv.discipline = p.discipline and rv.user_id = auth.uid()::text
      where r.id = target
    )
  );
$$;

-- RESTRICTIVE policies AND with every legacy permissive policy, including FOR ALL.
do $$
declare
  boundary record;
begin
  for boundary in select * from (values
    ('program_tasks', 'programs'),
    ('program_task_dependencies', 'programs'),
    ('program_task_comments', 'programs'),
    ('gtm_records', 'gtm'),
    ('gtm_activity', 'gtm'),
    ('eng_projects', 'engineering'),
    ('eng_project_entries', 'engineering'),
    ('eng_project_files', 'engineering'),
    ('eng_reviewers', 'engineering'),
    ('eng_reviews', 'engineering'),
    ('eng_review_votes', 'engineering')
  ) as boundaries(table_name, app) loop
    execute format('drop policy if exists "App access read boundary" on public.%I', boundary.table_name);
    execute format('create policy "App access read boundary" on public.%I as restrictive for select to authenticated using (public.has_app_access(%L, ''view''))',
      boundary.table_name, boundary.app);
    execute format('drop policy if exists "App access insert boundary" on public.%I', boundary.table_name);
    execute format('create policy "App access insert boundary" on public.%I as restrictive for insert to authenticated with check (public.has_app_access(%L, ''edit''))',
      boundary.table_name, boundary.app);
    execute format('drop policy if exists "App access update boundary" on public.%I', boundary.table_name);
    execute format('create policy "App access update boundary" on public.%I as restrictive for update to authenticated using (public.has_app_access(%L, ''edit'')) with check (public.has_app_access(%L, ''edit''))',
      boundary.table_name, boundary.app, boundary.app);
    execute format('drop policy if exists "App access delete boundary" on public.%I', boundary.table_name);
    execute format('create policy "App access delete boundary" on public.%I as restrictive for delete to authenticated using (public.has_app_access(%L, ''edit''))',
      boundary.table_name, boundary.app);
  end loop;
end;
$$;

notify pgrst, 'reload schema';
