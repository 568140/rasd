import React, { useState, useMemo, useEffect } from 'react';
import {
  Bell,
  X,
  CheckCircle2,
  Clock,
  Volume2,
  Smartphone,
  ExternalLink,
  RotateCcw,
  ArrowRight,
  AlertTriangle,
  Trash2,
  CheckCheck,
  UserCheck,
} from 'lucide-react';
import { useRasd } from '../context/RasdContext';
import { Appointment, NotificationItem, RegistrationRequestMetadata } from '../types/rasd';
import {
  evaluateAppointmentStatus,
  getMinutesUntilAden,
  sanitizeReminderMinutes,
  buildAppointmentNotificationPayload,
  formatTimeTo12Hour,
} from '../utils/dateUtils';
import { pushService } from '../services/pushService';
import { alertSound } from '../services/alertSound';
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
    taxpayers,
    properties,
    receivedRegistrationRequests,
    canAccessPlatformAdmin,
    decideRegistrationRequest,
    markNotificationRead,
    deleteNotification,
    clearAllNotifications,
    setActiveScreen,
    setSelectedAppointmentId,
    setSelectedTaxpayerId,
    setSelectedPropertyId,
    postponeAppointment,
    showToast,
  } = useRasd();

  const [activeTab, setActiveTab] = useState<'all' | 'requests' | 'appointments' | 'alerts' | 'sounds'>('all');
  const [enablingPush, setEnablingPush] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [isApprovingId, setIsApprovingId] = useState<string | null>(null);
  const [dismissedApptIds, setDismissedApptIds] = useState<Set<string>>(() => new Set());
  const [defaultReminderMins, setDefaultReminderMins] = useState<number>(() =>
    alertSound.getDefaultReminderMinutes()
  );

  const pendingRequests = useMemo(() => {
    if (!canAccessPlatformAdmin) return [];
    return receivedRegistrationRequests.filter((r) => r.status === 'pending');
  }, [canAccessPlatformAdmin, receivedRegistrationRequests]);

  const handleQuickApprove = async (req: RegistrationRequestMetadata) => {
    setIsApprovingId(req.workspaceId);
    try {
      await decideRegistrationRequest({
        request: req,
        decision: 'approve',
        approvedPlanId: req.requestedPlanId || 'trial',
        decisionNotes: 'تمت الموافقة السريعة والاعتماد المباشر من مركز التنبيهات',
      });
      showToast(`تم قبول واعتماد حساب (${req.applicantName}) وتفعيله بنجاح!`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'تعذر تنفيذ الموافقة على الطلب', 'error');
    } finally {
      setIsApprovingId(null);
    }
  };

  useEffect(() => {
    return alertSound.subscribe((updated) => {
      setDefaultReminderMins(updated.defaultReminderMinutes);
    });
  }, []);

  // Compute live due appointments using each appointment's reminderMinutesBefore or the user's saved defaultReminderMinutes
  const dueAppointments = useMemo(() => {
    return appointments.filter((a) => {
      if (dismissedApptIds.has(a.id)) return false;
      const reminderMins =
        a.reminderMinutesBefore === 0
          ? 0
          : sanitizeReminderMinutes(
              a.reminderMinutesBefore ?? defaultReminderMins,
              defaultReminderMins
            );
      const state = evaluateAppointmentStatus(
        a.status,
        a.scheduledDate,
        a.scheduledTime,
        reminderMins
      );
      return state === 'due';
    });
  }, [appointments, dismissedApptIds, defaultReminderMins]);

  const filteredNotifications = useMemo(() => {
    if (activeTab === 'appointments') {
      return notifications.filter((n) => n.category === 'appointment');
    }
    if (activeTab === 'alerts') {
      return notifications.filter((n) => !n.isRead || n.category !== 'appointment');
    }
    return notifications;
  }, [notifications, activeTab]);

  const unreadCount = useMemo(() => {
    return notifications.filter((n) => !n.isRead).length + dueAppointments.length + pendingRequests.length;
  }, [notifications, dueAppointments, pendingRequests]);

  const handleDismissDueAppointment = (apptId: string) => {
    setDismissedApptIds((prev) => new Set([...prev, apptId]));
    showToast('تم استبعاد الموعد من قائمة التنبيهات المعلقة', 'info');
  };

  const handleCleanAll = async () => {
    if (notifications.length === 0 && dueAppointments.length === 0) {
      showToast('لا توجد إشعارات أو تنبيهات لتنظيفها', 'info');
      return;
    }
    setIsCleaning(true);
    try {
      // Dismiss all current due appointment cards
      const allApptIds = appointments.map((a) => a.id);
      setDismissedApptIds(new Set(allApptIds));
      // Delete all stored notifications from Firestore
      await clearAllNotifications();
    } finally {
      setIsCleaning(false);
    }
  };

  const handleEnablePush = async () => {
    setEnablingPush(true);
    try {
      await pushService.subscribeToPush();
      showToast('تم تفعيل إشعارات الهاتف بنجاح!', 'success');
      await pushService.sendTestNotification();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'تعذر تفعيل الإشعارات', 'warning');
    } finally {
      setEnablingPush(false);
    }
  };

  const handleOpenAppointment = (apptId: string) => {
    onClose();
    setSelectedAppointmentId(apptId);
    if (onSelectAppointment) {
      onSelectAppointment(apptId);
    }
    setActiveScreen('appointments');
  };

  const handleSnooze = async (appt: Appointment) => {
    const [hStr, mStr] = appt.scheduledTime.split(':');
    let h = parseInt(hStr || '10', 10);
    let m = parseInt(mStr || '00', 10) + 15;
    if (m >= 60) {
      h = (h + 1) % 24;
      m = m - 60;
    }
    const newTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    await postponeAppointment(appt, appt.scheduledDate, newTime, 'تأجيل مؤقت 15 دقيقة من مركز التنبيهات');
    showToast(`تم تأجيل الموعد إلى ${formatTimeTo12Hour(newTime)}`, 'success');
  };

  const handleNotificationClick = (notif: NotificationItem) => {
    if (!notif.isRead) {
      markNotificationRead(notif.id);
    }
    onClose();

    // 1. Check if it's an appointment notification or refers to an appointment
    if (
      notif.category === 'appointment' ||
      notif.title.includes('موعد') ||
      notif.message.includes('موعد')
    ) {
      const cleanTitle = notif.title.replace('موعد مجدول:', '').replace('تذكير بموعد:', '').trim();
      const matchedAppt = appointments.find((a) => {
        if (a.title && (notif.title.includes(a.title) || cleanTitle.includes(a.title))) return true;
        if (a.taxpayerName && (notif.title.includes(a.taxpayerName) || notif.message.includes(a.taxpayerName))) return true;
        return false;
      });

      if (matchedAppt) {
        setSelectedAppointmentId(matchedAppt.id);
        if (onSelectAppointment) {
          onSelectAppointment(matchedAppt.id);
        }
      }
      setActiveScreen('appointments');
      return;
    }

    // 2. Field visit notification
    if (
      notif.category === 'visit' ||
      notif.title.includes('زيارة') ||
      notif.message.includes('زيارة')
    ) {
      setActiveScreen('visits');
      return;
    }

    // 3. Financial assessment or transaction
    if (
      notif.category === 'finance' ||
      notif.title.includes('مالي') ||
      notif.message.includes('معاملة') ||
      notif.message.includes('تقييم') ||
      notif.message.includes('سداد') ||
      notif.message.includes('ضريبة')
    ) {
      if (notif.title.includes('تقييم') || notif.message.includes('تقييم')) {
        setActiveScreen('assessments');
      } else {
        setActiveScreen('transactions');
      }
      return;
    }

    // 4. Team notification
    if (
      notif.category === 'team' ||
      notif.title.includes('فريق') ||
      notif.title.includes('مساعد') ||
      notif.title.includes('عضو')
    ) {
      setActiveScreen('team');
      return;
    }

    // 5. Check if matches a Taxpayer
    const matchedTaxpayer = taxpayers.find(
      (t) =>
        (t.fullName && (notif.title.includes(t.fullName) || notif.message.includes(t.fullName))) ||
        (t.internalCode && notif.message.includes(t.internalCode))
    );
    if (matchedTaxpayer) {
      setSelectedTaxpayerId(matchedTaxpayer.id);
      setActiveScreen('taxpayers');
      return;
    }

    // 6. Check if matches a Property
    const matchedProp = properties.find(
      (p) => notif.title.includes(p.title) || notif.message.includes(p.title)
    );
    if (matchedProp) {
      setSelectedPropertyId(matchedProp.id);
      setActiveScreen('properties');
      return;
    }

    // Default fallback: appointments screen
    setActiveScreen('appointments');
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-2.5 sm:p-4 bg-black/55 backdrop-blur-xs animate-in fade-in duration-200"
      dir="rtl"
    >
      <div className="relative w-full max-w-lg bg-[#F7F5F0] dark:bg-[#161514] border border-[#E7E1D8] dark:border-[#383431] rounded-[26px] shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        {/* Header — Matching Reference Image Top Bar */}
        <div className="px-4 py-3.5 sm:px-5 sm:py-4 border-b border-[#E7E1D8] dark:border-[#383431] flex items-center justify-between bg-[#F7F5F0] dark:bg-[#161514]">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-[#FFFEFC] dark:bg-[#22201F] border border-[#E7E1D8] dark:border-[#383431] flex items-center justify-center text-[#292725] dark:text-[#F4F1EA] hover:bg-[#EFECE6] transition-colors cursor-pointer"
              aria-label="رجوع"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-[#292725] dark:text-[#F4F1EA] font-display flex items-center gap-2">
                <span>{activeTab === 'sounds' ? 'إعدادات الإشعارات' : 'الإشعارات'}</span>
                {unreadCount > 0 && activeTab !== 'sounds' && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#A64B45] text-white">
                    {unreadCount}
                  </span>
                )}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveTab(activeTab === 'sounds' ? 'all' : 'sounds')}
              className={`min-h-[36px] px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer border ${
                activeTab === 'sounds'
                  ? 'bg-[#743B46] text-white border-[#743B46]'
                  : 'bg-[#FFFEFC] dark:bg-[#22201F] text-[#743B46] dark:text-[#E5B9C0] border-[#E7E1D8] dark:border-[#383431] hover:bg-[#EFECE6]'
              }`}
              title="إعدادات الإشعارات والنغمات"
            >
              <Volume2 className="w-4 h-4" />
              <span>{activeTab === 'sounds' ? 'العودة للإشعارات' : 'الإعدادات'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-[#FFFEFC] dark:bg-[#22201F] border border-[#E7E1D8] dark:border-[#383431] hover:bg-[#EFECE6] text-[#77716B] flex items-center justify-center transition-colors cursor-pointer"
              aria-label="إغلاق"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filter Tabs — Supporting New Subscriber Requests for Platform Admins */}
        <div className="px-4 pt-3 pb-2 bg-[#F7F5F0] dark:bg-[#161514]">
          <div
            className={`grid ${
              canAccessPlatformAdmin ? 'grid-cols-5' : 'grid-cols-4'
            } gap-1 p-1 rounded-2xl bg-[#EFECE6] dark:bg-[#22201F] border border-[#E5DEC9] dark:border-[#383431] text-[11px] font-bold`}
          >
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`py-2 rounded-xl transition-all cursor-pointer ${
                activeTab === 'all'
                  ? 'bg-[#FFFEFC] dark:bg-[#2B2826] text-[#292725] dark:text-[#F4F1EA] shadow-2xs font-extrabold'
                  : 'text-[#77716B] dark:text-[#ACA59C] hover:text-[#292725]'
              }`}
            >
              الكل
            </button>
            {canAccessPlatformAdmin && (
              <button
                type="button"
                onClick={() => setActiveTab('requests')}
                className={`py-2 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1 ${
                  activeTab === 'requests'
                    ? 'bg-[#FFFEFC] dark:bg-[#2B2826] text-[#743B46] dark:text-[#E5B9C0] shadow-2xs font-extrabold'
                    : 'text-[#77716B] dark:text-[#ACA59C] hover:text-[#292725]'
                }`}
              >
                <span>الاشتراكات</span>
                {pendingRequests.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-[#A64B45] text-white text-[9px] font-bold animate-pulse">
                    {pendingRequests.length}
                  </span>
                )}
              </button>
            )}
            <button
              type="button"
              onClick={() => setActiveTab('appointments')}
              className={`py-2 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1 ${
                activeTab === 'appointments'
                  ? 'bg-[#FFFEFC] dark:bg-[#2B2826] text-[#292725] dark:text-[#F4F1EA] shadow-2xs font-extrabold'
                  : 'text-[#77716B] dark:text-[#ACA59C] hover:text-[#292725]'
              }`}
            >
              <span>مواعيد</span>
              {dueAppointments.length > 0 && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#A64B45]" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('alerts')}
              className={`py-2 rounded-xl transition-all cursor-pointer ${
                activeTab === 'alerts'
                  ? 'bg-[#FFFEFC] dark:bg-[#2B2826] text-[#292725] dark:text-[#F4F1EA] shadow-2xs font-extrabold'
                  : 'text-[#77716B] dark:text-[#ACA59C] hover:text-[#292725]'
              }`}
            >
              تنبيهات
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('sounds')}
              className={`py-2 rounded-xl transition-all cursor-pointer ${
                activeTab === 'sounds'
                  ? 'bg-[#FFFEFC] dark:bg-[#2B2826] text-[#743B46] dark:text-[#E5B9C0] shadow-2xs font-extrabold'
                  : 'text-[#77716B] dark:text-[#ACA59C] hover:text-[#292725]'
              }`}
            >
              الإعدادات
            </button>
          </div>
        </div>

        {/* List Content */}
        <div className="px-4 py-3 space-y-3 overflow-y-auto flex-1">
          {activeTab === 'sounds' ? (
            <SoundSettingsPanel
              compact
              onShowToast={showToast}
              onEnablePush={handleEnablePush}
              enablingPush={enablingPush}
            />
          ) : (
            <>
              {/* Background Push Quick Strip */}
              <div className="p-3 rounded-2xl bg-[#FFFEFC] dark:bg-[#22201F] border border-[#E7E1D8] dark:border-[#383431] flex items-center justify-between gap-2.5 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-[#F0ECE5] dark:bg-[#2B2826] text-[#743B46] dark:text-[#E5B9C0] flex items-center justify-center shrink-0">
                    <Smartphone className="w-4 h-4" />
                  </div>
                  <span className="text-[#5C554E] dark:text-[#CFC8BE] font-semibold leading-snug">
                    استلام تنبيهات المواعيد حتى عند إغلاق التطبيق
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleEnablePush}
                  disabled={enablingPush}
                  className="min-h-[34px] px-3 rounded-xl bg-[#743B46] hover:bg-[#5D2D37] text-white font-bold text-[11px] shrink-0 transition-colors cursor-pointer"
                >
                  {enablingPush ? 'جاري التفعيل...' : 'تفعيل'}
                </button>
              </div>

              {/* Platform Admin Registration Requests Card List */}
              {canAccessPlatformAdmin && (activeTab === 'all' || activeTab === 'requests') && pendingRequests.length > 0 && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2 px-1">
                    <div className="flex items-center gap-1.5 text-xs font-extrabold text-[#743B46] dark:text-[#E5B9C0]">
                      <UserCheck className="w-4 h-4" />
                      <span>طلبات اشتراك جديدة بانتظار الاعتماد ({pendingRequests.length})</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        setActiveScreen('platform_admin');
                      }}
                      className="text-[11px] font-bold text-[#A77B35] dark:text-[#E2B76D] hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <span>لوحة الإدارة الكاملة</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>

                  {pendingRequests.map((req) => (
                    <div
                      key={req.workspaceId}
                      className="p-3.5 rounded-2xl bg-[#FFFDF9] dark:bg-[#1E1C1A] border-2 border-[#A77B35]/40 dark:border-[#A77B35]/60 shadow-xs space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2.5 min-w-0">
                          <div className="w-9 h-9 rounded-xl bg-[#A77B35]/15 text-[#A77B35] flex items-center justify-center shrink-0 mt-0.5">
                            <UserCheck className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-extrabold text-[#292725] dark:text-[#F4F1EA] truncate">
                                {req.applicantName}
                              </span>
                              <span className="px-2 py-0.5 rounded-md bg-[#A77B35]/15 text-[#A77B35] text-[10px] font-bold shrink-0">
                                طلب اشتراك جديد
                              </span>
                            </div>
                            <div className="text-xs text-[#77716B] dark:text-[#ACA59C] mt-0.5 font-mono truncate" dir="ltr">
                              {req.applicantEmail}
                            </div>
                            <div className="text-[11px] text-[#77716B] dark:text-[#ACA59C] mt-1">
                              مساحة العمل: <span className="font-semibold text-[#292725] dark:text-[#F4F1EA]">{req.workspaceName}</span>
                              {req.requestedPlanId && (
                                <span className="mr-2">· الباقة: <span className="font-semibold text-[#743B46] dark:text-[#E5B9C0]">{req.requestedPlanId === 'trial' ? 'تجريبي (14 يومًا)' : 'شهري'}</span></span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-2 border-t border-[#EFECE6] dark:border-[#2E2B28]">
                        <button
                          type="button"
                          disabled={isApprovingId === req.workspaceId}
                          onClick={() => handleQuickApprove(req)}
                          className="flex-1 min-h-[34px] px-3 rounded-xl bg-[#52765D] hover:bg-[#41604B] text-white text-xs font-extrabold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>{isApprovingId === req.workspaceId ? 'جاري الاعتماد...' : 'قبول واعتماد الحساب'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            setActiveScreen('platform_admin');
                          }}
                          className="min-h-[34px] px-3 rounded-xl bg-[#EFECE6] hover:bg-[#E5DFD6] dark:bg-[#2B2826] dark:hover:bg-[#383431] text-[#292725] dark:text-[#F4F1EA] text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer border border-[#E7E1D8] dark:border-[#383431]"
                        >
                          <span>خيارات متقدمة</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Empty state for requests tab when no pending requests exist */}
              {canAccessPlatformAdmin && activeTab === 'requests' && pendingRequests.length === 0 && (
                <div className="py-8 text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 mx-auto flex items-center justify-center">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div className="text-sm font-extrabold text-[#292725] dark:text-[#F4F1EA]">
                    لا توجد طلبات اشتراك جديدة معلقة
                  </div>
                  <p className="text-xs text-[#77716B] dark:text-[#ACA59C] max-w-xs mx-auto">
                    تمت معالجة كافة طلبات المشتركين أو لا توجد تسجيلات جديدة بانتظار المراجعة حاليًا.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      setActiveScreen('platform_admin');
                    }}
                    className="px-4 py-2 rounded-xl bg-[#743B46] text-white text-xs font-bold hover:bg-[#5D2D37] transition-colors cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <span>فتح لوحة إدارة المنصة</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Cleanup Bar */}
              {(filteredNotifications.length > 0 || dueAppointments.length > 0) && (
                <div className="flex items-center justify-between gap-2 px-1 pb-1 text-xs">
                  <span className="text-[11px] font-semibold text-[#77716B] dark:text-[#ACA59C]">
                    {filteredNotifications.length + dueAppointments.length} إشعار وتنبيه
                  </span>
                  <button
                    type="button"
                    onClick={handleCleanAll}
                    disabled={isCleaning}
                    className="px-2.5 py-1 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 font-bold text-[11px] flex items-center gap-1 transition-colors cursor-pointer border border-rose-200 dark:border-rose-900/60"
                    title="حذف واستبعاد كافة الإشعارات وتنظيف القائمة"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>{isCleaning ? 'جاري التنظيف...' : 'تنظيف الإشعارات'}</span>
                  </button>
                </div>
              )}

              {/* Active Due & Overdue Appointments Cards — Styled Like Reference Image Cards */}
              {dueAppointments.map((appt) => {
                const diffMin = getMinutesUntilAden(appt.scheduledDate, appt.scheduledTime);
                const formatted = buildAppointmentNotificationPayload(
                  {
                    id: appt.id,
                    title: appt.title,
                    taxpayerName: appt.taxpayerName,
                    taxpayerId: appt.taxpayerId,
                    propertyTitle: appt.propertyTitle,
                    propertyId: appt.propertyId,
                    scheduledDate: appt.scheduledDate,
                    scheduledTime: appt.scheduledTime,
                    locationText: appt.locationText,
                  },
                  diffMin
                );
                const isOverdue = formatted.isOverdue;

                return (
                  <div
                    key={appt.id}
                    onClick={() => handleOpenAppointment(appt.id)}
                    className="p-4 rounded-2xl bg-[#FFFEFC] dark:bg-[#22201F] border border-[#E7E1D8] dark:border-[#383431] hover:border-[#743B46] dark:hover:border-[#E5B9C0] hover:shadow-xs space-y-2.5 cursor-pointer transition-all active:scale-[0.99]"
                    title="انقر لفتح الموعد والانتقال المباشر للسجل"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                            isOverdue
                              ? 'bg-[#F6E9E7] dark:bg-[#3F2321] text-[#A64B45]'
                              : 'bg-[#F6EFE2] dark:bg-[#3D311E] text-[#A77B35]'
                          }`}
                        >
                          {isOverdue ? (
                            <AlertTriangle className="w-4 h-4" />
                          ) : (
                            <Clock className="w-4 h-4" />
                          )}
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs sm:text-sm font-extrabold text-[#292725] dark:text-[#F4F1EA]">
                              {isOverdue ? 'موعد متأخر' : 'تنبيه موعد مستحق'}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                                isOverdue
                                  ? 'bg-[#F6E9E7] dark:bg-[#3F2321] text-[#A64B45] dark:text-[#F2A7A2]'
                                  : 'bg-[#F6EFE2] dark:bg-[#3D311E] text-[#8C6223] dark:text-[#E5C185]'
                              }`}
                            >
                              {isOverdue ? 'متأخر' : 'قريب'}
                            </span>
                          </div>
                          <div className="text-xs font-bold text-[#292725] dark:text-[#F4F1EA] mt-1">
                            {appt.taxpayerName}
                          </div>
                          <p className="text-[11px] text-[#77716B] dark:text-[#ACA59C] mt-0.5 leading-relaxed">
                            {formatted.body}
                          </p>
                        </div>
                      </div>

                      <span className="text-[11px] font-mono text-[#77716B] dark:text-[#ACA59C] shrink-0">
                        {formatTimeTo12Hour(appt.scheduledTime)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-[#EFECE6] dark:border-[#383431]">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenAppointment(appt.id);
                        }}
                        className="flex-1 min-h-[34px] px-3 rounded-xl bg-[#743B46] hover:bg-[#5D2D37] text-white text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>فتح الموعد والسجل</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSnooze(appt);
                        }}
                        className="min-h-[34px] px-3 rounded-xl bg-[#F0ECE5] hover:bg-[#E5DFD5] dark:bg-[#2B2826] text-[#292725] dark:text-[#F4F1EA] text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>تأجيل 15 د</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDismissDueAppointment(appt.id);
                        }}
                        className="min-h-[34px] px-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-[#2B2826] dark:hover:bg-[#383431] text-slate-500 hover:text-rose-600 dark:text-[#ACA59C] text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                        title="إخفاء التنبيه من قائمة الإشعارات"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>إخفاء</span>
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Stored Notifications List — Styled Like Reference Image Cards */}
              {filteredNotifications.length === 0 && dueAppointments.length === 0 ? (
                <div className="p-8 text-center rounded-2xl bg-[#FFFEFC] dark:bg-[#22201F] border border-[#E7E1D8] dark:border-[#383431]">
                  <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-[#52765D]" />
                  <div className="text-sm font-extrabold text-[#292725] dark:text-[#F4F1EA]">
                    لا توجد تنبيهات معلقة
                  </div>
                  <div className="text-xs text-[#77716B] dark:text-[#ACA59C] mt-1">
                    جميع المواعيد والالتزامات محدثة وفق توقيت عدن.
                  </div>
                </div>
              ) : (
                filteredNotifications.map((notif) => {
                  const isAppt = notif.category === 'appointment';
                  const createdDate =
                    typeof notif.createdAt === 'string' || typeof notif.createdAt === 'number'
                      ? new Date(notif.createdAt)
                      : notif.createdAt && typeof (notif.createdAt as { toDate?: () => Date }).toDate === 'function'
                      ? (notif.createdAt as { toDate: () => Date }).toDate()
                      : null;
                  const timeLabel =
                    createdDate && !Number.isNaN(createdDate.getTime())
                      ? formatTimeTo12Hour(createdDate)
                      : '';

                  return (
                    <div
                      key={notif.id}
                      onClick={() => handleNotificationClick(notif)}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer hover:border-[#743B46] dark:hover:border-[#E5B9C0] hover:shadow-xs active:scale-[0.99] ${
                        !notif.isRead
                          ? 'bg-[#FFFEFC] dark:bg-[#22201F] border-[#D5C7B8] dark:border-[#4A423D] shadow-2xs'
                          : 'bg-[#FFFEFC]/80 dark:bg-[#22201F]/80 border-[#E7E1D8] dark:border-[#383431]'
                      }`}
                      title="انقر للانتقال المباشر إلى السجل المعروض"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-3">
                          <div
                            className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                              isAppt
                                ? 'bg-[#F6EFE2] dark:bg-[#3D311E] text-[#A77B35]'
                                : 'bg-[#ECF2EE] dark:bg-[#1E2822] text-[#52765D]'
                            }`}
                          >
                            {isAppt ? (
                              <Bell className="w-4 h-4" />
                            ) : (
                              <CheckCircle2 className="w-4 h-4" />
                            )}
                          </div>
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs sm:text-sm font-extrabold text-[#292725] dark:text-[#F4F1EA]">
                                {notif.title}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                                  isAppt
                                    ? 'bg-[#F6EFE2] dark:bg-[#3D311E] text-[#8C6223] dark:text-[#E5C185]'
                                    : 'bg-[#ECF2EE] dark:bg-[#1E2822] text-[#52765D] dark:text-[#9AC2A6]'
                                }`}
                              >
                                {isAppt ? 'موعد' : 'إنجاز'}
                              </span>
                            </div>
                            <p className="text-[11px] text-[#77716B] dark:text-[#ACA59C] mt-1 leading-relaxed">
                              {notif.message}
                            </p>
                            <div className="flex items-center gap-1.5 mt-2 text-[10px] font-bold text-[#743B46] dark:text-[#E5B9C0]">
                              <ExternalLink className="w-3 h-3" />
                              <span>انقر للانتقال المباشر للسجل</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {timeLabel && (
                            <span className="text-[11px] font-mono text-[#77716B] dark:text-[#ACA59C]">
                              {timeLabel}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteNotification(notif.id);
                            }}
                            className="w-7 h-7 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-950/50 text-slate-400 hover:text-rose-600 flex items-center justify-center transition-colors cursor-pointer"
                            title="حذف هذا الإشعار"
                            aria-label="حذف هذا الإشعار"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}

              {/* Bottom "عرض الكل" Button — Matching Reference Image */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    setActiveScreen('appointments');
                  }}
                  className="w-full min-h-[44px] rounded-2xl bg-[#EFECE6] hover:bg-[#E5DFD5] dark:bg-[#2B2826] dark:hover:bg-[#383431] border border-[#E2DBD0] dark:border-[#3E3936] text-[#292725] dark:text-[#F4F1EA] text-xs font-extrabold flex items-center justify-center transition-colors cursor-pointer"
                >
                  عرض الكل
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

