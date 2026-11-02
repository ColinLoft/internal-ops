-- Finance and legal records were readable by every authenticated user.
-- Limit reads to admins/coordinators, the creator, and the assigned owner.
do $$
declare
  table_name text;
begin
  foreach table_name in array array['finance_records', 'legal_records'] loop
    execute format('drop policy if exists "authenticated staff can view %s" on public.%I', table_name, table_name);
    execute format('drop policy if exists "staff can view permitted %s" on public.%I', table_name, table_name);
    execute format(
      'create policy "staff can view permitted %s" on public.%I for select to authenticated using (created_by = auth.uid()::text or owner_id = auth.uid()::text or exists (select 1 from public.profiles where id = auth.uid()::text and system_role in (''admin'', ''coordinator'')))',
      table_name, table_name
    );
  end loop;
end $$;
