create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 120),
  subject text not null default '',
  body_html text not null default '',
  created_by text not null references public.profiles(id) on delete cascade,
  is_shared boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists email_templates_shared_created_idx
  on public.email_templates (is_shared, name);

alter table public.email_templates enable row level security;

drop policy if exists "Users can read available email templates" on public.email_templates;
create policy "Users can read available email templates"
  on public.email_templates for select to authenticated
  using (
    created_by = auth.uid()::text
    or is_shared
  );

drop policy if exists "Users can create personal email templates" on public.email_templates;
create policy "Users can create personal email templates"
  on public.email_templates for insert to authenticated
  with check (
    created_by = auth.uid()::text
    and (
      not is_shared
      or exists (
        select 1 from public.profiles
        where id = auth.uid()::text and system_role = 'admin'
      )
    )
  );

drop policy if exists "Users can update their email templates" on public.email_templates;
create policy "Users can update their email templates"
  on public.email_templates for update to authenticated
  using (
    created_by = auth.uid()::text
    and (
      not is_shared
      or exists (
        select 1 from public.profiles
        where id = auth.uid()::text and system_role = 'admin'
      )
    )
  )
  with check (
    created_by = auth.uid()::text
    and (
      not is_shared
      or exists (
        select 1 from public.profiles
        where id = auth.uid()::text and system_role = 'admin'
      )
    )
  );

drop policy if exists "Users can delete their email templates" on public.email_templates;
create policy "Users can delete their email templates"
  on public.email_templates for delete to authenticated
  using (
    created_by = auth.uid()::text
    and (
      not is_shared
      or exists (
        select 1 from public.profiles
        where id = auth.uid()::text and system_role = 'admin'
      )
    )
  );

create table if not exists public.email_scheduled_sends (
  id uuid primary key default gen_random_uuid(),
  mailbox_id uuid not null references public.email_mailboxes(id) on delete cascade,
  created_by text not null references public.profiles(id) on delete cascade,
  action text not null check (action in ('send', 'reply')),
  reply_message_id uuid references public.email_messages(id) on delete set null,
  to_recipients text[] not null default array[]::text[],
  cc_recipients text[] not null default array[]::text[],
  bcc_recipients text[] not null default array[]::text[],
  subject text not null,
  body_html text not null,
  attachments jsonb not null default '[]'::jsonb,
  scheduled_at timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'processing', 'sent', 'failed', 'cancelled')),
  processing_started_at timestamptz,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists email_scheduled_sends_due_idx
  on public.email_scheduled_sends (scheduled_at)
  where status = 'scheduled';
create index if not exists email_scheduled_sends_owner_idx
  on public.email_scheduled_sends (created_by, scheduled_at desc);

alter table public.email_scheduled_sends enable row level security;

drop policy if exists "Users can view their scheduled email" on public.email_scheduled_sends;
create policy "Users can view their scheduled email"
  on public.email_scheduled_sends for select to authenticated
  using (created_by = auth.uid()::text);

drop policy if exists "Users can cancel their scheduled email" on public.email_scheduled_sends;
create policy "Users can cancel their scheduled email"
  on public.email_scheduled_sends for update to authenticated
  using (created_by = auth.uid()::text and status = 'scheduled')
  with check (created_by = auth.uid()::text and status = 'cancelled');

revoke all on public.email_templates, public.email_scheduled_sends from anon;
grant select, insert, update, delete on public.email_templates to authenticated;
grant select, update on public.email_scheduled_sends to authenticated;
grant all on public.email_templates, public.email_scheduled_sends to service_role;

insert into storage.buckets (id, name, public, file_size_limit)
values ('channel-attachments', 'channel-attachments', false, 20971520)
on conflict (id) do update set public = false, file_size_limit = 20971520;

drop policy if exists "Channel members can read channel attachments" on storage.objects;
create policy "Channel members can read channel attachments"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'channel-attachments'
    and exists (
      select 1
      from public.channels as channel
      where channel.id = (storage.foldername(name))[1]
        and (
          not channel.is_private
          or exists (
            select 1 from public.channel_members as member
            where member.channel_id = channel.id
              and member.user_id = auth.uid()::text
          )
        )
    )
  );

drop policy if exists "Channel members can upload channel attachments" on storage.objects;
create policy "Channel members can upload channel attachments"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'channel-attachments'
    and exists (
      select 1
      from public.channels as channel
      join public.profiles as profile on profile.id = auth.uid()::text
      where channel.id = (storage.foldername(name))[1]
        and (
          not channel.is_private
          or exists (
            select 1 from public.channel_members as member
            where member.channel_id = channel.id
              and member.user_id = auth.uid()::text
          )
        )
        and profile.system_role = any(channel.posting_roles)
    )
  );
