# Email inbox setup

The inbox connects organization Microsoft 365 and Google Workspace mailboxes. Provider tokens are encrypted in Supabase; message content and user-requested AI results are stored in Supabase under row-level security and the configured retention period.

## Deploy the database and functions

Apply the migration and deploy the authenticated functions:

```sh
supabase db push
supabase functions deploy mail-connect
supabase functions deploy mail-sync
supabase functions deploy mail-api
supabase functions deploy mail-ai
supabase functions deploy mail-admin
```

The provider webhook and scheduled maintenance endpoints authenticate requests inside the function, so deploy them without Supabase JWT verification:

```sh
supabase functions deploy mail-webhook --no-verify-jwt
supabase functions deploy mail-maintenance --no-verify-jwt
```

Configure Edge Function secrets before connecting mailboxes:

| Secret | Required | Purpose |
| --- | --- | --- |
| `MAIL_REDIRECT_URI` | Yes | Exact OAuth callback URI, including `?mail_oauth=callback`, e.g. `https://workspace.example.com/?mail_oauth=callback`. Register this exact URI with both providers. |
| `MAIL_TOKEN_ENCRYPTION_KEY` | Yes | Base64-encoded 32-byte AES-GCM key. Generate with `openssl rand -base64 32`. |
| `GOOGLE_MAIL_CLIENT_ID` / `GOOGLE_MAIL_CLIENT_SECRET` | Google | Google OAuth web client credentials. |
| `MICROSOFT_MAIL_CLIENT_ID` / `MICROSOFT_MAIL_CLIENT_SECRET` | Microsoft | Microsoft Entra app credentials. |
| `MICROSOFT_TENANT_ID` | Microsoft | Entra tenant ID; defaults to `organizations`. |
| `MAIL_WEBHOOK_URL` | Push updates | Public HTTPS URL ending in `/functions/v1/mail-webhook`. |
| `MAIL_WEBHOOK_SHARED_SECRET` | Push updates | Random secret used only for authenticated internal webhook-to-sync calls. |
| `GOOGLE_PUBSUB_TOPIC` | Gmail push | Full Pub/Sub topic name, e.g. `projects/my-project/topics/gmail-notifications`. |
| `GMAIL_PUBSUB_AUDIENCE` | Gmail push | Exact audience configured on the Pub/Sub OIDC push subscription; usually the webhook function URL. |
| `GMAIL_PUBSUB_SERVICE_ACCOUNT` | Gmail push | Email address of the service account used by Pub/Sub's OIDC push authentication. |
| `MAIL_MAINTENANCE_SECRET` | Scheduled renewal | Random secret sent to the `mail-maintenance` function by the scheduled job. |
| `AZURE_OPENAI_ENDPOINT` / `AZURE_OPENAI_API_KEY` / `AZURE_OPENAI_DEPLOYMENT` | AI actions | Azure OpenAI endpoint, key, and deployment name. |
| `AZURE_OPENAI_API_VERSION` | Optional | API version; defaults to `2024-10-21`. |

Set these in Supabase secrets, not in frontend environment variables or source control:

```sh
supabase secrets set --project-ref <project-ref> \
  MAIL_REDIRECT_URI="https://workspace.example.com/?mail_oauth=callback" \
  MAIL_TOKEN_ENCRYPTION_KEY="<base64-32-byte-key>" \
  GOOGLE_MAIL_CLIENT_ID="<google-client-id>" \
  GOOGLE_MAIL_CLIENT_SECRET="<google-client-secret>" \
  MICROSOFT_MAIL_CLIENT_ID="<entra-client-id>" \
  MICROSOFT_MAIL_CLIENT_SECRET="<entra-client-secret>" \
  MICROSOFT_TENANT_ID="<tenant-id>" \
  MAIL_WEBHOOK_URL="https://<project-ref>.supabase.co/functions/v1/mail-webhook" \
  MAIL_WEBHOOK_SHARED_SECRET="<random-secret>" \
  MAIL_MAINTENANCE_SECRET="<different-random-secret>" \
  GOOGLE_PUBSUB_TOPIC="projects/<project>/topics/gmail-notifications" \
  GMAIL_PUBSUB_AUDIENCE="https://<project-ref>.supabase.co/functions/v1/mail-webhook" \
  GMAIL_PUBSUB_SERVICE_ACCOUNT="<push-service-account>@<project>.iam.gserviceaccount.com" \
  AZURE_OPENAI_ENDPOINT="https://<resource>.openai.azure.com" \
  AZURE_OPENAI_API_KEY="<azure-openai-key>" \
  AZURE_OPENAI_DEPLOYMENT="<deployment-name>"
```

Omit provider-specific values when that provider is not yet configured. OAuth is organization-domain restricted: domains in use by workspace profile email addresses are the allowlist. A Google shared mailbox must be connected by signing in directly as that mailbox; Microsoft shared mailboxes use delegated `Mail.ReadWrite.Shared` and `Mail.Send.Shared` permissions.

## Microsoft 365

1. Register a Microsoft Entra application for work/school accounts and add the callback URI above as a Web redirect URI.
2. Create a client secret and configure the Entra client ID, secret, and tenant ID in Supabase.
3. Add delegated Microsoft Graph permissions `User.Read`, `Mail.ReadWrite`, `Mail.Send`, `Mail.ReadWrite.Shared`, and `Mail.Send.Shared`. Grant tenant admin consent where required for shared-mailbox access.
4. Ensure the public webhook URL is reachable over HTTPS. Graph validates it during subscription creation.

Graph message subscriptions expire after at most 4,230 minutes. The scheduled maintenance function renews them before expiry.

## Google Workspace

1. Enable the Gmail API, configure an OAuth consent screen, and create a Web application OAuth client with the callback URI above.
2. Request the Gmail `gmail.modify` and `gmail.send` scopes. Google may require verification before production users can authorize these scopes.
3. Create the Pub/Sub topic and grant `gmail-api-push@system.gserviceaccount.com` permission to publish to it.
4. Create an authenticated push subscription targeting `MAIL_WEBHOOK_URL`. Configure OIDC authentication with the service account in `GMAIL_PUBSUB_SERVICE_ACCOUNT` and use `GMAIL_PUBSUB_AUDIENCE` as its audience.
5. Verify that the Pub/Sub push subscription is active. Gmail watches expire after seven days and are renewed by maintenance.

## Schedule maintenance

The `mail-maintenance` function purges expired message content and renews provider push watches/subscriptions. Enable the Supabase `pg_cron`, `pg_net`, and Vault extensions, store the endpoint and secret in Vault, and schedule it hourly:

```sql
select vault.create_secret(
  'https://<project-ref>.supabase.co/functions/v1/mail-maintenance',
  'email_maintenance_url'
);

select vault.create_secret('<MAIL_MAINTENANCE_SECRET>', 'email_maintenance_secret');

select cron.schedule(
  'email-inbox-maintenance-hourly',
  '0 * * * *',
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

The retention value can be changed by an administrator in People & Access → Email access and retention. It applies to future syncs and the next purge run. Mailbox owners can create rules in the inbox for sender/subject matching, labeling, marking read, and archiving. Rules run during mailbox sync and are applied to the provider mailbox as well as the workspace copy.

The current sync fetches up to the 100 newest Google messages in the retention window and up to 100 messages per Microsoft folder per refresh. Provider push notifications add new messages as they arrive; search covers messages already synced into the workspace. AI is opt-in per message: selecting Summarize or Draft reply sends that message to Azure OpenAI, and the generated result is saved in the workspace.

If push notifications are not configured, users can sync manually from the inbox. Attachment contents are not copied into the workspace; the inbox indicates attachments and users can open them at their provider.
