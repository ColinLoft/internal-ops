-- Presence: last time a signed-in client was active.
alter table public.profiles add column if not exists last_seen_at timestamptz;

-- Lets workspace admins edit staff profiles even when the admin-manage-user Edge Function is unreachable.
-- Email changes still require the Edge Function because they must also update auth.users.
create or replace function public.admin_update_profile(p_user_id text, p_profile jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text;
  target_role text;
begin
  select system_role into caller_role from public.profiles where id = auth.uid()::text;
  if caller_role is distinct from 'admin' then
    raise exception 'Only workspace administrators can edit staff profiles.';
  end if;

  select system_role into target_role from public.profiles where id = p_user_id;
  if not found then
    raise exception 'The staff profile was not found.';
  end if;

  if p_profile ? 'name' and btrim(coalesce(p_profile->>'name', '')) = '' then
    raise exception 'Staff name cannot be blank.';
  end if;

  if p_profile ? 'system_role' then
    if p_profile->>'system_role' not in ('admin', 'coordinator', 'member') then
      raise exception 'Invalid workspace role.';
    end if;
    if p_user_id = auth.uid()::text and p_profile->>'system_role' is distinct from target_role then
      raise exception 'You cannot change your own administrator role.';
    end if;
    if target_role = 'admin' and p_profile->>'system_role' <> 'admin'
       and (select count(*) from public.profiles where system_role = 'admin') <= 1 then
      raise exception 'At least one administrator is required.';
    end if;
  end if;

  update public.profiles set
    name = case when p_profile ? 'name' then p_profile->>'name' else name end,
    role = case when p_profile ? 'role' then p_profile->>'role' else role end,
    department = case when p_profile ? 'department' then p_profile->>'department' else department end,
    phone = case when p_profile ? 'phone' then p_profile->>'phone' else phone end,
    location = case when p_profile ? 'location' then p_profile->>'location' else location end,
    bio = case when p_profile ? 'bio' then p_profile->>'bio' else bio end,
    status_message = case when p_profile ? 'status_message' then p_profile->>'status_message' else status_message end,
    banner = case when p_profile ? 'banner' then p_profile->>'banner' else banner end,
    system_role = case when p_profile ? 'system_role' then p_profile->>'system_role' else system_role end
  where id = p_user_id;
end;
$$;

revoke all on function public.admin_update_profile(text, jsonb) from public;
grant execute on function public.admin_update_profile(text, jsonb) to authenticated;
