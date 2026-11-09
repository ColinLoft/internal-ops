import { serveWithCors } from '../_shared/cors.ts';
import { createClient, type SupabaseClient, type User } from 'https://esm.sh/@supabase/supabase-js@2';
import { appendSignaturePage, decodePngSignature, sha256Hex } from '../_shared/pdf-signing.ts';
import { applyPlacedContractSignature, getContractPdfPageCount, validatePlacedContractFields, type PlacedContractField } from '../_shared/contract-signing.ts';
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
const safeFileName = (value: string) => value.replace(/[^\w.-]+/g, '_').slice(-150) || 'contract';
const htmlEscape = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character] || character));

const decodeSignatureSet = (
  fields: PlacedContractField[],
  signer: PlacedContractField['signer'],
  raw: unknown,
) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Sign each signature field on the PDF.');
  const submitted = raw as Record<string, unknown>;
  const signatureFields = fields.filter((field) => field.signer === signer && field.kind === 'signature');
  if (!signatureFields.length) throw new Error('The PDF has no signature field for this signer.');
  const allowed = new Set(signatureFields.map((field) => field.id));
  if (Object.keys(submitted).some((key) => !allowed.has(key))) throw new Error('A signature does not match the placed PDF fields.');
  const signatures: Record<string, Uint8Array> = {};
  let totalBytes = 0;
  for (const field of signatureFields) {
    const value = submitted[field.id];
    if (typeof value !== 'string') throw new Error('Sign every signature field placed for you.');
    const bytes = decodePngSignature(value);
    totalBytes += bytes.byteLength;
    if (totalBytes > 2 * 1024 * 1024) throw new Error('The combined signatures exceed the 2 MB limit.');
    signatures[field.id] = bytes;
  }
  return signatures;
};

const createSignedPdfUrl = async (admin: SupabaseClient, storagePath: string) => {
  const { data, error } = await admin.storage.from('contracts-files').createSignedUrl(storagePath, 7 * 24 * 60 * 60);
  if (error || !data?.signedUrl) throw new Error('The signed agreement download link could not be created.');
  return data.signedUrl;
};

const sendFinalCopy = async (
  admin: SupabaseClient,
  requestRow: Record<string, any>,
) => {
  if (!requestRow.signed_file_id || requestRow.status !== 'completed') {
    return { sent: false, error: 'The final signed PDF is not available yet.' };
  }
  const { data: file, error: fileError } = await admin.from('customer_contract_files')
    .select('file_name,storage_path,file_size').eq('id', requestRow.signed_file_id).maybeSingle();
  if (fileError || !file) return { sent: false, error: 'The final signed PDF could not be loaded.' };
  const { data: contract } = await admin.from('customer_contracts')
    .select('name,counterparty_name,counterparty_email').eq('id', requestRow.contract_id).maybeSingle();
  if (!contract?.counterparty_email) return { sent: false, error: 'The recipient email address is missing.' };
  const downloadUrl = await createSignedPdfUrl(admin, file.storage_path);
  const recipient = htmlEscape(contract.counterparty_name || 'there');
  const contractName = htmlEscape(contract.name);
  const escapedUrl = htmlEscape(downloadUrl);
  const emailOptions: Parameters<typeof deliverContractEmail>[0] = {
    to: contract.counterparty_email,
    subject: `Completed agreement: ${contract.name}`,
    text: `Hello ${contract.counterparty_name || 'there'},\n\n${contract.name} has been signed by both parties. Download the final PDF using this secure link (available for seven days):\n${downloadUrl}`,
    html: `<p>Hello ${recipient},</p><p><strong>${contractName}</strong> has been signed by both parties.</p><p><a href="${escapedUrl}">Download the final signed PDF</a> (secure link available for seven days).</p>`,
    idempotencyKey: requestRow.confirmation_email_idempotency_key,
  };
  if (Number(file.file_size) <= 2 * 1024 * 1024) {
    const { data: blob, error: downloadError } = await admin.storage.from('contracts-files').download(file.storage_path);
    if (!downloadError && blob) emailOptions.attachments = [{
      filename: file.file_name,
      content: bytesToBase64(new Uint8Array(await blob.arrayBuffer())),
    }];
  }
  const result = await deliverContractEmail(emailOptions);
  const deliveryUpdate = await admin.from('customer_contract_signature_requests').update({
    confirmation_delivery_status: result.sent ? 'sent' : 'failed',
    confirmation_error: result.sent ? null : result.error,
  }).eq('id', requestRow.id);
  if (deliveryUpdate.error) {
    return { sent: false, error: result.sent
      ? 'Outlook accepted the signed-copy email, but its delivery status could not be saved. Retry safely; duplicate email is suppressed.'
      : `${result.error} The delivery result could not be saved; retry safely.` };
  }
  return result.sent
    ? { sent: true, emailId: result.emailId, downloadUrl }
    : { sent: false, error: result.error, downloadUrl };
};

const bytesToBase64 = (bytes: Uint8Array) => {
  let encoded = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    encoded += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)));
  }
  return btoa(encoded);
};

serveWithCors(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  let uploadedPath: string | null = null;
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !serviceKey) return json({ error: 'The signing service is not configured.' }, 503);
    const admin = createClient(url, serviceKey);
    const body = await request.json() as Record<string, unknown>;
    const action = typeof body.action === 'string' ? body.action : 'details';

    if (['staff-details', 'countersign', 'retry-confirmation'].includes(action)) {
      const authorization = request.headers.get('Authorization');
      if (!anonKey || !authorization) return json({ error: 'Authentication required.' }, 401);
      const caller = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
      const { data: { user }, error: authError } = await caller.auth.getUser();
      if (authError || !user) return json({ error: 'Authentication required.' }, 401);
      const minimum = action === 'staff-details' ? 'view' : 'edit';
      const { data: hasAccess, error: accessError } = await caller.rpc('has_app_access', {
        p_app: 'customers',
        p_min: minimum,
      });
      if (accessError || hasAccess !== true) return json({ error: `Customer ${minimum} access is required.` }, 403);

      if (action === 'staff-details') {
        const contractId = typeof body.contractId === 'string' ? body.contractId : '';
        if (!contractId) return json({ error: 'A contract ID is required.' }, 400);
        const { data: row, error: statusError } = await admin.from('customer_contract_signature_requests')
          .select('id,contract_id,source_file_id,flow_version,status,counter_signer_id,placement_fields,recipient_signed_name,recipient_signed_at,signed_file_id,customer_signed_storage_path,confirmation_delivery_status,confirmation_error,email_error')
          .eq('contract_id', contractId).order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (statusError) throw statusError;
        if (!row) return json({ request: null });
        if (row.flow_version === 2 && row.counter_signer_id !== user.id && minimum !== 'view') {
          return json({ error: 'Only the selected Flown countersigner may complete this contract.' }, 403);
        }
        let signedPdfUrl: string | null = null;
        if (row.status === 'recipient_signed' && row.customer_signed_storage_path) {
          const { data: signedUrl } = await admin.storage.from('contracts-files').createSignedUrl(row.customer_signed_storage_path, 60 * 60);
          signedPdfUrl = signedUrl?.signedUrl || null;
        } else if (row.status === 'completed' && row.signed_file_id) {
          const { data: signedFile } = await admin.from('customer_contract_files').select('storage_path').eq('id', row.signed_file_id).maybeSingle();
          if (signedFile) {
            const { data: signedUrl } = await admin.storage.from('contracts-files').createSignedUrl(signedFile.storage_path, 60 * 60);
            signedPdfUrl = signedUrl?.signedUrl || null;
          }
        }
        return json({ request: {
          requestId: row.id,
          flowVersion: row.flow_version,
          status: row.status,
          counterSignerId: row.counter_signer_id,
          sourceFileId: row.source_file_id,
          fields: row.flow_version === 2 ? row.placement_fields : undefined,
          recipientSignedName: row.recipient_signed_name,
          recipientSignedAt: row.recipient_signed_at,
          confirmationDeliveryStatus: row.confirmation_delivery_status,
          confirmationError: row.confirmation_error,
          emailError: row.email_error,
          signedPdfUrl,
        } });
      }

      const requestId = typeof body.requestId === 'string' ? body.requestId : '';
      if (!requestId) return json({ error: 'A signing request ID is required.' }, 400);
      const { data: requestRow, error: signingRequestError } = await admin.from('customer_contract_signature_requests')
        .select('id,contract_id,source_file_id,flow_version,status,counter_signer_id,placement_fields,recipient_signed_name,recipient_signed_at,customer_signed_storage_path,recipient_signature_sha256,original_sha256,signed_file_id,confirmation_email_idempotency_key')
        .eq('id', requestId).maybeSingle();
      if (signingRequestError || !requestRow || requestRow.flow_version !== 2) {
        return json({ error: 'The countersigning request could not be loaded.' }, 404);
      }
      if (requestRow.counter_signer_id !== user.id) return json({ error: 'Only the selected Flown countersigner may complete this contract.' }, 403);

      if (action === 'retry-confirmation') {
        if (requestRow.status !== 'completed') return json({ error: 'The contract is not ready for a final confirmation email.' }, 409);
        const result = await sendFinalCopy(admin, requestRow);
        return result.sent ? json({ sent: true }) : json({ sent: false, error: result.error }, 502);
      }

      if (requestRow.status === 'completed') {
        const result = await sendFinalCopy(admin, requestRow);
        return json({ status: 'completed', emailSent: result.sent, emailError: result.sent ? null : result.error });
      }
      if (requestRow.status !== 'recipient_signed' || !requestRow.customer_signed_storage_path) {
        return json({ error: 'The recipient must sign before the Flown countersigner.' }, 409);
      }
      if (body.acknowledged !== true) return json({ error: 'Confirm that you reviewed the agreement before countersigning.' }, 400);
      const fields = requestRow.placement_fields as PlacedContractField[];
      const nameResult = await admin.from('profiles').select('name').eq('id', user.id).maybeSingle();
      if (nameResult.error) throw nameResult.error;
      const signedName = String(nameResult.data?.name || user.email || '').trim().slice(0, 200);
      if (!signedName) return json({ error: 'Your Flown profile must have a name before you countersign.' }, 400);
      const signatures = decodeSignatureSet(fields, 'countersigner', body.signatures);
      const { data: customerSignedBlob, error: customerSignedError } = await admin.storage
        .from('contracts-files').download(requestRow.customer_signed_storage_path);
      if (customerSignedError || !customerSignedBlob || customerSignedBlob.size > 50 * 1024 * 1024) {
        return json({ error: 'The recipient-signed PDF is unavailable or exceeds the size limit.' }, 413);
      }
      const customerSignedBytes = new Uint8Array(await customerSignedBlob.arrayBuffer());
      if (new TextDecoder().decode(customerSignedBytes.subarray(0, 5)) !== '%PDF-') return json({ error: 'The recipient-signed file is not a valid PDF.' }, 422);
      const pageCount = await getContractPdfPageCount(customerSignedBytes);
      validatePlacedContractFields(fields, pageCount);
      const signedAt = new Date().toISOString();
      const finalBytes = await applyPlacedContractSignature(customerSignedBytes, fields, 'countersigner', signedName, signatures, signedAt);
      if (finalBytes.byteLength > 50 * 1024 * 1024) return json({ error: 'The countersigned PDF exceeds the 50 MB storage limit.' }, 413);
      const { data: contract } = await admin.from('customer_contracts').select('name').eq('id', requestRow.contract_id).maybeSingle();
      if (!contract) return json({ error: 'The contract could not be loaded.' }, 404);
      const signedPath = `signed/${requestRow.contract_id}/${requestRow.id}-${crypto.randomUUID()}-final.pdf`;
      const { error: uploadError } = await admin.storage.from('contracts-files').upload(signedPath, finalBytes, {
        contentType: 'application/pdf', upsert: false,
      });
      if (uploadError) throw uploadError;
      uploadedPath = signedPath;
      const signedSha256 = await sha256Hex(finalBytes);
      const counterSignatureSha256 = await sha256Hex(Object.values(signatures).reduce((all, bytes) => {
        const joined = new Uint8Array(all.length + bytes.length);
        joined.set(all);
        joined.set(bytes, all.length);
        return joined;
      }, new Uint8Array()));
      const { error: recordError } = await admin.rpc('record_customer_contract_countersignature', {
        p_request_id: requestRow.id,
        p_user_id: user.id,
        p_signed_storage_path: signedPath,
        p_signed_file_name: `${safeFileName(contract.name)}-signed.pdf`,
        p_signed_file_size: finalBytes.byteLength,
        p_signed_sha256: signedSha256,
        p_counter_signature_sha256: counterSignatureSha256,
        p_signed_at: signedAt,
      });
      if (recordError) throw recordError;
      uploadedPath = null;
      const { data: completedRequest, error: reloadError } = await admin.from('customer_contract_signature_requests')
        .select('id,contract_id,status,signed_file_id,confirmation_email_idempotency_key')
        .eq('id', requestRow.id).single();
      if (reloadError) throw reloadError;
      const result = await sendFinalCopy(admin, completedRequest);
      return json({ status: 'completed', emailSent: result.sent, emailError: result.sent ? null : result.error });
    }

    const token = typeof body.token === 'string' ? body.token.trim() : '';
    if (!/^[A-Za-z0-9_-]{40,50}$/.test(token)) return json({ error: 'This signing link is invalid.' }, 404);
    const tokenHash = await sha256Hex(new TextEncoder().encode(token));
    const { data: signingRequest, error: requestError } = await admin.from('customer_contract_signature_requests')
      .select('id,contract_id,source_file_id,status,expires_at,created_by,signed_file_id,flow_version,placement_fields,counter_signer_id,recipient_email,recipient_name,recipient_signed_name,customer_signed_storage_path,original_sha256,recipient_signature_sha256')
      .eq('token_hash', tokenHash).maybeSingle();
    if (requestError || !signingRequest) return json({ error: 'This signing link is invalid or has expired.' }, 404);

    if (signingRequest.status === 'completed' && signingRequest.signed_file_id) {
      const { data: signedFile } = await admin.from('customer_contract_files')
        .select('storage_path').eq('id', signingRequest.signed_file_id).maybeSingle();
      if (!signedFile) return json({ error: 'The signed agreement could not be loaded.' }, 404);
      const signedPdfUrl = await createSignedPdfUrl(admin, signedFile.storage_path);
      return json({ status: 'completed', flowVersion: signingRequest.flow_version, signedPdfUrl });
    }
    if (signingRequest.status === 'recipient_signed' && signingRequest.flow_version === 2) {
      const { data: contract } = await admin.from('customer_contracts').select('name').eq('id', signingRequest.contract_id).maybeSingle();
      const { data: original } = await admin.from('customer_contract_files').select('file_name,storage_path')
        .eq('id', signingRequest.source_file_id).maybeSingle();
      if (!contract || !original) return json({ error: 'The agreement could not be loaded.' }, 404);
      const { data: originalUrl } = await admin.storage.from('contracts-files').createSignedUrl(original.storage_path, 60 * 60);
      return json({
        status: 'recipient_signed',
        flowVersion: 2,
        contractName: contract.name,
        originalFileName: original.file_name,
        originalPdfUrl: originalUrl?.signedUrl || null,
        expiresAt: signingRequest.expires_at,
      });
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
      if (signingRequest.flow_version === 2) {
        return json({
          status: 'pending',
          flowVersion: 2,
          contractName: contract.name,
          originalFileName: originalFile.file_name,
          originalPdfUrl: originalUrl.signedUrl,
          expiresAt: signingRequest.expires_at,
          fields: signingRequest.placement_fields,
        });
      }
      return json({
        status: 'pending',
        flowVersion: 1,
        contractName: contract.name,
        originalFileName: originalFile.file_name,
        originalPdfUrl: originalUrl.signedUrl,
        expiresAt: signingRequest.expires_at,
      });
    }

    if (signingRequest.flow_version === 2) {
      const signedName = typeof body.signedName === 'string' ? body.signedName.trim().slice(0, 200) : '';
      if (signedName.length < 2 || body.acknowledged !== true) {
        return json({ error: 'Enter your full legal name and confirm that you intend to sign this agreement.' }, 400);
      }
      const fields = signingRequest.placement_fields as PlacedContractField[];
      const signatures = decodeSignatureSet(fields, 'recipient', body.signatures);
      const { data: originalBlob, error: downloadError } = await admin.storage
        .from('contracts-files').download(originalFile.storage_path);
      if (downloadError || !originalBlob || originalBlob.size > 50 * 1024 * 1024) {
        return json({ error: 'The original PDF is unavailable or exceeds the signing size limit.' }, 413);
      }
      const originalBytes = new Uint8Array(await originalBlob.arrayBuffer());
      if (new TextDecoder().decode(originalBytes.subarray(0, 5)) !== '%PDF-') return json({ error: 'The source agreement is not a valid PDF.' }, 422);
      const pageCount = await getContractPdfPageCount(originalBytes);
      validatePlacedContractFields(fields, pageCount);
      const signedAt = new Date().toISOString();
      const customerSignedBytes = await applyPlacedContractSignature(originalBytes, fields, 'recipient', signedName, signatures, signedAt);
      if (customerSignedBytes.byteLength > 50 * 1024 * 1024) return json({ error: 'The recipient-signed PDF exceeds the 50 MB storage limit.' }, 413);
      const originalSha256 = await sha256Hex(originalBytes);
      const signatureSha256 = await sha256Hex(Object.values(signatures).reduce((all, bytes) => {
        const joined = new Uint8Array(all.length + bytes.length);
        joined.set(all);
        joined.set(bytes, all.length);
        return joined;
      }, new Uint8Array()));
      const customerSignedPath = `recipient-signed/${contract.id}/${signingRequest.id}-${crypto.randomUUID()}.pdf`;
      const { error: uploadError } = await admin.storage.from('contracts-files').upload(customerSignedPath, customerSignedBytes, {
        contentType: 'application/pdf',
        upsert: false,
      });
      if (uploadError) throw uploadError;
      uploadedPath = customerSignedPath;
      const { error: recordError } = await admin.rpc('record_customer_contract_recipient_signature', {
        p_request_id: signingRequest.id,
        p_signer_name: signedName,
        p_signed_storage_path: customerSignedPath,
        p_original_sha256: originalSha256,
        p_signature_sha256: signatureSha256,
        p_signed_at: signedAt,
      });
      if (recordError) throw recordError;
      uploadedPath = null;
      return json({ status: 'recipient_signed', awaitingCountersignature: true, signedAt });
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
      flowVersion: 1,
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
