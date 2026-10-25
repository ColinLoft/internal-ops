import { clientsFor, emailCorsHeaders, getAccessToken, jsonResponse, recordEmailActivity } from '../_shared/email.ts';

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: emailCorsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);

  try {
    const { adminClient, user } = await clientsFor(request);
    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('system_role')
      .eq('id', user.id)
      .maybeSingle();
    if (profileError) return jsonResponse({ error: `Administrator role could not be verified: ${profileError.message}` }, 500);
    if (profile?.system_role !== 'admin') return jsonResponse({ error: 'Only workspace administrators can manage shared email access.' }, 403);

    const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
    const action = typeof payload.action === 'string' ? payload.action : '';

    if (action === 'list') {
      const [mailboxResult, userResult, settingResult] = await Promise.all([
        adminClient.from('email_mailboxes')
          .select('id, provider, email, display_name, connected_by, last_synced_at, push_expires_at, push_error')
          .eq('mailbox_type', 'shared')
          .order('email'),
        adminClient.from('profiles').select('id, name, email, system_role, account_status').order('name'),
        adminClient.from('email_settings').select('retention_days').eq('id', true).single(),
      ]);
      if (mailboxResult.error) return jsonResponse({ error: mailboxResult.error.message }, 500);
      if (userResult.error) return jsonResponse({ error: userResult.error.message }, 500);
      if (settingResult.error) return jsonResponse({ error: settingResult.error.message }, 500);

      const mailboxIds = (mailboxResult.data || []).map((mailbox) => mailbox.id);
      const grantsResult = mailboxIds.length
        ? await adminClient.from('email_mailbox_access').select('mailbox_id, user_id, can_send, granted_by, created_at').in('mailbox_id', mailboxIds)
        : { data: [], error: null };
      if (grantsResult.error) return jsonResponse({ error: grantsResult.error.message }, 500);
      return jsonResponse({
        mailboxes: mailboxResult.data || [],
        users: (userResult.data || []).filter((item) => item.account_status === 'active'),
        grants: grantsResult.data || [],
        retentionDays: settingResult.data.retention_days,
      });
    }

    if (action === 'grant' || action === 'revoke') {
      const mailboxId = typeof payload.mailboxId === 'string' ? payload.mailboxId : '';
      const userId = typeof payload.userId === 'string' ? payload.userId : '';
      if (!mailboxId || !userId) return jsonResponse({ error: 'A shared mailbox and staff member are required.' }, 400);
      const { data: mailbox, error: mailboxError } = await adminClient.from('email_mailboxes')
        .select('id, mailbox_type, email')
        .eq('id', mailboxId)
        .maybeSingle();
      if (mailboxError) return jsonResponse({ error: mailboxError.message }, 500);
      if (!mailbox || mailbox.mailbox_type !== 'shared') return jsonResponse({ error: 'Shared mailbox not found.' }, 404);
      if (userId === user.id && action === 'revoke') return jsonResponse({ error: 'You cannot remove your own access to the mailbox you administer.' }, 400);

      let existingGrant = false;
      if (action === 'grant') {
        const { data: currentGrant, error: currentGrantError } = await adminClient.from('email_mailbox_access')
          .select('user_id')
          .eq('mailbox_id', mailboxId)
          .eq('user_id', userId)
          .maybeSingle();
        if (currentGrantError) return jsonResponse({ error: currentGrantError.message }, 500);
        existingGrant = Boolean(currentGrant);
        const { data: target, error: targetError } = await adminClient.from('profiles')
          .select('id, account_status')
          .eq('id', userId)
          .maybeSingle();
        if (targetError) return jsonResponse({ error: targetError.message }, 500);
        if (!target || target.account_status !== 'active') return jsonResponse({ error: 'Staff member not found or inactive.' }, 404);
        const { error } = await adminClient.from('email_mailbox_access').upsert({
          mailbox_id: mailboxId,
          user_id: userId,
          granted_by: user.id,
          can_send: Boolean(payload.canSend),
        }, { onConflict: 'mailbox_id,user_id' });
        if (error) return jsonResponse({ error: error.message }, 400);
      } else {
        const { error } = await adminClient.from('email_mailbox_access')
          .delete()
          .eq('mailbox_id', mailboxId)
          .eq('user_id', userId);
        if (error) return jsonResponse({ error: error.message }, 400);
      }
      const activityLogWarning = await recordEmailActivity(
        adminClient,
        user,
        action === 'grant'
          ? existingGrant ? 'shared_mailbox_access_updated' : 'shared_mailbox_access_granted'
          : 'shared_mailbox_access_revoked',
        action === 'grant'
          ? existingGrant ? 'Updated staff sending permission for a shared mailbox.' : 'Granted staff access to a shared mailbox.'
          : 'Revoked staff access to a shared mailbox.',
        mailboxId,
        mailbox.email,
        { userId, canSend: action === 'grant' ? Boolean(payload.canSend) : undefined },
      );
      return jsonResponse({ success: true, activityLogWarning });
    }

    if (action === 'retention') {
      const retentionDays = Number(payload.retentionDays);
      if (!Number.isInteger(retentionDays) || retentionDays < 30 || retentionDays > 3650) {
        return jsonResponse({ error: 'Retention must be between 30 and 3650 days.' }, 400);
      }
      const { error } = await adminClient.from('email_settings').upsert({
        id: true,
        retention_days: retentionDays,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
      if (error) return jsonResponse({ error: error.message }, 400);
      const { error: purgeError } = await adminClient.rpc('purge_expired_email');
      if (purgeError) return jsonResponse({ error: `Retention was saved, but expired email could not be purged: ${purgeError.message}` }, 500);
      const activityLogWarning = await recordEmailActivity(
        adminClient,
        user,
        'email_retention_updated',
        `Updated synced email retention to ${retentionDays} days.`,
        'email-settings',
        'Email retention',
        { retentionDays },
      );
      return jsonResponse({ success: true, retentionDays, activityLogWarning });
    }

    if (action === 'disconnect') {
      const mailboxId = typeof payload.mailboxId === 'string' ? payload.mailboxId : '';
      if (!mailboxId) return jsonResponse({ error: 'A mailbox ID is required.' }, 400);
      const { data: mailbox, error: lookupError } = await adminClient.from('email_mailboxes')
        .select('id, provider, email, mailbox_type, graph_subscription_id')
        .eq('id', mailboxId)
        .maybeSingle();
      if (lookupError) return jsonResponse({ error: lookupError.message }, 500);
      if (!mailbox || mailbox.mailbox_type !== 'shared') return jsonResponse({ error: 'Shared mailbox not found.' }, 404);

      let providerWarning = '';
      try {
        const accessToken = await getAccessToken(adminClient, mailbox);
        const stopUrl = mailbox.provider === 'google'
          ? 'https://gmail.googleapis.com/gmail/v1/users/me/stop'
          : mailbox.graph_subscription_id
            ? `https://graph.microsoft.com/v1.0/subscriptions/${encodeURIComponent(mailbox.graph_subscription_id)}`
            : '';
        if (stopUrl) {
          const response = await fetch(stopUrl, {
            method: mailbox.provider === 'google' ? 'POST' : 'DELETE',
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (!response.ok && response.status !== 404) {
            providerWarning = `Provider notification could not be stopped (${response.status}); workspace data was still disconnected.`;
          }
        }
      } catch (error) {
        providerWarning = `Provider notification could not be stopped: ${error instanceof Error ? error.message : 'authorization failed'}. Workspace data was still disconnected.`;
      }
      const { error } = await adminClient.from('email_mailboxes').delete().eq('id', mailboxId);
      if (error) return jsonResponse({ error: error.message }, 400);
      const activityLogWarning = await recordEmailActivity(
        adminClient,
        user,
        'shared_mailbox_disconnected',
        'Disconnected a shared email mailbox.',
        mailboxId,
        mailbox.email,
      );
      return jsonResponse({ success: true, providerWarning, activityLogWarning });
    }

    return jsonResponse({ error: 'Unsupported shared mailbox administration action.' }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Shared mailbox administration failed.';
    return jsonResponse({ error: message }, message === 'Authentication required.' ? 401 : 400);
  }
});
