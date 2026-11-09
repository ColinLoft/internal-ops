// Real PostgreSQL/RLS regression test; optional PGlite is not a project dependency.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const migration = (name) => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
const staff = '11111111-1111-4111-8111-111111111111';
const a = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const b = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const c = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const missing = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    grant usage on schema public, auth to anon, authenticated, service_role;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create table profiles(id text primary key, account_status text);
    insert into profiles values('${staff}', 'active');
  `);
  await db.query("select set_config('test.uid', $1, false)", [staff]);
  await db.exec(migration('20261110150000_flown_systems.sql'));
  await db.query("insert into flown_systems(id,name) values($1,'One'),($2,'Two'),($3,'Three')", [a, b, c]);
  await db.query("insert into flown_system_incidents(system_id,title) values($1,'Legacy incident')", [a]);
  const update = migration('20261114110000_multi_system_operations.sql');
  const bundle = readFileSync(new URL('../flown_ops_update_all.sql', import.meta.url), 'utf8');
  assert.equal(bundle.split('-- BEGIN supabase/migrations/20261114110000_multi_system_operations.sql\n')[1].split('-- END supabase/migrations/20261114110000_multi_system_operations.sql')[0].trim(), update.trim());
  await db.exec(update);
  await db.exec(update);
  assert.deepEqual((await db.query('select system_ids from flown_system_incidents')).rows[0].system_ids, [a]);

  await db.exec('set role authenticated');
  const incident = (await db.query("insert into flown_system_incidents(system_id,system_ids,title) values($1,$2,'Shared incident') returning id", [a, [a, b, a]])).rows[0].id;
  const maintenance = (await db.query("insert into flown_system_maintenance(system_id,system_ids,title,starts_at,ends_at) values($1,$2,'Shared maintenance',now(),now()+interval '1 hour') returning id", [a, [a, b]])).rows[0].id;
  assert.deepEqual((await db.query('select system_ids from flown_system_incidents where id=$1', [incident])).rows[0].system_ids, [a, b]);
  await assert.rejects(db.query("insert into flown_system_incidents(system_id,system_ids,title) values($1,$2,'Invalid')", [a, [a, missing]]), /no longer exists/);
  await assert.rejects(db.query("insert into flown_system_incidents(system_id,system_ids,title) values($1,$2,'Invalid')", [a, [null]]), /valid affected systems/);
  await db.query("update flown_system_incidents set status='resolved',resolved_at=now() where id=$1", [incident]);
  assert.equal((await db.query('select status from flown_system_incidents where $1=any(system_ids) and id=$2', [b, incident])).rows[0].status, 'resolved');
  // Legacy clients can still change their single affected system.
  await db.query("update flown_system_incidents set system_id=$1 where title='Legacy incident'", [c]);
  assert.deepEqual((await db.query("select system_ids from flown_system_incidents where title='Legacy incident'")).rows[0].system_ids, [c]);
  // Deleting the primary system retains shared records and promotes the other reference.
  await db.query('delete from flown_systems where id=$1', [a]);
  for (const [table, id] of [['flown_system_incidents', incident], ['flown_system_maintenance', maintenance]]) {
    const record = (await db.query(`select system_id,system_ids from ${table} where id=$1`, [id])).rows[0];
    assert.deepEqual(record, { system_id: b, system_ids: [b] });
  }
  // Removing a non-primary reference leaves the primary untouched.
  await db.query('update flown_system_incidents set system_ids=$1 where id=$2', [[b, c], incident]);
  await db.query('delete from flown_systems where id=$1', [c]);
  assert.deepEqual((await db.query('select system_ids from flown_system_incidents where id=$1', [incident])).rows[0].system_ids, [b]);
  await db.exec('reset role');
  await db.query("update profiles set account_status='suspended' where id=$1", [staff]);
  await db.exec('set role authenticated');
  assert.equal((await db.query('select count(*)::int as count from flown_system_incidents')).rows[0].count, 0);
  await assert.rejects(db.query("insert into flown_system_incidents(system_id,title) values($1,'Denied')", [b]), /row-level security/);
  await db.exec('reset role');
  await db.query('delete from flown_systems where id=$1', [b]);
  assert.equal((await db.query('select count(*)::int as count from flown_system_incidents')).rows[0].count, 0);
  assert.equal((await db.query('select count(*)::int as count from flown_system_maintenance')).rows[0].count, 0);
  console.log('Systems SQL passed: rerun/backfill, shared CRUD, reference validation, deletion, RLS and bundle parity.');
} finally {
  await db.close();
}
