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
  ('t-member', 'T Member', 't-member@example.test', 'member'),
  ('t-finance', 'T Finance', 't-finance@example.test', 'member'),
  ('t-admin', 'T Admin', 't-admin@example.test', 'admin')
on conflict (id) do update set system_role = excluded.system_role;

insert into public.workspace_role_assignments (user_id, role_id)
select 't-finance', id from public.workspace_roles where name = 'Finance team';

-- Access levels
select pg_temp.as_user('t-member');
select pg_temp.check('member has no finance access', public.app_access_level('finance') = 0);
select pg_temp.check('member has no customers access', public.app_access_level('customers') = 0);
select pg_temp.check('member is not workspace admin', not public.is_workspace_admin());

select pg_temp.as_user('t-finance');
select pg_temp.check('finance role grants finance manage', public.has_app_access('finance', 'manage'));
select pg_temp.check('finance role does not grant legal', not public.has_app_access('legal', 'view'));
select pg_temp.check('my_app_access reports finance', (public.my_app_access()->>'finance')::int >= 1);

select pg_temp.as_user('t-admin');
select pg_temp.check('admin has manage everywhere', public.has_app_access('legal', 'manage') and public.has_app_access('customers', 'manage'));
select pg_temp.check('admin is workspace admin', public.is_workspace_admin());

-- Row visibility (RLS applies to the authenticated role)
set local role authenticated;

select pg_temp.as_user('t-member');
select pg_temp.check('member cannot read finance_records', (select count(*) from public.finance_records) = 0);
select pg_temp.check('member cannot read crm_organizations', (select count(*) from public.crm_organizations) = 0);

select pg_temp.as_user('t-finance');
do $$ begin
  begin
    insert into public.workspace_role_assignments (user_id, role_id) select 't-finance', id from public.workspace_roles limit 1;
    raise exception 'FAILED: non-admin could assign roles';
  exception when insufficient_privilege or others then
    if sqlerrm like 'FAILED:%' then raise; end if;
  end;
end $$;

reset role;
rollback;
