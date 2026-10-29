create table if not exists public.drive_items (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.drive_items(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  item_type text not null check (item_type in ('folder', 'document', 'presentation', 'spreadsheet', 'form', 'file')),
  mime_type text,
  storage_path text,
  content jsonb not null default '{}'::jsonb,
  is_starred boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.drive_items
  add column if not exists is_starred boolean not null default false;

create table if not exists public.drive_shares (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.drive_items(id) on delete cascade,
  shared_by uuid not null references auth.users(id) on delete cascade,
  shared_with_user_id uuid references auth.users(id) on delete cascade,
  shared_with_email text,
  permission text not null default 'viewer' check (permission in ('viewer', 'commenter', 'editor')),
  created_at timestamptz not null default now(),
  check (shared_with_user_id is not null or shared_with_email is not null)
);

create table if not exists public.drive_versions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.drive_items(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.drive_form_responses (
  id uuid primary key default gen_random_uuid(),
  form_item_id uuid not null references public.drive_items(id) on delete cascade,
  submitted_at timestamptz not null default now(),
  duration_seconds integer,
  answers jsonb not null default '{}'::jsonb,
  respondent_email text,
  respondent_name text
);

create index if not exists drive_form_responses_form_idx
  on public.drive_form_responses(form_item_id, submitted_at desc);

alter table public.drive_form_responses enable row level security;

drop policy if exists "Form owners and collaborators can view responses" on public.drive_form_responses;
create policy "Form owners and collaborators can view responses"
  on public.drive_form_responses for select to authenticated
  using (
    exists (
      select 1 from public.drive_items
      where drive_items.id = form_item_id
        and (
          drive_items.owner_id = auth.uid()
          or exists (
            select 1 from public.drive_shares
            where drive_shares.item_id = drive_items.id
              and drive_shares.shared_with_user_id = auth.uid()
          )
        )
    )
  );

drop policy if exists "Anyone can submit an active form" on public.drive_form_responses;
create policy "Anyone can submit an active form"
  on public.drive_form_responses for insert to anon, authenticated
  with check (
    exists (
      select 1 from public.drive_items
      where drive_items.id = form_item_id
        and drive_items.item_type = 'form'
        and drive_items.deleted_at is null
    )
  );

insert into storage.buckets (id, name, public)
values ('drive-files', 'drive-files', false)
on conflict (id) do nothing;

create index if not exists drive_items_owner_parent_idx on public.drive_items(owner_id, parent_id, updated_at desc);
create index if not exists drive_items_deleted_idx on public.drive_items(owner_id, deleted_at);
create index if not exists drive_shares_item_idx on public.drive_shares(item_id);
create index if not exists drive_shares_user_idx on public.drive_shares(shared_with_user_id);

alter table public.drive_items enable row level security;
alter table public.drive_shares enable row level security;
alter table public.drive_versions enable row level security;

drop policy if exists "Drive files are readable by collaborators" on storage.objects;
create policy "Drive files are readable by collaborators"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'drive-files'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1
        from public.drive_items
        join public.drive_shares on drive_shares.item_id = drive_items.id
        where drive_items.storage_path = storage.objects.name
          and drive_shares.shared_with_user_id = auth.uid()
      )
    )
  );

drop policy if exists "Users can upload their drive files" on storage.objects;
create policy "Users can upload their drive files"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'drive-files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can delete their drive files" on storage.objects;
create policy "Users can delete their drive files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'drive-files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Drive items are visible to owners and collaborators" on public.drive_items;
create policy "Drive items are visible to owners and collaborators"
  on public.drive_items for select to authenticated
  using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.drive_shares
      where drive_shares.item_id = drive_items.id
        and drive_shares.shared_with_user_id = auth.uid()
    )
  );

drop policy if exists "Drive items can be created by owners" on public.drive_items;
create policy "Drive items can be created by owners"
  on public.drive_items for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "Drive items can be changed by owners" on public.drive_items;
create policy "Drive items can be changed by owners"
  on public.drive_items for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "Drive shares are visible to participants" on public.drive_shares;
create policy "Drive shares are visible to participants"
  on public.drive_shares for select to authenticated
  using (shared_by = auth.uid() or shared_with_user_id = auth.uid());

drop policy if exists "Owners can create drive shares" on public.drive_shares;
create policy "Owners can create drive shares"
  on public.drive_shares for insert to authenticated
  with check (
    shared_by = auth.uid()
    and exists (select 1 from public.drive_items where id = item_id and owner_id = auth.uid())
  );

drop policy if exists "Owners can remove drive shares" on public.drive_shares;
create policy "Owners can remove drive shares"
  on public.drive_shares for delete to authenticated
  using (
    exists (select 1 from public.drive_items where id = item_id and owner_id = auth.uid())
  );

drop policy if exists "Drive versions are visible to collaborators" on public.drive_versions;
create policy "Drive versions are visible to collaborators"
  on public.drive_versions for select to authenticated
  using (
    exists (
      select 1 from public.drive_items
      where drive_items.id = item_id
        and (drive_items.owner_id = auth.uid() or exists (
          select 1 from public.drive_shares
          where drive_shares.item_id = drive_items.id
            and drive_shares.shared_with_user_id = auth.uid()
        ))
    )
  );

drop policy if exists "Collaborators can create drive versions" on public.drive_versions;
create policy "Collaborators can create drive versions"
  on public.drive_versions for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.drive_items
      where drive_items.id = item_id
        and (drive_items.owner_id = auth.uid() or exists (
          select 1 from public.drive_shares
          where drive_shares.item_id = drive_items.id
            and drive_shares.shared_with_user_id = auth.uid()
            and drive_shares.permission = 'editor'
        ))
    )
  );
