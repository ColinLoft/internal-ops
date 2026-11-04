import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

interface DropdownProps<T extends string> {
  value: T;
  options: { id: T; label: string }[];
  onChange: (value: T) => void;
  ariaLabel?: string;
  className?: string;
}

export function Dropdown<T extends string>({ value, options, onChange, ariaLabel, className = '' }: DropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find((option) => option.id === value);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((state) => !state)}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:border-brand-300 md:min-h-0 md:py-2"
      >
        <span className="truncate">{current?.label ?? 'Select'}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul role="listbox" className="absolute left-0 top-full z-50 mt-1 max-h-64 min-w-full overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
          {options.map((option) => (
            <li key={option.id} role="option" aria-selected={option.id === value}>
              <button
                type="button"
                onClick={() => { onChange(option.id); setOpen(false); }}
                className={`flex w-full items-center justify-between gap-3 whitespace-nowrap rounded-lg px-3 py-1.5 text-left text-xs font-medium ${option.id === value ? 'bg-brand-50 text-brand-700' : 'text-slate-700 hover:bg-slate-50'}`}
              >
                {option.label}
                {option.id === value && <Check className="h-3.5 w-3.5" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
