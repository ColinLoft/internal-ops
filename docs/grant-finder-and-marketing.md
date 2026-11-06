# Grant Finder and Marketing setup

## Grant Finder live search

Grant Finder uses the deployed `grant-ai` Supabase Edge Function and the workspace's Azure OpenAI settings. Live search is provided by Tavily. The function sends generalized grant-search keywords to Tavily; it does not send the organization summary or saved grant-resource text to the search provider. Azure OpenAI uses the organization's permitted summary and the saved grant resources to assess fit and draft the results.

1. Apply `supabase/migrations/20261106130000_marketing_grant_research_expansion.sql` to the workspace database. This adds full-text resource metadata, separate opportunity/application/source URLs, campaign-planning fields, and manual post-performance fields.
2. In the Supabase Dashboard for the same project, add the Edge Function secret `TAVILY_API_KEY` with a Tavily API key. Keep it server-side; never add it to frontend environment variables or source control.
3. Confirm the Azure OpenAI Edge Function secrets are configured as described in [Azure OpenAI setup](./azure-openai-setup.md).
4. Deploy the updated function:

   ```sh
   supabase functions deploy grant-ai
   ```

5. In Flown, add the organization's mission and program context to the grant **Resources** page. Grant Finder uses the organization summary and relevant saved resources across the available resource categories.
6. Select **Research with AI** in Possible grants. Results include source and direct program links when found. Review each result, correct any uncertain details, and save it as a new opportunity before pursuing it.

Research results are leads, not verified funding advice. Confirm current eligibility, deadlines, award amounts, and application links on the funder's official page. If the Tavily secret is not configured or search fails, the function reports an error instead of returning knowledge-only suggestions.

## Marketing workspace

The Marketing workspace supports campaign planning, post drafts, approval, scheduling, and recording published-post links and metrics. It does **not** connect to social networks or publish posts automatically. Staff must publish through the platform and then mark the post published and enter verified reach, engagement, and click counts.
