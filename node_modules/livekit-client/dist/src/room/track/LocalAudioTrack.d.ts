import type { AudioSenderStats } from '../stats';
import type { LoggerOptions } from '../types';
import LocalTrack from './LocalTrack';
import { Track } from './Track';
import type { AudioCaptureOptions } from './options';
import type { AudioProcessorOptions, TrackProcessor } from './processor/types';
export default class LocalAudioTrack extends LocalTrack<Track.Kind.Audio> {
    /** @internal */
    stopOnMute: boolean;
    private prevStats?;
    private isKrispNoiseFilterEnabled;
    /**
     * the processed track we currently have krisp feature listeners registered on. Tracked
     * separately, as `processor.processedTrack` can be swapped out while we hold the listeners.
     */
    private observedProcessedTrack?;
    protected processor?: TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> | undefined;
    /**
     * boolean indicating whether enhanced noise cancellation is currently being used on this track
     */
    get enhancedNoiseCancellation(): boolean;
    /**
     *
     * @param mediaTrack
     * @param constraints MediaTrackConstraints that are being used when restarting or reacquiring tracks
     * @param userProvidedTrack Signals to the SDK whether or not the mediaTrack should be managed (i.e. released and reacquired) internally by the SDK
     */
    constructor(mediaTrack: MediaStreamTrack, constraints?: MediaTrackConstraints, userProvidedTrack?: boolean, audioContext?: AudioContext, loggerOptions?: LoggerOptions);
    mute(): Promise<typeof this>;
    unmute(): Promise<typeof this>;
    restartTrack(options?: AudioCaptureOptions): Promise<void>;
    applyConstraints(constraints: Pick<AudioCaptureOptions, 'autoGainControl' | 'noiseSuppression' | 'echoCancellation' | 'voiceIsolation'>): Promise<void>;
    protected restart(constraints?: MediaTrackConstraints, isUnmuting?: boolean): Promise<typeof this>;
    startMonitor(): void;
    protected monitorSender: () => Promise<void>;
    private handleKrispNoiseFilterEnable;
    private handleKrispNoiseFilterDisable;
    /**
     * registers the krisp feature listeners on the given processed track, moving them over from
     * a previously observed one. Passing `undefined` just removes the existing listeners.
     */
    private observeProcessedTrack;
    /**
     * Sets a processor on this track.
     *
     * The processor is destroyed when the track is stopped, and also when the audio context goes
     * away, so a disconnect ends it on both counts and it has to be set again after reconnecting.
     * See {@link TrackProcessor} for the full lifecycle.
     */
    setProcessor(processor: TrackProcessor<Track.Kind.Audio, AudioProcessorOptions>): Promise<void>;
    protected onMediaStreamTrackChanged(): Promise<void>;
    protected internalStopProcessor(keepElement?: boolean): Promise<void>;
    stop(): void;
    /**
     * @internal
     * @experimental
     *
     * A processor's nodes (`AudioWorkletNode`, ...) can't move between contexts, so the processor
     * is rebuilt whenever the context changes and torn down when there is none left to run in.
     */
    setAudioContext(audioContext: AudioContext | undefined): Promise<void>;
    getSenderStats(): Promise<AudioSenderStats | undefined>;
    checkForSilence(): Promise<boolean>;
}
//# sourceMappingURL=LocalAudioTrack.d.ts.map