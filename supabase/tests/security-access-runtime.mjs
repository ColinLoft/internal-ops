import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const migration = (name) => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
const member = '11111111-1111-4111-8111-111111111111';
const admin = '22222222-2222-4222-8222-222222222222';
const suspended = '33333333-3333-4333-8333-333333333333';
const missing = '44444444-4444-4444-8444-444444444444';
const peer = '55555555-5555-4555-8555-555555555555';
const tables = ['program_tasks', 'program_task_dependencies', 'program_task_comments', 'gtm_records', 'gtm_activity',
  'eng_projects', 'eng_project_entries', 'eng_project_files', 'eng_reviewers', 'eng_reviews', 'eng_review_votes'];
const asUser = async (id) => {
  await db.exec('reset role');
  await db.query("select set_config('test.uid',$1,false)", [id]);
  await db.exec('set role authenticated');
};
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
const count = async (table) => (await one(`select count(*)::int as n from public.${table}`)).n;

try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create schema storage;
    grant usage on schema public,auth,storage to authenticated;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('test.uid',true),'')::uuid
    $$;
    create table profiles(id text primary key, system_role text, account_status text);
    insert into profiles values
      ('${member}','member','active'), ('${admin}','admin','active'),
      ('${suspended}','admin','suspended'), ('${peer}','member','active');
    grant select on profiles to authenticated;
    create table finance_records(id uuid, created_by text, owner_id text);
    create table legal_records(like finance_records);
    create table engineering_records(like finance_records);
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
    create table storage.objects(id uuid,name text,bucket_id text);
    create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;
    create publication supabase_realtime;
  `);
  await db.query("select set_config('test.uid',$1,false)", [member]);
  await db.exec(migration('20261101230000_add_roles_and_app_permissions.sql'));
  // Use the effective shared-member helper, not the superseded role-only definition.
  const qa = migration('20261113100000_qa_round2_fixes.sql');
  const effectiveAccess = qa.slice(qa.indexOf('create or replace function public.app_access_level'), qa.indexOf('-- 2. Forms'));
  await db.exec(effectiveAccess);
  await db.exec(migration('20261101140000_add_programs_workspace.sql'));
  await db.exec(migration('20261101250000_add_project_task_details.sql'));
  await db.exec('alter table program_tasks add column created_by text default auth.uid()::text');
  const taskUpgrade = migration('20261102120000_project_management_and_grants.sql');
  await db.exec(taskUpgrade.slice(taskUpgrade.indexOf('-- Anyone signed in'), taskUpgrade.indexOf('drop policy if exists "Staff read program projects"')));
  await db.exec(migration('20261105120000_engineering_projects_reviews.sql'));
  await db.exec(migration('20261110130000_shared_task_assignments.sql'));
  await db.exec(migration('20261101180000_add_gtm_workspace.sql'));
  await db.exec(`
    create policy "Role access manages gtm_records" on gtm_records for all to authenticated
      using (has_app_access('gtm','edit')) with check (has_app_access('gtm','edit'));
    create policy "Role access manages gtm_activity" on gtm_activity for all to authenticated
      using (has_app_access('gtm','edit')) with check (has_app_access('gtm','edit'));
    grant select,insert,update,delete on program_tasks,program_task_comments,program_task_dependencies to authenticated;
    grant select on program_projects,program_divisions to authenticated;
  `);
  const task = (await one("insert into program_tasks(title,created_by) values('Owned task',$1) returning id", [member])).id;
  const otherTask = (await one("insert into program_tasks(title,created_by,assigned_ids) values('Peer task',$1,$2) returning id", [peer, [peer, member]])).id;
  const thirdTask = (await one("insert into program_tasks(title,created_by) values('Dependency target',$1) returning id", [peer])).id;
  await db.query('insert into program_task_dependencies(task_id,depends_on_task_id) values($1,$2)', [task, otherTask]);
  await db.query("insert into program_task_comments(task_id,author_id,body) values($1,$2,'Comment')", [task, member]);
  const project = (await one("insert into eng_projects(name,discipline,owner_id,created_by) values('Project','software',$1,$1) returning id", [member])).id;
  await db.query("insert into eng_project_entries(project_id,author_id,body) values($1,$2,'Update')", [project, member]);
  await db.query("insert into eng_project_files(project_id,uploaded_by,name,storage_path) values($1,$2,'file.pdf','fixture.pdf')", [project, member]);
  await db.query("insert into eng_reviewers(user_id,discipline) values($1,'software')", [member]);
  const review = (await one("insert into eng_reviews(project_id,review_type,title,submitted_by) values($1,'code','Review',$2) returning id", [project, member])).id;
  await db.query("insert into eng_review_votes(review_id,reviewer_id,verdict) values($1,$2,'approve')", [review, member]);
  const gtm = (await one("insert into gtm_records(area,name,owner_id,created_by) values('marketing','Record',$1,$1) returning id", [suspended])).id;
  await db.query("insert into gtm_activity(action,record_type,record_id,actor_id) values('Created','gtm',$1,$2)", [gtm, suspended]);

  await asUser(suspended);
  assert.equal((await one("select app_access_level('gtm') as n")).n, 0, 'effective helper already denies suspended users');
  assert.ok(await count('gtm_records') > 0, 'fixture reproduces legacy GTM read bypass');
  assert.ok(await count('eng_projects') > 0, 'fixture reproduces legacy Engineering read bypass');
  assert.equal((await db.query("update program_tasks set title='Legacy unauthorized update' where id=$1 returning id", [task])).rows.length, 1, 'fixture reproduces unrestricted task update');
  await db.exec('reset role');
  const fix = migration('20261117100000_security_access_boundaries.sql');
  await db.exec(fix); await db.exec(fix);

  for (const id of [suspended, missing, '']) {
    await asUser(id);
    for (const table of tables) assert.equal(await count(table), 0, `${id || 'no subject'} cannot read ${table}`);
    for (const helper of ['is_workspace_admin()', 'is_eng_admin()', `can_manage_eng_project('${project}')`, `can_review_eng('${review}')`, `can_edit_program_task('${task}')`]) {
      assert.equal((await one(`select public.${helper} as allowed`)).allowed, false, `${id || 'no subject'} denied by ${helper}`);
    }
    assert.equal((await db.query("update program_tasks set title='Forbidden' where id=$1 returning id", [task])).rows.length, 0);
    assert.equal((await db.query("update gtm_records set name='Forbidden' where id=$1 returning id", [gtm])).rows.length, 0);
    assert.equal((await db.query('delete from eng_projects where id=$1 returning id', [project])).rows.length, 0);
    const claimedAuthor = id || member;
    await assert.rejects(db.query("insert into eng_project_entries(project_id,author_id,body) values($1,$2,'Forbidden')", [project, claimedAuthor]), /row-level security/);
    await assert.rejects(db.query("insert into program_task_comments(task_id,author_id,body) values($1,$2,'Forbidden')", [task, claimedAuthor]), /row-level security/);
    await assert.rejects(db.query("insert into gtm_activity(action,record_type,actor_id) values('Forbidden','gtm',$1)", [claimedAuthor]), /row-level security/);
    for (const [sql, args] of [
      ["insert into program_tasks(title,created_by) values('Forbidden',$1)", [claimedAuthor]],
      ['insert into program_task_dependencies(task_id,depends_on_task_id) values($1,$2)', [task, thirdTask]],
      ["insert into gtm_records(area,name,owner_id,created_by) values('marketing','Forbidden',$1,$1)", [claimedAuthor]],
      ["insert into eng_projects(name,discipline,created_by) values('Forbidden','software',$1)", [claimedAuthor]],
      ["insert into eng_project_files(project_id,uploaded_by,name,storage_path) values($1,$2,'x','x')", [project, claimedAuthor]],
      ["insert into eng_reviewers(user_id,discipline) values($1,'mechanical')", [claimedAuthor]],
      ["insert into eng_reviews(project_id,review_type,title,submitted_by) values($1,'code','Forbidden',$2)", [project, claimedAuthor]],
      ["insert into eng_review_votes(review_id,reviewer_id,verdict) values($1,$2,'reject')", [review, claimedAuthor]],
    ]) await assert.rejects(db.query(sql, args), /row-level security/, `${id || 'no subject'} denied insert`);
    for (const [table, column] of [
      ['program_tasks', 'title'], ['program_task_comments', 'body'], ['gtm_records', 'name'],
      ['gtm_activity', 'action'], ['eng_projects', 'name'], ['eng_project_entries', 'body'],
      ['eng_project_files', 'name'], ['eng_reviews', 'title'], ['eng_review_votes', 'comment'],
    ]) assert.equal((await db.query(`update ${table} set ${column}='Forbidden' returning *`)).rows.length, 0, `${id || 'no subject'} denied update on ${table}`);
    for (const table of tables) assert.equal((await db.query(`delete from ${table} returning *`)).rows.length, 0, `${id || 'no subject'} denied delete on ${table}`);
  }
  await asUser(member);
  for (const app of ['programs', 'engineering', 'gtm']) assert.equal((await one('select app_access_level($1) as n', [app])).n, 2, 'active members retain shared edit access');
  for (const table of tables) assert.ok(await count(table) > 0, `member retains read access to ${table}`);
  assert.equal((await db.query("update program_tasks set title='Shared edit' where id=$1 returning id", [otherTask])).rows.length, 1, 'members may still edit shared tasks');
  assert.equal((await one('select can_edit_program_task($1) as allowed', [otherTask])).allowed, true, 'multi-assigned task remains editable');
  assert.equal((await one('select can_edit_program_task($1) as allowed', [missing])).allowed, false, 'nonexistent tasks are not editable');
  await db.query("insert into eng_project_entries(project_id,author_id,body) values($1,$2,'Allowed')", [project, member]);
  await db.query("insert into eng_project_files(project_id,uploaded_by,name,storage_path) values($1,$2,'allowed.pdf','allowed.pdf')", [project, member]);
  await db.query("update eng_review_votes set comment='Allowed' where review_id=$1", [review]);
  await db.query("insert into gtm_records(area,name,owner_id,created_by) values('marketing','Shared create',$1,$1)", [member]);
  await asUser(peer);
  assert.equal((await db.query("update eng_projects set name='Not owner' where id=$1 returning id", [project])).rows.length, 0, 'Engineering ownership restriction remains');
  await assert.rejects(db.query("insert into eng_review_votes(review_id,reviewer_id,verdict) values($1,$2,'approve')", [review, peer]), /row-level security/, 'non-reviewers still cannot vote');
  await asUser(admin);
  assert.equal((await one('select is_workspace_admin() as allowed')).allowed, true);
  assert.equal((await one('select is_eng_admin() as allowed')).allowed, true);
  assert.equal((await db.query("update eng_projects set name='Admin update' where id=$1 returning id", [project])).rows.length, 1);
  await db.exec('reset role');
  // If app access is restricted later, legacy owner/FOR ALL policies must not bypass it.
  await db.exec(`create or replace function public.app_access_level(p_app text) returns integer
    language sql stable security definer set search_path=public as $$ select 0 $$`);
  await asUser(member);
  for (const table of tables) assert.equal(await count(table), 0, `app revocation blocks legacy policies on ${table}`);
  assert.equal((await db.query("update program_tasks set title='Bypass' where id=$1 returning id", [task])).rows.length, 0);
  assert.equal((await one('select can_manage_eng_project($1) as allowed', [project])).allowed, false);
  assert.equal((await one('select can_review_eng($1) as allowed', [review])).allowed, false);
  console.log('Security access SQL passed: legacy bypass reproduction, repeatable migration, suspended/missing subjects, shared active-member access, ownership/review permissions and app revocation.');
} finally {
  await db.close();
}
