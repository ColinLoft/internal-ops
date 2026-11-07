# Shared tasks

Apply `supabase/migrations/20261110130000_shared_task_assignments.sql` before deploying the task updates. It backfills multi-person assignments from existing assignments, keeps legacy grant integrations in sync, allows authenticated staff to update all tasks, and enables task Realtime updates.

- Board is the default view. Calendar is the other available view; saved List and Timeline preferences fall back to Board.
- Assignment is optional. Use **Assigned** to select multiple people or remove every selection. **Claim task** explicitly assigns an unassigned task to you; editing another field never changes its assigned people.
- Dates display month first; date fields accept `MM/DD/YYYY`.
- Board moves update immediately, roll back on failure, and report database errors rather than treating a rejected update as success.
- The task side panel contains status, priority, assigned people, due date, plain notes, and links to connected grants or engineering projects. Activity and discussion panels are not shown there.
- The home task widget and **Assigned to me** filter include every assigned person, not just the first person.
