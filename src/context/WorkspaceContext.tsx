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
  Attachment,
  Poll,
  UserStatus,
  UserRole,
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
  currentUser: User;
  users: User[];
  isSupabaseConnected: boolean;
  
  // Navigation & Views
  activeTab: 'messages' | 'channels' | 'calendar';
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
  
  // Modals state
  activeProfileModalUser: User | null;
  isProfileSettingsOpen: boolean;
  isCreateChannelOpen: boolean;
  isCreatePollOpen: boolean;
  isNewMessageOpen: boolean;
  isAddEventOpen: boolean;
  isAddTeammateOpen: boolean;
  inviteReadyData: {
    name: string;
    email: string;
    role: string;
    systemRole: string;
  } | null;
  searchQuery: string;
  
  // Auth actions
  login: (email: string, password: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
  setPassword: (password: string) => Promise<{ success: boolean; message?: string }>;
  
  // Navigation actions
  setActiveTab: (tab: 'messages' | 'channels' | 'calendar') => void;
  setActiveConversationId: (id: string) => void;
  setActiveChannelId: (id: string) => void;
  openThread: (messageId: string) => void;
  closeThread: () => void;
  toggleRightDrawer: () => void;
  setRightDrawerOpen: (open: boolean) => void;
  setSearchQuery: (query: string) => void;
  
  // Messaging actions
  sendMessage: (text: string, attachments?: Attachment[], poll?: Poll) => void;
  sendThreadReply: (parentId: string, text: string, attachments?: Attachment[]) => void;
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
  }) => void;
  
  createConversation: (participantIds: string[], name?: string, isGroup?: boolean) => string;
  createCalendarEvent: (event: Omit<CalendarEvent, 'id' | 'createdBy'>) => void;
  deleteCalendarEvent: (id: string) => void;
  
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  toggleSound: () => void;
  
  // Calling
  startCall: (type: 'audio' | 'video', peerUser?: User, channel?: Channel) => void;
  endCall: () => void;
  toggleCallMute: () => void;
  toggleCallCamera: () => void;
  toggleCallScreenShare: () => void;
  toggleCallMinimize: () => void;
  
  // Profile & Management
  updateCurrentUser: (updates: Partial<User>) => void;
  addTeammate: (user: User) => Promise<void>;
  openUserProfile: (user: User) => void;
  closeUserProfile: () => void;
  resetWorkspace: () => void;
  
  setIsProfileSettingsOpen: (open: boolean) => void;
  setIsCreateChannelOpen: (open: boolean) => void;
  setIsCreatePollOpen: (open: boolean) => void;
  setIsNewMessageOpen: (open: boolean) => void;
  setIsAddEventOpen: (open: boolean) => void;
  setIsAddTeammateOpen: (open: boolean) => void;
  setInviteReadyData: (data: WorkspaceContextType['inviteReadyData']) => void;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

const STORAGE_PREFIX = 'beacon_v3_';

const mapSupabaseProfile = (row: Record<string, any>, currentUserId: string): User => ({
  id: row.id,
  name: row.name || row.email,
  email: row.email,
  role: row.role || 'Staff Specialist',
  department: row.department || 'Operations',
  phone: row.phone || '',
  avatar: row.avatar_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
  status: row.status || 'offline',
  systemRole: row.system_role || 'member',
  statusMessage: row.status_message || undefined,
  isCurrentUser: row.id === currentUserId,
});

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
  };
};

export const WorkspaceProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [requiresPasswordSetup, setRequiresPasswordSetup] = useState(false);

  const [isSupabaseConnected, setIsSupabaseConnected] = useState<boolean>(false);

  // Users state
  const [users, setUsers] = useState<User[]>([]);

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

  // Navigation
  const [activeTab, setActiveTabState] = useState<'messages' | 'channels' | 'calendar'>('channels');
  const [activeConversationId, setActiveConversationId] = useState<string>('');
  const [activeChannelId, setActiveChannelId] = useState<string>('chan-announcements');
  const [activeThreadMessageId, setActiveThreadMessageId] = useState<string | null>(null);
  const [isRightDrawerOpen, setIsRightDrawerOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

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

  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  // Modals state
  const [activeProfileModalUser, setActiveProfileModalUser] = useState<User | null>(null);
  const [isProfileSettingsOpen, setIsProfileSettingsOpen] = useState<boolean>(false);
  const [isCreateChannelOpen, setIsCreateChannelOpen] = useState<boolean>(false);
  const [isCreatePollOpen, setIsCreatePollOpen] = useState<boolean>(false);
  const [isNewMessageOpen, setIsNewMessageOpen] = useState<boolean>(false);
  const [isAddEventOpen, setIsAddEventOpen] = useState<boolean>(false);
  const [isAddTeammateOpen, setIsAddTeammateOpen] = useState<boolean>(false);
  const [inviteReadyData, setInviteReadyData] = useState<{
    name: string;
    email: string;
    role: string;
    systemRole: string;
  } | null>(null);

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
          setUsers([]);
          setCurrentUser({ id: '', name: '', email: '', avatar: '', role: '', department: '', phone: '', status: 'offline', systemRole: 'member' });
          setIsAuthLoading(false);
        }
        return;
      }

      try {
        const profileData = await loadSupabaseProfiles(session.user);
        if (active) {
          setUsers(profileData.users);
          setCurrentUser(profileData.currentUser);
          setChannels((channels) => channels.map((channel) =>
            !channel.isPrivate && !channel.members.includes(profileData.currentUser.id)
              ? { ...channel, members: [...channel.members, profileData.currentUser.id] }
              : channel
          ));
          setIsAuthenticated(true);
          setRequiresPasswordSetup(new URLSearchParams(window.location.search).get('invite') === '1');
        }
      } catch (error) {
        console.error('Unable to load the Supabase profile:', error);
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
      setUsers(profileData.users);
      setCurrentUser(profileData.currentUser);
      setChannels((channels) => channels.map((channel) =>
        !channel.isPrivate && !channel.members.includes(profileData.currentUser.id)
          ? { ...channel, members: [...channel.members, profileData.currentUser.id] }
          : channel
      ));
      setIsAuthenticated(true);
      sounds.playNotification();
      return { success: true };
    } catch (profileError) {
      await supabase.auth.signOut();
      if (profileError instanceof Error && profileError.message.includes("Could not find the table 'public.profiles'")) {
        return {
          success: false,
          message: 'The staff profiles table is missing from Supabase. Run supabase_schema.sql in the Supabase SQL Editor, then try signing in again.',
        };
      }
      return { success: false, message: `Signed in, but the staff profile could not be loaded: ${(profileError as Error).message}` };
    }
  };

  const logout = () => {
    void supabase.auth.signOut();
    setIsAuthenticated(false);
    setUsers([]);
    setCurrentUser({ id: '', name: '', email: '', avatar: '', role: '', department: '', phone: '', status: 'offline', systemRole: 'member' });
  };

  const setPassword = async (password: string): Promise<{ success: boolean; message?: string }> => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { success: false, message: error.message };

    setRequiresPasswordSetup(false);
    const url = new URL(window.location.href);
    url.searchParams.delete('invite');
    window.history.replaceState({}, '', url);
    return { success: true };
  };

  const setActiveTab = (tab: 'messages' | 'channels' | 'calendar') => {
    setActiveTabState(tab);
    setActiveThreadMessageId(null);
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

    // Persist to Supabase
    try {
      await supabase.from('profiles').upsert({
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
      });
    } catch {
      // fallback
    }
  };

  // Add teammate / Register staff
  const addTeammate = async (user: User) => {
    const { data, error } = await supabase.functions.invoke('invite-user', {
      body: {
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        phone: user.phone,
        avatarUrl: user.avatar,
        systemRole: user.systemRole,
      },
    });

    if (error) throw error;
    if (!data?.userId) throw new Error('The invitation was sent, but no Supabase user ID was returned.');

    const { data: profileRows, error: profileError } = await supabase.from('profiles').select('*');
    if (profileError) throw profileError;

    setUsers(profileRows.map((row) => mapSupabaseProfile(row, currentUser.id)));
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
      role: user.role,
      systemRole: user.systemRole,
    });

    sounds.playNotification();

    setNotifications((prev) => [
      {
        id: `notif-user-${Date.now()}`,
        type: 'message',
        title: 'Staff Registered',
        description: `${user.name} (${user.role}) was sent a Supabase invitation.`,
        timestamp: 'Just now',
        isRead: false,
        linkTab: 'messages',
      },
      ...prev,
    ]);
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
  const sendMessage = async (text: string, attachments?: Attachment[], poll?: Poll) => {
    const targetId = activeTab === 'channels' ? activeChannelId : activeConversationId;
    if (!targetId || (!text.trim() && !attachments?.length && !poll)) return;

    const newMsg: Message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
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

    sounds.playMessageSent();

    setMessages((prev) => {
      const currentList = prev[targetId] || [];
      return {
        ...prev,
        [targetId]: [...currentList, newMsg],
      };
    });

    if (activeTab === 'messages') {
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

    // Persist to Supabase
    try {
      await supabase.from('messages').insert({
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
      });
    } catch {
      // Local fallback saved
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
            linkTab: activeTab,
            targetId,
          },
          ...prev,
        ]);
      }, 500);
    }
  };

  // Thread reply
  const sendThreadReply = async (parentId: string, text: string, attachments?: Attachment[]) => {
    if (!text.trim() && !attachments?.length) return;

    const newReply: Message = {
      id: `th-${Date.now()}`,
      conversationId: activeTab === 'channels' ? activeChannelId : activeConversationId,
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

    sounds.playMessageSent();

    setThreadReplies((prev) => {
      const existing = prev[parentId] || [];
      return {
        ...prev,
        [parentId]: [...existing, newReply],
      };
    });

    const targetId = activeTab === 'channels' ? activeChannelId : activeConversationId;
    setMessages((prev) => {
      const list = prev[targetId] || [];
      return {
        ...prev,
        [targetId]: list.map((m) =>
          m.id === parentId
            ? {
                ...m,
                threadCount: (m.threadCount || 0) + 1,
                lastThreadReplyAt: 'Just now',
              }
            : m
        ),
      };
    });

    try {
      await supabase.from('messages').insert({
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
      });
    } catch {
      // Local fallback
    }
  };

  const votePoll = (messageId: string, optionId: string, parentId?: string) => {
    sounds.playReaction();

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
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, isPinned: !c.isPinned } : c))
    );
  };

  const togglePinChannel = (id: string) => {
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
    const cleanName = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-_]/g, '');
    const newChan: Channel = {
      id: `chan-${Date.now()}`,
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

    setChannels((prev) => [newChan, ...prev]);
    setActiveChannelId(newChan.id);
    setActiveTab('channels');
    sounds.playNotification();

    try {
      await supabase.from('channels').insert({
        id: newChan.id,
        name: newChan.name,
        description: newChan.description,
        type: newChan.type,
        is_private: newChan.isPrivate,
        posting_roles: newChan.postingRoles,
        category: newChan.category,
        created_by: currentUser.id,
      });
    } catch {
      // Local fallback
    }
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
      await supabase.from('calendar_events').insert({
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
    } catch {
      // Local fallback
    }
  };

  const deleteCalendarEvent = async (id: string) => {
    setCalendarEvents((prev) => prev.filter((e) => e.id !== id));
    try {
      await supabase.from('calendar_events').delete().eq('id', id);
    } catch {
      // fallback
    }
  };

  // Calls
  const startCall = (type: 'audio' | 'video', peerUser?: User, channel?: Channel) => {
    sounds.playRingTone();
    setCallSession({
      active: true,
      type,
      status: 'connected',
      peerUser: peerUser || users.find((u) => u.id !== currentUser.id),
      targetChannel: channel,
      isMuted: false,
      isCameraOff: false,
      isScreenSharing: false,
      durationSeconds: 0,
      isMinimized: false,
    });
  };

  const endCall = () => {
    sounds.playCallEnd();
    setCallSession((prev) => ({
      ...prev,
      active: false,
      status: 'ended',
      isScreenSharing: false,
    }));
  };

  const toggleCallMute = () => {
    setCallSession((prev) => ({ ...prev, isMuted: !prev.isMuted }));
  };

  const toggleCallCamera = () => {
    setCallSession((prev) => ({ ...prev, isCameraOff: !prev.isCameraOff }));
  };

  const toggleCallScreenShare = () => {
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
        currentUser,
        users,
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
        activeProfileModalUser,
        isProfileSettingsOpen,
        isCreateChannelOpen,
        isCreatePollOpen,
        isNewMessageOpen,
        isAddEventOpen,
        isAddTeammateOpen,
        inviteReadyData,
        searchQuery,
        login,
        logout,
        setPassword,
        setActiveTab,
        setActiveConversationId,
        setActiveChannelId,
        openThread,
        closeThread,
        toggleRightDrawer,
        setRightDrawerOpen,
        setSearchQuery,
        sendMessage,
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
        toggleCallMute,
        toggleCallCamera,
        toggleCallScreenShare,
        toggleCallMinimize,
        updateCurrentUser,
        addTeammate,
        openUserProfile,
        closeUserProfile,
        resetWorkspace,
        setIsProfileSettingsOpen,
        setIsCreateChannelOpen,
        setIsCreatePollOpen,
        setIsNewMessageOpen,
        setIsAddEventOpen,
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
