import { serveWithCors } from '../_shared/cors.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  conversationTokenFromRecipients,
  extractEmailAddresses,
  extractMessageIds,
  plainTextFromEmail,
  verifyResendSignature,
} from '../_shared/support-email.ts';

type Json = Record<string, unknown>;
const json = (body: Json, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const headerValue = (headers: unknown, name: string) => {
  if (Array.isArray(headers)) {
    const header = headers.find((item) => item && typeof item === 'object'
      && String((item as Json).name || '').toLowerCase() === name.toLowerCase());
    return typeof (header as Json | undefined)?.value === 'string' ? String((header as Json).value) : '';
  }
  if (headers && typeof headers === 'object') {
    const entry = Object.entries(headers as Json).find(([key]) => key.toLowerCase() === name.toLowerCase());
    return typeof entry?.[1] === 'string' ? entry[1] : '';
  }
  return '';
};

const senderName = (from: unknown, email: string) => {
  if (typeof from !== 'string') return '';
  const display = from.match(/^\s*"?([^"<]+?)"?\s*<[^>]+>\s*$/)?.[1]?.trim();
  return display && display.toLowerCase() !== email ? display.slice(0, 200) : '';
};

serveWithCors(async (request: Request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const secret = Deno.env.get('RESEND_WEBHOOK_SECRET');
  if (!secret) return json({ error: 'Inbound support email is not configured on the server.' }, 503);
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).length > 1_000_000) return json({ error: 'Webhook payload is too large.' }, 413);
  if (!await verifyResendSignature(rawBody, request.headers, secret)) return json({ error: 'Webhook signature is invalid or expired.' }, 401);

  let event: Json;
  try { event = JSON.parse(rawBody) as Json; } catch { return json({ error: 'Webhook payload is invalid JSON.' }, 400); }
  if (event.type !== 'email.received') return json({ received: true, ignored: true });

  const eventData = event.data && typeof event.data === 'object' ? event.data as Json : {};
  const emailId = typeof eventData.email_id === 'string' ? eventData.email_id : '';
  const eventId = request.headers.get('svix-id') || '';
  if (!emailId || !eventId) return json({ error: 'The received-email event is missing its provider ID.' }, 400);

  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) return json({ error: 'Inbound support email is not configured on the server.' }, 503);
  let providerResponse: Response;
  try {
    providerResponse = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
  } catch {
    return json({ error: 'The received email could not be loaded from Resend. The webhook may be retried.' }, 502);
  }
  const providerResult = await providerResponse.json().catch(() => ({})) as Json;
  if (!providerResponse.ok) return json({ error: 'The received email could not be loaded from Resend. The webhook may be retried.' }, 502);
  const email = providerResult.data && typeof providerResult.data === 'object' ? providerResult.data as Json : providerResult;

  const from = email.from ?? eventData.from;
  const fromAddresses = extractEmailAddresses(from);
  const fromEmail = fromAddresses[0] || '';
  if (!fromEmail) return json({ error: 'The received email has no valid sender address.' }, 422);
  const recipients = extractEmailAddresses(email.to ?? eventData.to);
  if (!recipients.some((address) => address === 'team@flown.org' || /^team\+[a-f0-9]{32,96}@flown\.org$/i.test(address))) {
    return json({ received: true, ignored: true });
  }
  const token = conversationTokenFromRecipients(recipients);
  const headers = email.headers;
  const messageId = extractMessageIds(email.message_id ?? headerValue(headers, 'message-id'))[0] || null;
  const inReplyTo = extractMessageIds(email.in_reply_to ?? headerValue(headers, 'in-reply-to'))[0] || null;
  const references = extractMessageIds(email.references ?? headerValue(headers, 'references'));
  const attachments = Array.isArray(email.attachments) ? email.attachments.slice(0, 30).map((item) => {
    const attachment = item && typeof item === 'object' ? item as Json : {};
    return {
      filename: typeof attachment.filename === 'string' ? attachment.filename.slice(0, 255) : 'Email attachment',
      content_type: typeof attachment.content_type === 'string' ? attachment.content_type.slice(0, 128) : null,
      size: Number.isFinite(Number(attachment.size)) ? Math.max(0, Number(attachment.size)) : null,
    };
  }) : [];
  let body = plainTextFromEmail(email);
  if (!body && attachments.length) body = 'This email contained attachments but no readable message text.';
  if (!body) body = 'This email contained no readable message text.';

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return json({ error: 'Inbound support email is not configured on the server.' }, 503);
  const admin = createClient(url, serviceKey);
  const { data: result, error: ingestError } = await admin.rpc('support_ingest_resend_email', {
    p_event_id: eventId,
    p_provider_email_id: emailId,
    p_message_id: messageId,
    p_from_email: fromEmail,
    p_from_name: senderName(from, fromEmail),
    p_to_addresses: recipients,
    p_subject: (typeof email.subject === 'string' ? email.subject : typeof eventData.subject === 'string' ? eventData.subject : '').replace(/[\r\n]/g, ' ').trim().slice(0, 200) || 'New support email',
    p_body: body,
    p_in_reply_to: inReplyTo,
    p_references: references,
    p_conversation_token: token,
    p_attachments: attachments,
    p_received_at: typeof email.created_at === 'string' ? email.created_at : null,
  });
  if (ingestError) {
    console.error('Support inbound email persistence failed:', ingestError.code || 'database error');
    return json({ error: 'The received email could not be saved to the support queue. Resend may retry it.' }, 503);
  }
  const outcome = result && typeof result === 'object' ? result as Json : {};
  return json({ received: true, duplicate: outcome.duplicate === true });
});
