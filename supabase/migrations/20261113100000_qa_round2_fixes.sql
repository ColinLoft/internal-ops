-- QA round 2. Re-runnable. Apply after 20261111100000_wildfire_workflow.sql and 20261112100000_qa_brief_fixes.sql.

do $$
declare
  missing text;
begin
  foreach missing in array array['profiles', 'messages', 'company_forms', 'entity_activity', 'support_tickets', 'wildfire_site_plans'] loop
    if to_regclass('public.' || missing) is null then
      raise exception 'Missing prerequisite table: public.%. Apply earlier workspace migrations first.', missing;
    end if;
  end loop;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'wildfire_quotes' and column_name = 'proposal'
  ) then
    raise exception 'Wildfire workflow update is missing. Run supabase/flown_qa_round2_update_all.sql (the whole file) instead of this migration.';
  end if;
end;
$$;

begin;

-- 1. Members edit everything except Organization administration; admins manage everything.
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
      when p_app = 'organization' then 1
      else 2
    end
    from public.profiles
    where id = auth.uid()::text and coalesce(account_status, 'active') = 'active'
  ), 0);
$$;

-- 2. Forms: a profile with no explicit status is active, so members can create forms.
create or replace function public.is_active_company_forms_staff()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and exists (
    select 1 from public.profiles
    where id = auth.uid()::text and coalesce(account_status, 'active') = 'active'
  );
$$;
revoke all on function public.is_active_company_forms_staff() from public, anon;
grant execute on function public.is_active_company_forms_staff() to authenticated;

drop policy if exists "Form collaborators can view company forms" on public.company_forms;
create policy "Form collaborators can view company forms"
  on public.company_forms for select to authenticated
  using (
    public.is_active_company_forms_staff()
    and (owner_id = auth.uid() or public.can_view_company_form(id))
  );
drop policy if exists "Staff can create company forms" on public.company_forms;
create policy "Staff can create company forms"
  on public.company_forms for insert to authenticated
  with check (owner_id = auth.uid() and public.is_active_company_forms_staff());

create or replace function public.wildfire_require_edit()
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_app_access('wildfire', 'edit') or not exists (
    select 1 from public.profiles where id = auth.uid()::text and coalesce(account_status, 'active') = 'active'
  ) then raise exception 'Active Wildfire editor access required.' using errcode = '42501'; end if;
end $$;
revoke all on function public.wildfire_require_edit() from public, anon;
grant execute on function public.wildfire_require_edit() to authenticated;

-- 3. Poll votes and reactions. Only authors may update messages directly, so voting and
-- reacting go through narrow functions that change one user's own entry.
alter table public.messages add column if not exists reactions jsonb not null default '[]'::jsonb;

create or replace function public.can_access_conversation(p_conversation_id text, p_user_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.channels channel
    where channel.id = p_conversation_id
      and (not channel.is_private or public.is_channel_member(channel.id, p_user_id) or public.is_workspace_manager(p_user_id))
  ) or exists (
    select 1 from public.conversation_participants participant
    where participant.conversation_id = p_conversation_id and participant.user_id = p_user_id
  );
$$;
revoke all on function public.can_access_conversation(text, text) from public, anon;
grant execute on function public.can_access_conversation(text, text) to authenticated;

create or replace function public.vote_message_poll(p_message_id text, p_option_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid text := auth.uid()::text;
  msg record;
  next_poll jsonb;
  next_options jsonb := '[]'::jsonb;
  opt jsonb;
  voters jsonb;
  had_vote boolean;
  total integer := 0;
begin
  if uid is null then raise exception 'Sign in to vote.'; end if;
  select id, conversation_id, poll into msg from public.messages where id::text = p_message_id for update;
  if not found or msg.poll is null then raise exception 'Poll not found.'; end if;
  if not public.can_access_conversation(msg.conversation_id::text, uid) then
    raise exception 'You are not a participant in this conversation.' using errcode = '42501';
  end if;
  next_poll := msg.poll;
  if coalesce((next_poll ->> 'isClosed')::boolean, false) then raise exception 'This poll is closed.'; end if;
  if not exists (select 1 from jsonb_array_elements(next_poll -> 'options') o where o ->> 'id' = p_option_id) then
    raise exception 'That poll option no longer exists.';
  end if;

  select exists (
    select 1 from jsonb_array_elements(next_poll -> 'options') o, jsonb_array_elements_text(coalesce(o -> 'votes', '[]'::jsonb)) v
    where o ->> 'id' = p_option_id and v = uid
  ) into had_vote;

  for opt in select value from jsonb_array_elements(next_poll -> 'options') loop
    select coalesce(jsonb_agg(v), '[]'::jsonb) into voters
    from jsonb_array_elements_text(coalesce(opt -> 'votes', '[]'::jsonb)) v
    where v <> uid;
    if opt ->> 'id' = p_option_id and not had_vote then
      voters := voters || to_jsonb(uid);
    end if;
    total := total + jsonb_array_length(voters);
    next_options := next_options || jsonb_build_array(jsonb_set(opt, '{votes}', voters));
  end loop;

  next_poll := jsonb_set(jsonb_set(next_poll, '{options}', next_options), '{totalVotes}', to_jsonb(total));
  update public.messages set poll = next_poll where id = msg.id;
  return next_poll;
end;
$$;
revoke all on function public.vote_message_poll(text, text) from public, anon;
grant execute on function public.vote_message_poll(text, text) to authenticated;

create or replace function public.toggle_message_reaction(p_message_id text, p_emoji text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid text := auth.uid()::text;
  msg record;
  existing jsonb;
  result jsonb := '[]'::jsonb;
  item jsonb;
  reactors jsonb;
  found_emoji boolean := false;
begin
  if uid is null then raise exception 'Sign in to react.'; end if;
  if p_emoji is null or char_length(p_emoji) = 0 or char_length(p_emoji) > 16 then raise exception 'Invalid reaction.'; end if;
  select id, conversation_id, reactions into msg from public.messages where id::text = p_message_id for update;
  if not found then raise exception 'Message not found.'; end if;
  if not public.can_access_conversation(msg.conversation_id::text, uid) then
    raise exception 'You are not a participant in this conversation.' using errcode = '42501';
  end if;
  existing := case when jsonb_typeof(msg.reactions) = 'array' then msg.reactions else '[]'::jsonb end;

  for item in select value from jsonb_array_elements(existing) loop
    reactors := coalesce(item -> 'users', '[]'::jsonb);
    if item ->> 'emoji' = p_emoji then
      found_emoji := true;
      if reactors ? uid then
        select coalesce(jsonb_agg(v), '[]'::jsonb) into reactors from jsonb_array_elements_text(reactors) v where v <> uid;
      else
        reactors := reactors || to_jsonb(uid);
      end if;
    end if;
    if jsonb_array_length(reactors) > 0 then
      result := result || jsonb_build_array(jsonb_build_object('emoji', item ->> 'emoji', 'users', reactors));
    end if;
  end loop;
  if not found_emoji then
    result := result || jsonb_build_array(jsonb_build_object('emoji', p_emoji, 'users', jsonb_build_array(uid)));
  end if;

  update public.messages set reactions = result where id = msg.id;
  return result;
end;
$$;
revoke all on function public.toggle_message_reaction(text, text) from public, anon;
grant execute on function public.toggle_message_reaction(text, text) to authenticated;

-- Senders can delete their own messages. The row stays so the conversation shows
-- "This message was deleted" with their name; the content is cleared.
alter table public.messages add column if not exists deleted_at timestamptz;

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

-- 4. Support ticket changes appear in the activity feed with their ticket ID.
do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname from pg_constraint con
    where con.conrelid = 'public.entity_activity'::regclass and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%entity_type%'
  loop
    execute format('alter table public.entity_activity drop constraint %I', constraint_name);
  end loop;
  alter table public.entity_activity add constraint entity_activity_entity_type_check
    check (entity_type in ('project', 'task', 'grant', 'ticket'));
end;
$$;

create or replace function public.log_support_ticket_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor text := auth.uid()::text;
  label text := 'FL-' || new.ticket_number || ' ' || new.subject;
  assignee text;
begin
  if actor is null then return new; end if;
  if new.status is distinct from old.status then
    insert into public.entity_activity (entity_type, entity_id, action, detail, created_by)
    values ('ticket', new.id, 'changed status to ' || replace(new.status, '_', ' '), label, actor);
  end if;
  if new.assignee_id is distinct from old.assignee_id then
    select name into assignee from public.profiles where id = new.assignee_id;
    insert into public.entity_activity (entity_type, entity_id, action, detail, created_by)
    values ('ticket', new.id,
      case when new.assignee_id is null then 'unassigned' else 'assigned to ' || coalesce(assignee, 'a teammate') end,
      label, actor);
  end if;
  return new;
end;
$$;

drop trigger if exists support_ticket_activity on public.support_tickets;
create trigger support_ticket_activity after update of status, assignee_id on public.support_tickets
  for each row execute function public.log_support_ticket_activity();

-- 5. Site plans can start without a prospect and be linked later.
create or replace function public.wildfire_link_site_plan(p_site_plan_id uuid, p_opportunity_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  plan public.wildfire_site_plans;
  prop public.wildfire_properties;
  opp public.wildfire_opportunities;
begin
  perform public.wildfire_require_edit();
  select * into plan from public.wildfire_site_plans where id = p_site_plan_id for update;
  if not found then raise exception 'Site plan not found.'; end if;
  select * into opp from public.wildfire_opportunities where id = p_opportunity_id for update;
  if not found then raise exception 'Prospect not found.'; end if;
  if plan.opportunity_id is not null and plan.opportunity_id <> opp.id then
    raise exception 'This site plan already belongs to another prospect.';
  end if;
  if plan.status <> 'draft' and plan.opportunity_id is null then
    raise exception 'Only draft site plans can be linked. Create a new design version first.';
  end if;
  select * into prop from public.wildfire_properties where id = plan.property_id for update;
  if prop.opportunity_id is not null and prop.opportunity_id <> opp.id then
    raise exception 'This site already belongs to another prospect.';
  end if;
  if prop.organization_id is not null and opp.organization_id is not null and prop.organization_id <> opp.organization_id then
    raise exception 'The site and prospect belong to different organizations.';
  end if;

  update public.wildfire_properties
  set opportunity_id = opp.id, organization_id = coalesce(organization_id, opp.organization_id)
  where id = prop.id;
  update public.wildfire_site_plans set opportunity_id = opp.id
  where property_id = prop.id and opportunity_id is null and status = 'draft';
  update public.wildfire_opportunities set property_id = prop.id where id = opp.id and property_id is null;
end;
$$;
revoke all on function public.wildfire_link_site_plan(uuid, uuid) from public, anon;
grant execute on function public.wildfire_link_site_plan(uuid, uuid) to authenticated;

commit;

notify pgrst, 'reload schema';
