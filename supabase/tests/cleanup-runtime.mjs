import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const sql = readFileSync(new URL('../migrations/20261118100000_remove_unused_empty_tables.sql', import.meta.url), 'utf8');
const tables = ['organization_records', 'operation_resources', 'operation_activity', 'program_budgets', 'program_documents', 'program_performance'];
const createTables = () => db.exec(tables.map(name => `create table public.${name} (id integer primary key);`).join('\n'));
const exists = async name => (await db.query('select to_regclass($1) is not null as present', [`public.${name}`])).rows[0].present;

try {
  await createTables();
  await db.exec('create table public.support_tickets(id integer primary key); insert into public.support_tickets values (1);');
  await db.exec('insert into public.program_documents values (1);');
  await assert.rejects(db.exec(sql), /contains data/);
  await db.exec('rollback');
  for (const table of tables) assert.equal(await exists(table), true, `${table} must survive a failed cleanup`);
  await db.exec('delete from public.program_documents');

  await db.exec('create view public.keep_budget as select * from public.program_budgets');
  await assert.rejects(db.exec(sql), /depend/);
  await db.exec('rollback');
  for (const table of tables) assert.equal(await exists(table), true, `${table} must survive an unexpected dependency`);
  await db.exec('drop view public.keep_budget');

  await db.exec(sql);
  await db.exec(sql);
  for (const table of tables) assert.equal(await exists(table), false);
  assert.equal((await db.query('select count(*)::int as count from public.support_tickets')).rows[0].count, 1);
  console.log('Database cleanup passed: populated-table refusal, dependency rollback, empty-table removal, rerun, retained-data preservation.');
} finally {
  await db.close();
}
