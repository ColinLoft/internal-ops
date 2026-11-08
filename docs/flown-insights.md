# Flown Insights

`InsightsPage` is a no-props component. It reads workspace-wide rows through the
existing Supabase client and does not call `useWorkspace` or `useAppAccess`.
Mounting the component directly therefore needs no workspace/access provider;
the application route may still mount it inside the normal shell.

## What the page shows

The black canvas groups a small set of key measures, four record-creation charts,
task/project status breakdowns, and the complete metrics table. “Export metrics”
opens metric checkboxes; “Select all”, “Clear”, and “Download CSV” preserve the
selection and export values from the same data currently displayed. “Refresh”
reloads every source. During refresh, the last loaded data stays visible. On the
first load, a loading state is shown.

Every figure is calculated from fetched records. A failed source is identified
by table name in the page notice; metrics that depend on that source show a dash
and “Source unavailable”, and that source’s chart/status panel shows an error.
A zero is shown only when its source successfully returned no matching records.
Win rate and task-completion rate are shown as a dash when their denominator is
zero, not as a fabricated 0%.

## Data sources and query response shapes

The component fetches each table in ascending `id` pages of 1,000 rows, selecting
only the columns below. The source keys (`tasks`, `projects`, etc.) are internal
aliases, not database table names.

| Alias | Table | Selected columns |
| --- | --- | --- |
| `tasks` | `program_tasks` | `id,status,priority,due_date,created_at` |
| `projects` | `eng_projects` | `id,status,target_date,created_at` |
| `grants` | `grants` | `id,stage,amount_requested,amount_awarded,created_at` |
| `prospects` | `grant_prospects` | `id,status,created_at` |
| `legal` | `legal_records` | `id,record_type,status,created_at` |
| `engineering` | `engineering_records` | `id,record_type,status,created_at` |
| `gtm` | `gtm_records` | `id,area,status,created_at` |
| `contacts` | `crm_contacts` | `id,created_at` |
| `orgs` | `crm_organizations` | `id,category,created_at` |
| `interactions` | `crm_interactions` | `id,created_at` |
| `opsTasks` | `operation_tasks` | `id,status,priority,due_date,created_at` |
| `approvals` | `operation_approvals` | `id,status,created_at` |
| `tickets` | `support_tickets` | `id,status,priority,created_at` |
| `messages` | `messages` | `id,created_at` |
| `events` | `calendar_events` | `id,created_at` |
| `audit` | `system_activity_logs` | `id,event_type,created_at` |
| `profiles` | `profiles` | `id,department,last_seen_at` |

Minimum useful response fixture:

```ts
const rowsByTable = {
  program_tasks: [
    { id: 'task-1', status: 'completed', priority: 'normal', due_date: null, created_at: '2026-11-02T09:00:00Z' },
    { id: 'task-2', status: 'in_progress', priority: 'high', due_date: '2026-11-08', created_at: '2026-11-06T15:00:00Z' },
  ],
  eng_projects: [
    { id: 'project-1', status: 'active', target_date: '2026-12-01', created_at: '2026-11-03T12:00:00Z' },
  ],
  grants: [
    { id: 'grant-1', stage: 'awarded', amount_requested: 12000, amount_awarded: 8000, created_at: '2026-10-28T12:00:00Z' },
  ],
  support_tickets: [
    { id: 'ticket-1', status: 'open', priority: 'normal', created_at: '2026-11-05T12:00:00Z' },
  ],
  // Return [] for any other table that the fixture does not exercise.
};
```

Each successful Supabase query page resolves as `{ data: rows, error: null }`.
An error fixture should resolve `{ data: null, error: { message: 'unavailable' } }`
for the chosen table. The component calls
`supabase.from(table).select(columns).order('id').range(offset, offset + 999)`;
return the fixture array for offset `0`, then `[]` for later offsets. This makes
the fixture finite and exercises the real paging contract.

`InsightsPage.test.tsx` contains a minimal Vitest mock pattern: hoisted
`rows`/`failures` maps and a fluent `from → select → order → range` query. No
`useWorkspace`, `useAppAccess`, auth, realtime, or React context mocks are
needed for a direct `InsightsPage` mount.

## Chart window and evidence

The charts are “Tasks created”, “Projects created”, “Grants added”, and “Support
tickets opened”, sourced respectively from `program_tasks`, `eng_projects`,
`grants`, and `support_tickets`. They display a rolling 12-week window. Weeks
start Monday at 00:00 UTC; the current week is counted only through the render
time. Dates outside that window, invalid dates, missing `created_at` values, and
future timestamps do not contribute to a chart. There is currently no interactive
date filter: “last 12 weeks, current week to date” is the fixed date scope.

Hovering a chart dot shows its native SVG `<title>` tooltip, such as “Nov 2: 2
records”.
The line, plotted dots, and screen-reader table all use the same weekly counts.
The SVG description explains whether it contains actual records or only the
zero baseline. Axis labels show five positions across the range and the y-scale
uses even integer steps based on the observed maximum. The small total in each
chart header is the fetched source’s all-time row count, not the 12-week count;
the chart’s caption and tooltip values are the period-scoped evidence. The
status breakdowns count the full successfully fetched task/project rows.

For browser evidence, inject records at multiple dates in the current week and
at least one prior Monday-based week, plus one record outside the window. Verify
that only in-window values affect line/dots and tooltips, while the chart header
still reflects the full source row count. Use a failed-table response separately
to verify an error state rather than a false zero.

## Browser and component fixture actions

Useful page labels are “Refresh”, “Export metrics”, “Choose metrics to export”,
“Select all”, “Clear”, “Download CSV”, “Record activity”, “Current work by
status”, and “All metrics”. In a browser fixture, wait for the initial source
queries to resolve before inspecting charts or opening export selection.
