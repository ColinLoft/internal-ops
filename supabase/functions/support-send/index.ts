import { serveWithCors } from '../_shared/cors.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { extractEmailAddresses } from '../_shared/support-email.ts';

type Json = Record<string, unknown>;
const json = (body: Json, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

serveWithCors(async (request: Request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const authorization = request.headers.get('Authorization') || '';
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json({ error: 'Sign in to reply to a support request.' }, 401);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey) return json({ error: 'Support email is not configured on the server.' }, 503);
  const authClient = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) return json({ error: 'Your session is invalid or expired. Sign in again.' }, 401);

  const admin = createClient(url, serviceKey);
  const { data: profile, error: profileError } = await admin.from('profiles')
    .select('system_role,account_status')
    .eq('id', authData.user.id)
    .maybeSingle();
  if (profileError) return json({ error: 'Your support permissions could not be checked.' }, 503);
  if (!profile || profile.account_status !== 'active' || !['admin', 'coordinator'].includes(profile.system_role)) {
    return json({ error: 'You are not allowed to send support replies.' }, 403);
  }

  const payload = await request.json().catch(() => ({})) as Json;
  const conversationId = typeof payload.conversationId === 'string' ? payload.conversationId : '';
  const idempotencyKey = typeof payload.idempotencyKey === 'string' ? payload.idempotencyKey : '';
  const body = typeof payload.body === 'string' ? payload.body.trim() : '';
  if (!uuidPattern.test(conversationId)) return json({ error: 'The support request was not found.' }, 404);
  if (!uuidPattern.test(idempotencyKey)) return json({ error: 'A valid reply request ID is required. Try sending again.' }, 400);
  if (!body || body.length > 10_000) return json({ error: 'Write a reply of no more than 10,000 characters.' }, 400);

  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('RESEND_FROM_EMAIL')?.trim() || '';
  const fromAddress = extractEmailAddresses(from)[0] || '';
  if (!apiKey || !from || fromAddress.toLowerCase() !== 'team@flown.org') {
    return json({ error: 'Resend is not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL to the verified team@flown.org sender.' }, 503);
  }

  const { data: conversation, error: conversationError } = await admin.from('support_conversations')
    .select('id,customer_id,subject,public_token,status')
    .eq('id', conversationId)
    .maybeSingle();
  if (conversationError) return json({ error: 'The support request could not be loaded.' }, 503);
  if (!conversation) return json({ error: 'The support request was not found.' }, 404);
  const { data: customer, error: customerError } = await admin.from('support_customers')
    .select('name,email')
    .eq('id', conversation.customer_id)
    .maybeSingle();
  if (customerError) return json({ error: 'The contact details could not be loaded.' }, 503);
  if (!customer?.email || !emailPattern.test(customer.email)) return json({ error: 'This contact does not have a valid email address.' }, 400);
  if (!/^[a-f0-9]{32,96}$/i.test(conversation.public_token)) return json({ error: 'The request is missing its secure reply address.' }, 503);

  const { data: unresolved, error: unresolvedError } = await admin.from('support_email_outbox')
    .select('id,status,body,sender_id')
    .eq('conversation_id', conversation.id)
    .in('status', ['sending', 'unknown', 'accepted_unrecorded'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (unresolvedError) return json({ error: 'The previous reply state could not be checked. Refresh or ask an administrator before sending.' }, 503);
  if (unresolved?.status === 'sending') {
    const { data: saved } = await admin.from('support_messages').select('id').eq('support_outbox_id', unresolved.id).maybeSingle();
    if (saved) {
      const { error: repaired } = await admin.from('support_email_outbox').update({ status: 'sent' }).eq('id', unresolved.id);
      if (repaired) return json({ error: 'The reply is saved in the thread, but its delivery record needs reconciliation. Refresh before sending again.' }, 503);
      if (unresolved.sender_id === authData.user.id && unresolved.body === body) return json({ success: true, messageId: saved.id, duplicate: true });
      return json({ error: 'A previous reply was saved to this conversation. Refresh before composing another reply.' }, 409);
    }
  }
  if (unresolved) return json({ error: 'A previous reply may have been accepted but is not fully confirmed. Do not send another reply until the thread or delivery record is checked.' }, 409);

  let outbox: { id: string; status: string; sender_id: string; conversation_id: string; body: string; recipient: string; provider_email_id: string | null } | null = null;
  const { data: createdOutbox, error: outboxError } = await admin.from('support_email_outbox').insert({
    conversation_id: conversation.id,
    idempotency_key: idempotencyKey,
    sender_id: authData.user.id,
    recipient: customer.email.toLowerCase(),
    subject: conversation.subject,
    body,
    status: 'sending',
  }).select('id,status,sender_id,conversation_id,body,recipient,provider_email_id').single();

  if (!outboxError && createdOutbox) {
    outbox = createdOutbox;
  } else if (outboxError?.code === '23505') {
    const { data: existing, error: existingError } = await admin.from('support_email_outbox')
      .select('id,status,sender_id,conversation_id,body,recipient,provider_email_id')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();
    if (existingError || !existing || existing.sender_id !== authData.user.id
      || existing.conversation_id !== conversation.id || existing.body !== body
      || existing.recipient !== customer.email.toLowerCase()) {
      return json({ error: 'This reply request could not be verified. Create a new reply before trying again.' }, 409);
    }
    outbox = existing;
    if (existing.status === 'sent') {
      const { data: saved } = await admin.from('support_messages').select('id').eq('support_outbox_id', existing.id).maybeSingle();
      return saved ? json({ success: true, messageId: saved.id, duplicate: true }) : json({ error: 'Resend accepted this reply, but its saved thread record is incomplete. Do not retry; ask an administrator to reconcile it.' }, 503);
    }
    if (existing.status === 'accepted_unrecorded' || existing.status === 'unknown') {
      return json({ error: 'The email provider may have accepted this reply, but its final state could not be confirmed. Do not retry; check the thread or ask an administrator.' }, 503);
    }
    if (existing.status === 'sending') {
      const { data: saved } = await admin.from('support_messages').select('id').eq('support_outbox_id', existing.id).maybeSingle();
      if (saved) {
        await admin.from('support_email_outbox').update({ status: 'sent' }).eq('id', existing.id);
        return json({ success: true, messageId: saved.id, duplicate: true });
      }
      return json({ error: 'This reply is already being processed. Wait a moment and refresh the conversation.' }, 409);
    }
    const { data: retried, error: retryError } = await admin.from('support_email_outbox')
      .update({ status: 'sending', last_error: null })
      .eq('id', existing.id)
      .eq('status', 'failed')
      .select('id,status,sender_id,conversation_id,body,recipient,provider_email_id')
      .maybeSingle();
    if (retryError || !retried) return json({ error: 'This reply could not be safely retried. Refresh and check its status.' }, 409);
    outbox = retried;
  } else {
    return json({ error: 'The reply could not be recorded before sending. Nothing was sent.' }, 503);
  }

  const replyTo = `team+${conversation.public_token}@flown.org`;
  const cleanSubject = String(conversation.subject || 'Support request').replace(/[\r\n]+/g, ' ').trim().slice(0, 200);
  let providerResponse: Response;
  try {
    providerResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `flown-support-${outbox.id}`,
      },
      body: JSON.stringify({
        from,
        to: [customer.email],
        reply_to: replyTo,
        subject: /^re:\s/i.test(cleanSubject) ? cleanSubject : `Re: ${cleanSubject}`,
        text: body,
        headers: { 'X-Flown-Support-Conversation': conversation.id },
      }),
    });
  } catch {
    await admin.from('support_email_outbox').update({ status: 'unknown', last_error: 'The connection ended before Resend acceptance could be confirmed.' }).eq('id', outbox.id);
    return json({ error: 'The connection ended before Resend acceptance could be confirmed. Do not retry until you check the thread or ask an administrator.' }, 502);
  }

  const result = await providerResponse.json().catch(() => ({})) as Json;
  if (!providerResponse.ok && providerResponse.status < 500) {
    const detail = typeof (result.error as Json | undefined)?.message === 'string' ? String((result.error as Json).message).slice(0, 500) : 'Resend did not accept the email.';
    await admin.from('support_email_outbox').update({ status: 'failed', last_error: detail }).eq('id', outbox.id);
    return json({ error: `Reply was not sent: ${detail}` }, 502);
  }
  if (!providerResponse.ok || typeof result.id !== 'string') {
    await admin.from('support_email_outbox').update({
      status: 'unknown',
      last_error: 'Resend returned an incomplete or server-error response; acceptance is not confirmed.',
    }).eq('id', outbox.id);
    return json({ error: 'Resend did not confirm whether it accepted this reply. Do not retry until the thread or delivery record is checked.' }, 502);
  }

  const providerEmailId = result.id;
  await admin.from('support_email_outbox').update({ provider_email_id: providerEmailId }).eq('id', outbox.id);
  const { data: message, error: messageError } = await admin.from('support_messages').insert({
    conversation_id: conversation.id,
    sender_type: 'agent',
    sender_id: authData.user.id,
    channel: 'email',
    body,
    email_provider_id: providerEmailId,
    support_outbox_id: outbox.id,
  }).select('id').single();
  if (messageError || !message) {
    await admin.from('support_email_outbox').update({
      status: 'accepted_unrecorded',
      provider_email_id: providerEmailId,
      last_error: messageError?.message || 'Accepted by provider, but the message could not be saved.',
    }).eq('id', outbox.id);
    return json({ error: 'Resend accepted the email, but it could not be saved in the thread. Do not retry; ask an administrator to reconcile it.' }, 503);
  }

  const { error: deliveredError } = await admin.from('support_email_outbox').update({
    status: 'sent',
    provider_email_id: providerEmailId,
    last_error: null,
  }).eq('id', outbox.id);
  if (deliveredError) return json({ error: 'Resend accepted the reply and it is saved in the thread, but the delivery record needs reconciliation. Refresh before retrying.' }, 503);
  return json({ success: true, messageId: message.id });
});
