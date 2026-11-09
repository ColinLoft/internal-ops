-- Round 3: manual deployments, reaction notifications, channel unread counts,
-- and authenticated-account staff totals. Requires the round 2 update.
begin;

create or replace function public.wildfire_guard_deployment()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.quote_id is null then
      if auth.uid() is null or not public.has_app_access('wildfire', 'edit')
        or new.created_by is distinct from auth.uid()::text
        or new.contract_id is not null or new.site_plan_id is not null
        or new.opportunity_id is not null or new.customer_accepted_at is not null
        or new.status <> 'planning' then
        raise exception 'Manual deployments require active Wildfire editor access and cannot claim quote acceptance.';
      end if;
    elsif auth.role() is distinct from 'service_role' or not exists (
      select 1 from public.wildfire_quote_acceptances where quote_id = new.quote_id
    ) then
      raise exception 'Quote-linked deployments are created only by quote acceptance.';
    end if;
  elsif new.quote_id is distinct from old.quote_id or new.organization_id is distinct from old.organization_id
    or new.opportunity_id is distinct from old.opportunity_id or new.property_id is distinct from old.property_id
    or new.site_plan_id is distinct from old.site_plan_id or new.contract_id is distinct from old.contract_id
    or new.customer_accepted_at is distinct from old.customer_accepted_at then
    raise exception 'Deployment source links are immutable.';
  end if;
  return new;
end $$;

-- Direct inserts stay revoked. This function validates the site/customer pair.
create or replace function public.wildfire_create_manual_deployment(
  p_property_id uuid, p_organization_id uuid, p_notes text default ''
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  prop public.wildfire_properties;
  result uuid;
begin
  perform public.wildfire_require_edit();
  select * into prop from public.wildfire_properties where id = p_property_id for update;
  if not found then raise exception 'Site not found. Create a site first.'; end if;
  if not exists (select 1 from public.crm_organizations where id = p_organization_id) then
    raise exception 'Choose an existing customer.';
  end if;
  if prop.organization_id is not null and prop.organization_id <> p_organization_id then
    raise exception 'This site belongs to a different customer.';
  end if;
  if char_length(coalesce(p_notes, '')) > 10000 then raise exception 'Deployment notes are too long.'; end if;
  insert into public.wildfire_deployments (property_id, organization_id, status, notes, created_by)
  values (prop.id, p_organization_id, 'planning', coalesce(p_notes, ''), auth.uid()::text)
  returning id into result;
  insert into public.wildfire_deployment_events (deployment_id, event_type, body, created_by)
  values (result, 'note', 'Deployment added manually; no quote acceptance was recorded.', auth.uid()::text);
  return result;
end $$;
revoke all on function public.wildfire_create_manual_deployment(uuid, uuid, text) from public, anon;
grant execute on function public.wildfire_create_manual_deployment(uuid, uuid, text) to authenticated;

create or replace function public.notify_message_reactions()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor text := auth.uid()::text;
  actor_name text;
  reaction jsonb;
  channel_name text;
begin
  if actor is null or new.sender_id::text = actor or new.deleted_at is not null
    or new.reactions is not distinct from old.reactions then return new; end if;
  if not public.can_access_conversation(new.conversation_id::text, actor) then return new; end if;
  select name into actor_name from public.profiles where id = actor and coalesce(account_status, 'active') = 'active';
  if not found then return new; end if;
  select name into channel_name from public.channels where id = new.conversation_id;
  for reaction in select value from jsonb_array_elements(coalesce(new.reactions, '[]'::jsonb)) loop
    if coalesce(reaction -> 'users', '[]'::jsonb) ? actor
      and not exists (
        select 1 from jsonb_array_elements(coalesce(old.reactions, '[]'::jsonb)) prior
        where prior ->> 'emoji' = reaction ->> 'emoji' and coalesce(prior -> 'users', '[]'::jsonb) ? actor
      ) then
      insert into public.user_notifications (user_id, type, title, body, link_tab, target_id, actor_id, actor_name)
      values (new.sender_id::text, 'message', actor_name || ' reacted to your message',
        coalesce(reaction ->> 'emoji', '') || ' ' || left(coalesce(nullif(new.text, ''), 'Attachment or poll'), 160),
        case when channel_name is null then 'messages' else 'channels' end, new.conversation_id::text, actor, actor_name);
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists notify_message_reactions on public.messages;
create trigger notify_message_reactions after update of reactions on public.messages
for each row execute function public.notify_message_reactions();

-- Invoker security applies the existing message and channel RLS, including private channels.
create or replace function public.channel_unread_counts()
returns table (channel_id text, unread_count bigint)
language sql stable security invoker set search_path = public as $$
  select c.id::text, count(m.id)
  from public.channels c
  left join public.messages m on m.conversation_id = c.id
    and m.sender_id <> auth.uid()::text and m.deleted_at is null
    and not (auth.uid()::text = any(coalesce(m.seen_by, array[]::text[])))
  where auth.uid() is not null
  group by c.id;
$$;
revoke all on function public.channel_unread_counts() from public, anon;
grant execute on function public.channel_unread_counts() to authenticated;

-- Count actual Auth accounts, not orphan profiles left after account removal.
create or replace function public.active_staff_metrics()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if auth.uid() is null or not public.has_app_access('insights', 'view') then
    raise exception 'Insights access required.' using errcode = '42501';
  end if;
  select jsonb_build_object('count', count(*),
    'online', count(*) filter (where p.last_seen_at > now() - interval '4 minutes'))
  into result
  from public.profiles p
  join auth.users u on u.id::text = p.id
  where coalesce(p.account_status, 'active') = 'active'
    and u.deleted_at is null and u.email is not null;
  return result;
end $$;
revoke all on function public.active_staff_metrics() from public, anon;
grant execute on function public.active_staff_metrics() to authenticated;

notify pgrst, 'reload schema';
commit;
