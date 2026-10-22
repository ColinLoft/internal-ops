export type UserStatus = 'online' | 'busy' | 'away' | 'offline';

export type UserRole = 'admin' | 'coordinator' | 'member';

export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
  role: string;
  department: string;
  phone: string;
  status: UserStatus;
  statusMessage?: string;
  lastSeen?: string;
  systemRole: UserRole; // for announcement channel permissions
  isCurrentUser?: boolean;
  mustResetPassword?: boolean;
  tempPassword?: string;
  password?: string;
}

export interface Attachment {
  id: string;
  name: string;
  url: string;
  size: string;
  type: 'image' | 'file' | 'audio' | 'location';
  previewUrl?: string;
  locationData?: {
    label: string;
    latitude: number;
    longitude: number;
  };
}

export interface Reaction {
  emoji: string;
  users: string[]; // user IDs
}

export interface PollOption {
  id: string;
  text: string;
  votes: string[]; // array of user IDs
}

export interface Poll {
  id: string;
  question: string;
  options: PollOption[];
  totalVotes: number;
  createdBy: string;
  isClosed?: boolean;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  senderRole?: string;
  text: string;
  timestamp: string;
  seenBy: string[]; // user IDs who read it
  reactions: Reaction[];
  attachments?: Attachment[];
  threadCount?: number;
  lastThreadReplyAt?: string;
  isCallRecord?: boolean;
  callDuration?: string;
  poll?: Poll;
  parentId?: string; // if in a thread
}

export interface Conversation {
  id: string;
  type: 'direct' | 'group';
  name: string;
  avatar?: string;
  description?: string;
  participants: string[]; // user IDs
  isPinned?: boolean;
  unreadCount: number;
  lastMessage?: {
    text: string;
    timestamp: string;
    senderId: string;
  };
}

export interface Channel {
  id: string;
  name: string;
  description: string;
  type: 'standard' | 'announcement';
  isPrivate: boolean;
  members: string[]; // user IDs
  postingRoles: UserRole[]; // e.g. ['admin', 'coordinator'] for announcements, or ['admin', 'coordinator', 'member']
  isPinned?: boolean;
  unreadCount: number;
  category: 'General' | 'Projects' | 'Departments' | 'Outreach';
  lastPost?: {
    text: string;
    timestamp: string;
    senderName: string;
  };
}

export type CalendarScope = 'team' | 'personal';

export type EventCategory = 'standup' | 'fundraiser' | 'community' | 'board' | 'personal';

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  isAllDay?: boolean;
  scope: CalendarScope; // 'team' (shared with everyone) vs 'personal'
  category: EventCategory;
  location?: string;
  attendees?: string[]; // user IDs
  createdBy: string;
  color?: string;
}

export type NotificationType = 'message' | 'mention' | 'announcement' | 'call' | 'calendar';

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  description: string;
  timestamp: string;
  isRead: boolean;
  linkTab: 'messages' | 'channels' | 'calendar';
  targetId?: string; // conversation or channel id
}

export interface CallSession {
  active: boolean;
  type: 'audio' | 'video';
  status: 'ringing' | 'connected' | 'ended';
  peerUser?: User;
  targetChannel?: Channel;
  isMuted: boolean;
  isCameraOff: boolean;
  isScreenSharing: boolean;
  durationSeconds: number;
  isMinimized: boolean;
}
