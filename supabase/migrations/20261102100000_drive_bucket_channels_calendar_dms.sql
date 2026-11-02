-- Drive storage bucket (fixes "bucket not found" on upload).
insert into storage.buckets (id, name, public)
values ('drive-files', 'drive-files', false)
on conflict (id) do nothing;

drop policy if exists "Drive files are readable by collaborators" on storage.objects;
create policy "Drive files are readable by collaborators"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'drive-files'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1
        from public.drive_items
        join public.drive_shares on drive_shares.item_id = drive_items.id
        where drive_items.storage_path = storage.objects.name
          and drive_shares.shared_with_user_id = auth.uid()
      )
    )
  );

drop policy if exists "Users can upload their drive files" on storage.objects;
create policy "Users can upload their drive files"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'drive-files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can delete their drive files" on storage.objects;
create policy "Users can delete their drive files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'drive-files' and (storage.foldername(name))[1] = auth.uid()::text);

-- Channel images.
alter table public.channels add column if not exists image_url text;

-- Calendar: team sharing, scheduled calls and recurring series.
alter table public.calendar_events add column if not exists team_ids text[] not null default '{}';
alter table public.calendar_events add column if not exists attendees text[] not null default '{}';
alter table public.calendar_events add column if not exists is_call boolean not null default false;
alter table public.calendar_events add column if not exists recurrence_id text;

drop policy if exists "Staff can read authorized calendar events" on public.calendar_events;
create policy "Staff can read authorized calendar events"
  on public.calendar_events for select to authenticated
  using (
    created_by = auth.uid()::text
    or public.is_workspace_manager(auth.uid()::text)
    or (
      scope <> 'personal'
      and (
        coalesce(cardinality(team_ids), 0) = 0
        or exists (
          select 1 from public.profiles profile
          where profile.id = auth.uid()::text
            and profile.department = any(calendar_events.team_ids)
        )
      )
    )
  );

-- Conversation details so direct and group messages persist across sessions.
create table if not exists public.conversations (
  id text primary key,
  type text not null default 'direct' check (type in ('direct', 'group')),
  name text,
  created_by text references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.conversations enable row level security;

drop policy if exists "Participants can read conversations" on public.conversations;
create policy "Participants can read conversations"
  on public.conversations for select to authenticated
  using (public.is_conversation_participant(id, auth.uid()::text) or created_by = auth.uid()::text);

drop policy if exists "Users can create conversations" on public.conversations;
create policy "Users can create conversations"
  on public.conversations for insert to authenticated
  with check (created_by = auth.uid()::text);

drop policy if exists "Creators can update conversations" on public.conversations;
create policy "Creators can update conversations"
  on public.conversations for update to authenticated
  using (created_by = auth.uid()::text)
  with check (created_by = auth.uid()::text);

grant select, insert, update on public.conversations to authenticated;
