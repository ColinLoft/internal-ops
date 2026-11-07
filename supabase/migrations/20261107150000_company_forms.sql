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
