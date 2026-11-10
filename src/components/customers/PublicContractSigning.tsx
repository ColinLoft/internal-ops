import { userFacingError } from '../../lib/userFacingError';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Download, Eraser, PenLine } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { ContractFieldEditor } from './ContractFieldEditor';
import type { ContractField, ContractSigningStatus } from './contractSigning';

type LinkDetails = {
  status: ContractSigningStatus;
  flowVersion?: number;
  contractName?: string;
  originalFileName?: string;
  originalPdfUrl?: string;
  signedPdfUrl?: string | null;
  expiresAt?: string;
  fields?: ContractField[];
};

const responseError = async (error: unknown) => {
  const context = (error as { context?: unknown } | null)?.context;
  const responseBody = context instanceof Response ? await context.json().catch(() => null) as { error?: string } | null : null;
  return responseBody?.error || (error instanceof Error ? error.message : 'The signature request could not be completed.');
};

export const PublicContractSigning: React.FC<{ token: string }> = ({ token }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [details, setDetails] = useState<LinkDetails | null>(null);
  const [name, setName] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [signatures, setSignatures] = useState<Record<string, string>>({});
  const [signedPdfUrl, setSignedPdfUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadDetails = useCallback(async () => {
    const { data, error: detailError } = await supabase.functions.invoke('sign-contract-public', { body: { action: 'details', token } });
    if (detailError) throw detailError;
    setDetails(data as LinkDetails);
    if (data?.status === 'completed' && data.signedPdfUrl) setSignedPdfUrl(data.signedPdfUrl);
    setError('');
  }, [token]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('token')) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);
  useEffect(() => {
    let active = true;
    void supabase.functions.invoke('sign-contract-public', { body: { action: 'details', token } })
      .then(({ data, error: detailError }) => {
        if (!active) return;
        if (detailError) setError(detailError.message);
        else {
          setDetails(data as LinkDetails);
          if (data?.status === 'completed' && data.signedPdfUrl) setSignedPdfUrl(data.signedPdfUrl);
        }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  useEffect(() => {
    if (details?.status !== 'recipient_signed') return;
    const timer = window.setInterval(() => { void loadDetails().catch(() => undefined); }, 20_000);
    return () => window.clearInterval(timer);
  }, [details?.status, loadDetails]);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height };
  };
  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const context = canvasRef.current?.getContext('2d');
    const position = point(event);
    if (!context || !position) return;
    context.strokeStyle = '#0f172a';
    context.lineWidth = 2;
    context.lineCap = 'round';
    drawing.current = true;
    context.beginPath();
    context.moveTo(position.x, position.y);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const context = canvasRef.current?.getContext('2d');
    const position = point(event);
    if (!context || !position) return;
    context.lineTo(position.x, position.y);
    context.stroke();
    setHasSignature(true);
  };
  const clearLegacySignature = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  const sign = async (event: React.FormEvent) => {
    event.preventDefault();
    if (name.trim().length < 2) { setError('Enter your full legal name.'); return; }
    if (!acknowledged) { setError('Confirm that you have reviewed and agree to sign this agreement.'); return; }
    const isLegacy = details?.flowVersion !== 2;
    const signatureFields = details?.fields?.filter((field) => field.signer === 'recipient' && field.kind === 'signature') || [];
    if (isLegacy && !hasSignature) { setError('Draw your signature before submitting.'); return; }
    if (!isLegacy && (!signatureFields.length || signatureFields.some((field) => !signatures[field.id]))) {
      setError('Sign every recipient signature field on the PDF before submitting.');
      return;
    }

    setSaving(true);
    setError('');
    const payload = isLegacy
      ? { action: 'sign', token, signedName: name.trim(), signaturePng: canvasRef.current?.toDataURL('image/png'), acknowledged }
      : { action: 'sign', token, signedName: name.trim(), signatures, acknowledged };
    const { data, error: signError } = await supabase.functions.invoke('sign-contract-public', { body: payload });
    if (signError) {
      setError(await responseError(signError));
      setSaving(false);
      return;
    }
    if (isLegacy) {
      let resultUrl = data?.signedPdfUrl as string | null | undefined;
      if (!resultUrl) {
        try {
          const { data: result, error: resultError } = await supabase.functions.invoke('sign-contract-public', { body: { action: 'details', token } });
          if (resultError) throw resultError;
          resultUrl = result?.signedPdfUrl;
        } catch (detailError) {
          setError(await responseError(detailError));
          setSaving(false);
          return;
        }
      }
      if (!resultUrl) {
        setError('Your signature was recorded, but a signed PDF download link could not be created.');
        setSaving(false);
        return;
      }
      setSignedPdfUrl(resultUrl);
      setDetails({ status: 'completed', flowVersion: 1 });
    } else {
      setDetails((current) => current ? { ...current, status: 'recipient_signed' } : current);
    }
    setSaving(false);
  };

  return <main className="min-h-screen bg-slate-950 px-3 py-6 text-slate-900 sm:px-6">
    <section className="mx-auto w-full max-w-5xl overflow-hidden rounded-xl bg-white shadow-2xl">
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-5 py-4 sm:px-8">
        <span className="rounded-lg bg-black px-3 py-2"><img src="/flown-logo.png" alt="Flown" className="h-9 w-auto brightness-0 invert" /></span>
        <div><h1 className="text-lg font-bold">Review and sign agreement</h1><p className="text-xs text-slate-500">Secure Flown contract signing</p></div>
      </header>
      <div className="p-5 sm:p-8">
        {loading ? <p role="status" className="text-sm text-slate-500">Loading agreement…</p>
          : error && !details ? <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{userFacingError(error)}</p>
            : signedPdfUrl || details?.status === 'completed'
              ? <div className="rounded-xl bg-emerald-50 p-5"><p className="font-semibold text-emerald-800">The agreement is signed by both parties.</p>{signedPdfUrl && <a href={signedPdfUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-emerald-800 underline"><Download className="h-4 w-4" />Download signed PDF</a>}</div>
              : details?.status === 'recipient_signed'
                ? <div className="rounded-xl bg-emerald-50 p-5"><p className="font-semibold text-emerald-800">Your signature is recorded.</p><p className="mt-2 text-sm leading-6 text-emerald-900">The selected Flown staff member will countersign the agreement. A final signed copy will be emailed to you.</p>{details.originalPdfUrl && <a href={details.originalPdfUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-emerald-800 underline"><Download className="h-4 w-4" />Download original PDF</a>}</div>
                : details && <>
                  <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                    <div><h2 className="text-lg font-semibold">{details.contractName}</h2><p className="mt-1 text-sm text-slate-500">{details.originalFileName} · Expires {details.expiresAt ? new Date(details.expiresAt).toLocaleDateString() : 'soon'}</p></div>
                    {details.originalPdfUrl && <a href={details.originalPdfUrl} download={details.originalFileName} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Download className="h-4 w-4" />Download PDF</a>}
                  </div>
                  {details.flowVersion === 2 ? <form onSubmit={(event) => void sign(event)} className="space-y-5">
                    <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(240px,1.3fr)]">
                      <label className="text-sm font-semibold text-slate-700">Full legal name<input required autoComplete="name" maxLength={200} value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" /></label>
                      <p className="self-end text-xs leading-5 text-slate-500">Sign in every highlighted signature field. Your name and signing date appear in the fields placed on the agreement.</p>
                    </div>
                    <ContractFieldEditor fileUrl={details.originalPdfUrl || ''} fields={details.fields || []} onChange={() => undefined} mode="sign" signer="recipient" nameValue={name} onSignaturesChange={setSignatures} />
                    <label className="flex items-start gap-2 text-sm leading-6 text-slate-600"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-1" /><span>I reviewed the agreement and intend to sign it electronically. I understand this workspace signature is not a third-party identity-verification or certificate service.</span></label>
                    {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{userFacingError(error)}</p>}
                    <button type="submit" disabled={saving} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"><Check className="h-4 w-4" />{saving ? 'Saving signature…' : 'Sign agreement'}</button>
                  </form> : <form onSubmit={(event) => void sign(event)} className="mx-auto max-w-xl">
                    <label className="mt-2 block text-sm font-semibold text-slate-700">Full legal name<input required autoComplete="name" maxLength={200} value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" /></label>
                    <div className="mt-4"><div className="mb-1 flex items-center justify-between text-sm font-semibold text-slate-600"><span className="inline-flex items-center gap-1"><PenLine className="h-4 w-4" />Draw your signature</span><button type="button" onClick={clearLegacySignature} className="inline-flex items-center gap-1 text-slate-500"><Eraser className="h-3.5 w-3.5" />Clear</button></div><canvas ref={canvasRef} width={760} height={180} onPointerDown={start} onPointerMove={move} onPointerUp={() => { drawing.current = false; }} onPointerCancel={() => { drawing.current = false; }} className="h-32 w-full touch-none rounded-lg border border-dashed border-slate-300 bg-white" /></div>
                    <label className="mt-4 flex items-start gap-2 text-sm leading-6 text-slate-600"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-1" /><span>I have reviewed the original agreement and intend to sign it electronically.</span></label>
                    {error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{userFacingError(error)}</p>}
                    <button type="submit" disabled={saving} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"><Check className="h-4 w-4" />{saving ? 'Creating signed PDF…' : 'Sign legacy agreement'}</button>
                  </form>}
                </>}
      </div>
    </section>
  </main>;
};
