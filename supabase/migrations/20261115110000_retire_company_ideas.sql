-- Explicitly requested retirement: permanently removes ideas, votes and discussions.
-- No CASCADE: unexpected dependencies must be reviewed rather than removed silently.
drop table if exists public.company_idea_comments;
drop table if exists public.company_idea_votes;
drop table if exists public.company_ideas;
notify pgrst, 'reload schema';
