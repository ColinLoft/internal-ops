import { createClient, type User } from 'https://esm.sh/@supabase/supabase-js@2';

export const emailCorsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...emailCorsHeaders,
      'Content-Type': 'application/json',
    },
  });

export const base64UrlToBytes = (value: string) => {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
};

export const bytesToBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const encryptionKey = async (usage: KeyUsage[]) => {
  const encodedKey = Deno.env.get('MAIL_TOKEN_ENCRYPTION_KEY') || '';
  let rawKey: Uint8Array;
  try {
    rawKey = Uint8Array.from(atob(encodedKey), (character) => character.charCodeAt(0));
  } catch {
    throw new Error('MAIL_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
  }
  if (rawKey.length !== 32) throw new Error('MAIL_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
  return crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, usage);
};

export const encryptSecret = async (value: unknown) => {
  const key = await encryptionKey(['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return { ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)), iv: bytesToBase64Url(iv) };
};

export const decryptSecret = async <T>(ciphertext: string, iv: string): Promise<T> => {
  const key = await encryptionKey(['decrypt']);
  const cleartext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64UrlToBytes(iv) },
    key,
    base64UrlToBytes(ciphertext),
  );
  return JSON.parse(new TextDecoder().decode(cleartext)) as T;
};

export const clientsFor = async (request: Request) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('Authorization');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) throw new Error('Email service is missing Supabase configuration.');
  if (!authorization) throw new Error('Authentication required.');

  const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: { user }, error } = await callerClient.auth.getUser();
  if (error || !user) throw new Error('Authentication required.');
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  return { adminClient, callerClient, user, supabaseUrl, serviceRoleKey };
};

export const recordEmailActivity = async (
  adminClient: ReturnType<typeof createClient>,
  actor: User | null,
  eventType: string,
  summary: string,
  targetId: string,
  targetName: string,
  metadata: Record<string, unknown> = {},
  systemActorName = 'Email service',
) => {
  let actorName = systemActorName;
  if (actor) {
    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('name')
      .eq('id', actor.id)
      .maybeSingle();
    if (profileError) return `Activity log actor could not be loaded: ${profileError.message}`;
    actorName = String(profile?.name || actor.email || 'Workspace member');
  }
  const { error } = await adminClient.from('system_activity_logs').insert({
    actor_id: actor?.id || null,
    actor_name: actorName,
    event_type: eventType,
    target_type: 'mailbox',
    target_id: targetId,
    target_name: targetName,
    summary,
    metadata,
  });
  return error ? `Activity log could not be saved: ${error.message}` : null;
};

export const hasMailboxAccess = async (
  adminClient: ReturnType<typeof createClient>,
  user: User,
  mailboxId: string,
  requireSend = false,
) => {
  const { data: mailbox, error } = await adminClient
    .from('email_mailboxes')
    .select('id, provider, mailbox_type, email, display_name, provider_user_id, connected_by, google_history_id, graph_subscription_id, graph_client_state, push_expires_at, last_synced_at')
    .eq('id', mailboxId)
    .maybeSingle();
  if (error) throw new Error(`Mailbox could not be loaded: ${error.message}`);
  if (!mailbox) throw new Error('Mailbox not found.');
  if (mailbox.connected_by === user.id) return mailbox;

  const { data: grant, error: grantError } = await adminClient
    .from('email_mailbox_access')
    .select('can_send')
    .eq('mailbox_id', mailboxId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (grantError) throw new Error(`Mailbox access could not be checked: ${grantError.message}`);
  if (!grant || (requireSend && !grant.can_send)) throw new Error('You do not have permission to access this mailbox.');
  return mailbox;
};

type OAuthTokens = {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
};

export const getAccessToken = async (
  adminClient: ReturnType<typeof createClient>,
  mailbox: Record<string, any>,
) => {
  const { data: tokenRow, error } = await adminClient
    .from('email_mailbox_tokens')
    .select('encrypted_tokens, encryption_iv, access_expires_at')
    .eq('mailbox_id', mailbox.id)
    .single();
  if (error) throw new Error(`Mailbox credentials could not be loaded: ${error.message}`);
  const credentials = await decryptSecret<OAuthTokens>(tokenRow.encrypted_tokens, tokenRow.encryption_iv);
  if (Date.parse(tokenRow.access_expires_at) > Date.now() + 60_000) return credentials.access_token;
  if (!credentials.refresh_token) throw new Error('Mailbox authorization expired. An administrator must reconnect this mailbox.');

  const provider = mailbox.provider as 'google' | 'microsoft';
  const clientId = provider === 'google' ? Deno.env.get('GOOGLE_MAIL_CLIENT_ID') : Deno.env.get('MICROSOFT_MAIL_CLIENT_ID');
  const clientSecret = provider === 'google' ? Deno.env.get('GOOGLE_MAIL_CLIENT_SECRET') : Deno.env.get('MICROSOFT_MAIL_CLIENT_SECRET');
  if (!clientId || !clientSecret) throw new Error('Mailbox provider credentials are not configured.');
  const endpoint = provider === 'google'
    ? 'https://oauth2.googleapis.com/token'
    : `https://login.microsoftonline.com/${encodeURIComponent(Deno.env.get('MICROSOFT_TENANT_ID') || 'organizations')}/oauth2/v2.0/token`;
  const refreshResponse = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: credentials.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  const refreshed = await refreshResponse.json();
  if (!refreshResponse.ok || typeof refreshed.access_token !== 'string') {
    throw new Error('Mailbox authorization expired. An administrator must reconnect this mailbox.');
  }
  const nextCredentials: OAuthTokens = {
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token || credentials.refresh_token,
    token_type: refreshed.token_type || 'Bearer',
  };
  const encrypted = await encryptSecret(nextCredentials);
  const { error: saveError } = await adminClient.from('email_mailbox_tokens').update({
    encrypted_tokens: encrypted.ciphertext,
    encryption_iv: encrypted.iv,
    access_expires_at: new Date(Date.now() + Number(refreshed.expires_in || 3600) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('mailbox_id', mailbox.id);
  if (saveError) throw new Error(`Refreshed credentials could not be stored: ${saveError.message}`);
  return nextCredentials.access_token;
};

const base64UrlDecode = (value: string) => {
  const bytes = base64UrlToBytes(value);
  return new TextDecoder().decode(bytes);
};

const gmailTextBody = (payload: Record<string, any>): string => {
  if (payload.mimeType === 'text/plain' && payload.body?.data && !payload.filename) {
    return base64UrlDecode(payload.body.data);
  }
  for (const part of payload.parts || []) {
    const text = gmailTextBody(part);
    if (text) return text;
  }
  return '';
};

const gmailHasAttachment = (payload: Record<string, any>): boolean =>
  (payload.parts || []).some((part: Record<string, any>) => Boolean(part.filename) || gmailHasAttachment(part));

const gmailHeader = (headers: { name: string; value: string }[] = [], name: string) =>
  headers.find((header) => header.name.toLowerCase() === name.toLowerCase())?.value || '';

const classifyGmailFolder = (labels: string[] = []) => {
  if (labels.includes('TRASH')) return 'trash';
  if (labels.includes('SENT')) return 'sent';
  if (labels.includes('INBOX')) return 'inbox';
  return 'archive';
};

export const syncMailbox = async (
  adminClient: ReturnType<typeof createClient>,
  mailbox: Record<string, any>,
  messageIds?: string[],
  webhookHistoryId?: string,
) => {
  const accessToken = await getAccessToken(adminClient, mailbox);
  const retention = await adminClient.from('email_settings').select('retention_days').eq('id', true).maybeSingle();
  if (retention.error) throw new Error(`Email retention policy could not be loaded: ${retention.error.message}`);
  const retentionDays = Number(retention.data?.retention_days || 365);
  const expiresAt = (receivedAt: string) => new Date(Date.parse(receivedAt) + retentionDays * 86_400_000).toISOString();

  let normalized: Record<string, unknown>[] = [];
  let historyId: string | null = webhookHistoryId || null;
  if (mailbox.provider === 'google') {
    const ids = messageIds || await (async () => {
      const listUrl = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
      listUrl.searchParams.set('maxResults', '100');
      listUrl.searchParams.set('q', `in:anywhere -in:spam newer_than:${retentionDays}d`);
      const response = await fetch(listUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
      const body = await response.json();
      if (!response.ok) throw new Error(`Gmail sync failed: ${body.error?.message || response.statusText}`);
      historyId = String(body.historyId || mailbox.google_history_id || '') || null;
      return (body.messages || []).map((message: { id: string }) => message.id);
    })();

    await Promise.all(ids.slice(0, 100).map(async (id) => {
      const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=full`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const body = await response.json();
      if (!response.ok) throw new Error(`Gmail message sync failed: ${body.error?.message || response.statusText}`);
      const headers = body.payload?.headers || [];
      const from = gmailHeader(headers, 'From');
      const addressMatch = from.match(/<([^>]+)>/);
      const senderEmail = (addressMatch?.[1] || from).trim().toLowerCase();
      const senderName = addressMatch ? from.replace(addressMatch[0], '').replace(/["']/g, '').trim() : senderEmail;
      const receivedAt = new Date(Number(body.internalDate || Date.now())).toISOString();
      const providerLabels = Array.isArray(body.labelIds) ? body.labelIds as string[] : [];
      const labels = providerLabels.filter((label) => ![
          'INBOX', 'SENT', 'TRASH', 'UNREAD', 'STARRED', 'IMPORTANT', 'DRAFT',
          'CATEGORY_PERSONAL', 'CATEGORY_SOCIAL', 'CATEGORY_PROMOTIONS', 'CATEGORY_UPDATES', 'CATEGORY_FORUMS',
        ].includes(label));
      normalized.push({
        mailbox_id: mailbox.id,
        provider_message_id: body.id,
        provider_thread_id: body.threadId || null,
        folder: classifyGmailFolder(providerLabels),
        subject: gmailHeader(headers, 'Subject'),
        sender_name: senderName,
        sender_email: senderEmail,
        to_recipients: gmailHeader(headers, 'To').split(',').filter(Boolean).map((email: string) => ({ email: email.trim() })),
        cc_recipients: gmailHeader(headers, 'Cc').split(',').filter(Boolean).map((email: string) => ({ email: email.trim() })),
        body_text: gmailTextBody(body.payload || {}),
        snippet: String(body.snippet || ''),
        received_at: receivedAt,
        is_read: !providerLabels.includes('UNREAD'),
        is_starred: providerLabels.includes('STARRED'),
        has_attachments: gmailHasAttachment(body.payload || {}),
        labels,
        expires_at: expiresAt(receivedAt),
        synced_at: new Date().toISOString(),
      });
    }));
  } else {
    const userPath = mailbox.mailbox_type === 'shared'
      ? `users/${encodeURIComponent(mailbox.email)}`
      : 'me';
    if (messageIds?.length) {
      const fetched = await Promise.all(messageIds.slice(0, 50).map(async (id) => {
        const response = await fetch(`https://graph.microsoft.com/v1.0/${userPath}/messages/${encodeURIComponent(id)}?$select=id,conversationId,subject,from,toRecipients,ccRecipients,body,bodyPreview,receivedDateTime,isRead,flag,hasAttachments,parentFolderId`, {
          headers: { Authorization: `Bearer ${accessToken}`, Prefer: 'outlook.body-content-type="text"' },
        });
        const message = await response.json();
        if (!response.ok) throw new Error(`Microsoft mail sync failed: ${message.error?.message || response.statusText}`);
        return normalizeGraphMessage(message, mailbox, expiresAt, 'inbox');
      }));
      normalized = fetched;
    } else {
      const folders = [
        ['inbox', 'Inbox'],
        ['sent', 'SentItems'],
        ['archive', 'Archive'],
        ['trash', 'DeletedItems'],
      ] as const;
      const folderMessages = await Promise.all(folders.map(async ([folder, folderId]) => {
        const url = new URL(`https://graph.microsoft.com/v1.0/${userPath}/mailFolders/${folderId}/messages`);
        url.searchParams.set('$top', '100');
        url.searchParams.set('$orderby', 'receivedDateTime desc');
        url.searchParams.set('$select', 'id,conversationId,subject,from,toRecipients,ccRecipients,body,bodyPreview,receivedDateTime,isRead,flag,hasAttachments,parentFolderId');
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}`, Prefer: 'outlook.body-content-type="text"' },
        });
        const body = await response.json();
        if (!response.ok) throw new Error(`Microsoft mail sync failed: ${body.error?.message || response.statusText}`);
        return (body.value || []).map((message: Record<string, any>) => normalizeGraphMessage(message, mailbox, expiresAt, folder));
      }));
      normalized = folderMessages.flat();
    }
  }

  const { data: rules, error: rulesError } = await adminClient
    .from('email_rules')
    .select('sender_contains, subject_contains, action, action_value')
    .eq('mailbox_id', mailbox.id)
    .eq('enabled', true);
  if (rulesError) throw new Error(`Mailbox rules could not be loaded: ${rulesError.message}`);
  const userPath = mailbox.mailbox_type === 'shared' ? `users/${encodeURIComponent(mailbox.email)}` : 'me';
  const movedProviderIds: { oldId: string; newId: string }[] = [];
  for (const message of normalized) {
    const sender = String(message.sender_email || '').toLowerCase();
    const subject = String(message.subject || '').toLowerCase();
    const labels = Array.isArray(message.labels) ? [...message.labels] as string[] : [];
    for (const rule of rules || []) {
      const senderCondition = String(rule.sender_contains || '').trim().toLowerCase();
      const subjectCondition = String(rule.subject_contains || '').trim().toLowerCase();
      if (senderCondition && !sender.includes(senderCondition)) continue;
      if (subjectCondition && !subject.includes(subjectCondition)) continue;

      const providerMessageId = encodeURIComponent(String(message.provider_message_id));
      if (rule.action === 'label' && typeof rule.action_value === 'string') {
        if (!labels.includes(rule.action_value)) labels.push(rule.action_value);
      } else if (rule.action === 'mark_read' && message.is_read !== true) {
        const response = mailbox.provider === 'google'
          ? await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${providerMessageId}/modify`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
          })
          : await fetch(`https://graph.microsoft.com/v1.0/${userPath}/messages/${providerMessageId}`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ isRead: true }),
          });
        if (!response.ok) throw new Error(`Rule "${rule.action}" matched a message but the provider could not mark it read.`);
        message.is_read = true;
      } else if (rule.action === 'archive' && message.folder === 'inbox') {
        const response = mailbox.provider === 'google'
          ? await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${providerMessageId}/modify`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ removeLabelIds: ['INBOX'] }),
          })
          : await fetch(`https://graph.microsoft.com/v1.0/${userPath}/messages/${providerMessageId}/move`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ destinationId: 'archive' }),
          });
        const result = mailbox.provider === 'microsoft' ? await response.json() : null;
        if (!response.ok) throw new Error(`Rule "${rule.action}" matched a message but the provider could not archive it.`);
        if (typeof result?.id === 'string') {
          movedProviderIds.push({ oldId: String(message.provider_message_id), newId: result.id });
          message.provider_message_id = result.id;
        }
        message.folder = 'archive';
      }
    }
    message.labels = labels;
  }

  for (const moved of movedProviderIds) {
    const { data: existing, error: lookupError } = await adminClient.from('email_messages')
      .select('id')
      .eq('mailbox_id', mailbox.id)
      .eq('provider_message_id', moved.oldId)
      .maybeSingle();
    if (lookupError) throw new Error(`Archived message could not be reconciled: ${lookupError.message}`);
    if (existing) {
      const { error: updateError } = await adminClient.from('email_messages')
        .update({ provider_message_id: moved.newId })
        .eq('id', existing.id);
      if (updateError) throw new Error(`Archived message identifier could not be updated: ${updateError.message}`);
    }
  }

  if (normalized.length) {
    const { error } = await adminClient.from('email_messages').upsert(normalized, { onConflict: 'mailbox_id,provider_message_id' });
    if (error) throw new Error(`Synced messages could not be stored: ${error.message}`);
  }

  const now = new Date().toISOString();
  const mailboxUpdate: Record<string, unknown> = { last_synced_at: now };
  if (historyId) mailboxUpdate.google_history_id = historyId;
  const { error: updateError } = await adminClient.from('email_mailboxes').update(mailboxUpdate).eq('id', mailbox.id);
  if (updateError) throw new Error(`Mailbox sync status could not be updated: ${updateError.message}`);

  const { error: purgeError } = await adminClient.rpc('purge_expired_email');
  if (purgeError) throw new Error(`Email was synced, but expired messages could not be purged: ${purgeError.message}`);
  return { synced: normalized.length, lastSyncedAt: now };
};

const normalizeGraphMessage = (
  message: Record<string, any>,
  mailbox: Record<string, any>,
  expiresAt: (receivedAt: string) => string,
  folder: string,
) => {
  const receivedAt = message.receivedDateTime || new Date().toISOString();
  const from = message.from?.emailAddress || {};
  return {
    mailbox_id: mailbox.id,
    provider_message_id: message.id,
    provider_thread_id: message.conversationId || null,
    folder,
    subject: message.subject || '',
    sender_name: from.name || from.address || '',
    sender_email: String(from.address || '').toLowerCase(),
    to_recipients: (message.toRecipients || []).map((recipient: Record<string, any>) => recipient.emailAddress),
    cc_recipients: (message.ccRecipients || []).map((recipient: Record<string, any>) => recipient.emailAddress),
    body_text: message.body?.content || '',
    snippet: message.bodyPreview || '',
    received_at: receivedAt,
    is_read: Boolean(message.isRead),
    is_starred: message.flag?.flagStatus === 'flagged',
    has_attachments: Boolean(message.hasAttachments),
    labels: [],
    expires_at: expiresAt(receivedAt),
    synced_at: new Date().toISOString(),
  };
};
