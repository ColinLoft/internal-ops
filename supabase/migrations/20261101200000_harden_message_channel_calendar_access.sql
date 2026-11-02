create table if not exists public.conversation_participants (
  conversation_id text not null,
  user_id text not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create or replace function public.is_conversation_participant(
  p_conversation_id text,
  p_user_id text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversation_participants
    where conversation_id = p_conversation_id
      and user_id = p_user_id
  );
$$;

create or replace function public.conversation_has_participants(p_conversation_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversation_participants
    where conversation_id = p_conversation_id
  );
$$;

create or replace function public.is_channel_member(p_channel_id text, p_user_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.channel_members
    where channel_id = p_channel_id
      and user_id = p_user_id
  );
$$;

create or replace function public.is_channel_owner(p_channel_id text, p_user_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.channels
    where id = p_channel_id
      and created_by = p_user_id
  );
$$;

create or replace function public.is_workspace_manager(p_user_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = p_user_id
      and system_role in ('admin', 'coordinator')
  );
$$;

revoke execute on function public.is_conversation_participant(text, text) from public;
revoke execute on function public.conversation_has_participants(text) from public;
revoke execute on function public.is_channel_member(text, text) from public;
revoke execute on function public.is_channel_owner(text, text) from public;
revoke execute on function public.is_workspace_manager(text) from public;
grant execute on function public.is_conversation_participant(text, text) to authenticated;
grant execute on function public.conversation_has_participants(text) to authenticated;
grant execute on function public.is_channel_member(text, text) to authenticated;
grant execute on function public.is_channel_owner(text, text) to authenticated;
grant execute on function public.is_workspace_manager(text) to authenticated;

alter table public.conversation_participants enable row level security;

drop policy if exists "Participants can view conversation membership" on public.conversation_participants;
drop policy if exists "Users can add conversation participants" on public.conversation_participants;
create policy "Participants can view conversation membership"
  on public.conversation_participants for select to authenticated
  using (
    public.is_conversation_participant(conversation_id, auth.uid()::text)
  );
create policy "Users can add conversation participants"
  on public.conversation_participants for insert to authenticated
  with check (
    public.is_conversation_participant(conversation_id, auth.uid()::text)
    or (
      user_id = auth.uid()::text
      and not public.conversation_has_participants(conversation_id)
    )
  );
grant select, insert on public.conversation_participants to authenticated;

drop policy if exists "Staff can read and create messages as themselves" on public.messages;
drop policy if exists "Staff can create messages as themselves" on public.messages;
drop policy if exists "Staff can update or delete their own messages" on public.messages;
drop policy if exists "Staff can delete their own messages" on public.messages;
drop policy if exists "Enable full access for staff on messages" on public.messages;
create policy "Participants can read messages"
  on public.messages for select to authenticated
  using (
    exists (
      select 1 from public.channels channel
      where channel.id = messages.conversation_id
        and (
          not channel.is_private
          or public.is_channel_member(channel.id, auth.uid()::text)
          or public.is_workspace_manager(auth.uid()::text)
        )
    )
    or exists (
      select 1 from public.conversation_participants participant
      where participant.conversation_id = messages.conversation_id
        and participant.user_id = auth.uid()::text
    )
  );
create policy "Participants can create messages"
  on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid()::text
    and (
      exists (
        select 1 from public.channels channel
        where channel.id = messages.conversation_id
          and (
            (not channel.is_private or public.is_channel_member(channel.id, auth.uid()::text))
              and (channel.posting_roles is null or exists (
                select 1
                from public.profiles profile
                where profile.id = auth.uid()::text
                  and profile.system_role = any(channel.posting_roles)
              ))
          )
      )
      or exists (
        select 1 from public.conversation_participants participant
        where participant.conversation_id = messages.conversation_id
          and participant.user_id = auth.uid()::text
      )
    )
  );
create policy "Authors can update their messages"
  on public.messages for update to authenticated
  using (sender_id = auth.uid()::text)
  with check (sender_id = auth.uid()::text);
create policy "Authors can delete their messages"
  on public.messages for delete to authenticated
  using (sender_id = auth.uid()::text);

drop policy if exists "Enable full access for staff on channels" on public.channels;
drop policy if exists "Enable full access for staff on channel_members" on public.channel_members;
create policy "Staff can view accessible channels"
  on public.channels for select to authenticated
  using (
    not is_private
    or created_by = auth.uid()::text
    or public.is_channel_member(id, auth.uid()::text)
    or public.is_workspace_manager(auth.uid()::text)
  );
create policy "Authorized staff can create channels"
  on public.channels for insert to authenticated
  with check (
    created_by = auth.uid()::text
    and public.is_workspace_manager(auth.uid()::text)
  );
create policy "Channel managers can update channels"
  on public.channels for update to authenticated
  using (
    created_by = auth.uid()::text
    or public.is_workspace_manager(auth.uid()::text)
  )
  with check (
    created_by = auth.uid()::text
    or public.is_workspace_manager(auth.uid()::text)
  );
create policy "Channel managers can delete channels"
  on public.channels for delete to authenticated
  using (
    created_by = auth.uid()::text
    or public.is_workspace_manager(auth.uid()::text)
  );
create policy "Members can view channel membership"
  on public.channel_members for select to authenticated
  using (
    user_id = auth.uid()::text
    or public.is_channel_owner(channel_id, auth.uid()::text)
    or public.is_workspace_manager(auth.uid()::text)
  );
create policy "Channel managers can manage membership"
  on public.channel_members for all to authenticated
  using (
    public.is_channel_owner(channel_id, auth.uid()::text)
    or public.is_workspace_manager(auth.uid()::text)
  )
  with check (
    public.is_channel_owner(channel_id, auth.uid()::text)
    or public.is_workspace_manager(auth.uid()::text)
  );

drop policy if exists "Staff can read calendar events" on public.calendar_events;
drop policy if exists "Enable full access for staff on calendar_events" on public.calendar_events;
create policy "Staff can read authorized calendar events"
  on public.calendar_events for select to authenticated
  using (
    scope <> 'personal'
    or created_by = auth.uid()::text
    or exists (select 1 from public.profiles where id = auth.uid()::text and system_role in ('admin', 'coordinator'))
  );

drop policy if exists "Authenticated users can read message attachments" on storage.objects;
create policy "Authorized users can read message attachments"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'message-attachments'
    and exists (
      select 1
      from public.messages message
      where message.conversation_id = (storage.foldername(name))[2]
        and message.attachments @> jsonb_build_array(jsonb_build_object('storagePath', name))
    )
  );
