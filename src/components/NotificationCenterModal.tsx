import React, { useState, useMemo } from 'react';
import {
  Bell,
  X,
  CalendarClock,
  MapPin,
  CheckCircle2,
  Clock,
  ArrowRight,
  ShieldAlert,
  Volume2,
  Smartphone,
  ExternalLink,
  RotateCcw,
} from 'lucide-react';
import { useRasd } from '../context/RasdContext';
import { Appointment, NotificationItem } from '../types/rasd';
import {
  evaluateAppointmentStatus,
  formatAdenDateTimeDisplay,
  getMinutesUntilAden,
  getAdenTodayString,
} from '../utils/dateUtils';
import { pushService } from '../services/pushService';
import { SoundSettingsPanel } from './SoundSettingsPanel';

interface NotificationCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAppointment?: (appointmentId: string) => void;
}

export const NotificationCenterModal: React.FC<NotificationCenterModalProps> = ({
  isOpen,
  onClose,
  onSelectAppointment,
}) => {
  const {
    notifications,
    appointments,
    markNotificationRead,
    setActiveScreen,
    postponeAppointment,
    showToast,
  } = useRasd();

  const [activeTab, setActiveTab] = useState<'all' | 'due' | 'appointments' | 'sounds'>('all');
  const [enablingPush, setEnablingPush] = useState(false);

  const todayStr = useMemo(() => getAdenTodayString(), []);

  // Compute live due appointments
  const dueAppointments = useMemo(() => {
    return appointments.filter((a) => {
      const state = evaluateAppointmentStatus(a.status, a.scheduledDate, a.scheduledTime, 30);
      return state === 'due' || (a.scheduledDate === todayStr && a.status === 'upcoming');
    });
  }, [appointments, todayStr]);

  const filteredNotifications = useMemo(() => {
    if (activeTab === 'due') {
      return notifications.filter((n) => n.category === 'appointment');
    }
    if (activeTab === 'appointments') {
      return notifications.filter((n) => n.category === 'appointment');
    }
    return notifications;
  }, [notifications, activeTab]);

  const unreadCount = useMemo(() => {
    return notifications.filter((n) => !n.isRead).length + dueAppointments.length;
  }, [notifications, dueAppointments]);

  const handleEnablePush = async () => {
    setEnablingPush(true);
    try {
      await pushService.subscribeToPush();
      showToast('تم تفعيل إشعارات الهاتف بنجاح!', 'success');
      // Send immediate test
      await pushService.sendTestNotification();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'تعذر تفعيل الإشعارات', 'warning');
    } finally {
      setEnablingPush(false);
    }
  };

  const handleOpenAppointment = (apptId: string) => {
    onClose();
    if (onSelectAppointment) {
      onSelectAppointment(apptId);
    }
    setActiveScreen('appointments');
  };

  const handleSnooze = async (appt: Appointment) => {
    // Add 15 minutes to scheduled time
    const [hStr, mStr] = appt.scheduledTime.split(':');
    let h = parseInt(hStr || '10', 10);
    let m = parseInt(mStr || '00', 10) + 15;
    if (m >= 60) {
      h = (h + 1) % 24;
      m = m - 60;
    }
    const newTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    await postponeAppointment(appt, appt.scheduledDate, newTime, 'تأجيل مؤقت 15 دقيقة من مركز التنبيهات');
    showToast(`تم تأجيل الموعد إلى ${newTime}`, 'success');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200" dir="rtl">
      <div className="relative w-full max-w-lg bg-white dark:bg-[#0D1829] border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-900/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#0D9488]/15 text-[#0D9488] dark:text-teal-400 flex items-center justify-center font-bold">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#0B192C] dark:text-white font-display flex items-center gap-2">
                مركز التنبيهات والإشعارات
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-600 text-white">
                    {unreadCount}
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                التوقيت المعتمد: توقيت عدن (Asia/Aden · UTC+3)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveTab(activeTab === 'sounds' ? 'all' : 'sounds')}
              className={`min-h-[36px] px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'sounds'
                  ? 'bg-[#0D9488] text-white'
                  : 'bg-teal-50 dark:bg-teal-950/60 text-[#0D9488] dark:text-teal-300 hover:bg-teal-100'
              }`}
              title="اختيار نغمة الإشعارات والتنبيهات بدون إنترنت"
            >
              <Volume2 className="w-4 h-4" />
              <span>النغمات</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-2xl hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 transition-colors cursor-pointer"
              aria-label="إغلاق"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* PWA Background Push Banner */}
        <div className="p-3.5 bg-gradient-to-r from-sky-50 to-teal-50 dark:from-slate-900 dark:to-teal-950/40 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <Smartphone className="w-4 h-4 text-[#0284C7] shrink-0" />
            <span className="text-slate-700 dark:text-slate-200 font-medium leading-relaxed">
              تلقي تنبيهات المواعيد في الخلفية عندما يكون التطبيق مغلقًا
            </span>
          </div>
          <button
            type="button"
            onClick={handleEnablePush}
            disabled={enablingPush}
            className="min-h-[34px] px-3 rounded-xl bg-[#0B192C] dark:bg-[#0D9488] hover:bg-[#132A46] dark:hover:bg-teal-600 text-white font-semibold text-[11px] shrink-0 transition-colors cursor-pointer"
          >
            {enablingPush ? 'جاري التفعيل...' : 'تفعيل الإشعارات'}
          </button>
        </div>

        {/* Filter Tabs */}
        <div className="grid grid-cols-4 gap-1 p-2 bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`py-2 rounded-xl transition-colors cursor-pointer ${
              activeTab === 'all'
                ? 'bg-white dark:bg-[#0D1829] text-[#0B192C] dark:text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            الكل ({notifications.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('due')}
            className={`py-2 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'due'
                ? 'bg-white dark:bg-[#0D1829] text-rose-600 dark:text-rose-400 shadow-xs'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <span>مستحقة</span>
            {dueAppointments.length > 0 && (
              <span className="w-2 h-2 rounded-full bg-rose-600 animate-pulse"></span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('appointments')}
            className={`py-2 rounded-xl transition-colors cursor-pointer ${
              activeTab === 'appointments'
                ? 'bg-white dark:bg-[#0D1829] text-[#0B192C] dark:text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            المواعيد
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('sounds')}
            className={`py-2 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1 ${
              activeTab === 'sounds'
                ? 'bg-white dark:bg-[#0D1829] text-[#0D9488] dark:text-teal-400 shadow-xs'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Volume2 className="w-3.5 h-3.5" />
            <span>النغمات</span>
          </button>
        </div>

        {/* List Content */}
        <div className="p-4 space-y-3 overflow-y-auto flex-1">
          {activeTab === 'sounds' ? (
            <SoundSettingsPanel compact onShowToast={showToast} />
          ) : (
            <>
              {/* Active Due Appointments Cards */}
              {dueAppointments.length > 0 && (
            <div className="space-y-2.5 mb-4">
              <div className="text-xs font-bold text-rose-700 dark:text-rose-400 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                <span>مواعيد تتطلب التدخل الفوري ({dueAppointments.length})</span>
              </div>
              {dueAppointments.map((appt) => {
                const diffMin = getMinutesUntilAden(appt.scheduledDate, appt.scheduledTime);
                const isOverdue = diffMin < 0;
                return (
                  <div
                    key={appt.id}
                    className="p-3.5 rounded-2xl bg-rose-50/80 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 space-y-2.5 transition-all"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-xs font-bold text-rose-900 dark:text-rose-200">
                          {appt.title}
                        </div>
                        <div className="text-[11px] text-rose-700 dark:text-rose-400 mt-0.5">
                          {appt.propertyTitle} — {appt.taxpayerName}
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-rose-200 dark:bg-rose-900 text-rose-900 dark:text-rose-100 whitespace-nowrap">
                        {isOverdue ? `متأخر ${Math.abs(diffMin)} دقيقة` : `متبقي ${diffMin} دقيقة`}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                      <Clock className="w-3 h-3 text-slate-400" />
                      <span>{appt.scheduledTime} (بتوقيت عدن)</span>
                      {appt.locationText && (
                        <>
                          <span>·</span>
                          <span className="truncate">{appt.locationText}</span>
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-2 pt-1 border-t border-rose-100 dark:border-rose-900/40">
                      <button
                        type="button"
                        onClick={() => handleOpenAppointment(appt.id)}
                        className="flex-1 min-h-[32px] px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>فتح الموعد</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSnooze(appt)}
                        className="min-h-[32px] px-3 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>تأجيل 15 د</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Regular Notifications */}
          {filteredNotifications.length === 0 && dueAppointments.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-teal-500/70" />
              <div className="text-sm font-bold text-slate-700 dark:text-slate-200">
                لا توجد تنبيهات معلقة
              </div>
              <div className="text-xs text-slate-500 mt-1">
                جميع المواعيد والمهام محدثة وفق توقيت عدن.
              </div>
            </div>
          ) : (
            filteredNotifications.map((notif) => (
              <div
                key={notif.id}
                onClick={() => {
                  if (!notif.isRead) markNotificationRead(notif.id);
                }}
                className={`p-3.5 rounded-2xl border transition-all text-xs cursor-pointer ${
                  !notif.isRead
                    ? 'bg-teal-50/50 dark:bg-teal-950/20 border-teal-200 dark:border-teal-900/50'
                    : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                    {!notif.isRead && (
                      <span className="w-1.5 h-1.5 rounded-full bg-teal-500"></span>
                    )}
                    <span>{notif.title}</span>
                  </div>
                  <span className="text-[10px] text-slate-400 whitespace-nowrap">
                    {notif.category === 'appointment' ? 'موعد' : 'إشعار'}
                  </span>
                </div>
                <p className="text-slate-600 dark:text-slate-300 text-[11px] mt-1 leading-relaxed">
                  {notif.message}
                </p>
              </div>
            ))
          )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
