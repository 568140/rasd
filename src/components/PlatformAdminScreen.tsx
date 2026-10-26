import React, { useMemo, useState, useEffect } from 'react';
import {
  ShieldCheck,
  UserCheck,
  Users,
  Package,
  UserCog,
  FileText,
  RefreshCw,
  CheckCircle2,
  XCircle,
  PauseCircle,
  PlayCircle,
  Crown,
  Lock,
  Search,
  AlertTriangle,
  CalendarClock,
  Plus,
  Trash2,
  Save,
  ArrowRight,
  Download,
  Database,
  ShieldAlert,
} from 'lucide-react';
import { useRasd } from '../context/RasdContext';
import {
  authorizePlatformOperation,
  isSyntheticOrInvalidStaffUid,
  PERMANENT_PLATFORM_OWNER_EMAILS,
  resolveVerifiedOrTopLevelUserEmail,
} from '../services/licenseService';
import {
  exportFirestoreBackup,
  downloadBackupJsonFile,
} from '../services/backupService';
import {
  CurrencyCode,
  CURRENCY_LIST,
  LicenseStatus,
  PlatformClientAccountSummary,
  PlatformStaffPermissions,
  RegistrationRequestMetadata,
  SubscriptionPlanId,
} from '../types/rasd';

type AdminTabId = 'requests' | 'clients' | 'packages' | 'staff' | 'audit';

const PLAN_OPTIONS: { id: Exclude<SubscriptionPlanId, 'owner_permanent'>; label: string }[] = [
  { id: 'trial', label: 'الباقة التجريبية (14 يومًا)' },
  { id: 'monthly', label: 'الباقة الشهرية (30 يومًا)' },
  { id: 'quarterly', label: 'الباقة ربع السنوية (90 يومًا)' },
  { id: 'semi_annual', label: 'الباقة نصف السنوية (180 يومًا)' },
  { id: 'annual', label: 'الباقة السنوية (365 يومًا)' },
  { id: 'lifetime', label: 'الباقة الدائمة (مدى الحياة)' },
  { id: 'custom', label: 'باقة بمدة مخصصة' },
];

function formatArabicDate(iso: string | null | undefined, isLifetime?: boolean): string {
  if (isLifetime) return 'مدى الحياة (دائم)';
  if (!iso) return '—';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '—';
  const d = new Date(ms);
  if (d.getUTCFullYear() >= 2099) return 'مدى الحياة (دائم)';
  return d.toISOString().slice(0, 10);
}

function getStatusBadge(
  status: LicenseStatus,
  options?: { isPermanentOwner?: boolean; isGrandfathered?: boolean; isExpired?: boolean }
) {
  if (options?.isPermanentOwner) {
    return {
      label: 'مالك دائم (مدى الحياة)',
      cls: 'bg-[#743B46]/15 text-[#743B46] dark:bg-[#743B46]/30 dark:text-[#F2CFD5] border-[#743B46]/30',
    };
  }
  if (options?.isGrandfathered) {
    return {
      label: 'حساب حالي نشط (محفوظ)',
      cls: 'bg-sky-50 text-sky-800 dark:bg-sky-950/60 dark:text-sky-200 border-sky-200 dark:border-sky-800',
    };
  }
  if (status === 'pending') {
    return {
      label: 'بانتظار الموافقة',
      cls: 'bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200 border-amber-200 dark:border-amber-800',
    };
  }
  if (status === 'suspended') {
    return {
      label: 'موقوف / مرفوض',
      cls: 'bg-rose-50 text-rose-800 dark:bg-rose-950/60 dark:text-rose-200 border-rose-200 dark:border-rose-800',
    };
  }
  if (status === 'expired' || options?.isExpired) {
    return {
      label: 'منتهي الصلاحية (قراءة فقط)',
      cls: 'bg-orange-50 text-orange-800 dark:bg-orange-950/60 dark:text-orange-200 border-orange-200 dark:border-orange-800',
    };
  }
  return {
    label: 'نشط ومعتمد',
    cls: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800',
  };
}

export const PlatformAdminScreen: React.FC = () => {
  const {
    firebaseUser,
    isPlatformAdmin,
    ownerSessionDiagnostic,
    platformStaffRecord,
    canAccessPlatformAdmin,
    loginWithGoogle,
    resendVerificationEmail,
    refreshAuthUser,
    receivedRegistrationRequests,
    platformClientAccounts,
    subscriptionPackages,
    platformStaffList,
    platformAdminAuditLogs,
    platformFirestoreSyncStatus,
    refreshPlatformAdminData,
    decideRegistrationRequest,
    mutateClientSubscription,
    updateSubscriptionPackageConfig,
    upsertPlatformStaffMember,
    removePlatformStaffMember,
    setActiveScreen,
    showToast,
  } = useRasd();

  const [activeTab, setActiveTab] = useState<AdminTabId>('requests');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isVerifyingOwner, setIsVerifyingOwner] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [reqFilter, setReqFilter] = useState<'all' | 'pending' | 'active' | 'suspended'>('all');
  const [clientFilter, setClientFilter] = useState<'all' | 'active' | 'pending' | 'expired' | 'suspended'>('all');

  // State for Registration Request Decision Drawer/Card
  const [selectedReqId, setSelectedReqId] = useState<string | null>(null);
  const [decisionPlanId, setDecisionPlanId] = useState<SubscriptionPlanId>('monthly');
  const [decisionCustomDays, setDecisionCustomDays] = useState<string>('30');
  const [decisionMaxMembers, setDecisionMaxMembers] = useState<string>('5');
  const [decisionNotes, setDecisionNotes] = useState<string>('');
  const [isSubmittingDecision, setIsSubmittingDecision] = useState(false);

  // State for Client Subscription Action Drawer/Card
  const [selectedClientWsId, setSelectedClientWsId] = useState<string | null>(null);
  const [clientActionPlanId, setClientActionPlanId] = useState<SubscriptionPlanId>('monthly');
  const [clientCustomDays, setClientCustomDays] = useState<string>('30');
  const [clientMaxMembers, setClientMaxMembers] = useState<string>('5');
  const [clientActionNotes, setClientActionNotes] = useState<string>('');
  const [isSubmittingClientAction, setIsSubmittingClientAction] = useState(false);

  // State for Package Editing
  const [editingPlanId, setEditingPlanId] = useState<SubscriptionPlanId | null>(null);
  const [pkgNameAr, setPkgNameAr] = useState('');
  const [pkgDescAr, setPkgDescAr] = useState('');
  const [pkgDurationDays, setPkgDurationDays] = useState('30');
  const [pkgMaxMembers, setPkgMaxMembers] = useState('5');
  const [pkgPrice, setPkgPrice] = useState('0');
  const [pkgCurrency, setPkgCurrency] = useState<CurrencyCode>('SAR');
  const [pkgIsActive, setPkgIsActive] = useState(true);

  // State for Platform Staff Form
  const [staffUidInput, setStaffUidInput] = useState('');
  const [staffEmailInput, setStaffEmailInput] = useState('');
  const [staffNameInput, setStaffNameInput] = useState('');
  const [staffStatusInput, setStaffStatusInput] = useState<'active' | 'suspended'>('active');
  const [staffPermsInput, setStaffPermsInput] = useState<PlatformStaffPermissions>({
    canViewRequests: true,
    canApproveAndRenew: false,
    canManagePackages: false,
  });
  const [auditLogFilter, setAuditLogFilter] = useState<'all' | 'denied_only' | 'admin_ops'>('all');

  // Programmatic Permission Evaluations (Aligned strictly with licenseService.ts & firestore.rules)
  const canDecideRequests = useMemo(
    () =>
      authorizePlatformOperation({
        actorAuth: firebaseUser,
        actorStaffRecord: platformStaffRecord,
        operation: 'decide_registration_request',
      }).allowed,
    [firebaseUser, platformStaffRecord, isPlatformAdmin]
  );

  const canRenewOrSuspend = useMemo(
    () =>
      authorizePlatformOperation({
        actorAuth: firebaseUser,
        actorStaffRecord: platformStaffRecord,
        operation: 'renew_subscription',
      }).allowed,
    [firebaseUser, platformStaffRecord, isPlatformAdmin]
  );

  const canManagePackages = useMemo(
    () =>
      authorizePlatformOperation({
        actorAuth: firebaseUser,
        actorStaffRecord: platformStaffRecord,
        operation: 'manage_packages',
      }).allowed,
    [firebaseUser, platformStaffRecord, isPlatformAdmin]
  );

  const canManageStaff = useMemo(
    () =>
      authorizePlatformOperation({
        actorAuth: firebaseUser,
        actorStaffRecord: platformStaffRecord,
        operation: 'manage_platform_staff',
      }).allowed,
    [firebaseUser, platformStaffRecord, isPlatformAdmin]
  );

  // Automatically refresh platform admin data on mount and poll every 15 seconds
  useEffect(() => {
    void refreshPlatformAdminData();
    const timer = setInterval(() => {
      void refreshPlatformAdminData();
    }, 15000);
    return () => clearInterval(timer);
  }, [refreshPlatformAdminData]);

  // Access Gate if user is neither Verified Permanent Owner nor Active Delegated Staff
  if (!canAccessPlatformAdmin) {
    if (ownerSessionDiagnostic.requiresEmailVerificationForAdmin) {
      return (
        <div className="py-6 px-4 max-w-2xl mx-auto space-y-5" dir="rtl">
          <div className="rounded-3xl bg-white dark:bg-[#1E1C1A] border border-amber-300 dark:border-amber-800/80 p-6 shadow-sm space-y-4">
            <div className="flex items-start gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-base sm:text-lg font-extrabold text-[#292725] dark:text-[#F4F1EA]">
                    يلزم توثيق البريد الإلكتروني لتفعيل صلاحيات المالك الدائم
                  </h1>
                  <span className="px-2.5 py-0.5 rounded-lg bg-amber-100 dark:bg-amber-900/70 text-amber-900 dark:text-amber-200 text-[11px] font-bold font-mono">
                    email_verified: false
                  </span>
                </div>
                <p className="text-xs text-[#77716B] dark:text-[#ACA59C] leading-relaxed">
                  {ownerSessionDiagnostic.statusSummaryAr}
                </p>
              </div>
            </div>

            <div className="rounded-2xl bg-[#F7F5F0] dark:bg-[#161514] border border-[#E7E1D8] dark:border-[#383431] p-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <div className="text-[11px] text-[#77716B] dark:text-[#ACA59C]">البريد المسجل في الجلسة</div>
                <div className="font-mono font-bold text-[#292725] dark:text-[#F4F1EA] mt-0.5" dir="ltr">
                  {ownerSessionDiagnostic.normalizedEmail}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-[#77716B] dark:text-[#ACA59C]">الصفة المطابقة</div>
                <div className="font-bold text-[#743B46] dark:text-[#E5B9C0] mt-0.5">
                  {ownerSessionDiagnostic.matchedOwnerRole === 'primary_owner'
                    ? 'المالك الدائم الرئيسي'
                    : 'المالك الدائم الاحتياطي'}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-[#77716B] dark:text-[#ACA59C]">مزود الدخول الحالي</div>
                <div className="font-mono font-bold text-[#292725] dark:text-[#F4F1EA] mt-0.5" dir="ltr">
                  {ownerSessionDiagnostic.authProviderIds.join(', ') || 'password'}
                </div>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
              <strong>قاعدة الأمان المطبقة في الكود وفي Firestore:</strong> لا تُمنح صلاحيات الإدارة السيادية بالاعتماد على نص البريد الإلكتروني وحده دون التحقق الفعلي من ملكية البريد (<code className="font-mono">email_verified == true</code>).
            </div>

            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <button
                type="button"
                disabled={isVerifyingOwner}
                onClick={async () => {
                  setIsVerifyingOwner(true);
                  try {
                    await loginWithGoogle();
                  } finally {
                    setIsVerifyingOwner(false);
                  }
                }}
                className="min-h-[44px] px-4 rounded-2xl bg-[#743B46] hover:bg-[#5D2D37] text-white text-xs font-extrabold inline-flex items-center gap-2 cursor-pointer transition-colors disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>تسجيل الدخول الموثّق عبر Google (تفعيل فوري)</span>
              </button>

              <button
                type="button"
                disabled={isVerifyingOwner}
                onClick={async () => {
                  setIsVerifyingOwner(true);
                  try {
                    await resendVerificationEmail();
                  } finally {
                    setIsVerifyingOwner(false);
                  }
                }}
                className="min-h-[44px] px-4 rounded-2xl bg-[#EFECE6] hover:bg-[#E5DFD6] dark:bg-[#2B2826] dark:hover:bg-[#383431] text-[#292725] dark:text-[#F4F1EA] text-xs font-bold inline-flex items-center gap-2 cursor-pointer transition-colors disabled:opacity-50"
              >
                <span>إرسال رابط توثيق البريد</span>
              </button>

              <button
                type="button"
                disabled={isVerifyingOwner}
                onClick={async () => {
                  setIsVerifyingOwner(true);
                  try {
                    await refreshAuthUser();
                  } finally {
                    setIsVerifyingOwner(false);
                  }
                }}
                className="min-h-[44px] px-4 rounded-2xl bg-[#EFECE6] hover:bg-[#E5DFD6] dark:bg-[#2B2826] dark:hover:bg-[#383431] text-[#292725] dark:text-[#F4F1EA] text-xs font-bold inline-flex items-center gap-2 cursor-pointer transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isVerifyingOwner ? 'animate-spin' : ''}`} />
                <span>تحديث وفحص حالة التوثيق الآن</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveScreen('more')}
                className="min-h-[44px] px-4 rounded-2xl border border-[#DFD8CE] dark:border-[#383431] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowRight className="w-4 h-4" />
                <span>العودة إلى المزيد</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="py-10 px-4 max-w-lg mx-auto text-center space-y-4" dir="rtl">
        <div className="w-14 h-14 rounded-3xl bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 flex items-center justify-center mx-auto">
          <Lock className="w-7 h-7" />
        </div>
        <h1 className="text-lg font-extrabold text-[#292725] dark:text-[#F4F1EA]">
          منطقة إدارية مقيدة
        </h1>
        <p className="text-xs text-[#77716B] dark:text-[#ACA59C] leading-relaxed">
          لوحة إدارة منصة «رَصْد» مخصصة حصريًا لمالكي المنصة الدائمين أو مساعدي المنصة المفوضين بصلاحيات سارية.
        </p>
        <button
          type="button"
          onClick={() => setActiveScreen('home')}
          className="min-h-[44px] px-5 rounded-2xl bg-[#743B46] text-white text-xs font-extrabold inline-flex items-center gap-2 cursor-pointer"
        >
          <ArrowRight className="w-4 h-4" />
          <span>العودة إلى الشاشة الرئيسية</span>
        </button>
      </div>
    );
  }

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      const syncResult = await refreshPlatformAdminData();
      if (syncResult && syncResult.hasPermissionDenied) {
        showToast(
          `رفض خادم Firestore قراءة (${syncResult.deniedCollections.join(
            '، '
          )}) بسبب permission-denied. تحقق من نشر قواعد Firestore المحدثة.`,
          'error'
        );
      } else {
        showToast('تم تحديث بيانات لوحة إدارة المنصة من Firestore بنجاح.', 'info');
      }
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'تعذر تحديث بيانات لوحة الإدارة من الخادم.',
        'error'
      );
    } finally {
      setIsRefreshing(false);
    }
  };

  const pendingRequestsCount = receivedRegistrationRequests.filter(
    (r) => r.status === 'pending'
  ).length;
  const activeClientsCount = platformClientAccounts.filter(
    (c) => c.effectiveStatus === 'active'
  ).length;
  const suspendedOrExpiredCount = platformClientAccounts.filter(
    (c) => c.effectiveStatus === 'suspended' || c.effectiveStatus === 'expired'
  ).length;

  const filteredRequests = receivedRegistrationRequests.filter((r) => {
    if (reqFilter !== 'all' && r.status !== reqFilter) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim().toLowerCase();
    return (
      r.applicantName.toLowerCase().includes(q) ||
      r.applicantEmail.toLowerCase().includes(q) ||
      r.workspaceName.toLowerCase().includes(q) ||
      r.workspaceId.toLowerCase().includes(q)
    );
  });

  const filteredClients = platformClientAccounts.filter((c) => {
    if (clientFilter !== 'all' && c.effectiveStatus !== clientFilter) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim().toLowerCase();
    return (
      c.ownerName.toLowerCase().includes(q) ||
      c.ownerEmail.toLowerCase().includes(q) ||
      c.workspaceName.toLowerCase().includes(q) ||
      c.workspaceId.toLowerCase().includes(q)
    );
  });

  const openRequestDecisionPanel = (req: RegistrationRequestMetadata) => {
    setSelectedReqId(req.workspaceId);
    const defaultPlan =
      req.requestedPlanId && req.requestedPlanId !== 'owner_permanent'
        ? req.requestedPlanId
        : 'monthly';
    setDecisionPlanId(defaultPlan);
    const pkg = subscriptionPackages[defaultPlan] || subscriptionPackages.monthly;
    setDecisionMaxMembers(String(pkg.defaultMaxMembers));
    setDecisionCustomDays(String(pkg.durationDays || 30));
    setDecisionNotes('');
  };

  const submitRegistrationDecision = async (
    req: RegistrationRequestMetadata,
    decision: 'approve' | 'reject'
  ) => {
    setIsSubmittingDecision(true);
    try {
      await decideRegistrationRequest({
        request: req,
        decision,
        approvedPlanId: decisionPlanId,
        customDurationDays:
          decisionPlanId === 'custom' ? Math.max(1, parseInt(decisionCustomDays, 10) || 30) : null,
        maxMembers: Math.max(1, Math.min(10, parseInt(decisionMaxMembers, 10) || 5)),
        decisionNotes,
      });
      setSelectedReqId(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'تعذر تنفيذ القرار الإداري.', 'error');
    } finally {
      setIsSubmittingDecision(false);
    }
  };

  const openClientActionPanel = (client: PlatformClientAccountSummary) => {
    setSelectedClientWsId(client.workspaceId);
    const plan = client.planId === 'owner_permanent' ? 'monthly' : client.planId;
    setClientActionPlanId(plan);
    setClientMaxMembers(String(client.maxMembers || 5));
    const pkg = subscriptionPackages[plan];
    setClientCustomDays(String(pkg?.durationDays || 30));
    setClientActionNotes('');
  };

  const submitClientSubscriptionAction = async (
    client: PlatformClientAccountSummary,
    action: 'activate' | 'renew' | 'suspend' | 'reactivate'
  ) => {
    setIsSubmittingClientAction(true);
    try {
      await mutateClientSubscription({
        client,
        action,
        planId: clientActionPlanId,
        customDurationDays:
          clientActionPlanId === 'custom' ? Math.max(1, parseInt(clientCustomDays, 10) || 30) : null,
        maxMembers: Math.max(1, Math.min(10, parseInt(clientMaxMembers, 10) || client.maxMembers)),
        notes: clientActionNotes,
      });
      setSelectedClientWsId(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'تعذر تحديث اشتراك العميل.', 'error');
    } finally {
      setIsSubmittingClientAction(false);
    }
  };

  const startEditingPackage = (planId: SubscriptionPlanId) => {
    const pkg = subscriptionPackages[planId];
    if (!pkg || planId === 'owner_permanent') return;
    setEditingPlanId(planId);
    setPkgNameAr(pkg.nameAr);
    setPkgDescAr(pkg.descriptionAr);
    setPkgDurationDays(pkg.durationDays !== null ? String(pkg.durationDays) : '');
    setPkgMaxMembers(String(pkg.defaultMaxMembers));
    setPkgPrice(String(pkg.priceAmount));
    setPkgCurrency(pkg.currency);
    setPkgIsActive(pkg.isActive);
  };

  const handleSavePackage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlanId) return;
    const trimmedName = pkgNameAr.trim();
    const trimmedDesc = pkgDescAr.trim();
    if (trimmedName.length < 2 || trimmedName.length > 80) {
      showToast('اسم الباقة مطلوب ويجب أن يتراوح بين حرفين و80 حرفًا.', 'error');
      return;
    }
    if (trimmedDesc.length < 2 || trimmedDesc.length > 500) {
      showToast('وصف الباقة مطلوب ويجب أن يتراوح بين حرفين و500 حرف.', 'error');
      return;
    }
    try {
      const targetPkg = subscriptionPackages[editingPlanId];
      await updateSubscriptionPackageConfig(editingPlanId, {
        nameAr: trimmedName,
        descriptionAr: trimmedDesc,
        durationDays: targetPkg.isLifetime ? null : Math.max(1, parseInt(pkgDurationDays, 10) || 30),
        defaultMaxMembers: Math.max(1, Math.min(10, parseInt(pkgMaxMembers, 10) || 5)),
        priceAmount: Math.max(0, parseFloat(pkgPrice) || 0),
        currency: pkgCurrency,
        isActive: Boolean(pkgIsActive),
      });
      setEditingPlanId(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'تعذر حفظ تعديلات الباقة.', 'error');
    }
  };

  const handleSaveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUid = staffUidInput.trim();
    const trimmedEmail = staffEmailInput.trim().toLowerCase();
    const trimmedName = staffNameInput.trim();

    if (!trimmedUid) {
      showToast(
        'لا يمكن الحفظ بدون معرف حساب Firebase حقيقي (UID). يرجى إدخال UID الفعلي للمستخدم المسجل في المنصة أو اختياره من القائمة.',
        'error'
      );
      return;
    }

    const staffUidCheck = isSyntheticOrInvalidStaffUid(trimmedUid, trimmedEmail);
    if (staffUidCheck.isInvalidOrSynthetic) {
      showToast(
        staffUidCheck.reasonAr ||
          'معرف الحساب (UID) المدخل اصطناعي أو غير صالح. يجب إدخال UID حقيقي يطابق حساب Firebase مسجل في /users.',
        'error'
      );
      return;
    }

    try {
      await upsertPlatformStaffMember({
        staffUid: trimmedUid,
        email: trimmedEmail,
        displayName: trimmedName,
        status: staffStatusInput,
        permissions: staffPermsInput,
      });
      setStaffUidInput('');
      setStaffEmailInput('');
      setStaffNameInput('');
      setStaffStatusInput('active');
      setStaffPermsInput({
        canViewRequests: true,
        canApproveAndRenew: false,
        canManagePackages: false,
      });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'تعذر حفظ بيانات مساعد المنصة.', 'error');
    }
  };

  return (
    <div className="space-y-4 pb-8" dir="rtl">
      {/* Header Banner */}
      <div className="rounded-3xl bg-gradient-to-l from-[#292725] via-[#4A252D] to-[#743B46] text-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-6 h-6 text-[#F2CFD5]" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-base sm:text-lg font-extrabold">
                  لوحة إدارة منصة «رَصْد» والتراخيص
                </h1>
                <span className="px-2.5 py-0.5 rounded-lg bg-white/15 text-[11px] font-bold">
                  {isPlatformAdmin ? 'مالك منصة دائم (كامل الصلاحيات)' : 'مساعد منصة مفوض'}
                </span>
              </div>
              <p className="text-xs text-stone-200 mt-1 leading-relaxed">
                إدارة طلبات تسجيل العملاء، تفعيل وتجديد الاشتراكات، الباقات وحدود الفرق، ومساعدي المنصة، مع حفظ كامل لبيانات العملاء.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="min-h-[44px] px-4 rounded-2xl bg-white/15 hover:bg-white/25 border border-white/20 text-xs font-extrabold flex items-center gap-2 cursor-pointer transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>تحديث السجلات</span>
          </button>
        </div>

        {/* Summary Metrics Row (Tabular Numerals) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4">
          <div className="p-3 rounded-2xl bg-black/20 border border-white/10">
            <div className="text-[11px] text-stone-300">طلبات بانتظار الموافقة</div>
            <div className="text-xl font-extrabold font-mono tabular-nums mt-0.5 text-amber-300">
              {pendingRequestsCount}
            </div>
          </div>
          <div className="p-3 rounded-2xl bg-black/20 border border-white/10">
            <div className="text-[11px] text-stone-300">حسابات وتراخيص نشطة</div>
            <div className="text-xl font-extrabold font-mono tabular-nums mt-0.5 text-emerald-300">
              {activeClientsCount}
            </div>
          </div>
          <div className="p-3 rounded-2xl bg-black/20 border border-white/10">
            <div className="text-[11px] text-stone-300">منتهية / موقوفة (بياناتها محفوظة)</div>
            <div className="text-xl font-extrabold font-mono tabular-nums mt-0.5 text-rose-200">
              {suspendedOrExpiredCount}
            </div>
          </div>
          <div className="p-3 rounded-2xl bg-black/20 border border-white/10">
            <div className="text-[11px] text-stone-300">مساعدو المنصة المفوضون</div>
            <div className="text-xl font-extrabold font-mono tabular-nums mt-0.5 text-sky-200">
              {platformStaffList.filter((s) => s.status === 'active').length}
            </div>
          </div>
        </div>
      </div>

      {/* Permanent Owners Sovereign Status Card */}
      <div className="rounded-3xl bg-[#FFFEFC] dark:bg-[#22201F] border border-[#E7E1D8] dark:border-[#383431] p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#743B46]/10 dark:bg-[#743B46]/25 text-[#743B46] dark:text-[#E5B9C0] flex items-center justify-center shrink-0">
            <Crown className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-extrabold text-[#292725] dark:text-[#F4F1EA]">
              حسابا المالكين الدائمين المعتمدان (صلاحيات كاملة ومجانية مدى الحياة)
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] font-mono text-[#77716B] dark:text-[#ACA59C]">
              <span className="px-2 py-0.5 rounded-lg bg-[#EFECE6] dark:bg-[#2B2826] font-bold text-[#292725] dark:text-[#F4F1EA]">
                am1075022@gmail.com
              </span>
              <span className="px-2 py-0.5 rounded-lg bg-[#EFECE6] dark:bg-[#2B2826] font-bold text-[#292725] dark:text-[#F4F1EA]">
                ahah26@gmail.com / ahah26h@gmail.com
              </span>
            </div>
          </div>
        </div>
        <span className="px-3 py-1 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-[11px] font-extrabold">
          معفيان دائمًا من الاشتراكات والإيقاف ({PERMANENT_PLATFORM_OWNER_EMAILS.length > 0 ? 'مدى الحياة' : ''})
        </span>
      </div>

      {/* Live Firestore Server Permission & Security Rules Verification Status */}
      <div
        className={`rounded-3xl p-4 text-xs space-y-2 border ${
          platformFirestoreSyncStatus.hasServerPermissionDenied
            ? 'bg-rose-50/90 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800'
            : 'bg-amber-50/90 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/80'
        }`}
      >
        <div
          className={`font-extrabold flex items-center justify-between gap-2 flex-wrap ${
            platformFirestoreSyncStatus.hasServerPermissionDenied
              ? 'text-rose-900 dark:text-rose-200'
              : 'text-amber-900 dark:text-amber-200'
          }`}
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              {platformFirestoreSyncStatus.hasServerPermissionDenied
                ? 'تشخيص صلاحيات خادم Firestore الفعلية: الخادم رفض بعض الاستعلامات (permission-denied)'
                : 'حالة قواعد Firestore والتحقق الفعلي من الخادم (دون الاعتماد على localStorage):'}
            </span>
          </div>
          {platformFirestoreSyncStatus.lastCheckedAtIso && (
            <span className="font-mono text-[11px] opacity-80" dir="ltr">
              آخر فحص للخادم: {platformFirestoreSyncStatus.lastCheckedAtIso.slice(11, 19)} UTC
            </span>
          )}
        </div>

        {platformFirestoreSyncStatus.hasServerPermissionDenied ? (
          <div className="space-y-1.5 text-rose-800 dark:text-rose-300 leading-relaxed">
            <p>
              • <strong>المجموعات التي رفضها خادم Firestore بـ <code>permission-denied</code>:</strong>{' '}
              <code className="px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-900/60 font-mono">
                {platformFirestoreSyncStatus.permissionDeniedCollections.join(' ، ')}
              </code>
            </p>
            {platformFirestoreSyncStatus.readableCollections.length > 0 && (
              <p>
                • <strong>المجموعات المقروءة بنجاح من الخادم:</strong>{' '}
                <code className="px-1.5 py-0.5 rounded bg-emerald-100/70 dark:bg-emerald-900/40 text-emerald-900 dark:text-emerald-200 font-mono">
                  {platformFirestoreSyncStatus.readableCollections.join(' ، ')}
                </code>
              </p>
            )}
            <p>
              • <strong>السبب الجذري على الخادم:</strong>{' '}
              {platformFirestoreSyncStatus.serverDenialRootCauseAr}
            </p>
            <p>
              • <strong>عدم استخدام <code>localStorage</code> كبديل:</strong> تعرض هذه اللوحة البيانات الحقيقية المقروءة من Firestore فقط، ولا يتم تخزين أو قراءة بيانات الإدارة من المتصفح لإخفاء خطأ الصلاحيات.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5 text-amber-800 dark:text-amber-300 leading-relaxed">
            <p>
              • <strong>ملف القواعد المحلي مقابل الخادم الحي:</strong> يتضمن ملف <code>/firestore.rules</code> في المشروع (1,164 سطرًا) قواعد مجموعات الحوكمة (<code>/account_licenses</code>، <code>/subscription_packages</code>، <code>/platform_staff</code>)، غير أن التحقق من الصلاحيات يعتمد حصريًا على استجابة خادم Firestore الفعلية ولا يفترض نشرًا غير متحقق منه.
            </p>
            <p>
              • <strong>حالة القراءة الفعلية من Firestore:</strong>{' '}
              {platformFirestoreSyncStatus.readableCollections.length > 0 ? (
                <>
                  استجاب الخادم بنجاح للمجموعات:{' '}
                  <code className="px-1.5 py-0.5 rounded bg-emerald-100/80 dark:bg-emerald-900/40 text-emerald-900 dark:text-emerald-200 font-mono">
                    {platformFirestoreSyncStatus.readableCollections.join(' ، ')}
                  </code>
                </>
              ) : (
                'جاري التحقق من استجابة الخادم للمجموعات الإدارية...'
              )}{' '}
              (دون استخدام <code>localStorage</code> كبديل عن بيانات الخادم).
            </p>
          </div>
        )}
      </div>

      {/* Navigation Tabs (44px+ Touch Hitboxes) */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <button
          type="button"
          onClick={() => setActiveTab('requests')}
          className={`min-h-[46px] px-3 rounded-2xl text-xs font-extrabold flex items-center justify-center gap-1.5 border transition-colors cursor-pointer ${
            activeTab === 'requests'
              ? 'bg-[#743B46] text-white border-[#743B46]'
              : 'bg-[#FFFEFC] dark:bg-[#22201F] text-[#292725] dark:text-[#F4F1EA] border-[#E7E1D8] dark:border-[#383431]'
          }`}
        >
          <UserCheck className="w-4 h-4 shrink-0" />
          <span>طلبات التسجيل</span>
          <span className="px-1.5 py-0.5 rounded-md bg-black/15 text-[10px] font-mono tabular-nums">
            {receivedRegistrationRequests.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('clients')}
          className={`min-h-[46px] px-3 rounded-2xl text-xs font-extrabold flex items-center justify-center gap-1.5 border transition-colors cursor-pointer ${
            activeTab === 'clients'
              ? 'bg-[#743B46] text-white border-[#743B46]'
              : 'bg-[#FFFEFC] dark:bg-[#22201F] text-[#292725] dark:text-[#F4F1EA] border-[#E7E1D8] dark:border-[#383431]'
          }`}
        >
          <Users className="w-4 h-4 shrink-0" />
          <span>العملاء والتراخيص</span>
          <span className="px-1.5 py-0.5 rounded-md bg-black/15 text-[10px] font-mono tabular-nums">
            {platformClientAccounts.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('packages')}
          className={`min-h-[46px] px-3 rounded-2xl text-xs font-extrabold flex items-center justify-center gap-1.5 border transition-colors cursor-pointer ${
            activeTab === 'packages'
              ? 'bg-[#743B46] text-white border-[#743B46]'
              : 'bg-[#FFFEFC] dark:bg-[#22201F] text-[#292725] dark:text-[#F4F1EA] border-[#E7E1D8] dark:border-[#383431]'
          }`}
        >
          <Package className="w-4 h-4 shrink-0" />
          <span>الباقات والحدود</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('staff')}
          className={`min-h-[46px] px-3 rounded-2xl text-xs font-extrabold flex items-center justify-center gap-1.5 border transition-colors cursor-pointer ${
            activeTab === 'staff'
              ? 'bg-[#743B46] text-white border-[#743B46]'
              : 'bg-[#FFFEFC] dark:bg-[#22201F] text-[#292725] dark:text-[#F4F1EA] border-[#E7E1D8] dark:border-[#383431]'
          }`}
        >
          <UserCog className="w-4 h-4 shrink-0" />
          <span>مساعدو المنصة</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('audit')}
          className={`col-span-2 sm:col-span-1 min-h-[46px] px-3 rounded-2xl text-xs font-extrabold flex items-center justify-center gap-1.5 border transition-colors cursor-pointer ${
            activeTab === 'audit'
              ? 'bg-[#743B46] text-white border-[#743B46]'
              : 'bg-[#FFFEFC] dark:bg-[#22201F] text-[#292725] dark:text-[#F4F1EA] border-[#E7E1D8] dark:border-[#383431]'
          }`}
        >
          <FileText className="w-4 h-4 shrink-0" />
          <span>سجل التدقيق</span>
          <span className="px-1.5 py-0.5 rounded-md bg-black/15 text-[10px] font-mono tabular-nums">
            {platformAdminAuditLogs.length}
          </span>
        </button>
      </div>

      {/* Search Bar for Requests & Clients */}
      {(activeTab === 'requests' || activeTab === 'clients') && (
        <div className="relative">
          <Search className="w-4 h-4 text-[#77716B] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ابحث بالاسم، البريد الإلكتروني، أو اسم مساحة العمل..."
            className="w-full min-h-[44px] pr-10 pl-4 rounded-2xl bg-[#FFFEFC] dark:bg-[#22201F] border border-[#E7E1D8] dark:border-[#383431] text-xs font-semibold"
          />
        </div>
      )}

      {/* TAB 1: REGISTRATION REQUESTS */}
      {activeTab === 'requests' && (
        <div className="space-y-3.5">
          {pendingRequestsCount > 0 && (
            <div className="p-4 rounded-3xl bg-[#FFFDF9] dark:bg-[#252018] border-2 border-[#A77B35] shadow-xs flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#A77B35]/20 text-[#A77B35] flex items-center justify-center shrink-0">
                  <UserCheck className="w-6 h-6 animate-bounce" />
                </div>
                <div>
                  <div className="text-sm font-extrabold text-[#292725] dark:text-[#F4F1EA]">
                    يوجد {pendingRequestsCount} طلب اشتراك جديد بانتظار موافقتك واعتمادك!
                  </div>
                  <div className="text-xs text-[#77716B] dark:text-[#ACA59C] mt-0.5">
                    اضغط على «مراجعة واتخاذ قرار» أو اختر الطلب أدناه لقبول المشترك وتفعيل ترخيصه وتحديد صلاحياته فورًا.
                  </div>
                </div>
              </div>
              {reqFilter !== 'pending' && (
                <button
                  type="button"
                  onClick={() => setReqFilter('pending')}
                  className="px-3.5 py-2 rounded-xl bg-[#A77B35] hover:bg-[#8D662A] text-white text-xs font-extrabold transition-colors cursor-pointer shrink-0"
                >
                  تصفية الطلبات المعلقة ({pendingRequestsCount})
                </button>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-h-[38px] px-3.5 rounded-xl bg-[#292725] text-white dark:bg-[#F4F1EA] dark:text-[#292725] text-xs font-extrabold inline-flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5" />
                <span>طلبات بانتظار قرارك ({pendingRequestsCount})</span>
              </span>
              {typeof window !== 'undefined' && 'Notification' in window && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const perm = await Notification.requestPermission();
                      if (perm === 'granted') {
                        const vapidRes = await fetch('/api/push/vapid-key');
                        if (vapidRes.ok && 'serviceWorker' in navigator) {
                          const { publicKey } = await vapidRes.json();
                          if (publicKey) {
                            const padding = '='.repeat((4 - (publicKey.length % 4)) % 4);
                            const base64 = (publicKey + padding)
                              .replace(/-/g, '+')
                              .replace(/_/g, '/');
                            const rawData = window.atob(base64);
                            const applicationServerKey = new Uint8Array(rawData.length);
                            for (let i = 0; i < rawData.length; ++i) {
                              applicationServerKey[i] = rawData.charCodeAt(i);
                            }
                            const reg = await navigator.serviceWorker.ready;
                            const sub =
                              (await reg.pushManager.getSubscription()) ||
                              (await reg.pushManager.subscribe({
                                userVisibleOnly: true,
                                applicationServerKey,
                              }));
                            if (sub) {
                              await fetch('/api/push/subscribe', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  subscription: sub.toJSON(),
                                  userId: firebaseUser?.uid || 'admin',
                                  workspaceId: 'default',
                                }),
                              });
                            }
                          }
                        }
                        showToast(
                          'تم تفعيل إشعارات الخلفية بنجاح! ستصلك طلبات المشتركين الجدد سواء كانت الصفحة مفتوحة أو مغلقة.',
                          'success'
                        );
                      } else {
                        showToast('يرجى السماح بالإشعارات في المتصفح لتصلك التنبيهات في الخلفية.', 'warning');
                      }
                    } catch {
                      showToast('تم تفعيل التنبيهات الصوتية والمرئية الفورية للطلبات الجديدة.', 'info');
                    }
                  }}
                  className={`min-h-[38px] px-3 rounded-xl text-xs font-bold border inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                    Notification.permission === 'granted'
                      ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800'
                      : 'bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-700'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>
                    {Notification.permission === 'granted'
                      ? 'إشعارات الخلفية والصفحة المغلقة مفعّلة ✓'
                      : 'تفعيل الإشعارات الفورية عند إغلاق الصفحة'}
                  </span>
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canDecideRequests && (
                <button
                  type="button"
                  onClick={async () => {
                    const randSuffix = Math.floor(100 + Math.random() * 900);
                    const simUid = `sim_sub_${Date.now().toString(36)}`;
                    try {
                      await fetch('/api/admin/notify-registration', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          applicantUid: simUid,
                          applicantName: `مكتب الأفق الميداني (${randSuffix})`,
                          applicantEmail: `subscriber.${randSuffix}@rasd-client.com`,
                          applicantPhone: `777${randSuffix}123`,
                          workspaceId: `ws_${simUid}`,
                          workspaceName: `مساحة عمل مكتب الأفق (${randSuffix})`,
                          requestedPlanId: 'trial',
                          status: 'pending',
                          notes: 'طلب اشتراك تجريبي لاختبار وصول الإشعار الفوري وقرار التفعيل والاعتماد.',
                          requestedAtIso: new Date().toISOString(),
                        }),
                      });
                      setReqFilter('all');
                      await refreshPlatformAdminData();
                    } catch {
                      showToast('تعذر إرسال طلب الاختبار التجريبي', 'error');
                    }
                  }}
                  className="min-h-[38px] px-3.5 rounded-xl bg-[#2E5E4E] hover:bg-[#244B3E] text-white text-xs font-extrabold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>محاكاة طلب مشترك جديد (اختبار فوري)</span>
                </button>
              )}
              <div className="text-[11px] font-bold text-[#77716B] dark:text-[#ACA59C]">
                فور القبول أو الرفض يختفي الطلب من هنا وينتقل لقسم «العملاء والتراخيص»
              </div>
            </div>
          </div>

          {!canDecideRequests && (
            <div className="p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
              <Lock className="w-4 h-4 shrink-0 text-[#743B46]" />
              <span>
                أنت تتصفح الطلبات بصلاحية مساعد منصة؛ قبول أو رفض طلبات التسجيل الأولية محصور بمالكي المنصة الدائمين فقط.
              </span>
            </div>
          )}

          {filteredRequests.length === 0 ? (
            <div className="p-8 rounded-3xl bg-[#FFFEFC] dark:bg-[#22201F] border border-[#E7E1D8] dark:border-[#383431] text-center space-y-2">
              <UserCheck className="w-8 h-8 text-[#77716B] mx-auto" />
              <div className="text-sm font-extrabold text-[#292725] dark:text-[#F4F1EA]">
                لا توجد طلبات تسجيل جديدة بانتظار المراجعة حاليًا
              </div>
              <p className="text-xs text-[#77716B] dark:text-[#ACA59C]">
                ستظهر هنا طلبات تسجيل العملاء الجدد فور إنشائهم لحساباتهم (سواء كنت فاتحًا للصفحة أو مغلقًا لها)، وتختفي من هذه القائمة تلقائيًا بمجرد قبولها أو رفضها.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRequests.map((req) => {
                const badge = getStatusBadge(req.status);
                const isExpanded = selectedReqId === req.workspaceId;
                return (
                  <div
                    key={req.workspaceId}
                    className="rounded-3xl bg-[#FFFEFC] dark:bg-[#22201F] border border-[#E7E1D8] dark:border-[#383431] p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-extrabold text-[#292725] dark:text-[#F4F1EA]">
                            {req.applicantName}
                          </span>
                          <span className={`px-2.5 py-0.5 rounded-lg border text-[11px] font-bold ${badge.cls}`}>
                            {badge.label}
                          </span>
                        </div>
                        <div className="text-xs font-mono text-[#77716B] dark:text-[#ACA59C] mt-1">
                          {req.applicantEmail} {req.applicantPhone ? `· ${req.applicantPhone}` : ''}
                        </div>
                        <div className="text-xs text-[#5C554E] dark:text-[#ACA59C] mt-0.5">
                          مساحة العمل: <strong className="font-bold">{req.workspaceName}</strong> ({req.workspaceId})
                        </div>
                      </div>

                      <div className="text-left space-y-1">
                        <div className="text-[11px] font-mono tabular-nums text-[#77716B] dark:text-[#ACA59C]">
                          تاريخ الطلب: {formatArabicDate(req.requestedAtIso)}
                        </div>
                        <div className="text-[11px] font-bold text-[#743B46] dark:text-[#E5B9C0]">
                          الباقة المطلوبة: {subscriptionPackages[req.requestedPlanId]?.nameAr || req.requestedPlanId}
                        </div>
                      </div>
                    </div>

                    {req.notes && (
                      <div className="text-xs text-[#5C554E] dark:text-[#ACA59C] bg-[#F7F4EE] dark:bg-[#1B1918] p-2.5 rounded-xl">
                        {req.notes}
                      </div>
                    )}

                    {/* Owner-Only Action Controls */}
                    {canDecideRequests && (
                      <div className="pt-1 border-t border-[#EFECE6] dark:border-[#2E2B29]">
                        {!isExpanded ? (
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => openRequestDecisionPanel(req)}
                              className="min-h-[44px] px-4 rounded-2xl bg-[#743B46] hover:bg-[#5D2D37] text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition-colors"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              <span>مراجعة واتخاذ قرار (قبول / رفض)</span>
                            </button>
                          </div>
                        ) : (
                          <div className="mt-2 p-3.5 rounded-2xl bg-[#F7F4EE] dark:bg-[#1B1918] border border-[#E7E1D8] dark:border-[#383431] space-y-3">
                            <div className="text-xs font-extrabold text-[#292725] dark:text-[#F4F1EA]">
                              إعدادات اعتماد أو رفض طلب ({req.applicantName})
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                              <div>
                                <label className="block text-[11px] font-bold mb-1">باقة التفعيل عند القبول</label>
                                <select
                                  value={decisionPlanId}
                                  onChange={(e) => {
                                    const nextPlan = e.target.value as SubscriptionPlanId;
                                    setDecisionPlanId(nextPlan);
                                    const pkg = subscriptionPackages[nextPlan];
                                    if (pkg) setDecisionMaxMembers(String(pkg.defaultMaxMembers));
                                  }}
                                  className="w-full min-h-[42px] px-3 rounded-xl bg-white dark:bg-[#22201F] border border-[#E7E1D8] dark:border-[#383431] text-xs font-bold"
                                >
                                  {PLAN_OPTIONS.map((opt) => (
                                    <option key={opt.id} value={opt.id}>
                                      {subscriptionPackages[opt.id]?.nameAr || opt.label}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label className="block text-[11px] font-bold mb-1">حد أعضاء الفريق (1–10)</label>
                                <input
                                  type="number"
                                  min="1"
                                  max="10"
                                  value={decisionMaxMembers}
                                  onChange={(e) => setDecisionMaxMembers(e.target.value)}
                                  className="w-full min-h-[42px] px-3 rounded-xl bg-white dark:bg-[#22201F] border border-[#E7E1D8] dark:border-[#383431] text-xs font-mono tabular-nums"
                                />
                              </div>

                              {decisionPlanId === 'custom' && (
                                <div>
                                  <label className="block text-[11px] font-bold mb-1">المدة المخصصة (بالأيام)</label>
                                  <input
                                    type="number"
                                    min="1"
                                    max="3650"
                                    value={decisionCustomDays}
                                    onChange={(e) => setDecisionCustomDays(e.target.value)}
                                    className="w-full min-h-[42px] px-3 rounded-xl bg-white dark:bg-[#22201F] border border-[#E7E1D8] dark:border-[#383431] text-xs font-mono tabular-nums"
                                  />
                                </div>
                              )}
                            </div>

                            <div>
                              <label className="block text-[11px] font-bold mb-1">ملاحظة إدارية / سبب القرار</label>
                              <input
                                type="text"
                                value={decisionNotes}
                                onChange={(e) => setDecisionNotes(e.target.value)}
                                placeholder="ملاحظة توثق في سجل التدقيق وملف الترخيص..."
                                className="w-full min-h-[42px] px-3 rounded-xl bg-white dark:bg-[#22201F] border border-[#E7E1D8] dark:border-[#383431] text-xs"
                              />
                            </div>

                            <div className="flex flex-wrap items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setSelectedReqId(null)}
                                className="min-h-[44px] px-4 rounded-xl bg-stone-200 dark:bg-stone-800 text-xs font-bold cursor-pointer"
                              >
                                إلغاء
                              </button>
                              <button
                                type="button"
                                disabled={isSubmittingDecision}
                                onClick={() => submitRegistrationDecision(req, 'reject')}
                                className="min-h-[44px] px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
                              >
                                <XCircle className="w-4 h-4" />
                                <span>رفض الطلب</span>
                              </button>
                              <button
                                type="button"
                                disabled={isSubmittingDecision}
                                onClick={() => submitRegistrationDecision(req, 'approve')}
                                className="min-h-[44px] px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                                <span>قبول الطلب وتفعيل الحساب</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: CLIENTS & SUBSCRIPTIONS */}
      {activeTab === 'clients' && (
        <div className="space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'all', label: 'جميع الحسابات' },
                  { id: 'active', label: 'نشط' },
                  { id: 'pending', label: 'بانتظار الموافقة' },
                  { id: 'expired', label: 'منتهي الصلاحية' },
                  { id: 'suspended', label: 'موقوف مؤقتًا' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setClientFilter(f.id)}
                  className={`min-h-[38px] px-3 rounded-xl text-xs font-bold border cursor-pointer ${
                    clientFilter === f.id
                      ? 'bg-[#292725] text-white border-[#292725] dark:bg-[#F4F1EA] dark:text-[#292725]'
                      : 'bg-[#FFFEFC] dark:bg-[#22201F] border-[#E7E1D8] dark:border-[#383431]'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="text-[11px] font-bold text-[#77716B] dark:text-[#ACA59C]">
              عند انتهاء الاشتراك أو التعليق تبقى بيانات العميل محفوظة بالكامل
            </div>
          </div>

          <div className="space-y-3">
            {filteredClients.map((client) => {
              const badge = getStatusBadge(client.effectiveStatus, {
                isPermanentOwner: client.isPermanentOwner,
                isGrandfathered: client.isGrandfatheredLegacy,
                isExpired: client.isExpired,
              });
              const isActionOpen = selectedClientWsId === client.workspaceId;

              return (
                <div
                  key={client.workspaceId}
                  className="rounded-3xl bg-[#FFFEFC] dark:bg-[#22201F] border border-[#E7E1D8] dark:border-[#383431] p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-extrabold text-[#292725] dark:text-[#F4F1EA]">
                          {client.ownerName}
                        </span>
                        <span className={`px-2.5 py-0.5 rounded-lg border text-[11px] font-bold ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </div>
                      <div className="text-xs font-mono text-[#77716B] dark:text-[#ACA59C] mt-1">
                        {client.ownerEmail || '—'} · مساحة: {client.workspaceName} ({client.workspaceId})
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-right bg-[#F7F4EE] dark:bg-[#1B1918] p-2.5 rounded-2xl border border-[#E7E1D8]/70 dark:border-[#383431]">
                      <div>
                        <div className="text-[10px] text-[#77716B]">الباقة الحالية</div>
                        <div className="text-xs font-extrabold text-[#292725] dark:text-[#F4F1EA]">
                          {client.planNameAr}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-[#77716B]">تاريخ الانتهاء</div>
                        <div className="text-xs font-extrabold font-mono tabular-nums text-[#743B46] dark:text-[#E5B9C0]">
                          {formatArabicDate(client.expiresAtIso, client.isLifetime || client.isPermanentOwner)}
                          {client.remainingDays !== null && !client.isLifetime && (
                            <span className="mr-1 text-[10px]">({client.remainingDays} يوم)</span>
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-[#77716B]">أعضاء الفريق</div>
                        <div className="text-xs font-extrabold font-mono tabular-nums">
                          {client.currentMembersCount} / {client.maxMembers}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Subscription Lifecycle Actions (Protected for Permanent Owners) */}
                  {client.isPermanentOwner ? (
                    <div className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                      <Crown className="w-4 h-4" />
                      <span>حساب مالك دائم للمنصة — معفي من الاشتراكات ولا يخضع للتعليق أو الانتهاء.</span>
                    </div>
                  ) : client.effectiveStatus === 'pending' ? (
                    <div className="text-[11px] font-bold text-amber-700 dark:text-amber-300 flex items-center justify-between gap-2">
                      <span>هذا الحساب في مرحلة طلب التسجيل الأولي (يُعتمد من تبويب طلبات التسجيل بواسطة المالك الدائم).</span>
                      {canDecideRequests && (
                        <button
                          type="button"
                          onClick={() => {
                            setActiveTab('requests');
                            setSelectedReqId(client.workspaceId);
                          }}
                          className="min-h-[38px] px-3 rounded-xl bg-amber-600 text-white text-xs font-bold cursor-pointer"
                        >
                          الانتقال لاعتماد الطلب
                        </button>
                      )}
                    </div>
                  ) : (
                    canRenewOrSuspend && (
                      <div className="pt-2 border-t border-[#EFECE6] dark:border-[#2E2B29]">
                        {!isActionOpen ? (
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => openClientActionPanel(client)}
                              className="min-h-[44px] px-4 rounded-2xl bg-[#292725] dark:bg-[#F4F1EA] text-white dark:text-[#292725] text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
                            >
                              <CalendarClock className="w-4 h-4" />
                              <span>إدارة الاشتراك (تفعيل / تجديد / تعليق / إعادة تفعيل)</span>
                            </button>
                          </div>
                        ) : (
                          <div className="p-3.5 rounded-2xl bg-[#F7F4EE] dark:bg-[#1B1918] border border-[#E7E1D8] dark:border-[#383431] space-y-3">
                            <div className="text-xs font-extrabold text-[#292725] dark:text-[#F4F1EA]">
                              إجراءات اشتراك العميل ({client.ownerName})
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                              <div>
                                <label className="block text-[11px] font-bold mb-1">الباقة</label>
                                <select
                                  disabled={!canManagePackages}
                                  value={clientActionPlanId}
                                  onChange={(e) => {
                                    const p = e.target.value as SubscriptionPlanId;
                                    setClientActionPlanId(p);
                                    const pkg = subscriptionPackages[p];
                                    if (pkg) setClientMaxMembers(String(pkg.defaultMaxMembers));
                                  }}
                                  className="w-full min-h-[42px] px-3 rounded-xl bg-white dark:bg-[#22201F] border border-[#E7E1D8] dark:border-[#383431] text-xs font-bold"
                                >
                                  {PLAN_OPTIONS.map((opt) => (
                                    <option key={opt.id} value={opt.id}>
                                      {subscriptionPackages[opt.id]?.nameAr || opt.label}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label className="block text-[11px] font-bold mb-1">حد أعضاء الفريق (1–10)</label>
                                <input
                                  type="number"
                                  min="1"
                                  max="10"
                                  disabled={!canManagePackages}
                                  value={clientMaxMembers}
                                  onChange={(e) => setClientMaxMembers(e.target.value)}
                                  className="w-full min-h-[42px] px-3 rounded-xl bg-white dark:bg-[#22201F] border border-[#E7E1D8] dark:border-[#383431] text-xs font-mono tabular-nums"
                                />
                              </div>

                              {clientActionPlanId === 'custom' && (
                                <div>
                                  <label className="block text-[11px] font-bold mb-1">المدة المخصصة (بالأيام)</label>
                                  <input
                                    type="number"
                                    min="1"
                                    max="3650"
                                    value={clientCustomDays}
                                    onChange={(e) => setClientCustomDays(e.target.value)}
                                    className="w-full min-h-[42px] px-3 rounded-xl bg-white dark:bg-[#22201F] border border-[#E7E1D8] dark:border-[#383431] text-xs font-mono tabular-nums"
                                  />
                                </div>
                              )}
                            </div>

                            <div>
                              <label className="block text-[11px] font-bold mb-1">ملاحظة العملية (تُحفظ في سجل التدقيق)</label>
                              <input
                                type="text"
                                value={clientActionNotes}
                                onChange={(e) => setClientActionNotes(e.target.value)}
                                placeholder="سبب التجديد أو التعليق أو التفعيل..."
                                className="w-full min-h-[42px] px-3 rounded-xl bg-white dark:bg-[#22201F] border border-[#E7E1D8] dark:border-[#383431] text-xs"
                              />
                            </div>

                            <div className="flex flex-wrap items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setSelectedClientWsId(null)}
                                className="min-h-[44px] px-3.5 rounded-xl bg-stone-200 dark:bg-stone-800 text-xs font-bold cursor-pointer"
                              >
                                إغلاق
                              </button>

                              <button
                                type="button"
                                disabled={isSubmittingClientAction}
                                onClick={() => submitClientSubscriptionAction(client, 'activate')}
                                className="min-h-[44px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                                <span>تفعيل اشتراك</span>
                              </button>

                              <button
                                type="button"
                                disabled={isSubmittingClientAction}
                                onClick={() => submitClientSubscriptionAction(client, 'renew')}
                                className="min-h-[44px] px-4 rounded-xl bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
                              >
                                <RefreshCw className="w-4 h-4" />
                                <span>تجديد الاشتراك</span>
                              </button>

                              {client.effectiveStatus === 'suspended' || client.effectiveStatus === 'expired' ? (
                                <button
                                  type="button"
                                  disabled={isSubmittingClientAction}
                                  onClick={() => submitClientSubscriptionAction(client, 'reactivate')}
                                  className="min-h-[44px] px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
                                >
                                  <PlayCircle className="w-4 h-4" />
                                  <span>إعادة التفعيل</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={isSubmittingClientAction}
                                  onClick={() => submitClientSubscriptionAction(client, 'suspend')}
                                  className="min-h-[44px] px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
                                >
                                  <PauseCircle className="w-4 h-4" />
                                  <span>تعليق الاشتراك (مع حفظ البيانات)</span>
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: SUBSCRIPTION PACKAGES & TEAM LIMITS */}
      {activeTab === 'packages' && (
        <div className="space-y-3.5">
          {!canManagePackages && (
            <div className="p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
              <Lock className="w-4 h-4 shrink-0 text-[#743B46]" />
              <span>تعديل الباقات ومددها وحدود أعضاء الفريق يتطلب صلاحية مالك المنصة أو تفويض (canManagePackages).</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {(Object.keys(subscriptionPackages) as SubscriptionPlanId[]).map((planId) => {
              const pkg = subscriptionPackages[planId];
              const isLockedOwnerPlan = planId === 'owner_permanent';
              const isEditing = editingPlanId === planId;

              return (
                <div
                  key={planId}
                  className="rounded-3xl bg-[#FFFEFC] dark:bg-[#22201F] border border-[#E7E1D8] dark:border-[#383431] p-4 space-y-3 flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-sm font-extrabold text-[#292725] dark:text-[#F4F1EA]">
                          {pkg.nameAr}
                        </span>
                        <div className="text-[11px] font-mono text-[#77716B]">{pkg.id}</div>
                      </div>
                      <span
                        className={`px-2.5 py-0.5 rounded-lg text-[11px] font-bold ${
                          isLockedOwnerPlan
                            ? 'bg-[#743B46]/15 text-[#743B46] dark:text-[#F2CFD5]'
                            : pkg.isActive
                            ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200'
                            : 'bg-stone-100 text-stone-600'
                        }`}
                      >
                        {isLockedOwnerPlan ? 'سيادية للمالكين الدائمين' : pkg.isActive ? 'متاحة للتفعيل' : 'معطلة'}
                      </span>
                    </div>

                    <p className="text-xs text-[#5C554E] dark:text-[#ACA59C]">{pkg.descriptionAr}</p>

                    <div className="grid grid-cols-3 gap-2 pt-1">
                      <div className="p-2 rounded-xl bg-[#F7F4EE] dark:bg-[#1B1918]">
                        <div className="text-[10px] text-[#77716B]">مدة الباقة</div>
                        <div className="text-xs font-extrabold font-mono tabular-nums">
                          {pkg.isLifetime ? 'مدى الحياة' : `${pkg.durationDays} يوم`}
                        </div>
                      </div>
                      <div className="p-2 rounded-xl bg-[#F7F4EE] dark:bg-[#1B1918]">
                        <div className="text-[10px] text-[#77716B]">حد أعضاء الفريق</div>
                        <div className="text-xs font-extrabold font-mono tabular-nums">
                          {pkg.defaultMaxMembers} أعضاء
                        </div>
                      </div>
                      <div className="p-2 rounded-xl bg-[#F7F4EE] dark:bg-[#1B1918]">
                        <div className="text-[10px] text-[#77716B]">السعر الاسترشادي</div>
                        <div className="text-xs font-extrabold font-mono tabular-nums">
                          {isLockedOwnerPlan ? 'مجانًا' : `${pkg.priceAmount} ${pkg.currency}`}
                        </div>
                      </div>
                    </div>
                  </div>

                  {!isLockedOwnerPlan && canManagePackages && (
                    <div className="pt-2 border-t border-[#EFECE6] dark:border-[#2E2B29]">
                      {!isEditing ? (
                        <button
                          type="button"
                          onClick={() => startEditingPackage(planId)}
                          className="w-full min-h-[42px] rounded-2xl bg-[#EFECE6] hover:bg-[#E5E0D6] dark:bg-[#2B2826] text-xs font-extrabold cursor-pointer"
                        >
                          تعديل بيانات الباقة والمدة وحدود الفريق
                        </button>
                      ) : (
                        <form onSubmit={handleSavePackage} className="space-y-2.5 pt-1">
                          <div>
                            <label className="block text-[11px] font-bold mb-1">اسم الباقة</label>
                            <input
                              type="text"
                              required
                              minLength={2}
                              maxLength={80}
                              value={pkgNameAr}
                              onChange={(e) => setPkgNameAr(e.target.value)}
                              className="w-full min-h-[40px] px-3 rounded-xl bg-white dark:bg-[#1B1918] border border-[#E7E1D8] dark:border-[#383431] text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold mb-1">
                              وصف الباقة (2–500 حرف)
                            </label>
                            <textarea
                              rows={2}
                              required
                              minLength={2}
                              maxLength={500}
                              value={pkgDescAr}
                              onChange={(e) => setPkgDescAr(e.target.value)}
                              placeholder="أدخل وصفًا واضحًا لمزايا الباقة ومدتها وحدود أعضاء الفريق..."
                              className="w-full p-2.5 rounded-xl bg-white dark:bg-[#1B1918] border border-[#E7E1D8] dark:border-[#383431] text-xs leading-relaxed"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            {!pkg.isLifetime && (
                              <div>
                                <label className="block text-[11px] font-bold mb-1">المدة (بالأيام)</label>
                                <input
                                  type="number"
                                  min="1"
                                  max="36500"
                                  required
                                  value={pkgDurationDays}
                                  onChange={(e) => setPkgDurationDays(e.target.value)}
                                  className="w-full min-h-[40px] px-3 rounded-xl bg-white dark:bg-[#1B1918] border border-[#E7E1D8] dark:border-[#383431] text-xs font-mono tabular-nums"
                                />
                              </div>
                            )}
                            <div>
                              <label className="block text-[11px] font-bold mb-1">حد الفريق (1–10)</label>
                              <input
                                type="number"
                                min="1"
                                max="10"
                                required
                                value={pkgMaxMembers}
                                onChange={(e) => setPkgMaxMembers(e.target.value)}
                                className="w-full min-h-[40px] px-3 rounded-xl bg-white dark:bg-[#1B1918] border border-[#E7E1D8] dark:border-[#383431] text-xs font-mono tabular-nums"
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[11px] font-bold mb-1">السعر</label>
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={pkgPrice}
                                onChange={(e) => setPkgPrice(e.target.value)}
                                className="w-full min-h-[40px] px-3 rounded-xl bg-white dark:bg-[#1B1918] border border-[#E7E1D8] dark:border-[#383431] text-xs font-mono tabular-nums"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold mb-1">العملة</label>
                              <select
                                value={pkgCurrency}
                                onChange={(e) => setPkgCurrency(e.target.value as CurrencyCode)}
                                className="w-full min-h-[40px] px-3 rounded-xl bg-white dark:bg-[#1B1918] border border-[#E7E1D8] dark:border-[#383431] text-xs font-mono"
                              >
                                {CURRENCY_LIST.map((c) => (
                                  <option key={c.code} value={c.code}>
                                    {c.code}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                          <label className="min-h-[42px] px-3 py-2 rounded-xl bg-[#F7F4EE] dark:bg-[#1B1918] border border-[#E7E1D8] dark:border-[#383431] flex items-center justify-between gap-2 cursor-pointer">
                            <span className="text-[11px] font-bold text-[#292725] dark:text-[#F4F1EA]">
                              حالة الباقة ({pkgIsActive ? 'نشطة ومتاحة للاختيار' : 'معطلة ومخفية عن التسجيل الجديد'})
                            </span>
                            <input
                              type="checkbox"
                              checked={pkgIsActive}
                              onChange={(e) => setPkgIsActive(e.target.checked)}
                              className="w-4 h-4 accent-[#743B46]"
                            />
                          </label>
                          <div className="flex items-center justify-end gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => setEditingPlanId(null)}
                              className="min-h-[40px] px-3.5 rounded-xl bg-stone-200 dark:bg-stone-800 text-xs font-bold cursor-pointer"
                            >
                              إلغاء
                            </button>
                            <button
                              type="submit"
                              className="min-h-[40px] px-4 rounded-xl bg-[#743B46] text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
                            >
                              <Save className="w-3.5 h-3.5" />
                              <span>حفظ الباقة</span>
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 4: PLATFORM STAFF & DELEGATED PERMISSIONS */}
      {activeTab === 'staff' && (
        <div className="space-y-4">
          {!canManageStaff ? (
            <div className="p-5 rounded-3xl bg-[#FFFEFC] dark:bg-[#22201F] border border-[#E7E1D8] dark:border-[#383431] space-y-2">
              <div className="flex items-center gap-2 text-sm font-extrabold text-[#292725] dark:text-[#F4F1EA]">
                <Lock className="w-4 h-4 text-[#743B46]" />
                <span>قسم إدارة مساعدي المنصة مخصص لمالكي المنصة الدائمين فقط</span>
              </div>
              <p className="text-xs text-[#77716B] dark:text-[#ACA59C]">
                صلاحياتك المفوضة حاليًا كمساعد منصة:
                {platformStaffRecord?.permissions.canViewRequests ? ' [عرض الطلبات والعملاء]' : ''}
                {platformStaffRecord?.permissions.canApproveAndRenew ? ' [تجديد وتعليق الاشتراكات]' : ''}
                {platformStaffRecord?.permissions.canManagePackages ? ' [إدارة الباقات]' : ''}
              </p>
            </div>
          ) : (
            <>
              <form
                onSubmit={handleSaveStaff}
                className="rounded-3xl bg-[#FFFEFC] dark:bg-[#22201F] border border-[#E7E1D8] dark:border-[#383431] p-4 sm:p-5 space-y-3.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-extrabold text-[#292725] dark:text-[#F4F1EA] flex items-center gap-2">
                    <Plus className="w-4 h-4 text-[#743B46]" />
                    <span>إضافة أو تحديث مساعد إدارة المنصة (تفويض مقيد)</span>
                  </h2>
                  <span className="text-[11px] font-bold text-[#77716B]">
                    لا يُمنح المساعد صلاحية قبول التسجيل الأولي أو إدارة المساعدين
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold mb-1">اسم المساعد</label>
                    <input
                      type="text"
                      required
                      value={staffNameInput}
                      onChange={(e) => setStaffNameInput(e.target.value)}
                      placeholder="مثال: أحمد — مشرف الاشتراكات"
                      className="w-full min-h-[42px] px-3 rounded-xl bg-[#F7F4EE] dark:bg-[#1B1918] border border-[#E7E1D8] dark:border-[#383431] text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-1">البريد الإلكتروني المسجل</label>
                    <input
                      type="email"
                      required
                      dir="ltr"
                      value={staffEmailInput}
                      onChange={(e) => setStaffEmailInput(e.target.value)}
                      placeholder="staff@example.com"
                      className="w-full min-h-[42px] px-3 rounded-xl bg-[#F7F4EE] dark:bg-[#1B1918] border border-[#E7E1D8] dark:border-[#383431] text-xs font-mono text-left"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-1">
                      معرف الحساب الفعلي في Firebase (UID) *
                    </label>
                    <input
                      type="text"
                      required
                      dir="ltr"
                      value={staffUidInput}
                      onChange={(e) => setStaffUidInput(e.target.value)}
                      placeholder="UID حقيقي مطابق لوثيقة /users/{uid}"
                      className="w-full min-h-[42px] px-3 rounded-xl bg-[#F7F4EE] dark:bg-[#1B1918] border border-[#E7E1D8] dark:border-[#383431] text-xs font-mono text-left"
                    />
                  </div>
                </div>

                {platformClientAccounts.filter((c) => !c.isPermanentOwner && c.ownerId && c.ownerEmail).length > 0 && (
                  <div className="p-3 rounded-2xl bg-[#F7F4EE]/70 dark:bg-[#1B1918] border border-[#E7E1D8] dark:border-[#383431] flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-[#77716B] dark:text-[#ACA59C]">
                      اختيار سريع من الحسابات المسجلة فعليًا في <code>/users</code> (لضمان تطابق UID الفعلي):
                    </span>
                    <select
                      value=""
                      onChange={(e) => {
                        const selectedUid = e.target.value;
                        if (!selectedUid) return;
                        const found = platformClientAccounts.find((c) => c.ownerId === selectedUid);
                        if (found) {
                          setStaffUidInput(found.ownerId);
                          setStaffEmailInput(found.ownerEmail);
                          setStaffNameInput(found.ownerName);
                        }
                      }}
                      className="min-h-[36px] px-3 rounded-xl bg-white dark:bg-[#22201F] border border-[#E7E1D8] dark:border-[#383431] text-xs"
                    >
                      <option value="">— اختر حسابًا مسجلًا لتعبئة UID والبريد تلقائيًا —</option>
                      {platformClientAccounts
                        .filter((c) => !c.isPermanentOwner && c.ownerId && c.ownerEmail)
                        .map((c) => (
                          <option key={c.ownerId} value={c.ownerId}>
                            {c.ownerName} ({c.ownerEmail}) — UID: {c.ownerId}
                          </option>
                        ))}
                    </select>
                  </div>
                )}

                <p className="text-[11px] text-[#77716B] dark:text-[#ACA59C]">
                  * يتم التحقق من وجود وثيقة مطابقة في <code>/users/&#123;uid&#125;</code> على خادم Firestore قبل الحفظ، ويُمنع توليد أو حفظ أي UID اصطناعي.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                  <label className="min-h-[48px] p-3 rounded-2xl bg-[#F7F4EE] dark:bg-[#1B1918] border border-[#E7E1D8] dark:border-[#383431] flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={staffPermsInput.canViewRequests}
                      onChange={(e) =>
                        setStaffPermsInput((p) => ({ ...p, canViewRequests: e.target.checked }))
                      }
                      className="w-4 h-4 accent-[#743B46]"
                    />
                    <span className="text-xs font-bold">
                      الاطلاع على طلبات التسجيل وسجلات العملاء (canViewRequests)
                    </span>
                  </label>

                  <label className="min-h-[48px] p-3 rounded-2xl bg-[#F7F4EE] dark:bg-[#1B1918] border border-[#E7E1D8] dark:border-[#383431] flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={staffPermsInput.canApproveAndRenew}
                      onChange={(e) =>
                        setStaffPermsInput((p) => ({ ...p, canApproveAndRenew: e.target.checked }))
                      }
                      className="w-4 h-4 accent-[#743B46]"
                    />
                    <span className="text-xs font-bold">
                      تجديد وتعليق وإعادة تفعيل اشتراكات العملاء (canApproveAndRenew)
                    </span>
                  </label>

                  <label className="min-h-[48px] p-3 rounded-2xl bg-[#F7F4EE] dark:bg-[#1B1918] border border-[#E7E1D8] dark:border-[#383431] flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={staffPermsInput.canManagePackages}
                      onChange={(e) =>
                        setStaffPermsInput((p) => ({ ...p, canManagePackages: e.target.checked }))
                      }
                      className="w-4 h-4 accent-[#743B46]"
                    />
                    <span className="text-xs font-bold">
                      إدارة الباقات ومددها وحدود أعضاء الفريق (canManagePackages)
                    </span>
                  </label>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="min-h-[44px] px-5 rounded-2xl bg-[#743B46] hover:bg-[#5D2D37] text-white text-xs font-extrabold flex items-center gap-2 cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    <span>حفظ المساعد وتفويض الصلاحيات المحددة</span>
                  </button>
                </div>
              </form>

              <div className="space-y-2.5">
                {platformStaffList.length === 0 ? (
                  <div className="p-6 rounded-3xl bg-[#FFFEFC] dark:bg-[#22201F] border border-[#E7E1D8] dark:border-[#383431] text-center text-xs text-[#77716B]">
                    لم يتم تفويض أي مساعد منصة حتى الآن. يعمل المالكان الدائمان بصلاحيات كاملة.
                  </div>
                ) : (
                  platformStaffList.map((staff) => (
                    <div
                      key={staff.uid}
                      className="rounded-3xl bg-[#FFFEFC] dark:bg-[#22201F] border border-[#E7E1D8] dark:border-[#383431] p-4 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-extrabold text-[#292725] dark:text-[#F4F1EA]">
                            {staff.displayName}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-lg text-[11px] font-bold ${
                              staff.status === 'active'
                                ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200'
                                : 'bg-rose-50 text-rose-800 dark:bg-rose-950/60 dark:text-rose-200'
                            }`}
                          >
                            {staff.status === 'active' ? 'مفوض نشط' : 'موقوف'}
                          </span>
                        </div>
                        <div className="text-xs font-mono text-[#77716B] mt-0.5">
                          {staff.email} · UID: {staff.uid}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-2">
                          {staff.permissions.canViewRequests && (
                            <span className="px-2 py-0.5 rounded-lg bg-[#EFECE6] dark:bg-[#2B2826] text-[11px] font-bold">
                              عرض الطلبات والعملاء
                            </span>
                          )}
                          {staff.permissions.canApproveAndRenew && (
                            <span className="px-2 py-0.5 rounded-lg bg-sky-50 dark:bg-sky-950/60 text-sky-800 dark:text-sky-200 text-[11px] font-bold">
                              تجديد وتعليق الاشتراكات
                            </span>
                          )}
                          {staff.permissions.canManagePackages && (
                            <span className="px-2 py-0.5 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200 text-[11px] font-bold">
                              إدارة الباقات والحدود
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await upsertPlatformStaffMember({
                                staffUid: staff.uid,
                                email: staff.email,
                                displayName: staff.displayName,
                                status: staff.status === 'active' ? 'suspended' : 'active',
                                permissions: staff.permissions,
                              });
                            } catch (err) {
                              showToast(
                                err instanceof Error
                                  ? err.message
                                  : 'تعذر تحديث حالة مساعد المنصة في Firestore.',
                                'error'
                              );
                            }
                          }}
                          className="min-h-[42px] px-3.5 rounded-xl bg-stone-100 dark:bg-stone-800 text-xs font-bold cursor-pointer"
                        >
                          {staff.status === 'active' ? 'إيقاف التفويض' : 'إعادة تفعيل التفويض'}
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await removePlatformStaffMember(staff.uid);
                            } catch (err) {
                              showToast(
                                err instanceof Error
                                  ? err.message
                                  : 'تعذر حذف مساعد المنصة من Firestore.',
                                'error'
                              );
                            }
                          }}
                          className="min-h-[42px] px-3 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 text-xs font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>حذف</span>
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 5: PLATFORM ADMIN AUDIT LOG & GOVERNANCE BACKUP */}
      {activeTab === 'audit' && (
        <div className="space-y-3">
          {isPlatformAdmin && (
            <div className="rounded-3xl bg-[#FFFEFC] dark:bg-[#22201F] border border-[#E7E1D8] dark:border-[#383431] p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="text-xs font-extrabold text-[#292725] dark:text-[#F4F1EA] flex items-center gap-1.5">
                  <Database className="w-4 h-4 text-[#743B46]" />
                  <span>نسخ احتياطي شامل لحوكمة المنصة والبيانات التشغيلية (16 مجموعة JSON)</span>
                </div>
                <p className="text-[11px] text-[#77716B] dark:text-[#ACA59C]">
                  يشمل التراخيص (<code>account_licenses</code>) والباقات (<code>subscription_packages</code>) ومساعدي المنصة (<code>platform_staff</code>) وسجلات التدقيق (<code>audit_logs</code>) وجميع مجموعات العمل الميدانية.
                </p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  if (!firebaseUser) return;
                  try {
                    const verifiedActorEmail =
                      ownerSessionDiagnostic.effectiveVerifiedEmail ||
                      resolveVerifiedOrTopLevelUserEmail(firebaseUser) ||
                      '';
                    const { payload, integrity } = await exportFirestoreBackup({
                      scopeMode: 'all_accessible_workspaces',
                      workspaceId: null,
                      currentUserUid: firebaseUser.uid,
                      currentUserEmail: verifiedActorEmail,
                      includePlatformGovernance: true,
                    });
                    const filename = downloadBackupJsonFile(payload);
                    showToast(
                      `تم تصدير النسخة الاحتياطية الشاملة (${filename}) والتحقق من ${integrity.totalDocumentsChecked} وثيقة عبر 16 مجموعة.`,
                      integrity.isValid ? 'success' : 'error'
                    );
                  } catch (err) {
                    showToast(
                      err instanceof Error ? err.message : 'تعذر تصدير النسخة الاحتياطية.',
                      'error'
                    );
                  }
                }}
                className="min-h-[42px] px-4 rounded-xl bg-[#743B46] hover:bg-[#5E2F38] text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>تصدير نسخة الحوكمة والبيانات (JSON)</span>
              </button>
            </div>
          )}

          {/* فلتر نوع السجلات الإدارية والأمنية */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-white dark:bg-[#1C1A19] border border-[#E7E1D8] dark:border-[#383431]">
            <div className="flex items-center gap-2 text-xs font-bold text-[#77716B] dark:text-[#ACA59C]">
              <span>تصفية السجلات:</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setAuditLogFilter('all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                    auditLogFilter === 'all'
                      ? 'bg-[#743B46] text-white'
                      : 'bg-[#F2EFE9] dark:bg-[#2B2826] text-[#292725] dark:text-[#F4F1EA]'
                  }`}
                >
                  الكل ({platformAdminAuditLogs.length})
                </button>
                <button
                  type="button"
                  onClick={() => setAuditLogFilter('denied_only')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer ${
                    auditLogFilter === 'denied_only'
                      ? 'bg-rose-600 text-white'
                      : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
                  }`}
                >
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>
                    محاولات الوصول المرفوضة (
                    {
                      platformAdminAuditLogs.filter(
                        (l) =>
                          l.operation === 'permission_denied_attempt' ||
                          l.summary.includes('محاولة وصول مرفوضة')
                      ).length
                    }
                    )
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setAuditLogFilter('admin_ops')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                    auditLogFilter === 'admin_ops'
                      ? 'bg-amber-600 text-white'
                      : 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                  }`}
                >
                  العمليات الإدارية (
                  {
                    platformAdminAuditLogs.filter(
                      (l) =>
                        l.operation !== 'permission_denied_attempt' &&
                        !l.summary.includes('محاولة وصول مرفوضة')
                    ).length
                  }
                  )
                </button>
              </div>
            </div>
          </div>

          {(() => {
            const displayedLogs = platformAdminAuditLogs.filter((entry) => {
              const isDenied =
                entry.operation === 'permission_denied_attempt' ||
                entry.summary.includes('محاولة وصول مرفوضة');
              if (auditLogFilter === 'denied_only') return isDenied;
              if (auditLogFilter === 'admin_ops') return !isDenied;
              return true;
            });

            if (displayedLogs.length === 0) {
              return (
                <div className="p-8 rounded-3xl bg-[#FFFEFC] dark:bg-[#22201F] border border-[#E7E1D8] dark:border-[#383431] text-center space-y-2">
                  <FileText className="w-8 h-8 text-[#77716B] mx-auto" />
                  <div className="text-sm font-extrabold text-[#292725] dark:text-[#F4F1EA]">
                    {auditLogFilter === 'denied_only'
                      ? 'لا توجد محاولات وصول مرفوضة مسجلة في هذه الجلسة'
                      : 'لا توجد عمليات إدارية مسجلة بعد'}
                  </div>
                  <p className="text-xs text-[#77716B] dark:text-[#ACA59C]">
                    يتم توثيق محاولات الوصول المرفوضة والعمليات الإدارية تلقائيًا لمساعدة المالكين في تشخيص المشاكل بأمان دون تخزين أي بيانات حساسة.
                  </p>
                </div>
              );
            }

            return displayedLogs.map((entry) => {
              const isDenied =
                entry.operation === 'permission_denied_attempt' ||
                entry.summary.includes('محاولة وصول مرفوضة');

              return (
                <div
                  key={entry.id}
                  className={`rounded-3xl border p-4.5 space-y-2.5 transition-shadow ${
                    isDenied
                      ? 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/60 shadow-xs'
                      : 'bg-[#FFFEFC] dark:bg-[#22201F] border-[#E7E1D8] dark:border-[#383431]'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1.5 flex-1 min-w-[240px]">
                      <div className="flex items-center gap-2 flex-wrap">
                        {isDenied ? (
                          <span className="px-2.5 py-0.5 rounded-lg bg-rose-100 dark:bg-rose-900/80 text-rose-800 dark:text-rose-200 text-[11px] font-extrabold flex items-center gap-1.5">
                            <ShieldAlert className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                            <span>محاولة وصول مرفوضة (Permission Denied)</span>
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-lg bg-amber-100 dark:bg-amber-900/80 text-amber-800 dark:text-amber-200 text-[11px] font-extrabold">
                            عملية إدارية
                          </span>
                        )}
                        <span className="text-xs font-extrabold text-[#292725] dark:text-[#F4F1EA]">
                          {entry.summary}
                        </span>
                      </div>

                      {isDenied ? (
                        <div className="rounded-2xl bg-white/80 dark:bg-black/30 border border-rose-200/80 dark:border-rose-900/40 p-3 text-xs space-y-1.5">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono">
                            <div>
                              <span className="text-[#77716B] dark:text-[#ACA59C]">البريد الإلكتروني: </span>
                              <strong className="text-rose-900 dark:text-rose-200">
                                {entry.actorEmail || entry.targetOwnerEmail || 'غير محدد في الجلسة'}
                              </strong>
                            </div>
                            <div>
                              <span className="text-[#77716B] dark:text-[#ACA59C]">معرف المستخدم (UID): </span>
                              <strong className="text-[#292725] dark:text-[#F4F1EA]">
                                {entry.actorUid || 'غير محدد'}
                              </strong>
                            </div>
                            <div className="sm:col-span-2">
                              <span className="text-[#77716B] dark:text-[#ACA59C]">المسار / المجموعة المستهدفة: </span>
                              <span className="text-stone-800 dark:text-stone-200 font-bold">
                                {entry.entityId || entry.targetWorkspaceId}
                              </span>
                            </div>
                          </div>
                          <div className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold flex items-center gap-1 pt-0.5">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>سجل تشخيصي آمن — لا يتضمن أي كلمات مرور أو رموز دخول أو بيانات حساسة.</span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-[11px] font-mono text-[#77716B] dark:text-[#ACA59C]">
                          المنفذ: {entry.actorName} ({entry.actorEmail || 'جلسة معتمدة'}) · الصفة:{' '}
                          {entry.actorRole === 'permanent_owner' ? 'مالك دائم' : 'مساعد مفوض'}
                        </div>
                      )}
                    </div>

                    <div className="text-left space-y-1 shrink-0">
                      <div className="text-[11px] font-mono tabular-nums text-[#77716B]">
                        {entry.createdAtIso.replace('T', ' ').slice(0, 19)}
                      </div>
                      <div
                        className={`text-[10px] font-bold ${
                          isDenied
                            ? 'text-rose-700 dark:text-rose-300'
                            : 'text-emerald-700 dark:text-emerald-300'
                        }`}
                      >
                        {entry.persistedToFirestore
                          ? 'موثق في Firestore (/audit_logs)'
                          : 'محفوظ في سجل التدقيق الأمني'}
                      </div>
                    </div>
                  </div>
                </div>
              );
            });
          })()}
        </div>
      )}
    </div>
  );
};
