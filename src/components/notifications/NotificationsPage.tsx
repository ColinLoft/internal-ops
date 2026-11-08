import React, { useState } from 'react';
import { AtSign, Calendar, CheckCheck, ListChecks, Megaphone, MessageSquare } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import type { NotificationItem } from '../../types';
import { useOpenNotification } from './useOpenNotification';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'message', label: 'Messages' },
  { id: 'mention', label: 'Mentions' },
  { id: 'task', label: 'Tasks' },
  { id: 'calendar', label: 'Calendar' },
] as const;

export const notificationIcon = (type: NotificationItem['type']) => {
  if (type === 'announcement') return Megaphone;
  if (type === 'mention') return AtSign;
  if (type === 'calendar') return Calendar;
  if (type === 'task') return ListChecks;
  return MessageSquare;
};

export const NotificationsPage: React.FC = () => {
  const { notifications, unreadNotificationCount, markAllNotificationsRead } = useWorkspace();
  const openNotification = useOpenNotification();
  const [filter, setFilter] = useState<typeof FILTERS[number]['id']>('all');
  const visible = notifications.filter((n) => filter === 'all' || (filter === 'unread' ? !n.isRead : n.type === filter));

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-black px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-3xl">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">Notifications</h1>
            <p className="mt-1 text-sm text-slate-400">Direct messages, mentions, task assignments and calendar invites.</p>
          </div>
          <button type="button" onClick={markAllNotificationsRead} disabled={!unreadNotificationCount} className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15 disabled:opacity-40">
            <CheckCheck className="h-4 w-4" aria-hidden="true" /> Mark all read
          </button>
        </header>
        <div role="tablist" aria-label="Filter notifications" className="mt-6 flex flex-wrap gap-2">
          {FILTERS.map((option) => (
            <button key={option.id} type="button" role="tab" aria-selected={filter === option.id} onClick={() => setFilter(option.id)} className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${filter === option.id ? 'bg-brand-600 text-white' : 'bg-white/5 text-slate-300 hover:bg-white/10'}`}>
              {option.label}
            </button>
          ))}
        </div>
        <ul className="mt-6 space-y-2">
          {visible.map((n) => {
            const Icon = notificationIcon(n.type);
            return (
              <li key={n.id}>
                <button type="button" onClick={() => openNotification(n)} className={`flex w-full items-start gap-3 rounded-2xl p-4 text-left transition hover:bg-white/10 ${n.isRead ? 'bg-white/[0.03]' : 'bg-white/[0.07]'}`}>
                  <Icon className="mt-0.5 h-5 w-5 shrink-0 text-brand-400" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className={`truncate text-sm ${n.isRead ? 'font-medium text-slate-300' : 'font-semibold text-white'}`}>{n.title}</span>
                      <span className="shrink-0 text-xs text-slate-500">{n.timestamp}</span>
                    </span>
                    {n.description && <span className="mt-1 block text-sm leading-6 text-slate-400 line-clamp-2">{n.description}</span>}
                  </span>
                  {!n.isRead && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" aria-label="Unread" />}
                </button>
              </li>
            );
          })}
        </ul>
        {!visible.length && <p className="mt-10 text-center text-sm text-slate-500">{filter === 'all' ? 'You are all caught up.' : 'Nothing here yet.'}</p>}
      </div>
    </main>
  );
};
