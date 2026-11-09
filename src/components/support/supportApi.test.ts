import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('../../lib/supabase', () => ({ supabase: { functions: { invoke: mock.invoke } } }));

import { sendSupportReply } from './supportApi';

describe('support reply API', () => {
  beforeEach(() => mock.invoke.mockReset());

  it('only confirms a reply when the server confirms the persisted message', async () => {
    mock.invoke.mockResolvedValue({ data: { success: true, messageId: 'message-1' }, error: null });
    await expect(sendSupportReply({
      conversationId: 'conversation-1',
      body: 'Thanks for letting us know.',
      idempotencyKey: 'key-1',
    })).resolves.toEqual({ messageId: 'message-1' });
    expect(mock.invoke).toHaveBeenCalledWith('support-send', {
      body: {
        conversationId: 'conversation-1',
        body: 'Thanks for letting us know.',
        idempotencyKey: 'key-1',
      },
    });
  });

  it('does not report success when the provider or thread state is uncertain', async () => {
    mock.invoke.mockResolvedValue({
      data: { error: 'Do not retry until the thread is checked.' },
      error: { context: new Response(JSON.stringify({ error: 'Do not retry until the thread is checked.' }), { status: 503 }) },
    });
    await expect(sendSupportReply({
      conversationId: 'conversation-1',
      body: 'Reply',
      idempotencyKey: 'key-2',
    })).rejects.toThrow('Do not retry until the thread is checked.');
  });

  it('rejects empty or incomplete responses instead of claiming email was sent', async () => {
    mock.invoke.mockResolvedValue({ data: { success: true }, error: null });
    await expect(sendSupportReply({
      conversationId: 'conversation-1',
      body: 'Reply',
      idempotencyKey: 'key-3',
    })).rejects.toThrow('The email could not be confirmed as sent.');
  });
});
