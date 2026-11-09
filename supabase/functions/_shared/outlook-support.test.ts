import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { syncOutlookSupport } from './outlook-support';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type State = { cursor_url?: string | null; lease_id?: string | null; lease_until?: string | null };
const mock = vi.hoisted(() => ({ states: new Map<string, State>(), payloads: [] as Record<string, unknown>[], failIngest: false }));
vi.mock('./email.ts', () => ({ getAccessToken: async () => 'fixture-token' }));
vi.mock('https://esm.sh/@supabase/supabase-js@2', () => ({
  createClient: () => ({
    from: () => {
      let action = ''; let values: State & { folder?: string } = {};
      let folder = ''; let lease = '';
      const run = () => {
        if (action === 'init') { if (!mock.states.has(values.folder!)) mock.states.set(values.folder!, {}); return { data: null, error: null }; }
        const state = mock.states.get(folder)!;
        if (action === 'claim' && state.lease_until && Date.parse(state.lease_until) >= Date.now()) return { data: null, error: null };
        if (lease && state.lease_id !== lease) return { data: null, error: null };
        mock.states.set(folder, { ...state, ...values });
        return { data: { ...state, folder }, error: null };
      };
      const query = {
        upsert: (input: typeof values) => { values = input; action = 'init'; return query; },
        update: (input: State) => { values = input; action = 'update'; return query; },
        eq: (key: string, value: string) => { if (key === 'folder') folder = value; if (key === 'lease_id') lease = value; return query; },
        or: () => { action = 'claim'; return query; }, select: () => query,
        maybeSingle: async () => run(),
        then: (resolve: (result: ReturnType<typeof run>) => void) => resolve(run()),
      };
      return query;
    },
    rpc: async (_name: string, payload: Record<string, unknown>) => {
      mock.payloads.push(payload);
      return { data: {}, error: mock.failIngest ? { message: 'Fixture database failure' } : null };
    },
  }),
}));

const mailbox = { id: 'mailbox', email: 'team@flown.org', provider: 'microsoft', mailbox_type: 'shared', support_started_at: '2026-11-09T12:00:00Z' };
const message = { id: 'message', conversationId: 'thread', from: { emailAddress: { address: 'person@example.org' } }, receivedDateTime: '2026-11-09T12:01:00Z', body: { contentType: 'Text', content: 'Please help' } };
const cursor = 'https://graph.microsoft.com/v1.0/users/team/mailFolders/inbox/messages/delta?next=1';
describe('durable shared-mailbox sync', () => {
  const admin = () => createClient('https://fixture.invalid', 'fixture');
  beforeEach(() => { mock.states.clear(); mock.payloads.length = 0; mock.failIngest = false; });
  afterEach(() => vi.unstubAllGlobals());
  it('follows pages, persists delta cursors, and releases both leases', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ value: [message], '@odata.nextLink': cursor }))
      .mockResolvedValueOnce(Response.json({ value: [], '@odata.deltaLink': `${cursor}&done=1` }))
      .mockResolvedValueOnce(Response.json({ value: [], '@odata.deltaLink': `${cursor}&sent=1` }));
    vi.stubGlobal('fetch', fetcher);
    expect(await syncOutlookSupport(admin(), mailbox)).toBe(true);
    expect(fetcher.mock.calls[0][0]).toContain('receivedDateTime+ge+2026-11-09T12%3A00%3A00Z');
    expect(fetcher.mock.calls[1][0]).toBe(cursor);
    expect(mock.payloads).toHaveLength(1);
    expect(mock.states.get('inbox')).toMatchObject({ cursor_url: `${cursor}&done=1`, lease_id: null });
    expect(mock.states.get('sentitems')).toMatchObject({ cursor_url: `${cursor}&sent=1`, lease_id: null });
  });
  it('does not advance past a failed ingest and releases the lease for retry', async () => {
    mock.failIngest = true;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ value: [message], '@odata.deltaLink': cursor })));
    await expect(syncOutlookSupport(admin(), mailbox)).rejects.toThrow('could not be saved');
    expect(mock.states.get('inbox')).toMatchObject({ lease_id: null, lease_until: null });
    expect(mock.states.get('inbox')?.cursor_url).toBeUndefined();
    expect(mock.states.has('sentitems')).toBe(false);
  });
  it('resets expired delta tokens without changing the historical cutoff', async () => {
    mock.states.set('inbox', { cursor_url: cursor });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 410 })));
    await expect(syncOutlookSupport(admin(), mailbox)).rejects.toThrow('cursor expired');
    expect(mock.states.get('inbox')).toMatchObject({ cursor_url: null, lease_id: null });
    expect(mailbox.support_started_at).toBe('2026-11-09T12:00:00Z');
  });
  it('does not process sent mail while another worker is catching up on inbox mail', async () => {
    mock.states.set('inbox', { lease_id: 'other-worker', lease_until: new Date(Date.now() + 60_000).toISOString() });
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    expect(await syncOutlookSupport(admin(), mailbox)).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
    expect(mock.states.has('sentitems')).toBe(false);
  });
  it('checkpoints bounded catch-up without processing sent mail before inbox completion', async () => {
    const fetcher = vi.fn().mockImplementation(async () => Response.json({ value: [], '@odata.nextLink': cursor }));
    vi.stubGlobal('fetch', fetcher);
    expect(await syncOutlookSupport(admin(), mailbox)).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(5);
    expect(mock.states.get('inbox')).toMatchObject({ cursor_url: cursor, lease_id: null });
    expect(mock.states.has('sentitems')).toBe(false);
  });
  it('retries attachment metadata failures without skipping a message', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(Response.json({ value: [{ ...message, hasAttachments: true }], '@odata.deltaLink': cursor }))
      .mockResolvedValueOnce(Response.json({ error: 'unavailable' }, { status: 503 })));
    await expect(syncOutlookSupport(admin(), mailbox)).rejects.toThrow('attachment details could not be loaded');
    expect(mock.payloads).toHaveLength(0);
    expect(mock.states.get('inbox')?.cursor_url).toBeUndefined();
  });
  it('does not sync the deferred grants mailbox', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await syncOutlookSupport(admin(), { ...mailbox, email: 'grants@flown.org' });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
