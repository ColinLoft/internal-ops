import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getAccessToken } from './email.ts';
import { supportOutlookPayload, type OutlookMessage } from './outlook-message.ts';

export async function syncOutlookSupport(admin: SupabaseClient, mailbox: {
  id: string; email: string; provider: string; mailbox_type: string; support_started_at: string | null;
}) {
  if (mailbox.provider !== 'microsoft' || mailbox.email !== 'team@flown.org' || !mailbox.support_started_at) return false;
  const token = await getAccessToken(admin, mailbox);
  const base = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox.email)}`;
  const headers = { Authorization: `Bearer ${token}`, Prefer: 'IdType="ImmutableId", outlook.body-content-type="text"' };
  for (const folder of ['inbox', 'sentitems']) {
    let caughtUp = false;
    const leaseId = crypto.randomUUID();
    const { error: initError } = await admin.from('support_outlook_sync')
      .upsert({ mailbox_id: mailbox.id, folder }, { onConflict: 'mailbox_id,folder', ignoreDuplicates: true });
    if (initError) throw new Error(`Outlook sync cursor could not be initialized: ${initError.message}`);
    const { data: state, error: leaseError } = await admin.from('support_outlook_sync')
      .update({ lease_id: leaseId, lease_until: new Date(Date.now() + 180_000).toISOString() })
      .eq('mailbox_id', mailbox.id).eq('folder', folder)
      .or(`lease_until.is.null,lease_until.lt.${new Date().toISOString()}`)
      .select('cursor_url').maybeSingle();
    if (leaseError) throw new Error(`Outlook sync could not be claimed: ${leaseError.message}`);
    if (!state) return false;
    try {
      const initial = new URL(`${base}/mailFolders/${folder}/messages/delta`);
      initial.searchParams.set('$filter', `receivedDateTime ge ${mailbox.support_started_at}`);
      initial.searchParams.set('$select', 'id,conversationId,internetMessageId,subject,from,body,receivedDateTime,sentDateTime,isDraft,internetMessageHeaders,hasAttachments');
      initial.searchParams.set('$top', '50');
      let next = state.cursor_url || initial.toString();
      for (let page = 0; page < 5; page++) {
        const parsed = new URL(next);
        if (parsed.origin !== 'https://graph.microsoft.com' || !parsed.pathname.startsWith('/v1.0/')) throw new Error('Outlook returned an invalid sync cursor.');
        const response = await fetch(next, { headers, signal: AbortSignal.timeout(20_000) });
        if (response.status === 410) {
          const { error } = await admin.from('support_outlook_sync').update({ cursor_url: null })
            .eq('mailbox_id', mailbox.id).eq('folder', folder).eq('lease_id', leaseId);
          if (error) throw new Error(`Expired Outlook cursor could not be reset: ${error.message}`);
          throw new Error('Outlook sync cursor expired. The next sync will safely reconcile messages since connection.');
        }
        const data = await response.json();
        if (!response.ok || !Array.isArray(data.value)) throw new Error(`Outlook support sync failed (HTTP ${response.status}). Check the mailbox connection.`);
        for (const message of data.value as OutlookMessage[]) {
          const payload = supportOutlookPayload(message, mailbox.id, folder === 'sentitems', mailbox.support_started_at);
          if (!payload) continue;
          let attachments: { filename: string; content_type: string; size: number }[] = [];
          if (message.hasAttachments) {
            const attachmentResponse = await fetch(`${base}/messages/${encodeURIComponent(message.id)}/attachments?$select=name,contentType,size,isInline`, { headers, signal: AbortSignal.timeout(15_000) });
            const result = await attachmentResponse.json();
            if (!attachmentResponse.ok || !Array.isArray(result.value)) throw new Error('Outlook attachment details could not be loaded. Sync will retry.');
            attachments = result.value.filter((file: { isInline?: boolean }) => !file.isInline)
              .map((file: { name: string; contentType: string; size: number }) => ({
                filename: file.name, content_type: file.contentType, size: file.size,
              }));
          }
          const { error } = await admin.rpc('support_ingest_outlook_email', { ...payload, p_attachments: attachments });
          if (error) throw new Error(`Outlook email could not be saved to Support: ${error.message}`);
        }
        const cursor = data['@odata.nextLink'] || data['@odata.deltaLink'];
        if (typeof cursor !== 'string') throw new Error('Outlook did not return a continuation cursor. Sync will retry safely.');
        const { data: saved, error: saveError } = await admin.from('support_outlook_sync')
          .update({ cursor_url: cursor, lease_until: new Date(Date.now() + 180_000).toISOString() })
          .eq('mailbox_id', mailbox.id).eq('folder', folder).eq('lease_id', leaseId).select('folder').maybeSingle();
        if (saveError || !saved) throw new Error('Outlook sync progress could not be saved. Sync will retry safely.');
        if (!data['@odata.nextLink']) { caughtUp = true; break; }
        next = cursor;
      }
    } finally {
      const { error } = await admin.from('support_outlook_sync').update({ lease_id: null, lease_until: null })
        .eq('mailbox_id', mailbox.id).eq('folder', folder).eq('lease_id', leaseId);
      if (error) console.error('Outlook sync lease could not be released:', error.message);
    }
    if (!caughtUp) return false;
  }
  return true;
}
