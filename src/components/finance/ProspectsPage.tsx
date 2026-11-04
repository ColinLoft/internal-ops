import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, Plus, Search, Sparkles, Trash2, X } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { supabase } from '../../lib/supabase';
import { card, field } from '../work/EntityPanels';
import { GRANT_TYPES, SOURCES, askGrantAi, dueTone, goTo, money } from './grantShared';

type Prospect = {
  id: string; name: string; funder_name: string | null; funder_org_id: string | null; url: string | null; deadline: string | null; amount_min: number | null; amount_max: number | null;
  focus_areas: string | null; eligibility: string | null; fit_score: number | null; fit_notes: string | null; status: string; source: string | null; notes: string | null; owner_id: string | null; grant_id: string | null; grant_type: string;
};
const STATUSES = [['new', 'New'], ['reviewing', 'Reviewing'], ['pursuing', 'Pursuing'], ['passed', 'Passed'], ['converted', 'Applied / converted']] as const;
const scoreTone = (score: number | null) => (score == null ? 'bg-slate-100 text-slate-500' : score >= 70 ? 'bg-emerald-50 text-emerald-700' : score >= 40 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700');
const l = 'text-xs font-semibold text-slate-500';

export const ProspectsPage: React.FC = () => {
  const { currentUser, users } = useWorkspace();
  const [rows, setRows] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('open');
  const [open, setOpen] = useState<Prospect | 'new' | null>(null);
  const [researching, setResearching] = useState(false);

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase.from('grant_prospects').select('*').order('deadline', { ascending: true, nullsFirst: false });
    if (loadError) setError(`Prospects could not be loaded: ${loadError.message}. Run the latest database migration.`); else { setError(''); setRows((data || []) as Prospect[]); }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const shown = useMemo(() => rows.filter((row) => (status === 'all' || (status === 'open' ? ['new', 'reviewing', 'pursuing'].includes(row.status) : row.status === status)) && `${row.name} ${row.funder_name || ''} ${row.focus_areas || ''}`.toLowerCase().includes(query.toLowerCase())), [rows, status, query]);

  const convert = async (row: Prospect) => {
    const { data, error: insertError } = await supabase.from('grants').insert({ name: row.name, funder_name: row.funder_name, funder_org_id: row.funder_org_id, website_url: row.url, application_url: row.url, grant_type: row.grant_type || 'money', amount_requested: row.grant_type === 'product' ? null : row.amount_max, in_kind_requested: row.grant_type === 'money' ? null : row.focus_areas ? row.focus_areas.slice(0, 200) : null, decision_due_at: null, source: row.source, source_detail: row.notes, owner_id: row.owner_id || currentUser.id, created_by: currentUser.id, stage: 'prospect', notes: row.fit_notes ? `<p>${row.fit_notes.replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>` : null }).select('id').single();
    if (insertError || !data) { setError(insertError?.message || 'Could not create the grant.'); return; }
    await supabase.from('grant_prospects').update({ status: 'converted', grant_id: data.id }).eq('id', row.id);
    goTo(`/company/grants/${data.id}`);
  };

  return (
    <main className="min-w-0 flex-1 overflow-y-auto bg-[#f7f9fc]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4 sm:px-8">
        <div><h1 className="text-xl font-bold text-slate-900">Possible grants</h1><p className="mt-1 text-xs text-slate-500">Research opportunities, score the fit, and move the best ones into the tracker.</p></div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setResearching(true)} className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-brand-300 bg-white px-3 text-xs font-bold text-brand-700 md:min-h-0 md:py-2"><Sparkles className="h-3.5 w-3.5" />Research with AI</button>
          <button type="button" onClick={() => setOpen('new')} className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-brand-600 px-3 text-xs font-bold text-white md:min-h-0 md:py-2"><Plus className="h-3.5 w-3.5" />Add opportunity</button>
        </div>
      </header>
      <div className="space-y-4 p-5 sm:p-8">
        {error && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{error}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:max-w-xs"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search opportunities" className={`${field} pl-9`} /></div>
          <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-base md:text-xs"><option value="open">Open</option><option value="all">All</option>{STATUSES.map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select>
        </div>
        {loading ? <p className="py-10 text-center text-xs text-slate-400">Loading…</p> : shown.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{shown.map((row) => (
            <button type="button" key={row.id} onClick={() => setOpen(row)} className={`${card} text-left hover:border-brand-400`}>
              <div className="flex items-start justify-between gap-2"><h3 className="text-sm font-bold text-slate-900">{row.name}</h3><span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${scoreTone(row.fit_score)}`}>{row.fit_score == null ? 'Unscored' : `${row.fit_score}% fit`}</span></div>
              <p className="text-xs text-slate-500">{row.funder_name || 'Unknown funder'}</p>
              <p className="mt-2 text-xs text-slate-700">{row.amount_min || row.amount_max ? `${money(row.amount_min)} – ${money(row.amount_max)}` : 'Amount not listed'}</p>
              <p className={`text-xs ${dueTone(row.deadline)}`}>{row.deadline ? `Deadline ${row.deadline}` : 'No deadline / rolling'}</p>
              <p className="mt-2 text-xs capitalize text-slate-400">{row.status}{row.owner_id ? ` · ${users.find((user) => user.id === row.owner_id)?.name || ''}` : ''}</p>
            </button>
          ))}</div>
        ) : <div className="rounded-xl border border-dashed border-slate-200 bg-white p-10 text-center text-xs text-slate-500">No opportunities yet. Add one, or paste a funding announcement and let AI fill it in.</div>}
      </div>
      {researching && <ResearchModal userId={currentUser.id} onClose={() => setResearching(false)} onAdded={() => void load()} />}
      {open && <ProspectModal prospect={open === 'new' ? null : open} userId={currentUser.id} users={users} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); void load(); }} onConvert={convert} />}
    </main>
  );
};

const ProspectModal: React.FC<{ prospect: Prospect | null; userId: string; users: { id: string; name: string }[]; onClose: () => void; onSaved: () => void; onConvert: (row: Prospect) => Promise<void> }> = ({ prospect, userId, users, onClose, onSaved, onConvert }) => {
  const [form, setForm] = useState({ grant_type: prospect?.grant_type || 'money', name: prospect?.name || '', funder_name: prospect?.funder_name || '', url: prospect?.url || '', deadline: prospect?.deadline || '', amount_min: prospect?.amount_min ?? '', amount_max: prospect?.amount_max ?? '', focus_areas: prospect?.focus_areas || '', eligibility: prospect?.eligibility || '', status: prospect?.status || 'new', source: prospect?.source || '', notes: prospect?.notes || '', owner_id: prospect?.owner_id || userId, fit_score: prospect?.fit_score ?? null as number | null, fit_notes: prospect?.fit_notes || '' });
  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const payload = () => ({ grant_type: form.grant_type, name: form.name.trim(), funder_name: form.funder_name.trim() || null, url: form.url.trim() || null, deadline: form.deadline || null, amount_min: form.amount_min === '' ? null : Number(form.amount_min), amount_max: form.amount_max === '' ? null : Number(form.amount_max), focus_areas: form.focus_areas.trim() || null, eligibility: form.eligibility.trim() || null, status: form.status, source: form.source || null, notes: form.notes.trim() || null, owner_id: form.owner_id || null, fit_score: form.fit_score, fit_notes: form.fit_notes.trim() || null });
  const save = async (): Promise<string | null> => {
    if (!form.name.trim()) { setError('A name is required.'); return null; }
    const body = { ...payload(), updated_at: new Date().toISOString() };
    if (prospect) { const { error: updateError } = await supabase.from('grant_prospects').update(body).eq('id', prospect.id); if (updateError) { setError(updateError.message); return null; } return prospect.id; }
    const { data, error: insertError } = await supabase.from('grant_prospects').insert({ ...body, created_by: userId }).select('id').single();
    if (insertError || !data) { setError(insertError?.message || 'Could not save.'); return null; }
    return data.id;
  };
  const extract = async () => {
    setBusy('extract'); setError('');
    try {
      const { result } = await askGrantAi<{ result: Record<string, string | number | null> }>({ action: 'extract', text: paste });
      setForm((current) => ({ ...current, name: String(result.name || current.name), funder_name: String(result.funder_name || current.funder_name), url: String(result.url || current.url), deadline: String(result.deadline || current.deadline), amount_min: result.amount_min ?? current.amount_min, amount_max: result.amount_max ?? current.amount_max, focus_areas: String(result.focus_areas || current.focus_areas), eligibility: String(result.eligibility || current.eligibility), notes: String(result.notes || current.notes) }));
      setPaste('');
    } catch (aiError) { setError(aiError instanceof Error ? aiError.message : 'AI request failed.'); } finally { setBusy(''); }
  };
  const score = async () => {
    setBusy('fit'); setError('');
    try {
      const id = await save();
      if (!id) return;
      const result = await askGrantAi<{ score: number; notes: string }>({ action: 'fit', id });
      setForm((current) => ({ ...current, fit_score: result.score, fit_notes: result.notes }));
      await supabase.from('grant_prospects').update({ fit_score: result.score, fit_notes: result.notes }).eq('id', id);
    } catch (aiError) { setError(aiError instanceof Error ? aiError.message : 'AI request failed.'); } finally { setBusy(''); }
  };
  const remove = async () => { if (!prospect || !window.confirm(`Delete "${prospect.name}"?`)) return; const { error: deleteError } = await supabase.from('grant_prospects').delete().eq('id', prospect.id); if (deleteError) setError(deleteError.message); else onSaved(); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-label="Opportunity">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between"><h2 className="text-base font-bold text-slate-900">{prospect ? 'Opportunity' : 'Add opportunity'}</h2><button type="button" aria-label="Close" onClick={onClose}><X className="h-4 w-4" /></button></div>
        {error && <p role="alert" className="mb-2 rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{error}</p>}
        {!prospect && <div className="mb-3 rounded-xl border border-dashed border-brand-300 bg-brand-50/40 p-3"><p className="mb-1 text-xs font-bold text-slate-700">Paste a funding announcement and let AI fill the form</p><textarea value={paste} onChange={(event) => setPaste(event.target.value)} rows={3} placeholder="Paste the opportunity text here…" className={field} /><button type="button" disabled={!paste.trim() || busy === 'extract'} onClick={() => void extract()} className="mt-2 inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"><Sparkles className="h-3.5 w-3.5" />{busy === 'extract' ? 'Reading…' : 'Fill with AI'}</button></div>}
        <div className="grid gap-2 sm:grid-cols-2">
          <label className={`${l} sm:col-span-2`}>Name<input value={form.name} onChange={set('name')} className={field} /></label>
          <label className={l}>Funder<input value={form.funder_name} onChange={set('funder_name')} className={field} /></label>
          <label className={l}>Link<input value={form.url} onChange={set('url')} className={field} /></label>
          <label className={l}>Deadline<input type="date" value={form.deadline} onChange={set('deadline')} className={field} /></label>
          <label className={l}>Grant type<select value={form.grant_type} onChange={set('grant_type')} className={field}>{GRANT_TYPES.map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
          <label className={l}>Status<select value={form.status} onChange={set('status')} className={field}>{STATUSES.map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
          <label className={l}>Min award ($)<input type="number" min="0" value={form.amount_min} onChange={set('amount_min')} className={field} /></label>
          <label className={l}>Max award ($)<input type="number" min="0" value={form.amount_max} onChange={set('amount_max')} className={field} /></label>
          <label className={l}>How we found it<select value={form.source} onChange={set('source')} className={field}><option value="">Not recorded</option>{SOURCES.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className={l}>Owner<select value={form.owner_id} onChange={set('owner_id')} className={field}><option value="">Unassigned</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label>
          <label className={`${l} sm:col-span-2`}>Focus areas<textarea rows={2} value={form.focus_areas} onChange={set('focus_areas')} className={field} /></label>
          <label className={`${l} sm:col-span-2`}>Eligibility<textarea rows={2} value={form.eligibility} onChange={set('eligibility')} className={field} /></label>
          <label className={`${l} sm:col-span-2`}>Notes<textarea rows={2} value={form.notes} onChange={set('notes')} className={field} /></label>
        </div>
        {(form.fit_score != null || form.fit_notes) && <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs"><p className="font-bold text-slate-700">AI fit assessment{form.fit_score != null ? `: ${form.fit_score}%` : ''}</p><p className="mt-1 whitespace-pre-wrap text-slate-600">{form.fit_notes}</p></div>}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">{prospect && <button type="button" onClick={() => void remove()} className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600"><Trash2 className="h-3.5 w-3.5" />Delete</button>}{form.url && /^https?:\/\//i.test(form.url) && <a href={form.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-brand-600"><ExternalLink className="h-3.5 w-3.5" />Open</a>}</div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy === 'fit'} onClick={() => void score()} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50"><Sparkles className="h-3.5 w-3.5" />{busy === 'fit' ? 'Scoring…' : 'Score fit'}</button>
            {prospect && prospect.status !== 'converted' && <button type="button" onClick={() => void onConvert(prospect)} className="rounded-lg border border-brand-300 px-3 py-2 text-xs font-bold text-brand-700">Move to tracker</button>}
            <button type="button" onClick={async () => { if (await save()) onSaved(); }} className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-bold text-white">Save</button>
          </div>
        </div>
      </div>
    </div>
  );
};

type Suggestion = { name: string; funder_name: string | null; url: string | null; amount_min: number | null; amount_max: number | null; deadline: string | null; focus_areas: string; eligibility: string; why_fit: string; fit_score: number };

const ResearchModal: React.FC<{ userId: string; onClose: () => void; onAdded: () => void }> = ({ userId, onClose, onAdded }) => {
  const [focus, setFocus] = useState('');
  const [grantType, setGrantType] = useState('any');
  const [items, setItems] = useState<Suggestion[]>([]);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');
  const run = async () => {
    setBusy(true); setError('');
    try {
      const result = await askGrantAi<{ suggestions: Suggestion[] }>({ action: 'research', focus, grantType });
      setItems(result.suggestions || []); setPicked(new Set((result.suggestions || []).map((_, index) => index))); setSearched(true);
    } catch (aiError) { setError(aiError instanceof Error ? aiError.message : 'AI request failed.'); } finally { setBusy(false); }
  };
  const addPicked = async () => {
    const rows = items.filter((_, index) => picked.has(index)).map((item) => ({ grant_type: grantType === 'any' ? 'money' : grantType, name: item.name, funder_name: item.funder_name, url: item.url, amount_min: item.amount_min, amount_max: item.amount_max, deadline: item.deadline, focus_areas: item.focus_areas, eligibility: item.eligibility, fit_score: item.fit_score, fit_notes: item.why_fit, status: 'new', source: 'Research / search', notes: 'Suggested by AI research. Verify the details, deadline and eligibility with the funder before applying.', owner_id: userId, created_by: userId }));
    if (!rows.length) return;
    const { error: insertError } = await supabase.from('grant_prospects').insert(rows);
    if (insertError) { setError(insertError.message); return; }
    onAdded(); onClose();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-label="Research grants">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between"><h2 className="text-base font-bold text-slate-900">Research possible grants</h2><button type="button" aria-label="Close" onClick={onClose}><X className="h-4 w-4" /></button></div>
        <p className="mb-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">AI suggests established programs from its general knowledge and does not browse the web. Treat every result as a lead and verify deadlines, amounts and eligibility with the funder.</p>
        <label className="text-xs font-semibold text-slate-500">Grant type<select value={grantType} onChange={(event) => setGrantType(event.target.value)} className={field}><option value="any">Any</option>{GRANT_TYPES.map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
        <label className="text-xs font-semibold text-slate-500">What should it look for? (optional)<textarea rows={2} value={focus} onChange={(event) => setFocus(event.target.value)} placeholder="e.g. youth technology programs, Pacific Northwest, under $50k" className={field} /></label>
        <button type="button" disabled={busy} onClick={() => void run()} className="mt-2 inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-60"><Sparkles className="h-3.5 w-3.5" />{busy ? 'Researching…' : 'Find grants'}</button>
        {error && <p role="alert" className="mt-2 rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{error}</p>}
        {searched && !items.length && <p className="mt-3 text-xs text-slate-500">No new suggestions. Try a different focus.</p>}
        {items.length > 0 && <>
          <ul className="mt-3 space-y-2">{items.map((item, index) => (
            <li key={index} className="rounded-xl border border-slate-200 p-3 text-xs">
              <label className="flex items-start gap-2"><input type="checkbox" checked={picked.has(index)} onChange={(event) => setPicked((current) => { const next = new Set(current); if (event.target.checked) next.add(index); else next.delete(index); return next; })} className="mt-0.5 h-4 w-4" />
                <span className="min-w-0 flex-1"><span className="flex items-start justify-between gap-2"><span className="font-bold text-slate-900">{item.name}</span><span className={`shrink-0 rounded-full px-2 py-0.5 font-bold ${scoreTone(item.fit_score)}`}>{item.fit_score}% fit</span></span>
                  <span className="block text-slate-500">{item.funder_name || 'Unknown funder'}{item.amount_min || item.amount_max ? ` · ${money(item.amount_min)} – ${money(item.amount_max)}` : ''}</span>
                  <span className="mt-1 block text-slate-600">{item.why_fit}</span></span></label>
            </li>
          ))}</ul>
          <div className="mt-3 flex justify-end gap-2"><button type="button" onClick={onClose} className="px-3 py-2 text-xs font-semibold text-slate-500">Cancel</button><button type="button" disabled={!picked.size} onClick={() => void addPicked()} className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">Add {picked.size} for review</button></div>
        </>}
      </div>
    </div>
  );
};
