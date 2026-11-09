import { describe, expect, it } from 'vitest';
import {
  conversationTokenFromRecipients,
  extractEmailAddresses,
  extractMessageIds,
  plainTextFromEmail,
  verifyResendSignature,
} from '../../../supabase/functions/_shared/support-email';

const encode = (bytes: Uint8Array) => btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''));

describe('support inbound email helpers', () => {
  it('verifies Resend signatures over the raw body and rejects stale or altered payloads', async () => {
    const body = '{"type":"email.received"}';
    const secretBytes = new TextEncoder().encode('test-webhook-secret');
    const secret = `whsec_${encode(secretBytes)}`;
    const id = 'evt_test_1';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const key = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signature = encode(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${body}`))));
    const headers = new Headers({
      'svix-id': id,
      'svix-timestamp': timestamp,
      'svix-signature': `v1,${signature}`,
    });

    await expect(verifyResendSignature(body, headers, secret)).resolves.toBe(true);
    await expect(verifyResendSignature(`${body} `, headers, secret)).resolves.toBe(false);
    await expect(verifyResendSignature(body, headers, secret, Date.now() + 600_000)).resolves.toBe(false);
  });

  it('extracts verified addresses, conversation reply aliases, and RFC message IDs', () => {
    const token = 'a'.repeat(64);
    const addresses = extractEmailAddresses(['Flown Team <team+bad@flown.org>', `Flown Team <team+${token}@flown.org>`]);
    expect(conversationTokenFromRecipients(addresses)).toBe(token);
    expect(extractMessageIds('<first@example.org> <second@example.org>')).toEqual(['first@example.org', 'second@example.org']);
  });

  it('uses plain text when available and safely turns HTML into readable text otherwise', () => {
    expect(plainTextFromEmail({ text: '  Plain body  ' })).toBe('Plain body');
    expect(plainTextFromEmail({ html: '<p>Hello &amp; welcome</p><script>drop this</script><p>Next</p>' }))
      .toBe('Hello & welcome\nNext');
  });
});
