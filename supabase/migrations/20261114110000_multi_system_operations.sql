-- Keep one incident/window across all affected systems, preserving legacy system_id clients.
alter table public.flown_system_incidents add column if not exists system_ids uuid[] not null default '{}';
alter table public.flown_system_maintenance add column if not exists system_ids uuid[] not null default '{}';
update public.flown_system_incidents set system_ids = array[system_id] where cardinality(system_ids) = 0;
update public.flown_system_maintenance set system_ids = array[system_id] where cardinality(system_ids) = 0;

create or replace function public.flown_operation_systems()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if new.system_id is distinct from old.system_id and new.system_ids = old.system_ids then
      new.system_ids := array[new.system_id];
    end if;
  end if;
  if cardinality(new.system_ids) = 0 then
    new.system_ids := array[new.system_id];
  end if;
  if array_position(new.system_ids, null) is not null then
    raise exception 'Choose valid affected systems.' using errcode = '23514';
  end if;
  select array_agg(id order by first_position) into new.system_ids
  from (select id, min(position) first_position
        from unnest(new.system_ids) with ordinality as ids(id, position) group by id) unique_ids;
  -- Lock references so concurrent inventory deletion cannot leave orphan IDs.
  perform id from public.flown_systems where id = any(new.system_ids) order by id for key share;
  if new.system_ids is null or
    (select count(*) from public.flown_systems where id = any(new.system_ids)) <> cardinality(new.system_ids) then
    raise exception 'An affected system no longer exists. Refresh and try again.' using errcode = '23503';
  end if;
  new.system_id := new.system_ids[1];
  return new;
end; $$;
revoke all on function public.flown_operation_systems() from public, anon, authenticated;

drop trigger if exists flown_operation_systems on public.flown_system_incidents;
create trigger flown_operation_systems before insert or update on public.flown_system_incidents
for each row execute function public.flown_operation_systems();
drop trigger if exists flown_operation_systems on public.flown_system_maintenance;
create trigger flown_operation_systems before insert or update on public.flown_system_maintenance
for each row execute function public.flown_operation_systems();

-- Deleting one affected system must not erase the record belonging to other systems.
create or replace function public.flown_operations_detach_system()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.flown_system_incidents where system_ids = array[old.id];
  delete from public.flown_system_maintenance where system_ids = array[old.id];
  update public.flown_system_incidents
    set system_ids = array_remove(system_ids, old.id),
        system_id = (array_remove(system_ids, old.id))[1]
    where old.id = any(system_ids);
  update public.flown_system_maintenance
    set system_ids = array_remove(system_ids, old.id),
        system_id = (array_remove(system_ids, old.id))[1]
    where old.id = any(system_ids);
  return old;
end; $$;
revoke all on function public.flown_operations_detach_system() from public, anon, authenticated;
drop trigger if exists flown_operations_detach_system on public.flown_systems;
create trigger flown_operations_detach_system before delete on public.flown_systems
for each row execute function public.flown_operations_detach_system();

create index if not exists flown_incident_affected_systems_idx on public.flown_system_incidents using gin(system_ids);
create index if not exists flown_maintenance_affected_systems_idx on public.flown_system_maintenance using gin(system_ids);
notify pgrst, 'reload schema';
