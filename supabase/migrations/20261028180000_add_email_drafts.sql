create table if not exists public.email_drafts (
  id uuid primary key default gen_random_uuid(),
  mailbox_id uuid not null references public.email_mailboxes(id) on delete cascade,
  created_by text not null references public.profiles(id) on delete cascade,
  reply_to_message_id uuid references public.email_messages(id) on delete set null,
  to_recipients text not null default '',
  cc_recipients text not null default '',
  bcc_recipients text not null default '',
  subject text not null default '',
  body_html text not null default '',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists email_drafts_owner_updated_idx
  on public.email_drafts (created_by, mailbox_id, updated_at desc);

alter table public.email_drafts enable row level security;

drop policy if exists "Users can manage their own email drafts" on public.email_drafts;
create policy "Users can manage their own email drafts"
  on public.email_drafts for all to authenticated
  using (
    email_drafts.created_by = auth.uid()::text
    and exists (
      select 1
      from public.email_mailboxes as mailbox
      where mailbox.id = email_drafts.mailbox_id
        and (
          mailbox.connected_by = auth.uid()::text
          or exists (
            select 1 from public.email_mailbox_access as access
            where access.mailbox_id = mailbox.id
              and access.user_id = auth.uid()::text
          )
        )
    )
  )
  with check (
    email_drafts.created_by = auth.uid()::text
    and exists (
      select 1
      from public.email_mailboxes as mailbox
      where mailbox.id = email_drafts.mailbox_id
        and (
          mailbox.connected_by = auth.uid()::text
          or exists (
            select 1 from public.email_mailbox_access as access
            where access.mailbox_id = mailbox.id
              and access.user_id = auth.uid()::text
          )
        )
    )
  );

grant select, insert, update, delete on public.email_drafts to authenticated;
grant all on public.email_drafts to service_role;
