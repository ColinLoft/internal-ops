import { serveWithCors } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sha256Hex } from '../_shared/pdf-signing.ts';
import { getContractPdfPageCount, validatePlacedContractFields, type PlacedContractField } from '../_shared/contract-signing.ts';
import { deliverContractEmail } from '../_shared/contract-email.ts';

const siteOrigin = Deno.env.get('SITE_URL') ? new URL(Deno.env.get('SITE_URL')!).origin : '*';
const corsHeaders = {
  'Access-Control-Allow-Origin': siteOrigin,
  'Vary': 'Origin',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Cache-Control': 'no-store', 'Content-Type': 'application/json' } });
const bytesToBase64Url = (value: Uint8Array) =>
  btoa(String.fromCharCode(...value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const createSigningToken = async (requestId: string, secret: string) => {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = new Uint8Array(await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`flown-contract-signature-v2:${requestId}`),
  ));
  return bytesToBase64Url(digest);
};
const htmlEscape = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character] || character));

serveWithCors(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  try {
    const url = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const authorization = request.headers.get('Authorization');
    if (!url || !anonKey || !serviceKey || !authorization) return json({ error: 'Authentication required.' }, 401);

    const caller = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: { user }, error: authError } = await caller.auth.getUser();
    if (authError || !user) return json({ error: 'Authentication required.' }, 401);
    const { data: canEdit, error: accessError } = await caller.rpc('has_app_access', {
      p_app: 'customers',
      p_min: 'edit',
    });
    if (accessError || canEdit !== true) return json({ error: 'Customer edit access is required.' }, 403);
    const admin = createClient(url, serviceKey);
    const body = await request.json() as Record<string, unknown>;
    const action = typeof body.action === 'string' ? body.action : 'create';

    if (action === 'send') {
      const contractId = typeof body.contractId === 'string' ? body.contractId : '';
      const sourceFileId = typeof body.sourceFileId === 'string' ? body.sourceFileId : '';
      const requestId = typeof body.requestId === 'string' ? body.requestId : '';
      const fields = Array.isArray(body.fields) ? body.fields as PlacedContractField[] : [];
      if (!contractId || !sourceFileId || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(requestId)) {
        return json({ error: 'A contract, current PDF, and valid request ID are required.' }, 400);
      }
      const siteUrl = Deno.env.get('SITE_URL');
      if (!siteUrl) return json({ error: 'SITE_URL must be configured before sending signing invitations.' }, 503);
      const { data: contract, error: contractError } = await admin.from('customer_contracts')
        .select('id,name,status,counterparty_name,counterparty_email,counter_signer_id')
        .eq('id', contractId).maybeSingle();
      if (contractError || !contract || !['draft', 'pending_signature'].includes(contract.status)) {
        return json({ error: 'Only a draft or pending contract can be sent for signature.' }, 409);
      }
      if (!contract.counter_signer_id || !contract.counterparty_name?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contract.counterparty_email || '')) {
        return json({ error: 'Select a Flown countersigner and complete the recipient name and email before sending.' }, 400);
      }
      const { data: sourceFile, error: fileError } = await admin.from('customer_contract_files')
        .select('id,contract_id,file_name,storage_path,file_kind,mime_type,file_size,version_number')
        .eq('id', sourceFileId).eq('contract_id', contractId)
        .in('file_kind', ['original_pdf', 'document']).eq('mime_type', 'application/pdf').maybeSingle();
      if (fileError || !sourceFile) return json({ error: 'Upload an original agreement PDF before sending.' }, 409);
      const { data: latest, error: latestError } = await admin.from('customer_contract_files')
        .select('id').eq('contract_id', contractId).in('file_kind', ['original_pdf', 'document'])
        .eq('mime_type', 'application/pdf').order('created_at', { ascending: false }).order('id', { ascending: false }).limit(1);
      if (latestError || latest?.[0]?.id !== sourceFile.id) {
        return json({ error: 'The agreement has a newer PDF version. Place fields on the current original and try again.' }, 409);
      }
      const { data: originalBlob, error: downloadError } = await admin.storage.from('contracts-files').download(sourceFile.storage_path);
      if (downloadError || !originalBlob || originalBlob.size > 50 * 1024 * 1024) return json({ error: 'The original PDF is unavailable or exceeds the 50 MB limit.' }, 413);
      const originalBytes = new Uint8Array(await originalBlob.arrayBuffer());
      if (new TextDecoder().decode(originalBytes.subarray(0, 5)) !== '%PDF-') return json({ error: 'The uploaded original is not a valid PDF.' }, 422);
      const pageCount = await getContractPdfPageCount(originalBytes);
      validatePlacedContractFields(fields, pageCount);

      const token = await createSigningToken(requestId, serviceKey);
      const tokenHash = await sha256Hex(new TextEncoder().encode(token));
      const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
      const { data: preparedRequestId, error: prepareError } = await admin.rpc('create_customer_contract_signature_request_v2', {
        p_request_id: requestId,
        p_contract_id: contractId,
        p_source_file_id: sourceFileId,
        p_created_by: user.id,
        p_token_hash: tokenHash,
        p_expires_at: expiresAt,
        p_placement_fields: fields,
      });
      if (prepareError) throw prepareError;

      const signingUrl = new URL('/contract-signature', siteUrl);
      signingUrl.searchParams.set('token', token);
      const safeName = htmlEscape(contract.counterparty_name);
      const safeContractName = htmlEscape(contract.name);
      const safeUrl = htmlEscape(signingUrl.toString());
      const result = await deliverContractEmail({
        to: contract.counterparty_email,
        subject: `Please sign: ${contract.name}`,
        text: `Hello ${contract.counterparty_name},\n\nPlease review and sign "${contract.name}" using this secure link:\n${signingUrl}\n\nThe link expires in 14 days. The selected Flown countersigner will complete the agreement after you sign.`,
        html: `<p>Hello ${safeName},</p><p>Please review and sign <strong>${safeContractName}</strong> using the secure link below.</p><p><a href="${safeUrl}">Review and sign agreement</a></p><p>This link expires in 14 days. The selected Flown countersigner will complete the agreement after you sign.</p>`,
        idempotencyKey: `contract-invite-${preparedRequestId}`,
      });
      if (!result.sent) {
        await admin.from('customer_contract_signature_requests').update({ email_error: result.error }).eq('id', preparedRequestId);
        return json({ sent: false, requestId: preparedRequestId, error: result.error }, result.error.includes('not configured') ? 503 : 502);
      }

      const { error: markError } = await admin.rpc('mark_customer_contract_signature_request_sent_v2', {
        p_request_id: preparedRequestId,
        p_user_id: user.id,
        p_token_hash: tokenHash,
        p_resend_email_id: result.emailId || '',
      });
      if (markError) {
        return json({ sent: false, requestId: preparedRequestId, error: 'Resend accepted the invitation, but its delivery status could not be saved. Retry safely; duplicate email is suppressed.' }, 503);
      }
      return json({ sent: true, requestId: preparedRequestId, expiresAt });
    }

    if (action === 'mark-sent') {
      const requestId = typeof body.requestId === 'string' ? body.requestId : '';
      if (!requestId) return json({ error: 'A signature request ID is required.' }, 400);
      const { error: markError } = await admin.rpc('mark_customer_contract_signature_request_sent', {
        p_request_id: requestId,
        p_user_id: user.id,
      });
      if (markError) throw markError;
      return json({ sent: true });
    }
    return json({ error: 'Legacy share-link creation is retired. Use the placed-field email workflow.' }, 410);
  } catch (error) {
    console.error('Contract signature link failed:', error);
    return json({ error: error instanceof Error ? error.message : 'The signature link could not be created.' }, 400);
  }
});
