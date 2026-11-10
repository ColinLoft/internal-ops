import React, { useEffect, useRef, useState } from 'react';
import { Bold, Heading2, Italic, Link2, List, ListOrdered, Save } from 'lucide-react';
import { sanitizeEmailHtml } from '../../lib/sanitizeEmailHtml';
import { useTextPrompt } from '../common/useTextPrompt';

const tools = [
  { icon: Bold, label: 'Bold', command: 'bold' },
  { icon: Italic, label: 'Italic', command: 'italic' },
  { icon: Heading2, label: 'Heading', command: 'formatBlock', value: 'h3' },
  { icon: List, label: 'Bulleted list', command: 'insertUnorderedList' },
  { icon: ListOrdered, label: 'Numbered list', command: 'insertOrderedList' },
] as const;

export const RichNotes: React.FC<{ value: string; onSave: (html: string) => Promise<void> | void; placeholder?: string; readOnly?: boolean }> = ({ value, onSave, placeholder = 'Write notes…', readOnly }) => {
  const { prompt, dialog: promptDialog } = useTextPrompt();
  const ref = useRef<HTMLDivElement>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (ref.current && !dirty) ref.current.innerHTML = sanitizeEmailHtml(value || '');
    // Only reset the editor when the saved value changes and there are no unsaved edits.
  }, [value]);

  const run = (command: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(command, false, arg);
    setDirty(true);
  };
  const addLink = async () => {
    const url = await prompt({ title: 'Insert link', placeholder: 'https://…' });
    if (url && /^https?:\/\//i.test(url)) run('createLink', url);
  };
  const save = async () => {
    setSaving(true);
    try {
      await onSave(sanitizeEmailHtml(ref.current?.innerHTML || ''));
      setDirty(false);
    } finally { setSaving(false); }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-1 border-b border-slate-100 p-1.5">
          {tools.map((tool) => {
            const Icon = tool.icon;
            return (
              <button key={tool.label} type="button" title={tool.label} aria-label={tool.label} onMouseDown={(event) => event.preventDefault()} onClick={() => run(tool.command, 'value' in tool ? tool.value : undefined)} className="rounded-md p-2 text-slate-500 hover:bg-slate-100"><Icon className="h-4 w-4" /></button>
            );
          })}
          <button type="button" title="Link" aria-label="Link" onMouseDown={(event) => event.preventDefault()} onClick={addLink} className="rounded-md p-2 text-slate-500 hover:bg-slate-100"><Link2 className="h-4 w-4" /></button>
          <button type="button" onClick={() => void save()} disabled={!dirty || saving} className="ml-auto inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40"><Save className="h-3.5 w-3.5" />{saving ? 'Saving…' : dirty ? 'Save notes' : 'Saved'}</button>
        </div>
      )}
      <div
        ref={ref}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={() => setDirty(true)}
        className="min-h-40 px-4 py-3 text-sm leading-6 text-slate-700 outline-none empty:before:text-slate-400 empty:before:content-[attr(data-placeholder)] [&_a]:text-brand-600 [&_a]:underline [&_h3]:mt-2 [&_h3]:text-base [&_h3]:font-bold [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
      />
      {promptDialog}
    </div>
  );
};
