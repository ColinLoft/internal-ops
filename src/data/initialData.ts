import { Conversation, Channel, Message, CalendarEvent, NotificationItem } from '../types';

export const initialConversations: Conversation[] = [];

export const initialChannels: Channel[] = [];

export const initialMessages: Record<string, Message[]> = {};

export const initialThreadReplies: Record<string, Message[]> = {};

export const initialCalendarEvents: CalendarEvent[] = [];

export const initialNotifications: NotificationItem[] = [];
