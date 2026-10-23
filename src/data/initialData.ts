import { Conversation, Channel, Message, CalendarEvent, NotificationItem } from '../types';

export const initialConversations: Conversation[] = [];

export const initialChannels: Channel[] = [
  {
    id: 'chan-announcements',
    name: 'announcements',
    description: 'Official organization announcements and updates. Leadership posts here.',
    type: 'announcement',
    isPrivate: false,
    members: [],
    postingRoles: ['admin', 'coordinator'],
    isPinned: true,
    unreadCount: 0,
    category: 'General',
  },
  {
    id: 'chan-general',
    name: 'general',
    description: 'Workplace discussion and general collaboration for all staff.',
    type: 'standard',
    isPrivate: false,
    members: [],
    postingRoles: ['admin', 'coordinator', 'member'],
    isPinned: false,
    unreadCount: 0,
    category: 'General',
  },
];

export const initialMessages: Record<string, Message[]> = {};

export const initialThreadReplies: Record<string, Message[]> = {};

export const initialCalendarEvents: CalendarEvent[] = [];

export const initialNotifications: NotificationItem[] = [];
