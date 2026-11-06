alter table public.company_ideas
  add column if not exists problem text,
  add column if not exists impact text,
  add column if not exists effort text,
  add column if not exists next_step text;

create table if not exists public.company_idea_comments (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references public.company_ideas(id) on delete cascade,
  author_id text not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now()
);

create index if not exists company_idea_comments_thread_idx
  on public.company_idea_comments (idea_id, created_at);

alter table public.company_idea_comments enable row level security;

drop policy if exists "Staff can view idea discussion" on public.company_idea_comments;
create policy "Staff can view idea discussion"
  on public.company_idea_comments for select to authenticated using (true);

drop policy if exists "Staff can add idea discussion" on public.company_idea_comments;
create policy "Staff can add idea discussion"
  on public.company_idea_comments for insert to authenticated
  with check (
    author_id = auth.uid()::text
    and exists (select 1 from public.company_ideas where id = idea_id)
  );

drop policy if exists "Authors and leads can delete idea discussion" on public.company_idea_comments;
create policy "Authors and leads can delete idea discussion"
  on public.company_idea_comments for delete to authenticated
  using (
    author_id = auth.uid()::text
    or exists (select 1 from public.profiles where id = auth.uid()::text and system_role in ('admin', 'coordinator'))
  );

grant select, insert, delete on public.company_idea_comments to authenticated;
