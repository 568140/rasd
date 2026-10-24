import React, { useState, useEffect, useRef } from 'react';
import {
  Volume2,
  VolumeX,
  BellRing,
  Check,
  Play,
  Upload,
  Trash2,
  Smartphone,
  Repeat,
  WifiOff,
  Sparkles,
  Clock,
  AlertCircle,
} from 'lucide-react';
import {
  alertSound,
  AlertSoundSettings,
  BUILTIN_SOUND_TONES,
  SoundToneId,
} from '../services/alertSound';
import {
  MIN_REMINDER_MINUTES,
  MAX_REMINDER_MINUTES,
  validateReminderMinutesInput,
  buildAppointmentNotificationPayload,
  getAdenTodayString,
  getAdenTimeString,
} from '../utils/dateUtils';

interface SoundSettingsPanelProps {
  compact?: boolean;
  onShowToast?: (text: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
}

const QUICK_REMINDER_PRESETS = [5, 15, 20, 30, 45, 60, 75, 120];

export const SoundSettingsPanel: React.FC<SoundSettingsPanelProps> = ({
  compact = false,
  onShowToast,
}) => {
  const [settings, setSettings] = useState<AlertSoundSettings>(() => alertSound.getSettings());
  const [targetType, setTargetType] = useState<'notification' | 'urgent'>('notification');
  const [playingToneId, setPlayingToneId] = useState<string | null>(null);
  const [reminderInputText, setReminderInputText] = useState<string>(() =>
    String(alertSound.getDefaultReminderMinutes())
  );
  const [reminderError, setReminderError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return alertSound.subscribe((updated) => {
      setSettings({ ...updated });
      setReminderInputText(String(updated.defaultReminderMinutes));
    });
  }, []);

  const handleReminderInputChange = (rawVal: string) => {
    setReminderInputText(rawVal);
    const check = validateReminderMinutesInput(rawVal);
    if (!check.isValid) {
      setReminderError(check.error || 'قيمة غير صالحة');
      return;
    }
    setReminderError(null);
    alertSound.setDefaultReminderMinutes(check.minutes);
  };

  const handleReminderInputBlur = () => {
    const check = validateReminderMinutesInput(reminderInputText);
    if (!check.isValid) {
      const fallback = alertSound.getDefaultReminderMinutes();
      setReminderInputText(String(fallback));
      setReminderError(null);
      onShowToast?.(
        check.error || `تم الإبقاء على القيمة المحفوظة (${fallback} دقيقة)`,
        'warning'
      );
      return;
    }
    setReminderError(null);
    alertSound.setDefaultReminderMinutes(check.minutes);
    onShowToast?.(`تم حفظ وقت التنبيه المسبق: قبل الموعد بـ ${check.minutes} دقيقة`, 'info');
  };

  const handlePreview = (toneId: SoundToneId) => {
    setPlayingToneId(`${targetType}_${toneId}`);
    alertSound.playTone(toneId, settings.volume, true);
    setTimeout(() => {
      setPlayingToneId(null);
    }, 900);
  };

  const handleSelectTone = (toneId: SoundToneId) => {
    if (targetType === 'notification') {
      alertSound.updateSettings({ notificationToneId: toneId, enabled: true });
    } else {
      alertSound.updateSettings({ urgentToneId: toneId, enabled: true });
    }
    handlePreview(toneId);
  };

  const handleCustomFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('audio/')) {
      onShowToast?.('يرجى اختيار ملف صوتي صالح (MP3, WAV, OGG, M4A)', 'warning');
      return;
    }

    if (file.size > 1.8 * 1024 * 1024) {
      onShowToast?.('حجم الملف الصوتي كبير جدًا. يرجى اختيار نغمة قصيرة أقل من 1.8 ميجابايت لتخزينها محليًا بدون إنترنت.', 'warning');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) return;
      try {
        alertSound.updateSettings({
          customAudioDataUrl: dataUrl,
          customAudioName: file.name,
          notificationToneId: targetType === 'notification' ? 'custom' : settings.notificationToneId,
          urgentToneId: targetType === 'urgent' ? 'custom' : settings.urgentToneId,
          enabled: true,
        });
        alertSound.playTone('custom', settings.volume, true);
        onShowToast?.(`تم حفظ النغمة «${file.name}» محليًا لتعمل بدون إنترنت`, 'success');
      } catch {
        onShowToast?.('تعذر حفظ النغمة في الذاكرة المحلية، جرب ملفًا أصغر حجمًا.', 'error');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleRemoveCustomAudio = () => {
    alertSound.updateSettings({
      customAudioDataUrl: undefined,
      customAudioName: undefined,
      notificationToneId:
        settings.notificationToneId === 'custom' ? 'rasd_chime' : settings.notificationToneId,
      urgentToneId:
        settings.urgentToneId === 'custom' ? 'crystal_bell' : settings.urgentToneId,
    });
    onShowToast?.('تم حذف النغمة المخصصة والعودة للنغمات المدمجة', 'info');
  };

  const handleFullOfflineTest = async () => {
    alertSound.playTone(
      targetType === 'notification' ? settings.notificationToneId : settings.urgentToneId,
      settings.volume,
      true
    );
    const configuredMins = alertSound.getDefaultReminderMinutes();
    const samplePayload = buildAppointmentNotificationPayload(
      {
        id: 'sample_preview',
        title: 'متابعة التزام ضريبي ومعاينة عقارية',
        taxpayerName: 'أحمد صالح الحمادي',
        propertyTitle: 'عمارة النور التجارية',
        scheduledDate: getAdenTodayString(),
        scheduledTime: getAdenTimeString(),
      },
      targetType === 'urgent' ? -15 : configuredMins
    );

    await alertSound.triggerOfflineSystemNotification(samplePayload.title, samplePayload.body, {
      tag: 'rasd-preview-test',
      url: '/?screen=appointments',
      isOverdue: samplePayload.isOverdue,
      renotify: true,
    });
    onShowToast?.('تم تشغيل النغمة وإرسال نموذج إشعار رسمي للهاتف بنجاح', 'success');
  };

  const activeToneId =
    targetType === 'notification' ? settings.notificationToneId : settings.urgentToneId;

  return (
    <div className="space-y-4" dir="rtl">
      {/* Top Status & Master Toggle */}
      <div className="p-3.5 rounded-2xl bg-gradient-to-l from-teal-50/80 via-sky-50/60 to-slate-50 dark:from-teal-950/35 dark:via-sky-950/25 dark:to-slate-900 border border-teal-200/80 dark:border-teal-900/60 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 transition-colors ${
              settings.enabled
                ? 'bg-[#0D9488] text-white shadow-xs'
                : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
            }`}
          >
            {settings.enabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs sm:text-sm font-bold text-[#0B192C] dark:text-white">
                الأصوات والتنبيهات المحلية
              </span>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-teal-100 dark:bg-teal-950 text-[#0D9488] dark:text-teal-300 inline-flex items-center gap-1">
                <WifiOff className="w-2.5 h-2.5" />
                تعمل بدون إنترنت
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              مولّد صوتي مدمج داخل التطبيق يعمل فورًا دون الحاجة لأي اتصال بالشبكة
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => alertSound.updateSettings({ enabled: !settings.enabled })}
          className={`min-h-[36px] px-3.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
            settings.enabled
              ? 'bg-[#0D9488] hover:bg-teal-700 text-white'
              : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
          }`}
        >
          {settings.enabled ? 'الصوت مفعّل' : 'الصوت مكتوم'}
        </button>
      </div>

      {/* Manual Numeric Input for Alert Lead Time: التنبيه قبل الموعد بـ ... دقيقة */}
      <div className="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200/90 dark:border-slate-800 space-y-2.5 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label
            htmlFor="rasd-default-reminder-minutes"
            className="text-xs sm:text-sm font-bold text-[#0B192C] dark:text-white flex items-center gap-1.5"
          >
            <Clock className="w-4 h-4 text-[#0284C7]" />
            <span>التنبيه قبل الموعد بـ</span>
          </label>

          <div className="flex items-center gap-2">
            <input
              id="rasd-default-reminder-minutes"
              type="number"
              inputMode="numeric"
              min={MIN_REMINDER_MINUTES}
              max={MAX_REMINDER_MINUTES}
              step={1}
              value={reminderInputText}
              onChange={(e) => handleReminderInputChange(e.target.value)}
              onBlur={handleReminderInputBlur}
              placeholder="مثال: 30"
              className={`w-24 min-h-[38px] px-3 rounded-xl bg-[#F4F7FA] dark:bg-slate-950 border text-xs sm:text-sm font-mono font-extrabold text-center focus:outline-none transition-colors ${
                reminderError
                  ? 'border-rose-500 text-rose-600 dark:text-rose-400'
                  : 'border-slate-300 dark:border-slate-700 text-[#0B192C] dark:text-white focus:border-[#0284C7]'
              }`}
            />
            <span className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300">
              دقيقة
            </span>
          </div>
        </div>

        {reminderError ? (
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{reminderError}</span>
          </div>
        ) : (
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            أدخل أي عدد صحيح موجب من <strong>{MIN_REMINDER_MINUTES}</strong> إلى{' '}
            <strong>{MAX_REMINDER_MINUTES}</strong> دقيقة (حتى 24 ساعة). القيمة المحفوظة حاليًا:{' '}
            <strong className="font-mono text-[#0D9488] dark:text-teal-400">
              {settings.defaultReminderMinutes} دقيقة
            </strong>{' '}
            وتُطبّق تلقائيًا على فحص المواعيد والإشعارات المحلية وإشعارات الهاتف.
          </p>
        )}

        {/* Quick-fill helper buttons alongside manual numeric entry */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-[10px] font-semibold text-slate-400 ml-1">اختيار سريع:</span>
          {QUICK_REMINDER_PRESETS.map((preset) => {
            const isActivePreset =
              !reminderError && settings.defaultReminderMinutes === preset;
            return (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  setReminderInputText(String(preset));
                  setReminderError(null);
                  alertSound.setDefaultReminderMinutes(preset);
                  onShowToast?.(`تم ضبط التنبيه قبل الموعد بـ ${preset} دقيقة`, 'info');
                }}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold transition-colors cursor-pointer ${
                  isActivePreset
                    ? 'bg-[#0284C7] text-white'
                    : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                {preset} د
              </button>
            );
          })}
        </div>
      </div>

      {/* Volume Slider & Quick Switches */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800">
          <div className="flex items-center justify-between text-xs font-bold text-[#0B192C] dark:text-white mb-2">
            <span className="flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5 text-[#0284C7]" />
              مستوى صوت التنبيه
            </span>
            <span className="font-mono text-[#0284C7] dark:text-sky-400">
              {Math.round(settings.volume * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={10}
            max={100}
            step={5}
            value={Math.round(settings.volume * 100)}
            onChange={(e) => {
              const v = Number(e.target.value) / 100;
              alertSound.updateSettings({ volume: v, enabled: true });
            }}
            onMouseUp={() => alertSound.playTone(activeToneId, settings.volume, true)}
            onTouchEnd={() => alertSound.playTone(activeToneId, settings.volume, true)}
            className="w-full accent-[#0D9488] cursor-pointer"
          />
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 flex flex-col justify-center gap-2">
          <label className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
            <span className="flex items-center gap-1.5">
              <Smartphone className="w-3.5 h-3.5 text-[#0D9488]" />
              اهتزاز الهاتف مع النغمة
            </span>
            <input
              type="checkbox"
              checked={settings.vibrate}
              onChange={(e) => alertSound.updateSettings({ vibrate: e.target.checked })}
              className="w-4 h-4 accent-[#0D9488] rounded cursor-pointer"
            />
          </label>
          <label className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
            <span className="flex items-center gap-1.5">
              <Repeat className="w-3.5 h-3.5 text-amber-500" />
              تكرار تنبيه الموعد المستحق حتى الإغلاق
            </span>
            <input
              type="checkbox"
              checked={settings.repeatUrgentAlarm}
              onChange={(e) => alertSound.updateSettings({ repeatUrgentAlarm: e.target.checked })}
              className="w-4 h-4 accent-[#0D9488] rounded cursor-pointer"
            />
          </label>
        </div>
      </div>

      {/* Category Selector Tabs: Regular Notification Tone vs Urgent Appointment Tone */}
      <div className="grid grid-cols-2 gap-1.5 p-1.5 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-xs font-bold">
        <button
          type="button"
          onClick={() => setTargetType('notification')}
          className={`py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            targetType === 'notification'
              ? 'bg-white dark:bg-[#0D1829] text-[#0284C7] dark:text-sky-400 shadow-2xs'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <BellRing className="w-3.5 h-3.5" />
          <span>نغمة الإشعارات والتذكير</span>
        </button>
        <button
          type="button"
          onClick={() => setTargetType('urgent')}
          className={`py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            targetType === 'urgent'
              ? 'bg-white dark:bg-[#0D1829] text-rose-600 dark:text-rose-400 shadow-2xs'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>نغمة الموعد المستحق/العاجل</span>
        </button>
      </div>

      {/* Built-in Offline Tones Grid */}
      <div className={`grid grid-cols-1 ${compact ? '' : 'sm:grid-cols-2'} gap-2.5`}>
        {BUILTIN_SOUND_TONES.map((tone) => {
          const isSelected = activeToneId === tone.id;
          const isPlaying = playingToneId === `${targetType}_${tone.id}`;

          return (
            <div
              key={tone.id}
              onClick={() => handleSelectTone(tone.id)}
              className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-2.5 ${
                isSelected
                  ? 'bg-sky-50/80 dark:bg-sky-950/40 border-[#0284C7] dark:border-sky-500 ring-1 ring-[#0284C7]/30'
                  : 'bg-white dark:bg-slate-900/60 border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <div className="flex items-start gap-2.5 min-w-0">
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                    isSelected
                      ? 'bg-[#0284C7] text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {isSelected ? <Check className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-[#0B192C] dark:text-white truncate">
                      {tone.name}
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                      {tone.durationLabel}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                    {tone.description}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handlePreview(tone.id);
                }}
                className={`min-h-[32px] px-2.5 rounded-xl text-[11px] font-bold flex items-center gap-1 shrink-0 transition-colors cursor-pointer ${
                  isPlaying
                    ? 'bg-[#0D9488] text-white'
                    : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200'
                }`}
                title="معاينة النغمة"
              >
                <Play className="w-3 h-3" />
                <span>سماع</span>
              </button>
            </div>
          );
        })}

        {/* Custom Local Audio File Option (Offline) */}
        <div
          onClick={() => {
            if (settings.customAudioDataUrl) {
              handleSelectTone('custom');
            } else {
              fileInputRef.current?.click();
            }
          }}
          className={`p-3 rounded-2xl border border-dashed transition-all cursor-pointer flex items-center justify-between gap-2.5 ${
            activeToneId === 'custom'
              ? 'bg-teal-50/80 dark:bg-teal-950/40 border-[#0D9488] ring-1 ring-[#0D9488]/30'
              : 'bg-slate-50/60 dark:bg-slate-900/40 border-slate-300 dark:border-slate-700 hover:border-[#0D9488]'
          }`}
        >
          <div className="flex items-start gap-2.5 min-w-0">
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                activeToneId === 'custom'
                  ? 'bg-[#0D9488] text-white'
                  : 'bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              {activeToneId === 'custom' ? <Check className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-[#0B192C] dark:text-white truncate">
                {settings.customAudioName ? `نغمة مخصصة: ${settings.customAudioName}` : 'اختيار ملف صوتي من جهازك'}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {settings.customAudioDataUrl
                  ? 'محفوظة محليًا في المتصفح وتعمل بدون إنترنت'
                  : 'ارفع نغمة MP3 أو WAV لحفظها على الهاتف بدون إنترنت'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {settings.customAudioDataUrl && (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePreview('custom');
                  }}
                  className="min-h-[32px] px-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1 cursor-pointer"
                >
                  <Play className="w-3 h-3" />
                  <span>سماع</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveCustomAudio();
                  }}
                  className="p-2 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 cursor-pointer"
                  title="حذف النغمة المخصصة"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              className="min-h-[32px] px-2.5 rounded-xl bg-[#0B192C] dark:bg-[#0D9488] text-white text-[11px] font-bold cursor-pointer"
            >
              {settings.customAudioDataUrl ? 'تغيير' : 'رفع نغمة'}
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={handleCustomFileUpload}
            className="hidden"
          />
        </div>
      </div>

      {/* Bottom Action: Test Offline Notification & Sound */}
      <div className="pt-1 flex justify-end">
        <button
          type="button"
          onClick={handleFullOfflineTest}
          className="w-full sm:w-auto min-h-[40px] px-4 rounded-2xl bg-gradient-to-l from-[#0B192C] to-[#0369A1] hover:opacity-95 text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer shadow-xs transition-all"
        >
          <BellRing className="w-4 h-4 text-teal-300" />
          <span>تجربة صوت وإشعار فوري (بدون إنترنت)</span>
        </button>
      </div>
    </div>
  );
};
