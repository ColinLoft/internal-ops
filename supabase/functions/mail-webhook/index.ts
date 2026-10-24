import { createRemoteJWKSet, jwtVerify } from 'https://esm.sh/jose@5.9.6';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const response = (body: string, status = 200, contentType = 'application/json') =>
  new Response(body, { status, headers: { 'Content-Type': contentType } });

const decodeBase64Json = (value: string) => {
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0))));
};

const triggerSync = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  webhookSecret: string,
  mailboxId: string,
  messageIds?: string[],
  historyId?: string,
) => {
  const chunks = messageIds?.length
    ? Array.from({ length: Math.ceil(messageIds.length / 50) }, (_, index) => messageIds.slice(index * 50, index * 50 + 50))
    : [undefined];
  for (const [index, chunk] of chunks.entries()) {
    const result = await fetch(`${supabaseUrl}/functions/v1/mail-sync`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
        'Content-Type': 'application/json',
        'x-mail-webhook-secret': webhookSecret,
      },
      body: JSON.stringify({ mailboxId, messageIds: chunk, historyId: index === chunks.length - 1 ? historyId : undefined }),
    });
    if (!result.ok) {
      const details = await result.text();
      console.error('Email provider notification sync failed:', result.status, details.slice(0, 500));
      return;
    }
  }
};

Deno.serve(async (request: Request) => {
  const validationToken = new URL(request.url).searchParams.get('validationToken');
  if ((request.method === 'GET' || request.method === 'POST') && validationToken) {
    return response(validationToken, 200, 'text/plain');
  }
  if (request.method === 'GET') {
    return response(JSON.stringify({ error: 'Provider validation token is required.' }), 400);
  }
  if (request.method !== 'POST') return response(JSON.stringify({ error: 'Method not allowed.' }), 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const webhookSecret = Deno.env.get('MAIL_WEBHOOK_SHARED_SECRET');
  if (!supabaseUrl || !serviceRoleKey || !webhookSecret) return response(JSON.stringify({ error: 'Mail webhook is not configured.' }), 503);
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const url = new URL(request.url);
  if (url.searchParams.get('provider') === 'microsoft') {
    const body = await request.json().catch(() => ({}));
    const notifications = Array.isArray(body.value) ? body.value : [];
    for (const item of notifications) {
      if (typeof item.subscriptionId !== 'string' || typeof item.clientState !== 'string') continue;
      const { data: mailbox } = await adminClient
        .from('email_mailboxes')
        .select('id, graph_client_state')
        .eq('provider', 'microsoft')
        .eq('graph_subscription_id', item.subscriptionId)
        .maybeSingle();
      if (!mailbox || mailbox.graph_client_state !== item.clientState) continue;
      const resource = typeof item.resource === 'string' ? item.resource : '';
      const messageId = resource.match(/\/messages\/([^/]+)/i)?.[1];
      await triggerSync(
        supabaseUrl,
        serviceRoleKey,
        webhookSecret,
        mailbox.id,
        messageId ? [decodeURIComponent(messageId)] : undefined,
      );
    }
    return response(JSON.stringify({ received: true }), 202);
  }

  const authorization = request.headers.get('Authorization') || '';
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  const audience = Deno.env.get('GMAIL_PUBSUB_AUDIENCE');
  const expectedServiceAccount = Deno.env.get('GMAIL_PUBSUB_SERVICE_ACCOUNT');
  if (!bearer || !audience || !expectedServiceAccount) {
    return response(JSON.stringify({ error: 'Google Pub/Sub push authentication is not configured.' }), 401);
  }

  try {
    const jwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
    const { payload } = await jwtVerify(bearer, jwks, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience,
    });
    if (payload.email !== expectedServiceAccount || payload.email_verified !== true) {
      return response(JSON.stringify({ error: 'Google Pub/Sub service identity is invalid.' }), 403);
    }
  } catch {
    return response(JSON.stringify({ error: 'Google Pub/Sub token could not be verified.' }), 401);
  }

  const body = await request.json().catch(() => ({}));
  const encodedData = body.message?.data;
  if (typeof encodedData !== 'string') return response(JSON.stringify({ error: 'Google notification is missing data.' }), 400);
  let notification: Record<string, unknown>;
  try {
    notification = decodeBase64Json(encodedData);
  } catch {
    return response(JSON.stringify({ error: 'Google notification data is invalid.' }), 400);
  }

  const email = typeof notification.emailAddress === 'string' ? notification.emailAddress.toLowerCase() : '';
  const historyId = typeof notification.historyId === 'string' ? notification.historyId : '';
  if (!email || !historyId) return response(JSON.stringify({ error: 'Google notification is missing mailbox information.' }), 400);
  const { data: mailbox } = await adminClient
    .from('email_mailboxes')
    .select('*')
    .eq('provider', 'google')
    .eq('email', email)
    .maybeSingle();
  if (!mailbox) return response(JSON.stringify({ ignored: true }), 202);

  const { getAccessToken } = await import('../_shared/email.ts');
  const accessToken = await getAccessToken(adminClient, mailbox);
  if (!mailbox.google_history_id) {
    await triggerSync(supabaseUrl, serviceRoleKey, webhookSecret, mailbox.id);
    return response(JSON.stringify({ initialSync: true }), 202);
  }
  const messageIds = new Set<string>();
  let pageToken = '';
  let latestHistoryId = historyId;
  do {
    const historyUrl = new URL('https://gmail.googleapis.com/gmail/v1/users/me/history');
    historyUrl.searchParams.set('startHistoryId', mailbox.google_history_id);
    historyUrl.searchParams.set('historyTypes', 'messageAdded');
    if (pageToken) historyUrl.searchParams.set('pageToken', pageToken);
    const historyResponse = await fetch(historyUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    const history = await historyResponse.json();
    if (!historyResponse.ok) {
      console.error('Gmail history lookup failed:', history.error?.code || historyResponse.status);
      await triggerSync(supabaseUrl, serviceRoleKey, webhookSecret, mailbox.id);
      return response(JSON.stringify({ fallback: true }), 202);
    }
    for (const entry of history.history || []) {
      for (const item of entry.messagesAdded || []) {
        if (typeof item.message?.id === 'string') messageIds.add(item.message.id);
      }
    }
    latestHistoryId = String(history.historyId || latestHistoryId);
    pageToken = String(history.nextPageToken || '');
  } while (pageToken);
  await triggerSync(supabaseUrl, serviceRoleKey, webhookSecret, mailbox.id, [...messageIds], latestHistoryId);
  return response(JSON.stringify({ received: true }), 202);
});
