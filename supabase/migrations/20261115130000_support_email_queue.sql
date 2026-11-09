-- Email-first support queue, Resend delivery records, webhook deduplication and a legacy-ticket bridge.

alter table public.support_messages
  add column if not exists email_message_id text,
  add column if not exists email_provider_id text,
  add column if not exists in_reply_to text,
  add column if not exists email_attachments jsonb not null default '[]'::jsonb,
  add column if not exists support_outbox_id uuid;

create table if not exists public.support_email_outbox (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.support_conversations(id) on delete cascade,
  idempotency_key uuid not null unique,
  sender_id text not null references public.profiles(id) on delete restrict,
  recipient text not null check (char_length(recipient) between 3 and 320),
  subject text not null check (char_length(subject) between 1 and 200),
  body text not null check (char_length(body) between 1 and 10000),
  status text not null check (status in ('sending', 'sent', 'failed', 'unknown', 'accepted_unrecorded')),
  provider_email_id text unique,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'support_messages_outbox_fk'
      and conrelid = 'public.support_messages'::regclass
  ) then
    alter table public.support_messages
      add constraint support_messages_outbox_fk foreign key (support_outbox_id)
        references public.support_email_outbox(id) on delete set null;
  end if;
end $$;

create unique index if not exists support_messages_outbox_key
  on public.support_messages (support_outbox_id) where support_outbox_id is not null;
create unique index if not exists support_messages_email_message_key
  on public.support_messages (email_message_id) where email_message_id is not null;
create index if not exists support_messages_email_provider_idx
  on public.support_messages (email_provider_id) where email_provider_id is not null;
create index if not exists support_email_outbox_conversation_idx
  on public.support_email_outbox (conversation_id, created_at desc);

create table if not exists public.support_email_events (
  id bigint generated always as identity primary key,
  resend_event_id text not null unique,
  resend_email_id text not null unique,
  message_id text unique,
  status text not null check (status in ('processed')),
  conversation_id uuid references public.support_conversations(id) on delete set null,
  received_at timestamptz not null default now()
);

alter table public.support_email_outbox enable row level security;
alter table public.support_email_events enable row level security;
revoke all on public.support_email_outbox, public.support_email_events from anon, authenticated;
grant all on public.support_email_outbox, public.support_email_events to service_role;
grant usage, select on sequence public.support_email_events_id_seq to service_role;

-- Existing internal tickets stay in their legacy tables, but are also visible in the unified queue.
do $$
declare
  legacy record;
  customer_id uuid;
  conversation_id uuid;
  mapped_status text;
  comment_row record;
begin
  for legacy in
    select ticket.id, ticket.subject, ticket.description, ticket.priority, ticket.status,
           ticket.assignee_id, ticket.organization_name, ticket.requester_id,
           ticket.created_at, ticket.updated_at, profile.name as requester_name,
           profile.email as requester_email
    from public.support_tickets ticket
    join public.profiles profile on profile.id = ticket.requester_id
    where not exists (
      select 1 from public.support_conversations existing where existing.ticket_id = ticket.id
    )
    order by ticket.created_at, ticket.id
  loop
    customer_id := null;
    if legacy.requester_email is not null then
      select customer.id into customer_id
      from public.support_customers customer
      where lower(customer.email) = lower(legacy.requester_email)
      order by customer.created_at
      limit 1;
    end if;

    if customer_id is null then
      insert into public.support_customers(name, email, organization, first_seen_at, last_seen_at)
      values (
        coalesce(nullif(legacy.requester_name, ''), 'Staff requester'),
        nullif(lower(legacy.requester_email), ''),
        legacy.organization_name,
        legacy.created_at,
        legacy.updated_at
      )
      returning id into customer_id;
    else
      update public.support_customers
      set organization = coalesce(organization, legacy.organization_name),
          last_seen_at = greatest(last_seen_at, legacy.updated_at)
      where id = customer_id;
    end if;

    mapped_status := case
      when legacy.status in ('resolved', 'closed') then 'resolved'
      when legacy.status = 'waiting' then 'pending'
      else 'open'
    end;

    insert into public.support_conversations(
      customer_id, subject, status, channel, priority, assignee_id, ticket_id,
      last_message_at, created_at, updated_at
    ) values (
      customer_id,
      coalesce(nullif(left(btrim(legacy.subject), 200), ''), 'Legacy support request'),
      mapped_status,
      'manual',
      legacy.priority,
      legacy.assignee_id,
      legacy.id,
      legacy.updated_at,
      legacy.created_at,
      legacy.updated_at
    ) returning id into conversation_id;

    if nullif(btrim(legacy.description), '') is not null then
      insert into public.support_messages(conversation_id, sender_type, channel, body, created_at)
      values (conversation_id, 'customer', 'manual', left(legacy.description, 10000), legacy.created_at);
    end if;

    for comment_row in
      select author_id, body, is_internal, created_at
      from public.support_ticket_comments
      where ticket_id = legacy.id
      order by created_at, id
    loop
      insert into public.support_messages(conversation_id, sender_type, sender_id, channel, body, created_at)
      values (
        conversation_id,
        case when comment_row.is_internal then 'note' else 'agent' end,
        comment_row.author_id,
        'manual',
        left(comment_row.body, 10000),
        comment_row.created_at
      );
    end loop;

    update public.support_conversations
    set status = mapped_status,
        unread_staff = 0,
        last_message_at = legacy.updated_at,
        updated_at = legacy.updated_at
    where id = conversation_id;
  end loop;
end $$;

create or replace function public.support_ingest_resend_email(
  p_event_id text,
  p_provider_email_id text,
  p_message_id text,
  p_from_email text,
  p_from_name text,
  p_to_addresses text[],
  p_subject text,
  p_body text,
  p_in_reply_to text,
  p_references text[],
  p_conversation_token text,
  p_attachments jsonb,
  p_received_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  event_row_id bigint;
  existing_event public.support_email_events%rowtype;
  v_customer_id uuid;
  v_conversation_id uuid;
  message_ids text[];
  clean_subject text;
begin
  if nullif(btrim(p_event_id), '') is null
     or nullif(btrim(p_provider_email_id), '') is null
     or nullif(lower(btrim(p_from_email)), '') is null
     or lower(btrim(p_from_email)) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or nullif(btrim(p_body), '') is null then
    raise exception 'Invalid received support email payload';
  end if;

  insert into public.support_email_events(resend_event_id, resend_email_id, message_id, status)
  values (p_event_id, p_provider_email_id, nullif(p_message_id, ''), 'processed')
  on conflict do nothing
  returning id into event_row_id;

  if event_row_id is null then
    select * into existing_event
    from public.support_email_events
    where resend_event_id = p_event_id
       or resend_email_id = p_provider_email_id
       or (p_message_id is not null and message_id = p_message_id)
    limit 1
    for update;
    if existing_event.id is not null then
      return jsonb_build_object('duplicate', true, 'conversation_id', existing_event.conversation_id);
    end if;
    raise exception 'Received email could not be claimed for processing';
  end if;

  insert into public.support_customers(name, email, first_seen_at, last_seen_at)
  values (
    coalesce(nullif(left(btrim(p_from_name), 200), ''), lower(btrim(p_from_email))),
    lower(btrim(p_from_email)),
    coalesce(p_received_at, now()),
    coalesce(p_received_at, now())
  )
  on conflict (lower(email)) where email is not null
  do update set
    name = case when excluded.name <> excluded.email then excluded.name else support_customers.name end,
    last_seen_at = greatest(support_customers.last_seen_at, excluded.last_seen_at)
  returning id into v_customer_id;

  if p_conversation_token ~ '^[a-f0-9]{32,96}$' then
    select id into v_conversation_id
    from public.support_conversations
    where public_token = lower(p_conversation_token) and customer_id = v_customer_id
    limit 1;
  end if;

  message_ids := coalesce(p_references, array[]::text[]) || array_remove(array[p_in_reply_to], null);
  if v_conversation_id is null and cardinality(message_ids) > 0 then
    select conversation.id into v_conversation_id
    from public.support_messages message
    join public.support_conversations conversation on conversation.id = message.conversation_id
    where message.email_message_id = any(message_ids)
      and conversation.customer_id = v_customer_id
    order by message.created_at desc
    limit 1;
  end if;

  if v_conversation_id is null then
    clean_subject := coalesce(nullif(left(btrim(regexp_replace(coalesce(p_subject, ''), E'[\\r\\n]+', ' ', 'g')), 200), ''), 'New support email');
    insert into public.support_conversations(customer_id, subject, status, channel, priority)
    values (v_customer_id, clean_subject, 'open', 'email', 'normal')
    returning id into v_conversation_id;
  end if;

  insert into public.support_messages(
    conversation_id, sender_type, channel, body, created_at, email_message_id,
    email_provider_id, in_reply_to, email_attachments
  )
  values (
    v_conversation_id,
    'customer',
    'email',
    left(p_body, 10000),
    coalesce(p_received_at, now()),
    nullif(p_message_id, ''),
    p_provider_email_id,
    nullif(p_in_reply_to, ''),
    case when jsonb_typeof(p_attachments) = 'array' then p_attachments else '[]'::jsonb end
  );

  update public.support_email_events
  set conversation_id = v_conversation_id
  where id = event_row_id;

  return jsonb_build_object('duplicate', false, 'conversation_id', v_conversation_id);
end;
$$;

revoke all on function public.support_ingest_resend_email(text, text, text, text, text, text[], text, text, text, text[], text, jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function public.support_ingest_resend_email(text, text, text, text, text, text[], text, text, text, text[], text, jsonb, timestamptz)
  to service_role;

create or replace function public.support_sync_conversation_to_legacy_ticket()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 or new.ticket_id is null then return new; end if;
  update public.support_tickets
  set subject = new.subject,
      priority = new.priority,
      assignee_id = new.assignee_id,
      status = case new.status when 'pending' then 'waiting' when 'resolved' then 'resolved' else 'open' end
  where id = new.ticket_id
    and (subject is distinct from new.subject
      or priority is distinct from new.priority
      or assignee_id is distinct from new.assignee_id
      or status is distinct from case new.status when 'pending' then 'waiting' when 'resolved' then 'resolved' else 'open' end);
  return new;
end;
$$;

create or replace function public.support_sync_legacy_ticket_to_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 then return new; end if;
  update public.support_conversations
  set subject = new.subject,
      priority = new.priority,
      assignee_id = new.assignee_id,
      status = case
        when new.status in ('resolved', 'closed') then 'resolved'
        when new.status = 'waiting' then 'pending'
        else 'open'
      end
  where ticket_id = new.id
    and (subject is distinct from new.subject
      or priority is distinct from new.priority
      or assignee_id is distinct from new.assignee_id
      or status is distinct from case
        when new.status in ('resolved', 'closed') then 'resolved'
        when new.status = 'waiting' then 'pending'
        else 'open'
      end);
  return new;
end;
$$;

drop trigger if exists support_conversation_sync_legacy_ticket on public.support_conversations;
create trigger support_conversation_sync_legacy_ticket
  after update of subject, status, priority, assignee_id on public.support_conversations
  for each row execute function public.support_sync_conversation_to_legacy_ticket();

drop trigger if exists support_legacy_ticket_sync_conversation on public.support_tickets;
create trigger support_legacy_ticket_sync_conversation
  after update of subject, status, priority, assignee_id on public.support_tickets
  for each row execute function public.support_sync_legacy_ticket_to_conversation();

create or replace function public.support_bridge_legacy_ticket()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requester_name text;
  requester_email text;
  v_customer_id uuid;
  v_conversation_id uuid;
  mapped_status text;
begin
  if exists (select 1 from public.support_conversations where ticket_id = new.id) then return new; end if;
  select name, email into requester_name, requester_email
  from public.profiles
  where id = new.requester_id;

  if requester_email is not null then
    insert into public.support_customers(name, email, organization, first_seen_at, last_seen_at)
    values (
      coalesce(nullif(requester_name, ''), 'Staff requester'),
      lower(requester_email),
      new.organization_name,
      new.created_at,
      new.updated_at
    )
    on conflict (lower(email)) where email is not null
    do update set
      organization = coalesce(support_customers.organization, excluded.organization),
      last_seen_at = greatest(support_customers.last_seen_at, excluded.last_seen_at)
    returning id into v_customer_id;
  else
    insert into public.support_customers(name, email, organization, first_seen_at, last_seen_at)
    values (coalesce(nullif(requester_name, ''), 'Staff requester'), null, new.organization_name, new.created_at, new.updated_at)
    returning id into v_customer_id;
  end if;

  mapped_status := case
    when new.status in ('resolved', 'closed') then 'resolved'
    when new.status = 'waiting' then 'pending'
    else 'open'
  end;
  insert into public.support_conversations(
    customer_id, subject, status, channel, priority, assignee_id, ticket_id,
    last_message_at, created_at, updated_at
  ) values (
    v_customer_id,
    coalesce(nullif(left(btrim(new.subject), 200), ''), 'Legacy support request'),
    mapped_status,
    'manual',
    new.priority,
    new.assignee_id,
    new.id,
    new.created_at,
    new.created_at,
    new.updated_at
  ) returning id into v_conversation_id;

  if nullif(btrim(new.description), '') is not null then
    insert into public.support_messages(conversation_id, sender_type, channel, body, created_at)
    values (v_conversation_id, 'customer', 'manual', left(new.description, 10000), new.created_at);
    update public.support_conversations set status = mapped_status where id = v_conversation_id;
  end if;
  return new;
end;
$$;

create or replace function public.support_bridge_legacy_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation_id uuid;
begin
  if pg_trigger_depth() > 1 then return new; end if;
  select id into v_conversation_id
  from public.support_conversations
  where ticket_id = new.ticket_id
  limit 1;
  if v_conversation_id is not null then
    insert into public.support_messages(conversation_id, sender_type, sender_id, channel, body, created_at)
    values (
      v_conversation_id,
      case when new.is_internal then 'note' else 'agent' end,
      new.author_id,
      'manual',
      left(new.body, 10000),
      new.created_at
    );
  end if;
  return new;
end;
$$;

create or replace function public.support_mirror_agent_message_to_legacy_ticket()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket_id uuid;
begin
  if pg_trigger_depth() > 1 or new.sender_type not in ('agent', 'note') or new.sender_id is null then return new; end if;
  select ticket_id into v_ticket_id
  from public.support_conversations
  where id = new.conversation_id;
  if v_ticket_id is not null then
    insert into public.support_ticket_comments(ticket_id, author_id, body, is_internal, created_at)
    values (v_ticket_id, new.sender_id, left(new.body, 10000), new.sender_type = 'note', new.created_at);
  end if;
  return new;
end;
$$;

drop trigger if exists support_ticket_bridge_to_queue on public.support_tickets;
create trigger support_ticket_bridge_to_queue
  after insert on public.support_tickets
  for each row execute function public.support_bridge_legacy_ticket();

drop trigger if exists support_ticket_comment_bridge_to_queue on public.support_ticket_comments;
create trigger support_ticket_comment_bridge_to_queue
  after insert on public.support_ticket_comments
  for each row execute function public.support_bridge_legacy_comment();

drop trigger if exists support_agent_message_mirror_to_legacy_ticket on public.support_messages;
create trigger support_agent_message_mirror_to_legacy_ticket
  after insert on public.support_messages
  for each row execute function public.support_mirror_agent_message_to_legacy_ticket();
