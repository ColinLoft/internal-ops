import { supabase } from '../../lib/supabase';

type ReplyRequest = { conversationId: string; body: string; idempotencyKey: string };

export async function sendSupportReply(request: ReplyRequest): Promise<{ messageId: string }> {
  const { data, error } = await supabase.functions.invoke('support-send', {
    body: {
      conversationId: request.conversationId,
      body: request.body,
      idempotencyKey: request.idempotencyKey,
    },
  });
  if (error) {
    const response = (error as { context?: Response }).context;
    const detail = response ? await response.clone().json().catch(() => null) as { error?: string } | null : null;
    throw new Error(detail?.error || 'The email could not be confirmed as sent. Check the conversation before retrying.');
  }
  if (data?.success !== true || typeof data.messageId !== 'string') {
    throw new Error(typeof data?.error === 'string' ? data.error : 'The email could not be confirmed as sent. Check the conversation before retrying.');
  }
  return { messageId: data.messageId };
}
