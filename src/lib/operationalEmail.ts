import { supabase } from './supabase';

export async function sendOperationalEmail(message: { mailboxId: string; to: string; subject: string; body: string }) {
  if (!message.mailboxId) throw new Error('Choose a shared operational mailbox. Ask an administrator to configure one if none are available.');
  const { data, error } = await supabase.functions.invoke('mail-api', {
    body: { action: 'send', ...message },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  if (data?.success !== true) throw new Error('The email provider did not confirm delivery acceptance.');
}
