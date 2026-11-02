import React, { useMemo } from 'react';

type P = { id: string; name: string; start_date: string | null; end_date: string | null; progress: number; status: string };
type T = { id: string; project_id: string | null; title: string; due_date: string | null; start_date?: string | null; progress: number; parent_task_id?: string | null; status: string };
type M = { id: string; project_id: string; title: string; due_date: string | null };

const DAY = 86400000;
const ts = (d: string | null | undefined) => (d ? new Date(`${d}T00:00:00`).getTime() : NaN);

export const Timeline: React.FC<{ projects: P[]; tasks: T[]; milestones: M[] }> = ({ projects, tasks, milestones }) => {
  const rows = useMemo(() => {
    const out: { key: string; label: string; start: number; end: number; progress: number; kind: 'project' | 'task' }[] = [];
    for (const p of projects) {
      const pt = tasks.filter((t) => t.project_id === p.id && !t.parent_task_id);
      const dates = [ts(p.start_date), ts(p.end_date), ...pt.flatMap((t) => [ts(t.start_date), ts(t.due_date)])].filter((n) => !Number.isNaN(n));
      if (!dates.length) continue;
      out.push({ key: p.id, label: p.name, start: Number.isNaN(ts(p.start_date)) ? Math.min(...dates) : ts(p.start_date), end: Number.isNaN(ts(p.end_date)) ? Math.max(...dates) : ts(p.end_date), progress: p.progress, kind: 'project' });
      for (const t of pt) {
        const end = ts(t.due_date);
        const start = Number.isNaN(ts(t.start_date)) ? end : ts(t.start_date);
        if (Number.isNaN(end)) continue;
        out.push({ key: t.id, label: t.title, start: Math.min(start, end), end, progress: t.progress, kind: 'task' });
      }
    }
    return out;
  }, [projects, tasks]);

  if (!rows.length) return <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-xs text-slate-500">Add start and due dates to projects and tasks to see them on the timeline.</div>;

  const min = Math.min(...rows.map((r) => r.start));
  const max = Math.max(...rows.map((r) => r.end)) + DAY;
  const span = Math.max(max - min, DAY);
  const pct = (v: number) => ((v - min) / span) * 100;
  const today = Date.now();
  const months: { label: string; left: number }[] = [];
  for (let d = new Date(min); d.getTime() < max; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    months.push({ label: d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }), left: Math.max(0, pct(new Date(d.getFullYear(), d.getMonth(), 1).getTime())) });
  }
  const ms = milestones.filter((m) => !Number.isNaN(ts(m.due_date)) && ts(m.due_date) >= min && ts(m.due_date) <= max);

  return (
    <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="min-w-[720px]">
        <div className="relative flex h-8 border-b border-slate-100 pl-56 text-xs font-bold uppercase text-slate-400">
          <div className="relative flex-1">{months.map((m) => <span key={m.label + m.left} className="absolute top-2" style={{ left: `${m.left}%` }}>{m.label}</span>)}</div>
        </div>
        <div className="relative">
          {rows.map((r) => (
            <div key={r.key} className="flex h-9 items-center border-b border-slate-50">
              <div className={`w-56 shrink-0 truncate px-3 text-xs ${r.kind === 'project' ? 'font-bold text-slate-900' : 'pl-7 text-slate-600'}`} title={r.label}>{r.label}</div>
              <div className="relative h-full flex-1">
                <div className={`absolute top-2.5 h-4 overflow-hidden rounded ${r.kind === 'project' ? 'bg-brand-200' : 'bg-slate-200'}`} style={{ left: `${pct(r.start)}%`, width: `${Math.max(pct(r.end + DAY) - pct(r.start), 0.8)}%` }}>
                  <div className={`h-full ${r.kind === 'project' ? 'bg-brand-600' : 'bg-slate-500'}`} style={{ width: `${Math.min(100, Math.max(0, r.progress || 0))}%` }} />
                </div>
              </div>
            </div>
          ))}
          <div className="pointer-events-none absolute inset-y-0 left-56 right-0">
            {today >= min && today <= max && <div className="absolute inset-y-0 w-px bg-rose-400" style={{ left: `${pct(today)}%` }} title="Today" />}
            {ms.map((m) => <div key={m.id} className="absolute inset-y-0 w-px bg-amber-400/70" style={{ left: `${pct(ts(m.due_date))}%` }} title={m.title} />)}
          </div>
        </div>
      </div>
    </section>
  );
};
