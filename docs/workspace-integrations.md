# Workspace integrations

Flown no longer includes Drive, Docs, Sheets, Slides, a standalone personal-email inbox, Company Automation, or the internal developer bug-report system. Use your existing document and email providers for authoring and personal mail. Calendar remains in the workspace; Forms is under Company.

## One-file database update

For manual deployment, open [workspace_integrations_all.sql](../supabase/workspace_integrations_all.sql), copy the **entire file**, and run it once in the Supabase SQL Editor. It contains all four migrations for this update, in dependency order:

- `20261107150000_company_forms.sql`
- `20261107151000_pdf_contracts_and_document_signing.sql`
- `20261110140000_retire_personal_email.sql`
- `20261110141000_retire_office_editors.sql`

You do not need to run those four files separately when using the bundle. It checks prerequisite tables/functions first and runs in one transaction: a failure rolls back the entire update. Existing data is preserved, and the bundle supports rerunning these migrations if some were already applied. It is not a fresh-database bootstrap and does not include earlier messaging, task, or Wildfire updates. After the bundle, apply the separate retirement/Forms correction below; rerunning the older bundle afterward would restore its older Forms policies.

The originals remain in the migrations directory for Supabase CLI deployment history. The manual bundle is intentionally outside that directory and does not mark CLI migrations as applied; CLI users should continue using the original migrations rather than moving the bundle into that directory. Edge Function deployment and provider setup below are still required.

## Documents

Upload attachments directly to tasks, projects, and grants using their existing Files panels. External document URLs can be added in Linked items. Existing Drive records and storage objects are preserved, not dropped; old linked Drive attachments can still be downloaded, with editor content exported as JSON source. Apply `20261110141000_retire_office_editors.sql` to disable office-table writes for browser users. Remove the previously deployed `docs-ai` Edge Function with `supabase functions delete docs-ai --project-ref <your-project-ref>`; deleting its source does not undeploy a hosted function.

Contracts and staff policies use uploaded PDFs rather than a document editor. Originals and signed PDFs are retained as immutable versions with hashes and audit history. Apply `20261107151000_pdf_contracts_and_document_signing.sql`, configure `SITE_URL`, and deploy `sign-organization-document`, `create-contract-signature-link`, and `sign-contract-public` (the public function requires `--no-verify-jwt`). Customer signing links open without a staff login; share them manually, since automatic signature-email delivery is not configured. Renewal and ending controls remain. See [PDF signing](./pdf-contract-signing.md) for rollout details.

## Forms

Apply `20261107150000_company_forms.sql` before using Company > Forms. It copies legacy forms, collaborator access, and responses without deleting the originals. The standalone builder supports typed questions, ordering, validation, conditional visibility, previews, publication, staff/public sharing, and response export. Each published link uses an immutable schema version; answers are validated on the server. See [Company Forms](./forms.md) for capabilities and rollout details.

Old `/forms/:id` editor links redirect to the migrated form. Share public responder links from the builder rather than using private form IDs.

## Operational email

Apply `supabase/migrations/20261110140000_retire_personal_email.sql` and deploy the updated `mail-connect`, `mail-api`, `mail-sync`, `mail-webhook`, `mail-maintenance`, `mail-ai`, and `workspace-ai` functions. The shared helper is deployed with each function.

- Personal mailbox connections, synchronization, and delivery are rejected by the API. Existing personal records are retained but are not accessible as workspace mailboxes. Pending personal sends are cancelled with an explanation; they are not silently sent.
- Shared mailbox sending remains available in Customers > Support. Select the shared sender before sending. Mailbox grants and send permissions are enforced by the backend. Access and retention remain under administrator settings.
- Company Automation and its shared-mailbox rule definitions/history are retired. Grant award checklists/reporting automations and customer-support AI remain in their existing workflows.
- `mail-api` retains send, reply, scheduled-send, and operational mailbox actions. `mail-webhook`/`mail-sync` retain shared inbound synchronization; `mail-maintenance` retains shared scheduled delivery and subscription maintenance.
- Current shared-mail integration still uses the existing provider adapter and configured credentials. Resend or another inbound/outbound API can replace that adapter later; a Resend shared inbox is **not** configured by this change. No provider secrets belong in the browser.
- Missing provider configuration and failed delivery are shown as errors, not as successfully sent support messages.

The old standalone-email rollout/setup guides are archived references, not current frontend instructions. Do not connect personal mailboxes using those guides.

## Internal-tools deletion and Forms correction

For the current Forms correction/internal-tools retirement **and** Wildfire acquisition update, choose one deployment path:

- **SQL Editor:** open [flown_wildfire_update_all.sql](../supabase/flown_wildfire_update_all.sql), copy the entire file, and execute it instead of applying the two source migrations separately.
- **Source migrations/Supabase CLI:** apply `20261110160000_forms_access_and_retire_internal_tools.sql` and `20261111100000_wildfire_workflow.sql` in order, without also running the bundle.

The bundle is an exact concatenation of those two migrations, not a fresh-database bootstrap. It requires the existing Flown workspace and Wildfire foundation, including Company Forms, email workspace, support tickets/internal-bug-report columns, CRM, and the Wildfire baseline tables/functions. The older `workspace_integrations_all.sql` is a separate prerequisite update where needed; it does not include these two current-request migrations. Each source migration has its own transaction; the concatenated bundle is not one all-or-nothing transaction across both. Back up the target database before applying. The manual bundle does not mark Supabase CLI migration history as applied. Edge Function/provider deployment still follows the Wildfire rollout guide.

**Permanent deletion warning:** both deployment paths delete shared-mailbox automation rules/explicit rule history, exactly flagged internal developer bug tickets, and old Wildfire site surveys. Customer tickets, deployments, quotes, opportunities, and site plans are retained. See [Wildfire rollout](./wildfire-solutions.md) for its survey-retirement scope. Screenshot file bytes/object metadata still require the separate Storage API cleanup below; SQL does not directly delete them. **No hosted deletion was executed by this code change.**

The Forms/internal-tools source migration is re-runnable and destructive only within these boundaries:

- Delete `email_rules` belonging to `email_mailboxes.mailbox_type = 'shared'` (the former Company Automation page's definitions).
- Delete `system_activity_logs` only when `target_type = 'email_mailbox'`, the target is a shared mailbox, and `event_type` is exactly `email_rule_created`, `email_rule_enabled`, `email_rule_disabled`, or `email_rule_deleted`. There is no separate rule execution-history table.
- Delete `support_tickets` only where **all three** hold: `internal_only = true`, `developer_flag = true`, `category = 'bug'`. Only comments belonging to those deleted tickets cascade. Customer tickets with category `bug`, other internal requests, support conversations/messages, customer data, deployments, quotes, opportunities, site plans, grants, and support/grant AI are retained. Referencing ticket links may become null through existing `ON DELETE SET NULL` constraints.
- Capture screenshot paths only from those explicitly internal tickets in `bug-report-screenshots`, excluding paths referenced by any retained ticket. The service-role-only cleanup manifest survives retries. Unlinked/orphan screenshots and screenshots attached to retained tickets are deliberately **not** targeted.
- Block authenticated recreation of shared automation rules and explicitly internal developer bug reports; remove only this feature's three Storage policies. Do not drop support columns, mailboxes, messages, support AI artifacts, or grant automations.

SQL does **not** directly delete `storage.objects`: Supabase requires the Storage API to delete file bytes together with object metadata. After applying SQL, use a trusted administrator shell with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` set privately (never browser/Vite variables or committed files):

```sh
node scripts/cleanup-internal-bug-screenshots.mjs
node scripts/cleanup-internal-bug-screenshots.mjs --apply
```

The first command is a non-destructive count/validation. `--apply` removes only manifest-listed objects via Storage API, checks retained ticket references again, and clears each manifest entry only after successful removal. Reruns resume unfinished work. Freeze ticket attachment writes and service-role imports during cleanup to avoid concurrent references; unexpected retained references stop the script without deleting that object. Never empty the entire bucket.

The deleted Edge Function source does not undeploy it. Separately retire the hosted endpoint with `supabase functions delete submit-bug-report --project-ref <your-project-ref>` using authorized deployment access. Do not run that command as part of local validation.

The Forms correction keeps active-staff ownership and viewer/commenter/editor grants unchanged. Owner reads are authorized directly so `INSERT ... RETURNING` does not depend on a stable self-query helper finding a just-inserted row. Creation also verifies the current Supabase Auth identity against the loaded staff profile.

### Isolated PostgreSQL verification

`supabase/tests/forms-runtime.mjs` runs the actual Forms, support-ticket, internal-bug-report, activity-log, and correction migrations in an in-memory PostgreSQL instance. It uses minimal platform/legacy/email fixtures and real `authenticated`/`anon`/`service_role` roles, RLS, triggers, and Auth functions—not mocks. It reproduces the old active-owner `INSERT RETURNING` failure before applying the correction.

With an existing PGlite installation, set `PGLITE_MODULE` to its absolute module URL. Otherwise, from the repository root, install it into an isolated disposable dependency directory without changing project dependencies:

```sh
npm install --prefix .forms-runtime-deps --no-save --package-lock=false @electric-sql/pglite
PGLITE_MODULE="file://$PWD/.forms-runtime-deps/node_modules/@electric-sql/pglite/dist/index.js" node supabase/tests/forms-runtime.mjs
rm -rf .forms-runtime-deps
```

Verified: **58 actual PostgreSQL checks** covering active owner create/read/edit; impersonation, missing identity, inactive owner/editor, unrelated staff, and anonymous denial; ID- and case-insensitive email-based editor access; viewer/commenter read-only access; unchanged ownership; exact three-flag ticket deletion and comment cascade; retained customer/operational records and ticket-link nulling; only shared-mailbox rule definitions/four audit events deleted; screenshot manifest exclusions, service-role-only access, unrelated Storage policy retention, and migration rerun. Storage metadata/bytes are deliberately retained until the separate Storage API cleanup. This test neither connects to a hosted database nor executes hosted deletion.

## Deployment verification

Apply pending migrations in order and deploy the new/changed Edge Functions before deploying the frontend. Validate on a staging project: form publication/submission permissions, PDF version and signature persistence, shared-email delivery and failed-send handling, grant automations, and calendar events. Local tests do not replace a hosted multi-user/provider check.
