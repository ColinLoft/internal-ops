-- Collapse grant stages to: prospect, applied, awarded, reporting, closed. Safe to re-run.
alter table public.grants disable trigger grants_stage_automation;
update public.grants set stage = 'prospect' where stage in ('researching', 'preparing');
update public.grants set stage = 'applied' where stage = 'under_review';
update public.grants set stage = 'closed' where stage = 'declined';
alter table public.grants enable trigger grants_stage_automation;
