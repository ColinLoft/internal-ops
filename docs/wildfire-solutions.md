# Wildfire Solutions workspace

The internal Wildfire workspace is available under **Wildfire Solutions** in the sidebar. Apply `supabase/migrations/20261107130000_wildfire_solutions_foundation.sql` before opening it. The migration expects the existing profiles, CRM, support, contracts, and workspace-role tables to be present.

## Access

The migration adds a **Wildfire Solutions team** role with edit access. Assign staff through **Settings → Roles & access**. Existing admins and coordinators keep their current access. Internal product and quote cost tables are restricted to users with Wildfire manage access; normal workspace users see product list prices only.

## Available workflows

- **Opportunities:** link work to existing CRM organizations, contacts, and properties; assign owners and advance the sales stage.
- **Product catalog:** maintain products, specifications, configurations, list prices, and warranty/install details.
- **Site planner:** create property records and versioned site plans, then place equipment using latitude/longitude coordinates.
- **Deployments:** track installation status against the CRM organization and property.
- **Requests and alerts:** view Wildfire-tagged support tickets and open system alerts.

The site planner is currently a coordinate-based sketch, not a geographic map. Quotes, proposals, and surveys have database foundations but their authoring workflows are not implemented yet. Customer-facing access, telemetry ingestion, and automated alert creation are also out of scope for this foundation.

## Database rollout

Apply the migration through the team's normal Supabase migration process before enabling the workspace for staff. For a linked project, review the pending migration list and use the approved deployment workflow; do not apply it directly to production without the usual review and backup procedures. After rollout, verify the migration in Supabase and assign the Wildfire role to authorized staff.
