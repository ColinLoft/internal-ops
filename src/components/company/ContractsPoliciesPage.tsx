import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, FileText, Plus, Search, Trash2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useWorkspace } from '../../context/WorkspaceContext';
import { EmptyState } from '../common/Feedback';

type Kind = 'contracts' | 'policies';
type LegalRecord = { id: string; record_type: string; name: string; description: string | null; status: string; owner_id: string | null; due_date: string | null; created_by: string; created_at: string };

const COPY: Record<Kind, { title: string; blurb: string; noun: string; dateLabel: string; statuses: string[]; icon: React.ElementType; namePlaceholder: string; detailPlaceholder: string }> = {
  contracts: {
    title: 'Contracts & Agreements', noun: 'contract', dateLabel: 'Renewal date', icon: FileText,
    blurb: 'Track counterparties, reviews, renewals and execution status.',
    statuses: ['draft', 'in_review', 'active', 'expiring', 'expired'],
    namePlaceholder: 'Agreement name', detailPlaceholder: 'Counterparty and key terms',
  },
  policies: {
    title: 'Policies', noun: 'policy', dateLabel: 'Next review', icon: BookOpen,
    blurb: 'Maintain the policy library, owners and review cycles.',
    statuses: ['draft', 'in_review', 'current', 'retired'],
    namePlaceholder: 'Policy name', detailPlaceholder: 'Summary or what it covers',
  },
};
const label = (value: string) => value.replace(/_/g, ' ').replace(/^\w/, (char) => char.toUpperCase());
const tone: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600', in_review: 'bg-amber-50 text-amber-700', 'In review': 'bg-amber-50 text-amber-700',
  active: 'bg-emerald-50 text-emerald-700', Active: 'bg-emerald-50 text-emerald-700', current: 'bg-emerald-50 text-emerald-700',
  expiring: 'bg-rose-50 text-rose-700', Expiring: 'bg-rose-50 text-rose-700', expired: 'bg-rose-50 text-rose-700', retired: 'bg-slate-100 text-slate-400',
};
const field = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-base outline-none focus:border-brand-400 md:text-xs';

export const ContractsPoliciesPage: React.FC<{ kind: Kind }> = ({ kind }) => {
  const { currentUser, users } = useWorkspace();
  const copy = COPY[kind];
  const Icon = copy.icon;
  const isLead = currentUser.systemRole === 'admin' || currentUser.systemRole === 'coordinator';
  const [items, setItems] = useState<LegalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', due_date: '' });

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: loadError } = await supabase.from('legal_records')
      .select('id,record_type,name,description,status,owner_id,due_date,created_by,created_at')
      .eq('record_type', kind).order('created_at', { ascending: false });
    setError(loadError?.message || '');
    setItems((data as LegalRecord[]) || []);
    setLoading(false);
  }, [kind]);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return term ? items.filter((item) => `${item.name} ${item.description || ''}`.toLowerCase().includes(term)) : items;
  }, [items, query]);

  const create = async () => {
    if (!form.name.trim()) return;
    const { error: insertError } = await supabase.from('legal_records').insert({
      record_type: kind, name: form.name.trim(), description: form.description.trim() || null, status: 'draft',
      due_date: form.due_date || null, owner_id: currentUser.id, created_by: currentUser.id,
    });
    if (insertError) { setError(insertError.message); return; }
    setForm({ name: '', description: '', due_date: '' });
    setCreating(false);
    await load();
  };

  const setStatus = async (item: LegalRecord, status: string) => {
    const { error: updateError } = await supabase.from('legal_records').update({ status, updated_at: new Date().toISOString() }).eq('id', item.id);
    if (updateError) { setError(updateError.message); return; }
    await load();
  };

  const remove = async (item: LegalRecord) => {
    if (!window.confirm(`Delete "${item.name}"?`)) return;
    const { error: deleteError } = await supabase.from('legal_records').delete().eq('id', item.id);
    if (deleteError) { setError(deleteError.message); return; }
    await load();
  };

  return (
    <main className="min-w-0 flex-1 overflow-y-auto bg-[#f7f9fc]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-5 sm:px-8">
        <div><h1 className="text-xl font-bold text-slate-900">{copy.title}</h1><p className="mt-1 text-xs text-slate-500">{copy.blurb}</p></div>
        <div className="flex w-full flex-wrap items-center gap-2 md:w-auto md:flex-nowrap">
          <div className="relative w-full md:w-auto"><Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${copy.title.toLowerCase()}`} aria-label={`Search ${copy.title}`} className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-base outline-none focus:border-brand-400 md:w-52 md:text-xs" /></div>
          <button type="button" onClick={() => setCreating(true)} className="inline-flex min-h-11 items-center gap-1 whitespace-nowrap rounded-xl bg-brand-600 px-3 py-2 text-xs font-bold text-white hover:bg-brand-700 md:min-h-0"><Plus className="h-3.5 w-3.5" />Add {copy.noun}</button>
        </div>
      </header>
      <div className="mx-auto max-w-6xl p-5 sm:p-8">
        {error && <div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</div>}
        {loading ? <p className="text-xs text-slate-400">Loading…</p> : visible.length === 0 ? (
          <EmptyState icon={Icon} text={items.length ? 'Nothing matches that search.' : `No ${copy.title.toLowerCase()} yet.`} action={`Add ${copy.noun}`} onClick={() => setCreating(true)} />
        ) : (
          <ul className="space-y-2">
            {visible.map((item) => {
              const canManage = isLead || item.created_by === currentUser.id;
              const options = copy.statuses.includes(item.status) ? copy.statuses : [item.status, ...copy.statuses];
              return (
                <li key={item.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <Icon className="h-4 w-4 shrink-0 text-brand-600" />
                  <div className="min-w-[200px] flex-1">
                    <p className="text-sm font-bold text-slate-900">{item.name}</p>
                    {item.description && <p className="mt-0.5 text-xs text-slate-500">{item.description}</p>}
                    <p className="mt-1 text-[11px] text-slate-400">Owner: {users.find((user) => user.id === item.owner_id)?.name || 'Unassigned'}{item.due_date ? ` · ${copy.dateLabel}: ${new Date(`${item.due_date}T00:00:00`).toLocaleDateString()}` : ''}</p>
                  </div>
                  {canManage ? (
                    <select value={item.status} onChange={(event) => void setStatus(item, event.target.value)} aria-label="Status" className={`rounded-full border-0 px-2.5 py-1 text-[11px] font-bold ${tone[item.status] || 'bg-slate-100 text-slate-600'}`}>{options.map((status) => <option key={status} value={status}>{label(status)}</option>)}</select>
                  ) : <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${tone[item.status] || 'bg-slate-100 text-slate-600'}`}>{label(item.status)}</span>}
                  {canManage && <button type="button" onClick={() => void remove(item)} aria-label={`Delete ${item.name}`} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-3" onClick={() => setCreating(false)}>
          <div role="dialog" aria-label={`Add ${copy.noun}`} onClick={(event) => event.stopPropagation()} className="max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between"><h2 className="text-sm font-bold text-slate-900">Add {copy.noun}</h2><button type="button" onClick={() => setCreating(false)} aria-label="Close" className="-m-2 p-2"><X className="h-4 w-4 text-slate-400" /></button></div>
            <div className="mt-4 space-y-3">
              <input autoFocus maxLength={200} value={form.name} onChange={(event) => setForm((value) => ({ ...value, name: event.target.value }))} placeholder={copy.namePlaceholder} className={field} />
              <textarea rows={3} value={form.description} onChange={(event) => setForm((value) => ({ ...value, description: event.target.value }))} placeholder={copy.detailPlaceholder} className={field} />
              <label className="block text-xs font-semibold text-slate-600">{copy.dateLabel}<input type="date" value={form.due_date} onChange={(event) => setForm((value) => ({ ...value, due_date: event.target.value }))} className={`${field} mt-1`} /></label>
            </div>
            <button type="button" disabled={!form.name.trim()} onClick={() => void create()} className="mt-4 w-full rounded-xl bg-brand-600 py-2.5 text-xs font-bold text-white disabled:opacity-50">Save {copy.noun}</button>
          </div>
        </div>
      )}
    </main>
  );
};
