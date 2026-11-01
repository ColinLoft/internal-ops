drop policy if exists "Program administrators can manage program_divisions" on public.program_divisions;
create policy "Program administrators and directors can manage program_divisions"
  on public.program_divisions for all to authenticated
  using (
    exists (select 1 from public.profiles where id = auth.uid()::text and system_role in ('admin', 'coordinator'))
    or director_id = auth.uid()::text
  )
  with check (
    exists (select 1 from public.profiles where id = auth.uid()::text and system_role in ('admin', 'coordinator'))
    or director_id = auth.uid()::text
  );

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'program_teams', 'program_projects', 'program_budgets',
    'program_documents', 'program_performance'
  ] loop
    execute format('drop policy if exists "Program administrators can manage %s" on public.%I', table_name, table_name);
    execute format('drop policy if exists "Program administrators and directors can manage %s" on public.%I', table_name, table_name);
    execute format(
      'create policy "Program administrators and directors can manage %s" on public.%I for all to authenticated using (
        exists (select 1 from public.profiles where id = auth.uid()::text and system_role in (''admin'', ''coordinator''))
        or exists (select 1 from public.program_divisions d where d.id = %I.division_id and d.director_id = auth.uid()::text)
      ) with check (
        exists (select 1 from public.profiles where id = auth.uid()::text and system_role in (''admin'', ''coordinator''))
        or exists (select 1 from public.program_divisions d where d.id = %I.division_id and d.director_id = auth.uid()::text)
      )',
      table_name, table_name, table_name, table_name
    );
  end loop;
  foreach table_name in array array['program_tasks', 'program_milestones'] loop
    execute format('drop policy if exists "Program administrators can manage %s" on public.%I', table_name, table_name);
    execute format('drop policy if exists "Program administrators and directors can manage %s" on public.%I', table_name, table_name);
    execute format(
      'create policy "Program administrators and directors can manage %s" on public.%I for all to authenticated using (
        exists (select 1 from public.profiles where id = auth.uid()::text and system_role in (''admin'', ''coordinator''))
        or exists (select 1 from public.program_projects p join public.program_divisions d on d.id = p.division_id where p.id = %I.project_id and d.director_id = auth.uid()::text)
      ) with check (
        exists (select 1 from public.profiles where id = auth.uid()::text and system_role in (''admin'', ''coordinator''))
        or exists (select 1 from public.program_projects p join public.program_divisions d on d.id = p.division_id where p.id = %I.project_id and d.director_id = auth.uid()::text)
      )',
      table_name, table_name, table_name, table_name
    );
  end loop;
end $$;
