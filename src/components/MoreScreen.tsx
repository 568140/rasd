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
  Database,
  Upload,
} from 'lucide-react';
import { useRasd } from '../context/RasdContext';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { CurrencyCode, ScreenId, CURRENCY_LIST } from '../types/rasd';
import { FIREBASE_PROJECT_ID, FIRESTORE_DATABASE_ID } from '../services/firebase';
import { DIRTY_DOZEN_AND_RBAC_TESTS } from '../../firestore.rules.test';
import { SoundSettingsPanel } from './SoundSettingsPanel';
import { ThemeSelectorModal } from './ThemeSelectorModal';
import { TempVapidGenerator } from './TempVapidGenerator';
import {
  exportFirestoreBackup,
  downloadBackupJsonFile,
  restoreBackupToSandbox,
  getBackupScopeDisclosure,
  BackupScopeMode,
  BackupIntegrityReport,
  BackupRestoreResult,
  RasdBackupPayload,
} from '../services/backupService';

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

  const [subPanel, setSubPanel] = useState<
    'none' | 'profile' | 'workspace' | 'sounds' | 'transparency' | 'vapid' | 'backup'
  >(activeScreen === 'settings' || activeScreen === 'notifications' ? 'sounds' : 'none');
  const [isThemeOpen, setIsThemeOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);

  // Stage 1 Backup & Isolated Restore Verification State
  const [backupScope, setBackupScope] = useState<BackupScopeMode>(
    isPlatformAdmin ? 'all_accessible_workspaces' : 'single_workspace'
  );
  const [isExportingBackup, setIsExportingBackup] = useState(false);
  const [lastBackupIntegrity, setLastBackupIntegrity] = useState<BackupIntegrityReport | null>(null);
  const [sandboxRestoreResult, setSandboxRestoreResult] = useState<BackupRestoreResult | null>(null);

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

  const handleExportBackup = async () => {
    if (!userProfile?.uid) {
      showToast('يرجى التحقق من جلسة الدخول قبل التصدير.', 'error');
      return;
    }
    setIsExportingBackup(true);
    try {
      const effectiveScope: BackupScopeMode =
        isPlatformAdmin && backupScope === 'all_accessible_workspaces'
          ? 'all_accessible_workspaces'
          : 'single_workspace';
      const { payload, integrity } = await exportFirestoreBackup({
        scopeMode: effectiveScope,
        workspaceId: workspace?.id || null,
        currentUserUid: userProfile.uid,
        currentUserEmail: userProfile.email || '',
      });
      setLastBackupIntegrity(integrity);
      const filename = downloadBackupJsonFile(payload);
      showToast(
        `تم تصدير النسخة الاحتياطية (${filename}) والتحقق من ${integrity.totalDocumentsChecked} وثيقة بنجاح.`,
        integrity.isValid ? 'success' : 'error'
      );
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'تعذر إنشاء النسخة الاحتياطية من Firestore.',
        'error'
      );
    } finally {
      setIsExportingBackup(false);
    }
  };

  const handleVerifyAndSandboxRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const rawText = await file.text();
      const parsed = JSON.parse(rawText) as RasdBackupPayload;
      const { result } = restoreBackupToSandbox(parsed);
      setSandboxRestoreResult(result);
      setLastBackupIntegrity(result.preRestoreIntegrity);
      if (result.success) {
        showToast(
          `نجحت الاستعادة التجريبية المعزولة لـ ${result.totalRestoredDocuments} وثيقة مع تطابق 100% للمعرفات والعلاقات.`,
          'success'
        );
      } else {
        showToast('فشل التحقق من سلامة ملف النسخة الاحتياطية في البيئة المعزولة.', 'error');
      }
    } catch {
      showToast('ملف JSON غير صالح أو تالف ولا يمكن قراءته.', 'error');
    } finally {
      e.target.value = '';
    }
  };

  const scopeDisclosure = getBackupScopeDisclosure(
    isPlatformAdmin ? backupScope : 'single_workspace'
  );

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

        {(isOwner || isPlatformAdmin) && (
          <button
            type="button"
            onClick={() => setSubPanel(subPanel === 'backup' ? 'none' : 'backup')}
            className={`p-4 rounded-3xl bg-white dark:bg-[#0D1829] border text-right transition-colors cursor-pointer ${
              subPanel === 'backup'
                ? 'border-[#0284C7] ring-2 ring-sky-500/15'
                : 'border-slate-200/80 dark:border-slate-800/80 hover:border-[#0284C7]'
            }`}
          >
            <div className="flex items-center gap-2 text-sm font-extrabold text-slate-900 dark:text-white mb-1">
              <Database className="w-4 h-4 text-[#0284C7]" />
              <span>نسخ البيانات التشغيلية (JSON) وفحص الاستعادة المعزول</span>
            </div>
            <p className="text-xs text-slate-500">
              تصدير تشغيلي لـ 13 مجموعة (مع حفظ Timestamp وفصل docId) ومعاينة استعادة تجريبية معزولة فقط
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
              className={`p-4 rounded-3xl bg-teal-50/60 dark:bg-teal-950/30 border text-right transition-colors cursor-pointer sm:col-span-2 lg:col-span-3 ${
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

      {/* Sub-panel: Stage 1A Operational JSON Backup & Isolated Sandbox Restore Preview */}
      {(isOwner || isPlatformAdmin) && subPanel === 'backup' && (
        <div className="bg-white dark:bg-[#0D1829] border border-sky-200/80 dark:border-sky-800/80 rounded-3xl p-5 space-y-4 shadow-xs text-xs">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <Database className="w-5 h-5 text-[#0284C7]" />
                <span>نسخ البيانات التشغيلية (JSON) ومعاينة الاستعادة التجريبية المعزولة</span>
              </h3>
              <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                يفصل معرف الوثيقة (docId) في الغلاف عن المحتوى (docData)، ويحفظ الطوابع الزمنية كأنواع Firestore Timestamp، ويحمي السجلات التاريخية غير القابلة للتعديل.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSubPanel('none')}
              className="min-h-[34px] px-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold cursor-pointer"
            >
              إغلاق
            </button>
          </div>

          <div className="p-3.5 rounded-2xl bg-amber-50/80 dark:bg-amber-950/40 border border-amber-300/80 dark:border-amber-800/80 space-y-1">
            <div className="font-extrabold text-amber-950 dark:text-amber-200">
              تصنيف النسخة: نسخة بيانات تشغيلية جزئية (Operational Data Backup — Not Full Disaster Recovery)
            </div>
            <p className="text-slate-700 dark:text-slate-300">{scopeDisclosure.disclaimerAr}</p>
            <p className="text-amber-900 dark:text-amber-300 font-bold pt-0.5">
              • قيد الأمان للمرحلة الأولى: الاستعادة المباشرة إلى قاعدة بيانات الإنتاج معطلة ومرفوضة برمجيًا؛ المتاح هنا هو المعاينة والفحص والاستعادة التجريبية في البيئة المعزولة فقط.
            </p>
          </div>

          {isPlatformAdmin && (
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-bold text-slate-900 dark:text-white">نطاق التصدير التشغيلي (صلاحية مالك المنصة):</div>
                <div className="text-slate-500">
                  يمكنك تصدير مساحة العمل الحالية فقط أو جميع مساحات العمل المتاحة في قاعدة البيانات.
                </div>
              </div>
              <select
                value={backupScope}
                onChange={(e) => setBackupScope(e.target.value as BackupScopeMode)}
                className="min-h-[38px] px-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold"
              >
                <option value="all_accessible_workspaces">جميع مساحات العمل المتاحة في المنصة</option>
                <option value="single_workspace">مساحة العمل النشطة فقط ({workspace?.name})</option>
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div className="p-3.5 rounded-2xl bg-sky-50/60 dark:bg-sky-950/30 border border-sky-200/80 dark:border-sky-800/80 space-y-1.5">
              <div className="font-extrabold text-sky-950 dark:text-sky-300">
                المجموعات التشغيلية المشمولة ({scopeDisclosure.includedCollections.length} مجموعة):
              </div>
              <ul className="space-y-1 text-slate-700 dark:text-slate-300">
                {scopeDisclosure.includedCollections.map((col) => (
                  <li key={col.name}>
                    • <span className="font-mono font-bold">{col.name}</span>{' '}
                    {col.immutabilityPolicy === 'append_only_immutable' ? (
                      <span className="text-[11px] font-bold text-amber-700 dark:text-amber-300">
                        [سجل تاريخي غير قابل للتعديل Append-Only]
                      </span>
                    ) : null}
                    : {col.description}
                  </li>
                ))}
              </ul>
            </div>

            <div className="p-3.5 rounded-2xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/80 space-y-1.5">
              <div className="font-extrabold text-amber-950 dark:text-amber-300">
                المجموعات والبيانات والأنظمة المستثناة ({scopeDisclosure.excludedCollectionsAndData.length} فئات):
              </div>
              <ul className="space-y-1.5 text-slate-700 dark:text-slate-300">
                {scopeDisclosure.excludedCollectionsAndData.map((ex) => (
                  <li key={ex.name}>
                    • <span className="font-bold">{ex.name}</span>: {ex.reason}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              disabled={isExportingBackup}
              onClick={handleExportBackup}
              className="min-h-[42px] px-4 rounded-2xl bg-[#0B192C] dark:bg-[#0284C7] text-white font-bold flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>
                {isExportingBackup
                  ? 'جاري استخراج البيانات التشغيلية وفحص العلاقات...'
                  : 'تصدير نسخة البيانات التشغيلية (JSON)'}
              </span>
            </button>

            <label className="min-h-[42px] px-4 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white font-bold flex items-center gap-2 cursor-pointer">
              <Upload className="w-4 h-4" />
              <span>معاينة وفحص واستعادة تجريبية في بيئة معزولة فقط (لا يكتب على الإنتاج)</span>
              <input
                type="file"
                accept="application/json,.json"
                onChange={handleVerifyAndSandboxRestoreFile}
                className="hidden"
              />
            </label>
          </div>

          {lastBackupIntegrity && (
            <div
              className={`p-3.5 rounded-2xl border space-y-1 ${
                lastBackupIntegrity.isValid
                  ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800'
                  : 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-300 dark:border-rose-800'
              }`}
            >
              <div className="font-extrabold text-slate-900 dark:text-white">
                نتيجة فحص السلامة وفصل المعرفات والعلاقات المرجعية:
              </div>
              <p>{lastBackupIntegrity.summaryAr}</p>
            </div>
          )}

          {sandboxRestoreResult && (
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5">
              <div className="font-extrabold text-slate-900 dark:text-white">
                تقرير المعاينة والاستعادة التجريبية في البيئة المعزولة (Isolated Sandbox):
              </div>
              <p>
                • حالة الاستعادة التجريبية: <strong>{sandboxRestoreResult.success ? 'ناجحة 100%' : 'فشلت'}</strong> | إجمالي الوثائق المستعادة:{' '}
                <strong className="font-mono">{sandboxRestoreResult.totalRestoredDocuments}</strong> | الطوابع الزمنية المعاد بناؤها كـ Firestore Timestamp:{' '}
                <strong className="font-mono">{sandboxRestoreResult.reconstructedTimestampsCount}</strong> | عدد الدفعات:{' '}
                <strong className="font-mono">{sandboxRestoreResult.batchesExecuted}</strong>
              </p>
              <p>
                • تطابق معرفات الوثائق (docId):{' '}
                <strong>{sandboxRestoreResult.idPreservationVerified ? 'متطابق 100%' : 'غير متطابق'}</strong> | خلو الوثائق المستعادة من تسرب حقل id:{' '}
                <strong>{sandboxRestoreResult.envelopeNoIdLeakVerified ? 'مؤكد 100%' : 'يوجد تسرب'}</strong> | التطابق العميق للمحتوى والبصمة:{' '}
                <strong>{sandboxRestoreResult.deepEqualityVerified ? 'متطابق 100%' : 'غير متطابق'}</strong>
              </p>
              <div className="pt-1 border-t border-slate-200 dark:border-slate-800 text-[11px] space-y-1 text-slate-600 dark:text-slate-300">
                <div className="font-bold text-slate-800 dark:text-slate-200">
                  معالجة السجلات التاريخية غير القابلة للتعديل ({sandboxRestoreResult.immutableHandlingReport.immutableCollections.join('، ')}):
                </div>
                <p>
                  • سجلات جديدة أُنشئت بوضع (Create-Only):{' '}
                  <strong className="font-mono">{sandboxRestoreResult.immutableHandlingReport.createdNewRecordsCount}</strong> | سجلات مطابقة تم تخطيها دون تعديل:{' '}
                  <strong className="font-mono">{sandboxRestoreResult.immutableHandlingReport.skippedIdenticalRecordsCount}</strong> | تعارضات محظورة:{' '}
                  <strong className="font-mono">{sandboxRestoreResult.immutableHandlingReport.blockedConflictRecords.length}</strong>
                </p>
                <p>• {sandboxRestoreResult.immutableHandlingReport.safeRestorationStrategyAr}</p>
              </div>
            </div>
          )}
        </div>
      )}

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
