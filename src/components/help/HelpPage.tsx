import React, { useEffect, useMemo, useState } from 'react';
import {
  Bug,
  CheckCircle2,
  CircleHelp,
  Clock3,
  FileText,
  Lightbulb,
  MessageSquarePlus,
  Search,
  Send,
  ShieldAlert,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';

type HelpTicket = {
  id: string;
  subject: string;
  topic: string;
  department: string;
  priority: string;
  description: string;
  status: 'Submitted' | 'In review' | 'Waiting for information' | 'Resolved';
  createdAt: string;
};

const STORAGE_KEY = 'flown_help_tickets_v1';

const topics = [
  { value: 'Bug report', description: 'Something is broken or not working as expected.', icon: Bug },
  { value: 'Feature request', description: 'Suggest an improvement or new capability.', icon: Lightbulb },
  { value: 'Question', description: 'Ask how something works or where to find it.', icon: CircleHelp },
  { value: 'Access or account issue', description: 'Report a login, permission, or account problem.', icon: ShieldAlert },
  { value: 'Other issue', description: 'Send another internal request for support.', icon: MessageSquarePlus },
];

const departments = ['Operations', 'Engineering', 'Finance', 'Customers', 'Systems', 'GTM', 'Legal'];

export const HelpPage: React.FC = () => {
  const { currentUser } = useWorkspace();
  const [tickets, setTickets] = useState<HelpTicket[]>([]);
  const [topic, setTopic] = useState('Bug report');
  const [department, setDepartment] = useState('Operations');
  const [priority, setPriority] = useState('Normal');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [context, setContext] = useState('');
  const [search, setSearch] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setTickets(JSON.parse(saved) as HelpTicket[]);
    } catch {
      setTickets([]);
    }
  }, []);

  const visibleTickets = useMemo(() => tickets.filter((ticket) =>
    `${ticket.id} ${ticket.subject} ${ticket.topic} ${ticket.status}`.toLowerCase().includes(search.toLowerCase())
  ), [tickets, search]);

  const submitTicket = (event: React.FormEvent) => {
    event.preventDefault();
    const ticket: HelpTicket = {
      id: `HELP-${Date.now().toString().slice(-6)}`,
      subject: subject.trim(),
      topic,
      department,
      priority,
      description: `${description.trim()}${context.trim() ? `\n\nAdditional context:\n${context.trim()}` : ''}`,
      status: 'Submitted',
      createdAt: new Date().toISOString(),
    };
    const nextTickets = [ticket, ...tickets];
    setTickets(nextTickets);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextTickets));
    setSubject('');
    setDescription('');
    setContext('');
    setSubmitted(true);
  };

  return (
    <main className="min-w-0 flex-1 overflow-y-auto bg-[#f7f9fc]">
      <header className="border-b border-slate-200 bg-white px-5 py-6 sm:px-8">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-600">Internal support</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">Help Center</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">Report a bug, ask a question, or send an idea to the team best equipped to help.</p>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 p-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,.9fr)] sm:p-8">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><MessageSquarePlus className="h-5 w-5" /></span>
            <div><h2 className="text-sm font-bold text-slate-900">Create a help request</h2><p className="text-xs text-slate-500">Give the team enough detail to route and resolve it quickly.</p></div>
          </div>
          {submitted && <div className="mb-5 flex items-start gap-2 rounded-xl border border-brand-200 bg-brand-50 p-3 text-xs text-brand-800"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /><span>Your ticket was submitted. You can follow its status in My requests.</span></div>}
          <form onSubmit={submitTicket} className="space-y-5">
            <fieldset>
              <legend className="mb-2 text-xs font-bold text-slate-700">What do you need help with?</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {topics.map(({ value, description: detail, icon: Icon }) => <button key={value} type="button" onClick={() => setTopic(value)} className={`flex items-start gap-2 rounded-xl border p-3 text-left transition-colors ${topic === value ? 'border-brand-300 bg-brand-50' : 'border-slate-200 hover:border-brand-200'}`}><Icon className={`mt-0.5 h-4 w-4 shrink-0 ${topic === value ? 'text-brand-600' : 'text-slate-400'}`} /><span><span className="block text-xs font-bold text-slate-800">{value}</span><span className="mt-0.5 block text-[10px] leading-4 text-slate-500">{detail}</span></span></button>)}
              </div>
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-semibold text-slate-700">Suggested department<select value={department} onChange={(event) => setDepartment(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">{departments.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label className="text-xs font-semibold text-slate-700">Priority<select value={priority} onChange={(event) => setPriority(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"><option>Low</option><option>Normal</option><option>High</option><option>Urgent</option></select></label>
            </div>
            <label className="block text-xs font-semibold text-slate-700">Short summary<input required value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={140} placeholder="What is the request about?" className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-brand-400" /></label>
            <label className="block text-xs font-semibold text-slate-700">Describe the issue or request<textarea required value={description} onChange={(event) => setDescription(event.target.value)} rows={5} placeholder="What happened, what did you expect, and what should the team know?" className="mt-1 block w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-brand-400" /></label>
            <label className="block text-xs font-semibold text-slate-700">Helpful context <span className="font-normal text-slate-400">(optional)</span><textarea value={context} onChange={(event) => setContext(event.target.value)} rows={3} placeholder="Links, steps to reproduce, device/browser, affected records, or a deadline." className="mt-1 block w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-brand-400" /></label>
            <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-4"><p className="text-[10px] text-slate-400">Submitted as {currentUser.name} · ticket updates will appear here.</p><button type="submit" className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-brand-700"><Send className="h-3.5 w-3.5" /> Submit request</button></div>
          </form>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center justify-between gap-3"><div><h2 className="text-sm font-bold text-slate-900">My requests</h2><p className="mt-1 text-xs text-slate-500">Track requests you have submitted.</p></div><FileText className="h-5 w-5 text-brand-600" /></div>
          <div className="relative mt-4"><Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tickets" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-xs outline-none focus:border-brand-400" /></div>
          <div className="mt-4 space-y-2">{visibleTickets.length ? visibleTickets.map((ticket) => <article key={ticket.id} className="rounded-xl border border-slate-100 p-3"><div className="flex items-start justify-between gap-2"><div><p className="text-[10px] font-bold text-brand-700">{ticket.id}</p><h3 className="mt-1 text-xs font-bold text-slate-800">{ticket.subject}</h3></div><span className="rounded-full bg-brand-50 px-2 py-1 text-[10px] font-bold text-brand-700">{ticket.status}</span></div><p className="mt-2 text-[10px] text-slate-500">{ticket.topic} · {ticket.department} · {ticket.priority}</p><p className="mt-2 flex items-center gap-1 text-[10px] text-slate-400"><Clock3 className="h-3 w-3" />{new Date(ticket.createdAt).toLocaleString()}</p></article>) : <div className="py-12 text-center"><FileText className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-xs font-semibold text-slate-600">No requests yet</p><p className="mt-1 text-[10px] text-slate-400">Submitted requests and their latest status will appear here.</p></div>}</div>
        </section>
      </div>
    </main>
  );
};
