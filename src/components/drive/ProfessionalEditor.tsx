import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, Check, Loader2 } from 'lucide-react';
import { DocsEditor } from './editors/DocsEditor';
import { SheetsEditor } from './editors/SheetsEditor';
import { SlidesEditor } from './editors/SlidesEditor';
import { FormsEditor } from './editors/FormsEditor';
import { useConfirm } from '../common/useConfirm';

type ItemType = 'document' | 'presentation' | 'spreadsheet' | 'form';
type Content = Record<string, unknown>;
type DriveItem = { id: string; name: string; item_type: ItemType; content: Content };

type Props = {
  item: DriveItem;
  onClose: () => void;
  onSave: (content: Content) => Promise<void>;
};

type SaveState = 'saved' | 'dirty' | 'saving' | 'error';

const AUTOSAVE_MS = 1500;

export const ProfessionalEditor: React.FC<Props> = ({ item, onClose, onSave }) => {
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [content, setContent] = useState<Content>(item.content);
  const [state, setState] = useState<SaveState>('saved');
  const [message, setMessage] = useState('');
  const latest = useRef(content);
  const dirty = useRef(false);
  const inFlight = useRef<Promise<void> | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const saveRef = useRef(onSave);
  saveRef.current = onSave;

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    if (inFlight.current) await inFlight.current;
    if (!dirty.current) return true;
    const snapshot = latest.current;
    dirty.current = false;
    setState('saving');
    const run = saveRef.current(snapshot).then(() => {
      setState(dirty.current ? 'dirty' : 'saved');
      setMessage('');
    });
    inFlight.current = run.catch(() => undefined).finally(() => { inFlight.current = null; });
    try {
      await run;
      return true;
    } catch (error) {
      dirty.current = true;
      setState('error');
      setMessage(error instanceof Error ? error.message : 'Changes could not be saved.');
      return false;
    }
  }, []);

  const change = useCallback((next: Content) => {
    latest.current = next;
    dirty.current = true;
    setContent(next);
    setState('dirty');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { void flush(); }, AUTOSAVE_MS);
  }, [flush]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void flush();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(timer.current);
    };
  }, [flush]);

  const close = async () => {
    const ok = await flush();
    if (ok || await confirm({ title: 'Changes could not be saved', message: 'Leave the editor without saving your latest changes?', confirmLabel: 'Leave without saving' })) onClose();
  };

  const status = {
    saved: { icon: <Check className="h-3.5 w-3.5" />, text: 'All changes saved', cls: 'text-emerald-600' },
    dirty: { icon: <Loader2 className="h-3.5 w-3.5" />, text: 'Unsaved changes', cls: 'text-slate-500' },
    saving: { icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />, text: 'Saving…', cls: 'text-slate-500' },
    error: { icon: <AlertCircle className="h-3.5 w-3.5" />, text: 'Save failed — retry', cls: 'text-rose-600' },
  }[state];

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-100">
      <header className="flex min-h-14 items-center gap-2 border-b border-slate-200 bg-white px-3">
        <button type="button" onClick={() => void close()} aria-label="Back to Drive" className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 md:min-h-0 md:min-w-0 md:p-2">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900">{item.name}</h1>
        <button type="button" onClick={() => void flush()} title={message || 'Save now'} className={`flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold md:min-h-0 md:py-1.5 ${status.cls}`}>
          {status.icon}{status.text}
        </button>
      </header>
      <div className="min-h-0 flex-1">
        {item.item_type === 'document' && <DocsEditor name={item.name} content={content} onChange={change} />}
        {item.item_type === 'spreadsheet' && <SheetsEditor name={item.name} content={content} onChange={change} />}
        {item.item_type === 'presentation' && <SlidesEditor name={item.name} content={content} onChange={change} />}
        {item.item_type === 'form' && <FormsEditor itemId={item.id} name={item.name} content={content} onChange={change} />}
        {confirmDialog}
      </div>
    </div>
  );
};
