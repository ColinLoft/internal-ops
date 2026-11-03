import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { toCsv } from './sheetFormulas';

type QType = 'short_text' | 'paragraph' | 'multiple_choice' | 'checkbox' | 'dropdown' | 'scale' | 'date' | 'section';
type Question = { id: string; type: QType; label: string; description?: string; required: boolean; options: string[]; scaleMax?: number };
type Props = { itemId: string; name: string; content: Record<string, unknown>; onChange: (content: Record<string, unknown>) => void };
type ResponseRow = { id: string; submitted_at: string; answers: Record<string, unknown> };

const TYPES: Array<{ key: QType; label: string }> = [
  { key: 'short_text', label: 'Short answer' }, { key: 'paragraph', label: 'Paragraph' },
  { key: 'multiple_choice', label: 'Multiple choice' }, { key: 'checkbox', label: 'Checkboxes' },
  { key: 'dropdown', label: 'Dropdown' }, { key: 'scale', label: 'Linear scale' },
  { key: 'date', label: 'Date' }, { key: 'section', label: 'Section heading' },
];
const hasOptions = (type: QType) => type === 'multiple_choice' || type === 'checkbox' || type === 'dropdown';
const input = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-base text-slate-800 outline-none focus:border-brand-400 md:text-xs';
const iconBtn = 'flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 md:min-h-8 md:min-w-8';

const newQuestion = (type: QType = 'short_text'): Question => ({
  id: crypto.randomUUID(), type, label: type === 'section' ? 'Untitled section' : 'Untitled question', required: false,
  options: hasOptions(type) ? ['Option 1'] : [], scaleMax: type === 'scale' ? 5 : undefined,
});

const readQuestions = (content: Record<string, unknown>): Question[] => {
  const raw = Array.isArray(content.questions) ? content.questions as Array<Partial<Question>> : [];
  return raw.map((q) => ({
    id: q.id || crypto.randomUUID(), type: (TYPES.some((t) => t.key === q.type) ? q.type : 'short_text') as QType,
    label: String(q.label ?? ''), description: q.description, required: Boolean(q.required),
    options: Array.isArray(q.options) ? q.options.map(String) : [], scaleMax: q.scaleMax,
  }));
};

const QuestionField: React.FC<{ q: Question; value: unknown; onValue: (value: unknown) => void }> = ({ q, value, onValue }) => {
  if (q.type === 'short_text') return <input aria-label={q.label} className={input} value={String(value ?? '')} onChange={(e) => onValue(e.target.value)} />;
  if (q.type === 'paragraph') return <textarea aria-label={q.label} rows={3} className={input} value={String(value ?? '')} onChange={(e) => onValue(e.target.value)} />;
  if (q.type === 'date') return <input aria-label={q.label} type="date" className={input} value={String(value ?? '')} onChange={(e) => onValue(e.target.value)} />;
  if (q.type === 'dropdown') return (
    <select aria-label={q.label} className={input} value={String(value ?? '')} onChange={(e) => onValue(e.target.value)}>
      <option value="">Choose</option>{q.options.map((o, i) => <option key={i} value={o}>{o}</option>)}
    </select>
  );
  if (q.type === 'multiple_choice') return (
    <div className="space-y-1">{q.options.map((o, i) => (
      <label key={i} className="flex min-h-11 items-center gap-2 text-sm md:min-h-0 md:text-xs"><input type="radio" name={q.id} checked={value === o} onChange={() => onValue(o)} />{o}</label>
    ))}</div>
  );
  if (q.type === 'checkbox') {
    const selected = Array.isArray(value) ? value as string[] : [];
    return <div className="space-y-1">{q.options.map((o, i) => (
      <label key={i} className="flex min-h-11 items-center gap-2 text-sm md:min-h-0 md:text-xs"><input type="checkbox" checked={selected.includes(o)} onChange={(e) => onValue(e.target.checked ? [...selected, o] : selected.filter((s) => s !== o))} />{o}</label>
    ))}</div>;
  }
  if (q.type === 'scale') return (
    <div className="flex flex-wrap gap-2">{Array.from({ length: q.scaleMax ?? 5 }, (_, i) => i + 1).map((n) => (
      <button key={n} type="button" onClick={() => onValue(n)} aria-pressed={value === n} className={`flex h-11 w-11 items-center justify-center rounded-full border text-sm font-semibold md:h-8 md:w-8 md:text-xs ${value === n ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 text-slate-600'}`}>{n}</button>
    ))}</div>
  );
  return null;
};

export const FormsEditor: React.FC<Props> = ({ itemId, name, content, onChange }) => {
  const [mode, setMode] = useState<'build' | 'preview' | 'responses'>('build');
  const [title, setTitle] = useState(() => String(content.title ?? name));
  const [description, setDescription] = useState(() => String(content.description ?? ''));
  const [questions, setQuestions] = useState<Question[]>(() => readQuestions(content));
  const [accepting, setAccepting] = useState(() => (content.settings as { acceptingResponses?: boolean } | undefined)?.acceptingResponses !== false);
  const [preview, setPreview] = useState<Record<string, unknown>>({});
  const [responses, setResponses] = useState<ResponseRow[]>([]);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [loadError, setLoadError] = useState('');

  const push = (patch: { title?: string; description?: string; questions?: Question[]; accepting?: boolean }) => {
    const next = { title, description, questions, accepting, ...patch };
    onChange({ ...content, title: next.title, description: next.description, questions: next.questions, settings: { ...(content.settings as object | undefined), acceptingResponses: next.accepting } });
  };
  const setQs = (next: Question[]) => { setQuestions(next); push({ questions: next }); };
  const patchQ = (id: string, patch: Partial<Question>) => setQs(questions.map((q) => q.id === id ? { ...q, ...patch } : q));
  const move = (index: number, delta: number) => {
    const to = index + delta;
    if (to < 0 || to >= questions.length) return;
    const next = [...questions];
    [next[index], next[to]] = [next[to], next[index]];
    setQs(next);
  };

  useEffect(() => {
    if (mode !== 'responses') return;
    let cancelled = false;
    setLoadState('loading');
    supabase.from('drive_form_responses').select('id, submitted_at, answers').eq('form_item_id', itemId).order('submitted_at', { ascending: false }).limit(1000)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { setLoadState('error'); setLoadError(error.message); return; }
        setResponses((data ?? []) as ResponseRow[]);
        setLoadState('idle');
      });
    return () => { cancelled = true; };
  }, [mode, itemId]);

  const answerable = questions.filter((q) => q.type !== 'section');
  const answerText = (value: unknown) => Array.isArray(value) ? value.join('; ') : value == null ? '' : String(value);

  const exportCsv = () => {
    const rows = [['Submitted', ...answerable.map((q) => q.label)], ...responses.map((r) => [new Date(r.submitted_at).toLocaleString(), ...answerable.map((q) => answerText(r.answers[q.id]))])];
    const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = `${name.replace(/[^\w.-]+/g, '_') || 'form'}-responses.csv`; link.click();
    URL.revokeObjectURL(url);
  };

  const tab = (key: typeof mode, label: string) => (
    <button type="button" role="tab" aria-selected={mode === key} onClick={() => setMode(key)} className={`min-h-11 px-4 text-xs font-bold md:min-h-9 ${mode === key ? 'border-b-2 border-brand-600 text-brand-700' : 'text-slate-500'}`}>{label}</button>
  );

  return (
    <div className="flex h-full flex-col bg-slate-50">
      <div className="flex items-center border-b border-slate-200 bg-white px-2" role="tablist">
        {tab('build', 'Questions')}{tab('preview', 'Preview')}{tab('responses', `Responses${responses.length ? ` (${responses.length})` : ''}`)}
        <label className="ml-auto flex min-h-11 items-center gap-2 text-xs font-semibold text-slate-600 md:min-h-0">
          <input type="checkbox" checked={accepting} onChange={(e) => { setAccepting(e.target.checked); push({ accepting: e.target.checked }); }} />Accepting responses
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3 md:p-6">
        <div className="mx-auto max-w-2xl space-y-3">
          {mode !== 'responses' && (
            <div className="rounded-xl border-t-8 border-brand-600 bg-white p-4 shadow-sm">
              {mode === 'build' ? <>
                <input aria-label="Form title" value={title} onChange={(e) => { setTitle(e.target.value); push({ title: e.target.value }); }} className="w-full border-b border-slate-200 pb-1 text-xl font-bold text-slate-900 outline-none focus:border-brand-400" />
                <textarea aria-label="Form description" rows={2} value={description} placeholder="Form description" onChange={(e) => { setDescription(e.target.value); push({ description: e.target.value }); }} className="mt-2 w-full resize-none border-b border-transparent text-base text-slate-600 outline-none focus:border-brand-400 md:text-xs" />
              </> : <><h2 className="text-xl font-bold text-slate-900">{title}</h2>{description && <p className="mt-1 whitespace-pre-wrap text-xs text-slate-600">{description}</p>}</>}
            </div>
          )}

          {mode === 'build' && <>
            {questions.map((q, index) => (
              <div key={q.id} className="rounded-xl bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start gap-2">
                  <input aria-label={q.type === 'section' ? 'Section title' : 'Question text'} value={q.label} onChange={(e) => patchQ(q.id, { label: e.target.value })} className={`min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-base outline-none focus:border-brand-400 md:text-xs ${q.type === 'section' ? 'font-bold' : ''}`} />
                  <select aria-label="Question type" value={q.type} onChange={(e) => { const type = e.target.value as QType; patchQ(q.id, { type, options: hasOptions(type) && !q.options.length ? ['Option 1'] : q.options, scaleMax: type === 'scale' ? q.scaleMax ?? 5 : q.scaleMax }); }} className="min-h-11 rounded-lg border border-slate-200 bg-white px-2 text-base md:min-h-0 md:py-2 md:text-xs">
                    {TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                  </select>
                </div>
                {q.type === 'section' && <textarea aria-label="Section description" rows={2} value={q.description ?? ''} placeholder="Description (optional)" onChange={(e) => patchQ(q.id, { description: e.target.value })} className={`${input} mt-2`} />}
                {hasOptions(q.type) && (
                  <div className="mt-2 space-y-1.5">
                    {q.options.map((o, i) => (
                      <div key={i} className="flex items-center gap-1">
                        <input aria-label={`Option ${i + 1}`} value={o} onChange={(e) => patchQ(q.id, { options: q.options.map((x, j) => j === i ? e.target.value : x) })} className={input} />
                        <button type="button" aria-label={`Remove option ${i + 1}`} disabled={q.options.length === 1} onClick={() => patchQ(q.id, { options: q.options.filter((_, j) => j !== i) })} className={`${iconBtn} disabled:opacity-30`}><Trash2 className="h-4 w-4" /></button>
                      </div>
                    ))}
                    <button type="button" onClick={() => patchQ(q.id, { options: [...q.options, `Option ${q.options.length + 1}`] })} className="min-h-11 text-xs font-semibold text-brand-700 md:min-h-0">+ Add option</button>
                  </div>
                )}
                {q.type === 'scale' && (
                  <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-slate-600">Scale 1 to
                    <select value={q.scaleMax ?? 5} onChange={(e) => patchQ(q.id, { scaleMax: Number(e.target.value) })} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5">{[3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n}</option>)}</select>
                  </label>
                )}
                <div className="mt-3 flex items-center gap-1 border-t border-slate-100 pt-2">
                  {q.type !== 'section' && <label className="mr-auto flex min-h-11 items-center gap-2 text-xs font-semibold text-slate-600 md:min-h-0"><input type="checkbox" checked={q.required} onChange={(e) => patchQ(q.id, { required: e.target.checked })} />Required</label>}
                  {q.type === 'section' && <span className="mr-auto" />}
                  <button type="button" className={iconBtn} aria-label="Move up" onClick={() => move(index, -1)}><ArrowUp className="h-4 w-4" /></button>
                  <button type="button" className={iconBtn} aria-label="Move down" onClick={() => move(index, 1)}><ArrowDown className="h-4 w-4" /></button>
                  <button type="button" className={iconBtn} aria-label="Duplicate" onClick={() => setQs([...questions.slice(0, index + 1), { ...q, id: crypto.randomUUID() }, ...questions.slice(index + 1)])}><Copy className="h-4 w-4" /></button>
                  <button type="button" className={iconBtn} aria-label="Delete" onClick={() => setQs(questions.filter((x) => x.id !== q.id))}><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            ))}
            <div className="flex gap-2">
              <button type="button" onClick={() => setQs([...questions, newQuestion()])} className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 bg-white text-xs font-bold text-slate-600 hover:border-brand-400 md:min-h-9"><Plus className="h-4 w-4" />Add question</button>
              <button type="button" onClick={() => setQs([...questions, newQuestion('section')])} className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 bg-white text-xs font-bold text-slate-600 hover:border-brand-400 md:min-h-9"><Plus className="h-4 w-4" />Add section</button>
            </div>
          </>}

          {mode === 'preview' && <>
            {questions.map((q) => q.type === 'section'
              ? <div key={q.id} className="rounded-xl bg-white p-4 shadow-sm"><h3 className="text-base font-bold text-slate-900">{q.label}</h3>{q.description && <p className="mt-1 whitespace-pre-wrap text-xs text-slate-600">{q.description}</p>}</div>
              : <div key={q.id} className="rounded-xl bg-white p-4 shadow-sm"><p className="mb-2 text-sm font-semibold text-slate-800 md:text-xs">{q.label}{q.required && <span className="text-rose-600"> *</span>}</p><QuestionField q={q} value={preview[q.id]} onValue={(v) => setPreview((cur) => ({ ...cur, [q.id]: v }))} /></div>)}
            <p className="text-center text-xs text-slate-400">Preview only. Nothing you enter here is saved.</p>
          </>}

          {mode === 'responses' && (
            <div className="space-y-3">
              {loadState === 'loading' && <p className="py-10 text-center text-xs text-slate-500">Loading responses…</p>}
              {loadState === 'error' && <p className="rounded-xl bg-rose-50 p-3 text-xs text-rose-700">Could not load responses: {loadError}</p>}
              {loadState === 'idle' && responses.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 bg-white py-10 text-center text-xs text-slate-500">No responses yet.</p>}
              {loadState === 'idle' && responses.length > 0 && <>
                <div className="flex items-center justify-between rounded-xl bg-white p-4 shadow-sm">
                  <span className="text-sm font-bold text-slate-900">{responses.length} {responses.length === 1 ? 'response' : 'responses'}</span>
                  <button type="button" onClick={exportCsv} className="min-h-11 rounded-lg bg-brand-600 px-3 text-xs font-bold text-white md:min-h-8">Export CSV</button>
                </div>
                {answerable.map((q) => {
                  const values = responses.map((r) => r.answers[q.id]).filter((v) => v !== undefined && v !== '' && !(Array.isArray(v) && !v.length));
                  const choice = hasOptions(q.type) || q.type === 'scale';
                  const counts = new Map<string, number>();
                  if (choice) values.flatMap((v) => Array.isArray(v) ? v : [v]).forEach((v) => counts.set(String(v), (counts.get(String(v)) ?? 0) + 1));
                  return (
                    <div key={q.id} className="rounded-xl bg-white p-4 shadow-sm">
                      <p className="text-xs font-bold text-slate-800">{q.label} <span className="font-normal text-slate-400">({values.length})</span></p>
                      {choice
                        ? <div className="mt-2 space-y-1.5">{[...counts.entries()].sort((a, b) => b[1] - a[1]).map(([label, count]) => (
                          <div key={label} className="text-xs"><div className="flex justify-between text-slate-600"><span>{label}</span><span>{count}</span></div><div className="h-2 rounded bg-slate-100"><div className="h-2 rounded bg-brand-500" style={{ width: `${(count / Math.max(1, values.length)) * 100}%` }} /></div></div>
                        ))}</div>
                        : <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs text-slate-600">{values.map((v, i) => <li key={i} className="rounded bg-slate-50 px-2 py-1">{answerText(v)}</li>)}</ul>}
                    </div>
                  );
                })}
              </>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
