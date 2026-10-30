import React from 'react';
import { BookOpen, CheckCircle2, FileText, Plus, Scale } from 'lucide-react';

export const LegalPage: React.FC = () => (
  <main className="min-w-0 flex-1 overflow-y-auto bg-[#f7f9fc]">
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-5 sm:px-8">
      <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-600">Legal workspace</p><h1 className="mt-1 text-xl font-bold text-slate-900">Legal</h1><p className="mt-1 text-xs text-slate-500">Agreements, reviews, policies, and compliance follow-through.</p></div>
      <button type="button" className="rounded-xl bg-brand-600 px-3 py-2 text-xs font-bold text-white"><Plus className="mr-1 inline h-3.5 w-3.5" /> Add agreement</button>
    </header>
    <div className="mx-auto max-w-7xl p-5 sm:p-8"><div className="grid gap-3 sm:grid-cols-3"><Metric label="Open reviews" value="4" /><Metric label="Expiring soon" value="2" /><Metric label="Policies current" value="96%" /></div><div className="mt-5 grid gap-5 lg:grid-cols-2"><section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-sm font-bold text-slate-900">Agreement tracker</h2>{['Partner memorandum', 'Independent contractor agreement', 'Data processing addendum', 'Venue liability waiver'].map((item, index) => <div key={item} className="flex items-center gap-3 border-b border-slate-100 py-3"><FileText className="h-4 w-4 text-brand-600" /><span className="flex-1 text-xs font-semibold text-slate-700">{item}</span><span className="rounded-md bg-brand-50 px-2 py-1 text-[10px] font-bold text-brand-700">{index === 0 ? 'Review' : 'Current'}</span></div>)}</section><section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-sm font-bold text-slate-900">Compliance resources</h2><div className="mt-4 space-y-3"><Resource icon={<Scale />} text="Legal review queue" /><Resource icon={<BookOpen />} text="Policy library" /><Resource icon={<CheckCircle2 />} text="Acknowledgements and renewals" /></div></section></div></div>
  </main>
);

const Metric: React.FC<{ label: string; value: string }> = ({ label, value }) => <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold text-brand-600">{value}</p></div>;
const Resource: React.FC<{ icon: React.ReactNode; text: string }> = ({ icon, text }) => <button type="button" className="flex w-full items-center gap-3 rounded-xl border border-slate-100 p-3 text-left text-xs font-semibold text-slate-700 hover:bg-brand-50"><span className="text-brand-600 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>{text}</button>;
