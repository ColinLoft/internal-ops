import {
  bytesToBase64Url,
  clientsFor,
  emailCorsHeaders,
  getAccessToken,
  hasMailboxAccess,
  jsonResponse,
  recordEmailActivity,
} from '../_shared/email.ts';

const parseAddresses = (value: unknown, label: string) => {
  if (value == null || value === '') return [];
  const addresses = (Array.isArray(value) ? value : String(value).split(/[;,]/))
    .map((address) => String(address).trim())
    .filter(Boolean);
  if (addresses.length > 20 || addresses.some((address) => !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address))) {
    throw new Error(`Enter up to 20 valid ${label} email addresses.`);
  }
  return addresses;
};

const providerError = (body: Record<string, any>, fallback: string) =>
  body.error?.message || body.error?.innerError?.message || fallback;

const parseAttachments = (value: unknown) => {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 10) throw new Error('Attach up to 10 files per email.');
  let totalBytes = 0;
  return value.map((item) => {
    if (!item || typeof item !== 'object') throw new Error('An attachment is invalid.');
    const attachment = item as Record<string, unknown>;
    const name = typeof attachment.name === 'string' ? attachment.name.trim().slice(0, 255) : '';
    const contentType = typeof attachment.contentType === 'string' ? attachment.contentType.slice(0, 128) : 'application/octet-stream';
    const contentBytes = typeof attachment.contentBytes === 'string' ? attachment.contentBytes : '';
    if (!name || /[\r\n/\\]/.test(name) || !/^[\w.+-]+\/[\w.+-]+$/.test(contentType)) {
      throw new Error('An attachment has an invalid file name or content type.');
    }
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(contentBytes)) {
      throw new Error(`Attachment "${name}" is not valid base64 data.`);
    }
    const bytes = Math.floor(contentBytes.length * 3 / 4) - (contentBytes.endsWith('==') ? 2 : contentBytes.endsWith('=') ? 1 : 0);
    totalBytes += bytes;
    if (bytes > 3 * 1024 * 1024 || totalBytes > 3 * 1024 * 1024) {
      throw new Error('Email attachments are limited to 3 MB total. Remove or shrink a file and try again.');
    }
    return { name, contentType, contentBytes };
  });
};

const encodeBase64Url = (text: string) => {
  const bytes = new TextEncoder().encode(text);
  return bytesToBase64Url(bytes);
};

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: emailCorsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);

  try {
    const { adminClient, user } = await clientsFor(request);
    const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
    const action = typeof payload.action === 'string' ? payload.action : '';
    const mailboxId = typeof payload.mailboxId === 'string' ? payload.mailboxId : '';
    const messageId = typeof payload.messageId === 'string' ? payload.messageId : '';
    if (!mailboxId) return jsonResponse({ error: 'A mailbox ID is required.' }, 400);

    const mailbox = await hasMailboxAccess(adminClient, user, mailboxId, ['send', 'reply'].includes(action));
    if (action === 'mark-read' || action === 'star' || action === 'archive') {
      if (!messageId) return jsonResponse({ error: 'A message ID is required.' }, 400);
      const { data: message, error: messageError } = await adminClient
        .from('email_messages')
        .select('id, provider_message_id, provider_thread_id, is_read, is_starred, folder')
        .eq('id', messageId)
        .eq('mailbox_id', mailboxId)
        .maybeSingle();
      if (messageError) return jsonResponse({ error: `Message could not be loaded: ${messageError.message}` }, 400);
      if (!message) return jsonResponse({ error: 'Message not found.' }, 404);

      const accessToken = await getAccessToken(adminClient, mailbox);
      const userPath = mailbox.mailbox_type === 'shared' ? `users/${encodeURIComponent(mailbox.email)}` : 'me';
      const providerMessageId = encodeURIComponent(message.provider_message_id);

      if (action === 'archive') {
        let archivedProviderMessageId = message.provider_message_id;
        if (mailbox.provider === 'google') {
          const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${providerMessageId}/modify`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ removeLabelIds: ['INBOX'] }),
          });
          if (!response.ok) return jsonResponse({ error: 'The provider could not archive this message.' }, 400);
        } else {
          const response = await fetch(`https://graph.microsoft.com/v1.0/${userPath}/messages/${providerMessageId}/move`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ destinationId: 'archive' }),
          });
          const movedMessage = await response.json().catch(() => ({}));
          if (!response.ok) return jsonResponse({ error: movedMessage.error?.message || 'The provider could not archive this message.' }, 400);
          if (typeof movedMessage.id !== 'string') {
            return jsonResponse({ error: 'The provider archived the message but did not return its new message identifier. Refresh the mailbox before taking further action.' }, 502);
          }
          archivedProviderMessageId = movedMessage.id;
        }
        const { error } = await adminClient.from('email_messages').update({
          folder: 'archive',
          provider_message_id: archivedProviderMessageId,
        }).eq('id', messageId);
        if (error) return jsonResponse({ error: `Message was archived, but workspace state could not be updated: ${error.message}` }, 500);
        const activityLogWarning = await recordEmailActivity(
          adminClient,
          user,
          'email_message_archived',
          'Archived an email message.',
          mailboxId,
          mailbox.email,
        );
        return jsonResponse({ success: true, activityLogWarning });
      }

      const nextValue = Boolean(payload[action === 'star' ? 'isStarred' : 'isRead']);
      if (mailbox.provider === 'google') {
        const addLabelIds = action === 'star' ? (nextValue ? ['STARRED'] : []) : (nextValue ? [] : ['UNREAD']);
        const removeLabelIds = action === 'star' ? (nextValue ? [] : ['STARRED']) : (nextValue ? ['UNREAD'] : []);
        const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${providerMessageId}/modify`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ addLabelIds, removeLabelIds }),
        });
        if (!response.ok) return jsonResponse({ error: 'The provider could not update this message.' }, 400);
      } else {
        const response = await fetch(`https://graph.microsoft.com/v1.0/${userPath}/messages/${providerMessageId}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(action === 'star'
            ? { flag: { flagStatus: nextValue ? 'flagged' : 'notFlagged' } }
            : { isRead: nextValue }),
        });
        if (!response.ok) return jsonResponse({ error: 'The provider could not update this message.' }, 400);
      }
      const column = action === 'star' ? 'is_starred' : 'is_read';
      const { error } = await adminClient.from('email_messages').update({ [column]: nextValue }).eq('id', messageId);
      if (error) return jsonResponse({ error: `Message was updated at the provider, but workspace state could not be updated: ${error.message}` }, 500);
      const eventType = action === 'star' ? (nextValue ? 'email_message_starred' : 'email_message_unstarred') : 'email_message_read_status_changed';
      const activityLogWarning = await recordEmailActivity(
        adminClient,
        user,
        eventType,
        action === 'star'
          ? `${nextValue ? 'Starred' : 'Unstarred'} an email message.`
          : `Marked an email message ${nextValue ? 'read' : 'unread'}.`,
        mailboxId,
        mailbox.email,
      );
      return jsonResponse({ success: true, activityLogWarning });
    }

    if (action === 'send' || action === 'reply') {
      const to = parseAddresses(payload.to, 'To');
      const cc = parseAddresses(payload.cc, 'Cc');
      const bcc = parseAddresses(payload.bcc, 'Bcc');
      const subject = typeof payload.subject === 'string' ? payload.subject.trim().slice(0, 998) : '';
      const body = typeof payload.body === 'string' ? payload.body.trim() : '';
      if (to.length === 0 && action !== 'reply') return jsonResponse({ error: 'Add at least one recipient in To.' }, 400);
      if (!subject || !body) return jsonResponse({ error: 'A subject and message body are required.' }, 400);
      if (body.length > 100_000) return jsonResponse({ error: 'Email body exceeds the 100,000 character limit.' }, 400);
      if (/\r|\n/.test(subject)) return jsonResponse({ error: 'Email headers contain invalid characters.' }, 400);
      const attachments = parseAttachments(payload.attachments);
      if (action === 'reply' && attachments.length > 0) {
        return jsonResponse({ error: 'Attachments are not yet supported when replying. Compose a new message to send files.' }, 400);
      }
      if (action === 'reply' && (cc.length > 0 || bcc.length > 0)) {
        return jsonResponse({ error: 'Cc and Bcc are only available for new messages.' }, 400);
      }

      const accessToken = await getAccessToken(adminClient, mailbox);
      const replyToMessageId = typeof payload.replyToMessageId === 'string' ? payload.replyToMessageId : '';
      const { data: replyMessage, error: replyLookupError } = action === 'reply' && replyToMessageId
        ? await adminClient
          .from('email_messages')
          .select('provider_message_id, provider_thread_id')
          .eq('id', replyToMessageId)
          .eq('mailbox_id', mailboxId)
          .maybeSingle()
        : { data: null, error: null };
      if (replyLookupError) return jsonResponse({ error: `Reply target could not be loaded: ${replyLookupError.message}` }, 400);
      if (action === 'reply' && !replyMessage) return jsonResponse({ error: 'The message to reply to was not found.' }, 404);
      if (mailbox.provider === 'google') {
        if (attachments.length > 0) {
          return jsonResponse({ error: 'File attachments are currently supported for Microsoft 365 mailboxes only.' }, 400);
        }
        const replyHeaders: string[] = [];
        if (action === 'reply' && replyMessage) {
          const originalUrl = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(replyMessage.provider_message_id)}`);
          originalUrl.searchParams.set('format', 'metadata');
          originalUrl.searchParams.append('metadataHeaders', 'Message-ID');
          originalUrl.searchParams.append('metadataHeaders', 'References');
          const originalResponse = await fetch(originalUrl, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          const original = await originalResponse.json();
          if (!originalResponse.ok) return jsonResponse({ error: original.error?.message || 'The original Gmail message could not be loaded.' }, 400);
          const headers = original.payload?.headers || [];
          const getHeader = (name: string) => String(headers.find((header: Record<string, string>) =>
            header.name?.toLowerCase() === name.toLowerCase())?.value || '').replace(/[\r\n]+/g, ' ').trim();
          const messageIdHeader = getHeader('Message-ID');
          const referencesHeader = getHeader('References');
          if (messageIdHeader) {
            replyHeaders.push(`In-Reply-To: ${messageIdHeader}`);
            replyHeaders.push(`References: ${[referencesHeader, messageIdHeader].filter(Boolean).join(' ')}`);
          }
        }
        const mime = [
          `To: ${to.join(', ')}`,
          ...(cc.length ? [`Cc: ${cc.join(', ')}`] : []),
          ...(bcc.length ? [`Bcc: ${bcc.join(', ')}`] : []),
          `Subject: ${subject}`,
          ...replyHeaders,
          'Content-Type: text/plain; charset="UTF-8"',
          'MIME-Version: 1.0',
          '',
          body,
        ].join('\r\n');
        const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            raw: encodeBase64Url(mime),
            ...(replyMessage?.provider_thread_id ? { threadId: replyMessage.provider_thread_id } : {}),
          }),
        });
        if (!response.ok) return jsonResponse({ error: 'Gmail could not send the message.' }, 400);
      } else {
        const userPath = mailbox.mailbox_type === 'shared' ? `users/${encodeURIComponent(mailbox.email)}` : 'me';
        const response = action === 'reply' && replyMessage
          ? await fetch(`https://graph.microsoft.com/v1.0/${userPath}/messages/${encodeURIComponent(replyMessage.provider_message_id)}/reply`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ comment: body }),
          })
          : await fetch(`https://graph.microsoft.com/v1.0/${userPath}/sendMail`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: {
                subject,
                body: { contentType: 'Text', content: body },
                toRecipients: to.map((address) => ({ emailAddress: { address } })),
                ccRecipients: cc.map((address) => ({ emailAddress: { address } })),
                bccRecipients: bcc.map((address) => ({ emailAddress: { address } })),
                ...(attachments.length ? {
                  attachments: attachments.map((attachment) => ({
                    '@odata.type': '#microsoft.graph.fileAttachment',
                    name: attachment.name,
                    contentType: attachment.contentType,
                    contentBytes: attachment.contentBytes,
                  })),
                } : {}),
              },
              saveToSentItems: true,
            }),
          });
        if (!response.ok) {
          const details = await response.json().catch(() => ({}));
          return jsonResponse({ error: providerError(details, 'Microsoft Graph could not send the message.') }, 400);
        }
      }
      const activityLogWarning = await recordEmailActivity(
        adminClient,
        user,
        action === 'reply' ? 'email_reply_sent' : 'email_message_sent',
        action === 'reply' ? 'Sent a reply from a mailbox.' : 'Sent an email message from a mailbox.',
        mailboxId,
        mailbox.email,
      );
      return jsonResponse({ success: true, activityLogWarning });
    }

    return jsonResponse({ error: 'Unsupported email action.' }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Email action failed.';
    return jsonResponse({ error: message }, message === 'Authentication required.' ? 401 : 400);
  }
});
