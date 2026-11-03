-- Internal help requests (bug, how-to help, feature request, access) share the support ticket system. Safe to re-run.
alter table public.support_tickets drop constraint if exists support_tickets_category_check;
alter table public.support_tickets add constraint support_tickets_category_check check (category in (
  'customer_support', 'technical', 'product', 'website', 'partnership', 'general', 'internal_it', 'equipment',
  'bug', 'help', 'feature_request', 'access'
));
