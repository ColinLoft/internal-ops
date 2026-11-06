import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, Plus, Search, Sparkles, Trash2, X } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { supabase } from '../../lib/supabase';
import { card, field } from '../work/EntityPanels';
import { GRANT_TYPES, SOURCES, askGrantAi, dueTone, goTo, money } from './grantShared';
import { useConfirm } from '../common/useConfirm';

type Prospect = {
  id: string; name: string; funder_name: string | null; funder_org_id: string | null; url: string | null; application_url?: string | null; source_url?: string | null; source_title?: string | null; deadline: string | null; amount_min: number | null; amount_max: number | null;
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
    const { data, error: insertError } = await supabase.from('grants').insert({ name: row.name, funder_name: row.funder_name, funder_org_id: row.funder_org_id, website_url: row.url, application_url: row.application_url || row.url, grant_type: row.grant_type || 'money', amount_requested: row.grant_type === 'product' ? null : row.amount_max, in_kind_requested: row.grant_type === 'money' ? null : row.focus_areas ? row.focus_areas.slice(0, 200) : null, decision_due_at: null, source: row.source, source_detail: row.source_url ? `${row.source_title || 'Research source'}: ${row.source_url}\n${row.notes || ''}` : row.notes, owner_id: row.owner_id || currentUser.id, created_by: currentUser.id, stage: 'prospect', notes: row.fit_notes ? `<p>${row.fit_notes.replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>` : null }).select('id').single();
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
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [form, setForm] = useState({ grant_type: prospect?.grant_type || 'money', name: prospect?.name || '', funder_name: prospect?.funder_name || '', url: prospect?.url || '', application_url: prospect?.application_url || '', deadline: prospect?.deadline || '', amount_min: prospect?.amount_min ?? '', amount_max: prospect?.amount_max ?? '', focus_areas: prospect?.focus_areas || '', eligibility: prospect?.eligibility || '', status: prospect?.status || 'new', source: prospect?.source || '', notes: prospect?.notes || '', owner_id: prospect?.owner_id || userId, fit_score: prospect?.fit_score ?? null as number | null, fit_notes: prospect?.fit_notes || '' });
  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const payload = () => ({ grant_type: form.grant_type, name: form.name.trim(), funder_name: form.funder_name.trim() || null, url: form.url.trim() || null, application_url: form.application_url.trim() || null, deadline: form.deadline || null, amount_min: form.amount_min === '' ? null : Number(form.amount_min), amount_max: form.amount_max === '' ? null : Number(form.amount_max), focus_areas: form.focus_areas.trim() || null, eligibility: form.eligibility.trim() || null, status: form.status, source: form.source || null, notes: form.notes.trim() || null, owner_id: form.owner_id || null, fit_score: form.fit_score, fit_notes: form.fit_notes.trim() || null });
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
      const { error: updateError } = await supabase.from('grant_prospects').update({ fit_score: result.score, fit_notes: result.notes }).eq('id', id);
      if (updateError) setError(`Fit score calculated but not saved: ${updateError.message}`);
      else setForm((current) => ({ ...current, fit_score: result.score, fit_notes: result.notes }));
    } catch (aiError) { setError(aiError instanceof Error ? aiError.message : 'AI request failed.'); } finally { setBusy(''); }
  };
  const remove = async () => { if (!prospect || !await confirm({ title: `Delete “${prospect.name}”?`, message: 'This will remove the opportunity from the grant finder.', confirmLabel: 'Delete' })) return; const { error: deleteError } = await supabase.from('grant_prospects').delete().eq('id', prospect.id); if (deleteError) setError(deleteError.message); else onSaved(); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-label="Opportunity">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between"><h2 className="text-base font-bold text-slate-900">{prospect ? 'Opportunity' : 'Add opportunity'}</h2><button type="button" aria-label="Close" onClick={onClose}><X className="h-4 w-4" /></button></div>
        {error && <p role="alert" className="mb-2 rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{error}</p>}
        {!prospect && <div className="mb-3 rounded-xl border border-dashed border-brand-300 bg-brand-50/40 p-3"><p className="mb-1 text-xs font-bold text-slate-700">Paste a funding announcement and let AI fill the form</p><textarea value={paste} onChange={(event) => setPaste(event.target.value)} rows={3} placeholder="Paste the opportunity text here…" className={field} /><button type="button" disabled={!paste.trim() || busy === 'extract'} onClick={() => void extract()} className="mt-2 inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"><Sparkles className="h-3.5 w-3.5" />{busy === 'extract' ? 'Reading…' : 'Fill with AI'}</button></div>}
        <div className="grid gap-2 sm:grid-cols-2">
          <label className={`${l} sm:col-span-2`}>Name<input value={form.name} onChange={set('name')} className={field} /></label>
          <label className={l}>Funder<input value={form.funder_name} onChange={set('funder_name')} className={field} /></label>
          <label className={l}>Program page<input type="url" value={form.url} onChange={set('url')} className={field} /></label>
          <label className={`${l} sm:col-span-2`}>Direct application page<input type="url" value={form.application_url} onChange={set('application_url')} className={field} /></label>
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
          <div className="flex flex-wrap gap-3">{prospect && <button type="button" onClick={() => void remove()} className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600"><Trash2 className="h-3.5 w-3.5" />Delete</button>}{form.url && /^https:\/\//i.test(form.url) && <a href={form.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-brand-600"><ExternalLink className="h-3.5 w-3.5" />Program page</a>}{form.application_url && /^https:\/\//i.test(form.application_url) && <a href={form.application_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-brand-600"><ExternalLink className="h-3.5 w-3.5" />Apply</a>}{prospect?.source_url && <a href={prospect.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-slate-500"><ExternalLink className="h-3.5 w-3.5" />Research source</a>}</div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy === 'fit'} onClick={() => void score()} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50"><Sparkles className="h-3.5 w-3.5" />{busy === 'fit' ? 'Scoring…' : 'Score fit'}</button>
            {prospect && prospect.status !== 'converted' && <button type="button" onClick={() => void onConvert(prospect)} className="rounded-lg border border-brand-300 px-3 py-2 text-xs font-bold text-brand-700">Move to tracker</button>}
            <button type="button" onClick={async () => { if (await save()) onSaved(); }} className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-bold text-white">Save</button>
          </div>
        </div>
      </div>
      {confirmDialog}
    </div>
  );
};

type Suggestion = {
  name: string; funder_name: string | null; url: string | null; application_url: string | null;
  source_url: string; source_title: string | null; amount_min: number | null; amount_max: number | null;
  deadline: string | null; focus_areas: string; eligibility: string; why_fit: string; fit_score: number;
};

const ResearchModal: React.FC<{ userId: string; onClose: () => void; onAdded: () => void }> = ({ userId, onClose, onAdded }) => {
  const [focus, setFocus] = useState('');
  const [grantType, setGrantType] = useState('any');
  const [items, setItems] = useState<Suggestion[]>([]);
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);
  const [reviewing, setReviewing] = useState<Suggestion | null>(null);
  const [error, setError] = useState('');
  const run = async () => {
    setBusy(true); setError('');
    try {
      setItems([]);
      setSearched(false);
      const result = await askGrantAi<{ suggestions: Suggestion[]; resultCount: number }>({ action: 'research', focus, grantType, count: 20 });
      setItems(result.suggestions || []); setSearched(true);
    } catch (aiError) { setError(aiError instanceof Error ? aiError.message : 'AI request failed.'); } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-label="Research grants">
      <div className="max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between"><div><h2 className="text-base font-bold text-slate-900">Grant Finder</h2><p className="mt-1 text-xs text-slate-500">Live web results are matched against your organization summary and saved grant resources.</p></div><button type="button" aria-label="Close" onClick={onClose}><X className="h-4 w-4" /></button></div>
        <label className="text-xs font-semibold text-slate-500">Grant type<select value={grantType} onChange={(event) => setGrantType(event.target.value)} className={field}><option value="any">Any</option>{GRANT_TYPES.map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
        <label className="text-xs font-semibold text-slate-500">What should it look for? (optional)<textarea rows={2} value={focus} onChange={(event) => setFocus(event.target.value)} placeholder="e.g. youth technology programs, Pacific Northwest, under $50k" className={field} /></label>
        <button type="button" disabled={busy} onClick={() => void run()} className="mt-2 inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-60"><Sparkles className={`h-3.5 w-3.5 ${busy ? 'animate-pulse' : ''}`} />{busy ? 'Searching the web and checking fit…' : 'Find grants'}</button>
        {busy && <div role="status" aria-live="polite" className="mt-4 flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50/60 p-4">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-300 border-t-brand-700" />
          <div><p className="text-sm font-semibold text-slate-800">Searching current funding opportunities</p><p className="mt-1 text-xs text-slate-600">Checking public program pages, application links, eligibility and deadlines against your saved grant resources.</p></div>
        </div>}
        {error && <p role="alert" className="mt-2 rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{error}</p>}
        {searched && !items.length && <p className="mt-3 text-xs text-slate-500">No new suggestions. Try a different focus.</p>}
        {items.length > 0 && <>
          <p className="mt-4 text-xs text-slate-500">{items.length} opportunities found. Open each result to verify and edit the details before saving.</p>
          <ul className="mt-2 divide-y divide-slate-100">{items.map((item, index) => (
            <li key={`${item.name}-${index}`} className="flex flex-wrap items-start gap-3 py-3">
              <span className={`mt-0.5 rounded-full px-2 py-0.5 text-xs font-bold ${scoreTone(item.fit_score)}`}>{item.fit_score}% fit</span>
              <div className="min-w-0 flex-1"><h3 className="text-sm font-semibold text-slate-900">{item.name}</h3>
                <p className="text-xs text-slate-500">{item.funder_name || 'Funder not confirmed'} · {item.amount_min != null || item.amount_max != null ? `${money(item.amount_min)} – ${money(item.amount_max)}` : 'Award amount not listed'} · {item.deadline || 'Deadline not confirmed'}</p>
                <p className="mt-1 line-clamp-2 text-xs text-slate-600">{item.why_fit}</p>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                  {item.url && <a href={item.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-brand-700"><ExternalLink className="h-3 w-3" />Program page</a>}
                  {item.application_url && <a href={item.application_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-brand-700"><ExternalLink className="h-3 w-3" />Application</a>}
                </div>
                {item.source_url && <a href={item.source_url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-brand-700"><ExternalLink className="h-3 w-3" />{item.source_title || 'View research source'}</a>}
              </div>
              <button type="button" onClick={() => setReviewing(item)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:border-brand-400">Review details</button>
            </li>
          ))}</ul>
        </>}
        {reviewing && <ReviewSuggestion suggestion={reviewing} grantType={grantType === 'any' ? 'money' : grantType} userId={userId} onClose={() => setReviewing(null)} onSaved={() => { onAdded(); onClose(); }} />}
      </div>
    </div>
  );
};

const ReviewSuggestion: React.FC<{ suggestion: Suggestion; grantType: string; userId: string; onClose: () => void; onSaved: () => void }> = ({ suggestion, grantType, userId, onClose, onSaved }) => {
  const [form, setForm] = useState({
    name: suggestion.name, funder_name: suggestion.funder_name || '', url: suggestion.url || '',
    application_url: suggestion.application_url || '', source_url: suggestion.source_url,
    source_title: suggestion.source_title || '', deadline: suggestion.deadline || '',
    amount_min: suggestion.amount_min == null ? '' : String(suggestion.amount_min),
    amount_max: suggestion.amount_max == null ? '' : String(suggestion.amount_max),
    focus_areas: suggestion.focus_areas, eligibility: suggestion.eligibility, fit_notes: suggestion.why_fit,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const save = async () => {
    if (!form.name.trim()) { setError('An opportunity name is required.'); return; }
    if (form.url && !/^https:\/\//i.test(form.url)) { setError('The opportunity link must use HTTPS.'); return; }
    if (form.application_url && !/^https:\/\//i.test(form.application_url)) { setError('The application link must use HTTPS.'); return; }
    if (!/^https:\/\//i.test(form.source_url)) { setError('A source link is required for researched opportunities.'); return; }
    setBusy(true);
    const { error: saveError } = await supabase.from('grant_prospects').insert({
      name: form.name.trim(), funder_name: form.funder_name.trim() || null, url: form.url.trim() || null,
      application_url: form.application_url.trim() || null, source_url: form.source_url.trim(),
      source_title: form.source_title.trim() || null, research_verified_at: new Date().toISOString(),
      deadline: form.deadline || null, amount_min: form.amount_min === '' ? null : Number(form.amount_min),
      amount_max: form.amount_max === '' ? null : Number(form.amount_max), focus_areas: form.focus_areas.trim() || null,
      eligibility: form.eligibility.trim() || null, fit_score: suggestion.fit_score,
      fit_notes: form.fit_notes.trim() || null, status: 'new', source: 'Research / search',
      notes: 'Web-researched lead. Verify all program details, eligibility and dates with the funder before applying.',
      grant_type: grantType, owner_id: userId, created_by: userId,
    });
    setBusy(false);
    if (saveError) setError(saveError.message); else onSaved();
  };
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Review grant opportunity">
      <div className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-4"><div><h3 className="text-lg font-bold text-slate-900">Review opportunity</h3><p className="mt-1 text-xs text-slate-500">Check and edit the researched details before adding this lead.</p></div><button type="button" aria-label="Close review" onClick={onClose}><X className="h-4 w-4" /></button></div>
        {error && <p role="alert" className="mb-3 rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{error}</p>}
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 p-3">
          <span className={`rounded-full px-2 py-1 text-xs font-bold ${scoreTone(suggestion.fit_score)}`}>{suggestion.fit_score}% fit</span>
          <p className="min-w-0 flex-1 text-sm text-slate-700">{suggestion.why_fit}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={`${l} sm:col-span-2`}>Opportunity name<input value={form.name} onChange={set('name')} className={field} /></label>
          <label className={l}>Funder<input value={form.funder_name} onChange={set('funder_name')} className={field} /></label>
          <label className={l}>Deadline<input type="date" value={form.deadline} onChange={set('deadline')} className={field} /></label>
          <label className={l}>Program page<input type="url" value={form.url} onChange={set('url')} placeholder="Direct opportunity page" className={field} /></label>
          <label className={l}>Application page<input type="url" value={form.application_url} onChange={set('application_url')} placeholder="Direct application form, if available" className={field} /></label>
          <label className={l}>Minimum award ($)<input type="number" min="0" value={form.amount_min} onChange={set('amount_min')} className={field} /></label>
          <label className={l}>Maximum award ($)<input type="number" min="0" value={form.amount_max} onChange={set('amount_max')} className={field} /></label>
          <label className={`${l} sm:col-span-2`}>Focus areas<textarea rows={3} value={form.focus_areas} onChange={set('focus_areas')} className={field} /></label>
          <label className={`${l} sm:col-span-2`}>Eligibility<textarea rows={3} value={form.eligibility} onChange={set('eligibility')} className={field} /></label>
          <label className={`${l} sm:col-span-2`}>Why it may fit<textarea rows={3} value={form.fit_notes} onChange={set('fit_notes')} className={field} /></label>
          <label className={l}>Research source title<input value={form.source_title} onChange={set('source_title')} className={field} /></label>
          <label className={l}>Research source URL<input type="url" value={form.source_url} onChange={set('source_url')} className={field} /></label>
        </div>
        <p className="mt-3 text-xs text-slate-500">AI research is a lead, not confirmation. Check the linked official page for current eligibility, funding, and deadlines.</p>
        <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={onClose} className="px-3 py-2 text-xs font-semibold text-slate-500">Back to results</button><button type="button" disabled={busy} onClick={() => void save()} className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save as new opportunity'}</button></div>
      </div>
    </div>
  );
};
