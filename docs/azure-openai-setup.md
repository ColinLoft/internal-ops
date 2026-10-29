# Azure OpenAI setup for email AI and the workspace assistant

This guide configures Azure OpenAI for the workspace email **Summarize** and **Draft reply** actions plus the sitewide conversational **Workspace assistant**. It explains where to create a model deployment, which values to copy, where to save them in Supabase, and how to test the integration.

The app calls Azure OpenAI only after a signed-in user opens the assistant or explicitly selects an AI action on an email. The email function sends the email sender, subject, and up to 30,000 characters of text. The workspace assistant retrieves the current permitted channel, conversation, or calendar context server-side. It can prepare a message action, but the browser always shows the exact target and text and requires an explicit confirmation before posting or sending. It never publishes an action directly from the model response.

> You need access to the Azure subscription that will pay for model usage, permission to create or use an Azure OpenAI resource and model deployment, and administrator access to the workspace's Supabase project.

## 1. Create or select an Azure OpenAI resource

1. Open the [Azure portal](https://portal.azure.com/) and sign in to the correct organization account.
2. Use the top search box to find **Azure OpenAI**. If your organization provisions these resources through Microsoft Foundry, open [Microsoft Foundry](https://ai.azure.com/) and select the relevant project/resource instead.
3. If you already have an Azure OpenAI resource, confirm it belongs to the subscription and environment intended for this workspace. Continue to [Step 2](#2-deploy-a-chat-model).
4. To create a resource in the Azure portal:
   1. Select **Create** or **Create Azure OpenAI**.
   2. Choose the intended **Subscription** and **Resource group**. Create a resource group only if your organization permits you to manage one.
   3. Enter a unique resource name and choose a region that supports both your desired model and your subscription's quota.
   4. Review the pricing, networking, and access settings with your Azure administrator. Keep access restricted according to your organization's policy.
   5. Select **Review + create**, verify the details, and select **Create**.
5. Wait for deployment to complete. Open the resource's **Overview** page and verify its deployment status is **Succeeded**.

If Azure does not offer the model or region you need, check the subscription's model availability and quota before trying another region. Availability can vary by subscription and change over time.

## 2. Deploy a chat model

The workspace needs a **chat completion** model deployment. A model catalog entry is not itself the deployment; the app needs the name of the deployment you create.

1. Open [Microsoft Foundry](https://ai.azure.com/) and select the Azure OpenAI resource or project from Step 1.
2. Open **Model catalog** (some Foundry layouts show this under **Models**).
3. Choose a chat-capable model that is available to the selected resource and region. Review its input limits, availability, and pricing for your expected usage.
4. Select **Deploy** and follow the deployment flow. Choose the deployment type and capacity according to your subscription quota and workload.
5. Give the deployment a clear name, for example `email-assistant`. The value the app needs is the **deployment name you assigned**, not necessarily the model's catalog name.
6. Wait until the deployment reports **Succeeded** or **Ready**. Copy the deployment name exactly, including capitalization if shown.

## 3. Copy the endpoint and key

1. In the Azure portal, open the Azure OpenAI resource from Step 1.
2. In the resource navigation, open **Resource Management → Keys and Endpoint**, or find **Keys and Endpoint** using the portal search on the resource page.
3. Copy the **Endpoint**. It usually looks like:

   ```text
   https://your-resource-name.openai.azure.com
   ```

   Copy the resource endpoint, not the Foundry project URL and not a deployment URL. The app adds the deployment and chat-completions path itself.
4. Copy **Key 1** or **Key 2**. Treat it as a password. Do not paste it in chat, source code, frontend variables, or a GitHub issue.
5. Keep the endpoint, key, and deployment name ready for the Supabase setup. Never commit them to this repository.

For production, follow your organization's credential and network policy. If keys are used, rotate them through the Azure resource and update the corresponding Supabase secret. Do not disable resource authentication or expose a key to the browser.

## 4. Save the Azure settings in Supabase

The browser never needs the Azure key. The email AI Edge Function reads these values on the server.

1. Open the [Supabase Dashboard](https://supabase.com/dashboard), sign in, and select the same project used by the deployed workspace.
2. In the left navigation, open **Edge Functions → Secrets**. Depending on the dashboard layout, **Secrets** may appear directly under **Edge Functions**.
3. Add or update each secret below. Use the exact names:

   | Secret name | Value |
   | --- | --- |
   | `AZURE_OPENAI_ENDPOINT` | Resource endpoint copied in Step 3, e.g. `https://your-resource-name.openai.azure.com` |
   | `AZURE_OPENAI_API_KEY` | Key 1 or Key 2 copied in Step 3 |
   | `AZURE_OPENAI_DEPLOYMENT` | Exact chat model deployment name from Step 2 |
   | `AZURE_OPENAI_API_VERSION` | `2024-10-21` |

4. Remove accidental spaces or quotes from the start or end of each value. The endpoint may include a trailing slash, but it should not include a deployment path.
5. Select **Save** for each secret. Check the selected Supabase project one more time before saving; development, staging, and production have separate secret stores.

The code defaults to API version `2024-10-21` if `AZURE_OPENAI_API_VERSION` is not set. Set it explicitly as above so the deployed configuration is easy to verify.

## 5. Deploy the AI functions

Changing Edge Function secrets does not require a redeploy, but make sure the latest `mail-ai` function is deployed:

1. Open the repository in VS Code.
2. Select **Terminal → New Terminal**. Confirm the terminal is at the repository root, where the `supabase/` folder is located.
3. Sign in and link to the correct project if this has not already been done:

   ```sh
   supabase login
   supabase link --project-ref <your-project-ref>
   ```

   Replace `<your-project-ref>` with the identifier for the workspace's Supabase project. Do not paste a service-role key into a command.
4. Deploy both authenticated AI functions:

   ```sh
   supabase functions deploy mail-ai
   supabase functions deploy mail-sync
   supabase functions deploy mail-webhook
   supabase functions deploy mail-ai
   ```

5. In Supabase **Edge Functions**, confirm `mail-ai` is deployed. The email AI and Flown workspace assistant both use this function.

Do not add `--no-verify-jwt` to this deployment. The function requires the signed-in workspace user's authentication.

## 6. Test the integration

1. Sign in to the deployed workspace and open **Email inbox**.
2. Open a non-sensitive test email in a mailbox the signed-in user can access.
3. Select **Summarize** and verify that a summary appears and is saved with the email.
4. Select **Draft reply** and verify that a draft is returned. Confirm it is not sent automatically.
5. If a request fails, note the status and error text shown in the app, then inspect **Supabase Dashboard → Edge Functions → mail-ai → Logs** for the corresponding request.

### Test the Workspace assistant

1. Open the deployed workspace and select the sparkle button in the lower-right corner.
2. Ask a read-only question such as `Summarize what is happening in this channel.` Confirm the response uses the current view.
3. In a channel where you can post, ask it to prepare a short update. Verify that it shows a **Confirmation required** card with the destination and exact text.
4. Select **Cancel** and confirm no message was created.
5. Ask it to prepare the update again, then select **Confirm**. Verify that one message is posted in the current channel.
6. Change to another channel or conversation before confirming a proposal. The assistant must refuse to execute the stale proposal.
7. If the assistant fails, inspect **Supabase Dashboard → Edge Functions → mail-ai → Logs**.

Start with a short test email. Avoid putting sensitive, regulated, or confidential email content into AI processing unless the organization's Azure configuration, policies, and data-handling approval explicitly permit it.

## Troubleshooting

| Error or symptom | Checks |
| --- | --- |
| App says Azure OpenAI is not configured | Confirm all three required secrets—`AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, and `AZURE_OPENAI_DEPLOYMENT`—exist in the correct Supabase project. Set `AZURE_OPENAI_API_VERSION` to `2024-10-21` as well. |
| `401` or `Unauthorized` from Azure | Confirm the key belongs to the same resource as the endpoint. If the key was rotated, replace it in Supabase Edge Function secrets and retry. |
| `404` or deployment not found | Confirm the resource endpoint and deployment name are from the same resource. Use the deployment name, not the catalog model name. Confirm the deployment is ready. |
| `400` API version or unsupported operation | Confirm the deployment supports chat completions and the API version is `2024-10-21`. Check Azure's current API compatibility guidance if the model or resource requires a different version. |
| `429` or quota exceeded | Check **Azure portal → Azure OpenAI resource → Quotas** or the model deployment's capacity. Wait for limits to reset or request/assign available quota according to your organization's process. |
| Network or resource access failure | Check whether the resource uses selected networks, private endpoints, or other firewall restrictions that prevent Supabase Edge Functions from reaching it. Do not make the resource public as a workaround; coordinate an approved network design with your administrator. |
| Function returns a generic failure | In Supabase, inspect **Edge Functions → mail-ai → Logs**. Confirm `mail-ai` is deployed and that the workspace is calling the intended Supabase project. |

## Cost, access, and data-handling reminders

- Model input and output are billable. Review Azure pricing, resource quotas, and usage in the Azure portal before enabling the feature for the whole workspace.
- Keep the Azure key in Supabase Edge Function secrets; never use a `VITE_` or other browser-visible environment variable for it.
- Restrict Azure resource and Supabase project access to the administrators who need it. Rotate a key if it may have been exposed.
- AI processing is user-initiated, but the selected email's sender, subject, and body text are sent to Azure OpenAI. Make sure this use is allowed by your organization's privacy and data-retention policies.
- Summaries and draft replies are stored as workspace email AI artifacts. Users should verify every generated result; AI can omit details or produce inaccurate text.
