-- The original open read policies were created with a capitalised name, so the earlier
-- lowercase DROP POLICY did not remove them and finance/legal stayed readable by all staff.
drop policy if exists "Authenticated staff can view finance_records" on public.finance_records;
drop policy if exists "Authenticated staff can view legal_records" on public.legal_records;
