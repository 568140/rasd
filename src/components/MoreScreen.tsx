import React, { useState } from 'react';
import {
  Users,
  MapPin,
  Map,
  FileSpreadsheet,
  BarChart3,
  UserCheck,
  Shield,
  RefreshCw,
  Settings,
  HelpCircle,
  LogOut,
  Moon,
  Sun,
  Download,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  Volume2,
  Palette,
  KeyRound,
} from 'lucide-react';
import { useRasd } from '../context/RasdContext';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { CurrencyCode, ScreenId, CURRENCY_LIST } from '../types/rasd';
import { FIREBASE_PROJECT_ID, FIRESTORE_DATABASE_ID } from '../services/firebase';
import { DIRTY_DOZEN_AND_RBAC_TESTS } from '../../firestore.rules.test';
import { SoundSettingsPanel } from './SoundSettingsPanel';
import { ThemeSelectorModal } from './ThemeSelectorModal';
import { TempVapidGenerator } from './TempVapidGenerator';

export const MoreScreen: React.FC = () => {
  const {
    userProfile,
    workspace,
    isOwner,
    isPlatformAdmin,
    isOnline,
    pendingSyncCount,
    darkMode,
    toggleDarkMode,
    activeScreen,
    setActiveScreen,
    updateUserProfileInfo,
    updateWorkspaceSettings,
    logout,
    showToast,
  } = useRasd();

  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();

  const [subPanel, setSubPanel] = useState<'none' | 'profile' | 'workspace' | 'sounds' | 'transparency' | 'vapid'>(
    activeScreen === 'settings' || activeScreen === 'notifications' ? 'sounds' : 'none'
  );
  const [isThemeOpen, setIsThemeOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);

  // Profile Form State
  const [displayName, setDisplayName] = useState(userProfile?.displayName || '');
  const [phone, setPhone] = useState(userProfile?.phone || '');
  const [jobTitle, setJobTitle] = useState(userProfile?.jobTitle || '');

  // Workspace Form State
  const [wsName, setWsName] = useState(workspace?.name || '');
  const [wsCurrency, setWsCurrency] = useState<CurrencyCode>(workspace?.defaultCurrency || 'YER');
  const [wsTaxRate, setWsTaxRate] = useState(String(workspace?.taxRatePercent ?? 0));
  const [wsRegion, setWsRegion] = useState(workspace?.regionName || 'عدن');

  const navItems: {
    id: ScreenId;
    label: string;
    desc: string;
    icon: React.ReactNode;
    badgeBg: string;
  }[] = [
    {
      id: 'taxpayers',
      label: 'المكلفون والعقارات (الملف الميداني الموحد)',
      desc: 'ملف المكلف المتكامل: الوكلاء، العقارات، الأدوار، الشقق، الفتحات التجارية، المالية، الزيارات، والمواعيد',
      icon: <Users className="w-5 h-5 text-[#0B192C] dark:text-sky-300" />,
      badgeBg: 'bg-slate-100 dark:bg-sky-950/60',
    },
    {
      id: 'properties',
      label: 'السجل العام للعقارات والوحدات',
      desc: 'استعراض كافة العقارات والوحدات وإحداثيات GPS مع ربط مباشر بملف المكلف',
      icon: <MapPin className="w-5 h-5 text-[#0284C7]" />,
      badgeBg: 'bg-sky-50 dark:bg-sky-950/60',
    },
    {
      id: 'visits',
      label: 'الزيارات الميدانية',
      desc: 'تسجيل المعاينات الميدانية وإحداثيات GPS والصور والعمل دون اتصال',
      icon: <MapPin className="w-5 h-5 text-[#0D9488]" />,
      badgeBg: 'bg-teal-50 dark:bg-teal-950/60',
    },
    {
      id: 'map',
      label: 'الخريطة الميدانية',
      desc: 'استعراض المواقع الحقيقية للعقارات والزيارات وتحديد موقع GPS',
      icon: <Map className="w-5 h-5 text-[#0284C7]" />,
      badgeBg: 'bg-sky-50 dark:bg-sky-950/60',
    },
    {
      id: 'assessments',
      label: 'التقييمات المالية',
      desc: 'إنشاء التقييمات واعتمادها وقفلها ضد التعديل غير المصرح',
      icon: <FileSpreadsheet className="w-5 h-5 text-[#0D9488]" />,
      badgeBg: 'bg-teal-50 dark:bg-teal-950/60',
    },
    {
      id: 'transactions',
      label: 'المعاملات المالية والقيود العكسية',
      desc: 'تسجيل المدفوعات والتسويات والقيود العكسية الموثقة',
      icon: <FileSpreadsheet className="w-5 h-5 text-[#0284C7]" />,
      badgeBg: 'bg-sky-50 dark:bg-sky-950/60',
    },
    {
      id: 'reports',
      label: 'التقارير والتصدير (CSV / PDF)',
      desc: 'تقارير شاملة مع فلاتر المنطقة والتاريخ وتصدير الملفات',
      icon: <BarChart3 className="w-5 h-5 text-amber-600" />,
      badgeBg: 'bg-amber-50 dark:bg-amber-950/60',
    },
    {
      id: 'team',
      label: 'الفريق والصلاحيات (حتى 10 أعضاء)',
      desc: 'دعوة المساعدين وتخصيص الأدوار وعزلة مساحة العمل',
      icon: <UserCheck className="w-5 h-5 text-[#0284C7]" />,
      badgeBg: 'bg-sky-50 dark:bg-sky-950/60',
    },
    {
      id: 'audit',
      label: 'سجل التدقيق الأمني',
      desc: 'مراجعة كافة العمليات الحساسة والتغييرات الموثقة',
      icon: <Shield className="w-5 h-5 text-[#0D9488]" />,
      badgeBg: 'bg-teal-50 dark:bg-teal-950/60',
    },
  ];

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateUserProfileInfo(displayName, phone, jobTitle);
    setSubPanel('none');
  };

  const handleSaveWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateWorkspaceSettings(wsName, wsCurrency, parseFloat(wsTaxRate) || 0, wsRegion);
    setSubPanel('none');
  };

  return (
    <div className="space-y-5 pb-6">
      {/* User Identity Card in Deep Navy */}
      <div className="rounded-3xl bg-gradient-to-l from-[#0B192C] via-[#102A46] to-[#0369A1] text-white p-5 sm:p-6 shadow-md flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-13 h-13 rounded-2xl bg-white/15 border border-white/20 text-white font-extrabold text-xl flex items-center justify-center shrink-0">
            {userProfile?.displayName?.slice(0, 1) || 'ر'}
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-extrabold">
              {userProfile?.displayName}
            </h1>
            <p className="text-xs text-slate-300 font-mono">{userProfile?.email}</p>
            <p className="text-xs text-teal-300 font-bold mt-0.5">
              {userProfile?.jobTitle} · {workspace?.name}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIsThemeOpen(true)}
            className="min-h-[42px] px-3.5 rounded-2xl bg-white/15 hover:bg-white/25 border border-white/20 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Palette className="w-4 h-4 text-teal-200" />
            <span>القوالب والألوان</span>
          </button>

          <button
            type="button"
            onClick={toggleDarkMode}
            className="min-h-[42px] px-3.5 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/15 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            {darkMode ? <Sun className="w-4 h-4 text-amber-300" /> : <Moon className="w-4 h-4 text-sky-200" />}
            <span>{darkMode ? 'الوضع الفاتح' : 'الوضع الليلي'}</span>
          </button>

          {!isInstalled && (isInstallable || isIOS) && (
            <button
              type="button"
              onClick={install}
              className="min-h-[42px] px-3.5 rounded-2xl bg-[#0D9488] hover:bg-[#0F766E] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>تثبيت التطبيق</span>
            </button>
          )}
        </div>
      </div>

      <ThemeSelectorModal isOpen={isThemeOpen} onClose={() => setIsThemeOpen(false)} />

      {/* Main Modules Directory */}
      <div className="bg-white dark:bg-[#0D1829] border border-slate-200/80 dark:border-slate-800/80 rounded-3xl overflow-hidden shadow-xs">
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800/80">
          <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">
            وحدات وشاشات النظام المتكاملة
          </h2>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveScreen(item.id)}
              className="w-full min-h-[66px] px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-right cursor-pointer"
            >
              <div className="flex items-center gap-3.5">
                <div className={`w-11 h-11 rounded-2xl ${item.badgeBg} flex items-center justify-center shrink-0`}>
                  {item.icon}
                </div>
                <div>
                  <div className="text-sm font-extrabold text-slate-900 dark:text-white">{item.label}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{item.desc}</div>
                </div>
              </div>
              <ChevronLeft className="w-4 h-4 text-slate-400 shrink-0" />
            </button>
          ))}
        </div>
      </div>

      {/* Settings, Sync & Transparency Hub */}
      <div
        className={`grid grid-cols-1 sm:grid-cols-2 ${
          isPlatformAdmin ? 'lg:grid-cols-4' : ''
        } gap-3.5`}
      >
        <button
          type="button"
          onClick={() => {
            setDisplayName(userProfile?.displayName || '');
            setPhone(userProfile?.phone || '');
            setJobTitle(userProfile?.jobTitle || '');
            setSubPanel(subPanel === 'profile' ? 'none' : 'profile');
          }}
          className={`p-4 rounded-3xl bg-white dark:bg-[#0D1829] border text-right transition-colors cursor-pointer ${
            subPanel === 'profile'
              ? 'border-[#0284C7] ring-2 ring-sky-500/15'
              : 'border-slate-200/80 dark:border-slate-800/80 hover:border-[#0284C7]'
          }`}
        >
          <div className="flex items-center gap-2 text-sm font-extrabold text-slate-900 dark:text-white mb-1">
            <Settings className="w-4 h-4 text-[#0284C7]" />
            <span>الإعدادات الشخصية</span>
          </div>
          <p className="text-xs text-slate-500">تعديل الاسم، المسمى الوظيفي، ورقم التواصل</p>
        </button>

        <button
          type="button"
          onClick={() => setSubPanel(subPanel === 'sounds' ? 'none' : 'sounds')}
          className={`p-4 rounded-3xl bg-white dark:bg-[#0D1829] border text-right transition-colors cursor-pointer ${
            subPanel === 'sounds'
              ? 'border-[#0D9488] ring-2 ring-teal-500/15'
              : 'border-slate-200/80 dark:border-slate-800/80 hover:border-[#0D9488]'
          }`}
        >
          <div className="flex items-center gap-2 text-sm font-extrabold text-slate-900 dark:text-white mb-1">
            <Volume2 className="w-4 h-4 text-[#0D9488]" />
            <span>أصوات الإشعارات والتنبيهات</span>
          </div>
          <p className="text-xs text-slate-500">
            اختيار نغمات التنبيه والمواعيد (تعمل بدون إنترنت)
          </p>
        </button>

        {(isOwner || isPlatformAdmin) && (
          <button
            type="button"
            onClick={() => {
              setWsName(workspace?.name || '');
              setWsCurrency(workspace?.defaultCurrency || 'YER');
              setWsTaxRate(String(workspace?.taxRatePercent ?? 0));
              setWsRegion(workspace?.regionName || 'عدن');
              setSubPanel(subPanel === 'workspace' ? 'none' : 'workspace');
            }}
            className={`p-4 rounded-3xl bg-white dark:bg-[#0D1829] border text-right transition-colors cursor-pointer ${
              subPanel === 'workspace'
                ? 'border-[#0D9488] ring-2 ring-teal-500/15'
                : 'border-slate-200/80 dark:border-slate-800/80 hover:border-[#0D9488]'
            }`}
          >
            <div className="flex items-center gap-2 text-sm font-extrabold text-slate-900 dark:text-white mb-1">
              <RefreshCw className="w-4 h-4 text-[#0D9488]" />
              <span>إعدادات مساحة العمل والمزامنة</span>
            </div>
            <p className="text-xs text-slate-500">
              العملة، نسبة التقييم، وحالة المزامنة ({pendingSyncCount} محلي)
            </p>
          </button>
        )}

        {isPlatformAdmin && (
          <>
            <button
              type="button"
              onClick={() => setSubPanel(subPanel === 'transparency' ? 'none' : 'transparency')}
              className={`p-4 rounded-3xl bg-white dark:bg-[#0D1829] border text-right transition-colors cursor-pointer ${
                subPanel === 'transparency'
                  ? 'border-[#0284C7] ring-2 ring-sky-500/15'
                  : 'border-slate-200/80 dark:border-slate-800/80 hover:border-[#0284C7]'
              }`}
            >
              <div className="flex items-center gap-2 text-sm font-extrabold text-slate-900 dark:text-white mb-1">
                <HelpCircle className="w-4 h-4 text-[#0284C7]" />
                <span>الشفافية وتغليف Android APK</span>
              </div>
              <p className="text-xs text-slate-500">
                تقرير التحقق الفعلي وخطوات البناء عبر Capacitor
              </p>
            </button>

            {/* Temporary Local VAPID Key Pair Generator Card (Primary Platform Admin only) */}
            <button
              type="button"
              onClick={() => setSubPanel(subPanel === 'vapid' ? 'none' : 'vapid')}
              className={`p-4 rounded-3xl bg-teal-50/60 dark:bg-teal-950/30 border text-right transition-colors cursor-pointer sm:col-span-2 lg:col-span-4 ${
                subPanel === 'vapid'
                  ? 'border-[#0D9488] ring-2 ring-teal-500/20'
                  : 'border-teal-300/80 dark:border-teal-800/80 hover:border-[#0D9488]'
              }`}
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 text-sm font-extrabold text-slate-900 dark:text-white">
                  <KeyRound className="w-4 h-4 text-[#0D9488]" />
                  <span>أداة توليد مفاتيح VAPID المحلية لـ Vercel (للإدارة فقط)</span>
                </div>
                <span className="px-2.5 py-0.5 rounded-lg bg-teal-100 dark:bg-teal-900/70 text-[#0D9488] dark:text-teal-300 text-[11px] font-bold">
                  Web Crypto P-256 · محلي 100%
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                توليد زوج مفاتيح (العام والخاص) متطابق ومتوافق مع مكتبة web-push داخل متصفح هاتفك دون إرسال المفتاح الخاص لأي خادم.
              </p>
            </button>
          </>
        )}
      </div>

      {/* Sub-panel: Temporary Local VAPID Generator */}
      {isPlatformAdmin && subPanel === 'vapid' && (
        <TempVapidGenerator
          onClose={() => setSubPanel('none')}
          onShowToast={showToast}
        />
      )}

      {/* Sub-panel: Offline Notification & Alert Sounds */}
      {subPanel === 'sounds' && (
        <div className="bg-white dark:bg-[#0D1829] border border-teal-200/80 dark:border-teal-800/80 rounded-3xl p-5 space-y-4 shadow-xs animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <Volume2 className="w-5 h-5 text-[#0D9488]" />
              <span>تخصيص أصوات الإشعارات والتنبيهات (بدون إنترنت)</span>
            </h3>
            <button
              type="button"
              onClick={() => setSubPanel('none')}
              className="min-h-[34px] px-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold cursor-pointer"
            >
              إغلاق
            </button>
          </div>
          <SoundSettingsPanel onShowToast={showToast} />
        </div>
      )}

      {/* Sub-panel: Personal Settings */}
      {subPanel === 'profile' && (
        <form
          onSubmit={handleSaveProfile}
          className="bg-white dark:bg-[#0D1829] border border-slate-200/80 dark:border-slate-800/80 rounded-3xl p-5 space-y-3.5 shadow-xs"
        >
          <h3 className="text-base font-extrabold text-slate-900 dark:text-white">تعديل الإعدادات الشخصية</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold mb-1">الاسم الكامل</label>
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full min-h-[42px] px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1">المسمى الوظيفي</label>
              <input
                type="text"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                className="w-full min-h-[42px] px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1">رقم الجوال</label>
              <input
                type="tel"
                dir="ltr"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full min-h-[42px] px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono text-left"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setSubPanel('none')}
              className="min-h-[40px] px-4 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold cursor-pointer"
            >
              إغلاق
            </button>
            <button
              type="submit"
              className="min-h-[40px] px-5 rounded-xl bg-[#0B192C] dark:bg-[#0284C7] text-white text-xs font-bold cursor-pointer"
            >
              حفظ التعديلات
            </button>
          </div>
        </form>
      )}

      {/* Sub-panel: Workspace Settings */}
      {(isOwner || isPlatformAdmin) && subPanel === 'workspace' && (
        <form
          onSubmit={handleSaveWorkspace}
          className="bg-white dark:bg-[#0D1829] border border-slate-200/80 dark:border-slate-800/80 rounded-3xl p-5 space-y-3.5 shadow-xs"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
              إعدادات مساحة العمل وقواعد الحساب القابلة للتهيئة
            </h3>
            <span className="text-xs font-semibold text-slate-500">
              الحالة: {isOnline ? 'متصل بالخادم' : 'وضع عدم الاتصال'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-bold mb-1">اسم مساحة العمل</label>
              <input
                type="text"
                disabled={!isPlatformAdmin}
                value={wsName}
                onChange={(e) => setWsName(e.target.value)}
                className="w-full min-h-[42px] px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1">العملة الافتراضية</label>
              <select
                disabled={!isPlatformAdmin}
                value={wsCurrency}
                onChange={(e) => setWsCurrency(e.target.value as CurrencyCode)}
                className="w-full min-h-[42px] px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold"
              >
                {CURRENCY_LIST.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold mb-1">نسبة التقييم الاختيارية (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.5"
                disabled={!isPlatformAdmin}
                value={wsTaxRate}
                onChange={(e) => setWsTaxRate(e.target.value)}
                className="w-full min-h-[42px] px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1">المنطقة الافتراضية</label>
              <input
                type="text"
                disabled={!isPlatformAdmin}
                value={wsRegion}
                onChange={(e) => setWsRegion(e.target.value)}
                className="w-full min-h-[42px] px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setSubPanel('none')}
              className="min-h-[40px] px-4 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold cursor-pointer"
            >
              إغلاق
            </button>
            <button
              type="submit"
              className="min-h-[40px] px-5 rounded-xl bg-[#0D9488] text-white text-xs font-bold cursor-pointer"
            >
              حفظ إعدادات المساحة
            </button>
          </div>
        </form>
      )}

      {/* Sub-panel: Transparency Checklist & Android Packaging */}
      {isPlatformAdmin && subPanel === 'transparency' && (
        <div className="bg-white dark:bg-[#0D1829] border border-slate-200/80 dark:border-slate-800/80 rounded-3xl p-5 space-y-4 text-xs leading-relaxed shadow-xs">
          <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
            تقرير الشفافية والتحقق والجاهزية (Transparency & Readiness Report)
          </h3>

          <div className="p-3.5 rounded-2xl bg-teal-50/70 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 space-y-1.5">
            <div className="font-bold text-teal-900 dark:text-teal-300 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>1. ما تم تنفيذه وربطه فعليًا في البيئة الحالية:</span>
            </div>
            <p>• مشروع Firebase فعلي: <span className="font-mono font-bold">{FIREBASE_PROJECT_ID}</span></p>
            <p>• قاعدة بيانات Firestore منشأة: <span className="font-mono font-bold">{FIRESTORE_DATABASE_ID}</span></p>
            <p>• المجموعات الـ 13 المعتمدة مربوطة بقواعد أمان `firestore.rules` وتم نشرها فعليًا عبر `DeployRules` بعد اجتياز فحص ESLint.</p>
            <p>• التخزين المحلي المستمر (Persistent Offline Cache) مفعّل في Firestore مع تتبع `hasPendingWrites` لعرض حالة المزامنة بدقة.</p>
            <p>• المساعد الصوتي مربوط فعليًا بواجهة `SpeechRecognition` (`ar-SA`) ومحلل الموجة الصوتية الحقيقي Web Audio API.</p>
            <p>• اختبارات الأمان الموثقة: {DIRTY_DOZEN_AND_RBAC_TESTS.length} حالة اختبار في `firestore.rules.test.ts` و`security_spec.md`.</p>
          </div>

          <div className="p-3.5 rounded-2xl bg-amber-50/70 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 space-y-1.5">
            <div className="font-bold text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>2. الخطوات الخارجية التي تتطلب إجراءً من المستخدم عند الحاجة:</span>
            </div>
            <p>• <strong>تسجيل الدخول بالبريد وكلمة المرور:</strong> تسجيل الدخول عبر Google مفعّل تلقائيًا. إذا أردت استخدام البريد وكلمة المرور، افتح Firebase Console &rarr; Authentication &rarr; Sign-in method وفعّل <em>Email/Password</em>.</p>
            <p>• <strong>خرائط Google Maps API:</strong> تم اختيار عدم تفعيل مفتاح Google Maps أثناء الإعداد، لذا تعمل شاشة الخريطة بالحالة البديلة التفاعلية (OpenStreetMap + GPS الحقيقي) دون مواقع وهمية.</p>
            <p>• <strong>بناء حزمة Android الأصلية (APK / AAB):</strong> تم تجهيز ملف `capacitor.config.json` وتطبيق PWA بالكامل. لبناء ملف APK فعليًا على جهازك: شغّل `npm run build` ثم `npx cap add android` ثم `npx cap sync` وافتح المشروع في Android Studio لبناء وتوقيع ملف APK/AAB.</p>
          </div>
        </div>
      )}

      {/* Sign Out Button with Confirmation Gate */}
      {!confirmLogout ? (
        <button
          type="button"
          onClick={() => setConfirmLogout(true)}
          className="w-full min-h-[52px] rounded-3xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/80 text-rose-700 dark:text-rose-300 font-extrabold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          <span>تسجيل الخروج الآمن ومسح الجلسة المحلية</span>
        </button>
      ) : (
        <div className="p-4 rounded-3xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs font-bold text-rose-800 dark:text-rose-200">
            هل تريد بالتأكيد تسجيل الخروج من جلسة رَصْد الحالية؟
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setConfirmLogout(false)}
              className="min-h-[38px] px-4 rounded-xl bg-white dark:bg-slate-900 text-xs font-bold cursor-pointer"
            >
              تراجع
            </button>
            <button
              type="button"
              onClick={logout}
              className="min-h-[38px] px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer"
            >
              تأكيد الخروج
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
