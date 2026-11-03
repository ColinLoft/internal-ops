import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  FolderOpen,
  MessageSquare,
  Target,
  Users,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { supabase } from '../../lib/supabase';

type RecentFile = { id: string; name: string; item_type: string; updated_at: string };
type MyTask = { id: string; title: string; status: string; priority: string; due_date: string | null; source: 'program' | 'operations' };

const formatTime = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number);
  if (Number.isNaN(hours)) return time;
  return `${hours % 12 || 12}:${String(minutes || 0).padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`;
};

export const HomePage: React.FC = () => {
  const { currentUser, users, calendarEvents, conversations, channels, messages, notifications, setActiveTab, setActiveConversationId, setActiveChannelId, addNotification } = useWorkspace();
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
  const [myTasks, setMyTasks] = useState<MyTask[]>([]);

  useEffect(() => {
    let active = true;
    const loadFiles = async () => {
      const { data } = await supabase.from('drive_items').select('id, name, item_type, updated_at').is('deleted_at', null).neq('item_type', 'folder').order('updated_at', { ascending: false }).limit(5);
      if (active && data) setRecentFiles(data as RecentFile[]);
    };
    const loadTasks = async () => {
      if (!currentUser.id) return;
      const [programResult, operationResult] = await Promise.all([
        supabase.from('program_tasks').select('id,title,status,priority,due_date').eq('assignee_id', currentUser.id).neq('status', 'completed'),
        supabase.from('operation_tasks').select('id,title,status,priority,due_date').eq('assignee_id', currentUser.id).not('status', 'in', '(completed,cancelled)'),
      ]);
      const tasks: MyTask[] = [
        ...(programResult.data || []).map((task) => ({ ...task, source: 'program' as const })),
        ...(operationResult.data || []).map((task) => ({ ...task, source: 'operations' as const })),
      ].sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'));
      if (active) setMyTasks(tasks);
    };
    void loadFiles();
    void loadTasks();
    return () => { active = false; };
  }, [currentUser.id]);

  const upcoming = useMemo(() => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    return calendarEvents.filter((event) => event.date > today || (event.date === today && (event.endTime || event.startTime) >= nowTime)).sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`)).slice(0, 4);
  }, [calendarEvents]);
  const mentions = useMemo(() => {
    const handle = `@${currentUser.name.toLowerCase()}`;
    const firstHandle = `@${currentUser.name.split(' ')[0]?.toLowerCase()}`;
    return Object.entries(messages).flatMap(([conversationId, list]) => list.slice().reverse().slice(0, 20).map((message) => ({ ...message, conversationId })))
      .filter((message) => {
        if (message.senderId === currentUser.id || message.parentId) return false;
        const text = message.text.toLowerCase();
        return text.includes('@everyone') || text.includes('@channel') || text.includes(handle) || text.includes(firstHandle);
      })
      .slice(0, 6);
  }, [messages, currentUser.id, currentUser.name]);
  const attention = notifications.filter((notification) => !notification.isRead).slice(0, 4);
  const latestConversation = conversations.filter((conversation) => conversation.lastMessage).slice(0, 4);
  const firstName = currentUser.name?.split(' ')[0] || 'there';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <main className="min-w-0 flex-1 overflow-y-auto bg-transparent">
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:px-10">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div><h1 className="text-2xl font-bold tracking-tight text-slate-900">{greeting}, {firstName}</h1><p className="mt-1 text-xs text-slate-500">What needs your attention, what is coming up, and what you have been working on.</p></div>
          <div className="flex gap-2"><button type="button" onClick={() => setActiveTab('calendar')} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><CalendarDays className="h-4 w-4 text-slate-400" />Calendar</button><button type="button" onClick={() => setActiveTab('drive')} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><FolderOpen className="h-4 w-4 text-slate-400" />Drive</button></div>
        </header>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <HomeCard title="My tasks" icon={<Target className="h-4 w-4" />} tone="sky"><div className="space-y-2">{myTasks.length ? myTasks.slice(0, 6).map((task) => <button key={`${task.source}-${task.id}`} type="button" onClick={() => setActiveTab(task.source === 'program' ? 'programs' : 'organization')} className="flex w-full items-center gap-3 rounded-xl border border-slate-100 p-3 text-left hover:bg-brand-50"><span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-slate-800">{task.title}</span><span className="text-xs capitalize text-slate-400">{task.source} · {task.status.replace('_', ' ')} · {task.priority}</span></span><span className="text-xs text-slate-400">{task.due_date ? new Date(`${task.due_date}T12:00:00`).toLocaleDateString() : 'No due date'}</span></button>) : <EmptyState text="No tasks are assigned to you." action="Open programs" onClick={() => setActiveTab('programs')} />}</div></HomeCard>
          <HomeCard title="Upcoming events" icon={<CalendarDays className="h-4 w-4" />} tone="violet"><div className="space-y-2">{upcoming.length ? upcoming.map((event) => <button key={event.id} type="button" onClick={() => setActiveTab('calendar')} className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-brand-50"><div className="w-12 rounded-lg bg-brand-100 px-2 py-1 text-center text-xs font-bold text-brand-700"><span className="block text-sm">{new Date(`${event.date}T12:00:00`).getDate()}</span>{new Date(`${event.date}T12:00:00`).toLocaleDateString(undefined, { month: 'short' })}</div><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-slate-800">{event.title}</p><p className="mt-0.5 text-xs text-slate-500"><Clock3 className="mr-1 inline h-3 w-3" />{formatTime(event.startTime)} · {event.location || 'Calendar meeting'}</p></div><ChevronRight className="h-4 w-4 text-slate-300" /></button>) : <EmptyState text="No upcoming meetings scheduled." action="Open calendar" onClick={() => setActiveTab('calendar')} />}</div></HomeCard>
          <HomeCard title="Recent files" icon={<FolderOpen className="h-4 w-4" />} tone="emerald"><div className="space-y-1">{recentFiles.length ? recentFiles.map((file) => <button key={file.id} type="button" onClick={() => setActiveTab('drive')} className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-brand-50"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-100 text-brand-700"><FileText className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-slate-800">{file.name}</span><span className="text-xs text-slate-400">{file.item_type} · {new Date(file.updated_at).toLocaleDateString()}</span></span><ChevronRight className="h-4 w-4 text-slate-300" /></button>) : <EmptyState text="Your recent Drive files will appear here." action="Open Drive" onClick={() => setActiveTab('drive')} />}</div></HomeCard>
          <HomeCard title="Needs your attention" icon={<CheckCircle2 className="h-4 w-4" />} tone="amber"><div className="space-y-1">{attention.length ? attention.map((notification) => <button key={notification.id} type="button" onClick={() => { if (notification.linkTab === 'messages' && notification.targetId) setActiveConversationId(notification.targetId); if (notification.linkTab === 'channels' && notification.targetId) setActiveChannelId(notification.targetId); setActiveTab(notification.linkTab); }} className="flex w-full items-start gap-3 rounded-xl p-2 text-left hover:bg-brand-50"><span className="mt-1 h-2 w-2 rounded-full bg-brand-500" /><span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-slate-800">{notification.title}</span><span className="mt-0.5 block truncate text-xs text-slate-500">{notification.description}</span></span><ChevronRight className="mt-1 h-4 w-4 text-slate-300" /></button>) : <EmptyState text="You are all caught up." action="Open messages" onClick={() => setActiveTab('messages')} />}</div></HomeCard>
        </div>

        <section className="mt-7"><HomeCard title="Recent mentions & messages" icon={<MessageSquare className="h-4 w-4" />} tone="slate"><div className="grid gap-2 md:grid-cols-2">{mentions.map((message) => { const channel = channels.find((item) => item.id === message.conversationId); return <button key={message.id} type="button" onClick={() => { if (channel) { setActiveChannelId(channel.id); setActiveTab('channels'); } else { setActiveConversationId(message.conversationId); setActiveTab('messages'); } }} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3 text-left hover:border-brand-200 hover:bg-brand-50/40"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">@</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-slate-800">{message.senderName} · {channel ? `#${channel.name}` : users.some((user) => user.id === message.senderId) ? 'Direct message' : 'Conversation'}</span><span className="mt-0.5 block truncate text-xs text-slate-500">{message.text}</span></span><ChevronRight className="h-4 w-4 text-slate-300" /></button>; })}{!mentions.length && latestConversation.map((conversation) => <button key={conversation.id} type="button" onClick={() => { setActiveConversationId(conversation.id); setActiveTab('messages'); }} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3 text-left hover:border-brand-200 hover:bg-brand-50/40"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500"><Users className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-slate-800">{conversation.name}</span><span className="mt-0.5 block truncate text-xs text-slate-500">{conversation.lastMessage?.text || 'Open conversation'}</span></span><ChevronRight className="h-4 w-4 text-slate-300" /></button>)}{!mentions.length && !latestConversation.length && <EmptyState text="Mentions and recent conversations will appear here." action="Open messages" onClick={() => setActiveTab('messages')} />}</div></HomeCard></section>

      </div>
          </main>
  );
};

const EmptyState: React.FC<{ text: string; action: string; onClick: () => void }> = ({ text, action, onClick }) => <div className="rounded-xl border border-dashed border-slate-200 p-5 text-center"><p className="text-xs text-slate-500">{text}</p><button type="button" onClick={onClick} className="mt-2 text-xs font-bold text-brand-700">{action} <ArrowUpRight className="ml-1 inline h-3 w-3" /></button></div>;
const HomeCard: React.FC<{ title: string; icon: React.ReactNode; tone: 'sky' | 'violet' | 'emerald' | 'amber' | 'slate'; children: React.ReactNode }> = ({ title, icon, children }) => <article className="rounded-xl border border-slate-200 bg-white p-4"><header className="mb-3 flex items-center gap-2 text-slate-400">{icon}<h3 className="flex-1 text-sm font-bold text-slate-900">{title}</h3></header>{children}</article>;
