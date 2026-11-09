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
