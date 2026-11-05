import React from 'react';
import { Cable, Code2, Cog, Network, type LucideIcon } from 'lucide-react';
import { X } from 'lucide-react';

export type Discipline = 'software' | 'mechanical' | 'electrical' | 'systems';
export type ReviewType = 'cad' | 'pcb' | 'code' | 'design' | 'safety' | 'release';

export type EngProject = {
  id: string; discipline: Discipline; name: string; description: string | null; status: string;
  owner_id: string | null; start_date: string | null; target_date: string | null; created_by: string; created_at: string; updated_at: string;
};
export type EngEntry = { id: string; project_id: string; author_id: string; kind: string; body: string; created_at: string };
export type EngFile = { id: string; project_id: string; uploaded_by: string; name: string; storage_path: string; size_bytes: number | null; mime_type: string | null; kind: string; note: string | null; created_at: string };
export type EngReview = {
  id: string; project_id: string; file_id: string | null; review_type: ReviewType; title: string; summary: string | null; requested_action: string | null;
  status: 'pending' | 'in_review' | 'decided'; outcome: string | null; decision_note: string | null; decided_by: string | null; decided_at: string | null; submitted_by: string; created_at: string;
};
export type EngVote = { id: string; review_id: string; reviewer_id: string; verdict: 'approve' | 'changes' | 'reject'; comment: string | null; created_at: string };

export const DISCIPLINES: { id: Discipline; label: string; icon: LucideIcon; blurb: string }[] = [
  { id: 'software', label: 'Software', icon: Code2, blurb: 'Firmware, backend, apps and tooling projects.' },
  { id: 'mechanical', label: 'Mechanical', icon: Cog, blurb: 'Parts and assemblies from CAD through printing or machining.' },
  { id: 'electrical', label: 'Electrical', icon: Cable, blurb: 'Schematics, PCBs, fabrication and assembly.' },
  { id: 'systems', label: 'Systems', icon: Network, blurb: 'Integration, requirements and verification across disciplines.' },
];

export const PROJECT_STATUS: Record<string, string> = { planning: 'Planning', active: 'Active', in_review: 'In review', on_hold: 'On hold', completed: 'Completed', archived: 'Archived' };
export const statusTone: Record<string, string> = { planning: 'bg-slate-100 text-slate-600', active: 'bg-emerald-50 text-emerald-700', in_review: 'bg-amber-50 text-amber-700', on_hold: 'bg-rose-50 text-rose-700', completed: 'bg-brand-50 text-brand-700', archived: 'bg-slate-100 text-slate-400' };

export const ENTRY_KINDS: Record<string, string> = { update: 'Update', decision: 'Decision', issue: 'Issue', milestone: 'Milestone' };
export const FILE_KINDS: Record<string, string> = { model_3d: '3D model', cad: 'CAD', pcb: 'PCB / Gerber', code: 'Code', doc: 'Document', other: 'Other' };

export const REVIEW_TYPES: Record<ReviewType, { label: string; actions: string[]; outcomes: string[] }> = {
  cad: { label: 'CAD review', actions: ['3D print', 'CNC machining', 'Sheet metal / laser cut', 'Design sign-off'], outcomes: ['Approved for 3D printing', 'Approved for machining', 'Approved for fabrication', 'Changes requested', 'Rejected'] },
  pcb: { label: 'PCB review', actions: ['Fabrication', 'Assembly', 'Design sign-off'], outcomes: ['Approved for fabrication', 'Approved for assembly', 'Changes requested', 'Rejected'] },
  code: { label: 'Code review', actions: ['Merge', 'Release', 'Design sign-off'], outcomes: ['Approved to merge', 'Approved for release', 'Changes requested', 'Rejected'] },
  design: { label: 'Design review', actions: ['Design sign-off', 'Proceed to build'], outcomes: ['Approved', 'Approved with actions', 'Changes requested', 'Rejected'] },
  safety: { label: 'Safety review', actions: ['Safety sign-off'], outcomes: ['Approved', 'Approved with actions', 'Changes requested', 'Rejected'] },
  release: { label: 'Release readiness', actions: ['Release'], outcomes: ['Approved for release', 'Approved with actions', 'Changes requested', 'Rejected'] },
};
export const defaultReviewType: Record<Discipline, ReviewType> = { software: 'code', mechanical: 'cad', electrical: 'pcb', systems: 'design' };
export const MIN_VOTES = 2;

export const VERDICTS: Record<string, { label: string; tone: string }> = {
  approve: { label: 'Approve', tone: 'bg-emerald-50 text-emerald-700' },
  changes: { label: 'Request changes', tone: 'bg-amber-50 text-amber-700' },
  reject: { label: 'Reject', tone: 'bg-rose-50 text-rose-700' },
};
export const outcomeTone = (outcome: string | null) => (!outcome ? 'bg-slate-100 text-slate-600' : /^Approved/i.test(outcome) ? 'bg-emerald-50 text-emerald-700' : /Changes/i.test(outcome) ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700');

export const disciplineOf = (id: string) => DISCIPLINES.find((item) => item.id === id) ?? DISCIPLINES[0];
export const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-base outline-none focus:border-brand-400 md:text-xs';
export const ago = (iso: string) => {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
};
export const today = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; };
export const fileSize = (bytes: number | null) => (bytes == null ? '' : bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
export const navigate = (path: string) => {
  if (window.location.pathname !== path) window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
};

export const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-3" onClick={onClose}>
    <div role="dialog" aria-label={title} onClick={(event) => event.stopPropagation()} className="max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
      <div className="flex items-center justify-between"><h2 className="text-sm font-bold text-slate-900">{title}</h2><button type="button" onClick={onClose} aria-label="Close" className="-m-2 p-2"><X className="h-4 w-4 text-slate-400" /></button></div>
      <div className="mt-4 space-y-3">{children}</div>
    </div>
  </div>
);
