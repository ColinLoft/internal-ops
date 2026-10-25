import React from 'react';
import {
  Bell,
  CheckCheck,
  Megaphone,
  AtSign,
  Calendar,
  MessageSquare,
  X,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';

export const NotificationCenter: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const {
    notifications,
    markNotificationRead,
    markAllNotificationsRead,
    setActiveTab,
    setActiveChannelId,
    setActiveConversationId,
  } = useWorkspace();

  const handleNotificationClick = (notif: typeof notifications[0]) => {
    markNotificationRead(notif.id);
    setActiveTab(notif.linkTab);
    if (notif.linkTab === 'channels' && notif.targetId) {
      setActiveChannelId(notif.targetId);
    } else if (notif.linkTab === 'messages' && notif.targetId) {
      setActiveConversationId(notif.targetId);
    }
    onClose();
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'announcement':
        return <Megaphone className="w-4 h-4 text-amber-600" />;
      case 'mention':
        return <AtSign className="w-4 h-4 text-brand-600" />;
      case 'calendar':
        return <Calendar className="w-4 h-4 text-emerald-600" />;
      default:
        return <MessageSquare className="w-4 h-4 text-brand-600" />;
    }
  };

  return (
    <div role="dialog" aria-label="Notification center" className="w-80 bg-white/95 backdrop-blur-2xl rounded-2xl shadow-2xl border border-slate-200/90 overflow-hidden text-slate-800 animate-in fade-in zoom-in-95 duration-150">
      {/* Header */}
      <div className="p-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-brand-600" />
          <h4 className="text-xs font-bold text-slate-900">Notification Center</h4>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={markAllNotificationsRead}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
            title="Mark all as read"
          >
            <CheckCheck className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Notifications List */}
      <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
        {notifications.length > 0 ? (
          notifications.map((n) => (
            <div
              key={n.id}
              onClick={() => handleNotificationClick(n)}
              className={`p-3 cursor-pointer hover:bg-slate-50 transition-colors flex items-start gap-3 ${
                !n.isRead ? 'bg-brand-50/40' : ''
              }`}
            >
              <div className="p-2 rounded-xl bg-white border border-slate-200 shadow-2xs mt-0.5">
                {getIcon(n.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <h5 className="text-xs font-bold text-slate-900 truncate">{n.title}</h5>
                  <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap ml-1">
                    {n.timestamp}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                  {n.description}
                </p>
              </div>
              {!n.isRead && (
                <span className="w-2 h-2 rounded-full bg-rose-500 flex-shrink-0 mt-1.5 shadow-xs" />
              )}
            </div>
          ))
        ) : (
          <div className="p-6 text-center text-xs text-slate-400">No notifications</div>
        )}
      </div>
    </div>
  );
};
