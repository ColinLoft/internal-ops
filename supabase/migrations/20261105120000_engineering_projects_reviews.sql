-- Engineering projects (Software, Mechanical, Electrical, Systems), their logs, files, tasks and review workflow.

-- Retire the general-purpose projects. Tasks are kept and simply become project-less.
update public.program_tasks set project_id = null where project_id is not null;
delete from public.program_projects;

create table if not exists public.eng_projects (
  id uuid primary key default gen_random_uuid(),
  discipline text not null check (discipline in ('software', 'mechanical', 'electrical', 'systems')),
  name text not null,
  description text,
  status text not null default 'planning' check (status in ('planning', 'active', 'in_review', 'on_hold', 'completed', 'archived')),
  owner_id text references public.profiles(id) on delete set null,
  start_date date,
  target_date date,
  created_by text not null default auth.uid()::text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.eng_project_entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.eng_projects(id) on delete cascade,
  author_id text not null default auth.uid()::text,
  kind text not null default 'update' check (kind in ('update', 'decision', 'issue', 'milestone')),
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.eng_project_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.eng_projects(id) on delete cascade,
  uploaded_by text not null default auth.uid()::text,
  name text not null,
  storage_path text not null,
  size_bytes bigint,
  mime_type text,
  kind text not null default 'other' check (kind in ('model_3d', 'cad', 'pcb', 'code', 'doc', 'other')),
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.eng_reviewers (
  user_id text not null references public.profiles(id) on delete cascade,
  discipline text not null check (discipline in ('software', 'mechanical', 'electrical', 'systems')),
  created_at timestamptz not null default now(),
  primary key (user_id, discipline)
);

create table if not exists public.eng_reviews (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.eng_projects(id) on delete cascade,
  file_id uuid references public.eng_project_files(id) on delete set null,
  review_type text not null check (review_type in ('cad', 'pcb', 'code', 'design', 'safety', 'release')),
  title text not null,
  summary text,
  requested_action text,
  status text not null default 'pending' check (status in ('pending', 'in_review', 'decided')),
  outcome text,
  decision_note text,
  decided_by text,
  decided_at timestamptz,
  submitted_by text not null default auth.uid()::text,
  created_at timestamptz not null default now()
);

create table if not exists public.eng_review_votes (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.eng_reviews(id) on delete cascade,
  reviewer_id text not null default auth.uid()::text,
  verdict text not null check (verdict in ('approve', 'changes', 'reject')),
  comment text,
  created_at timestamptz not null default now(),
  unique (review_id, reviewer_id)
);

alter table public.program_tasks
  add column if not exists eng_project_id uuid references public.eng_projects(id) on delete cascade;
create index if not exists program_tasks_eng_project_idx on public.program_tasks (eng_project_id);
create index if not exists eng_project_entries_project_idx on public.eng_project_entries (project_id, created_at desc);
create index if not exists eng_project_files_project_idx on public.eng_project_files (project_id, created_at desc);
create index if not exists eng_reviews_project_idx on public.eng_reviews (project_id, created_at desc);

create or replace function public.is_eng_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid()::text and system_role in ('admin', 'coordinator'));
$$;

create or replace function public.can_manage_eng_project(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_eng_admin() or exists (
    select 1 from public.eng_projects p where p.id = target and (p.owner_id = auth.uid()::text or p.created_by = auth.uid()::text)
  );
$$;

create or replace function public.can_review_eng(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_eng_admin() or exists (
    select 1 from public.eng_reviews r
    join public.eng_projects p on p.id = r.project_id
    join public.eng_reviewers rv on rv.discipline = p.discipline and rv.user_id = auth.uid()::text
    where r.id = target
  );
$$;

alter table public.eng_projects enable row level security;
alter table public.eng_project_entries enable row level security;
alter table public.eng_project_files enable row level security;
alter table public.eng_reviewers enable row level security;
alter table public.eng_reviews enable row level security;
alter table public.eng_review_votes enable row level security;

grant select, insert, update, delete on public.eng_projects, public.eng_project_entries, public.eng_project_files,
  public.eng_reviewers, public.eng_reviews, public.eng_review_votes to authenticated;

-- Projects
drop policy if exists "Staff read eng projects" on public.eng_projects;
create policy "Staff read eng projects" on public.eng_projects for select to authenticated using (true);
drop policy if exists "Staff create eng projects" on public.eng_projects;
create policy "Staff create eng projects" on public.eng_projects for insert to authenticated with check (created_by = auth.uid()::text);
drop policy if exists "Owners update eng projects" on public.eng_projects;
create policy "Owners update eng projects" on public.eng_projects for update to authenticated
  using (public.can_manage_eng_project(id)) with check (public.can_manage_eng_project(id));
drop policy if exists "Owners delete eng projects" on public.eng_projects;
create policy "Owners delete eng projects" on public.eng_projects for delete to authenticated using (public.can_manage_eng_project(id));

-- Log entries
drop policy if exists "Staff read eng entries" on public.eng_project_entries;
create policy "Staff read eng entries" on public.eng_project_entries for select to authenticated using (true);
drop policy if exists "Staff add eng entries" on public.eng_project_entries;
create policy "Staff add eng entries" on public.eng_project_entries for insert to authenticated with check (author_id = auth.uid()::text);
drop policy if exists "Authors delete eng entries" on public.eng_project_entries;
create policy "Authors delete eng entries" on public.eng_project_entries for delete to authenticated
  using (author_id = auth.uid()::text or public.can_manage_eng_project(project_id));

-- Files
drop policy if exists "Staff read eng files" on public.eng_project_files;
create policy "Staff read eng files" on public.eng_project_files for select to authenticated using (true);
drop policy if exists "Staff add eng files" on public.eng_project_files;
create policy "Staff add eng files" on public.eng_project_files for insert to authenticated with check (uploaded_by = auth.uid()::text);
drop policy if exists "Uploaders delete eng files" on public.eng_project_files;
create policy "Uploaders delete eng files" on public.eng_project_files for delete to authenticated
  using (uploaded_by = auth.uid()::text or public.can_manage_eng_project(project_id));

-- Review team
drop policy if exists "Staff read reviewers" on public.eng_reviewers;
create policy "Staff read reviewers" on public.eng_reviewers for select to authenticated using (true);
drop policy if exists "Admins manage reviewers" on public.eng_reviewers;
create policy "Admins manage reviewers" on public.eng_reviewers for all to authenticated
  using (public.is_eng_admin()) with check (public.is_eng_admin());

-- Reviews
drop policy if exists "Staff read eng reviews" on public.eng_reviews;
create policy "Staff read eng reviews" on public.eng_reviews for select to authenticated using (true);
drop policy if exists "Staff submit eng reviews" on public.eng_reviews;
create policy "Staff submit eng reviews" on public.eng_reviews for insert to authenticated
  with check (submitted_by = auth.uid()::text and status = 'pending');
drop policy if exists "Owners decide eng reviews" on public.eng_reviews;
create policy "Owners decide eng reviews" on public.eng_reviews for update to authenticated
  using (submitted_by = auth.uid()::text or public.can_manage_eng_project(project_id))
  with check (submitted_by = auth.uid()::text or public.can_manage_eng_project(project_id));
drop policy if exists "Owners delete eng reviews" on public.eng_reviews;
create policy "Owners delete eng reviews" on public.eng_reviews for delete to authenticated
  using (submitted_by = auth.uid()::text or public.can_manage_eng_project(project_id));

-- Votes: only the review team (or admins) may vote, and only while the review is open.
drop policy if exists "Staff read eng votes" on public.eng_review_votes;
create policy "Staff read eng votes" on public.eng_review_votes for select to authenticated using (true);
drop policy if exists "Reviewers vote" on public.eng_review_votes;
create policy "Reviewers vote" on public.eng_review_votes for insert to authenticated
  with check (
    reviewer_id = auth.uid()::text
    and public.can_review_eng(review_id)
    and exists (select 1 from public.eng_reviews r where r.id = review_id and r.status <> 'decided')
  );
drop policy if exists "Reviewers change vote" on public.eng_review_votes;
create policy "Reviewers change vote" on public.eng_review_votes for update to authenticated
  using (reviewer_id = auth.uid()::text and exists (select 1 from public.eng_reviews r where r.id = review_id and r.status <> 'decided'))
  with check (reviewer_id = auth.uid()::text);

create or replace function public.eng_review_mark_in_review()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.eng_reviews set status = 'in_review' where id = new.review_id and status = 'pending';
  return new;
end;
$$;
drop trigger if exists eng_review_vote_progress on public.eng_review_votes;
create trigger eng_review_vote_progress after insert on public.eng_review_votes
  for each row execute function public.eng_review_mark_in_review();

-- Files for models, PCB packages and code archives
insert into storage.buckets (id, name, public, file_size_limit)
values ('engineering-files', 'engineering-files', false, 52428800)
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

drop policy if exists "Staff read engineering files" on storage.objects;
create policy "Staff read engineering files" on storage.objects for select to authenticated using (bucket_id = 'engineering-files');
drop policy if exists "Staff upload engineering files" on storage.objects;
create policy "Staff upload engineering files" on storage.objects for insert to authenticated
  with check (bucket_id = 'engineering-files' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Staff delete own engineering files" on storage.objects;
create policy "Staff delete own engineering files" on storage.objects for delete to authenticated
  using (bucket_id = 'engineering-files' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_eng_admin()));
