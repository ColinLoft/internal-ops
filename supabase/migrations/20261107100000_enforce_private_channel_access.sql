alter table public.channels enable row level security;
alter table public.channel_members enable row level security;
alter table public.messages enable row level security;

insert into public.channel_members (channel_id, user_id)
select channel.id, channel.created_by
from public.channels channel
join public.profiles profile on profile.id = channel.created_by
where channel.is_private
on conflict (channel_id, user_id) do nothing;

do $$
declare
  existing_policy record;
begin
  for existing_policy in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('channels', 'channel_members', 'messages')
  loop
    execute format('drop policy %I on public.%I', existing_policy.policyname, existing_policy.tablename);
  end loop;
end;
$$;

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
    public.is_channel_member(channel_id, auth.uid()::text)
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

create policy "Participants can read messages"
  on public.messages for select to authenticated
  using (
    exists (
      select 1
      from public.channels channel
      where channel.id = messages.conversation_id
        and (
          not channel.is_private
          or public.is_channel_member(channel.id, auth.uid()::text)
          or public.is_workspace_manager(auth.uid()::text)
        )
    )
    or exists (
      select 1
      from public.conversation_participants participant
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
        select 1
        from public.channels channel
        where channel.id = messages.conversation_id
          and (
            not channel.is_private
            or public.is_channel_member(channel.id, auth.uid()::text)
          )
          and (
            channel.posting_roles is null
            or exists (
              select 1
              from public.profiles profile
              where profile.id = auth.uid()::text
                and profile.system_role = any(channel.posting_roles)
            )
          )
      )
      or exists (
        select 1
        from public.conversation_participants participant
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
