import React, { useState, useEffect, useRef } from 'react';
import {
  Volume2,
  BellRing,
  Check,
  Play,
  Upload,
  Trash2,
  Smartphone,
  Sparkles,
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
  onEnablePush?: () => void;
  enablingPush?: boolean;
}

const QUICK_REMINDER_PRESETS = [5, 15, 20, 30, 45, 60, 75, 120];

export const SoundSettingsPanel: React.FC<SoundSettingsPanelProps> = ({
  compact = false,
  onShowToast,
  onEnablePush,
  enablingPush = false,
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
    <div className="space-y-3.5" dir="rtl">
      {/* 1. Master Notification Toggle Card — Matching Reference Image ("تفعيل الإشعارات") */}
      <div className="p-4 rounded-2xl bg-[#FFFEFC] dark:bg-[#22201F] border border-[#E7E1D8] dark:border-[#383431] shadow-[0_2px_10px_rgba(41,39,37,0.03)] space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-extrabold text-[#292725] dark:text-[#F4F1EA]">
              تفعيل الإشعارات
            </div>
            <p className="text-[11px] text-[#77716B] dark:text-[#ACA59C] mt-0.5 leading-relaxed">
              ستصلك تنبيهات المواعيد والالتزامات حتى عند إغلاق التطبيق.
            </p>
          </div>

          {/* Burgundy Switch Toggle */}
          <button
            type="button"
            role="switch"
            aria-checked={settings.enabled}
            onClick={() => alertSound.updateSettings({ enabled: !settings.enabled })}
            className={`relative w-12 h-7 rounded-full transition-colors cursor-pointer shrink-0 p-1 flex items-center ${
              settings.enabled
                ? 'bg-[#743B46] justify-start'
                : 'bg-[#D6CFC5] dark:bg-[#3A3532] justify-end'
            }`}
          >
            <span className="w-5 h-5 rounded-full bg-white shadow-xs transition-transform" />
          </button>
        </div>

        {onEnablePush && (
          <div className="pt-2 border-t border-[#EFECE6] dark:border-[#383431] flex items-center justify-between gap-2">
            <span className="text-[11px] text-[#77716B] dark:text-[#ACA59C] flex items-center gap-1.5">
              <Smartphone className="w-3.5 h-3.5 text-[#743B46] dark:text-[#E5B9C0]" />
              <span>ربط اشتراك إشعارات الهاتف (Web Push)</span>
            </span>
            <button
              type="button"
              onClick={onEnablePush}
              disabled={enablingPush}
              className="min-h-[30px] px-3 rounded-xl bg-[#EFECE6] hover:bg-[#E5DFD5] dark:bg-[#2B2826] text-[#743B46] dark:text-[#E5B9C0] text-[11px] font-bold cursor-pointer transition-colors"
            >
              {enablingPush ? 'جاري التفعيل...' : 'تفعيل على الهاتف'}
            </button>
          </div>
        )}
      </div>

      {/* 2. Manual Numeric Input Card — Matching Reference Image ("التنبيه قبل الموعد بـ [ 30 ] دقيقة") */}
      <div className="p-4 rounded-2xl bg-[#FFFEFC] dark:bg-[#22201F] border border-[#E7E1D8] dark:border-[#383431] shadow-[0_2px_10px_rgba(41,39,37,0.03)] space-y-2.5">
        <label
          htmlFor="rasd-default-reminder-minutes"
          className="block text-sm font-extrabold text-[#292725] dark:text-[#F4F1EA]"
        >
          التنبيه قبل الموعد بـ
        </label>

        <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-[#F7F5F0] dark:bg-[#1B1918] border border-[#E2DBD0] dark:border-[#383431]">
          <span className="text-xs font-bold text-[#77716B] dark:text-[#ACA59C] px-2">
            دقيقة
          </span>
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
            placeholder="30"
            className={`w-28 min-h-[36px] px-3 rounded-lg bg-[#FFFEFC] dark:bg-[#22201F] border text-sm font-mono font-extrabold text-center focus:outline-none transition-colors ${
              reminderError
                ? 'border-[#A64B45] text-[#A64B45]'
                : 'border-[#E7E1D8] dark:border-[#383431] text-[#292725] dark:text-[#F4F1EA] focus:border-[#743B46]'
            }`}
          />
        </div>

        {reminderError ? (
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#A64B45]">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{reminderError}</span>
          </div>
        ) : (
          <p className="text-[11px] text-[#77716B] dark:text-[#ACA59C] leading-relaxed">
            أدخل عدد الدقائق قبل الموعد لإرسال التنبيه (من {MIN_REMINDER_MINUTES} إلى {MAX_REMINDER_MINUTES} دقيقة). القيمة المحفوظة حاليًا:{' '}
            <strong className="font-mono text-[#743B46] dark:text-[#E5B9C0]">
              {settings.defaultReminderMinutes} دقيقة
            </strong>
          </p>
        )}

        {/* Quick-fill helper chips */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-[10px] font-bold text-[#77716B] ml-1">اختيار سريع:</span>
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
                    ? 'bg-[#743B46] text-white'
                    : 'bg-[#F0ECE5] hover:bg-[#E5DFD5] dark:bg-[#2B2826] text-[#5C554E] dark:text-[#D5CFC7]'
                }`}
              >
                {preset} د
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Notification Types & Behavior Toggles — Matching Reference Image ("نوع التنبيهات") */}
      <div className="p-4 rounded-2xl bg-[#FFFEFC] dark:bg-[#22201F] border border-[#E7E1D8] dark:border-[#383431] shadow-[0_2px_10px_rgba(41,39,37,0.03)] space-y-3">
        <div className="text-sm font-extrabold text-[#292725] dark:text-[#F4F1EA]">
          نوع التنبيهات
        </div>

        <div className="divide-y divide-[#EFECE6] dark:divide-[#383431]">
          <div className="py-2.5 flex items-center justify-between gap-3">
            <span className="text-xs font-bold text-[#292725] dark:text-[#F4F1EA]">
              المواعيد القادمة والتذكير المسبق
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={settings.enabled}
              onClick={() => alertSound.updateSettings({ enabled: !settings.enabled })}
              className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer shrink-0 p-0.5 flex items-center ${
                settings.enabled
                  ? 'bg-[#743B46] justify-start'
                  : 'bg-[#D6CFC5] dark:bg-[#3A3532] justify-end'
              }`}
            >
              <span className="w-5 h-5 rounded-full bg-white shadow-xs" />
            </button>
          </div>

          <div className="py-2.5 flex items-center justify-between gap-3">
            <span className="text-xs font-bold text-[#292725] dark:text-[#F4F1EA]">
              المواعيد المتأخرة والتكرار التلقائي
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={settings.repeatUrgentAlarm}
              onClick={() =>
                alertSound.updateSettings({ repeatUrgentAlarm: !settings.repeatUrgentAlarm })
              }
              className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer shrink-0 p-0.5 flex items-center ${
                settings.repeatUrgentAlarm
                  ? 'bg-[#743B46] justify-start'
                  : 'bg-[#D6CFC5] dark:bg-[#3A3532] justify-end'
              }`}
            >
              <span className="w-5 h-5 rounded-full bg-white shadow-xs" />
            </button>
          </div>

          <div className="py-2.5 flex items-center justify-between gap-3">
            <span className="text-xs font-bold text-[#292725] dark:text-[#F4F1EA]">
              التنبيهات العامة واهتزاز الهاتف
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={settings.vibrate}
              onClick={() => alertSound.updateSettings({ vibrate: !settings.vibrate })}
              className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer shrink-0 p-0.5 flex items-center ${
                settings.vibrate
                  ? 'bg-[#743B46] justify-start'
                  : 'bg-[#D6CFC5] dark:bg-[#3A3532] justify-end'
              }`}
            >
              <span className="w-5 h-5 rounded-full bg-white shadow-xs" />
            </button>
          </div>
        </div>
      </div>

      {/* 4. Sound & Tone Selection Card — Matching Reference Image ("الصوت") */}
      <div className="p-4 rounded-2xl bg-[#FFFEFC] dark:bg-[#22201F] border border-[#E7E1D8] dark:border-[#383431] shadow-[0_2px_10px_rgba(41,39,37,0.03)] space-y-3.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-extrabold text-[#292725] dark:text-[#F4F1EA] flex items-center gap-1.5">
            <Volume2 className="w-4 h-4 text-[#743B46] dark:text-[#E5B9C0]" />
            <span>الصوت ومستوى الرنين</span>
          </span>
          <span className="text-xs font-mono font-bold text-[#743B46] dark:text-[#E5B9C0]">
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
          className="w-full accent-[#743B46] cursor-pointer"
        />

        {/* Category Selector Tabs */}
        <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[#EFECE6] dark:bg-[#2B2826] border border-[#E5DEC9] dark:border-[#383431] text-xs font-bold">
          <button
            type="button"
            onClick={() => setTargetType('notification')}
            className={`py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              targetType === 'notification'
                ? 'bg-[#FFFEFC] dark:bg-[#22201F] text-[#743B46] dark:text-[#E5B9C0] shadow-2xs'
                : 'text-[#77716B] hover:text-[#292725]'
            }`}
          >
            <BellRing className="w-3.5 h-3.5" />
            <span>نغمة الإشعارات</span>
          </button>
          <button
            type="button"
            onClick={() => setTargetType('urgent')}
            className={`py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              targetType === 'urgent'
                ? 'bg-[#FFFEFC] dark:bg-[#22201F] text-[#A64B45] dark:text-[#F2A7A2] shadow-2xs'
                : 'text-[#77716B] hover:text-[#292725]'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>نغمة الموعد المستحق</span>
          </button>
        </div>

        {/* Built-in Offline Tones Grid */}
        <div className={`grid grid-cols-1 ${compact ? '' : 'sm:grid-cols-2'} gap-2`}>
          {BUILTIN_SOUND_TONES.map((tone) => {
            const isSelected = activeToneId === tone.id;
            const isPlaying = playingToneId === `${targetType}_${tone.id}`;

            return (
              <div
                key={tone.id}
                onClick={() => handleSelectTone(tone.id)}
                className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2.5 ${
                  isSelected
                    ? 'bg-[#F4EFE8] dark:bg-[#2F2527] border-[#743B46] ring-1 ring-[#743B46]/25'
                    : 'bg-[#F7F5F0]/60 dark:bg-[#1B1918] border-[#E7E1D8] dark:border-[#383431] hover:border-[#743B46]/50'
                }`}
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                      isSelected
                        ? 'bg-[#743B46] text-white'
                        : 'bg-[#EFECE6] dark:bg-[#2B2826] text-[#77716B]'
                    }`}
                  >
                    {isSelected ? <Check className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-[#292725] dark:text-[#F4F1EA] truncate">
                        {tone.name}
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#EFECE6] dark:bg-[#2B2826] text-[#77716B]">
                        {tone.durationLabel}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#77716B] dark:text-[#ACA59C] mt-0.5 line-clamp-1">
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
                  className={`min-h-[30px] px-2.5 rounded-lg text-[11px] font-bold flex items-center gap-1 shrink-0 transition-colors cursor-pointer ${
                    isPlaying
                      ? 'bg-[#743B46] text-white'
                      : 'bg-[#EFECE6] hover:bg-[#E5DFD5] dark:bg-[#2B2826] text-[#292725] dark:text-[#F4F1EA]'
                  }`}
                >
                  <Play className="w-3 h-3" />
                  <span>سماع</span>
                </button>
              </div>
            );
          })}

          {/* Custom Local Audio File Option */}
          <div
            onClick={() => {
              if (settings.customAudioDataUrl) {
                handleSelectTone('custom');
              } else {
                fileInputRef.current?.click();
              }
            }}
            className={`p-3 rounded-xl border border-dashed transition-all cursor-pointer flex items-center justify-between gap-2.5 ${
              activeToneId === 'custom'
                ? 'bg-[#F4EFE8] dark:bg-[#2F2527] border-[#743B46]'
                : 'bg-[#F7F5F0]/50 dark:bg-[#1B1918] border-[#D5CFC7] dark:border-[#383431] hover:border-[#743B46]'
            }`}
          >
            <div className="flex items-start gap-2.5 min-w-0">
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                  activeToneId === 'custom'
                    ? 'bg-[#743B46] text-white'
                    : 'bg-[#EFECE6] dark:bg-[#2B2826] text-[#77716B]'
                }`}
              >
                {activeToneId === 'custom' ? <Check className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-[#292725] dark:text-[#F4F1EA] truncate">
                  {settings.customAudioName ? `نغمة مخصصة: ${settings.customAudioName}` : 'اختيار نغمة من الهاتف'}
                </div>
                <p className="text-[11px] text-[#77716B] dark:text-[#ACA59C] mt-0.5">
                  {settings.customAudioDataUrl
                    ? 'محفوظة محليًا وتعمل بدون إنترنت'
                    : 'ارفع ملف صوتي MP3 أو WAV'}
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
                    className="min-h-[30px] px-2.5 rounded-lg bg-[#EFECE6] dark:bg-[#2B2826] text-[11px] font-bold text-[#292725] dark:text-[#F4F1EA] flex items-center gap-1 cursor-pointer"
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
                    className="p-1.5 rounded-lg bg-[#F6E9E7] text-[#A64B45] cursor-pointer"
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
                className="min-h-[30px] px-2.5 rounded-lg bg-[#743B46] text-white text-[11px] font-bold cursor-pointer"
              >
                {settings.customAudioDataUrl ? 'تغيير' : 'رفع'}
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

        {/* Test Notification & Sound CTA */}
        <div className="pt-1">
          <button
            type="button"
            onClick={handleFullOfflineTest}
            className="w-full min-h-[42px] px-4 rounded-xl bg-[#743B46] hover:bg-[#5D2D37] text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer shadow-xs transition-all"
          >
            <BellRing className="w-4 h-4" />
            <span>تجربة صوت وإشعار فوري للهاتف</span>
          </button>
        </div>
      </div>
    </div>
  );
};

