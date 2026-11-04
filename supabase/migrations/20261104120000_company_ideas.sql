-- Company-wide ideas board (brand, grants, product, marketing, ...). Safe to re-run.

create table if not exists public.company_ideas (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 200),
  description text check (description is null or char_length(description) <= 5000),
  category text not null default 'general' check (category in ('general', 'brand', 'grants', 'marketing', 'product', 'customers', 'operations', 'legal', 'people')),
  status text not null default 'new' check (status in ('new', 'exploring', 'planned', 'done', 'declined')),
  created_by text not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists company_ideas_created_at_idx on public.company_ideas (created_at desc);

create table if not exists public.company_idea_votes (
  idea_id uuid not null references public.company_ideas(id) on delete cascade,
  user_id text not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (idea_id, user_id)
);

alter table public.company_ideas enable row level security;
alter table public.company_idea_votes enable row level security;

drop policy if exists "Staff can view ideas" on public.company_ideas;
drop policy if exists "Staff can add ideas" on public.company_ideas;
drop policy if exists "Owners and leads can edit ideas" on public.company_ideas;
drop policy if exists "Owners and leads can delete ideas" on public.company_ideas;

create policy "Staff can view ideas" on public.company_ideas for select to authenticated using (true);
create policy "Staff can add ideas" on public.company_ideas for insert to authenticated with check (created_by = auth.uid()::text);
create policy "Owners and leads can edit ideas" on public.company_ideas for update to authenticated
  using (created_by = auth.uid()::text or exists (select 1 from public.profiles where id = auth.uid()::text and system_role in ('admin', 'coordinator')))
  with check (created_by = auth.uid()::text or exists (select 1 from public.profiles where id = auth.uid()::text and system_role in ('admin', 'coordinator')));
create policy "Owners and leads can delete ideas" on public.company_ideas for delete to authenticated
  using (created_by = auth.uid()::text or exists (select 1 from public.profiles where id = auth.uid()::text and system_role in ('admin', 'coordinator')));

drop policy if exists "Staff can view idea votes" on public.company_idea_votes;
drop policy if exists "Staff can add own idea votes" on public.company_idea_votes;
drop policy if exists "Staff can remove own idea votes" on public.company_idea_votes;

create policy "Staff can view idea votes" on public.company_idea_votes for select to authenticated using (true);
create policy "Staff can add own idea votes" on public.company_idea_votes for insert to authenticated with check (user_id = auth.uid()::text);
create policy "Staff can remove own idea votes" on public.company_idea_votes for delete to authenticated using (user_id = auth.uid()::text);

grant select, insert, update, delete on public.company_ideas to authenticated;
grant select, insert, delete on public.company_idea_votes to authenticated;
