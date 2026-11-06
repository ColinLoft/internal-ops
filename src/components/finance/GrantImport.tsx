import { CustomSelect } from "../common/CustomSelect";
import React, { useMemo, useState } from 'react';
import { Upload, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { field } from '../work/EntityPanels';
import { Grant } from './grantShared';

const FIELDS = [
  ['name', 'Grant name', ['grant name', 'grant', 'name', 'program', 'title', 'project']],
  ['funder_name', 'Funder', ['funder', 'foundation', 'organization', 'organisation', 'source', 'grantor', 'sponsor', 'agency']],
  ['amount_awarded', 'Amount awarded', ['awarded', 'amount awarded', 'award amount', 'award', 'amount', 'total', 'value', 'grant amount']],
  ['amount_requested', 'Amount requested', ['requested', 'amount requested', 'ask']],
  ['in_kind_awarded', 'Product / in-kind', ['in-kind', 'in kind', 'product', 'items', 'goods']],
  ['award_date', 'Award date', ['award date', 'date awarded', 'awarded on', 'date']],
  ['term_start', 'Term start', ['start', 'term start', 'start date', 'begin']],
  ['term_end', 'Term end', ['end', 'term end', 'end date', 'expires', 'expiration']],
  ['stage', 'Status', ['status', 'stage', 'state']],
  ['contact_name', 'Contact name', ['contact', 'contact name', 'poc', 'point of contact', 'program officer']],
  ['contact_email', 'Contact email', ['email', 'contact email', 'e-mail']],
  ['contact_phone', 'Contact phone', ['phone', 'contact phone']],
  ['website_url', 'Website', ['website', 'url', 'link', 'site']],
  ['notes', 'Notes', ['notes', 'comments', 'description', 'details']],
] as const;
type FieldKey = typeof FIELDS[number][0];

export const parseTable = (text: string): string[][] => {
  const delimiter = text.split('\n', 1)[0].includes('\t') ? '\t' : ',';
  const rows: string[][] = [];
  let row: string[] = []; let cell = ''; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i += 1; } else if (char === '"') quoted = false; else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === delimiter) { row.push(cell); cell = ''; }
    else if (char === '\n' || char === '\r') { if (char === '\r' && text[i + 1] === '\n') i += 1; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
};

const toDate = (value: string) => {
  const text = value.trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
};
const toMoney = (value: string) => { const n = Number(value.replace(/[^0-9.-]/g, '')); return value.trim() && Number.isFinite(n) ? n : null; };
const toStage = (value: string, fallback: string) => {
  const text = value.toLowerCase();
  if (!text.trim()) return fallback;
  if (/declin|reject|denied|closed|complete|ended/.test(text)) return 'closed';
  if (/report/.test(text)) return 'reporting';
  if (/appl|submit|pending|review/.test(text)) return 'applied';
  if (/prospect|research|plan/.test(text)) return 'prospect';
  return 'awarded';
};
const esc = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;');

export const GrantImport: React.FC<{ userId: string; existing: Grant[]; onClose: () => void; onDone: () => void }> = ({ userId, existing, onClose, onDone }) => {
  const [table, setTable] = useState<string[][]>([]);
  const [map, setMap] = useState<Partial<Record<FieldKey, number>>>({});
  const [fallback, setFallback] = useState('awarded');
  const [type, setType] = useState('money');
  const [paste, setPaste] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = (text: string) => {
    const rows = parseTable(text);
    if (rows.length < 2) { setError('Could not find a header row and at least one grant.'); return; }
    setError(''); setTable(rows);
    const headers = rows[0].map((h) => h.trim().toLowerCase());
    const next: Partial<Record<FieldKey, number>> = {};
    const used = new Set<number>();
    FIELDS.forEach(([key, , synonyms]) => {
      let index = headers.findIndex((h, i) => !used.has(i) && synonyms.includes(h as never));
      if (index < 0) index = headers.findIndex((h, i) => !used.has(i) && synonyms.some((s) => h.includes(s)));
      if (index >= 0) { next[key] = index; used.add(index); }
    });
    setMap(next);
  };
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (/\.xlsx?$/i.test(file.name)) { setError('In Google Sheets choose File → Download → Comma-separated values (.csv), then upload that file.'); return; }
    load(await file.text());
  };

  const items = useMemo(() => {
    if (table.length < 2) return [];
    const mapped = new Set(Object.values(map));
    const known = new Set(existing.map((g) => `${g.name}|${g.funder_name || ''}`.toLowerCase()));
    return table.slice(1).map((cells) => {
      const get = (key: FieldKey) => (map[key] == null ? '' : (cells[map[key] as number] || '').trim());
      const extra = table[0].map((header, i) => (!mapped.has(i) && (cells[i] || '').trim() ? `<strong>${esc(header)}:</strong> ${esc(cells[i].trim())}` : '')).filter(Boolean);
      const notes = [get('notes') && `<p>${esc(get('notes'))}</p>`, extra.length && `<p>${extra.join('<br>')}</p>`].filter(Boolean).join('');
      const name = get('name');
      const awarded = toMoney(get('amount_awarded'));
      const stage = toStage(get('stage'), fallback);
      return {
        dupe: known.has(`${name}|${get('funder_name')}`.toLowerCase()),
        row: {
          name, funder_name: get('funder_name') || null, stage, grant_type: type === 'money' && get('in_kind_awarded') ? (awarded ? 'both' : 'product') : type,
          amount_awarded: awarded, amount_requested: toMoney(get('amount_requested')) ?? (['awarded', 'reporting', 'closed'].includes(stage) ? awarded : null),
          in_kind_awarded: get('in_kind_awarded') || null, award_date: toDate(get('award_date')), term_start: toDate(get('term_start')), term_end: toDate(get('term_end')),
          contact_name: get('contact_name') || null, contact_email: get('contact_email').toLowerCase() || null, contact_phone: get('contact_phone') || null,
          website_url: /^https?:\/\//i.test(get('website_url')) ? get('website_url') : null, notes: notes || null, source: 'Imported', owner_id: userId, created_by: userId,
        },
      };
    }).filter((item) => item.row.name);
  }, [table, map, fallback, type, existing, userId]);
  const fresh = items.filter((item) => !item.dupe);

  const submit = async () => {
    setBusy(true); setError('');
    const { error: insertError } = await supabase.from('grants').insert(fresh.map((item) => item.row));
    setBusy(false);
    if (insertError) setError(insertError.message); else { onDone(); onClose(); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-label="Import grants">
      <div className="max-h-[92vh] w-full max-w-2xl space-y-3 overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between"><h2 className="text-base font-bold text-slate-900">Import existing grants</h2><button type="button" aria-label="Close" onClick={onClose}><X className="h-4 w-4" /></button></div>
        {error && <p role="alert" className="rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{error}</p>}
        {!table.length ? (
          <>
            <p className="text-xs text-slate-500">In Google Sheets use File → Download → CSV and upload it, or copy the cells and paste them below. The first row must be column headers; columns are matched automatically.</p>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 p-6 text-xs font-bold text-brand-700"><Upload className="h-4 w-4" />Choose CSV file<input type="file" accept=".csv,.tsv,.txt" className="sr-only" onChange={(event) => void onFile(event.target.files?.[0])} /></label>
            <textarea rows={5} value={paste} onChange={(event) => setPaste(event.target.value)} placeholder="…or paste rows copied from your sheet" className={field} />
            <button type="button" disabled={!paste.trim()} onClick={() => load(paste)} className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Continue</button>
          </>
        ) : (
          <>
            <p className="text-xs text-slate-500">Check the matched columns. Anything not matched is saved in each grant's notes so no data is lost.</p>
            <div className="grid gap-2 sm:grid-cols-2">{FIELDS.map(([key, name]) => (
              <label key={key} className="text-xs font-semibold text-slate-500">{name}
                <CustomSelect value={map[key] ?? ''} onChange={(event) => setMap({ ...map, [key]: event.target.value === '' ? undefined : Number(event.target.value) })} className={field}><option value="">— none —</option>{table[0].map((header, i) => <option key={i} value={i}>{header || `Column ${i + 1}`}</option>)}</CustomSelect>
              </label>
            ))}</div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs font-semibold text-slate-500">Status when the sheet has none<CustomSelect value={fallback} onChange={(event) => setFallback(event.target.value)} className={field}><option value="awarded">Awarded</option><option value="reporting">Reporting</option><option value="closed">Closed</option></CustomSelect></label>
              <label className="text-xs font-semibold text-slate-500">Grant type<CustomSelect value={type} onChange={(event) => setType(event.target.value)} className={field}><option value="money">Money</option><option value="product">Product / in-kind</option><option value="both">Money + product</option></CustomSelect></label>
            </div>
            <p className="rounded-lg bg-slate-50 p-2 text-xs text-slate-600">{fresh.length} grant{fresh.length === 1 ? '' : 's'} will be added{items.length - fresh.length ? `; ${items.length - fresh.length} already exist and will be skipped` : ''}. {fresh[0] ? `First: ${fresh[0].row.name}${fresh[0].row.funder_name ? ` (${fresh[0].row.funder_name})` : ''}` : 'Map a Grant name column to continue.'}</p>
            <div className="flex justify-end gap-2"><button type="button" onClick={() => setTable([])} className="px-3 py-2 text-xs font-semibold text-slate-500">Back</button><button type="button" disabled={busy || !fresh.length} onClick={() => void submit()} className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{busy ? 'Importing…' : `Import ${fresh.length}`}</button></div>
          </>
        )}
      </div>
    </div>
  );
};
