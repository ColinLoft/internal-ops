import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getAccessToken } from './email.ts';

export type OperationalEmail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  idempotencyKey: string;
  replyMessageId?: string;
  supportConversationId?: string;
  attachments?: { filename: string; content: string }[];
};
export type OperationalEmailResult =
  | { sent: true; emailId: string; threadId: string | null; internetMessageId: string | null; mailboxId: string }
  | { sent: false; error: string; uncertain?: boolean };

export const teamMailbox = async (admin: SupabaseClient) => {
  const { data, error } = await admin.from('email_mailboxes').select('id,email,provider,mailbox_type,support_started_at')
    .eq('email', 'team@flown.org').eq('provider', 'microsoft').eq('mailbox_type', 'shared').maybeSingle();
  if (error) throw new Error(`The Outlook mailbox could not be loaded: ${error.message}`);
  if (!data) throw new Error('Outlook is not configured. Connect team@flown.org in Settings > Email.');
  return data;
};

export async function deliverOperationalEmail(
  email: OperationalEmail,
  options: { admin?: SupabaseClient; fetcher?: typeof fetch } = {},
): Promise<OperationalEmailResult> {
  const admin = options.admin ?? createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const fetcher = options.fetcher ?? fetch;
  let sending = false;
  let claimed = false;
  try {
    const mailbox = await teamMailbox(admin);
    const token = await getAccessToken(admin, mailbox);
    const bytes = new TextEncoder().encode(JSON.stringify({ to: email.to, subject: email.subject, replyMessageId: email.replyMessageId }));
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    const { error: insertError } = await admin.from('operational_email_deliveries').insert({
      idempotency_key: email.idempotencyKey, payload_hash: hash, mailbox_id: mailbox.id, status: 'processing',
    });
    if (insertError) {
      if (insertError.code !== '23505') throw new Error(`Email could not be recorded before sending: ${insertError.message}`);
      const { data: previous, error: previousError } = await admin.from('operational_email_deliveries')
        .select('*').eq('idempotency_key', email.idempotencyKey).single();
      if (previousError || !previous) throw new Error('The previous Outlook delivery could not be checked.');
      if (previous.payload_hash !== hash) throw new Error('This delivery key belongs to a different email recipient or thread.');
      if (previous.status === 'sent') return {
        sent: true, emailId: previous.draft_id, threadId: previous.thread_id,
        internetMessageId: previous.internet_message_id, mailboxId: previous.mailbox_id,
      };
      if (previous.status !== 'failed') return { sent: false, uncertain: true, error: 'Outlook delivery is pending or uncertain. Check Sent Items before retrying; automatic duplicate sending is blocked.' };
      const { data: retry, error: retryError } = await admin.from('operational_email_deliveries')
        .update({ status: 'processing', last_error: null }).eq('idempotency_key', email.idempotencyKey)
        .eq('status', 'failed').select('idempotency_key').maybeSingle();
      if (retryError || !retry) return { sent: false, uncertain: true, error: 'This Outlook email is already being processed. Refresh before retrying.' };
    }
    claimed = true;
    const base = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox.email)}`;
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'IdType="ImmutableId"' };
    const message = {
      subject: email.subject,
      from: { emailAddress: { address: mailbox.email } },
      toRecipients: [{ emailAddress: { address: email.to } }],
      ccRecipients: [], bccRecipients: [],
      body: { contentType: email.html ? 'HTML' : 'Text', content: email.html || email.text },
      ...(email.attachments?.length ? { attachments: email.attachments.map((file) => ({
        '@odata.type': '#microsoft.graph.fileAttachment', name: file.filename,
        contentType: 'application/pdf', contentBytes: file.content,
      })) } : {}),
    };
    const draftResponse = await fetcher(email.replyMessageId
      ? `${base}/messages/${encodeURIComponent(email.replyMessageId)}/createReply`
      : `${base}/messages`, {
      method: 'POST', headers, signal: AbortSignal.timeout(15_000),
      body: JSON.stringify(email.replyMessageId ? { message } : message),
    });
    const draft = await draftResponse.json();
    if (!draftResponse.ok || typeof draft.id !== 'string') throw new Error(`Outlook could not prepare the email (HTTP ${draftResponse.status}). Check mailbox access and Send As permission.`);
    const { error: draftError } = await admin.from('operational_email_deliveries').update({
      draft_id: draft.id, thread_id: draft.conversationId || null, internet_message_id: draft.internetMessageId || null,
    }).eq('idempotency_key', email.idempotencyKey);
    if (draftError) throw new Error('The Outlook draft could not be recorded. Nothing was sent.');
    if (email.supportConversationId) {
      if (typeof draft.conversationId !== 'string') throw new Error('Outlook did not return a thread identifier. Nothing was sent.');
      const { error: threadError } = await admin.from('support_outlook_threads').upsert({
        mailbox_id: mailbox.id, thread_id: draft.conversationId, conversation_id: email.supportConversationId,
      }, { onConflict: 'mailbox_id,thread_id', ignoreDuplicates: true });
      if (threadError) throw new Error('The Outlook support thread could not be linked. Nothing was sent.');
    }
    sending = true;
    const response = await fetcher(`${base}/messages/${encodeURIComponent(draft.id)}/send`, {
      method: 'POST', headers, signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      if (response.status < 500 && response.status !== 408) sending = false;
      throw new Error(`Outlook did not confirm email acceptance (HTTP ${response.status}).`);
    }
    const { error: sentError } = await admin.from('operational_email_deliveries')
      .update({ status: 'sent', last_error: null }).eq('idempotency_key', email.idempotencyKey);
    if (sentError) throw new Error('Outlook accepted the email, but its delivery record could not be saved.');
    return { sent: true, emailId: draft.id, threadId: draft.conversationId || null, internetMessageId: draft.internetMessageId || null, mailboxId: mailbox.id };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Outlook delivery failed.';
    if (claimed) {
      const { error } = await admin.from('operational_email_deliveries').update({
        status: sending ? 'unknown' : 'failed', last_error: message, updated_at: new Date().toISOString(),
      }).eq('idempotency_key', email.idempotencyKey);
      if (error) console.error('Outlook delivery state could not be saved:', error.message);
    }
    return { sent: false, uncertain: sending, error: sending ? `${message} Do not resend until Sent Items and the delivery record are checked.` : message };
  }
}
