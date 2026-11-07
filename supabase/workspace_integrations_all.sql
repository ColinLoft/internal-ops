-- Complete office/email retirement and Company Forms/PDF signing update.
-- Run this entire file in the Supabase SQL Editor as the project database owner.
-- Includes all four migrations for this update; earlier workspace setup is required.
-- Originals remain in migrations/ for CLI history. This manual bundle does not
-- update Supabase CLI migration tracking. Do not put it in migrations/.
-- Existing records are preserved. Can be rerun after these migrations were applied.
-- SQL alone does not deploy Edge Functions; see ../docs/workspace-integrations.md.

begin;

-- Check prerequisites before making changes; an error rolls back the whole bundle.
do $preflight$
declare
  required_table text;
begin
  foreach required_table in array array[
    'auth.users', 'public.profiles',
    'public.drive_items', 'public.drive_versions', 'public.drive_shares',
    'public.customer_contracts', 'public.customer_contract_files',
    'public.customer_contract_events',
    'public.organization_documents', 'public.organization_document_assignments',
    'public.organization_document_responses',
    'public.email_mailboxes', 'public.email_scheduled_sends',
    'storage.buckets', 'storage.objects'
  ] loop
    if to_regclass(required_table) is null then
      raise exception 'Missing prerequisite table: %. Apply earlier workspace migrations before this update.', required_table;
    end if;
  end loop;
  if to_regprocedure('public.has_app_access(text,text)') is null then
    raise exception 'Missing prerequisite function: public.has_app_access(text,text). Apply the app-permissions migration first.';
  end if;
end;
$preflight$;

-- BEGIN 20261107150000_company_forms.sql
-- Copy existing Drive-backed forms and responses into standalone Company Forms
-- tables. Legacy rows remain untouched so archived Drive data is retained.

create table if not exists public.company_forms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  name text not null,
  content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

insert into public.company_forms (id, owner_id, name, content, created_at, updated_at, archived_at)
select id, owner_id, name, content, created_at, updated_at, deleted_at
from public.drive_items
where item_type = 'form'
on conflict (id) do nothing;

create table if not exists public.company_form_collaborators (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.company_forms(id),
  shared_with_user_id uuid references auth.users(id),
  shared_with_email text,
  permission text not null check (permission in ('viewer', 'commenter', 'editor')),
  shared_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check (shared_with_user_id is not null or shared_with_email is not null)
);

insert into public.company_form_collaborators (
  id, form_id, shared_with_user_id, shared_with_email, permission, shared_by, created_at
)
select shares.id, shares.item_id, coalesce(shares.shared_with_user_id, profile.id::uuid),
  lower(shares.shared_with_email), shares.permission, shares.shared_by, shares.created_at
from public.drive_shares shares
join public.company_forms forms on forms.id = shares.item_id
left join public.profiles profile on lower(profile.email) = lower(shares.shared_with_email)
where shares.shared_with_user_id is not null or shares.shared_with_email is not null
on conflict (id) do nothing;

create index if not exists company_form_collaborators_form_idx
  on public.company_form_collaborators(form_id);
create index if not exists company_form_collaborators_user_idx
  on public.company_form_collaborators(shared_with_user_id)
  where shared_with_user_id is not null;

create or replace function public.can_view_company_form(p_form_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and exists (select 1 from public.profiles where id = auth.uid()::text and account_status = 'active')
    and exists (
    select 1 from public.company_forms form
    where form.id = p_form_id
      and (
        form.owner_id = auth.uid()
        or exists (
          select 1 from public.company_form_collaborators collaborator
          where collaborator.form_id = form.id
            and (
              collaborator.shared_with_user_id = auth.uid()
              or lower(collaborator.shared_with_email) = lower(auth.jwt()->>'email')
            )
        )
      )
  );
$$;

create or replace function public.can_edit_company_form(p_form_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and exists (select 1 from public.profiles where id = auth.uid()::text and account_status = 'active')
    and exists (
    select 1 from public.company_forms form
    where form.id = p_form_id
      and (
        form.owner_id = auth.uid()
        or exists (
          select 1 from public.company_form_collaborators collaborator
          where collaborator.form_id = form.id
          and collaborator.permission = 'editor'
          and (
            collaborator.shared_with_user_id = auth.uid()
            or lower(collaborator.shared_with_email) = lower(auth.jwt()->>'email')
          )
        )
      )
  );
$$;

alter table public.company_forms enable row level security;
alter table public.company_form_collaborators enable row level security;

drop policy if exists "Form collaborators can view company forms" on public.company_forms;
create policy "Form collaborators can view company forms"
  on public.company_forms for select to authenticated
  using (public.can_view_company_form(id));

drop policy if exists "Staff can create company forms" on public.company_forms;
create policy "Staff can create company forms"
  on public.company_forms for insert to authenticated
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.profiles where id = auth.uid()::text and account_status = 'active')
  );

drop policy if exists "Form editors can update company forms" on public.company_forms;
create policy "Form editors can update company forms"
  on public.company_forms for update to authenticated
  using (public.can_edit_company_form(id))
  with check (public.can_edit_company_form(id));

drop policy if exists "Form collaborators can view company form shares" on public.company_form_collaborators;
create policy "Form collaborators can view company form shares"
  on public.company_form_collaborators for select to authenticated
  using (public.can_view_company_form(form_id));

grant select, insert, update on public.company_forms to authenticated;
grant select on public.company_form_collaborators to authenticated;
revoke all on public.company_forms from anon;
revoke delete on public.company_forms from authenticated;
revoke all on public.company_form_collaborators from anon;
revoke insert, update, delete on public.company_form_collaborators from anon, authenticated;
grant execute on function public.can_view_company_form(uuid) to authenticated;
grant execute on function public.can_edit_company_form(uuid) to authenticated;
revoke all on function public.can_view_company_form(uuid) from public, anon;
revoke all on function public.can_edit_company_form(uuid) from public, anon;

create or replace function public.protect_company_form_identity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.id is distinct from old.id
    or new.owner_id is distinct from old.owner_id
    or new.created_at is distinct from old.created_at then
    raise exception using message = 'A form owner and record ID cannot be changed.';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists company_form_identity_immutable on public.company_forms;
create trigger company_form_identity_immutable
  before update on public.company_forms
  for each row execute function public.protect_company_form_identity();

create table if not exists public.company_form_publications (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.company_forms(id),
  share_token uuid not null unique default gen_random_uuid(),
  access_scope text not null check (access_scope in ('staff', 'public')),
  published_schema jsonb not null,
  version integer not null check (version > 0),
  published_by uuid not null references auth.users(id),
  published_at timestamptz not null default now(),
  accepting_responses boolean not null default true,
  revoked_at timestamptz,
  unique (form_id, version)
);

create unique index if not exists company_form_one_active_publication_idx
  on public.company_form_publications(form_id)
  where revoked_at is null;

create index if not exists company_form_publications_share_token_idx
  on public.company_form_publications(share_token)
  where revoked_at is null;

alter table public.company_form_publications enable row level security;

drop policy if exists "Form collaborators can view publications" on public.company_form_publications;
create policy "Form collaborators can view publications"
  on public.company_form_publications for select to authenticated
  using (public.can_view_company_form(form_id));

grant select on public.company_form_publications to authenticated;
revoke all on public.company_form_publications from anon;
revoke insert, update, delete on public.company_form_publications from anon, authenticated;

create table if not exists public.company_form_responses (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.company_forms(id),
  publication_id uuid references public.company_form_publications(id),
  submitted_at timestamptz not null default now(),
  duration_seconds integer,
  answers jsonb not null default '{}'::jsonb,
  respondent_email text,
  respondent_name text
);

do $legacy_responses$
begin
  if to_regclass('public.drive_form_responses') is not null then
    insert into public.company_form_responses (
      id, form_id, submitted_at, duration_seconds, answers, respondent_email, respondent_name
    )
    select response.id, response.form_item_id, response.submitted_at, response.duration_seconds,
      response.answers, response.respondent_email, response.respondent_name
    from public.drive_form_responses response
    join public.company_forms form on form.id = response.form_item_id
    on conflict (id) do nothing;
  else
    raise notice 'No legacy Drive form response table exists; Company Forms starts without imported responses.';
  end if;
end;
$legacy_responses$;

create index if not exists company_form_responses_form_idx
  on public.company_form_responses(form_id, submitted_at desc);
create index if not exists company_form_responses_publication_idx
  on public.company_form_responses(publication_id, submitted_at desc)
  where publication_id is not null;

alter table public.company_form_responses enable row level security;
drop policy if exists "Form collaborators can view company form responses" on public.company_form_responses;
create policy "Form collaborators can view company form responses"
  on public.company_form_responses for select to authenticated
  using (public.can_view_company_form(form_id));

grant select on public.company_form_responses to authenticated;
revoke all on public.company_form_responses from anon;
revoke insert, update, delete on public.company_form_responses from anon, authenticated;

-- Retain legacy records but prevent any remaining Drive UI from bypassing the
-- new validated Company Forms submission endpoint.
do $legacy_response_permissions$
begin
  if to_regclass('public.drive_form_responses') is not null then
    drop policy if exists "Anyone can submit an active form" on public.drive_form_responses;
    revoke insert, update, delete on public.drive_form_responses from anon, authenticated;
    grant select on public.drive_form_responses to authenticated;
  end if;
end;
$legacy_response_permissions$;

create or replace function public.prevent_company_form_schema_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.id is distinct from old.id
    or new.form_id is distinct from old.form_id
    or new.share_token is distinct from old.share_token
    or new.access_scope is distinct from old.access_scope
    or new.published_schema is distinct from old.published_schema
    or new.version is distinct from old.version
    or new.published_by is distinct from old.published_by
    or new.published_at is distinct from old.published_at then
    raise exception using message = 'Published form versions are immutable. Publish a new version to change the schema.';
  end if;
  return new;
end;
$$;

drop trigger if exists company_form_publication_schema_immutable on public.company_form_publications;
create trigger company_form_publication_schema_immutable
  before update on public.company_form_publications
  for each row execute function public.prevent_company_form_schema_mutation();

create or replace function public.validate_company_form_schema(p_schema jsonb)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_question jsonb;
  v_parent jsonb;
  v_validation jsonb;
  v_condition jsonb;
  v_questions jsonb;
  v_type text;
  v_id text;
  v_index integer := 0;
  v_ids text[] := array[]::text[];
  v_option_count integer;
  v_min numeric;
  v_max numeric;
  v_min_length integer;
  v_max_length integer;
begin
  if jsonb_typeof(p_schema) <> 'object' then
    raise exception using message = 'Form schema must be an object.';
  end if;
  if jsonb_typeof(p_schema->'title') is distinct from 'string'
    or coalesce(length(p_schema->>'title'), 0) = 0
    or length(p_schema->>'title') > 300 then
    raise exception using message = 'Form title is required and must be 300 characters or fewer.';
  end if;
  if p_schema ? 'description' and jsonb_typeof(p_schema->'description') is distinct from 'string' then
    raise exception using message = 'Form description must be text.';
  end if;
  if length(coalesce(p_schema->>'description', '')) > 5000 then
    raise exception using message = 'Form description must be 5,000 characters or fewer.';
  end if;
  v_questions := p_schema->'questions';
  if jsonb_typeof(v_questions) is distinct from 'array' then
    raise exception using message = 'A form must contain an array of questions.';
  end if;
  if jsonb_array_length(v_questions) > 100 then
    raise exception using message = 'A form must contain an array of no more than 100 questions.';
  end if;

  for v_question in select value from jsonb_array_elements(v_questions)
  loop
    v_index := v_index + 1;
    if jsonb_typeof(v_question) <> 'object' then
      raise exception using message = 'Every form question must be an object.';
    end if;
    v_id := v_question->>'id';
    v_type := v_question->>'type';
    if coalesce(v_id, '') = '' or length(v_id) > 120 or v_id = any(v_ids) then
      raise exception using message = 'Every question must have a unique identifier.';
    end if;
    v_ids := array_append(v_ids, v_id);
    if v_type is null or v_type not in ('short_text', 'paragraph', 'email', 'number', 'date', 'multiple_choice', 'checkbox', 'dropdown', 'scale', 'section') then
      raise exception using message = 'A question has an unsupported field type.';
    end if;
    if jsonb_typeof(v_question->'label') is distinct from 'string'
      or coalesce(length(v_question->>'label'), 0) = 0
      or length(v_question->>'label') > 300 then
      raise exception using message = 'Every question needs a label of 300 characters or fewer.';
    end if;
    if v_question ? 'required' and jsonb_typeof(v_question->'required') <> 'boolean' then
      raise exception using message = 'Question required settings must be true or false.';
    end if;

    if v_type in ('multiple_choice', 'checkbox', 'dropdown') then
      if jsonb_typeof(v_question->'options') is distinct from 'array' then
        raise exception using message = 'Choice questions need an options array.';
      end if;
      if jsonb_array_length(v_question->'options') < 1 or jsonb_array_length(v_question->'options') > 100 then
        raise exception using message = 'Choice questions need between 1 and 100 options.';
      end if;
      if exists (
        select 1 from jsonb_array_elements(v_question->'options') as options(option)
        where jsonb_typeof(options.option) <> 'string'
          or length(btrim(options.option #>> '{}')) = 0
          or length(options.option #>> '{}') > 300
      ) then
        raise exception using message = 'Choice options must be non-empty text of 300 characters or fewer.';
      end if;
      select count(*), count(distinct options.value)
        into v_option_count, v_min_length
        from jsonb_array_elements_text(v_question->'options') as options(value);
      if v_option_count <> v_min_length then
        raise exception using message = 'Choice options must be unique.';
      end if;
    end if;

    if v_type = 'scale' then
      if jsonb_typeof(v_question->'scaleMax') is distinct from 'number' then
        raise exception using message = 'A scale maximum must be a whole number from 2 to 10.';
      end if;
      if (v_question->>'scaleMax')::numeric < 2
        or (v_question->>'scaleMax')::numeric > 10
        or (v_question->>'scaleMax')::numeric <> trunc((v_question->>'scaleMax')::numeric) then
        raise exception using message = 'A scale maximum must be a whole number from 2 to 10.';
      end if;
    end if;

    v_validation := coalesce(v_question->'validation', '{}'::jsonb);
    if jsonb_typeof(v_validation) <> 'object' then
      raise exception using message = 'Question validation settings must be an object.';
    end if;
    v_min := null;
    v_max := null;
    v_min_length := null;
    v_max_length := null;
    if v_validation ? 'min' then
      if jsonb_typeof(v_validation->'min') <> 'number' then raise exception using message = 'Minimum values must be numeric.'; end if;
      v_min := (v_validation->>'min')::numeric;
    end if;
    if v_validation ? 'max' then
      if jsonb_typeof(v_validation->'max') <> 'number' then raise exception using message = 'Maximum values must be numeric.'; end if;
      v_max := (v_validation->>'max')::numeric;
    end if;
    if v_min is not null and v_max is not null and v_min > v_max then
      raise exception using message = 'A question minimum cannot exceed its maximum.';
    end if;
    if v_validation ? 'minLength' then
      if jsonb_typeof(v_validation->'minLength') <> 'number' then raise exception using message = 'Minimum text length must be a whole number.'; end if;
      v_min_length := (v_validation->>'minLength')::integer;
      if v_min_length < 0 or v_min_length > 10000 or (v_validation->>'minLength')::numeric <> v_min_length then
        raise exception using message = 'Minimum text length must be a whole number from 0 to 10,000.';
      end if;
    end if;
    if v_validation ? 'maxLength' then
      if jsonb_typeof(v_validation->'maxLength') <> 'number' then raise exception using message = 'Maximum text length must be a whole number.'; end if;
      v_max_length := (v_validation->>'maxLength')::integer;
      if v_max_length < 1 or v_max_length > 10000 or (v_validation->>'maxLength')::numeric <> v_max_length then
        raise exception using message = 'Maximum text length must be a whole number from 1 to 10,000.';
      end if;
    end if;
    if v_min_length is not null and v_max_length is not null and v_min_length > v_max_length then
      raise exception using message = 'A question minimum text length cannot exceed its maximum.';
    end if;

    v_condition := v_question->'condition';
    if v_condition is not null and jsonb_typeof(v_condition) <> 'null' then
      if jsonb_typeof(v_condition) is distinct from 'object' or coalesce(v_condition->>'questionId', '') = '' then
        raise exception using message = 'A conditional question must reference an earlier choice question.';
      end if;
      select q.value into v_parent
        from jsonb_array_elements(v_questions) with ordinality as q(value, ordinality)
        where q.ordinality < v_index and q.value->>'id' = v_condition->>'questionId'
        order by q.ordinality desc limit 1;
      if v_parent is null or v_parent->>'type' not in ('multiple_choice', 'checkbox', 'dropdown') then
        raise exception using message = 'A conditional question must reference an earlier choice question.';
      end if;
      if coalesce(v_condition->>'value', '') = ''
        or not ((v_parent->'options') @> jsonb_build_array(v_condition->>'value')) then
        raise exception using message = 'The condition answer must match one of the parent question options.';
      end if;
      if v_condition->>'operator' not in ('equals', 'not_equals', 'contains')
        or (v_parent->>'type' = 'checkbox' and v_condition->>'operator' <> 'contains')
        or (v_parent->>'type' <> 'checkbox' and v_condition->>'operator' = 'contains') then
        raise exception using message = 'The condition operator is not valid for its parent question.';
      end if;
    end if;
  end loop;
end;
$$;

create or replace function public.publish_company_form(
  p_form_id uuid,
  p_schema jsonb,
  p_access_scope text,
  p_accepting_responses boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_form public.company_forms%rowtype;
  v_version integer;
  v_publication public.company_form_publications%rowtype;
begin
  if auth.uid() is null then
    raise exception using message = 'Sign in with a staff account to publish forms.';
  end if;
  select * into v_form
    from public.company_forms
    where id = p_form_id and archived_at is null
    for update;
  if not found then
    raise exception using message = 'The form was not found or is no longer available.';
  end if;
  if not public.can_edit_company_form(v_form.id) then
    raise exception using message = 'You do not have permission to publish this form.';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = auth.uid()::text
      and account_status = 'active'
  ) then
    raise exception using message = 'An active staff account is required to publish forms.';
  end if;
  if p_access_scope is null or p_access_scope not in ('staff', 'public') then
    raise exception using message = 'Choose staff-only or public sharing.';
  end if;
  perform public.validate_company_form_schema(p_schema);

  update public.company_form_publications
    set revoked_at = now()
    where form_id = v_form.id and revoked_at is null;
  select coalesce(max(version), 0) + 1 into v_version
    from public.company_form_publications
    where form_id = v_form.id;
  insert into public.company_form_publications (
    form_id, access_scope, published_schema, version, published_by, accepting_responses
  ) values (
    v_form.id, p_access_scope, p_schema, v_version, auth.uid(), coalesce(p_accepting_responses, true)
  ) returning * into v_publication;

  return jsonb_build_object(
    'id', v_publication.id,
    'form_id', v_publication.form_id,
    'share_token', v_publication.share_token,
    'access_scope', v_publication.access_scope,
    'published_schema', v_publication.published_schema,
    'version', v_publication.version,
    'published_at', v_publication.published_at,
    'accepting_responses', v_publication.accepting_responses,
    'revoked_at', v_publication.revoked_at
  );
end;
$$;

create or replace function public.get_company_form(p_share_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_publication public.company_form_publications%rowtype;
begin
  select publication.* into v_publication
    from public.company_form_publications publication
    join public.company_forms form on form.id = publication.form_id
    where publication.share_token = p_share_token
      and publication.revoked_at is null
      and form.archived_at is null;
  if not found then
    raise exception using message = 'This form link is invalid or has expired.';
  end if;
  if v_publication.access_scope = 'staff' and not exists (
    select 1 from public.profiles
    where id = auth.uid()::text
      and account_status = 'active'
  ) then
    raise exception using message = 'This form is limited to signed-in staff accounts.';
  end if;
  return jsonb_build_object(
    'publication_id', v_publication.id,
    'access_scope', v_publication.access_scope,
    'accepting_responses', v_publication.accepting_responses,
    'schema', v_publication.published_schema
  );
end;
$$;

create or replace function public.submit_company_form(
  p_share_token uuid,
  p_answers jsonb,
  p_respondent_name text default null,
  p_respondent_email text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_publication public.company_form_publications%rowtype;
  v_question jsonb;
  v_parent_answer jsonb;
  v_value jsonb;
  v_condition jsonb;
  v_type text;
  v_id text;
  v_parent_id text;
  v_operator text;
  v_text text;
  v_visible boolean;
  v_required boolean;
  v_min numeric;
  v_max numeric;
  v_min_length integer;
  v_max_length integer;
  v_clean_answers jsonb := '{}'::jsonb;
  v_response_id uuid;
  v_respondent_name text;
  v_respondent_email text;
begin
  if p_answers is null or jsonb_typeof(p_answers) is distinct from 'object' or length(p_answers::text) > 500000 then
    raise exception using message = 'Answers must be a valid object under 500 KB.';
  end if;
  select publication.* into v_publication
    from public.company_form_publications publication
    join public.company_forms form on form.id = publication.form_id
    where publication.share_token = p_share_token
      and publication.revoked_at is null
      and form.archived_at is null;
  if not found then
    raise exception using message = 'This form link is invalid or has expired.';
  end if;
  if not v_publication.accepting_responses then
    raise exception using message = 'This form is closed and is no longer accepting responses.';
  end if;
  if v_publication.access_scope = 'staff' and not exists (
    select 1 from public.profiles
    where id = auth.uid()::text
      and account_status = 'active'
  ) then
    raise exception using message = 'This form is limited to signed-in staff accounts.';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(p_answers) as keys(answer_key)
    where not exists (
      select 1 from jsonb_array_elements(v_publication.published_schema->'questions') as questions(question)
      where questions.question->>'id' = keys.answer_key
        and questions.question->>'type' <> 'section'
    )
  ) then
    raise exception using message = 'An answer does not belong to this published form.';
  end if;

  for v_question in select value from jsonb_array_elements(v_publication.published_schema->'questions')
  loop
    v_type := v_question->>'type';
    if v_type = 'section' then continue; end if;
    v_id := v_question->>'id';
    v_condition := v_question->'condition';
    v_visible := true;
    if v_condition is not null and jsonb_typeof(v_condition) <> 'null' then
      v_parent_id := v_condition->>'questionId';
      v_operator := v_condition->>'operator';
      v_parent_answer := p_answers->v_parent_id;
      if v_operator = 'contains' then
        v_visible := coalesce(v_parent_answer @> jsonb_build_array(v_condition->>'value'), false);
      elsif v_parent_answer is null or v_parent_answer = 'null'::jsonb or v_parent_answer = '""'::jsonb then
        v_visible := false;
      else
        v_visible := coalesce(v_parent_answer #>> '{}' = v_condition->>'value', false);
        if v_operator = 'not_equals' then v_visible := not v_visible; end if;
      end if;
    end if;
    if not v_visible then continue; end if;

    v_value := p_answers->v_id;
    if v_value is null
      or v_value = 'null'::jsonb
      or v_value = '""'::jsonb
      or v_value = '[]'::jsonb
      or (jsonb_typeof(v_value) = 'string' and length(btrim(v_value #>> '{}')) = 0) then
      if coalesce((v_question->>'required')::boolean, false) then
        raise exception using message = format('“%s” is required.', v_question->>'label');
      end if;
      continue;
    end if;

    if v_type in ('short_text', 'paragraph', 'email', 'date') then
      if jsonb_typeof(v_value) <> 'string' then
        raise exception using message = format('“%s” must be text.', v_question->>'label');
      end if;
      v_text := v_value #>> '{}';
      v_min_length := coalesce((v_question->'validation'->>'minLength')::integer, 0);
      v_max_length := coalesce((v_question->'validation'->>'maxLength')::integer, 2000);
      if char_length(v_text) < v_min_length or char_length(v_text) > v_max_length then
        raise exception using message = format('“%s” must be between %s and %s characters.', v_question->>'label', v_min_length, v_max_length);
      end if;
      if v_type = 'email' and v_text !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' then
        raise exception using message = format('“%s” must be a valid email address.', v_question->>'label');
      end if;
      if v_type = 'date' and (
        v_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        or to_char(to_date(v_text, 'YYYY-MM-DD'), 'YYYY-MM-DD') <> v_text
      ) then
        raise exception using message = format('“%s” must be a valid date.', v_question->>'label');
      end if;
    elsif v_type in ('multiple_choice', 'dropdown') then
      if jsonb_typeof(v_value) <> 'string'
        or not ((v_question->'options') @> jsonb_build_array(v_value #>> '{}')) then
        raise exception using message = format('Choose one of the listed options for “%s”.', v_question->>'label');
      end if;
    elsif v_type = 'checkbox' then
      if jsonb_typeof(v_value) <> 'array' then
        raise exception using message = format('“%s” must contain a list of choices.', v_question->>'label');
      end if;
      if exists (
        select 1 from jsonb_array_elements(v_value) as answers(selected)
        where jsonb_typeof(answers.selected) <> 'string'
          or not ((v_question->'options') @> jsonb_build_array(answers.selected #>> '{}'))
      ) then
        raise exception using message = format('Choose only listed options for “%s”.', v_question->>'label');
      end if;
    elsif v_type in ('number', 'scale') then
      if jsonb_typeof(v_value) <> 'number' then
        raise exception using message = format('“%s” must be a number.', v_question->>'label');
      end if;
      v_min := coalesce((v_question->'validation'->>'min')::numeric, case when v_type = 'scale' then 1 else null end);
      v_max := coalesce((v_question->'validation'->>'max')::numeric, case when v_type = 'scale' then (v_question->>'scaleMax')::numeric else null end);
      if v_min is not null and (v_value #>> '{}')::numeric < v_min then
        raise exception using message = format('“%s” must be at least %s.', v_question->>'label', v_min);
      end if;
      if v_max is not null and (v_value #>> '{}')::numeric > v_max then
        raise exception using message = format('“%s” must be no greater than %s.', v_question->>'label', v_max);
      end if;
      if v_type = 'scale' and (v_value #>> '{}')::numeric <> trunc((v_value #>> '{}')::numeric) then
        raise exception using message = format('Choose a whole number on the scale for “%s”.', v_question->>'label');
      end if;
    end if;
    v_clean_answers := v_clean_answers || jsonb_build_object(v_id, v_value);
  end loop;

  if length(coalesce(p_respondent_name, '')) > 120 then
    raise exception using message = 'Respondent name must be 120 characters or fewer.';
  end if;
  if length(coalesce(p_respondent_email, '')) > 254
    or (nullif(btrim(p_respondent_email), '') is not null and btrim(p_respondent_email) !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$') then
    raise exception using message = 'Enter a valid respondent email address under 255 characters.';
  end if;

  if v_publication.access_scope = 'staff' then
    select name, email into v_respondent_name, v_respondent_email
      from public.profiles
      where id = auth.uid()::text and account_status = 'active';
  else
    v_respondent_name := nullif(btrim(p_respondent_name), '');
    v_respondent_email := nullif(lower(btrim(p_respondent_email)), '');
  end if;

  insert into public.company_form_responses (
    form_id, publication_id, answers, respondent_name, respondent_email
  ) values (
    v_publication.form_id,
    v_publication.id,
    v_clean_answers,
    v_respondent_name,
    v_respondent_email
  ) returning id into v_response_id;
  return v_response_id;
end;
$$;

create or replace function public.set_company_form_accepting(
  p_publication_id uuid,
  p_accepting_responses boolean
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_form_id uuid;
begin
  if auth.uid() is null then
    raise exception using message = 'Sign in with a staff account to change response settings.';
  end if;
  select form_id into v_form_id
    from public.company_form_publications
    where id = p_publication_id and revoked_at is null;
  if not found then
    raise exception using message = 'This form version is no longer active.';
  end if;
  if not public.can_edit_company_form(v_form_id) then
    raise exception using message = 'You do not have permission to change this form.';
  end if;
  update public.company_form_publications
    set accepting_responses = p_accepting_responses
    where id = p_publication_id and revoked_at is null;
  return true;
end;
$$;

revoke all on function public.validate_company_form_schema(jsonb) from public, anon, authenticated;
revoke all on function public.prevent_company_form_schema_mutation() from public, anon, authenticated;
revoke all on function public.publish_company_form(uuid, jsonb, text, boolean) from public, anon, authenticated;
revoke all on function public.get_company_form(uuid) from public, anon, authenticated;
revoke all on function public.submit_company_form(uuid, jsonb, text, text) from public, anon, authenticated;
revoke all on function public.set_company_form_accepting(uuid, boolean) from public, anon, authenticated;

grant execute on function public.publish_company_form(uuid, jsonb, text, boolean) to authenticated;
grant execute on function public.get_company_form(uuid) to anon, authenticated;
grant execute on function public.submit_company_form(uuid, jsonb, text, text) to anon, authenticated;
grant execute on function public.set_company_form_accepting(uuid, boolean) to authenticated;
-- END 20261107150000_company_forms.sql

-- BEGIN 20261107151000_pdf_contracts_and_document_signing.sql
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
-- END 20261107151000_pdf_contracts_and_document_signing.sql

-- BEGIN 20261110140000_retire_personal_email.sql
-- Preserve mailbox records, but exclude personal accounts from workspace access.
drop policy if exists "Operational shared mailboxes only" on public.email_mailboxes;
create policy "Operational shared mailboxes only"
on public.email_mailboxes as restrictive for select to authenticated
using (mailbox_type = 'shared');

-- Existing drafts and messages remain stored; pending personal delivery is stopped.
update public.email_scheduled_sends as scheduled
set status = 'cancelled', last_error = 'Personal email has been retired. Send this message from your email provider.'
where scheduled.status in ('scheduled', 'processing')
and exists (
  select 1 from public.email_mailboxes as mailbox
  where mailbox.id = scheduled.mailbox_id and mailbox.mailbox_type = 'personal'
);

notify pgrst, 'reload schema';
-- END 20261110140000_retire_personal_email.sql

-- BEGIN 20261110141000_retire_office_editors.sql
-- Retain archived sources for downloads, but stop office editor mutations.
revoke insert, update, delete on public.drive_items, public.drive_versions, public.drive_shares
from anon, authenticated;

notify pgrst, 'reload schema';
-- END 20261110141000_retire_office_editors.sql

notify pgrst, 'reload schema';
commit;
