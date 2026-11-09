import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { celebrateMilestone } from '../../lib/milestones';
import { control, functionError, money, primary, secondary, surface } from './model';
type Snapshot = {
  quoteId: string; version: number; currency: string; terms: string; proposal: string;
  lines: { description: string; quantity: number; unit_price: number; line_total: number; recurring?: boolean }[];
  subtotal: number; discount: number; tax: number; total: number;
  prospect: { name: string }; property: { label: string; address: string };
};
type Details = { snapshot: Snapshot; status: string; expiresAt: string };
function validDetails(value: unknown): value is Details {
  if (!value || typeof value !== 'object' || !('snapshot' in value) || !('status' in value) || !('expiresAt' in value)) return false;
  const quote = value.snapshot;
  if (!quote || typeof quote !== 'object' || !('lines' in quote) || !Array.isArray(quote.lines)) return false;
  const fields = quote as Record<string, unknown>;
  return typeof value.status === 'string' && typeof value.expiresAt === 'string' && Number.isFinite(Date.parse(value.expiresAt))
    && typeof fields.quoteId === 'string' && typeof fields.currency === 'string' && /^[A-Z]{3}$/.test(fields.currency)
    && typeof fields.version === 'number' && fields.version >= 1 && typeof fields.terms === 'string' && typeof fields.proposal === 'string'
    && ['subtotal', 'discount', 'tax', 'total'].every(key => typeof fields[key] === 'number' && Number.isFinite(fields[key]) && Number(fields[key]) >= 0)
    && quote.lines.length > 0 && quote.lines.every(line => line && typeof line.description === 'string'
      && ['quantity', 'unit_price', 'line_total'].every(key => typeof line[key] === 'number' && Number.isFinite(line[key]) && line[key] >= 0));
}
export function PublicQuoteAcceptance({ token }: { token: string }) {
  const testMode = new URLSearchParams(window.location.search).get('test') === '1';
  const [details, setDetails] = useState<Details | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const keyboardPoint = useRef({ x: 380, y: 90 });
  const resetCanvas = () => {
    const context = canvas.current?.getContext('2d');
    if (context && canvas.current) { context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.current.width, canvas.current.height); }
    setHasSignature(false);
  };
  useEffect(() => {
    let active = true;
    setLoading(true); setDetails(null); setError('');
    void (async () => {
      try {
        const { data, error: detailError } = await supabase.functions.invoke('wildfire-quotes', { body: { action: 'details', token } });
        if (detailError) throw new Error(await functionError(detailError));
        if (data?.error) throw new Error(data.error);
        if (!validDetails(data)) throw new Error('The quote could not be loaded. Contact the sender for a current link.');
        if (active) { setDetails(data); setAccepted(data.status === 'accepted'); }
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : 'Quote could not be loaded.'); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [token]);
  useEffect(() => { if (details) resetCanvas(); }, [details]);
  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * event.currentTarget.width / rect.width, y: (event.clientY - rect.top) * event.currentTarget.height / rect.height };
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    if (!hasSignature || !acknowledged || !name.trim() || !email.trim()) { setError('Enter your name and email, draw a signature, and confirm acceptance of the quote and terms.'); return; }
    if (testMode) { setAccepted(true); return; }
    setSaving(true);
    try {
      const { data, error: acceptError } = await supabase.functions.invoke('wildfire-quotes', { body: { action: 'accept', token, name: name.trim(), email: email.trim(), signaturePng: canvas.current?.toDataURL('image/png'), acknowledged: true } });
      if (acceptError) throw new Error(await functionError(acceptError));
      if (data?.error) throw new Error(data.error);
      if (data?.status !== 'accepted' || !data?.deploymentId) throw new Error('Acceptance was not confirmed. Retry using this same link or contact the sender.');
      setAccepted(true);
      celebrateMilestone('quote', details?.snapshot.quoteId || '', details?.status, data.status);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Quote acceptance failed.'); }
    finally { setSaving(false); }
  };
  const quote = details?.snapshot;
  return <main className="min-h-dvh bg-slate-50 px-3 py-6 sm:px-6"><section className={`${surface} mx-auto max-w-3xl`}>
    <img src="/flown-logo.png" alt="Flown" className="mb-5 h-10 w-auto brightness-0 invert" />
    <h1 className="text-2xl font-semibold text-slate-900">Review your Wildfire quote</h1>
    {testMode && <p role="status" className="mt-3 rounded-lg bg-slate-100 p-3 text-sm text-slate-700">Test mode: try the signing form without recording a signature, accepting the quote or creating a deployment.</p>}
    {loading && <p role="status" className="mt-4 text-sm text-slate-500">Loading quote…</p>}
    {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    {quote && <>
      <h2 className="mt-5 text-lg font-semibold text-slate-900">{quote.prospect?.name || 'Customer quote'} · Version {quote.version}</h2>
      <p className="mt-1 text-sm text-slate-500">{quote.property?.label}{quote.property?.address ? ` · ${quote.property.address}` : ''}</p>
      <p className="mt-2 text-sm text-slate-500">Offer expires {new Date(details.expiresAt).toLocaleString('en-US')}.</p>
      <ul className="mt-5 space-y-3">{quote.lines.map((line, index) => <li key={index} className="flex flex-wrap justify-between gap-3 rounded-lg bg-slate-50 p-3"><div><p className="text-sm font-medium text-slate-900">{line.description}</p><p className="text-xs text-slate-500">{line.quantity} × {money(Number(line.unit_price), quote.currency)}{line.recurring ? ' · Recurring (see terms)' : ''}</p></div><span className="text-sm text-slate-900">{money(line.line_total, quote.currency)}</span></li>)}</ul>
      <div className="mt-4 space-y-1 text-right text-sm text-slate-700"><p>Subtotal {money(Number(quote.subtotal), quote.currency)}</p><p>Discount −{money(Number(quote.discount), quote.currency)}</p><p>Tax {money(Number(quote.tax), quote.currency)}</p><p className="text-lg font-semibold text-slate-900">Total {money(Number(quote.total), quote.currency)}</p></div>
      <h2 className="mt-6 text-lg font-semibold text-slate-900">Proposal and scope</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{quote.proposal || 'See quoted line items.'}</p>
      <h2 className="mt-6 text-lg font-semibold text-slate-900">Terms</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{quote.terms}</p>
      {accepted ? <p role="status" className="mt-6 rounded-lg bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">{testMode ? 'Test complete. Nothing was saved and no deployment was created.' : 'Your signed acceptance is recorded. Flown will coordinate deployment with you. No payment has been taken.'}</p>
        : details.status === 'sent' || details.status === 'viewed' || details.status === 'pending' ? <form className="mt-6 space-y-4" onSubmit={event => void submit(event)}>
          <label className="block text-sm text-slate-700">Full legal name<input required autoComplete="name" maxLength={200} value={name} onChange={event => setName(event.target.value)} className={control} /></label>
          <label className="block text-sm text-slate-700">Email<input required type="email" autoComplete="email" maxLength={254} value={email} onChange={event => setEmail(event.target.value)} className={control} /></label>
          <div><div className="mb-2 flex items-center justify-between"><label htmlFor="quote-signature" className="text-sm text-slate-700">Draw your signature</label><button type="button" className={secondary} onClick={resetCanvas}>Clear signature</button></div>
            <canvas id="quote-signature" ref={canvas} width={760} height={180} tabIndex={0} aria-label="Draw signature with a pointer, or use arrow keys. Hold Shift to move without drawing." className="h-32 w-full touch-none rounded-lg focus:outline focus:outline-2 focus:outline-brand-500" style={{ backgroundColor: '#ffffff' }} onKeyDown={event => {
              let dx = 0, dy = 0;
              switch (event.key) {
                case 'ArrowUp': dy = -8; break;
                case 'ArrowDown': dy = 8; break;
                case 'ArrowLeft': dx = -8; break;
                case 'ArrowRight': dx = 8; break;
                default: return;
              }
              event.preventDefault();
              const previous = keyboardPoint.current;
              const next = { x: Math.max(0, Math.min(760, previous.x + dx)), y: Math.max(0, Math.min(180, previous.y + dy)) };
              const context = event.currentTarget.getContext('2d');
              if (!event.shiftKey && context) {
                context.strokeStyle = '#111111'; context.lineWidth = 3; context.lineCap = 'round';
                context.beginPath(); context.moveTo(previous.x, previous.y); context.lineTo(next.x, next.y); context.stroke(); setHasSignature(true);
              }
              keyboardPoint.current = next;
            }} onPointerDown={event => {
              const context = event.currentTarget.getContext('2d'); if (!context) { setError('Signature drawing is unavailable in this browser.'); return; }
              event.currentTarget.setPointerCapture(event.pointerId); const position = point(event);
              context.strokeStyle = '#111111'; context.lineWidth = 3; context.lineCap = 'round'; context.beginPath(); context.moveTo(position.x, position.y); drawing.current = true;
            }} onPointerMove={event => { if (!drawing.current) return; const context = event.currentTarget.getContext('2d'); const position = point(event); context?.lineTo(position.x, position.y); context?.stroke(); setHasSignature(true); }} onPointerUp={() => { drawing.current = false; }} onPointerCancel={() => { drawing.current = false; }} />
          </div>
          <label className="flex items-start gap-2 text-sm leading-6 text-slate-700"><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} className="mt-1" /><span>I have reviewed this quote, proposal, pricing and terms and have authority to accept them. I intend to sign electronically. This does not take a payment or provide third-party identity verification.</span></label>
          <button disabled={saving} className={primary}>{saving ? 'Recording acceptance…' : 'Sign and accept quote'}</button>
        </form> : <p className="mt-6 text-sm text-slate-500">This quote is no longer available for acceptance. Contact the sender.</p>}
    </>}
  </section></main>;
}
