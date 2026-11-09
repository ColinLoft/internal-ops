import { describe, expect, it, vi } from 'vitest';
import { deliverContractEmail } from './contract-email';

const email = {
  to: 'recipient@example.com',
  subject: 'Agreement',
  text: 'Sign agreement',
  html: '<p>Sign agreement</p>',
  idempotencyKey: 'contract-invite-1',
};

describe('contract email delivery', () => {
  it('reports Resend failures without treating them as sent', async () => {
    const fetcher = vi.fn(async () => new Response('unavailable', { status: 503 }));
    const result = await deliverContractEmail(email, {
      apiKey: 'test-key',
      from: 'Flown <team@flown.org>',
      fetcher,
    });
    expect(result).toEqual({
      sent: false,
      error: 'Resend rejected the email (HTTP 503). Verify the sender domain and recipient address, then retry.',
    });
  });

  it('sends a stable Resend idempotency key and reports accepted delivery', async () => {
    let sentKey = '';
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      sentKey = new Headers(init?.headers).get('Idempotency-Key') || '';
      return Response.json({ id: 'email-1' }, { status: 200 });
    });
    const result = await deliverContractEmail(email, {
      apiKey: 'test-key',
      from: 'Flown <team@flown.org>',
      fetcher,
    });
    expect(sentKey).toBe(email.idempotencyKey);
    expect(result).toEqual({ sent: true, emailId: 'email-1' });
  });

  it('returns an explicit configuration error if required secrets are unavailable', async () => {
    const result = await deliverContractEmail(email, { apiKey: '', from: '' });
    expect(result.sent).toBe(false);
    if ('error' in result) expect(result.error).toContain('RESEND_API_KEY and RESEND_FROM_EMAIL');
  });
});
