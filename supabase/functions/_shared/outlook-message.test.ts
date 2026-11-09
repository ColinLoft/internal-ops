import { describe, expect, it } from 'vitest';
import { supportOutlookPayload, type OutlookMessage } from './outlook-message';
const start = '2026-11-09T12:00:00Z';
const message: OutlookMessage = {
  id: 'message', conversationId: 'thread', internetMessageId: '<first@example.org>',
  from: { emailAddress: { address: 'person@example.org', name: 'Person' } },
  receivedDateTime: '2026-11-09T12:01:00Z', sentDateTime: '2026-11-09T12:01:00Z',
  body: { contentType: 'HTML', content: '<p>Please help</p>' },
  internetMessageHeaders: [{ name: 'In-Reply-To', value: '<previous@example.org>' }],
};
describe('Outlook support intake', () => {
  it('normalizes new messages and preserves threading headers', () => {
    expect(supportOutlookPayload(message, 'mailbox', false, start)).toMatchObject({
      p_body: 'Please help', p_thread_id: 'thread', p_message_id: 'first@example.org', p_reply_to: 'previous@example.org', p_sent: false,
    });
  });
  it('does not import historical, draft or deleted mail', () => {
    for (const change of [{ receivedDateTime: '2026-11-08T12:01:00Z' }, { isDraft: true }, { '@removed': {} }]) {
      expect(supportOutlookPayload({ ...message, ...change }, 'mailbox', false, start)).toBeNull();
    }
  });
  it.each([
    { name: 'Auto-Submitted', value: 'auto-replied' },
    { name: 'Precedence', value: 'bulk' },
    { name: 'Content-Type', value: 'multipart/report; report-type=delivery-status' },
    { name: 'List-Id', value: 'newsletter.example.org' },
  ])('does not create tickets for $name', (header) => {
    expect(supportOutlookPayload({ ...message, internetMessageHeaders: [header] }, 'mailbox', false, start)).toBeNull();
  });
  it('ignores team self-mail but allows normal internal staff requests', () => {
    expect(supportOutlookPayload({ ...message, from: { emailAddress: { address: 'team@flown.org' } } }, 'mailbox', false, start)).toBeNull();
    expect(supportOutlookPayload({ ...message, from: { emailAddress: { address: 'staff@flown.org' } } }, 'mailbox', false, start)).not.toBeNull();
    expect(supportOutlookPayload({ ...message, from: { emailAddress: { address: 'team@flown.org' } } }, 'mailbox', true, start)).toMatchObject({ p_sent: true });
  });
});
