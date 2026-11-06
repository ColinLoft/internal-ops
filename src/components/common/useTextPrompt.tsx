import React, { FormEvent, useCallback, useRef, useState } from 'react';

type Options = {
  title: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
};

export const useTextPrompt = () => {
  const [options, setOptions] = useState<Options | null>(null);
  const [value, setValue] = useState('');
  const resolver = useRef<(value: string | null) => void>();

  const prompt = useCallback((next: Options) => new Promise<string | null>((resolve) => {
    resolver.current = resolve;
    setValue(next.initialValue || '');
    setOptions(next);
  }), []);

  const close = (result: string | null) => {
    resolver.current?.(result);
    setOptions(null);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    close(value);
  };

  const dialog = options ? (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-label={options.title} onKeyDown={(event) => { if (event.key === 'Escape') close(null); }}>
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
        <h3 className="text-sm font-bold text-slate-900">{options.title}</h3>
        <input autoFocus value={value} onChange={(event) => setValue(event.target.value)} placeholder={options.placeholder} className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-500" />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={() => close(null)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100">Cancel</button>
          <button type="submit" className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700">{options.confirmLabel || 'Continue'}</button>
        </div>
      </form>
    </div>
  ) : null;

  return { prompt, dialog };
};
