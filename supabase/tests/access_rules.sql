-- Run against a local/staging database: psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/access_rules.sql
-- Everything happens in a transaction that is rolled back. Any failed check raises an exception.
begin;

create temp table _t(name text);
create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;
create or replace function pg_temp.check(label text, ok boolean) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAILED: %', label; end if;
  raise notice 'ok: %', label;
end $$;

-- Fixtures (adjust the profile columns if your profiles table has other required fields): a plain member, a member with the Finance role, and an admin.
insert into public.profiles (id, name, email, system_role) values
  ('00000000-0000-0000-0000-000000000001', 'T Member', 't1@example.test', 'member'),
  ('00000000-0000-0000-0000-000000000002', 'T Finance', 't2@example.test', 'member'),
  ('00000000-0000-0000-0000-000000000003', 'T Admin', 't3@example.test', 'admin'),
  ('00000000-0000-0000-0000-000000000004', 'T Approver', 't4@example.test', 'member')
on conflict (id) do update set system_role = excluded.system_role;

insert into public.workspace_role_assignments (user_id, role_id)
select '00000000-0000-0000-0000-000000000002', id from public.workspace_roles where name = 'Finance team';

insert into public.workspace_role_assignments (user_id, role_id)
select '00000000-0000-0000-0000-000000000001', id from public.workspace_roles where name = 'Marketing team'
union all select '00000000-0000-0000-0000-000000000004', id from public.workspace_roles where name = 'Marketing approver';

create or replace function pg_temp.fails(stmt text) returns boolean language plpgsql as $$
begin execute stmt; return false; exception when others then return true; end $$;

-- Access levels
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
select pg_temp.check('member has no finance access', public.app_access_level('finance') = 0);
select pg_temp.check('member has no customers access', public.app_access_level('customers') = 0);
select pg_temp.check('member is not workspace admin', not public.is_workspace_admin());

select pg_temp.as_user('00000000-0000-0000-0000-000000000002');
select pg_temp.check('finance role grants finance manage', public.has_app_access('finance', 'manage'));
select pg_temp.check('finance role does not grant legal', not public.has_app_access('legal', 'view'));
select pg_temp.check('my_app_access reports finance', (public.my_app_access()->>'finance')::int >= 1);

select pg_temp.as_user('00000000-0000-0000-0000-000000000003');
select pg_temp.check('admin has manage everywhere', public.has_app_access('legal', 'manage') and public.has_app_access('customers', 'manage'));
select pg_temp.check('admin is workspace admin', public.is_workspace_admin());

-- Row visibility (RLS applies to the authenticated role)
set local role authenticated;

select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
select pg_temp.check('member cannot read finance_records', (select count(*) from public.finance_records) = 0);
select pg_temp.check('member cannot read crm_organizations', (select count(*) from public.crm_organizations) = 0);

select pg_temp.as_user('00000000-0000-0000-0000-000000000002');
do $$ begin
  begin
    insert into public.workspace_role_assignments (user_id, role_id) select '00000000-0000-0000-0000-000000000002', id from public.workspace_roles limit 1;
    raise exception 'FAILED: non-admin could assign roles';
  exception when insufficient_privilege or others then
    if sqlerrm like 'FAILED:%' then raise; end if;
  end;
end $$;

-- Support tickets: requesters see their own, others do not.
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
insert into public.support_tickets (subject, description) values ('T ticket', 'x');
select pg_temp.check('requester sees own ticket', (select count(*) from public.support_tickets where subject = 'T ticket') = 1);
select pg_temp.as_user('00000000-0000-0000-0000-000000000002');
select pg_temp.check('other member cannot see ticket', (select count(*) from public.support_tickets where subject = 'T ticket') = 0);
select pg_temp.as_user('00000000-0000-0000-0000-000000000003');
select pg_temp.check('admin sees ticket', (select count(*) from public.support_tickets where subject = 'T ticket') = 1);

-- CRM: members without a role are blocked; admins can write.
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
select pg_temp.check('member cannot create organization', pg_temp.fails($q$insert into public.crm_organizations (name) values ('T Org')$q$));
select pg_temp.as_user('00000000-0000-0000-0000-000000000003');
insert into public.crm_organizations (name) values ('T Org');
select pg_temp.check('admin created organization', (select count(*) from public.crm_organizations where name = 'T Org') = 1);

-- Task dependencies: cycles are rejected.
select pg_temp.as_user('00000000-0000-0000-0000-000000000003');
insert into public.program_projects (name) values ('T Project');
insert into public.program_tasks (project_id, title) select id, 'T A' from public.program_projects where name = 'T Project';
insert into public.program_tasks (project_id, title) select id, 'T B' from public.program_projects where name = 'T Project';
insert into public.program_task_dependencies (task_id, depends_on_task_id)
select a.id, b.id from public.program_tasks a, public.program_tasks b where a.title = 'T A' and b.title = 'T B';
select pg_temp.check('dependency cycle is rejected', pg_temp.fails($q$insert into public.program_task_dependencies (task_id, depends_on_task_id)
  select b.id, a.id from public.program_tasks a, public.program_tasks b where a.title = 'T A' and b.title = 'T B'$q$));

-- Content approval workflow.
select pg_temp.as_user('00000000-0000-0000-0000-000000000002');
select pg_temp.check('non-marketer cannot create post', pg_temp.fails($q$insert into public.gtm_content_posts (title) values ('T nope')$q$));
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
insert into public.gtm_content_posts (title, status) values ('T post', 'approved');
select pg_temp.check('new post is forced to draft', (select status from public.gtm_content_posts where title = 'T post') = 'draft');
update public.gtm_content_posts set status = 'pending_approval' where title = 'T post';
select pg_temp.check('author cannot approve own post', pg_temp.fails($q$update public.gtm_content_posts set status = 'approved' where title = 'T post'$q$));
select pg_temp.as_user('00000000-0000-0000-0000-000000000004');
update public.gtm_content_posts set status = 'approved' where title = 'T post';
select pg_temp.check('approver can approve', (select status from public.gtm_content_posts where title = 'T post') = 'approved');
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
select pg_temp.check('author locked after approval', pg_temp.fails($q$update public.gtm_content_posts set title = 'T edit' where title = 'T post'$q$));

reset role;
rollback;
