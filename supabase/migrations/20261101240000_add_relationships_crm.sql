-- Relationships (CRM): organizations, contacts and interactions with follow-ups.
create table if not exists public.crm_organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  category text not null default 'other' check (category in (
    'customer', 'prospect', 'partner', 'funder', 'vendor', 'government', 'media', 'community', 'other'
  )),
  website text,
  notes text,
  owner_id text,
  created_by text not null default auth.uid()::text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.crm_organizations(id) on delete set null,
  name text not null check (char_length(name) between 1 and 200),
  role_title text,
  email text,
  phone text,
  notes text,
  owner_id text,
  created_by text not null default auth.uid()::text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_interactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.crm_organizations(id) on delete cascade,
  contact_id uuid references public.crm_contacts(id) on delete set null,
  kind text not null default 'note' check (kind in ('note', 'call', 'email', 'meeting', 'follow_up')),
  subject text not null check (char_length(subject) between 1 and 300),
  body text,
  occurred_at timestamptz not null default now(),
  follow_up_at timestamptz,
  follow_up_done boolean not null default false,
  owner_id text,
  created_by text not null default auth.uid()::text,
  created_at timestamptz not null default now()
);

create index if not exists crm_contacts_org_idx on public.crm_contacts(organization_id);
create index if not exists crm_interactions_org_idx on public.crm_interactions(organization_id, occurred_at desc);
create index if not exists crm_interactions_followup_idx on public.crm_interactions(follow_up_at) where follow_up_at is not null and not follow_up_done;

create or replace function public.crm_touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); new.created_by = coalesce(old.created_by, new.created_by); return new; end $$;

drop trigger if exists crm_organizations_touch on public.crm_organizations;
create trigger crm_organizations_touch before update on public.crm_organizations for each row execute function public.crm_touch_updated_at();
drop trigger if exists crm_contacts_touch on public.crm_contacts;
create trigger crm_contacts_touch before update on public.crm_contacts for each row execute function public.crm_touch_updated_at();

alter table public.crm_organizations enable row level security;
alter table public.crm_contacts enable row level security;
alter table public.crm_interactions enable row level security;

do $$
declare t text;
begin
  foreach t in array array['crm_organizations', 'crm_contacts', 'crm_interactions'] loop
    execute format('drop policy if exists "staff view %1$s" on public.%1$I', t);
    execute format('drop policy if exists "staff insert %1$s" on public.%1$I', t);
    execute format('drop policy if exists "staff update %1$s" on public.%1$I', t);
    execute format('drop policy if exists "staff delete %1$s" on public.%1$I', t);
    execute format('create policy "staff view %1$s" on public.%1$I for select to authenticated using (public.has_app_access(''customers'', ''view'') or created_by = auth.uid()::text)', t);
    execute format('create policy "staff insert %1$s" on public.%1$I for insert to authenticated with check (created_by = auth.uid()::text and public.has_app_access(''customers'', ''edit''))', t);
    execute format('create policy "staff update %1$s" on public.%1$I for update to authenticated using (public.has_app_access(''customers'', ''edit'') and (created_by = auth.uid()::text or owner_id = auth.uid()::text or public.has_app_access(''customers'', ''manage''))) with check (public.has_app_access(''customers'', ''edit''))', t);
    execute format('create policy "staff delete %1$s" on public.%1$I for delete to authenticated using (public.has_app_access(''customers'', ''manage'') or created_by = auth.uid()::text)', t);
  end loop;
end $$;

insert into public.workspace_roles (name, description)
values ('Relationships team', 'Maintains organizations, contacts and interaction history.')
on conflict (name) do nothing;

insert into public.workspace_role_permissions (role_id, app, level)
select r.id, 'customers', 'edit' from public.workspace_roles r where r.name = 'Relationships team'
on conflict do nothing;
