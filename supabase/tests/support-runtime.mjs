// PostgreSQL regression fixture for support migration/backfill, inbound threading and idempotency.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const readMigration = (name) => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
const agent = '11111111-1111-4111-8111-111111111111';
const requester = '22222222-2222-4222-8222-222222222222';
const secondAgent = '33333333-3333-4333-8333-333333333333';
const receivedAt = '2026-11-08T10:00:00Z';

const ingest = (overrides = {}) => ({
  p_event_id: 'evt-1',
  p_provider_email_id: 'email-1',
  p_message_id: 'first@example.org',
  p_from_email: 'avery@example.org',
  p_from_name: 'Avery Customer',
  p_to_addresses: ['team@flown.org'],
  p_subject: 'Need help',
  p_body: 'Please help me sign in.',
  p_in_reply_to: null,
  p_references: [],
  p_conversation_token: null,
  p_attachments: [],
  p_received_at: receivedAt,
  ...overrides,
});

try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    grant usage on schema public, auth to anon, authenticated, service_role;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create table profiles (
      id text primary key,
      name text not null,
      email text,
      system_role text not null,
      account_status text not null default 'active'
    );
    insert into profiles(id,name,email,system_role) values
      ('${agent}','Support Agent','agent@flown.org','admin'),
      ('${requester}','Avery Customer','avery@example.org','member'),
      ('${secondAgent}','Other Agent','other@flown.org','coordinator');
    create table crm_contacts(id uuid primary key default gen_random_uuid());
  `);
  await db.query('select set_config($1,$2,false)', ['test.uid', agent]);
  await db.exec(readMigration('20261101220000_add_support_tickets.sql'));
  await db.exec(readMigration('20261102170000_support_messaging.sql'));

  const legacyTicket = (await db.query(`
    insert into support_tickets(subject,description,category,priority,status,requester_id,assignee_id,organization_name)
    values ('Legacy request','Old description','general','high','waiting','${requester}','${agent}','Example Co')
    returning id
  `)).rows[0].id;
  await db.query(`
    insert into support_ticket_comments(ticket_id,author_id,body,is_internal,created_at)
    values ($1,$2,'A public legacy reply',false,now()+interval '1 minute'),
           ($1,$2,'A private legacy note',true,now()+interval '2 minutes')
  `, [legacyTicket, agent]);

  const migration = readMigration('20261115130000_support_email_queue.sql');
  await db.exec(migration);
  await db.exec(migration);

  const linked = (await db.query('select id,customer_id,status,assignee_id,ticket_id from support_conversations where ticket_id=$1', [legacyTicket])).rows;
  assert.equal(linked.length, 1, 'legacy tickets are bridged only once');
  assert.equal(linked[0].status, 'pending');
  assert.equal(linked[0].assignee_id, agent);
  const bridgedMessages = (await db.query('select sender_type,body from support_messages where conversation_id=$1 order by created_at,id', [linked[0].id])).rows;
  assert.deepEqual(bridgedMessages.map((row) => row.body), ['Old description', 'A public legacy reply', 'A private legacy note']);
  assert.deepEqual(bridgedMessages.map((row) => row.sender_type), ['customer', 'agent', 'note']);

  await db.query("update support_conversations set status='resolved',assignee_id=$1 where id=$2", [secondAgent, linked[0].id]);
  let legacyStatus = (await db.query('select status,assignee_id from support_tickets where id=$1', [legacyTicket])).rows[0];
  assert.deepEqual(legacyStatus, { status: 'resolved', assignee_id: secondAgent });
  await db.query("update support_tickets set status='open',assignee_id=null where id=$1", [legacyTicket]);
  let conversationStatus = (await db.query('select status,assignee_id from support_conversations where id=$1', [linked[0].id])).rows[0];
  assert.deepEqual(conversationStatus, { status: 'open', assignee_id: null });
  assert.equal((await db.query('select count(*)::int as count from support_tickets where id=$1', [legacyTicket])).rows[0].count, 1);

  const futureTicket = (await db.query(`
    insert into support_tickets(subject,description,category,priority,status,requester_id)
    values ('New legacy request','New ticket body','general','normal','new','${requester}')
    returning id
  `)).rows[0].id;
  const futureConversation = (await db.query('select id from support_conversations where ticket_id=$1', [futureTicket])).rows[0].id;
  assert.equal((await db.query('select count(*)::int as count from support_messages where conversation_id=$1 and body=$2', [futureConversation, 'New ticket body'])).rows[0].count, 1);
  await db.query(`
    insert into support_ticket_comments(ticket_id,author_id,body,is_internal)
    values ($1,$2,'A later legacy comment',false)
  `, [futureTicket, agent]);
  assert.equal((await db.query('select count(*)::int as count from support_messages where conversation_id=$1 and body=$2', [futureConversation, 'A later legacy comment'])).rows[0].count, 1);
  await db.query(`
    insert into support_messages(conversation_id,sender_type,sender_id,channel,body)
    values ($1,'agent',$2,'email','Reply from the new queue')
  `, [futureConversation, secondAgent]);
  assert.equal((await db.query('select count(*)::int as count from support_ticket_comments where ticket_id=$1 and body=$2', [futureTicket, 'Reply from the new queue'])).rows[0].count, 1);

  const first = (await db.query('select support_ingest_resend_email($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) as result', [
    ...Object.values(ingest()),
  ])).rows[0].result;
  assert.equal(first.duplicate, false);
  const emailConversationId = first.conversation_id;
  let queueRow = (await db.query('select status,assignee_id,channel from support_conversations where id=$1', [emailConversationId])).rows[0];
  assert.deepEqual(queueRow, { status: 'open', assignee_id: null, channel: 'email' }, 'incoming emails start unassigned');
  assert.equal((await db.query('update support_conversations set assignee_id=$1 where id=$2 and assignee_id is null returning id', [agent, emailConversationId])).rows.length, 1);
  assert.equal((await db.query('update support_conversations set assignee_id=$1 where id=$2 and assignee_id is null returning id', [secondAgent, emailConversationId])).rows.length, 0, 'a second conditional claim cannot overwrite the first claim');

  const duplicate = (await db.query('select support_ingest_resend_email($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) as result', [
    ...Object.values(ingest({ p_event_id: 'evt-retry' })),
  ])).rows[0].result;
  assert.equal(duplicate.duplicate, true, 'same provider email is idempotent even under a second webhook event ID');

  const token = (await db.query('select public_token from support_conversations where id=$1', [emailConversationId])).rows[0].public_token;
  const threaded = (await db.query('select support_ingest_resend_email($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) as result', [
    ...Object.values(ingest({
      p_event_id: 'evt-threaded',
      p_provider_email_id: 'email-threaded',
      p_message_id: 'second@example.org',
      p_subject: 'Re: Need help',
      p_body: 'It still does not work.',
      p_conversation_token: token,
    })),
  ])).rows[0].result;
  assert.equal(threaded.conversation_id, emailConversationId, 'reply alias routes to the existing conversation');

  const referenced = (await db.query('select support_ingest_resend_email($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) as result', [
    ...Object.values(ingest({
      p_event_id: 'evt-referenced',
      p_provider_email_id: 'email-referenced',
      p_message_id: 'third@example.org',
      p_subject: 'Re: Need help',
      p_body: 'Reply references the original email.',
      p_in_reply_to: 'first@example.org',
    })),
  ])).rows[0].result;
  assert.equal(referenced.conversation_id, emailConversationId, 'RFC message headers route an email reply');

  const otherSender = (await db.query('select support_ingest_resend_email($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) as result', [
    ...Object.values(ingest({
      p_event_id: 'evt-other-sender',
      p_provider_email_id: 'email-other-sender',
      p_message_id: 'other@example.org',
      p_from_email: 'imposter@example.org',
      p_conversation_token: token,
    })),
  ])).rows[0].result;
  assert.notEqual(otherSender.conversation_id, emailConversationId, 'a reply token cannot attach another sender to a contact thread');

  assert.equal((await db.query('select count(*)::int as count from support_messages where conversation_id=$1', [emailConversationId])).rows[0].count, 3);
  assert.equal((await db.query('select count(*)::int as count from support_email_events')).rows[0].count, 4);
  assert.equal((await db.query('select count(*)::int as count from support_customers where lower(email)=lower($1)', ['avery@example.org'])).rows[0].count, 1);

  const signature = 'support_ingest_resend_email(text,text,text,text,text,text[],text,text,text,text[],text,jsonb,timestamp with time zone)';
  assert.equal((await db.query('select has_function_privilege($1,$2,$3) as allowed', ['anon', signature, 'execute'])).rows[0].allowed, false);
  assert.equal((await db.query('select has_function_privilege($1,$2,$3) as allowed', ['authenticated', signature, 'execute'])).rows[0].allowed, false);
  assert.equal((await db.query('select has_function_privilege($1,$2,$3) as allowed', ['service_role', signature, 'execute'])).rows[0].allowed, true);
  assert.equal((await db.query("select has_table_privilege('authenticated','support_email_outbox','select') as allowed")).rows[0].allowed, false);

  await db.exec(`
    create table email_mailboxes(id uuid primary key default gen_random_uuid(), email text, provider text, mailbox_type text);
    create table grants(id uuid primary key default gen_random_uuid());
    insert into email_mailboxes(email,provider,mailbox_type) values
      ('team@flown.org','microsoft','shared'), ('grants@flown.org','microsoft','shared');
  `);
  const outlookMigration = readMigration('20261116100000_outlook_support.sql');
  await db.exec(outlookMigration); await db.exec(outlookMigration);
  const mailboxId = (await db.query("update email_mailboxes set support_started_at='2026-11-09T12:00:00Z' where email='team@flown.org' returning id")).rows[0].id;
  const otherMailbox = (await db.query("select id from email_mailboxes where email='grants@flown.org'")).rows[0].id;
  const outlook = async (overrides = {}) => {
    const args = {
      mailbox: mailboxId, thread: 'thread-one', provider: 'outlook-message-one', message: 'outlook-one@example.org',
      sender: 'outlook-person@example.org', senderName: 'Outlook person', subject: 'Outlook help', body: 'Please help',
      replyTo: null, references: [], received: '2026-11-09T12:01:00Z', sent: false, attachments: [],
      ...overrides,
    };
    return (await db.query('select support_ingest_outlook_email($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) as result', Object.values(args))).rows[0].result;
  };
  assert.equal((await outlook({ received: '2026-11-08T12:00:00Z' })).ignored, true, 'historical mail is not imported');
  assert.equal((await outlook({ mailbox: otherMailbox })).ignored, true, 'grants intake is deferred');
  const firstOutlook = await outlook();
  assert.equal(new Date((await db.query('select last_message_at from support_conversations where id=$1', [firstOutlook.conversation_id])).rows[0].last_message_at).toISOString(), '2026-11-09T12:01:00.000Z', 'the first message uses its received time, not the polling time');
  const outlookConversation = (await db.query('select assignee_id,status from support_conversations where id=$1', [firstOutlook.conversation_id])).rows[0];
  assert.deepEqual(outlookConversation, { assignee_id: null, status: 'open' });
  assert.equal((await outlook()).duplicate, true);
  await outlook({ provider: 'outlook-message-two', message: 'outlook-two@example.org', body: 'Following up' });
  assert.equal((await db.query('select count(*)::int as n from support_messages where conversation_id=$1', [firstOutlook.conversation_id])).rows[0].n, 2, 'same thread appends to one ticket');
  await outlook({ provider: 'outlook-sent', message: 'outlook-sent@example.org', sender: 'team@flown.org', body: 'Reply from Outlook', sent: true });
  assert.equal((await db.query("select count(*)::int as n from support_messages where conversation_id=$1 and sender_type='agent'", [firstOutlook.conversation_id])).rows[0].n, 1);
  assert.equal((await outlook({ thread: 'unrelated', provider: 'contract-invite', message: 'contract@example.org', sent: true })).ignored, true);
  await db.query("insert into operational_email_deliveries(idempotency_key,payload_hash,status,mailbox_id,draft_id) values ('reply-key','hash','sent',$1,'app-reply')", [mailboxId]);
  assert.equal((await outlook({ provider: 'app-reply', message: 'app-reply@example.org', sent: true })).ignored, true, 'app replies are not duplicated by sent-item sync');
  await outlook({ provider: 'newest-message', message: 'newest@example.org', body: 'Newest message', received: '2026-11-09T12:03:00Z' });
  await outlook({ provider: 'older-message', message: 'older@example.org', body: 'Older message', received: '2026-11-09T12:02:00Z' });
  const latest = (await db.query('select last_message_at,last_message_preview from support_conversations where id=$1', [firstOutlook.conversation_id])).rows[0];
  assert.equal(latest.last_message_preview, 'Newest message', 'out-of-order pages do not replace the latest preview');
  assert.equal(new Date(latest.last_message_at).toISOString(), '2026-11-09T12:03:00.000Z');
  const outlookSignature = 'support_ingest_outlook_email(uuid,text,text,text,text,text,text,text,text,text[],timestamp with time zone,boolean,jsonb)';
  for (const role of ['anon', 'authenticated']) {
    assert.equal((await db.query('select has_function_privilege($1,$2,$3) as allowed', [role, outlookSignature, 'execute'])).rows[0].allowed, false);
  }
  console.log('Support SQL passed: legacy bridge, Outlook cutoff, team-only intake, threading, sent-item sync, deduplication and service-only access.');
} finally {
  await db.close();
}
