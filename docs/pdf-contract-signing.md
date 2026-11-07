# PDF contracts and policy signing

## Deploy

Apply `supabase/migrations/20261107151000_pdf_contracts_and_document_signing.sql` before deploying the frontend. Then deploy the Edge Function:

```sh
supabase functions deploy sign-organization-document
supabase functions deploy create-contract-signature-link
supabase functions deploy sign-contract-public --no-verify-jwt
```

`SITE_URL` must be set to the deployed workspace origin so staff-created links target `/contract-signature?token=…`. The functions use the Supabase-provided `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` environment values. Do not expose the service-role key to the browser. The organization signing function authenticates the staff member, validates that the policy is published and assigned (or required for onboarding), loads the current PDF version, creates the signed PDF, and records the event through a service-role-only database function. Contract link creation and the sent confirmation require authenticated customer edit access. The public contract signing function accepts only the 256-bit bearer token stored as a server-side hash; deploy it with JWT verification disabled because the link token is its authorization. All PDF generation uses `pdf-lib` from the Deno runtime; no frontend dependency or mail-provider configuration is required.

The app router must handle `/contract-signature` before authenticated workspace routes, read the `token` query parameter, and render `PublicContractSigning` from `src/components/customers/PublicContractSigning.tsx`. Keep this route unauthenticated; the function validates the bearer token and does not expose contract data for invalid, expired, or revoked links.

The app no longer calls `docs-ai`. Once the Drive retirement is deployed and any remaining hosted callers are removed, delete its hosted Edge Function with `supabase functions delete docs-ai --project-ref <project-ref>`. This does not affect the PDF signing function or shared operational email.

## Contract PDFs

In Customers → Contracts, upload the original PDF before creating a customer signing link. The app creates a one-time display of a shareable link; copy it and send it manually. It is not emailed automatically and is not active until staff confirm they sent it. The customer opens the public `/contract-signature?token=…` route, reviews the source PDF, enters a legal name, draws a signature, and agrees to sign. The server appends a timestamped signature page, stores the signed PDF and audit hashes, and activates the contract. A new original PDF version invalidates the old signing link; create and manually share a replacement. The existing email-draft/upload-signed-copy path remains available for customers who sign externally. Originals, signed copies, and amendments are append-only, SHA-256 hashed, and remain available in the contract history. Deleting contract records/files is disabled to preserve that history.

## Organization policies and acknowledgments

Organization Admin → Policies & resources accepts uploaded PDFs, metadata, signature/acknowledgment requirements, and an optional onboarding requirement. Replacements are new immutable versions; prior versions and legacy attachments are retained. The staff signing flow appends a signature page to a copy of the exact source PDF, including the entered legal name, UTC timestamp, policy version, and drawn signature image where required. It stores the resulting PDF and an audit event containing source and output SHA-256 hashes. The original PDF is never overwritten.

This local signature is a recorded electronic signature/acknowledgment, not a third-party identity-verification, certificate, or qualified e-signature service. No document or signature email is sent automatically. Contract counterparties still return their signed PDF through the existing mail workflow.

## Verification

Run the focused frontend checks:

```sh
npm test -- src/lib/pdfFiles.test.ts
npx eslint src/components/customers/ContractSuite.tsx src/components/organization/PolicySigning.tsx src/components/organization/PolicyDocumentsAdmin.tsx src/components/admin/OrganizationAdminPage.tsx src/lib/pdfFiles.ts src/lib/pdfFiles.test.ts
npm run typecheck
npm run build
```

After deployment, verify in a staging project with an admin and a regular staff account: upload a policy PDF, publish a second version, sign the current version, confirm the signed PDF downloads and contains the appended signature page, verify the audit event/source/output hashes, and confirm the regular user cannot manage policy versions or sign an unassigned policy. Test contract original/signed PDF uploads and verify the signed file cannot activate a contract after a newer original version has been uploaded.
