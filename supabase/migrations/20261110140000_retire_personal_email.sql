-- Preserve mailbox records, but exclude personal accounts from workspace access.
drop policy if exists "Operational shared mailboxes only" on public.email_mailboxes;
create policy "Operational shared mailboxes only"
on public.email_mailboxes as restrictive for select to authenticated
using (mailbox_type = 'shared');

-- Existing drafts and messages remain stored; pending personal delivery is stopped.
update public.email_scheduled_sends as scheduled
set status = 'cancelled', last_error = 'Personal email has been retired. Send this message from your email provider.'
where scheduled.status in ('scheduled', 'processing')
and exists (
  select 1 from public.email_mailboxes as mailbox
  where mailbox.id = scheduled.mailbox_id and mailbox.mailbox_type = 'personal'
);

notify pgrst, 'reload schema';
