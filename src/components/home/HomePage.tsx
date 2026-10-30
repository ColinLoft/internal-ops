import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  FolderOpen,
  Mail,
  MessageSquare,
  Plus,
  Sparkles,
  Target,
  Users,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { supabase } from '../../lib/supabase';

type RecentFile = { id: string; name: string; item_type: string; updated_at: string };

export const HomePage: React.FC = () => {
  const { currentUser, calendarEvents, conversations, channels, notifications, setActiveTab, setActiveConversationId, setActiveChannelId } = useWorkspace();
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
  const [visibleCards, setVisibleCards] = useState(['work', 'meetings', 'files', 'attention']);

  useEffect(() => {
    let active = true;
    const loadFiles = async () => {
      const { data } = await supabase.from('drive_items').select('id, name, item_type, updated_at').is('deleted_at', null).neq('item_type', 'folder').order('updated_at', { ascending: false }).limit(5);
      if (active && data) setRecentFiles(data as RecentFile[]);
    };
    void loadFiles();
    return () => { active = false; };
  }, []);

  const upcoming = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return calendarEvents.filter((event) => event.date >= today).sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`)).slice(0, 4);
  }, [calendarEvents]);
  const attention = notifications.filter((notification) => !notification.isRead).slice(0, 4);
  const latestConversation = conversations.filter((conversation) => conversation.lastMessage).slice(0, 4);
  const firstName = currentUser.name?.split(' ')[0] || 'there';

  const removeCard = (card: string) => setVisibleCards((cards) => cards.filter((entry) => entry !== card));

  return (
    <main className="min-w-0 flex-1 overflow-y-auto bg-gradient-to-br from-slate-50 via-white to-brand-50/60">
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:px-10">
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 via-brand-600 to-brand-500 p-7 text-white shadow-xl shadow-brand-900/10 sm:p-9">
          <div className="relative z-10 max-w-2xl"><p className="text-xs font-bold uppercase tracking-[0.2em] text-white/70">Your workspace</p><h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Good morning, {firstName}.</h1><p className="mt-3 max-w-xl text-sm leading-6 text-white/80">A quick view of what needs your attention, what is coming up, and what you have been working on.</p><div className="mt-6 flex flex-wrap gap-2"><button type="button" onClick={() => setActiveTab('calendar')} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-brand-700 hover:bg-brand-50"><CalendarDays className="h-4 w-4" /> View calendar</button><button type="button" onClick={() => setActiveTab('drive')} className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-4 py-2.5 text-xs font-bold text-white ring-1 ring-white/30 hover:bg-white/20"><FolderOpen className="h-4 w-4" /> Open Drive</button></div></div>
          <Sparkles className="absolute -bottom-8 -right-4 h-48 w-48 text-white/10" />
        </section>

        <div className="mt-7 flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">At a glance</p><h2 className="mt-1 text-xl font-bold text-slate-900">Your day in Flown</h2></div><button type="button" onClick={() => setVisibleCards(['work', 'meetings', 'files', 'attention'])} className="text-xs font-semibold text-slate-400 hover:text-brand-700">Reset layout</button></div>
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          {visibleCards.includes('work') && <HomeCard title="My work" icon={<Target className="h-4 w-4" />} tone="sky" onRemove={() => removeCard('work')} action={<button type="button" className="text-slate-400 hover:text-brand-700" title="Add work item"><Plus className="h-4 w-4" /></button>}><div className="space-y-2"><WorkRow title="Q4 operations plan" detail="In progress · 68%" progress={68} /><WorkRow title="Community event launch" detail="Next milestone Friday" progress={42} /></div><button type="button" className="mt-4 flex items-center gap-1 text-xs font-bold text-brand-700 hover:text-brand-800">View project workspace <ArrowUpRight className="h-3.5 w-3.5" /></button></HomeCard>}
          {visibleCards.includes('meetings') && <HomeCard title="Upcoming meetings" icon={<CalendarDays className="h-4 w-4" />} tone="violet" onRemove={() => removeCard('meetings')}><div className="space-y-2">{upcoming.length ? upcoming.map((event) => <button key={event.id} type="button" onClick={() => setActiveTab('calendar')} className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-brand-50"><div className="w-12 rounded-lg bg-brand-100 px-2 py-1 text-center text-[10px] font-bold text-brand-700"><span className="block text-sm">{new Date(`${event.date}T12:00:00`).getDate()}</span>{new Date(`${event.date}T12:00:00`).toLocaleDateString(undefined, { month: 'short' })}</div><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-slate-800">{event.title}</p><p className="mt-0.5 text-[11px] text-slate-500"><Clock3 className="mr-1 inline h-3 w-3" />{event.startTime} · {event.location || 'Calendar meeting'}</p></div><ChevronRight className="h-4 w-4 text-slate-300" /></button>) : <EmptyState text="No upcoming meetings scheduled." action="Open calendar" onClick={() => setActiveTab('calendar')} />}</div></HomeCard>}
          {visibleCards.includes('files') && <HomeCard title="Recent files" icon={<FolderOpen className="h-4 w-4" />} tone="emerald" onRemove={() => removeCard('files')}><div className="space-y-1">{recentFiles.length ? recentFiles.map((file) => <button key={file.id} type="button" onClick={() => setActiveTab('drive')} className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-brand-50"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-100 text-brand-700"><FileText className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-slate-800">{file.name}</span><span className="text-[10px] text-slate-400">{file.item_type} · {new Date(file.updated_at).toLocaleDateString()}</span></span><ChevronRight className="h-4 w-4 text-slate-300" /></button>) : <EmptyState text="Your recent Drive files will appear here." action="Open Drive" onClick={() => setActiveTab('drive')} />}</div></HomeCard>}
          {visibleCards.includes('attention') && <HomeCard title="Needs your attention" icon={<CheckCircle2 className="h-4 w-4" />} tone="amber" onRemove={() => removeCard('attention')}><div className="space-y-1">{attention.length ? attention.map((notification) => <button key={notification.id} type="button" onClick={() => { if (notification.linkTab === 'messages' && notification.targetId) setActiveConversationId(notification.targetId); if (notification.linkTab === 'channels' && notification.targetId) setActiveChannelId(notification.targetId); setActiveTab(notification.linkTab); }} className="flex w-full items-start gap-3 rounded-xl p-2 text-left hover:bg-brand-50"><span className="mt-1 h-2 w-2 rounded-full bg-brand-500" /><span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-slate-800">{notification.title}</span><span className="mt-0.5 block truncate text-[11px] text-slate-500">{notification.description}</span></span><ChevronRight className="mt-1 h-4 w-4 text-slate-300" /></button>) : <EmptyState text="You are all caught up." action="Open messages" onClick={() => setActiveTab('messages')} />}</div></HomeCard>}
        </div>

        <section className="mt-7"><HomeCard title="Recent communication" icon={<MessageSquare className="h-4 w-4" />} tone="slate" onRemove={() => undefined}><div className="grid gap-2 md:grid-cols-2">{latestConversation.map((conversation) => <button key={conversation.id} type="button" onClick={() => { setActiveConversationId(conversation.id); setActiveTab('messages'); }} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3 text-left hover:border-brand-200 hover:bg-brand-50/40"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500"><Users className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-slate-800">{conversation.name}</span><span className="mt-0.5 block truncate text-[11px] text-slate-500">{conversation.lastMessage?.text || 'Open conversation'}</span></span><ChevronRight className="h-4 w-4 text-slate-300" /></button>)}{!latestConversation.length && <EmptyState text="Your recent conversations will appear here." action="Open direct messages" onClick={() => setActiveTab('messages')} />}</div></HomeCard></section>

      </div>
    </main>
  );
};

const WorkRow: React.FC<{ title: string; detail: string; progress: number }> = ({ title, detail, progress }) => <div className="rounded-xl border border-slate-100 p-3"><div className="flex items-center justify-between"><p className="text-xs font-bold text-slate-800">{title}</p><span className="text-[10px] text-slate-400">{detail}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-500" style={{ width: `${progress}%` }} /></div></div>;
const EmptyState: React.FC<{ text: string; action: string; onClick: () => void }> = ({ text, action, onClick }) => <div className="rounded-xl border border-dashed border-slate-200 p-5 text-center"><p className="text-xs text-slate-500">{text}</p><button type="button" onClick={onClick} className="mt-2 text-[11px] font-bold text-brand-700">{action} <ArrowUpRight className="ml-1 inline h-3 w-3" /></button></div>;
const HomeCard: React.FC<{ title: string; icon: React.ReactNode; tone: 'sky' | 'violet' | 'emerald' | 'amber' | 'slate'; onRemove: () => void; action?: React.ReactNode; children: React.ReactNode }> = ({ title, icon, tone, onRemove, action, children }) => <article className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm"><header className="mb-4 flex items-center gap-2"><span className={`flex h-8 w-8 items-center justify-center rounded-lg ${tone === 'sky' ? 'bg-brand-100 text-brand-700' : tone === 'violet' ? 'bg-brand-100 text-brand-700' : tone === 'emerald' ? 'bg-brand-100 text-brand-700' : tone === 'amber' ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-600'}`}>{icon}</span><h3 className="flex-1 text-sm font-bold text-slate-900">{title}</h3>{action}<button type="button" onClick={onRemove} className="text-[10px] text-slate-300 hover:text-slate-600" title="Hide card">•••</button></header>{children}</article>;
