# Flown Ops domain

The target production workspace origin is `https://ops.flown.org`. The frontend uses
relative routes and the current browser origin for form and support links, so
changing hosting domains does not require hardcoded frontend URL changes.

After connecting the domain in hosting and configuring DNS/TLS:

1. Set the Supabase Auth Site URL to `https://ops.flown.org`. Update allowed
   redirect URLs for the new origin and retain any needed localhost entries.
2. Set the Supabase Edge Function secret `SITE_URL=https://ops.flown.org`.
   Invitations, PDF signing, published quotes and CORS use this setting.
3. Update any externally configured webhook/callback URLs and system-monitor
   records that point at the former workspace domain.
4. Verify sign-in/password setup, staff invitation links, published forms,
   contract signing, quote acceptance and calls from the new origin.

Already-published links may contain the former origin. Retain a redirect from
the old domain while those links are still in use, preserving paths, queries and
hashes (including public bearer tokens). Newly generated links use the new origin.
Hosting, DNS, Supabase Auth settings and secrets are not changed by a code build.
