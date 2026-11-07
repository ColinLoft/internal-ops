import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { appendSignaturePage, decodePngSignature, sha256Hex } from '../_shared/pdf-signing.ts';

const siteOrigin = Deno.env.get('SITE_URL') ? new URL(Deno.env.get('SITE_URL')!).origin : '*';
const corsHeaders = {
  'Access-Control-Allow-Origin': siteOrigin,
  'Vary': 'Origin',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  let uploadedPath: string | null = null;
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !serviceKey) return json({ error: 'The signing service is not configured.' }, 503);
    const admin = createClient(url, serviceKey);
    const body = await request.json() as Record<string, unknown>;
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    if (!/^[A-Za-z0-9_-]{40,50}$/.test(token)) return json({ error: 'This signing link is invalid.' }, 404);
    const tokenHash = await sha256Hex(new TextEncoder().encode(token));
    const { data: signingRequest, error: requestError } = await admin.from('customer_contract_signature_requests')
      .select('id,contract_id,source_file_id,status,expires_at,created_by,signed_file_id')
      .eq('token_hash', tokenHash).maybeSingle();
    if (requestError || !signingRequest) return json({ error: 'This signing link is invalid or has expired.' }, 404);

    if (signingRequest.status === 'completed' && signingRequest.signed_file_id) {
      const { data: signedFile } = await admin.from('customer_contract_files')
        .select('storage_path').eq('id', signingRequest.signed_file_id).maybeSingle();
      if (!signedFile) return json({ error: 'The signed agreement could not be loaded.' }, 404);
      const { data: urlData } = await admin.storage.from('contracts-files').createSignedUrl(signedFile.storage_path, 60 * 60);
      return json({ status: 'completed', signedPdfUrl: urlData?.signedUrl ?? null });
    }

    const expiresAt = new Date(signingRequest.expires_at).getTime();
    if (signingRequest.status !== 'pending' || expiresAt <= Date.now()) {
      return json({ error: signingRequest.status === 'revoked' ? 'This signing link has been replaced.' : 'This signing link is no longer active.' }, 410);
    }
    const { data: contract, error: contractError } = await admin.from('customer_contracts')
      .select('id,name,status').eq('id', signingRequest.contract_id).maybeSingle();
    if (contractError || !contract || contract.status !== 'pending_signature') {
      return json({ error: 'This agreement is no longer awaiting a signature.' }, 409);
    }
    const { data: originalFile, error: originalError } = await admin.from('customer_contract_files')
      .select('id,file_name,storage_path,file_kind,mime_type,file_size,version_number')
      .eq('id', signingRequest.source_file_id).eq('contract_id', signingRequest.contract_id)
      .in('file_kind', ['original_pdf', 'document']).eq('mime_type', 'application/pdf').maybeSingle();
    if (originalError || !originalFile) return json({ error: 'The original contract PDF is unavailable.' }, 404);
    const { data: latestOriginals, error: latestError } = await admin.from('customer_contract_files')
      .select('id').eq('contract_id', signingRequest.contract_id)
      .in('file_kind', ['original_pdf', 'document']).eq('mime_type', 'application/pdf')
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(1);
    if (latestError || latestOriginals?.[0]?.id !== originalFile.id) {
      return json({ error: 'The agreement has a newer PDF version. Ask the sender for a current signing link.' }, 409);
    }

    if (body.action === 'details') {
      const { data: originalUrl, error: linkError } = await admin.storage
        .from('contracts-files').createSignedUrl(originalFile.storage_path, 60 * 60);
      if (linkError || !originalUrl) return json({ error: 'The agreement PDF could not be opened.' }, 404);
      return json({
        status: 'pending',
        contractName: contract.name,
        originalFileName: originalFile.file_name,
        originalPdfUrl: originalUrl.signedUrl,
        expiresAt: signingRequest.expires_at,
      });
    }

    const signedName = typeof body.signedName === 'string' ? body.signedName.trim().slice(0, 200) : '';
    const signatureData = typeof body.signaturePng === 'string' ? body.signaturePng : '';
    if (signedName.length < 2 || body.acknowledged !== true || !signatureData) {
      return json({ error: 'Enter your full legal name, draw your signature, and confirm the agreement.' }, 400);
    }

    const { data: originalBlob, error: downloadError } = await admin.storage
      .from('contracts-files').download(originalFile.storage_path);
    if (downloadError || !originalBlob || originalBlob.size > 50 * 1024 * 1024) {
      return json({ error: 'The original PDF is unavailable or exceeds the signing size limit.' }, 413);
    }
    const originalBytes = new Uint8Array(await originalBlob.arrayBuffer());
    if (new TextDecoder().decode(originalBytes.subarray(0, 5)) !== '%PDF-') {
      return json({ error: 'The source agreement is not a valid PDF.' }, 422);
    }
    const signatureBytes = decodePngSignature(signatureData);
    const { bytes: signedBytes, signedAt } = await appendSignaturePage(originalBytes, {
      title: contract.name,
      version: String(originalFile.version_number),
      signedName,
      signaturePng: signatureBytes,
      signatureLabel: 'Customer electronic signature',
    });
    if (signedBytes.byteLength > 50 * 1024 * 1024) return json({ error: 'The signed PDF exceeds the 50 MB storage limit.' }, 413);
    const originalSha256 = await sha256Hex(originalBytes);
    const signedSha256 = await sha256Hex(signedBytes);
    const signatureSha256 = await sha256Hex(signatureBytes);
    const signedFileName = `${safeFileName(contract.name)}-signed.pdf`;
    const signedPath = `signed/${contract.id}/${signingRequest.id}-${crypto.randomUUID()}-signed.pdf`;
    const { error: uploadError } = await admin.storage.from('contracts-files').upload(signedPath, signedBytes, {
      contentType: 'application/pdf',
      upsert: false,
    });
    if (uploadError) throw uploadError;
    uploadedPath = signedPath;

    const { error: recordError } = await admin.rpc('record_customer_contract_signature', {
      p_request_id: signingRequest.id,
      p_signer_name: signedName,
      p_signed_storage_path: signedPath,
      p_signed_file_name: signedFileName,
      p_signed_file_size: signedBytes.byteLength,
      p_original_sha256: originalSha256,
      p_signed_sha256: signedSha256,
      p_signature_sha256: signatureSha256,
      p_signed_at: signedAt,
    });
    if (recordError) throw recordError;

    const { data: signedUrl } = await admin.storage.from('contracts-files').createSignedUrl(signedPath, 60 * 60);
    uploadedPath = null;
    return json({
      status: 'completed',
      signedPdfUrl: signedUrl?.signedUrl ?? null,
      signedSha256,
      signedAt,
    });
  } catch (error) {
    if (uploadedPath) {
      const url = Deno.env.get('SUPABASE_URL');
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (url && serviceKey) {
        await createClient(url, serviceKey).storage.from('contracts-files').remove([uploadedPath]).catch(() => undefined);
      }
    }
    console.error('Public contract signing failed:', error);
    return json({ error: error instanceof Error ? error.message : 'The agreement could not be signed.' }, 400);
  }
});

const safeFileName = (value: string) => value.replace(/[^\w.-]+/g, '_').slice(-150) || 'contract';
