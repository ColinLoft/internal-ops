-- Remove only confirmed-unused, empty legacy tables. Never cascade dependencies.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$
declare
  table_name text;
  has_rows boolean;
  tables constant text[] := array[
    'organization_records',
    'operation_resources',
    'operation_activity',
    'program_budgets',
    'program_documents',
    'program_performance'
  ];
begin
  foreach table_name in array tables loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('lock table public.%I in access exclusive mode', table_name);
      execute format('select exists (select 1 from public.%I)', table_name) into has_rows;
      if has_rows then
        raise exception 'Cleanup aborted: public.% contains data', table_name;
      end if;
    end if;
  end loop;

  foreach table_name in array tables loop
    execute format('drop table if exists public.%I restrict', table_name);
  end loop;
end;
$$;

notify pgrst, 'reload schema';
commit;
