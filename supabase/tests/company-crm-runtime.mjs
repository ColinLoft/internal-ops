import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const migration = (name) => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
const owner = '11111111-1111-4111-8111-111111111111';
const outsider = '22222222-2222-4222-8222-222222222222';
const company = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
try {
  await db.exec(`
    create role authenticated;
    create schema auth;
    grant usage on schema public,auth to authenticated;
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('test.uid',true),'')::uuid$$;
    create function has_app_access(app text,level text) returns boolean language sql stable as
      $$select coalesce(current_setting('test.access',true),'') = 'yes'$$;
    create table profiles(id text primary key);
    insert into profiles values('${owner}'),('${outsider}');
    create table workspace_roles(id uuid primary key default gen_random_uuid(),name text unique,description text);
    create table workspace_role_permissions(role_id uuid,app text,level text,unique(role_id,app,level));
  `);
  await db.exec(migration('20261101240000_add_relationships_crm.sql'));
  await db.query("insert into crm_organizations(id,name,category,created_by) values($1,'Existing company','customer',$2)", [company, owner]);
  await db.query("insert into crm_contacts(organization_id,name,created_by) values($1,'Existing contact',$2)", [company, owner]);
  const crm = migration('20261115100000_company_crm.sql');
  await db.exec(crm); await db.exec(crm);
  await db.query("select set_config('test.uid',$1,false),set_config('test.access','yes',false)", [owner]);
  await db.exec('set role authenticated');
  const deal = (await db.query("insert into crm_deals(organization_id,name,amount,owner_id) values($1,'Test deal',0,$2) returning id", [company, owner])).rows[0].id;
  assert.equal(Number((await db.query('select amount from crm_deals where id=$1', [deal])).rows[0].amount), 0);
  await assert.rejects(db.query("insert into crm_deals(organization_id,name,amount) values($1,'Invalid',-1)", [company]), /check constraint/);
  await assert.rejects(db.query("insert into crm_deals(organization_id,name,currency) values($1,'Invalid','invalid')", [company]), /check constraint/);
  await db.query("update crm_deals set stage='won' where id=$1", [deal]);
  await db.query("select set_config('test.uid',$1,false),set_config('test.access','no',false)", [outsider]);
  assert.equal((await db.query('select count(*)::int as count from crm_deals')).rows[0].count, 0);
  await assert.rejects(db.query("insert into crm_deals(organization_id,name) values($1,'Denied')", [company]), /row-level security/);
  await db.exec('reset role');
  await db.query('delete from crm_organizations where id=$1', [company]);
  assert.equal((await db.query('select count(*)::int as count from crm_deals')).rows[0].count, 0);
  assert.equal((await db.query('select organization_id from crm_contacts')).rows[0].organization_id, null);
  await db.exec(`
    create table company_ideas(id int primary key);
    create table company_idea_votes(idea_id int references company_ideas(id));
    create table company_idea_comments(idea_id int references company_ideas(id));
    insert into company_ideas values(1);
    insert into company_idea_votes values(1);
    insert into company_idea_comments values(1);
  `);
  const retirement = migration('20261115110000_retire_company_ideas.sql');
  await db.exec(retirement); await db.exec(retirement);
  assert.equal((await db.query("select to_regclass('company_ideas') as table_name")).rows[0].table_name, null);
  assert.equal((await db.query('select count(*)::int as count from crm_contacts')).rows[0].count, 1);
  console.log('Company CRM SQL passed: rerun, zero amounts, constraints, permissions, contact preservation, and exact Ideas retirement.');
} finally { await db.close(); }
