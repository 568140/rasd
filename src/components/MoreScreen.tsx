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
    canAccessPlatformAdmin,
    ownerSessionDiagnostic,
    loginWithGoogle,
    resendVerificationEmail,
    refreshAuthUser,
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
    receivedRegistrationRequests,
    refreshReceivedRegistrationRequests,
  } = useRasd();

  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();

  const [subPanel, setSubPanel] = useState<
    'none' | 'profile' | 'workspace' | 'sounds' | 'transparency' | 'vapid' | 'backup' | 'reg_requests'
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

  const [isVerifyingOwnerAction, setIsVerifyingOwnerAction] = useState(false);

  const showPlatformAdminEntry =
    isPlatformAdmin ||
    canAccessPlatformAdmin ||
    ownerSessionDiagnostic.requiresEmailVerificationForAdmin;

  const pendingRegCount = receivedRegistrationRequests.filter((r) => r.status === 'pending').length;

  const navItems: {
    id: ScreenId;
    label: string;
    desc: string;
    icon: React.ReactNode;
    badgeBg: string;
    highlightBadge?: string;
  }[] = [
    ...(showPlatformAdminEntry
      ? [
          {
            id: 'platform_admin' as ScreenId,
            label: 'إدارة المنصة (لوحة إدارة منصة رَصْد)',
            desc: ownerSessionDiagnostic.requiresEmailVerificationForAdmin
              ? 'حساب مالك دائم معتمد — يتطلب توثيق البريد الإلكتروني أو الدخول عبر Google لتفعيل الصلاحيات الإدارية'
              : 'إدارة طلبات التسجيل، حسابات العملاء والاشتراكات، الباقات، مساعدي المنصة، وسجل التدقيق الإداري',
            icon: <Shield className="w-5 h-5 text-[#743B46] dark:text-[#E5B9C0]" />,
            badgeBg: 'bg-[#743B46]/15 dark:bg-[#743B46]/30',
            highlightBadge: ownerSessionDiagnostic.requiresEmailVerificationForAdmin
              ? 'بانتظار توثيق البريد'
              : isPlatformAdmin
              ? `مالك دائم موثّق · ${pendingRegCount} طلب معلق`
              : `مساعد مفوّض · ${pendingRegCount} طلب معلق`,
          },
        ]
      : []),
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
      label: 'المحاضر والزيارات الميدانية',
      desc: 'توثيق المحاضر والمعاينات الميدانية وإحداثيات GPS والصور والعمل دون اتصال',
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
      const verifiedEmail =
        ownerSessionDiagnostic.effectiveVerifiedEmail ||
        ownerSessionDiagnostic.normalizedEmail ||
        userProfile.email ||
        '';
      const { payload, integrity } = await exportFirestoreBackup({
        scopeMode: effectiveScope,
        workspaceId: workspace?.id || null,
        currentUserUid: userProfile.uid,
        currentUserEmail: verifiedEmail,
        includePlatformGovernance: isPlatformAdmin,
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
    isPlatformAdmin ? backupScope : 'single_workspace',
    isPlatformAdmin
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

      {/* تشخيص حي وآمن لجلسة Firebase وصلاحية مالك المنصة (بدون عرض أي رموز دخول أو أسرار) */}
      <div
        data-testid="owner-auth-diagnostic-card"
        className={`rounded-3xl border p-4 sm:p-5 shadow-xs space-y-3 ${
          ownerSessionDiagnostic.isVerifiedOwner
            ? 'bg-emerald-50/75 dark:bg-emerald-950/25 border-emerald-200 dark:border-emerald-800/70'
            : ownerSessionDiagnostic.isPermanentOwnerEmailMatch
              ? 'bg-amber-50/90 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800/80'
              : 'bg-white dark:bg-[#0D1829] border-slate-200/80 dark:border-slate-800/80'
        }`}
      >
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                ownerSessionDiagnostic.isVerifiedOwner
                  ? 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300'
                  : ownerSessionDiagnostic.isPermanentOwnerEmailMatch
                    ? 'bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
              }`}
            >
              {ownerSessionDiagnostic.isVerifiedOwner ? (
                <CheckCircle2 className="w-5 h-5" />
              ) : ownerSessionDiagnostic.isPermanentOwnerEmailMatch ? (
                <AlertCircle className="w-5 h-5" />
              ) : (
                <Shield className="w-5 h-5" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-extrabold text-slate-900 dark:text-white">
                  {ownerSessionDiagnostic.isVerifiedOwner
                    ? 'تشخيص صلاحيّة المالك: حساب مالك دائم موثّق ومفعّل بالكامل'
                    : ownerSessionDiagnostic.isPermanentOwnerEmailMatch
                      ? 'تنبيه أمني لمالك المنصة: البريد الإلكتروني غير موثّق في هذه الجلسة'
                      : 'تشخيص جلسة المصادقة وصلاحية إدارة المنصة'}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-lg text-[11px] font-bold font-mono ${
                    ownerSessionDiagnostic.isVerifiedOwner
                      ? 'bg-emerald-100 dark:bg-emerald-900/70 text-emerald-800 dark:text-emerald-200'
                      : ownerSessionDiagnostic.isPermanentOwnerEmailMatch
                        ? 'bg-amber-200/80 dark:bg-amber-900/70 text-amber-900 dark:text-amber-200'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  emailVerified: {String(ownerSessionDiagnostic.emailVerified)}
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">
                {ownerSessionDiagnostic.statusSummaryAr}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              disabled={isVerifyingOwnerAction}
              onClick={async () => {
                setIsVerifyingOwnerAction(true);
                try {
                  await refreshAuthUser();
                } finally {
                  setIsVerifyingOwnerAction(false);
                }
              }}
              className="min-h-[38px] px-3 rounded-2xl bg-white/90 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 hover:border-[#743B46] cursor-pointer transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isVerifyingOwnerAction ? 'animate-spin' : ''}`} />
              <span>تحديث الجلسة</span>
            </button>

            {showPlatformAdminEntry && (
              <button
                type="button"
                onClick={() => setActiveScreen('platform_admin')}
                className="min-h-[40px] px-4 rounded-2xl bg-[#743B46] hover:bg-[#5D2D37] text-white text-xs font-extrabold flex items-center gap-2 cursor-pointer transition-colors shrink-0"
              >
                <Shield className="w-4 h-4" />
                <span>فتح إدارة المنصة الآن</span>
              </button>
            )}
          </div>
        </div>

        {/* جدول المقارنة التشخيصية الآمنة (بين auth.currentUser.email و firebaseUser.email و providerData لمزوّد google.com ورمز التوثيق، بدون أي رموز سرية) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-2 border-t border-slate-200/70 dark:border-slate-800/70 text-xs">
          <div className="p-2.5 rounded-2xl bg-white/80 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800">
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-bold">
              1. مقارنة البريد في الكائن الأصلي (auth.currentUser vs firebaseUser)
            </div>
            <div className="font-mono font-extrabold text-slate-900 dark:text-white mt-0.5 break-all space-y-0.5" dir="ltr">
              <div>auth.currentUser.email: {ownerSessionDiagnostic.authCurrentUserEmailRaw || 'null'}</div>
              <div>firebaseUser.email: {ownerSessionDiagnostic.firebaseEmailRaw || 'null'}</div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400">
                sameRef: {String(ownerSessionDiagnostic.isSameAsAuthCurrentUser)} | nativeInstance: {String(ownerSessionDiagnostic.isOriginalFirebaseUserInstance)}
              </div>
            </div>
          </div>

          <div className="p-2.5 rounded-2xl bg-white/80 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800">
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-bold">
              2. بيانات المزوّد (providerData: google.com) والبريد الموثّق
            </div>
            <div className="font-mono font-extrabold text-slate-900 dark:text-white mt-0.5 break-all space-y-0.5" dir="ltr">
              <div>
                google.com email: {ownerSessionDiagnostic.googleProviderEmailRaw || 'null'}
              </div>
              <div className="text-emerald-700 dark:text-emerald-300">
                verifiedEmail: {ownerSessionDiagnostic.effectiveVerifiedEmail || 'null'}
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400">
                tokenProvider: {ownerSessionDiagnostic.verifiedTokenSignInProvider || 'none'} | sync: {ownerSessionDiagnostic.emailSyncStatus}
              </div>
            </div>
          </div>

          <div className="p-2.5 rounded-2xl bg-white/80 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800">
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-bold">
              3. توثيق الجلسة وصلاحية المالك (emailVerified & isPlatformAdmin)
            </div>
            <div
              className={`font-mono font-extrabold mt-0.5 space-y-0.5 ${
                ownerSessionDiagnostic.emailVerified && isPlatformAdmin
                  ? 'text-emerald-700 dark:text-emerald-300'
                  : 'text-amber-700 dark:text-amber-300'
              }`}
              dir="ltr"
            >
              <div>
                emailVerified: {String(ownerSessionDiagnostic.emailVerified)} (raw: {String(ownerSessionDiagnostic.topLevelEmailVerifiedRaw)})
              </div>
              <div>
                isPlatformAdmin: {String(isPlatformAdmin)} | canAccess: {String(canAccessPlatformAdmin)}
              </div>
            </div>
          </div>

          <div className="p-2.5 rounded-2xl bg-white/80 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800">
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-bold">
              4. سبب رفض صلاحية المالك (rejectionReason)
            </div>
            <div className="font-mono font-extrabold text-slate-900 dark:text-white mt-0.5" dir="ltr">
              {ownerSessionDiagnostic.rejectionReason || 'none (مقبول وموثّق)'}
            </div>
            {ownerSessionDiagnostic.rejectionReasonAr && (
              <div className="text-[11px] text-amber-800 dark:text-amber-300 mt-0.5">
                {ownerSessionDiagnostic.rejectionReasonAr}
              </div>
            )}
          </div>
        </div>

        {ownerSessionDiagnostic.requiresEmailVerificationForAdmin && (
          <div className="pt-2 border-t border-amber-200/80 dark:border-amber-800/60 space-y-2.5">
            <div className="text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
              حفاظًا على أمان Firebase وقواعد Firestore، لا تُمنح صلاحيات «إدارة المنصة» بالاعتماد على نص البريد أو بيانات المزود (providerData) وحدها قبل أن يصبح <code className="font-mono">emailVerified === true</code>. يمكنك تفعيل صلاحياتك فورًا بإحدى الطرق الآمنة التالية:
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={isVerifyingOwnerAction}
                onClick={async () => {
                  setIsVerifyingOwnerAction(true);
                  try {
                    await loginWithGoogle();
                  } finally {
                    setIsVerifyingOwnerAction(false);
                  }
                }}
                className="min-h-[40px] px-4 rounded-2xl bg-[#743B46] hover:bg-[#5D2D37] text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>تسجيل الدخول الموثّق عبر Google (موصى به — تفعيل فوري)</span>
              </button>

              <button
                type="button"
                disabled={isVerifyingOwnerAction}
                onClick={async () => {
                  setIsVerifyingOwnerAction(true);
                  try {
                    await resendVerificationEmail();
                  } finally {
                    setIsVerifyingOwnerAction(false);
                  }
                }}
                className="min-h-[40px] px-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 text-slate-800 dark:text-slate-100 text-xs font-bold hover:border-[#743B46] cursor-pointer transition-colors disabled:opacity-50"
              >
                إرسال رابط توثيق البريد الإلكتروني
              </button>

              <button
                type="button"
                disabled={isVerifyingOwnerAction}
                onClick={async () => {
                  setIsVerifyingOwnerAction(true);
                  try {
                    await refreshAuthUser();
                  } finally {
                    setIsVerifyingOwnerAction(false);
                  }
                }}
                className="min-h-[40px] px-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 text-slate-800 dark:text-slate-100 text-xs font-bold flex items-center gap-1.5 hover:border-[#743B46] cursor-pointer transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isVerifyingOwnerAction ? 'animate-spin' : ''}`} />
                <span>تحديث وفحص حالة التوثيق الآن</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Main Modules Directory */}
      <div className="bg-white dark:bg-[#0D1829] border border-slate-200/80 dark:border-slate-800/80 rounded-3xl overflow-hidden shadow-xs">
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2 flex-wrap">
          <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">
            وحدات وشاشات النظام المتكاملة
          </h2>
          {showPlatformAdminEntry && (
            <span className="text-[11px] font-bold text-[#743B46] dark:text-[#E5B9C0]">
              يتضمن خيار «إدارة المنصة» في أعلى القائمة
            </span>
          )}
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveScreen(item.id)}
              className={`w-full min-h-[66px] px-5 py-3.5 flex items-center justify-between gap-3 transition-colors text-right cursor-pointer ${
                item.id === 'platform_admin'
                  ? 'bg-[#743B46]/5 hover:bg-[#743B46]/10 dark:bg-[#743B46]/15 dark:hover:bg-[#743B46]/25'
                  : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
              }`}
            >
              <div className="flex items-center gap-3.5">
                <div className={`w-11 h-11 rounded-2xl ${item.badgeBg} flex items-center justify-center shrink-0`}>
                  {item.icon}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-extrabold text-slate-900 dark:text-white">
                      {item.label}
                    </span>
                    {item.highlightBadge && (
                      <span className="px-2 py-0.5 rounded-lg bg-[#743B46] text-white text-[11px] font-bold">
                        {item.highlightBadge}
                      </span>
                    )}
                  </div>
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
              <span>نسخ البيانات التشغيلية وحوكمة المنصة (JSON) وفحص الاستعادة المعزول</span>
            </div>
            <p className="text-xs text-slate-500">
              تصدير تشغيلي لـ {scopeDisclosure.includedCollections.length} مجموعة (يشمل التراخيص والباقات ومساعدي المنصة وسجلات التدقيق) ومعاينة استعادة معزولة
            </p>
          </button>
        )}

        {showPlatformAdminEntry && (
          <button
            type="button"
            onClick={() => setActiveScreen('platform_admin')}
            className="p-4 rounded-3xl bg-gradient-to-l from-[#292725] to-[#4A252D] text-white border border-[#743B46] text-right transition-all cursor-pointer sm:col-span-2 lg:col-span-3 shadow-sm hover:opacity-95"
          >
            <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
              <div className="flex items-center gap-2 text-sm font-extrabold">
                <Shield className="w-4 h-4 text-[#E5B9C0]" />
                <span>لوحة إدارة منصة «رَصْد» (الطلبات · التراخيص · الباقات · المساعدون · التدقيق)</span>
              </div>
              <span className="px-2.5 py-0.5 rounded-lg bg-white/15 text-[#F4F1EA] text-[11px] font-bold">
                {receivedRegistrationRequests.filter((r) => r.status === 'pending').length} طلب بانتظار المراجعة
              </span>
            </div>
            <p className="text-xs text-[#DFD8CE]">
              إدارة طلبات التسجيل، قبول أو رفض العملاء (للمالكين الدائمين فقط)، تفعيل وتجديد وتعليق التراخيص، إدارة الباقات وحدود الفريق، صلاحيات المساعدين، وسجل التدقيق الإداري.
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

            <button
              type="button"
              onClick={() => {
                if (subPanel !== 'reg_requests') {
                  void refreshReceivedRegistrationRequests();
                }
                setSubPanel(subPanel === 'reg_requests' ? 'none' : 'reg_requests');
              }}
              className={`p-4 rounded-3xl bg-white dark:bg-[#0D1829] border text-right transition-colors cursor-pointer ${
                subPanel === 'reg_requests'
                  ? 'border-[#743B46] ring-2 ring-[#743B46]/20'
                  : 'border-slate-200/80 dark:border-slate-800/80 hover:border-[#743B46]'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2 text-sm font-extrabold text-slate-900 dark:text-white">
                  <UserCheck className="w-4 h-4 text-[#743B46]" />
                  <span>معاينة سريعة لطلبات التسجيل</span>
                </div>
                <span className="px-2 py-0.5 rounded-lg bg-[#743B46]/10 text-[#743B46] dark:text-[#E5B9C0] text-[11px] font-bold">
                  {receivedRegistrationRequests.filter((r) => r.status === 'pending').length} بانتظار الموافقة
                </span>
              </div>
              <p className="text-xs text-slate-500">
                عرض سريع لحالة الطلبات (أو افتح لوحة إدارة المنصة للقبول والرفض الكامل)
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

      {/* Sub-panel: Received Registration Requests Preview */}
      {isPlatformAdmin && subPanel === 'reg_requests' && (
        <div className="bg-white dark:bg-[#0D1829] border border-slate-200/80 dark:border-slate-800/80 rounded-3xl p-5 space-y-4 shadow-xs text-xs">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-[#743B46]" />
                <span>سجل استقبال طلبات تسجيل العملاء وحالتها</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                عرض سريع لطلبات التسجيل المستقبلة وحالتها الحالية، مع إمكانية فتح لوحة إدارة المنصة الكاملة لاعتماد الطلبات أو رفضها وإدارة الاشتراكات.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setActiveScreen('platform_admin')}
                className="min-h-[34px] px-3 rounded-xl bg-[#743B46] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Shield className="w-3.5 h-3.5" />
                <span>فتح لوحة إدارة المنصة</span>
              </button>
              <button
                type="button"
                onClick={() => void refreshReceivedRegistrationRequests()}
                className="min-h-[34px] px-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>تحديث القائمة</span>
              </button>
              <button
                type="button"
                onClick={() => setSubPanel('none')}
                className="min-h-[34px] px-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>

          {receivedRegistrationRequests.length === 0 ? (
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 text-center">
              لا توجد طلبات تسجيل جديدة في قائمة الانتظار حاليًا.
            </div>
          ) : (
            <div className="space-y-2.5">
              {receivedRegistrationRequests.map((req) => (
                <div
                  key={req.workspaceId}
                  className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 flex-wrap"
                >
                  <div className="space-y-1">
                    <div className="font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                      <span>{req.applicantName}</span>
                      <span className="font-mono text-[11px] text-slate-500" dir="ltr">
                        ({req.applicantEmail})
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono">
                      Workspace: {req.workspaceId} · Plan: {req.requestedPlanId}
                    </div>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-xl text-[11px] font-bold ${
                      req.status === 'pending'
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                        : req.status === 'active'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                        : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                    }`}
                  >
                    {req.status === 'pending'
                      ? 'بانتظار الموافقة'
                      : req.status === 'active'
                      ? 'معتمد ونشط'
                      : req.status === 'suspended'
                      ? 'موقوف'
                      : 'منتهي'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
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
