import { serveWithCors } from '../_shared/cors.ts';
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
serveWithCors(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  let uploadedPath: string | null = null;
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const authorization = request.headers.get('Authorization');
    if (!url || !anonKey || !serviceKey || !authorization) return json({ error: 'Authentication required.' }, 401);

    const caller = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: { user }, error: authError } = await caller.auth.getUser();
    if (authError || !user) return json({ error: 'Authentication required.' }, 401);
    const admin = createClient(url, serviceKey);

    const body = await request.json() as Record<string, unknown>;
    const documentId = typeof body.documentId === 'string' ? body.documentId : '';
    const signedName = typeof body.signedName === 'string' ? body.signedName.trim().slice(0, 200) : '';
    const signaturePng = typeof body.signaturePng === 'string' ? body.signaturePng : '';
    const acknowledged = body.acknowledged === true;
    if (!documentId || !signedName || signedName.length < 2) {
      return json({ error: 'A document and full legal name are required.' }, 400);
    }

    const { data: document, error: documentError } = await admin.from('organization_documents')
      .select('id,title,status,storage_path,requires_signature,requires_acknowledgement,required_onboarding')
      .eq('id', documentId).maybeSingle();
    if (documentError || !document || document.status !== 'published' || !document.storage_path) {
      return json({ error: 'This document is unavailable or has no uploaded PDF.' }, 404);
    }
    if (document.requires_acknowledgement && !acknowledged) {
      return json({ error: 'Confirm that you have read and understood the document.' }, 400);
    }
    if (document.requires_signature && !signaturePng.startsWith('data:image/png;base64,')) {
      return json({ error: 'A drawn signature is required for this document.' }, 400);
    }

    const { data: assignment } = await admin.from('organization_document_assignments')
      .select('id').eq('document_id', documentId).eq('user_id', user.id).eq('status', 'pending').maybeSingle();
    if (!document.required_onboarding && !assignment) {
      return json({ error: 'You are not assigned to sign this document.' }, 403);
    }

    let { data: version, error: versionError } = await admin.from('organization_document_versions')
      .select('id,storage_path,file_name,version_number,sha256')
      .eq('document_id', documentId).eq('storage_path', document.storage_path).maybeSingle();
    if (versionError) throw versionError;

    const { data: originalBlob, error: downloadError } = await admin.storage
      .from('organization-documents').download(document.storage_path);
    if (downloadError || !originalBlob) throw new Error('The original PDF could not be loaded.');
    if (originalBlob.size > 50 * 1024 * 1024) return json({ error: 'The original PDF exceeds the 50 MB limit.' }, 413);
    const originalBytes = new Uint8Array(await originalBlob.arrayBuffer());
    if (new TextDecoder().decode(originalBytes.subarray(0, 5)) !== '%PDF-') {
      return json({ error: 'The published document is not a valid PDF.' }, 422);
    }

    if (!version) {
      const { data: inserted, error: insertError } = await admin.from('organization_document_versions')
        .insert({
          document_id: documentId,
          storage_path: document.storage_path,
          file_name: document.storage_path.split('/').pop() || `${document.title}.pdf`,
          mime_type: 'application/pdf',
          file_size: originalBytes.length,
          sha256: await sha256Hex(originalBytes),
          uploaded_by: user.id,
        })
        .select('id,storage_path,file_name,version_number,sha256').single();
      if (insertError) throw insertError;
      version = inserted;
    }

    const originalSha256 = await sha256Hex(originalBytes);
    const signatureBytes = signaturePng ? decodePngSignature(signaturePng) : undefined;
    const { bytes: signedBytes, signedAt } = await appendSignaturePage(originalBytes, {
      title: String(document.title),
      version: String(version.version_number),
      signedName,
      signaturePng: signatureBytes,
      signatureLabel: document.requires_signature ? 'Electronic signature' : 'Acknowledgment',
    });
    const signatureSha256 = signatureBytes ? await sha256Hex(signatureBytes) : null;
    const signedSha256 = await sha256Hex(signedBytes);
    const signedPath = `signatures/${documentId}/${user.id}/${version.id}-${crypto.randomUUID()}-signed.pdf`;
    const { error: uploadError } = await admin.storage.from('organization-documents').upload(signedPath, signedBytes, {
      contentType: 'application/pdf',
      upsert: false,
    });
    if (uploadError) throw uploadError;
    uploadedPath = signedPath;

    const { error: recordError } = await admin.rpc('record_organization_document_signature', {
      p_document_id: documentId,
      p_user_id: user.id,
      p_document_version_id: version.id,
      p_signed_name: signedName,
      p_signed_storage_path: signedPath,
      p_signature_sha256: signatureSha256,
      p_original_sha256: originalSha256,
      p_signed_sha256: signedSha256,
      p_signed_at: signedAt,
    });
    if (recordError) throw recordError;

    const { data: signedUrl } = await admin.storage.from('organization-documents').createSignedUrl(signedPath, 60 * 60);
    uploadedPath = null;
    return json({
      signedAt,
      signedPdfUrl: signedUrl?.signedUrl ?? null,
      signedStoragePath: signedPath,
      version: version.version_number,
      signedSha256,
    });
  } catch (error) {
    if (uploadedPath) {
      const url = Deno.env.get('SUPABASE_URL');
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (url && serviceKey) {
        await createClient(url, serviceKey).storage.from('organization-documents').remove([uploadedPath]).catch(() => undefined);
      }
    }
    console.error('Document signing failed:', error);
    return json({ error: error instanceof Error ? error.message : 'The document could not be signed.' }, 400);
  }
});
