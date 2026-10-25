import React, { useState, useMemo, useEffect } from 'react';
import {
  CalendarClock,
  Plus,
  Bell,
  CheckCircle2,
  RotateCcw,
  AlertTriangle,
  History,
  MapPin,
  Building2,
  Clock,
  X,
  ClipboardCheck,
  Volume2,
  AlertCircle,
} from 'lucide-react';
import { useRasd } from '../context/RasdContext';
import { Appointment } from '../types/rasd';
import {
  evaluateAppointmentStatus,
  getMinutesUntilAden,
  MIN_REMINDER_MINUTES,
  MAX_REMINDER_MINUTES,
  sanitizeReminderMinutes,
  validateReminderMinutesInput,
  buildAppointmentNotificationPayload,
  calculateAlertTimeAden,
} from '../utils/dateUtils';
import { pushService } from '../services/pushService';
import { alertSound } from '../services/alertSound';
import { SoundSettingsPanel } from './SoundSettingsPanel';
import { useLiveAdenClock } from '../hooks/useLiveAdenClock';

export const AppointmentsScreen: React.FC = () => {
  const {
    appointments,
    postponements,
    properties,
    taxpayers,
    members,
    addAppointment,
    postponeAppointment,
    updateAppointmentStatus,
    cancelAppointment,
    setActiveScreen,
    setSelectedTaxpayerId,
    setSelectedPropertyId,
    selectedAppointmentId,
    setSelectedAppointmentId,
    showToast,
  } = useRasd();

  const [tab, setTab] = useState<'today' | 'upcoming' | 'overdue' | 'completed' | 'history'>('today');
  const [showSoundSettings, setShowSoundSettings] = useState(false);
  const [defaultReminderMins, setDefaultReminderMins] = useState<number>(() =>
    alertSound.getDefaultReminderMinutes()
  );

  const liveClock = useLiveAdenClock(1000);
  const todayStr = liveClock.todayStr;

  // Create Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const [scheduledDate, setScheduledDate] = useState(() => liveClock.todayStr);
  const [scheduledTime, setScheduledTime] = useState('10:00');
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [isReminderEnabled, setIsReminderEnabled] = useState(true);
  const [reminderMinutesInput, setReminderMinutesInput] = useState<string>(() =>
    String(alertSound.getDefaultReminderMinutes())
  );
  const [reminderError, setReminderError] = useState<string | null>(null);
  const [assignedOfficerId, setAssignedOfficerId] = useState('');
  const [locationText, setLocationText] = useState('');
  const [notes, setNotes] = useState('');
  const [ignoreConflict, setIgnoreConflict] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Postpone Modal State
  const [postponingAppt, setPostponingAppt] = useState<Appointment | null>(null);
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [postponeReason, setPostponeReason] = useState('');
  const [isPostponeReminderEnabled, setIsPostponeReminderEnabled] = useState(true);
  const [postponeReminderMinutesInput, setPostponeReminderMinutesInput] = useState<string>('');
  const [postponeReminderError, setPostponeReminderError] = useState<string | null>(null);

  // Cancel Modal State
  const [cancellingAppt, setCancellingAppt] = useState<Appointment | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  // Live computed alert previews
  const createAlertPreview = useMemo(() => {
    if (!isReminderEnabled || !scheduledDate || !scheduledTime) return null;
    const num = Number(reminderMinutesInput);
    if (!Number.isFinite(num) || num <= 0) return null;
    return calculateAlertTimeAden(scheduledDate, scheduledTime, num);
  }, [isReminderEnabled, scheduledDate, scheduledTime, reminderMinutesInput]);

  const postponeAlertPreview = useMemo(() => {
    if (!isPostponeReminderEnabled || !newDate || !newTime) return null;
    const num = Number(postponeReminderMinutesInput);
    if (!Number.isFinite(num) || num <= 0) return null;
    return calculateAlertTimeAden(newDate, newTime, num);
  }, [isPostponeReminderEnabled, newDate, newTime, postponeReminderMinutesInput]);

  useEffect(() => {
    return alertSound.subscribe((updated) => {
      setDefaultReminderMins(updated.defaultReminderMinutes);
    });
  }, []);

  // Automatically focus the correct tab and scroll when deep-linked from a notification
  const focusedAppointment = useMemo(
    () => appointments.find((a) => a.id === selectedAppointmentId) || null,
    [appointments, selectedAppointmentId]
  );

  useEffect(() => {
    if (!focusedAppointment) return;
    const diffMins = getMinutesUntilAden(focusedAppointment.scheduledDate, focusedAppointment.scheduledTime, liveClock.now);

    if (focusedAppointment.status === 'completed' || focusedAppointment.status === 'cancelled') {
      setTab('completed');
    } else if (diffMins < 0 || focusedAppointment.scheduledDate < todayStr) {
      setTab('overdue');
    } else if (focusedAppointment.scheduledDate === todayStr) {
      setTab('today');
    } else {
      setTab('upcoming');
    }

    const timer = setTimeout(() => {
      const el = document.getElementById(`rasd-appt-card-${focusedAppointment.id}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [focusedAppointment, defaultReminderMins, todayStr]);

  // Conflict Detection
  const conflictingAppointments = useMemo(() => {
    if (!scheduledDate) return [];
    return appointments.filter(
      (a) =>
        a.status !== 'cancelled' &&
        a.scheduledDate === scheduledDate &&
        (a.scheduledTime === scheduledTime || (propertyId && a.propertyId === propertyId))
    );
  }, [appointments, scheduledDate, scheduledTime, propertyId]);

  const filteredList = useMemo(() => {
    return appointments
      .map((a) => {
        const isReminderOff = a.reminderMinutesBefore === 0;
        const remMins = isReminderOff
          ? 0
          : sanitizeReminderMinutes(
              a.reminderMinutesBefore ?? defaultReminderMins,
              defaultReminderMins
            );
        const dynamicState = evaluateAppointmentStatus(
          a.status,
          a.scheduledDate,
          a.scheduledTime,
          remMins,
          liveClock.now
        );
        const diffMinutes = getMinutesUntilAden(a.scheduledDate, a.scheduledTime, liveClock.now);
        return {
          ...a,
          dynamicState,
          resolvedReminderMinutes: remMins,
          diffMinutes,
        };
      })
      .filter((a) => {
        const isCompletedOrCancelled = a.status === 'completed' || a.status === 'cancelled';
        const isPastScheduledTime = a.diffMinutes < 0;

        if (tab === 'today') {
          return a.scheduledDate === todayStr && !isCompletedOrCancelled;
        }
        if (tab === 'upcoming') {
          // Stays visible in upcoming as long as scheduled date/time has not passed!
          // Stays in upcoming even during reminder alert window (dynamicState === 'due').
          return !isCompletedOrCancelled && a.scheduledDate >= todayStr && !isPastScheduledTime;
        }
        if (tab === 'overdue') {
          // Transitions to overdue ONLY after actual scheduled time has passed without completion
          return !isCompletedOrCancelled && (a.scheduledDate < todayStr || isPastScheduledTime);
        }
        if (tab === 'completed') {
          return isCompletedOrCancelled;
        }
        return true;
      })
      .sort((a, b) => `${a.scheduledDate} ${a.scheduledTime}`.localeCompare(`${b.scheduledDate} ${b.scheduledTime}`));
  }, [appointments, tab, todayStr, defaultReminderMins, liveClock.now]);

  const openCreateModal = () => {
    if (properties.length === 0 && taxpayers.length === 0) {
      showToast('يرجى إضافة مكلف أو عقار أولًا لربط الموعد به.', 'warning');
      return;
    }
    const savedMins = alertSound.getDefaultReminderMinutes();
    setTitle('');
    setPropertyId(properties[0]?.id || '');
    setScheduledDate(todayStr);
    setScheduledTime('10:00');
    setDurationMinutes(30);
    setIsReminderEnabled(true);
    setReminderMinutesInput(String(savedMins));
    setReminderError(null);
    setAssignedOfficerId('');
    setLocationText(properties[0]?.address || '');
    setNotes('');
    setIgnoreConflict(false);
    setIsCreateOpen(true);
  };

  const handleRequestPush = async () => {
    alertSound.playAppointmentChime();
    try {
      await pushService.subscribeToPush();
      showToast('تم تفعيل التنبيهات المباشرة والصوتية بنجاح على هذا الجهاز', 'success');
      await pushService.sendTestNotification();
    } catch {
      await alertSound.triggerOfflineSystemNotification(
        'تم تفعيل المنبه الصوتي المحلي (بدون إنترنت)',
        'ستعمل نغمة التنبيهات المختارة محليًا على جهازك حتى دون اتصال بالإنترنت.'
      );
      showToast('تم تفعيل المنبه الصوتي المحلي (يعمل بدون إنترنت)', 'success');
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    let finalReminderMinutes = 0;
    if (isReminderEnabled) {
      const validation = validateReminderMinutesInput(reminderMinutesInput);
      if (!validation.isValid) {
        setReminderError(validation.error || 'يرجى إدخال عدد دقائق صحيح موجب.');
        showToast(validation.error || 'يرجى التحقق من حقل وقت التنبيه قبل الموعد.', 'warning');
        return;
      }
      finalReminderMinutes = validation.minutes;
      // Persist the user's chosen reminder minutes as their default preference
      alertSound.setDefaultReminderMinutes(validation.minutes);
    }

    if (conflictingAppointments.length > 0 && !ignoreConflict) {
      return;
    }

    const prop = properties.find((p) => p.id === propertyId);
    const tp = taxpayers.find((t) => t.id === prop?.taxpayerId) || taxpayers[0];
    const assignedMem = members.find((m) => m.userId === assignedOfficerId);

    setSubmitting(true);
    try {
      await addAppointment({
        title,
        propertyId: prop?.id || 'general_prop',
        propertyTitle: prop?.title || 'عقار عام',
        taxpayerId: prop?.taxpayerId || tp?.id || 'general_tp',
        taxpayerName: prop?.taxpayerName || tp?.fullName || 'مكلف',
        scheduledDate,
        scheduledTime,
        locationText: locationText || prop?.address || '',
        status: 'upcoming',
        reminderMinutesBefore: finalReminderMinutes,
        durationMinutes,
        assignedOfficerId: assignedOfficerId || undefined,
        assignedOfficerName: assignedMem?.displayName || undefined,
        notes,
      });
      alertSound.playAppointmentChime();
      setIsCreateOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handlePostponeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!postponingAppt || submitting || !postponeReason.trim()) return;

    let finalReminderMinutes = 0;
    if (isPostponeReminderEnabled) {
      const validation = validateReminderMinutesInput(postponeReminderMinutesInput);
      if (!validation.isValid) {
        setPostponeReminderError(validation.error || 'يرجى إدخال عدد دقائق صحيح موجب.');
        showToast(validation.error || 'يرجى التحقق من حقل وقت التنبيه قبل الموعد.', 'warning');
        return;
      }
      finalReminderMinutes = validation.minutes;
    }

    setSubmitting(true);
    try {
      await postponeAppointment(
        postponingAppt,
        newDate,
        newTime,
        postponeReason,
        finalReminderMinutes
      );
      setPostponingAppt(null);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellingAppt || submitting || !cancelReason.trim()) return;
    setSubmitting(true);
    try {
      await cancelAppointment(cancellingAppt, cancelReason);
      setCancellingAppt(null);
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartLinkedVisit = (appt: Appointment) => {
    setSelectedPropertyId(appt.propertyId);
    setSelectedTaxpayerId(appt.taxpayerId);
    setActiveScreen('visits');
    showToast(`انتقلت إلى شاشة الزيارات الميدانية لتوثيق زيارة الموعد: ${appt.title}`, 'info');
  };

  return (
    <div className="space-y-5 pb-8" dir="rtl">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#0B192C] dark:text-white font-display">
            المواعيد والتذكيرات الميدانية
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            توقيت عدن (Asia/Aden · UTC+3) — جدولة دقيقة ونغمات تنبيه تعمل بدون إنترنت
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowSoundSettings((prev) => !prev)}
            className={`min-h-[42px] px-3.5 rounded-2xl border text-xs font-bold flex items-center gap-1.5 shadow-2xs cursor-pointer transition-colors ${
              showSoundSettings
                ? 'bg-[#0D9488] text-white border-[#0D9488]'
                : 'bg-white dark:bg-[#0D1829] border-slate-200 dark:border-slate-800 text-[#0B192C] dark:text-slate-200 hover:bg-slate-50'
            }`}
          >
            <Volume2 className={`w-4 h-4 ${showSoundSettings ? 'text-white' : 'text-[#0D9488]'}`} />
            <span>نغمة التنبيهات</span>
          </button>
          <button
            type="button"
            onClick={handleRequestPush}
            className="min-h-[42px] px-3.5 rounded-2xl bg-white dark:bg-[#0D1829] border border-slate-200 dark:border-slate-800 text-xs font-semibold text-[#0B192C] dark:text-slate-200 flex items-center gap-1.5 shadow-2xs cursor-pointer hover:bg-slate-50"
          >
            <Bell className="w-4 h-4 text-[#0284C7]" />
            <span>تفعيل تنبيهات الهاتف</span>
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            className="min-h-[42px] px-4 rounded-2xl bg-[#0B192C] hover:bg-[#132A46] dark:bg-[#0D9488] dark:hover:bg-teal-600 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>موعد جديد</span>
          </button>
        </div>
      </div>

      {/* Live Aden Clock Ticker */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 rounded-2xl bg-white dark:bg-[#0D1829] border border-slate-200/80 dark:border-slate-800 shadow-2xs">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </span>
          <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
            توقيت عدن المباشر:{' '}
            <span className="font-mono font-extrabold text-[#0D9488]">
              {liveClock.formattedTimeArabic}
            </span>
          </span>
        </div>
        <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
          {liveClock.formattedDateArabic}
        </div>
      </div>

      {/* Collapsible Offline Sound Settings Panel */}
      {showSoundSettings && (
        <div className="bg-white dark:bg-[#0D1829] border border-teal-200/90 dark:border-teal-900/70 rounded-3xl p-4 sm:p-5 shadow-sm animate-in fade-in duration-200">
          <div className="flex items-center justify-between mb-3 pb-2.5 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-sm font-bold text-[#0B192C] dark:text-white font-display flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-[#0D9488]" />
              <span>اختيار نغمات المواعيد والإشعارات (بدون إنترنت)</span>
            </h2>
            <button
              type="button"
              onClick={() => setShowSoundSettings(false)}
              className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <SoundSettingsPanel onShowToast={showToast} />
        </div>
      )}

      {/* Deep-linked / Focused Appointment Highlight Card */}
      {focusedAppointment && (
        <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-l from-[#0B192C] via-[#132A46] to-[#0B4F6C] text-white border border-teal-400/40 shadow-md space-y-3 animate-in fade-in duration-200">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-teal-400/20 border border-teal-300/30 text-[11px] font-bold text-teal-200">
                <Bell className="w-3.5 h-3.5" />
                <span>الموعد المفتوح من الإشعار</span>
              </div>
              <h2 className="text-base font-extrabold font-display">
                {focusedAppointment.title}
              </h2>
              <p className="text-xs text-sky-100 leading-relaxed">
                {
                  buildAppointmentNotificationPayload({
                    id: focusedAppointment.id,
                    title: focusedAppointment.title,
                    taxpayerName: focusedAppointment.taxpayerName,
                    propertyTitle: focusedAppointment.propertyTitle,
                    scheduledDate: focusedAppointment.scheduledDate,
                    scheduledTime: focusedAppointment.scheduledTime,
                  }).body
                }
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedAppointmentId(null)}
              className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white cursor-pointer shrink-0"
              title="إغلاق بطاقة التركيز"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/15">
            <button
              type="button"
              onClick={() => {
                setSelectedTaxpayerId(focusedAppointment.taxpayerId);
                setSelectedPropertyId(focusedAppointment.propertyId);
                setActiveScreen('taxpayers');
              }}
              className="min-h-[36px] px-3.5 rounded-xl bg-[#0D9488] hover:bg-teal-600 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>فتح ملف المكلف والعقار ({focusedAppointment.taxpayerName})</span>
            </button>
            <button
              type="button"
              onClick={() => handleStartLinkedVisit(focusedAppointment)}
              className="min-h-[36px] px-3.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <ClipboardCheck className="w-3.5 h-3.5" />
              <span>توثيق زيارة للموعد</span>
            </button>
          </div>
        </div>
      )}

      {/* Segmented Filter Tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 p-1.5 bg-slate-200/75 dark:bg-[#0D1829] rounded-2xl border border-slate-200/60 dark:border-slate-800">
        {[
          { id: 'today', label: 'مواعيد اليوم' },
          { id: 'upcoming', label: 'القادمة' },
          { id: 'overdue', label: 'المستحقة والمتأخرة' },
          { id: 'completed', label: 'المنجزة والملغاة' },
          { id: 'history', label: 'سجل التأجيلات' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id as any)}
            className={`min-h-[42px] rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              tab === t.id
                ? 'bg-[#0B192C] dark:bg-[#0D9488] text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-[#0B192C] dark:hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* History Log View */}
      {tab === 'history' ? (
        <div className="bg-white dark:bg-[#0D1829] border border-slate-200/90 dark:border-slate-800 rounded-3xl p-5 shadow-2xs">
          <div className="flex items-center gap-2 mb-4">
            <History className="w-5 h-5 text-[#0284C7]" />
            <h2 className="text-base font-bold text-[#0B192C] dark:text-white font-display">
              سجل إعادة الجدولة والتأجيلات الموثق ({postponements.length})
            </h2>
          </div>
          {postponements.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">لم يتم تسجيل أي تأجيل حتى الآن.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {postponements.map((p) => (
                <div key={p.id} className="py-3.5 text-xs space-y-1">
                  <div className="font-bold text-[#0B192C] dark:text-white">
                    السبب الموثق: {p.reason}
                  </div>
                  <div className="text-slate-500 flex flex-wrap items-center gap-2">
                    <span>من: <strong className="font-mono">{p.previousDate} ({p.previousTime})</strong></span>
                    <span aria-hidden="true">&larr;</span>
                    <span>إلى: <strong className="font-mono text-[#0D9488] dark:text-teal-400">{p.newDate} ({p.newTime})</strong></span>
                    <span aria-hidden="true">·</span>
                    <span>الموظف: {p.createdByName}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : filteredList.length === 0 ? (
        <div className="bg-white dark:bg-[#0D1829] border border-slate-200/90 dark:border-slate-800 rounded-3xl p-10 text-center shadow-2xs">
          <CalendarClock className="w-10 h-10 text-slate-400 mx-auto mb-2" />
          <h3 className="text-base font-bold text-[#0B192C] dark:text-white mb-1 font-display">
            لا توجد مواعيد في هذا التصنيف
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            يمكنك جدولة موعد جديد وتحديد وقت التنبيه المسبق وموظف المتابعة.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredList.map((appt) => {
            const diffMin = getMinutesUntilAden(appt.scheduledDate, appt.scheduledTime);
            const isDue = appt.dynamicState === 'due';
            const isOverdue = diffMin < 0 && appt.status !== 'completed' && appt.status !== 'cancelled';
            const isFocused = selectedAppointmentId === appt.id;

            return (
              <div
                id={`rasd-appt-card-${appt.id}`}
                key={appt.id}
                className={`bg-white dark:bg-[#0D1829] border rounded-3xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs transition-all ${
                  isFocused
                    ? 'border-[#0284C7] dark:border-sky-400 ring-2 ring-[#0284C7]/30 bg-sky-50/30 dark:bg-sky-950/25'
                    : isDue
                    ? 'border-amber-400 dark:border-amber-600 bg-amber-50/20'
                    : isOverdue
                    ? 'border-rose-300 dark:border-rose-800/80 bg-rose-50/20'
                    : 'border-slate-200/90 dark:border-slate-800'
                }`}
              >
                <div className="flex items-start gap-3.5 min-w-0">
                  {/* Time badge */}
                  <div
                    className={`px-3 py-2 rounded-2xl text-center shrink-0 font-mono ${
                      isOverdue
                        ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                        : appt.scheduledDate === todayStr
                        ? 'bg-teal-50 dark:bg-teal-950/70 text-[#0D9488] dark:text-teal-300 border border-teal-200 dark:border-teal-800'
                        : 'bg-[#F4F7FA] dark:bg-slate-900 text-[#0B192C] dark:text-slate-200 border border-slate-200/80 dark:border-slate-800'
                    }`}
                  >
                    <div className="text-sm font-bold">{appt.scheduledTime}</div>
                    <div className="text-[11px] opacity-85 mt-0.5">{appt.scheduledDate}</div>
                  </div>

                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedTaxpayerId(appt.taxpayerId);
                          setSelectedPropertyId(appt.propertyId);
                          setActiveScreen('taxpayers');
                        }}
                        className="inline-flex items-center gap-1 font-semibold text-[#0284C7] dark:text-sky-400 hover:underline cursor-pointer"
                      >
                        <Building2 className="w-3.5 h-3.5" />
                        <span>{appt.propertyTitle}</span>
                      </button>
                      <span aria-hidden="true">·</span>
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        {appt.taxpayerName}
                      </span>
                    </div>

                    <div className="text-sm font-bold text-[#0B192C] dark:text-white truncate">
                      {appt.title}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                      {appt.locationText && (
                        <span className="inline-flex items-center gap-1 truncate">
                          <MapPin className="w-3 h-3 text-slate-400" />
                          <span>{appt.locationText}</span>
                        </span>
                      )}
                      <span>·</span>
                      <span>التنبيه قبل الموعد بـ {appt.resolvedReminderMinutes} دقيقة</span>
                      {appt.durationMinutes && (
                        <>
                          <span>·</span>
                          <span>المدة: {appt.durationMinutes} د</span>
                        </>
                      )}
                      {appt.postponeCount > 0 && (
                        <span className="text-amber-600 dark:text-amber-400 font-semibold">
                          (أُجّل {appt.postponeCount} مرة)
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions Zone */}
                <div className="flex flex-wrap items-center gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800 shrink-0">
                  {appt.status !== 'completed' && appt.status !== 'cancelled' ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleStartLinkedVisit(appt)}
                        className="min-h-[36px] px-3 rounded-xl bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/50 dark:hover:bg-sky-900 text-[#0284C7] dark:text-sky-300 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                        title="بدء وتوثيق زيارة ميدانية مرتبطة بهذا الموعد"
                      >
                        <ClipboardCheck className="w-3.5 h-3.5" />
                        <span>بدء زيارة</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setPostponingAppt(appt);
                          setNewDate(appt.scheduledDate);
                          setNewTime(appt.scheduledTime);
                          setPostponeReason('');
                          const isOff = appt.reminderMinutesBefore === 0;
                          setIsPostponeReminderEnabled(!isOff);
                          const initialMins = isOff
                            ? defaultReminderMins
                            : (appt.reminderMinutesBefore ?? defaultReminderMins);
                          setPostponeReminderMinutesInput(String(initialMins));
                          setPostponeReminderError(null);
                        }}
                        className="min-h-[36px] px-3 rounded-xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/60 text-amber-700 dark:text-amber-300 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>تأجيل</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => updateAppointmentStatus(appt, 'completed')}
                        className="min-h-[36px] px-3.5 rounded-xl bg-[#0D9488] hover:bg-teal-700 text-white text-xs font-bold flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>إنجاز</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setCancellingAppt(appt);
                          setCancelReason('');
                        }}
                        className="min-h-[36px] p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                        title="إلغاء الموعد"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <span
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 ${
                        appt.status === 'completed'
                          ? 'bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                      }`}
                    >
                      {appt.status === 'completed' ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>موعد مكتمل</span>
                        </>
                      ) : (
                        <span>موعد ملغى</span>
                      )}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="relative w-full max-w-lg bg-white dark:bg-[#0D1829] border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-base font-bold text-[#0B192C] dark:text-white font-display">
                جدولة موعد ميداني جديد
              </h2>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4 pt-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  عنوان الموعد / الغرض *
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="مثال: معاينة استكمال بيانات العقار وحصر الوحدات"
                  className="w-full min-h-[42px] px-3.5 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs focus:outline-none focus:border-[#0284C7]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  العقار المرتبط *
                </label>
                <select
                  required
                  value={propertyId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setPropertyId(id);
                    const p = properties.find((prop) => prop.id === id);
                    if (p?.address) setLocationText(p.address);
                  }}
                  className="w-full min-h-[42px] px-3 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                >
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title} — {p.taxpayerName} ({p.region || 'عام'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    التاريخ (بتوقيت عدن) *
                  </label>
                  <input
                    type="date"
                    required
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    className="w-full min-h-[42px] px-3 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    الوقت *
                  </label>
                  <input
                    type="time"
                    required
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                    className="w-full min-h-[42px] px-3 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                  />
                </div>
              </div>

              {/* Reminder Controls Section */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Bell className={`w-4 h-4 ${isReminderEnabled ? 'text-[#0D9488]' : 'text-slate-400'}`} />
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      التنبيه المسبق للموعد
                    </span>
                  </div>
                  <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                    <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                      {isReminderEnabled ? 'مفعّل' : 'معطّل'}
                    </span>
                    <input
                      type="checkbox"
                      checked={isReminderEnabled}
                      onChange={(e) => setIsReminderEnabled(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="relative w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-slate-600 peer-checked:bg-[#0D9488]"></div>
                  </label>
                </div>

                {isReminderEnabled ? (
                  <div className="space-y-2 pt-1 border-t border-slate-200/60 dark:border-slate-800">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {[15, 30, 45, 60].map((mins) => (
                        <button
                          key={mins}
                          type="button"
                          onClick={() => {
                            setReminderMinutesInput(String(mins));
                            setReminderError(null);
                          }}
                          className={`px-2.5 py-1 rounded-xl text-[11px] font-bold border transition-colors cursor-pointer ${
                            reminderMinutesInput === String(mins)
                              ? 'bg-[#0D9488] text-white border-[#0D9488]'
                              : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-[#0D9488]'
                          }`}
                        >
                          {mins} دقيقة
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        id="rasd-create-appt-reminder-mins"
                        type="number"
                        inputMode="numeric"
                        required={isReminderEnabled}
                        min={MIN_REMINDER_MINUTES}
                        max={MAX_REMINDER_MINUTES}
                        step={1}
                        value={reminderMinutesInput}
                        onChange={(e) => {
                          const raw = e.target.value;
                          setReminderMinutesInput(raw);
                          const check = validateReminderMinutesInput(raw);
                          setReminderError(check.isValid ? null : check.error || null);
                        }}
                        placeholder="أو اكتب عدد الدقائق..."
                        className={`w-full min-h-[38px] px-3.5 rounded-xl bg-white dark:bg-slate-900 border text-xs font-mono font-bold focus:outline-none ${
                          reminderError
                            ? 'border-rose-500 text-rose-600 dark:text-rose-400'
                            : 'border-slate-200 dark:border-slate-700 focus:border-[#0284C7]'
                        }`}
                      />
                      <span className="text-xs font-bold text-slate-600 dark:text-slate-300 shrink-0">
                        دقيقة قبل الموعد
                      </span>
                    </div>

                    {reminderError ? (
                      <div className="flex items-center gap-1 text-[10px] font-semibold text-rose-600 dark:text-rose-400">
                        <AlertCircle className="w-3 h-3 shrink-0" />
                        <span>{reminderError}</span>
                      </div>
                    ) : createAlertPreview ? (
                      <div className="text-[11px] font-semibold text-[#0D9488] dark:text-teal-400 bg-teal-50 dark:bg-teal-950/30 p-2 rounded-xl border border-teal-200/60 dark:border-teal-900/40">
                        🔔 وقت التنبيه المحسوب: <span className="font-mono font-bold">{createAlertPreview.alertFormattedArabic}</span> بتوقيت عدن
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/60 p-2 rounded-xl">
                    تم إيقاف التنبيه المسبق لهذا الموعد. لن يتم تشغيل نغمات أو إرسال إشعارات هاتف.
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  المدة التقديرية
                </label>
                <select
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                  className="w-full min-h-[42px] px-3 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                >
                  <option value={15}>15 دقيقة</option>
                  <option value={30}>30 دقيقة</option>
                  <option value={45}>45 دقيقة</option>
                  <option value={60}>ساعة واحدة</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  الموقع / العنوان الميداني
                </label>
                <input
                  type="text"
                  value={locationText}
                  onChange={(e) => setLocationText(e.target.value)}
                  placeholder="وصف دقيق للموقع أو علامة مميزة"
                  className="w-full min-h-[42px] px-3.5 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  ملاحظات إضافية
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="تفاصيل التنسيق مع المكلف أو الشاغل"
                  className="w-full p-3 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                />
              </div>

              {/* Conflict Warning */}
              {conflictingAppointments.length > 0 && !ignoreConflict && (
                <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div className="font-bold">يوجد تعارض مع موعد آخر في نفس الوقت أو العقار!</div>
                    <label className="inline-flex items-center gap-1.5 cursor-pointer mt-1">
                      <input
                        type="checkbox"
                        checked={ignoreConflict}
                        onChange={(e) => setIgnoreConflict(e.target.checked)}
                        className="rounded"
                      />
                      <span>المتابعة والتأكيد رغم التعارض</span>
                    </label>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="min-h-[42px] px-4 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={submitting || (conflictingAppointments.length > 0 && !ignoreConflict)}
                  className="min-h-[42px] px-5 rounded-2xl bg-[#0B192C] dark:bg-[#0D9488] hover:bg-[#132A46] text-white text-xs font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  {submitting ? 'جاري الحفظ...' : 'تأكيد وحفظ الموعد'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Postpone Modal */}
      {postponingAppt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="relative w-full max-w-md bg-white dark:bg-[#0D1829] border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl p-6">
            <h2 className="text-base font-bold text-[#0B192C] dark:text-white font-display mb-1">
              إعادة جدولة / تأجيل الموعد
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              الموعد الحالي: {postponingAppt.title} ({postponingAppt.scheduledDate} {postponingAppt.scheduledTime})
            </p>

            <form onSubmit={handlePostponeSubmit} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    التاريخ الجديد *
                  </label>
                  <input
                    type="date"
                    required
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="w-full min-h-[42px] px-3 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    الوقت الجديد *
                  </label>
                  <input
                    type="time"
                    required
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                    className="w-full min-h-[42px] px-3 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                  />
                </div>
              </div>

              {/* Postpone Reminder Controls Section */}
              <div className="p-3.5 rounded-2xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-900/50 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Bell className={`w-4 h-4 ${isPostponeReminderEnabled ? 'text-amber-700 dark:text-amber-400' : 'text-slate-400'}`} />
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      التنبيه قبل الموعد الجديد
                    </span>
                  </div>
                  <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                    <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                      {isPostponeReminderEnabled ? 'مفعّل' : 'معطّل'}
                    </span>
                    <input
                      type="checkbox"
                      checked={isPostponeReminderEnabled}
                      onChange={(e) => setIsPostponeReminderEnabled(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="relative w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-slate-600 peer-checked:bg-amber-600"></div>
                  </label>
                </div>

                <div className="text-[11px] text-amber-900/80 dark:text-amber-300 font-medium">
                  {postponingAppt.reminderMinutesBefore === 0
                    ? 'ℹ️ التنبيه الأصلي لهذا الموعد كان معطلاً.'
                    : `ℹ️ التنبيه الأصلي كان مضبوطاً قبل الموعد بـ ${postponingAppt.reminderMinutesBefore ?? defaultReminderMins} دقيقة.`}
                </div>

                {isPostponeReminderEnabled ? (
                  <div className="space-y-2 pt-1 border-t border-amber-200/60 dark:border-amber-900/40">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {[15, 30, 45, 60].map((mins) => (
                        <button
                          key={mins}
                          type="button"
                          onClick={() => {
                            setPostponeReminderMinutesInput(String(mins));
                            setPostponeReminderError(null);
                          }}
                          className={`px-2.5 py-1 rounded-xl text-[11px] font-bold border transition-colors cursor-pointer ${
                            postponeReminderMinutesInput === String(mins)
                              ? 'bg-amber-600 text-white border-amber-600'
                              : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-amber-200 dark:border-amber-900/60 hover:border-amber-500'
                          }`}
                        >
                          {mins} دقيقة
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        id="rasd-postpone-appt-reminder-mins"
                        type="number"
                        inputMode="numeric"
                        required={isPostponeReminderEnabled}
                        min={MIN_REMINDER_MINUTES}
                        max={MAX_REMINDER_MINUTES}
                        step={1}
                        value={postponeReminderMinutesInput}
                        onChange={(e) => {
                          const raw = e.target.value;
                          setPostponeReminderMinutesInput(raw);
                          const check = validateReminderMinutesInput(raw);
                          setPostponeReminderError(check.isValid ? null : check.error || null);
                        }}
                        placeholder="مثال: 7 أو 23 أو 90"
                        className={`w-full min-h-[38px] px-3.5 rounded-xl bg-white dark:bg-slate-900 border text-xs font-mono font-bold focus:outline-none ${
                          postponeReminderError
                            ? 'border-rose-500 text-rose-600 dark:text-rose-400'
                            : 'border-slate-200 dark:border-slate-700 focus:border-amber-500'
                        }`}
                      />
                      <span className="text-xs font-bold text-slate-600 dark:text-slate-300 shrink-0">
                        دقيقة قبل الموعد
                      </span>
                    </div>

                    {postponeReminderError ? (
                      <div className="flex items-center gap-1 text-[10px] font-semibold text-rose-600 dark:text-rose-400">
                        <AlertCircle className="w-3 h-3 shrink-0" />
                        <span>{postponeReminderError}</span>
                      </div>
                    ) : postponeAlertPreview ? (
                      <div className="text-[11px] font-semibold text-amber-900 dark:text-amber-200 bg-amber-100/70 dark:bg-amber-950/40 p-2 rounded-xl border border-amber-300/60 dark:border-amber-900/60">
                        🔔 وقت التنبيه الجديد المحسوب: <span className="font-mono font-bold">{postponeAlertPreview.alertFormattedArabic}</span> بتوقيت عدن
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/60 p-2 rounded-xl">
                    تم إيقاف التنبيه المسبق للموعد المؤجل. لن يتم تشغيل نغمات أو إرسال إشعارات.
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  سبب التأجيل الموثق *
                </label>
                <textarea
                  required
                  rows={3}
                  value={postponeReason}
                  onChange={(e) => setPostponeReason(e.target.value)}
                  placeholder="مثال: طلب المكلف التأجيل لحين توفير المستندات الأصلية"
                  className="w-full p-3 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPostponingAppt(null)}
                  className="min-h-[40px] px-4 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-[40px] px-5 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
                >
                  {submitting ? 'جاري التأجيل...' : 'تأكيد التأجيل وحفظ السجل'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {cancellingAppt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="relative w-full max-w-md bg-white dark:bg-[#0D1829] border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl p-6">
            <h2 className="text-base font-bold text-rose-700 dark:text-rose-400 font-display mb-1">
              إلغاء الموعد الميداني
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              هل أنت متأكد من رغبتك في إلغاء الموعد ({cancellingAppt.title})؟
            </p>

            <form onSubmit={handleCancelSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  سبب الإلغاء *
                </label>
                <textarea
                  required
                  rows={3}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="مثال: انتفاء الحاجة للمعاينه بعد السداد التام أو إلغاء التكليف"
                  className="w-full p-3 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCancellingAppt(null)}
                  className="min-h-[40px] px-4 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300"
                >
                  تراجع
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-[40px] px-5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
                >
                  {submitting ? 'جاري الإلغاء...' : 'تأكيد الإلغاء وتوثيق السبب'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
