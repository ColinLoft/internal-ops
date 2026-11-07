-- Publishing existing tables enables cross-user refresh without changing access.
do $$
declare
  table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array array[
      'company_ideas', 'company_idea_votes', 'company_idea_comments',
      'eng_projects', 'eng_project_entries', 'eng_project_files', 'eng_reviews',
      'program_tasks', 'program_task_dependencies', 'entity_time_entries'
    ] loop
      if to_regclass(format('public.%I', table_name)) is not null
        and not exists (
          select 1 from pg_publication_tables
          where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name
        ) then
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      end if;
    end loop;
  else
    raise notice 'supabase_realtime publication is unavailable; the frontend will refresh with polling.';
  end if;
end;
$$;
