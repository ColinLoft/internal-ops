import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deliverContractEmail } from './contract-email';

type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({ rows: new Map<string, Row>(), connected: true }));
vi.mock('./email.ts', () => ({ getAccessToken: async () => 'fixture-token' }));
vi.mock('https://esm.sh/@supabase/supabase-js@2', () => ({
  createClient: () => ({
    from: (table: string) => {
      let action = 'select';
      let values: Row = {};
      const filters: Row = {};
      const run = () => {
        if (table === 'email_mailboxes') return { data: state.connected ? { id: 'mailbox', email: 'team@flown.org', provider: 'microsoft', mailbox_type: 'shared' } : null, error: null };
        const key = String(values.idempotency_key || filters.idempotency_key);
        const previous = state.rows.get(key);
        if (action === 'insert') {
          if (previous) return { data: null, error: { code: '23505' } };
          state.rows.set(key, { ...values });
        }
        if (action === 'update') {
          if (!previous || Object.entries(filters).some(([field, value]) => previous[field] !== value)) return { data: null, error: null };
          state.rows.set(key, { ...previous, ...values });
        }
        return { data: state.rows.get(key), error: null };
      };
      const query = {
        select: () => query,
        eq: (field: string, value: unknown) => { filters[field] = value; return query; },
        insert: (row: Row) => { values = row; action = 'insert'; return query; },
        update: (row: Row) => { values = row; action = 'update'; return query; },
        single: async () => run(), maybeSingle: async () => run(),
        then: (resolve: (result: ReturnType<typeof run>) => void) => resolve(run()),
      };
      return query;
    },
  }),
}));

const email = { to: 'recipient@example.org', subject: 'Agreement', text: 'Sign agreement', html: '<p>Sign agreement</p>', idempotencyKey: 'invite-1' };
const draft = { id: 'draft-1', conversationId: 'thread-1', internetMessageId: '<message@outlook.test>' };
const accepted = () => vi.fn()
  .mockResolvedValueOnce(Response.json(draft, { status: 201 }))
  .mockResolvedValueOnce(new Response(null, { status: 202 }));

describe('Outlook operational delivery used by contracts and support', () => {
  beforeEach(() => {
    state.rows.clear(); state.connected = true;
    vi.stubGlobal('Deno', { env: { get: () => 'fixture' } });
  });
  it('creates a shared-mailbox draft and sends its immutable ID', async () => {
    const fetcher = accepted();
    const result = await deliverContractEmail(email, { fetcher });
    expect(result).toEqual({ sent: true, emailId: draft.id, threadId: draft.conversationId, internetMessageId: draft.internetMessageId, mailboxId: 'mailbox' });
    expect(fetcher.mock.calls[0][0]).toBe('https://graph.microsoft.com/v1.0/users/team%40flown.org/messages');
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body.from.emailAddress.address).toBe('team@flown.org');
    expect(body.toRecipients[0].emailAddress.address).toBe(email.to);
    expect(fetcher.mock.calls[1][0]).toContain('/messages/draft-1/send');
    expect(state.rows.get(email.idempotencyKey)?.status).toBe('sent');
  });
  it('never sends a second time for a confirmed key, including refreshed download links', async () => {
    const fetcher = accepted();
    await deliverContractEmail(email, { fetcher });
    expect((await deliverContractEmail({ ...email, text: 'New seven-day link' }, { fetcher })).sent).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('does not reuse a key for a different recipient', async () => {
    const fetcher = accepted();
    await deliverContractEmail(email, { fetcher });
    expect((await deliverContractEmail({ ...email, to: 'different@example.org' }, { fetcher })).sent).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('blocks duplicate delivery after an uncertain send', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(draft)).mockRejectedValueOnce(new Error('Connection interrupted'));
    const result = await deliverContractEmail(email, { fetcher });
    expect(result).toMatchObject({ sent: false, uncertain: true });
    expect(state.rows.get(email.idempotencyKey)?.status).toBe('unknown');
    expect((await deliverContractEmail(email, { fetcher })).sent).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('allows a retry after definite rejection, without treating it as success', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(draft)).mockResolvedValueOnce(new Response(null, { status: 403 }));
    expect(await deliverContractEmail(email, { fetcher })).toMatchObject({ sent: false, uncertain: false });
    expect(state.rows.get(email.idempotencyKey)?.status).toBe('failed');
    expect((await deliverContractEmail(email, { fetcher: accepted() })).sent).toBe(true);
  });
  it('uses createReply for existing support threads and carries PDF attachments', async () => {
    const fetcher = accepted();
    await deliverContractEmail({ ...email, replyMessageId: 'original-1', attachments: [{ filename: 'signed.pdf', content: 'cGRm' }] }, { fetcher });
    expect(fetcher.mock.calls[0][0]).toContain('/messages/original-1/createReply');
    expect(JSON.parse(fetcher.mock.calls[0][1].body).message.attachments[0].contentBytes).toBe('cGRm');
  });
  it('reports an unconnected mailbox without sending', async () => {
    state.connected = false;
    const fetcher = vi.fn();
    const result = await deliverContractEmail(email, { fetcher });
    expect(result).toMatchObject({ sent: false });
    if (!result.sent) expect(result.error).toContain('Settings > Email');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
