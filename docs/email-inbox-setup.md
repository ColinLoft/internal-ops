# Email inbox setup: step-by-step

This guide walks through setting up the workspace email inbox with Microsoft 365. First connect a personal mailbox, then configure optional push notifications and AI if you need them.

The inbox stores synchronized email content in Supabase. Access is controlled by the workspace, and administrators can set how long message content is retained. Connecting a provider grants the app permission to read, change read/star/archive status, and send mail for the account. AI features are optional and only send a message to Azure OpenAI when a user explicitly chooses an AI action.

For a dedicated walkthrough of the expanded email suite rollout—including the new migrations, function deployments, frontend release, scheduled-send worker, and end-to-end testing—see [Email suite changes: in-depth setup and rollout guide](./email-suite-rollout-guide.md).

## What you need before you start

- Access to this repository and its project folder on your computer.
- Access to the Supabase project used by the workspace, including permission to deploy database changes and Edge Functions.
- A publicly accessible HTTPS URL for the deployed workspace, such as `https://workspace.example.com`. Do not use `localhost` for a production setup.
- Administrator access to your Microsoft 365 tenant.
- At least one existing workspace profile whose email address uses the organization domain you plan to connect. The app checks this domain when connecting mailboxes.

You do **not** need to set up push notifications or Azure OpenAI to connect a mailbox. Without push notifications, use the inbox refresh button to sync manually.

## Step 1: Write down your project URLs

1. Open [Supabase](https://supabase.com/dashboard) and sign in.
2. Select the Supabase project used by this workspace.
3. Open **Project Settings** (the gear icon), then **API**.
4. Copy the **Project URL**. It looks like:
   `https://abcdefghijk.supabase.co`
5. The project reference is the part before `.supabase.co`, such as `abcdefghijk`. Keep both values nearby.
6. Write down the public URL where users open the deployed workspace. For example, if the site is `https://workspace.example.com`, the email OAuth redirect URL is:
   `https://workspace.example.com/?mail_oauth=callback`

Use your actual deployed website URL in place of `https://workspace.example.com`. Keep the trailing slash before `?mail_oauth=callback`. This is the workspace's callback URL, **not** a Supabase Auth callback URL.

## Step 2: Apply the database migrations

This applies the email tables, access policies, search index, retention cleanup function, HTML message bodies, templates, scheduled sends, and private channel-attachment storage.

1. Open the repository folder in VS Code.
2. Open **Terminal → New Terminal**. Confirm the terminal is at the repository root—the folder containing `package.json` and `supabase/`.
3. Install the Supabase CLI if it is not already installed:

   ```sh
   brew install supabase/tap/supabase
   ```

   If you do not use Homebrew, follow the [Supabase CLI installation instructions](https://supabase.com/docs/guides/cli/getting-started).

4. Sign the CLI in to your Supabase account:

   ```sh
   supabase login
   ```

   Follow the browser prompt to authorize it.

5. Link this local repository to the project from Step 1. Replace the example with your project reference:

   ```sh
   supabase link --project-ref abcdefghijk
   ```

   If prompted for a database password, use the database password for this Supabase project. It is not the password you use to sign in to Supabase.

6. Push the migration:

   ```sh
   supabase db push
   ```

   Review the migration list shown by the CLI and confirm when prompted.

7. Verify it in Supabase: open **Table Editor** and check that tables beginning with `email_` are present, including `email_templates` and `email_scheduled_sends`. In `email_messages`, confirm the `body_html` column exists so formatted email content and images can display. If the CLI says there are no migrations to apply, verify that you linked the intended project.

## Step 3: Create Microsoft 365 OAuth credentials

Use the exact redirect URL from Step 1.

1. Open the [Microsoft Entra admin center](https://entra.microsoft.com/) and sign in with an account allowed to register applications in your organization.
2. Go to **Identity → Applications → App registrations**, then select **New registration**.
3. Enter a name such as `Workspace Email Inbox`.
4. Under **Supported account types**, choose the option that fits your organization:
   - Choose **Accounts in this organizational directory only** if only your tenant will use it.
   - Choose **Accounts in any organizational directory** if you intentionally support multiple Microsoft 365 organizations.
5. Under **Redirect URI**, choose **Web**, enter the exact URL from Step 1 (including `/?mail_oauth=callback`), then select **Register**.
6. On the new app's **Overview** page, copy **Application (client) ID** and **Directory (tenant) ID**. These become `MICROSOFT_MAIL_CLIENT_ID` and `MICROSOFT_TENANT_ID`.
7. Open **Certificates & secrets → Client secrets → New client secret**. Add a description and choose an expiration period allowed by your organization, then select **Add**.
8. Copy the secret's **Value** immediately and store it securely. The value is only shown when it is created. This becomes `MICROSOFT_MAIL_CLIENT_SECRET`; do not use the Secret ID.
9. Open **API permissions → Add a permission → Microsoft Graph → Delegated permissions**. Add all five of these permissions:
   - `User.Read`
   - `Mail.ReadWrite`
   - `Mail.Send`
   - `Mail.ReadWrite.Shared`
   - `Mail.Send.Shared`
10. If your organization requires admin approval, select **Grant admin consent for [your organization]** and confirm. Shared mailbox access requires the shared-mailbox permissions and the signing-in user must already have access to the shared mailbox in Microsoft 365.

## Step 4: Add Edge Function secrets in Supabase

Secrets are private server-side settings. Never put provider secrets, encryption keys, or Azure keys in frontend environment variables or commit them to the repository.

1. Open your project in [Supabase](https://supabase.com/dashboard).
2. In the left navigation, open **Edge Functions → Secrets** (in some dashboard layouts, **Secrets** is under the Edge Functions page).
3. Add the following secrets. For each one, enter the exact name in the left/name field and its value in the value field.

   | Name | Value |
   | --- | --- |
   | `MAIL_REDIRECT_URI` | The exact deployed-site URL from Step 1, e.g. `https://workspace.example.com/?mail_oauth=callback` |
   | `MAIL_TOKEN_ENCRYPTION_KEY` | A new base64-encoded 32-byte key; generate it as described below |
   | `MICROSOFT_MAIL_CLIENT_ID` | Microsoft Application (client) ID; only if setting up Microsoft |
   | `MICROSOFT_MAIL_CLIENT_SECRET` | Microsoft client secret **Value**; only if setting up Microsoft |
   | `MICROSOFT_TENANT_ID` | Microsoft Directory (tenant) ID |

4. To generate the encryption key, run this in a terminal:

   ```sh
   openssl rand -base64 32
   ```

   Copy the output into `MAIL_TOKEN_ENCRYPTION_KEY`. Save a secure backup. If you lose or replace this key, previously stored provider tokens can no longer be decrypted and mailboxes will need to be connected again.

5. Select **Save** or **Add secret** for each value. The dashboard is recommended because putting real credentials directly in a terminal command can save them in your shell history.

## Step 5: Deploy the email Edge Functions

Run these commands from the repository root in the VS Code terminal:

```sh
supabase functions deploy mail-connect
supabase functions deploy mail-sync
supabase functions deploy mail-api
supabase functions deploy mail-ai
supabase functions deploy mail-admin
```

Deploy the webhook and maintenance functions with JWT verification turned off. These two functions verify their own secret or provider identity:

```sh
supabase functions deploy mail-webhook --no-verify-jwt
supabase functions deploy mail-maintenance --no-verify-jwt
```

In Supabase, open **Edge Functions** and confirm all seven functions show as deployed. The app's regular email actions require the authenticated functions; provider notifications and scheduled maintenance use the two special deployments above.

## Step 6: Connect and test your first mailbox

1. Open the deployed workspace and sign in.
2. Select **Inbox** in the left navigation.
3. Select **Connect Microsoft 365**.
4. Sign in to the organization mailbox you want to connect. Review the provider permission screen and select **Allow/Accept**.
5. You should return to the workspace and see the mailbox in the selector. The first sync may take a little while.
6. Select the refresh icon to run a manual sync. Confirm messages appear and try opening one.
7. Send a test email only if you are comfortable doing so; sending uses the connected provider account.

The email domain must match a domain found on an existing workspace profile. For Microsoft shared mailboxes, the user connecting it must already have access to that mailbox in Microsoft 365.

## Optional: Turn on near-real-time arrival notifications

Skip this section if manual refresh is enough for now. Push setup requires the public HTTPS webhook URL:

`https://<project-ref>.supabase.co/functions/v1/mail-webhook`

Replace `<project-ref>` with the Supabase project reference from Step 1. Add the values below as Edge Function secrets in the same way as Step 4. Deploy `mail-webhook` and `mail-maintenance` as shown in Step 5.

### Microsoft notifications

1. Add `MAIL_WEBHOOK_URL` with the webhook URL above.
2. Add `MAIL_WEBHOOK_SHARED_SECRET` with a long, unique random value. You can generate one with `openssl rand -hex 32`.
3. After those secrets are saved, reconnect the Microsoft mailbox or use the inbox sync/connection flow again so the Microsoft notification subscription is created.
4. Microsoft Graph sends a validation request to the webhook when its subscription is created. The function URL must be publicly reachable over HTTPS.

Microsoft subscriptions expire after about three days. Configure the maintenance job below so they are renewed automatically and scheduled emails are sent on time.

### Schedule maintenance every minute

Maintenance removes expired email content, sends due scheduled messages, and renews provider notification subscriptions. Scheduled replies and emails are sent by the server even when the sender is offline. The function expects the `MAIL_MAINTENANCE_SECRET` secret.

1. Generate a long, unique maintenance secret in a terminal:

   ```sh
   openssl rand -hex 32
   ```

2. In Supabase **Edge Functions → Secrets**, add `MAIL_MAINTENANCE_SECRET` and use the generated value.
3. In the Supabase dashboard, open **Database → Extensions**. Search for and enable `pg_cron`, `pg_net`, and `supabase_vault` (the Vault extension may appear as `vault`).
4. Store the schedule's URL and secret in Vault. If your dashboard has **Database → Vault**, open **Secrets** and select **New secret** twice:
   - Name: `email_maintenance_url`; value: `https://<project-ref>.supabase.co/functions/v1/mail-maintenance`
   - Name: `email_maintenance_secret`; value: the same value you saved as `MAIL_MAINTENANCE_SECRET`

   If you do not have the Vault secrets screen, open **SQL Editor → New query** and run the two statements below after replacing the examples. Be aware that SQL Editor may retain query history; use the Vault screen when available.

   ```sql
   select vault.create_secret(
     'https://<project-ref>.supabase.co/functions/v1/mail-maintenance',
     'email_maintenance_url'
   );

   select vault.create_secret(
     '<MAIL_MAINTENANCE_SECRET>',
     'email_maintenance_secret'
   );
   ```

5. Open **SQL Editor → New query**.
6. Replace any previous hourly job and schedule the function to run every minute. Paste this SQL and select **Run**:

   ```sql
   select cron.unschedule(jobid)
   from cron.job
   where jobname in ('email-inbox-maintenance-hourly', 'email-inbox-maintenance-minute');

   select cron.schedule(
     'email-inbox-maintenance-minute',
     '* * * * *',
     $$
     select net.http_post(
       url := (select decrypted_secret from vault.decrypted_secrets where name = 'email_maintenance_url'),
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'x-mail-maintenance-secret',
         (select decrypted_secret from vault.decrypted_secrets where name = 'email_maintenance_secret')
       ),
       body := '{}'::jsonb
     );
     $$
   );
   ```

7. To check that the schedule exists, run:

   ```sql
   select jobid, schedule, command
   from cron.job
   where jobname = 'email-inbox-maintenance-minute';
   ```

Do not paste real secrets into screenshots or support messages. If you rerun the `vault.create_secret` statements, first remove or update the prior Vault secret entries so you do not leave stale values behind.

## Optional: Turn on email AI actions

Email AI requires an Azure OpenAI resource and a deployed chat model. Skip this if you do not want AI summaries or reply drafts.

1. Open the [Azure portal](https://portal.azure.com/) and sign in to the Azure subscription that should pay for AI usage.
2. Use the portal search bar to find **Azure AI Foundry** or **Azure OpenAI**, then create an available resource in a region where your chosen model is available. Complete the required subscription, resource group, name, and region fields.
3. Open [Microsoft Foundry](https://ai.azure.com/) and select the project/resource you just created.
4. Open **Model catalog**, choose a chat model available to your resource, and select **Deploy**. Complete the deployment flow and note the deployment name you assign. This is the deployment name—not necessarily the model's catalog name.
5. In the Azure portal, open the resource and go to **Keys and Endpoint**. Copy the endpoint and one key.
6. In Supabase **Edge Functions → Secrets**, add:
   - `AZURE_OPENAI_ENDPOINT`: the resource endpoint, such as `https://your-resource.openai.azure.com`.
   - `AZURE_OPENAI_API_KEY`: the key copied from the resource.
   - `AZURE_OPENAI_DEPLOYMENT`: the exact model deployment name from Foundry.
   - `AZURE_OPENAI_API_VERSION`: optional; if omitted, this function uses `2024-10-21`.
7. Redeploy the AI function:

   ```sh
   supabase functions deploy mail-ai
   ```

The app only sends a message to Azure OpenAI when a user selects **Summarize** or **Draft reply**. The generated result is saved in the workspace. Draft replies are not sent automatically.

## After setup

- An administrator can change retention in **People & Access → Email access and retention**.
- Mailbox owners can add sender/subject rules from the inbox settings button. Rules can label, mark read, or archive matching messages.
- Shared mailbox access and send permission are managed by an administrator in **People & Access → Email access and retention**.
- Sync is bounded to the 100 newest messages per Microsoft folder per refresh. Search covers messages already synced.
- Messages with the same provider conversation ID appear as one conversation in the list. Open a conversation to read or print its messages in order.
- Compose supports rich text, templates, file attachments, external forwarding, and scheduled delivery. Personal templates are available to their creator; administrators can save templates for the workspace.
- Forwarding to a channel copies the email body and attachments into the channel. Channel members will be able to read those files, so check the destination before sharing confidential email.
- Email attachments are not otherwise copied into the workspace; use the provider mailbox to download attachments on received messages.

## Troubleshooting

- **"Email OAuth is not configured yet"**: Check `MICROSOFT_MAIL_CLIENT_ID`, `MICROSOFT_MAIL_CLIENT_SECRET`, and `MAIL_REDIRECT_URI` in Supabase Edge Function secrets. Confirm the secrets were saved to the same project where the functions are deployed.
- **Microsoft says `AADSTS7000215` or reports an invalid client secret**: Microsoft cannot retrieve an existing secret's value, so create a new one. In Entra, open the app registration whose **Application (client) ID** matches the ID in the error, go to **Certificates & secrets → Client secrets → New client secret**, create it, and immediately copy the secret **Value** (not its Secret ID). In the correct Supabase project, open **Edge Functions → Secrets**, replace `MICROSOFT_MAIL_CLIENT_SECRET` with that Value, and save. Do not share or commit the value. Updating an Edge Function secret does not require redeploying the function; retry the mailbox connection after saving. Also confirm `MICROSOFT_MAIL_CLIENT_ID` is that same app's Application (client) ID.
- **Microsoft says `AADSTS50011` or reports a redirect URI mismatch**: Compare the redirect URI in Entra with `MAIL_REDIRECT_URI`. They must match exactly, including `https`, domain, trailing slash, and `?mail_oauth=callback`.
- **The connection fails after Microsoft authorization**: The inbox displays the error returned by the Edge Function. Check that function's logs in Supabase under **Edge Functions → mail-connect → Logs**. Confirm Graph delegated permissions were added and admin consent was granted if required.
- **The callback returns an error or the inbox does not connect**: Confirm the database migration was applied, the correct provider secret names were used, and the signed-in email domain matches a workspace profile.
- **Mailbox connected but no new messages arrive automatically**: Manual refresh should still work. Check the provider-specific push setup, webhook URL, and maintenance schedule. Reconnect the mailbox after configuring the push values.
- **AI action says Azure OpenAI is not configured**: Check the three required Azure secrets, confirm the deployment name is exact, and redeploy `mail-ai`.
- **AI action reports an Azure OpenAI request error**: The inbox now includes the provider's HTTP status and error detail. In Foundry, verify the deployment is active and that `AZURE_OPENAI_DEPLOYMENT` exactly matches its deployment name. In the Azure portal, confirm the endpoint and key belong to that same resource, and confirm `AZURE_OPENAI_API_VERSION` is supported for the deployment. Replace rotated keys in Supabase Edge Function secrets and retry.
- **Email images or formatting do not appear**: Confirm the latest migration has been applied and the `body_html` column exists. Sync the mailbox again to retrieve the HTML bodies. Remote images may still be blocked by the provider or the user's network.
- **A message cannot be sent with attachments**: New-message attachments are limited to 10 files and 3 MB combined and are currently supported for Microsoft 365 mailboxes. Replies do not support attachments; start a new message instead.
- **A scheduled email is not sent at its scheduled time**: Confirm `email-inbox-maintenance-minute` is active in `cron.job`, `mail-maintenance` is deployed, and `MAIL_MAINTENANCE_SECRET` and the Vault URL/secret are correct. Check **Edge Functions → mail-maintenance → Logs** and the status/error in the inbox's **Scheduled** view.
- **A channel-shared attachment cannot be opened**: Apply the latest migration and confirm that the destination channel still exists and that you are a member if it is private.
