# Company CRM and workspace cleanup

Companies and contacts share `/customers/organizations`. The Customers and Funders tabs filter relationship type; legacy categories remain stored and appear under Customers until recategorized. The old Contacts and Companies links redirect here. Search includes company names, contact names, and email addresses. Contacts without a company remain available under **Unlinked contacts**, where editing assigns them to a company.

Each company has editable details, an owner, company contacts, activity (notes, calls, meetings, emails, and follow-ups), deals/funding opportunities, and linked contracts, support conversations, grants, and Wildfire opportunities. Financial, support, and Wildfire records follow their existing app permissions. Amounts are tracked in their specified currency; no cross-currency totals are invented. Follow-up dates appear as reminders on the company record; this does not send automated email reminders.

Apply [the CRM migration](../supabase/migrations/20261115100000_company_crm.sql) before deploying. It adds company industry/phone/address and permission-controlled `crm_deals`. Existing companies, contacts, activities, contracts, grants, and support data are preserved. Company deletion keeps contacts as unlinked contacts, matching the original foreign key behavior, and removes that company's activities/deals.

For SQL Editor, the [workspace update bundle](../supabase/flown_ops_update_all.sql) includes the CRM, Ideas retirement, contract-signing, support-email, and earlier Systems updates in one transaction. It requires the complete existing workspace foundation. Review and back up first: **running the entire bundle permanently deletes Ideas data**. Alternatively, apply the source migrations through the normal Supabase migration workflow. Do not mix the SQL Editor and CLI rollout paths without reconciling migration history; the bundle does not register CLI migration history.

The bundle is generated from source migrations with `node scripts/build-workspace-update.mjs`. `supabase/tests/update-bundle.test.ts` verifies exact source parity.

## Ideas retirement

At the user's explicit request, [the separate retirement migration](../supabase/migrations/20261115110000_retire_company_ideas.sql) **permanently deletes all Ideas, votes, and discussions** by dropping those three tables. Back them up first if retention is required. No hosted deletion was executed during development. Ideas navigation and implementation are removed; old Ideas links open Forms instead.

## Other surfaces

- Review's reviewer picker stays mounted when focus moves into its option list. Waiting for me is a styled pressed-state button.
- Forms use Flown branding and progressive question settings; publishing, permissions, and response validation remain unchanged.
- Grants use one search/status row and a compact summary. Import/export/checklist utilities are under Tools; upcoming dates are expandable.
- Find grants uses readable opportunity rows with funding ranges and deadlines. Grant resources keeps its reusable organization statement in an expandable panel.

## Verification

Run `npm run typecheck`, `npm test`, `npm run lint`, and `npm run build`.
Optional isolated PostgreSQL verification: `PGLITE_MODULE=/absolute/path/to/@electric-sql/pglite/dist/index.js node supabase/tests/company-crm-runtime.mjs`.
