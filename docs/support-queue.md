# Support and Outlook

Support is one queue. The separate Wildfire **Customer requests** page is removed; its old URL redirects to Support. Existing tickets, conversations, contacts, private notes and messages remain intact.

New team@flown.org inbox threads create **unassigned** tickets. Replies append to the same ticket, including replies sent directly in Outlook once that thread is linked. Agents claim/reassign tickets, set Open / Waiting / Resolved, and send replies from the ticket through team@flown.org. Website submissions still use `support-public`; their first staff email establishes an Outlook thread.

Only messages received after connection (or **Enable ticket intake** for an existing connection) are imported. Junk-folder messages, self-mail, auto-replies, delivery failures and mailing-list/bulk messages do not open tickets. Ordinary internal staff mail is accepted. `grants@flown.org` automation is deferred.

Attachment names and sizes are shown, but attachment files remain in Outlook and are not downloadable from Support. No mailbox DNS/MX changes are needed.

## Manual setup and rollout

Having shared inboxes in Microsoft is the first step; the application also needs Microsoft OAuth credentials.

1. In Microsoft Entra, create or reuse an app registration. Add a **Web** redirect URI matching the deployed site's `/?mail_oauth=callback` URL exactly.
2. Add Microsoft Graph **delegated** permissions: `User.Read`, `Mail.ReadWrite`, `Mail.Send`, `Mail.ReadWrite.Shared`, `Mail.Send.Shared`, plus OAuth offline access. Grant tenant consent if required. The account used to connect must have **Full Access** and **Send As** for team@flown.org in Exchange.
3. Configure these **Supabase Edge Function secrets**, never frontend `VITE_*` variables or committed credentials:

   | Secret | Value |
   | --- | --- |
   | `MICROSOFT_MAIL_CLIENT_ID` | Entra application client ID |
   | `MICROSOFT_MAIL_CLIENT_SECRET` | Client secret **value**, not its ID |
   | `MICROSOFT_TENANT_ID` | Organization tenant ID |
   | `MAIL_REDIRECT_URI` | Exact deployed callback URL from step 1 |
   | `MAIL_TOKEN_ENCRYPTION_KEY` | Base64-encoded 32-byte key; preserve the existing key if already configured |
   | `MAIL_MAINTENANCE_SECRET` | Random server-only secret for the scheduled worker |
   | `SITE_URL` | Public app origin, also used for contract signing links |

   Generate a new encryption key only for a new installation with `openssl rand -base64 32`. Replacing an existing key makes stored mailbox tokens unreadable.

4. Apply the existing email/support foundation and `20261116100000_outlook_support.sql`. This migration is also in the generated [SQL Editor bundle](../supabase/flown_ops_update_all.sql). The bundle **permanently deletes Ideas**; back up first and read [rollout notes](./company-crm.md). Manual SQL does not register Supabase CLI migration history.
5. Deploy the changed functions, replacing `YOUR_PROJECT_REF`:

   ```sh
   supabase login
   supabase functions deploy mail-connect --project-ref YOUR_PROJECT_REF
   supabase functions deploy mail-admin --project-ref YOUR_PROJECT_REF
   supabase functions deploy mail-maintenance --project-ref YOUR_PROJECT_REF
   supabase functions deploy support-send --project-ref YOUR_PROJECT_REF
   supabase functions deploy support-inbound --project-ref YOUR_PROJECT_REF
   supabase functions deploy create-contract-signature-link --project-ref YOUR_PROJECT_REF
   supabase functions deploy sign-contract-public --project-ref YOUR_PROJECT_REF
   ```

6. Publish the frontend. As a workspace administrator, open **Settings > Email > Connect Outlook**, then sign in with the account authorized to access the shared mailbox. Existing connections can use **Enable ticket intake**; reconnecting preserves the original intake cutoff.
7. Schedule a server-side **POST** to `https://YOUR_PROJECT_REF.supabase.co/functions/v1/mail-maintenance` every minute, using `x-mail-maintenance-secret: <MAIL_MAINTENANCE_SECRET>`. Use Supabase Cron with `pg_net` and Vault, or your existing trusted scheduler. Keep the header value server-side; never put it in a public URL. Schedule only one copy of this worker. Without the schedule, **Sync now** works but automatic intake does not.
8. Disable the old Resend webhook. `support-inbound` now returns HTTP 410 and never ingests mail. After all consumers are migrated, remove unused Resend secrets. Existing records and internal legacy RPC/column names containing `resend` are retained for compatibility; they do not call Resend.

Microsoft shared delegated permissions do **not** support subscriptions to shared-mailbox folders. The worker instead uses Graph Inbox and Sent Items **delta** cursors, page-by-page checkpoints, per-folder leases, immutable message IDs and transactional deduplication. Repeated syncs do not duplicate tickets. Expired delta tokens restart reconciliation from the original connection cutoff. Messages remain in Microsoft; sync does not mark them read or move them.

## Delivery and recovery

`support-send` requires an active admin/coordinator account. Contract endpoints retain their existing contract authorization. These are server-authorized operational workflows, not a general staff mailbox composer.

Every outgoing support/contract email is recorded before an Outlook draft is created and sent. Confirmed delivery keys are reused without sending twice. Definite provider rejection permits retry. Pending, timeout, server-error, and accepted-but-unrecorded states block automatic resend: an administrator must check Outlook Sent Items and `operational_email_deliveries` / `support_email_outbox` before reconciliation. A Graph 202 response means **accepted for sending**, not proof of final delivery.

The UI shows connection and last-sync status in Settings. Last synced advances only after both folders finish catching up; a busy worker or a bounded partial run reports that sync is still in progress. Worker failures are persisted as `email_mailboxes.support_sync_error` and returned in the maintenance response. Monitor non-200 responses, missed worker runs and stale `support_last_synced_at`; reconnect if Microsoft revokes authorization or credentials expire.

## Verification

Use an approved test sender and recipient after deployment:

- Send a new message to team; the next scheduled run should create one unassigned ticket.
- Reply from the ticket; verify the sender is team and the reply remains in the same Outlook thread.
- Reply by email and directly in Outlook; sync repeatedly and confirm one copy of each message.
- Confirm pre-connection messages and unrelated sent contract invitations do not become tickets.
- Send a contract invitation and complete both signatures; confirm the final-copy email.

Local tests do not send real email:

```sh
npm test
node supabase/tests/support-runtime.mjs
```

The SQL runtime uses optional `@electric-sql/pglite` (`PGLITE_MODULE` can point at an external installation).
