import React, { useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { contractFieldLabel, createContractField, type ContractField, type ContractFieldKind, type ContractSigner } from './contractSigning';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

type Props = {
  fileUrl: string;
  fields: ContractField[];
  onChange: (fields: ContractField[]) => void;
  mode?: 'place' | 'sign' | 'view';
  signer?: ContractSigner;
  nameValue?: string;
  onSignaturesChange?: (signatures: Record<string, string>) => void;
};

export const ContractFieldEditor: React.FC<Props> = ({
  fileUrl, fields, onChange, mode = 'place', signer, nameValue = '', onSignaturesChange,
}) => {
  const [pageCount, setPageCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [signatures, setSignatures] = useState<Record<string, string>>({});
  const [activeField, setActiveField] = useState('');
  const [pdfDocument, setPdfDocument] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const pageRefs = useRef<Array<HTMLDivElement | null>>([]);
  const pageCanvases = useRef<Array<HTMLDivElement | null>>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => onSignaturesChange?.(signatures), [onSignaturesChange, signatures]);
  useEffect(() => {
    let active = true;
    const loadingTask = pdfjs.getDocument({ url: fileUrl });
    setLoading(true);
    setError('');
    setPageCount(0);
    setPdfDocument(null);
    setSignatures({});
    void loadingTask.promise.then((loadedDocument) => {
      if (!active) return;
      setPageCount(loadedDocument.numPages);
      setPdfDocument(loadedDocument);
      setLoading(false);
    }).catch(() => {
      if (active) {
        setError('This PDF could not be displayed. Upload a readable PDF and try again.');
        setLoading(false);
      }
    });
    return () => {
      active = false;
      void loadingTask.destroy();
    };
  }, [fileUrl]);

  useEffect(() => {
    if (!pdfDocument || !pageCount) return;
    let active = true;
    const renderTasks: pdfjs.RenderTask[] = [];
    const rendered = new Set<number>();
    let observer: IntersectionObserver | null = null;
    const renderPage = async (pageIndex: number) => {
      if (!active || rendered.has(pageIndex)) return;
      const host = pageCanvases.current[pageIndex];
      if (!host) return;
      rendered.add(pageIndex);
      try {
        const page = await pdfDocument.getPage(pageIndex + 1);
        const natural = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: Math.min(1.35, 760 / natural.width) });
        const canvas = window.document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        canvas.className = 'block h-auto w-full';
        host.replaceChildren(canvas);
        const task = page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport });
        renderTasks.push(task);
        await task.promise;
      } catch {
        rendered.delete(pageIndex);
        if (active) setError('A PDF page could not be displayed. Download the agreement or reopen it to try again.');
      }
    };
    const prepare = async () => {
      try {
        for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
          const page = await pdfDocument.getPage(pageIndex + 1);
          const natural = page.getViewport({ scale: 1 });
          const host = pageCanvases.current[pageIndex];
          if (host) host.style.aspectRatio = `${natural.width} / ${natural.height}`;
        }
        if (!active) return;
        if ('IntersectionObserver' in window) {
          observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
              if (!entry.isIntersecting) return;
              const pageIndex = Number((entry.target as HTMLElement).dataset.pageIndex);
              void renderPage(pageIndex);
            });
          }, { root: scrollRef.current, rootMargin: '480px 0px' });
          pageRefs.current.forEach((page) => page && observer?.observe(page));
        } else {
          for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) await renderPage(pageIndex);
        }
      } catch {
        if (active) setError('This PDF could not be displayed. Upload a readable PDF and try again.');
      }
    };
    void prepare();
    return () => {
      active = false;
      observer?.disconnect();
      renderTasks.forEach((task) => task.cancel());
      pageCanvases.current.forEach((host) => host?.replaceChildren());
    };
  }, [pageCount, pdfDocument]);

  const place = (event: React.MouseEvent<HTMLDivElement>, pageIndex: number, signer: ContractSigner, kind: ContractFieldKind) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const field = createContractField(signer, kind, pageIndex, (event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height);
    onChange([...fields, field]);
  };

  const placing = mode === 'place';
  return <div data-editor-root className="space-y-4">
    {placing && <div className="flex flex-wrap gap-2">
      {([
        ['recipient', 'signature', 'Recipient signature'],
        ['recipient', 'name', 'Recipient name'],
        ['recipient', 'date', 'Recipient date'],
        ['countersigner', 'signature', 'Flown signature'],
        ['countersigner', 'name', 'Flown name'],
        ['countersigner', 'date', 'Flown date'],
      ] as const).map(([fieldSigner, kind, title]) => {
        const key = `${fieldSigner}:${kind}`;
        return <button key={key} type="button" aria-pressed={activeField === key} onClick={() => setActiveField(key)}
          className={`rounded-md px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700 ${activeField === key ? 'bg-sky-800' : 'bg-slate-800'}`}>
        {title}
      </button>;
      })}
    </div>}
    {placing && <p className="text-xs text-slate-400">Choose a field, then click where it belongs on the agreement. Drag fields to adjust their position; remove extras with ×.</p>}
    {loading && <p role="status" className="text-sm text-slate-400">Loading PDF pages…</p>}
    {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
    <div ref={scrollRef} className="max-h-[55vh] space-y-4 overflow-auto rounded-lg bg-slate-950 p-3">
      {Array.from({ length: pageCount }, (_, pageIndex) => <div key={pageIndex}
        ref={(element) => { pageRefs.current[pageIndex] = element; }}
        onClick={(event) => {
          if (!placing) return;
          const field = activeField.split(':');
          if (field && (field[0] === 'recipient' || field[0] === 'countersigner') && ['name', 'date', 'signature'].includes(field[1])) {
            place(event, pageIndex, field[0], field[1] as ContractFieldKind);
          }
        }}
        data-page-index={pageIndex}
        className={`relative mx-auto w-full max-w-[760px] bg-[#ffffff] ${placing ? 'cursor-crosshair' : ''}`}>
        <div ref={(element) => { pageCanvases.current[pageIndex] = element; }} className="w-full" />
        {fields.filter((field) => field.pageIndex === pageIndex).map((field) => {
          const canSign = mode === 'sign' && field.signer === signer;
          return <div key={field.id}
            draggable={placing}
            onDragEnd={placing ? (event) => {
              const rect = event.currentTarget.parentElement!.getBoundingClientRect();
              const x = Math.max(0, Math.min(1 - field.width, (event.clientX - rect.left) / rect.width));
              const y = Math.max(0, Math.min(1 - field.height, (event.clientY - rect.top) / rect.height));
              onChange(fields.map((item) => item.id === field.id ? { ...item, x, y } : item));
            } : undefined}
            onClick={(event) => { if (placing) event.stopPropagation(); }}
            className={`absolute flex items-center overflow-hidden text-[11px] font-semibold leading-tight text-[#0f172a] ${placing ? 'cursor-move justify-between border-2 border-sky-600 bg-sky-100/80 px-1' : canSign ? 'border-2 border-sky-600 bg-[#ffffff]' : 'border border-slate-300 bg-[#ffffff]/80 px-1'}`}
            style={{ left: `${field.x * 100}%`, top: `${field.y * 100}%`, width: `${field.width * 100}%`, height: `${field.height * 100}%` }}>
            {placing ? <>
              <span className="truncate">{contractFieldLabel(field)}</span>
              <button type="button" aria-label={`Remove ${contractFieldLabel(field)} field`} onClick={() => onChange(fields.filter((item) => item.id !== field.id))} className="shrink-0 rounded bg-[#ffffff] px-1 text-sm leading-4">×</button>
            </> : field.kind === 'signature' && canSign
              ? <SignatureFieldCanvas value={signatures[field.id] || ''} onChange={(value) => setSignatures((current) => ({ ...current, [field.id]: value }))} />
              : <span className="truncate">{field.kind === 'name' && canSign ? nameValue || 'Full legal name' : field.kind === 'date' && canSign ? new Date().toISOString().slice(0, 10) : canSign ? '' : contractFieldLabel(field)}</span>}
          </div>;
        })}
      </div>)}
    </div>
    <p className="text-xs text-slate-400">{pageCount ? `${pageCount} PDF page${pageCount === 1 ? '' : 's'} · ${fields.length} fields placed` : ''}</p>
  </div>;
};

const SignatureFieldCanvas: React.FC<{ value: string; onChange: (value: string) => void }> = ({ value, onChange }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context || !value) return;
    const image = new Image();
    image.onload = () => context.drawImage(image, 0, 0, canvas.width, canvas.height);
    image.src = value;
  }, []);
  const draw = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * canvas.width / rect.width;
    const y = (event.clientY - rect.top) * canvas.height / rect.height;
    context.strokeStyle = '#0f172a';
    context.lineWidth = 3;
    context.lineCap = 'round';
    if (event.type === 'pointerdown') {
      drawing.current = true;
      context.beginPath();
      context.moveTo(x, y);
      canvas.setPointerCapture(event.pointerId);
      return;
    }
    if (!drawing.current) return;
    context.lineTo(x, y);
    context.stroke();
    onChange(canvas.toDataURL('image/png'));
  };
  return <canvas ref={canvasRef} width={600} height={140} aria-label="Draw signature in this PDF field"
    onPointerDown={draw} onPointerMove={draw} onPointerUp={() => { drawing.current = false; }}
    onPointerCancel={() => { drawing.current = false; }}
    className="h-full w-full touch-none bg-[#ffffff]" />;
};
