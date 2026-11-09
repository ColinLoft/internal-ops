  -- Invitations and orphan profiles are not active staff. Never delete or merge accounts to change a metric.
  create or replace function public.active_staff_metrics()
  returns jsonb language plpgsql stable security definer set search_path = public as $$
  declare result jsonb;
  begin
    if auth.uid() is null or not public.has_app_access('insights', 'view') then
      raise exception 'Insights access required.' using errcode = '42501';
    end if;
    select jsonb_build_object(
      'count', count(*),
      'online', count(*) filter (where p.last_seen_at > now() - interval '4 minutes')
    ) into result
    from public.profiles p
    join auth.users u on u.id::text = p.id
    where (
        coalesce(p.account_status, 'active') = 'active'
        or (p.account_status = 'suspended' and p.suspended_until <= now())
      )
      and u.deleted_at is null
      and u.email is not null
      and u.last_sign_in_at is not null
      and (u.banned_until is null or u.banned_until <= now());
    return result;
  end $$;
  revoke all on function public.active_staff_metrics() from public, anon;
  grant execute on function public.active_staff_metrics() to authenticated;
  notify pgrst, 'reload schema';
