-- Customer support messaging: customers chat from a public page or email; agents answer in the app. Safe to re-run.

create table if not exists public.support_customers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  email text check (email is null or char_length(email) <= 320),
  phone text check (phone is null or char_length(phone) <= 60),
  organization text check (organization is null or char_length(organization) <= 200),
  notes text check (notes is null or char_length(notes) <= 10000),
  crm_contact_id uuid references public.crm_contacts(id) on delete set null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create unique index if not exists support_customers_email_key on public.support_customers (lower(email)) where email is not null;

create table if not exists public.support_conversations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.support_customers(id) on delete cascade,
  subject text not null default 'New conversation' check (char_length(subject) between 1 and 200),
  status text not null default 'open' check (status in ('open', 'pending', 'resolved')),
  channel text not null default 'web' check (channel in ('web', 'email', 'manual')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  assignee_id text references public.profiles(id) on delete set null,
  summary text,
  public_token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  unread_staff integer not null default 0,
  last_message_at timestamptz not null default now(),
  last_message_preview text,
  ticket_id uuid references public.support_tickets(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists support_conversations_status_idx on public.support_conversations (status, last_message_at desc);
create index if not exists support_conversations_customer_idx on public.support_conversations (customer_id);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.support_conversations(id) on delete cascade,
  sender_type text not null check (sender_type in ('customer', 'agent', 'note', 'system')),
  sender_id text references public.profiles(id) on delete set null,
  channel text not null default 'web' check (channel in ('web', 'email', 'manual')),
  body text not null check (char_length(body) between 1 and 10000),
  created_at timestamptz not null default now()
);
create index if not exists support_messages_conversation_idx on public.support_messages (conversation_id, created_at);

alter table public.support_customers enable row level security;
alter table public.support_conversations enable row level security;
alter table public.support_messages enable row level security;

drop policy if exists support_customers_agents on public.support_customers;
create policy support_customers_agents on public.support_customers for all to authenticated
  using (public.is_support_agent()) with check (public.is_support_agent());
drop policy if exists support_conversations_agents on public.support_conversations;
create policy support_conversations_agents on public.support_conversations for all to authenticated
  using (public.is_support_agent()) with check (public.is_support_agent());
drop policy if exists support_messages_agents on public.support_messages;
create policy support_messages_agents on public.support_messages for all to authenticated
  using (public.is_support_agent()) with check (public.is_support_agent());

-- Keep the conversation row current whenever a message arrives.
create or replace function public.support_message_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.support_conversations set
    last_message_at = new.created_at,
    last_message_preview = case when new.sender_type = 'note' then 'Note: ' else '' end || left(new.body, 140),
    unread_staff = case when new.sender_type = 'customer' then unread_staff + 1 else unread_staff end,
    status = case when new.sender_type = 'customer' and status = 'resolved' then 'open' else status end,
    updated_at = now()
  where id = new.conversation_id;
  if new.sender_type = 'customer' then
    update public.support_customers set last_seen_at = now()
    where id = (select customer_id from public.support_conversations where id = new.conversation_id);
  end if;
  return new;
end;
$$;
drop trigger if exists support_messages_after_insert on public.support_messages;
create trigger support_messages_after_insert after insert on public.support_messages for each row execute function public.support_message_after_insert();

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'support_messages') then
    alter publication supabase_realtime add table public.support_messages;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'support_conversations') then
    alter publication supabase_realtime add table public.support_conversations;
  end if;
exception when others then null;
end $$;
