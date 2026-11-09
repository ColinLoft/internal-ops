alter table public.customer_contracts
  add column if not exists counter_signer_id text references public.profiles(id) on delete set null;

alter table public.customer_contract_signature_requests
  drop constraint if exists customer_contract_signature_requests_status_check;

alter table public.customer_contract_signature_requests
  add constraint customer_contract_signature_requests_status_check
  check (status in ('draft', 'pending', 'recipient_signed', 'completed', 'revoked'));

alter table public.customer_contract_signature_requests
  add column if not exists flow_version integer not null default 1,
  add column if not exists placement_fields jsonb not null default '[]'::jsonb,
  add column if not exists counter_signer_id text references public.profiles(id) on delete set null,
  add column if not exists recipient_name text,
  add column if not exists recipient_email text,
  add column if not exists email_idempotency_key text,
  add column if not exists resend_email_id text,
  add column if not exists email_error text,
  add column if not exists recipient_signed_name text,
  add column if not exists recipient_signed_at timestamptz,
  add column if not exists customer_signed_storage_path text,
  add column if not exists recipient_signature_sha256 text,
  add column if not exists counter_signed_name text,
  add column if not exists counter_signed_at timestamptz,
  add column if not exists counter_signature_sha256 text,
  add column if not exists confirmation_delivery_status text not null default 'not_sent',
  add column if not exists confirmation_error text,
  add column if not exists confirmation_email_idempotency_key text;

alter table public.customer_contract_signature_requests
  drop constraint if exists customer_contract_signature_requests_flow_version_check,
  drop constraint if exists customer_contract_signature_requests_placements_check,
  drop constraint if exists customer_contract_signature_requests_delivery_check;

alter table public.customer_contract_signature_requests
  add constraint customer_contract_signature_requests_flow_version_check
    check (flow_version in (1, 2)),
  add constraint customer_contract_signature_requests_placements_check
    check (jsonb_typeof(placement_fields) = 'array'),
  add constraint customer_contract_signature_requests_delivery_check
    check (confirmation_delivery_status in ('not_sent', 'sent', 'failed'));

drop index if exists public.customer_contract_signature_requests_open_idx;
create unique index customer_contract_signature_requests_open_idx
  on public.customer_contract_signature_requests (contract_id)
  where status in ('draft', 'pending', 'recipient_signed');

create unique index if not exists customer_contract_signature_request_email_key_idx
  on public.customer_contract_signature_requests (email_idempotency_key)
  where email_idempotency_key is not null;

create or replace function public.customer_contract_pdf_version_revokes_signature_links()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.file_kind in ('original_pdf', 'document') and new.mime_type = 'application/pdf' then
    update public.customer_contract_signature_requests
      set status = 'revoked'
      where contract_id = new.contract_id and status in ('draft', 'pending', 'recipient_signed');
  end if;
  return new;
end;
$$;

create or replace function public.create_customer_contract_signature_request_v2(
  p_request_id uuid,
  p_contract_id uuid,
  p_source_file_id uuid,
  p_created_by text,
  p_token_hash text,
  p_expires_at timestamptz,
  p_placement_fields jsonb
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  contract_row public.customer_contracts%rowtype;
  source_file public.customer_contract_files%rowtype;
  latest_source_id uuid;
  existing_request public.customer_contract_signature_requests%rowtype;
begin
  select * into contract_row from public.customer_contracts where id = p_contract_id for update;
  if not found or contract_row.status not in ('draft', 'pending_signature')
    or contract_row.counter_signer_id is null or contract_row.counterparty_name = ''
    or contract_row.counterparty_email = '' then
    raise exception 'Select a countersigner and complete the recipient name and email before sending.';
  end if;

  select * into existing_request
    from public.customer_contract_signature_requests
    where id = p_request_id for update;
  if found then
    if existing_request.flow_version = 2
      and existing_request.contract_id = p_contract_id
      and existing_request.created_by = p_created_by
      and existing_request.token_hash = p_token_hash
      and existing_request.source_file_id = p_source_file_id
      and existing_request.counter_signer_id = contract_row.counter_signer_id
      and existing_request.recipient_name = contract_row.counterparty_name
      and existing_request.recipient_email = contract_row.counterparty_email
      and existing_request.placement_fields = p_placement_fields
      and existing_request.status in ('draft', 'pending') then
      return existing_request.id;
    end if;
    raise exception 'This signing request ID has already been used.';
  end if;

  select * into source_file from public.customer_contract_files
    where id = p_source_file_id and contract_id = p_contract_id
      and file_kind in ('original_pdf', 'document') and mime_type = 'application/pdf';
  if not found then raise exception 'Upload an original agreement PDF before sending.'; end if;
  select id into latest_source_id from public.customer_contract_files
    where contract_id = p_contract_id and file_kind in ('original_pdf', 'document')
      and mime_type = 'application/pdf'
    order by created_at desc, id desc limit 1;
  if latest_source_id is distinct from p_source_file_id then
    raise exception 'Select the current original agreement PDF version.';
  end if;
  if jsonb_typeof(p_placement_fields) <> 'array' or jsonb_array_length(p_placement_fields) = 0 then
    raise exception 'Place signature fields on the original agreement before sending.';
  end if;

  update public.customer_contract_signature_requests
    set status = 'revoked'
    where contract_id = p_contract_id and status in ('draft', 'pending', 'recipient_signed');
  insert into public.customer_contract_signature_requests (
    id, contract_id, source_file_id, token_hash, status, created_by, expires_at,
    flow_version, placement_fields, counter_signer_id, recipient_name, recipient_email,
    email_idempotency_key, confirmation_email_idempotency_key
  ) values (
    p_request_id, p_contract_id, p_source_file_id, p_token_hash, 'draft', p_created_by, p_expires_at,
    2, p_placement_fields, contract_row.counter_signer_id, contract_row.counterparty_name,
    contract_row.counterparty_email, 'contract-invite-' || p_request_id::text,
    'contract-copy-' || p_request_id::text
  );
  insert into public.customer_contract_events (contract_id, actor_id, event_type, details)
    values (p_contract_id, p_created_by, 'signature_link_created', 'A placed-field signature request was prepared for email delivery.');
  return p_request_id;
end;
$$;

create or replace function public.mark_customer_contract_signature_request_sent_v2(
  p_request_id uuid,
  p_user_id text,
  p_token_hash text,
  p_resend_email_id text
)
returns void language plpgsql security definer set search_path = public as $$
declare
  request_row public.customer_contract_signature_requests%rowtype;
  contract_row public.customer_contracts%rowtype;
  now_at timestamptz := now();
begin
  select * into request_row from public.customer_contract_signature_requests
    where id = p_request_id for update;
  if not found or request_row.flow_version <> 2 or request_row.created_by <> p_user_id
    or request_row.token_hash <> p_token_hash or request_row.expires_at <= now_at
    or request_row.status not in ('draft', 'pending') then
    raise exception 'This signature request is unavailable or expired.';
  end if;
  select * into contract_row from public.customer_contracts where id = request_row.contract_id for update;
  if not found or contract_row.status not in ('draft', 'pending_signature') then
    raise exception 'The contract is no longer awaiting a signature request.';
  end if;
  if request_row.status = 'draft' then
    update public.customer_contract_signature_requests
      set status = 'pending', sent_at = now_at, resend_email_id = p_resend_email_id, email_error = null
      where id = p_request_id;
    update public.customer_contracts
      set status = 'pending_signature', signature_requested_at = now_at, updated_at = now_at
      where id = request_row.contract_id;
    insert into public.customer_contract_events (contract_id, actor_id, event_type, details)
      values (request_row.contract_id, p_user_id, 'signature_request_sent', 'Signature request email delivered through Resend.');
  elsif request_row.resend_email_id is null then
    update public.customer_contract_signature_requests
      set resend_email_id = p_resend_email_id, email_error = null
      where id = p_request_id;
  end if;
end;
$$;

create or replace function public.record_customer_contract_recipient_signature(
  p_request_id uuid,
  p_signer_name text,
  p_signed_storage_path text,
  p_original_sha256 text,
  p_signature_sha256 text,
  p_signed_at timestamptz
)
returns void language plpgsql security definer set search_path = public as $$
declare
  request_row public.customer_contract_signature_requests%rowtype;
  contract_row public.customer_contracts%rowtype;
  latest_source_id uuid;
begin
  select * into request_row from public.customer_contract_signature_requests
    where id = p_request_id for update;
  if not found or request_row.flow_version <> 2 or request_row.status <> 'pending'
    or request_row.expires_at <= p_signed_at then
    raise exception 'This signature request is no longer active.';
  end if;
  select * into contract_row from public.customer_contracts
    where id = request_row.contract_id for update;
  if not found or contract_row.status <> 'pending_signature' then
    raise exception 'This contract is no longer awaiting the recipient signature.';
  end if;
  select id into latest_source_id from public.customer_contract_files
    where contract_id = request_row.contract_id and file_kind in ('original_pdf', 'document')
      and mime_type = 'application/pdf'
    order by created_at desc, id desc limit 1;
  if latest_source_id is distinct from request_row.source_file_id then
    raise exception 'The original contract PDF changed. Request a new signing link.';
  end if;
  update public.customer_contract_signature_requests
    set status = 'recipient_signed', recipient_signed_name = p_signer_name,
      recipient_signed_at = p_signed_at, customer_signed_storage_path = p_signed_storage_path,
      original_sha256 = p_original_sha256, recipient_signature_sha256 = p_signature_sha256
    where id = p_request_id;
  insert into public.customer_contract_events (contract_id, event_type, details)
    values (request_row.contract_id, 'recipient_signed', format('%s signed the placed fields; awaiting Flown countersignature.', p_signer_name));
end;
$$;

create or replace function public.record_customer_contract_countersignature(
  p_request_id uuid,
  p_user_id text,
  p_signed_storage_path text,
  p_signed_file_name text,
  p_signed_file_size bigint,
  p_signed_sha256 text,
  p_counter_signature_sha256 text,
  p_signed_at timestamptz
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  request_row public.customer_contract_signature_requests%rowtype;
  contract_row public.customer_contracts%rowtype;
  latest_source_id uuid;
  new_signed_file_id uuid;
begin
  select * into request_row from public.customer_contract_signature_requests
    where id = p_request_id for update;
  if not found or request_row.flow_version <> 2 or request_row.status <> 'recipient_signed'
    or request_row.counter_signer_id <> p_user_id then
    raise exception 'Only the selected Flown countersigner may complete this request.';
  end if;
  select * into contract_row from public.customer_contracts
    where id = request_row.contract_id for update;
  if not found or contract_row.status <> 'pending_signature' then
    raise exception 'This contract is no longer awaiting a countersignature.';
  end if;
  select id into latest_source_id from public.customer_contract_files
    where contract_id = request_row.contract_id and file_kind in ('original_pdf', 'document')
      and mime_type = 'application/pdf'
    order by created_at desc, id desc limit 1;
  if latest_source_id is distinct from request_row.source_file_id then
    raise exception 'The original contract PDF changed. The countersignature cannot be completed.';
  end if;
  insert into public.customer_contract_files (
    contract_id, uploaded_by, file_name, storage_path, file_size, mime_type,
    file_kind, sha256, source_file_id
  ) values (
    request_row.contract_id, request_row.created_by, p_signed_file_name,
    p_signed_storage_path, p_signed_file_size, 'application/pdf', 'signed_copy',
    p_signed_sha256, request_row.source_file_id
  ) returning id into new_signed_file_id;

  update public.customer_contract_signature_requests
    set status = 'completed', signed_at = p_signed_at, counter_signed_at = p_signed_at,
      counter_signed_name = (select name from public.profiles where id = p_user_id),
      signed_file_id = new_signed_file_id, signed_sha256 = p_signed_sha256,
      counter_signature_sha256 = p_counter_signature_sha256,
      confirmation_delivery_status = 'failed'
    where id = p_request_id;
  update public.customer_contracts
    set status = 'active', signed_at = p_signed_at, updated_at = p_signed_at
    where id = request_row.contract_id;
  insert into public.customer_contract_signature_events (
    request_id, contract_id, source_file_id, signed_file_id, signer_name, signed_at,
    original_sha256, signed_sha256, signature_sha256
  ) values (
    p_request_id, request_row.contract_id, request_row.source_file_id, new_signed_file_id,
    request_row.recipient_signed_name, request_row.recipient_signed_at,
    request_row.original_sha256, p_signed_sha256, request_row.recipient_signature_sha256
  );
  insert into public.customer_contract_events (contract_id, actor_id, event_type, details)
    values (request_row.contract_id, p_user_id, 'contract_countersigned',
      'Flown countersigned the recipient-signed PDF and created the final agreement.');
  return new_signed_file_id;
end;
$$;

revoke all on function public.create_customer_contract_signature_request_v2(uuid, uuid, uuid, text, text, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function public.mark_customer_contract_signature_request_sent_v2(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.record_customer_contract_recipient_signature(uuid, text, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.record_customer_contract_countersignature(uuid, text, text, text, bigint, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.create_customer_contract_signature_request_v2(uuid, uuid, uuid, text, text, timestamptz, jsonb) to service_role;
grant execute on function public.mark_customer_contract_signature_request_sent_v2(uuid, text, text, text) to service_role;
grant execute on function public.record_customer_contract_recipient_signature(uuid, text, text, text, text, timestamptz) to service_role;
grant execute on function public.record_customer_contract_countersignature(uuid, text, text, text, bigint, text, text, timestamptz) to service_role;

comment on column public.customer_contract_signature_requests.placement_fields is
  'Version 2 e-signature fields in normalized PDF page coordinates; legacy requests remain flow_version 1.';
comment on column public.customer_contract_signature_requests.customer_signed_storage_path is
  'Private intermediate PDF after recipient signing and before Flown countersigning.';
comment on column public.customer_contract_signature_requests.confirmation_delivery_status is
  'Resend status for the final signed-PDF confirmation; signature completion is retained if delivery must be retried.';
