/**
 * Offline-First Notification & Appointment Alert Sound Engine
 * Works 100% offline without any external network requests by combining:
 * 1. In-memory synthesized 16-bit PCM WAV Data URLs (HTML5 <audio> compatible on Android/iOS)
 * 2. Web Audio API real-time multi-harmonic synthesizer
 * 3. Optional user-uploaded custom audio file stored locally in localStorage
 */

import {
  DEFAULT_REMINDER_MINUTES,
  sanitizeReminderMinutes,
} from '../utils/dateUtils';

export type SoundToneId =
  | 'rasd_chime'
  | 'crystal_bell'
  | 'radar_pulse'
  | 'urgent_siren'
  | 'soft_marimba'
  | 'double_beep'
  | 'custom';

export interface NoteStep {
  freq: number;
  startSec: number;
  durationSec: number;
  gain: number;
  type?: OscillatorType;
  endFreq?: number;
}

export interface SoundToneDefinition {
  id: SoundToneId;
  name: string;
  description: string;
  category: 'notification' | 'urgent' | 'both';
  durationLabel: string;
  notes: NoteStep[];
}

export interface AlertSoundSettings {
  enabled: boolean;
  notificationToneId: SoundToneId;
  urgentToneId: SoundToneId;
  volume: number; // 0.1 to 1.0
  vibrate: boolean;
  repeatUrgentAlarm: boolean;
  defaultReminderMinutes: number; // Manual numeric lead time in minutes (1..1440)
  customAudioDataUrl?: string;
  customAudioName?: string;
}

export interface SystemNotificationOptions {
  tag?: string;
  url?: string;
  appointmentId?: string;
  taxpayerId?: string;
  propertyId?: string;
  isOverdue?: boolean;
  renotify?: boolean;
  requireInteraction?: boolean;
  data?: Record<string, unknown>;
}

const STORAGE_KEY = 'rasd_alert_sound_settings_v1';
const USER_REMINDER_PREFIX = 'rasd_user_reminder_mins_';

export const BUILTIN_SOUND_TONES: SoundToneDefinition[] = [
  {
    id: 'rasd_chime',
    name: 'رَصْد الكلاسيكية',
    description: 'نغمة رسمية ثلاثية متناغمة وواضحة للإشعارات والمواعيد',
    category: 'both',
    durationLabel: '0.8 ثانية',
    notes: [
      { freq: 587.33, startSec: 0.0, durationSec: 0.28, gain: 0.55, type: 'sine' }, // D5
      { freq: 880.0, startSec: 0.14, durationSec: 0.32, gain: 0.65, type: 'sine' }, // A5
      { freq: 1174.66, startSec: 0.3, durationSec: 0.45, gain: 0.75, type: 'sine' }, // D6
    ],
  },
  {
    id: 'crystal_bell',
    name: 'جرس كريستال نقي',
    description: 'رنين جرس واضح بترددات عالية يسهل سماعه في الميدان',
    category: 'both',
    durationLabel: '1.0 ثانية',
    notes: [
      { freq: 1046.5, startSec: 0.0, durationSec: 0.45, gain: 0.7, type: 'sine' }, // C6
      { freq: 2093.0, startSec: 0.0, durationSec: 0.25, gain: 0.3, type: 'triangle' }, // Harmonic
      { freq: 1318.51, startSec: 0.22, durationSec: 0.65, gain: 0.75, type: 'sine' }, // E6
      { freq: 2637.02, startSec: 0.22, durationSec: 0.35, gain: 0.3, type: 'triangle' }, // Harmonic
    ],
  },
  {
    id: 'radar_pulse',
    name: 'نبض الرادار الميداني',
    description: 'نغمة تقنية متتابعة عالية الوضوح للميدان والأماكن المفتوحة',
    category: 'both',
    durationLabel: '0.9 ثانية',
    notes: [
      { freq: 783.99, startSec: 0.0, durationSec: 0.14, gain: 0.65, type: 'triangle' }, // G5
      { freq: 783.99, startSec: 0.18, durationSec: 0.14, gain: 0.65, type: 'triangle' }, // G5
      { freq: 1046.5, startSec: 0.38, durationSec: 0.2, gain: 0.75, type: 'triangle' }, // C6
      { freq: 1567.98, startSec: 0.6, durationSec: 0.28, gain: 0.8, type: 'sine' }, // G6
    ],
  },
  {
    id: 'urgent_siren',
    name: 'نداء الموعد العاجل',
    description: 'تنبيه قوي متصاعد مخصص للمواعيد المستحقة والمتأخرة',
    category: 'urgent',
    durationLabel: '1.2 ثانية',
    notes: [
      { freq: 659.25, endFreq: 987.77, startSec: 0.0, durationSec: 0.32, gain: 0.8, type: 'sawtooth' },
      { freq: 659.25, endFreq: 987.77, startSec: 0.36, durationSec: 0.32, gain: 0.85, type: 'sawtooth' },
      { freq: 880.0, endFreq: 1318.51, startSec: 0.72, durationSec: 0.42, gain: 0.9, type: 'triangle' },
    ],
  },
  {
    id: 'soft_marimba',
    name: 'ماريمبا هادئة',
    description: 'نغمة دافئة وخفيفة للإشعارات العامة والتحديثات',
    category: 'notification',
    durationLabel: '0.7 ثانية',
    notes: [
      { freq: 523.25, startSec: 0.0, durationSec: 0.18, gain: 0.6, type: 'sine' }, // C5
      { freq: 659.25, startSec: 0.13, durationSec: 0.2, gain: 0.65, type: 'sine' }, // E5
      { freq: 783.99, startSec: 0.26, durationSec: 0.22, gain: 0.7, type: 'sine' }, // G5
      { freq: 1046.5, startSec: 0.4, durationSec: 0.3, gain: 0.75, type: 'sine' }, // C6
    ],
  },
  {
    id: 'double_beep',
    name: 'صافرة لاسلكي مزدوجة',
    description: 'نغمة تنبيه سريعة وحاسمة شبيهة بأجهزة الاتصال الميدانية',
    category: 'both',
    durationLabel: '0.6 ثانية',
    notes: [
      { freq: 1200, startSec: 0.0, durationSec: 0.12, gain: 0.75, type: 'square' },
      { freq: 1200, startSec: 0.18, durationSec: 0.12, gain: 0.75, type: 'square' },
      { freq: 1600, startSec: 0.36, durationSec: 0.22, gain: 0.85, type: 'triangle' },
    ],
  },
];

const DEFAULT_SETTINGS: AlertSoundSettings = {
  enabled: true,
  notificationToneId: 'rasd_chime',
  urgentToneId: 'crystal_bell',
  volume: 0.85,
  vibrate: true,
  repeatUrgentAlarm: true,
  defaultReminderMinutes: DEFAULT_REMINDER_MINUTES,
};

/**
 * Synthesizes a 16-bit mono PCM WAV Data URL in memory for 100% offline HTML5 <audio> playback.
 */
function synthesizeWavDataUrl(notes: NoteStep[], masterVolume: number): string {
  const sampleRate = 22050;
  const totalDuration = Math.max(...notes.map((n) => n.startSec + n.durationSec), 0.5) + 0.08;
  const numSamples = Math.floor(sampleRate * totalDuration);
  const samples = new Float32Array(numSamples);

  for (const note of notes) {
    const startSample = Math.floor(note.startSec * sampleRate);
    const lengthSamples = Math.floor(note.durationSec * sampleRate);
    const attackSamples = Math.min(Math.floor(0.012 * sampleRate), Math.floor(lengthSamples * 0.2));

    let phase = 0;
    for (let i = 0; i < lengthSamples; i++) {
      const idx = startSample + i;
      if (idx >= numSamples) break;

      const progress = i / lengthSamples;
      const currentFreq = note.endFreq
        ? note.freq + (note.endFreq - note.freq) * progress
        : note.freq;

      phase += (2 * Math.PI * currentFreq) / sampleRate;

      let rawWave = Math.sin(phase);
      if (note.type === 'triangle') {
        rawWave = (2 / Math.PI) * Math.asin(Math.sin(phase));
      } else if (note.type === 'square') {
        rawWave = Math.sin(phase) >= 0 ? 0.7 : -0.7;
      } else if (note.type === 'sawtooth') {
        rawWave = 0.6 * Math.sin(phase) + 0.3 * Math.sin(2 * phase) + 0.1 * Math.sin(3 * phase);
      } else {
        // Richer sine with subtle overtone
        rawWave = 0.85 * Math.sin(phase) + 0.15 * Math.sin(2 * phase);
      }

      // Smooth attack + exponential decay envelope
      const attackEnv = i < attackSamples ? i / Math.max(1, attackSamples) : 1.0;
      const decayEnv = Math.pow(1 - progress, 1.6);
      const env = attackEnv * decayEnv;

      samples[idx] += rawWave * note.gain * masterVolume * env;
    }
  }

  // Encode 16-bit PCM WAV header + data
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
  view.setUint16(22, 1, true); // NumChannels (1 = mono)
  view.setUint32(24, sampleRate, true); // SampleRate
  view.setUint32(28, sampleRate * 2, true); // ByteRate
  view.setUint16(32, 2, true); // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample
  writeString(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }

  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return `data:audio/wav;base64,${window.btoa(binary)}`;
}

class AlertSoundService {
  private audioCtx: AudioContext | null = null;
  private wavCache: Map<string, string> = new Map();
  private settings: AlertSoundSettings = DEFAULT_SETTINGS;
  private listeners: Set<(settings: AlertSoundSettings) => void> = new Set();
  private unlocked = false;
  private activeUserId: string | null = null;

  constructor() {
    this.loadSettings();
    this.setupAutoUnlock();
    this.setupServiceWorkerSoundBridge();
  }

  private loadSettings() {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<AlertSoundSettings> & { reminderMinutesBefore?: number };
        const migratedMinutes = sanitizeReminderMinutes(
          parsed.defaultReminderMinutes ?? parsed.reminderMinutesBefore,
          DEFAULT_REMINDER_MINUTES
        );
        this.settings = {
          ...DEFAULT_SETTINGS,
          ...parsed,
          volume: typeof parsed.volume === 'number' ? Math.max(0.05, Math.min(1, parsed.volume)) : DEFAULT_SETTINGS.volume,
          defaultReminderMinutes: migratedMinutes,
        };
      }
    } catch {
      this.settings = DEFAULT_SETTINGS;
    }
  }

  private saveSettings() {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
      if (this.activeUserId) {
        localStorage.setItem(
          `${USER_REMINDER_PREFIX}${this.activeUserId}`,
          String(this.settings.defaultReminderMinutes)
        );
      }
    } catch (e) {
      console.warn('Could not persist sound settings in localStorage:', e);
    }
    this.listeners.forEach((listener) => listener(this.settings));
  }

  public getSettings(): AlertSoundSettings {
    return { ...this.settings };
  }

  public getDefaultReminderMinutes(): number {
    return sanitizeReminderMinutes(this.settings.defaultReminderMinutes, DEFAULT_REMINDER_MINUTES);
  }

  public setDefaultReminderMinutes(minutes: number, userId?: string): number {
    const clean = sanitizeReminderMinutes(minutes, this.getDefaultReminderMinutes());
    if (userId) {
      this.activeUserId = userId;
    }
    this.updateSettings({ defaultReminderMinutes: clean });
    return clean;
  }

  /**
   * Restores or syncs user-specific reminder preference upon login so it persists across sessions.
   */
  public syncUserReminderPreference(userId: string | null | undefined) {
    if (typeof window === 'undefined' || !userId) {
      this.activeUserId = null;
      return;
    }
    this.activeUserId = userId;
    try {
      const userStored = localStorage.getItem(`${USER_REMINDER_PREFIX}${userId}`);
      if (userStored) {
        const clean = sanitizeReminderMinutes(userStored, this.settings.defaultReminderMinutes);
        if (clean !== this.settings.defaultReminderMinutes) {
          this.settings = {
            ...this.settings,
            defaultReminderMinutes: clean,
          };
          this.saveSettings();
        }
      } else {
        localStorage.setItem(
          `${USER_REMINDER_PREFIX}${userId}`,
          String(this.settings.defaultReminderMinutes)
        );
      }
    } catch {
      // ignore storage errors
    }
  }

  public updateSettings(partial: Partial<AlertSoundSettings>): AlertSoundSettings {
    const nextReminder =
      partial.defaultReminderMinutes !== undefined
        ? sanitizeReminderMinutes(partial.defaultReminderMinutes, this.settings.defaultReminderMinutes)
        : this.settings.defaultReminderMinutes;

    this.settings = {
      ...this.settings,
      ...partial,
      defaultReminderMinutes: nextReminder,
    };
    this.saveSettings();
    return this.getSettings();
  }

  public subscribe(listener: (settings: AlertSoundSettings) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Listens for Service Worker push messages so the user's chosen sound plays when a push notification arrives.
   */
  private setupServiceWorkerSoundBridge() {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.addEventListener('message', (event) => {
      const msg = event.data;
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'RASD_PUSH_RECEIVED') {
        const isOverdue = Boolean(msg.payload?.data?.isOverdue || msg.payload?.isOverdue);
        if (isOverdue) {
          this.playOverdueWarning();
        } else {
          this.playAppointmentChime();
        }
      }
    });
  }

  /**
   * Unlocks Web Audio API on the first user gesture so background/timer alerts play reliably on mobile.
   */
  private setupAutoUnlock() {
    if (typeof window === 'undefined') return;
    const unlock = () => {
      if (this.unlocked) return;
      const ctx = this.getContext();
      if (ctx) {
        if (ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }
        try {
          const buffer = ctx.createBuffer(1, 1, 22050);
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(ctx.destination);
          source.start(0);
          this.unlocked = true;
        } catch {
          // ignore
        }
      }
    };

    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('touchstart', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
  }

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.audioCtx) {
      const AudioContextClass =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  /**
   * Plays any tone by ID (works 100% offline using Web Audio + synthesized WAV fallback).
   */
  public playTone(toneId: SoundToneId, customVolume?: number, forcePlayEvenIfMuted = false) {
    if (!forcePlayEvenIfMuted && !this.settings.enabled) return;

    const volume = typeof customVolume === 'number' ? customVolume : this.settings.volume;

    if (this.settings.vibrate && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(toneId === 'urgent_siren' ? [220, 100, 220, 100, 300] : [160, 80, 160]);
      } catch {
        // ignore vibration errors on unsupported devices
      }
    }

    // Handle user's custom uploaded offline audio
    if (toneId === 'custom' && this.settings.customAudioDataUrl) {
      this.playDataUrlAudio(this.settings.customAudioDataUrl, volume);
      return;
    }

    const definition =
      BUILTIN_SOUND_TONES.find((t) => t.id === toneId) || BUILTIN_SOUND_TONES[0];

    // Primary playback: HTML5 Audio with synthesized offline WAV Data URL (reliable on mobile speaker channels)
    try {
      const cacheKey = `${definition.id}_${Math.round(volume * 100)}`;
      let wavUrl = this.wavCache.get(cacheKey);
      if (!wavUrl) {
        wavUrl = synthesizeWavDataUrl(definition.notes, volume);
        this.wavCache.set(cacheKey, wavUrl);
      }
      const audio = new Audio(wavUrl);
      audio.volume = Math.max(0.05, Math.min(1, volume));
      const playPromise = audio.play();
      if (playPromise) {
        playPromise.catch(() => {
          // Fallback to Web Audio API oscillator synthesis if HTMLAudioElement is blocked
          this.playViaWebAudio(definition.notes, volume);
        });
      }
    } catch {
      this.playViaWebAudio(definition.notes, volume);
    }
  }

  private playDataUrlAudio(dataUrl: string, volume: number) {
    try {
      const audio = new Audio(dataUrl);
      audio.volume = Math.max(0.05, Math.min(1, volume));
      audio.play().catch(() => {
        // Fallback to default chime if custom audio fails
        this.playViaWebAudio(BUILTIN_SOUND_TONES[0].notes, volume);
      });
    } catch {
      this.playViaWebAudio(BUILTIN_SOUND_TONES[0].notes, volume);
    }
  }

  private playViaWebAudio(notes: NoteStep[], masterVolume: number) {
    try {
      const ctx = this.getContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      for (const note of notes) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = note.type || 'sine';
        osc.frequency.setValueAtTime(note.freq, now + note.startSec);
        if (note.endFreq) {
          osc.frequency.linearRampToValueAtTime(note.endFreq, now + note.startSec + note.durationSec);
        }

        const peakGain = Math.max(0.01, Math.min(1, note.gain * masterVolume * 0.5));
        gain.gain.setValueAtTime(0.001, now + note.startSec);
        gain.gain.linearRampToValueAtTime(peakGain, now + note.startSec + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0008, now + note.startSec + note.durationSec);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + note.startSec);
        osc.stop(now + note.startSec + note.durationSec + 0.02);
      }
    } catch (e) {
      console.warn('Web Audio synthesis fallback failed:', e);
    }
  }

  /**
   * Plays the user's configured general notification sound.
   */
  public playNotificationSound() {
    this.playTone(this.settings.notificationToneId);
  }

  /**
   * Plays the user's configured appointment chime.
   */
  public playAppointmentChime() {
    this.playTone(this.settings.notificationToneId);
  }

  /**
   * Plays the user's configured urgent/overdue appointment warning sound.
   */
  public playOverdueWarning() {
    this.playTone(this.settings.urgentToneId);
  }

  /**
   * Triggers a local OS / Service Worker notification that works 100% offline when the app is open or backgrounded.
   */
  public async triggerOfflineSystemNotification(
    title: string,
    body: string,
    tagOrOptions?: string | SystemNotificationOptions
  ) {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    const opts: SystemNotificationOptions =
      typeof tagOrOptions === 'string'
        ? { tag: tagOrOptions }
        : tagOrOptions || {};

    const tag = opts.tag || 'rasd-local-alert';
    const targetUrl =
      opts.url ||
      (opts.appointmentId
        ? `/?screen=appointments&appointmentId=${encodeURIComponent(opts.appointmentId)}`
        : '/?screen=appointments');

    const notificationData = {
      url: targetUrl,
      appointmentId: opts.appointmentId,
      taxpayerId: opts.taxpayerId,
      propertyId: opts.propertyId,
      isOverdue: Boolean(opts.isOverdue),
      ...(opts.data || {}),
    };

    const vibratePattern = this.settings.vibrate
      ? opts.isOverdue
        ? [240, 100, 240, 100, 320]
        : [180, 90, 180]
      : undefined;

    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg && 'showNotification' in reg) {
          await reg.showNotification(title, {
            body,
            dir: 'rtl',
            lang: 'ar',
            icon: '/pwa-192x192.png',
            badge: '/icon.svg',
            tag,
            renotify: opts.renotify ?? false,
            vibrate: vibratePattern,
            requireInteraction: opts.requireInteraction ?? true,
            data: notificationData,
            actions: [
              { action: 'open', title: 'فتح الموعد والسجل' },
              { action: 'dismiss', title: 'إغلاق' },
            ],
          } as NotificationOptions);
          return;
        }
      }
      const n = new Notification(title, {
        body,
        dir: 'rtl',
        lang: 'ar',
        icon: '/pwa-192x192.png',
        badge: '/icon.svg',
        tag,
        data: notificationData,
      });
      n.onclick = () => {
        try {
          window.focus();
          window.dispatchEvent(
            new CustomEvent('rasd:notification-click', { detail: notificationData })
          );
        } catch {
          // ignore
        }
        n.close();
      };
    } catch {
      // Ignore if notification creation fails in restricted webviews
    }
  }
}

export const alertSound = new AlertSoundService();
