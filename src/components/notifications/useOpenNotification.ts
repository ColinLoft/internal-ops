import { useWorkspace } from '../../context/WorkspaceContext';
import type { NotificationItem } from '../../types';

export const useOpenNotification = () => {
  const { markNotificationRead, setActiveTab, setActiveChannelId, setActiveConversationId } = useWorkspace();
  return (notification: NotificationItem) => {
    markNotificationRead(notification.id);
    if (notification.linkPath) {
      window.history.pushState({}, '', notification.linkPath);
      window.dispatchEvent(new PopStateEvent('popstate'));
      return;
    }
    if (notification.linkTab === 'programs') {
      setActiveTab('programs');
      return;
    }
    setActiveTab(notification.linkTab);
    if (notification.linkTab === 'channels' && notification.targetId) setActiveChannelId(notification.targetId);
    else if (notification.linkTab === 'messages' && notification.targetId) setActiveConversationId(notification.targetId);
  };
};
