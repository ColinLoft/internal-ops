-- Let workspace roles grant write access to the remaining apps. Policies are additive:
-- existing admin/coordinator/owner policies still apply.
do $$
declare
  spec record;
begin
  for spec in
    select * from (values
      ('programs', 'edit',   array['program_divisions','program_teams','program_projects','program_milestones','program_documents','program_performance']),
      ('programs', 'manage', array['program_budgets']),
      ('operations', 'edit', array['operation_workstreams','operation_tasks','operation_approvals','operation_resources']),
      ('gtm', 'edit',        array['gtm_records','gtm_activity']),
      ('organization', 'manage', array['organization_departments','organization_positions','organization_employee_records','organization_onboarding','organization_absences','organization_onboarding_tasks','organization_leave_requests','organization_records','organization_documents','organization_document_assignments'])
    ) as v(app, lvl, tbls)
  loop
    declare t text;
    begin
      foreach t in array spec.tbls loop
        execute format('drop policy if exists "Role access manages %s" on public.%I', t, t);
        execute format(
          'create policy "Role access manages %s" on public.%I for all to authenticated using (public.has_app_access(%L, %L)) with check (public.has_app_access(%L, %L))',
          t, t, spec.app, spec.lvl, spec.app, spec.lvl
        );
      end loop;
    end;
  end loop;
end $$;

-- All app access levels for the signed-in user in one call.
create or replace function public.my_app_access() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(app, public.app_access_level(app)), '{}'::jsonb)
  from unnest(array['insights','organization','programs','engineering','operations','customers','gtm','support','finance','legal','systems']) as app;
$$;

insert into public.workspace_roles (name, description) values
  ('Operations team', 'Manages workstreams, tasks, approvals and resources.'),
  ('Program staff', 'Manages programs, projects and tasks.')
on conflict (name) do nothing;

insert into public.workspace_role_permissions (role_id, app, level)
select r.id, v.app, v.level from public.workspace_roles r
join (values ('Operations team', 'operations', 'edit'), ('Program staff', 'programs', 'edit')) as v(name, app, level) on v.name = r.name
on conflict do nothing;
