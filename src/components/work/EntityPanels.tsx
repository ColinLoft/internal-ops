import { userFacingError } from '../../lib/userFacingError';
import { CustomSelect } from "../common/CustomSelect";
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Clock, ExternalLink, FileText, Link2, Loader2, Paperclip, Play, Plus, Square, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useWorkspace } from '../../context/WorkspaceContext';

export type EntityType = 'project' | 'task' | 'grant';
type Props = { entityType: EntityType; entityId: string; onChanged?: () => void };

export const field = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-base outline-none focus:border-brand-400 md:text-xs';
export const card = 'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm';
const button = 'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3 text-xs font-bold text-white disabled:opacity-50 md:min-h-0 md:py-2';

export const logActivity = (entityType: EntityType, entityId: string, action: string, detail?: string) =>
  supabase.from('entity_activity').insert({ entity_type: entityType, entity_id: entityId, action, detail: detail || null }).then(({ error }) => { if (error) console.error(error.message); });

export const formatDateTime = (value: string) => new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
export const formatMinutes = (minutes: number) => `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;

const useRows = <T,>(table: string, entityType: EntityType, entityId: string, order = 'created_at', ascending = false) => {
  const [rows, setRows] = useState<T[]>([]);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    const { data, error: queryError } = await supabase.from(table).select('*').eq('entity_type', entityType).eq('entity_id', entityId).order(order, { ascending }).limit(500);
    if (queryError) setError(queryError.message); else { setError(''); setRows((data || []) as T[]); }
  }, [table, entityType, entityId, order, ascending]);
  useEffect(() => { void load(); }, [load]);
  return { rows, error, load };
};

const Title: React.FC<{ icon: React.ElementType; children: React.ReactNode; right?: React.ReactNode }> = ({ icon: Icon, children, right }) => (
  <div className="mb-3 flex items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-sm font-bold text-slate-900"><Icon className="h-4 w-4 text-brand-600" />{children}</h3>{right}</div>
);

export const CommentsPanel: React.FC<Props> = ({ entityType, entityId, onChanged }) => {
  const { users } = useWorkspace();
  const { rows, error, load } = useRows<{ id: string; body: string; created_by: string; created_at: string }>('entity_comments', entityType, entityId);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const post = async () => {
    if (!body.trim()) return;
    setBusy(true);
    const { error: insertError } = await supabase.from('entity_comments').insert({ entity_type: entityType, entity_id: entityId, body: body.trim() });
    setBusy(false);
    if (insertError) { setMessage(insertError.message); return; }
    setBody(''); setMessage('');
    void logActivity(entityType, entityId, 'commented');
    await load(); onChanged?.();
  };
  const remove = async (id: string) => { await supabase.from('entity_comments').delete().eq('id', id); await load(); };
  return (
    <section className={card}>
      <Title icon={FileText}>Discussion ({rows.length})</Title>
      {(error || message) && <p role="alert" className="mb-2 rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{error || message}</p>}
      <div className="flex gap-2"><textarea value={body} onChange={(event) => setBody(event.target.value)} rows={2} placeholder="Add a comment or update…" className={field} /><button type="button" disabled={busy || !body.trim()} onClick={() => void post()} className={button}>Post</button></div>
      <ul className="mt-3 space-y-3">
        {rows.map((row) => (
          <li key={row.id} className="rounded-xl bg-slate-50 p-3 text-xs">
            <div className="flex items-center justify-between text-slate-500"><span className="font-bold text-slate-700">{users.find((user) => user.id === row.created_by)?.name || 'Unknown'}</span><span>{formatDateTime(row.created_at)} <button type="button" onClick={() => void remove(row.id)} aria-label="Delete comment" className="ml-1 text-slate-400 hover:text-rose-600"><Trash2 className="inline h-3 w-3" /></button></span></div>
            <p className="mt-1 whitespace-pre-wrap text-slate-700">{row.body}</p>
          </li>
        ))}
        {!rows.length && <li className="text-xs text-slate-400">No comments yet.</li>}
      </ul>
    </section>
  );
};

export const ActivityPanel: React.FC<Props> = ({ entityType, entityId }) => {
  const { users } = useWorkspace();
  const { rows, error } = useRows<{ id: string; action: string; detail: string | null; created_by: string | null; created_at: string }>('entity_activity', entityType, entityId);
  return (
    <section className={card}>
      <Title icon={Clock}>Activity log</Title>
      {error && <p className="mb-2 text-xs text-rose-700">{userFacingError(error)}</p>}
      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.id} className="flex gap-2 text-xs"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" /><div><p className="text-slate-700"><span className="font-bold">{users.find((user) => user.id === row.created_by)?.name || 'System'}</span> {row.action}{row.detail ? <span className="text-slate-500"> — {row.detail}</span> : null}</p><p className="text-slate-400">{formatDateTime(row.created_at)}</p></div></li>
        ))}
        {!rows.length && <li className="text-xs text-slate-400">Nothing logged yet.</li>}
      </ul>
    </section>
  );
};

type TimeRow = { id: string; minutes: number; note: string | null; entry_date: string; created_by: string; created_at: string };
export const useTotalMinutes = (entityType: EntityType, entityId: string) => {
  const { rows } = useRows<TimeRow>('entity_time_entries', entityType, entityId);
  return rows.reduce((total, row) => total + row.minutes, 0);
};

export const TimePanel: React.FC<Props> = ({ entityType, entityId, onChanged }) => {
  const { users, currentUser } = useWorkspace();
  const { rows, error, load } = useRows<TimeRow>('entity_time_entries', entityType, entityId, 'entry_date');
  const timerKey = `work-timer:${currentUser.id}:${entityType}:${entityId}`;
  const [startedAt, setStartedAt] = useState<number | null>(() => Number(localStorage.getItem(timerKey)) || null);
  const [now, setNow] = useState(Date.now());
  const [hours, setHours] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!startedAt) return undefined;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);

  const add = async (minutes: number, entryNote: string, entryDate: string) => {
    if (!Number.isFinite(minutes) || minutes < 1) { setMessage('Enter at least one minute.'); return false; }
    const { error: insertError } = await supabase.from('entity_time_entries').insert({ entity_type: entityType, entity_id: entityId, minutes: Math.min(1440, Math.round(minutes)), note: entryNote.trim() || null, entry_date: entryDate });
    if (insertError) { setMessage(insertError.message); return false; }
    setMessage('');
    void logActivity(entityType, entityId, 'logged time', formatMinutes(Math.round(minutes)) + (entryNote.trim() ? ` · ${entryNote.trim()}` : ''));
    await load(); onChanged?.();
    return true;
  };
  const start = () => { const time = Date.now(); localStorage.setItem(timerKey, String(time)); setStartedAt(time); setNow(time); };
  const stop = async () => {
    if (!startedAt) return;
    const minutes = Math.max(1, Math.round((Date.now() - startedAt) / 60000));
    if (await add(minutes, note, new Date().toISOString().slice(0, 10))) { localStorage.removeItem(timerKey); setStartedAt(null); setNote(''); }
  };
  const total = rows.reduce((sum, row) => sum + row.minutes, 0);
  const elapsed = startedAt ? Math.floor((now - startedAt) / 1000) : 0;
  const perUser = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((row) => map.set(row.created_by, (map.get(row.created_by) || 0) + row.minutes));
    return [...map.entries()];
  }, [rows]);

  return (
    <section className={card}>
      <Title icon={Clock} right={<span className="text-xs font-bold text-slate-600">{formatMinutes(total)} logged</span>}>Time log</Title>
      {(error || message) && <p role="alert" className="mb-2 rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{error || message}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {startedAt ? (
          <button type="button" onClick={() => void stop()} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-rose-600 px-3 text-xs font-bold text-white md:min-h-0 md:py-2"><Square className="h-3.5 w-3.5" />Stop {String(Math.floor(elapsed / 3600)).padStart(2, '0')}:{String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0')}:{String(elapsed % 60).padStart(2, '0')}</button>
        ) : (
          <button type="button" onClick={start} className={button}><Play className="h-3.5 w-3.5" />Start timer</button>
        )}
        <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="What did you work on?" className={`${field} min-w-0 flex-1`} aria-label="Time note" />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input type="number" min="0" step="0.25" value={hours} onChange={(event) => setHours(event.target.value)} placeholder="Hours" className={`${field} w-24`} aria-label="Hours" />
        <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className={`${field} w-40`} aria-label="Date" />
        <button type="button" onClick={() => void add(Number(hours) * 60, note, date).then((ok) => { if (ok) { setHours(''); setNote(''); } })} className={button}><Plus className="h-3.5 w-3.5" />Add entry</button>
      </div>
      {perUser.length > 1 && <p className="mt-3 text-xs text-slate-500">{perUser.map(([id, minutes]) => `${users.find((user) => user.id === id)?.name || 'Unknown'}: ${formatMinutes(minutes)}`).join(' · ')}</p>}
      <ul className="mt-3 divide-y divide-slate-100">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center justify-between gap-2 py-2 text-xs"><div className="min-w-0"><p className="truncate text-slate-700">{row.note || 'Time entry'}</p><p className="text-slate-400">{users.find((user) => user.id === row.created_by)?.name || 'Unknown'} · {row.entry_date}</p></div><div className="flex items-center gap-2"><span className="font-bold text-slate-700">{formatMinutes(row.minutes)}</span>{row.created_by === currentUser.id && <button type="button" aria-label="Delete entry" onClick={() => void supabase.from('entity_time_entries').delete().eq('id', row.id).then(() => { void load(); onChanged?.(); })} className="text-slate-400 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>}</div></li>
        ))}
        {!rows.length && <li className="py-2 text-xs text-slate-400">No time logged yet.</li>}
      </ul>
    </section>
  );
};

type AttachmentRow = { id: string; name: string; storage_path: string; mime_type: string | null; size_bytes: number | null; created_by: string; created_at: string };
export const AttachmentsPanel: React.FC<Props> = ({ entityType, entityId }) => {
  const { currentUser } = useWorkspace();
  const { rows, error, load } = useRows<AttachmentRow>('entity_attachments', entityType, entityId);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const missing = rows.filter((row) => !urls[row.id]);
    if (!missing.length) return;
    let active = true;
    void supabase.storage.from('work-files').createSignedUrls(missing.map((row) => row.storage_path), 3600).then(({ data }) => {
      if (!active || !data) return;
      setUrls((current) => {
        const next = { ...current };
        data.forEach((item, index) => { if (item.signedUrl) next[missing[index].id] = item.signedUrl; });
        return next;
      });
    });
    return () => { active = false; };
  }, [rows, urls]);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true); setMessage('');
    for (const file of Array.from(files)) {
      if (file.size > 25 * 1024 * 1024) { setMessage(`${file.name} is larger than 25 MB.`); continue; }
      const path = `${currentUser.id}/${entityType}/${entityId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\- ]+/g, '_')}`;
      const { error: uploadError } = await supabase.storage.from('work-files').upload(path, file, { contentType: file.type || undefined });
      if (uploadError) { setMessage(uploadError.message); continue; }
      const { error: insertError } = await supabase.from('entity_attachments').insert({ entity_type: entityType, entity_id: entityId, name: file.name, storage_path: path, mime_type: file.type || null, size_bytes: file.size });
      if (insertError) { setMessage(insertError.message); await supabase.storage.from('work-files').remove([path]); continue; }
      void logActivity(entityType, entityId, 'attached a file', file.name);
    }
    setBusy(false);
    if (input.current) input.current.value = '';
    await load();
  };
  const remove = async (row: AttachmentRow) => {
    await supabase.storage.from('work-files').remove([row.storage_path]);
    await supabase.from('entity_attachments').delete().eq('id', row.id);
    await load();
  };
  return (
    <section className={card}>
      <Title icon={Paperclip} right={<button type="button" onClick={() => input.current?.click()} disabled={busy} className={button}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}Add files</button>}>Files & images ({rows.length})</Title>
      <input ref={input} type="file" multiple className="hidden" onChange={(event) => void upload(event.target.files)} />
      {(error || message) && <p role="alert" className="mb-2 rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{error || message}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.id} className="overflow-hidden rounded-xl border border-slate-200">
            {row.mime_type?.startsWith('image/') && urls[row.id] ? <a href={urls[row.id]} target="_blank" rel="noreferrer"><img src={urls[row.id]} alt={row.name} className="h-32 w-full object-cover" /></a> : <div className="flex h-16 items-center justify-center bg-slate-50 text-slate-400"><FileText className="h-6 w-6" /></div>}
            <div className="flex items-center justify-between gap-2 p-2 text-xs"><a href={urls[row.id]} target="_blank" rel="noreferrer" className="truncate font-semibold text-slate-700 hover:text-brand-600">{row.name}</a>{(row.created_by === currentUser.id) && <button type="button" aria-label="Remove file" onClick={() => void remove(row)} className="text-slate-400 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>}</div>
          </div>
        ))}
      </div>
      {!rows.length && <p className="text-xs text-slate-400">No files yet. Add screenshots, photos or documents.</p>}
    </section>
  );
};

type LinkRow = { id: string; link_type: string; target_id: string | null; label: string; url: string | null };
export const LinksPanel: React.FC<Props> = ({ entityType, entityId }) => {
  const { rows, error, load } = useRows<LinkRow>('entity_links', entityType, entityId);
  const [kind, setKind] = useState<'calendar' | 'url'>('url');
  const [options, setOptions] = useState<{ id: string; label: string }[]>([]);
  const [selected, setSelected] = useState('');
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    setSelected('');
    if (kind === 'url') { setOptions([]); return; }
    let active = true;
    const request = supabase.from('calendar_events').select('id,title,date').order('date', { ascending: false }).limit(100);
    void request.then(({ data, error: queryError }) => {
      if (!active) return;
      if (queryError) { setMessage(queryError.message); setOptions([]); return; }
      setOptions(((data || []) as Record<string, string>[]).map((row) => ({ id: row.id, label: `${row.title} · ${row.date}` })));
    });
    return () => { active = false; };
  }, [kind]);

  const add = async () => {
    const chosen = options.find((option) => option.id === selected);
    if (kind === 'url' && !/^https?:\/\//i.test(url.trim())) { setMessage('Enter a link starting with https://'); return; }
    if (kind !== 'url' && !chosen) { setMessage('Choose an item.'); return; }
    const { error: insertError } = await supabase.from('entity_links').insert({
      entity_type: entityType, entity_id: entityId, link_type: kind,
      target_id: chosen?.id ?? null, label: kind === 'url' ? (label.trim() || url.trim()) : (chosen?.label || ''), url: kind === 'url' ? url.trim() : null,
    });
    if (insertError) { setMessage(insertError.message); return; }
    setMessage(''); setUrl(''); setLabel(''); setSelected('');
    void logActivity(entityType, entityId, 'linked', kind === 'url' ? (label || url) : chosen?.label);
    await load();
  };
  const open = async (row: LinkRow) => {
    setMessage('');
    if (row.url) { window.open(row.url, '_blank', 'noopener,noreferrer'); return; }
    if (row.link_type === 'drive') {
      const { data: item, error: lookupError } = await supabase.from('drive_items').select('name,storage_path,content').eq('id', row.target_id).single();
      if (lookupError) { setMessage(`Archived attachment could not be loaded: ${lookupError.message}`); return; }
      let href: string;
      let temporary = false;
      if (item.storage_path) {
        const { data, error: urlError } = await supabase.storage.from('drive-files').createSignedUrl(item.storage_path, 60);
        if (urlError) { setMessage(urlError.message); return; }
        href = data.signedUrl;
      } else {
        href = URL.createObjectURL(new Blob([JSON.stringify(item.content, null, 2)], { type: 'application/json' }));
        temporary = true;
      }
      const link = document.createElement('a');
      link.href = href;
      link.download = temporary ? `${item.name}.json` : item.name;
      link.rel = 'noopener noreferrer';
      link.click();
      if (temporary) window.setTimeout(() => URL.revokeObjectURL(href), 1000);
      return;
    }
    window.history.pushState({}, '', '/calendar');
    window.dispatchEvent(new PopStateEvent('popstate'));
  };
  return (
    <section className={card}>
      <Title icon={Link2}>Linked items</Title>
      {(error || message) && <p role="alert" className="mb-2 rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{error || message}</p>}
      <div className="flex flex-wrap gap-2">
        <CustomSelect value={kind} onChange={(event) => setKind(event.target.value as typeof kind)} className={`${field} w-36`} aria-label="Link type"><option value="calendar">Calendar event</option><option value="url">External document or web link</option></CustomSelect>
        {kind === 'url' ? (<><input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://…" className={`${field} min-w-0 flex-1`} /><input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Label (optional)" className={`${field} w-40`} /></>) : (
          <CustomSelect value={selected} onChange={(event) => setSelected(event.target.value)} className={`${field} min-w-0 flex-1`} aria-label="Item"><option value="">Choose…</option>{options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</CustomSelect>
        )}
        <button type="button" onClick={() => void add()} className={button}><Plus className="h-3.5 w-3.5" />Link</button>
      </div>
      <ul className="mt-3 space-y-1">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs"><button type="button" onClick={() => void open(row)} className="flex min-w-0 items-center gap-2 text-left font-semibold text-slate-700 hover:text-brand-600"><ExternalLink className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{row.label}</span><span className="text-slate-400">{row.link_type === 'drive' ? 'Download archived source' : row.link_type}</span></button><button type="button" aria-label="Remove link" onClick={() => void supabase.from('entity_links').delete().eq('id', row.id).then(() => load())} className="text-slate-400 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button></li>
        ))}
        {!rows.length && <li className="text-xs text-slate-400">Nothing linked yet.</li>}
      </ul>
    </section>
  );
};

type CheckRow = { id: string; text: string; done: boolean; position: number };
export const ChecklistPanel: React.FC<Props> = ({ entityType, entityId }) => {
  const { rows, error, load } = useRows<CheckRow>('entity_checklist', entityType, entityId, 'position', true);
  const [text, setText] = useState('');
  const add = async () => {
    if (!text.trim()) return;
    await supabase.from('entity_checklist').insert({ entity_type: entityType, entity_id: entityId, text: text.trim(), position: rows.length });
    setText(''); await load();
  };
  const done = rows.filter((row) => row.done).length;
  return (
    <section className={card}>
      <Title icon={Check} right={<span className="text-xs text-slate-500">{done}/{rows.length}</span>}>Checklist</Title>
      {error && <p className="mb-2 text-xs text-rose-700">{userFacingError(error)}</p>}
      <ul className="space-y-1">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={row.done} onChange={() => void supabase.from('entity_checklist').update({ done: !row.done }).eq('id', row.id).then(() => load())} className="h-4 w-4" /><span className={row.done ? 'text-slate-400 line-through' : 'text-slate-700'}>{row.text}</span><button type="button" aria-label="Remove item" onClick={() => void supabase.from('entity_checklist').delete().eq('id', row.id).then(() => load())} className="ml-auto text-slate-300 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button></li>
        ))}
      </ul>
      <div className="mt-2 flex gap-2"><input value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void add(); }} placeholder="Add a checklist item" className={field} /><button type="button" onClick={() => void add()} className={button}>Add</button></div>
    </section>
  );
};
