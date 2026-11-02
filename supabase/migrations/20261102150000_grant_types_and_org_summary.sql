-- Money vs product grants, and an organization summary the AI and applicants can reuse. Safe to re-run.

alter table public.grants add column if not exists grant_type text not null default 'money';
alter table public.grant_prospects add column if not exists grant_type text not null default 'money';
alter table public.grant_settings add column if not exists org_summary text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'grants_grant_type_check') then
    alter table public.grants add constraint grants_grant_type_check check (grant_type in ('money', 'product', 'both'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'grant_prospects_grant_type_check') then
    alter table public.grant_prospects add constraint grant_prospects_grant_type_check check (grant_type in ('money', 'product', 'both'));
  end if;
end $$;
