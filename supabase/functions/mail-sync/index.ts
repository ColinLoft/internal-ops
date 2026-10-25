import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { clientsFor, emailCorsHeaders, hasMailboxAccess, jsonResponse, recordEmailActivity, syncMailbox } from '../_shared/email.ts';

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: emailCorsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'A mailbox ID is required.' }, 400);
  }
  const mailboxId = typeof payload.mailboxId === 'string' ? payload.mailboxId : '';
  if (!mailboxId) return jsonResponse({ error: 'A mailbox ID is required.' }, 400);

  try {
    const webhookKey = Deno.env.get('MAIL_WEBHOOK_SHARED_SECRET');
    const internalKey = request.headers.get('x-mail-webhook-secret');
    let adminClient;
    let callerUser: Awaited<ReturnType<typeof clientsFor>>['user'] | null = null;

    if (webhookKey && internalKey === webhookKey) {
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      if (!serviceRoleKey || !supabaseUrl) throw new Error('Email service is missing Supabase configuration.');
      adminClient = createClient(supabaseUrl, serviceRoleKey);
    } else {
      const clients = await clientsFor(request);
      adminClient = clients.adminClient;
      callerUser = clients.user;
    }

    const { data: mailbox, error: mailboxError } = await adminClient
      .from('email_mailboxes')
      .select('*')
      .eq('id', mailboxId)
      .maybeSingle();
    if (mailboxError) throw new Error(`Mailbox could not be loaded: ${mailboxError.message}`);
    if (!mailbox) return jsonResponse({ error: 'Mailbox not found.' }, 404);
    if (callerUser) await hasMailboxAccess(adminClient, callerUser, mailboxId);

    const messageIds = Array.isArray(payload.messageIds)
      ? payload.messageIds.filter((value): value is string => typeof value === 'string').slice(0, 100)
      : undefined;
    const historyId = typeof payload.historyId === 'string' ? payload.historyId : undefined;
    const result = await syncMailbox(adminClient, mailbox, messageIds, historyId);
    const activityLogWarning = await recordEmailActivity(
      adminClient,
      callerUser,
      'email_mailbox_synced',
      `Synced ${result.synced} email messages.`,
      mailboxId,
      mailbox.email,
      { syncedCount: result.synced },
    );
    if (activityLogWarning && !callerUser) console.error(activityLogWarning);
    return jsonResponse({ success: true, ...result, activityLogWarning });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Mailbox sync failed.' }, 400);
  }
});
