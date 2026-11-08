-- Re-runnable. Apply AFTER the Company Forms, internal bug report, and email
-- workspace migrations. This permanently deletes only the retired scopes below.
begin;

create or replace function public.is_active_company_forms_staff()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and exists (
    select 1 from public.profiles
    where id = auth.uid()::text and account_status = 'active'
  );
$$;
revoke all on function public.is_active_company_forms_staff() from public, anon;
grant execute on function public.is_active_company_forms_staff() to authenticated;

-- INSERT ... RETURNING must authorize the new owner's row without asking a
-- STABLE self-query helper to find that row in the pre-insert statement snapshot.
drop policy if exists "Form collaborators can view company forms" on public.company_forms;
create policy "Form collaborators can view company forms"
  on public.company_forms for select to authenticated
  using (
    public.is_active_company_forms_staff()
    and (owner_id = auth.uid() or public.can_view_company_form(id))
  );
drop policy if exists "Staff can create company forms" on public.company_forms;
create policy "Staff can create company forms"
  on public.company_forms for insert to authenticated
  with check (owner_id = auth.uid() and public.is_active_company_forms_staff());
-- Existing editor-only UPDATE policy, immutable identity trigger, collaborator
-- grants, publication permissions, and response permissions remain unchanged.

lock table public.email_rules, public.email_mailboxes, public.system_activity_logs,
  public.support_tickets in share row exclusive mode;

-- Company Automation exposed rules for SHARED mailboxes only. There is no
-- dedicated execution-history table; its explicit audit events live here.
delete from public.system_activity_logs activity
using public.email_mailboxes mailbox
where activity.target_type = 'email_mailbox'
  and activity.target_id = mailbox.id::text
  and mailbox.mailbox_type = 'shared'
  and activity.event_type in (
    'email_rule_created', 'email_rule_enabled', 'email_rule_disabled', 'email_rule_deleted'
  );
delete from public.email_rules rules
using public.email_mailboxes mailbox
where rules.mailbox_id = mailbox.id and mailbox.mailbox_type = 'shared';

drop policy if exists "Retired shared automation rules are unavailable" on public.email_rules;
create policy "Retired shared automation rules are unavailable"
  on public.email_rules as restrictive for all to authenticated
  using (not exists (
    select 1 from public.email_mailboxes mailbox
    where mailbox.id = mailbox_id and mailbox.mailbox_type = 'shared'
  ))
  with check (not exists (
    select 1 from public.email_mailboxes mailbox
    where mailbox.id = mailbox_id and mailbox.mailbox_type = 'shared'
  ));

-- Durable, service-role-only manifest survives ticket deletion and failed Storage
-- API runs. Never DELETE storage.objects in SQL: it would orphan physical files.
create table if not exists public.retired_internal_bug_screenshot_cleanup (
  bucket_id text not null check (bucket_id = 'bug-report-screenshots'),
  object_name text not null,
  primary key (bucket_id, object_name)
);
alter table public.retired_internal_bug_screenshot_cleanup enable row level security;
revoke all on public.retired_internal_bug_screenshot_cleanup from public, anon, authenticated;
grant select, delete on public.retired_internal_bug_screenshot_cleanup to service_role;

insert into public.retired_internal_bug_screenshot_cleanup (bucket_id, object_name)
select distinct 'bug-report-screenshots', ticket.screenshot_path
from public.support_tickets ticket
join storage.objects object
  on object.bucket_id = 'bug-report-screenshots' and object.name = ticket.screenshot_path
where ticket.internal_only is true and ticket.developer_flag is true and ticket.category = 'bug'
  and ticket.screenshot_path is not null
  and not exists (
    select 1 from public.support_tickets retained
    where retained.screenshot_path = ticket.screenshot_path
      and not (retained.internal_only is true and retained.developer_flag is true and retained.category = 'bug')
  )
on conflict do nothing;

-- All three values are set by the retired submit-bug-report endpoint. Category
-- 'bug' alone, internal IT requests, and customer tickets are NOT deletion scopes.
delete from public.support_tickets
where internal_only is true and developer_flag is true and category = 'bug';
-- support_ticket_comments for these IDs cascade; linked support conversations
-- and Wildfire records survive (their ticket FK is ON DELETE SET NULL).

drop policy if exists "Retired internal bug reports cannot be created" on public.support_tickets;
create policy "Retired internal bug reports cannot be created"
  on public.support_tickets as restrictive for insert to authenticated
  with check (not (internal_only is true and developer_flag is true and category = 'bug'));
drop policy if exists "Retired internal bug reports cannot be restored" on public.support_tickets;
create policy "Retired internal bug reports cannot be restored"
  on public.support_tickets as restrictive for update to authenticated
  using (true)
  with check (not (internal_only is true and developer_flag is true and category = 'bug'));

drop policy if exists "Staff upload bug report screenshots" on storage.objects;
drop policy if exists "Permitted users read bug report screenshots" on storage.objects;
drop policy if exists "Staff delete own bug report screenshots" on storage.objects;

commit;
