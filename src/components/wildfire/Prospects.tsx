import React, { useState } from 'react';
import { Search, Sparkles } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { control, displayStage, functionError, primary, secondary, surface, type Opportunity, type Organization } from './model';

type ResearchResult = { name: string; website: string; email: string; phone: string; location: string; summary: string; fit_reason: string; source_urls: string[] };
export type ProspectValues = Pick<Opportunity, 'name' | 'prospect_name' | 'prospect_website' | 'prospect_email' | 'prospect_phone' | 'prospect_location' | 'research_notes' | 'source_urls' | 'organization_id'>;
const blank = (): ProspectValues => ({ name: '', prospect_name: '', prospect_website: '', prospect_email: '', prospect_phone: '', prospect_location: '', research_notes: '', source_urls: [], organization_id: null });
const stages = ['new_inquiry', 'initial_contact', 'discovery', 'site_planning', 'quote_preparation', 'proposal_sent', 'negotiation', 'won', 'lost'];

export function Prospects({ opportunities, organizations, canEdit, onSave, onStage, onPlan }: {
  opportunities: Opportunity[]; organizations: Organization[]; canEdit: boolean;
  onSave: (values: ProspectValues, id?: string) => Promise<void>;
  onStage: (id: string, stage: string) => Promise<void>; onPlan: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [researchQuery, setResearchQuery] = useState('');
  const [results, setResults] = useState<ResearchResult[]>([]);
  const [draft, setDraft] = useState<ProspectValues | null>(null);
  const [editingId, setEditingId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [researchBusy, setResearchBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const runResearch = async (event: React.FormEvent) => {
    event.preventDefault();
    setResearchBusy(true); setError(''); setResults([]); setNotice('');
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('wildfire-prospect-ai', { body: { query: researchQuery.trim() } });
      if (invokeError) throw new Error(await functionError(invokeError));
      if (data?.error) throw new Error(data.error);
      if (!Array.isArray(data?.results)) throw new Error('Research returned an invalid result. No prospects were saved.');
      setResults(data.results);
      if (!data.results.length) setNotice('No verified potential customers were found. Try another region or customer type.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Customer research failed.'); }
    finally { setResearchBusy(false); }
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    setBusy(true); setError('');
    try {
      await onSave({ ...draft, name: draft.name.trim(), prospect_name: draft.prospect_name.trim() || draft.name.trim() }, editingId);
      setDraft(null); setEditingId(undefined);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Prospect could not be saved.'); }
    finally { setBusy(false); }
  };
  const shown = opportunities.filter(item => `${item.name} ${item.prospect_name} ${item.prospect_location} ${item.research_notes}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="space-y-5">
    <section className={surface}>
      <h2 className="text-lg font-semibold text-slate-900">Find potential customers</h2>
      <p className="mt-2 text-sm text-slate-500">Search organizations to reach out to before adding them to the CRM. AI assesses public results against your saved grant resources and organization summary. Review sources before contacting anyone.</p>
      <form onSubmit={event => void runResearch(event)} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input aria-label="Public customer search" required maxLength={500} value={researchQuery} onChange={event => setResearchQuery(event.target.value)} placeholder="For example: vineyard wildfire protection Sonoma County" className={control} />
        <button disabled={!canEdit || researchBusy} className={`${primary} shrink-0`}><Sparkles className="h-4 w-4" />{researchBusy ? 'Researching…' : 'Search with AI'}</button>
      </form>
      <p className="mt-2 text-xs text-slate-500">Only this public search phrase goes to Brave Search. Saved internal context goes to your configured Azure OpenAI deployment, not the search provider. No outreach is sent automatically.</p>
      {notice && <p role="status" className="mt-3 text-sm text-slate-500">{notice}</p>}
      {results.length > 0 && <ul className="mt-5 space-y-4">{results.map((item, index) => <li key={`${item.website}-${index}`} className="rounded-lg bg-slate-50 p-4">
        <h3 className="font-semibold text-slate-900">{item.name}</h3>
        <p className="mt-1 text-sm text-slate-500">{item.location}</p>
        <p className="mt-2 text-sm text-slate-700">{item.summary}</p><p className="mt-2 text-sm text-slate-700">{item.fit_reason}</p>
        <div className="mt-3 flex flex-wrap gap-3">{item.source_urls.filter(url => /^https:\/\//i.test(url)).map(url => <a key={url} href={url} target="_blank" rel="noreferrer" className="max-w-full break-all text-sm text-brand-600 underline">{url}</a>)}</div>
        <button type="button" className={`${secondary} mt-3`} onClick={() => { setEditingId(undefined); setDraft({ ...blank(), name: item.name, prospect_name: item.name, prospect_website: item.website, prospect_email: item.email, prospect_phone: item.phone, prospect_location: item.location, research_notes: `${item.summary}\n\n${item.fit_reason}`, source_urls: item.source_urls }); }}>Review and save prospect</button>
      </li>)}</ul>}
    </section>
    {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    <section className={surface}>
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold text-slate-900">Outreach opportunities</h2>{canEdit && <button type="button" className={primary} onClick={() => { setEditingId(undefined); setDraft(blank()); }}>Add prospect</button>}</div>
      <label className="mt-4 flex items-center gap-2"><Search className="h-4 w-4 text-slate-500" /><input aria-label="Filter saved prospects" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search saved prospects" className={control} /></label>
      <ul className="mt-4 space-y-3">{shown.map(item => <li key={item.id} className="flex flex-col items-start justify-between gap-4 rounded-lg bg-slate-50 p-4 lg:flex-row">
        <div className="min-w-0 flex-1"><h3 className="font-semibold text-slate-900">{item.prospect_name || item.name}</h3><p className="mt-1 text-sm text-slate-500">{item.prospect_location || organizations.find(org => org.id === item.organization_id)?.name || 'Not in CRM yet'}</p><p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{item.research_notes || item.notes}</p>{item.prospect_email && <a className="mt-2 block break-all text-sm text-brand-600" href={`mailto:${item.prospect_email}`}>{item.prospect_email}</a>}</div>
        <div className="flex flex-wrap gap-2">
          <select aria-label={`Stage for ${item.name}`} disabled={!canEdit} value={item.stage} onChange={event => { void onStage(item.id, event.target.value).catch(cause => setError(cause instanceof Error ? cause.message : 'Stage update failed.')); }} className={`${control} w-auto`}>
            {[...new Set([...stages, item.stage])].map(stage => <option key={stage} value={stage}>{displayStage(stage)}</option>)}
          </select>
          {canEdit && <button type="button" className={secondary} onClick={() => { setEditingId(item.id); setDraft({ name: item.name, prospect_name: item.prospect_name ?? '', prospect_website: item.prospect_website ?? '', prospect_email: item.prospect_email ?? '', prospect_phone: item.prospect_phone ?? '', prospect_location: item.prospect_location ?? '', research_notes: item.research_notes ?? '', source_urls: item.source_urls ?? [], organization_id: item.organization_id }); }}>Edit</button>}
          <button type="button" className={primary} onClick={() => onPlan(item.id)}>Plan site</button>
        </div>
      </li>)}</ul>
      {!shown.length && <p className="py-6 text-sm text-slate-500">No saved prospects match. Search publicly or add one manually; no CRM company is required.</p>}
    </section>
    {draft && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-3"><section role="dialog" aria-modal="true" aria-label="Save prospect" className={`${surface} max-h-[92dvh] w-full max-w-xl overflow-y-auto`}>
      <h2 className="text-lg font-semibold text-slate-900">{editingId ? 'Edit prospect' : 'Save prospect'}</h2>
      <form onSubmit={event => void save(event)} className="mt-4 space-y-3">
        <label className="block text-sm text-slate-700">Opportunity name<input required maxLength={200} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} className={control} /></label>
        <label className="block text-sm text-slate-700">Organization name<input maxLength={200} value={draft.prospect_name} onChange={event => setDraft({ ...draft, prospect_name: event.target.value })} className={control} /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm text-slate-700">Website<input type="url" value={draft.prospect_website} onChange={event => setDraft({ ...draft, prospect_website: event.target.value })} className={control} /></label>
          <label className="block text-sm text-slate-700">Email<input type="email" value={draft.prospect_email} onChange={event => setDraft({ ...draft, prospect_email: event.target.value })} className={control} /></label>
          <label className="block text-sm text-slate-700">Phone<input value={draft.prospect_phone} onChange={event => setDraft({ ...draft, prospect_phone: event.target.value })} className={control} /></label>
          <label className="block text-sm text-slate-700">Location<input value={draft.prospect_location} onChange={event => setDraft({ ...draft, prospect_location: event.target.value })} className={control} /></label>
        </div>
        <label className="block text-sm text-slate-700">Research and outreach notes<textarea rows={5} value={draft.research_notes} onChange={event => setDraft({ ...draft, research_notes: event.target.value })} className={control} /></label>
        <p className="text-xs text-slate-500">This saves a Wildfire prospect, not a CRM record. CRM linking happens when the customer accepts a quote.</p>
        {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
        <div className="flex justify-end gap-2"><button type="button" onClick={() => setDraft(null)} className={secondary}>Cancel</button><button disabled={busy} className={primary}>{busy ? 'Saving…' : 'Save prospect'}</button></div>
      </form>
    </section></div>}
  </div>;
}
