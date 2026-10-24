import React, { useEffect, useState, useRef } from 'react';
import { Clock, ExternalLink, X, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { useRasd } from '../context/RasdContext';
import { Appointment } from '../types/rasd';
import {
  evaluateAppointmentStatus,
  getMinutesUntilAden,
  getAdenTodayString,
} from '../utils/dateUtils';
import { alertSound } from '../services/alertSound';

export const ActiveAlertBanner: React.FC = () => {
  const { appointments, notifications, setActiveScreen, postponeAppointment, showToast } = useRasd();

  const [activeAlert, setActiveAlert] = useState<Appointment | null>(null);
  const [isBannerMuted, setIsBannerMuted] = useState(false);
  const dismissedApptIds = useRef<Set<string>>(new Set());
  const soundPlayedIds = useRef<Set<string>>(new Set());
  const seenNotificationIds = useRef<Set<string>>(new Set());
  const initialNotifsLoaded = useRef<boolean>(false);

  // Play notification sound when a new unread notification arrives (works offline & online)
  useEffect(() => {
    if (!initialNotifsLoaded.current) {
      notifications.forEach((n) => seenNotificationIds.current.add(n.id));
      if (notifications.length > 0) {
        initialNotifsLoaded.current = true;
      }
      return;
    }

    let hasNewUnread = false;
    for (const n of notifications) {
      if (!seenNotificationIds.current.has(n.id)) {
        seenNotificationIds.current.add(n.id);
        if (!n.isRead) {
          hasNewUnread = true;
        }
      }
    }

    if (hasNewUnread) {
      alertSound.playNotificationSound();
    }
  }, [notifications]);

  // Check appointments on mount, on focus, on visibilitychange, and every 15 seconds
  useEffect(() => {
    const checkDue = () => {
      const todayStr = getAdenTodayString();

      // Find first appointment that is due or upcoming within its configured reminderMinutesBefore window
      const due = appointments.find((a) => {
        if (a.status === 'completed' || a.status === 'cancelled') return false;
        if (dismissedApptIds.current.has(a.id)) return false;

        const reminderWindow = a.reminderMinutesBefore || 15;
        const state = evaluateAppointmentStatus(a.status, a.scheduledDate, a.scheduledTime, reminderWindow);
        if (state === 'due') return true;

        if (a.scheduledDate === todayStr) {
          const diff = getMinutesUntilAden(a.scheduledDate, a.scheduledTime);
          return diff <= reminderWindow && diff >= -120;
        }

        return false;
      });

      if (due) {
        setActiveAlert(due);
        if (!soundPlayedIds.current.has(due.id)) {
          soundPlayedIds.current.add(due.id);
          setIsBannerMuted(false);
          const diff = getMinutesUntilAden(due.scheduledDate, due.scheduledTime);
          if (diff <= 0) {
            alertSound.playOverdueWarning();
          } else {
            alertSound.playAppointmentChime();
          }
          alertSound.triggerOfflineSystemNotification(
            `موعد ميداني مستحق: ${due.title}`,
            `${due.propertyTitle} — المكلف: ${due.taxpayerName} (${due.scheduledTime})`,
            `rasd-appt-${due.id}`
          );
        }
      } else {
        setActiveAlert(null);
      }
    };

    checkDue();

    const interval = setInterval(checkDue, 15000);
    const handleFocus = () => checkDue();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkDue();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [appointments]);

  // Repeat urgent alarm every 12 seconds while banner is active and unmuted
  useEffect(() => {
    if (!activeAlert || isBannerMuted) return;
    const settings = alertSound.getSettings();
    if (!settings.enabled || !settings.repeatUrgentAlarm) return;

    const repeatTimer = setInterval(() => {
      const currentSettings = alertSound.getSettings();
      if (!currentSettings.enabled || !currentSettings.repeatUrgentAlarm) return;
      const diff = getMinutesUntilAden(activeAlert.scheduledDate, activeAlert.scheduledTime);
      if (diff <= 0) {
        alertSound.playOverdueWarning();
      } else {
        alertSound.playAppointmentChime();
      }
    }, 12000);

    return () => clearInterval(repeatTimer);
  }, [activeAlert, isBannerMuted]);

  if (!activeAlert) return null;

  const diffMin = getMinutesUntilAden(activeAlert.scheduledDate, activeAlert.scheduledTime);
  const isOverdue = diffMin < 0;

  const handleDismiss = () => {
    dismissedApptIds.current.add(activeAlert.id);
    setActiveAlert(null);
  };

  const handleOpenAppointment = () => {
    handleDismiss();
    setActiveScreen('appointments');
  };

  const handleSnooze = async () => {
    const [hStr, mStr] = activeAlert.scheduledTime.split(':');
    let h = parseInt(hStr || '10', 10);
    let m = parseInt(mStr || '00', 10) + 15;
    if (m >= 60) {
      h = (h + 1) % 24;
      m = m - 60;
    }
    const newTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    handleDismiss();
    await postponeAppointment(activeAlert, activeAlert.scheduledDate, newTime, 'تأجيل 15 دقيقة من التنبيه العائم');
    showToast(`تم تأجيل الموعد إلى ${newTime}`, 'success');
  };

  return (
    <div className="fixed top-18 left-4 right-4 z-40 max-w-lg mx-auto animate-in slide-in-from-top-4 duration-300 pointer-events-auto" dir="rtl">
      <div className="p-3.5 sm:p-4 rounded-3xl bg-gradient-to-l from-[#0B192C] to-[#132A46] text-white shadow-xl border border-sky-500/30 flex flex-col gap-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-300 flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4 animate-pulse" />
            </div>
            <div>
              <div className="text-xs font-bold font-display text-white">
                تنبيه موعد مستحق الآن!
              </div>
              <div className="text-[11px] text-sky-200">
                {activeAlert.title}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-amber-400 text-[#0B192C] whitespace-nowrap">
              {isOverdue ? `متأخر ${Math.abs(diffMin)} د` : `متبقي ${diffMin} د`}
            </span>
            <button
              type="button"
              onClick={() => {
                if (isBannerMuted) {
                  setIsBannerMuted(false);
                  alertSound.playOverdueWarning();
                } else {
                  setIsBannerMuted(true);
                }
              }}
              className="p-1.5 rounded-lg text-sky-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title={isBannerMuted ? 'إعادة تشغيل صوت التنبيه' : 'كتم صوت هذا التنبيه'}
            >
              {isBannerMuted ? <VolumeX className="w-4 h-4 text-rose-300" /> : <Volume2 className="w-4 h-4 text-teal-300" />}
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="p-1 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              aria-label="إغلاق التنبيه"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="text-[11px] text-slate-300 flex items-center gap-3">
          <span>الساعة: {activeAlert.scheduledTime} (بتوقيت عدن)</span>
          {activeAlert.propertyTitle && (
            <>
              <span>·</span>
              <span className="truncate">{activeAlert.propertyTitle}</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 pt-1 border-t border-white/10">
          <button
            type="button"
            onClick={handleOpenAppointment}
            className="flex-1 min-h-[32px] px-3 rounded-xl bg-[#0D9488] hover:bg-teal-600 text-white text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>عرض تفاصيل الموعد</span>
          </button>
          <button
            type="button"
            onClick={handleSnooze}
            className="min-h-[32px] px-3 rounded-xl bg-white/15 hover:bg-white/25 text-white text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>تأجيل 15 دقيقة</span>
          </button>
        </div>
      </div>
    </div>
  );
};
