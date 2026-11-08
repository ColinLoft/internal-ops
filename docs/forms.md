# Company Forms

Company Forms is a standalone workspace feature at `/company/forms`. The additive `20261107150000_company_forms.sql` migration copies existing `drive_items` form rows, collaborator grants, and `drive_form_responses` into `company_forms`, `company_form_collaborators`, and `company_form_responses`, preserving form and response IDs. It does not update or delete any legacy rows. All new form drafts, publications, and answers use the standalone tables.

## Routes to integrate

The legacy `drive_form_responses` table is optional: when absent, the migration creates the standalone response table without importing historical answers. When present, its records are copied and legacy submission permissions are retired.

For the original Forms/PDF signing/office-and-email retirement database update, run the [combined SQL file](../supabase/workspace_integrations_all.sql) instead of selecting those individual migrations. For the subsequent Forms correction/internal-tools retirement and Wildfire update, use either [flown_wildfire_update_all.sql](../supabase/flown_wildfire_update_all.sql) in SQL Editor **or** its two source migrations (`20261110160000_forms_access_and_retire_internal_tools.sql`, then `20261111100000_wildfire_workflow.sql`), **not both**. The current bundle requires the existing workspace/Wildfire baseline; it permanently deletes shared-mailbox rules/explicit rule history, precisely flagged internal developer bug tickets, and old Wildfire site surveys—not customer tickets, deployments, quotes, opportunities, site plans, or forms. Screenshot cleanup still uses the separate Storage API procedure. See the [rollout guide](./workspace-integrations.md#internal-tools-deletion-and-forms-correction); these two migrations are not included in the older bundle.

- Import `FormsPage` from `src/components/forms` for `/company/forms`.
- Import `PublicFormPage` from `src/components/forms` for `/company/forms/respond/:token`, passing the path token as its `token` prop.
- Preserve `/forms` as a compatibility redirect to `/company/forms`. Redirect legacy private editor paths `/forms/:id` to `/company/forms?form=:id` so the migrated record is selected when the signed-in user still has access. Never treat an item ID as a public share credential; public responders must use the new published token path.

The route integration belongs to the application shell. Forms components do not import Drive, Docs, Sheets, Slides, or the Drive editor.

## Editing and publishing

Draft title, description, questions, validation, ordering, and conditional visibility are stored in the standalone form's `content` JSON. New forms are owned by the creating staff account. Existing forms and their collaborator grants are copied into standalone tables once. Database row-level security remains authoritative for reading and editing; the UI also presents shared forms as read-only unless the current user owns the form or has an editor grant.

Creation verifies the Supabase Auth user before inserting and rejects an expired or mismatched profile/session. The follow-up migration authorizes active owners directly in the SELECT policy: the previous stable `can_view_company_form(id)` self-query could not see the newly inserted row during `INSERT ... RETURNING`. Active staff remains required; owner-only creation, immutable ownership, and collaborator editing permissions are not relaxed.

Publishing calls `publish_company_form`. It snapshots and validates the current draft, retires the prior active link, and returns a new random share token and monotonically increasing version. Published schemas and tokens cannot be edited; to change a form, save its draft and publish a new version. New responses are associated with the version that accepted them; copied legacy responses retain their IDs and existing answers. A publication can be closed and reopened without changing its schema.

Sharing can be restricted to active, authenticated staff profiles or enabled for anyone with the share link. All submissions go through `submit_company_form`, which rechecks publication state and validates field types, required values, choice membership, conditions, email/date formats, length bounds, and numeric bounds on the server. Direct anonymous inserts into the legacy response table are disabled. Response reads continue to use authenticated owner/collaborator RLS.

## Supported fields

Short answer, paragraph, email, number, date, single choice, checkboxes, dropdown, linear scale, and section headings are supported. Text lengths and numeric ranges can be bounded. A question may be conditionally shown based on a preceding choice question; hidden answers are omitted from the stored submission.

Response exports include respondent and submission metadata and the question labels from each immutable published version. The latest 1,000 responses are shown in the UI and CSV export.

## Verification

Run `npm test -- src/components/forms` and `npm run typecheck`. For actual isolated PostgreSQL/RLS verification, run [the optional PGlite runtime test](./workspace-integrations.md#isolated-postgresql-verification); it reproduces the original INSERT RETURNING failure and verifies the correction, permissions, and exact deletion boundaries. Apply the migrations in the target Supabase project before using the feature. The original Forms migration is additive; the subsequent retirement migration explicitly deletes unrelated retired internal-tool data, not form data. No hosted database was changed as part of this code work. Still verify production-specific auth/profile/provider configuration on staging; the isolated fixture is not a hosted rollout check. Removing `docs-ai` from the repository does not remove its deployed Supabase Edge Function; separately remove the hosted `docs-ai` deployment and any associated configuration/secrets as part of the Drive retirement.
