# Company Forms

Company Forms is a standalone workspace feature at `/company/forms`. The additive `20261107150000_company_forms.sql` migration copies existing `drive_items` form rows, collaborator grants, and `drive_form_responses` into `company_forms`, `company_form_collaborators`, and `company_form_responses`, preserving form and response IDs. It does not update or delete any legacy rows. All new form drafts, publications, and answers use the standalone tables.

## Routes to integrate

The legacy `drive_form_responses` table is optional: when absent, the migration creates the standalone response table without importing historical answers. When present, its records are copied and legacy submission permissions are retired.

For the complete Forms/PDF signing/office-and-email retirement database update, run the single [combined SQL file](../supabase/workspace_integrations_all.sql) instead of selecting individual migrations. See the [rollout guide](./workspace-integrations.md#one-file-database-update).

- Import `FormsPage` from `src/components/forms` for `/company/forms`.
- Import `PublicFormPage` from `src/components/forms` for `/company/forms/respond/:token`, passing the path token as its `token` prop.
- Preserve `/forms` as a compatibility redirect to `/company/forms`. Redirect legacy private editor paths `/forms/:id` to `/company/forms?form=:id` so the migrated record is selected when the signed-in user still has access. Never treat an item ID as a public share credential; public responders must use the new published token path.

The route integration belongs to the application shell. Forms components do not import Drive, Docs, Sheets, Slides, or the Drive editor.

## Editing and publishing

Draft title, description, questions, validation, ordering, and conditional visibility are stored in the standalone form's `content` JSON. New forms are owned by the creating staff account. Existing forms and their collaborator grants are copied into standalone tables once. Database row-level security remains authoritative for reading and editing; the UI also presents shared forms as read-only unless the current user owns the form or has an editor grant.

Publishing calls `publish_company_form`. It snapshots and validates the current draft, retires the prior active link, and returns a new random share token and monotonically increasing version. Published schemas and tokens cannot be edited; to change a form, save its draft and publish a new version. New responses are associated with the version that accepted them; copied legacy responses retain their IDs and existing answers. A publication can be closed and reopened without changing its schema.

Sharing can be restricted to active, authenticated staff profiles or enabled for anyone with the share link. All submissions go through `submit_company_form`, which rechecks publication state and validates field types, required values, choice membership, conditions, email/date formats, length bounds, and numeric bounds on the server. Direct anonymous inserts into the legacy response table are disabled. Response reads continue to use authenticated owner/collaborator RLS.

## Supported fields

Short answer, paragraph, email, number, date, single choice, checkboxes, dropdown, linear scale, and section headings are supported. Text lengths and numeric ranges can be bounded. A question may be conditionally shown based on a preceding choice question; hidden answers are omitted from the stored submission.

Response exports include respondent and submission metadata and the question labels from each immutable published version. The latest 1,000 responses are shown in the UI and CSV export.

## Verification

Run `npm test -- src/components/forms/formsModel.test.ts` and `npm run typecheck`. Apply the migration in the target Supabase project before using the feature. The migration is additive and no hosted database was changed as part of this code work. Removing `docs-ai` from the repository does not remove its deployed Supabase Edge Function; separately remove the hosted `docs-ai` deployment and any associated configuration/secrets as part of the Drive retirement.
