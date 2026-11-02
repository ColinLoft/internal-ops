-- Every grant with a funder name is linked to a CRM funder organization (created if missing). Safe to re-run.

create or replace function public.grant_link_funder()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  org_id uuid;
  clean text := nullif(btrim(new.funder_name), '');
begin
  if new.funder_org_id is not null or clean is null then
    return new;
  end if;
  select id into org_id from public.crm_organizations where lower(name) = lower(clean) order by created_at limit 1;
  if org_id is null then
    insert into public.crm_organizations (name, category, website, owner_id, created_by)
    values (left(clean, 200), 'funder', new.website_url, coalesce(new.owner_id, auth.uid()::text), coalesce(auth.uid()::text, new.created_by, 'system'))
    returning id into org_id;
  end if;
  new.funder_org_id := org_id;
  return new;
end;
$$;

drop trigger if exists grants_link_funder on public.grants;
create trigger grants_link_funder before insert or update of funder_name on public.grants
for each row execute function public.grant_link_funder();

-- Backfill existing grants.
update public.grants set funder_name = funder_name where funder_org_id is null and nullif(btrim(funder_name), '') is not null;
