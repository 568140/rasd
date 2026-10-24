/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  Home,
  Building2,
  Mic,
  CalendarClock,
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
  KeyRound,
} from 'lucide-react';
import { RasdProvider, useRasd } from './context/RasdContext';
import { AuthScreen } from './components/AuthScreen';
import { HomeScreen } from './components/HomeScreen';
import { PropertiesScreen } from './components/PropertiesScreen';
import { TaxpayersScreen } from './components/TaxpayersScreen';
import { VoiceAssistantScreen } from './components/VoiceAssistantScreen';
import { AppointmentsScreen } from './components/AppointmentsScreen';
import { FieldVisitsScreen } from './components/FieldVisitsScreen';
import { MapScreen } from './components/MapScreen';
import { FinancialsScreen } from './components/FinancialsScreen';
import { ReportsScreen } from './components/ReportsScreen';
import { TeamScreen } from './components/TeamScreen';
import { AuditLogScreen } from './components/AuditLogScreen';
import { MoreScreen } from './components/MoreScreen';
import { ActiveAlertBanner } from './components/ActiveAlertBanner';
import { NotificationCenterModal } from './components/NotificationCenterModal';
import { ThemeSelectorModal } from './components/ThemeSelectorModal';
import { TempVapidGenerator } from './components/TempVapidGenerator';
import { themeEngine } from './services/themeEngine';
import { alertSound } from './services/alertSound';
import { evaluateAppointmentStatus, sanitizeReminderMinutes } from './utils/dateUtils';
import { usePWAInstall } from './hooks/usePWAInstall';
import { ScreenId } from './types/rasd';

const SCREEN_TITLES: Record<ScreenId, string> = {
  home: 'رَصْد — المساعد الميداني',
  taxpayers: 'المكلفون والعقارات — الملف الموحد',
  properties: 'دليل العقارات والوحدات العام',
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
};

const PRIMARY_TABS: { id: ScreenId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'home', label: 'الرئيسية', icon: Home },
  { id: 'taxpayers', label: 'المكلفون والعقارات', icon: Building2 },
  { id: 'voice', label: 'الصوت', icon: Mic },
  { id: 'appointments', label: 'المواعيد', icon: CalendarClock },
  { id: 'more', label: 'المزيد', icon: Menu },
];

const RasdShell: React.FC = () => {
  const {
    authReady,
    firebaseUser,
    userProfile,
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

  const dueCount = React.useMemo(() => {
    return (
      appointments.filter((a) => {
        const remMins = sanitizeReminderMinutes(
          a.reminderMinutesBefore ?? defaultReminderMins,
          defaultReminderMins
        );
        const s = evaluateAppointmentStatus(
          a.status,
          a.scheduledDate,
          a.scheduledTime,
          remMins
        );
        return s === 'due';
      }).length + notifications.filter((n) => !n.isRead).length
    );
  }, [appointments, notifications, defaultReminderMins]);

  const { isInstallable, isInstalled, install } = usePWAInstall();

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#F4F7FA] dark:bg-[#060D18] flex flex-col items-center justify-center p-6" dir="rtl">
        <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-[#0B192C] via-[#0369A1] to-[#0D9488] text-white flex items-center justify-center mb-4 shadow-lg shadow-sky-950/20 animate-pulse">
          <ShieldCheck className="w-8 h-8" />
        </div>
        <div className="text-base font-bold text-[#0B192C] dark:text-white font-display">
          رَصْد — المساعد الميداني الذكي
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
          جاري التحقق من جلسة المصادقة الآمنة...
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
                    ? 'bg-rose-600 text-white border-rose-700'
                    : t.type === 'warning'
                    ? 'bg-amber-600 text-white border-amber-700'
                    : t.type === 'success'
                    ? 'bg-[#0D9488] text-white border-teal-700'
                    : 'bg-[#0B192C] text-white border-slate-800'
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
        <div className="fixed bottom-4 left-4 z-40" dir="rtl">
          <button
            type="button"
            onClick={() => setIsVapidToolOpen(true)}
            className="min-h-[42px] px-4 rounded-2xl bg-[#0D9488] hover:bg-teal-700 text-white text-xs font-extrabold shadow-lg flex items-center gap-2 cursor-pointer"
          >
            <KeyRound className="w-4 h-4" />
            <span>أداة توليد مفاتيح VAPID (مؤقتة)</span>
          </button>
        </div>
        {isVapidToolOpen && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto" dir="rtl">
            <div className="w-full max-w-2xl my-auto">
              <TempVapidGenerator
                onClose={() => setIsVapidToolOpen(false)}
                onShowToast={showToast}
              />
            </div>
          </div>
        )}
        <AuthScreen />
      </>
    );
  }

  const isSubScreen = !['home', 'taxpayers', 'voice', 'appointments', 'more'].includes(activeScreen);
  const hasDetailOpen = Boolean(selectedPropertyId || selectedTaxpayerId);

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
    setActiveScreen('more');
  };

  return (
    <div className="min-h-screen bg-[#F4F7FA] dark:bg-[#060D18] text-[#0B192C] dark:text-slate-100 flex flex-col" dir="rtl">
      {/* Android Material 3 Top App Bar */}
      <header className="sticky top-0 z-30 h-16 bg-white/95 dark:bg-[#0B192C]/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80 px-4 shadow-2xs">
        <div className="max-w-5xl mx-auto h-full flex items-center justify-between gap-3">
          {/* Right Zone (Start in RTL): Brand Emblem or Back Action + Screen Title & User */}
          <div className="flex items-center gap-3 min-w-0">
            {isSubScreen || hasDetailOpen ? (
              <button
                type="button"
                onClick={handleBack}
                className="min-h-[42px] min-w-[42px] rounded-2xl bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800 dark:hover:bg-slate-700 text-[#0B192C] dark:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
                aria-label="رجوع"
              >
                <ArrowRight className="w-5 h-5" />
              </button>
            ) : (
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#0B192C] via-[#0369A1] to-[#0D9488] text-white flex items-center justify-center shadow-xs shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
            )}

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm sm:text-base font-bold tracking-tight text-[#0B192C] dark:text-white truncate font-display">
                  {SCREEN_TITLES[activeScreen] || 'رَصْد'}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 truncate">
                <span className="truncate">{userProfile?.displayName || 'المسؤول الميداني'}</span>
                <span aria-hidden="true">·</span>
                {!isOnline ? (
                  <span className="text-amber-600 dark:text-amber-400 font-medium inline-flex items-center gap-1">
                    <WifiOff className="w-3 h-3" />
                    <span>دون اتصال</span>
                  </span>
                ) : pendingSyncCount > 0 ? (
                  <span className="text-sky-600 dark:text-sky-400 font-medium inline-flex items-center gap-1">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    <span>مزامنة ({pendingSyncCount})</span>
                  </span>
                ) : (
                  <span className="text-teal-600 dark:text-teal-400 font-medium inline-flex items-center gap-1">
                    <Wifi className="w-3 h-3" />
                    <span>متصل</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Center Zone: Desktop Secondary Quick Navigation */}
          <nav className="hidden lg:flex items-center gap-5 text-xs font-semibold text-slate-600 dark:text-slate-300">
            <button
              type="button"
              onClick={() => {
                setSelectedPropertyId(null);
                setSelectedTaxpayerId(null);
                setActiveScreen('taxpayers');
              }}
              className={`py-1.5 border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                activeScreen === 'taxpayers'
                  ? 'border-[#0D9488] text-[#0D9488] dark:text-teal-400'
                  : 'border-transparent hover:text-[#0284C7] dark:hover:text-sky-400'
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
                  ? 'border-[#0D9488] text-[#0D9488] dark:text-teal-400'
                  : 'border-transparent hover:text-[#0284C7] dark:hover:text-sky-400'
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
                  ? 'border-[#0D9488] text-[#0D9488] dark:text-teal-400'
                  : 'border-transparent hover:text-[#0284C7] dark:hover:text-sky-400'
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
                  ? 'border-[#0D9488] text-[#0D9488] dark:text-teal-400'
                  : 'border-transparent hover:text-[#0284C7] dark:hover:text-sky-400'
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
                  ? 'border-[#0D9488] text-[#0D9488] dark:text-teal-400'
                  : 'border-transparent hover:text-[#0284C7] dark:hover:text-sky-400'
              }`}
            >
              التقارير
            </button>
          </nav>

          {/* Left Zone (End in RTL): Install & Theme Controls */}
          <div className="flex items-center gap-2 shrink-0">
            {!isInstalled && isInstallable && (
              <button
                type="button"
                onClick={install}
                className="min-h-[38px] px-3.5 rounded-xl bg-[#0B192C] hover:bg-[#132A46] dark:bg-[#0D9488] dark:hover:bg-teal-600 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">تثبيت التطبيق</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsVapidToolOpen(true)}
              className="min-h-[42px] px-3 rounded-2xl bg-teal-50 hover:bg-teal-100 dark:bg-teal-950/70 dark:hover:bg-teal-900/70 border border-teal-200 dark:border-teal-800 flex items-center gap-1.5 transition-colors cursor-pointer text-[#0D9488] dark:text-teal-300"
              title="أداة توليد مفاتيح VAPID المحلية (مؤقتة)"
              aria-label="أداة توليد مفاتيح VAPID المحلية"
            >
              <KeyRound className="w-4 h-4" />
              <span className="text-xs font-extrabold">VAPID</span>
            </button>
            <button
              type="button"
              onClick={() => setIsThemeModalOpen(true)}
              className="min-h-[42px] px-3 rounded-2xl bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800 dark:hover:bg-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer text-slate-700 dark:text-slate-200"
              title="القوالب اللونية وتصميم الواجهة"
              aria-label="القوالب اللونية وتصميم الواجهة"
            >
              <Palette className="w-4 h-4 text-[#0D9488]" />
              <span className="hidden sm:inline text-xs font-bold">القوالب</span>
            </button>
            <button
              type="button"
              onClick={() => setIsNotifOpen(true)}
              className="relative min-h-[42px] min-w-[42px] rounded-2xl bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800 dark:hover:bg-slate-700 flex items-center justify-center transition-colors cursor-pointer text-slate-700 dark:text-slate-200"
              aria-label="مركز التنبيهات"
            >
              <Bell className="w-4 h-4" />
              {dueCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center animate-pulse shadow-xs">
                  {dueCount > 9 ? '+9' : dueCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={toggleDarkMode}
              className="min-h-[42px] min-w-[42px] rounded-2xl bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800 dark:hover:bg-slate-700 flex items-center justify-center transition-colors cursor-pointer"
              aria-label="تبديل المظهر"
            >
              {darkMode ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-[#0B192C]" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Real-time In-App Due Appointment Alert Banner */}
      <ActiveAlertBanner />

      {/* Notification Center Slide-over Modal */}
      <NotificationCenterModal
        isOpen={isNotifOpen}
        onClose={() => setIsNotifOpen(false)}
      />

      {/* Theme & Template Studio Modal */}
      <ThemeSelectorModal
        isOpen={isThemeModalOpen}
        onClose={() => setIsThemeModalOpen(false)}
      />

      {/* Temporary Local VAPID Key Generator Modal */}
      {isVapidToolOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          dir="rtl"
        >
          <div className="w-full max-w-2xl my-auto">
            <TempVapidGenerator
              onClose={() => setIsVapidToolOpen(false)}
              onShowToast={showToast}
            />
          </div>
        </div>
      )}

      {/* Floating Material 3 Snackbar / Toast Notifications */}
      {toasts.length > 0 && (
        <div className="fixed top-20 left-4 right-4 z-50 max-w-md mx-auto space-y-2 pointer-events-none">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`pointer-events-auto p-3.5 rounded-2xl shadow-lg border text-xs font-semibold flex items-center justify-between gap-2.5 ${
                t.type === 'error'
                  ? 'bg-rose-600 text-white border-rose-700'
                  : t.type === 'warning'
                  ? 'bg-amber-600 text-white border-amber-700'
                  : t.type === 'success'
                  ? 'bg-[#0D9488] text-white border-teal-700'
                  : 'bg-[#0B192C] text-white border-slate-800'
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

      {/* Main Mobile-First Viewport Area with Safe Area Bottom Clearance */}
      <main className="flex-1 w-full max-w-5xl mx-auto px-3.5 sm:px-5 pt-4 pb-safe-nav">
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
        {(activeScreen === 'more' || activeScreen === 'notifications' || activeScreen === 'settings') && (
          <MoreScreen />
        )}
      </main>

      {/* Fixed 5-Item Android Material 3 Bottom Navigation Bar */}
      <nav
        aria-label="التنقل الرئيسي"
        className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-[#0B192C]/95 backdrop-blur-md border-t border-slate-200/90 dark:border-slate-800/90 bottom-nav-safe shadow-[0_-4px_20px_rgba(11,25,44,0.05)]"
      >
        <div className="max-w-lg mx-auto h-[68px] grid grid-cols-5 items-center px-2">
          {PRIMARY_TABS.map((tab) => {
            const Icon = tab.icon;
            const isVoiceTab = tab.id === 'voice';
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
                className={`min-h-[54px] flex flex-col items-center justify-center rounded-2xl transition-all cursor-pointer ${
                  isActive
                    ? 'text-[#0B192C] dark:text-teal-300 font-bold'
                    : 'text-slate-500 dark:text-slate-400 hover:text-[#0B192C] dark:hover:text-slate-200 font-medium'
                }`}
              >
                <div
                  className={`px-4 py-1 rounded-full transition-all flex items-center justify-center ${
                    isVoiceTab && isActive
                      ? 'bg-gradient-to-r from-[#0369A1] to-[#0D9488] text-white shadow-sm'
                      : isVoiceTab
                      ? 'bg-sky-50 dark:bg-sky-950/70 text-[#0284C7] dark:text-sky-400'
                      : isActive
                      ? 'bg-teal-100/80 dark:bg-teal-950/80 text-[#0D9488] dark:text-teal-300'
                      : ''
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-[11px] mt-1 whitespace-nowrap">{tab.label}</span>
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
