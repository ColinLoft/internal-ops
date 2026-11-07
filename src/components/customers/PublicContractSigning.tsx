import React, { useEffect, useRef, useState } from 'react';
import { Check, Eraser, FileText, PenLine } from 'lucide-react';
import { supabase } from '../../lib/supabase';

type LinkDetails = {
  status: 'pending' | 'completed';
  contractName?: string;
  originalFileName?: string;
  originalPdfUrl?: string;
  signedPdfUrl?: string | null;
  expiresAt?: string;
};

export const PublicContractSigning: React.FC<{ token: string }> = ({ token }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [details, setDetails] = useState<LinkDetails | null>(null);
  const [name, setName] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [signedPdfUrl, setSignedPdfUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };
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
  const clear = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  const sign = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) { setError('Enter your full legal name.'); return; }
    if (!hasSignature) { setError('Draw your signature before submitting.'); return; }
    if (!acknowledged) { setError('Confirm that you have reviewed and agree to sign this agreement.'); return; }
    setSaving(true);
    setError('');
    const { data, error: signError } = await supabase.functions.invoke('sign-contract-public', {
      body: { action: 'sign', token, signedName: name.trim(), signaturePng: canvasRef.current?.toDataURL('image/png'), acknowledged },
    });
    if (signError) {
      const context = (signError as { context?: unknown }).context;
      const responseBody = context instanceof Response ? await context.json().catch(() => null) as { error?: string } | null : null;
      setError(responseBody?.error || signError.message);
      setSaving(false);
      return;
    }
    let resultUrl = data?.signedPdfUrl as string | null | undefined;
    if (!resultUrl) {
      const { data: result, error: resultError } = await supabase.functions.invoke('sign-contract-public', { body: { action: 'details', token } });
      if (resultError) {
        setError(resultError.message);
        setSaving(false);
        return;
      }
      resultUrl = result?.signedPdfUrl;
    }
    if (!resultUrl) {
      setError('Your signature was recorded, but a signed PDF download link could not be created.');
      setSaving(false);
      return;
    }
    setSignedPdfUrl(resultUrl);
    setDetails({ status: 'completed' });
    setSaving(false);
  };

  return <main className="flex min-h-screen items-center justify-center bg-slate-950 px-3 py-6 text-slate-900">
    <section className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl sm:p-8">
      <div className="flex items-center gap-3"><span className="rounded-xl bg-brand-50 p-2 text-brand-700"><FileText className="h-5 w-5" /></span><div><h1 className="text-lg font-bold">Review and sign agreement</h1><p className="text-xs text-slate-500">Secure customer signature link</p></div></div>
      {loading ? <p className="mt-6 text-sm text-slate-500">Loading agreement…</p>
        : error && !details ? <p role="alert" className="mt-6 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>
          : signedPdfUrl || details?.status === 'completed'
            ? <div className="mt-6 rounded-xl bg-emerald-50 p-4"><p className="font-semibold text-emerald-800">This agreement has been signed.</p>{signedPdfUrl && <a href={signedPdfUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm font-semibold text-emerald-800 underline">Download signed PDF</a>}</div>
            : details && <>
              <h2 className="mt-6 text-base font-semibold">{details.contractName}</h2>
              <p className="mt-1 text-xs text-slate-500">{details.originalFileName} · Expires {details.expiresAt ? new Date(details.expiresAt).toLocaleDateString() : 'soon'}</p>
              {details.originalPdfUrl && <a href={details.originalPdfUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-sm font-semibold text-brand-700 underline">Open original agreement PDF</a>}
              <form onSubmit={(event) => void sign(event)}>
                <label className="mt-5 block text-xs font-semibold text-slate-600">Full legal name<input required autoComplete="name" maxLength={200} value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" /></label>
                <div className="mt-4"><div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-600"><span className="inline-flex items-center gap-1"><PenLine className="h-3.5 w-3.5" /> Draw your signature</span><button type="button" onClick={clear} className="inline-flex items-center gap-1 text-slate-400"><Eraser className="h-3 w-3" /> Clear</button></div><canvas ref={canvasRef} width={760} height={180} onPointerDown={start} onPointerMove={move} onPointerUp={() => { drawing.current = false; }} onPointerLeave={() => { drawing.current = false; }} className="h-32 w-full touch-none rounded-lg border border-dashed border-slate-300 bg-white" /></div>
                <label className="mt-4 flex items-start gap-2 text-xs leading-5 text-slate-600"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-0.5" /><span>I have reviewed the original agreement and intend to sign it electronically. I understand this workspace signature is not a third-party identity-verification or certificate service.</span></label>
                {error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}
                <button type="submit" disabled={saving} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"><Check className="h-4 w-4" />{saving ? 'Creating signed PDF…' : 'Sign and return agreement'}</button>
                <p className="mt-3 text-[11px] leading-5 text-slate-500">Signing creates a PDF containing the original agreement plus a timestamped signature page. A copy is returned to the sender’s workspace.</p>
              </form>
            </>}
    </section>
  </main>;
};
