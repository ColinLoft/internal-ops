create table if not exists public.email_mailboxes (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('microsoft', 'google')),
  mailbox_type text not null check (mailbox_type in ('personal', 'shared')),
  email text not null,
  display_name text not null default '',
  provider_user_id text not null,
  connected_by text not null references public.profiles(id) on delete cascade,
  google_history_id text,
  graph_subscription_id text,
  graph_client_state text,
  push_expires_at timestamptz,
  push_error text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, email, mailbox_type)
);

create table if not exists public.email_mailbox_tokens (
  mailbox_id uuid primary key references public.email_mailboxes(id) on delete cascade,
  encrypted_tokens text not null,
  encryption_iv text not null,
  access_expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.email_oauth_states (
  state_hash text primary key,
  user_id text not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('microsoft', 'google')),
  mailbox_type text not null check (mailbox_type in ('personal', 'shared')),
  target_email text,
  code_verifier text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists email_oauth_states_expires_at_idx
  on public.email_oauth_states (expires_at);

create table if not exists public.email_mailbox_access (
  mailbox_id uuid not null references public.email_mailboxes(id) on delete cascade,
  user_id text not null references public.profiles(id) on delete cascade,
  granted_by text references public.profiles(id) on delete set null,
  can_send boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (mailbox_id, user_id)
);

create index if not exists email_mailbox_access_user_idx
  on public.email_mailbox_access (user_id, mailbox_id);

create table if not exists public.email_messages (
  id uuid primary key default gen_random_uuid(),
  mailbox_id uuid not null references public.email_mailboxes(id) on delete cascade,
  provider_message_id text not null,
  provider_thread_id text,
  folder text not null default 'inbox',
  subject text not null default '',
  sender_name text not null default '',
  sender_email text not null default '',
  to_recipients jsonb not null default '[]'::jsonb,
  cc_recipients jsonb not null default '[]'::jsonb,
  body_text text not null default '',
  snippet text not null default '',
  received_at timestamptz not null,
  is_read boolean not null default false,
  is_starred boolean not null default false,
  has_attachments boolean not null default false,
  labels text[] not null default array[]::text[],
  search_vector tsvector generated always as (
    to_tsvector(
      'simple',
      coalesce(subject, '') || ' ' || coalesce(sender_name, '') || ' ' ||
      coalesce(sender_email, '') || ' ' || coalesce(snippet, '') || ' ' ||
      coalesce(body_text, '')
    )
  ) stored,
  expires_at timestamptz not null default now() + interval '365 days',
  synced_at timestamptz not null default now(),
  unique (mailbox_id, provider_message_id)
);

create index if not exists email_messages_mailbox_folder_received_idx
  on public.email_messages (mailbox_id, folder, received_at desc);
create index if not exists email_messages_mailbox_unread_idx
  on public.email_messages (mailbox_id, received_at desc)
  where is_read = false;
create index if not exists email_messages_search_idx
  on public.email_messages using gin (search_vector);
create index if not exists email_messages_expiration_idx
  on public.email_messages (expires_at);

create table if not exists public.email_ai_artifacts (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.email_messages(id) on delete cascade,
  mailbox_id uuid not null references public.email_mailboxes(id) on delete cascade,
  created_by text not null references public.profiles(id) on delete cascade,
  artifact_type text not null check (artifact_type in ('summary', 'draft')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists email_ai_artifacts_mailbox_created_idx
  on public.email_ai_artifacts (mailbox_id, created_at desc);

create table if not exists public.email_rules (
  id uuid primary key default gen_random_uuid(),
  mailbox_id uuid not null references public.email_mailboxes(id) on delete cascade,
  created_by text not null references public.profiles(id) on delete cascade,
  name text not null,
  sender_contains text,
  subject_contains text,
  action text not null check (action in ('label', 'mark_read', 'archive')),
  action_value text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  check (nullif(trim(sender_contains), '') is not null or nullif(trim(subject_contains), '') is not null),
  check (action <> 'label' or nullif(trim(action_value), '') is not null)
);

create table if not exists public.email_settings (
  id boolean primary key default true check (id),
  retention_days integer not null default 365 check (retention_days between 30 and 3650),
  updated_by text references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.email_settings (id, retention_days)
values (true, 365)
on conflict (id) do nothing;

alter table public.email_mailboxes enable row level security;
alter table public.email_mailbox_tokens enable row level security;
alter table public.email_oauth_states enable row level security;
alter table public.email_mailbox_access enable row level security;
alter table public.email_messages enable row level security;
alter table public.email_ai_artifacts enable row level security;
alter table public.email_rules enable row level security;
alter table public.email_settings enable row level security;

drop policy if exists "Users can view mailboxes they can access" on public.email_mailboxes;
create policy "Users can view mailboxes they can access"
  on public.email_mailboxes for select to authenticated
  using (
    connected_by = auth.uid()::text
    or exists (
      select 1 from public.email_mailbox_access as access
      where access.mailbox_id = id and access.user_id = auth.uid()::text
    )
  );

drop policy if exists "Users can view their mailbox grants" on public.email_mailbox_access;
create policy "Users can view their mailbox grants"
  on public.email_mailbox_access for select to authenticated
  using (
    user_id = auth.uid()::text
    or exists (
      select 1 from public.profiles as profile
      where profile.id = auth.uid()::text and profile.system_role = 'admin'
    )
  );

drop policy if exists "Users can read messages in accessible mailboxes" on public.email_messages;
create policy "Users can read messages in accessible mailboxes"
  on public.email_messages for select to authenticated
  using (
    exists (
      select 1 from public.email_mailboxes as mailbox
      where mailbox.id = mailbox_id
        and (
          mailbox.connected_by = auth.uid()::text
          or exists (
            select 1 from public.email_mailbox_access as access
            where access.mailbox_id = mailbox.id and access.user_id = auth.uid()::text
          )
        )
    )
  );

drop policy if exists "Users can read AI artifacts in accessible mailboxes" on public.email_ai_artifacts;
create policy "Users can read AI artifacts in accessible mailboxes"
  on public.email_ai_artifacts for select to authenticated
  using (
    exists (
      select 1 from public.email_mailboxes as mailbox
      where mailbox.id = mailbox_id
        and (
          mailbox.connected_by = auth.uid()::text
          or exists (
            select 1 from public.email_mailbox_access as access
            where access.mailbox_id = mailbox.id and access.user_id = auth.uid()::text
          )
        )
    )
  );

drop policy if exists "Users can manage their own mail rules" on public.email_rules;
create policy "Users can manage their own mail rules"
  on public.email_rules for all to authenticated
  using (
    created_by = auth.uid()::text
    and exists (
      select 1 from public.email_mailboxes as mailbox
      where mailbox.id = mailbox_id
        and mailbox.connected_by = auth.uid()::text
    )
  )
  with check (
    created_by = auth.uid()::text
    and exists (
      select 1 from public.email_mailboxes as mailbox
      where mailbox.id = mailbox_id
        and mailbox.connected_by = auth.uid()::text
    )
  );

revoke all on public.email_mailbox_tokens, public.email_oauth_states from anon, authenticated;
revoke insert, update, delete on public.email_mailboxes, public.email_mailbox_access,
  public.email_messages, public.email_ai_artifacts, public.email_settings
  from anon, authenticated;
grant select on public.email_mailboxes, public.email_mailbox_access, public.email_messages,
  public.email_ai_artifacts to authenticated;
grant select, insert, update, delete on public.email_rules to authenticated;
grant all on public.email_mailboxes, public.email_mailbox_tokens, public.email_oauth_states,
  public.email_mailbox_access, public.email_messages, public.email_ai_artifacts,
  public.email_rules, public.email_settings to service_role;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'email_messages'
  ) then
    alter publication supabase_realtime add table public.email_messages;
  end if;
end;
$$;

create or replace function public.purge_expired_email()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count bigint;
begin
  delete from public.email_messages
  where received_at < now() - (
    select make_interval(days => retention_days)
    from public.email_settings
    where id = true
  );
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.purge_expired_email() from public, anon, authenticated;
grant execute on function public.purge_expired_email() to service_role;
