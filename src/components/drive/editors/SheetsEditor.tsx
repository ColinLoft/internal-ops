import React, { useMemo, useRef, useState } from 'react';
import { AlignCenter, AlignLeft, AlignRight, Bold, Download, Italic, Plus, Upload } from 'lucide-react';
import { columnName, FormulaEvaluator, parseCsv, toCsv } from './sheetFormulas';

type Format = { b?: boolean; i?: boolean; align?: 'left' | 'center' | 'right'; color?: string; bg?: string };
type Sheet = { id: string; name: string; rows: string[][]; formats: Record<string, Format> };
type Props = { name: string; content: Record<string, unknown>; onChange: (content: Record<string, unknown>) => void };
type Cell = { r: number; c: number };

const MAX_ROWS = 500;
const MAX_COLS = 52;
const TEXT_COLORS = ['#0f172a', '#dc2626', '#16a34a', '#2563eb'];
const FILLS = ['', '#fef9c3', '#dcfce7', '#dbeafe', '#fce7f3'];

const blankRows = (rows = 20, cols = 8) => Array.from({ length: rows }, () => Array<string>(cols).fill(''));

const readSheets = (content: Record<string, unknown>): Sheet[] => {
  if (Array.isArray(content.sheets) && content.sheets.length) return content.sheets as Sheet[];
  const rows = Array.isArray(content.rows) ? (content.rows as string[][]).map((row) => row.map(String)) : blankRows();
  const cols = Math.max(8, ...rows.map((row) => row.length));
  const padded = [...rows, ...blankRows(Math.max(0, 20 - rows.length), cols)].map((row) => [...row, ...Array<string>(cols - row.length).fill('')]);
  return [{ id: 'sheet-1', name: 'Sheet 1', rows: padded, formats: {} }];
};

const btn = 'flex min-h-11 min-w-11 items-center justify-center rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:min-h-8 md:min-w-8';
const small = 'rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 min-h-11 md:min-h-8';

export const SheetsEditor: React.FC<Props> = ({ name, content, onChange }) => {
  const [sheets, setSheets] = useState<Sheet[]>(() => readSheets(content));
  const [activeId, setActiveId] = useState(() => readSheets(content)[0].id);
  const [anchor, setAnchor] = useState<Cell>({ r: 0, c: 0 });
  const [focus, setFocus] = useState<Cell>({ r: 0, c: 0 });
  const [editing, setEditing] = useState<{ cell: Cell; value: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const sheet = sheets.find((entry) => entry.id === activeId) ?? sheets[0];
  const evaluator = useMemo(() => new FormulaEvaluator((r, c) => sheet.rows[r]?.[c] ?? ''), [sheet.rows]);

  const commit = (next: Sheet[]) => {
    setSheets(next);
    onChange({ ...content, sheets: next, rows: next[0].rows, title: name });
  };
  const patchSheet = (patch: Partial<Sheet>) => commit(sheets.map((entry) => entry.id === sheet.id ? { ...entry, ...patch } : entry));

  const range = {
    r1: Math.min(anchor.r, focus.r), r2: Math.max(anchor.r, focus.r),
    c1: Math.min(anchor.c, focus.c), c2: Math.max(anchor.c, focus.c),
  };
  const inRange = (r: number, c: number) => r >= range.r1 && r <= range.r2 && c >= range.c1 && c <= range.c2;
  const colCount = sheet.rows[0]?.length ?? 0;

  const setCell = (r: number, c: number, value: string) => {
    const rows = sheet.rows.map((row) => [...row]);
    rows[r][c] = value;
    patchSheet({ rows });
  };
  const clearRange = () => {
    const rows = sheet.rows.map((row, r) => row.map((cell, c) => inRange(r, c) ? '' : cell));
    patchSheet({ rows });
  };
  const applyFormat = (patch: Format, toggle?: keyof Format) => {
    const formats = { ...sheet.formats };
    const first = formats[`${range.r1},${range.c1}`];
    const turnOn = toggle ? !first?.[toggle] : true;
    for (let r = range.r1; r <= range.r2; r++) {
      for (let c = range.c1; c <= range.c2; c++) {
        const key = `${r},${c}`;
        formats[key] = toggle ? { ...formats[key], [toggle]: turnOn } : { ...formats[key], ...patch };
      }
    }
    patchSheet({ formats });
  };

  const addRow = (at: number) => {
    if (sheet.rows.length >= MAX_ROWS) return;
    const rows = [...sheet.rows];
    rows.splice(at, 0, Array<string>(colCount).fill(''));
    patchSheet({ rows, formats: shiftFormats(sheet.formats, 'r', at, 1) });
  };
  const deleteRow = () => {
    if (sheet.rows.length <= 1) return;
    const count = range.r2 - range.r1 + 1;
    if (count >= sheet.rows.length) return;
    const rows = sheet.rows.filter((_, r) => r < range.r1 || r > range.r2);
    patchSheet({ rows, formats: shiftFormats(sheet.formats, 'r', range.r1, -count) });
    setAnchor({ r: Math.min(range.r1, rows.length - 1), c: anchor.c });
    setFocus({ r: Math.min(range.r1, rows.length - 1), c: anchor.c });
  };
  const addCol = (at: number) => {
    if (colCount >= MAX_COLS) return;
    const rows = sheet.rows.map((row) => { const copy = [...row]; copy.splice(at, 0, ''); return copy; });
    patchSheet({ rows, formats: shiftFormats(sheet.formats, 'c', at, 1) });
  };
  const deleteCol = () => {
    const count = range.c2 - range.c1 + 1;
    if (count >= colCount) return;
    const rows = sheet.rows.map((row) => row.filter((_, c) => c < range.c1 || c > range.c2));
    patchSheet({ rows, formats: shiftFormats(sheet.formats, 'c', range.c1, -count) });
    setAnchor({ r: anchor.r, c: Math.min(range.c1, rows[0].length - 1) });
    setFocus({ r: anchor.r, c: Math.min(range.c1, rows[0].length - 1) });
  };

  const startEdit = (cell: Cell, seed?: string) => setEditing({ cell, value: seed ?? sheet.rows[cell.r][cell.c] });
  const finishEdit = (save: boolean, move?: Cell) => {
    if (editing && save) setCell(editing.cell.r, editing.cell.c, editing.value);
    setEditing(null);
    if (move) { setAnchor(move); setFocus(move); }
    gridRef.current?.focus();
  };

  const select = (cell: Cell, extend: boolean) => {
    if (editing) finishEdit(true);
    setFocus(cell);
    if (!extend) setAnchor(cell);
  };

  const onGridKey = (event: React.KeyboardEvent) => {
    if (editing) return;
    const move = (dr: number, dc: number) => {
      event.preventDefault();
      const next = { r: Math.max(0, Math.min(sheet.rows.length - 1, focus.r + dr)), c: Math.max(0, Math.min(colCount - 1, focus.c + dc)) };
      select(next, event.shiftKey && !event.metaKey);
    };
    if (event.key === 'ArrowUp') move(-1, 0);
    else if (event.key === 'ArrowDown') move(1, 0);
    else if (event.key === 'ArrowLeft') move(0, -1);
    else if (event.key === 'ArrowRight' || (event.key === 'Tab' && !event.shiftKey)) move(0, 1);
    else if (event.key === 'Tab') move(0, -1);
    else if (event.key === 'Enter' || event.key === 'F2') { event.preventDefault(); startEdit(focus); }
    else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); clearRange(); }
    else if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) { event.preventDefault(); startEdit(focus, event.key); }
  };

  const display = (r: number, c: number) => {
    const value = evaluator.valueAt(r, c);
    return typeof value === 'number' ? String(Math.round(value * 1e10) / 1e10) : value;
  };

  const exportCsv = () => {
    const rows = sheet.rows.map((row, r) => row.map((_, c) => display(r, c)));
    const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${name.replace(/[^\w.-]+/g, '_') || 'sheet'}-${sheet.name}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const importCsv = async (file?: File) => {
    if (!file) return;
    const parsed = parseCsv(await file.text()).slice(0, MAX_ROWS);
    if (!parsed.length) return;
    const cols = Math.min(MAX_COLS, Math.max(8, ...parsed.map((row) => row.length)));
    const rows = [...parsed, ...blankRows(Math.max(0, 20 - parsed.length), cols)].map((row) => [...row.slice(0, cols), ...Array<string>(Math.max(0, cols - row.length)).fill('')]);
    patchSheet({ rows, formats: {} });
  };

  const addSheet = () => {
    const next: Sheet = { id: crypto.randomUUID(), name: `Sheet ${sheets.length + 1}`, rows: blankRows(), formats: {} };
    commit([...sheets, next]);
    setActiveId(next.id);
    setAnchor({ r: 0, c: 0 }); setFocus({ r: 0, c: 0 });
  };
  const renameSheet = (id: string) => {
    const current = sheets.find((entry) => entry.id === id);
    const nextName = window.prompt('Rename sheet', current?.name)?.trim();
    if (nextName) commit(sheets.map((entry) => entry.id === id ? { ...entry, name: nextName.slice(0, 40) } : entry));
  };
  const deleteSheet = (id: string) => {
    if (sheets.length === 1 || !window.confirm('Delete this sheet?')) return;
    const next = sheets.filter((entry) => entry.id !== id);
    commit(next);
    setActiveId(next[0].id);
  };

  const rawFocus = sheet.rows[focus.r]?.[focus.c] ?? '';

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 px-2 py-1" role="toolbar" aria-label="Spreadsheet tools">
        <button type="button" className={btn} aria-label="Bold" onClick={() => applyFormat({}, 'b')}><Bold className="h-4 w-4" /></button>
        <button type="button" className={btn} aria-label="Italic" onClick={() => applyFormat({}, 'i')}><Italic className="h-4 w-4" /></button>
        <button type="button" className={btn} aria-label="Align left" onClick={() => applyFormat({ align: 'left' })}><AlignLeft className="h-4 w-4" /></button>
        <button type="button" className={btn} aria-label="Align center" onClick={() => applyFormat({ align: 'center' })}><AlignCenter className="h-4 w-4" /></button>
        <button type="button" className={btn} aria-label="Align right" onClick={() => applyFormat({ align: 'right' })}><AlignRight className="h-4 w-4" /></button>
        <span className="mx-1 flex items-center gap-1" role="group" aria-label="Text color">
          {TEXT_COLORS.map((color) => <button key={color} type="button" aria-label={`Text color ${color}`} onClick={() => applyFormat({ color })} className="h-5 w-5 rounded-full border border-slate-200" style={{ background: color }} />)}
        </span>
        <span className="mx-1 flex items-center gap-1" role="group" aria-label="Fill color">
          {FILLS.map((fill) => <button key={fill || 'none'} type="button" aria-label={fill ? `Fill ${fill}` : 'No fill'} onClick={() => applyFormat({ bg: fill })} className="h-5 w-5 rounded border border-slate-300" style={{ background: fill || 'transparent' }} />)}
        </span>
        <span className="mx-1 h-5 border-l border-slate-200" />
        <button type="button" className={small} onClick={() => addRow(range.r1)}>Row above</button>
        <button type="button" className={small} onClick={() => addRow(range.r2 + 1)}>Row below</button>
        <button type="button" className={small} onClick={deleteRow}>Delete row</button>
        <button type="button" className={small} onClick={() => addCol(range.c1)}>Col left</button>
        <button type="button" className={small} onClick={() => addCol(range.c2 + 1)}>Col right</button>
        <button type="button" className={small} onClick={deleteCol}>Delete col</button>
        <span className="mx-1 h-5 border-l border-slate-200" />
        <button type="button" className={btn} aria-label="Import CSV" title="Import CSV" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /></button>
        <button type="button" className={btn} aria-label="Export CSV" title="Export CSV" onClick={exportCsv}><Download className="h-4 w-4" /></button>
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => { void importCsv(event.target.files?.[0]); event.target.value = ''; }} />
      </div>
      <div className="flex items-center gap-2 border-b border-slate-200 px-2 py-1">
        <span className="w-14 shrink-0 rounded bg-slate-100 px-2 py-1 text-center text-xs font-bold text-slate-600">{columnName(focus.c)}{focus.r + 1}</span>
        <input
          aria-label="Formula bar"
          value={editing ? editing.value : rawFocus}
          onFocus={() => { if (!editing) startEdit(focus); }}
          onChange={(event) => setEditing({ cell: editing?.cell ?? focus, value: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === 'Enter') { event.preventDefault(); finishEdit(true, { r: Math.min(sheet.rows.length - 1, focus.r + 1), c: focus.c }); }
            if (event.key === 'Escape') finishEdit(false);
          }}
          placeholder="Type a value or a formula like =SUM(A1:A5)"
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-200 px-2 text-base outline-none focus:border-brand-400 md:min-h-8 md:text-xs"
        />
      </div>
      <div ref={gridRef} tabIndex={0} onKeyDown={onGridKey} className="min-h-0 flex-1 overflow-auto outline-none" aria-label="Spreadsheet grid">
        <table className="border-collapse text-xs">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="sticky left-0 z-20 w-10 border border-slate-200 bg-slate-100" />
              {sheet.rows[0]?.map((_, c) => <th key={c} className={`min-w-[96px] border border-slate-200 bg-slate-100 px-2 py-1 font-semibold ${c >= range.c1 && c <= range.c2 ? 'text-brand-700' : 'text-slate-500'}`}>{columnName(c)}</th>)}
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((row, r) => (
              <tr key={r}>
                <th className={`sticky left-0 z-10 border border-slate-200 bg-slate-100 px-2 font-semibold ${r >= range.r1 && r <= range.r2 ? 'text-brand-700' : 'text-slate-500'}`}>{r + 1}</th>
                {row.map((_, c) => {
                  const format = sheet.formats[`${r},${c}`] ?? {};
                  const selected = inRange(r, c);
                  const isFocus = focus.r === r && focus.c === c;
                  const isEditing = editing?.cell.r === r && editing.cell.c === c;
                  const shown = display(r, c);
                  const isNumber = typeof evaluator.valueAt(r, c) === 'number';
                  return (
                    <td
                      key={c}
                      onMouseDown={(event) => select({ r, c }, event.shiftKey)}
                      onDoubleClick={() => startEdit({ r, c })}
                      className={`h-8 max-w-[240px] cursor-cell border px-2 ${isFocus ? 'border-2 border-brand-500' : 'border-slate-200'} ${selected && !isFocus ? 'bg-brand-50/60' : ''}`}
                      style={{ background: !selected || isFocus ? format.bg || undefined : undefined, color: format.color, fontWeight: format.b ? 700 : undefined, fontStyle: format.i ? 'italic' : undefined, textAlign: format.align ?? (isNumber ? 'right' : 'left') }}
                    >
                      {isEditing
                        ? <input autoFocus value={editing.value} aria-label={`Edit ${columnName(c)}${r + 1}`} onChange={(event) => setEditing({ cell: editing.cell, value: event.target.value })} onBlur={() => finishEdit(true)} onKeyDown={(event) => {
                          if (event.key === 'Enter') { event.preventDefault(); finishEdit(true, { r: Math.min(sheet.rows.length - 1, r + 1), c }); }
                          else if (event.key === 'Tab') { event.preventDefault(); finishEdit(true, { r, c: Math.min(colCount - 1, c + 1) }); }
                          else if (event.key === 'Escape') finishEdit(false);
                        }} className="w-full bg-transparent text-base outline-none md:text-xs" />
                        : <span className="block truncate">{shown}</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-1 overflow-x-auto border-t border-slate-200 bg-slate-50 px-2 py-1" role="tablist" aria-label="Sheets">
        <button type="button" className={btn} aria-label="Add sheet" onClick={addSheet}><Plus className="h-4 w-4" /></button>
        {sheets.map((entry) => (
          <span key={entry.id} className={`flex shrink-0 items-center rounded-lg text-xs font-semibold ${entry.id === sheet.id ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-600'}`}>
            <button type="button" role="tab" aria-selected={entry.id === sheet.id} onClick={() => { setActiveId(entry.id); setAnchor({ r: 0, c: 0 }); setFocus({ r: 0, c: 0 }); setEditing(null); }} onDoubleClick={() => renameSheet(entry.id)} className="min-h-11 px-3 md:min-h-8">{entry.name}</button>
            {entry.id === sheet.id && (
              <>
                <button type="button" aria-label="Rename sheet" onClick={() => renameSheet(entry.id)} className="px-1 text-slate-400 hover:text-slate-700">✎</button>
                {sheets.length > 1 && <button type="button" aria-label="Delete sheet" onClick={() => deleteSheet(entry.id)} className="px-1 text-slate-400 hover:text-rose-600">×</button>}
              </>
            )}
          </span>
        ))}
      </div>
    </div>
  );
};

function shiftFormats(formats: Record<string, Format>, axis: 'r' | 'c', at: number, delta: number) {
  const next: Record<string, Format> = {};
  for (const [key, format] of Object.entries(formats)) {
    const [r, c] = key.split(',').map(Number);
    const index = axis === 'r' ? r : c;
    if (delta < 0 && index >= at && index < at - delta) continue;
    const moved = index >= at ? index + delta : index;
    next[axis === 'r' ? `${moved},${c}` : `${r},${moved}`] = format;
  }
  return next;
}
