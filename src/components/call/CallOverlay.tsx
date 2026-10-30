import React, { useEffect, useRef, useState } from 'react';
import {
  ConnectionState,
  Participant,
  Room,
  RoomEvent,
  Track,
} from 'livekit-client';
import {
  Mic,
  MicOff,
  Video as VideoIcon,
  VideoOff,
  Monitor,
  MonitorOff,
  PhoneOff,
  Maximize2,
  Minimize2,
  Users,
  X,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { supabase } from '../../lib/supabase';

interface ParticipantMedia {
  identity: string;
  name: string;
  speaking: boolean;
  camera?: Track;
  screen?: Track;
  audio: Track[];
}

const readFunctionError = async (error: Error) => {
  if ('context' in error && error.context instanceof Response) {
    const responseBody: unknown = await error.context.clone().json().catch(() => null);
    if (responseBody && typeof responseBody === 'object' && 'error' in responseBody
      && typeof responseBody.error === 'string') return responseBody.error;
  }
  return error.message;
};

const AttachedVideo: React.FC<{ track?: Track; className?: string; muted?: boolean }> = ({
  track,
  className = '',
  muted = false,
}) => {
  const elementRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (!track || !elementRef.current) return;
    const element = track.attach(elementRef.current);
    element.play().catch(() => undefined);
    return () => {
      track.detach(element);
    };
  }, [track]);

  return <video ref={elementRef} autoPlay playsInline muted={muted} className={className} />;
};

const AttachedAudio: React.FC<{ track: Track }> = ({ track }) => {
  const elementRef = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (!elementRef.current) return;
    const element = track.attach(elementRef.current);
    element.play().catch(() => undefined);
    return () => {
      track.detach(element);
    };
  }, [track]);
  return <audio ref={elementRef} autoPlay />;
};

const participantMedia = (participant: Participant): ParticipantMedia => {
  const publications = participant.getTrackPublications();
  return {
    identity: participant.identity,
    name: participant.name || participant.identity,
    speaking: participant.isSpeaking,
    camera: publications.find((publication) => publication.source === Track.Source.Camera)?.track,
    screen: publications.find((publication) => publication.source === Track.Source.ScreenShare)?.track,
    audio: publications
      .filter((publication) => publication.kind === Track.Kind.Audio)
      .map((publication) => publication.track)
      .filter((track): track is Track => Boolean(track)),
  };
};

export const CallOverlay: React.FC = () => {
  const {
    callSession,
    incomingCall,
    callError,
    setCallError,
    setCallConnected,
    acceptIncomingCall,
    dismissIncomingCall,
    endCall,
    toggleCallMute,
    toggleCallCamera,
    toggleCallScreenShare,
    toggleCallMinimize,
    currentUser,
    workspaceSettings,
  } = useWorkspace();

  const [room, setRoom] = useState<Room | null>(null);
  const [remoteMedia, setRemoteMedia] = useState<ParticipantMedia[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.Disconnected);
  const [isScreenShareBusy, setIsScreenShareBusy] = useState(false);
  const [audioPlaybackBlocked, setAudioPlaybackBlocked] = useState(false);
  const screenSharingRef = useRef(callSession.isScreenSharing);

  useEffect(() => {
    if (!callSession.active || !callSession.sessionId) {
      setRoom(null);
      setRemoteMedia([]);
      setConnectionState(ConnectionState.Disconnected);
      return;
    }

    let mounted = true;
    const liveKitRoom = new Room({
      adaptiveStream: true,
      dynacast: true,
    });
    const refreshMedia = () => {
      if (!mounted) return;
      setRemoteMedia(Array.from(liveKitRoom.remoteParticipants.values(), participantMedia));
    };

    liveKitRoom
      .on(RoomEvent.TrackSubscribed, refreshMedia)
      .on(RoomEvent.TrackUnsubscribed, refreshMedia)
      .on(RoomEvent.TrackPublished, refreshMedia)
      .on(RoomEvent.TrackUnpublished, refreshMedia)
      .on(RoomEvent.ParticipantConnected, refreshMedia)
      .on(RoomEvent.ParticipantDisconnected, refreshMedia)
      .on(RoomEvent.ActiveSpeakersChanged, refreshMedia)
      .on(RoomEvent.ConnectionStateChanged, (state) => {
        if (mounted) setConnectionState(state);
      })
      .on(RoomEvent.AudioPlaybackStatusChanged, (canPlayAudio) => {
        if (mounted) setAudioPlaybackBlocked(!canPlayAudio);
      })
      .on(RoomEvent.Disconnected, () => {
        if (mounted && callSession.active) {
          setCallError('The call connection was lost. Check your network and rejoin.');
        }
      })
      .on(RoomEvent.LocalTrackUnpublished, (publication) => {
        if (publication.source === Track.Source.ScreenShare && mounted && screenSharingRef.current) {
          screenSharingRef.current = false;
          toggleCallScreenShare();
          refreshMedia();
        }
      });

    setRoom(liveKitRoom);
    setConnectionState(ConnectionState.Connecting);
    setAudioPlaybackBlocked(false);

    const connect = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('livekit-token', {
          body: { sessionId: callSession.sessionId },
        });
        if (error) throw new Error(await readFunctionError(error));
        if (!data?.serverUrl || !data?.token) throw new Error('The call service did not return a connection token.');

        await liveKitRoom.connect(data.serverUrl, data.token, {
          autoSubscribe: true,
          maxRetries: 3,
        });
        if (!mounted) {
          await liveKitRoom.disconnect();
          return;
        }

        const audioOptions = {
          noiseSuppression: workspaceSettings.noiseSuppression,
          echoCancellation: true,
          autoGainControl: true,
          ...(workspaceSettings.microphoneDeviceId ? { deviceId: workspaceSettings.microphoneDeviceId } : {}),
        };
        await liveKitRoom.localParticipant.setMicrophoneEnabled(!callSession.isMuted, audioOptions);
        if (callSession.type === 'video' && !callSession.isCameraOff) {
          try {
            await liveKitRoom.localParticipant.setCameraEnabled(true, {
              ...(workspaceSettings.cameraDeviceId ? { deviceId: workspaceSettings.cameraDeviceId } : {}),
              resolution: { width: 1280, height: 720, frameRate: 24 },
            });
          } catch (error) {
            if (mounted) {
              setCallError(error instanceof Error
                ? `Camera unavailable; continuing with audio: ${error.message}`
                : 'Camera unavailable; continuing with audio.');
            }
          }
        }
        if (!mounted) {
          await liveKitRoom.disconnect();
          return;
        }
        setCallConnected(callSession.sessionId);
        refreshMedia();
      } catch (error) {
        if (mounted) {
          setCallError(error instanceof Error ? error.message : 'Unable to connect to the call.');
          endCall();
        }
      }
    };

    void connect();
    return () => {
      mounted = false;
      void liveKitRoom.disconnect();
    };
  }, [callSession.active, callSession.sessionId, callSession.type]);

  useEffect(() => {
    if (!room || connectionState !== ConnectionState.Connected) return;
    void room.localParticipant.setMicrophoneEnabled(!callSession.isMuted).catch((error: unknown) => {
      setCallError(error instanceof Error ? `Microphone could not be changed: ${error.message}` : 'Microphone could not be changed.');
    });
  }, [room, connectionState, callSession.isMuted, setCallError]);

  useEffect(() => {
    if (!room || connectionState !== ConnectionState.Connected) return;
    void room.localParticipant.setCameraEnabled(!callSession.isCameraOff && callSession.type === 'video').catch((error: unknown) => {
      setCallError(error instanceof Error ? `Camera could not be changed: ${error.message}` : 'Camera could not be changed.');
    });
  }, [room, connectionState, callSession.isCameraOff, callSession.type, setCallError]);

  const localCameraTrack = room?.localParticipant.getTrackPublication(Track.Source.Camera)?.track;
  const localScreenTrack = room?.localParticipant.getTrackPublication(Track.Source.ScreenShare)?.track;
  const sharedScreen = remoteMedia.find((participant) => participant.screen);

  const handleScreenShare = async () => {
    if (!room || isScreenShareBusy) return;
    setIsScreenShareBusy(true);
    try {
      await room.localParticipant.setScreenShareEnabled(!screenSharingRef.current, {
        audio: false,
        selfBrowserSurface: 'exclude',
        surfaceSwitching: 'include',
        contentHint: 'motion',
        resolution: { width: 1920, height: 1080, frameRate: 15 },
      });
      if (room.localParticipant.isScreenShareEnabled && !screenSharingRef.current) {
        screenSharingRef.current = true;
        toggleCallScreenShare();
      }
    } catch (error) {
      setCallError(error instanceof Error ? `Screen sharing failed: ${error.message}` : 'Screen sharing failed.');
    } finally {
      setIsScreenShareBusy(false);
    }
  };

  const enableAudioPlayback = async () => {
    if (!room) return;
    try {
      await room.startAudio();
      setAudioPlaybackBlocked(false);
    } catch (error) {
      setCallError(error instanceof Error ? `Audio playback could not be enabled: ${error.message}` : 'Audio playback could not be enabled.');
    }
  };

  const minutes = Math.floor(callSession.durationSeconds / 60);
  const seconds = (callSession.durationSeconds % 60).toString().padStart(2, '0');

  return (
    <>
      {callError && (
        <div role="alert" className="fixed right-5 top-20 z-[70] flex max-w-md items-start gap-3 rounded-xl border border-rose-200 bg-white px-4 py-3 text-sm text-rose-700 shadow-xl">
          <p className="flex-1">{callError}</p>
          <button type="button" onClick={() => setCallError('')} aria-label="Dismiss call error"><X className="h-4 w-4" /></button>
        </div>
      )}

      {incomingCall && !callSession.active && (
        <div className="fixed bottom-6 right-6 z-[65] w-[min(24rem,calc(100vw-2rem))] rounded-2xl border border-slate-700 bg-slate-900 p-4 text-white shadow-2xl">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-500/20 text-brand-300">
              {incomingCall.call_type === 'video' ? <VideoIcon className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">{incomingCall.caller?.name || 'A teammate'} is calling</p>
              <p className="text-xs text-slate-400">{incomingCall.channel_id ? 'Channel call' : 'Direct/group call'}</p>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={dismissIncomingCall} className="rounded-xl bg-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-600">Not now</button>
            <button type="button" onClick={acceptIncomingCall} className="rounded-xl bg-brand-600 px-4 py-2 text-xs font-bold text-white hover:bg-brand-500">Join call</button>
          </div>
        </div>
      )}

      {callSession.active && (
        <div className={`fixed ${callSession.isMinimized ? 'bottom-6 right-6 w-[min(25rem,calc(100vw-2rem))]' : 'inset-3 sm:inset-6'} z-50 flex flex-col overflow-hidden rounded-3xl border border-slate-700 bg-slate-950 text-white shadow-2xl`}>
          <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-4 py-3 sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <span className={`h-2.5 w-2.5 rounded-full ${connectionState === ConnectionState.Connected ? 'bg-brand-400' : 'bg-brand-400 animate-pulse'}`} />
              <div className="min-w-0">
                <h2 className="truncate text-sm font-bold">
                  {callSession.targetChannel ? `#${callSession.targetChannel.name}` : callSession.peerUser?.name || 'Team call'}
                </h2>
                <p className="text-[11px] text-slate-400">
                  {connectionState === ConnectionState.Connected ? `${minutes}:${seconds}` : 'Connecting to secure call…'}
                  {' · '}{callSession.type === 'video' ? 'Video call' : 'Voice call'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={toggleCallMinimize} title={callSession.isMinimized ? 'Expand call' : 'Minimize call'} className="rounded-lg p-2 text-slate-300 hover:bg-slate-800">
                {callSession.isMinimized ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
              </button>
              <button type="button" onClick={endCall} title="Leave call" className="rounded-lg p-2 text-slate-300 hover:bg-rose-600 hover:text-white">
                <PhoneOff className="h-4 w-4" />
              </button>
            </div>
          </header>

          {!callSession.isMinimized && (
            <>
              <section className="relative flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3 sm:p-5">
                {audioPlaybackBlocked && (
                  <button
                    type="button"
                    onClick={() => void enableAudioPlayback()}
                    className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-slate-950"
                  >
                    Enable call audio
                  </button>
                )}
                {sharedScreen?.screen && (
                  <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl bg-black">
                    <AttachedVideo track={sharedScreen.screen} className="h-full max-h-full w-full object-contain" />
                    <span className="absolute left-3 top-3 rounded-lg bg-black/70 px-2 py-1 text-xs font-semibold">{sharedScreen.name} is sharing their screen</span>
                  </div>
                )}
                {localScreenTrack && (
                  <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl bg-black">
                    <AttachedVideo track={localScreenTrack} muted className="h-full max-h-full w-full object-contain" />
                    <span className="absolute left-3 top-3 rounded-lg bg-black/70 px-2 py-1 text-xs font-semibold">You are sharing your screen</span>
                  </div>
                )}
                {!sharedScreen && !localScreenTrack && (
                  <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {remoteMedia.map((participant) => (
                      <div key={participant.identity} className={`relative min-h-40 overflow-hidden rounded-2xl border bg-slate-900 ${participant.speaking ? 'border-brand-400' : 'border-slate-800'}`}>
                        {participant.camera ? (
                          <AttachedVideo track={participant.camera} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full min-h-40 items-center justify-center text-4xl font-bold text-slate-500">
                            {participant.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span className="absolute bottom-2 left-2 rounded-lg bg-black/65 px-2 py-1 text-xs">{participant.name}</span>
                      </div>
                    ))}
                    <div className="relative min-h-40 overflow-hidden rounded-2xl border border-brand-500/70 bg-slate-900">
                      {localCameraTrack && !callSession.isCameraOff && workspaceSettings.showCameraPreview ? (
                        <AttachedVideo track={localCameraTrack} muted className="h-full w-full scale-x-[-1] object-cover" />
                      ) : (
                        <div className="flex h-full min-h-40 items-center justify-center text-4xl font-bold text-brand-300">
                          {currentUser.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span className="absolute bottom-2 left-2 rounded-lg bg-black/65 px-2 py-1 text-xs">You{callSession.isMuted ? ' · muted' : ''}</span>
                    </div>
                    {remoteMedia.length === 0 && connectionState === ConnectionState.Connected && (
                      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-xl bg-slate-950/80 px-4 py-2 text-center text-xs text-slate-400">
                        <Users className="mx-auto mb-1 h-4 w-4" />
                        Waiting for teammates to join
                      </div>
                    )}
                  </div>
                )}
                {remoteMedia.flatMap((participant) =>
                  participant.audio.map((track) => <AttachedAudio key={track.sid} track={track} />)
                )}
              </section>

              <footer className="flex items-center justify-center gap-3 border-t border-slate-800 bg-slate-900 px-4 py-4">
                <button type="button" onClick={toggleCallMute} aria-label={callSession.isMuted ? 'Unmute microphone' : 'Mute microphone'} className={`rounded-xl p-3 ${callSession.isMuted ? 'bg-rose-600' : 'bg-slate-800 hover:bg-slate-700'}`}>
                  {callSession.isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                </button>
                <button type="button" onClick={toggleCallCamera} aria-label={callSession.isCameraOff ? 'Turn camera on' : 'Turn camera off'} className={`rounded-xl p-3 ${callSession.isCameraOff ? 'bg-rose-600' : 'bg-slate-800 hover:bg-slate-700'}`}>
                  {callSession.isCameraOff ? <VideoOff className="h-5 w-5" /> : <VideoIcon className="h-5 w-5" />}
                </button>
                <button type="button" onClick={() => void handleScreenShare()} disabled={isScreenShareBusy || connectionState !== ConnectionState.Connected} aria-label={callSession.isScreenSharing ? 'Stop sharing screen' : 'Share screen'} className={`rounded-xl p-3 disabled:opacity-50 ${callSession.isScreenSharing ? 'bg-brand-600' : 'bg-slate-800 hover:bg-slate-700'}`}>
                  {callSession.isScreenSharing ? <MonitorOff className="h-5 w-5" /> : <Monitor className="h-5 w-5" />}
                </button>
                <button type="button" onClick={endCall} aria-label="Leave call" className="rounded-xl bg-rose-600 p-3 hover:bg-rose-500">
                  <PhoneOff className="h-5 w-5" />
                </button>
              </footer>
            </>
          )}
          {callSession.isMinimized && (
            <div className="flex items-center justify-between px-4 py-2 text-xs text-slate-300">
              <span>{connectionState === ConnectionState.Connected ? `${minutes}:${seconds}` : 'Connecting…'}</span>
              <div className="flex gap-2">
                <button type="button" onClick={toggleCallMute} aria-label={callSession.isMuted ? 'Unmute' : 'Mute'} className="rounded-lg bg-slate-800 p-2">
                  {callSession.isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </button>
                <button type="button" onClick={endCall} aria-label="Leave call" className="rounded-lg bg-rose-600 p-2"><PhoneOff className="h-4 w-4" /></button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
};
