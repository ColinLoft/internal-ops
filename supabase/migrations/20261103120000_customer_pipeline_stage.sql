-- Customer pipeline stage for the configurable pipeline board.
alter table public.crm_organizations
  add column if not exists stage text not null default 'lead';

alter table public.crm_organizations drop constraint if exists crm_organizations_stage_check;
alter table public.crm_organizations
  add constraint crm_organizations_stage_check check (stage in ('lead', 'qualified', 'active', 'at_risk', 'inactive'));

create index if not exists crm_organizations_stage_idx on public.crm_organizations (stage);
