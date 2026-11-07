// @vitest-environment jsdom
import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, Root } from 'react-dom/client';
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ParticipantEvent, RoomEvent, Track } from 'livekit-client';
import { DEFAULT_WORKSPACE_SETTINGS } from '../../types';
import { CallOverlay } from './CallOverlay';

interface TestTrack {
  sid: string;
  attach: ReturnType<typeof vi.fn>;
  detach: ReturnType<typeof vi.fn>;
}

interface TestParticipant extends EventEmitter {
  identity: string;
  name: string;
  isSpeaking: boolean;
  isScreenShareEnabled: boolean;
  publications: { source: string; kind: string; track: TestTrack }[];
  getTrackPublications: () => TestParticipant['publications'];
  setMicrophoneEnabled: ReturnType<typeof vi.fn>;
  setCameraEnabled: ReturnType<typeof vi.fn>;
  setScreenShareEnabled: ReturnType<typeof vi.fn>;
}

interface TestRoom extends EventEmitter {
  localParticipant: TestParticipant;
  remoteParticipants: Map<string, TestParticipant>;
  disconnect: ReturnType<typeof vi.fn>;
}

const state = vi.hoisted(() => ({
  rooms: [] as TestRoom[],
  local: null as TestParticipant | null,
  remotes: [] as TestParticipant[],
  workspace: {
    callSession: {
      active: true, sessionId: 'test-call', type: 'audio', isMinimized: false,
      isMuted: false, isCameraOff: false, isScreenSharing: false, durationSeconds: 10,
    },
    incomingCall: null,
    callError: '',
    currentUser: { id: 'local', name: 'Local teammate' },
    workspaceSettings: {},
    setCallError: vi.fn(),
    setCallConnected: vi.fn(),
    acceptIncomingCall: vi.fn(),
    dismissIncomingCall: vi.fn(),
    endCall: vi.fn(),
    toggleCallMute: vi.fn(),
    toggleCallCamera: vi.fn(),
    toggleCallScreenShare: vi.fn(),
    toggleCallMinimize: vi.fn(),
  },
}));

vi.mock('../../context/WorkspaceContext', () => ({ useWorkspace: () => state.workspace }));
vi.mock('../../lib/supabase', () => ({
  supabase: { functions: { invoke: vi.fn().mockResolvedValue({ data: { serverUrl: 'wss://test.invalid', token: 'test' }, error: null }) } },
}));
vi.mock('livekit-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('livekit-client')>();
  const { EventEmitter: Emitter } = await import('node:events');
  class Room extends Emitter {
    localParticipant = state.local!;
    remoteParticipants = new Map(state.remotes.map((participant) => [participant.identity, participant]));
    disconnect = vi.fn().mockResolvedValue(undefined);
    connect = vi.fn(async () => {
      this.emit(actual.RoomEvent.ConnectionStateChanged, actual.ConnectionState.Connected);
    });
    startAudio = vi.fn().mockResolvedValue(undefined);
    constructor() {
      super();
      state.rooms.push(this);
    }
  }
  return { ...actual, Room };
});

const makeTrack = (sid: string): TestTrack => ({
  sid,
  attach: vi.fn((element: HTMLMediaElement) => element),
  detach: vi.fn(),
});

const makeParticipant = (identity: string, name: string): TestParticipant => {
  const participant = Object.assign(new EventEmitter(), {
    identity, name, isSpeaking: false, isScreenShareEnabled: false,
    publications: [] as TestParticipant['publications'],
    getTrackPublications: () => participant.publications,
    setMicrophoneEnabled: vi.fn().mockResolvedValue(undefined),
    setCameraEnabled: vi.fn().mockResolvedValue(undefined),
    setScreenShareEnabled: vi.fn(async (enabled: boolean) => {
      participant.isScreenShareEnabled = enabled;
    }),
  });
  return participant;
};

describe('CallOverlay media lifecycle', () => {
  let container: HTMLDivElement;
  let root: Root;

  const render = async () => {
    await act(async () => { root.render(<CallOverlay />); });
  };
  const click = async (label: string) => {
    const button = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
    expect(button).not.toBeNull();
    await act(async () => { button!.click(); });
    return button!;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    state.rooms = [];
    state.local = makeParticipant('local', 'Local teammate');
    state.remotes = [makeParticipant('remote', 'Remote teammate')];
    state.workspace.callSession = {
      active: true, sessionId: 'test-call', type: 'audio', isMinimized: false,
      isMuted: false, isCameraOff: false, isScreenSharing: false, durationSeconds: 10,
    };
    state.workspace.workspaceSettings = DEFAULT_WORKSPACE_SETTINGS;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => { root.unmount(); });
    container.remove();
    vi.restoreAllMocks();
  });

  it('keeps the same remote audio element attached across minimize and expand', async () => {
    const audio = makeTrack('remote-audio');
    state.remotes[0].publications.push({ source: Track.Source.Microphone, kind: Track.Kind.Audio, track: audio });
    await render();
    const element = container.querySelector('audio');
    expect(element).not.toBeNull();

    state.workspace.callSession.isMinimized = true;
    await render();
    expect(container.querySelector('audio')).toBe(element);
    state.workspace.callSession.isMinimized = false;
    await render();
    expect(container.querySelector('audio')).toBe(element);
    expect(audio.attach).toHaveBeenCalledTimes(1);
    expect(audio.detach).not.toHaveBeenCalled();
    expect(state.rooms).toHaveLength(1);
    expect(state.rooms[0].disconnect).not.toHaveBeenCalled();
  });

  it('updates the local green speaking indicator and hides it while muted', async () => {
    await render();
    state.local!.isSpeaking = true;
    await act(async () => { state.local!.emit(ParticipantEvent.IsSpeakingChanged, true); });
    const speakingTile = container.querySelector('[aria-label="You are speaking"]');
    expect(speakingTile?.className).toContain('border-emerald-400');
    expect(speakingTile?.querySelector('.ring-emerald-400')).not.toBeNull();

    state.workspace.callSession.isMuted = true;
    await render();
    expect(container.querySelector('[aria-label="You are speaking"]')).toBeNull();
  });

  it('shows every share and switches focus without reattaching videos', async () => {
    const second = makeParticipant('second', 'Second teammate');
    state.remotes.push(second);
    const tracks = [...state.remotes, state.local!].map((participant) => {
      const track = makeTrack(`${participant.identity}-screen`);
      participant.publications.push({ source: Track.Source.ScreenShare, kind: Track.Kind.Video, track });
      return track;
    });
    await render();
    expect(container.querySelectorAll('video')).toHaveLength(3);
    await click("Enlarge Remote teammate's screen share");
    expect(container.querySelector('[aria-label="Reduce Remote teammate\'s screen share"]')?.getAttribute('aria-pressed')).toBe('true');
    await click("Enlarge Second teammate's screen share");
    expect(container.querySelector('[aria-label="Reduce Second teammate\'s screen share"]')?.className).toContain('col-span-full');
    expect(container.querySelector('[aria-label="Enlarge Remote teammate\'s screen share"]')?.getAttribute('aria-pressed')).toBe('false');
    await click('Enlarge your screen share');
    await click('Reduce your screen share');
    expect(container.querySelectorAll('[aria-pressed="true"]')).toHaveLength(0);
    for (const track of tracks) {
      expect(track.attach).toHaveBeenCalledTimes(1);
      expect(track.detach).not.toHaveBeenCalled();
    }
  });

  it('limits screen capture and encoding and synchronizes the stop-share control', async () => {
    await render();
    await click('Share screen');
    expect(state.local!.setScreenShareEnabled).toHaveBeenCalledWith(true, expect.objectContaining({
      contentHint: 'detail', resolution: { width: 1280, height: 720, frameRate: 10 },
    }), expect.objectContaining({
      simulcast: false, screenShareEncoding: { maxBitrate: 1_500_000, maxFramerate: 10 },
    }));
    expect(state.workspace.toggleCallScreenShare).toHaveBeenCalledTimes(1);
    state.workspace.callSession.isScreenSharing = true;
    await render();
    await click('Stop sharing screen');
    expect(state.local!.setScreenShareEnabled).toHaveBeenLastCalledWith(false, expect.any(Object), expect.any(Object));
    expect(state.workspace.toggleCallScreenShare).toHaveBeenCalledTimes(2);
  });

  it('offers blocked audio recovery in the minimized call', async () => {
    state.workspace.callSession.isMinimized = true;
    await render();
    await act(async () => { state.rooms[0].emit(RoomEvent.AudioPlaybackStatusChanged, false); });
    expect(container.textContent).toContain('Turn on audio');
  });

  it('attaches newly subscribed audio while minimized and releases it on leaving', async () => {
    state.workspace.callSession.isMinimized = true;
    await render();
    const audio = makeTrack('late-audio');
    state.remotes[0].publications.push({ source: Track.Source.Microphone, kind: Track.Kind.Audio, track: audio });
    await act(async () => { state.rooms[0].emit(RoomEvent.TrackSubscribed); });
    expect(audio.attach).toHaveBeenCalledTimes(1);
    expect(container.querySelector('audio')).not.toBeNull();
    state.workspace.callSession.active = false;
    await render();
    expect(audio.detach).toHaveBeenCalledTimes(1);
    expect(state.rooms[0].disconnect).toHaveBeenCalledTimes(1);
  });

  it('refreshes local screen publications and handles the browser stop-sharing action', async () => {
    await render();
    await click('Share screen');
    const screen = makeTrack('local-screen');
    state.local!.publications.push({ source: Track.Source.ScreenShare, kind: Track.Kind.Video, track: screen });
    await act(async () => { state.rooms[0].emit(RoomEvent.LocalTrackPublished); });
    expect(container.querySelector('[aria-label="Enlarge your screen share"]')).not.toBeNull();
    state.local!.publications = [];
    state.local!.isScreenShareEnabled = false;
    await act(async () => { state.rooms[0].emit(RoomEvent.LocalTrackUnpublished, { source: Track.Source.ScreenShare }); });
    expect(container.querySelector('[aria-label="Enlarge your screen share"]')).toBeNull();
    expect(state.workspace.toggleCallScreenShare).toHaveBeenCalledTimes(2);
    expect(screen.detach).toHaveBeenCalledTimes(1);
  });
});
