-- Retain archived sources for downloads, but stop office editor mutations.
revoke insert, update, delete on public.drive_items, public.drive_versions, public.drive_shares
from anon, authenticated;

notify pgrst, 'reload schema';
