-- Make sure direct and group conversations can be saved and read back after a refresh.
grant select, insert on public.conversation_participants to authenticated;
grant select, insert, update on public.conversations to authenticated;

drop policy if exists "Users can add conversation participants" on public.conversation_participants;
create policy "Users can add conversation participants"
  on public.conversation_participants for insert to authenticated
  with check (
    public.is_conversation_participant(conversation_id, auth.uid()::text)
    or (
      user_id = auth.uid()::text
      and not public.conversation_has_participants(conversation_id)
    )
  );

drop policy if exists "Participants can view conversation membership" on public.conversation_participants;
create policy "Participants can view conversation membership"
  on public.conversation_participants for select to authenticated
  using (public.is_conversation_participant(conversation_id, auth.uid()::text));
