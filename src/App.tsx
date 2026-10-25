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
    <span className="font-mono text-[10px] font-bold text-[#743B46] dark:text-[#E5B9C0] inline-flex items-center gap-1">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block"></span>
      <span>{liveClock.timeStr}</span>
    </span>
  );
});
HeaderClockBadge.displayName = 'HeaderClockBadge';

// Lightweight skeleton fallback during dynamic screen chunk loading
const ScreenFallback: React.FC = () => (
  <div className="py-12 flex flex-col items-center justify-center gap-3 text-center" dir="rtl">
    <div className="w-10 h-10 rounded-2xl bg-[#743B46]/10 dark:bg-[#743B46]/25 text-[#743B46] dark:text-[#E5B9C0] flex items-center justify-center">
      <RefreshCw className="w-5 h-5 animate-spin" />
    </div>
    <div className="text-xs font-bold text-[#77716B] dark:text-[#ACA59C]">
      جاري تحميل الشاشة...
    </div>
  </div>
);

const SCREEN_TITLES: Record<ScreenId, string> = {
  home: 'رَصْد — المساعد الميداني',
  taxpayers: 'المكلفون والمنشآت',
  properties: 'العقارات والوحدات',
  voice: 'المساعد الصوتي الذكي',
  appointments: 'المواعيد والتذكيرات',
  more: 'المزيد والإعدادات',
  visits: 'الزيارات الميدانية',
  map: 'الخريطة الميدانية',
  assessments: 'التقييمات المالية',
  transactions: 'المعاملات المالية',
  reports: 'التقارير والإحصاءات',
  team: 'الفريق والصلاحيات',
  audit: 'سجل التدقيق الأمني',
  notifications: 'الإشعارات والتنبيهات',
  settings: 'الإعدادات',
  platform_admin: 'لوحة إدارة منصة رَصْد',
};

const PRIMARY_TABS: { id: ScreenId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'home', label: 'الرئيسية', icon: Home },
  { id: 'appointments', label: 'المواعيد', icon: CalendarClock },
  { id: 'properties', label: 'العقارات', icon: Building2 },
  { id: 'taxpayers', label: 'المكلفون', icon: Users },
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
      }).length + notifications.filter((n) => !n.isRead).length
    );
  }, [appointments, notifications, defaultReminderMins, dueClock.now]);

  const { isInstallable, isInstalled, install } = usePWAInstall();

  if (!authReady || (firebaseUser && accountApprovalStatus === 'checking')) {
    return (
      <div className="min-h-screen bg-[#F7F5F0] dark:bg-[#161514] flex flex-col items-center justify-center p-6" dir="rtl">
        <div className="w-16 h-16 rounded-3xl bg-[#743B46] text-white flex items-center justify-center mb-4 shadow-md animate-pulse">
          <ShieldCheck className="w-8 h-8" />
        </div>
        <div className="text-base font-extrabold text-[#292725] dark:text-[#F4F1EA] font-display">
          رَصْد — المساعد الميداني الذكي
        </div>
        <div className="text-xs text-[#77716B] dark:text-[#ACA59C] mt-1.5">
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
                    ? 'bg-[#A64B45] text-white border-[#8E3B36]'
                    : t.type === 'warning'
                    ? 'bg-[#A77B35] text-white border-[#8D662A]'
                    : t.type === 'success'
                    ? 'bg-[#52765D] text-white border-[#41604B]'
                    : 'bg-[#743B46] text-white border-[#5D2D37]'
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
                    ? 'bg-[#A64B45] text-white border-[#8E3B36]'
                    : t.type === 'warning'
                    ? 'bg-[#A77B35] text-white border-[#8D662A]'
                    : t.type === 'success'
                    ? 'bg-[#52765D] text-white border-[#41604B]'
                    : 'bg-[#743B46] text-white border-[#5D2D37]'
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

  const roleLabel = isPlatformAdmin ? 'مدير النظام' : userProfile?.jobTitle || 'مسؤول ميداني';

  return (
    <div className="min-h-screen bg-[#F7F5F0] dark:bg-[#161514] text-[#292725] dark:text-[#F4F1EA] flex flex-col" dir="rtl">
      {/* Reference-Aligned Top App Header */}
      <header className="sticky top-0 z-30 min-h-[70px] bg-[#F7F5F0]/95 dark:bg-[#161514]/95 backdrop-blur-md border-b border-[#E7E1D8] dark:border-[#383431] px-4 py-2.5">
        <div className="max-w-5xl mx-auto h-full flex items-center justify-between gap-3">
          {/* Right Zone (Start in RTL): User Greeting Stack on Home, or Back + Screen Title on Subscreens */}
          <div className="flex items-center gap-3 min-w-0">
            {isHomeRoot ? (
              <>
                <button
                  type="button"
                  onClick={() => setActiveScreen('more')}
                  className="w-11 h-11 rounded-full bg-[#EFECE6] dark:bg-[#2B2826] border border-[#DFD8CE] dark:border-[#3E3936] text-[#5C554E] dark:text-[#D5CFC7] flex items-center justify-center shrink-0 cursor-pointer hover:border-[#743B46] transition-colors"
                  aria-label="الملف الشخصي والإعدادات"
                >
                  <User className="w-5 h-5" />
                </button>
                <div className="min-w-0">
                  <div className="text-[11px] font-medium text-[#77716B] dark:text-[#ACA59C] leading-none">
                    مرحبًا بك
                  </div>
                  <div className="text-sm sm:text-base font-extrabold text-[#292725] dark:text-[#F4F1EA] truncate leading-snug mt-0.5 font-display">
                    {userProfile?.displayName || 'المسؤول الميداني'}
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-[#77716B] dark:text-[#ACA59C] truncate">
                    <span className="truncate">
                      {workspace?.name || 'مساحة رَصْد'} - {roleLabel}
                    </span>
                    <span aria-hidden="true">·</span>
                    {!isOnline ? (
                      <span className="text-[#A77B35] font-semibold inline-flex items-center gap-1 shrink-0">
                        <WifiOff className="w-3 h-3" />
                        <span>دون اتصال</span>
                      </span>
                    ) : pendingSyncCount > 0 ? (
                      <span className="text-[#743B46] dark:text-[#E5B9C0] font-semibold inline-flex items-center gap-1 shrink-0">
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        <span>مزامنة ({pendingSyncCount})</span>
                      </span>
                    ) : (
                      <span className="text-[#52765D] dark:text-[#86B394] font-semibold inline-flex items-center gap-1 shrink-0">
                        <Wifi className="w-3 h-3" />
                        <span>متصل</span>
                      </span>
                    )}
                    <span aria-hidden="true">·</span>
                    <HeaderClockBadge />
                  </div>
                </div>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleBack}
                  className="min-h-[42px] min-w-[42px] rounded-2xl bg-[#EFECE6] hover:bg-[#E5DFD6] dark:bg-[#2B2826] dark:hover:bg-[#383431] text-[#292725] dark:text-[#F4F1EA] flex items-center justify-center transition-colors cursor-pointer shrink-0 border border-[#E7E1D8] dark:border-[#383431]"
                  aria-label="رجوع"
                >
                  <ArrowRight className="w-5 h-5" />
                </button>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm sm:text-base font-extrabold tracking-tight text-[#292725] dark:text-[#F4F1EA] truncate font-display">
                      {SCREEN_TITLES[activeScreen] || 'رَصْد'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-[#77716B] dark:text-[#ACA59C] truncate">
                    <span className="truncate">{userProfile?.displayName || 'المسؤول الميداني'}</span>
                    <span aria-hidden="true">·</span>
                    {!isOnline ? (
                      <span className="text-[#A77B35] font-medium inline-flex items-center gap-1">
                        <WifiOff className="w-3 h-3" />
                        <span>دون اتصال</span>
                      </span>
                    ) : pendingSyncCount > 0 ? (
                      <span className="text-[#743B46] dark:text-[#E5B9C0] font-medium inline-flex items-center gap-1">
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        <span>مزامنة ({pendingSyncCount})</span>
                      </span>
                    ) : (
                      <span className="text-[#52765D] dark:text-[#86B394] font-medium inline-flex items-center gap-1">
                        <Wifi className="w-3 h-3" />
                        <span>متصل</span>
                      </span>
                    )}
                    <span aria-hidden="true">·</span>
                    <HeaderClockBadge />
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Center Zone: Desktop Secondary Quick Navigation */}
          <nav className="hidden lg:flex items-center gap-5 text-xs font-bold text-[#77716B] dark:text-[#ACA59C]">
            <button
              type="button"
              onClick={() => {
                setSelectedPropertyId(null);
                setSelectedTaxpayerId(null);
                setActiveScreen('taxpayers');
              }}
              className={`py-1.5 border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                activeScreen === 'taxpayers'
                  ? 'border-[#743B46] text-[#743B46] dark:text-[#E5B9C0]'
                  : 'border-transparent hover:text-[#292725] dark:hover:text-white'
              }`}
            >
              المكلفون والعقارات
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedPropertyId(null);
                setSelectedTaxpayerId(null);
                setActiveScreen('visits');
              }}
              className={`py-1.5 border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                activeScreen === 'visits'
                  ? 'border-[#743B46] text-[#743B46] dark:text-[#E5B9C0]'
                  : 'border-transparent hover:text-[#292725] dark:hover:text-white'
              }`}
            >
              الزيارات
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedPropertyId(null);
                setSelectedTaxpayerId(null);
                setActiveScreen('map');
              }}
              className={`py-1.5 border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                activeScreen === 'map'
                  ? 'border-[#743B46] text-[#743B46] dark:text-[#E5B9C0]'
                  : 'border-transparent hover:text-[#292725] dark:hover:text-white'
              }`}
            >
              الخريطة
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedPropertyId(null);
                setSelectedTaxpayerId(null);
                setActiveScreen('assessments');
              }}
              className={`py-1.5 border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                activeScreen === 'assessments' || activeScreen === 'transactions'
                  ? 'border-[#743B46] text-[#743B46] dark:text-[#E5B9C0]'
                  : 'border-transparent hover:text-[#292725] dark:hover:text-white'
              }`}
            >
              المالية
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedPropertyId(null);
                setSelectedTaxpayerId(null);
                setActiveScreen('reports');
              }}
              className={`py-1.5 border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                activeScreen === 'reports'
                  ? 'border-[#743B46] text-[#743B46] dark:text-[#E5B9C0]'
                  : 'border-transparent hover:text-[#292725] dark:hover:text-white'
              }`}
            >
              التقارير
            </button>
          </nav>

          {/* Left Zone (End in RTL): Notification Bell, Voice, Dark Mode & Menu */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {!isInstalled && isInstallable && (
              <button
                type="button"
                onClick={install}
                className="min-h-[38px] px-3 rounded-xl bg-[#743B46] hover:bg-[#5D2D37] text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">تثبيت</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setActiveScreen('voice')}
              className={`min-h-[40px] min-w-[40px] rounded-xl border flex items-center justify-center transition-colors cursor-pointer ${
                activeScreen === 'voice'
                  ? 'bg-[#743B46] text-white border-[#743B46]'
                  : 'bg-[#FFFEFC] dark:bg-[#22201F] hover:bg-[#EFECE6] dark:hover:bg-[#2B2826] text-[#292725] dark:text-[#F4F1EA] border-[#E7E1D8] dark:border-[#383431]'
              }`}
              title="المساعد الصوتي الذكي"
              aria-label="المساعد الصوتي الذكي"
            >
              <Mic className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setIsThemeModalOpen(true)}
              className="hidden sm:flex min-h-[40px] px-2.5 rounded-xl bg-[#FFFEFC] dark:bg-[#22201F] hover:bg-[#EFECE6] dark:hover:bg-[#2B2826] border border-[#E7E1D8] dark:border-[#383431] items-center gap-1.5 transition-colors cursor-pointer text-[#292725] dark:text-[#F4F1EA]"
              title="القوالب اللونية وتصميم الواجهة"
              aria-label="القوالب اللونية وتصميم الواجهة"
            >
              <Palette className="w-4 h-4 text-[#743B46] dark:text-[#E5B9C0]" />
              <span className="hidden md:inline text-xs font-bold">المظهر</span>
            </button>

            <button
              type="button"
              onClick={toggleDarkMode}
              className="min-h-[40px] min-w-[40px] rounded-xl bg-[#FFFEFC] dark:bg-[#22201F] hover:bg-[#EFECE6] dark:hover:bg-[#2B2826] border border-[#E7E1D8] dark:border-[#383431] flex items-center justify-center transition-colors cursor-pointer text-[#292725] dark:text-[#F4F1EA]"
              aria-label="تبديل الوضع الليلي والنهاري"
              title="تبديل الوضع الليلي والنهاري"
            >
              {darkMode ? (
                <Sun className="w-4 h-4 text-[#D9A441]" />
              ) : (
                <Moon className="w-4 h-4 text-[#5C554E]" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setIsNotifOpen(true)}
              className="relative min-h-[40px] min-w-[40px] rounded-xl bg-[#FFFEFC] dark:bg-[#22201F] hover:bg-[#EFECE6] dark:hover:bg-[#2B2826] border border-[#E7E1D8] dark:border-[#383431] flex items-center justify-center transition-colors cursor-pointer text-[#292725] dark:text-[#F4F1EA]"
              aria-label="مركز الإشعارات والتنبيهات"
              title="الإشعارات والتنبيهات"
            >
              <Bell className="w-4 h-4" />
              {dueCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#A64B45] text-white text-[10px] font-bold flex items-center justify-center shadow-xs">
                  {dueCount > 9 ? '+9' : dueCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveScreen('more')}
              className="min-h-[40px] min-w-[40px] rounded-xl bg-[#FFFEFC] dark:bg-[#22201F] hover:bg-[#EFECE6] dark:hover:bg-[#2B2826] border border-[#E7E1D8] dark:border-[#383431] flex items-center justify-center transition-colors cursor-pointer text-[#292725] dark:text-[#F4F1EA]"
              aria-label="القائمة والإعدادات"
              title="القائمة والإعدادات"
            >
              <Menu className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Real-time In-App Due Appointment Alert Banner */}
      <ActiveAlertBanner />

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
                  ? 'bg-[#A64B45] text-white border-[#8E3B36]'
                  : t.type === 'warning'
                  ? 'bg-[#A77B35] text-white border-[#8D662A]'
                  : t.type === 'success'
                  ? 'bg-[#52765D] text-white border-[#41604B]'
                  : 'bg-[#743B46] text-white border-[#5D2D37]'
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

      {/* Fixed 5-Item Reference Bottom Navigation Bar */}
      <nav
        aria-label="التنقل الرئيسي"
        className="fixed bottom-0 left-0 right-0 z-40 bg-[#FFFEFC]/95 dark:bg-[#22201F]/95 backdrop-blur-md border-t border-[#E7E1D8] dark:border-[#383431] bottom-nav-safe shadow-[0_-4px_20px_rgba(41,39,37,0.04)]"
      >
        <div className="max-w-lg mx-auto h-[68px] grid grid-cols-5 items-center px-2">
          {PRIMARY_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive =
              activeScreen === tab.id ||
              (tab.id === 'more' && isSubScreen);

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setSelectedPropertyId(null);
                  setSelectedTaxpayerId(null);
                  setActiveScreen(tab.id);
                }}
                className={`relative min-h-[56px] flex flex-col items-center justify-center rounded-2xl transition-all cursor-pointer ${
                  isActive
                    ? 'text-[#743B46] dark:text-[#E5B9C0] font-extrabold'
                    : 'text-[#77716B] dark:text-[#ACA59C] hover:text-[#292725] dark:hover:text-[#F4F1EA] font-medium'
                }`}
              >
                {isActive && (
                  <span className="absolute top-0.5 w-8 h-1 rounded-full bg-[#743B46] dark:bg-[#E5B9C0]" />
                )}
                <div
                  className={`px-3.5 py-1 rounded-xl transition-all flex items-center justify-center ${
                    isActive
                      ? 'bg-[#743B46]/10 dark:bg-[#743B46]/25 text-[#743B46] dark:text-[#E5B9C0]'
                      : ''
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-[11px] mt-0.5 whitespace-nowrap">{tab.label}</span>
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
