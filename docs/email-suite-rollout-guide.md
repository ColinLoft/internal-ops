# Email suite changes: in-depth setup and rollout guide

This guide explains how to put the expanded email suite into service: conversation threads, formatted composition, attachments, templates, printing, forwarding to people or channels, and scheduled delivery.

It is written for someone who can open this repository in VS Code and has access to the workspace's Supabase project and deployment platform. Follow the sections in order. Database changes and Edge Functions run in Supabase; the user interface is a separate frontend deployment.

> **Setting up email for the first time?** First follow [Email inbox setup: step-by-step](./email-inbox-setup.md) to configure Microsoft 365 OAuth, Supabase secrets, and connect a mailbox. Then return here for the new suite rollout and scheduled-send setup.

## What this rollout enables

| Feature | Additional setup |
| --- | --- |
| Conversation grouping, rich text, print, forwarding, templates | Apply the migrations, deploy the updated frontend and email functions |
| Email attachments | Same rollout; sending new email attachments is limited to 10 files and 3 MB total |
| Forward a message and files to a workspace channel | Same rollout; the new private `channel-attachments` bucket and policies are created by the migration |
| Schedule a new email or reply | Apply the migration, deploy `mail-maintenance`, and configure the once-per-minute database job |
| Automatic arrival notifications | Optional; configure `MAIL_WEBHOOK_URL` and `MAIL_WEBHOOK_SHARED_SECRET`, then reconnect mailboxes |
| Email summaries and reply suggestions | Optional; configure Azure OpenAI as described in the existing setup guide |

Scheduled sends currently require a Microsoft 365 mailbox. Replies do not support attachments, Cc, or Bcc. Shared templates are available to workspace users when an administrator creates them.

## Before you begin

Make sure you have:

- The correct repository open in VS Code. The repository root is the folder containing `package.json` and `supabase/`.
- Permission to deploy database migrations, Edge Functions, and frontend changes.
- Access to the correct Supabase project. Do not assume a local or staging project is production.
- A connected Microsoft 365 mailbox for end-to-end sending tests. Do not test by sending to real recipients unless you intend to.
- A working deployment of the workspace frontend. Keep the existing Supabase URL and anon key frontend configuration unchanged.

If you are unsure whether your Supabase project already has the earlier email migrations, do not manually recreate tables. The migration process tracks applied migrations; use the project link and migration status checks below.

## Part 1: Confirm the correct Supabase project

1. Open the [Supabase Dashboard](https://supabase.com/dashboard), sign in, and select the project used by the deployed workspace.
2. Open **Project Settings → General** and note the project reference. It is the short identifier in the project URL, such as `abcdefghijk` in `https://abcdefghijk.supabase.co`.
3. Open **Project Settings → API** and confirm the project URL matches the deployed workspace's Supabase configuration. Do not copy or share the `service_role` key.
4. In VS Code, open **Terminal → New Terminal**. Check that the terminal starts in this repository's root folder.
5. If needed, install the Supabase CLI:

   ```sh
   brew install supabase/tap/supabase
   ```

   On other operating systems, follow the [Supabase CLI installation guide](https://supabase.com/docs/guides/cli/getting-started).

6. Sign in and link this repository to the project. Replace the example reference with the one you noted:

   ```sh
   supabase login
   supabase link --project-ref abcdefghijk
   ```

   If asked for a database password, use the database password configured for this Supabase project, not your Supabase website password.

7. Confirm the target before applying anything:

   ```sh
   supabase projects list
   supabase migration list
   ```

   Check that the linked project is the intended environment and review which local migrations are pending. This repository contains other workspace migrations as well as email migrations. `supabase db push` applies **all pending migrations in this repository**, not just the email changes. If the project is production, review the pending list and follow your normal approval or staging process before continuing.

## Part 2: Apply the database changes

The email suite uses two relevant migrations:

- `20261024220000_add_email_html_body.sql` adds the stored HTML email body.
- `20261024230000_add_email_composer_features.sql` adds personal/shared templates, scheduled sends, policies, and the private channel attachment bucket.

From the repository root in the VS Code terminal, run:

```sh
supabase db push
```

Review the migration list and confirm when prompted. Wait for the command to finish successfully before deploying the application functions.

### Verify the migration in Supabase

1. In the Supabase Dashboard, open **Table Editor**.
2. Confirm `email_templates` and `email_scheduled_sends` exist.
3. Open `email_messages` and confirm the `body_html` column exists.
4. Open **Storage → Files** and confirm a private bucket named `channel-attachments` exists. Do not change it to public.
5. In the SQL Editor, you can check the key objects using:

   ```sql
   select to_regclass('public.email_templates') as templates_table,
          to_regclass('public.email_scheduled_sends') as scheduled_sends_table;

   select column_name
   from information_schema.columns
   where table_schema = 'public'
     and table_name = 'email_messages'
     and column_name = 'body_html';
   ```

   The table checks should return their table names, and the column query should return `body_html`. If a check fails, stop and inspect the failed migration in **Database → Migrations** and the CLI output. Do not manually create replacement tables or policies.

## Part 3: Confirm required Supabase function secrets

The existing Microsoft OAuth secrets must already be configured. In the Supabase Dashboard, open **Edge Functions → Secrets** (some dashboard versions show **Secrets** directly under **Edge Functions**).

For the suite rollout, confirm these are present:

| Secret | Purpose |
| --- | --- |
| `MAIL_REDIRECT_URI` | Exact deployed workspace OAuth callback URL, including `/?mail_oauth=callback` |
| `MAIL_TOKEN_ENCRYPTION_KEY` | Base64-encoded 32-byte key used to encrypt provider tokens |
| `MICROSOFT_MAIL_CLIENT_ID` | Microsoft Entra application (client) ID |
| `MICROSOFT_MAIL_CLIENT_SECRET` | Microsoft Entra client secret **Value**, not its ID |
| `MICROSOFT_TENANT_ID` | Microsoft Entra directory (tenant) ID |

Do not generate a replacement encryption key when mailboxes already contain saved tokens. Changing it can make existing stored tokens unreadable and require reconnecting each mailbox. See [Email inbox setup: step-by-step](./email-inbox-setup.md) for instructions to create these secrets and Microsoft OAuth credentials.

### Add scheduled-delivery secret

Scheduled delivery requires a separate secret that the database job uses to authenticate to the maintenance function:

1. In a terminal, generate a unique value:

   ```sh
   openssl rand -hex 32
   ```

2. Copy the output to a password manager temporarily.
3. In **Supabase Dashboard → Edge Functions → Secrets**, add:
   - Name: `MAIL_MAINTENANCE_SECRET`
   - Value: the generated value
4. Keep this value private. You will also add the same value to Supabase Vault in Part 6. Never put it in frontend configuration, source control, or a screenshot.

## Part 4: Deploy the updated Edge Functions

The updated UI depends on the latest email API and sync functions. The scheduled worker and webhook have separate authentication behavior, so use `--no-verify-jwt` **only** for those two functions.

In the VS Code terminal at the repository root, deploy the authenticated functions:

```sh
supabase functions deploy mail-connect
supabase functions deploy mail-sync
supabase functions deploy mail-api
supabase functions deploy mail-ai
supabase functions deploy mail-admin
```

Then deploy the two functions that validate requests themselves:

```sh
supabase functions deploy mail-webhook --no-verify-jwt
supabase functions deploy mail-maintenance --no-verify-jwt
```

If you have only configured Microsoft 365, deploying `mail-ai` is still fine; AI actions will return a configuration message until Azure OpenAI is set up. The exact same seven functions should show as deployed in **Supabase Dashboard → Edge Functions**.

### Check function logs if deployment fails

1. In the Supabase Dashboard, open **Edge Functions**.
2. Select the function whose deployment or request failed.
3. Open **Logs** and inspect the latest entry and timestamp.
4. Also inspect the terminal output for the `supabase functions deploy` command. Fix the reported issue, then redeploy that function.

Do not turn off JWT verification for `mail-api`, `mail-sync`, or other user-facing functions to work around an authorization error.

## Part 5: Enable arrival notifications (optional)

Skip this part if you are content to sync manually with the inbox refresh button. This part does not replace the maintenance schedule in Part 6; the schedule is required to renew notification subscriptions and send scheduled messages. Without maintenance, provider notifications eventually expire.

1. In **Supabase Dashboard → Project Settings → API**, copy the project URL.
2. Construct the webhook URL by adding `/functions/v1/mail-webhook`:

   ```text
   https://<project-ref>.supabase.co/functions/v1/mail-webhook
   ```

3. Generate a separate unique secret:

   ```sh
   openssl rand -hex 32
   ```

4. In **Edge Functions → Secrets**, add:
   - `MAIL_WEBHOOK_URL` = the HTTPS URL from step 2
   - `MAIL_WEBHOOK_SHARED_SECRET` = the generated value
5. Confirm `mail-webhook` is deployed using `--no-verify-jwt` as shown in Part 4.
6. In the workspace, remove and reconnect each mailbox that should receive notifications, or use the app's mailbox connection flow to refresh its provider subscription. New provider subscriptions are created during mailbox connection.
7. Send a safe test message to the connected mailbox and confirm it appears after the provider notification sync. If it does not, manually sync first, then inspect **Edge Functions → mail-webhook → Logs** and **mail-sync → Logs**.

The webhook must be publicly reachable over HTTPS. Do not expose the webhook shared secret to users.

## Part 6: Configure the once-per-minute maintenance job

This step is required for scheduled emails to send while the user is offline. It also renews provider notification subscriptions and runs email retention cleanup. Without this job, scheduled emails remain pending.

### Enable the Supabase extensions

1. In the Supabase Dashboard, select the project.
2. Open **Database → Extensions**.
3. Search for and enable:
   - `pg_cron`
   - `pg_net`
   - `supabase_vault` (the dashboard may display it as `vault`)
4. If the extension is unavailable for your plan or project, stop here and consult the Supabase documentation or administrator; do not put the maintenance secret directly in a public frontend setting.

### Save the function URL and secret in Vault

1. The function URL is:

   ```text
   https://<project-ref>.supabase.co/functions/v1/mail-maintenance
   ```

2. In the Dashboard, open **Database → Vault → Secrets** and select **New secret**.
3. Create these two Vault entries:

   | Name | Value |
   | --- | --- |
   | `email_maintenance_url` | The function URL above |
   | `email_maintenance_secret` | The exact value used for `MAIL_MAINTENANCE_SECRET` in Part 3 |

4. If the Vault page is not available, you can create the entries in **SQL Editor → New query**. Replace both examples first. SQL Editor may save query history, so prefer the Vault page if possible:

   ```sql
   select vault.create_secret(
     'https://<project-ref>.supabase.co/functions/v1/mail-maintenance',
     'email_maintenance_url'
   );

   select vault.create_secret(
     '<paste-the-MAIL_MAINTENANCE_SECRET-value-here>',
     'email_maintenance_secret'
   );
   ```

   Do not run these statements repeatedly without first checking for existing Vault entries. Avoid leaving obsolete or duplicate values behind.

### Create the minute-level job

1. In the Supabase Dashboard, open **SQL Editor → New query**.
2. Paste the SQL below and select **Run**. It removes this project's older hourly or minute-level job with the same known job names, then schedules one request every minute:

   ```sql
   select cron.unschedule(jobid)
   from cron.job
   where jobname in (
     'email-inbox-maintenance-hourly',
     'email-inbox-maintenance-minute'
   );

   select cron.schedule(
     'email-inbox-maintenance-minute',
     '* * * * *',
     $$
     select net.http_post(
       url := (
         select decrypted_secret
         from vault.decrypted_secrets
         where name = 'email_maintenance_url'
       ),
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'x-mail-maintenance-secret',
         (
           select decrypted_secret
           from vault.decrypted_secrets
           where name = 'email_maintenance_secret'
         )
       ),
       body := '{}'::jsonb
     );
     $$
   );
   ```

3. Confirm the job exists by running:

   ```sql
   select jobid, schedule, command
   from cron.job
   where jobname = 'email-inbox-maintenance-minute';
   ```

   Expect one row with schedule `* * * * *`.
4. After a minute or two, check **Edge Functions → mail-maintenance → Logs** for a request. A successful invocation may report zero scheduled sends; that is normal when there are no due messages.
5. To inspect job execution history, run:

   ```sql
   select jobid, status, return_message, start_time, end_time
   from cron.job_run_details
   where jobid = (
     select jobid
     from cron.job
     where jobname = 'email-inbox-maintenance-minute'
   )
   order by start_time desc
   limit 10;
   ```

If the job exists but calls fail, confirm both Vault names and values, `MAIL_MAINTENANCE_SECRET`, the project reference in the function URL, the deployment status, and the function logs. The Vault secret and Edge Function secret must match exactly.

## Part 7: Publish the updated frontend

The database and functions do not automatically update the website. Build and deploy the updated frontend separately.

1. In VS Code, open **Terminal → New Terminal** at the repository root.
2. Install the repository dependencies if they are not already installed:

   ```sh
   npm install
   ```

3. Build the frontend:

   ```sh
   npm run build
   ```

   The command should complete successfully. The build may print a large JavaScript bundle warning; that warning does not by itself mean the build failed.
4. Deploy the branch/commit using the hosting platform configured for this repository. For a Vercel-hosted workspace:
   - Open the [Vercel Dashboard](https://vercel.com/dashboard) and select the workspace project.
   - Open **Deployments** and confirm the Git repository and production branch are the expected ones.
   - If production deploys automatically from Git, push the reviewed change to that branch using your normal Git workflow; otherwise, use the project's configured deployment flow.
   - Wait for the deployment to finish with **Ready** status, then open the production domain from the deployment details.
5. Hard-refresh the workspace page or open it in a private browser window to ensure you are testing the newly deployed frontend.

Do not upload the local `dist/` directory as a source-code change unless your hosting workflow explicitly requires committed build output. This project produces `dist/` from `npm run build`.

## Part 8: Verify the new features safely

Use a test mailbox and test channel, or coordinate with the mailbox owner before sending anything.

### Verify inbox display and threading

1. Sign in to the deployed workspace and open **Inbox**.
2. Select the connected Microsoft 365 mailbox and choose **Sync inbox** if messages are missing.
3. Confirm messages with the same conversation appear grouped together.
4. Open a conversation and confirm messages display in chronological order.
5. Open an HTML email with an image or link. Images may still be blocked by the sender or network; only use links you trust.

The inbox sync keeps the 100 newest messages per Microsoft folder per refresh. The conversation view can only group messages already synchronized in the current folder.

### Verify formatting, templates, and sending

1. Select **Compose**.
2. Enter a test recipient you control, a subject, and a short body.
3. Use the formatting toolbar for bold, italics, lists, and links.
4. Attach a small test file if desired; new-message attachments are limited to 10 files and 3 MB combined.
5. Send only to a controlled test address and confirm it arrives with formatting intact.
6. Save a personal template and confirm it is available to its creator. An administrator can create a shared template for other workspace users.

### Verify channel forwarding

1. Open a test email and select the action to forward it to a channel.
2. Choose a channel whose members are allowed to see the email and its attachments. Channel forwarding copies the message content and files into the channel.
3. Confirm the posted message and files are visible to the intended channel members.
4. Never forward confidential content to a public or broader channel by mistake.

The `channel-attachments` bucket is private. Private-channel file access depends on channel membership and the channel posting policy.

### Verify scheduled sending

1. Compose a test email to an address you control.
2. Choose a date and time in the future. The time is selected in the browser's local timezone.
3. Schedule it and open the **Scheduled** view. Confirm the message appears with the expected time and subject.
4. Cancel it before it is due. Confirm its status changes to cancelled.
5. For an actual send test, schedule a separate test message a few minutes ahead and leave it scheduled. Confirm the **Scheduled** view changes to sent and that the recipient receives it.
6. Check **Edge Functions → mail-maintenance → Logs** and the job history in Part 6 if the message remains pending or fails.

## Troubleshooting

| Symptom | Where to check and what to do |
| --- | --- |
| New templates or scheduled-send view reports a missing table | In **Supabase → Database → Migrations**, check whether the migrations applied. In VS Code, run `supabase migration list` and verify the repository is linked to the correct project before running `supabase db push`. |
| Email displays without formatting or images | Confirm `body_html` exists in `email_messages`, redeploy `mail-sync`, then sync the mailbox again. Remote images can be blocked by the sender, browser, or network. |
| Scheduled message remains pending | Confirm the minute job exists and is active, inspect `cron.job_run_details`, check Vault names/values, confirm `mail-maintenance` is deployed with `--no-verify-jwt`, and inspect its Edge Function logs. |
| Scheduled message fails | Open the inbox's **Scheduled** view and read the failure detail. Then check **Supabase → Edge Functions → mail-maintenance → Logs**. For replies, make sure the original message is still present in the mailbox. |
| Cancellation says the message is no longer scheduled | The maintenance worker may already have claimed the message for sending. Refresh the Scheduled view and check its current status before retrying or composing another message. |
| Sending attachments fails | Attachments are limited to Microsoft 365 for new messages, 10 files, and 3 MB combined. Replies do not support attachments. |
| Forwarded channel files cannot be opened | Confirm the latest migration ran, the destination channel still exists, and the user has access to that channel. Check the private bucket and Storage policy in Supabase. |
| New mail does not appear automatically | Automatic notifications are optional. Check `MAIL_WEBHOOK_URL`, `MAIL_WEBHOOK_SHARED_SECRET`, the `mail-webhook` deployment, and `mail-webhook`/`mail-sync` logs. Use manual sync while troubleshooting. |
| OAuth works in one deployment but not another | Ensure that deployment uses the same intended Supabase project and that `MAIL_REDIRECT_URI` matches the deployed domain exactly. |

## Reference: full initial setup

This guide assumes the Microsoft 365 connection is already configured. For the complete initial process—including Microsoft Entra app registration, Graph permissions, OAuth callback setup, base Supabase secrets, first mailbox connection, optional push notifications, and Azure OpenAI—see [Email inbox setup: step-by-step](./email-inbox-setup.md).
