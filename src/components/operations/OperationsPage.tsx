import React from 'react';
import { Activity, BriefcaseBusiness, CheckCircle2, Clock3, Plus, Users } from 'lucide-react';

const cards = [
  ['Active work', '12', 'Projects and operational work in progress', BriefcaseBusiness],
  ['Due this week', '7', 'Deadlines across internal teams', Clock3],
  ['Waiting on review', '3', 'Items that need an owner decision', CheckCircle2],
  ['Team activity', '28', 'Updates recorded this week', Activity],
];

export const OperationsPage: React.FC = () => (
  <main className="min-w-0 flex-1 overflow-y-auto bg-[#f7f9fc]">
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-5 sm:px-8">
      <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-600">Internal operations</p><h1 className="mt-1 text-xl font-bold text-slate-900">Operations</h1><p className="mt-1 text-xs text-slate-500">Projects, routines, team work, and operational follow-through.</p></div>
      <button type="button" className="rounded-xl bg-brand-600 px-3 py-2 text-xs font-bold text-white"><Plus className="mr-1 inline h-3.5 w-3.5" /> New work item</button>
    </header>
    <div className="mx-auto max-w-7xl p-5 sm:p-8">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([label, value, detail, Icon]) => <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-4"><Icon className="h-4 w-4 text-brand-600" /><p className="mt-3 text-xs text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-900">{value as string}</p><p className="mt-1 text-[10px] text-slate-400">{detail}</p></div>)}</div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2"><section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-sm font-bold text-slate-900">Workstreams</h2>{['Annual planning', 'Program delivery', 'Team onboarding', 'Vendor operations'].map((item, index) => <div key={item} className="flex items-center gap-3 border-b border-slate-100 py-3"><BriefcaseBusiness className="h-4 w-4 text-brand-600" /><span className="flex-1 text-xs font-semibold text-slate-700">{item}</span><span className="text-[10px] text-slate-400">{index + 2} tasks</span></div>)}</section><section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-sm font-bold text-slate-900">Team pulse</h2><p className="mt-2 text-xs leading-5 text-slate-500">Keep internal work visible, assign owners, and connect operational updates to meetings, customers, and grant work.</p><div className="mt-5 flex items-center gap-2 text-xs font-semibold text-brand-700"><Users className="h-4 w-4" /> 9 active contributors</div></section></div>
    </div>
  </main>
);
