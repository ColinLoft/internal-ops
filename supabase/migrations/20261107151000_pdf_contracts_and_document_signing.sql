alter table public.customer_contract_files
  add column if not exists version_number integer,
  add column if not exists sha256 text,
  add column if not exists source_file_id uuid references public.customer_contract_files(id) on delete restrict;

alter table public.customer_contract_files
  drop constraint if exists customer_contract_files_file_kind_check;
alter table public.customer_contract_files
  add constraint customer_contract_files_file_kind_check
  check (file_kind in ('document', 'original_pdf', 'signed_copy', 'amendment', 'other'));

with numbered_files as (
  select id, row_number() over (
    partition by contract_id, file_kind order by created_at, id
  )::integer as version_number
  from public.customer_contract_files
)
update public.customer_contract_files files
set version_number = numbered_files.version_number
from numbered_files
where files.id = numbered_files.id and files.version_number is null;

alter table public.customer_contract_files
  drop constraint if exists customer_contract_files_version_positive,
  drop constraint if exists customer_contract_files_sha256_format;

alter table public.customer_contract_files
  alter column version_number set not null,
  alter column version_number set default 1,
  add constraint customer_contract_files_version_positive check (version_number > 0),
  add constraint customer_contract_files_sha256_format check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$');

create unique index if not exists customer_contract_files_version_idx
  on public.customer_contract_files (contract_id, file_kind, version_number);

create or replace function public.customer_contract_files_append_only()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op <> 'INSERT' then
    raise exception 'Contract files are immutable; upload a new version instead.';
  end if;
  if new.mime_type is distinct from 'application/pdf' or new.sha256 is null
    or new.file_size is null or new.file_size <= 0 or new.file_size > 52428800 then
    raise exception 'Contract files must be PDF files no larger than 50 MB with a SHA-256 digest.';
  end if;
  if new.file_kind = 'signed_copy' and not exists (
    select 1 from public.customer_contract_files original
    where original.id = new.source_file_id
      and original.contract_id = new.contract_id
      and original.file_kind in ('original_pdf', 'document')
      and original.mime_type = 'application/pdf'
  ) then
    raise exception 'A signed PDF must reference an original PDF version for this contract.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.contract_id::text || ':' || new.file_kind, 0));
  new.version_number := coalesce((
    select max(version_number) + 1
    from public.customer_contract_files
    where contract_id = new.contract_id and file_kind = new.file_kind
  ), 1);
  return new;
end;
$$;

drop trigger if exists customer_contract_files_append_only on public.customer_contract_files;
create trigger customer_contract_files_append_only
before insert or update or delete on public.customer_contract_files
for each row execute function public.customer_contract_files_append_only();

create table if not exists public.customer_contract_signature_requests (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.customer_contracts(id) on delete restrict,
  source_file_id uuid not null references public.customer_contract_files(id) on delete restrict,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'draft' check (status in ('draft', 'pending', 'completed', 'revoked')),
  created_by text not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  sent_at timestamptz,
  signed_at timestamptz,
  signer_name text,
  signed_file_id uuid references public.customer_contract_files(id) on delete restrict,
  original_sha256 text,
  signed_sha256 text,
  signature_sha256 text
);

create or replace function public.customer_contract_pdf_version_revokes_signature_links()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.file_kind in ('original_pdf', 'document') and new.mime_type = 'application/pdf' then
    update public.customer_contract_signature_requests
    set status = 'revoked'
    where contract_id = new.contract_id and status in ('draft', 'pending');
  end if;
  return new;
end;
$$;

drop trigger if exists customer_contract_pdf_version_revokes_signature_links on public.customer_contract_files;
create trigger customer_contract_pdf_version_revokes_signature_links
after insert on public.customer_contract_files
for each row execute function public.customer_contract_pdf_version_revokes_signature_links();

create unique index if not exists customer_contract_signature_requests_open_idx
  on public.customer_contract_signature_requests (contract_id)
  where status in ('draft', 'pending');

create table if not exists public.customer_contract_signature_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.customer_contract_signature_requests(id) on delete restrict,
  contract_id uuid not null references public.customer_contracts(id) on delete restrict,
  source_file_id uuid not null references public.customer_contract_files(id) on delete restrict,
  signed_file_id uuid not null references public.customer_contract_files(id) on delete restrict,
  signer_name text not null,
  signed_at timestamptz not null,
  original_sha256 text not null check (original_sha256 ~ '^[0-9a-f]{64}$'),
  signed_sha256 text not null check (signed_sha256 ~ '^[0-9a-f]{64}$'),
  signature_sha256 text not null check (signature_sha256 ~ '^[0-9a-f]{64}$')
);

alter table public.customer_contract_signature_requests enable row level security;
alter table public.customer_contract_signature_events enable row level security;
revoke all on public.customer_contract_signature_requests, public.customer_contract_signature_events from anon, authenticated;
grant select on public.customer_contract_signature_events to authenticated;
drop policy if exists "Customer staff read contract signature events" on public.customer_contract_signature_events;
create policy "Customer staff read contract signature events"
  on public.customer_contract_signature_events for select to authenticated
  using (public.has_app_access('customers', 'view'));

create or replace function public.create_customer_contract_signature_request(
  p_contract_id uuid,
  p_source_file_id uuid,
  p_created_by text,
  p_token_hash text,
  p_expires_at timestamptz
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  contract_row public.customer_contracts%rowtype;
  source_file public.customer_contract_files%rowtype;
  latest_source_id uuid;
  request_id uuid;
begin
  select * into contract_row from public.customer_contracts where id = p_contract_id for update;
  if not found or contract_row.status not in ('draft', 'pending_signature') then
    raise exception 'Only a draft or pending contract can create a signing link.';
  end if;
  select * into source_file from public.customer_contract_files
  where id = p_source_file_id and contract_id = p_contract_id
    and file_kind in ('original_pdf', 'document') and mime_type = 'application/pdf';
  if not found then
    raise exception 'Upload an original agreement PDF before creating a signing link.';
  end if;
  select id into latest_source_id from public.customer_contract_files
  where contract_id = p_contract_id
    and file_kind in ('original_pdf', 'document')
    and mime_type = 'application/pdf'
  order by created_at desc, id desc limit 1;
  if latest_source_id is distinct from p_source_file_id then
    raise exception 'Select the current original agreement PDF version.';
  end if;
  update public.customer_contract_signature_requests
  set status = 'revoked'
  where contract_id = p_contract_id and status in ('draft', 'pending');
  insert into public.customer_contract_signature_requests (
    contract_id, source_file_id, token_hash, created_by, expires_at
  ) values (p_contract_id, p_source_file_id, p_token_hash, p_created_by, p_expires_at)
  returning id into request_id;
  insert into public.customer_contract_events (contract_id, actor_id, event_type, details)
  values (p_contract_id, p_created_by, 'signature_link_created', 'A shareable signature link was created. It has not been sent.');
  return request_id;
end;
$$;

create or replace function public.mark_customer_contract_signature_request_sent(
  p_request_id uuid,
  p_user_id text
)
returns void language plpgsql security definer set search_path = public as $$
declare
  request_row public.customer_contract_signature_requests%rowtype;
  contract_row public.customer_contracts%rowtype;
  now_at timestamptz := now();
begin
  select * into request_row from public.customer_contract_signature_requests where id = p_request_id for update;
  if not found or request_row.created_by <> p_user_id or request_row.status <> 'draft' or request_row.expires_at <= now_at then
    raise exception 'The signature link is unavailable or expired.';
  end if;
  select * into contract_row from public.customer_contracts where id = request_row.contract_id for update;
  if not found or contract_row.status not in ('draft', 'pending_signature') then
    raise exception 'The contract is no longer awaiting a signature request.';
  end if;
  update public.customer_contract_signature_requests set status = 'pending', sent_at = now_at
  where id = p_request_id;
  update public.customer_contracts
  set status = 'pending_signature', signature_requested_at = now_at, updated_at = now_at
  where id = request_row.contract_id;
  insert into public.customer_contract_events (contract_id, actor_id, event_type, details)
  values (request_row.contract_id, p_user_id, 'signature_request_marked_sent', 'Staff confirmed that the shareable link was sent manually.');
end;
$$;

create or replace function public.record_customer_contract_signature(
  p_request_id uuid,
  p_signer_name text,
  p_signed_storage_path text,
  p_signed_file_name text,
  p_signed_file_size bigint,
  p_original_sha256 text,
  p_signed_sha256 text,
  p_signature_sha256 text,
  p_signed_at timestamptz
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  request_row public.customer_contract_signature_requests%rowtype;
  contract_row public.customer_contracts%rowtype;
  latest_source_id uuid;
  new_signed_file_id uuid;
begin
  select * into request_row from public.customer_contract_signature_requests where id = p_request_id for update;
  if not found or request_row.status <> 'pending' or request_row.expires_at <= p_signed_at then
    raise exception 'This signature link is no longer active.';
  end if;
  select * into contract_row from public.customer_contracts where id = request_row.contract_id for update;
  if not found or contract_row.status <> 'pending_signature' then
    raise exception 'This contract is no longer awaiting a signature.';
  end if;
  select id into latest_source_id from public.customer_contract_files
  where contract_id = request_row.contract_id
    and file_kind in ('original_pdf', 'document')
    and mime_type = 'application/pdf'
  order by created_at desc, id desc limit 1;
  if latest_source_id is distinct from request_row.source_file_id then
    raise exception 'The original contract PDF changed. Request a new signature link for the current version.';
  end if;

  insert into public.customer_contract_files (
    contract_id, uploaded_by, file_name, storage_path, file_size, mime_type,
    file_kind, sha256, source_file_id
  ) values (
    request_row.contract_id, request_row.created_by, p_signed_file_name,
    p_signed_storage_path, p_signed_file_size, 'application/pdf',
    'signed_copy', p_signed_sha256, request_row.source_file_id
  )
  returning id into new_signed_file_id;

  update public.customer_contract_signature_requests
  set status = 'completed', signed_at = p_signed_at, signer_name = p_signer_name,
      signed_file_id = new_signed_file_id, original_sha256 = p_original_sha256,
      signed_sha256 = p_signed_sha256, signature_sha256 = p_signature_sha256
  where id = p_request_id;
  update public.customer_contracts
  set status = 'active', signed_at = p_signed_at, updated_at = p_signed_at
  where id = request_row.contract_id;
  insert into public.customer_contract_signature_events (
    request_id, contract_id, source_file_id, signed_file_id, signer_name,
    signed_at, original_sha256, signed_sha256, signature_sha256
  ) values (
    p_request_id, request_row.contract_id, request_row.source_file_id, new_signed_file_id,
    p_signer_name, p_signed_at, p_original_sha256, p_signed_sha256, p_signature_sha256
  );
  insert into public.customer_contract_events (contract_id, event_type, details)
  values (
    request_row.contract_id, 'customer_signed',
    format('Agreement electronically signed by %s. Signed PDF stored with SHA-256 %s.', p_signer_name, p_signed_sha256)
  );
  return new_signed_file_id;
end;
$$;

revoke all on function public.create_customer_contract_signature_request(uuid, uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.mark_customer_contract_signature_request_sent(uuid, text) from public, anon, authenticated;
revoke all on function public.record_customer_contract_signature(uuid, text, text, text, bigint, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.create_customer_contract_signature_request(uuid, uuid, text, text, timestamptz) to service_role;
grant execute on function public.mark_customer_contract_signature_request_sent(uuid, text) to service_role;
grant execute on function public.record_customer_contract_signature(uuid, text, text, text, bigint, text, text, text, timestamptz) to service_role;
grant all on public.customer_contract_signature_requests, public.customer_contract_signature_events to service_role;

drop policy if exists "Customer editors manage contract files" on public.customer_contract_files;
drop policy if exists "Customer editors add contract files" on public.customer_contract_files;
create policy "Customer editors add contract files" on public.customer_contract_files for insert to authenticated
  with check (public.has_app_access('customers', 'edit') and uploaded_by = auth.uid()::text);
revoke update, delete on public.customer_contract_files from authenticated;
grant select, insert on public.customer_contract_files to authenticated;

drop policy if exists "Customer managers delete contracts" on public.customer_contracts;
revoke delete on public.customer_contracts from authenticated;

drop policy if exists "Customer editors delete contract storage" on storage.objects;
drop policy if exists "Customer editors upload contract storage" on storage.objects;
create policy "Customer editors upload contract storage"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'contracts-files'
    and metadata->>'mimetype' = 'application/pdf'
    and public.has_app_access('customers', 'edit')
    and (storage.foldername(name))[1] = auth.uid()::text
  );
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('contracts-files', 'contracts-files', false, 52428800, array['application/pdf'])
on conflict (id) do update
set public = false, file_size_limit = 52428800, allowed_mime_types = array['application/pdf'];

grant select, insert, update on public.organization_documents to authenticated;
revoke delete on public.organization_documents from authenticated;
grant select on public.organization_document_assignments, public.organization_document_responses to authenticated;

create table if not exists public.organization_document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.organization_documents(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  storage_path text not null,
  file_name text not null,
  mime_type text not null default 'application/pdf' check (mime_type = 'application/pdf'),
  file_size bigint,
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  uploaded_by text references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (document_id, version_number),
  unique (storage_path)
);

insert into public.organization_document_versions (
  document_id, version_number, storage_path, file_name, mime_type, uploaded_by, created_at
)
select d.id, 1, d.storage_path,
       regexp_replace(d.storage_path, '^.*/', ''),
       'application/pdf', d.created_by, d.updated_at
from public.organization_documents d
where d.storage_path is not null
  and lower(d.storage_path) like '%.pdf'
  and not exists (
    select 1 from public.organization_document_versions v where v.document_id = d.id
  );

create index if not exists organization_document_versions_document_idx
  on public.organization_document_versions (document_id, version_number desc);

create table if not exists public.organization_document_legacy_files (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.organization_documents(id) on delete restrict,
  storage_path text not null unique,
  file_name text not null,
  preserved_at timestamptz not null default now()
);

insert into public.organization_document_legacy_files (document_id, storage_path, file_name)
select d.id, d.storage_path, regexp_replace(d.storage_path, '^.*/', '')
from public.organization_documents d
where d.storage_path is not null
  and not exists (
    select 1 from public.organization_document_versions v
    where v.document_id = d.id and v.storage_path = d.storage_path
  )
on conflict (storage_path) do nothing;

alter table public.organization_document_legacy_files enable row level security;
grant select on public.organization_document_legacy_files to authenticated;
revoke insert, update, delete on public.organization_document_legacy_files from authenticated;
drop policy if exists "Staff can view preserved document attachments" on public.organization_document_legacy_files;
create policy "Staff can view preserved document attachments"
  on public.organization_document_legacy_files for select to authenticated
  using (
    exists (
      select 1 from public.organization_documents d
      where d.id = document_id and (d.status = 'published' or d.created_by = auth.uid()::text)
    )
    or exists (select 1 from public.profiles where id = auth.uid()::text and system_role = 'admin')
  );

create or replace function public.organization_document_versions_append_only()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op <> 'INSERT' then
    raise exception 'Document versions are immutable; upload a new version instead.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.document_id::text, 0));
  new.version_number := coalesce((
    select max(version_number) + 1
    from public.organization_document_versions
    where document_id = new.document_id
  ), 1);
  return new;
end;
$$;

drop trigger if exists organization_document_versions_append_only on public.organization_document_versions;
create trigger organization_document_versions_append_only
before insert or update or delete on public.organization_document_versions
for each row execute function public.organization_document_versions_append_only();

alter table public.organization_document_versions enable row level security;
grant select on public.organization_document_versions to authenticated;
grant insert on public.organization_document_versions to authenticated;
revoke update, delete on public.organization_document_versions from authenticated;
drop policy if exists "Staff can view organization document versions" on public.organization_document_versions;
create policy "Staff can view organization document versions"
  on public.organization_document_versions for select to authenticated
  using (
    exists (
      select 1 from public.organization_documents d
      where d.id = document_id and (d.status = 'published' or d.created_by = auth.uid()::text)
    )
    or exists (select 1 from public.profiles where id = auth.uid()::text and system_role = 'admin')
  );
drop policy if exists "Admins add organization document versions" on public.organization_document_versions;
create policy "Admins add organization document versions"
  on public.organization_document_versions for insert to authenticated
  with check (
    uploaded_by = auth.uid()::text
    and exists (select 1 from public.profiles where id = auth.uid()::text and system_role = 'admin')
  );

alter table public.organization_document_responses
  add column if not exists document_version_id uuid references public.organization_document_versions(id) on delete restrict,
  add column if not exists signed_storage_path text;

create table if not exists public.organization_document_signature_events (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.organization_documents(id) on delete restrict,
  document_version_id uuid not null references public.organization_document_versions(id) on delete restrict,
  user_id text not null references public.profiles(id) on delete restrict,
  signed_name text not null,
  signed_storage_path text not null unique,
  signature_sha256 text,
  original_sha256 text not null check (original_sha256 ~ '^[0-9a-f]{64}$'),
  signed_sha256 text not null check (signed_sha256 ~ '^[0-9a-f]{64}$'),
  signed_at timestamptz not null default now(),
  unique (document_id, document_version_id, user_id)
);

alter table public.organization_document_signature_events enable row level security;
grant select on public.organization_document_signature_events to authenticated;
revoke insert, update, delete on public.organization_document_signature_events from authenticated;
drop policy if exists "Staff can view document signature history" on public.organization_document_signature_events;
create policy "Staff can view document signature history"
  on public.organization_document_signature_events for select to authenticated
  using (
    user_id = auth.uid()::text
    or exists (select 1 from public.profiles where id = auth.uid()::text and system_role = 'admin')
  );

drop policy if exists "Staff can submit document responses" on public.organization_document_responses;
drop policy if exists "Staff can update document responses" on public.organization_document_responses;
revoke insert, update, delete on public.organization_document_responses from authenticated;

drop policy if exists "Staff can complete assigned documents" on public.organization_document_assignments;
revoke update on public.organization_document_assignments from authenticated;

create or replace function public.record_organization_document_signature(
  p_document_id uuid,
  p_user_id text,
  p_document_version_id uuid,
  p_signed_name text,
  p_signed_storage_path text,
  p_signature_sha256 text,
  p_original_sha256 text,
  p_signed_sha256 text,
  p_signed_at timestamptz
)
returns void language plpgsql security definer set search_path = public as $$
declare
  doc public.organization_documents%rowtype;
  version public.organization_document_versions%rowtype;
begin
  select * into doc from public.organization_documents where id = p_document_id for update;
  if not found or doc.status <> 'published' then
    raise exception 'This document is no longer available for signing.';
  end if;

  select * into version from public.organization_document_versions
  where id = p_document_version_id and document_id = p_document_id;
  if not found or version.storage_path <> doc.storage_path then
    raise exception 'The document version changed before it could be signed.';
  end if;

  if not (doc.required_onboarding or exists (
    select 1 from public.organization_document_assignments a
    where a.document_id = p_document_id and a.user_id = p_user_id and a.status = 'pending'
  )) then
    raise exception 'You are not assigned to sign this document.';
  end if;

  insert into public.organization_document_signature_events (
    document_id, document_version_id, user_id, signed_name, signed_storage_path,
    signature_sha256, original_sha256, signed_sha256, signed_at
  ) values (
    p_document_id, p_document_version_id, p_user_id, p_signed_name, p_signed_storage_path,
    p_signature_sha256, p_original_sha256, p_signed_sha256, p_signed_at
  );

  insert into public.organization_document_responses (
    document_id, user_id, response_type, signed_name, signed_at, acknowledged_at,
    document_version_id, signed_storage_path
  ) values (
    p_document_id, p_user_id,
    case when doc.requires_signature then 'signed' else 'acknowledged' end,
    p_signed_name,
    case when doc.requires_signature then p_signed_at else null end,
    case when doc.requires_acknowledgement then p_signed_at else null end,
    p_document_version_id,
    p_signed_storage_path
  )
  on conflict (document_id, user_id) do update set
    response_type = excluded.response_type,
    signed_name = excluded.signed_name,
    signed_at = excluded.signed_at,
    acknowledged_at = excluded.acknowledged_at,
    document_version_id = excluded.document_version_id,
    signed_storage_path = excluded.signed_storage_path;

  update public.organization_document_assignments
  set status = 'completed', completed_at = p_signed_at
  where document_id = p_document_id and user_id = p_user_id and status = 'pending';
end;
$$;

revoke all on function public.record_organization_document_signature(uuid, text, uuid, text, text, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.record_organization_document_signature(uuid, text, uuid, text, text, text, text, text, timestamptz) to service_role;

create or replace function public.organization_documents_require_pdf()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'published'
    and (tg_op = 'INSERT' or old.status <> 'published')
    and (new.storage_path is null or lower(new.storage_path) not like '%.pdf') then
    raise exception 'Publish an uploaded PDF before publishing this document.';
  end if;
  return new;
end;
$$;

drop trigger if exists organization_documents_require_pdf on public.organization_documents;
create trigger organization_documents_require_pdf
before insert or update of status, storage_path on public.organization_documents
for each row execute function public.organization_documents_require_pdf();

create or replace function public.organization_documents_preserve_signed_history()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Organization documents with signature history cannot be deleted.';
  end if;
  if old.status = 'published' and new.storage_path is distinct from old.storage_path
    and new.storage_path is not null
    and not exists (
      select 1 from public.organization_document_versions v
      where v.document_id = old.id and v.storage_path = new.storage_path
    ) then
    raise exception 'Published PDF files are immutable; add a new PDF version before switching the current version.';
  end if;
  if new.storage_path is distinct from old.storage_path and old.storage_path is not null
    and not exists (
      select 1 from public.organization_document_versions v
      where v.document_id = old.id and v.storage_path = old.storage_path
    ) then
    insert into public.organization_document_legacy_files (document_id, storage_path, file_name)
    values (old.id, old.storage_path, regexp_replace(old.storage_path, '^.*/', ''))
    on conflict (storage_path) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists organization_documents_preserve_signed_history on public.organization_documents;
create trigger organization_documents_preserve_signed_history
before update or delete on public.organization_documents
for each row execute function public.organization_documents_preserve_signed_history();

create or replace function public.organization_document_version_reopens_assignments()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.storage_path is distinct from old.storage_path then
    update public.organization_document_assignments
    set status = 'pending', completed_at = null
    where document_id = new.id and status = 'completed';
  end if;
  return new;
end;
$$;

drop trigger if exists organization_document_version_reopens_assignments on public.organization_documents;
create trigger organization_document_version_reopens_assignments
after update of storage_path on public.organization_documents
for each row execute function public.organization_document_version_reopens_assignments();

create or replace function public.organization_documents_pdf_only()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.content is not null then
    raise exception 'Create organization documents from an uploaded PDF, not authored body text.';
  end if;
  if tg_op = 'UPDATE' and new.content is distinct from old.content then
    raise exception 'Legacy document text is preserved as read-only; upload a PDF version instead.';
  end if;
  return new;
end;
$$;

drop trigger if exists organization_documents_pdf_only on public.organization_documents;
create trigger organization_documents_pdf_only
before insert or update of content on public.organization_documents
for each row execute function public.organization_documents_pdf_only();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('organization-documents', 'organization-documents', false, 52428800, array['application/pdf'])
on conflict (id) do update
set public = false, file_size_limit = 52428800, allowed_mime_types = array['application/pdf'];

drop policy if exists "Authenticated staff can upload organization documents" on storage.objects;
create policy "Authenticated staff can upload organization documents"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'organization-documents'
    and metadata->>'mimetype' = 'application/pdf'
    and exists (select 1 from public.profiles where id = auth.uid()::text and system_role = 'admin')
  );

drop policy if exists "Authenticated staff can read organization documents" on storage.objects;
create policy "Authenticated staff can read organization documents"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'organization-documents'
    and (
      exists (select 1 from public.profiles where id = auth.uid()::text and system_role = 'admin')
      or name not like 'signatures/%'
      or exists (
        select 1 from public.organization_document_signature_events e
        where e.signed_storage_path = name and e.user_id = auth.uid()::text
      )
    )
  );
