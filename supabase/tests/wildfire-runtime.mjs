// Optional real PostgreSQL runtime test. Supply PGLITE_MODULE without adding a project dependency.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const editor = '11111111-1111-4111-8111-111111111111';
const property = '22222222-2222-4222-8222-222222222222';
const opportunity = '33333333-3333-4333-8333-333333333333';
const product = '44444444-4444-4444-8444-444444444444';
let checks = 0;
const scalar = async (sql, params = []) => (await db.query(sql, params)).rows[0]?.value;
const rejected = async (sql, params, match) => {
  await assert.rejects(db.query(sql, params), match);
  checks++;
};
const identity = async (role, id = '') => {
  await db.exec('reset role');
  await db.query("select set_config('test.role',$1,false),set_config('test.uid',$2,false)", [role, id]);
  if (role !== 'postgres') await db.exec(`set role ${role}`);
};
try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    grant usage on schema public,auth to anon,authenticated,service_role;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
    create function auth.role() returns text language sql stable as
      $$ select current_setting('test.role',true) $$;
    grant execute on all functions in schema auth to public;
    create table profiles(id text primary key,account_status text,system_role text,name text);
    insert into profiles values('${editor}','active','admin','Editor');
    create table workspace_roles(id uuid primary key default gen_random_uuid(),name text unique,description text);
    create table workspace_role_permissions(role_id uuid,app text,level text,primary key(role_id,app));
    create function has_app_access(text,text) returns boolean language sql stable as
      $$ select auth.uid()::text = '${editor}' $$;
    create function app_access_level(text) returns integer language sql stable as $$ select 3 $$;
    create table customer_contracts(id uuid primary key);
    create table support_tickets(id uuid primary key);
    grant select on profiles to authenticated;
    alter default privileges in schema public grant all on tables to service_role;
  `);
  await db.exec(readFileSync(new URL('../migrations/20261101240000_add_relationships_crm.sql', import.meta.url), 'utf8'));
  await db.exec(readFileSync(new URL('../migrations/20261107130000_wildfire_solutions_foundation.sql', import.meta.url), 'utf8'));
  const migration = readFileSync(new URL('../migrations/20261111100000_wildfire_workflow.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  // Supabase's platform default privileges provide table grants; keep the actual CRM RLS policies.
  await db.exec('grant select,insert,update,delete on crm_organizations,crm_contacts to authenticated');
  const rpcArgs = (await db.query(`select proname,pg_get_function_arguments(oid) as args
    from pg_proc where proname in ('wildfire_create_site_plan','wildfire_create_quote_from_plan','wildfire_save_quote','wildfire_clone_quote')`)).rows;
  assert.equal(rpcArgs.length, 4);
  assert.equal(rpcArgs.find((row) => row.proname === 'wildfire_create_site_plan').args, 'p_property_id uuid, p_opportunity_id uuid, p_name text');
  assert.equal(rpcArgs.find((row) => row.proname === 'wildfire_save_quote').args,
    'p_quote_id uuid, p_currency text, p_discount numeric, p_tax numeric, p_expires_at date, p_terms text, p_proposal text, p_lines jsonb');
  checks++;
  await identity('authenticated', editor);
  await db.query(`insert into wildfire_opportunities(id,name,prospect_name,prospect_website)
    values($1,'Council opportunity','Example Council','https://example.org')`, [opportunity]);
  await db.query("insert into wildfire_properties(id,label) values($1,'Site before CRM')", [property]);
  await db.query("insert into wildfire_products(id,sku,name,category,list_price) values($1,'CAM-1','Camera','detection',100)", [product]);
  const plan = await scalar("select wildfire_create_site_plan($1,$2,'Plan') as value", [property, opportunity]);
  const plan2 = await scalar("select wildfire_create_site_plan($1,$2,'Plan') as value", [property, opportunity]);
  assert.equal(await scalar('select version as value from wildfire_site_plans where id=$1', [plan2]), 2);
  assert.equal(await scalar('select organization_id as value from wildfire_properties where id=$1', [property]), null);
  await db.query(`insert into wildfire_site_placements(site_plan_id,product_id,placement_type,label,latitude,longitude)
    values($1,$2,'camera','Camera north',45,-75)`, [plan, product]);
  const quote = await scalar('select wildfire_create_quote_from_plan($1) as value', [plan]);
  assert.equal(await scalar('select line_total::text as value from wildfire_quote_lines where quote_id=$1', [quote]), '100.00');
  await db.query(`select wildfire_save_quote($1,'USD',0,5,null,'Explicit customer terms','Proposal narrative',$2::jsonb)`,
    [quote, JSON.stringify([{ product_id: product, description: 'Camera', quantity: 2, unit_price: 100 }])]);
  checks++;
  await rejected(`select wildfire_accept_quote('x','Jane','jane@example.org','x','x','x',true,'{}')`, [], /permission denied/);
  await rejected("insert into wildfire_deployments(organization_id,property_id) values(gen_random_uuid(),$1)", [property], /permission denied/);
  await identity('postgres');
  assert.equal(await scalar('select count(*)::int as value from crm_organizations'), 0);
  assert.equal(await scalar('select count(*)::int as value from crm_contacts'), 0);
  checks++;
  await identity('service_role');
  const tokenHash = 'a'.repeat(64);
  const publish = await scalar("select wildfire_publish_quote($1,$2,$3,now()+interval '30 days') as value", [quote, tokenHash, editor]);
  assert.ok(publish.expiresAt);
  const published = (await db.query('select snapshot,snapshot_sha256,status from wildfire_quotes where id=$1', [quote])).rows[0];
  assert.equal(published.status, 'sent');
  assert.equal(published.snapshot.total, 205);
  assert.equal(published.snapshot.proposal, 'Proposal narrative');
  assert.equal(published.snapshot.property.id, property);
  assert.equal(published.snapshot.site_plan.id, plan);
  assert.equal(await scalar('select count(*)::int as value from crm_organizations'), 0);
  checks++;
  await identity('authenticated', editor);
  await rejected("update wildfire_quotes set terms='Tampered' where id=$1", [quote], /immutable/);
  await rejected('update wildfire_quote_lines set unit_price=1 where quote_id=$1', [quote], /draft-only/);
  await rejected("update wildfire_quotes set snapshot='{}' where id=$1", [quote], /immutable/);
  const clone = await scalar('select wildfire_clone_quote($1) as value', [quote]);
  assert.equal(await scalar('select version as value from wildfire_quotes where id=$1', [clone]), 2);
  await db.query('update wildfire_quotes set site_plan_id=null where id=$1', [clone]);
  await db.query('update wildfire_quotes set property_id=null where id=$1', [clone]);
  await identity('service_role');
  await rejected("select wildfire_publish_quote($1,$2,$3,now()+interval '30 days')", [clone, 'c'.repeat(64), editor], /needs a property/);
  await identity('authenticated', editor);
  await db.query('update wildfire_quotes set property_id=$1,site_plan_id=$2 where id=$3', [property, plan, clone]);
  await identity('anon');
  await rejected('select * from wildfire_quotes', [], /permission denied/);
  await rejected('select * from wildfire_quote_links', [], /permission denied/);
  await rejected("select wildfire_create_quote_from_plan($1)", [plan], /permission denied/);
  await identity('service_role');
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jK1sAAAAASUVORK5CYII=';
  const signatureHash = await scalar("select encode(sha256(decode(substring($1 from 23),'base64')),'hex') as value", [png]);
  const acceptSql = 'select wildfire_accept_quote($1,$2,$3,$4,$5,$6,$7,$8::jsonb) as value';
  const acceptParams = [tokenHash, 'Jane Smith', 'jane@example.org', png, signatureHash, published.snapshot_sha256, true, '{}'];
  await rejected(acceptSql, ['b'.repeat(64), ...acceptParams.slice(1)], /Invalid or revoked/);
  await rejected(acceptSql, [...acceptParams.slice(0, 5), '0'.repeat(64), ...acceptParams.slice(6)], /hash does not match/);
  await rejected(acceptSql, [...acceptParams.slice(0, 4), '0'.repeat(64), ...acceptParams.slice(5)], /hash does not match/);
  await db.query("update wildfire_quote_links set expires_at=now()-interval '1 second' where token_hash=$1", [tokenHash]);
  await rejected(acceptSql, acceptParams, /no longer active/);
  await db.query("update wildfire_quote_links set expires_at=now()+interval '1 day',revoked_at=now() where token_hash=$1", [tokenHash]);
  await rejected(acceptSql, acceptParams, /Invalid or revoked/);
  await db.query('update wildfire_quote_links set revoked_at=null where token_hash=$1', [tokenHash]);
  // PGlite runs queued transactions in one connection; concurrent requests still exercise idempotent RPC entry.
  const [accepted, retry] = await Promise.all([scalar(acceptSql, acceptParams), scalar(acceptSql, acceptParams)]);
  assert.deepEqual(retry, accepted);
  assert.equal(accepted.status, 'accepted');
  assert.equal(await scalar('select count(*)::int as value from wildfire_deployments where quote_id=$1', [quote]), 1);
  assert.equal(await scalar('select count(*)::int as value from crm_organizations'), 1);
  assert.equal(await scalar('select count(*)::int as value from crm_contacts'), 1);
  assert.equal(await scalar("select count(*)::int as value from wildfire_deployment_events where deployment_id=$1 and event_type='quote_accepted'", [accepted.deploymentId]), 1);
  checks++;
  await db.query("update wildfire_quote_links set expires_at=now()-interval '1 day' where token_hash=$1", [tokenHash]);
  assert.deepEqual(await scalar(acceptSql, acceptParams), accepted);
  await rejected('update wildfire_quote_acceptances set signer_name=$1 where quote_id=$2', ['Tampered', quote], /immutable/);
  await identity('authenticated', editor);
  await rejected("update wildfire_deployments set quote_id=$1 where id=$2", [clone, accepted.deploymentId], /immutable/);
  await rejected("update wildfire_deployments set site_plan_id=$1 where id=$2", [plan2, accepted.deploymentId], /immutable/);
  await rejected("update wildfire_opportunities set property_id=null where id=$1", [opportunity], /immutable/);
  await rejected("update wildfire_properties set organization_id=null where id=$1", [property], /immutable/);
  await rejected("update wildfire_site_plans set opportunity_id=null where id=$1", [plan], /immutable/);
  await rejected("update crm_contacts set organization_id=null where email='jane@example.org'", [], /immutable/);
  await rejected("update wildfire_deployments set contract_id=gen_random_uuid() where id=$1", [accepted.deploymentId], /immutable/);
  await db.query("update wildfire_deployments set status='planning' where id=$1", [accepted.deploymentId]);
  assert.equal(await scalar("select count(*)::int as value from wildfire_deployment_events where deployment_id=$1 and event_type='status_changed'", [accepted.deploymentId]), 1);
  checks++;
  await identity('postgres');
  await db.exec(migration);
  assert.equal(await scalar('select count(*)::int as value from wildfire_deployments'), 1);
  assert.equal(await scalar("select count(*)::int as value from wildfire_quote_acceptances"), 1);
  await db.query("update profiles set account_status='inactive' where id=$1", [editor]);
  await identity('authenticated', editor);
  await rejected("select wildfire_create_site_plan($1,$2,'Inactive')", [property, opportunity], /Active Wildfire editor access required/);
  checks++;
  await identity('postgres');
  const responder = '55555555-5555-4555-8555-555555555555';
  await db.exec(`
    update profiles set account_status='active' where id='${editor}';
    alter table profiles add column last_seen_at timestamptz;
    create table auth.users(id uuid primary key,email text,deleted_at timestamptz);
    insert into profiles values('${responder}','active','member','Responder',now());
    insert into profiles values('ghost','active','member','Orphan profile',now());
    insert into auth.users values('${editor}','editor@example.test',null),('${responder}','responder@example.test',null);
    create table channels(id text primary key,name text,members text[]);
    create table messages(id text primary key,conversation_id text,sender_id text,text text,
      deleted_at timestamptz,reactions jsonb default '[]',seen_by text[] default '{}');
    create table user_notifications(id uuid primary key default gen_random_uuid(),user_id text,type text,
      title text,body text,link_tab text,target_id text,actor_id text,actor_name text);
    create function can_access_conversation(conversation text,actor text) returns boolean
      language sql stable security definer as
      $$ select exists(select 1 from channels where id=conversation and actor=any(members)) $$;
    alter table channels enable row level security;
    alter table messages enable row level security;
    create policy fixture_channel_read on channels for select to authenticated using(can_access_conversation(id,auth.uid()::text));
    create policy fixture_message_read on messages for select to authenticated using(can_access_conversation(conversation_id,auth.uid()::text));
    create policy fixture_message_update on messages for update to authenticated using(can_access_conversation(conversation_id,auth.uid()::text));
    grant select on channels to authenticated;
    grant select,update on messages to authenticated;
    insert into channels values('public','General',array['${editor}','${responder}']),('private','Private',array['${editor}']);
    insert into messages(id,conversation_id,sender_id,text) values
      ('original','public','${editor}','Original post'),('private-post','private','${editor}','Private post');
  `);
  const round3 = readFileSync(new URL('../migrations/20261113130000_qa_round3_fixes.sql', import.meta.url), 'utf8');
  await db.exec(round3);
  await identity('authenticated', editor);
  const customer = await scalar('select organization_id as value from wildfire_properties where id=$1', [property]);
  const manual = await scalar("select wildfire_create_manual_deployment($1,$2,'Manual notes') as value", [property, customer]);
  assert.equal(await scalar('select quote_id as value from wildfire_deployments where id=$1', [manual]), null);
  assert.equal(await scalar('select status as value from wildfire_deployments where id=$1', [manual]), 'planning');
  assert.equal(await scalar("select count(*)::int as value from wildfire_deployment_events where deployment_id=$1 and event_type='note'", [manual]), 1);
  await rejected("update wildfire_deployments set customer_accepted_at=now() where id=$1", [manual], /immutable/);
  await rejected("select wildfire_create_manual_deployment($1,gen_random_uuid(),'')", [property], /existing customer/);
  assert.equal((await scalar('select active_staff_metrics() as value')).count, 2);
  checks++;
  await identity('authenticated', responder);
  await rejected("select wildfire_create_manual_deployment($1,$2,'')", [property, customer], /Wildfire editor access required/);
  const unread = (await db.query('select * from channel_unread_counts()')).rows;
  assert.equal(unread.length, 1);
  assert.equal(unread[0].channel_id, 'public');
  assert.equal(Number(unread[0].unread_count), 1);
  await db.query("update messages set reactions=$1::jsonb where id='original'", [JSON.stringify([{ emoji: 'like', users: [responder] }])]);
  await identity('postgres');
  assert.equal(await scalar('select count(*)::int as value from user_notifications'), 1);
  assert.equal(await scalar('select user_id as value from user_notifications'), editor);
  await identity('authenticated', responder);
  await db.query("update messages set reactions='[]' where id='original'");
  await db.query("update messages set seen_by=array[$1] where id='original'", [responder]);
  assert.equal(Number((await db.query('select * from channel_unread_counts()')).rows[0].unread_count), 0);
  await identity('authenticated', editor);
  await db.query("update messages set reactions=$1::jsonb where id='original'", [JSON.stringify([{ emoji: 'like', users: [editor] }])]);
  await identity('postgres');
  assert.equal(await scalar('select count(*)::int as value from user_notifications'), 1);
  await db.exec(round3);
  assert.equal(await scalar('select count(*)::int as value from wildfire_quote_acceptances'), 1);
  assert.equal(await scalar('select count(*)::int as value from wildfire_deployments'), 2);
  await identity('authenticated', editor);
  const nextQuote = await scalar('select wildfire_clone_quote($1) as value', [quote]);
  await identity('service_role');
  const nextTokenHash = 'b'.repeat(64);
  await db.query("select wildfire_publish_quote($1,$2,$3,now()+interval '1 day')", [nextQuote, nextTokenHash, editor]);
  const nextAcceptance = await scalar(acceptSql, [nextTokenHash, 'Jane Smith', 'jane@example.org', png, signatureHash, await scalar('select snapshot_sha256 as value from wildfire_quotes where id=$1', [nextQuote]), true, '{}']);
  assert.equal(nextAcceptance.status, 'accepted');
  assert.equal(await scalar('select count(*)::int as value from wildfire_deployments'), 3);
  checks++;
  console.log(`PGlite PostgreSQL workflow passed: ${checks} checks, including real RLS, RPCs, signatures, immutable links, publication and idempotent acceptance.`);
} finally {
  await db.close();
}
