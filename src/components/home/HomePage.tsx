import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, CalendarDays, CheckCircle2, Clock3, Eye, EyeOff, GripVertical, Headset, History, MessageSquare, Settings2, Sparkles, Target, Users, Flag, Mail, AlertTriangle, ListChecks } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { supabase } from '../../lib/supabase';
import { EmptyState, ProvenanceBadge, Skeleton } from '../common/Feedback';
import { parseTaskDate } from '../programs/taskFields';

type MyTask = { id: string; title: string; status: string; priority: string; due_date: string | null; source: 'program' | 'operations' };
type Activity = { id: string; entity_type: string; entity_id: string; action: string; detail: string | null; created_by: string | null; created_at: string };
type Deadline = { id: string; title: string; date: string; kind: string; tab: 'programs' | 'company' };

const WIDGETS = [
  ['tasks', 'My tasks'], ['events', 'Upcoming events'], ['deadlines', 'Deadlines'], ['attention', 'Needs attention'],
  ['activity', 'Recent activity'], ['next', 'Suggested next actions'], ['mentions', 'Mentions & messages'],
] as const;
type WidgetId = typeof WIDGETS[number][0];
const DEFAULT_ORDER: WidgetId[] = WIDGETS.map((item) => item[0]);
const WIDE: WidgetId[] = ['mentions'];
const STORAGE = 'flown-home-widgets-v2';
const DEFAULT_HIDDEN: WidgetId[] = ['activity', 'mentions', 'next'];

const statusPill: Record<string, string> = { not_started: 'bg-slate-100 text-slate-600', in_progress: 'bg-brand-50 text-brand-700', blocked: 'bg-rose-50 text-rose-700', completed: 'bg-emerald-50 text-emerald-700', planned: 'bg-slate-100 text-slate-600', in_review: 'bg-amber-50 text-amber-700' };
const priorityBar: Record<string, string> = { high: 'bg-rose-400', medium: 'bg-amber-300', low: 'bg-slate-200', urgent: 'bg-rose-500' };
const severity: Record<string, { rank: number; dot: string; label: string }> = {
  call: { rank: 0, dot: 'bg-rose-500', label: 'Urgent' }, mention: { rank: 0, dot: 'bg-rose-500', label: 'Urgent' },
  announcement: { rank: 1, dot: 'bg-amber-400', label: 'Important' }, calendar: { rank: 1, dot: 'bg-amber-400', label: 'Important' },
  message: { rank: 2, dot: 'bg-brand-400', label: 'New' },
};

const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const formatTime = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number);
  if (Number.isNaN(hours)) return time;
  return `${hours % 12 || 12}:${String(minutes || 0).padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`;
};
const relative = (value: string) => {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
};
const loadConfig = (): { order: WidgetId[]; hidden: WidgetId[] } => {
  try {
    const stored = localStorage.getItem(STORAGE);
    if (!stored) return { order: DEFAULT_ORDER, hidden: DEFAULT_HIDDEN };
    const parsed = JSON.parse(stored);
    const order = [...(parsed.order || []).filter((id: WidgetId) => DEFAULT_ORDER.includes(id)), ...DEFAULT_ORDER.filter((id) => !(parsed.order || []).includes(id))];
    return { order, hidden: (parsed.hidden || []).filter((id: WidgetId) => DEFAULT_ORDER.includes(id)) };
  } catch { return { order: DEFAULT_ORDER, hidden: DEFAULT_HIDDEN }; }
};

export const HomePage: React.FC = () => {
  const { currentUser, users, calendarEvents, conversations, channels, messages, notifications, setActiveTab, setActiveConversationId, setActiveChannelId, setIsAddEventOpen } = useWorkspace();
  const [myTasks, setMyTasks] = useState<MyTask[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [openSupport, setOpenSupport] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState(loadConfig);
  const [editing, setEditing] = useState(false);
  const [dragId, setDragId] = useState<WidgetId | null>(null);

  const goTasks = useCallback(() => {
    window.history.pushState({}, '', '/programs/tasks');
    setActiveTab('programs');
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, [setActiveTab]);

  const save = useCallback((next: { order: WidgetId[]; hidden: WidgetId[] }) => { setConfig(next); localStorage.setItem(STORAGE, JSON.stringify(next)); }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const [programs, operations, feed, reports, support] = await Promise.all([
        currentUser.id ? supabase.from('program_tasks').select('id,title,status,priority,due_date').contains('assigned_ids', [currentUser.id]).neq('status', 'completed') : Promise.resolve({ data: [] }),
        currentUser.id ? supabase.from('operation_tasks').select('id,title,status,priority,due_date').eq('assignee_id', currentUser.id).not('status', 'in', '(completed,cancelled)') : Promise.resolve({ data: [] }),
        supabase.from('entity_activity').select('id,entity_type,entity_id,action,detail,created_by,created_at').order('created_at', { ascending: false }).limit(8),
        supabase.from('grant_reports').select('id,title,due_date,status').in('status', ['upcoming', 'overdue']).order('due_date', { ascending: true }).limit(5),
        supabase.from('support_conversations').select('id', { count: 'exact', head: true }).eq('status', 'open'),
      ]);
      if (!active) return;
      setMyTasks([
        ...((programs.data || []) as Omit<MyTask, 'source'>[]).map((task) => ({ ...task, source: 'program' as const })),
        ...((operations.data || []) as Omit<MyTask, 'source'>[]).map((task) => ({ ...task, source: 'operations' as const })),
      ].sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999')));
      setActivity((feed.data || []) as Activity[]);
      setDeadlines(((reports.data || []) as { id: string; title: string; due_date: string }[]).map((report) => ({ id: report.id, title: report.title, date: report.due_date, kind: 'Grants · Report', tab: 'company' as const })));
      setOpenSupport(support.error ? null : support.count ?? 0);
      setLoading(false);
    };
    void load();
    return () => { active = false; };
  }, [currentUser.id]);

  const today = iso(new Date());
  const weekEnd = iso(new Date(Date.now() + 7 * 86400000));
  const overdueTasks = myTasks.filter((task) => task.due_date && task.due_date < today);
  const upcoming = useMemo(() => {
    const nowTime = `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`;
    return calendarEvents.filter((event) => event.date > today || (event.date === today && (event.endTime || event.startTime) >= nowTime)).sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`));
  }, [calendarEvents, today]);
  const allDeadlines = useMemo(() => [
    ...myTasks.filter((task) => task.due_date).map((task) => ({ id: `t-${task.id}`, title: task.title, date: task.due_date as string, kind: task.source === 'program' ? 'Program task' : 'Operations task', tab: 'programs' as Deadline['tab'] })),
    ...deadlines,
  ].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6), [myTasks, deadlines]);

  const mentions = useMemo(() => {
    const handle = `@${currentUser.name.toLowerCase()}`;
    const firstHandle = `@${currentUser.name.split(' ')[0]?.toLowerCase()}`;
    return Object.entries(messages).flatMap(([conversationId, list]) => list.slice().reverse().slice(0, 20).map((message) => ({ ...message, conversationId })))
      .filter((message) => {
        if (message.senderId === currentUser.id || message.parentId) return false;
        const text = message.text.toLowerCase();
        return text.includes('@everyone') || text.includes('@channel') || text.includes(handle) || text.includes(firstHandle);
      }).slice(0, 6);
  }, [messages, currentUser.id, currentUser.name]);
  const attention = notifications.filter((notification) => !notification.isRead).sort((a, b) => (severity[a.type]?.rank ?? 3) - (severity[b.type]?.rank ?? 3)).slice(0, 5);
  const latestConversation = conversations.filter((conversation) => conversation.lastMessage).slice(0, 4);
  const firstName = currentUser.name?.split(' ')[0] || 'there';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const userName = (id: string | null) => users.find((user) => user.id === id)?.name || 'Someone';

  const nextActions = useMemo(() => {
    const list: { id: string; text: string; action: string; go: () => void }[] = [];
    if (overdueTasks.length) list.push({ id: 'overdue', text: `${overdueTasks.length} of your tasks ${overdueTasks.length === 1 ? 'is' : 'are'} overdue.`, action: 'Review tasks', go: goTasks });
    if (openSupport) list.push({ id: 'support', text: `${openSupport} open customer conversation${openSupport === 1 ? '' : 's'}.`, action: 'Open inbox', go: () => setActiveTab('customers') });
    const unread = notifications.filter((notification) => !notification.isRead).length;
    if (unread > 3) list.push({ id: 'unread', text: `${unread} unread notifications.`, action: 'Catch up', go: () => setActiveTab('messages') });
    if (upcoming[0]?.date === today) list.push({ id: 'meeting', text: `Next meeting today: ${upcoming[0].title} at ${formatTime(upcoming[0].startTime)}.`, action: 'View calendar', go: () => setActiveTab('calendar') });
    return list;
  }, [overdueTasks.length, openSupport, notifications, upcoming, today, setActiveTab, goTasks]);

  const unreadCount = notifications.filter((notification) => !notification.isRead).length;
  const kpis: { name: string; value: number | string; hint: string; icon: React.ElementType; text: string; tint: string; go: () => void }[] = [
    { name: 'Open tasks', value: myTasks.length, hint: 'Assigned to you', icon: ListChecks, text: 'text-brand-600', tint: 'bg-brand-50 text-brand-600', go: goTasks },
    { name: 'Overdue', value: overdueTasks.length, hint: 'Past due date', icon: AlertTriangle, text: overdueTasks.length ? 'text-rose-600' : 'text-brand-600', tint: overdueTasks.length ? 'bg-rose-50 text-rose-600' : 'bg-brand-50 text-brand-600', go: goTasks },
    { name: 'This week', value: upcoming.filter((event) => event.date <= weekEnd).length, hint: 'Meetings and events', icon: CalendarDays, text: 'text-brand-600', tint: 'bg-brand-50 text-brand-600', go: () => setActiveTab('calendar') },
    { name: 'Unread', value: unreadCount, hint: 'Notifications', icon: Mail, text: 'text-brand-600', tint: 'bg-brand-50 text-brand-600', go: () => setActiveTab('messages') },
    { name: 'Open tickets', value: openSupport ?? '—', hint: 'Customer conversations', icon: Headset, text: 'text-brand-600', tint: 'bg-brand-50 text-brand-600', go: () => setActiveTab('customers') },
  ];

  const heroBtn = 'inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100';
  const row = 'flex w-full items-center gap-2.5 rounded-lg px-2 py-1 text-left transition-colors duration-150 hover:bg-slate-50';
  const body = (id: WidgetId): React.ReactNode => {
    switch (id) {
      case 'tasks': return myTasks.length ? myTasks.slice(0, 5).map((task) => (
        <button key={`${task.source}-${task.id}`} type="button" onClick={goTasks} className={row}>
          <span className={`h-4 w-[3px] shrink-0 rounded-full ${priorityBar[task.priority] || 'bg-slate-200'}`} title={`${task.priority} priority`} />
          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-800">{task.title}</span>
          <span className={`shrink-0 rounded px-1.5 py-px text-[10px] font-semibold capitalize ${statusPill[task.status] || statusPill.not_started}`}>{task.status.replace(/_/g, ' ')}</span>
          <span className={`w-12 shrink-0 text-right text-[11px] tabular-nums ${task.due_date && task.due_date < today ? 'font-semibold text-rose-600' : 'text-slate-500'}`}>{parseTaskDate(task.due_date)?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) || '—'}</span>
        </button>
      )) : <EmptyState icon={Target} text="No tasks are assigned to you." action="Open tasks" onClick={goTasks} />;
      case 'events': return upcoming.length ? upcoming.slice(0, 4).map((event) => (
        <button key={event.id} type="button" onClick={() => setActiveTab('calendar')} className={row}>
          <span className="w-10 shrink-0 rounded-md bg-brand-100 py-0.5 text-center text-[10px] font-bold uppercase leading-tight text-brand-700"><span className="block text-sm">{new Date(`${event.date}T12:00:00`).getDate()}</span>{new Date(`${event.date}T12:00:00`).toLocaleDateString(undefined, { month: 'short' })}</span>
          <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-slate-800">{event.title}</span><span className="block truncate text-[11px] text-slate-500"><Clock3 className="mr-1 inline h-3 w-3" />{formatTime(event.startTime)} · {event.location || 'Calendar meeting'}</span></span>
        </button>
      )) : <EmptyState compact icon={CalendarDays} text="No upcoming meetings." action="Open calendar" onClick={() => setActiveTab('calendar')} />;
      case 'deadlines': return allDeadlines.length ? allDeadlines.map((item) => {
        const late = item.date < today;
        const soon = !late && item.date <= weekEnd;
        const date = parseTaskDate(item.date) || new Date();
        return (
          <button key={item.id} type="button" onClick={() => setActiveTab(item.tab)} className={row}>
            <span className={`flex w-10 shrink-0 flex-col items-center rounded-md py-0.5 text-[9px] font-bold uppercase leading-tight ${late ? 'bg-rose-50 text-rose-600' : soon ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-500'}`}><span className="text-sm leading-none">{date.getDate()}</span>{date.toLocaleDateString(undefined, { month: 'short' })}</span>
            <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-slate-800">{item.title}</span><span className="block truncate text-[11px] text-slate-500">{item.kind}</span></span>
            {late && <span className="shrink-0 rounded bg-rose-50 px-1.5 py-px text-[10px] font-semibold text-rose-600">Overdue</span>}
          </button>
        );
      }) : <EmptyState compact icon={Flag} text="No deadlines coming up." />;
      case 'attention': return attention.length ? attention.map((notification) => (
        <button key={notification.id} type="button" onClick={() => { if (notification.linkTab === 'messages' && notification.targetId) setActiveConversationId(notification.targetId); if (notification.linkTab === 'channels' && notification.targetId) setActiveChannelId(notification.targetId); setActiveTab(notification.linkTab); }} className={`${row} items-start`}>
          <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${severity[notification.type]?.dot || 'bg-brand-400'}`} title={severity[notification.type]?.label} />
          <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-slate-800">{notification.title}</span><span className="block truncate text-[11px] text-slate-500">{notification.description}</span></span>
        </button>
      )) : <EmptyState compact icon={CheckCircle2} text="All caught up." />;
      case 'activity': return activity.length ? activity.map((item) => (
        <div key={item.id} className="flex items-start gap-2.5 px-1.5 py-1.5">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-500">{userName(item.created_by).slice(0, 1)}</span>
          <span className="min-w-0 flex-1 text-xs text-slate-600"><b className="font-semibold text-slate-800">{userName(item.created_by)}</b> {item.action.toLowerCase()} <span className="capitalize text-slate-400">· {item.entity_type}</span>{item.detail ? <span className="block truncate text-[11px] text-slate-400">{item.detail}</span> : null}</span>
          <span className="shrink-0 text-[11px] text-slate-400">{relative(item.created_at)}</span>
        </div>
      )) : <EmptyState icon={History} text="Activity from projects, tasks and grants shows up here." />;
      case 'next': return nextActions.length ? nextActions.map((item) => (
        <div key={item.id} className="flex items-center gap-2 rounded-lg border border-slate-100 px-2 py-1.5">
          <span className="min-w-0 flex-1 text-xs text-slate-700">{item.text}</span>
          <button type="button" onClick={item.go} className="shrink-0 rounded-md bg-brand-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-brand-700">{item.action}</button>
        </div>
      )) : <EmptyState icon={Sparkles} text="Nothing urgent. Enjoy the quiet." />;
      case 'mentions': return (
        <div className="grid gap-1 md:grid-cols-2">
          {mentions.map((message) => { const channel = channels.find((item) => item.id === message.conversationId); return (
            <button key={message.id} type="button" onClick={() => { if (channel) { setActiveChannelId(channel.id); setActiveTab('channels'); } else { setActiveConversationId(message.conversationId); setActiveTab('messages'); } }} className={row}>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">@</span>
              <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-slate-800">{message.senderName} · {channel ? `#${channel.name}` : 'Conversation'}</span><span className="block truncate text-[11px] text-slate-500">{message.text}</span></span>
            </button>); })}
          {!mentions.length && latestConversation.map((conversation) => (
            <button key={conversation.id} type="button" onClick={() => { setActiveConversationId(conversation.id); setActiveTab('messages'); }} className={row}>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500"><Users className="h-3.5 w-3.5" /></span>
              <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-slate-800">{conversation.name}</span><span className="block truncate text-[11px] text-slate-500">{conversation.lastMessage?.text || 'Open conversation'}</span></span>
            </button>
          ))}
          {!mentions.length && !latestConversation.length && <div className="md:col-span-2"><EmptyState icon={MessageSquare} text="Mentions and recent conversations will appear here." action="Open messages" onClick={() => setActiveTab('messages')} /></div>}
        </div>
      );
    }
  };

  const viewAll: Partial<Record<WidgetId, { label: string; go: () => void }>> = {
    tasks: { label: 'View all', go: goTasks },
    events: { label: 'Add event', go: () => { setActiveTab('calendar'); setIsAddEventOpen(true); } },
    deadlines: { label: 'View all', go: goTasks },
  };
  const icons: Record<WidgetId, React.ElementType> = { tasks: Target, events: CalendarDays, deadlines: Flag, attention: CheckCircle2, activity: History, next: Sparkles, mentions: MessageSquare };
  const visible = config.order.filter((id) => !config.hidden.includes(id));
  const move = (id: WidgetId, delta: number) => {
    const index = config.order.indexOf(id);
    const target = index + delta;
    if (target < 0 || target >= config.order.length) return;
    const order = config.order.slice();
    [order[index], order[target]] = [order[target], order[index]];
    save({ ...config, order });
  };
  const dropOn = (target: WidgetId) => {
    if (!dragId || dragId === target) return;
    const order = config.order.filter((id) => id !== dragId);
    order.splice(order.indexOf(target), 0, dragId);
    save({ ...config, order });
    setDragId(null);
  };
  const toggleHidden = (id: WidgetId) => save({ ...config, hidden: config.hidden.includes(id) ? config.hidden.filter((item) => item !== id) : [...config.hidden, id] });

  return (
    <main data-onboarding-target="home-overview" className="min-w-0 flex-1 overflow-y-auto bg-[#f4f7fb]">
      <div className="mx-auto max-w-7xl space-y-3 px-4 py-3 sm:px-6">
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/70 bg-white px-4 py-3">
          <div className="min-w-0"><h1 className="text-lg font-bold tracking-tight text-slate-900">{greeting}, {firstName}</h1><p className="text-xs text-slate-500">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} · {overdueTasks.length ? `${overdueTasks.length} overdue task${overdueTasks.length === 1 ? '' : 's'} need attention` : 'Nothing overdue'}</p></div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setActiveTab('calendar')} className={heroBtn}><CalendarDays className="h-3.5 w-3.5" />Calendar</button>
            <button type="button" onClick={() => setEditing((value) => !value)} aria-pressed={editing} className={heroBtn}><Settings2 className="h-3.5 w-3.5" />{editing ? 'Done' : 'Customize'}</button>
          </div>
        </section>

        <section aria-label="Key metrics" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {kpis.map((kpi) => {
            const Icon = kpi.icon;
            return (
              <button key={kpi.name} type="button" onClick={kpi.go} className="flex items-center gap-3 rounded-2xl border border-slate-200/70 bg-white px-3.5 py-3 text-left transition-all duration-150 hover:-translate-y-px hover:border-brand-200 hover:shadow-sm">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${kpi.tint}`}><Icon className="h-[18px] w-[18px]" /></span>
                <span className="min-w-0">
                  <span className="block text-[11px] font-medium text-slate-500">{kpi.name}</span>
                  {loading ? <Skeleton className="mt-1 h-7 w-10" /> : <span className={`block text-2xl font-bold leading-tight tabular-nums ${kpi.text}`}>{kpi.value}</span>}
                </span>
              </button>
            );
          })}
        </section>

        {editing && config.hidden.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-3 py-2 text-xs text-slate-500">
            Hidden widgets:
            {config.hidden.map((id) => <button key={id} type="button" onClick={() => toggleHidden(id)} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600 hover:bg-brand-50 hover:text-brand-700"><Eye className="h-3 w-3" />{WIDGETS.find((item) => item[0] === id)?.[1]}</button>)}
          </div>
        )}

        <div className="grid gap-3 lg:grid-cols-2">
          {visible.map((id) => {
            const Icon = icons[id];
            const title = WIDGETS.find((item) => item[0] === id)?.[1];
            return (
              <article key={id} draggable={editing} onDragStart={() => setDragId(id)} onDragOver={(event) => { if (editing) event.preventDefault(); }} onDrop={() => dropOn(id)} className={`rounded-2xl border bg-white p-4 ${WIDE.includes(id) ? 'lg:col-span-2' : ''} ${editing ? 'border-dashed border-brand-300' : 'border-slate-200/70'}`}>
                <header className="mb-2 flex items-center gap-2">
                  {editing && <GripVertical className="h-4 w-4 cursor-grab text-slate-300" aria-hidden />}
                  <Icon className="h-4 w-4 text-brand-600" />
                  <h2 className="flex-1 text-xs font-bold text-slate-900">{title}</h2>
                  {id === 'next' && <ProvenanceBadge kind="automated" />}
                  {!editing && viewAll[id] && <button type="button" onClick={viewAll[id]?.go} className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-brand-600 transition-colors hover:bg-brand-50">{viewAll[id]?.label}</button>}
                  {editing && <>
                    <button type="button" onClick={() => move(id, -1)} aria-label={`Move ${title} earlier`} className="rounded p-1 text-slate-400 hover:bg-slate-100"><ArrowUp className="h-3.5 w-3.5" /></button>
                    <button type="button" onClick={() => move(id, 1)} aria-label={`Move ${title} later`} className="rounded p-1 text-slate-400 hover:bg-slate-100"><ArrowDown className="h-3.5 w-3.5" /></button>
                    <button type="button" onClick={() => toggleHidden(id)} aria-label={`Hide ${title}`} className="rounded p-1 text-slate-400 hover:bg-slate-100"><EyeOff className="h-3.5 w-3.5" /></button>
                  </>}
                </header>
                {loading && ['tasks', 'activity', 'files', 'deadlines'].includes(id) ? <div className="space-y-1.5">{[0, 1, 2].map((index) => <Skeleton key={index} className="h-6 w-full" />)}</div> : <div className="space-y-0.5">{body(id)}</div>}
              </article>
            );
          })}
        </div>
        {visible.length === 0 && <EmptyState icon={Headset} text="All widgets are hidden." action="Customize" onClick={() => setEditing(true)} />}
      </div>
    </main>
  );
};
