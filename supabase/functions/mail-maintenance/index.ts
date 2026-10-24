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
    `Email maintenance completed: purged ${Number(purgedCount || 0)} expired messages and renewed ${renewed.length} mailboxes.`,
    'system',
    'Email maintenance',
    { purgedCount: Number(purgedCount || 0), renewedCount: renewed.length, failedCount: failures.length },
    'Email maintenance service',
  );
  if (activityLogWarning) console.error(activityLogWarning);

  return jsonResponse({
    success: failures.length === 0,
    purgedMessages: Number(purgedCount || 0),
    renewedMailboxes: renewed,
    failures,
    activityLogWarning,
  }, failures.length ? 207 : 200);
});
