# Contract signing

The current signing flow adds normalized, page-relative name, date, and signature fields to the
uploaded PDF. A 256-bit bearer token is derived in the Edge Function from the signing request ID
and service-role secret, sent only to the recipient, and stored as a SHA-256 hash. The recipient
signs first; the one selected Flown user signs the same PDF second. The final PDF is saved as an
immutable `signed_copy` and emailed to the recipient.

Existing version-1 signature requests remain readable and use their original append-only signature
page behavior. Version-2 requests are identified by `flow_version = 2`. Uploading a newer original
PDF revokes outstanding recipient links, including requests awaiting countersignature.

## Staff workflow

Create a contract with its recipient's name, email and Flown countersigner, then upload the agreement
PDF. Choose **Place fields and send** to position each signer's fields before emailing the invitation.
Company links, financial terms and dates are optional, expandable details. Manual signed-copy and
amendment uploads remain under **Other document uploads**; existing PDFs and activity are retained.
On smaller screens, selecting a contract opens its details; **All contracts** returns to the list.
If signing status cannot be loaded, the workspace shows the error rather than offering legacy
manual-signing actions for an unknown request.

## Required configuration

Set these Supabase Edge Function secrets before using email delivery:

- Connect the Microsoft 365 `team@flown.org` shared mailbox in **Settings > Email**.
  Configure OAuth credentials and shared-mailbox access as described in [Outlook setup](../support-queue.md).
- `SITE_URL`: public application origin used to construct recipient links.

Microsoft credentials are read only by Edge Functions. An invitation is marked pending only after Outlook
accepts it. A persistent request-specific delivery key suppresses duplicate sends; uncertain network
or database outcomes block automatic retries until an administrator checks Sent Items. Draft requests retain their fields and
request IDs so staff can retry after reload without exposing or storing the bearer token. Delivery
failures leave the signature request unsent and are surfaced to staff.

After countersigning, the final PDF is attached to the confirmation email when it is at most 2 MB
(to stay below Graph's request-size limit after base64 encoding);
larger PDFs are provided as a seven-day private download link. If confirmation delivery fails, the
completed signature is retained and staff can retry delivery from the contract.

## Deployment prerequisites

Apply `20261115120000_contract_placement_and_countersigning.sql` and deploy the
`create-contract-signature-link` and `sign-contract-public` Edge Functions together. The frontend
PDF viewer requires `pdfjs-dist` (the dependency is managed separately from these function changes).
The Outlook migration also requires `20261116100000_outlook_support.sql` and a connected team mailbox.

The migration is also included in the generated [workspace SQL Editor bundle](../../supabase/flown_ops_update_all.sql).
That bundle **permanently deletes Ideas data** and requires the complete workspace foundation.
See [rollout notes](../company-crm.md); do not apply both paths without reconciling migration history.

## PDF regression

`DENO_BINARY=/path/to/deno node supabase/tests/contract-pdf-runtime.mjs` exercises the real stamping
helper and parses its saved PDFs with PDF.js. It verifies both signatures, names, and dates remain
on the original page, with correct viewer-relative placement on cropped pages and all four page
rotations. Names are sized to fit their placed field instead of wrapping outside it.

## Offline browser fixtures

Mock Supabase responses only in the browser fixture harness, never in production. REST list
queries return arrays; function invocations return the JSON objects below (the Supabase client
wraps them as `{ data, error: null }`). Supply the normal authenticated workspace user and
customer edit permission for staff screens. Use UUIDs consistently for contract, document,
request, and user IDs.

- `customer_contracts?select=*&order=updated_at.desc`: one contract with
  `{ id, name: "Fixture agreement", contract_type: "service", status: "draft",
  description: "", organization_id: null, contact_id: null, value: null, currency: "USD",
  start_date: null, end_date: null, renewal_date: null, auto_renew: false,
  counterparty_name: "Alex Recipient", counterparty_email: "alex@example.com",
  counter_signer_id: staffUserId, owner_id: staffUserId, created_by: staffUserId,
  signature_requested_at: null, signed_at: null, ended_at: null, created_at, updated_at }`.
  Open the staff page with `?contract=<id>`.
- `crm_organizations?select=id,name&order=name.asc` and
  `crm_contacts?select=id,organization_id,name,email&order=name.asc`: `[]` is sufficient.
- `customer_contract_files?select=*&contract_id=eq.<id>&order=created_at.desc`: `[]`
  opens upload-only state; the editor needs
  `[{ id: documentId, contract_id: contractId, file_name: "agreement.pdf",
  storage_path: "fixtures/agreement.pdf", file_size: pdfByteLength,
  mime_type: "application/pdf", file_kind: "original_pdf", version_number: 1,
  sha256: null, source_file_id: null, created_at }]`.
- `customer_contract_events?select=*&contract_id=eq.<id>&order=created_at.desc&limit=50`:
  `[]` is sufficient.
- Storage `contracts-files` signed-URL creation must resolve to
  `{ signedUrl: localPdfUrl }` at the client API boundary. If intercepting HTTP instead,
  return `{ signedURL: "/object/sign/contracts-files/fixtures/agreement.pdf?token=fixture" }`
  from `/storage/v1/object/sign/contracts-files/fixtures/agreement.pdf` and serve real PDF
  bytes at the resulting URL. PDF.js uses a real worker and cannot render a JSON placeholder.
  Serve the PDF same-origin or enable CORS.
- `sign-contract-public` with `{ action: "staff-details", contractId }`:
  `{ request: null }` for upload/editor state. To reopen saved placements, return
  `{ request: { requestId, flowVersion: 2, status: "draft", counterSignerId: staffUserId,
  sourceFileId: documentId, fields } }`.
- `create-contract-signature-link` with
  `{ action: "send", requestId, contractId, sourceFileId, fields }`:
  `{ sent: true, requestId, expiresAt }`. Update fixture contract status to
  `pending_signature` and the staff request status to `pending` on subsequent reads.
  Failure fixture: HTTP 503 with `{ sent: false, requestId,
  error: "Contract email is not configured." }`; leave draft status unchanged.
- Public `/contract-signature?token=fixture` invokes `sign-contract-public` with
  `{ action: "details", token }`. Return
  `{ status: "pending", flowVersion: 2, contractName: "Fixture agreement",
  originalFileName: "agreement.pdf", originalPdfUrl: localPdfUrl, expiresAt, fields }`.
  Use a future ISO timestamp. `fields` must contain six objects:
  `{ id, signer: "recipient" | "countersigner", kind: "name" | "date" | "signature",
  pageIndex: 0, x: 0.1, y, width: 0.3, height: 0.06 }`, with a distinct ID and
  nonoverlapping `y` value for each signer/kind pair.
- Public signing submits `{ action: "sign", token, signedName, acknowledged: true,
  signatures: { [recipientSignatureFieldId]: pngDataUrl } }`. Respond
  `{ status: "recipient_signed", awaitingCountersignature: true, signedAt }`;
  subsequent `details` responses should use `status: "recipient_signed"`.
- Countersign fixture: staff `request` has `status: "recipient_signed"`,
  `recipientSignedName`, `recipientSignedAt`, `fields`, and
  `signedPdfUrl: localPdfUrl`; the current user must equal `counterSignerId`.
  `{ action: "countersign", requestId, acknowledged: true, signatures }` returns
  `{ status: "completed", emailSent: true }`. A completed public `details` response is
  `{ status: "completed", flowVersion: 2, signedPdfUrl: localPdfUrl }`.

These are UI fixtures, not a substitute for testing authenticated permissions, PDF stamping,
Resend delivery, or database transitions.
