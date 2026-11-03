import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from 'lucide-react';

interface PanelLayoutProps {
  storageKey: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  leftWidth?: number;
  rightWidth?: number;
  leftLabel?: string;
  rightLabel?: string;
  /** On narrow screens the side panels are hidden unless this is set. */
  showSidesOnMobile?: boolean;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const load = (key: string, fallback: { l: number; r: number; lc: boolean; rc: boolean }) => {
  try { return { ...fallback, ...JSON.parse(localStorage.getItem(key) || '{}') }; } catch { return fallback; }
};

/** Reusable three-panel workspace: resizable, collapsible side panels around a main area. */
export const PanelLayout: React.FC<PanelLayoutProps> = ({ storageKey, left, right, children, leftWidth = 288, rightWidth = 320, leftLabel = 'list', rightLabel = 'details', showSidesOnMobile = false }) => {
  const key = `flown-panels-${storageKey}`;
  const [state, setState] = useState(() => load(key, { l: leftWidth, r: rightWidth, lc: false, rc: false }));
  const drag = useRef<{ side: 'l' | 'r'; startX: number; start: number } | null>(null);

  useEffect(() => { localStorage.setItem(key, JSON.stringify(state)); }, [key, state]);

  const onMove = useCallback((event: PointerEvent) => {
    const current = drag.current;
    if (!current) return;
    const delta = event.clientX - current.startX;
    const next = current.side === 'l' ? current.start + delta : current.start - delta;
    setState((previous: typeof state) => ({ ...previous, [current.side]: clamp(next, 220, 560) }));
  }, []);

  const stop = useCallback(() => {
    drag.current = null;
    document.body.style.userSelect = '';
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', stop);
  }, [onMove]);

  const start = (side: 'l' | 'r') => (event: React.PointerEvent) => {
    drag.current = { side, startX: event.clientX, start: state[side] };
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', stop);
    event.preventDefault();
  };

  const nudge = (side: 'l' | 'r') => (event: React.KeyboardEvent) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const grow = (event.key === 'ArrowRight') === (side === 'l');
    setState((previous: typeof state) => ({ ...previous, [side]: clamp(previous[side] + (grow ? 16 : -16), 220, 560) }));
  };

  const setCollapsed = (side: 'l' | 'r', value: boolean) => setState((previous: typeof state) => ({ ...previous, [side === 'l' ? 'lc' : 'rc']: value }));

  const handle = (side: 'l' | 'r') => (
    <div role="separator" aria-orientation="vertical" tabIndex={0} aria-label={`Resize ${side === 'l' ? leftLabel : rightLabel} panel`} onPointerDown={start(side)} onKeyDown={nudge(side)} className="group relative hidden w-1.5 shrink-0 cursor-col-resize items-stretch justify-center lg:flex">
      <span className="w-px bg-slate-200 transition-colors group-hover:w-0.5 group-hover:bg-brand-400 group-focus-visible:bg-brand-500" />
      <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => setCollapsed(side, true)} title={`Hide ${side === 'l' ? leftLabel : rightLabel}`} aria-label={`Hide ${side === 'l' ? leftLabel : rightLabel}`} className="absolute top-1/2 z-10 hidden h-8 w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 shadow-sm hover:text-brand-600 group-hover:flex" style={{ left: '50%' }}>
        {side === 'l' ? <PanelLeftClose className="h-3 w-3" /> : <PanelRightClose className="h-3 w-3" />}
      </button>
    </div>
  );

  const reopen = (side: 'l' | 'r') => (
    <button type="button" onClick={() => setCollapsed(side, false)} title={`Show ${side === 'l' ? leftLabel : rightLabel}`} aria-label={`Show ${side === 'l' ? leftLabel : rightLabel}`} className="hidden h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 shadow-sm hover:text-brand-600 lg:flex">
      {side === 'l' ? <PanelLeftOpen className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
    </button>
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
      {left && !state.lc && (
        <>
          <div style={{ width: state.l }} className={`${showSidesOnMobile ? 'flex' : 'hidden lg:flex'} max-w-full shrink-0 flex-col overflow-hidden max-lg:!w-full`}>{left}</div>
          {handle('l')}
        </>
      )}
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="absolute right-3 top-3 z-20 flex gap-1 empty:hidden">
          {left && state.lc && reopen('l')}
          {right && state.rc && reopen('r')}
        </div>
        {children}
      </div>
      {right && !state.rc && (
        <>
          {handle('r')}
          <div style={{ width: state.r }} className="hidden shrink-0 flex-col overflow-hidden lg:flex">{right}</div>
        </>
      )}
    </div>
  );
};
