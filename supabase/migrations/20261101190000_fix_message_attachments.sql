insert into storage.buckets (id, name, public, file_size_limit)
values ('message-attachments', 'message-attachments', false, 20971520)
on conflict (id) do update set public = false, file_size_limit = 20971520;

drop policy if exists "Authenticated users can upload message attachments" on storage.objects;
create policy "Authenticated users can upload message attachments"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'message-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Authenticated users can read message attachments" on storage.objects;
create policy "Authenticated users can read message attachments"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'message-attachments'
    and exists (
      select 1
      from public.messages
      where messages.conversation_id = (storage.foldername(name))[2]
        and messages.attachments @> jsonb_build_array(jsonb_build_object('storagePath', name))
    )
  );
