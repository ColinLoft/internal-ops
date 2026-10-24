import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { decryptSecret, encryptSecret, recordEmailActivity } from '../_shared/email.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const bytesToBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const sha256 = async (value: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('Authorization');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return jsonResponse({ error: 'The mail connection function is missing Supabase configuration.' }, 503);
  if (!authorization) return jsonResponse({ error: 'Authentication required.' }, 401);

  const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: { user }, error: authError } = await callerClient.auth.getUser();
  if (authError || !user) return jsonResponse({ error: 'Authentication required.' }, 401);

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid mailbox connection request.' }, 400);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const action = payload.action;

  if (action === 'authorize') {
    const provider = payload.provider === 'microsoft' || payload.provider === 'google' ? payload.provider : null;
    const mailboxType = payload.mailboxType === 'shared' ? 'shared' : 'personal';
    const targetEmail = typeof payload.targetEmail === 'string' ? payload.targetEmail.trim().toLowerCase() : '';
    if (!provider) return jsonResponse({ error: 'Choose Microsoft 365 or Google Workspace.' }, 400);
    if (mailboxType === 'shared') {
      const { data: profile, error: profileError } = await adminClient.from('profiles').select('system_role').eq('id', user.id).maybeSingle();
      if (profileError) return jsonResponse({ error: `Administrator role could not be verified: ${profileError.message}` }, 500);
      if (profile?.system_role !== 'admin') return jsonResponse({ error: 'Only administrators can connect shared mailboxes.' }, 403);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) return jsonResponse({ error: 'Enter the shared mailbox email address.' }, 400);
    }

    const clientId = provider === 'google' ? Deno.env.get('GOOGLE_MAIL_CLIENT_ID') : Deno.env.get('MICROSOFT_MAIL_CLIENT_ID');
    const clientSecret = provider === 'google' ? Deno.env.get('GOOGLE_MAIL_CLIENT_SECRET') : Deno.env.get('MICROSOFT_MAIL_CLIENT_SECRET');
    const redirectUri = Deno.env.get('MAIL_REDIRECT_URI');
    if (!clientId || !clientSecret || !redirectUri) {
      const providerSecrets = provider === 'google'
        ? 'GOOGLE_MAIL_CLIENT_ID and GOOGLE_MAIL_CLIENT_SECRET'
        : 'MICROSOFT_MAIL_CLIENT_ID and MICROSOFT_MAIL_CLIENT_SECRET';
      return jsonResponse({ error: `Email OAuth is not configured yet. Set ${providerSecrets} and MAIL_REDIRECT_URI in Supabase Edge Function secrets.` }, 503);
    }

    const { error: cleanupError } = await adminClient.from('email_oauth_states')
      .delete()
      .lt('expires_at', new Date().toISOString());
    if (cleanupError) return jsonResponse({ error: `Expired authorization state could not be cleaned up: ${cleanupError.message}` }, 500);

    const random = crypto.getRandomValues(new Uint8Array(32));
    const state = bytesToBase64Url(random);
    const verifier = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(48)));
    const challenge = bytesToBase64Url(await sha256(verifier));
    const stateHash = bytesToBase64Url(await sha256(state));
    const { error: stateError } = await adminClient.from('email_oauth_states').insert({
      state_hash: stateHash,
      user_id: user.id,
      provider,
      mailbox_type: mailboxType,
      target_email: mailboxType === 'shared' ? targetEmail : null,
      code_verifier: verifier,
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    });
    if (stateError) return jsonResponse({ error: `Could not start mailbox authorization: ${stateError.message}` }, 500);

    const scopes = provider === 'google'
      ? ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/gmail.modify', 'https://www.googleapis.com/auth/gmail.send']
      : [
        'openid',
        'profile',
        'email',
        'offline_access',
        'https://graph.microsoft.com/User.Read',
        'https://graph.microsoft.com/Mail.ReadWrite',
        'https://graph.microsoft.com/Mail.Send',
        'https://graph.microsoft.com/Mail.ReadWrite.Shared',
        'https://graph.microsoft.com/Mail.Send.Shared',
      ];
    const authorizationUrl = provider === 'google'
      ? new URL('https://accounts.google.com/o/oauth2/v2/auth')
      : new URL(`https://login.microsoftonline.com/${encodeURIComponent(Deno.env.get('MICROSOFT_TENANT_ID') || 'organizations')}/oauth2/v2.0/authorize`);
    authorizationUrl.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      response_mode: 'query',
      scope: scopes.join(' '),
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      ...(provider === 'google' ? { access_type: 'offline', prompt: 'consent' } : {}),
    }).toString();
    return jsonResponse({ authorizationUrl: authorizationUrl.toString() });
  }

  if (action !== 'exchange') return jsonResponse({ error: 'Unsupported mailbox connection action.' }, 400);
  const code = typeof payload.code === 'string' ? payload.code : '';
  const state = typeof payload.state === 'string' ? payload.state : '';
  if (!code || !state) return jsonResponse({ error: 'The OAuth response is missing its authorization code or state.' }, 400);

  const stateHash = bytesToBase64Url(await sha256(state));
  const { data: oauthState, error: stateError } = await adminClient
    .from('email_oauth_states')
    .delete()
    .eq('state_hash', stateHash)
    .eq('user_id', user.id)
    .gt('expires_at', new Date().toISOString())
    .select('*')
    .maybeSingle();
  if (stateError) return jsonResponse({ error: `Mailbox authorization state could not be consumed: ${stateError.message}` }, 500);
  if (!oauthState) return jsonResponse({ error: 'Mailbox authorization expired or could not be verified. Start the connection again.' }, 400);

  const provider = oauthState.provider as 'microsoft' | 'google';
  const redirectUri = Deno.env.get('MAIL_REDIRECT_URI');
  const clientId = provider === 'google' ? Deno.env.get('GOOGLE_MAIL_CLIENT_ID') : Deno.env.get('MICROSOFT_MAIL_CLIENT_ID');
  const clientSecret = provider === 'google' ? Deno.env.get('GOOGLE_MAIL_CLIENT_SECRET') : Deno.env.get('MICROSOFT_MAIL_CLIENT_SECRET');
  if (!redirectUri || !clientId || !clientSecret) return jsonResponse({ error: 'Email OAuth client credentials are not configured.' }, 503);

  const tokenUrl = provider === 'google'
    ? 'https://oauth2.googleapis.com/token'
    : `https://login.microsoftonline.com/${encodeURIComponent(Deno.env.get('MICROSOFT_TENANT_ID') || 'organizations')}/oauth2/v2.0/token`;
  const tokenResponse = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      code_verifier: oauthState.code_verifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  });
  const tokens = await tokenResponse.json();
  if (!tokenResponse.ok || typeof tokens.access_token !== 'string') {
    return jsonResponse({ error: 'The email provider rejected authorization. Check the OAuth client, redirect URI, and requested permissions.' }, 400);
  }

  const identityResponse = provider === 'google'
    ? await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${tokens.access_token}` } })
    : await fetch('https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName', { headers: { Authorization: `Bearer ${tokens.access_token}` } });
  const identity = await identityResponse.json();
  if (!identityResponse.ok) return jsonResponse({ error: 'The connected email identity could not be verified.' }, 400);
  if (provider === 'google' && identity.verified_email !== true) {
    return jsonResponse({ error: 'Google did not verify this mailbox email address.' }, 403);
  }
  const accountEmail = String(provider === 'google' ? identity.email : identity.mail || identity.userPrincipalName || '').trim().toLowerCase();
  const displayName = String(identity.name || identity.displayName || accountEmail);
  if (!accountEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(accountEmail)) {
    return jsonResponse({ error: 'The provider did not return a valid organization email address.' }, 400);
  }

  const { data: profiles, error: profilesError } = await adminClient.from('profiles').select('email');
  if (profilesError) return jsonResponse({ error: `Could not verify the organization account: ${profilesError.message}` }, 500);
  const allowedDomains = new Set((profiles || [])
    .map((profile) => String(profile.email || '').split('@')[1]?.toLowerCase())
    .filter(Boolean));
  const mailboxType = oauthState.mailbox_type as 'personal' | 'shared';
  const targetEmail = typeof oauthState.target_email === 'string' ? oauthState.target_email.trim().toLowerCase() : '';
  const mailboxEmail = mailboxType === 'shared' && targetEmail ? targetEmail : accountEmail;
  if (!allowedDomains.has(accountEmail.split('@')[1]) || !allowedDomains.has(mailboxEmail.split('@')[1])) {
    return jsonResponse({ error: 'Only email accounts in an existing workspace organization domain can be connected.' }, 403);
  }
  if (provider === 'google' && mailboxEmail !== accountEmail) {
    return jsonResponse({ error: 'For Google Workspace, sign in directly to the shared Gmail account before connecting it.' }, 400);
  }

  const { data: existingMailbox, error: existingMailboxError } = await adminClient
    .from('email_mailboxes')
    .select('id')
    .eq('provider', provider)
    .eq('email', mailboxEmail)
    .eq('mailbox_type', mailboxType)
    .maybeSingle();
  if (existingMailboxError) return jsonResponse({ error: `Existing mailbox authorization could not be checked: ${existingMailboxError.message}` }, 500);
  let refreshToken = typeof tokens.refresh_token === 'string' ? tokens.refresh_token : '';
  if (!refreshToken && existingMailbox) {
    const { data: previousToken, error: previousTokenError } = await adminClient.from('email_mailbox_tokens')
      .select('encrypted_tokens, encryption_iv')
      .eq('mailbox_id', existingMailbox.id)
      .maybeSingle();
    if (previousTokenError) return jsonResponse({ error: `Existing mailbox credentials could not be loaded: ${previousTokenError.message}` }, 500);
    if (previousToken) {
      const previousCredentials = await decryptSecret<{ refresh_token?: string }>(previousToken.encrypted_tokens, previousToken.encryption_iv);
      refreshToken = previousCredentials.refresh_token || '';
    }
  }
  if (!refreshToken) {
    return jsonResponse({ error: 'The provider did not issue an offline refresh token. Revoke the app authorization at your provider and reconnect with offline access enabled.' }, 400);
  }

  const encrypted = await encryptSecret({
    access_token: tokens.access_token,
    refresh_token: refreshToken,
    token_type: tokens.token_type || 'Bearer',
  });
  const providerUserId = String(identity.id || accountEmail);
  const { data: mailbox, error: mailboxError } = await adminClient
    .from('email_mailboxes')
    .upsert({
      provider,
      mailbox_type: mailboxType,
      email: mailboxEmail,
      display_name: displayName,
      provider_user_id: providerUserId,
      connected_by: user.id,
    }, { onConflict: 'provider,email,mailbox_type' })
    .select('id')
    .single();
  if (mailboxError || !mailbox) return jsonResponse({ error: `Could not save the mailbox: ${mailboxError?.message || 'Unknown database error'}` }, 500);

  const { error: tokenSaveError } = await adminClient.from('email_mailbox_tokens').upsert({
    mailbox_id: mailbox.id,
    encrypted_tokens: encrypted.ciphertext,
    encryption_iv: encrypted.iv,
    access_expires_at: new Date(Date.now() + Number(tokens.expires_in || 3600) * 1000).toISOString(),
  }, { onConflict: 'mailbox_id' });
  if (tokenSaveError) return jsonResponse({ error: `Mailbox connected, but secure credentials could not be stored: ${tokenSaveError.message}` }, 500);

  const { error: grantError } = await adminClient.from('email_mailbox_access').upsert({
    mailbox_id: mailbox.id,
    user_id: user.id,
    granted_by: user.id,
    can_send: true,
  }, { onConflict: 'mailbox_id,user_id' });
  if (grantError) return jsonResponse({ error: `Mailbox connected, but initial access could not be recorded: ${grantError.message}` }, 500);

  let webhookWarning = '';
  const webhookUrl = Deno.env.get('MAIL_WEBHOOK_URL');
  let validatedWebhookUrl = '';
  if (webhookUrl) {
    try {
      const parsedWebhookUrl = new URL(webhookUrl);
      if (parsedWebhookUrl.protocol !== 'https:') throw new Error('The public webhook URL must use HTTPS.');
      validatedWebhookUrl = parsedWebhookUrl.toString().replace(/\/$/, '');
    } catch (error) {
      webhookWarning = error instanceof Error ? error.message : 'MAIL_WEBHOOK_URL is invalid.';
    }
  }
  if (validatedWebhookUrl) {
    try {
    if (provider === 'google') {
      const topicName = Deno.env.get('GOOGLE_PUBSUB_TOPIC');
      if (topicName) {
        const watchResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/watch', {
          method: 'POST',
          headers: { Authorization: `Bearer ${tokens.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ topicName, labelIds: ['INBOX'], labelFilterAction: 'include' }),
        });
        const watch = await watchResponse.json();
        if (watchResponse.ok) {
          const { error: watchSaveError } = await adminClient.from('email_mailboxes').update({
            google_history_id: String(watch.historyId || ''),
            push_expires_at: watch.expiration ? new Date(Number(watch.expiration)).toISOString() : null,
            push_error: null,
          }).eq('id', mailbox.id);
          if (watchSaveError) webhookWarning = `Mailbox connected, but Google push status could not be saved: ${watchSaveError.message}`;
        } else {
          webhookWarning = `Mailbox connected. Gmail push notifications need setup: ${watch.error?.message || 'Google Cloud Pub/Sub watch request failed.'}`;
        }
      } else {
        webhookWarning = 'Mailbox connected. Add GOOGLE_PUBSUB_TOPIC to enable Gmail arrival notifications.';
      }
    } else {
      const clientState = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
      const expires = new Date(Date.now() + 4230 * 60_000).toISOString();
      const targetPath = mailboxType === 'shared'
        ? `users/${encodeURIComponent(mailboxEmail)}`
        : 'me';
      const subscriptionResponse = await fetch('https://graph.microsoft.com/v1.0/subscriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokens.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          changeType: 'created,updated',
          notificationUrl: `${validatedWebhookUrl}?provider=microsoft`,
          resource: `${targetPath}/mailFolders('inbox')/messages`,
          expirationDateTime: expires,
          clientState,
        }),
      });
      const subscription = await subscriptionResponse.json();
      if (subscriptionResponse.ok) {
        const { error: subscriptionSaveError } = await adminClient.from('email_mailboxes').update({
          graph_subscription_id: subscription.id,
          graph_client_state: clientState,
          push_expires_at: subscription.expirationDateTime,
          push_error: null,
        }).eq('id', mailbox.id);
        if (subscriptionSaveError) webhookWarning = `Mailbox connected, but notification subscription could not be saved: ${subscriptionSaveError.message}`;
      } else {
        webhookWarning = `Mailbox connected. Microsoft arrival notifications need setup: ${subscription.error?.message || 'Graph subscription request failed.'}`;
      }
    }
    } catch (error) {
      webhookWarning = `Mailbox connected, but push notifications could not be configured: ${error instanceof Error ? error.message : 'Provider request failed.'}`;
    }
  } else {
    if (!webhookWarning) webhookWarning = 'Mailbox connected. Add MAIL_WEBHOOK_URL to enable arrival notifications.';
  }
  if (webhookWarning) {
    const { error: pushStatusError } = await adminClient.from('email_mailboxes').update({
      push_error: webhookWarning,
    }).eq('id', mailbox.id);
    if (pushStatusError) webhookWarning += ` Push status could not be saved: ${pushStatusError.message}`;
  }

  const activityLogWarning = await recordEmailActivity(
    adminClient,
    user,
    'email_mailbox_connected',
    `Connected a ${mailboxType} email mailbox.`,
    mailbox.id,
    mailboxEmail,
  );
  if (activityLogWarning) webhookWarning = [webhookWarning, activityLogWarning].filter(Boolean).join(' ');

  return jsonResponse({ success: true, mailboxId: mailbox.id, email: mailboxEmail, webhookWarning });
});
