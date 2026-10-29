import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { User as SupabaseAuthUser } from '@supabase/supabase-js';
import {
  User,
  Conversation,
  Channel,
  Message,
  CalendarEvent,
  NotificationItem,
  CallSession,
  IncomingCall,
  Attachment,
  Poll,
  UserStatus,
  UserRole,
  WorkspaceSettings,
  DEFAULT_WORKSPACE_SETTINGS,
  Ringtone,
  AccountStatus,
  SystemActivityInput,
  SystemActivityLog,
} from '../types';
import {
  initialConversations,
  initialChannels,
  initialMessages,
  initialThreadReplies,
  initialCalendarEvents,
  initialNotifications,
} from '../data/initialData';
import { sounds } from '../lib/sound';
import { supabase, testSupabaseConnection } from '../lib/supabase';

interface WorkspaceContextType {
  // Auth state
  isAuthenticated: boolean;
  isAuthLoading: boolean;
  requiresPasswordSetup: boolean;
  requiresOnboarding: boolean;
  currentUser: User;
  workspaceSettings: WorkspaceSettings;
  users: User[];
  systemActivityLogs: SystemActivityLog[];
  systemActivityLogError: string;
  refreshSystemActivityLogs: () => Promise<void>;
  recordSystemActivity: (activity: SystemActivityInput, actor?: User) => Promise<void>;
  isSupabaseConnected: boolean;
  
  // Navigation & Views
  activeTab: 'home' | 'messages' | 'channels' | 'calendar' | 'inbox' | 'admin' | 'drive';
  activeConversationId: string;
  activeChannelId: string;
  activeThreadMessageId: string | null;
  isRightDrawerOpen: boolean;
  conversations: Conversation[];
  channels: Channel[];
  messages: Record<string, Message[]>;
  threadReplies: Record<string, Message[]>;
  calendarEvents: CalendarEvent[];
  notifications: NotificationItem[];
  unreadNotificationCount: number;
  soundEnabled: boolean;
  callSession: CallSession;
  incomingCall: IncomingCall | null;
  callError: string;
  
  // Modals state
  activeProfileModalUser: User | null;
  isProfileSettingsOpen: boolean;
  isWorkspaceSettingsOpen: boolean;
  isCreateChannelOpen: boolean;
  isCreatePollOpen: boolean;
  isNewMessageOpen: boolean;
  isAddEventOpen: boolean;
  isEmailComposeRequested: boolean;
  isAddTeammateOpen: boolean;
  inviteReadyData: {
    name: string;
    email: string;
    role: string;
    systemRole: string;
    temporaryPassword: string;
    loginUrl: string;
  } | null;
  searchQuery: string;
  focusedEmailId: string | null;
  
  // Auth actions
  login: (email: string, password: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
  setPassword: (password: string) => Promise<{ success: boolean; message?: string }>;
  completeOnboarding: () => Promise<void>;
  
  // Navigation actions
  setActiveTab: (tab: 'home' | 'messages' | 'channels' | 'calendar' | 'inbox' | 'admin' | 'drive') => void;
  setActiveConversationId: (id: string) => void;
  setActiveChannelId: (id: string) => void;
  openThread: (messageId: string) => void;
  closeThread: () => void;
  toggleRightDrawer: () => void;
  setRightDrawerOpen: (open: boolean) => void;
  setSearchQuery: (query: string) => void;
  setFocusedEmailId: (id: string | null) => void;
  
  // Messaging actions
  sendMessage: (text: string, attachments?: Attachment[], poll?: Poll, targetConversationId?: string) => Promise<void>;
  postChannelMessage: (channelId: string, text: string, attachments?: Attachment[]) => Promise<void>;
  sendThreadReply: (parentId: string, text: string, attachments?: Attachment[]) => Promise<void>;
  votePoll: (messageId: string, optionId: string, parentId?: string) => void;
  toggleReaction: (messageId: string, emoji: string, parentId?: string) => void;
  togglePinConversation: (id: string) => void;
  togglePinChannel: (id: string) => void;
  
  createChannel: (channel: {
    name: string;
    description: string;
    type: 'standard' | 'announcement';
    postingRoles: UserRole[];
    isPrivate: boolean;
    category?: Channel['category'];
  }) => Promise<void>;
  
  createConversation: (participantIds: string[], name?: string, isGroup?: boolean) => string;
  createCalendarEvent: (event: Omit<CalendarEvent, 'id' | 'createdBy'>) => void;
  deleteCalendarEvent: (id: string) => void;
  
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  toggleSound: () => void;
  
  // Calling
  startCall: (type: 'audio' | 'video', peerUser?: User, channel?: Channel) => Promise<void>;
  endCall: () => void;
  acceptIncomingCall: () => void;
  dismissIncomingCall: () => void;
  setCallError: (error: string) => void;
  setCallConnected: (sessionId: string) => void;
  toggleCallMute: () => void;
  toggleCallCamera: () => void;
  toggleCallScreenShare: () => void;
  toggleCallMinimize: () => void;
  
  // Profile & Management
  updateCurrentUser: (updates: Partial<User>) => void;
  saveCurrentProfile: (updates: Partial<User>) => Promise<void>;
  saveWorkspaceSettings: (settings: WorkspaceSettings) => Promise<void>;
  addTeammate: (user: Pick<User, 'name' | 'email'>) => Promise<void>;
  updateStaffUser: (userId: string, updates: Partial<User>) => Promise<void>;
  manageStaffAccount: (
    userId: string,
    action: 'suspend' | 'reactivate' | 'remove',
    note?: string,
    suspensionDuration?: '1h' | '24h' | '7d' | '30d' | 'indefinite',
  ) => Promise<void>;
  setStaffTemporaryPassword: (userId: string, password: string) => Promise<void>;
  openUserProfile: (user: User) => void;
  closeUserProfile: () => void;
  resetWorkspace: () => void;
  
  setIsProfileSettingsOpen: (open: boolean) => void;
  setIsWorkspaceSettingsOpen: (open: boolean) => void;
  setIsCreateChannelOpen: (open: boolean) => void;
  setIsCreatePollOpen: (open: boolean) => void;
  setIsNewMessageOpen: (open: boolean) => void;
  setIsAddEventOpen: (open: boolean) => void;
  setIsEmailComposeRequested: (requested: boolean) => void;
  requestEmailCompose: () => void;
  setIsAddTeammateOpen: (open: boolean) => void;
  setInviteReadyData: (data: WorkspaceContextType['inviteReadyData']) => void;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

const STORAGE_PREFIX = 'beacon_v3_';
type WorkspaceTab = 'home' | 'messages' | 'channels' | 'calendar' | 'inbox' | 'admin' | 'drive';

const tabFromPath = (pathname: string): WorkspaceTab | null => {
  const segment = pathname.replace(/^\/+|\/+$/g, '').split('/')[0];
  if (segment === 'home') return 'home';
  if (segment === 'messages') return 'messages';
  if (segment === 'channels') return 'channels';
  if (segment === 'calendar') return 'calendar';
  if (segment === 'email' || segment === 'inbox') return 'inbox';
  if (segment === 'admin') return 'admin';
  if (segment === 'drive') return 'drive';
  if (segment === 'docs' || segment === 'slides' || segment === 'sheets' || segment === 'forms') return 'drive';
  return null;
};

const pathForTab = (tab: WorkspaceTab) => ({
  home: '/home',
  messages: '/messages',
  channels: '/channels',
  calendar: '/calendar',
  inbox: '/email',
  admin: '/admin',
  drive: '/drive',
}[tab]);

const getFunctionError = async (error: unknown): Promise<Error> => {
  if (error instanceof Error && 'context' in error && error.context instanceof Response) {
    const responseBody: unknown = await error.context.clone().json().catch(() => null);
    if (responseBody && typeof responseBody === 'object' && 'error' in responseBody
      && typeof responseBody.error === 'string') {
      return new Error(responseBody.error);
    }
  }
  return error instanceof Error ? error : new Error('The Supabase function request failed.');
};

const mapSupabaseProfile = (row: Record<string, any>, currentUserId: string): User => {
  const suspendedUntil = typeof row.suspended_until === 'string' ? row.suspended_until : null;
  const suspensionExpired = suspendedUntil !== null && Date.parse(suspendedUntil) <= Date.now();

  return {
    id: row.id,
    name: row.name || row.email,
    email: row.email,
    role: row.role || '',
    department: row.department || '',
    phone: row.phone || '',
    avatar: row.avatar_url || '',
    status: row.status || 'offline',
    accountStatus: suspensionExpired ? 'active' : (row.account_status as AccountStatus) || 'active',
    suspendedUntil,
    systemRole: row.system_role || 'member',
    statusMessage: row.status_message || undefined,
    bio: row.bio || '',
    location: row.location || '',
    banner: row.banner || 'ocean',
    preferences: mapWorkspaceSettings(row),
    isCurrentUser: row.id === currentUserId,
  };
};

const mapWorkspaceSettings = (row: Record<string, any>): WorkspaceSettings => {
  const preferences = row.preferences && typeof row.preferences === 'object' && !Array.isArray(row.preferences)
    ? row.preferences
    : {};

  return {
    ...DEFAULT_WORKSPACE_SETTINGS,
    theme: preferences.theme === 'dark' ? 'dark' : 'light',
    accentColor: typeof preferences.accentColor === 'string' && /^#[0-9a-f]{6}$/i.test(preferences.accentColor)
      ? preferences.accentColor
      : DEFAULT_WORKSPACE_SETTINGS.accentColor,
    autoBusyInCalls: typeof preferences.autoBusyInCalls === 'boolean'
      ? preferences.autoBusyInCalls
      : DEFAULT_WORKSPACE_SETTINGS.autoBusyInCalls,
    autoBusyDuringEvents: typeof preferences.autoBusyDuringEvents === 'boolean'
      ? preferences.autoBusyDuringEvents
      : DEFAULT_WORKSPACE_SETTINGS.autoBusyDuringEvents,
    microphoneDeviceId: typeof preferences.microphoneDeviceId === 'string' ? preferences.microphoneDeviceId : '',
    cameraDeviceId: typeof preferences.cameraDeviceId === 'string' ? preferences.cameraDeviceId : '',
    ringtone: ['classic', 'chime', 'pulse', 'soft'].includes(preferences.ringtone)
      ? preferences.ringtone as Ringtone
      : DEFAULT_WORKSPACE_SETTINGS.ringtone,
    showCameraPreview: typeof preferences.showCameraPreview === 'boolean'
      ? preferences.showCameraPreview
      : DEFAULT_WORKSPACE_SETTINGS.showCameraPreview,
    noiseSuppression: typeof preferences.noiseSuppression === 'boolean'
      ? preferences.noiseSuppression
      : DEFAULT_WORKSPACE_SETTINGS.noiseSuppression,
  };
};

const loadSupabaseProfiles = async (authUser: SupabaseAuthUser) => {
  const { data: existingProfile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', authUser.id)
    .maybeSingle();

  if (profileError) throw profileError;

  let profile = existingProfile;
  if (!profile) {
    const name = String(authUser.user_metadata?.name || authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || 'Staff member');
    const { data, error } = await supabase
      .from('profiles')
      .upsert({ id: authUser.id, email: authUser.email, name }, { onConflict: 'id' })
      .select()
      .single();

    if (error) throw error;
    profile = data;
  }

  const { data: profileRows, error: rosterError } = await supabase.from('profiles').select('*');
  if (rosterError) throw rosterError;

  return {
    users: profileRows.map((row) => mapSupabaseProfile(row, authUser.id)),
    currentUser: mapSupabaseProfile(profile, authUser.id),
    settings: mapWorkspaceSettings(profile),
  };
};

const loadSupabaseWorkspaceData = async (userIds: string[]) => {
    let channelResult = await supabase.from('channels').select('*').order('created_at', { ascending: true });
    if (channelResult.error) throw channelResult.error;

    if (channelResult.data.length === 0) {
      const { error: seedError } = await supabase.from('channels').upsert(
        initialChannels.map((channel) => ({
          id: channel.id,
          name: channel.name,
          description: channel.description,
          type: channel.type,
          is_private: channel.isPrivate,
          posting_roles: channel.postingRoles,
          category: channel.category,
        })),
        { onConflict: 'id', ignoreDuplicates: true }
      );
      if (seedError) throw seedError;
      channelResult = await supabase.from('channels').select('*').order('created_at', { ascending: true });
      if (channelResult.error) throw channelResult.error;
    }

    const [memberResult, messageResult] = await Promise.all([
      supabase.from('channel_members').select('channel_id, user_id'),
      supabase.from('messages').select('*').order('created_at', { ascending: true }),
    ]);

    if (memberResult.error) throw memberResult.error;
    if (messageResult.error) throw messageResult.error;

    const membersByChannel = new Map<string, string[]>();
    for (const member of memberResult.data) {
      const members = membersByChannel.get(member.channel_id) || [];
      members.push(member.user_id);
      membersByChannel.set(member.channel_id, members);
    }

    const channels: Channel[] = channelResult.data.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description || '',
      type: row.type === 'announcement' ? 'announcement' : 'standard',
      isPrivate: Boolean(row.is_private),
      members: row.is_private
        ? membersByChannel.get(row.id) || []
        : userIds,
      postingRoles: Array.isArray(row.posting_roles) ? row.posting_roles : ['admin', 'coordinator', 'member'],
      unreadCount: 0,
      category: ['General', 'Projects', 'Departments', 'Outreach'].includes(row.category) ? row.category : 'General',
    }));

    const mapMessage = async (row: Record<string, any>): Promise<Message> => {
      const attachments = await Promise.all((Array.isArray(row.attachments) ? row.attachments : []).map(async (attachment: Attachment) => {
        if (!attachment.storagePath) return attachment;
        const { data, error } = await supabase.storage
          .from('channel-attachments')
          .createSignedUrl(attachment.storagePath, 60 * 60);
        if (error) throw new Error(`Channel attachment "${attachment.name}" could not be opened: ${error.message}`);
        return { ...attachment, url: data.signedUrl };
      }));
      return {
        id: row.id,
        conversationId: row.conversation_id,
        senderId: row.sender_id,
        senderName: row.sender_name,
        senderAvatar: row.sender_avatar || '',
        senderRole: row.sender_role || undefined,
        text: row.text || '',
        timestamp: row.timestamp || new Date(row.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
        seenBy: Array.isArray(row.seen_by) ? row.seen_by : [],
        reactions: Array.isArray(row.reactions) ? row.reactions : [],
        attachments,
        poll: row.poll || undefined,
        isCallRecord: Boolean(row.is_call_record),
        callDuration: row.call_duration || undefined,
        parentId: row.parent_id || undefined,
      };
    };

    const messages: Record<string, Message[]> = {};
    const threadReplies: Record<string, Message[]> = {};
    const repliesByParent = new Map<string, Message[]>();

    for (const row of messageResult.data) {
      const message = await mapMessage(row);
      if (message.parentId) {
        const replies = repliesByParent.get(message.parentId) || [];
        replies.push(message);
        repliesByParent.set(message.parentId, replies);
        continue;
      }
      const targetMessages = messages[message.conversationId] || [];
      targetMessages.push(message);
      messages[message.conversationId] = targetMessages;
    }

    for (const [parentId, replies] of repliesByParent) {
      threadReplies[parentId] = replies;
      for (const targetMessages of Object.values(messages)) {
        const parent = targetMessages.find((message) => message.id === parentId);
        if (parent) {
          parent.threadCount = replies.length;
          parent.lastThreadReplyAt = replies[replies.length - 1]?.timestamp;
          break;
        }
      }
    }

  return { channels, messages, threadReplies };
};

export const WorkspaceProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [requiresPasswordSetup, setRequiresPasswordSetup] = useState(false);
  const [requiresOnboarding, setRequiresOnboarding] = useState(false);

  const [isSupabaseConnected, setIsSupabaseConnected] = useState<boolean>(false);

  // Users state
  const [users, setUsers] = useState<User[]>([]);
  const [systemActivityLogs, setSystemActivityLogs] = useState<SystemActivityLog[]>([]);
  const [systemActivityLogError, setSystemActivityLogError] = useState('');

  const [currentUser, setCurrentUser] = useState<User>({
    id: '',
    name: '',
    email: '',
    avatar: '',
    role: '',
    department: '',
    phone: '',
    status: 'offline',
    systemRole: 'member',
  });
  const [workspaceSettings, setWorkspaceSettings] = useState<WorkspaceSettings>(DEFAULT_WORKSPACE_SETTINGS);

  // Navigation
  const [activeTab, setActiveTabState] = useState<WorkspaceTab>(() => {
    if (typeof window === 'undefined') return 'home';
    return tabFromPath(window.location.pathname)
      || (new URLSearchParams(window.location.search).get('mail_oauth') === 'callback' ? 'inbox' : 'home');
  });
  const [activeConversationId, setActiveConversationId] = useState<string>('');
  const [activeChannelId, setActiveChannelId] = useState<string>('chan-announcements');
  const [activeThreadMessageId, setActiveThreadMessageId] = useState<string | null>(null);
  const [isRightDrawerOpen, setIsRightDrawerOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [focusedEmailId, setFocusedEmailId] = useState<string | null>(null);

  const [conversations, setConversations] = useState<Conversation[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_PREFIX}conversations`);
    return saved ? JSON.parse(saved) : initialConversations;
  });

  const [channels, setChannels] = useState<Channel[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_PREFIX}channels`);
    return saved ? JSON.parse(saved) : initialChannels;
  });

  const [messages, setMessages] = useState<Record<string, Message[]>>(() => {
    const saved = localStorage.getItem(`${STORAGE_PREFIX}messages`);
    return saved ? JSON.parse(saved) : initialMessages;
  });

  const [threadReplies, setThreadReplies] = useState<Record<string, Message[]>>(() => {
    const saved = localStorage.getItem(`${STORAGE_PREFIX}thread_replies`);
    return saved ? JSON.parse(saved) : initialThreadReplies;
  });

  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_PREFIX}events`);
    return saved ? JSON.parse(saved) : initialCalendarEvents;
  });

  const [notifications, setNotifications] = useState<NotificationItem[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_PREFIX}notifications`);
    return saved ? JSON.parse(saved) : initialNotifications;
  });

  const [soundEnabled, setSoundEnabled] = useState<boolean>(() =>
    localStorage.getItem(`${STORAGE_PREFIX}sound_enabled`) !== 'false'
  );

  // Modals state
  const [activeProfileModalUser, setActiveProfileModalUser] = useState<User | null>(null);
  const [isProfileSettingsOpen, setIsProfileSettingsOpen] = useState<boolean>(false);
  const [isWorkspaceSettingsOpen, setIsWorkspaceSettingsOpen] = useState<boolean>(false);
  const [isCreateChannelOpen, setIsCreateChannelOpen] = useState<boolean>(false);
  const [isCreatePollOpen, setIsCreatePollOpen] = useState<boolean>(false);
  const [isNewMessageOpen, setIsNewMessageOpen] = useState<boolean>(false);
  const [isAddEventOpen, setIsAddEventOpen] = useState<boolean>(false);
  const [isEmailComposeRequested, setIsEmailComposeRequested] = useState<boolean>(false);
  const [isAddTeammateOpen, setIsAddTeammateOpen] = useState<boolean>(false);
  const [inviteReadyData, setInviteReadyData] = useState<WorkspaceContextType['inviteReadyData']>(null);

  // In-app calling state
  const [callSession, setCallSession] = useState<CallSession>({
    active: false,
    type: 'video',
    status: 'connected',
    isMuted: false,
    isCameraOff: false,
    isScreenSharing: false,
    durationSeconds: 0,
    isMinimized: false,
  });
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [callError, setCallError] = useState('');
  const [dismissedCallIds, setDismissedCallIds] = useState<string[]>([]);
  const callStartInProgressRef = React.useRef(false);
  const lastRingingCallIdRef = React.useRef<string | null>(null);

  const refreshSystemActivityLogs = async () => {
    if (currentUser.systemRole !== 'admin') {
      setSystemActivityLogs([]);
      setSystemActivityLogError('');
      return;
    }
    const { data, error } = await supabase
      .from('system_activity_logs')
      .select('id, created_at, actor_id, actor_name, event_type, target_type, target_id, target_name, summary, metadata')
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) {
      setSystemActivityLogError(error.message);
      throw error;
    }
    setSystemActivityLogs((data || []) as SystemActivityLog[]);
    setSystemActivityLogError('');
  };

  const recordSystemActivity = async (activity: SystemActivityInput, actor: User = currentUser) => {
    if (!actor.id) return;
    const logEntry: SystemActivityLog = {
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      actor_id: actor.id,
      actor_name: actor.name,
      event_type: activity.eventType,
      target_type: activity.targetType || null,
      target_id: activity.targetId || null,
      target_name: activity.targetName || null,
      summary: activity.summary,
      metadata: activity.metadata || {},
    };
    const { error } = await supabase.from('system_activity_logs').insert(logEntry);
    if (error) {
      setSystemActivityLogError(error.message);
      console.error('Unable to persist system activity log:', error);
      return;
    }
    setSystemActivityLogError('');
    if (actor.systemRole === 'admin') {
      setSystemActivityLogs((previous) => [logEntry, ...previous].slice(0, 500));
    }
  };

  useEffect(() => {
    if (!currentUser.id) return;
    let active = true;

    const handleCallRow = (rawRow: Record<string, unknown>) => {
      const row = rawRow as unknown as IncomingCall;
      if (!row.id || !row.participant_ids?.includes(currentUser.id)) return;

      if (row.id === callSession.sessionId && row.status === 'ended') {
        setCallSession((previous) => ({ ...previous, active: false, status: 'ended', isScreenSharing: false }));
        return;
      }
      if (row.status === 'ended') {
        setIncomingCall((previous) => previous?.id === row.id ? null : previous);
        return;
      }
      if (
        row.caller_id === currentUser.id
        || row.declined_by?.includes(currentUser.id)
        || dismissedCallIds.includes(row.id)
        || (callSession.active && callSession.sessionId !== row.id)
      ) return;

      if (lastRingingCallIdRef.current !== row.id) {
        lastRingingCallIdRef.current = row.id;
        sounds.playRingTone();
      }
      setIncomingCall({
        ...row,
        caller: users.find((user) => user.id === row.caller_id),
      });
    };

    const loadIncomingCalls = async () => {
      const since = new Date(Date.now() - 15 * 60_000).toISOString();
      const { data, error } = await supabase
        .from('call_sessions')
        .select('*')
        .in('status', ['ringing', 'active'])
        .contains('participant_ids', [currentUser.id])
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(1);
      if (error) {
        console.error('Unable to load incoming calls:', error);
        return;
      }
      if (active && data?.[0]) handleCallRow(data[0]);
    };

    void loadIncomingCalls();
    const channel = supabase
      .channel(`call-sessions:${currentUser.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'call_sessions' }, (payload) => {
        if (payload.new && Object.keys(payload.new).length) handleCallRow(payload.new as Record<string, unknown>);
      })
      .subscribe((status, error) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('Call signaling subscription failed:', error);
        }
      });

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [currentUser.id, users, callSession.active, callSession.sessionId, dismissedCallIds]);

  // Call timer
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (callSession.active && callSession.status === 'connected') {
      interval = setInterval(() => {
        setCallSession((prev) => ({
          ...prev,
          durationSeconds: prev.durationSeconds + 1,
        }));
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [callSession.active, callSession.status]);

  // Restore the Supabase session and keep workspace authentication in sync.
  useEffect(() => {
    testSupabaseConnection().then((res) => {
      setIsSupabaseConnected(res.success);
    });

    let active = true;
    let authEventSeen = false;

    const applySession = async (session: { user: SupabaseAuthUser } | null) => {
      if (!session) {
        if (active) {
          setIsAuthenticated(false);
          setRequiresPasswordSetup(false);
          setRequiresOnboarding(false);
          setUsers([]);
          setSystemActivityLogs([]);
          setSystemActivityLogError('');
          setCurrentUser({ id: '', name: '', email: '', avatar: '', role: '', department: '', phone: '', status: 'offline', systemRole: 'member' });
          setIsAuthLoading(false);
        }
        return;
      }

      try {
        const profileData = await loadSupabaseProfiles(session.user);
        const workspaceData = await loadSupabaseWorkspaceData(profileData.users.map((user) => user.id));
        if (active) {
          setUsers(profileData.users);
          setCurrentUser(profileData.currentUser);
          setWorkspaceSettings(profileData.settings);
          setChannels(workspaceData.channels);
          setMessages(workspaceData.messages);
          setThreadReplies(workspaceData.threadReplies);
          setIsAuthenticated(true);
          setRequiresPasswordSetup(session.user.app_metadata?.password_reset_required === true);
          setRequiresOnboarding(session.user.user_metadata?.onboarding_completed !== true);
        }
      } catch (error) {
        console.error('Unable to load Supabase workspace data:', error);
        if (active) setIsAuthenticated(false);
      } finally {
        if (active) setIsAuthLoading(false);
      }
    };

    supabase.auth.getSession().then(({ data, error }) => {
      if (error) console.error('Unable to restore Supabase session:', error);
      if (active && !authEventSeen) void applySession(data?.session ?? null);
    }).catch((error) => {
      console.error('Unable to restore Supabase session:', error);
      if (active) setIsAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      authEventSeen = true;
      window.setTimeout(() => {
        if (active) void applySession(session);
      }, 0);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  // Save state to localStorage
  useEffect(() => {
    localStorage.removeItem(`${STORAGE_PREFIX}is_auth`);
    localStorage.removeItem(`${STORAGE_PREFIX}current_user`);
    localStorage.removeItem(`${STORAGE_PREFIX}users`);
  }, []);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_PREFIX}conversations`, JSON.stringify(conversations));
  }, [conversations]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_PREFIX}channels`, JSON.stringify(channels));
  }, [channels]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_PREFIX}messages`, JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_PREFIX}thread_replies`, JSON.stringify(threadReplies));
  }, [threadReplies]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_PREFIX}events`, JSON.stringify(calendarEvents));
  }, [calendarEvents]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_PREFIX}notifications`, JSON.stringify(notifications));
  }, [notifications]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_PREFIX}sound_enabled`, String(soundEnabled));
    sounds.setSoundEnabled(soundEnabled);
  }, [soundEnabled]);

  // Login handler
  const login = async (email: string, pass: string): Promise<{ success: boolean; message?: string }> => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password: pass,
    });

    if (error || !data.user) {
      return { success: false, message: error?.message || 'Unable to sign in.' };
    }

    try {
      const profileData = await loadSupabaseProfiles(data.user);
      const workspaceData = await loadSupabaseWorkspaceData(profileData.users.map((user) => user.id));
      setUsers(profileData.users);
      setCurrentUser(profileData.currentUser);
      setWorkspaceSettings(profileData.settings);
      setChannels(workspaceData.channels);
      setMessages(workspaceData.messages);
      setThreadReplies(workspaceData.threadReplies);
      setIsAuthenticated(true);
      setRequiresPasswordSetup(data.user.app_metadata?.password_reset_required === true);
      setRequiresOnboarding(data.user.user_metadata?.onboarding_completed !== true);
      await recordSystemActivity({
        eventType: 'user_signed_in',
        summary: 'Signed in to the workspace.',
        targetType: 'user',
        targetId: profileData.currentUser.id,
        targetName: profileData.currentUser.name,
      }, profileData.currentUser);
      sounds.playNotification();
      return { success: true };
    } catch (profileError) {
      await supabase.auth.signOut();
      const errorMessage = profileError instanceof Error ? profileError.message : 'Unknown error';
      if (errorMessage.includes("Could not find the table 'public.profiles'")) {
        return {
          success: false,
          message: 'The staff profiles table is missing from Supabase. Run supabase_schema.sql in the Supabase SQL Editor, then try signing in again.',
        };
      }
      if (["public.channels", "public.channel_members", "public.messages"].some((table) => errorMessage.includes(`'${table}'`))) {
        return {
          success: false,
          message: `Workspace tables are missing from Supabase. Apply the channels, channel_members, and messages table definitions and policies from supabase_schema.sql, then try signing in again. Details: ${errorMessage}`,
        };
      }
      return { success: false, message: `Signed in, but workspace data could not be loaded: ${errorMessage}` };
    }
  };

  const logout = () => {
    void recordSystemActivity({
      eventType: 'user_signed_out',
      summary: 'Signed out of the workspace.',
      targetType: 'user',
      targetId: currentUser.id,
      targetName: currentUser.name,
    }).finally(() => supabase.auth.signOut());
    setIsAuthenticated(false);
    setUsers([]);
    setCurrentUser({ id: '', name: '', email: '', avatar: '', role: '', department: '', phone: '', status: 'offline', systemRole: 'member' });
  };

  const setPassword = async (password: string): Promise<{ success: boolean; message?: string }> => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { success: false, message: error.message };

    const url = new URL(window.location.href);
    url.searchParams.delete('invite');
    window.history.replaceState({}, '', url);

    const { error: resetFlagError } = await supabase.functions.invoke('admin-manage-user', {
      body: { action: 'complete-password-reset' },
    });
    if (resetFlagError) {
      const functionError = await getFunctionError(resetFlagError);
      return { success: false, message: `Password updated, but the temporary-password requirement could not be cleared: ${functionError.message}` };
    }

    const { data: refreshedSession, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) {
      return { success: false, message: `Password was updated, but the sign-in session could not be refreshed: ${refreshError.message}` };
    }
    if (refreshedSession.user?.app_metadata?.password_reset_required === true) {
      return { success: false, message: 'Password was updated, but the temporary-password flag is still active. Please try again.' };
    }

    setRequiresPasswordSetup(false);
    await recordSystemActivity({
      eventType: 'password_changed',
      summary: 'Changed their sign-in password.',
      targetType: 'user',
      targetId: currentUser.id,
      targetName: currentUser.name,
    });
    return { success: true };
  };

  const completeOnboarding = async () => {
    const { error } = await supabase.functions.invoke('admin-manage-user', {
      body: { action: 'complete-onboarding' },
    });
    if (error) throw await getFunctionError(error);
    const { data, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) throw refreshError;
    if (data.user?.user_metadata?.onboarding_completed !== true) {
      throw new Error('Your profile was saved, but onboarding status could not be confirmed. Please try again.');
    }
    setRequiresOnboarding(false);
    await recordSystemActivity({
      eventType: 'onboarding_completed',
      summary: 'Completed first-time profile setup and workspace tour.',
      targetType: 'user',
      targetId: currentUser.id,
      targetName: currentUser.name,
    });
  };

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handlePopState = () => {
      const tab = tabFromPath(window.location.pathname);
      if (tab) {
        setActiveTabState(tab);
        setActiveThreadMessageId(null);
      }
    };
    window.addEventListener('popstate', handlePopState);
    if (!tabFromPath(window.location.pathname) && window.location.pathname === '/') {
      window.history.replaceState({}, '', `${pathForTab(activeTab)}${window.location.search}${window.location.hash}`);
    }
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const setActiveTab = (tab: WorkspaceTab) => {
    setActiveTabState(tab);
    setActiveThreadMessageId(null);
    if (typeof window !== 'undefined' && window.location.pathname !== pathForTab(tab)) {
      window.history.pushState({}, '', `${pathForTab(tab)}${window.location.search}${window.location.hash}`);
    }
  };

  const requestEmailCompose = () => {
    setActiveTab('inbox');
    setIsEmailComposeRequested(true);
  };

  const openThread = (messageId: string) => {
    setActiveThreadMessageId(messageId);
    setIsRightDrawerOpen(false);
  };

  const closeThread = () => {
    setActiveThreadMessageId(null);
  };

  const toggleRightDrawer = () => {
    setIsRightDrawerOpen((prev) => !prev);
    if (!isRightDrawerOpen) {
      setActiveThreadMessageId(null);
    }
  };

  const setRightDrawerOpen = (open: boolean) => {
    setIsRightDrawerOpen(open);
    if (open) setActiveThreadMessageId(null);
  };

  const openUserProfile = (user: User) => {
    setActiveProfileModalUser(user);
  };

  const closeUserProfile = () => {
    setActiveProfileModalUser(null);
  };

  const updateCurrentUser = async (updates: Partial<User>) => {
    const updated = { ...currentUser, ...updates };
    setCurrentUser(updated);
    setUsers((prevUsers) =>
      prevUsers.map((u) => (u.id === currentUser.id ? updated : u))
    );
    if (updates.preferences) setWorkspaceSettings(updates.preferences);

    const { error } = await supabase.from('profiles').upsert({
      id: updated.id,
      email: updated.email,
      name: updated.name,
      role: updated.role,
      department: updated.department,
      phone: updated.phone,
      avatar_url: updated.avatar,
      system_role: updated.systemRole,
      status: updated.status,
      status_message: updated.statusMessage,
      bio: updated.bio,
      location: updated.location,
      banner: updated.banner,
      preferences: updated.preferences,
    });
    if (error) {
      console.error('Unable to persist profile changes:', error);
      return;
    }
    if (updated.id === currentUser.id && updates.id === undefined) {
      const changedFields = Object.keys(updates).filter((field) => field === 'status' || field === 'statusMessage');
      if (changedFields.length) {
        await recordSystemActivity({
          eventType: 'availability_updated',
          summary: 'Updated their availability or status message.',
          targetType: 'user',
          targetId: currentUser.id,
          targetName: updated.name,
          metadata: { fields: changedFields },
        });
      }
    }
  };

  const saveCurrentProfile = async (updates: Partial<User>) => {
    const updated = { ...currentUser, ...updates };
    const { error } = await supabase
      .from('profiles')
      .update({
        name: updated.name,
        role: updated.role,
        department: updated.department,
        phone: updated.phone,
        email: updated.email,
        avatar_url: updated.avatar,
        status_message: updated.statusMessage,
        bio: updated.bio,
        location: updated.location,
        banner: updated.banner,
      })
      .eq('id', currentUser.id);

    if (error) throw error;
    setCurrentUser(updated);
    setUsers((previous) => previous.map((user) => user.id === currentUser.id ? updated : user));
    await recordSystemActivity({
      eventType: 'profile_updated',
      summary: 'Updated their profile.',
      targetType: 'user',
      targetId: currentUser.id,
      targetName: currentUser.name,
      metadata: { fields: Object.keys(updates).filter((field) => field !== 'avatar') },
    });
  };

  const saveWorkspaceSettings = async (settings: WorkspaceSettings) => {
    const { data, error } = await supabase
      .from('profiles')
      .update({ preferences: settings })
      .eq('id', currentUser.id)
      .select('id')
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      throw new Error('Settings were not saved because your profile was not updated. Check that you are signed in and that the profile update policy is applied.');
    }
    setWorkspaceSettings(settings);
    setCurrentUser((user) => ({ ...user, preferences: settings }));
    setUsers((previous) => previous.map((user) => user.id === currentUser.id ? { ...user, preferences: settings } : user));
    await recordSystemActivity({
      eventType: 'settings_updated',
      summary: 'Updated personal workspace settings.',
      targetType: 'user',
      targetId: currentUser.id,
      targetName: currentUser.name,
      metadata: { fields: Object.keys(settings) },
    });
  };

  useEffect(() => {
    document.documentElement.dataset.theme = workspaceSettings.theme;
    document.documentElement.style.setProperty('--brand-accent', workspaceSettings.accentColor);
    sounds.setRingtone(workspaceSettings.ringtone);
  }, [workspaceSettings.theme, workspaceSettings.accentColor, workspaceSettings.ringtone]);

  const automaticStatusRef = React.useRef<{ userId: string; previousStatus: UserStatus } | null>(null);
  useEffect(() => {
    const evaluateAutomaticStatus = () => {
      if (!currentUser.id) return;
      if (automaticStatusRef.current && automaticStatusRef.current.userId !== currentUser.id) {
        automaticStatusRef.current = null;
      }

      const storageKey = `${STORAGE_PREFIX}auto_status_previous_${currentUser.id}`;
      const storedStatus = localStorage.getItem(storageKey) as UserStatus | null;
      const now = new Date();
      const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const hasActiveEvent = workspaceSettings.autoBusyDuringEvents && calendarEvents.some((event) =>
        event.date === date && (event.isAllDay || (time >= event.startTime && time <= event.endTime))
      );
      const shouldBeBusy =
        (workspaceSettings.autoBusyInCalls && callSession.active)
        || hasActiveEvent;

      if (shouldBeBusy && !automaticStatusRef.current) {
        const previousStatus = storedStatus || currentUser.status;
        automaticStatusRef.current = { userId: currentUser.id, previousStatus };
        if (!storedStatus) localStorage.setItem(storageKey, previousStatus);
        if (currentUser.status !== 'busy') void updateCurrentUser({ status: 'busy' });
      } else if (!shouldBeBusy && (automaticStatusRef.current || storedStatus)) {
        const previousStatus = automaticStatusRef.current?.previousStatus || storedStatus || currentUser.status;
        automaticStatusRef.current = null;
        localStorage.removeItem(storageKey);
        if (currentUser.status === 'busy') void updateCurrentUser({ status: previousStatus });
      }
    };

    evaluateAutomaticStatus();
    const timer = window.setInterval(evaluateAutomaticStatus, 30_000);
    return () => window.clearInterval(timer);
  }, [
    calendarEvents,
    callSession.active,
    currentUser.id,
    currentUser.status,
    workspaceSettings.autoBusyDuringEvents,
    workspaceSettings.autoBusyInCalls,
  ]);

  // Add teammate / Register staff
  const addTeammate = async (user: Pick<User, 'name' | 'email'>) => {
    const { data, error } = await supabase.functions.invoke('invite-user', {
      body: {
        name: user.name,
        email: user.email,
      },
    });

    if (error) throw await getFunctionError(error);
    if (!data?.userId || !data?.temporaryPassword || !data?.loginUrl) {
      throw new Error('The staff account was created, but its one-time sign-in details were not returned.');
    }

    setUsers((previous) => [
      ...previous.filter((existing) => existing.id !== data.userId),
      {
        ...user,
        id: data.userId,
        role: '',
        department: '',
        phone: '',
        status: 'offline',
        systemRole: 'member',
        avatar: '',
        isCurrentUser: false,
      },
    ]);
    setChannels((prevChans) =>
      prevChans.map((channel) =>
        !channel.isPrivate && !channel.members.includes(data.userId)
          ? { ...channel, members: [...channel.members, data.userId] }
          : channel
      )
    );

    setInviteReadyData({
      name: user.name,
      email: user.email,
      role: '',
      systemRole: 'member',
      temporaryPassword: data.temporaryPassword,
      loginUrl: data.loginUrl,
    });

    sounds.playNotification();

    setNotifications((prev) => [
      {
        id: `notif-user-${Date.now()}`,
        type: 'message',
        title: 'Staff Registered',
        description: `${user.name} was added to the workspace.`,
        timestamp: 'Just now',
        isRead: false,
        linkTab: 'messages',
      },
      ...prev,
    ]);
    await recordSystemActivity({
      eventType: 'staff_created',
      summary: `Created a staff account for ${user.name}.`,
      targetType: 'user',
      targetId: data.userId,
      targetName: user.name,
    });
  };

  const updateStaffUser = async (userId: string, updates: Partial<User>) => {
    const { error } = await supabase.functions.invoke('admin-manage-user', {
      body: {
        action: 'update-profile',
        userId,
        profile: {
          name: updates.name,
          role: updates.role,
          department: updates.department,
          phone: updates.phone,
          avatar_url: updates.avatar,
          status: updates.status,
          status_message: updates.statusMessage,
          bio: updates.bio,
          location: updates.location,
          banner: updates.banner,
          system_role: updates.systemRole,
        },
      },
    });
    if (error) throw await getFunctionError(error);

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (profileError) throw profileError;
    setUsers((previous) => previous.map((user) =>
      user.id === userId ? mapSupabaseProfile(profile, currentUser.id) : user
    ));
    if (userId === currentUser.id) setCurrentUser(mapSupabaseProfile(profile, currentUser.id));
    const target = users.find((user) => user.id === userId);
    await recordSystemActivity({
      eventType: 'staff_profile_updated',
      summary: `Updated ${target?.name || 'a staff member'}'s profile and access.`,
      targetType: 'user',
      targetId: userId,
      targetName: profile.name || target?.name || 'Unknown user',
      metadata: { fields: Object.keys(updates).filter((field) => field !== 'avatar') },
    });
  };

  const manageStaffAccount = async (
    userId: string,
    action: 'suspend' | 'reactivate' | 'remove',
    note?: string,
    suspensionDuration?: '1h' | '24h' | '7d' | '30d' | 'indefinite',
  ) => {
    if (currentUser.systemRole !== 'admin') {
      throw new Error('Only workspace administrators can manage staff accounts.');
    }
    if (userId === currentUser.id && action !== 'reactivate') {
      throw new Error('You cannot suspend or remove your own admin account.');
    }

    const target = users.find((user) => user.id === userId) || null;
    const nextAction = action === 'suspend' ? 'suspend-user' : action === 'reactivate' ? 'reactivate-user' : 'delete-user';
    const { data, error } = await supabase.functions.invoke('admin-manage-user', {
      body: { action: nextAction, userId, note: note || '', suspensionDuration },
    });
    if (error) {
      throw await getFunctionError(error);
    }

    setUsers((previous) => {
      if (action === 'remove') {
        return previous.filter((user) => user.id !== userId);
      }

      return previous.map((user) => {
        if (user.id !== userId) return user;
        return {
          ...user,
          accountStatus: action === 'suspend' ? 'suspended' : 'active',
          suspendedUntil: action === 'suspend' ? data?.suspendedUntil || null : null,
          status: action === 'suspend' ? 'offline' : 'online',
        };
      });
    });

    await recordSystemActivity({
      eventType: action === 'remove' ? 'staff_removed' : action === 'suspend' ? 'staff_suspended' : 'staff_reactivated',
      summary: note || `${currentUser.name} ${action === 'suspend' ? 'suspended' : action === 'reactivate' ? 'reactivated' : 'removed'} ${target?.name || 'this user'}.`,
      targetType: 'user',
      targetId: userId,
      targetName: target?.name || 'Unknown user',
      metadata: { suspensionDuration: action === 'suspend' ? suspensionDuration || '7d' : undefined },
    });

    if (action === 'remove') {
      setNotifications((previous) => [{
        id: `notif-admin-remove-${Date.now()}`,
        type: 'announcement',
        title: 'User removed',
        description: `${target?.name || 'User'} was removed from the workspace.`,
        timestamp: 'Just now',
        isRead: false,
        linkTab: 'channels',
      }, ...previous]);
    }
  };

  const setStaffTemporaryPassword = async (userId: string, password: string) => {
    const { error } = await supabase.functions.invoke('admin-manage-user', {
      body: { action: 'set-password', userId, password },
    });
    if (error) throw await getFunctionError(error);
    const target = users.find((user) => user.id === userId);
    await recordSystemActivity({
      eventType: 'staff_password_reset',
      summary: `Reset the sign-in password for ${target?.name || 'a staff member'}.`,
      targetType: 'user',
      targetId: userId,
      targetName: target?.name || 'Unknown user',
    });
  };

  const resetWorkspace = () => {
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith('beacon_')) {
        localStorage.removeItem(key);
      }
    });
    window.location.reload();
  };

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    sounds.setSoundEnabled(next);
  };

  const unreadNotificationCount = notifications.filter((n) => !n.isRead).length;

  const markNotificationRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
  };

  const markAllNotificationsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  };

  // Messaging
  const sendMessage = async (text: string, attachments?: Attachment[], poll?: Poll, targetConversationId?: string) => {
    const isChannelMessage = !targetConversationId && activeTab === 'channels';
    const targetId = targetConversationId || (isChannelMessage ? activeChannelId : activeConversationId);
    if (!targetId || (!text.trim() && !attachments?.length && !poll)) return;
    if (!currentUser.id) throw new Error('Sign in before sending messages.');

    const newMsg: Message = {
      id: `msg-${crypto.randomUUID()}`,
      conversationId: targetId,
      senderId: currentUser.id,
      senderName: currentUser.name,
      senderAvatar: currentUser.avatar,
      senderRole: currentUser.role,
      text: text.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      seenBy: [currentUser.id],
      reactions: [],
      attachments: attachments || [],
      poll: poll,
    };

    const { error } = await supabase.from('messages').insert({
      id: newMsg.id,
      conversation_id: targetId,
      sender_id: currentUser.id,
      sender_name: currentUser.name,
      sender_avatar: currentUser.avatar,
      sender_role: currentUser.role,
      text: newMsg.text,
      timestamp: newMsg.timestamp,
      attachments: newMsg.attachments,
      poll: newMsg.poll,
      reactions: newMsg.reactions,
      seen_by: newMsg.seenBy,
      is_call_record: false,
    });
    if (error) throw error;

    const messageTarget = isChannelMessage
      ? channels.find((channel) => channel.id === targetId)
      : conversations.find((conversation) => conversation.id === targetId);
    await recordSystemActivity({
      eventType: poll ? 'poll_created' : 'message_sent',
      summary: `${poll ? 'Created a poll' : 'Sent a message'} in ${isChannelMessage ? `#${messageTarget?.name || 'channel'}` : messageTarget?.name || 'a conversation'}.`,
      targetType: isChannelMessage ? 'channel' : 'conversation',
      targetId,
      targetName: messageTarget?.name || 'Conversation',
      metadata: { attachmentCount: attachments?.length || 0, includesPoll: Boolean(poll) },
    });

    sounds.playMessageSent();
    setMessages((prev) => ({
      ...prev,
      [targetId]: [...(prev[targetId] || []), newMsg],
    }));

    if (!isChannelMessage) {
      setConversations((prev) =>
        prev.map((conv) => {
          if (conv.id === targetId) {
            return {
              ...conv,
              lastMessage: {
                text: poll ? `📊 Poll: ${poll.question}` : text || 'Shared an attachment',
                timestamp: 'Just now',
                senderId: currentUser.id,
              },
            };
          }
          return conv;
        })
      );
    } else {
      setChannels((prev) =>
        prev.map((ch) => {
          if (ch.id === targetId) {
            return {
              ...ch,
              lastPost: {
                text: poll ? `📊 Poll: ${poll.question}` : text || 'Shared an attachment',
                timestamp: 'Just now',
                senderName: currentUser.name,
              },
            };
          }
          return ch;
        })
      );
    }

    if (text.includes('@everyone') || text.includes('@channel')) {
      setTimeout(() => {
        sounds.playNotification();
        setNotifications((prev) => [
          {
            id: `notif-${Date.now()}`,
            type: 'mention',
            title: `Mention in ${activeTab === 'channels' ? '#' + (channels.find((c) => c.id === targetId)?.name || 'channel') : 'group'}`,
            description: `${currentUser.name} pinged the channel`,
            timestamp: 'Just now',
            isRead: false,
            linkTab: activeTab === 'admin' || activeTab === 'inbox' ? 'channels' : activeTab,
            targetId,
          },
          ...prev,
        ]);
      }, 500);
    }
  };

  const postChannelMessage = async (channelId: string, text: string, attachments: Attachment[] = []) => {
    const channel = channels.find((item) => item.id === channelId);
    if (!channel) throw new Error('The selected channel could not be found.');
    if (channel.isPrivate && !channel.members.includes(currentUser.id)) {
      throw new Error('You do not have access to that channel.');
    }
    if (!channel.postingRoles.includes(currentUser.systemRole)) {
      throw new Error('You do not have permission to post in that channel.');
    }
    if (!text.trim() && attachments.length === 0) return;
    if (!currentUser.id) throw new Error('Sign in before sending messages.');

    const newMsg: Message = {
      id: `msg-${crypto.randomUUID()}`,
      conversationId: channelId,
      senderId: currentUser.id,
      senderName: currentUser.name,
      senderAvatar: currentUser.avatar,
      senderRole: currentUser.role,
      text: text.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      seenBy: [currentUser.id],
      reactions: [],
      attachments,
    };
    const { error } = await supabase.from('messages').insert({
      id: newMsg.id,
      conversation_id: channelId,
      sender_id: currentUser.id,
      sender_name: currentUser.name,
      sender_avatar: currentUser.avatar,
      sender_role: currentUser.role,
      text: newMsg.text,
      timestamp: newMsg.timestamp,
      attachments,
      reactions: [],
      seen_by: [currentUser.id],
      is_call_record: false,
    });
    if (error) throw error;

    setMessages((previous) => ({ ...previous, [channelId]: [...(previous[channelId] || []), newMsg] }));
    setChannels((previous) => previous.map((item) => item.id === channelId
      ? { ...item, lastPost: { text: newMsg.text || 'Shared an attachment', timestamp: 'Just now', senderName: currentUser.name } }
      : item));
    await recordSystemActivity({
      eventType: 'email_shared_to_channel',
      summary: `Shared an email to #${channel.name}.`,
      targetType: 'channel',
      targetId: channelId,
      targetName: channel.name,
      metadata: { attachmentCount: attachments.length },
    });
  };

  // Thread reply
  const sendThreadReply = async (parentId: string, text: string, attachments?: Attachment[]) => {
    if (!text.trim() && !attachments?.length) return;
    if (!currentUser.id) throw new Error('Sign in before sending messages.');

    const targetId = activeTab === 'channels' ? activeChannelId : activeConversationId;
    const newReply: Message = {
      id: `msg-${crypto.randomUUID()}`,
      conversationId: targetId,
      parentId,
      senderId: currentUser.id,
      senderName: currentUser.name,
      senderAvatar: currentUser.avatar,
      senderRole: currentUser.role,
      text: text.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      seenBy: [currentUser.id],
      reactions: [],
      attachments: attachments || [],
    };

    const { error } = await supabase.from('messages').insert({
      id: newReply.id,
      conversation_id: targetId,
      parent_id: parentId,
      sender_id: currentUser.id,
      sender_name: currentUser.name,
      sender_avatar: currentUser.avatar,
      sender_role: currentUser.role,
      text: newReply.text,
      timestamp: newReply.timestamp,
      attachments: newReply.attachments,
      reactions: newReply.reactions,
      seen_by: newReply.seenBy,
    });
    if (error) throw error;

    const threadTarget = activeTab === 'channels'
      ? channels.find((channel) => channel.id === targetId)
      : conversations.find((conversation) => conversation.id === targetId);
    await recordSystemActivity({
      eventType: 'thread_reply_sent',
      summary: `Replied in a thread in ${activeTab === 'channels' ? `#${threadTarget?.name || 'channel'}` : threadTarget?.name || 'a conversation'}.`,
      targetType: activeTab === 'channels' ? 'channel' : 'conversation',
      targetId,
      targetName: threadTarget?.name || 'Conversation',
      metadata: { attachmentCount: attachments?.length || 0 },
    });

    sounds.playMessageSent();
    setThreadReplies((prev) => ({
      ...prev,
      [parentId]: [...(prev[parentId] || []), newReply],
    }));
    setMessages((prev) => ({
      ...prev,
      [targetId]: (prev[targetId] || []).map((message) =>
        message.id === parentId
          ? { ...message, threadCount: (message.threadCount || 0) + 1, lastThreadReplyAt: 'Just now' }
          : message
      ),
    }));
  };

  const votePoll = (messageId: string, optionId: string, parentId?: string) => {
    sounds.playReaction();
    void recordSystemActivity({
      eventType: 'poll_vote_changed',
      summary: 'Cast or changed a vote in a poll.',
      targetType: 'poll',
      targetId: messageId,
    });

    const updatePollInList = (list: Message[]) =>
      list.map((msg) => {
        if (msg.id === messageId && msg.poll) {
          const poll = msg.poll;
          const userAlreadyVotedThisOption = poll.options
            .find((o) => o.id === optionId)
            ?.votes.includes(currentUser.id);

          const updatedOptions = poll.options.map((opt) => {
            if (opt.id === optionId) {
              return {
                ...opt,
                votes: userAlreadyVotedThisOption
                  ? opt.votes.filter((id) => id !== currentUser.id)
                  : [...opt.votes, currentUser.id],
              };
            } else {
              return {
                ...opt,
                votes: opt.votes.filter((id) => id !== currentUser.id),
              };
            }
          });

          const newTotalVotes = updatedOptions.reduce((acc, curr) => acc + curr.votes.length, 0);

          return {
            ...msg,
            poll: {
              ...poll,
              options: updatedOptions,
              totalVotes: newTotalVotes,
            },
          };
        }
        return msg;
      });

    if (parentId) {
      setThreadReplies((prev) => ({
        ...prev,
        [parentId]: updatePollInList(prev[parentId] || []),
      }));
    } else {
      const targetId = activeTab === 'channels' ? activeChannelId : activeConversationId;
      setMessages((prev) => ({
        ...prev,
        [targetId]: updatePollInList(prev[targetId] || []),
      }));
    }
  };

  const toggleReaction = (messageId: string, emoji: string, parentId?: string) => {
    sounds.playReaction();
    const targetId = activeTab === 'channels' ? activeChannelId : activeConversationId;
    void recordSystemActivity({
      eventType: 'message_reaction_changed',
      summary: 'Added or removed a reaction on a message.',
      targetType: activeTab === 'channels' ? 'channel' : 'conversation',
      targetId,
      targetName: activeTab === 'channels'
        ? channels.find((channel) => channel.id === targetId)?.name || 'Channel'
        : conversations.find((conversation) => conversation.id === targetId)?.name || 'Conversation',
      metadata: { messageId, isThreadReply: Boolean(parentId) },
    });

    const updateReactionInList = (list: Message[]) =>
      list.map((msg) => {
        if (msg.id === messageId) {
          const reactions = [...(msg.reactions || [])];
          const existing = reactions.find((r) => r.emoji === emoji);

          if (existing) {
            const hasReacted = existing.users.includes(currentUser.id);
            if (hasReacted) {
              existing.users = existing.users.filter((u) => u !== currentUser.id);
            } else {
              existing.users.push(currentUser.id);
            }
          } else {
            reactions.push({ emoji, users: [currentUser.id] });
          }

          return {
            ...msg,
            reactions: reactions.filter((r) => r.users.length > 0),
          };
        }
        return msg;
      });

    if (parentId) {
      setThreadReplies((prev) => ({
        ...prev,
        [parentId]: updateReactionInList(prev[parentId] || []),
      }));
    } else {
      const targetId = activeTab === 'channels' ? activeChannelId : activeConversationId;
      setMessages((prev) => ({
        ...prev,
        [targetId]: updateReactionInList(prev[targetId] || []),
      }));
    }
  };

  const togglePinConversation = (id: string) => {
    const conversation = conversations.find((item) => item.id === id);
    void recordSystemActivity({
      eventType: conversation?.isPinned ? 'conversation_unpinned' : 'conversation_pinned',
      summary: `${conversation?.isPinned ? 'Unpinned' : 'Pinned'} a conversation.`,
      targetType: 'conversation',
      targetId: id,
      targetName: conversation?.name || 'Conversation',
    });
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, isPinned: !c.isPinned } : c))
    );
  };

  const togglePinChannel = (id: string) => {
    const channel = channels.find((item) => item.id === id);
    void recordSystemActivity({
      eventType: channel?.isPinned ? 'channel_unpinned' : 'channel_pinned',
      summary: `${channel?.isPinned ? 'Unpinned' : 'Pinned'} a channel.`,
      targetType: 'channel',
      targetId: id,
      targetName: channel?.name || 'Channel',
    });
    setChannels((prev) =>
      prev.map((c) => (c.id === id ? { ...c, isPinned: !c.isPinned } : c))
    );
  };

  // Create Channel
  const createChannel = async ({
    name,
    description,
    type,
    postingRoles,
    isPrivate,
    category = 'General',
  }: {
    name: string;
    description: string;
    type: 'standard' | 'announcement';
    postingRoles: UserRole[];
    isPrivate: boolean;
    category?: Channel['category'];
  }) => {
    if (!currentUser.id) throw new Error('Sign in before creating a channel.');
    const cleanName = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-_]/g, '');
    const newChan: Channel = {
      id: `chan-${crypto.randomUUID()}`,
      name: cleanName,
      description,
      type,
      isPrivate,
      members: users.map((u) => u.id),
      postingRoles,
      unreadCount: 0,
      category,
      isPinned: false,
    };

    const { error: channelError } = await supabase.from('channels').insert({
      id: newChan.id,
      name: newChan.name,
      description: newChan.description,
      type: newChan.type,
      is_private: newChan.isPrivate,
      posting_roles: newChan.postingRoles,
      category: newChan.category,
      created_by: currentUser.id,
    });
    if (channelError) throw channelError;

    const memberIds = [...new Set([...users.map((user) => user.id), currentUser.id])];
    if (memberIds.length) {
      const { error: membersError } = await supabase.from('channel_members').upsert(
        memberIds.map((userId) => ({ channel_id: newChan.id, user_id: userId })),
        { onConflict: 'channel_id,user_id' }
      );
      if (membersError) {
        const { error: rollbackError } = await supabase.from('channels').delete().eq('id', newChan.id);
        if (rollbackError) {
          throw new Error(`Channel was created, but its members could not be saved: ${membersError.message}. Cleanup also failed: ${rollbackError.message}`);
        }
        throw membersError;
      }
    }

    setChannels((prev) => [newChan, ...prev]);
    setActiveChannelId(newChan.id);
    setActiveTab('channels');
    sounds.playNotification();
    await recordSystemActivity({
      eventType: 'channel_created',
      summary: `Created channel #${newChan.name}.`,
      targetType: 'channel',
      targetId: newChan.id,
      targetName: newChan.name,
      metadata: { private: newChan.isPrivate, announcement: newChan.type === 'announcement' },
    });
  };

  // Create conversation
  const createConversation = (participantIds: string[], name?: string, isGroup?: boolean): string => {
    const isSingle = !isGroup && participantIds.length === 1;
    const peer = users.find((u) => u.id === participantIds[0]);

    if (isSingle) {
      const existing = conversations.find(
        (c) => c.type === 'direct' && c.participants.includes(participantIds[0])
      );
      if (existing) {
        setActiveConversationId(existing.id);
        setActiveTab('messages');
        return existing.id;
      }
    }

    const newId = `conv-${Date.now()}`;
    const newConv: Conversation = {
      id: newId,
      type: isGroup ? 'group' : 'direct',
      name: isGroup ? (name || 'New Group Chat') : (peer?.name || 'New Message'),
      avatar: isGroup
        ? 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=150&auto=format&fit=crop&q=80'
        : peer?.avatar,
      description: isGroup ? `${participantIds.length + 1} members` : peer?.role,
      participants: [currentUser.id, ...participantIds],
      isPinned: false,
      unreadCount: 0,
    };

    setConversations((prev) => [newConv, ...prev]);
    setActiveConversationId(newId);
    setActiveTab('messages');
    void recordSystemActivity({
      eventType: isGroup ? 'group_conversation_created' : 'direct_conversation_created',
      summary: isGroup ? 'Created a group conversation.' : 'Started a direct conversation.',
      targetType: 'conversation',
      targetId: newId,
      targetName: isGroup ? newConv.name : peer?.name || 'Direct conversation',
      metadata: { participantCount: newConv.participants.length },
    });
    return newId;
  };

  // Calendar Event
  const createCalendarEvent = async (event: Omit<CalendarEvent, 'id' | 'createdBy'>) => {
    const newEvt: CalendarEvent = {
      ...event,
      id: `evt-${Date.now()}`,
      createdBy: currentUser.id,
    };
    setCalendarEvents((prev) => [newEvt, ...prev]);
    sounds.playNotification();

    if (event.scope === 'team') {
      setNotifications((prev) => [
        {
          id: `notif-team-${Date.now()}`,
          type: 'calendar',
          title: `New Team Event Added: ${event.title}`,
          description: `${currentUser.name} scheduled an event on ${event.date} at ${event.startTime}`,
          timestamp: 'Just now',
          isRead: false,
          linkTab: 'calendar',
          targetId: newEvt.id,
        },
        ...prev,
      ]);
    }

    try {
      const { error } = await supabase.from('calendar_events').insert({
        id: newEvt.id,
        title: newEvt.title,
        description: newEvt.description,
        date: newEvt.date,
        start_time: newEvt.startTime,
        end_time: newEvt.endTime,
        scope: newEvt.scope,
        category: newEvt.category,
        location: newEvt.location,
        color: newEvt.color,
        created_by: currentUser.id,
      });
      if (error) throw error;
      await recordSystemActivity({
        eventType: 'calendar_event_created',
        summary: newEvt.scope === 'team'
          ? `Scheduled a team calendar event: ${newEvt.title}.`
          : 'Added a personal calendar event.',
        targetType: 'calendar_event',
        targetId: newEvt.scope === 'team' ? newEvt.id : undefined,
        targetName: newEvt.scope === 'team' ? newEvt.title : undefined,
        metadata: newEvt.scope === 'team' ? { date: newEvt.date, scope: newEvt.scope } : { scope: newEvt.scope },
      });
    } catch {
      // Activity is only logged when the event was persisted.
    }
  };

  const deleteCalendarEvent = async (id: string) => {
    const event = calendarEvents.find((item) => item.id === id);
    setCalendarEvents((prev) => prev.filter((e) => e.id !== id));
    try {
      const { error } = await supabase.from('calendar_events').delete().eq('id', id);
      if (error) throw error;
      if (event) {
        await recordSystemActivity({
          eventType: 'calendar_event_deleted',
          summary: event.scope === 'team'
            ? `Removed calendar event: ${event.title}.`
            : 'Removed a personal calendar event.',
          targetType: 'calendar_event',
          targetId: event.scope === 'team' ? id : undefined,
          targetName: event.scope === 'team' ? event.title : undefined,
        });
      }
    } catch {
      console.error('Unable to persist calendar event deletion.');
    }
  };

  // Calls
  const startCall = async (type: 'audio' | 'video', peerUser?: User, channel?: Channel) => {
    setCallError('');
    if (callSession.active) {
      setCallError('You are already in a call.');
      return;
    }
    if (!currentUser.id) {
      setCallError('Sign in before starting a call.');
      return;
    }

    const isChannelCall = Boolean(channel) || (!peerUser && activeTab === 'channels');
    const targetChannel = channel || (isChannelCall ? channels.find((item) => item.id === activeChannelId) : undefined);
    const conversation = conversations.find((item) => item.id === activeConversationId);
    const participants = isChannelCall && targetChannel
      ? [...new Set([currentUser.id, ...targetChannel.members])]
      : peerUser
        ? conversation?.participants.includes(peerUser.id)
          ? [...new Set([currentUser.id, ...conversation.participants])]
          : [currentUser.id, peerUser.id]
        : conversation
          ? [...new Set([currentUser.id, ...conversation.participants])]
          : [];

    if (!targetChannel && !peerUser && !conversation) {
      setCallError('Open a direct message or channel before starting a call.');
      return;
    }
    if (participants.length > 8) {
      setCallError('Calls currently support up to 8 people. Start a smaller group call.');
      return;
    }
    if (participants.length < 2) {
      setCallError('Add at least one teammate to this conversation before starting a call.');
      return;
    }
    if (callStartInProgressRef.current) {
      setCallError('Your call is already starting.');
      return;
    }

    const sessionId = crypto.randomUUID();
    const row = {
      id: sessionId,
      room_name: sessionId,
      conversation_id: targetChannel ? null : conversation?.id || null,
      channel_id: targetChannel?.id || null,
      caller_id: currentUser.id,
      participant_ids: participants,
      call_type: type,
      status: 'ringing',
    };
    callStartInProgressRef.current = true;
    try {
      const { error } = await supabase.from('call_sessions').insert(row);
      if (error) {
        setCallError(`Could not start the call: ${error.message}`);
        return;
      }

      const callTarget = targetChannel?.name
        ? `#${targetChannel.name}`
        : peerUser?.name || conversation?.name || 'a conversation';
      await recordSystemActivity({
        eventType: 'call_started',
        summary: `Started a ${type} call in ${callTarget}.`,
        targetType: targetChannel ? 'channel' : 'conversation',
        targetId: targetChannel?.id || conversation?.id,
        targetName: callTarget,
        metadata: { callType: type, participantCount: participants.length },
      });

      sounds.playRingTone();
      setIncomingCall(null);
      setCallSession({
        active: true,
        type,
        status: 'connecting',
        sessionId,
        roomName: sessionId,
        participantIds: participants,
        callerId: currentUser.id,
        peerUser: peerUser || users.find((user) => participants.includes(user.id) && user.id !== currentUser.id),
        targetChannel,
        isMuted: false,
        isCameraOff: false,
        isScreenSharing: false,
        durationSeconds: 0,
        isMinimized: false,
      });
    } catch (error) {
      setCallError(error instanceof Error
        ? `Could not start the call: ${error.message}`
        : 'Could not start the call. Check your connection and try again.');
    } finally {
      callStartInProgressRef.current = false;
    }
  };

  const endCall = () => {
    sounds.playCallEnd();
    const endedSession = callSession.sessionId;
    if (endedSession) {
      void recordSystemActivity({
        eventType: 'call_ended',
        summary: `Ended a ${callSession.type} call.`,
        targetType: 'call',
        targetId: endedSession,
        targetName: callSession.targetChannel?.name
          ? `#${callSession.targetChannel.name}`
          : callSession.peerUser?.name || 'Workspace call',
      });
    }
    if (endedSession && callSession.callerId === currentUser.id) {
      void supabase
        .from('call_sessions')
        .update({ status: 'ended', ended_at: new Date().toISOString() })
        .eq('id', endedSession)
        .then(({ error }) => {
          if (error) setCallError(`Call ended locally, but could not notify other participants: ${error.message}`);
        });
    }
    setCallSession((prev) => ({
      ...prev,
      active: false,
      status: 'ended',
      isScreenSharing: false,
    }));
  };

  const acceptIncomingCall = () => {
    if (!incomingCall) return;
    const acceptedCall = incomingCall;
    setCallError('');
    sounds.playRingTone();
    setCallSession({
      active: true,
      type: incomingCall.call_type,
      status: 'connecting',
      sessionId: incomingCall.id,
      roomName: incomingCall.room_name,
      participantIds: incomingCall.participant_ids,
      callerId: incomingCall.caller_id,
      peerUser: incomingCall.caller,
      targetChannel: incomingCall.channel_id
        ? channels.find((channel) => channel.id === incomingCall.channel_id)
        : undefined,
      isMuted: false,
      isCameraOff: false,
      isScreenSharing: false,
      durationSeconds: 0,
      isMinimized: false,
    });
    setIncomingCall(null);
    void recordSystemActivity({
      eventType: 'call_accepted',
      summary: 'Accepted an incoming call.',
      targetType: 'call',
      targetId: acceptedCall.id,
      targetName: acceptedCall.channel_id
        ? `#${channels.find((channel) => channel.id === acceptedCall.channel_id)?.name || 'Channel'}`
        : acceptedCall.caller?.name || 'Workspace call',
    });
  };

  const dismissIncomingCall = () => {
    if (!incomingCall) return;
    const declinedCall = incomingCall;
    setDismissedCallIds((previous) => [...new Set([...previous, declinedCall.id])]);
    setIncomingCall(null);
    void recordSystemActivity({
      eventType: 'call_declined',
      summary: 'Declined an incoming call.',
      targetType: 'call',
      targetId: declinedCall.id,
      targetName: declinedCall.channel_id
        ? `#${channels.find((channel) => channel.id === declinedCall.channel_id)?.name || 'Channel'}`
        : declinedCall.caller?.name || 'Workspace call',
    });
    void supabase.functions.invoke('livekit-token', {
      body: { action: 'decline-call', sessionId: declinedCall.id },
    }).then(({ error }) => {
      if (error) console.error('Unable to decline call on the server:', error);
    });
  };

  const setCallConnected = (sessionId: string) => {
    setCallSession((previous) =>
      previous.sessionId === sessionId ? { ...previous, status: 'connected' } : previous
    );
    if (callSession.callerId === currentUser.id) {
      void supabase
        .from('call_sessions')
        .update({ status: 'active' })
        .eq('id', sessionId)
        .eq('caller_id', currentUser.id)
        .then(({ error }) => {
          if (error) setCallError(`Connected, but could not update call status: ${error.message}`);
        });
    }
    void recordSystemActivity({
        eventType: 'call_joined',
        summary: `Joined a ${callSession.type} call.`,
        targetType: 'call',
        targetId: sessionId,
        targetName: callSession.targetChannel?.name
          ? `#${callSession.targetChannel.name}`
          : callSession.peerUser?.name || 'Workspace call',
    });
  };

  const toggleCallMute = () => {
    void recordSystemActivity({
        eventType: callSession.isMuted ? 'call_microphone_unmuted' : 'call_microphone_muted',
        summary: callSession.isMuted ? 'Unmuted their microphone during a call.' : 'Muted their microphone during a call.',
        targetType: 'call',
        targetId: callSession.sessionId,
        targetName: callSession.targetChannel?.name || callSession.peerUser?.name || 'Workspace call',
    });
    setCallSession((prev) => ({ ...prev, isMuted: !prev.isMuted }));
  };

  const toggleCallCamera = () => {
    void recordSystemActivity({
        eventType: callSession.isCameraOff ? 'call_camera_enabled' : 'call_camera_disabled',
        summary: callSession.isCameraOff ? 'Enabled their camera during a call.' : 'Disabled their camera during a call.',
        targetType: 'call',
        targetId: callSession.sessionId,
        targetName: callSession.targetChannel?.name || callSession.peerUser?.name || 'Workspace call',
    });
    setCallSession((prev) => ({ ...prev, isCameraOff: !prev.isCameraOff }));
  };

  const toggleCallScreenShare = () => {
    void recordSystemActivity({
        eventType: callSession.isScreenSharing ? 'call_screen_share_stopped' : 'call_screen_share_started',
        summary: callSession.isScreenSharing ? 'Stopped screen sharing during a call.' : 'Started screen sharing during a call.',
        targetType: 'call',
        targetId: callSession.sessionId,
        targetName: callSession.targetChannel?.name || callSession.peerUser?.name || 'Workspace call',
    });
    setCallSession((prev) => ({ ...prev, isScreenSharing: !prev.isScreenSharing }));
  };

  const toggleCallMinimize = () => {
    setCallSession((prev) => ({ ...prev, isMinimized: !prev.isMinimized }));
  };

  return (
    <WorkspaceContext.Provider
      value={{
        isAuthenticated,
        isAuthLoading,
        requiresPasswordSetup,
        requiresOnboarding,
        currentUser,
        workspaceSettings,
        users,
        systemActivityLogs,
        systemActivityLogError,
        refreshSystemActivityLogs,
        recordSystemActivity,
        isSupabaseConnected,
        activeTab,
        activeConversationId,
        activeChannelId,
        activeThreadMessageId,
        isRightDrawerOpen,
        conversations,
        channels,
        messages,
        threadReplies,
        calendarEvents,
        notifications,
        unreadNotificationCount,
        soundEnabled,
        callSession,
        incomingCall,
        callError,
        activeProfileModalUser,
        isProfileSettingsOpen,
        isWorkspaceSettingsOpen,
        isCreateChannelOpen,
        isCreatePollOpen,
        isNewMessageOpen,
        isAddEventOpen,
        isEmailComposeRequested,
        isAddTeammateOpen,
        inviteReadyData,
        searchQuery,
        focusedEmailId,
        login,
        logout,
        setPassword,
        completeOnboarding,
        setActiveTab,
        setActiveConversationId,
        setActiveChannelId,
        openThread,
        closeThread,
        toggleRightDrawer,
        setRightDrawerOpen,
        setSearchQuery,
        setFocusedEmailId,
        sendMessage,
        postChannelMessage,
        sendThreadReply,
        votePoll,
        toggleReaction,
        togglePinConversation,
        togglePinChannel,
        createChannel,
        createConversation,
        createCalendarEvent,
        deleteCalendarEvent,
        markNotificationRead,
        markAllNotificationsRead,
        toggleSound,
        startCall,
        endCall,
        acceptIncomingCall,
        dismissIncomingCall,
        setCallError,
        setCallConnected,
        toggleCallMute,
        toggleCallCamera,
        toggleCallScreenShare,
        toggleCallMinimize,
        updateCurrentUser,
        saveCurrentProfile,
        saveWorkspaceSettings,
        addTeammate,
        updateStaffUser,
        manageStaffAccount,
        setStaffTemporaryPassword,
        openUserProfile,
        closeUserProfile,
        resetWorkspace,
        setIsProfileSettingsOpen,
        setIsWorkspaceSettingsOpen,
        setIsCreateChannelOpen,
        setIsCreatePollOpen,
        setIsNewMessageOpen,
        setIsAddEventOpen,
        setIsEmailComposeRequested,
        requestEmailCompose,
        setIsAddTeammateOpen,
        setInviteReadyData,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
};

export const useWorkspace = () => {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return ctx;
};
