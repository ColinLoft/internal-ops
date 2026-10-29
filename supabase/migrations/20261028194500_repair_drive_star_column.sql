do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'drive_items'
      and column_name = 'is_started'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'drive_items'
      and column_name = 'is_starred'
  ) then
    alter table public.drive_items rename column is_started to is_starred;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'drive_items'
      and column_name = 'is_starred'
  ) then
    alter table public.drive_items add column is_starred boolean not null default false;
  end if;
end $$;

alter table public.drive_items drop constraint if exists drive_items_item_type_check;
alter table public.drive_items
  add constraint drive_items_item_type_check
  check (item_type in ('folder', 'document', 'presentation', 'spreadsheet', 'form', 'file'));

drop policy if exists "Drive items can be edited by collaborators" on public.drive_items;
create policy "Drive items can be edited by collaborators"
  on public.drive_items for update to authenticated
  using (
    exists (
      select 1
      from public.drive_shares
      where drive_shares.item_id = drive_items.id
        and drive_shares.shared_with_user_id = auth.uid()
        and drive_shares.permission = 'editor'
    )
  )
  with check (
    exists (
      select 1
      from public.drive_shares
      where drive_shares.item_id = drive_items.id
        and drive_shares.shared_with_user_id = auth.uid()
        and drive_shares.permission = 'editor'
    )
  );
