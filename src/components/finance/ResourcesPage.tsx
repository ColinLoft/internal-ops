import { CustomSelect } from "../common/CustomSelect";
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Building2, Copy, ExternalLink, Plus, Search, Trash2, X } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { supabase } from '../../lib/supabase';
import { card, field } from '../work/EntityPanels';
import { useConfirm } from '../common/useConfirm';

type Resource = { id: string; title: string; category: string; body: string | null; summary?: string; audience?: string; content_format?: string; url: string | null; tags: string[] };
const CATEGORIES = [['boilerplate', 'Boilerplate language'], ['template', 'Templates'], ['directory', 'Funder directories'], ['guide', 'Guides'], ['document', 'Documents'], ['link', 'Links']] as const;

const inlineMarkup = (text: string) => text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g).map((part, index) => {
  if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>;
  if (part.startsWith('`') && part.endsWith('`')) return <code key={index} className="rounded bg-slate-100 px-1 text-slate-700">{part.slice(1, -1)}</code>;
  if (part.startsWith('*') && part.endsWith('*')) return <em key={index}>{part.slice(1, -1)}</em>;
  return part;
});

const ResourceMarkup: React.FC<{ value: string }> = ({ value }) => {
  const lines = value.split('\n');
  const blocks: React.ReactNode[] = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const content = inlineMarkup(heading[2]);
      const className = 'font-bold text-slate-800';
      blocks.push(heading[1].length === 1 ? <h3 key={index} className={`mt-4 text-base ${className}`}>{content}</h3> : <h4 key={index} className={`mt-3 text-sm ${className}`}>{content}</h4>);
      index += 1;
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) { items.push(lines[index].replace(/^\s*[-*]\s+/, '')); index += 1; }
      blocks.push(<ul key={`list-${index}`} className="my-2 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-700">{items.map((item, itemIndex) => <li key={itemIndex}>{inlineMarkup(item)}</li>)}</ul>);
      continue;
    }
    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() && !/^#{1,3}\s+/.test(lines[index]) && !/^\s*[-*]\s+/.test(lines[index])) { paragraph.push(lines[index]); index += 1; }
    blocks.push(<p key={`p-${index}`} className="my-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{inlineMarkup(paragraph.join('\n'))}</p>);
  }
  return <div>{blocks}</div>;
};

const OrgSummaryCard: React.FC = () => {
  const [id, setId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [saved, setSaved] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => { void supabase.from('grant_settings').select('id,org_summary').limit(1).maybeSingle().then(({ data, error }) => { if (error) setMsg(`Could not load the summary: ${error.message}. Run the latest migration.`); else if (data) { setId(data.id); setText(data.org_summary || ''); setSaved(data.org_summary || ''); } }); }, []);
  const save = async () => {
    const { error } = id ? await supabase.from('grant_settings').update({ org_summary: text }).eq('id', id) : await supabase.from('grant_settings').insert({ org_summary: text });
    if (error) setMsg(error.message); else { setSaved(text); setMsg('Saved. The AI and grant applications can now use this summary.'); }
  };
  return (
    <section className={`${card} space-y-2`}>
      <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900"><Building2 className="h-4 w-4 text-brand-600" />Organization summary</h2>
      <p className="text-xs text-slate-500">Mission, programs, population served, budget size, location and impact. Used by AI grant research, fit scoring and drafting, and handy to paste into applications.</p>
      <textarea rows={6} value={text} onChange={(event) => { setText(event.target.value); setMsg(''); }} placeholder="Flown's mission, programs, and impact…" className={field} />
      <div className="flex items-center gap-3"><button type="button" disabled={text === saved} onClick={() => void save()} className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Save summary</button><button type="button" onClick={() => void navigator.clipboard.writeText(text)} className="text-xs font-semibold text-slate-500">Copy</button>{msg && <span role="status" className="text-xs text-slate-500">{msg}</span>}</div>
    </section>
  );
};

export const ResourcesPage: React.FC = () => {
  const { currentUser } = useWorkspace();
  const [rows, setRows] = useState<Resource[]>([]);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [editing, setEditing] = useState<Resource | 'new' | null>(null);
  const [copied, setCopied] = useState('');

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase.from('grant_resources').select('*').order('category').order('title');
    if (loadError) setError(`Resources could not be loaded: ${loadError.message}. Run the latest database migration.`); else { setError(''); setRows((data || []) as Resource[]); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const shown = useMemo(() => rows.filter((row) => (category === 'all' || row.category === category) && `${row.title} ${row.summary || ''} ${row.audience || ''} ${row.body || ''} ${row.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase())), [rows, category, query]);
  const copy = async (row: Resource) => { await navigator.clipboard.writeText(row.body || row.url || ''); setCopied(row.id); setTimeout(() => setCopied(''), 1500); };

  return (
    <main className="min-w-0 flex-1 overflow-y-auto bg-[#f7f9fc]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4 sm:px-8">
        <div><h1 className="text-xl font-bold text-slate-900">Grant Resources</h1><p className="mt-1 text-xs text-slate-500">Reusable narratives, templates, guides and reference documents. Saved resources inform grant search, fit scoring and drafting.</p></div>
        <button type="button" onClick={() => setEditing('new')} className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-brand-600 px-3 text-xs font-bold text-white md:min-h-0 md:py-2"><Plus className="h-3.5 w-3.5" />Add resource</button>
      </header>
      <div className="space-y-4 p-5 sm:p-8">
        <OrgSummaryCard />
        {error && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{error}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:max-w-xs"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search resources" className={`${field} pl-9`} /></div>
          <CustomSelect value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Category" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-base md:text-xs"><option value="all">All categories</option>{CATEGORIES.map(([value, name]) => <option key={value} value={value}>{name}</option>)}</CustomSelect>
        </div>
        {shown.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{shown.map((row) => (
          <article key={row.id} className={card}>
            <p className="text-xs font-semibold uppercase text-brand-600">{CATEGORIES.find(([value]) => value === row.category)?.[1]}</p>
            <h3 className="text-sm font-bold text-slate-900">{row.title}</h3>
            {row.summary && <p className="mt-1 text-xs text-slate-500">{row.summary}</p>}
            {row.body && <details className="mt-2"><summary className="cursor-pointer text-xs font-semibold text-slate-600">Read resource</summary><div className="mt-2 max-h-80 overflow-y-auto">{<ResourceMarkup value={row.body} />}</div></details>}
            {row.audience && <p className="mt-2 text-xs text-slate-500"><span className="font-semibold">For:</span> {row.audience}</p>}
            {row.tags.length > 0 && <p className="mt-2 text-xs text-slate-400">{row.tags.map((tag) => `#${tag}`).join(' ')}</p>}
            <div className="mt-3 flex items-center gap-3 text-xs font-bold">
              {(row.body || row.url) && <button type="button" onClick={() => void copy(row)} className="inline-flex items-center gap-1 text-slate-600 hover:text-brand-600"><Copy className="h-3 w-3" />{copied === row.id ? 'Copied' : 'Copy'}</button>}
              {row.url && /^https?:\/\//i.test(row.url) && <a href={row.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand-600"><ExternalLink className="h-3 w-3" />Open</a>}
              <button type="button" onClick={() => setEditing(row)} className="ml-auto text-slate-500 hover:text-brand-600">Edit</button>
            </div>
          </article>
        ))}</div> : <div className="rounded-xl border border-dashed border-slate-200 bg-white p-10 text-center text-xs text-slate-500">No resources yet. Save your mission statement, organizational history, standard budget language and favorite funder directories here.</div>}
      </div>
      {editing && <ResourceModal resource={editing === 'new' ? null : editing} userId={currentUser.id} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />}
    </main>
  );
};

const ResourceModal: React.FC<{ resource: Resource | null; userId: string; onClose: () => void; onSaved: () => void }> = ({ resource, userId, onClose, onSaved }) => {
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [form, setForm] = useState({ title: resource?.title || '', category: resource?.category || 'boilerplate', summary: resource?.summary || '', audience: resource?.audience || '', body: resource?.body || '', url: resource?.url || '', tags: (resource?.tags || []).join(', ') });
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [error, setError] = useState('');
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const insertFormat = (prefix: string, suffix = '') => {
    const input = bodyRef.current;
    if (!input) return;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const selected = form.body.slice(start, end) || 'text';
    const next = `${form.body.slice(0, start)}${prefix}${selected}${suffix}${form.body.slice(end)}`;
    setForm((current) => ({ ...current, body: next }));
    requestAnimationFrame(() => { input.focus(); input.setSelectionRange(start + prefix.length, start + prefix.length + selected.length); });
  };
  const save = async () => {
    if (!form.title.trim()) { setError('A title is required.'); return; }
    const payload = { title: form.title.trim(), category: form.category, summary: form.summary.trim(), audience: form.audience.trim(), content_format: 'markdown', body: form.body.trim() || null, url: form.url.trim() || null, tags: form.tags.split(',').map((tag) => tag.trim().toLowerCase()).filter(Boolean), updated_at: new Date().toISOString() };
    const { error: saveError } = resource ? await supabase.from('grant_resources').update(payload).eq('id', resource.id) : await supabase.from('grant_resources').insert({ ...payload, created_by: userId });
    if (saveError) setError(saveError.message); else onSaved();
  };
  const remove = async () => { if (!resource || !await confirm({ title: `Delete “${resource.title}”?`, message: 'This resource will be removed from the grant library.', confirmLabel: 'Delete' })) return; const { error: deleteError } = await supabase.from('grant_resources').delete().eq('id', resource.id); if (deleteError) setError(deleteError.message); else onSaved(); };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-label="Resource">
      <div className="max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between"><h2 className="text-base font-bold text-slate-900">{resource ? 'Edit resource' : 'Add resource'}</h2><button type="button" aria-label="Close" onClick={onClose}><X className="h-4 w-4" /></button></div>
        <div className="space-y-2">
          {error && <p role="alert" className="rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{error}</p>}
          <input autoFocus value={form.title} onChange={set('title')} placeholder="Title" className={field} />
          <CustomSelect value={form.category} onChange={set('category')} aria-label="Category" className={field}>{CATEGORIES.map(([value, name]) => <option key={value} value={value}>{name}</option>)}</CustomSelect>
          <input value={form.summary} onChange={set('summary')} placeholder="Short summary for search and AI context" className={field} />
          <input value={form.audience} onChange={set('audience')} placeholder="Relevant programs, audiences or use cases" className={field} />
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <div className="mb-1 flex flex-wrap gap-1">
                <button type="button" onClick={() => insertFormat('# ')} className="rounded border border-slate-200 px-2 py-1 text-xs font-bold">Heading</button>
                <button type="button" onClick={() => insertFormat('**', '**')} className="rounded border border-slate-200 px-2 py-1 text-xs font-bold">Bold</button>
                <button type="button" onClick={() => insertFormat('*', '*')} className="rounded border border-slate-200 px-2 py-1 text-xs italic">Italic</button>
                <button type="button" onClick={() => insertFormat('- ')} className="rounded border border-slate-200 px-2 py-1 text-xs">Bullet</button>
              </div>
              <textarea ref={bodyRef} value={form.body} onChange={set('body')} rows={18} placeholder="Add complete reusable text. Use headings, paragraphs, bold emphasis and bullets to organize it." className={`${field} min-h-[24rem]`} />
              <p className="mt-1 text-xs text-slate-400">Formatting uses Markdown. Saved text is available as full context to grant research and drafting.</p>
            </div>
            <div className="min-h-64 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="mb-2 text-xs font-semibold text-slate-500">Preview</p>
              {form.body ? <ResourceMarkup value={form.body} /> : <p className="text-sm text-slate-400">Formatted resource preview</p>}
            </div>
          </div>
          <input value={form.url} onChange={set('url')} placeholder="Link (optional)" className={field} />
          <input value={form.tags} onChange={set('tags')} placeholder="Tags, comma separated" className={field} />
          <div className="flex items-center justify-between pt-1">{resource ? <button type="button" onClick={() => void remove()} className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600"><Trash2 className="h-3.5 w-3.5" />Delete</button> : <span />}<div className="flex gap-2"><button type="button" onClick={onClose} className="px-3 py-2 text-xs font-semibold text-slate-500">Cancel</button><button type="button" onClick={() => void save()} className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-bold text-white">Save</button></div></div>
        </div>
      </div>
      {confirmDialog}
    </div>
  );
};
