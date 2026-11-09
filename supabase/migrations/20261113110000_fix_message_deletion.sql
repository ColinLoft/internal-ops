-- Standalone repair for delete_own_message missing from the API schema cache.
-- Run this entire file in the same Supabase project used by Flown Ops.
-- Safe to re-run; no Wildfire migration is required.
begin;

alter table public.messages
  add column if not exists deleted_at timestamptz,
  add column if not exists reactions jsonb not null default '[]'::jsonb;

create or replace function public.delete_own_message(p_message_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid text := auth.uid()::text;
  msg record;
begin
  if uid is null then raise exception 'Sign in to delete messages.'; end if;
  select id, sender_id into msg from public.messages where id::text = p_message_id for update;
  if not found then raise exception 'Message not found.'; end if;
  if msg.sender_id::text <> uid then
    raise exception 'You can only delete your own messages.' using errcode = '42501';
  end if;
  update public.messages
  set text = '', attachments = '[]'::jsonb, poll = null, reactions = '[]'::jsonb, deleted_at = coalesce(deleted_at, now())
  where id = msg.id;
end;
$$;

revoke all on function public.delete_own_message(text) from public, anon;
grant execute on function public.delete_own_message(text) to authenticated;

notify pgrst, 'reload schema';
commit;

-- This should return true after the repair.
select to_regprocedure('public.delete_own_message(text)') is not null
  as message_deletion_installed;
