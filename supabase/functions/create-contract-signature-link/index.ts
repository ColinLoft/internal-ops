import { serveWithCors } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sha256Hex } from '../_shared/pdf-signing.ts';

const siteOrigin = Deno.env.get('SITE_URL') ? new URL(Deno.env.get('SITE_URL')!).origin : '*';
const corsHeaders = {
  'Access-Control-Allow-Origin': siteOrigin,
  'Vary': 'Origin',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const bytesToBase64Url = (value: Uint8Array) =>
  btoa(String.fromCharCode(...value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

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

    const contractId = typeof body.contractId === 'string' ? body.contractId : '';
    const sourceFileId = typeof body.sourceFileId === 'string' ? body.sourceFileId : '';
    if (!contractId || !sourceFileId) return json({ error: 'A contract and original PDF version are required.' }, 400);
    const siteUrl = Deno.env.get('SITE_URL');
    if (!siteUrl) return json({ error: 'SITE_URL must be configured before creating shareable signing links.' }, 503);

    const { data: contract, error: contractError } = await admin.from('customer_contracts')
      .select('id,status').eq('id', contractId).maybeSingle();
    if (contractError || !contract || !['draft', 'pending_signature'].includes(contract.status)) {
      return json({ error: 'Only a draft or pending contract can create a signing link.' }, 409);
    }
    const { data: sourceFile, error: fileError } = await admin.from('customer_contract_files')
      .select('id,contract_id,file_kind,mime_type')
      .eq('id', sourceFileId).eq('contract_id', contractId)
      .in('file_kind', ['original_pdf', 'document'])
      .eq('mime_type', 'application/pdf').maybeSingle();
    if (fileError || !sourceFile) return json({ error: 'Upload an original agreement PDF before creating a signing link.' }, 409);

    const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
    const token = bytesToBase64Url(tokenBytes);
    const tokenHash = await sha256Hex(new TextEncoder().encode(token));
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const { data: requestId, error: requestError } = await admin.rpc('create_customer_contract_signature_request', {
      p_contract_id: contractId,
      p_source_file_id: sourceFileId,
      p_created_by: user.id,
      p_token_hash: tokenHash,
      p_expires_at: expiresAt,
    });
    if (requestError) throw requestError;

    const signingUrl = new URL('/contract-signature', siteUrl);
    signingUrl.searchParams.set('token', token);
    return json({
      requestId,
      signingUrl: signingUrl.toString(),
      expiresAt,
      delivery: 'manual',
      message: 'Link created but not sent. Copy it and share it with the customer, then confirm only after it has been sent.',
    });
  } catch (error) {
    console.error('Contract signature link failed:', error);
    return json({ error: error instanceof Error ? error.message : 'The signature link could not be created.' }, 400);
  }
});
