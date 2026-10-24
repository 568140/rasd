/**
 * @file audioRecorder.ts
 * Dedicated, resilient Audio Recorder service using standard MediaRecorder API.
 * Provides:
 * - Direct microphone capture on Android (Chrome/PWA) and iOS/Desktop
 * - Dynamic MIME type negotiation (audio/webm;codecs=opus, audio/webm, audio/mp4, audio/wav)
 * - Safe Blob chunk collection without dropping audio packets
 * - Real-time audio volume visualizer (0-100) via AudioContext AnalyserNode
 * - Full manual control: Start -> Stop -> Base64 export
 * - Single-instance enforcement (prevents overlapping sessions)
 * - Explicit error reporting for permission denials and device errors
 */

export type RecorderState =
  | 'idle'
  | 'requesting_permission'
  | 'recording'
  | 'stopping'
  | 'recorded'
  | 'error';

export interface AudioRecordingResult {
  blob: Blob;
  mimeType: string;
  durationMs: number;
  base64Audio: string;
  audioUrl: string;
}

export interface RecorderCallbacks {
  onStateChange?: (state: RecorderState) => void;
  onVolumeChange?: (volumePercent: number) => void;
  onDurationChange?: (durationSeconds: number) => void;
  onError?: (errorMessage: string, errorCode?: string) => void;
}

const PREFERRED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/wav',
];

export class AudioRecorder {
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private animationFrameId: number | null = null;
  private timerIntervalId: number | null = null;
  private startTime: number = 0;
  private state: RecorderState = 'idle';
  private callbacks: RecorderCallbacks = {};
  private activeMimeType: string = 'audio/webm';
  private lastResult: AudioRecordingResult | null = null;

  constructor(callbacks?: RecorderCallbacks) {
    if (callbacks) {
      this.callbacks = callbacks;
    }
  }

  public setCallbacks(callbacks: RecorderCallbacks): void {
    this.callbacks = callbacks;
  }

  public getState(): RecorderState {
    return this.state;
  }

  public getLastResult(): AudioRecordingResult | null {
    return this.lastResult;
  }

  public static isSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) &&
      typeof window.MediaRecorder !== 'undefined'
    );
  }

  public static getSupportedMimeType(): string {
    if (typeof window === 'undefined' || typeof window.MediaRecorder === 'undefined') {
      return 'audio/webm';
    }
    for (const mime of PREFERRED_MIME_TYPES) {
      if (MediaRecorder.isTypeSupported(mime)) {
        return mime;
      }
    }
    return '';
  }

  private setState(newState: RecorderState): void {
    this.state = newState;
    this.callbacks.onStateChange?.(newState);
  }

  public async start(): Promise<boolean> {
    if (this.state === 'recording' || this.state === 'requesting_permission') {
      console.warn('AudioRecorder: Recording session is already in progress');
      return false;
    }

    if (!AudioRecorder.isSupported()) {
      const err = 'متصفحك لا يدعم واجهة تسجيل الصوت القياسية (MediaRecorder)';
      this.setState('error');
      this.callbacks.onError?.(err, 'UNSUPPORTED');
      return false;
    }

    this.setState('requesting_permission');
    this.cleanup();
    this.audioChunks = [];
    this.lastResult = null;

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (err: unknown) {
      this.setState('error');
      const errName = err instanceof Error ? err.name : 'UnknownError';
      let message = 'تعذر الوصول إلى الميكروفون';

      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        message = 'تم رفض إذن الوصول إلى الميكروفون. يرجى تفعيل الصلاحية من إعدادات المتصفح.';
      } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
        message = 'لم يتم العثور على ميكروفون متصل بالجهاز.';
      } else if (errName === 'NotReadableError' || errName === 'TrackStartError') {
        message = 'الميكروفون قيد الاستخدام من قبل تطبيق آخر.';
      }

      this.callbacks.onError?.(message, errName);
      return false;
    }

    const mime = AudioRecorder.getSupportedMimeType();
    this.activeMimeType = mime || 'audio/webm';

    try {
      const options: MediaRecorderOptions = mime ? { mimeType: mime } : {};
      this.mediaRecorder = new MediaRecorder(this.mediaStream, options);
    } catch {
      try {
        this.mediaRecorder = new MediaRecorder(this.mediaStream);
        this.activeMimeType = this.mediaRecorder.mimeType || 'audio/webm';
      } catch (recErr) {
        this.setState('error');
        this.cleanup();
        this.callbacks.onError?.(
          'تعذر إنشاء مسجل الصوت في المتصفح',
          recErr instanceof Error ? recErr.name : 'RECORDER_INIT_FAILED'
        );
        return false;
      }
    }

    this.mediaRecorder.ondataavailable = (event: BlobEvent) => {
      if (event.data && event.data.size > 0) {
        this.audioChunks.push(event.data);
      }
    };

    // Setup AudioContext for real-time volume analysis
    this.setupVolumeAnalyser(this.mediaStream);

    this.startTime = Date.now();
    // Request data in chunks every 250ms to ensure no audio is lost during sudden pauses
    this.mediaRecorder.start(250);
    this.setState('recording');

    // Start timer for duration feedback
    this.timerIntervalId = window.setInterval(() => {
      if (this.state === 'recording') {
        const elapsedSec = Math.floor((Date.now() - this.startTime) / 1000);
        this.callbacks.onDurationChange?.(elapsedSec);
      }
    }, 500);

    return true;
  }

  public async stop(): Promise<AudioRecordingResult | null> {
    if (this.state !== 'recording' || !this.mediaRecorder) {
      return null;
    }

    this.setState('stopping');

    if (this.timerIntervalId !== null) {
      clearInterval(this.timerIntervalId);
      this.timerIntervalId = null;
    }

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.callbacks.onVolumeChange?.(0);

    return new Promise((resolve) => {
      if (!this.mediaRecorder) {
        this.setState('idle');
        resolve(null);
        return;
      }

      this.mediaRecorder.onstop = async () => {
        const durationMs = Math.max(200, Date.now() - this.startTime);
        const finalBlob = new Blob(this.audioChunks, {
          type: this.activeMimeType,
        });

        // Release hardware mic stream immediately
        if (this.mediaStream) {
          this.mediaStream.getTracks().forEach((track) => track.stop());
          this.mediaStream = null;
        }

        if (finalBlob.size === 0) {
          this.setState('idle');
          this.callbacks.onError?.('التسجيل فارغ ولم يتم التقاط أي صوت', 'EMPTY_RECORDING');
          resolve(null);
          return;
        }

        try {
          const base64Audio = await AudioRecorder.blobToBase64(finalBlob);
          const audioUrl = URL.createObjectURL(finalBlob);

          const result: AudioRecordingResult = {
            blob: finalBlob,
            mimeType: this.activeMimeType,
            durationMs,
            base64Audio,
            audioUrl,
          };

          this.lastResult = result;
          this.setState('recorded');
          resolve(result);
        } catch {
          this.setState('error');
          this.callbacks.onError?.('فشل تحويل البيانات الصوتية إلى صيغة قابلة للإرسال', 'CONVERSION_FAILED');
          resolve(null);
        }
      };

      try {
        if (this.mediaRecorder.state !== 'inactive') {
          this.mediaRecorder.stop();
        }
      } catch {
        this.setState('idle');
        resolve(null);
      }
    });
  }

  public cancel(): void {
    this.cleanup();
    this.audioChunks = [];
    this.lastResult = null;
    this.setState('idle');
    this.callbacks.onVolumeChange?.(0);
    this.callbacks.onDurationChange?.(0);
  }

  private setupVolumeAnalyser(stream: MediaStream): void {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      this.audioContext = new AudioCtx();
      const source = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.8;
      source.connect(this.analyser);

      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const checkVolume = () => {
        if (this.state !== 'recording' || !this.analyser) return;

        this.analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;
        const volumePercent = Math.min(100, Math.round((average / 128) * 100));

        this.callbacks.onVolumeChange?.(volumePercent);
        this.animationFrameId = requestAnimationFrame(checkVolume);
      };

      this.animationFrameId = requestAnimationFrame(checkVolume);
    } catch {
      // Audio analysis is optional, recording continues regardless
    }
  }

  private cleanup(): void {
    if (this.timerIntervalId !== null) {
      clearInterval(this.timerIntervalId);
      this.timerIntervalId = null;
    }

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch {
        // ignore
      }
    }
    this.mediaRecorder = null;

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext) {
      try {
        void this.audioContext.close();
      } catch {
        // ignore
      }
      this.audioContext = null;
      this.analyser = null;
    }
  }

  public static blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const res = reader.result as string;
        // Strip data:audio/xyz;base64, prefix
        const base64 = res.split(',')[1] || '';
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}
