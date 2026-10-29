alter table public.email_settings
  add column if not exists ai_summaries_enabled boolean not null default true;

update public.email_settings
set ai_summaries_enabled = true
where id = true;
