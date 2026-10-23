// Synthesized audio alerts using Web Audio API
import { Ringtone } from '../types';

class SoundService {
  private ctx: AudioContext | null = null;
  private isSoundEnabled = true;
  private ringtone: Ringtone = 'classic';

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public setSoundEnabled(enabled: boolean) {
    this.isSoundEnabled = enabled;
  }

  public getSoundEnabled(): boolean {
    return this.isSoundEnabled;
  }

  public setRingtone(ringtone: Ringtone) {
    this.ringtone = ringtone;
  }

  // Soft modern notification chime (like Slack / Teams modern chime)
  public playNotification() {
    if (!this.isSoundEnabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      
      // First tone (D5)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now);
      
      gain1.gain.setValueAtTime(0, now);
      gain1.gain.linearRampToValueAtTime(0.18, now + 0.03);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.3);

      // Second tone (A5)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880.00, now + 0.08);
      
      gain2.gain.setValueAtTime(0, now + 0.08);
      gain2.gain.linearRampToValueAtTime(0.22, now + 0.11);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.08);
      osc2.stop(now + 0.46);
    } catch (e) {
      console.warn('Audio play failed', e);
    }
  }

  // Subtle pop when sending a message
  public playMessageSent() {
    if (!this.isSoundEnabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.06);

      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.08);
    } catch {
      // ignore
    }
  }

  // Playful bubble sound for reactions
  public playReaction() {
    if (!this.isSoundEnabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.linearRampToValueAtTime(780, now + 0.05);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.13);
    } catch {
      // ignore
    }
  }

  // Call ring tone
  public playRingTone(ringtone = this.ringtone) {
    if (!this.isSoundEnabled) return;
    this.playRingtonePattern(ringtone);
  }

  public previewRingTone(ringtone: Ringtone) {
    this.playRingtonePattern(ringtone);
  }

  private playRingtonePattern(ringtone: Ringtone) {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const patterns: Record<Ringtone, { frequency: number; delay: number; duration: number; volume: number }[]> = {
        classic: [
          { frequency: 440, delay: 0, duration: 0.28, volume: 0.15 },
          { frequency: 440, delay: 0.4, duration: 0.28, volume: 0.15 },
        ],
        chime: [
          { frequency: 659.25, delay: 0, duration: 0.3, volume: 0.14 },
          { frequency: 880, delay: 0.16, duration: 0.42, volume: 0.12 },
        ],
        pulse: [
          { frequency: 523.25, delay: 0, duration: 0.16, volume: 0.13 },
          { frequency: 523.25, delay: 0.28, duration: 0.16, volume: 0.13 },
          { frequency: 523.25, delay: 0.56, duration: 0.16, volume: 0.13 },
        ],
        soft: [
          { frequency: 392, delay: 0, duration: 0.38, volume: 0.1 },
          { frequency: 523.25, delay: 0.3, duration: 0.52, volume: 0.1 },
        ],
      };

      patterns[ringtone].forEach(({ frequency, delay, duration, volume }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(frequency, now + delay);
        gain.gain.setValueAtTime(0, now + delay);
        gain.gain.linearRampToValueAtTime(volume, now + delay + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, now + delay + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + delay);
        osc.stop(now + delay + duration + 0.02);
      });
    } catch {
      // ignore
    }
  }

  // Call ended tone
  public playCallEnd() {
    if (!this.isSoundEnabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.25);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.3);
    } catch {
      // ignore
    }
  }
}

export const sounds = new SoundService();
