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
-- Apply after the QA round 2 migrations. Re-runnable; no object bytes are changed.
begin;

create or replace function public.is_active_storage_member()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and exists (
    select 1 from public.profiles
    where id = auth.uid()::text and coalesce(account_status, 'active') = 'active'
  );
$$;
revoke all on function public.is_active_storage_member() from public, anon;
grant execute on function public.is_active_storage_member() to authenticated;

-- Matches the messages INSERT policy, including private membership and posting
-- roles. The message row does not exist yet when Storage uploads and signs it.
create or replace function public.can_upload_message_attachment(p_name text)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select public.is_active_storage_member()
    and (storage.foldername(p_name))[1] = auth.uid()::text
    and coalesce((storage.foldername(p_name))[3], '') <> ''
    and (
      exists (
        select 1 from public.channels channel
        join public.profiles profile on profile.id = auth.uid()::text
        where channel.id = (storage.foldername(p_name))[2]
          and (not channel.is_private or public.is_channel_member(channel.id, auth.uid()::text))
          and (channel.posting_roles is null or profile.system_role = any(channel.posting_roles))
      )
      or public.is_conversation_participant((storage.foldername(p_name))[2], auth.uid()::text)
    );
$$;
revoke all on function public.can_upload_message_attachment(text) from public, anon;
grant execute on function public.can_upload_message_attachment(text) to authenticated;

-- Existing private buckets must remain private even if manually configured
-- otherwise. Avatars intentionally remain public; retired screenshot buckets
-- and their cleanup manifest are not touched.
update storage.buckets set public = false
where id in ('message-attachments', 'channel-attachments', 'drive-files',
  'work-files', 'engineering-files', 'contracts-files', 'organization-documents');

-- A restrictive guard also blocks stale permissive policies from admitting
-- inactive/profileless users. Public avatar reads remain intentional.
drop policy if exists "Active members access workspace storage" on storage.objects;
create policy "Active members access workspace storage"
  on storage.objects as restrictive for all to authenticated
  using (
    bucket_id not in ('message-attachments', 'channel-attachments', 'drive-files',
      'work-files', 'engineering-files', 'contracts-files', 'organization-documents', 'avatars')
    or bucket_id = 'avatars'
    or public.is_active_storage_member()
  )
  with check (
    bucket_id not in ('message-attachments', 'channel-attachments', 'drive-files',
      'work-files', 'engineering-files', 'contracts-files', 'organization-documents', 'avatars')
    or public.is_active_storage_member()
  );

drop policy if exists "Authenticated users can upload message attachments" on storage.objects;
drop policy if exists "Authenticated users can read message attachments" on storage.objects;
drop policy if exists "Authorized users can read message attachments" on storage.objects;
drop policy if exists "Authors can replace message attachments" on storage.objects;
drop policy if exists "Authors can delete message attachments" on storage.objects;

create policy "Authenticated users can upload message attachments"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'message-attachments' and public.can_upload_message_attachment(name));

create policy "Authorized users can read message attachments"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'message-attachments'
    and public.is_active_storage_member()
    and public.can_access_conversation((storage.foldername(name))[2], auth.uid()::text)
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.messages message
        where message.conversation_id = (storage.foldername(storage.objects.name))[2]
          and message.attachments @> jsonb_build_array(
            jsonb_build_object('storagePath', storage.objects.name))
      )
    )
  );

-- Storage upsert requires SELECT + INSERT + UPDATE. Both sides of UPDATE check
-- ownership and posting access; readers can never overwrite someone else's file.
create policy "Authors can replace message attachments"
  on storage.objects for update to authenticated
  using (bucket_id = 'message-attachments' and public.can_upload_message_attachment(name))
  with check (bucket_id = 'message-attachments' and public.can_upload_message_attachment(name));

create policy "Authors can delete message attachments"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'message-attachments'
    and public.is_active_storage_member()
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.can_access_conversation((storage.foldername(name))[2], auth.uid()::text)
  );

-- Legacy channel objects start with channel ID, NOT uploader ID. Keep reads
-- scoped to that channel; no new legacy upload/update/delete surface is added.
drop policy if exists "Channel members can read channel attachments" on storage.objects;
create policy "Channel members can read channel attachments"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'channel-attachments'
    and public.is_active_storage_member()
    and exists (
      select 1 from public.channels channel
      where channel.id = (storage.foldername(storage.objects.name))[1]
        and (not channel.is_private
          or public.is_channel_member(channel.id, auth.uid()::text)
          or public.is_workspace_manager(auth.uid()::text))
    )
  );
drop policy if exists "Channel members can upload channel attachments" on storage.objects;

-- Office/Drive is retired. Preserve explicit owner/share reads for linked files,
-- but do not re-enable browser mutations of the retired storage surface.
drop policy if exists "Users can upload their drive files" on storage.objects;
drop policy if exists "Users can delete their drive files" on storage.objects;
drop policy if exists "Drive files are readable by collaborators" on storage.objects;
create policy "Drive files are readable by collaborators"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'drive-files' and public.is_active_storage_member()
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.drive_items item
        join public.drive_shares share on share.item_id = item.id
        where item.storage_path = storage.objects.name and share.shared_with_user_id = auth.uid()
      )
    )
  );

drop policy if exists "Staff read work files" on storage.objects;
create policy "Staff read work files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'work-files' and public.is_active_storage_member()
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.entity_attachments attachment
        where attachment.storage_path = storage.objects.name
          and public.can_view_entity(attachment.entity_type)
      )
    )
  );
drop policy if exists "Staff upload work files" on storage.objects;
create policy "Staff upload work files"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'work-files' and public.is_active_storage_member()
    and (storage.foldername(name))[1] = auth.uid()::text
    and (storage.foldername(name))[2] in ('project', 'task', 'grant')
    and public.can_view_entity((storage.foldername(name))[2])
  );
drop policy if exists "Staff delete own work files" on storage.objects;
create policy "Staff delete own work files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'work-files' and public.is_active_storage_member()
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Staff read engineering files" on storage.objects;
create policy "Staff read engineering files"
  on storage.objects for select to authenticated
  using (bucket_id = 'engineering-files' and public.is_active_storage_member()
    and public.has_app_access('engineering', 'view'));
drop policy if exists "Staff upload engineering files" on storage.objects;
create policy "Staff upload engineering files"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'engineering-files' and public.is_active_storage_member()
    and public.has_app_access('engineering', 'edit')
    and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Staff delete own engineering files" on storage.objects;
create policy "Staff delete own engineering files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'engineering-files' and public.is_active_storage_member()
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_eng_admin()));

-- Contracts and policy PDFs remain append-only. Signed PDFs are written only
-- by the trusted signing functions, never by browser policies.
drop policy if exists "Customer staff read contract storage" on storage.objects;
create policy "Customer staff read contract storage"
  on storage.objects for select to authenticated
  using (bucket_id = 'contracts-files' and public.is_active_storage_member()
    and public.has_app_access('customers', 'view'));
drop policy if exists "Customer editors upload contract storage" on storage.objects;
create policy "Customer editors upload contract storage"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'contracts-files' and public.is_active_storage_member()
    and metadata->>'mimetype' = 'application/pdf'
    and public.has_app_access('customers', 'edit')
    and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Customer editors delete contract storage" on storage.objects;

drop policy if exists "Authenticated staff can upload organization documents" on storage.objects;
create policy "Authenticated staff can upload organization documents"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'organization-documents' and public.is_active_storage_member()
    and public.is_workspace_admin() and metadata->>'mimetype' = 'application/pdf'
    and (storage.foldername(name))[1] = 'policies'
    and (storage.foldername(name))[2] = auth.uid()::text);
drop policy if exists "Authenticated staff can read organization documents" on storage.objects;
create policy "Authenticated staff can read organization documents"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'organization-documents' and public.is_active_storage_member()
    and (
      public.is_workspace_admin()
      or exists (
        select 1 from public.organization_document_signature_events event
        where event.signed_storage_path = storage.objects.name and event.user_id = auth.uid()::text
      )
      or (
        (storage.foldername(name))[1] <> 'signatures'
        and (
          exists (select 1 from public.organization_documents document
            where document.storage_path = storage.objects.name
              and (document.status = 'published' or document.created_by = auth.uid()::text))
          or exists (select 1 from public.organization_document_versions version
            where version.storage_path = storage.objects.name)
          or exists (select 1 from public.organization_document_legacy_files legacy
            where legacy.storage_path = storage.objects.name)
        )
      )
    )
  );

drop policy if exists "Staff upload own avatars" on storage.objects;
create policy "Staff upload own avatars"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and public.is_active_storage_member()
    and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Staff update own avatars" on storage.objects;
create policy "Staff update own avatars"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and public.is_active_storage_member()
    and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and public.is_active_storage_member()
    and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Staff delete own avatars" on storage.objects;
create policy "Staff delete own avatars"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and public.is_active_storage_member()
    and (storage.foldername(name))[1] = auth.uid()::text);

notify pgrst, 'reload schema';
commit;
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
