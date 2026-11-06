import React, { useCallback, useRef, useState } from 'react';

type Options = { title: string; message?: string; confirmLabel?: string; variant?: 'danger' | 'primary' };

/** Promise-based confirmation dialog for destructive actions. Render `dialog` once in the component. */
export const useConfirm = () => {
  const [options, setOptions] = useState<Options | null>(null);
  const resolver = useRef<(value: boolean) => void>();

  const confirm = useCallback((next: Options) => new Promise<boolean>((resolve) => {
    resolver.current = resolve;
    setOptions(next);
  }), []);

  const close = (value: boolean) => { resolver.current?.(value); setOptions(null); };

  const dialog = options ? (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/40 p-4" role="alertdialog" aria-modal="true" aria-label={options.title} onKeyDown={(event) => { if (event.key === 'Escape') close(false); }}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
        <h3 className="text-sm font-bold text-slate-900">{options.title}</h3>
        {options.message && <p className="mt-1 text-xs text-slate-500">{options.message}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" autoFocus onClick={() => close(false)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100">Cancel</button>
          <button type="button" onClick={() => close(true)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white ${options.variant === 'primary' ? 'bg-brand-600 hover:bg-brand-700' : 'bg-rose-600 hover:bg-rose-700'}`}>{options.confirmLabel || 'Delete'}</button>
        </div>
      </div>
    </div>
  ) : null;

  return { confirm, dialog };
};
