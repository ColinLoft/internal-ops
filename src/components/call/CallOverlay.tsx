import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ConnectionState,
  Participant,
  ParticipantEvent,
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
  Volume2,
  RotateCw,
  LoaderCircle,
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

const AttachedVideo = React.memo(function AttachedVideo({
  track,
  className = '',
  muted = false,
}: { track?: Track; className?: string; muted?: boolean }) {
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
});

const AttachedAudio: React.FC<{ track: Track; onPlaybackBlocked: () => void }> = ({ track, onPlaybackBlocked }) => {
  const elementRef = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (!elementRef.current) return;
    const element = track.attach(elementRef.current);
    element.muted = false;
    element.volume = 1;
    void element.play().catch(() => onPlaybackBlocked());
    return () => {
      track.detach(element);
    };
  }, [track, onPlaybackBlocked]);
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
  const [localMedia, setLocalMedia] = useState<ParticipantMedia | null>(null);
  const [selectedScreenId, setSelectedScreenId] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.Disconnected);
  const [isScreenShareBusy, setIsScreenShareBusy] = useState(false);
  const [audioPlaybackBlocked, setAudioPlaybackBlocked] = useState(false);
  const [microphoneError, setMicrophoneError] = useState('');
  const [isMicrophoneBusy, setIsMicrophoneBusy] = useState(false);
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const screenSharingRef = useRef(callSession.isScreenSharing);
  const handleAudioPlaybackBlocked = useCallback(() => setAudioPlaybackBlocked(true), []);

  useEffect(() => {
    if (!callSession.active || !callSession.sessionId) {
      setRoom(null);
      setRemoteMedia([]);
      setLocalMedia(null);
      setSelectedScreenId(null);
      screenSharingRef.current = false;
      setConnectionState(ConnectionState.Disconnected);
      setMicrophoneError('');
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
      setLocalMedia(participantMedia(liveKitRoom.localParticipant));
    };

    liveKitRoom
      .on(RoomEvent.TrackSubscribed, refreshMedia)
      .on(RoomEvent.TrackUnsubscribed, refreshMedia)
      .on(RoomEvent.TrackPublished, refreshMedia)
      .on(RoomEvent.TrackUnpublished, refreshMedia)
      .on(RoomEvent.LocalTrackPublished, refreshMedia)
      .on(RoomEvent.TrackMuted, refreshMedia)
      .on(RoomEvent.TrackUnmuted, refreshMedia)
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
        }
        refreshMedia();
      });
    liveKitRoom.localParticipant.on(ParticipantEvent.IsSpeakingChanged, refreshMedia);

    setRoom(liveKitRoom);
    setConnectionState(ConnectionState.Connecting);
    setAudioPlaybackBlocked(false);
    setMicrophoneError('');
    setRemoteMedia([]);

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

        setCallConnected(callSession.sessionId);
        refreshMedia();
      } catch (error) {
        if (mounted) {
          setConnectionState(ConnectionState.Disconnected);
          setCallError(error instanceof Error ? error.message : 'Unable to connect to the call.');
        }
      }
    };

    void connect();
    return () => {
      mounted = false;
      liveKitRoom.localParticipant.off(ParticipantEvent.IsSpeakingChanged, refreshMedia);
      void liveKitRoom.disconnect();
    };
  }, [callSession.active, callSession.sessionId, callSession.type, connectionAttempt]);

  useEffect(() => {
    if (!room || connectionState !== ConnectionState.Connected) return;
    void room.localParticipant.setMicrophoneEnabled(!callSession.isMuted, {
      noiseSuppression: workspaceSettings.noiseSuppression,
      echoCancellation: true,
      autoGainControl: true,
      ...(workspaceSettings.microphoneDeviceId ? { deviceId: workspaceSettings.microphoneDeviceId } : {}),
    }).then(() => setMicrophoneError('')).catch((error: unknown) => {
      setMicrophoneError(error instanceof Error ? error.message : 'Microphone could not be enabled.');
    });
  }, [room, connectionState, callSession.isMuted, workspaceSettings.microphoneDeviceId, workspaceSettings.noiseSuppression]);

  useEffect(() => {
    if (!room || connectionState !== ConnectionState.Connected) return;
    void room.localParticipant.setCameraEnabled(!callSession.isCameraOff && callSession.type === 'video', {
      ...(workspaceSettings.cameraDeviceId ? { deviceId: workspaceSettings.cameraDeviceId } : {}),
      resolution: { width: 1280, height: 720, frameRate: 24 },
    }).catch((error: unknown) => {
      setCallError(error instanceof Error ? `Camera could not be changed: ${error.message}` : 'Camera could not be changed.');
    });
  }, [room, connectionState, callSession.isCameraOff, callSession.type, workspaceSettings.cameraDeviceId, setCallError]);

  const localCameraTrack = localMedia?.camera;
  const localSpeaking = Boolean(localMedia?.speaking && !callSession.isMuted && !microphoneError);
  const screenShares = [
    ...remoteMedia.filter((participant) => participant.screen),
    ...(localMedia?.screen ? [{ ...localMedia, name: 'You' }] : []),
  ];
  const focusedScreenId = screenShares.some((participant) => participant.identity === selectedScreenId)
    ? selectedScreenId : null;

  const handleScreenShare = async () => {
    if (!room || isScreenShareBusy || connectionState !== ConnectionState.Connected) return;
    setIsScreenShareBusy(true);
    try {
      await room.localParticipant.setScreenShareEnabled(!screenSharingRef.current, {
        audio: false,
        selfBrowserSurface: 'exclude',
        surfaceSwitching: 'include',
        contentHint: 'detail',
        resolution: { width: 1280, height: 720, frameRate: 10 },
      }, {
        videoCodec: 'vp8',
        simulcast: false,
        screenShareEncoding: { maxBitrate: 1_500_000, maxFramerate: 10 },
        degradationPreference: 'maintain-resolution',
      });
      const enabled = room.localParticipant.isScreenShareEnabled;
      if (enabled !== screenSharingRef.current) {
        screenSharingRef.current = enabled;
        toggleCallScreenShare();
      }
      setLocalMedia(participantMedia(room.localParticipant));
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

  const enableMicrophone = async () => {
    if (!room || isMicrophoneBusy) return;
    setIsMicrophoneBusy(true);
    try {
      await room.localParticipant.setMicrophoneEnabled(true, {
        noiseSuppression: workspaceSettings.noiseSuppression,
        echoCancellation: true,
        autoGainControl: true,
        ...(workspaceSettings.microphoneDeviceId ? { deviceId: workspaceSettings.microphoneDeviceId } : {}),
      });
      setMicrophoneError('');
      if (callSession.isMuted) toggleCallMute();
    } catch (error) {
      setMicrophoneError(error instanceof Error ? error.message : 'Microphone could not be enabled.');
    } finally {
      setIsMicrophoneBusy(false);
    }
  };

  const handleMicrophoneButton = () => {
    if (microphoneError) void enableMicrophone();
    else toggleCallMute();
  };

  const retryConnection = () => {
    setCallError('');
    setConnectionAttempt((attempt) => attempt + 1);
  };

  const minutes = Math.floor(callSession.durationSeconds / 60);
  const seconds = (callSession.durationSeconds % 60).toString().padStart(2, '0');

  return (
    <>
      {callError && (!callSession.active || connectionState === ConnectionState.Connected) && (
        <div role="alert" className="fixed left-3 right-3 top-20 z-[70] flex max-w-md md:left-auto md:right-5 items-start gap-3 rounded-xl border border-rose-200 bg-white px-4 py-3 text-sm text-rose-700 shadow-xl">
          <p className="flex-1">{callError}</p>
          <button type="button" onClick={() => setCallError('')} aria-label="Dismiss call error"><X className="h-4 w-4" /></button>
        </div>
      )}

      {incomingCall && !callSession.active && (
        <div className="fixed bottom-[4.5rem] right-3 z-[65] w-[min(24rem,calc(100vw-1.5rem))] md:bottom-6 md:right-6 md:w-[min(24rem,calc(100vw-2rem))] rounded-2xl border border-slate-700 bg-slate-900 p-4 text-white shadow-2xl">
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
        <div className={`fixed ${callSession.isMinimized ? 'bottom-[4.5rem] right-3 w-[min(25rem,calc(100vw-1.5rem))] md:bottom-6 md:right-6 md:w-[min(25rem,calc(100vw-2rem))]' : 'inset-0 sm:inset-4'} z-50 flex flex-col overflow-hidden border border-[#303236] bg-[#111214] text-white shadow-2xl ${callSession.isMinimized ? 'rounded-xl' : 'rounded-none sm:rounded-2xl'}`}>
          {remoteMedia.flatMap((participant) =>
            participant.audio.map((track) => <AttachedAudio key={`${participant.identity}:${track.sid}`} track={track} onPlaybackBlocked={handleAudioPlaybackBlocked} />)
          )}
          <header className="flex min-h-16 items-center justify-between border-b border-[#303236] bg-[#18191b] px-4 py-3 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${connectionState === ConnectionState.Connected ? 'bg-emerald-400' : connectionState === ConnectionState.Disconnected ? 'bg-rose-400' : 'animate-pulse bg-amber-300'}`} />
              <div className="min-w-0">
                <h2 className="truncate text-sm font-bold">
                  {callSession.targetChannel ? `#${callSession.targetChannel.name}` : callSession.peerUser?.name || 'Team call'}
                </h2>
                <p className="text-xs text-[#b8b9bc]">
                  {connectionState === ConnectionState.Connected
                    ? `Connected · ${minutes}:${seconds} · ${remoteMedia.length + 1} ${remoteMedia.length === 0 ? 'person' : 'people'}`
                    : connectionState === ConnectionState.Disconnected ? 'Connection unavailable' : 'Connecting to the call…'}
                  {' · '}{callSession.type === 'video' ? 'Video' : 'Audio'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={toggleCallMinimize} title={callSession.isMinimized ? 'Expand call' : 'Minimize call'} aria-label={callSession.isMinimized ? 'Expand call' : 'Minimize call'} className="flex min-h-11 min-w-11 items-center justify-center rounded-lg p-2 text-[#d0d1d3] hover:bg-[#292a2d]">
                {callSession.isMinimized ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
              </button>
              <button type="button" onClick={endCall} title="Leave call" aria-label="Leave call" className="flex min-h-11 min-w-11 items-center justify-center rounded-lg p-2 text-[#d0d1d3] hover:bg-rose-700 hover:text-white">
                <PhoneOff className="h-4 w-4" />
              </button>
            </div>
          </header>

          {audioPlaybackBlocked && (
            <div role="status" className="flex flex-wrap items-center justify-between gap-3 bg-[#18191b] px-4 py-3">
              <span className="flex items-center gap-2 text-sm text-[#e1e2e4]"><Volume2 className="h-4 w-4 text-amber-300" />Allow audio playback to hear the call.</span>
              <button type="button" onClick={() => void enableAudioPlayback()} className="min-h-10 rounded-md bg-white px-3 text-sm font-semibold text-black hover:bg-[#e6e6e6]">Turn on audio</button>
            </div>
          )}
          {!callSession.isMinimized && (
            <>
              <section className="relative flex min-h-0 flex-1 flex-col gap-4 overflow-auto bg-[#0b0c0e] p-4 sm:p-6">
                {microphoneError && (
                  <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#513637] bg-[#211719] px-4 py-3">
                    <span className="text-sm text-[#f0c5c6]">Microphone unavailable: {microphoneError}</span>
                    <button type="button" onClick={() => void enableMicrophone()} disabled={isMicrophoneBusy} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[#5b4143] px-3 text-sm font-semibold text-white hover:bg-[#342326] disabled:opacity-60">
                      {isMicrophoneBusy && <LoaderCircle className="h-4 w-4 animate-spin" />}
                      Try microphone again
                    </button>
                  </div>
                )}
                {connectionState === ConnectionState.Disconnected && (
                  <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#513637] bg-[#211719] px-4 py-3">
                    <span className="text-sm text-[#f0c5c6]">{callError || 'The call connection is unavailable.'}</span>
                    <button type="button" onClick={retryConnection} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-white px-3 text-sm font-semibold text-black hover:bg-[#e6e6e6]">
                      <RotateCw className="h-4 w-4" />Reconnect
                    </button>
                  </div>
                )}
                {screenShares.length > 0 && (
                  <div className={`grid grid-cols-1 gap-4 ${screenShares.length === 2 ? 'sm:grid-cols-2' : screenShares.length > 2 ? 'sm:grid-cols-2 lg:grid-cols-3' : ''}`}>
                    {screenShares.map((participant) => {
                      const focused = participant.identity === focusedScreenId;
                      const local = participant.identity === localMedia?.identity;
                      return (
                        <button
                          key={participant.identity}
                          type="button"
                          aria-label={`${focused ? 'Reduce' : 'Enlarge'} ${local ? 'your' : `${participant.name}'s`} screen share`}
                          aria-pressed={focused}
                          onClick={() => setSelectedScreenId(focused ? null : participant.identity)}
                          className={`relative overflow-hidden rounded-lg bg-black ring-1 ring-[#303236] hover:ring-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                            focused || screenShares.length === 1
                              ? 'order-first col-span-full h-[min(55vh,36rem)]'
                              : focusedScreenId ? 'h-28 w-full max-w-60 sm:h-32' : 'aspect-video'
                          }`}
                        >
                          <AttachedVideo track={participant.screen} muted={local} className="absolute inset-0 h-full w-full object-contain" />
                          <span className="absolute left-3 top-3 rounded-md bg-black/75 px-2.5 py-1.5 text-xs font-semibold">{local ? 'Your screen' : `${participant.name}'s screen`}</span>
                          <span className="absolute bottom-3 right-3 rounded-md bg-black/75 p-2">
                            {focused ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {screenShares.length === 0 && (
                  <div className={`grid min-h-0 flex-1 content-center gap-4 ${remoteMedia.length === 0 ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'}`}>
                    {remoteMedia.map((participant) => (
                      <div key={participant.identity} className={`relative flex min-h-48 items-center justify-center overflow-hidden rounded-xl border bg-[#17181a] ${participant.speaking ? 'border-emerald-400' : 'border-[#303236]'}`}>
                        {callSession.type === 'video' && participant.camera ? (
                          <AttachedVideo track={participant.camera} className="absolute inset-0 h-full w-full object-cover" />
                        ) : (
                          <div className="flex flex-col items-center gap-3">
                            <span className={`flex h-24 w-24 items-center justify-center rounded-full bg-[#2c2e32] text-3xl font-semibold text-white ${participant.speaking ? 'ring-2 ring-emerald-400 ring-offset-4 ring-offset-[#17181a]' : ''}`}>
                              {participant.name.charAt(0).toUpperCase()}
                            </span>
                            <span className="flex items-center gap-2 text-sm text-[#d5d6d8]">
                              {participant.speaking && <span className="h-2 w-2 rounded-full bg-emerald-400" />}
                              {participant.speaking ? 'Speaking' : 'In the call'}
                            </span>
                          </div>
                        )}
                        <span className="absolute bottom-3 left-3 rounded-md bg-black/75 px-2.5 py-1.5 text-sm font-medium">{participant.name}</span>
                      </div>
                    ))}
                    <div aria-label={localSpeaking ? 'You are speaking' : 'Your call tile'} className={`relative flex min-h-48 items-center justify-center overflow-hidden rounded-xl border bg-[#17181a] ${localSpeaking ? 'border-emerald-400' : 'border-[#303236]'}`}>
                      {callSession.type === 'video' && localCameraTrack && !callSession.isCameraOff && workspaceSettings.showCameraPreview ? (
                        <AttachedVideo track={localCameraTrack} muted className="absolute inset-0 h-full w-full scale-x-[-1] object-cover" />
                      ) : (
                        <div className="flex flex-col items-center gap-3">
                          <span className={`flex h-24 w-24 items-center justify-center rounded-full bg-[#292b2e] text-3xl font-semibold text-white ${localSpeaking ? 'ring-2 ring-emerald-400 ring-offset-4 ring-offset-[#17181a]' : ''}`}>
                            {currentUser.name.charAt(0).toUpperCase()}
                          </span>
                          <span className="flex items-center gap-2 text-sm text-[#d5d6d8]">
                            {localSpeaking && <span className="h-2 w-2 rounded-full bg-emerald-400" />}
                            {localSpeaking ? 'Speaking' : 'You'}
                          </span>
                        </div>
                      )}
                      <span className="absolute bottom-3 left-3 flex items-center gap-2 rounded-md bg-black/75 px-2.5 py-1.5 text-sm font-medium">
                        You{callSession.isMuted && <span className="text-[#ffb9b9]">· muted</span>}
                      </span>
                    </div>
                    {remoteMedia.length === 0 && connectionState === ConnectionState.Connected && (
                      <div className="text-center text-sm text-[#b8b9bc]">
                        <Users className="mx-auto mb-2 h-5 w-5" />
                        {callSession.peerUser ? `Waiting for ${callSession.peerUser.name} to join` : 'Waiting for teammates to join'}
                      </div>
                    )}
                  </div>
                )}
              </section>

              <footer className="flex flex-wrap items-center justify-center gap-2 border-t border-[#303236] bg-[#18191b] px-3 py-3 pb-[max(.75rem,env(safe-area-inset-bottom))] sm:gap-3 sm:px-5 sm:py-4">
                <button type="button" onClick={handleMicrophoneButton} disabled={isMicrophoneBusy} aria-label={microphoneError ? 'Retry microphone' : callSession.isMuted ? 'Unmute microphone' : 'Mute microphone'} className={`flex min-h-14 min-w-[4.75rem] flex-col items-center justify-center gap-1 rounded-lg px-3 text-xs font-medium transition-colors disabled:opacity-60 ${callSession.isMuted ? 'bg-[#4b2527] text-[#ffdede] hover:bg-[#603033]' : 'bg-[#292b2e] text-white hover:bg-[#383a3e]'}`}>
                  {isMicrophoneBusy ? <LoaderCircle className="h-5 w-5 animate-spin" /> : callSession.isMuted || microphoneError ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                  <span>{microphoneError ? 'Retry mic' : callSession.isMuted ? 'Unmute' : 'Mute'}</span>
                </button>
                {callSession.type === 'video' && (
                  <button type="button" onClick={toggleCallCamera} aria-label={callSession.isCameraOff ? 'Turn camera on' : 'Turn camera off'} className="flex min-h-14 min-w-[4.75rem] flex-col items-center justify-center gap-1 rounded-lg bg-[#292b2e] px-3 text-xs font-medium text-white transition-colors hover:bg-[#383a3e]">
                    {callSession.isCameraOff ? <VideoOff className="h-5 w-5" /> : <VideoIcon className="h-5 w-5" />}
                    <span>{callSession.isCameraOff ? 'Camera on' : 'Camera off'}</span>
                  </button>
                )}
                <button type="button" onClick={() => void handleScreenShare()} disabled={isScreenShareBusy || connectionState !== ConnectionState.Connected} aria-label={callSession.isScreenSharing ? 'Stop sharing screen' : 'Share screen'} className={`flex min-h-14 min-w-[4.75rem] flex-col items-center justify-center gap-1 rounded-lg px-3 text-xs font-medium transition-colors disabled:opacity-50 ${callSession.isScreenSharing ? 'bg-[#d9e8ff] text-[#123f87]' : 'bg-[#292b2e] text-white hover:bg-[#383a3e]'}`}>
                  {callSession.isScreenSharing ? <MonitorOff className="h-5 w-5" /> : <Monitor className="h-5 w-5" />}
                  <span>{callSession.isScreenSharing ? 'Stop share' : 'Share'}</span>
                </button>
                <button type="button" onClick={endCall} aria-label="Leave call" className="flex min-h-14 min-w-[4.75rem] flex-col items-center justify-center gap-1 rounded-lg bg-rose-700 px-3 text-xs font-semibold text-white transition-colors hover:bg-rose-600">
                  <PhoneOff className="h-5 w-5" />
                  <span>Leave</span>
                </button>
              </footer>
            </>
          )}
          {callSession.isMinimized && (
            <div className="flex items-center justify-between px-4 py-2 text-xs text-slate-300">
              <span>{connectionState === ConnectionState.Connected ? `${minutes}:${seconds}` : connectionState === ConnectionState.Disconnected ? 'Connection lost' : 'Connecting…'}</span>
              <div className="flex gap-2">
                <button type="button" onClick={handleMicrophoneButton} disabled={isMicrophoneBusy} aria-label={microphoneError ? 'Retry microphone' : callSession.isMuted ? 'Unmute' : 'Mute'} className="rounded-lg bg-slate-800 p-2">
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
