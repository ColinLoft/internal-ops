-- Prevent client-side identity spoofing and restrict organization records to
-- the authenticated staff member or an authorized organization administrator.

drop policy if exists "Enable full access for staff on messages" on public.messages;
drop policy if exists "Staff can read and create messages as themselves" on public.messages;
drop policy if exists "Staff can create messages as themselves" on public.messages;
drop policy if exists "Staff can update or delete their own messages" on public.messages;
drop policy if exists "Staff can delete their own messages" on public.messages;
create policy "Staff can read and create messages as themselves"
  on public.messages for select to authenticated
  using (true);
create policy "Staff can create messages as themselves"
  on public.messages for insert to authenticated
  with check (sender_id = auth.uid()::text);
create policy "Staff can update or delete their own messages"
  on public.messages for update to authenticated
  using (sender_id = auth.uid()::text)
  with check (sender_id = auth.uid()::text);
create policy "Staff can delete their own messages"
  on public.messages for delete to authenticated
  using (sender_id = auth.uid()::text);

drop policy if exists "Enable full access for staff on calendar_events" on public.calendar_events;
drop policy if exists "Staff can read calendar events" on public.calendar_events;
drop policy if exists "Staff can create their own calendar events" on public.calendar_events;
drop policy if exists "Staff can update or delete their own calendar events" on public.calendar_events;
drop policy if exists "Staff can delete their own calendar events" on public.calendar_events;
create policy "Staff can read calendar events"
  on public.calendar_events for select to authenticated
  using (true);
create policy "Staff can create their own calendar events"
  on public.calendar_events for insert to authenticated
  with check (created_by = auth.uid()::text);
create policy "Staff can update or delete their own calendar events"
  on public.calendar_events for update to authenticated
  using (created_by = auth.uid()::text)
  with check (created_by = auth.uid()::text);
create policy "Staff can delete their own calendar events"
  on public.calendar_events for delete to authenticated
  using (created_by = auth.uid()::text);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'organization_departments',
    'organization_positions',
    'organization_employee_records',
    'organization_onboarding',
    'organization_absences',
    'organization_records'
  ] loop
    execute format('drop policy if exists "Authenticated staff can manage %s" on public.%I', table_name, table_name);
    execute format('drop policy if exists "Organization administrators can manage %s" on public.%I', table_name, table_name);
    execute format(
      'create policy "Organization administrators can manage %s" on public.%I for all to authenticated using (exists (select 1 from public.profiles where id = auth.uid()::text and system_role in (''admin'', ''coordinator''))) with check (exists (select 1 from public.profiles where id = auth.uid()::text and system_role in (''admin'', ''coordinator'')))',
      table_name,
      table_name
    );
  end loop;
end $$;

drop policy if exists "Staff can view own onboarding tasks" on public.organization_onboarding_tasks;
drop policy if exists "Workspace admins can manage onboarding tasks" on public.organization_onboarding_tasks;
create policy "Staff can view own onboarding tasks"
  on public.organization_onboarding_tasks for select to authenticated using (
    employee_id = auth.uid()::text
    or exists (select 1 from public.profiles where id = auth.uid()::text and system_role in ('admin', 'coordinator'))
  );
create policy "Organization administrators can manage onboarding tasks"
  on public.organization_onboarding_tasks for all to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid()::text and system_role in ('admin', 'coordinator')))
  with check (exists (select 1 from public.profiles where id = auth.uid()::text and system_role in ('admin', 'coordinator')));
