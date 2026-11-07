# Flown Systems

`SystemsPage` is a named export from `src/components/systems` (also from
`SystemsPage.tsx`), has no props, and obtains its authenticated session directly
from the existing Supabase client. The app shell owns `/systems` routing and its
legacy administration settings route.

## Database and authorization

For the SQL editor, run the entire [Flown Ops update bundle](../supabase/flown_ops_update_all.sql)
once. It includes Systems and the live Ideas/project/task publication update in
one transaction. It requires the existing workspace schema, including
`profiles.account_status`. It can be rerun and does not erase existing data.
Do not rerun the earlier office/email integrations bundle for this update.

Alternatively, use `supabase db push` to apply the source migrations, including
`supabase/migrations/20261110150000_flown_systems.sql`. This is one additive,
idempotent migration with no seeded systems, endpoints, incidents or metrics.
Active staff (`profiles.account_status = 'active'`) may read/create/edit/delete
all inventory, incidents and maintenance, regardless of owner or system role.
Check history is readable by active staff but writable only by service role.
Lease storage and claim/due-check RPCs are service-only. Owners are optional
profile references; ownership is accountability, not a permissions boundary.
Deleting inventory cascades its operational history.

Applying the manual bundle does not register CLI migration history. Before
switching an existing project back to CLI migrations, reconcile its migration
history with the migrations already applied through the SQL editor.

## Flown Ops interface and collaboration

Flown Ops is dark-only: deep navy surfaces, white text, and Flown blue accents.
Appearance settings retain text size and reduced motion, but no longer offer
light mode or custom accent colors. Historical stored appearance preferences
are normalized without changing account permissions.

Nested engineering project/review links and large task back links are recognized
by the shell rather than routed to the 404 page. Ideas, votes, discussions,
project details, and task details subscribe to database changes and refresh
without a page reload. A five-second visible-page polling fallback covers a
missing/unavailable realtime publication. Refresh errors preserve existing data,
and focused task title/description/estimate drafts survive remote refreshes.

## Deploy and schedule real checks

Deploy `systems-monitor` using the Supabase CLI:

```sh
supabase db push
supabase secrets set SYSTEMS_MONITOR_SECRET='<random-secret-at-least-32-characters>' SITE_URL='<actual-app-origin>'
supabase functions deploy systems-monitor --no-verify-jwt
```

The function authenticates requests itself. Disabling gateway JWT verification
is necessary for secret-authenticated cron and newer Supabase key formats; it
does **not** make the handler public. Staff manual calls require a validated
Supabase user and an active profile. Scheduled calls require either the service
role bearer token or the separate `x-systems-monitor-secret` header. Never put
either secret in frontend environment variables.

Configure a trusted scheduler to POST `{}` every five minutes to the deployed
`/functions/v1/systems-monitor`, with `Content-Type: application/json` and
`x-systems-monitor-secret`. No scheduler is created by this migration or by the
monitoring checkbox. Use the actual deployed project URL, not a sample host.
Store secrets in the scheduler's vault.

For Supabase Cron/pg_net, first enable those extensions in the hosted dashboard,
and store the function URL as `flown_systems_monitor_url` and the secret as
`flown_systems_monitor_secret` in Supabase Vault. Then register this SQL in the
SQL editor (once; do not create duplicate jobs):

```sql
select cron.schedule('flown-systems-health', '*/5 * * * *', $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets
            where name = 'flown_systems_monitor_url' limit 1),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-systems-monitor-secret',
      (select decrypted_secret from vault.decrypted_secrets
       where name = 'flown_systems_monitor_secret' limit 1)),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
$job$);
```

Before relying on monitoring, create a real inventory entry and a dedicated
unauthenticated health endpoint, enable monitoring, run a manual check, then
verify new **scheduled** rows continue to arrive while every browser is closed.
Inspect scheduler failures and function logs. Missing observations show
“Awaiting checks” or “Stale checks”, not fabricated availability.

## Probe safety and limits

Only HTTPS DNS names on port 443, with no credentials or fragments, are accepted.
Local names, IP literals (including encoded forms), reserved/non-global addresses
and mixed public/private DNS results are rejected. All DNS results are validated
before a chosen address is pinned to the HTTPS socket's custom lookup; TLS/SNI
and certificate verification still use the original hostname. There is no second
DNS resolution, redirect following, proxy, user-supplied header, cookie forwarding,
body parsing or response-body buffering. Redirects count as failed checks: use
the final endpoint. Response headers are limited to 16 KiB.

Each probe has an eight-second absolute deadline including DNS and TLS. Workers
are bounded to four and scheduled batches to 20; oldest leased systems are chosen
first. An atomic per-system 60-second lease prevents overlapping/manual hammering.
Staff may manually check one enabled system at a time. For >20 systems, each
system's effective cadence is longer than five minutes; adjust scheduler cadence
after reviewing hosted limits. This is sampled synthetic monitoring, not a
continuous observability service or incident alerting system.

Hosted Edge Runtime must support `node:dns/promises`, `node:https`, custom
lookup/TLS and outbound DNS. These were not tested against a deployed project.
Do not replace the pinned transport with ordinary `fetch` after DNS validation:
that reintroduces DNS rebinding. If hosting lacks the required transport, deploy
the same probe behind a trusted, network-restricted monitoring worker. Confirm
both public probes and controlled private/redirect denials in staging first.

## Metric semantics

30-day uptime is `up / (up + down)` from stored observations for the inventory's
current exact health endpoint. Both manual and scheduled checks count, so manual
checks can bias this sample ratio. Only HTTP 2xx is “up”; non-2xx, connection/DNS/
TLS failures and timeouts are “down”. Policy-blocked checks do not enter the
uptime denominator, and their count remains visible. Mean latency uses healthy
checks only. Maintenance windows do not hide failures. No samples means no
percentage. Missing checks never imply success; newest observations older than
15 minutes are marked stale. Editing the endpoint resets its aggregate unless
that same exact endpoint was monitored previously.

The SQL aggregate counts all matching samples, not the browser's bounded latest
60-row history. Check history is retained until inventory deletion; establish a
retention policy separately if volume warrants it. Incident/maintenance status
transitions are recorded by staff, not inferred from checks or the clock.

## Local verification

Focused Vitest fixtures are synthetic URL/address and sample-status inputs only,
in `helpers.test.ts`, `guard.test.ts`, `probe.test.ts`, and `SystemsPage.test.tsx`. None are persisted,
seeded, or shown as production inventory. Local tests mock DNS/HTTPS transports;
they do not establish hosted network compatibility. Apply the migration and
verify active/inactive staff RLS with separate real sessions before rollout.
