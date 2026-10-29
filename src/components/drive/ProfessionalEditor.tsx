import React, { useMemo, useState } from 'react';
import {
  AlignLeft,
  ArrowLeft,
  Bold,
  Check,
  ChevronDown,
  ChevronRight,
  Grid3X3,
  Image,
  Italic,
  Link2,
  MessageCircle,
  MoreHorizontal,
  Palette,
  Plus,
  Presentation,
  Save,
  Search,
  Share2,
  Sparkles,
  Table2,
  Type,
  Underline,
  Users,
} from 'lucide-react';

type ItemType = 'document' | 'presentation' | 'spreadsheet' | 'form';
type DriveItem = {
  id: string;
  name: string;
  item_type: ItemType;
  content: Record<string, unknown>;
};

type Props = {
  item: DriveItem;
  onClose: () => void;
  onSave: (content: Record<string, unknown>) => Promise<void>;
};

const buttonClass = 'inline-flex items-center justify-center rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800';

export const ProfessionalEditor: React.FC<Props> = ({ item, onClose, onSave }) => {
  const [content, setContent] = useState(item.content);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [formMode, setFormMode] = useState<'build' | 'preview' | 'responses'>('build');
  const [activeSlide, setActiveSlide] = useState(0);
  const [documentStyle, setDocumentStyle] = useState<'normal' | 'heading' | 'subheading'>('normal');
  const [history, setHistory] = useState<Record<string, unknown>[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [toast, setToast] = useState('');

  const slides = useMemo(() => Array.isArray(content.slides) ? content.slides as Array<{ title: string; body: string }> : [{ title: 'Title slide', body: '' }], [content.slides]);
  const rows = useMemo(() => Array.isArray(content.rows) ? content.rows as string[][] : [['', '', ''], ['', '', '']], [content.rows]);
  const questions = useMemo(() => Array.isArray(content.questions) ? content.questions as Array<{ id: string; type: string; label: string; required: boolean; options: string[] }> : [], [content.questions]);

  const update = (patch: Record<string, unknown>) => {
    setContent((current) => {
      const next = { ...current, ...patch };
      setHistory((entries) => [...entries.slice(0, historyIndex + 1), current, next].slice(-30));
      setHistoryIndex((index) => Math.min(index + 1, 29));
      return next;
    });
    setSaved(false);
  };
  const updateContent = (next: Record<string, unknown>) => {
    setContent(next);
    setSaved(false);
  };
  const undo = () => {
    if (historyIndex < 0) return;
    const previous = history[historyIndex];
    if (previous) {
      setContent(previous);
      setHistoryIndex((index) => index - 1);
    }
  };
  const redo = () => {
    const next = history[historyIndex + 2];
    if (next) {
      setContent(next);
      setHistoryIndex((index) => index + 1);
    }
  };
  React.useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void save();
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  });
  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await onSave(content);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  const title = String(content.title || item.name);
  const typeLabel = item.item_type === 'document' ? 'Document' : item.item_type === 'presentation' ? 'Presentation' : item.item_type === 'spreadsheet' ? 'Spreadsheet' : 'Form';

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#f8fafc] text-slate-800">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <button type="button" onClick={onClose} className={buttonClass} aria-label="Back to Drive"><ArrowLeft className="h-4 w-4" /></button>
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${item.item_type === 'document' ? 'bg-sky-100 text-sky-700' : item.item_type === 'presentation' ? 'bg-orange-100 text-orange-700' : item.item_type === 'spreadsheet' ? 'bg-emerald-100 text-emerald-700' : 'bg-fuchsia-100 text-fuchsia-700'}`}>
            {item.item_type === 'presentation' ? <Presentation className="h-4 w-4" /> : item.item_type === 'spreadsheet' ? <Table2 className="h-4 w-4" /> : <Type className="h-4 w-4" />}
          </div>
          <div className="min-w-0">
            <input value={title} onChange={(event) => update({ title: event.target.value })} className="block w-48 truncate border-0 bg-transparent text-sm font-semibold text-slate-800 outline-none focus:ring-0 sm:w-64" aria-label={`${typeLabel} title`} />
            <div className="flex items-center gap-1 text-[10px] text-slate-400"><span>Flown {typeLabel}</span><span>·</span><span>{saving ? 'Saving...' : saved ? 'Saved to Drive' : 'Unsaved changes'}</span></div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="hidden items-center gap-1 text-[10px] text-emerald-600 sm:flex">{saved && <><Check className="h-3 w-3" /> All changes saved</>}</div>
          <button type="button" className={`${buttonClass} hidden sm:inline-flex`} title="Comments"><MessageCircle className="h-4 w-4" /></button>
          <button type="button" className="hidden items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 sm:inline-flex"><Users className="h-3.5 w-3.5" /> Share</button>
          <button type="button" onClick={() => void save()} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-brand-700"><Save className="h-3.5 w-3.5" /> {saving ? 'Saving' : 'Save'}</button>
          <button type="button" className={buttonClass}><MoreHorizontal className="h-4 w-4" /></button>
        </div>
      </header>

      {item.item_type === 'form' && (
        <nav className="flex h-11 shrink-0 items-center gap-1 border-b border-slate-200 bg-white px-4">
          {(['build', 'preview', 'responses'] as const).map((mode) => <button key={mode} type="button" onClick={() => setFormMode(mode)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize ${formMode === mode ? 'bg-fuchsia-50 text-fuchsia-700' : 'text-slate-500 hover:bg-slate-50'}`}>{mode === 'build' ? 'Build form' : mode}</button>)}
          <span className="ml-auto hidden text-[11px] text-slate-400 sm:block">Form settings <ChevronDown className="ml-1 inline h-3 w-3" /></span>
        </nav>
      )}

      {item.item_type === 'document' && (
        <div className="flex h-11 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-slate-200 bg-white px-3">
          <button type="button" onClick={undo} className={`${buttonClass} ${historyIndex < 0 ? 'opacity-40' : ''}`} disabled={historyIndex < 0}><UndoIcon /></button><button type="button" onClick={redo} className={`${buttonClass} ${!history[historyIndex + 2] ? 'opacity-40' : ''}`} disabled={!history[historyIndex + 2]}><RedoIcon /></button><span className="mx-2 h-5 w-px bg-slate-200" />
          <button type="button" className="rounded-lg px-3 py-2 text-xs text-slate-600 hover:bg-slate-100">100% <ChevronDown className="ml-1 inline h-3 w-3" /></button>
          <button type="button" onClick={() => setDocumentStyle((style) => style === 'normal' ? 'heading' : style === 'heading' ? 'subheading' : 'normal')} className="rounded-lg px-3 py-2 text-xs text-slate-600 hover:bg-slate-100">{documentStyle === 'normal' ? 'Normal text' : documentStyle === 'heading' ? 'Heading 1' : 'Heading 2'} <ChevronDown className="ml-1 inline h-3 w-3" /></button>
          <button type="button" className={buttonClass}><Bold className="h-4 w-4" /></button><button type="button" className={buttonClass}><Italic className="h-4 w-4" /></button><button type="button" className={buttonClass}><Underline className="h-4 w-4" /></button>
          <span className="mx-2 h-5 w-px bg-slate-200" /><button type="button" className={buttonClass}><Link2 className="h-4 w-4" /></button><button type="button" className={buttonClass}><Image className="h-4 w-4" /></button><button type="button" className={buttonClass}><AlignLeft className="h-4 w-4" /></button>
          <button type="button" className="ml-auto inline-flex items-center gap-1 rounded-lg bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700"><Sparkles className="h-3.5 w-3.5" /> Flown AI</button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {item.item_type === 'document' && <DocumentOutline title={title} />}
        {item.item_type === 'presentation' && <SlideRail slides={slides} activeSlide={activeSlide} setActiveSlide={setActiveSlide} />}
        <main className={`min-w-0 flex-1 overflow-y-auto ${item.item_type === 'spreadsheet' ? 'bg-white' : 'bg-slate-100/80 p-4 sm:p-8'}`}>
          {item.item_type === 'document' && <DocumentCanvas title={title} content={content} update={update} documentStyle={documentStyle} />}
          {item.item_type === 'presentation' && <SlidesCanvas slides={slides} activeSlide={activeSlide} setContent={updateContent} setActiveSlide={setActiveSlide} />}
          {item.item_type === 'spreadsheet' && <SheetsCanvas rows={rows} setContent={updateContent} />}
          {item.item_type === 'form' && <FormsCanvas mode={formMode} title={title} content={content} questions={questions} update={update} setContent={updateContent} onToast={setToast} />}
        </main>
      </div>
      {toast && <button type="button" onClick={() => setToast('')} className="fixed bottom-5 right-5 rounded-xl bg-slate-900 px-4 py-3 text-xs font-semibold text-white shadow-xl">{toast}</button>}
    </div>
  );
};

const UndoIcon = () => <span className="text-sm">↶</span>;
const RedoIcon = () => <span className="text-sm">↷</span>;

const DocumentOutline: React.FC<{ title: string }> = ({ title }) => (
  <aside className="hidden w-56 shrink-0 border-r border-slate-200 bg-white p-3 lg:block">
    <div className="mb-5 flex items-center justify-between px-2"><span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Document tabs</span><Plus className="h-4 w-4 text-slate-400" /></div>
    <div className="rounded-lg bg-sky-100 px-3 py-2 text-xs font-semibold text-sky-800">Tab 1 <MoreHorizontal className="float-right h-4 w-4" /></div>
    <nav className="mt-4 space-y-1 border-l border-slate-200 pl-4 text-xs text-slate-500">
      {[title, 'Overview', 'Purpose', 'Scope', 'Responsibilities', 'Procedure', 'Appendix'].map((entry, index) => <button key={entry} type="button" className={`block w-full truncate py-1 text-left hover:text-brand-700 ${index === 0 ? 'font-semibold text-slate-800' : ''}`}>{entry}</button>)}
    </nav>
  </aside>
);

const DocumentCanvas: React.FC<{ title: string; content: Record<string, unknown>; update: (patch: Record<string, unknown>) => void; documentStyle: 'normal' | 'heading' | 'subheading' }> = ({ title, content, update, documentStyle }) => (
  <div className="mx-auto min-h-[900px] max-w-4xl bg-white px-10 py-12 shadow-sm ring-1 ring-slate-200 sm:px-20 sm:py-16">
    <div className="mb-14 flex items-start justify-between border-b border-slate-100 pb-5"><div><p className="text-xl font-bold text-brand-600">Flown</p><p className="mt-1 text-[11px] text-slate-400">Internal operations workspace</p></div><p className="text-right text-[10px] uppercase tracking-widest text-slate-400">Document<br />{new Date().toLocaleDateString()}</p></div>
    <input value={title} onChange={(event) => update({ title: event.target.value })} className="w-full border-0 text-4xl font-bold tracking-tight text-slate-900 outline-none" />
    <p className="mt-3 text-sm text-slate-400">Add a subtitle or document purpose</p>
    <div className="mt-12 space-y-7"><h2 className={documentStyle === 'heading' ? 'text-3xl font-bold text-slate-800' : documentStyle === 'subheading' ? 'text-2xl font-semibold text-slate-800' : 'text-xl font-bold text-slate-800'}>Overview</h2><textarea value={String(content.text || '')} onChange={(event) => update({ text: event.target.value })} placeholder="Start writing your document. Use the toolbar to format your content..." className={`min-h-[520px] w-full resize-none border-0 leading-8 text-slate-700 outline-none placeholder:text-slate-300 ${documentStyle === 'heading' ? 'text-lg font-semibold' : 'text-[15px]'}`} /><div className="rounded-xl border-l-4 border-brand-400 bg-sky-50 px-5 py-4 text-sm leading-6 text-sky-900"><strong>Tip:</strong> Use Flown AI to turn notes into a polished section, summarize a policy, or suggest next steps.</div></div>
  </div>
);

const SlideRail: React.FC<{ slides: Array<{ title: string; body: string }>; activeSlide: number; setActiveSlide: (index: number) => void }> = ({ slides, activeSlide, setActiveSlide }) => (
  <aside className="hidden w-48 shrink-0 overflow-y-auto border-r border-slate-200 bg-slate-50 p-3 md:block"><button type="button" className="mb-3 flex w-full items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white py-2 text-xs font-bold text-slate-600"><Plus className="h-3.5 w-3.5" /> New slide</button>{slides.map((slide, index) => <button key={index} type="button" onClick={() => setActiveSlide(index)} className={`mb-3 w-full rounded-lg border p-1.5 text-left ${index === activeSlide ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-100' : 'border-slate-200 bg-white'}`}><div className="flex aspect-video items-center justify-center rounded bg-gradient-to-br from-white to-sky-100 text-[9px] font-bold text-slate-500">{slide.title || `Slide ${index + 1}`}</div><span className="mt-1 block text-[10px] text-slate-500">{index + 1}. {slide.title}</span></button>)}</aside>
);

const SlidesCanvas: React.FC<{ slides: Array<{ title: string; body: string }>; activeSlide: number; setContent: React.Dispatch<React.SetStateAction<Record<string, unknown>>>; setActiveSlide: (index: number) => void }> = ({ slides, activeSlide, setContent, setActiveSlide }) => {
  const slide = slides[activeSlide] || slides[0];
  return <div className="mx-auto max-w-5xl"><div className="mb-4 flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Slide {activeSlide + 1} of {slides.length}</p><p className="text-sm font-semibold text-slate-700">Flown Light theme</p></div><div className="flex items-center gap-2"><button type="button" onClick={() => setContent((current) => ({ ...current, slides: [...slides, { title: `Slide ${slides.length + 1}`, body: '' }] }))} className="inline-flex items-center gap-1 rounded-lg bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-700"><Plus className="h-3.5 w-3.5" /> New slide</button><button type="button" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600"><Palette className="h-3.5 w-3.5" /> Theme</button></div></div><section className="aspect-video rounded-xl bg-gradient-to-br from-white via-sky-50 to-blue-100 p-8 shadow-xl ring-1 ring-slate-200 sm:p-14"><input value={slide.title} onChange={(event) => setContent((current) => ({ ...current, slides: slides.map((entry, index) => index === activeSlide ? { ...entry, title: event.target.value } : entry) }))} className="mt-8 w-full border-0 bg-transparent text-4xl font-bold text-slate-900 outline-none" /><textarea value={slide.body} onChange={(event) => setContent((current) => ({ ...current, slides: slides.map((entry, index) => index === activeSlide ? { ...entry, body: event.target.value } : entry) }))} placeholder="Add a subtitle, key message, or speaker notes" className="mt-8 h-40 w-full resize-none border-0 bg-transparent text-xl leading-8 text-slate-600 outline-none placeholder:text-slate-300" /><div className="mt-5 flex justify-between"><button type="button" disabled={activeSlide === 0} onClick={() => setActiveSlide(activeSlide - 1)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs disabled:opacity-40">Previous</button><button type="button" disabled={activeSlide === slides.length - 1} onClick={() => setActiveSlide(activeSlide + 1)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs disabled:opacity-40">Next</button></div></section></div>;
};

const SheetsCanvas: React.FC<{ rows: string[][]; setContent: React.Dispatch<React.SetStateAction<Record<string, unknown>>> }> = ({ rows, setContent }) => (
  <div className="flex h-full min-w-[760px] flex-col"><div className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-2"><button type="button" className="rounded bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">Sheet1</button><button type="button" className={buttonClass}><Plus className="h-3.5 w-3.5" /></button><span className="ml-auto flex items-center gap-1 text-xs text-slate-400"><Search className="h-3.5 w-3.5" /> Find in sheet</span></div><div className="overflow-auto"><table className="w-full border-collapse text-xs"><thead><tr><th className="sticky left-0 w-10 border border-slate-200 bg-slate-50" />{rows[0].map((_, index) => <th key={index} className="min-w-36 border border-slate-200 bg-slate-50 px-2 py-2 text-center font-semibold text-slate-500">{String.fromCharCode(65 + index)}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}><th className="sticky left-0 border border-slate-200 bg-slate-50 px-2 text-center font-semibold text-slate-500">{rowIndex + 1}</th>{row.map((cell, cellIndex) => <td key={cellIndex} className="border border-slate-200 p-0"><input value={cell} onChange={(event) => setContent((current) => ({ ...current, rows: rows.map((currentRow, index) => index === rowIndex ? currentRow.map((value, position) => position === cellIndex ? event.target.value : value) : currentRow) }))} className="w-full min-w-36 px-3 py-2.5 outline-none focus:bg-emerald-50" /></td>)}</tr>)}</tbody></table></div></div>
);

const FormsCanvas: React.FC<{ mode: 'build' | 'preview' | 'responses'; title: string; content: Record<string, unknown>; questions: Array<{ id: string; type: string; label: string; required: boolean; options: string[] }>; update: (patch: Record<string, unknown>) => void; setContent: React.Dispatch<React.SetStateAction<Record<string, unknown>>>; onToast: (message: string) => void }> = ({ mode, title, content, questions, update, setContent, onToast }) => {
  if (mode === 'responses') return <div className="mx-auto max-w-4xl rounded-2xl bg-white p-8 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-fuchsia-600">Responses</p><h1 className="mt-2 text-2xl font-bold text-slate-900">{title}</h1><div className="mt-10 rounded-xl border border-dashed border-slate-200 p-12 text-center text-sm text-slate-400">Responses will appear here when people submit this form.</div></div>;
  return <div className="mx-auto max-w-3xl space-y-4"><div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200"><div className="h-3 bg-gradient-to-r from-fuchsia-600 to-purple-600" /><div className="p-7"><input value={title} onChange={(event) => update({ title: event.target.value })} className="w-full border-0 text-3xl font-bold text-slate-900 outline-none" /><textarea value={String(content.description || '')} onChange={(event) => update({ description: event.target.value })} placeholder="Tell people what this form is for..." className="mt-3 w-full resize-none border-0 text-sm text-slate-500 outline-none" /></div></div>{mode === 'preview' ? <div className="rounded-2xl bg-white p-7 shadow-sm">{questions.map((question) => <div key={question.id} className="mb-7"><p className="text-sm font-semibold text-slate-800">{question.label}{question.required && <span className="text-rose-500"> *</span>}</p><input className="mt-3 w-full border-b border-slate-300 py-2 text-sm outline-none" placeholder="Your answer" /></div>)}<button type="button" onClick={() => onToast('Response captured in this form session. Save to publish it.')} className="rounded-lg bg-fuchsia-600 px-4 py-2.5 text-xs font-bold text-white">Submit response</button></div> : <>{questions.map((question, index) => <div key={question.id} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200"><div className="flex items-start gap-3"><span className="mt-1 text-xs font-bold text-slate-400">{index + 1}</span><div className="min-w-0 flex-1"><input value={question.label} onChange={(event) => setContent((current) => ({ ...current, questions: questions.map((entry) => entry.id === question.id ? { ...entry, label: event.target.value } : entry) }))} className="w-full border-0 text-sm font-semibold outline-none" /><div className="mt-3 flex gap-2"><select value={question.type} onChange={(event) => setContent((current) => ({ ...current, questions: questions.map((entry) => entry.id === question.id ? { ...entry, type: event.target.value } : entry) }))} className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"><option value="short_text">Short answer</option><option value="long_text">Paragraph</option><option value="multiple_choice">Multiple choice</option><option value="date">Date</option></select><label className="flex items-center gap-1 text-xs text-slate-500"><input type="checkbox" checked={question.required} onChange={(event) => setContent((current) => ({ ...current, questions: questions.map((entry) => entry.id === question.id ? { ...entry, required: event.target.checked } : entry) }))} /> Required</label></div></div></div></div>)}<button type="button" onClick={() => setContent((current) => ({ ...current, questions: [...questions, { id: crypto.randomUUID(), type: 'short_text', label: `Question ${questions.length + 1}`, required: false, options: [] }] }))} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-fuchsia-300 bg-fuchsia-50/50 py-4 text-xs font-bold text-fuchsia-700"><Plus className="h-4 w-4" /> Add question</button></>}</div>;
};
