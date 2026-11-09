# Support queue

The Support screen is a single queue over `support_conversations`, `support_messages`, and `support_customers`. New email and website requests stay unassigned until a support agent claims them. Agents can reassign a request, move it between Open, Waiting, and Resolved, and reply by email from the conversation.

On smaller screens, the conversation and reply composer share one scrollable column. Contact/account details and reassignment are available under **Contact & assignment**; unassigned requests also have a **Claim request** action beside their status.

Existing `support_tickets` and `support_ticket_comments` are retained. The support-email migration bridges existing tickets into conversations and copies their descriptions, replies, and private notes; future legacy ticket inserts/comments are mirrored as well. It does not delete or rewrite the original records. Assignment, status, and agent replies are synchronized for bridged tickets, so existing notification counts, reports, and links continue to work. Customer CRM links are shown when a support contact has a linked CRM contact. The `/customers/support?conversation=<id>` link opens that conversation; old `/help?ticket=<id>` links resolve through the bridge.

The existing unauthenticated `support-public` endpoint and its random conversation token remain the website-submission path. It continues to authorize public polling and replies by that token; it does not accept a caller-selected staff `user_id`.

## Resend configuration

Resend is not configured by this change. Do not send live mail or deploy as part of implementation.

Configure these values as **Supabase Edge Function secrets**, never as `VITE_*` variables, client settings, checked-in files, or SQL:

| Secret | Value |
| --- | --- |
| `RESEND_API_KEY` | Server-side Resend API key with permission to send and read received email |
| `RESEND_FROM_EMAIL` | `team@flown.org` or a verified display-name form whose address is exactly `team@flown.org` |
| `RESEND_WEBHOOK_SECRET` | The signing secret for the Resend inbound webhook (`whsec_...`) |

Supabase supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions. `support-send` validates the caller's Supabase session and active admin/coordinator profile before using the service role. `support-inbound` validates the Resend/Svix signature and timestamp before using the service role. Both functions have gateway JWT verification disabled so webhook requests and browser preflights reach their own authorization checks.

After an administrator configures Resend, register a webhook for `email.received` at:

```text
https://<project-ref>.supabase.co/functions/v1/support-inbound
```

Set the webhook's signing secret in `RESEND_WEBHOOK_SECRET`. The webhook handler fetches the received message from Resend, extracts its plain text, and persists the event transactionally. Provider event IDs, received-email IDs, and RFC `Message-ID` values are deduplicated. Replies are matched by `In-Reply-To`/`References` and by the unguessable `team+<conversation-token>@flown.org` reply address; an alias is accepted only when its sender matches the conversation contact. New inbound conversations are unassigned.

**Inbound MX has a mail-delivery impact. Do not change DNS as part of this work.** Resend inbound receiving requires MX configuration for the receiving domain. Changing the MX records for `flown.org` can redirect all mail for `@flown.org`, including `team@flown.org`, away from the current mail provider. Before enabling inbound, the mail/domain administrator must review the existing MX records, decide how the current mailbox will continue receiving mail, and approve a staged cutover or dedicated receiving domain. Confirm Resend's current receiving requirements in its dashboard; do not copy records from this document or overwrite existing records blindly.

Inbound attachment filenames and sizes are recorded and shown in the thread, but attachment files are not copied into Support storage. The UI identifies this limitation rather than presenting them as downloadable.

## Delivery and failure handling

The browser sends replies only through `support-send`; it never contacts Resend or sees server secrets. The function records a server-side outbox entry before sending, uses a stable Resend idempotency key, and only returns success after the accepted provider message is also saved to the support thread. Definite provider rejection is shown as a failure. Timeouts, server errors, and accepted-but-unrecorded messages are marked uncertain and block further sends for that conversation until checked; the UI does not claim delivery. An administrator should reconcile uncertain outbox rows against Resend before permitting a retry.

## Migration and regression checks

Apply `supabase/migrations/20261115130000_support_email_queue.sql` through the normal reviewed migration workflow. For SQL Editor, it is also included in the generated [workspace update bundle](../supabase/flown_ops_update_all.sql). **That bundle permanently deletes Ideas data** and requires the complete workspace foundation; see [rollout notes](./company-crm.md). Do not apply both paths without reconciling CLI migration history.

Run the browser/unit regressions:

```sh
npx vitest run src/components/support/SupportPage.test.tsx src/components/support/supportApi.test.ts src/components/support/supportEmail.test.ts
```

The SQL runtime regression uses optional PGlite and does not add a product dependency:

```sh
npm install --prefix .support-runtime-deps --no-save --package-lock=false @electric-sql/pglite
PGLITE_MODULE="file://$PWD/.support-runtime-deps/node_modules/@electric-sql/pglite/dist/index.js" node supabase/tests/support-runtime.mjs
```
