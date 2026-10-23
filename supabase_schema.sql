-- ==============================================================================
-- BEACON NONPROFIT WORKSPACE - SUPABASE DATABASE SCHEMA & STORAGE SETUP
-- ==============================================================================

-- 1. Profiles & Staff Accounts Table
create table if not exists public.profiles (
  id text primary key,
  email text unique not null,
  name text not null,
  role text default 'Staff Specialist',
  department text default 'Operations',
  phone text,
  avatar_url text,
  bio text,
  location text,
  banner text default 'ocean' check (banner in ('ocean', 'violet', 'forest', 'sunset', 'rose')),
  preferences jsonb not null default '{}'::jsonb,
  system_role text default 'member' check (system_role in ('admin', 'coordinator', 'member')),
  status text default 'online' check (status in ('online', 'busy', 'away', 'offline')),
  status_message text,
  last_seen text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists location text;
alter table public.profiles add column if not exists banner text default 'ocean'
  check (banner in ('ocean', 'violet', 'forest', 'sunset', 'rose'));
alter table public.profiles add column if not exists preferences jsonb not null default '{}'::jsonb;

alter table public.profiles drop column if exists must_reset_password;
alter table public.profiles drop column if exists temp_password;
alter table public.profiles drop column if exists password_hash;

delete from public.profiles as profile
where not exists (
  select 1 from auth.users as auth_user where auth_user.id::text = profile.id
);

-- Create a workspace profile for each Supabase Auth user.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name)
  values (
    new.id::text,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do update
    set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();

create or replace function public.prevent_profile_role_change()
returns trigger
language plpgsql
as $$
begin
  if auth.role() = 'authenticated' and new.system_role is distinct from old.system_role then
    raise exception 'Only trusted server operations can change workspace permissions';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_role on public.profiles;
create trigger protect_profile_role
  before update on public.profiles
  for each row execute procedure public.prevent_profile_role_change();

-- 2. Channels Table
create table if not exists public.channels (
  id text primary key,
  name text not null,
  description text,
  type text default 'standard' check (type in ('standard', 'announcement')),
  is_private boolean default false,
  posting_roles text[] default array['admin', 'coordinator', 'member'],
  category text default 'General',
  created_by text references public.profiles(id) on delete set null,
  created_at timestamptz default now()
);

-- 3. Channel Members Mapping
create table if not exists public.channel_members (
  channel_id text references public.channels(id) on delete cascade,
  user_id text references public.profiles(id) on delete cascade,
  joined_at timestamptz default now(),
  primary key (channel_id, user_id)
);

insert into public.channels (id, name, description, type, is_private, posting_roles, category)
values
  ('chan-announcements', 'announcements', 'Official organization announcements and updates. Leadership posts here.', 'announcement', false, array['admin', 'coordinator'], 'General'),
  ('chan-general', 'general', 'Workplace discussion and general collaboration for all staff.', 'standard', false, array['admin', 'coordinator', 'member'], 'General')
on conflict (id) do nothing;

-- 4. Messages Table
create table if not exists public.messages (
  id text primary key,
  conversation_id text not null,
  sender_id text not null,
  sender_name text not null,
  sender_avatar text,
  sender_role text,
  text text default '',
  timestamp text,
  attachments jsonb default '[]'::jsonb,
  poll jsonb,
  reactions jsonb default '[]'::jsonb,
  seen_by text[] default array[]::text[],
  is_call_record boolean default false,
  call_duration text,
  parent_id text,
  created_at timestamptz default now()
);

create index if not exists messages_conversation_created_at_idx
  on public.messages (conversation_id, created_at);
create index if not exists messages_parent_id_idx
  on public.messages (parent_id) where parent_id is not null;

-- 5. Calendar Events Table
create table if not exists public.calendar_events (
  id text primary key,
  title text not null,
  description text,
  date text not null,
  start_time text not null,
  end_time text not null,
  scope text default 'team' check (scope in ('team', 'personal')),
  category text default 'community',
  location text,
  color text,
  created_by text not null,
  created_at timestamptz default now()
);

-- 7. LiveKit call sessions and incoming-call signaling
create table if not exists public.call_sessions (
  id text primary key,
  room_name text not null unique,
  conversation_id text,
  channel_id text references public.channels(id) on delete set null,
  caller_id text not null references public.profiles(id) on delete cascade,
  participant_ids text[] not null,
  declined_by text[] not null default array[]::text[],
  call_type text not null check (call_type in ('audio', 'video')),
  status text not null default 'ringing' check (status in ('ringing', 'active', 'ended')),
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

create index if not exists call_sessions_participants_status_idx
  on public.call_sessions using gin (participant_ids);
create index if not exists call_sessions_status_created_at_idx
  on public.call_sessions (status, created_at desc);

-- 8. Storage Bucket for Avatars & Profile Pictures
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

-- Storage bucket access policies
drop policy if exists "Allow Public Read on Avatars" on storage.objects;
drop policy if exists "Allow Public Upload on Avatars" on storage.objects;
drop policy if exists "Allow Public Update on Avatars" on storage.objects;

create policy "Allow Public Read on Avatars"
  on storage.objects for select
  using ( bucket_id = 'avatars' );

create policy "Allow Public Upload on Avatars"
  on storage.objects for insert
  to authenticated
  with check ( bucket_id = 'avatars' );

create policy "Allow Public Update on Avatars"
  on storage.objects for update
  to authenticated
  using ( bucket_id = 'avatars' );

-- Enable Row Level Security (RLS) with open read/write for organization staff
alter table public.profiles enable row level security;
alter table public.channels enable row level security;
alter table public.channel_members enable row level security;
alter table public.messages enable row level security;
alter table public.calendar_events enable row level security;
alter table public.call_sessions enable row level security;

drop policy if exists "Enable full access for staff on profiles" on public.profiles;
drop policy if exists "Authenticated users can read profiles" on public.profiles;
drop policy if exists "Users can insert their own profile" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;

create policy "Authenticated users can read profiles"
  on public.profiles for select to authenticated using (true);

create policy "Users can insert their own profile"
  on public.profiles for insert to authenticated
  with check (id = auth.uid()::text);

create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using (id = auth.uid()::text)
  with check (id = auth.uid()::text);

drop policy if exists "Enable full access for staff on channels" on public.channels;
drop policy if exists "Enable full access for staff on channel_members" on public.channel_members;
drop policy if exists "Enable full access for staff on messages" on public.messages;
drop policy if exists "Enable full access for staff on calendar_events" on public.calendar_events;

create policy "Enable full access for staff on channels"
  on public.channels for all to authenticated using (true) with check (true);

create policy "Enable full access for staff on channel_members"
  on public.channel_members for all to authenticated using (true) with check (true);

create policy "Enable full access for staff on messages"
  on public.messages for all to authenticated using (true) with check (true);

create policy "Enable full access for staff on calendar_events"
  on public.calendar_events for all to authenticated using (true) with check (true);

drop policy if exists "Call participants can read their calls" on public.call_sessions;
drop policy if exists "Call participants can create calls" on public.call_sessions;
drop policy if exists "Call initiator can update their calls" on public.call_sessions;
create policy "Call participants can read their calls"
  on public.call_sessions for select to authenticated
  using (auth.uid()::text = any(participant_ids));

create policy "Call participants can create calls"
  on public.call_sessions for insert to authenticated
  with check (
    caller_id = auth.uid()::text
    and auth.uid()::text = any(participant_ids)
    and cardinality(participant_ids) between 2 and 8
  );

create policy "Call initiator can update their calls"
  on public.call_sessions for update to authenticated
  using (caller_id = auth.uid()::text)
  with check (caller_id = auth.uid()::text);

grant select, insert, update on public.call_sessions to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'call_sessions'
  ) then
    alter publication supabase_realtime add table public.call_sessions;
  end if;
end;
$$;

notify pgrst, 'reload schema';
