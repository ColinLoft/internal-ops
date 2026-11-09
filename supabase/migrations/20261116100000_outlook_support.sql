-- Outlook is the operational sender. Shared-mailbox intake uses durable delta cursors.
alter table public.email_mailboxes
  add column if not exists support_started_at timestamptz,
  add column if not exists support_last_synced_at timestamptz,
  add column if not exists support_sync_error text;

alter table public.support_messages
  add column if not exists outlook_message_id text,
  add column if not exists outlook_mailbox_id uuid references public.email_mailboxes(id) on delete set null;

create table if not exists public.support_outlook_threads (
  mailbox_id uuid not null references public.email_mailboxes(id) on delete cascade,
  thread_id text not null,
  conversation_id uuid not null references public.support_conversations(id) on delete cascade,
  primary key (mailbox_id, thread_id)
);

create table if not exists public.support_outlook_sync (
  mailbox_id uuid not null references public.email_mailboxes(id) on delete cascade,
  folder text not null check (folder in ('inbox', 'sentitems')),
  cursor_url text,
  lease_id uuid,
  lease_until timestamptz,
  primary key (mailbox_id, folder)
);

create table if not exists public.operational_email_deliveries (
  idempotency_key text primary key,
  payload_hash text not null,
  status text not null check (status in ('processing', 'sent', 'failed', 'unknown')),
  mailbox_id uuid not null references public.email_mailboxes(id) on delete restrict,
  draft_id text,
  thread_id text,
  internet_message_id text,
  last_error text,
  updated_at timestamptz not null default now()
);

alter table public.support_outlook_threads enable row level security;
alter table public.support_outlook_sync enable row level security;
alter table public.operational_email_deliveries enable row level security;
revoke all on public.support_outlook_threads, public.support_outlook_sync, public.operational_email_deliveries from anon, authenticated;
grant all on public.support_outlook_threads, public.support_outlook_sync, public.operational_email_deliveries to service_role;

create or replace function public.support_ingest_outlook_email(
  p_mailbox_id uuid, p_thread_id text, p_provider_id text, p_message_id text,
  p_sender text, p_sender_name text, p_subject text, p_body text,
  p_reply_to text, p_references text[], p_received_at timestamptz,
  p_sent boolean, p_attachments jsonb
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_conversation uuid;
  v_token text;
  v_result jsonb;
  v_start timestamptz;
begin
  select support_started_at into v_start from public.email_mailboxes
  where id = p_mailbox_id and provider = 'microsoft' and mailbox_type = 'shared'
    and lower(email) = 'team@flown.org';
  if v_start is null or p_received_at is null or p_received_at < v_start then
    return jsonb_build_object('ignored', true);
  end if;
  if nullif(p_thread_id, '') is null or nullif(p_provider_id, '') is null then
    raise exception 'Outlook message identifiers are missing';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_mailbox_id::text || p_thread_id, 0));
  if exists (select 1 from public.support_messages
    where outlook_mailbox_id = p_mailbox_id and outlook_message_id = p_provider_id)
    or (p_message_id is not null and exists (
      select 1 from public.support_messages where email_message_id = p_message_id
    )) then
    return jsonb_build_object('duplicate', true);
  end if;
  select conversation_id into v_conversation from public.support_outlook_threads
  where mailbox_id = p_mailbox_id and thread_id = p_thread_id;

  if p_sent then
    if exists (select 1 from public.operational_email_deliveries
      where mailbox_id = p_mailbox_id and (draft_id = p_provider_id
        or (p_message_id is not null and internet_message_id = p_message_id)
        or internet_message_id = '<' || p_message_id || '>')) then
      return jsonb_build_object('ignored', true);
    end if;
    -- Unrelated staff mail and contract invitations must never open support tickets.
    if v_conversation is null then return jsonb_build_object('ignored', true); end if;
    insert into public.support_messages(conversation_id, sender_type, channel, body,
      email_message_id, outlook_message_id, outlook_mailbox_id, created_at, email_attachments)
    values (v_conversation, 'agent', 'email', left(p_body, 10000), p_message_id,
      p_provider_id, p_mailbox_id, p_received_at, coalesce(p_attachments, '[]'::jsonb));
  else
    if v_conversation is not null then
      insert into public.support_messages(conversation_id, sender_type, channel, body,
        email_message_id, outlook_message_id, outlook_mailbox_id, created_at, in_reply_to, email_attachments)
      values (v_conversation, 'customer', 'email', left(p_body, 10000), p_message_id,
        p_provider_id, p_mailbox_id, p_received_at, p_reply_to, coalesce(p_attachments, '[]'::jsonb));
    else
      -- Reuse the transactional contact creation, reference matching and ticket intake.
      v_result := public.support_ingest_resend_email(
        'outlook:' || p_mailbox_id::text || ':' || p_provider_id,
        'outlook:' || p_mailbox_id::text || ':' || p_provider_id,
        p_message_id, p_sender, p_sender_name, array['team@flown.org'],
        p_subject, p_body, p_reply_to, p_references, v_token, p_attachments, p_received_at);
      v_conversation := (v_result->>'conversation_id')::uuid;
      update public.support_messages set outlook_message_id = p_provider_id, outlook_mailbox_id = p_mailbox_id
      where email_provider_id = 'outlook:' || p_mailbox_id::text || ':' || p_provider_id;
    end if;
    insert into public.support_outlook_threads(mailbox_id, thread_id, conversation_id)
    values (p_mailbox_id, p_thread_id, v_conversation) on conflict do nothing;
  end if;
  return jsonb_build_object('conversation_id', v_conversation);
end;
$$;
revoke all on function public.support_ingest_outlook_email(uuid,text,text,text,text,text,text,text,text,text[],timestamptz,boolean,jsonb) from public, anon, authenticated;
grant execute on function public.support_ingest_outlook_email(uuid,text,text,text,text,text,text,text,text,text[],timestamptz,boolean,jsonb) to service_role;

alter table public.grants add column if not exists next_action text check (char_length(next_action) <= 500);

-- Delta pages can arrive out of chronological order.
create or replace function public.support_message_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  first_message boolean;
begin
  select not exists (select 1 from public.support_messages
    where conversation_id = new.conversation_id and id <> new.id) into first_message;
  update public.support_conversations set
    last_message_preview = case when first_message or new.created_at >= last_message_at then
      case when new.sender_type = 'note' then 'Note: ' else '' end || left(new.body, 140)
      else last_message_preview end,
    last_message_at = case when first_message then new.created_at else greatest(last_message_at, new.created_at) end,
    unread_staff = case when new.sender_type = 'customer' then unread_staff + 1 else unread_staff end,
    status = case when new.sender_type = 'customer' and status = 'resolved' then 'open' else status end,
    updated_at = now()
  where id = new.conversation_id;
  if new.sender_type = 'customer' then
    update public.support_customers set last_seen_at = greatest(last_seen_at, new.created_at)
    where id = (select customer_id from public.support_conversations where id = new.conversation_id);
  end if;
  return new;
end;
$$;
