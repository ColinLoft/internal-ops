create or replace function public.is_support_agent()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()::text and system_role in ('admin', 'coordinator')
  );
$$;

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number bigint generated always as identity unique,
  subject text not null check (char_length(subject) between 1 and 200),
  description text not null default '' check (char_length(description) <= 10000),
  category text not null default 'general' check (category in (
    'customer_support', 'technical', 'product', 'website', 'partnership', 'general', 'internal_it', 'equipment'
  )),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'new' check (status in ('new', 'open', 'in_progress', 'waiting', 'resolved', 'closed')),
  requester_id text not null default auth.uid()::text references public.profiles(id) on delete restrict,
  assignee_id text references public.profiles(id) on delete set null,
  organization_name text,
  due_at timestamptz,
  resolution text,
  resolved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_ticket_comments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  author_id text not null default auth.uid()::text references public.profiles(id) on delete restrict,
  body text not null check (char_length(body) between 1 and 10000),
  is_internal boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists support_tickets_status_idx on public.support_tickets (status, created_at desc);
create index if not exists support_tickets_assignee_idx on public.support_tickets (assignee_id);
create index if not exists support_tickets_requester_idx on public.support_tickets (requester_id);
create index if not exists support_ticket_comments_ticket_idx on public.support_ticket_comments (ticket_id, created_at);

create or replace function public.support_ticket_before_write()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  if tg_op = 'UPDATE' then
    new.requester_id = old.requester_id;
    if new.status in ('resolved', 'closed') and old.status not in ('resolved', 'closed') then
      new.resolved_at = coalesce(new.resolved_at, now());
    end if;
    if new.status = 'closed' and old.status <> 'closed' then new.closed_at = now(); end if;
    if new.status not in ('resolved', 'closed') then
      new.resolved_at = null;
      new.closed_at = null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists support_ticket_before_write on public.support_tickets;
create trigger support_ticket_before_write
  before insert or update on public.support_tickets
  for each row execute function public.support_ticket_before_write();

alter table public.support_tickets enable row level security;
alter table public.support_ticket_comments enable row level security;

drop policy if exists "view permitted support tickets" on public.support_tickets;
drop policy if exists "create own support tickets" on public.support_tickets;
drop policy if exists "agents manage support tickets" on public.support_tickets;
drop policy if exists "view permitted support comments" on public.support_ticket_comments;
drop policy if exists "add permitted support comments" on public.support_ticket_comments;

create policy "view permitted support tickets" on public.support_tickets for select to authenticated
  using (requester_id = auth.uid()::text or assignee_id = auth.uid()::text or public.is_support_agent());
create policy "create own support tickets" on public.support_tickets for insert to authenticated
  with check (requester_id = auth.uid()::text and status = 'new' and assignee_id is null and resolution is null);
create policy "agents manage support tickets" on public.support_tickets for update to authenticated
  using (public.is_support_agent() or assignee_id = auth.uid()::text)
  with check (public.is_support_agent() or assignee_id = auth.uid()::text);

create policy "view permitted support comments" on public.support_ticket_comments for select to authenticated
  using (
    exists (select 1 from public.support_tickets t where t.id = ticket_id)
    and (not is_internal or public.is_support_agent())
  );
create policy "add permitted support comments" on public.support_ticket_comments for insert to authenticated
  with check (
    author_id = auth.uid()::text
    and exists (select 1 from public.support_tickets t where t.id = ticket_id)
    and (not is_internal or public.is_support_agent())
  );

revoke all on public.support_tickets, public.support_ticket_comments from anon;
grant select, insert, update on public.support_tickets to authenticated;
grant select, insert on public.support_ticket_comments to authenticated;
