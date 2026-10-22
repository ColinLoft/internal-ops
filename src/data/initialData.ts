import { User, Conversation, Channel, Message, CalendarEvent, NotificationItem } from '../types';

export const initialCurrentUser: User = {
  id: 'user-me',
  name: 'Alex Morgan',
  email: 'alex.morgan@beaconwork.org',
  avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  role: 'Program Director',
  department: 'Operations',
  phone: '+1 (415) 555-0182',
  status: 'online',
  statusMessage: 'Ready to collaborate',
  systemRole: 'admin',
  isCurrentUser: true,
};

export const initialUsers: User[] = [
  initialCurrentUser,
];

export const initialConversations: Conversation[] = [];

export const initialChannels: Channel[] = [
  {
    id: 'chan-announcements',
    name: 'announcements',
    description: 'Official organization announcements and updates. Leadership posts here.',
    type: 'announcement',
    isPrivate: false,
    members: ['user-me'],
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
    members: ['user-me'],
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
