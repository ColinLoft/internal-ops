drop policy if exists "Authenticated staff can manage organization_departments" on public.organization_departments;
drop policy if exists "Authenticated staff can manage organization_positions" on public.organization_positions;
drop policy if exists "Authenticated staff can manage organization_employee_records" on public.organization_employee_records;
drop policy if exists "Authenticated staff can manage organization_onboarding" on public.organization_onboarding;
drop policy if exists "Authenticated staff can manage organization_absences" on public.organization_absences;
drop policy if exists "Authenticated staff can manage organization_records" on public.organization_records;

create policy "Authenticated staff can view departments"
  on public.organization_departments for select to authenticated using (true);
create policy "Organization managers can manage departments"
  on public.organization_departments for all to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid()::text and system_role in ('admin', 'coordinator')))
  with check (exists (select 1 from public.profiles where id = auth.uid()::text and system_role in ('admin', 'coordinator')));

create policy "Authenticated staff can view positions"
  on public.organization_positions for select to authenticated using (true);
create policy "Organization managers can manage positions"
  on public.organization_positions for all to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid()::text and system_role in ('admin', 'coordinator')))
  with check (exists (select 1 from public.profiles where id = auth.uid()::text and system_role in ('admin', 'coordinator')));

create policy "Staff can view their employee record"
  on public.organization_employee_records for select to authenticated using (
    user_id = auth.uid()::text
    or exists (select 1 from public.profiles where id = auth.uid()::text and system_role in ('admin', 'coordinator'))
  );
create policy "Organization managers can manage employee records"
  on public.organization_employee_records for all to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid()::text and system_role in ('admin', 'coordinator')))
  with check (exists (select 1 from public.profiles where id = auth.uid()::text and system_role in ('admin', 'coordinator')));

create policy "Staff can view organization resources"
  on public.organization_records for select to authenticated using (true);
create policy "Organization managers can manage organization resources"
  on public.organization_records for all to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid()::text and system_role in ('admin', 'coordinator')))
  with check (exists (select 1 from public.profiles where id = auth.uid()::text and system_role in ('admin', 'coordinator')));

drop policy if exists "Workspace admins can manage organization documents" on public.organization_documents;
create policy "Organization managers can manage organization documents"
  on public.organization_documents for all to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid()::text and system_role in ('admin', 'coordinator')))
  with check (exists (select 1 from public.profiles where id = auth.uid()::text and system_role in ('admin', 'coordinator')));

drop policy if exists "Workspace admins can manage document assignments" on public.organization_document_assignments;
create policy "Organization managers can manage document assignments"
  on public.organization_document_assignments for all to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid()::text and system_role in ('admin', 'coordinator')))
  with check (exists (select 1 from public.profiles where id = auth.uid()::text and system_role in ('admin', 'coordinator')));

drop policy if exists "Workspace admins can manage onboarding tasks" on public.organization_onboarding_tasks;
create policy "Organization managers can manage onboarding tasks"
  on public.organization_onboarding_tasks for all to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid()::text and system_role in ('admin', 'coordinator')))
  with check (exists (select 1 from public.profiles where id = auth.uid()::text and system_role in ('admin', 'coordinator')));

drop policy if exists "Workspace admins can review leave requests" on public.organization_leave_requests;
create policy "Organization managers can review leave requests"
  on public.organization_leave_requests for update to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid()::text and system_role in ('admin', 'coordinator')))
  with check (exists (select 1 from public.profiles where id = auth.uid()::text and system_role in ('admin', 'coordinator')));
