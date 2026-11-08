# Shared tasks

Apply `supabase/migrations/20261110130000_shared_task_assignments.sql` before deploying the task updates. It backfills multi-person assignments from existing assignments, keeps legacy grant integrations in sync, allows authenticated staff to update all tasks, and enables task Realtime updates.

- Board is the default view. Calendar is the other available view; saved List and Timeline preferences fall back to Board.
- Assignment is optional. Use **Assigned** to select multiple people or remove every selection. **Claim task** explicitly assigns an unassigned task to you; editing another field never changes its assigned people.
- Dates display month first; date fields accept `MM/DD/YYYY`.
- Board moves update immediately, roll back on failure, and report database errors rather than treating a rejected update as success.
- The task side panel contains status, priority, assigned people, due date, plain notes, and links to connected grants or engineering projects. Activity and discussion panels are not shown there.
- The home task widget and **Assigned to me** filter include every assigned person, not just the first person.

## Motion and milestones

Controls respond with quick color transitions; menus and dialogs enter briefly without moving surrounding content. Successful task/subtask completion, grant awards, project completion, customer quote acceptance, and Wildfire deployment completion show a silent, nonblocking 1.8-second celebration only in the browser that saved the change. Loading, realtime updates, failed writes, unchanged completed states, and incomplete acceptance responses never trigger it. Returned persistence status confirms each milestone.

Milestones shoot a brief blue/white confetti burst with restrained cyan accents from the lower viewport corners: 40 pieces for grants, projects, quotes and deployments; 32 pieces with shorter travel for tasks. Only transforms and opacity animate, with no sound, interaction blocking, or continuous effects. Confetti finishes within 1.6 seconds and unmounts with its small confirmation badge at 1.8 seconds.

Celebrations have an eight-second cooldown and suppress repeated milestones for the same record (the latest 100 records per app mount). Nothing is broadcast to teammates. **Settings → Appearance → Reduce motion** disables motion and celebrations after saving; the device's reduced-motion preference always takes precedence, including live preference changes. Existing preferences are reused; no additional migration or package is needed.
