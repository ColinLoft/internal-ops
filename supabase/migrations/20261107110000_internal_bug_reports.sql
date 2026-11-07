alter table public.support_tickets
  add column if not exists internal_only boolean not null default false,
  add column if not exists developer_flag boolean not null default false,
  add column if not exists diagnostic_data jsonb not null default '{}'::jsonb,
  add column if not exists screenshot_path text;

alter table public.support_tickets
  drop constraint if exists support_tickets_category_check;

alter table public.support_tickets
  add constraint support_tickets_category_check
  check (category in (
    'customer_support', 'technical', 'product', 'website', 'partnership', 'general',
    'internal_it', 'equipment', 'bug', 'help', 'feature_request', 'access'
  ));

create index if not exists support_tickets_internal_developer_idx
  on public.support_tickets (created_at desc)
  where internal_only and developer_flag;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bug-report-screenshots', 'bug-report-screenshots', false, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];

drop policy if exists "Staff upload bug report screenshots" on storage.objects;
create policy "Staff upload bug report screenshots"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'bug-report-screenshots'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Permitted users read bug report screenshots" on storage.objects;
create policy "Permitted users read bug report screenshots"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'bug-report-screenshots'
    and (
      public.is_support_agent()
      or exists (
        select 1
        from public.support_tickets ticket
        where ticket.screenshot_path = storage.objects.name
          and ticket.requester_id = auth.uid()::text
      )
    )
  );

drop policy if exists "Staff delete own bug report screenshots" on storage.objects;
create policy "Staff delete own bug report screenshots"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'bug-report-screenshots'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
