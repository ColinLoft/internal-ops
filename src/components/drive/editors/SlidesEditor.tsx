import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Circle, Copy, Image as ImageIcon, Play, Plus, Square, Trash2, Type, X } from 'lucide-react';

type Layout = 'title' | 'title-body' | 'two-column' | 'blank';
type El = {
  id: string; type: 'text' | 'shape' | 'image';
  x: number; y: number; w: number; h: number;
  text?: string; src?: string; shape?: 'rect' | 'ellipse';
  fill?: string; color?: string; size?: number; bold?: boolean;
};
type Slide = { id: string; title: string; body: string; body2?: string; layout: Layout; background: string; notes: string; elements: El[] };
type Props = { name: string; content: Record<string, unknown>; onChange: (content: Record<string, unknown>) => void };

const LAYOUTS: Array<{ key: Layout; label: string }> = [
  { key: 'title', label: 'Title' }, { key: 'title-body', label: 'Title + body' },
  { key: 'two-column', label: 'Two columns' }, { key: 'blank', label: 'Blank' },
];
const BACKGROUNDS = ['#ffffff', '#f1f5f9', '#e0f2fe', '#fef9c3', '#dcfce7', '#0f172a', '#1d4ed8'];
const MAX_IMAGE_BYTES = 1_500_000;

const readSlides = (content: Record<string, unknown>): Slide[] => {
  const raw = Array.isArray(content.slides) ? content.slides as Array<Partial<Slide>> : [];
  const slides = raw.map((slide, index) => ({
    id: slide.id || `slide-${index + 1}`,
    title: String(slide.title ?? ''), body: String(slide.body ?? ''), body2: String(slide.body2 ?? ''),
    layout: (slide.layout ?? 'title-body') as Layout,
    background: slide.background || '#ffffff', notes: String(slide.notes ?? ''),
    elements: Array.isArray(slide.elements) ? slide.elements : [],
  }));
  return slides.length ? slides : [newSlide('title')];
};
const newSlide = (layout: Layout): Slide => ({ id: crypto.randomUUID(), title: '', body: '', body2: '', layout, background: '#ffffff', notes: '', elements: [] });
const isDark = (hex: string) => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return false;
  const n = parseInt(m[1], 16);
  return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 < 128;
};

type ViewProps = { slide: Slide; editable?: boolean; selectedId?: string | null; onSelect?: (id: string | null) => void; onPatch?: (patch: Partial<Slide>) => void; onElement?: (id: string, patch: Partial<El>) => void };

const SlideView: React.FC<ViewProps> = ({ slide, editable, selectedId, onSelect, onPatch, onElement }) => {
  const stage = useRef<HTMLDivElement>(null);
  const ink = isDark(slide.background) ? '#ffffff' : '#0f172a';
  const field = (value: string, key: 'title' | 'body' | 'body2', cls: string, style: React.CSSProperties, placeholder: string) => editable
    ? <textarea value={value} onChange={(event) => onPatch?.({ [key]: event.target.value })} placeholder={placeholder} aria-label={placeholder} className={`absolute resize-none overflow-hidden border border-transparent bg-transparent outline-none hover:border-slate-300 focus:border-brand-400 ${cls}`} style={{ color: ink, ...style }} />
    : <div className={`absolute whitespace-pre-wrap ${cls}`} style={{ color: ink, ...style }}>{value}</div>;

  const drag = (event: React.PointerEvent, el: El, mode: 'move' | 'resize') => {
    if (!editable || !stage.current) return;
    event.stopPropagation();
    event.preventDefault();
    onSelect?.(el.id);
    const box = stage.current.getBoundingClientRect();
    const sx = event.clientX, sy = event.clientY;
    const start = { x: el.x, y: el.y, w: el.w, h: el.h };
    const move = (e: PointerEvent) => {
      const dx = ((e.clientX - sx) / box.width) * 100, dy = ((e.clientY - sy) / box.height) * 100;
      if (mode === 'move') onElement?.(el.id, { x: Math.max(0, Math.min(100 - start.w, start.x + dx)), y: Math.max(0, Math.min(100 - start.h, start.y + dy)) });
      else onElement?.(el.id, { w: Math.max(5, Math.min(100 - start.x, start.w + dx)), h: Math.max(5, Math.min(100 - start.y, start.h + dy)) });
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div ref={stage} onPointerDown={() => onSelect?.(null)} className="relative aspect-video w-full overflow-hidden" style={{ background: slide.background, containerType: 'inline-size' }}>
      {slide.layout === 'title' && <>
        {field(slide.title, 'title', 'font-bold text-center', { left: '10%', top: '30%', width: '80%', height: '22%', fontSize: '6cqw' }, 'Slide title')}
        {field(slide.body, 'body', 'text-center opacity-80', { left: '15%', top: '55%', width: '70%', height: '20%', fontSize: '3cqw' }, 'Subtitle')}
      </>}
      {slide.layout === 'title-body' && <>
        {field(slide.title, 'title', 'font-bold', { left: '6%', top: '6%', width: '88%', height: '16%', fontSize: '4.5cqw' }, 'Slide title')}
        {field(slide.body, 'body', '', { left: '6%', top: '26%', width: '88%', height: '66%', fontSize: '2.6cqw' }, 'Body text')}
      </>}
      {slide.layout === 'two-column' && <>
        {field(slide.title, 'title', 'font-bold', { left: '6%', top: '6%', width: '88%', height: '16%', fontSize: '4.5cqw' }, 'Slide title')}
        {field(slide.body, 'body', '', { left: '6%', top: '26%', width: '42%', height: '66%', fontSize: '2.4cqw' }, 'Left column')}
        {field(slide.body2 ?? '', 'body2', '', { left: '52%', top: '26%', width: '42%', height: '66%', fontSize: '2.4cqw' }, 'Right column')}
      </>}
      {slide.elements.map((el) => (
        <div
          key={el.id}
          onPointerDown={(event) => drag(event, el, 'move')}
          className={`absolute ${editable ? 'cursor-move' : ''} ${selectedId === el.id ? 'outline outline-2 outline-brand-500' : ''}`}
          style={{ left: `${el.x}%`, top: `${el.y}%`, width: `${el.w}%`, height: `${el.h}%`, touchAction: 'none' }}
        >
          {el.type === 'shape' && <div className="h-full w-full" style={{ background: el.fill, borderRadius: el.shape === 'ellipse' ? '50%' : '0.5cqw' }} />}
          {el.type === 'image' && el.src && <img src={el.src} alt="" draggable={false} className="h-full w-full object-contain" />}
          {el.type === 'text' && (
            <div className="h-full w-full whitespace-pre-wrap" style={{ color: el.color || ink, fontSize: `${(el.size ?? 24) / 10}cqw`, fontWeight: el.bold ? 700 : 400 }}>{el.text}</div>
          )}
          {editable && selectedId === el.id && <span onPointerDown={(event) => drag(event, el, 'resize')} className="absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-nwse-resize rounded-full border-2 border-white bg-brand-500" />}
        </div>
      ))}
    </div>
  );
};

const btn = 'flex min-h-11 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 md:min-h-8';

export const SlidesEditor: React.FC<Props> = ({ name, content, onChange }) => {
  const [slides, setSlides] = useState<Slide[]>(() => readSlides(content));
  const [index, setIndex] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [presenting, setPresenting] = useState(false);
  const [notice, setNotice] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const slide = slides[Math.min(index, slides.length - 1)];
  const selected = slide.elements.find((el) => el.id === selectedId);

  const commit = (next: Slide[]) => { setSlides(next); onChange({ ...content, title: name, slides: next }); };
  const patchSlide = (patch: Partial<Slide>) => commit(slides.map((s) => s.id === slide.id ? { ...s, ...patch } : s));
  const patchEl = (id: string, patch: Partial<El>) => patchSlide({ elements: slide.elements.map((el) => el.id === id ? { ...el, ...patch } : el) });
  const addEl = (el: Omit<El, 'id'>) => { const id = crypto.randomUUID(); patchSlide({ elements: [...slide.elements, { ...el, id }] }); setSelectedId(id); };

  const addSlide = (layout: Layout = 'title-body') => { const next = [...slides.slice(0, index + 1), newSlide(layout), ...slides.slice(index + 1)]; commit(next); setIndex(index + 1); setSelectedId(null); };
  const duplicate = () => { const copy = { ...slide, id: crypto.randomUUID(), elements: slide.elements.map((el) => ({ ...el, id: crypto.randomUUID() })) }; commit([...slides.slice(0, index + 1), copy, ...slides.slice(index + 1)]); setIndex(index + 1); };
  const remove = () => { if (slides.length === 1) return; const next = slides.filter((s) => s.id !== slide.id); commit(next); setIndex(Math.max(0, index - 1)); setSelectedId(null); };
  const moveSlide = (delta: number) => {
    const to = index + delta;
    if (to < 0 || to >= slides.length) return;
    const next = [...slides];
    [next[index], next[to]] = [next[to], next[index]];
    commit(next); setIndex(to);
  };

  const addImage = (file?: File) => {
    if (!file) return;
    if (!/^image\/(png|jpe?g|gif|webp)$/.test(file.type)) { setNotice('Use a PNG, JPG, GIF or WebP image.'); return; }
    if (file.size > MAX_IMAGE_BYTES) { setNotice('Images in slides must be under 1.5 MB.'); return; }
    const reader = new FileReader();
    reader.onload = () => addEl({ type: 'image', x: 25, y: 25, w: 50, h: 50, src: String(reader.result) });
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (!presenting) return;
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPresenting(false);
      else if (['ArrowRight', 'ArrowDown', ' ', 'PageDown'].includes(event.key)) { event.preventDefault(); setIndex((i) => Math.min(slides.length - 1, i + 1)); }
      else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(event.key)) { event.preventDefault(); setIndex((i) => Math.max(0, i - 1)); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [presenting, slides.length]);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId && !/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) {
        event.preventDefault();
        patchSlide({ elements: slide.elements.filter((el) => el.id !== selectedId) });
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  if (presenting) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black" onClick={() => setIndex((i) => Math.min(slides.length - 1, i + 1))}>
        <div className="w-full max-w-[177vh]"><SlideView slide={slide} /></div>
        <button type="button" aria-label="Exit presentation" onClick={(event) => { event.stopPropagation(); setPresenting(false); }} className="absolute right-3 top-3 flex min-h-11 min-w-11 items-center justify-center rounded-full bg-white/20 text-white"><X className="h-5 w-5" /></button>
        <span className="absolute bottom-3 right-4 text-xs text-white/70">{index + 1} / {slides.length}</span>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col md:flex-row">
      <aside className="flex shrink-0 gap-2 overflow-auto border-b border-slate-200 bg-white p-2 md:w-52 md:flex-col md:border-b-0 md:border-r" aria-label="Slide sorter">
        {slides.map((s, i) => (
          <button key={s.id} type="button" onClick={() => { setIndex(i); setSelectedId(null); }} aria-label={`Slide ${i + 1}`} aria-current={i === index} className={`relative w-36 shrink-0 overflow-hidden rounded-lg border-2 md:w-full ${i === index ? 'border-brand-500' : 'border-slate-200'}`}>
            <SlideView slide={s} />
            <span className="absolute left-1 top-1 rounded bg-black/50 px-1 text-xs text-white">{i + 1}</span>
          </button>
        ))}
        <button type="button" onClick={() => addSlide()} className={`${btn} shrink-0 justify-center border border-dashed border-slate-300`}><Plus className="h-4 w-4" />Slide</button>
      </aside>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-white px-2 py-1" role="toolbar" aria-label="Slide tools">
          <select aria-label="Layout" value={slide.layout} onChange={(event) => patchSlide({ layout: event.target.value as Layout })} className="min-h-11 rounded-lg border border-slate-200 bg-white px-2 text-base md:min-h-8 md:text-xs">
            {LAYOUTS.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
          </select>
          <button type="button" className={btn} onClick={() => addEl({ type: 'text', x: 20, y: 40, w: 40, h: 15, text: 'Text', size: 28 })}><Type className="h-4 w-4" />Text</button>
          <button type="button" className={btn} onClick={() => addEl({ type: 'shape', x: 35, y: 30, w: 25, h: 35, shape: 'rect', fill: '#2563eb' })}><Square className="h-4 w-4" />Box</button>
          <button type="button" className={btn} onClick={() => addEl({ type: 'shape', x: 35, y: 30, w: 25, h: 35, shape: 'ellipse', fill: '#16a34a' })}><Circle className="h-4 w-4" />Oval</button>
          <button type="button" className={btn} onClick={() => fileRef.current?.click()}><ImageIcon className="h-4 w-4" />Image</button>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={(event) => { addImage(event.target.files?.[0]); event.target.value = ''; }} />
          <span className="mx-1 flex items-center gap-1" role="group" aria-label="Background">
            {BACKGROUNDS.map((color) => <button key={color} type="button" aria-label={`Background ${color}`} onClick={() => patchSlide({ background: color })} className={`h-5 w-5 rounded-full border ${slide.background === color ? 'border-brand-500 ring-2 ring-brand-300' : 'border-slate-300'}`} style={{ background: color }} />)}
          </span>
          <button type="button" className={btn} onClick={() => moveSlide(-1)} aria-label="Move slide up"><ChevronUp className="h-4 w-4" /></button>
          <button type="button" className={btn} onClick={() => moveSlide(1)} aria-label="Move slide down"><ChevronDown className="h-4 w-4" /></button>
          <button type="button" className={btn} onClick={duplicate} aria-label="Duplicate slide"><Copy className="h-4 w-4" /></button>
          <button type="button" className={btn} onClick={remove} aria-label="Delete slide"><Trash2 className="h-4 w-4" /></button>
          <button type="button" onClick={() => setPresenting(true)} className="ml-auto flex min-h-11 items-center gap-1.5 rounded-lg bg-brand-600 px-3 text-xs font-bold text-white md:min-h-8"><Play className="h-4 w-4" />Present</button>
        </div>
        {selected && (
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-xs">
            <span className="font-semibold text-slate-600 capitalize">{selected.type}</span>
            {selected.type === 'text' && <>
              <input aria-label="Text content" value={selected.text ?? ''} onChange={(event) => patchEl(selected.id, { text: event.target.value })} className="min-h-11 rounded border border-slate-200 px-2 text-base md:min-h-8 md:text-xs" />
              <label className="flex items-center gap-1">Size<input type="number" min={8} max={120} value={selected.size ?? 24} onChange={(event) => patchEl(selected.id, { size: Math.max(8, Math.min(120, Number(event.target.value) || 24)) })} className="w-16 rounded border border-slate-200 px-1 py-1" /></label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={Boolean(selected.bold)} onChange={(event) => patchEl(selected.id, { bold: event.target.checked })} />Bold</label>
              <label className="flex items-center gap-1">Color<input type="color" value={selected.color || '#0f172a'} onChange={(event) => patchEl(selected.id, { color: event.target.value })} /></label>
            </>}
            {selected.type === 'shape' && <label className="flex items-center gap-1">Fill<input type="color" value={selected.fill || '#2563eb'} onChange={(event) => patchEl(selected.id, { fill: event.target.value })} /></label>}
            <button type="button" onClick={() => { patchSlide({ elements: slide.elements.filter((el) => el.id !== selected.id) }); setSelectedId(null); }} className="ml-auto min-h-11 rounded px-2 font-semibold text-rose-600 md:min-h-0">Delete element</button>
          </div>
        )}
        {notice && <button type="button" onClick={() => setNotice('')} className="bg-amber-50 px-4 py-2 text-left text-xs text-amber-800">{notice} <span className="font-bold">Dismiss</span></button>}
        <div className="min-h-0 flex-1 overflow-auto bg-slate-100 p-3 md:p-8">
          <div className="mx-auto max-w-4xl overflow-hidden rounded-lg shadow-lg">
            <SlideView slide={slide} editable selectedId={selectedId} onSelect={setSelectedId} onPatch={patchSlide} onElement={patchEl} />
          </div>
        </div>
        <label className="block border-t border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-500">
          Speaker notes
          <textarea value={slide.notes} onChange={(event) => patchSlide({ notes: event.target.value })} rows={2} placeholder="Notes only you can see while presenting" className="mt-1 block w-full resize-none rounded-lg border border-slate-200 p-2 text-base font-normal text-slate-800 outline-none focus:border-brand-400 md:text-xs" />
        </label>
      </div>
    </div>
  );
};
