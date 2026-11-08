import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { clientsFor, bytesToBase64Url, emailCorsHeaders, jsonResponse } from '../_shared/email.ts';
import { decodePngSignature, sha256Hex } from '../_shared/pdf-signing.ts';
import { quoteToken, validateSignaturePng, validateSigner } from '../_shared/wildfire.ts';

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: emailCorsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) return jsonResponse({ error: 'Quote service is not configured.' }, 503);
    if (Number(request.headers.get('content-length')) > 750_000) return jsonResponse({ error: 'Request is too large.' }, 413);
    const bodyText = await request.text();
    if (bodyText.length > 750_000) return jsonResponse({ error: 'Request is too large.' }, 413);
    const body = JSON.parse(bodyText) as Record<string, unknown>;
    const admin = createClient(url, key, { auth: { persistSession: false } });
    if (body.action === 'publish' || body.action === 'revoke') {
      // --no-verify-jwt enables capability requests; staff actions validate JWT themselves.
      const { callerClient, user } = await clientsFor(request);
      const [profile, access] = await Promise.all([
        callerClient.from('profiles').select('account_status').eq('id', user.id).maybeSingle(),
        callerClient.rpc('has_app_access', { p_app: 'wildfire', p_min: 'edit' }),
      ]);
      if (profile.error || profile.data?.account_status !== 'active' || access.error || access.data !== true) return jsonResponse({ error: 'Active Wildfire editor access required.' }, 403);
      const quoteId = typeof body.quoteId === 'string' ? body.quoteId : '';
      if (!/^[a-f0-9-]{36}$/i.test(quoteId)) return jsonResponse({ error: 'Invalid quote ID.' }, 400);
      if (body.action === 'revoke') {
        const { error } = await admin.from('wildfire_quote_links').update({ revoked_at: new Date().toISOString() }).eq('quote_id', quoteId).is('revoked_at', null);
        if (error) throw new Error(error.message);
        return jsonResponse({ status: 'revoked' });
      }
      const site = Deno.env.get('SITE_URL');
      if (!site) return jsonResponse({ error: 'Configure SITE_URL before publishing quote links.' }, 503);
      const publicUrl = new URL(site);
      if (!['http:', 'https:'].includes(publicUrl.protocol)) throw new Error('SITE_URL must be an HTTP(S) application URL.');
      const token = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
      const tokenHash = await sha256Hex(new TextEncoder().encode(token));
      const { data, error } = await admin.rpc('wildfire_publish_quote', {
        p_quote_id: quoteId, p_token_hash: tokenHash, p_actor_id: user.id,
        p_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });
      if (error) throw new Error(error.message);
      publicUrl.pathname = '/';
      publicUrl.search = '';
      // Fragment keeps the bearer capability out of referrer headers and HTTP access logs.
      publicUrl.hash = `/wildfire/quote/${token}`;
      return jsonResponse({ url: publicUrl.href, expiresAt: data.expiresAt });
    }
    if (body.action !== 'details' && body.action !== 'accept') return jsonResponse({ error: 'Unknown quote action.' }, 400);
    const token = quoteToken(body.token);
    const tokenHash = await sha256Hex(new TextEncoder().encode(token));
    const { data: link, error: linkError } = await admin.from('wildfire_quote_links')
      .select('quote_id,expires_at,revoked_at').eq('token_hash', tokenHash).maybeSingle();
    if (linkError || !link) return jsonResponse({ error: 'Invalid quote link.' }, 404);
    if (link.revoked_at) return jsonResponse({ error: 'This quote link has been revoked.' }, 410);
    const { data: quote, error: quoteError } = await admin.from('wildfire_quotes')
      .select('snapshot,snapshot_sha256,status').eq('id', link.quote_id).maybeSingle();
    if (quoteError || !quote?.snapshot) return jsonResponse({ error: 'Quote is unavailable.' }, 404);
    if (quote.status !== 'accepted' && (new Date(link.expires_at).getTime() <= Date.now() || !['sent','viewed'].includes(quote.status))) {
      return jsonResponse({ error: 'This quote link is no longer active.' }, 410);
    }
    if (body.action === 'details') {
      // Read-only: no mutable original quote lines, signatures, costs, or CRM records exposed.
      const { crm: _crm, ...publicSnapshot } = quote.snapshot;
      return jsonResponse({ snapshot: publicSnapshot, snapshotSha256: quote.snapshot_sha256, status: quote.status, expiresAt: link.expires_at });
    }
    const { name, email } = validateSigner(body);
    const signaturePng = typeof body.signaturePng === 'string' ? body.signaturePng : '';
    const signature = decodePngSignature(signaturePng);
    validateSignaturePng(signature);
    const { data, error } = await admin.rpc('wildfire_accept_quote', {
      p_token_hash: tokenHash, p_name: name, p_email: email, p_signature_png: signaturePng,
      p_signature_sha256: await sha256Hex(signature),
      p_snapshot_sha256: quote.snapshot_sha256,
      p_acknowledged: true,
      p_audit: { user_agent: (request.headers.get('user-agent') || '').slice(0, 500), request_id: crypto.randomUUID(), signature_format: 'image/png', acknowledgement: 'I accept the published quote, proposal, and terms.' },
    });
    if (error) throw new Error(error.message);
    return jsonResponse(data);
  } catch (error) {
    // Do not log bearer tokens or signature bodies.
    return jsonResponse({ error: error instanceof Error ? error.message : 'Quote request failed.' }, 400);
  }
});
