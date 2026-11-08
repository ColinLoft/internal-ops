import React, { useCallback, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useWorkspace } from '../../context/WorkspaceContext';
import { control, money, primary, secondary, surface, type Product } from './model';
export function Catalog({ products, accessLevel, onRefresh }: { products: Product[]; accessLevel: number; onRefresh: () => Promise<void> }) {
  const { currentUser } = useWorkspace();
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<Product | null>(null);
  const [specifications, setSpecifications] = useState('{}');
  const [costs, setCosts] = useState<Record<string, number>>({});
  const [unitCost, setUnitCost] = useState<number | ''>('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const loadCosts = useCallback(async () => {
    if (accessLevel < 3) return;
    const { data, error: costError } = await supabase.from('wildfire_product_costs').select('product_id,unit_cost');
    if (costError) { setError(costError.message); return; }
    setCosts(Object.fromEntries((data ?? []).map(row => [row.product_id, Number(row.unit_cost)])));
  }, [accessLevel]);
  React.useEffect(() => { void loadCosts(); }, [loadCosts]);
  const open = (product?: Product) => {
    setDraft(product ?? { id: '', sku: '', name: '', category: 'detection', description: '', list_price: 0, status: 'active', warranty: '', installation_requirements: '', specifications: {} });
    setSpecifications(JSON.stringify(product?.specifications ?? {}, null, 2));
    setUnitCost(product && product.id in costs ? costs[product.id] : ''); setError('');
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); if (!draft) return;
    setBusy(true); setError('');
    try {
      const parsed: unknown = JSON.parse(specifications);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Specifications must be a JSON object.');
      const values = { sku: draft.sku.trim(), name: draft.name.trim(), category: draft.category, description: draft.description, list_price: draft.list_price, status: draft.status, warranty: draft.warranty, installation_requirements: draft.installation_requirements, specifications: parsed };
      const result = draft.id ? await supabase.from('wildfire_products').update(values).eq('id', draft.id).select('id').single() : await supabase.from('wildfire_products').insert({ ...values, created_by: currentUser.id, owner_id: currentUser.id }).select('id').single();
      if (result.error) throw new Error(result.error.message);
      if (accessLevel >= 3 && unitCost !== '') {
        const { error: costError } = await supabase.from('wildfire_product_costs').upsert({ product_id: result.data.id, unit_cost: unitCost, updated_by: currentUser.id }, { onConflict: 'product_id' });
        if (costError) { await onRefresh(); throw new Error(`Product saved, but internal cost was not: ${costError.message}`); }
      }
      setDraft(null); await onRefresh(); await loadCosts();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Product save failed.'); }
    finally { setBusy(false); }
  };
  return <section className={surface}>
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold text-slate-900">Product catalog</h2>{accessLevel >= 2 && <button type="button" className={primary} onClick={() => open()}>Add product</button>}</div>
    <input aria-label="Search catalog" className={`${control} mt-4`} value={query} onChange={event => setQuery(event.target.value)} placeholder="Search products or SKU" />
    {error && !draft && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
    <ul className="mt-4 space-y-3">{products.filter(item => `${item.name} ${item.sku} ${item.description}`.toLowerCase().includes(query.toLowerCase())).map(item => <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg bg-slate-50 p-4">
      <div><h3 className="font-semibold text-slate-900">{item.name}</h3><p className="text-sm text-slate-500">{item.sku} · {item.category} · {item.status}</p><p className="mt-1 text-sm text-slate-700">{item.description}</p><p className="mt-2 text-sm text-slate-900">{money(Number(item.list_price))}{accessLevel >= 3 && item.id in costs ? ` · Internal cost ${money(costs[item.id])}` : ''}</p></div>
      {accessLevel >= 2 && <button type="button" className={secondary} onClick={() => open(item)}>Edit</button>}
    </li>)}</ul>
    {!products.length && <p className="py-6 text-sm text-slate-500">No catalog products yet. Add equipment and services before building priced quotes.</p>}
    {draft && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-3"><section role="dialog" aria-modal="true" aria-label="Catalog product" className={`${surface} max-h-[92dvh] w-full max-w-xl overflow-y-auto`}>
      <h2 className="text-lg font-semibold text-slate-900">{draft.id ? 'Edit product' : 'Add product'}</h2><form className="mt-4 space-y-3" onSubmit={event => void save(event)}>
        <label className="block text-sm text-slate-700">Name<input required value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} className={control} /></label>
        <label className="block text-sm text-slate-700">SKU<input required value={draft.sku} onChange={event => setDraft({ ...draft, sku: event.target.value })} className={control} /></label>
        <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm text-slate-700">Category<select value={draft.category} onChange={event => { const category = event.target.value; if (category === 'detection' || category === 'infrastructure' || category === 'power' || category === 'service') setDraft({ ...draft, category }); }} className={control}>{['detection', 'infrastructure', 'power', 'service'].map(category => <option key={category}>{category}</option>)}</select></label>
        <label className="text-sm text-slate-700">Status<select value={draft.status} onChange={event => setDraft({ ...draft, status: event.target.value === 'active' ? 'active' : 'discontinued' })} className={control}><option value="active">Active</option><option value="discontinued">Discontinued</option></select></label>
        <label className="text-sm text-slate-700">List price<input required min={0} type="number" step="0.01" value={draft.list_price} onChange={event => setDraft({ ...draft, list_price: Number(event.target.value) })} className={control} /></label>
        {accessLevel >= 3 && <label className="text-sm text-slate-700">Internal unit cost<input min={0} type="number" step="0.01" value={unitCost} onChange={event => setUnitCost(event.target.value === '' ? '' : Number(event.target.value))} className={control} /></label>}</div>
        <label className="block text-sm text-slate-700">Description<textarea value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} className={control} /></label>
        <label className="block text-sm text-slate-700">Warranty<textarea value={draft.warranty} onChange={event => setDraft({ ...draft, warranty: event.target.value })} className={control} /></label>
        <label className="block text-sm text-slate-700">Installation requirements<textarea value={draft.installation_requirements} onChange={event => setDraft({ ...draft, installation_requirements: event.target.value })} className={control} /></label>
        <label className="block text-sm text-slate-700">Specifications (JSON)<textarea rows={4} value={specifications} onChange={event => setSpecifications(event.target.value)} className={control} /></label>
        {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
        <div className="flex justify-end gap-2"><button type="button" className={secondary} onClick={() => setDraft(null)}>Cancel</button><button disabled={busy} className={primary}>Save product</button></div>
      </form>
    </section></div>}
  </section>;
}
