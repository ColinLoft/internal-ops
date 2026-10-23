create table if not exists public.call_sessions (
  id text primary key,
  room_name text not null unique,
  conversation_id text,
  channel_id text references public.channels(id) on delete set null,
  caller_id text not null references public.profiles(id) on delete cascade,
  participant_ids text[] not null,
  declined_by text[] not null default array[]::text[],
  call_type text not null check (call_type in ('audio', 'video')),
  status text not null default 'ringing' check (status in ('ringing', 'active', 'ended')),
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

create index if not exists call_sessions_participants_status_idx
  on public.call_sessions using gin (participant_ids);
create index if not exists call_sessions_status_created_at_idx
  on public.call_sessions (status, created_at desc);

alter table public.call_sessions enable row level security;

drop policy if exists "Call participants can read their calls" on public.call_sessions;
drop policy if exists "Call participants can create calls" on public.call_sessions;
drop policy if exists "Call initiator can update their calls" on public.call_sessions;

create policy "Call participants can read their calls"
  on public.call_sessions for select to authenticated
  using (auth.uid()::text = any(participant_ids));

create policy "Call participants can create calls"
  on public.call_sessions for insert to authenticated
  with check (
    caller_id = auth.uid()::text
    and auth.uid()::text = any(participant_ids)
    and cardinality(participant_ids) between 2 and 8
  );

create policy "Call initiator can update their calls"
  on public.call_sessions for update to authenticated
  using (caller_id = auth.uid()::text)
  with check (caller_id = auth.uid()::text);

grant select, insert, update on public.call_sessions to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'call_sessions'
  ) then
    alter publication supabase_realtime add table public.call_sessions;
  end if;
end;
$$;

notify pgrst, 'reload schema';
