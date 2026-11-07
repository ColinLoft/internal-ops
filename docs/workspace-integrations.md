# Workspace integrations

Flown no longer includes Drive, Docs, Sheets, Slides, or a standalone personal-email inbox. Use your existing document and email providers for authoring and personal mail. Calendar remains in the workspace; Forms and Automation are under Company.

## One-file database update

For manual deployment, open [workspace_integrations_all.sql](../supabase/workspace_integrations_all.sql), copy the **entire file**, and run it once in the Supabase SQL Editor. It contains all four migrations for this update, in dependency order:

- `20261107150000_company_forms.sql`
- `20261107151000_pdf_contracts_and_document_signing.sql`
- `20261110140000_retire_personal_email.sql`
- `20261110141000_retire_office_editors.sql`

You do not need to run those four files separately when using the bundle. It checks prerequisite tables/functions first and runs in one transaction: a failure rolls back the entire update. Existing data is preserved, and the bundle supports rerunning these migrations if some were already applied. It is not a fresh-database bootstrap and does not include earlier messaging, task, or Wildfire updates.

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
- Company > Automation retains shared-mailbox rules. Grant award checklists/reporting automations and customer-support AI remain in their existing workflows.
- `mail-api` retains send, reply, scheduled-send, and operational mailbox actions. `mail-webhook`/`mail-sync` retain shared inbound synchronization; `mail-maintenance` retains shared scheduled delivery and subscription maintenance.
- Current shared-mail integration still uses the existing provider adapter and configured credentials. Resend or another inbound/outbound API can replace that adapter later; a Resend shared inbox is **not** configured by this change. No provider secrets belong in the browser.
- Missing provider configuration and failed delivery are shown as errors, not as successfully sent support messages.

The old standalone-email rollout/setup guides are archived references, not current frontend instructions. Do not connect personal mailboxes using those guides.

## Deployment verification

Apply pending migrations in order and deploy the new/changed Edge Functions before deploying the frontend. Validate on a staging project: form publication/submission permissions, PDF version and signature persistence, shared-email delivery and failed-send handling, grant automations, and calendar events. Local tests do not replace a hosted multi-user/provider check.
