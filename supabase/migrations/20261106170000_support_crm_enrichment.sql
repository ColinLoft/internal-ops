alter table public.crm_organizations
  drop constraint if exists crm_organizations_category_check;

update public.crm_organizations
set category = case when category = 'funder' then 'funder' else 'customer' end
where category not in ('customer', 'funder');

alter table public.crm_organizations
  alter column category set default 'customer',
  add constraint crm_organizations_category_check
    check (category in ('customer', 'funder'));

create index if not exists support_conversations_ticket_idx
  on public.support_conversations (ticket_id, last_message_at desc)
  where ticket_id is not null;

create index if not exists crm_interactions_contact_idx
  on public.crm_interactions (contact_id, occurred_at desc)
  where contact_id is not null;
