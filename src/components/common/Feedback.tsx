import React from 'react';
import { ArrowUpRight } from 'lucide-react';

export const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div aria-hidden className={`animate-pulse rounded-md bg-slate-200/70 ${className}`} />
);

export const TableSkeleton: React.FC<{ rows?: number }> = ({ rows = 5 }) => (
  <div role="status" aria-label="Loading" className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
    {Array.from({ length: rows }, (_, index) => <Skeleton key={index} className="h-8 w-full" />)}
  </div>
);

export const CardSkeleton: React.FC<{ lines?: number }> = ({ lines = 3 }) => (
  <div role="status" aria-label="Loading" className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
    <Skeleton className="h-4 w-1/3" />
    {Array.from({ length: lines }, (_, index) => <Skeleton key={index} className="h-3 w-full" />)}
  </div>
);

export const EmptyState: React.FC<{ icon?: React.ElementType; title?: string; text: string; action?: string; onClick?: () => void; compact?: boolean }> = ({ icon: Icon, title, text, action, onClick, compact }) => (
  <div className={`flex flex-col items-center rounded-xl border border-dashed border-slate-200 text-center ${compact ? 'gap-1 p-3' : 'gap-1.5 p-6'}`}>
    {Icon && <Icon className={compact ? 'h-4 w-4 text-slate-300' : 'h-6 w-6 text-slate-300'} />}
    {title && <p className="text-xs font-bold text-slate-700">{title}</p>}
    <p className="text-xs text-slate-500">{text}</p>
    {action && onClick && <button type="button" onClick={onClick} className="mt-0.5 inline-flex h-7 items-center gap-1 rounded-lg bg-brand-50 px-2.5 text-xs font-bold text-brand-700 hover:bg-brand-100">{action}<ArrowUpRight className="h-3 w-3" /></button>}
  </div>
);

const provenance = {
  manual: { label: 'Manual', style: 'bg-slate-100 text-slate-600' },
  automated: { label: 'Automated', style: 'bg-emerald-50 text-emerald-700' },
  ai: { label: 'AI-assisted', style: 'bg-violet-50 text-violet-700' },
} as const;

/** Distinguishes manually completed, rule-automated and AI-assisted items. */
export const ProvenanceBadge: React.FC<{ kind: keyof typeof provenance }> = ({ kind }) => (
  <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${provenance[kind].style}`}>{provenance[kind].label}</span>
);
