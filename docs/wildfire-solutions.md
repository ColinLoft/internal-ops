# Wildfire workspace

The internal Wildfire workspace is available under **Wildfire** in the sidebar. This upgrade requires the existing Flown workspace and Wildfire baseline, including `supabase/migrations/20261107130000_wildfire_solutions_foundation.sql`, profiles, CRM, support, contracts, grant resources/settings, and workspace-role tables. See **Database rollout** below for either source migrations or the single SQL Editor bundle.

## Access

The migration adds a **Wildfire Solutions team** role with edit access. Assign staff through **Settings → Roles & access**. Existing admins and coordinators keep their current access. Internal product and quote cost tables are restricted to users with Wildfire manage access; normal workspace users see product list prices only.

## Available workflows

- **Prospects/opportunities:** research and save standalone prospects; linking an existing CRM company/contact is optional. New CRM records are not created until quote acceptance.
- **Product catalog:** maintain products, specifications, configurations, list prices, and warranty/install details.
- **Site planner:** create properties without a CRM company or prospect, link a draft plan later with its dedicated prospect selector, create atomic numbered plans, and place equipment using latitude/longitude coordinates. Linking does not change the site filter or hide the standalone site.
- **Quotes and proposals:** create draft quotes from placements, edit line items and proposal narrative together, publish an immutable customer snapshot, or clone a quote to a new draft version.
- **Deployments:** acceptance creates exactly one deployment per quote and records its initial acceptance event. Editors may also add a manual deployment for an existing site and customer; it starts in planning and records no acceptance or signature. A site already assigned to a different customer cannot be used. Source links and acceptance timestamps remain immutable. Staff can track status, append notes, and manage tasks.
- **Requests and alerts:** view Wildfire-tagged support tickets and open system alerts.

The workflow intentionally has no payment collection, automatic outreach, or telemetry ingestion.

## Configuration

Edge functions use existing `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `SITE_URL` configuration. `SITE_URL` is required before publishing; it must point at the frontend serving `/#/wildfire/quote/<token>`.

For prospect research, configure **server-side** `BRAVE_SEARCH_API_KEY` plus the existing `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_DEPLOYMENT`, and optional `AZURE_OPENAI_API_VERSION` (default `2024-10-21`). Never put these secrets in frontend variables or source control. Deploy through the approved workflow:

```sh
supabase functions deploy wildfire-prospect-ai
supabase functions deploy wildfire-quotes --no-verify-jwt
```

`wildfire-quotes` validates JWTs and active Wildfire edit access itself for publish/revoke. Anonymous details/accept actions require a valid capability token, not an anonymous table policy. Preserve `--no-verify-jwt` when deploying this function.

For the optional browser map, set `VITE_GOOGLE_MAPS_API_KEY` in the frontend deployment environment and enable the Google Maps JavaScript API and Geocoding API. This browser key is public by design: restrict it to the application's HTTP referrers (including `https://ops.flown.org/*`) and only required Maps APIs, configure billing/quotas, and restart/rebuild Vite after changing it. Never use a server/service credential here. When Maps is not configured, address entry is disabled with an explanation and coordinate entry is selected instead; no address lookup fails silently.

The signing-link button reports empty-quote and backend failures explicitly and
shows progress while publishing. After publishing, use **Test signing without accepting**
to open a `?test=1` customer preview. Completing that form never calls acceptance,
saves a signature, or creates a deployment; the test flag is a client preview,
not a server permission. Real acceptance remains available only through the normal
published bearer link. Keep both links private. Catalog lines prefill the saved
product list price; custom lines remain manually priced.

For the round 3 correction, apply [flown_qa_round3_update_all.sql](../supabase/flown_qa_round3_update_all.sql)
after round 2 and redeploy `wildfire-quotes`. This is separate from the older
workflow/retirement bundle below. Permission results are preloaded and reused on
revisits, and each Wildfire page fetches only its required data; database latency
still determines actual live load times.

## Frontend/backend contracts

All staff RPCs require an authenticated, active Wildfire editor. Each returns a UUID string:

| RPC | Parameters |
| --- | --- |
| `wildfire_create_site_plan` | `p_property_id uuid`, `p_opportunity_id uuid` (nullable), `p_name text` |
| `wildfire_create_quote_from_plan` | `p_site_plan_id uuid` (plan must have an opportunity) |
| `wildfire_save_quote` | `p_quote_id uuid`, `p_currency text`, `p_discount numeric`, `p_tax numeric`, `p_expires_at date` (nullable), `p_terms text`, `p_proposal text`, `p_lines jsonb` |
| `wildfire_clone_quote` | `p_quote_id uuid` |
| `wildfire_link_site_plan` | `p_site_plan_id uuid`, `p_opportunity_id uuid` |
| `wildfire_create_manual_deployment` | `p_property_id uuid`, `p_organization_id uuid`, `p_notes text` |

Plan version allocation locks the property; quote version allocation locks the opportunity. Saving replaces draft lines atomically. A quote created from a plan groups non-coverage placements by product, using one unit per placement and the product's current list price. Placements without a product do not create a priced line; add services/custom charges manually. Both recurring and one-time lines are included in the displayed total; recurring billing is only a line label, not a payment/subscription action.

Example `p_lines`:

```json
[
  {"product_id": null, "description": "Installation", "quantity": 1, "unit_price": 500, "recurring": false}
]
```

Existing `wildfire_quote_lines` fields are `id`, `quote_id`, nullable `product_id`, `description`, `quantity`, `unit_price`, generated `line_total`, `recurring`, `created_by`, and `created_at`. Do not write `line_total`. Quote fields add `proposal text`, `snapshot jsonb`, `snapshot_sha256 text`, and `published_at timestamptz`. Existing proposal rows are retained; the latest narrative is folded into an empty quote proposal on migration.

`wildfire_deployments.quote_id` is unique when present. `wildfire_deployment_events` fields: `id`, `deployment_id`, `event_type` (`quote_accepted`, `status_changed`, `note`), `body`, `metadata jsonb`, nullable `created_by`, `created_at`. Staff may append only `note` events; history is immutable. Deployment status updates produce `status_changed` events automatically. `wildfire_deployment_tasks` fields: `id`, `deployment_id`, `title`, `status` (`todo`, `in_progress`, `done`), nullable `assigned_to`, nullable `due_at`, `notes`, `created_by`, `created_at`, `updated_at`. Authorized Wildfire editors can edit each other's tasks.

### Edge request/response payloads

`wildfire-prospect-ai`: authenticated `POST {"query":"public keywords entered explicitly by the user","count":10}` returns:

```json
{"results":[{"name":"Example Council","website":"https://example.org/","email":"","phone":"","location":"","summary":"Evidence-based summary with URL/snippet citations","fit_reason":"Reasoned fit, with uncertainty noted","source_urls":["https://example.org/"]}]}
```

This requires active Wildfire edit **and Finance view** permission: grant resources and organization summary are loaded using the caller's RLS context. Denied grant access is an error, not a successful context-free fallback. Brave receives only the exact user-entered public query, never grant data or an AI-generated private-context query. Azure OpenAI receives authorized grant context plus public search results. Source URLs/websites must exactly match returned search URLs; emails, phones, names, and locations are validated against cited search evidence, with unsupported contact fields cleared. Results are not saved or emailed automatically; review and save manually. Search snippets are evidence, not verification of current contact accuracy.

`wildfire-quotes`:

- Authenticated `{"action":"publish","quoteId":"uuid"}` → `{"url":"https://app.example/#/wildfire/quote/<token>","expiresAt":"ISO timestamp"}`.
- Authenticated `{"action":"revoke","quoteId":"uuid"}` → `{"status":"revoked"}`; create a new draft version to publish again.
- Public `{"action":"details","token":"<token>"}` → `{"snapshot":{...},"snapshotSha256":"hex","status":"sent|viewed|accepted","expiresAt":"ISO timestamp"}`.
- Public `{"action":"accept","token":"<token>","name":"Full name","email":"signer@example.org","signaturePng":"data:image/png;base64,...","acknowledged":true}` → `{"deploymentId":"uuid","status":"accepted"}`.

Public snapshot is **flat**, not wrapped in `quote`:

```json
{
  "quoteId": "uuid", "version": 1, "currency": "USD",
  "discount": 0, "tax": 0, "subtotal": 500, "total": 500,
  "terms": "Customer terms", "proposal": "Proposal narrative",
  "lines": [{"product_id": null, "description": "Installation", "quantity": 1, "unit_price": 500, "line_total": 500, "recurring": false}],
  "expires_at": null, "published_at": "ISO timestamp",
  "prospect": {"name": "Example Council", "website": "", "location": ""},
  "property": {"id": "uuid", "label": "Site", "address": "", "city": "", "region": "", "postal_code": "", "country": "", "latitude": null, "longitude": null, "boundary_geojson": null},
  "site_plan": {"id": "uuid", "name": "Plan", "version": 1, "boundary_geojson": null, "coverage_assumptions": "", "placements": [{"product_id": null, "placement_type": "camera", "label": "North camera", "latitude": 45, "longitude": -75, "configuration": {}, "heading_degrees": null, "horizontal_fov_degrees": null}]}
}
```

`site_plan` may be null. Internal stored snapshots also retain explicit prelinked CRM IDs in a `crm` field; the public handler removes that field. Internal research notes, costs, signature evidence, and staff-only notes are not included. `snapshotSha256` hashes UTF-8 PostgreSQL `jsonb::text` of the complete immutable stored snapshot (including internal CRM linkage), not the redacted public JSON.

Publication requires a property, at least one priced line, nonblank terms, and nonnegative subtotal minus discount. Tokens are random 256-bit capabilities; only SHA-256 hashes are stored. Links expire after 30 days or the quote expiry date's end (database timezone), whichever is earlier. Revoked links cannot view or accept. Accepted links can show their historical snapshot and retry acceptance after expiry; retries with the same non-revoked capability return the original deployment.

Acceptance is a service-only, row-locked RPC, `wildfire_accept_quote(p_token_hash,p_name,p_email,p_signature_png,p_signature_sha256,p_snapshot_sha256,p_acknowledged,p_audit)`. It saves immutable PNG evidence (maximum 512 KB), signer name/email, explicit acknowledgement, server time, user-agent/request identifier, signature hash, and the published snapshot/hash. In one transaction it creates or uses only explicit CRM links, marks the opportunity won, links the property, creates the unique deployment, and writes an initial event. **No name-only or email-only automatic CRM merging** occurs. The publisher is likewise service-only: `wildfire_publish_quote(p_quote_id,p_token_hash,p_actor_id,p_expires_at)`.

Quotes, lines, costs, and associated legacy proposal content cannot be changed after publication; clone to a draft version instead. Staff cannot insert deployments directly. Deployment quote/company/property/opportunity/site-plan/contract links are immutable; after acceptance, the linked opportunity/company/contact/property/site-plan relationship graph is also protected against rewriting, while ordinary notes/status and draft plan content remain editable. No public direct reads of quote/capability/signature tables are granted. Treat the share URL as sensitive: anyone with it may sign; send it only to the intended recipient, revoke leaked links, and do not include tokens in analytics/logging.

## Database rollout

Back up the database and confirm the existing Flown workspace/Wildfire baseline and Company Forms, internal bug-report, and email-workspace prerequisites. Choose **one** upgrade path:

- **Normal migration workflow:** apply `supabase/migrations/20261110160000_forms_access_and_retire_internal_tools.sql`, then `supabase/migrations/20261111100000_wildfire_workflow.sql`.
- **Single SQL Editor alternative:** review and run `supabase/flown_wildfire_update_all.sql` once in the Supabase SQL Editor. This bundle is the exact concatenation of those two source migrations with a warning header; it is an upgrade, not a fresh-workspace installer.

If the Forms migration is already live but the Wildfire workflow is not (quotes report `column wildfire_quotes.proposal does not exist`), run `supabase/flown_qa_round2_update_all.sql` instead. It bundles `20261111100000_wildfire_workflow.sql` with `20261113100000_qa_round2_fixes.sql` (member access, forms RLS, poll votes and reactions, ticket activity, linking site plans to prospects later) and is safe to re-run.

Apply the bundle **or** the two source migrations, **not both**. For a linked project, review pending migrations and use the approved deployment workflow; do not apply directly to production without the usual review and backup procedures. After rollout, verify the schema and assign the Wildfire role to authorized staff. Edge Function deployment and frontend environment configuration remain separate steps.

**Permanent deletion boundaries:** the bundle/source pair deletes shared-mailbox `email_rules` and their precisely scoped `email_rule_created`, `email_rule_enabled`, `email_rule_disabled`, and `email_rule_deleted` activity history; support tickets matching **all three** `internal_only=true`, `developer_flag=true`, and `category='bug'` flags (with their cascading comments); and **all** legacy `wildfire_site_surveys` rows. Customer tickets, ordinary internal IT requests, support conversations, deployments, quotes, opportunities, site plans, and legacy proposals are retained. Screenshot objects require the separate Storage API cleanup procedure documented in `docs/workspace-integrations.md`; running SQL does not delete those objects.

The workflow migration itself deletes only legacy site-survey rows. The source migrations are re-runnable, but their authorized deletion scopes execute again on every run; back up anything needed before rollout. No hosted migration or deployment is performed by the local tests.

Local backend validation: `npm test -- supabase/tests/wildfire-workflow.test.ts`. This exercises pure Edge validators and SQL structure/safety contracts without Docker/Deno; it does not replace database-backed migration/concurrency tests in a staging environment.

Optional real PostgreSQL fixture: `PGLITE_MODULE=/absolute/path/to/pglite/dist/index.js node supabase/tests/wildfire-runtime.mjs` (or omit the variable if PGlite is already externally available). This adds no project dependency and uses an isolated in-memory database, creating auth roles and fixture prerequisites before executing the actual CRM/foundation/workflow migrations. It verifies actual RLS/RPC signatures, standalone planning, quote saving/publishing, immutable snapshots and accepted source links, token expiry/revocation, hash tampering, service-only acceptance, CRM creation only on acceptance, repeated acceptance returning exactly one deployment, and migration re-execution preserving accepted records. The round 3 migration is also executed: manual creation/access restrictions, preserved real acceptance, reaction addition/removal/self exclusions, unread counts under fixture channel RLS, and exclusion of orphan profiles are checked. The fixture does not recreate the entire hosted Storage policy environment. PGlite has one connection, so queued simultaneous calls exercise idempotency but do not prove independent PostgreSQL sessions' concurrent row-lock behavior. Edge HTTP serving still requires Deno/Supabase deployment or emulation; these fixtures do not call a hosted provider.
