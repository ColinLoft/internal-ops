import React from 'react';
import { Bell, CheckCheck, X } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { notificationIcon } from './NotificationsPage';
import { useOpenNotification } from './useOpenNotification';

export const NotificationCenter: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { notifications, markAllNotificationsRead } = useWorkspace();
  const openNotification = useOpenNotification();

  const handleNotificationClick = (notif: typeof notifications[0]) => {
    openNotification(notif);
    onClose();
  };

  const getIcon = (type: typeof notifications[0]['type']) => {
    const Icon = notificationIcon(type);
    return <Icon className="w-4 h-4 text-brand-600" />;
  };

  return (
    <div role="dialog" aria-label="Notification center" className="w-[min(20rem,calc(100vw-1rem))] md:w-80 bg-white rounded-2xl shadow-2xl border border-slate-200/90 overflow-hidden text-slate-800 animate-in fade-in zoom-in-95 duration-150">
      {/* Header */}
      <div className="p-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-brand-600" />
          <h4 className="text-xs font-bold text-slate-900">Notification Center</h4>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={markAllNotificationsRead}
            className="flex min-h-11 min-w-11 items-center justify-center md:min-h-0 md:min-w-0 p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
            title="Mark all as read"
            aria-label="Mark all as read"
          >
            <CheckCheck className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClose}
            aria-label="Close notifications"
            className="flex min-h-11 min-w-11 items-center justify-center md:min-h-0 md:min-w-0 p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Notifications List */}
      <div className="max-h-[max(4rem,calc(100dvh-16rem))] md:max-h-[min(24rem,max(4rem,calc(100dvh-14rem)))] overflow-y-auto divide-y divide-slate-100">
        {notifications.length > 0 ? (
          notifications.slice(0, 20).map((n) => (
            <button
              type="button"
              key={n.id}
              onClick={() => handleNotificationClick(n)}
              className={`w-full p-3 text-left hover:bg-slate-50 transition-colors flex items-start gap-3 ${
                !n.isRead ? 'bg-brand-50/40' : ''
              }`}
            >
              <div className="p-2 rounded-xl bg-white border border-slate-200 shadow-2xs mt-0.5">
                {getIcon(n.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <h5 className="text-xs font-bold text-slate-900 truncate">{n.title}</h5>
                  <span className="text-xs text-slate-400 font-medium whitespace-nowrap ml-1">
                    {n.timestamp}
                  </span>
                </div>
                <span className="block text-xs text-slate-500 line-clamp-2 leading-relaxed">
                  {n.description}
                </span>
              </div>
              {!n.isRead && (
                <span className="w-2 h-2 rounded-full bg-rose-500 flex-shrink-0 mt-1.5 shadow-xs" />
              )}
            </button>
          ))
        ) : (
          <div className="p-6 text-center text-xs text-slate-400">No notifications</div>
        )}
      </div>
      <button
        type="button"
        onClick={() => {
          window.history.pushState({}, '', '/notifications');
          window.dispatchEvent(new PopStateEvent('popstate'));
          onClose();
        }}
        className="block w-full border-t border-slate-100 p-3 text-center text-xs font-semibold text-brand-600 hover:bg-slate-50"
      >
        View all notifications
      </button>
    </div>
  );
};
