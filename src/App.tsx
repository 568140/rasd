/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, lazy } from 'react';
import {
  Home,
  Building2,
  Users,
  Mic,
  CalendarClock,
  MoreHorizontal,
  Menu,
  ShieldCheck,
  ArrowRight,
  Moon,
  Sun,
  Download,
  X,
  Wifi,
  WifiOff,
  RefreshCw,
  Bell,
  Palette,
  User,
} from 'lucide-react';
import { RasdProvider, useRasd } from './context/RasdContext';
import { ActiveAlertBanner } from './components/ActiveAlertBanner';
import { themeEngine } from './services/themeEngine';
import { alertSound } from './services/alertSound';
import { evaluateAppointmentStatus, sanitizeReminderMinutes } from './utils/dateUtils';
import { usePWAInstall } from './hooks/usePWAInstall';
import { useLiveAdenClock } from './hooks/useLiveAdenClock';
import { ScreenId } from './types/rasd';

// Dynamic Code-Splitting (React.lazy) for all screens and heavy modals
const AuthScreen = lazy(() =>
  import('./components/AuthScreen').then((m) => ({ default: m.AuthScreen }))
);
const RegistrationApprovalGateScreen = lazy(() =>
  import('./components/RegistrationApprovalGateScreen').then((m) => ({
    default: m.RegistrationApprovalGateScreen,
  }))
);
const HomeScreen = lazy(() =>
  import('./components/HomeScreen').then((m) => ({ default: m.HomeScreen }))
);
const PropertiesScreen = lazy(() =>
  import('./components/PropertiesScreen').then((m) => ({ default: m.PropertiesScreen }))
);
const TaxpayersScreen = lazy(() =>
  import('./components/TaxpayersScreen').then((m) => ({ default: m.TaxpayersScreen }))
);
const VoiceAssistantScreen = lazy(() =>
  import('./components/VoiceAssistantScreen').then((m) => ({ default: m.VoiceAssistantScreen }))
);
const AppointmentsScreen = lazy(() =>
  import('./components/AppointmentsScreen').then((m) => ({ default: m.AppointmentsScreen }))
);
const FieldVisitsScreen = lazy(() =>
  import('./components/FieldVisitsScreen').then((m) => ({ default: m.FieldVisitsScreen }))
);
const MapScreen = lazy(() =>
  import('./components/MapScreen').then((m) => ({ default: m.MapScreen }))
);
const FinancialsScreen = lazy(() =>
  import('./components/FinancialsScreen').then((m) => ({ default: m.FinancialsScreen }))
);
const ReportsScreen = lazy(() =>
  import('./components/ReportsScreen').then((m) => ({ default: m.ReportsScreen }))
);
const TeamScreen = lazy(() =>
  import('./components/TeamScreen').then((m) => ({ default: m.TeamScreen }))
);
const AuditLogScreen = lazy(() =>
  import('./components/AuditLogScreen').then((m) => ({ default: m.AuditLogScreen }))
);
const MoreScreen = lazy(() =>
  import('./components/MoreScreen').then((m) => ({ default: m.MoreScreen }))
);
const PlatformAdminScreen = lazy(() =>
  import('./components/PlatformAdminScreen').then((m) => ({ default: m.PlatformAdminScreen }))
);
const NotificationCenterModal = lazy(() =>
  import('./components/NotificationCenterModal').then((m) => ({ default: m.NotificationCenterModal }))
);
const ThemeSelectorModal = lazy(() =>
  import('./components/ThemeSelectorModal').then((m) => ({ default: m.ThemeSelectorModal }))
);
const TempVapidGenerator = lazy(() =>
  import('./components/TempVapidGenerator').then((m) => ({ default: m.TempVapidGenerator }))
);

// Isolated memoized clock badge so 1-second ticks only update this tiny span, not the whole app shell
const HeaderClockBadge: React.FC = React.memo(() => {
  const liveClock = useLiveAdenClock(1000);
  return (
    <span className="font-mono text-[10px] font-bold text-slate-300 inline-flex items-center gap-1 tabular-nums">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block"></span>
      <span>{liveClock.timeStr}</span>
    </span>
  );
});
HeaderClockBadge.displayName = 'HeaderClockBadge';

// Lightweight skeleton fallback during dynamic screen chunk loading
const ScreenFallback: React.FC = () => (
  <div className="py-12 flex flex-col items-center justify-center gap-3 text-center" dir="rtl">
    <div className="w-10 h-10 rounded-2xl bg-[#0B192C]/10 dark:bg-white/10 text-[#0B192C] dark:text-[#B48327] flex items-center justify-center">
      <RefreshCw className="w-5 h-5 animate-spin" />
    </div>
    <div className="text-xs font-bold text-[#64748B] dark:text-slate-400">
      جاري تحميل الشاشة...
    </div>
  </div>
);

const SCREEN_TITLES: Record<ScreenId, string> = {
  home: 'رَصْد — المساعد الميداني',
  taxpayers: 'دافعو الضرائب',
  properties: 'العقارات',
  voice: 'المساعد الصوتي',
  appointments: 'المواعيد',
  more: 'المزيد',
  visits: 'الزيارات الميدانية',
  map: 'العقارات والمواقع',
  assessments: 'المؤشرات المالية',
  transactions: 'المعاملات المالية',
  reports: 'التقارير',
  team: 'الفريق',
  audit: 'التدقيق',
  notifications: 'الإشعارات',
  settings: 'الإعدادات',
  platform_admin: 'لوحة المالك',
};

const PRIMARY_TABS: { id: ScreenId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'home', label: 'المنزل', icon: Home },
  { id: 'appointments', label: 'المواعيد', icon: CalendarClock },
  { id: 'properties', label: 'العقارات', icon: Building2 },
  { id: 'taxpayers', label: 'دافعو الضرائب', icon: Users },
  { id: 'more', label: 'المزيد', icon: MoreHorizontal },
];

const RasdShell: React.FC = () => {
  const {
    authReady,
    firebaseUser,
    userProfile,
    workspace,
    isPlatformAdmin,
    isOnline,
    pendingSyncCount,
    activeScreen,
    setActiveScreen,
    selectedPropertyId,
    setSelectedPropertyId,
    selectedTaxpayerId,
    setSelectedTaxpayerId,
    setSelectedAppointmentId,
    appointments,
    notifications,
    darkMode,
    toggleDarkMode,
    toasts,
    dismissToast,
    showToast,
    accountApprovalStatus,
    canAccessWorkScreens,
    canAccessPlatformAdmin,
    ownerSessionDiagnostic,
    receivedRegistrationRequests,
  } = useRasd();

  const [isNotifOpen, setIsNotifOpen] = React.useState(false);
  const [isThemeModalOpen, setIsThemeModalOpen] = React.useState(false);
  const [defaultReminderMins, setDefaultReminderMins] = React.useState<number>(() =>
    alertSound.getDefaultReminderMinutes()
  );
  const [isVapidToolOpen, setIsVapidToolOpen] = React.useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('vapid') === '1' || window.location.hash === '#vapid';
    }
    return false;
  });

  React.useEffect(() => {
    themeEngine.applyToDOM();
    return alertSound.subscribe((updated) => {
      setDefaultReminderMins(updated.defaultReminderMinutes);
    });
  }, []);

  // Deep-link handling for Notification clicks (URL query params + Service Worker postMessage + local Notification click)
  React.useEffect(() => {
    if (typeof window === 'undefined') return;

    const applyDeepLink = (payload: {
      screen?: string | null;
      appointmentId?: string | null;
      taxpayerId?: string | null;
      propertyId?: string | null;
      url?: string | null;
    }) => {
      let screen = payload.screen;
      let appointmentId = payload.appointmentId;
      let taxpayerId = payload.taxpayerId;
      let propertyId = payload.propertyId;

      if (payload.url) {
        try {
          const parsedUrl = new URL(payload.url, window.location.origin);
          screen = screen || parsedUrl.searchParams.get('screen');
          appointmentId =
            appointmentId ||
            parsedUrl.searchParams.get('appointmentId') ||
            parsedUrl.searchParams.get('id');
          taxpayerId = taxpayerId || parsedUrl.searchParams.get('taxpayerId');
          propertyId = propertyId || parsedUrl.searchParams.get('propertyId');
        } catch {
          // ignore invalid URL
        }
      }

      if (appointmentId) {
        setSelectedAppointmentId(appointmentId);
        setActiveScreen('appointments');
        return;
      }

      if (taxpayerId && taxpayerId !== 'general_tp') {
        setSelectedTaxpayerId(taxpayerId);
        if (propertyId && propertyId !== 'general_prop') {
          setSelectedPropertyId(propertyId);
        }
        setActiveScreen('taxpayers');
        return;
      }

      if (screen && screen in SCREEN_TITLES) {
        setActiveScreen(screen as ScreenId);
      }
    };

    // 1. Check initial URL query parameters on load
    const params = new URLSearchParams(window.location.search);
    const urlScreen = params.get('screen');
    const urlApptId = params.get('appointmentId') || params.get('id');
    const urlTpId = params.get('taxpayerId');
    const urlPropId = params.get('propertyId');

    if (urlScreen || urlApptId || urlTpId) {
      applyDeepLink({
        screen: urlScreen,
        appointmentId: urlApptId,
        taxpayerId: urlTpId,
        propertyId: urlPropId,
      });
      // Clean URL query params without reloading
      if (!params.get('vapid')) {
        window.history.replaceState({}, '', window.location.pathname);
      }
    }

    // 2. Listen for Service Worker RASD_NOTIFICATION_CLICK message
    const handleSwMessage = (event: MessageEvent) => {
      const msg = event.data;
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'RASD_NOTIFICATION_CLICK' && msg.data) {
        applyDeepLink({
          url: msg.data.url,
          appointmentId: msg.data.appointmentId,
          taxpayerId: msg.data.taxpayerId,
          propertyId: msg.data.propertyId,
        });
      }
    };

    // 3. Listen for local Notification click event
    const handleLocalNotifClick = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail && typeof detail === 'object') {
        applyDeepLink({
          url: detail.url,
          appointmentId: detail.appointmentId,
          taxpayerId: detail.taxpayerId,
          propertyId: detail.propertyId,
        });
      }
    };

    navigator.serviceWorker?.addEventListener('message', handleSwMessage);
    window.addEventListener('rasd:notification-click', handleLocalNotifClick);

    return () => {
      navigator.serviceWorker?.removeEventListener('message', handleSwMessage);
      window.removeEventListener('rasd:notification-click', handleLocalNotifClick);
    };
  }, [setActiveScreen, setSelectedAppointmentId, setSelectedPropertyId, setSelectedTaxpayerId]);

  // Evaluate due badge on a 30-second cadence instead of every 1 second to avoid full-shell re-renders
  const dueClock = useLiveAdenClock(30000);

  const pendingRegistrationCount = React.useMemo(() => {
    if (!canAccessPlatformAdmin) return 0;
    return receivedRegistrationRequests.filter((r) => r.status === 'pending').length;
  }, [canAccessPlatformAdmin, receivedRegistrationRequests]);

  const dueCount = React.useMemo(() => {
    return (
      appointments.filter((a) => {
        const remMins =
          a.reminderMinutesBefore === 0
            ? 0
            : sanitizeReminderMinutes(
                a.reminderMinutesBefore ?? defaultReminderMins,
                defaultReminderMins
              );
        const s = evaluateAppointmentStatus(
          a.status,
          a.scheduledDate,
          a.scheduledTime,
          remMins,
          dueClock.now
        );
        return s === 'due';
      }).length +
      notifications.filter((n) => !n.isRead).length +
      pendingRegistrationCount
    );
  }, [appointments, notifications, defaultReminderMins, dueClock.now, pendingRegistrationCount]);

  const { isInstallable, isInstalled, install } = usePWAInstall();

  if (!authReady || (firebaseUser && accountApprovalStatus === 'checking')) {
    return (
      <div className="min-h-screen bg-[#F4F6F9] dark:bg-[#060D18] flex flex-col items-center justify-center p-6" dir="rtl">
        <div className="w-16 h-16 rounded-3xl bg-[#0B192C] text-[#B48327] border border-[#B48327]/40 flex items-center justify-center mb-4 shadow-md animate-pulse">
          <ShieldCheck className="w-8 h-8" />
        </div>
        <div className="text-base font-extrabold text-[#172334] dark:text-white font-display">
          رَصْد — المساعد الميداني الذكي
        </div>
        <div className="text-xs text-[#64748B] dark:text-slate-400 mt-1.5">
          جاري التحقق من جلسة المصادقة وحالة اعتماد الحساب...
        </div>
      </div>
    );
  }

  // Protect internal screens if user is not authenticated
  if (!firebaseUser) {
    return (
      <>
        {toasts.length > 0 && (
          <div className="fixed top-6 left-4 right-4 z-50 max-w-md mx-auto space-y-2 pointer-events-none" dir="rtl">
            {toasts.map((t) => (
              <div
                key={t.id}
                className={`pointer-events-auto p-3.5 rounded-2xl shadow-lg border text-xs font-semibold flex items-center justify-between gap-2.5 ${
                  t.type === 'error'
                    ? 'bg-red-600 text-white border-red-700'
                    : t.type === 'warning'
                    ? 'bg-amber-600 text-white border-amber-700'
                    : t.type === 'success'
                    ? 'bg-emerald-600 text-white border-emerald-700'
                    : 'bg-[#0B192C] text-white border-[#132A46]'
                }`}
              >
                <span className="leading-relaxed">{t.text}</span>
                <button
                  type="button"
                  onClick={() => dismissToast(t.id)}
                  className="p-1.5 rounded-xl hover:bg-black/15 cursor-pointer shrink-0"
                  aria-label="إغلاق التنبيه"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        <Suspense fallback={<ScreenFallback />}>
          <AuthScreen />
        </Suspense>
      </>
    );
  }

  // بوابة الموافقة على الحسابات الجديدة: منع الوصول إلى شاشات العمل قبل الموافقة أو عند الإيقاف
  if (!canAccessWorkScreens) {
    return (
      <>
        {toasts.length > 0 && (
          <div className="fixed top-6 left-4 right-4 z-50 max-w-md mx-auto space-y-2 pointer-events-none" dir="rtl">
            {toasts.map((t) => (
              <div
                key={t.id}
                className={`pointer-events-auto p-3.5 rounded-2xl shadow-lg border text-xs font-semibold flex items-center justify-between gap-2.5 ${
                  t.type === 'error'
                    ? 'bg-red-600 text-white border-red-700'
                    : t.type === 'warning'
                    ? 'bg-amber-600 text-white border-amber-700'
                    : t.type === 'success'
                    ? 'bg-emerald-600 text-white border-emerald-700'
                    : 'bg-[#0B192C] text-white border-[#132A46]'
                }`}
              >
                <span className="leading-relaxed">{t.text}</span>
                <button
                  type="button"
                  onClick={() => dismissToast(t.id)}
                  className="p-1.5 rounded-xl hover:bg-black/15 cursor-pointer shrink-0"
                  aria-label="إغلاق التنبيه"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        <Suspense fallback={<ScreenFallback />}>
          <RegistrationApprovalGateScreen />
        </Suspense>
      </>
    );
  }

  const isSubScreen = !['home', 'appointments', 'properties', 'taxpayers', 'more'].includes(activeScreen);
  const hasDetailOpen = Boolean(selectedPropertyId || selectedTaxpayerId);
  const isHomeRoot = activeScreen === 'home' && !hasDetailOpen;

  const handleBack = () => {
    if (selectedPropertyId && activeScreen === 'properties') {
      setSelectedPropertyId(null);
      return;
    }
    if (selectedTaxpayerId) {
      setSelectedPropertyId(null);
      setSelectedTaxpayerId(null);
      return;
    }
    if (selectedPropertyId) {
      setSelectedPropertyId(null);
      return;
    }
    setActiveScreen('home');
  };

  const resolvedScreenTitle =
    selectedPropertyId && activeScreen === 'properties'
      ? 'تفاصيل العقار'
      : selectedTaxpayerId && activeScreen === 'taxpayers'
      ? 'تفاصيل المكلف'
      : SCREEN_TITLES[activeScreen] || 'رَصْد';

  return (
    <div className="min-h-screen bg-[#F4F6F9] dark:bg-[#060D18] text-[#172334] dark:text-[#F8FAFC] flex flex-col overflow-x-hidden" dir="rtl">
      {/* Reference-Aligned Deep Navy Top App Header (#081729) */}
      <header
        style={{ backgroundColor: 'var(--rasd-header-bg, #081729)' }}
        className="sticky top-0 z-30 min-h-[60px] text-white border-b border-white/10 px-4 py-2.5 shadow-xs"
      >
        <div className="max-w-5xl mx-auto h-full flex items-center justify-between gap-3">
          {isHomeRoot ? (
            <>
              {/* Right Zone (Start in RTL) on Home: RASD Brand & Golden Shield Emblem */}
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-[#0B192C] border border-[#B48327]/50 text-[#B48327] flex items-center justify-center shrink-0 shadow-2xs">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div className="leading-none">
                  <div className="text-lg font-extrabold tracking-tight text-white font-display">
                    رَصْد
                  </div>
                  <div className="text-[9px] font-mono font-bold tracking-widest text-[#B48327] uppercase mt-0.5">
                    RASD
                  </div>
                </div>
                <div className="hidden sm:flex items-center gap-1.5 mr-2 pr-2.5 border-r border-white/15 text-[11px] text-slate-300">
                  {!isOnline ? (
                    <span className="text-amber-400 font-semibold inline-flex items-center gap-1">
                      <WifiOff className="w-3 h-3" />
                      <span>دون اتصال</span>
                    </span>
                  ) : pendingSyncCount > 0 ? (
                    <span className="text-[#B48327] font-semibold inline-flex items-center gap-1">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      <span>مزامنة ({pendingSyncCount})</span>
                    </span>
                  ) : (
                    <span className="text-emerald-400 font-semibold inline-flex items-center gap-1">
                      <Wifi className="w-3 h-3" />
                      <span>متصل</span>
                    </span>
                  )}
                  <span aria-hidden="true">·</span>
                  <HeaderClockBadge />
                </div>
              </div>

              {/* Center Zone: Desktop Quick Navigation (without Map) */}
              <nav className="hidden lg:flex items-center gap-5 text-xs font-bold text-slate-300">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPropertyId(null);
                    setSelectedTaxpayerId(null);
                    setActiveScreen('taxpayers');
                  }}
                  className="py-1.5 border-b-2 border-transparent hover:text-white transition-colors whitespace-nowrap cursor-pointer"
                >
                  دافعو الضرائب
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPropertyId(null);
                    setSelectedTaxpayerId(null);
                    setActiveScreen('properties');
                  }}
                  className="py-1.5 border-b-2 border-transparent hover:text-white transition-colors whitespace-nowrap cursor-pointer"
                >
                  العقارات
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPropertyId(null);
                    setSelectedTaxpayerId(null);
                    setActiveScreen('visits');
                  }}
                  className="py-1.5 border-b-2 border-transparent hover:text-white transition-colors whitespace-nowrap cursor-pointer"
                >
                  الزيارات الميدانية
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPropertyId(null);
                    setSelectedTaxpayerId(null);
                    setActiveScreen('assessments');
                  }}
                  className="py-1.5 border-b-2 border-transparent hover:text-white transition-colors whitespace-nowrap cursor-pointer"
                >
                  المؤشرات المالية
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPropertyId(null);
                    setSelectedTaxpayerId(null);
                    setActiveScreen('reports');
                  }}
                  className="py-1.5 border-b-2 border-transparent hover:text-white transition-colors whitespace-nowrap cursor-pointer"
                >
                  التقارير
                </button>
                {(isPlatformAdmin ||
                  canAccessPlatformAdmin ||
                  ownerSessionDiagnostic.requiresEmailVerificationForAdmin) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPropertyId(null);
                      setSelectedTaxpayerId(null);
                      setActiveScreen('platform_admin');
                    }}
                    className="py-1.5 border-b-2 border-transparent text-[#B48327] hover:opacity-90 transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5"
                  >
                    <span>لوحة المالك</span>
                    {pendingRegistrationCount > 0 && (
                      <span className="px-1.5 py-0.2 rounded-full bg-red-600 text-white text-[10px] font-bold animate-pulse">
                        {pendingRegistrationCount}
                      </span>
                    )}
                  </button>
                )}
              </nav>

              {/* Left Zone (End in RTL) on Home: Notifications, Voice, Theme, Profile Avatar */}
              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                {!isInstalled && isInstallable && (
                  <button
                    type="button"
                    onClick={install}
                    className="min-h-[36px] px-2.5 rounded-xl bg-[#B48327] hover:bg-[#966B1D] text-white text-xs font-bold flex items-center gap-1 whitespace-nowrap cursor-pointer transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">تثبيت</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setActiveScreen('voice')}
                  className="min-h-[38px] min-w-[38px] rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white flex items-center justify-center transition-colors cursor-pointer"
                  title="المساعد الصوتي الذكي"
                  aria-label="المساعد الصوتي الذكي"
                >
                  <Mic className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setIsThemeModalOpen(true)}
                  className="hidden sm:flex min-h-[38px] px-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 items-center gap-1.5 transition-colors cursor-pointer text-white"
                  title="المظهر والسمة"
                  aria-label="المظهر والسمة"
                >
                  <Palette className="w-4 h-4 text-[#B48327]" />
                </button>

                <button
                  type="button"
                  onClick={toggleDarkMode}
                  className="min-h-[38px] min-w-[38px] rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 flex items-center justify-center transition-colors cursor-pointer text-white"
                  aria-label="تبديل الوضع الليلي والنهاري"
                  title="تبديل الوضع الليلي والنهاري"
                >
                  {darkMode ? (
                    <Sun className="w-4 h-4 text-[#B48327]" />
                  ) : (
                    <Moon className="w-4 h-4 text-slate-200" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setIsNotifOpen(true)}
                  className="relative min-h-[38px] min-w-[38px] rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 flex items-center justify-center transition-colors cursor-pointer text-white"
                  aria-label="مركز الإشعارات والتنبيهات"
                  title="الإشعارات والتنبيهات"
                >
                  <Bell className="w-4 h-4" />
                  {dueCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center shadow-xs tabular-nums">
                      {dueCount > 9 ? '+9' : dueCount}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setActiveScreen('more')}
                  className="relative w-9 h-9 rounded-full bg-slate-200/20 border border-white/25 text-white flex items-center justify-center shrink-0 cursor-pointer hover:border-[#B48327] transition-colors"
                  aria-label="الملف الشخصي والإعدادات"
                  title={userProfile?.displayName || 'الملف الشخصي'}
                >
                  <User className="w-4 h-4" />
                  <span
                    className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-[#081729] ${
                      isOnline ? 'bg-emerald-500' : 'bg-amber-500'
                    }`}
                  />
                </button>
              </div>
            </>
          ) : (
            /* Subscreens Header (Matches Reference Image: Contextual Action on Right, Title Centered, Back Arrow on Left) */
            <>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={handleBack}
                  className="min-h-[38px] min-w-[38px] rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white flex items-center justify-center transition-colors cursor-pointer"
                  aria-label="رجوع"
                  title="رجوع"
                >
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsNotifOpen(true)}
                  className="relative min-h-[38px] min-w-[38px] rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 flex items-center justify-center transition-colors cursor-pointer text-white"
                  aria-label="مركز الإشعارات والتنبيهات"
                >
                  <Bell className="w-4 h-4" />
                  {dueCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                      {dueCount > 9 ? '+9' : dueCount}
                    </span>
                  )}
                </button>
              </div>

              <div className="flex-1 text-center min-w-0 px-2">
                <h1 className="text-base sm:text-lg font-extrabold text-white truncate font-display">
                  {resolvedScreenTitle}
                </h1>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveScreen('voice')}
                  className={`min-h-[38px] min-w-[38px] rounded-xl border flex items-center justify-center transition-colors cursor-pointer ${
                    activeScreen === 'voice'
                      ? 'bg-[#B48327] text-white border-[#B48327]'
                      : 'bg-white/10 hover:bg-white/15 text-white border-white/15'
                  }`}
                  title="المساعد الصوتي الذكي"
                  aria-label="المساعد الصوتي الذكي"
                >
                  <Mic className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setActiveScreen('more')}
                  className="min-h-[38px] min-w-[38px] rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white flex items-center justify-center transition-colors cursor-pointer"
                  aria-label="القائمة والإعدادات"
                  title="القائمة والإعدادات"
                >
                  <Menu className="w-4 h-4" />
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      {/* Real-time In-App Due Appointment Alert Banner */}
      <ActiveAlertBanner />

      {/* Real-time Administrative New Registration Alert Banner for Platform Admins */}
      {canAccessPlatformAdmin && pendingRegistrationCount > 0 && (
        <div className="bg-[#B48327]/15 dark:bg-[#B48327]/25 border-b border-[#B48327]/30 px-4 py-2.5 text-xs flex items-center justify-between gap-3 text-[#8C6223] dark:text-[#E2B76D]">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full bg-[#B48327] animate-ping shrink-0" />
            <span className="font-extrabold truncate">
              يوجد {pendingRegistrationCount} طلب اشتراك جديد بانتظار موافقتك واعتمادك في لوحة الإدارة!
            </span>
          </div>
          <button
            type="button"
            onClick={() => setActiveScreen('platform_admin')}
            className="px-3 py-1.5 rounded-xl bg-[#B48327] hover:bg-[#966B1D] text-white text-xs font-extrabold transition-colors cursor-pointer shrink-0 shadow-xs"
          >
            مراجعة واعتماد الآن
          </button>
        </div>
      )}

      {/* Notification Center Modal (loaded on demand when opened) */}
      {isNotifOpen && (
        <Suspense fallback={null}>
          <NotificationCenterModal
            isOpen={isNotifOpen}
            onClose={() => setIsNotifOpen(false)}
          />
        </Suspense>
      )}

      {/* Theme & Template Studio Modal (loaded on demand when opened) */}
      {isThemeModalOpen && (
        <Suspense fallback={null}>
          <ThemeSelectorModal
            isOpen={isThemeModalOpen}
            onClose={() => setIsThemeModalOpen(false)}
          />
        </Suspense>
      )}

      {/* Temporary Local VAPID Key Generator Modal (Primary Platform Admin Only) */}
      {isPlatformAdmin && isVapidToolOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          dir="rtl"
        >
          <div className="w-full max-w-2xl my-auto">
            <Suspense fallback={<ScreenFallback />}>
              <TempVapidGenerator
                onClose={() => setIsVapidToolOpen(false)}
                onShowToast={showToast}
              />
            </Suspense>
          </div>
        </div>
      )}

      {/* Floating Toast Notifications */}
      {toasts.length > 0 && (
        <div className="fixed top-20 left-4 right-4 z-50 max-w-md mx-auto space-y-2 pointer-events-none">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`pointer-events-auto p-3.5 rounded-2xl shadow-lg border text-xs font-semibold flex items-center justify-between gap-2.5 ${
                t.type === 'error'
                  ? 'bg-red-600 text-white border-red-700'
                  : t.type === 'warning'
                  ? 'bg-amber-600 text-white border-amber-700'
                  : t.type === 'success'
                  ? 'bg-emerald-600 text-white border-emerald-700'
                  : 'bg-[#0B192C] text-white border-[#132A46]'
              }`}
            >
              <span className="leading-relaxed">{t.text}</span>
              <button
                type="button"
                onClick={() => dismissToast(t.id)}
                className="p-1.5 rounded-xl hover:bg-black/15 cursor-pointer shrink-0"
                aria-label="إغلاق التنبيه"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Main Mobile-First Viewport Area with Safe Area Bottom Clearance & Dynamic Screen Suspense */}
      <main className="flex-1 w-full max-w-5xl mx-auto px-3.5 sm:px-5 pt-4 pb-safe-nav">
        <Suspense fallback={<ScreenFallback />}>
          {activeScreen === 'home' && <HomeScreen />}
          {activeScreen === 'properties' && <PropertiesScreen />}
          {activeScreen === 'taxpayers' && <TaxpayersScreen />}
          {activeScreen === 'voice' && <VoiceAssistantScreen />}
          {activeScreen === 'appointments' && <AppointmentsScreen />}
          {activeScreen === 'visits' && <FieldVisitsScreen />}
          {activeScreen === 'map' && <MapScreen />}
          {activeScreen === 'assessments' && <FinancialsScreen initialTab="assessments" />}
          {activeScreen === 'transactions' && <FinancialsScreen initialTab="transactions" />}
          {activeScreen === 'reports' && <ReportsScreen />}
          {activeScreen === 'team' && <TeamScreen />}
          {activeScreen === 'audit' && <AuditLogScreen />}
          {activeScreen === 'platform_admin' && <PlatformAdminScreen />}
          {(activeScreen === 'more' || activeScreen === 'notifications' || activeScreen === 'settings') && (
            <MoreScreen />
          )}
        </Suspense>
      </main>

      {/* Fixed 5-Item Reference Bottom Navigation Bar (#FFFFFF, clean icons, RTL order) */}
      <nav
        aria-label="التنقل الرئيسي"
        className="fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-[#0D1829] border-t border-[#E2E8F0] dark:border-slate-800 bottom-nav-safe shadow-[0_-2px_12px_rgba(11,25,44,0.04)]"
      >
        <div className="max-w-lg mx-auto h-[64px] grid grid-cols-5 items-center px-1.5">
          {PRIMARY_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive =
              activeScreen === tab.id ||
              (tab.id === 'more' && isSubScreen);
            const isHomeTab = tab.id === 'home';

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setSelectedPropertyId(null);
                  setSelectedTaxpayerId(null);
                  setActiveScreen(tab.id);
                }}
                className={`relative min-h-[52px] flex flex-col items-center justify-center rounded-xl transition-all cursor-pointer ${
                  isActive
                    ? isHomeTab
                      ? 'text-[#B48327] font-extrabold'
                      : 'text-[#0B192C] dark:text-[#B48327] font-extrabold'
                    : 'text-[#64748B] dark:text-slate-400 hover:text-[#172334] dark:hover:text-white font-medium'
                }`}
              >
                <div className="relative flex items-center justify-center">
                  <Icon className="w-5 h-5" />
                  {tab.id === 'appointments' && dueCount > 0 && (
                    <span className="absolute -top-1 -right-2 min-w-[15px] h-[15px] px-1 rounded-full bg-red-600 text-white text-[9px] font-bold flex items-center justify-center tabular-nums">
                      {dueCount > 9 ? '+9' : dueCount}
                    </span>
                  )}
                  {tab.id === 'more' && pendingRegistrationCount > 0 && (
                    <span className="absolute -top-1 -right-2 min-w-[15px] h-[15px] px-1 rounded-full bg-red-600 text-white text-[9px] font-bold flex items-center justify-center animate-pulse tabular-nums">
                      {pendingRegistrationCount}
                    </span>
                  )}
                </div>
                <span className="text-[11px] mt-1 whitespace-nowrap leading-none">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

export default function App() {
  return (
    <RasdProvider>
      <RasdShell />
    </RasdProvider>
  );
}
