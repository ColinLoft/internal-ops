// Real PostgreSQL/RLS regression test; optional PGlite is not a project dependency.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const ids = Array.from({ length: 6 }, (_, i) => `${i + 1}1111111-1111-4111-8111-111111111111`);
const [owner, editor, viewer, commenter, unrelated, inactive] = ids;
let checks = 0;
const migration = (name) => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
const scalar = async (sql, params = []) => (await db.query(sql, params)).rows[0]?.value;
const check = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
const rejected = async (sql, params = [], match = /row-level security|permission denied/) => {
  await assert.rejects(db.query(sql, params), match);
  checks++;
};
const identity = async (role, uid = '', email = '') => {
  await db.exec('reset role');
  await db.query("select set_config('test.uid',$1,false),set_config('test.email',$2,false)", [uid, email]);
  if (role !== 'postgres') await db.exec(`set role ${role}`);
};
try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create schema storage;
    grant usage on schema public,auth,storage to anon,authenticated,service_role;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as
      $$ select jsonb_build_object('email',current_setting('test.email',true)) $$;
    create function storage.foldername(text) returns text[] language sql immutable as
      $$ select string_to_array($1,'/') $$;
    create table auth.users(id uuid primary key);
    create table profiles(id text primary key,email text,account_status text,system_role text);
    alter table profiles enable row level security;
    create policy own_profile on profiles for select to authenticated using(id=auth.uid()::text);
    grant select on profiles to authenticated;
    create table drive_items(id uuid primary key,owner_id uuid,name text,content jsonb,
      created_at timestamptz,updated_at timestamptz,deleted_at timestamptz,item_type text);
    create table drive_shares(id uuid primary key,item_id uuid,shared_with_user_id uuid,
      shared_with_email text,permission text,shared_by uuid,created_at timestamptz);
    create table storage.buckets(id text primary key,name text,public boolean,
      file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    create policy unrelated_storage_policy on storage.objects for select to authenticated using(bucket_id='other-bucket');
    create table email_mailboxes(id uuid primary key default gen_random_uuid(),mailbox_type text);
    create table email_rules(id uuid primary key default gen_random_uuid(),mailbox_id uuid references email_mailboxes(id));
    alter table email_rules enable row level security;
    create policy manage_rules on email_rules for all to authenticated using(true) with check(true);
    grant select on email_mailboxes to authenticated;
    grant all on email_rules to authenticated;
    alter default privileges in schema public grant all on tables to service_role;
  `);
  for (let i = 0; i < ids.length; i++) {
    await db.query('insert into auth.users values($1)', [ids[i]]);
    await db.query("insert into profiles values($1,$2,$3,'member')",
      [ids[i], `staff${i}@example.test`, ids[i] === inactive ? 'suspended' : 'active']);
  }
  // Load the actual Forms helpers/policies/triggers rather than copying their behavior.
  await db.exec(migration('20261107150000_company_forms.sql'));
  await db.exec(migration('20261101220000_add_support_tickets.sql'));
  await db.exec(migration('20261107110000_internal_bug_reports.sql'));
  await db.exec(migration('20261023110000_add_system_activity_logs.sql'));

  await identity('authenticated', owner);
  const insert = "insert into company_forms(owner_id,name) values($1,'Test form') returning id,owner_id";
  await rejected(insert, [owner]);
  check(await scalar('select count(*)::int as value from company_forms'), 0);
  console.log('Reproduced original active-owner INSERT RETURNING RLS failure.');

  await identity('postgres');
  const shared = await scalar("insert into email_mailboxes(mailbox_type) values('shared') returning id as value");
  const personal = await scalar("insert into email_mailboxes(mailbox_type) values('personal') returning id as value");
  await db.query('insert into email_rules(mailbox_id) values($1),($2)', [shared, personal]);
  for (const event of ['email_rule_created', 'email_rule_enabled', 'email_rule_disabled', 'email_rule_deleted', 'email_sent']) {
    for (const mailbox of [shared, personal]) {
      await db.query(`insert into system_activity_logs(actor_name,event_type,target_type,target_id,summary)
        values('Staff',$1,'email_mailbox',$2,'History')`, [event, mailbox]);
    }
  }
  await db.query(`insert into system_activity_logs(actor_name,event_type,target_type,target_id,summary)
    values('Staff','email_rule_deleted','grant',$1,'Retained grant history')`, [shared]);
  // All flag combinations: only true/true/bug is internal developer reporting.
  const ticketIds = [];
  for (const category of ['bug', 'technical']) {
    for (const internal of [false, true]) {
      for (const developer of [false, true]) {
        ticketIds.push(await scalar(`insert into support_tickets(subject,requester_id,category,internal_only,developer_flag)
          values('Fixture',$1,$2,$3,$4) returning id as value`, [owner, category, internal, developer]));
      }
    }
  }
  const exact = ticketIds[3];
  await db.query("update support_tickets set screenshot_path='staff/exact.png' where id=$1", [exact]);
  const duplicate = await scalar(`insert into support_tickets(subject,requester_id,category,internal_only,developer_flag,screenshot_path)
    values('Internal shared attachment',$1,'bug',true,true,'staff/shared.png') returning id as value`, [owner]);
  await db.query("update support_tickets set screenshot_path='staff/shared.png' where id=$1", [ticketIds[0]]);
  await db.query(`insert into support_ticket_comments(ticket_id,author_id,body)
    values($1,$3,'Deleted comment'),($2,$3,'Retained comment')`, [exact, ticketIds[0], owner]);
  await db.exec(`create table retained_operational_fixture(id uuid primary key default gen_random_uuid(),
    support_ticket_id uuid references support_tickets(id) on delete set null,name text);
    insert into storage.objects(bucket_id,name) values
      ('bug-report-screenshots','staff/exact.png'),('bug-report-screenshots','staff/shared.png'),
      ('bug-report-screenshots','staff/orphan.png'),('other-bucket','staff/exact.png');`);
  await db.query("insert into retained_operational_fixture(support_ticket_id,name) values($1,'Deployment'),($2,'Customer')", [duplicate, ticketIds[0]]);
  const correction = migration('20261110160000_forms_access_and_retire_internal_tools.sql');
  await db.exec(correction);

  check(await scalar('select count(*)::int as value from email_rules'), 1);
  check(await scalar('select mailbox_id as value from email_rules'), personal);
  check(await scalar('select count(*)::int as value from system_activity_logs'), 7);
  check((await db.query("select event_type from system_activity_logs where target_type='email_mailbox' and target_id=$1", [shared])).rows,
    [{ event_type: 'email_sent' }]);
  check(await scalar("select count(*)::int as value from system_activity_logs where target_id=$1 and target_type='email_mailbox'", [personal]), 5);
  check(await scalar('select count(*)::int as value from support_tickets'), 7);
  check((await db.query('select id from support_tickets order by id')).rows.map((row) => row.id),
    ticketIds.filter((id) => id !== exact).sort());
  check(await scalar("select count(*)::int as value from support_tickets where internal_only and developer_flag and category='bug'"), 0);
  check(await scalar('select count(*)::int as value from support_ticket_comments'), 1);
  check(await scalar('select count(*)::int as value from retained_operational_fixture'), 2);
  check(await scalar("select support_ticket_id as value from retained_operational_fixture where name='Deployment'"), null);
  check(await scalar("select support_ticket_id as value from retained_operational_fixture where name='Customer'"), ticketIds[0]);
  check((await db.query('select bucket_id,object_name from retired_internal_bug_screenshot_cleanup')).rows,
    [{ bucket_id: 'bug-report-screenshots', object_name: 'staff/exact.png' }]);
  check(await scalar('select count(*)::int as value from storage.objects'), 4);
  check((await db.query("select policyname from pg_policies where schemaname='storage' and tablename='objects'")).rows,
    [{ policyname: 'unrelated_storage_policy' }]);

  await identity('authenticated', owner);
  const form = (await db.query(insert, [owner])).rows[0];
  check(form.owner_id, owner);
  check(await scalar('select id as value from company_forms where id=$1', [form.id]), form.id);
  check(await scalar("update company_forms set name='Owner edit' where id=$1 returning name as value", [form.id]), 'Owner edit');
  await rejected(insert, [unrelated]);
  await rejected("update company_forms set owner_id=$1 where id=$2", [editor, form.id], /cannot be changed/);
  await rejected('select * from retired_internal_bug_screenshot_cleanup', []);
  await rejected('insert into email_rules(mailbox_id) values($1)', [shared]);
  check(await scalar('insert into email_rules(mailbox_id) values($1) returning mailbox_id as value', [personal]), personal);
  await rejected(`insert into support_tickets(subject,category,internal_only,developer_flag)
    values('Retired','bug',true,true)`);
  await identity('postgres');
  await db.query("update profiles set system_role='admin' where id=$1", [owner]);
  await identity('authenticated', owner);
  await rejected("update support_tickets set internal_only=true,developer_flag=true,category='bug' where id=$1", [ticketIds[0]]);
  check(await scalar("insert into support_tickets(subject,category) values('Customer bug','bug') returning internal_only as value"), false);

  await identity('postgres');
  for (const [id, permission] of [[editor, 'editor'], [viewer, 'viewer'], [commenter, 'commenter']]) {
    await db.query(`insert into company_form_collaborators(form_id,shared_with_user_id,permission,shared_by)
      values($1,$2,$3,$4)`, [form.id, id, permission, owner]);
  }
  for (const [id, permission] of [[editor, 'editor'], [viewer, 'viewer'], [commenter, 'commenter']]) {
    await identity('authenticated', id);
    check(await scalar('select id as value from company_forms where id=$1', [form.id]), form.id);
    const updated = await db.query("update company_forms set name='Collaborator edit' where id=$1 returning id", [form.id]);
    check(updated.rows.length, permission === 'editor' ? 1 : 0);
    await rejected('insert into company_form_collaborators(form_id,shared_with_user_id,permission,shared_by) values($1,$2,\'editor\',$2)', [form.id, id]);
  }
  await identity('authenticated', unrelated);
  check(await scalar('select count(*)::int as value from company_forms where id=$1', [form.id]), 0);
  check((await db.query("update company_forms set name='Unrelated edit' where id=$1 returning id", [form.id])).rows.length, 0);
  // Unrelated active staff can create their own form, but never impersonate owner.
  await rejected(insert, [owner]);
  check((await db.query(insert, [unrelated])).rows[0].owner_id, unrelated);
  await identity('postgres');
  await db.query(`insert into company_form_collaborators(form_id,shared_with_email,permission,shared_by)
    values($1,'email-editor@example.test','editor',$2)`, [form.id, owner]);
  await identity('authenticated', unrelated, 'EMAIL-EDITOR@EXAMPLE.TEST');
  check(await scalar('select id as value from company_forms where id=$1', [form.id]), form.id);
  check((await db.query("update company_forms set name='Email collaborator' where id=$1 returning id", [form.id])).rows.length, 1);
  await identity('authenticated', inactive);
  await rejected(insert, [inactive]);
  check(await scalar('select count(*)::int as value from company_forms'), 0);
  await identity('authenticated');
  await rejected(insert, [owner]);
  await identity('anon');
  await rejected(insert, [owner]);
  await rejected('select * from company_forms');

  await identity('postgres');
  await db.query("update profiles set account_status='suspended' where id=$1", [editor]);
  await identity('authenticated', editor);
  check(await scalar('select count(*)::int as value from company_forms where id=$1', [form.id]), 0);
  check((await db.query("update company_forms set name='Inactive editor' where id=$1 returning id", [form.id])).rows.length, 0);
  await identity('postgres');
  await db.query("update profiles set account_status='suspended' where id=$1", [owner]);
  await identity('authenticated', owner);
  check(await scalar('select count(*)::int as value from company_forms'), 0);
  await rejected(insert, [owner]);
  check((await db.query("update company_forms set name='Inactive owner' where id=$1 returning id", [form.id])).rows.length, 0);
  await identity('service_role');
  check(await scalar('select count(*)::int as value from retired_internal_bug_screenshot_cleanup'), 1);
  await identity('anon');
  await rejected('select * from retired_internal_bug_screenshot_cleanup');
  await identity('postgres');
  await db.exec(correction);
  check(await scalar('select count(*)::int as value from support_tickets'), 8);
  check(await scalar('select count(*)::int as value from retired_internal_bug_screenshot_cleanup'), 1);
  check(await scalar('select count(*)::int as value from company_forms'), 2);
  console.log(`Forms and scoped retirement: ${checks} real PostgreSQL runtime checks passed (including migration rerun).`);
} finally {
  await db.close();
}
