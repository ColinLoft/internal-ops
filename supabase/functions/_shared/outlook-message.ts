import { extractMessageIds, plainTextFromEmail } from './support-email.ts';

export type OutlookMessage = {
  id: string;
  conversationId: string;
  internetMessageId?: string;
  subject?: string;
  receivedDateTime?: string;
  sentDateTime?: string;
  isDraft?: boolean;
  from?: { emailAddress?: { address?: string; name?: string } };
  body?: { contentType?: string; content?: string };
  internetMessageHeaders?: { name: string; value: string }[];
  hasAttachments?: boolean;
  '@removed'?: unknown;
};

export function supportOutlookPayload(message: OutlookMessage, mailboxId: string, sent: boolean, start: string) {
  const date = sent ? message.sentDateTime : message.receivedDateTime;
  if (message['@removed'] || message.isDraft || !date || !Number.isFinite(Date.parse(date))
    || Date.parse(date) < Date.parse(start)) return null;
  const header = (name: string) => message.internetMessageHeaders?.find((item) => item.name.toLowerCase() === name)?.value || '';
  const sender = message.from?.emailAddress?.address?.trim().toLowerCase() || '';
  if (!sender || (!sent && (sender === 'team@flown.org'
    || /^(mailer-daemon|postmaster)@/.test(sender)
    || (header('auto-submitted') && header('auto-submitted').toLowerCase() !== 'no')
    || /^(bulk|list|junk)$/i.test(header('precedence'))
    || Boolean(header('list-id'))
    || /multipart\/report/i.test(header('content-type'))))) return null;
  const content = message.body?.content || '';
  const body = plainTextFromEmail(message.body?.contentType?.toLowerCase() === 'html' ? { html: content } : { text: content });
  return {
    p_mailbox_id: mailboxId,
    p_thread_id: message.conversationId,
    p_provider_id: message.id,
    p_message_id: extractMessageIds(message.internetMessageId)[0] || null,
    p_sender: sender,
    p_sender_name: (message.from?.emailAddress?.name || '').slice(0, 200),
    p_subject: (message.subject || 'New support email').replace(/[\r\n]/g, ' ').slice(0, 200),
    p_body: body || (message.hasAttachments ? 'This email contains attachments but no readable message text.' : 'This email contains no readable message text.'),
    p_reply_to: extractMessageIds(header('in-reply-to'))[0] || null,
    p_references: extractMessageIds(header('references')),
    p_received_at: date,
    p_sent: sent,
    p_attachments: [],
  };
}
