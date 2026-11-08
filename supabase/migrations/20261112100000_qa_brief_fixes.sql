-- Flown Ops QA brief fixes: persistent notifications, Admin/Member access, avatar uploads.
-- Safe to re-run.

do $$
begin
  if to_regclass('public.profiles') is null
    or to_regclass('public.messages') is null
    or to_regclass('public.program_tasks') is null
    or to_regclass('public.calendar_events') is null then
    raise exception 'Missing prerequisite tables. Apply earlier Flown Ops migrations first.';
  end if;
end;
$$;

-- 1. Persistent notifications (DMs, mentions, task assignments, calendar invites).
create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('message', 'mention', 'task', 'calendar', 'announcement', 'system')),
  title text not null,
  body text not null default '',
  link_tab text,
  link_path text,
  target_id text,
  actor_id text,
  actor_name text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists user_notifications_user_idx on public.user_notifications (user_id, created_at desc);

alter table public.user_notifications enable row level security;

drop policy if exists "Read own notifications" on public.user_notifications;
create policy "Read own notifications" on public.user_notifications
  for select to authenticated using (user_id = auth.uid()::text);

drop policy if exists "Update own notifications" on public.user_notifications;
create policy "Update own notifications" on public.user_notifications
  for update to authenticated using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);

drop policy if exists "Delete own notifications" on public.user_notifications;
create policy "Delete own notifications" on public.user_notifications
  for delete to authenticated using (user_id = auth.uid()::text);

-- Clients never insert directly; the triggers below run as the table owner.
revoke insert on public.user_notifications from anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_notifications'
  ) then
    alter publication supabase_realtime add table public.user_notifications;
  end if;
exception when undefined_object then null;
end;
$$;

create or replace function public.notify_message_recipients()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_text text := coalesce(new.text, '');
  v_lower text := lower(coalesce(new.text, ''));
  v_preview text := left(regexp_replace(coalesce(new.text, ''), '\s+', ' ', 'g'), 160);
  v_everyone boolean := position('@everyone' in lower(coalesce(new.text, ''))) > 0 or position('@channel' in lower(coalesce(new.text, ''))) > 0;
  v_channel public.channels%rowtype;
begin
  if coalesce(new.is_call_record, false) then return new; end if;
  if v_preview = '' then
    v_preview := case when new.poll is not null then 'Shared a poll' else 'Shared an attachment' end;
  end if;

  select * into v_channel from public.channels where id = new.conversation_id;

  if found then
    -- Channel messages only notify people who were mentioned.
    insert into public.user_notifications (user_id, type, title, body, link_tab, target_id, actor_id, actor_name)
    select p.id, 'mention', new.sender_name || ' mentioned you in #' || v_channel.name, v_preview, 'channels', new.conversation_id, new.sender_id, new.sender_name
    from public.profiles p
    where p.id <> new.sender_id
      and coalesce(p.account_status, 'active') = 'active'
      and (not coalesce(v_channel.is_private, false) or exists (
        select 1 from public.channel_members m where m.channel_id = v_channel.id and m.user_id = p.id
      ))
      and (v_everyone or (coalesce(p.name, '') <> '' and position('@' || lower(p.name) in v_lower) > 0));
    return new;
  end if;

  insert into public.user_notifications (user_id, type, title, body, link_tab, target_id, actor_id, actor_name)
  select cp.user_id,
    case when v_everyone or position('@' || lower(coalesce(p.name, '')) in v_lower) > 0 then 'mention' else 'message' end,
    case when v_everyone or position('@' || lower(coalesce(p.name, '')) in v_lower) > 0
      then new.sender_name || ' mentioned you'
      else 'New message from ' || new.sender_name end,
    v_preview, 'messages', new.conversation_id, new.sender_id, new.sender_name
  from public.conversation_participants cp
  join public.profiles p on p.id = cp.user_id
  where cp.conversation_id = new.conversation_id
    and cp.user_id <> new.sender_id
    and coalesce(p.account_status, 'active') = 'active';
  return new;
end;
$$;

drop trigger if exists notify_message_recipients on public.messages;
create trigger notify_message_recipients after insert on public.messages
  for each row execute function public.notify_message_recipients();

create or replace function public.notify_task_assignees()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text := auth.uid()::text;
  v_actor_name text;
begin
  select name into v_actor_name from public.profiles where id = v_actor;
  insert into public.user_notifications (user_id, type, title, body, link_tab, link_path, target_id, actor_id, actor_name)
  select assigned.id, 'task', 'Assigned to you: ' || new.title,
    case when new.due_date is null then 'No due date' else 'Due ' || to_char(new.due_date, 'Mon FMDD, YYYY') end,
    'programs', '/programs/task/' || new.id::text, new.id::text, v_actor, coalesce(v_actor_name, 'Flown Ops')
  from unnest(coalesce(new.assigned_ids, array[]::text[])) as assigned(id)
  where assigned.id is not null
    and assigned.id is distinct from v_actor
    and (tg_op = 'INSERT' or not (assigned.id = any(coalesce(old.assigned_ids, array[]::text[]))));
  return new;
end;
$$;

drop trigger if exists notify_task_assignees on public.program_tasks;
create trigger notify_task_assignees after insert or update of assigned_ids on public.program_tasks
  for each row execute function public.notify_task_assignees();

create or replace function public.notify_calendar_attendees()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_name text;
begin
  select name into v_actor_name from public.profiles where id = new.created_by;
  insert into public.user_notifications (user_id, type, title, body, link_tab, target_id, actor_id, actor_name)
  select attendee.id, 'calendar', 'Invited: ' || new.title,
    coalesce(v_actor_name, 'A teammate') || ' invited you for ' || new.date || ' at ' || new.start_time,
    'calendar', new.id, new.created_by, v_actor_name
  from unnest(coalesce(new.attendees, array[]::text[])) as attendee(id)
  join public.profiles p on p.id = attendee.id
  where attendee.id <> new.created_by
    and (tg_op = 'INSERT' or not (attendee.id = any(coalesce(old.attendees, array[]::text[]))));
  return new;
end;
$$;

drop trigger if exists notify_calendar_attendees on public.calendar_events;
create trigger notify_calendar_attendees after insert or update of attendees on public.calendar_events
  for each row execute function public.notify_calendar_attendees();

-- 2. Admin / Member access model. Admins manage everything; active Members view and edit day-to-day
-- work and can only view administration, systems, insights, finance and legal. Custom roles are retired.
create or replace function public.app_access_level(p_app text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select case
      when system_role in ('admin', 'coordinator') then 3
      when p_app in ('programs', 'engineering', 'operations', 'customers', 'support', 'wildfire', 'gtm') then 2
      else 1
    end
    from public.profiles
    where id = auth.uid()::text and coalesce(account_status, 'active') = 'active'
  ), 0);
$$;

-- Keep Colin Loftus as the only Admin; everyone else becomes a Member.
do $$
begin
  if exists (select 1 from public.profiles where name = 'Colin Loftus' and system_role = 'admin') then
    update public.profiles
    set system_role = 'member'
    where system_role in ('admin', 'coordinator') and name <> 'Colin Loftus';
  end if;
end;
$$;

-- 3. Profile photos: a public avatars bucket that staff can write to.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public avatar read" on storage.objects;
create policy "Public avatar read" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "Staff upload own avatars" on storage.objects;
create policy "Staff upload own avatars" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Staff update own avatars" on storage.objects;
create policy "Staff update own avatars" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Staff delete own avatars" on storage.objects;
create policy "Staff delete own avatars" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

notify pgrst, 'reload schema';
