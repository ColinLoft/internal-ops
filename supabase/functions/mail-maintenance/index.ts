import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { bytesToBase64Url, getAccessToken, recordEmailActivity } from '../_shared/email.ts';

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const graphExpiration = () => new Date(Date.now() + 4230 * 60_000).toISOString();

const createGraphSubscription = async (
  accessToken: string,
  webhookUrl: string,
  mailbox: Record<string, any>,
  clientState: string,
) => {
  const targetPath = mailbox.mailbox_type === 'shared'
    ? `users/${encodeURIComponent(mailbox.email)}`
    : 'me';
  const response = await fetch('https://graph.microsoft.com/v1.0/subscriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      changeType: 'created,updated',
      notificationUrl: `${webhookUrl}?provider=microsoft`,
      resource: `${targetPath}/mailFolders('inbox')/messages`,
      expirationDateTime: graphExpiration(),
      clientState,
    }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || 'Microsoft Graph subscription creation failed.');
  return result;
};

const processScheduledSends = async (adminClient: ReturnType<typeof createClient>) => {
  const staleBefore = new Date(Date.now() - 30 * 60_000).toISOString();
  const { error: resetError } = await adminClient.from('email_scheduled_sends')
    .update({ status: 'scheduled', processing_started_at: null })
    .eq('status', 'processing')
    .lt('processing_started_at', staleBefore);
  if (resetError) throw new Error(`Stalled scheduled sends could not be recovered: ${resetError.message}`);

  const { data: dueSends, error: dueError } = await adminClient.from('email_scheduled_sends')
    .select('id, mailbox_id, created_by, action, reply_message_id, to_recipients, cc_recipients, bcc_recipients, subject, body_html, attachments, scheduled_at')
    .eq('status', 'scheduled')
    .lte('scheduled_at', new Date().toISOString())
    .order('scheduled_at')
    .limit(25);
  if (dueError) throw new Error(`Scheduled emails could not be loaded: ${dueError.message}`);

  const sentIds: string[] = [];
  const failures: { id: string; error: string }[] = [];
  for (const scheduled of dueSends || []) {
    const { data: claimed, error: claimError } = await adminClient.from('email_scheduled_sends')
      .update({ status: 'processing', processing_started_at: new Date().toISOString(), last_error: null })
      .eq('id', scheduled.id)
      .eq('status', 'scheduled')
      .select('id')
      .maybeSingle();
    if (claimError) {
      failures.push({ id: scheduled.id, error: `Scheduled send could not be claimed: ${claimError.message}` });
      continue;
    }
    if (!claimed) continue;

    try {
      const { data: mailbox, error: mailboxError } = await adminClient.from('email_mailboxes')
        .select('id, provider, mailbox_type, email')
        .eq('id', scheduled.mailbox_id)
        .maybeSingle();
      if (mailboxError) throw new Error(`Mailbox could not be loaded: ${mailboxError.message}`);
      if (!mailbox) throw new Error('The scheduled mailbox no longer exists.');
      if (mailbox.provider !== 'microsoft') throw new Error('Scheduled delivery is currently supported for Microsoft 365 only.');
      const accessToken = await getAccessToken(adminClient, mailbox);
      const userPath = mailbox.mailbox_type === 'shared' ? `users/${encodeURIComponent(mailbox.email)}` : 'me';
      const attachments = Array.isArray(scheduled.attachments) ? scheduled.attachments : [];

      if (scheduled.action === 'reply') {
        const { data: replyMessage, error: replyError } = await adminClient.from('email_messages')
          .select('provider_message_id')
          .eq('id', scheduled.reply_message_id)
          .eq('mailbox_id', mailbox.id)
          .maybeSingle();
        if (replyError) throw new Error(`Reply target could not be loaded: ${replyError.message}`);
        if (!replyMessage) throw new Error('The original message for this scheduled reply no longer exists.');
        const draftResponse = await fetch(`https://graph.microsoft.com/v1.0/${userPath}/messages/${encodeURIComponent(replyMessage.provider_message_id)}/createReply`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const draft = await draftResponse.json().catch(() => ({}));
        if (!draftResponse.ok || typeof draft.id !== 'string') {
          throw new Error(draft.error?.message || 'Microsoft Graph could not create the reply draft.');
        }
        const updateResponse = await fetch(`https://graph.microsoft.com/v1.0/${userPath}/messages/${encodeURIComponent(draft.id)}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ subject: scheduled.subject, body: { contentType: 'HTML', content: scheduled.body_html } }),
        });
        if (!updateResponse.ok) {
          const details = await updateResponse.json().catch(() => ({}));
          throw new Error(details.error?.message || 'The scheduled reply body could not be updated.');
        }
        const sendResponse = await fetch(`https://graph.microsoft.com/v1.0/${userPath}/messages/${encodeURIComponent(draft.id)}/send`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!sendResponse.ok) {
          const details = await sendResponse.json().catch(() => ({}));
          throw new Error(details.error?.message || 'Microsoft Graph could not send the scheduled reply.');
        }
      } else {
        const sendResponse = await fetch(`https://graph.microsoft.com/v1.0/${userPath}/sendMail`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: {
              subject: scheduled.subject,
              body: { contentType: 'HTML', content: scheduled.body_html },
              toRecipients: (scheduled.to_recipients || []).map((address: string) => ({ emailAddress: { address } })),
              ccRecipients: (scheduled.cc_recipients || []).map((address: string) => ({ emailAddress: { address } })),
              bccRecipients: (scheduled.bcc_recipients || []).map((address: string) => ({ emailAddress: { address } })),
              attachments: attachments.map((attachment: Record<string, string>) => ({
                '@odata.type': '#microsoft.graph.fileAttachment',
                name: attachment.name,
                contentType: attachment.contentType,
                contentBytes: attachment.contentBytes,
                isInline: attachment.isInline,
                ...(attachment.contentId ? { contentId: attachment.contentId } : {}),
              })),
            },
            saveToSentItems: true,
          }),
        });
        if (!sendResponse.ok) {
          const details = await sendResponse.json().catch(() => ({}));
          throw new Error(details.error?.message || 'Microsoft Graph could not send the scheduled email.');
        }
      }

      const sentAt = new Date().toISOString();
      const { error: saveError } = await adminClient.from('email_scheduled_sends')
        .update({ status: 'sent', sent_at: sentAt, processing_started_at: null })
        .eq('id', scheduled.id);
      if (saveError) throw new Error(`Email sent but scheduled status could not be saved: ${saveError.message}`);
      const activityWarning = await recordEmailActivity(
        adminClient,
        null,
        scheduled.action === 'reply' ? 'email_reply_sent' : 'email_message_sent',
        `Sent a scheduled ${scheduled.action === 'reply' ? 'reply' : 'email'} from a mailbox.`,
        mailbox.id,
        mailbox.email,
        { scheduledSendId: scheduled.id, createdBy: scheduled.created_by },
      );
      if (activityWarning) console.error(activityWarning);
      sentIds.push(scheduled.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Scheduled email could not be sent.';
      const { error: saveError } = await adminClient.from('email_scheduled_sends')
        .update({ status: 'failed', last_error: message.slice(0, 1000), processing_started_at: null })
        .eq('id', scheduled.id);
      failures.push({ id: scheduled.id, error: saveError ? `${message} Status update failed: ${saveError.message}` : message });
    }
  }
  return { sentIds, failures };
};

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);
  const expectedSecret = Deno.env.get('MAIL_MAINTENANCE_SECRET');
  if (!expectedSecret || request.headers.get('x-mail-maintenance-secret') !== expectedSecret) {
    return jsonResponse({ error: 'Maintenance authentication failed.' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) return jsonResponse({ error: 'Email maintenance is not configured.' }, 503);
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: purgedCount, error: purgeError } = await adminClient.rpc('purge_expired_email');
  if (purgeError) return jsonResponse({ error: `Expired email could not be purged: ${purgeError.message}` }, 500);
  let scheduledResult: { sentIds: string[]; failures: { id: string; error: string }[] };
  try {
    scheduledResult = await processScheduledSends(adminClient);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Scheduled emails could not be processed.';
    return jsonResponse({ error: message }, 500);
  }

  const { data: mailboxes, error: mailboxError } = await adminClient
    .from('email_mailboxes')
    .select('id, provider, mailbox_type, email, google_history_id, graph_subscription_id, graph_client_state, push_expires_at');
  if (mailboxError) return jsonResponse({ error: `Mailboxes could not be loaded: ${mailboxError.message}` }, 500);

  const renewed: string[] = [];
  const failures: { mailboxId: string; error: string }[] = [];
  const renewBefore = Date.now() + 24 * 60 * 60 * 1000;
  for (const mailbox of mailboxes || []) {
    if (mailbox.push_expires_at && Date.parse(mailbox.push_expires_at) > renewBefore) continue;
    try {
      const accessToken = await getAccessToken(adminClient, mailbox);
      if (mailbox.provider === 'google') {
        const topicName = Deno.env.get('GOOGLE_PUBSUB_TOPIC');
        if (!topicName) throw new Error('GOOGLE_PUBSUB_TOPIC is not configured.');
        const watchResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/watch', {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ topicName, labelIds: ['INBOX'], labelFilterAction: 'include' }),
        });
        const watch = await watchResponse.json();
        if (!watchResponse.ok) throw new Error(watch.error?.message || 'Gmail watch renewal failed.');
        const update: Record<string, unknown> = {
          push_expires_at: watch.expiration ? new Date(Number(watch.expiration)).toISOString() : null,
          push_error: null,
        };
        if (!mailbox.google_history_id && watch.historyId) update.google_history_id = String(watch.historyId);
        const { error: saveError } = await adminClient.from('email_mailboxes').update(update).eq('id', mailbox.id);
        if (saveError) throw new Error(`Gmail watch renewed but its status could not be stored: ${saveError.message}`);
      } else {
        const rawWebhookUrl = Deno.env.get('MAIL_WEBHOOK_URL');
        if (!rawWebhookUrl) throw new Error('MAIL_WEBHOOK_URL is not configured.');
        const parsedWebhookUrl = new URL(rawWebhookUrl);
        if (parsedWebhookUrl.protocol !== 'https:') throw new Error('MAIL_WEBHOOK_URL must use HTTPS.');
        const webhookUrl = parsedWebhookUrl.toString().replace(/\/$/, '');
        const clientState = mailbox.graph_client_state || bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
        let subscription: Record<string, any> | null = null;
        if (mailbox.graph_subscription_id) {
          const response = await fetch(`https://graph.microsoft.com/v1.0/subscriptions/${encodeURIComponent(mailbox.graph_subscription_id)}`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ expirationDateTime: graphExpiration() }),
          });
          if (response.ok) subscription = await response.json();
          else if (response.status !== 404) {
            const error = await response.json();
            throw new Error(error.error?.message || 'Microsoft Graph subscription renewal failed.');
          }
        }
        if (!subscription) subscription = await createGraphSubscription(accessToken, webhookUrl, mailbox, clientState);
        const { error: saveError } = await adminClient.from('email_mailboxes').update({
          graph_subscription_id: subscription.id,
          graph_client_state: clientState,
          push_expires_at: subscription.expirationDateTime,
          push_error: null,
        }).eq('id', mailbox.id);
        if (saveError) throw new Error(`Microsoft subscription renewed but its status could not be stored: ${saveError.message}`);
      }
      renewed.push(mailbox.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Push notification renewal failed.';
      failures.push({ mailboxId: mailbox.id, error: message });
      const { error: statusError } = await adminClient.from('email_mailboxes')
        .update({ push_error: message })
        .eq('id', mailbox.id);
      if (statusError) console.error('Could not save email push renewal error:', mailbox.id, statusError.message);
    }
  }

  const activityLogWarning = await recordEmailActivity(
    adminClient,
    null,
    'email_maintenance_completed',
    `Email maintenance completed: purged ${Number(purgedCount || 0)} expired messages, sent ${scheduledResult.sentIds.length} scheduled emails, and renewed ${renewed.length} mailboxes.`,
    'system',
    'Email maintenance',
    { purgedCount: Number(purgedCount || 0), scheduledSentCount: scheduledResult.sentIds.length, scheduledFailedCount: scheduledResult.failures.length, renewedCount: renewed.length, failedCount: failures.length },
    'Email maintenance service',
  );
  if (activityLogWarning) console.error(activityLogWarning);

  return jsonResponse({
    success: failures.length === 0 && scheduledResult.failures.length === 0,
    purgedMessages: Number(purgedCount || 0),
    scheduledSends: scheduledResult.sentIds,
    scheduledFailures: scheduledResult.failures,
    renewedMailboxes: renewed,
    failures,
    activityLogWarning,
  }, failures.length || scheduledResult.failures.length ? 207 : 200);
});
