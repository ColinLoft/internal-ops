import React, { useState, useRef, useEffect } from 'react';
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
  Sparkles,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';

export const CallOverlay: React.FC = () => {
  const {
    callSession,
    endCall,
    toggleCallMute,
    toggleCallCamera,
    toggleCallScreenShare,
    toggleCallMinimize,
    currentUser,
    workspaceSettings,
  } = useWorkspace();

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const screenVideoRef = useRef<HTMLVideoElement>(null);

  // Capture the selected local devices for the active call.
  useEffect(() => {
    let stream: MediaStream | null = null;
    if (callSession.active) {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const audio: MediaTrackConstraints = {
          noiseSuppression: workspaceSettings.noiseSuppression,
          ...(workspaceSettings.microphoneDeviceId
            ? { deviceId: { exact: workspaceSettings.microphoneDeviceId } }
            : {}),
        };
        const video: MediaTrackConstraints | boolean = callSession.type === 'video'
          ? {
              ...(workspaceSettings.cameraDeviceId
                ? { deviceId: { exact: workspaceSettings.cameraDeviceId } }
                : {}),
            }
          : false;

        navigator.mediaDevices.getUserMedia({ video, audio })
          .then((s) => {
            stream = s;
            setLocalStream(s);
            if (localVideoRef.current) {
              localVideoRef.current.srcObject = s;
            }
          })
          .catch((err) => console.warn('Selected call devices are unavailable or permission was denied:', err));
      }
    } else {
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
        setLocalStream(null);
      }
    }

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [
    callSession.active,
    callSession.type,
    workspaceSettings.microphoneDeviceId,
    workspaceSettings.cameraDeviceId,
    workspaceSettings.noiseSuppression,
  ]);

  useEffect(() => {
    localStream?.getVideoTracks().forEach((track) => {
      track.enabled = !callSession.isCameraOff;
    });
  }, [localStream, callSession.isCameraOff]);

  useEffect(() => {
    localStream?.getAudioTracks().forEach((track) => {
      track.enabled = !callSession.isMuted;
    });
  }, [localStream, callSession.isMuted]);

  // Handle real screen sharing via getDisplayMedia
  useEffect(() => {
    let sStream: MediaStream | null = null;
    if (callSession.active && callSession.isScreenSharing) {
      if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
        navigator.mediaDevices
          .getDisplayMedia({ video: true })
          .then((s) => {
            sStream = s;
            setScreenStream(s);
            if (screenVideoRef.current) {
              screenVideoRef.current.srcObject = s;
            }
            s.getVideoTracks()[0].onended = () => {
              toggleCallScreenShare();
            };
          })
          .catch((err) => {
            console.warn('Screen share cancelled or not allowed:', err);
            toggleCallScreenShare();
          });
      }
    } else {
      if (screenStream) {
        screenStream.getTracks().forEach((track) => track.stop());
        setScreenStream(null);
      }
    }

    return () => {
      if (sStream) {
        sStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [callSession.isScreenSharing]);

  if (!callSession.active) return null;

  const minutes = Math.floor(callSession.durationSeconds / 60);
  const seconds = (callSession.durationSeconds % 60).toString().padStart(2, '0');
  const peer = callSession.peerUser;

  // Minimized Picture-in-Picture Pill
  if (callSession.isMinimized) {
    return (
      <div className="fixed bottom-6 right-6 z-50 bg-slate-900/95 backdrop-blur-2xl text-white px-4 py-3 rounded-2xl shadow-2xl border border-slate-700/80 flex items-center gap-3 animate-in slide-in-from-bottom duration-200">
        <div className="relative">
          <img
            src={peer?.avatar || 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100'}
            alt="peer"
            className="w-10 h-10 rounded-xl object-cover border border-brand-500 shadow-sm"
          />
          <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-slate-900 animate-pulse" />
        </div>

        <div className="min-w-0 pr-2">
          <h5 className="text-xs font-bold truncate max-w-[120px]">
            {callSession.targetChannel ? `#${callSession.targetChannel.name}` : peer?.name}
          </h5>
          <p className="text-[10px] text-emerald-400 font-mono font-semibold">
            {minutes}:{seconds}
          </p>
        </div>

        <div className="flex items-center gap-1.5 border-l border-slate-700 pl-2">
          <button
            onClick={toggleCallMute}
            className={`p-2 rounded-xl transition-colors ${
              callSession.isMuted ? 'bg-rose-500/20 text-rose-400' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
            }`}
            title={callSession.isMuted ? 'Unmute' : 'Mute'}
          >
            {callSession.isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={toggleCallMinimize}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition-colors"
            title="Expand Call Window"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={endCall}
            className="p-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-md transition-colors"
            title="End Call"
          >
            <PhoneOff className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  // Expanded Floating In-App Window
  return (
    <div className="fixed bottom-6 right-6 z-50 w-[440px] sm:w-[520px] bg-slate-900/95 backdrop-blur-2xl rounded-3xl shadow-2xl border border-slate-700/80 overflow-hidden flex flex-col text-white animate-in zoom-in-95 duration-200">
      {/* Call Header */}
      <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
        <div className="flex items-center gap-2.5">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
          <div>
            <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
              <span>{callSession.type === 'video' ? 'Live Video Room' : 'Encrypted Voice Call'}</span>
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded-full border border-emerald-800/80">
                {minutes}:{seconds}
              </span>
            </h4>
            <p className="text-[11px] text-slate-400">
              {callSession.targetChannel
                ? `#${callSession.targetChannel.name} • Non-Profit Team Call`
                : `${peer?.name} (${peer?.role})`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={toggleCallMinimize}
            className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
            title="Minimize to Picture-in-Picture"
          >
            <Minimize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Video & Audio Area */}
      <div className="p-4 bg-slate-950/90 relative min-h-[260px] flex items-center justify-center">
        {callSession.isScreenSharing ? (
          /* Screen Sharing View */
          <div className="w-full h-64 bg-slate-900 rounded-2xl overflow-hidden relative border border-brand-500/50 shadow-inner flex flex-col">
            <div className="absolute top-3 left-3 z-10 bg-brand-600/90 backdrop-blur-md px-2.5 py-1 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 shadow-sm">
              <Monitor className="w-3.5 h-3.5" /> Presenting Screen Live
            </div>
            {screenStream ? (
              <video
                ref={screenVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-contain bg-black"
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-4">
                <Monitor className="w-12 h-12 text-brand-400 mb-2 animate-bounce" />
                <p className="text-xs font-bold text-white">Live Presentation Feed Active</p>
                <p className="text-[10px] text-slate-400 mt-1">
                  Broadcasting your selected window or document with low latency
                </p>
              </div>
            )}
          </div>
        ) : callSession.type === 'video' ? (
          /* 2-Person Video Call Grid */
          <div className="w-full grid grid-cols-2 gap-3 h-64">
            {/* Peer Video Card */}
            <div className="relative rounded-2xl overflow-hidden bg-slate-900 border border-slate-800 flex items-center justify-center shadow-md">
              <img
                src={peer?.avatar || 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=300'}
                alt={peer?.name}
                className="w-full h-full object-cover opacity-90"
              />
              <div className="absolute bottom-2 left-2 bg-slate-900/80 backdrop-blur-md px-2 py-0.5 rounded-lg text-[10px] font-bold text-white">
                {peer?.name || 'Teammate'}
              </div>
              {/* Speaking audio wave indicator */}
              <div className="absolute top-2 right-2 flex items-center gap-0.5 bg-black/40 backdrop-blur-md p-1 rounded-lg">
                <span className="w-1 h-3 bg-emerald-400 rounded-full animate-pulse" />
                <span className="w-1 h-4 bg-emerald-400 rounded-full animate-pulse delay-75" />
                <span className="w-1 h-2 bg-emerald-400 rounded-full animate-pulse delay-150" />
              </div>
            </div>

            {/* Self Video Card */}
            <div className="relative rounded-2xl overflow-hidden bg-slate-900 border border-slate-800 flex items-center justify-center shadow-md">
              {localStream && !callSession.isCameraOff && workspaceSettings.showCameraPreview ? (
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover scale-x-[-1]"
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-slate-400">
                  <img
                    src={currentUser.avatar}
                    alt={currentUser.name}
                    className="w-16 h-16 rounded-full object-cover border-2 border-brand-500 shadow-md mb-2"
                  />
                  <p className="text-[11px] font-bold text-slate-300">
                    {workspaceSettings.showCameraPreview ? 'Camera Off' : 'Preview Hidden'}
                  </p>
                </div>
              )}
              <div className="absolute bottom-2 left-2 bg-slate-900/80 backdrop-blur-md px-2 py-0.5 rounded-lg text-[10px] font-bold text-white">
                You ({currentUser.name})
              </div>
            </div>
          </div>
        ) : (
          /* Voice Call Audio Card */
          <div className="flex flex-col items-center justify-center py-6">
            <div className="relative mb-4">
              <img
                src={peer?.avatar || 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200'}
                alt={peer?.name}
                className="w-24 h-24 rounded-3xl object-cover border-4 border-brand-500 shadow-2xl"
              />
              <span className="absolute -bottom-1 -right-1 p-1.5 bg-emerald-500 text-white rounded-full border-2 border-slate-900">
                <Mic className="w-4 h-4" />
              </span>
            </div>
            <h4 className="text-sm font-bold text-white">{peer?.name || 'Teammate'}</h4>
            <p className="text-xs text-slate-400 mt-0.5">{peer?.role || 'Staff Member'}</p>

            {/* Simulated Live Audio Spectrum Bars */}
            <div className="flex items-center gap-1.5 mt-5">
              {[4, 8, 14, 20, 16, 22, 10, 18, 12, 6].map((h, i) => (
                <span
                  key={i}
                  className="w-1.5 bg-brand-500 rounded-full animate-pulse"
                  style={{ height: `${h}px`, animationDelay: `${i * 100}ms` }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Action Toolbar */}
      <div className="px-6 py-4 bg-slate-900 flex items-center justify-center gap-4">
        {/* Mute Mic */}
        <button
          onClick={toggleCallMute}
          className={`p-3.5 rounded-2xl transition-all shadow-md ${
            callSession.isMuted
              ? 'bg-rose-500 text-white'
              : 'bg-slate-800 hover:bg-slate-700 text-white'
          }`}
          title={callSession.isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
        >
          {callSession.isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>

        {/* Video Toggle */}
        <button
          onClick={toggleCallCamera}
          className={`p-3.5 rounded-2xl transition-all shadow-md ${
            callSession.isCameraOff
              ? 'bg-rose-500 text-white'
              : 'bg-slate-800 hover:bg-slate-700 text-white'
          }`}
          title={callSession.isCameraOff ? 'Turn Camera On' : 'Turn Camera Off'}
        >
          {callSession.isCameraOff ? <VideoOff className="w-5 h-5" /> : <VideoIcon className="w-5 h-5" />}
        </button>

        {/* Screen Share Toggle */}
        <button
          onClick={toggleCallScreenShare}
          className={`p-3.5 rounded-2xl transition-all shadow-md ${
            callSession.isScreenSharing
              ? 'bg-brand-600 text-white ring-2 ring-brand-400/50'
              : 'bg-slate-800 hover:bg-slate-700 text-white'
          }`}
          title={callSession.isScreenSharing ? 'Stop Screen Sharing' : 'Share Screen'}
        >
          {callSession.isScreenSharing ? <MonitorOff className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
        </button>

        {/* End Call */}
        <button
          onClick={endCall}
          className="p-3.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-600/30 transition-all active:scale-95"
          title="End Call"
        >
          <PhoneOff className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
