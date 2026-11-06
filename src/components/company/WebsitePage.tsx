import { CustomSelect } from "../common/CustomSelect";
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, ArrowUpRight, BookOpen, Check, Clock3, FileText, Globe2, History, Plus, Search, Settings2, Trash2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAppAccess } from '../../lib/useAppAccess';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useConfirm } from '../common/useConfirm';

type ContentType = 'policy' | 'support_doc';
type ContentStatus = 'draft' | 'published' | 'archived';
type WebsiteContent = {
  id: string;
  content_type: ContentType;
  slug: string;
  title: string;
  summary: string;
  body: string;
  status: ContentStatus;
  updated_at: string;
  published_at: string | null;
};
type Revision = { id: string; title: string; summary: string; body: string; status: ContentStatus; created_at: string };
type WebsiteSettings = { public_site_url: string; analytics_provider: string; analytics_dashboard_url: string };
type Tab = 'analytics' | 'policies' | 'support';

const emptySettings: WebsiteSettings = { public_site_url: '', analytics_provider: 'not_connected', analytics_dashboard_url: '' };
const input = 'w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-brand-500';
const button = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-50';
const statusClass: Record<ContentStatus, string> = {
  draft: 'bg-slate-800 text-slate-300',
  published: 'bg-emerald-950 text-emerald-300',
  archived: 'bg-slate-800 text-slate-500',
};
const makeSlug = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100);
const formatDate = (value: string) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

export const WebsitePage: React.FC = () => {
  const { currentUser } = useWorkspace();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const { canEdit } = useAppAccess('legal');
  const [tab, setTab] = useState<Tab>('analytics');
  const [content, setContent] = useState<WebsiteContent[]>([]);
  const [settings, setSettings] = useState<WebsiteSettings>(emptySettings);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [selected, setSelected] = useState<WebsiteContent | null>(null);
  const [editing, setEditing] = useState<WebsiteContent | null | false>(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [contentResult, settingsResult] = await Promise.all([
      supabase.from('website_content').select('id,content_type,slug,title,summary,body,status,updated_at,published_at').order('updated_at', { ascending: false }),
      canEdit
        ? supabase.from('website_settings').select('public_site_url,analytics_provider,analytics_dashboard_url').eq('id', true).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    const failure = contentResult.error || settingsResult.error;
    if (failure) setError(failure.message);
    else setError('');
    setContent((contentResult.data || []) as WebsiteContent[]);
    setSettings((settingsResult.data as WebsiteSettings | null) || emptySettings);
    setLoading(false);
  }, [canEdit]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setSelected(null); setRevisions([]); }, [tab]);

  const rows = useMemo(() => {
    const type: ContentType | null = tab === 'policies' ? 'policy' : tab === 'support' ? 'support_doc' : null;
    const term = search.trim().toLowerCase();
    return content.filter((item) => (!type || item.content_type === type) &&
      (!term || `${item.title} ${item.summary} ${item.slug}`.toLowerCase().includes(term)));
  }, [content, search, tab]);

  const showDetail = async (item: WebsiteContent) => {
    setSelected(item);
    setRevisions([]);
    if (!canEdit) return;
    const { data, error: revisionError } = await supabase.from('website_content_revisions')
      .select('id,title,summary,body,status,created_at').eq('content_id', item.id)
      .order('created_at', { ascending: false }).limit(10);
    if (revisionError) setError(revisionError.message);
    else setRevisions((data || []) as Revision[]);
  };

  const saveContent = async (values: Pick<WebsiteContent, 'content_type' | 'title' | 'slug' | 'summary' | 'body' | 'status'>, id?: string): Promise<string> => {
    if (values.status === 'published' && !await confirm({ title: 'Publish this content?', message: 'It will be readable by the public website integration.', confirmLabel: 'Publish', variant: 'primary' })) return 'Publication was canceled; the document was not saved.';
    setError('');
    const payload = { ...values, updated_at: new Date().toISOString() };
    const result = id
      ? await supabase.from('website_content').update(payload).eq('id', id)
      : await supabase.from('website_content').insert(payload);
    if (result.error) { setError(result.error.message); return result.error.message; }
    setEditing(false);
    await load();
    if (id) {
      const { data } = await supabase.from('website_content').select('id,content_type,slug,title,summary,body,status,updated_at,published_at').eq('id', id).maybeSingle();
      if (data) await showDetail(data as WebsiteContent);
    }
    return '';
  };

  const removeContent = async (item: WebsiteContent) => {
    if (!await confirm({ title: `Delete “${item.title}”?`, message: 'Its revision history will also be deleted.', confirmLabel: 'Delete' })) return;
    const { error: deleteError } = await supabase.from('website_content').delete().eq('id', item.id);
    if (deleteError) setError(deleteError.message);
    else { setSelected(null); await load(); }
  };

  const saveSettings = async () => {
    if (settings.public_site_url && !isWebUrl(settings.public_site_url)) { setError('Enter a valid public website URL, including https://.'); return; }
    if (settings.analytics_dashboard_url && !isWebUrl(settings.analytics_dashboard_url)) { setError('Enter a valid analytics dashboard URL, including https://.'); return; }
    setSavingSettings(true);
    setError('');
    const { error: saveError } = await supabase.from('website_settings').upsert({ id: true, ...settings, updated_by: currentUser.id, updated_at: new Date().toISOString() });
    if (saveError) setError(saveError.message);
    setSavingSettings(false);
  };

  const editTab = tab === 'policies' ? 'policy' : 'support_doc';
  const heading = tab === 'policies' ? 'Website policies' : 'Support documents';

  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-[#090b0f] text-slate-100">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 bg-[#0d1016] px-5 py-5 sm:px-8">
        <div>
          <h1 className="text-xl font-semibold text-white">Website</h1>
          <p className="mt-1 text-sm text-slate-400">Manage public-site content and connect its analytics.</p>
        </div>
        {tab !== 'analytics' && canEdit && (
          <button type="button" className={button} onClick={() => setEditing(null)}>
            <Plus className="h-4 w-4" /> New {tab === 'policies' ? 'policy' : 'support document'}
          </button>
        )}
      </header>

      <div className="mx-auto w-full max-w-[1500px] flex-1 p-4 sm:p-6 lg:p-8">
        <nav aria-label="Website management sections" className="mb-6 flex gap-1 overflow-x-auto border-b border-slate-800">
          {([
            ['analytics', 'Analytics', Activity],
            ['policies', 'Policies', FileText],
            ['support', 'Support documents', BookOpen],
          ] as const).map(([id, label, Icon]) => (
            <button key={id} type="button" onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined}
              className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium transition-colors ${tab === id ? 'border-brand-500 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
              <Icon className="h-4 w-4" />{label}
            </button>
          ))}
        </nav>

        {error && <p role="alert" className="mb-5 rounded-lg border border-rose-900 bg-rose-950/60 px-4 py-3 text-sm text-rose-200">{error}</p>}

        {tab === 'analytics' ? (
          <section className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
            <div className="rounded-xl border border-slate-800 bg-[#0d1016] p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-white">Public website analytics</h2>
                  <p className="mt-1 text-sm text-slate-400">{settings.public_site_url || 'Add your public website URL in Website setup.'}</p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-800 px-2.5 py-1 text-xs text-slate-300">
                  <span className={`h-1.5 w-1.5 rounded-full ${settings.analytics_provider === 'not_connected' ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                  {settings.analytics_provider === 'not_connected' ? 'Not connected' : settings.analytics_dashboard_url ? 'Dashboard linked' : 'Provider selected'}
                </span>
              </div>
              <div className="mt-7 flex min-h-52 flex-col items-center justify-center rounded-lg bg-[#11151c] px-5 py-8 text-center">
                <Activity className="h-7 w-7 text-slate-500" />
                <p className="mt-3 text-sm font-medium text-slate-200">No public-site traffic data is connected</p>
                <p className="mt-1 max-w-lg text-sm leading-6 text-slate-400">
                  Flown does not have access to visitor metrics until an analytics provider is connected. No visits or engagement figures are estimated here.
                </p>
                {settings.analytics_dashboard_url && (
                  <a href={settings.analytics_dashboard_url} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-sky-400 hover:text-sky-300">
                    Open analytics dashboard <ArrowUpRight className="h-4 w-4" />
                  </a>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-[#0d1016] p-5 sm:p-6">
              <div className="flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-slate-400" />
                <h2 className="text-base font-semibold text-white">Website setup</h2>
              </div>
              <p className="mt-1 text-sm text-slate-400">Connect your public site and the analytics dashboard used by your team.</p>
              <div className="mt-5 space-y-4">
                <label className="block text-sm font-medium text-slate-300">Public website URL
                  <input value={settings.public_site_url} onChange={(event) => setSettings({ ...settings, public_site_url: event.target.value })} placeholder="https://example.org" className={`${input} mt-1.5`} disabled={!canEdit} />
                </label>
                <label className="block text-sm font-medium text-slate-300">Analytics provider
                  <CustomSelect value={settings.analytics_provider} onChange={(event) => setSettings({ ...settings, analytics_provider: event.target.value })} className={`${input} mt-1.5`} disabled={!canEdit}>
                    <option value="not_connected">Not connected</option><option value="vercel">Vercel Analytics</option>
                    <option value="google_analytics">Google Analytics</option><option value="plausible">Plausible</option><option value="other">Other</option>
                  </CustomSelect>
                </label>
                <label className="block text-sm font-medium text-slate-300">Analytics dashboard URL
                  <input value={settings.analytics_dashboard_url} onChange={(event) => setSettings({ ...settings, analytics_dashboard_url: event.target.value })} placeholder="https://…" className={`${input} mt-1.5`} disabled={!canEdit} />
                </label>
                {canEdit && <button type="button" className={button} onClick={() => void saveSettings()} disabled={savingSettings}>{savingSettings ? 'Saving…' : 'Save setup'}</button>}
                {settings.public_site_url && isWebUrl(settings.public_site_url) && (
                  <a href={settings.public_site_url} target="_blank" rel="noreferrer" className="ml-3 inline-flex items-center gap-1.5 text-sm font-medium text-sky-400 hover:text-sky-300">
                    <Globe2 className="h-4 w-4" /> Visit website
                  </a>
                )}
              </div>
            </div>
          </section>
        ) : (
          <section className="grid min-h-[480px] gap-5 xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
            <div className="min-w-0 rounded-xl border border-slate-800 bg-[#0d1016]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 p-4">
                <div><h2 className="font-semibold text-white">{heading}</h2><p className="mt-0.5 text-xs text-slate-400">{rows.length} {rows.length === 1 ? 'document' : 'documents'}</p></div>
                <label className="relative min-w-0 flex-1 sm:max-w-52">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                  <input value={search} onChange={(event) => setSearch(event.target.value)} aria-label={`Search ${heading}`} placeholder="Search" className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2 pl-9 pr-3 text-sm text-slate-100 outline-none focus:border-brand-500" />
                </label>
              </div>
              <div className="divide-y divide-slate-800">
                {loading ? <p className="p-5 text-sm text-slate-400">Loading website content…</p> : rows.length ? rows.map((item) => (
                  <button key={item.id} type="button" onClick={() => void showDetail(item)} className={`flex w-full items-start gap-3 px-4 py-4 text-left transition-colors hover:bg-slate-900/80 ${selected?.id === item.id ? 'bg-slate-900' : ''}`}>
                    {item.content_type === 'policy' ? <FileText className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /> : <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />}
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2"><span className="truncate text-sm font-medium text-slate-100">{item.title}</span><span className={`rounded px-2 py-0.5 text-[11px] ${statusClass[item.status]}`}>{labelStatus(item.status)}</span></span>
                      <span className="mt-1 block truncate text-xs text-slate-400">{item.summary || item.slug}</span>
                      <span className="mt-2 block text-xs text-slate-500">Updated {formatDate(item.updated_at)}</span>
                    </span>
                  </button>
                )) : <p className="p-5 text-sm text-slate-400">{search ? 'No matching documents.' : `No ${heading.toLowerCase()} yet.`}</p>}
              </div>
            </div>

            <article className="min-w-0 rounded-xl border border-slate-800 bg-[#0d1016] p-5 sm:p-6">
              {!selected ? (
                <div className="flex min-h-64 flex-col items-center justify-center text-center">
                  <BookOpen className="h-6 w-6 text-slate-500" />
                  <h3 className="mt-3 text-sm font-semibold text-slate-200">Select a document</h3>
                  <p className="mt-1 max-w-sm text-sm text-slate-400">Review its content, publication state and change history.</p>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-semibold text-white">{selected.title}</h3><span className={`rounded px-2 py-0.5 text-xs ${statusClass[selected.status]}`}>{labelStatus(selected.status)}</span></div>
                      <p className="mt-1 text-xs text-slate-500">/{selected.content_type === 'policy' ? 'policies' : 'support'}/{selected.slug}</p>
                    </div>
                    {canEdit && <div className="flex gap-2">
                      <button type="button" onClick={() => setEditing(selected)} className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800">Edit</button>
                      <button type="button" aria-label={`Delete ${selected.title}`} onClick={() => void removeContent(selected)} className="rounded-lg border border-slate-700 p-2 text-slate-400 hover:text-rose-400"><Trash2 className="h-4 w-4" /></button>
                    </div>}
                  </div>
                  {selected.summary && <p className="mt-5 text-sm font-medium leading-6 text-slate-300">{selected.summary}</p>}
                  <div className="mt-4 min-h-40 whitespace-pre-wrap rounded-lg bg-[#11151c] p-4 text-sm leading-6 text-slate-300">{selected.body || <span className="text-slate-500">No content has been added.</span>}</div>
                  <p className="mt-3 text-xs text-slate-500">Last updated {formatDate(selected.updated_at)}{selected.published_at ? ` · Published ${formatDate(selected.published_at)}` : ''}</p>
                  {canEdit && <div className="mt-7 border-t border-slate-800 pt-5">
                    <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-200"><History className="h-4 w-4 text-slate-400" />Recent changes</h4>
                    {revisions.length ? <ul className="mt-3 space-y-2">{revisions.map((revision) => <li key={revision.id} className="flex items-center gap-2 text-xs text-slate-400"><Clock3 className="h-3.5 w-3.5" /><span>{formatDate(revision.created_at)} · {revision.title} · {labelStatus(revision.status)}</span></li>)}</ul> : <p className="mt-2 text-xs text-slate-500">No edits have been recorded yet.</p>}
                  </div>}
                  <p className="mt-6 rounded-lg bg-slate-900 px-3 py-2.5 text-xs leading-5 text-slate-400">
                    Published documents are exposed for the website integration to read. They do not automatically deploy to an external site unless that site is connected to this content source.
                  </p>
                </>
              )}
            </article>
          </section>
        )}
      </div>

      {editing !== false && (
        <ContentEditor
          initial={editing || undefined}
          type={editing?.content_type || editTab}
          canEdit={canEdit}
          onClose={() => setEditing(false)}
          onSave={(values) => saveContent(values, editing?.id)}
        />
      )}
      {confirmDialog}
    </main>
  );
};

const ContentEditor: React.FC<{
  initial?: WebsiteContent;
  type: ContentType;
  canEdit: boolean;
  onClose: () => void;
  onSave: (values: Pick<WebsiteContent, 'content_type' | 'title' | 'slug' | 'summary' | 'body' | 'status'>) => Promise<string>;
}> = ({ initial, type, canEdit, onClose, onSave }) => {
  const [title, setTitle] = useState(initial?.title || '');
  const [slug, setSlug] = useState(initial?.slug || '');
  const [summary, setSummary] = useState(initial?.summary || '');
  const [body, setBody] = useState(initial?.body || '');
  const [status, setStatus] = useState<ContentStatus>(initial?.status || 'draft');
  const [slugTouched, setSlugTouched] = useState(!!initial);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canEdit || !title.trim() || !slug.trim()) return;
    setSaving(true);
    const saveError = await onSave({ content_type: type, title: title.trim(), slug: makeSlug(slug), summary: summary.trim(), body: body.trim(), status });
    setFormError(saveError);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-3" onClick={onClose}>
      <form role="dialog" aria-modal="true" aria-label={`${initial ? 'Edit' : 'Create'} ${type === 'policy' ? 'policy' : 'support document'}`} onSubmit={(event) => void submit(event)} onClick={(event) => event.stopPropagation()} className="max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-700 bg-[#0d1016] p-5 sm:p-6">
        <div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold text-white">{initial ? 'Edit' : 'New'} {type === 'policy' ? 'policy' : 'support document'}</h2><p className="mt-1 text-sm text-slate-400">Content is saved in Flown’s website library.</p></div><button type="button" onClick={onClose} aria-label="Close editor" className="rounded-lg p-2 text-slate-400 hover:bg-slate-800"><X className="h-4 w-4" /></button></div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-300">Title<input required maxLength={180} value={title} onChange={(event) => { setTitle(event.target.value); if (!slugTouched) setSlug(makeSlug(event.target.value)); }} className={`${input} mt-1.5`} /></label>
          <label className="text-sm font-medium text-slate-300">URL slug<input required maxLength={100} value={slug} onChange={(event) => { setSlugTouched(true); setSlug(makeSlug(event.target.value)); }} className={`${input} mt-1.5`} /></label>
          <label className="text-sm font-medium text-slate-300 sm:col-span-2">Summary<input maxLength={500} value={summary} onChange={(event) => setSummary(event.target.value)} className={`${input} mt-1.5`} /></label>
          <label className="text-sm font-medium text-slate-300 sm:col-span-2">Document content<textarea required rows={10} value={body} onChange={(event) => setBody(event.target.value)} className={`${input} mt-1.5`} /></label>
          <label className="text-sm font-medium text-slate-300">Publication state<CustomSelect value={status} onChange={(event) => setStatus(event.target.value as ContentStatus)} className={`${input} mt-1.5`}><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></CustomSelect></label>
        </div>
        {formError && <p role="alert" className="mt-4 text-sm text-rose-300">{formError}</p>}
        <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">Cancel</button><button type="submit" disabled={saving || !title.trim() || !slug.trim()} className={button}>{saving ? 'Saving…' : <><Check className="h-4 w-4" />Save document</>}</button></div>
      </form>
    </div>
  );
};

function isWebUrl(value: string) {
  try { return ['http:', 'https:'].includes(new URL(value).protocol); }
  catch { return false; }
}

function labelStatus(value: ContentStatus) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
