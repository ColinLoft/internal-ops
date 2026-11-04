import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, X } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';

type Tab = Parameters<ReturnType<typeof useWorkspace>['setActiveTab']>[0];

const GO: Record<string, [Tab, string]> = {
  h: ['home', 'Home'], m: ['messages', 'Messages'], k: ['calendar', 'Calendar'], e: ['inbox', 'Email'],
  d: ['drive', 'Drive'], t: ['programs', 'Projects & tasks'], u: ['customers', 'Customers'], g: ['finance', 'Grants'], s: ['settings', 'Settings'],
};

const typing = (target: EventTarget | null) => {
  const element = target as HTMLElement | null;
  return !!element && (element.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName));
};

/** Global keyboard shortcuts: "g" then a letter to jump, "n" then "t" for a new task, "?" for help. */
export const ShortcutsHelp: React.FC = () => {
  const { setActiveTab, workspaceSettings } = useWorkspace();
  const enabled = workspaceSettings.keyboardShortcuts;
  const [open, setOpen] = useState(false);
  const pending = useRef<{ key: string; at: number } | null>(null);

  useEffect(() => {
    if (!enabled) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); return; }
      if (event.metaKey || event.ctrlKey || event.altKey || typing(event.target)) return;
      const key = event.key.toLowerCase();
      if (event.key === '?') { event.preventDefault(); setOpen((value) => !value); return; }
      const previous = pending.current && Date.now() - pending.current.at < 1200 ? pending.current.key : null;
      pending.current = null;
      if (previous === 'g' && GO[key]) { event.preventDefault(); setActiveTab(GO[key][0]); return; }
      if (previous === 'n' && key === 't') {
        event.preventDefault();
        window.history.pushState({}, '', '/programs/tasks?newTask=');
        window.dispatchEvent(new PopStateEvent('popstate'));
        return;
      }
      if (key === 'g' || key === 'n') pending.current = { key, at: Date.now() };
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setActiveTab, enabled]);

  if (!open) return null;
  const kbd = 'rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] text-slate-600';
  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" onClick={() => setOpen(false)}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between"><h2 className="flex items-center gap-2 text-sm font-bold text-slate-900"><Keyboard className="h-4 w-4 text-brand-600" />Keyboard shortcuts</h2><button type="button" onClick={() => setOpen(false)} aria-label="Close"><X className="h-4 w-4 text-slate-400" /></button></div>
        <ul className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs text-slate-600">
          <li className="flex items-center justify-between"><span>Search</span><span><kbd className={kbd}>⌘</kbd> <kbd className={kbd}>K</kbd></span></li>
          <li className="flex items-center justify-between"><span>New task</span><span><kbd className={kbd}>n</kbd> <kbd className={kbd}>t</kbd></span></li>
          {Object.entries(GO).map(([key, [, name]]) => <li key={key} className="flex items-center justify-between"><span>Go to {name}</span><span><kbd className={kbd}>g</kbd> <kbd className={kbd}>{key}</kbd></span></li>)}
          <li className="flex items-center justify-between"><span>This help</span><kbd className={kbd}>?</kbd></li>
        </ul>
      </div>
    </div>
  );
};
