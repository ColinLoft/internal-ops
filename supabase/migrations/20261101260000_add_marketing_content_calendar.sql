-- Marketing content calendar with an approval workflow.
create table if not exists public.gtm_content_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 200),
  body text,
  channel text not null default 'other' check (channel in (
    'instagram', 'facebook', 'linkedin', 'x', 'tiktok', 'youtube', 'newsletter', 'website', 'other'
  )),
  campaign_id uuid references public.gtm_records(id) on delete set null,
  scheduled_for timestamptz,
  status text not null default 'draft' check (status in (
    'draft', 'pending_approval', 'changes_requested', 'approved', 'scheduled', 'published', 'archived'
  )),
  review_note text,
  reviewed_by text,
  reviewed_at timestamptz,
  created_by text not null default auth.uid()::text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists gtm_content_posts_schedule_idx on public.gtm_content_posts(scheduled_for);
create index if not exists gtm_content_posts_status_idx on public.gtm_content_posts(status);

create or replace function public.gtm_content_post_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare
  is_manager boolean := public.has_app_access('gtm', 'manage');
begin
  new.created_by := old.created_by;
  new.updated_at := now();

  if not is_manager then
    -- Authors may only edit while drafting or addressing feedback, and may only submit for review.
    if old.status not in ('draft', 'changes_requested') then
      raise exception 'This post is locked; ask an approver to make changes';
    end if;
    if new.status not in ('draft', 'changes_requested', 'pending_approval') then
      raise exception 'Only approvers can approve, schedule or publish posts';
    end if;
    if new.status = 'changes_requested' and old.status = 'draft' then new.status := 'draft'; end if;
    new.review_note := old.review_note;
    new.reviewed_by := old.reviewed_by;
    new.reviewed_at := old.reviewed_at;
  elsif new.status is distinct from old.status and new.status in ('approved', 'changes_requested') then
    if old.created_by = auth.uid()::text and not public.is_workspace_admin() then
      raise exception 'You cannot review your own post';
    end if;
    new.reviewed_by := auth.uid()::text;
    new.reviewed_at := now();
  end if;

  if new.status in ('scheduled', 'published') and new.scheduled_for is null then
    raise exception 'Set a date before scheduling or publishing';
  end if;
  return new;
end $$;

drop trigger if exists gtm_content_post_guard on public.gtm_content_posts;
create trigger gtm_content_post_guard before update on public.gtm_content_posts for each row execute function public.gtm_content_post_guard();

-- New posts always start as draft or pending review.
create or replace function public.gtm_content_post_insert_guard() returns trigger language plpgsql as $$
begin
  if new.status not in ('draft', 'pending_approval') then new.status := 'draft'; end if;
  new.reviewed_by := null; new.reviewed_at := null; new.review_note := null;
  return new;
end $$;
drop trigger if exists gtm_content_post_insert_guard on public.gtm_content_posts;
create trigger gtm_content_post_insert_guard before insert on public.gtm_content_posts for each row execute function public.gtm_content_post_insert_guard();

alter table public.gtm_content_posts enable row level security;
drop policy if exists "staff view content posts" on public.gtm_content_posts;
create policy "staff view content posts" on public.gtm_content_posts for select to authenticated using (true);
drop policy if exists "marketers add content posts" on public.gtm_content_posts;
create policy "marketers add content posts" on public.gtm_content_posts for insert to authenticated
  with check (created_by = auth.uid()::text and public.has_app_access('gtm', 'edit'));
drop policy if exists "marketers update content posts" on public.gtm_content_posts;
create policy "marketers update content posts" on public.gtm_content_posts for update to authenticated
  using (public.has_app_access('gtm', 'manage') or (created_by = auth.uid()::text and public.has_app_access('gtm', 'edit')))
  with check (public.has_app_access('gtm', 'manage') or (created_by = auth.uid()::text and public.has_app_access('gtm', 'edit')));
drop policy if exists "marketers delete content posts" on public.gtm_content_posts;
create policy "marketers delete content posts" on public.gtm_content_posts for delete to authenticated
  using (public.has_app_access('gtm', 'manage') or (created_by = auth.uid()::text and status = 'draft'));

insert into public.workspace_roles (name, description) values
  ('Marketing team', 'Drafts content and submits it for approval.'),
  ('Marketing approver', 'Reviews, approves and schedules marketing content.')
on conflict (name) do nothing;

insert into public.workspace_role_permissions (role_id, app, level)
select r.id, 'gtm', v.level from public.workspace_roles r
join (values ('Marketing team', 'edit'), ('Marketing approver', 'manage')) as v(name, level) on v.name = r.name
on conflict do nothing;
