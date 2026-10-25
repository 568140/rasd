import React, { useEffect, useState, useRef } from 'react';
import { Clock, ExternalLink, X, RotateCcw, Volume2, VolumeX, Building2 } from 'lucide-react';
import { useRasd } from '../context/RasdContext';
import { Appointment } from '../types/rasd';
import {
  evaluateAppointmentStatus,
  getMinutesUntilAden,
  sanitizeReminderMinutes,
  buildAppointmentNotificationPayload,
  formatTimeTo12Hour,
} from '../utils/dateUtils';
import { alertSound } from '../services/alertSound';
import { pushService } from '../services/pushService';

export const ActiveAlertBanner: React.FC = () => {
  const {
    appointments,
    notifications,
    workspace,
    setActiveScreen,
    setSelectedAppointmentId,
    setSelectedTaxpayerId,
    setSelectedPropertyId,
    postponeAppointment,
    showToast,
  } = useRasd();

  const [activeAlert, setActiveAlert] = useState<Appointment | null>(null);
  const [isBannerMuted, setIsBannerMuted] = useState(false);
  const [defaultReminderMins, setDefaultReminderMins] = useState<number>(() =>
    alertSound.getDefaultReminderMinutes()
  );

  // Keyed by `${apptId}_${scheduledDate}_${scheduledTime}_${stage}` so rescheduling or transitioning from upcoming -> overdue re-alerts cleanly once
  const dismissedStageKeys = useRef<Set<string>>(new Set());
  const notifiedStageKeys = useRef<Set<string>>(new Set());
  const seenNotificationIds = useRef<Set<string>>(new Set());
  const initialNotifsLoaded = useRef<boolean>(false);

  // Subscribe to changes in user's default reminder minutes
  useEffect(() => {
    return alertSound.subscribe((updated) => {
      setDefaultReminderMins(updated.defaultReminderMinutes);
    });
  }, []);

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

  // Check appointments on mount, on setting change, on focus, on visibilitychange, and every 15 seconds
  useEffect(() => {
    const checkDue = () => {
      // Find first appointment that is due within its configured reminderMinutesBefore window
      const due = appointments.find((a) => {
        if (a.status === 'completed' || a.status === 'cancelled') return false;

        const reminderWindow = sanitizeReminderMinutes(
          a.reminderMinutesBefore ?? defaultReminderMins,
          defaultReminderMins
        );
        const state = evaluateAppointmentStatus(
          a.status,
          a.scheduledDate,
          a.scheduledTime,
          reminderWindow
        );
        if (state !== 'due') return false;

        const diff = getMinutesUntilAden(a.scheduledDate, a.scheduledTime);
        const stage = diff < 0 ? 'overdue' : 'upcoming';
        const stageKey = `${a.id}_${a.scheduledDate}_${a.scheduledTime}_${stage}`;

        if (dismissedStageKeys.current.has(stageKey)) return false;
        return true;
      });

      if (due) {
        setActiveAlert(due);
        const diff = getMinutesUntilAden(due.scheduledDate, due.scheduledTime);
        const stage = diff < 0 ? 'overdue' : 'upcoming';
        const stageKey = `${due.id}_${due.scheduledDate}_${due.scheduledTime}_${stage}`;

        if (!notifiedStageKeys.current.has(stageKey)) {
          notifiedStageKeys.current.add(stageKey);
          setIsBannerMuted(false);

          if (diff <= 0) {
            alertSound.playOverdueWarning();
          } else {
            alertSound.playAppointmentChime();
          }

          pushService
            .sendAppointmentAlert(
              {
                id: due.id,
                title: due.title,
                taxpayerName: due.taxpayerName,
                taxpayerId: due.taxpayerId,
                propertyTitle: due.propertyTitle,
                propertyId: due.propertyId,
                scheduledDate: due.scheduledDate,
                scheduledTime: due.scheduledTime,
                locationText: due.locationText,
              },
              diff,
              workspace?.id
            )
            .catch(() => {});
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
  }, [appointments, defaultReminderMins, workspace?.id]);

  // Repeat urgent alarm every 15 seconds while banner is active and unmuted
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
    }, 15000);

    return () => clearInterval(repeatTimer);
  }, [activeAlert, isBannerMuted]);

  if (!activeAlert) return null;

  const diffMin = getMinutesUntilAden(activeAlert.scheduledDate, activeAlert.scheduledTime);
  const formatted = buildAppointmentNotificationPayload(
    {
      id: activeAlert.id,
      title: activeAlert.title,
      taxpayerName: activeAlert.taxpayerName,
      taxpayerId: activeAlert.taxpayerId,
      propertyTitle: activeAlert.propertyTitle,
      propertyId: activeAlert.propertyId,
      scheduledDate: activeAlert.scheduledDate,
      scheduledTime: activeAlert.scheduledTime,
      locationText: activeAlert.locationText,
    },
    diffMin
  );
  const isOverdue = formatted.isOverdue;
  const currentStageKey = `${activeAlert.id}_${activeAlert.scheduledDate}_${activeAlert.scheduledTime}_${
    isOverdue ? 'overdue' : 'upcoming'
  }`;

  const handleDismiss = () => {
    dismissedStageKeys.current.add(currentStageKey);
    setActiveAlert(null);
  };

  const handleOpenAppointment = () => {
    dismissedStageKeys.current.add(currentStageKey);
    setActiveAlert(null);
    setSelectedAppointmentId(activeAlert.id);
    setActiveScreen('appointments');
  };

  const handleOpenTaxpayerDossier = () => {
    dismissedStageKeys.current.add(currentStageKey);
    setActiveAlert(null);
    if (activeAlert.taxpayerId && activeAlert.taxpayerId !== 'general_tp') {
      setSelectedTaxpayerId(activeAlert.taxpayerId);
      if (activeAlert.propertyId && activeAlert.propertyId !== 'general_prop') {
        setSelectedPropertyId(activeAlert.propertyId);
      }
      setActiveScreen('taxpayers');
    } else {
      setSelectedAppointmentId(activeAlert.id);
      setActiveScreen('appointments');
    }
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
    showToast(`تم تأجيل الموعد إلى ${formatTimeTo12Hour(newTime)}`, 'success');
  };

  return (
    <div className="fixed top-18 left-4 right-4 z-40 max-w-lg mx-auto animate-in slide-in-from-top-4 duration-300 pointer-events-auto" dir="rtl">
      <div
        className={`p-3.5 sm:p-4 rounded-3xl text-white shadow-xl border flex flex-col gap-2.5 ${
          isOverdue
            ? 'bg-gradient-to-l from-rose-950 via-[#1E132A] to-[#0B192C] border-rose-500/40'
            : 'bg-gradient-to-l from-[#0B192C] to-[#132A46] border-sky-500/30'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                isOverdue
                  ? 'bg-rose-500/25 text-rose-300'
                  : 'bg-amber-500/20 text-amber-300'
              }`}
            >
              <Clock className="w-4 h-4 animate-pulse" />
            </div>
            <div>
              <div className="text-xs font-extrabold font-display text-white">
                {formatted.title}
              </div>
              <div className="text-[11px] text-sky-200 font-semibold mt-0.5">
                المكلف: {activeAlert.taxpayerName || 'غير محدد'} · {activeAlert.title}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className={`px-2 py-0.5 rounded-lg text-[10px] font-bold whitespace-nowrap ${
                isOverdue
                  ? 'bg-rose-500 text-white'
                  : diffMin === 0
                  ? 'bg-amber-400 text-[#0B192C]'
                  : 'bg-teal-400 text-[#0B192C]'
              }`}
            >
              {isOverdue
                ? `متأخر ${Math.abs(diffMin)} د`
                : diffMin === 0
                ? 'مستحق الآن'
                : `متبقي ${diffMin} د`}
            </span>
            <button
              type="button"
              onClick={() => {
                if (isBannerMuted) {
                  setIsBannerMuted(false);
                  if (isOverdue) {
                    alertSound.playOverdueWarning();
                  } else {
                    alertSound.playAppointmentChime();
                  }
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

        <p className="text-[11px] text-slate-200 leading-relaxed bg-black/20 rounded-2xl px-3 py-2 border border-white/10">
          {formatted.body}
        </p>

        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-white/10">
          <button
            type="button"
            onClick={handleOpenAppointment}
            className="flex-1 min-h-[34px] px-3 rounded-xl bg-[#0D9488] hover:bg-teal-600 text-white text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>فتح الموعد</span>
          </button>
          {activeAlert.taxpayerId && activeAlert.taxpayerId !== 'general_tp' && (
            <button
              type="button"
              onClick={handleOpenTaxpayerDossier}
              className="min-h-[34px] px-3 rounded-xl bg-sky-600/80 hover:bg-sky-600 text-white text-[11px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>سجل المكلف</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleSnooze}
            className="min-h-[34px] px-3 rounded-xl bg-white/15 hover:bg-white/25 text-white text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>تأجيل 15 د</span>
          </button>
        </div>
      </div>
    </div>
  );
};
