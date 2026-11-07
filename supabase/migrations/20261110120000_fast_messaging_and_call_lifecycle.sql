create or replace function public.mark_messages_seen(p_conversation_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id text := auth.uid()::text;
begin
  if current_user_id is null then
    raise exception 'Authentication is required to mark messages as seen.';
  end if;

  if not exists (
    select 1
    from public.channels channel
    where channel.id = p_conversation_id
      and (
        not channel.is_private
        or public.is_channel_member(channel.id, current_user_id)
        or public.is_workspace_manager(current_user_id)
      )
  ) and not exists (
    select 1
    from public.conversation_participants participant
    where participant.conversation_id = p_conversation_id
      and participant.user_id = current_user_id
  ) then
    raise exception 'You are not a participant in this conversation.';
  end if;

  update public.messages
  set seen_by = array_append(coalesce(seen_by, array[]::text[]), current_user_id)
  where conversation_id = p_conversation_id
    and sender_id <> current_user_id
    and not (current_user_id = any(coalesce(seen_by, array[]::text[])));
end;
$$;

create or replace function public.end_call_session(p_session_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id text := auth.uid()::text;
begin
  if current_user_id is null then
    raise exception 'Authentication is required to end a call.';
  end if;

  if not exists (
    select 1
    from public.call_sessions
    where id = p_session_id
      and current_user_id = any(participant_ids)
  ) then
    raise exception 'You are not a participant in this call.';
  end if;

  update public.call_sessions
  set status = 'ended',
      ended_at = coalesce(ended_at, now())
  where id = p_session_id
    and status <> 'ended';
end;
$$;

revoke all on function public.mark_messages_seen(text) from public;
revoke all on function public.end_call_session(text) from public;
grant execute on function public.mark_messages_seen(text) to authenticated;
grant execute on function public.end_call_session(text) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end;
$$;

notify pgrst, 'reload schema';
