import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { userFacingError } from '../../lib/userFacingError';
import { TableSkeleton } from '../common/Feedback';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';
import { control, displayStage, functionError, money, primary, secondary, surface, type Opportunity, type Product } from './model';

export type QuoteLine = { id?: string; product_id: string | null; description: string; quantity: number; unit_price: number; recurring?: boolean };
export type Quote = { id: string; opportunity_id: string; site_plan_id: string | null; version: number; status: string; currency: string; discount: number; tax: number; expires_at: string | null; terms: string; proposal: string; snapshot: Record<string, unknown> | null };
export function Quotes({ opportunities, products, selectedId, canEdit, supportingDataLoading = false }: { opportunities: Opportunity[]; products: Product[]; selectedId: string; canEdit: boolean; supportingDataLoading?: boolean }) {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [lines, setLines] = useState<(QuoteLine & { quote_id: string })[]>([]);
  const [activeId, setActiveId] = useState(selectedId);
  const [draft, setDraft] = useState<Quote | null>(null);
  const [draftLines, setDraftLines] = useState<QuoteLine[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [signingOpen, setSigningOpen] = useState(false);
  useEffect(() => { if (selectedId) { setActiveId(selectedId); setDraft(null); setLink(''); } }, [selectedId]);
  const load = useCallback(async () => {
    const [quoteResult, lineResult] = await Promise.all([
      supabase.from('wildfire_quotes').select('id,opportunity_id,site_plan_id,version,status,currency,discount,tax,expires_at,terms,proposal,snapshot').order('created_at', { ascending: false }),
      supabase.from('wildfire_quote_lines').select('id,quote_id,product_id,description,quantity,unit_price,recurring'),
    ]);
    setLoading(false);
    if (quoteResult.error || lineResult.error) { setError(userFacingError(quoteResult.error || lineResult.error, 'Quotes could not be loaded. Refresh to retry.')); return; }
    setQuotes(quoteResult.data ?? []); setLines(lineResult.data ?? []);
  }, []);
  useLiveRefresh(load, ['wildfire_quotes', 'wildfire_quote_lines']);
  const selected = quotes.find(item => item.id === activeId) ?? quotes[0] ?? null;
  const active = draft ?? selected;
  const activeLines = draft ? draftLines : lines.filter(item => item.quote_id === selected?.id);
  const subtotal = activeLines.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unit_price), 0);
  const total = active ? subtotal - Number(active.discount) + Number(active.tax) : 0;
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (cause) { setError(userFacingError(cause, 'The quote action could not be completed. Retry, or ask an administrator to check the signing service.')); }
    finally { setBusy(false); }
  };
  const changeLine = (index: number, change: Partial<QuoteLine>) => setDraftLines(current => current.map((line, position) => position === index ? { ...line, ...change } : line));
  const publish = () => {
    setSigningOpen(true);
    setLink('');
    void run(async () => {
    if (!selected) throw new Error('Select a saved quote before creating a signing link.');
    if (!activeLines.length) throw new Error('Add at least one priced line and save the quote before creating a signing link.');
    setNotice('Creating customer signing link…');
    const { data, error: publishError } = await supabase.functions.invoke('wildfire-quotes', { body: { action: 'publish', quoteId: selected.id }, timeout: 20000 });
    if (publishError) throw new Error(await functionError(publishError));
    if (data?.error) throw new Error(data.error);
    if (typeof data?.url !== 'string') throw new Error('The signing link could not be created.');
    const signingUrl = new URL(data.url);
    if (!['https:', 'http:'].includes(signingUrl.protocol)) throw new Error('The signing service returned an invalid link.');
    const expires = new Date(data.expiresAt);
    if (!Number.isFinite(expires.getTime())) throw new Error('The signing service returned an invalid expiry.');
    setLink(signingUrl.href); setNotice(`Link created. Expires ${expires.toLocaleString()}. Share it directly with the intended customer.`);
    await load();
    });
  };
  if (loading || supportingDataLoading) return <TableSkeleton />;
  return <div className="space-y-5">
    {signingOpen && <div role="dialog" aria-modal="true" aria-labelledby="signing-title" className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4">
      <section className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-xl bg-[#151515] p-6 text-white">
        <div className="flex items-start justify-between gap-4"><h2 id="signing-title" className="text-lg font-semibold">Customer signing link</h2><button type="button" aria-label="Close signing dialog" className={secondary} onClick={() => setSigningOpen(false)}>Close</button></div>
        {busy && <p role="status" className="mt-4">Creating your secure link...</p>}
        {!busy && error && <div className="mt-4"><p role="alert" className="text-sm text-rose-300">{error}</p><button type="button" className={`${primary} mt-4`} onClick={publish}>Retry signing link</button></div>}
        {link && <div className="mt-4"><label className="text-sm">Copy customer signing link<input aria-label="Customer signing link" readOnly value={link} onFocus={event => event.target.select()} className={control} /></label><p className="mt-3 text-sm text-slate-400">{notice}</p><div className="mt-4 flex flex-wrap gap-4"><a className="text-sm text-brand-400 underline" href={link} target="_blank" rel="noreferrer">Open signing page</a><a className="text-sm text-brand-400 underline" href={(() => { const url = new URL(link); url.searchParams.set('test', '1'); return url.href; })()} target="_blank" rel="noreferrer">Test without accepting</a></div><p className="mt-3 text-xs text-slate-400">Copy this private link now. The raw token is not stored. Only share it with the intended customer.</p></div>}
      </section>
    </div>}
    {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    <section className={surface}>
      <h2 className="text-lg font-semibold text-slate-900">Quotes and proposals</h2>
      <p className="mt-2 text-sm text-slate-500">Create a quote from a site plan. Pricing and proposal text live in one versioned record. Customer signature and acceptance create the CRM records and exactly one deployment.</p>
      <select aria-label="Select quote" disabled={busy} value={selected?.id ?? ''} onChange={event => { setActiveId(event.target.value); setDraft(null); setLink(''); setSigningOpen(false); setNotice(''); }} className={`${control} mt-4`}>
        {!quotes.length && <option value="">No quotes yet; create one from Site planner</option>}
        {quotes.map(item => <option key={item.id} value={item.id}>{opportunities.find(opportunity => opportunity.id === item.opportunity_id)?.name || item.id.slice(0, 8)} · v{item.version} · {displayStage(item.status)}</option>)}
      </select>
    </section>
    {active && <section className={surface}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold text-slate-900">Version {active.version} · {displayStage(active.status)}</h2>
        {!draft && canEdit && <div className="flex flex-wrap gap-2">
          {active.status === 'draft' && <button type="button" disabled={busy} className={secondary} onClick={() => { setDraft({ ...active }); setDraftLines(activeLines.map(line => ({ ...line, quantity: Number(line.quantity), unit_price: Number(line.unit_price) }))); setLink(''); }}>Edit draft</button>}
          <button type="button" disabled={busy} className={secondary} onClick={() => void run(async () => {
            const { data, error: cloneError } = await supabase.rpc('wildfire_clone_quote', { p_quote_id: active.id });
            if (cloneError) throw new Error(cloneError.message);
            setActiveId(data); setLink(''); await load();
          })}>New version</button>
          {active.status === 'draft' && <button type="button" className={primary} disabled={busy} onClick={publish}>{busy ? 'Creating signing link…' : 'Create customer signing link'}</button>}
          {['sent', 'viewed', 'approved'].includes(active.status) && <button type="button" className={secondary} disabled={busy} onClick={() => void run(async () => {
            const { data, error: revokeError } = await supabase.functions.invoke('wildfire-quotes', { body: { action: 'revoke', quoteId: active.id } });
            if (revokeError) throw new Error(await functionError(revokeError));
            if (data?.error) throw new Error(data.error);
            setLink(''); setNotice('Customer signing links revoked. Create a new version before sending revised pricing.'); await load();
          })}>Revoke signing link</button>}
        </div>}
      </div>
      <form onSubmit={event => { event.preventDefault(); void run(async () => {
        if (!draft) return;
        const { error: saveError } = await supabase.rpc('wildfire_save_quote', { p_quote_id: draft.id, p_currency: draft.currency, p_discount: Number(draft.discount), p_tax: Number(draft.tax), p_expires_at: draft.expires_at || null, p_terms: draft.terms, p_proposal: draft.proposal, p_lines: draftLines.map(line => ({ product_id: line.product_id, description: line.description, quantity: Number(line.quantity), unit_price: Number(line.unit_price), recurring: Boolean(line.recurring) })) });
        if (saveError) throw new Error(saveError.message);
        setDraft(null); setNotice('Quote draft saved.'); await load();
      }); }}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-slate-700">Currency<select disabled={!draft} value={active.currency} onChange={event => draft && setDraft({ ...draft, currency: event.target.value })} className={control}>{['USD', 'CAD', 'EUR', 'GBP'].map(code => <option key={code}>{code}</option>)}</select></label>
          <label className="text-sm text-slate-700">Offer expires<input type="date" disabled={!draft} value={active.expires_at ?? ''} onChange={event => draft && setDraft({ ...draft, expires_at: event.target.value })} className={control} /></label>
        </div>
        <div className="mt-4 space-y-3">{activeLines.map((line, index) => <div key={draft ? index : line.id} className="grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-[minmax(0,1fr)_6rem_8rem_auto]">
          <input aria-label={`Description ${index + 1}`} required maxLength={1000} disabled={!draft} value={line.description} onChange={event => changeLine(index, { description: event.target.value })} className={control} />
          <label className="text-xs text-slate-500">Quantity<input aria-label={`Quantity ${index + 1}`} required type="number" min="0.001" step="any" disabled={!draft} value={line.quantity} onChange={event => changeLine(index, { quantity: Number(event.target.value) })} className={control} /></label>
          <label className="text-xs text-slate-500">Unit price<input aria-label={`Unit price ${index + 1}`} required type="number" min="0" step="0.01" disabled={!draft} value={line.unit_price} onChange={event => changeLine(index, { unit_price: Number(event.target.value) })} className={control} /></label>
          {draft ? <button type="button" className="text-sm text-rose-600" onClick={() => setDraftLines(current => current.filter((_, position) => position !== index))}>Remove</button> : <span className="self-center text-sm text-slate-700">{money(Number(line.quantity) * Number(line.unit_price), active.currency)}</span>}
          <label className="flex items-center gap-2 text-xs text-slate-500 sm:col-span-4"><input type="checkbox" disabled={!draft} checked={Boolean(line.recurring)} onChange={event => changeLine(index, { recurring: event.target.checked })} />Recurring charge (frequency must be specified in description or terms)</label>
        </div>)}</div>
        {draft && <div className="mt-3 flex flex-wrap gap-2"><select aria-label="Add catalog product" defaultValue="" className={`${control} w-auto`} onChange={event => {
          const product = products.find(item => item.id === event.target.value);
          if (product) setDraftLines(current => [...current, { product_id: product.id, description: product.name, quantity: 1, unit_price: Number(product.list_price) }]);
          event.target.value = '';
        }}><option value="">Add catalog product</option>{products.filter(product => product.status === 'active').map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select><button type="button" className={secondary} onClick={() => setDraftLines(current => [...current, { product_id: null, description: '', quantity: 1, unit_price: 0 }])}>Add custom line</button></div>}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-slate-700">Discount amount<input type="number" min="0" max={subtotal} step="0.01" disabled={!draft} value={active.discount} onChange={event => draft && setDraft({ ...draft, discount: Number(event.target.value) })} className={control} /></label>
          <label className="text-sm text-slate-700">Tax amount<input type="number" min="0" step="0.01" disabled={!draft} value={active.tax} onChange={event => draft && setDraft({ ...draft, tax: Number(event.target.value) })} className={control} /></label>
        </div>
        <p className="mt-4 font-semibold text-slate-900">Total: {money(total, active.currency)}</p>
        <label className="mt-4 block text-sm text-slate-700">Proposal and scope<textarea rows={6} disabled={!draft} value={active.proposal ?? ''} onChange={event => draft && setDraft({ ...draft, proposal: event.target.value })} className={control} /></label>
        <label className="mt-4 block text-sm text-slate-700">Customer terms<textarea rows={5} disabled={!draft} value={active.terms} onChange={event => draft && setDraft({ ...draft, terms: event.target.value })} className={control} /></label>
        {draft && <div className="mt-4 flex gap-2"><button disabled={busy} className={primary}>Save quote</button><button type="button" className={secondary} onClick={() => setDraft(null)}>Cancel edits</button></div>}
      </form>
      {notice && <p role="status" className="mt-3 text-sm text-slate-500">{notice}</p>}
      {link && <div className="mt-4"><label className="text-sm text-slate-700">Customer signing link<input readOnly value={link} onFocus={event => event.target.select()} className={control} /></label><div className="mt-2 flex flex-wrap gap-4"><a className="text-sm text-brand-600 underline" href={link} target="_blank" rel="noreferrer">Open customer signing page</a><a className="text-sm text-brand-600 underline" href={(() => { const url = new URL(link); url.searchParams.set('test', '1'); return url.href; })()} target="_blank" rel="noreferrer">Test signing without accepting</a></div><p className="mt-1 text-xs text-slate-500">This link grants access to the quote. Share only with the intended recipient. Copy it now; the raw token is not stored.</p></div>}
    </section>}
  </div>;
}
