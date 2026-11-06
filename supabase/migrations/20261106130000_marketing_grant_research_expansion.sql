-- Marketing studio content fields and richer grant research context.
alter table public.gtm_content_posts
  add column if not exists objective text,
  add column if not exists audience text,
  add column if not exists hashtags text[] not null default '{}',
  add column if not exists call_to_action text,
  add column if not exists media_url text,
  add column if not exists published_url text,
  add column if not exists reach bigint,
  add column if not exists engagements bigint,
  add column if not exists link_clicks bigint;

alter table public.gtm_records
  add column if not exists objective text,
  add column if not exists audience text,
  add column if not exists channels text[] not null default '{}',
  add column if not exists budget numeric(14,2);

alter table public.grant_resources
  add column if not exists summary text not null default '',
  add column if not exists audience text not null default '',
  add column if not exists content_format text not null default 'markdown'
    check (content_format in ('markdown', 'plain_text'));

alter table public.grant_prospects
  add column if not exists application_url text,
  add column if not exists source_url text,
  add column if not exists source_title text,
  add column if not exists research_verified_at timestamptz;

create index if not exists grant_resources_updated_idx on public.grant_resources (updated_at desc);
create index if not exists gtm_content_posts_campaign_idx on public.gtm_content_posts (campaign_id, scheduled_for);
