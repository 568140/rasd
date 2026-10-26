import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Clock,
  CheckCircle2,
  Lock,
  RefreshCw,
  LogOut,
  Mail,
  User,
  Building2,
  Calendar,
  AlertTriangle,
} from 'lucide-react';
import { useRasd } from '../context/RasdContext';
import { DEFAULT_SUBSCRIPTION_PACKAGES } from '../services/licenseService';

export const RegistrationApprovalGateScreen: React.FC = () => {
  const {
    firebaseUser,
    userProfile,
    workspace,
    accountApprovalStatus,
    registrationRequest,
    ownerSessionDiagnostic,
    loginWithGoogle,
    refreshAuthUser,
    refreshRegistrationStatus,
    resendVerificationEmail,
    logout,
  } = useRasd();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isResendingEmail, setIsResendingEmail] = useState(false);
  const [isGoogleLoggingIn, setIsGoogleLoggingIn] = useState(false);

  const isSuspended = accountApprovalStatus === 'suspended';

  const applicantName =
    registrationRequest?.applicantName ||
    userProfile?.displayName ||
    firebaseUser?.displayName ||
    firebaseUser?.email?.split('@')[0] ||
    'عميل جديد';

  const applicantEmail =
    registrationRequest?.applicantEmail ||
    userProfile?.email ||
    firebaseUser?.email ||
    '';

  const workspaceId =
    registrationRequest?.workspaceId ||
    userProfile?.activeWorkspaceId ||
    workspace?.id ||
    (firebaseUser?.uid ? `ws_${firebaseUser.uid.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48)}` : '');

  const workspaceName =
    registrationRequest?.workspaceName ||
    workspace?.name ||
    `مساحة عمل ${applicantName}`;

  const requestedPlanId = registrationRequest?.requestedPlanId || 'trial';
  const requestedPlanLabel =
    DEFAULT_SUBSCRIPTION_PACKAGES[requestedPlanId]?.nameAr ||
    DEFAULT_SUBSCRIPTION_PACKAGES.trial.nameAr;

  useEffect(() => {
    if (accountApprovalStatus !== 'pending_approval' || !workspaceId) return;

    const syncAndCheckStatus = async () => {
      try {
        const res = await fetch('/api/admin/notify-registration', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            applicantUid: registrationRequest?.applicantUid || firebaseUser?.uid || '',
            applicantName,
            applicantEmail,
            applicantPhone: registrationRequest?.applicantPhone || userProfile?.phone || '',
            workspaceId,
            workspaceName,
            requestedPlanId,
            status: 'pending',
            upsertOnlyIfMissing: true,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.request?.status === 'active' || data?.request?.status === 'suspended') {
            await refreshRegistrationStatus();
            return;
          }
        }
      } catch {
        // ignore network error
      }
      await refreshRegistrationStatus().catch(() => {});
    };

    void syncAndCheckStatus();
    const interval = setInterval(() => {
      void syncAndCheckStatus();
    }, 5000);
    return () => clearInterval(interval);
  }, [
    accountApprovalStatus,
    workspaceId,
    applicantName,
    applicantEmail,
    workspaceName,
    requestedPlanId,
    registrationRequest?.applicantUid,
    registrationRequest?.applicantPhone,
    firebaseUser?.uid,
    userProfile?.phone,
    refreshRegistrationStatus,
  ]);

  const formattedRequestDate = (() => {
    const rawIso = registrationRequest?.requestedAtIso;
    if (!rawIso) return 'الآن';
    try {
      const d = new Date(rawIso);
      if (Number.isNaN(d.getTime())) return 'الآن';
      return d.toLocaleString('ar-YE', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return rawIso;
    }
  })();

  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await refreshRegistrationStatus();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleResendVerification = async () => {
    if (isResendingEmail) return;
    setIsResendingEmail(true);
    try {
      await resendVerificationEmail();
    } finally {
      setIsResendingEmail(false);
    }
  };

  return (
    <div
      className="min-h-screen bg-[#F7F5F0] dark:bg-[#161514] text-[#292725] dark:text-[#F4F1EA] flex flex-col items-center justify-center p-4 sm:p-6"
      dir="rtl"
    >
      <div className="w-full max-w-xl bg-white dark:bg-[#1E1C1A] border border-[#E7E1D8] dark:border-[#383431] rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
        {/* Top Brand & Status Header */}
        <div className="flex items-start justify-between gap-4 border-b border-[#EFECE6] dark:border-[#2E2B28] pb-5">
          <div className="flex items-center gap-3.5">
            <div
              className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-xs ${
                isSuspended
                  ? 'bg-[#A64B45]/15 text-[#A64B45] border border-[#A64B45]/30'
                  : 'bg-[#A77B35]/15 text-[#A77B35] border border-[#A77B35]/30'
              }`}
            >
              {isSuspended ? (
                <AlertTriangle className="w-7 h-7" />
              ) : (
                <Clock className="w-7 h-7" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-lg sm:text-xl font-extrabold font-display text-[#292725] dark:text-[#F4F1EA]">
                  {isSuspended
                    ? 'الحساب موقوف مؤقتًا'
                    : 'طلب تسجيل الحساب قيد المراجعة'}
                </span>
                <span
                  className={`px-2.5 py-0.5 rounded-lg text-[11px] font-bold ${
                    isSuspended
                      ? 'bg-[#A64B45]/15 text-[#A64B45]'
                      : 'bg-[#A77B35]/15 text-[#A77B35]'
                  }`}
                >
                  {isSuspended ? 'موقوف' : 'بانتظار الموافقة'}
                </span>
              </div>
              <p className="text-xs text-[#77716B] dark:text-[#ACA59C] mt-1 leading-relaxed">
                {isSuspended
                  ? 'تم إيقاف الوصول إلى شاشات العمل لهذا الحساب مؤقتًا مع الاحتفاظ الكامل بجميع البيانات المسجلة.'
                  : 'تم استلام طلب تسجيلك في منصة «رَصْد» بنجاح. لا يُسمح بالدخول إلى شاشات العمل الميداني قبل اعتماد الحساب من إدارة المنصة.'}
              </p>
            </div>
          </div>
        </div>

        {/* Applicant & Request Summary Card */}
        <div className="rounded-2xl bg-[#F7F5F0] dark:bg-[#161514] border border-[#E7E1D8] dark:border-[#383431] p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-extrabold text-[#292725] dark:text-[#F4F1EA] flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[#743B46]" />
              <span>تفاصيل طلب التسجيل وحالة الحساب</span>
            </span>
            <span className="text-[11px] font-mono text-[#77716B] dark:text-[#ACA59C]">
              حالة البوابة: {isSuspended ? 'SUSPENDED' : 'PENDING_APPROVAL'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
            <div className="p-3 rounded-xl bg-white dark:bg-[#1E1C1A] border border-[#E7E1D8] dark:border-[#2E2B28]">
              <div className="text-[11px] text-[#77716B] dark:text-[#ACA59C] flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-[#743B46]" />
                <span>اسم مقدم الطلب</span>
              </div>
              <div className="font-bold text-[#292725] dark:text-[#F4F1EA] mt-1 truncate">
                {applicantName}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-white dark:bg-[#1E1C1A] border border-[#E7E1D8] dark:border-[#2E2B28]">
              <div className="text-[11px] text-[#77716B] dark:text-[#ACA59C] flex items-center gap-1">
                <Mail className="w-3.5 h-3.5 text-[#743B46]" />
                <span>البريد الإلكتروني</span>
              </div>
              <div className="font-mono font-bold text-[#292725] dark:text-[#F4F1EA] mt-1 truncate" dir="ltr">
                {applicantEmail}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-white dark:bg-[#1E1C1A] border border-[#E7E1D8] dark:border-[#2E2B28]">
              <div className="text-[11px] text-[#77716B] dark:text-[#ACA59C] flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5 text-[#743B46]" />
                <span>معرّف مساحة العمل المخصصة</span>
              </div>
              <div className="font-mono font-bold text-[#292725] dark:text-[#F4F1EA] mt-1 truncate" dir="ltr">
                {workspaceId || '—'}
              </div>
              <div className="text-[11px] text-[#77716B] dark:text-[#ACA59C] mt-0.5 truncate">
                {workspaceName}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-white dark:bg-[#1E1C1A] border border-[#E7E1D8] dark:border-[#2E2B28]">
              <div className="text-[11px] text-[#77716B] dark:text-[#ACA59C] flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-[#743B46]" />
                <span>تاريخ الطلب والباقة المبدئية</span>
              </div>
              <div className="font-bold text-[#292725] dark:text-[#F4F1EA] mt-1 truncate">
                {requestedPlanLabel}
              </div>
              <div className="text-[11px] text-[#77716B] dark:text-[#ACA59C] mt-0.5">
                تاريخ الإرسال: {formattedRequestDate}
              </div>
            </div>
          </div>
        </div>

        {/* Approval Progress Steps */}
        {!isSuspended && (
          <div className="space-y-2.5">
            <div className="text-xs font-extrabold text-[#292725] dark:text-[#F4F1EA]">
              مراحل تفعيل الحساب الجديد:
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-[#52765D]/10 border border-[#52765D]/25 text-[#292725] dark:text-[#F4F1EA]">
                <CheckCircle2 className="w-4 h-4 text-[#52765D] shrink-0" />
                <span>1. إنشاء الحساب وتخصيص مساحة العمل المستقلة</span>
              </div>
              <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-[#52765D]/10 border border-[#52765D]/25 text-[#292725] dark:text-[#F4F1EA]">
                <CheckCircle2 className="w-4 h-4 text-[#52765D] shrink-0" />
                <span>2. تسجيل طلب التفعيل لدى إدارة المنصة وإظهار حالته</span>
              </div>
              <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-[#A77B35]/15 border border-[#A77B35]/35 text-[#292725] dark:text-[#F4F1EA] font-bold">
                <Clock className="w-4 h-4 text-[#A77B35] shrink-0" />
                <span>3. مراجعة واعتماد الطلب وتحديد باقة الاشتراك من مالك المنصة (الحالة الحالية)</span>
              </div>
              <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-[#EFECE6]/70 dark:bg-[#2B2826]/60 border border-[#DFD8CE] dark:border-[#383431] text-[#77716B] dark:text-[#ACA59C]">
                <Lock className="w-4 h-4 shrink-0" />
                <span>4. فتح شاشات العمل الميداني وإدارة الفريق (يُفتح تلقائيًا فور الاعتماد)</span>
              </div>
            </div>
          </div>
        )}

        {/* Email Verification Notice if not verified yet */}
        {ownerSessionDiagnostic.requiresEmailVerificationForAdmin ? (
          <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/35 border border-amber-300 dark:border-amber-800 space-y-3">
            <div className="text-xs text-amber-950 dark:text-amber-200 leading-relaxed">
              <span className="font-extrabold block mb-1">
                تنبيه خاص بمالك المنصة ({ownerSessionDiagnostic.normalizedEmail}) — البريد غير موثّق (email_verified: false)
              </span>
              <span>
                لا تُمنح صلاحيات المالك الدائم بالاعتماد على نص البريد الإلكتروني وحده قبل التحقق الفعلي من ملكية البريد. يمكنك توثيق الحساب فورًا بتسجيل الدخول عبر Google أو عبر رابط التوثيق المرسل لبريدك:
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={isGoogleLoggingIn}
                onClick={async () => {
                  setIsGoogleLoggingIn(true);
                  try {
                    await loginWithGoogle();
                  } finally {
                    setIsGoogleLoggingIn(false);
                  }
                }}
                className="min-h-[38px] px-4 rounded-xl bg-[#743B46] text-white text-xs font-extrabold hover:bg-[#5E2F38] transition-colors cursor-pointer disabled:opacity-50"
              >
                {isGoogleLoggingIn ? 'جاري التوثيق...' : 'تسجيل الدخول الموثّق عبر Google (تفعيل فوري)'}
              </button>
              <button
                type="button"
                onClick={handleResendVerification}
                disabled={isResendingEmail}
                className="min-h-[38px] px-3.5 rounded-xl bg-white dark:bg-[#1E1C1A] border border-amber-300 dark:border-amber-700 text-xs font-bold hover:border-[#743B46] transition-colors cursor-pointer disabled:opacity-50"
              >
                {isResendingEmail ? 'جاري الإرسال...' : 'إرسال رابط توثيق البريد'}
              </button>
              <button
                type="button"
                disabled={isRefreshing}
                onClick={async () => {
                  setIsRefreshing(true);
                  try {
                    await refreshAuthUser();
                  } finally {
                    setIsRefreshing(false);
                  }
                }}
                className="min-h-[38px] px-3.5 rounded-xl bg-white dark:bg-[#1E1C1A] border border-amber-300 dark:border-amber-700 text-xs font-bold hover:border-[#743B46] transition-colors cursor-pointer disabled:opacity-50"
              >
                فحص حالة التوثيق الآن
              </button>
            </div>
          </div>
        ) : (
          firebaseUser &&
          !firebaseUser.emailVerified && (
            <div className="p-3.5 rounded-2xl bg-[#EFECE6] dark:bg-[#2B2826] border border-[#DFD8CE] dark:border-[#3E3936] flex items-center justify-between gap-3 flex-wrap">
              <div className="text-xs text-[#5C554E] dark:text-[#D5CFC7]">
                <span className="font-bold block">تأكيد البريد الإلكتروني</span>
                <span>يُنصح بتأكيد بريدك الإلكتروني لتسريع مراجعة واعتماد الحساب.</span>
              </div>
              <button
                type="button"
                onClick={handleResendVerification}
                disabled={isResendingEmail}
                className="min-h-[36px] px-3.5 rounded-xl bg-white dark:bg-[#1E1C1A] border border-[#DFD8CE] dark:border-[#3E3936] text-xs font-bold hover:border-[#743B46] transition-colors cursor-pointer disabled:opacity-50"
              >
                {isResendingEmail ? 'جاري الإرسال...' : 'إرسال رابط التأكيد'}
              </button>
            </div>
          )
        )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex-1 min-h-[46px] px-5 rounded-2xl bg-[#743B46] hover:bg-[#5E2F38] text-white text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'جاري التحقق من حالة الطلب...' : 'تحديث وفحص حالة الموافقة الآن'}</span>
          </button>

          <button
            type="button"
            onClick={logout}
            className="min-h-[46px] px-5 rounded-2xl bg-[#EFECE6] hover:bg-[#E5DFD6] dark:bg-[#2B2826] dark:hover:bg-[#383431] text-[#292725] dark:text-[#F4F1EA] border border-[#DFD8CE] dark:border-[#3E3936] text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4 text-[#A64B45]" />
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </div>
    </div>
  );
};
