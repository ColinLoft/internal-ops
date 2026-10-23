export type UserStatus = 'online' | 'busy' | 'away' | 'offline';

export type UserRole = 'admin' | 'coordinator' | 'member';

export type ProfileBanner = 'ocean' | 'violet' | 'forest' | 'sunset' | 'rose';
export type Ringtone = 'classic' | 'chime' | 'pulse' | 'soft';

export const RINGTONES: { value: Ringtone; label: string; description: string }[] = [
  { value: 'classic', label: 'Classic', description: 'Warm double ring' },
  { value: 'chime', label: 'Chime', description: 'Bright two-note chime' },
  { value: 'pulse', label: 'Pulse', description: 'Three gentle pulses' },
  { value: 'soft', label: 'Soft', description: 'Quiet rising notes' },
];

export const PROFILE_BANNERS: { value: ProfileBanner; label: string; className: string }[] = [
  { value: 'ocean', label: 'Ocean blue', className: 'bg-gradient-to-r from-blue-600 via-cyan-600 to-sky-500' },
  { value: 'violet', label: 'Violet', className: 'bg-gradient-to-r from-violet-700 via-purple-600 to-fuchsia-500' },
  { value: 'forest', label: 'Forest', className: 'bg-gradient-to-r from-emerald-700 via-teal-600 to-lime-500' },
  { value: 'sunset', label: 'Sunset', className: 'bg-gradient-to-r from-orange-600 via-rose-600 to-pink-500' },
  { value: 'rose', label: 'Rose', className: 'bg-gradient-to-r from-rose-700 via-pink-600 to-purple-500' },
];

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
  bio?: string;
  location?: string;
  banner?: ProfileBanner;
  preferences?: WorkspaceSettings;
  lastSeen?: string;
  systemRole: UserRole; // for announcement channel permissions
  isCurrentUser?: boolean;
}

export interface WorkspaceSettings {
  theme: 'light' | 'dark';
  accentColor: string;
  autoBusyInCalls: boolean;
  autoBusyDuringEvents: boolean;
  microphoneDeviceId: string;
  cameraDeviceId: string;
  ringtone: Ringtone;
  showCameraPreview: boolean;
  noiseSuppression: boolean;
}

export const DEFAULT_WORKSPACE_SETTINGS: WorkspaceSettings = {
  theme: 'dark',
  accentColor: '#2563eb',
  autoBusyInCalls: true,
  autoBusyDuringEvents: true,
  microphoneDeviceId: '',
  cameraDeviceId: '',
  ringtone: 'classic',
  showCameraPreview: true,
  noiseSuppression: true,
};

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
