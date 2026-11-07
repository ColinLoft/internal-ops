import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendOperationalEmail } from './operationalEmail';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('./supabase', () => ({ supabase: { functions: { invoke } } }));

describe('operational email', () => {
  beforeEach(() => { invoke.mockReset(); });
  it('requires an explicit shared sender before invoking delivery', async () => {
    await expect(sendOperationalEmail({ mailboxId: '', to: 'customer@example.com', subject: 'Support', body: 'Hello' })).rejects.toThrow('Choose a shared');
    expect(invoke).not.toHaveBeenCalled();
  });
  it('uses the preserved delivery API rather than a personal composer', async () => {
    invoke.mockResolvedValue({ data: { success: true }, error: null });
    const message = { mailboxId: 'shared-mailbox', to: 'customer@example.com', subject: 'Support', body: 'Hello' };
    await sendOperationalEmail(message);
    expect(invoke).toHaveBeenCalledWith('mail-api', { body: { action: 'send', ...message } });
  });
  it('surfaces provider errors and rejects unconfirmed delivery', async () => {
    const message = { mailboxId: 'shared-mailbox', to: 'customer@example.com', subject: 'Support', body: 'Hello' };
    invoke.mockResolvedValue({ data: { error: 'Provider not configured.' }, error: null });
    await expect(sendOperationalEmail(message)).rejects.toThrow('Provider not configured');
    invoke.mockResolvedValue({ data: {}, error: null });
    await expect(sendOperationalEmail(message)).rejects.toThrow('did not confirm');
    invoke.mockResolvedValue({ data: null, error: new Error('Network unavailable') });
    await expect(sendOperationalEmail(message)).rejects.toThrow('Network unavailable');
  });
});
