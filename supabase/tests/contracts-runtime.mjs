import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const migration = readFileSync(new URL('../migrations/20261115120000_contract_placement_and_countersigning.sql', import.meta.url), 'utf8');
const sender = '11111111-1111-4111-8111-111111111111';
const counter = '22222222-2222-4222-8222-222222222222';
const contractId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const sourceId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const requestId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const latestPdfId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const staleRequestId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const staleContractId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const staleSourceId = '99999999-9999-4999-8999-999999999999';

try {
  await db.exec(`
    create role service_role;
    create role anon;
    create role authenticated;
    create table profiles(id text primary key, name text);
    create table customer_contracts(
      id uuid primary key, name text not null, status text not null, counter_signer_id text references profiles(id),
      counterparty_name text not null, counterparty_email text not null,
      signature_requested_at timestamptz, signed_at timestamptz, updated_at timestamptz not null default now()
    );
    create table customer_contract_files(
      id uuid primary key default gen_random_uuid(), contract_id uuid not null references customer_contracts(id), uploaded_by text,
      file_name text not null, storage_path text not null, file_size bigint, mime_type text,
      file_kind text not null, sha256 text, source_file_id uuid references customer_contract_files(id),
      created_at timestamptz not null default now(), version_number integer not null default 1
    );
    create table customer_contract_events(
      id uuid primary key default gen_random_uuid(), contract_id uuid not null references customer_contracts(id),
      actor_id text, event_type text not null, details text not null default '', created_at timestamptz not null default now()
    );
    create table customer_contract_signature_requests(
      id uuid primary key default gen_random_uuid(), contract_id uuid not null references customer_contracts(id),
      source_file_id uuid not null references customer_contract_files(id), token_hash text not null unique,
      status text not null default 'draft' check(status in ('draft','pending','completed','revoked')),
      created_by text not null, created_at timestamptz not null default now(), expires_at timestamptz not null,
      sent_at timestamptz, signed_at timestamptz, signer_name text,
      signed_file_id uuid references customer_contract_files(id), original_sha256 text, signed_sha256 text, signature_sha256 text
    );
    create table customer_contract_signature_events(
      request_id uuid primary key references customer_contract_signature_requests(id),
      contract_id uuid not null references customer_contracts(id), source_file_id uuid not null references customer_contract_files(id),
      signed_file_id uuid not null references customer_contract_files(id), signer_name text not null, signed_at timestamptz not null,
      original_sha256 text not null, signed_sha256 text not null, signature_sha256 text not null
    );
    insert into profiles values('${sender}','Sender'),('${counter}','Counter signer');
    insert into customer_contracts(id,name,status,counter_signer_id,counterparty_name,counterparty_email)
      values('${contractId}','Service agreement','draft','${counter}','Customer','customer@example.com'),
        ('${staleContractId}','Another agreement','draft','${counter}','Customer','customer@example.com');
    insert into customer_contract_files(id,contract_id,file_name,storage_path,file_size,mime_type,file_kind,sha256)
      values('${sourceId}','${contractId}','source.pdf','source.pdf',123,'application/pdf','original_pdf',repeat('a',64)),
        ('${staleSourceId}','${staleContractId}','source.pdf','stale-source.pdf',123,'application/pdf','original_pdf',repeat('a',64));
  `);
  const legacyId = '88888888-8888-4888-8888-888888888888';
  await db.query(
    "insert into customer_contract_signature_requests(id,contract_id,source_file_id,token_hash,status,created_by,expires_at) values($1,$2,$3,repeat('b',64),'completed',$4,now()+interval '1 day')",
    [legacyId, contractId, sourceId, sender],
  );
  await db.exec(migration);
  await db.exec(migration);
  assert.equal((await db.query('select flow_version from customer_contract_signature_requests where id=$1', [legacyId])).rows[0].flow_version, 1);

  const fields = [
    { id: 'r-name', signer: 'recipient', kind: 'name', pageIndex: 0, x: 0.1, y: 0.6, width: 0.24, height: 0.045 },
    { id: 'r-date', signer: 'recipient', kind: 'date', pageIndex: 0, x: 0.1, y: 0.7, width: 0.24, height: 0.045 },
    { id: 'r-sig', signer: 'recipient', kind: 'signature', pageIndex: 0, x: 0.1, y: 0.8, width: 0.3, height: 0.075 },
    { id: 'c-name', signer: 'countersigner', kind: 'name', pageIndex: 0, x: 0.5, y: 0.6, width: 0.24, height: 0.045 },
    { id: 'c-date', signer: 'countersigner', kind: 'date', pageIndex: 0, x: 0.5, y: 0.7, width: 0.24, height: 0.045 },
    { id: 'c-sig', signer: 'countersigner', kind: 'signature', pageIndex: 0, x: 0.5, y: 0.8, width: 0.3, height: 0.075 },
  ];
  await db.query('select create_customer_contract_signature_request_v2($1,$2,$3,$4,$5,now()+interval \'14 days\',$6::jsonb)', [
    requestId, contractId, sourceId, sender, 'c'.repeat(64), JSON.stringify(fields),
  ]);
  await db.query('select mark_customer_contract_signature_request_sent_v2($1,$2,$3,$4)', [requestId, sender, 'c'.repeat(64), 'resend-id']);
  await db.query("select record_customer_contract_recipient_signature($1,'Customer','recipient-signed.pdf',repeat('a',64),repeat('d',64),now())", [requestId]);
  assert.equal((await db.query('select status from customer_contract_signature_requests where id=$1', [requestId])).rows[0].status, 'recipient_signed');
  assert.equal((await db.query('select status from customer_contracts where id=$1', [contractId])).rows[0].status, 'pending_signature');
  await assert.rejects(
    db.query("select record_customer_contract_countersignature($1,$2,'x','x.pdf',1,repeat('e',64),repeat('f',64),now())", [requestId, sender]),
    /Only the selected Flown countersigner/,
  );
  await db.query(
    "select record_customer_contract_countersignature($1,$2,'final.pdf','Service-agreement-signed.pdf',456,repeat('e',64),repeat('f',64),now())",
    [requestId, counter],
  );
  assert.equal((await db.query('select status from customer_contract_signature_requests where id=$1', [requestId])).rows[0].status, 'completed');
  assert.equal((await db.query('select status from customer_contracts where id=$1', [contractId])).rows[0].status, 'active');
  assert.equal((await db.query('select count(*)::int as count from customer_contract_signature_events where request_id=$1', [requestId])).rows[0].count, 1);

  await db.query('select create_customer_contract_signature_request_v2($1,$2,$3,$4,$5,now()+interval \'14 days\',$6::jsonb)', [
    staleRequestId, staleContractId, staleSourceId, sender, '9'.repeat(64), JSON.stringify(fields),
  ]);
  await db.exec(`
    create trigger customer_contract_pdf_version_revokes_signature_links
    after insert on customer_contract_files for each row
    execute function customer_contract_pdf_version_revokes_signature_links();
  `);
  await db.query(
    "insert into customer_contract_files(id,contract_id,file_name,storage_path,file_size,mime_type,file_kind,sha256) values($1,$2,'new.pdf','new.pdf',123,'application/pdf','original_pdf',repeat('a',64))",
    [latestPdfId, staleContractId],
  );
  assert.equal((await db.query('select status from customer_contract_signature_requests where id=$1', [staleRequestId])).rows[0].status, 'revoked');
  await assert.rejects(
    db.query("select record_customer_contract_recipient_signature($1,'Customer','old.pdf',repeat('a',64),repeat('d',64),now())", [staleRequestId]),
    /no longer active/,
  );
  console.log('Contract SQL passed: migration rerun, legacy rows, sent/recipient/counter transitions, permissions, and stale-PDF revocation.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await db.close();
}
