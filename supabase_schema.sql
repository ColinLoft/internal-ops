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
  system_role text default 'member' check (system_role in ('admin', 'coordinator', 'member')),
  status text default 'online' check (status in ('online', 'busy', 'away', 'offline')),
  status_message text,
  last_seen text,
  must_reset_password boolean default false,
  temp_password text,
  password_hash text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

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

-- 6. Storage Bucket for Avatars & Profile Pictures
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

-- Storage bucket access policies
create policy "Allow Public Read on Avatars"
  on storage.objects for select
  using ( bucket_id = 'avatars' );

create policy "Allow Public Upload on Avatars"
  on storage.objects for insert
  with check ( bucket_id = 'avatars' );

create policy "Allow Public Update on Avatars"
  on storage.objects for update
  using ( bucket_id = 'avatars' );

-- Enable Row Level Security (RLS) with open read/write for organization staff
alter table public.profiles enable row level security;
alter table public.channels enable row level security;
alter table public.channel_members enable row level security;
alter table public.messages enable row level security;
alter table public.calendar_events enable row level security;

create policy "Enable full access for staff on profiles"
  on public.profiles for all using (true) with check (true);

create policy "Enable full access for staff on channels"
  on public.channels for all using (true) with check (true);

create policy "Enable full access for staff on channel_members"
  on public.channel_members for all using (true) with check (true);

create policy "Enable full access for staff on messages"
  on public.messages for all using (true) with check (true);

create policy "Enable full access for staff on calendar_events"
  on public.calendar_events for all using (true) with check (true);
