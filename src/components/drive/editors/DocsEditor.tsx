import { CustomSelect } from "../../common/CustomSelect";
import React, { useEffect, useRef, useState } from 'react';
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, Image as ImageIcon, Italic, Link2, List, ListOrdered, Minus, Redo2, Strikethrough, Table2, Underline, Undo2 } from 'lucide-react';
import { countWords, sanitizeDocHtml, textToHtml } from './docHtml';
import { useTextPrompt } from '../../common/useTextPrompt';

type Props = { name: string; content: Record<string, unknown>; onChange: (content: Record<string, unknown>) => void };

const MAX_IMAGE_BYTES = 1_500_000;
const COLORS = ['#0f172a', '#dc2626', '#ea580c', '#16a34a', '#2563eb', '#7c3aed'];

const initialHtml = (content: Record<string, unknown>) => {
  if (typeof content.html === 'string') return sanitizeDocHtml(content.html);
  if (typeof content.text === 'string') return textToHtml(content.text);
  return '<p><br></p>';
};

const tool = 'flex min-h-11 min-w-11 items-center justify-center rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:min-h-8 md:min-w-8';

export const DocsEditor: React.FC<Props> = ({ name, content, onChange }) => {
  const { prompt, dialog: promptDialog } = useTextPrompt();
  const pageRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef(content);
  contentRef.current = content;
  const [words, setWords] = useState(0);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!pageRef.current) return;
    pageRef.current.innerHTML = initialHtml(contentRef.current);
    setWords(countWords(pageRef.current.innerText));
  }, []);

  const emit = () => {
    const page = pageRef.current;
    if (!page) return;
    const text = page.innerText;
    setWords(countWords(text));
    onChange({ ...contentRef.current, title: name, html: sanitizeDocHtml(page.innerHTML), text });
  };

  const exec = (command: string, value?: string) => {
    pageRef.current?.focus();
    document.execCommand(command, false, value);
    emit();
  };

  const addLink = async () => {
    const url = await prompt({ title: 'Insert link', placeholder: 'https:// or mailto:' });
    if (!url) return;
    if (!/^(https?:|mailto:)/i.test(url)) { setNotice('Links must start with https://, http:// or mailto:'); return; }
    exec('createLink', url);
  };

  const addImage = (file?: File) => {
    if (!file) return;
    if (!/^image\/(png|jpe?g|gif|webp)$/.test(file.type)) { setNotice('Use a PNG, JPG, GIF or WebP image.'); return; }
    if (file.size > MAX_IMAGE_BYTES) { setNotice('Images in documents must be under 1.5 MB.'); return; }
    const reader = new FileReader();
    reader.onload = () => exec('insertImage', String(reader.result));
    reader.readAsDataURL(file);
  };

  const addTable = async () => {
    const rowValue = await prompt({ title: 'Table rows', initialValue: '3', confirmLabel: 'Next' });
    if (rowValue === null) return;
    const colValue = await prompt({ title: 'Table columns', initialValue: '3', confirmLabel: 'Insert table' });
    if (colValue === null) return;
    const rows = Math.min(Number(rowValue) || 0, 20);
    const cols = Math.min(Number(colValue) || 0, 10);
    if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1) {
      setNotice('Tables need at least one row and one column.');
      return;
    }
    const cell = '<td style="min-width:60px;border:1px solid #cbd5e1;padding:4px"><br></td>';
    const html = `<table style="border-collapse:collapse;width:100%"><tbody>${`<tr>${cell.repeat(cols)}</tr>`.repeat(rows)}</tbody></table><p><br></p>`;
    exec('insertHTML', html);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-white px-2 py-1" role="toolbar" aria-label="Formatting">
        <button type="button" className={tool} onClick={() => exec('undo')} aria-label="Undo"><Undo2 className="h-4 w-4" /></button>
        <button type="button" className={tool} onClick={() => exec('redo')} aria-label="Redo"><Redo2 className="h-4 w-4" /></button>
        <CustomSelect aria-label="Text style" defaultValue="P" onChange={(event) => exec('formatBlock', event.target.value)} className="min-h-11 rounded-lg border border-slate-200 bg-white px-2 text-base md:min-h-8 md:text-xs">
          <option value="P">Normal</option>
          <option value="H1">Heading 1</option>
          <option value="H2">Heading 2</option>
          <option value="H3">Heading 3</option>
          <option value="BLOCKQUOTE">Quote</option>
          <option value="PRE">Code</option>
        </CustomSelect>
        <button type="button" className={tool} onClick={() => exec('bold')} aria-label="Bold"><Bold className="h-4 w-4" /></button>
        <button type="button" className={tool} onClick={() => exec('italic')} aria-label="Italic"><Italic className="h-4 w-4" /></button>
        <button type="button" className={tool} onClick={() => exec('underline')} aria-label="Underline"><Underline className="h-4 w-4" /></button>
        <button type="button" className={tool} onClick={() => exec('strikeThrough')} aria-label="Strikethrough"><Strikethrough className="h-4 w-4" /></button>
        <span className="mx-1 flex items-center gap-1" role="group" aria-label="Text color">
          {COLORS.map((color) => <button key={color} type="button" aria-label={`Text color ${color}`} onClick={() => exec('foreColor', color)} className="h-5 w-5 rounded-full border border-slate-200" style={{ background: color }} />)}
        </span>
        <button type="button" className={tool} onClick={() => exec('justifyLeft')} aria-label="Align left"><AlignLeft className="h-4 w-4" /></button>
        <button type="button" className={tool} onClick={() => exec('justifyCenter')} aria-label="Align center"><AlignCenter className="h-4 w-4" /></button>
        <button type="button" className={tool} onClick={() => exec('justifyRight')} aria-label="Align right"><AlignRight className="h-4 w-4" /></button>
        <button type="button" className={tool} onClick={() => exec('justifyFull')} aria-label="Justify"><AlignJustify className="h-4 w-4" /></button>
        <button type="button" className={tool} onClick={() => exec('insertUnorderedList')} aria-label="Bulleted list"><List className="h-4 w-4" /></button>
        <button type="button" className={tool} onClick={() => exec('insertOrderedList')} aria-label="Numbered list"><ListOrdered className="h-4 w-4" /></button>
        <button type="button" className={tool} onClick={addLink} aria-label="Insert link"><Link2 className="h-4 w-4" /></button>
        <button type="button" className={tool} onClick={() => fileRef.current?.click()} aria-label="Insert image"><ImageIcon className="h-4 w-4" /></button>
        <button type="button" className={tool} onClick={addTable} aria-label="Insert table"><Table2 className="h-4 w-4" /></button>
        <button type="button" className={tool} onClick={() => exec('insertHorizontalRule')} aria-label="Insert divider"><Minus className="h-4 w-4" /></button>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={(event) => { addImage(event.target.files?.[0]); event.target.value = ''; }} />
      </div>
      {notice && <button type="button" onClick={() => setNotice('')} className="bg-amber-50 px-4 py-2 text-left text-xs text-amber-800">{notice} <span className="font-bold">Dismiss</span></button>}
      {promptDialog}
      <div className="min-h-0 flex-1 overflow-y-auto p-3 md:p-8">
        <div
          ref={pageRef}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label={`${name} document body`}
          onInput={emit}
          onBlur={emit}
          onPaste={(event) => {
            event.preventDefault();
            const html = event.clipboardData.getData('text/html');
            document.execCommand('insertHTML', false, html ? sanitizeDocHtml(html) : textToHtml(event.clipboardData.getData('text/plain')));
            emit();
          }}
          className="doc-page mx-auto min-h-[70vh] max-w-3xl rounded-xl bg-white p-6 text-base leading-7 text-slate-900 shadow-sm outline-none md:p-12 [&_a]:text-brand-600 [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-slate-300 [&_blockquote]:pl-4 [&_h1]:text-3xl [&_h1]:font-bold [&_h2]:text-2xl [&_h2]:font-bold [&_h3]:text-xl [&_h3]:font-bold [&_img]:max-w-full [&_ol]:list-decimal [&_ol]:pl-6 [&_pre]:rounded-lg [&_pre]:bg-slate-100 [&_pre]:p-3 [&_pre]:font-mono [&_ul]:list-disc [&_ul]:pl-6"
        />
      </div>
      <footer className="border-t border-slate-200 bg-white px-4 py-1.5 text-xs text-slate-500">{words} {words === 1 ? 'word' : 'words'}</footer>
    </div>
  );
};
