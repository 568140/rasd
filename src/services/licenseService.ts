import { Timestamp } from 'firebase/firestore';
import {
  AccountApprovalGateStatus,
  AccountApprovalReasonCode,
  AccountLicense,
  CurrencyCode,
  LicenseStatus,
  PermanentPlatformOwnerEmail,
  PlatformAdminOperation,
  PlatformClientAccountSummary,
  PlatformOwnerRole,
  PlatformStaff,
  PlatformStaffPermissions,
  RegistrationRequestMetadata,
  SubscriptionPackage,
  SubscriptionPlanId,
  UserProfile,
  Workspace,
} from '../types/rasd';

/**
 * القائمة المعتمدة لحسابات مالكي منصة «رَصْد» الدائمين بصلاحيات كاملة ومجانية مدى الحياة.
 * تشمل:
 * - المالك الرئيسي: am1075022@gmail.com
 * - المالك الاحتياطي: ahah26@gmail.com (وكذلك ahah26h@gmail.com للتوافق الكامل مع جلسات الإنتاج وقواعد الأمان الحالية)
 */
export const PERMANENT_PLATFORM_OWNER_EMAILS: readonly PermanentPlatformOwnerEmail[] = [
  'am1075022@gmail.com',
  'ahah26@gmail.com',
  'ahah26h@gmail.com',
] as const;

const PERMANENT_OWNER_SET: ReadonlySet<string> = new Set<string>(PERMANENT_PLATFORM_OWNER_EMAILS);

/**
 * تاريخ الانتهاء الرمزي المعتمد للاشتراكات مدى الحياة (Lifetime) وحسابات المالكين الدائمين (2099-12-31T23:59:59.000Z)
 * لضمان توافق الحقل expiresAt مع شرط is timestamp في قواعد Firestore.
 */
export const LIFETIME_EXPIRY_ISO = '2099-12-31T23:59:59.000Z';
export const LIFETIME_EXPIRY_MS = Date.parse(LIFETIME_EXPIRY_ISO);
export const LIFETIME_THRESHOLD_MS = Date.parse('2099-01-01T00:00:00.000Z');
export const MS_PER_DAY = 86_400_000;

/**
 * الباقات الأساسية المعتمدة في نظام الاشتراكات والتراخيص لمنصة رَصْد
 */
export const DEFAULT_SUBSCRIPTION_PACKAGES: Record<SubscriptionPlanId, SubscriptionPackage> = {
  owner_permanent: {
    id: 'owner_permanent',
    nameAr: 'عضوية المالك الدائمة (مجانًا مدى الحياة)',
    descriptionAr: 'صلاحيات إدارية وميدانية كاملة ومجانية مدى الحياة لمالكي المنصة المعتمدين دون انتهاء.',
    billingCycle: 'lifetime',
    durationDays: null,
    isLifetime: true,
    isFreeOwnerPlan: true,
    defaultMaxMembers: 10,
    priceAmount: 0,
    currency: 'SAR',
    isActive: true,
  },
  lifetime: {
    id: 'lifetime',
    nameAr: 'الباقة الدائمة (مدى الحياة)',
    descriptionAr: 'ترخيص دائم مدى الحياة دون الحاجة إلى تجديد دوري.',
    billingCycle: 'lifetime',
    durationDays: null,
    isLifetime: true,
    isFreeOwnerPlan: false,
    defaultMaxMembers: 10,
    priceAmount: 0,
    currency: 'SAR',
    isActive: true,
  },
  trial: {
    id: 'trial',
    nameAr: 'الباقة التجريبية (14 يومًا)',
    descriptionAr: 'فترة تجريبية لتقييم النظام الميداني وإدارة الفريق.',
    billingCycle: 'custom',
    durationDays: 14,
    isLifetime: false,
    defaultMaxMembers: 3,
    priceAmount: 0,
    currency: 'SAR',
    isActive: true,
  },
  monthly: {
    id: 'monthly',
    nameAr: 'الباقة الشهرية (30 يومًا)',
    descriptionAr: 'اشتراك شهري مرن لإدارة العمليات الميدانية والفريق.',
    billingCycle: 'monthly',
    durationDays: 30,
    isLifetime: false,
    defaultMaxMembers: 5,
    priceAmount: 150,
    currency: 'SAR',
    isActive: true,
  },
  quarterly: {
    id: 'quarterly',
    nameAr: 'الباقة ربع السنوية (90 يومًا)',
    descriptionAr: 'اشتراك لمدة 3 أشهر للفرق الميدانية والمكاتب العقارية.',
    billingCycle: 'quarterly',
    durationDays: 90,
    isLifetime: false,
    defaultMaxMembers: 5,
    priceAmount: 400,
    currency: 'SAR',
    isActive: true,
  },
  semi_annual: {
    id: 'semi_annual',
    nameAr: 'الباقة نصف السنوية (180 يومًا)',
    descriptionAr: 'اشتراك لمدة 6 أشهر مع سعة فريق موسعة.',
    billingCycle: 'semi_annual',
    durationDays: 180,
    isLifetime: false,
    defaultMaxMembers: 8,
    priceAmount: 750,
    currency: 'SAR',
    isActive: true,
  },
  annual: {
    id: 'annual',
    nameAr: 'الباقة السنوية (365 يومًا)',
    descriptionAr: 'اشتراك سنوي متكامل بأقصى سعة لأعضاء الفريق.',
    billingCycle: 'annual',
    durationDays: 365,
    isLifetime: false,
    defaultMaxMembers: 10,
    priceAmount: 1400,
    currency: 'SAR',
    isActive: true,
  },
  custom: {
    id: 'custom',
    nameAr: 'باقة مخصصة',
    descriptionAr: 'مدة اشتراك مخصصة يحددها مالك المنصة أو المسؤول المفوض.',
    billingCycle: 'custom',
    durationDays: 30,
    isLifetime: false,
    defaultMaxMembers: 5,
    priceAmount: 0,
    currency: 'SAR',
    isActive: true,
  },
};

export interface VerifiedSessionTokenMetaCandidate {
  syncedAtIso?: string;
  signInProvider?: string | null;
  tokenEmail?: string | null;
  tokenEmailVerified?: boolean;
  hasVerifiedGoogleTokenIdentity?: boolean;
  oauthProfileEmail?: string | null;
  oauthProfileEmailVerified?: boolean;
  googleProviderEmail?: string | null;
  emailSyncStatus?:
    | 'top_level_email_present'
    | 'synced_to_top_level_via_update_email'
    | 'verified_via_google_id_token'
    | 'unverified_or_missing';
  updateEmailErrorCode?: string | null;
}

export interface PlatformOwnerAuthCandidate {
  uid?: string | null;
  email?: string | null;
  emailVerified?: boolean | null;
  providerData?: Array<{ providerId?: string | null; email?: string | null; displayName?: string | null } | null> | null;
  __rasdVerifiedAuthSessionMeta?: VerifiedSessionTokenMetaCandidate | null;
}

export interface PlatformOwnerVerificationResult {
  isVerifiedOwner: boolean;
  ownerRole: PlatformOwnerRole | null;
  normalizedEmail: string;
  isExemptFromSubscription: boolean;
  hasFullPlatformPrivileges: boolean;
  isFreeLifetime: boolean;
  planId: 'owner_permanent' | null;
  rejectionReason:
    | null
    | 'unauthenticated_user'
    | 'missing_email'
    | 'unverified_email_token'
    | 'not_in_permanent_owners_list';
}

export interface OwnerSessionDiagnosticInfo {
  isAuthenticated: boolean;
  authCurrentUserEmailRaw: string | null;
  firebaseEmailRaw: string | null;
  googleProviderEmailRaw: string | null;
  hasGoogleProviderInProviderData: boolean;
  isOriginalFirebaseUserInstance: boolean;
  isSameAsAuthCurrentUser: boolean;
  verifiedTokenSignInProvider: string | null;
  effectiveVerifiedEmail: string | null;
  emailSyncStatus:
    | 'top_level_email_present'
    | 'synced_to_top_level_via_update_email'
    | 'verified_via_google_id_token'
    | 'unverified_or_missing';
  updateEmailErrorCode: string | null;
  topLevelEmailVerifiedRaw: boolean;
  normalizedEmail: string;
  isPermanentOwnerEmailMatch: boolean;
  matchedOwnerRole: PlatformOwnerRole | null;
  emailVerified: boolean;
  isVerifiedOwner: boolean;
  authProviderIds: string[];
  rejectionReason: PlatformOwnerVerificationResult['rejectionReason'];
  rejectionReasonAr: string | null;
  requiresEmailVerificationForAdmin: boolean;
  statusSummaryAr: string;
}

/**
 * توحيد صيغة البريد الإلكتروني للتحقق الأمني (إزالة الفراغات وتحويل الأحرف إلى صغيرة)
 */
export function normalizeEmail(email: string | null | undefined): string {
  if (typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

/**
 * فحص ما إذا كان البريد الإلكتروني ضمن قائمة المالكين الدائمين المعتمدين
 */
export function isPermanentPlatformOwnerEmail(
  email: string | null | undefined
): email is PermanentPlatformOwnerEmail {
  const normalized = normalizeEmail(email);
  return PERMANENT_OWNER_SET.has(normalized);
}

/**
 * تحديد دور المالك الدائم (رئيسي أو احتياطي)
 * كلا الدورين يمتلكان نفس الصلاحيات الإدارية الكاملة بنسبة 100% ومجانيان مدى الحياة.
 */
export function getPermanentOwnerRole(email: string | null | undefined): PlatformOwnerRole | null {
  const normalized = normalizeEmail(email);
  if (normalized === 'am1075022@gmail.com') {
    return 'primary_owner';
  }
  if (normalized === 'ahah26@gmail.com' || normalized === 'ahah26h@gmail.com') {
    return 'backup_owner';
  }
  return null;
}

/**
 * استخراج بيانات التوثيق الموقعة من خادم Firebase Auth المرتبطة بكائن المستخدم الأصلي إن وُجدت
 */
function extractVerifiedSessionMeta(
  authCandidate: PlatformOwnerAuthCandidate | null | undefined
): VerifiedSessionTokenMetaCandidate | null {
  if (!authCandidate || typeof authCandidate !== 'object') return null;
  const meta = (authCandidate as Record<string, unknown>).__rasdVerifiedAuthSessionMeta;
  if (!meta || typeof meta !== 'object') return null;
  return meta as VerifiedSessionTokenMetaCandidate;
}

/**
 * التحقق مما إذا كانت الجلسة الحالية تحمل إثبات توثيق رقمي من رمز Firebase ID Token لمزوّد Google
 * (لا يعتمد على providerData وحده أبدًا، بل يشترط وجود نتيجة getIdTokenResult الموقعة من الخادم)
 */
function evaluateServerVerifiedSessionToken(
  authCandidate: PlatformOwnerAuthCandidate | null | undefined
): {
  isServerVerifiedGoogleSession: boolean;
  isServerVerifiedTokenEmail: boolean;
  verifiedSessionEmail: string;
  meta: VerifiedSessionTokenMetaCandidate | null;
} {
  const meta = extractVerifiedSessionMeta(authCandidate);
  if (!meta) {
    return {
      isServerVerifiedGoogleSession: false,
      isServerVerifiedTokenEmail: false,
      verifiedSessionEmail: '',
      meta: null,
    };
  }

  const isServerVerifiedGoogleSession =
    meta.signInProvider === 'google.com' &&
    Boolean(
      meta.hasVerifiedGoogleTokenIdentity ||
        meta.tokenEmailVerified ||
        meta.oauthProfileEmailVerified
    );

  const isServerVerifiedTokenEmail = Boolean(
    meta.tokenEmailVerified && typeof meta.tokenEmail === 'string' && meta.tokenEmail.trim()
  );

  let verifiedSessionEmail = '';
  if (isServerVerifiedTokenEmail) {
    verifiedSessionEmail = normalizeEmail(meta.tokenEmail);
  } else if (isServerVerifiedGoogleSession) {
    verifiedSessionEmail = normalizeEmail(
      meta.tokenEmail || meta.oauthProfileEmail || meta.googleProviderEmail
    );
  }

  return {
    isServerVerifiedGoogleSession,
    isServerVerifiedTokenEmail,
    verifiedSessionEmail,
    meta,
  };
}

/**
 * استخراج البريد الإلكتروني الموثوق للمستخدم من المستوى الأعلى (user.email) أو من رمز الجلسة الموثق رقميًا
 * (دون الاعتماد على providerData غير الموثق)
 */
export function resolveVerifiedOrTopLevelUserEmail(
  authCandidate: PlatformOwnerAuthCandidate | null | undefined
): string {
  if (!authCandidate) return '';
  const topLevel = normalizeEmail(authCandidate.email);
  if (topLevel) return topLevel;
  const { verifiedSessionEmail } = evaluateServerVerifiedSessionToken(authCandidate);
  return verifiedSessionEmail;
}

/**
 * التحقق الصارم من هوية مالك المنصة بالاعتماد الحصري على جلسة Firebase Auth الموثقة (request.auth / firebaseUser)
 * دون الاعتماد على حقل البريد القابل للتعديل في وثيقة Firestore (/users) ودون منح صلاحيات لنص البريد وحده قبل توثيقه
 * ودون منح صلاحيات اعتمادًا على providerData وحده.
 */
export function verifyPlatformOwnerIdentity(
  authCandidate: PlatformOwnerAuthCandidate | null | undefined
): PlatformOwnerVerificationResult {
  if (!authCandidate || typeof authCandidate.uid !== 'string' || !authCandidate.uid.trim()) {
    return {
      isVerifiedOwner: false,
      ownerRole: null,
      normalizedEmail: '',
      isExemptFromSubscription: false,
      hasFullPlatformPrivileges: false,
      isFreeLifetime: false,
      planId: null,
      rejectionReason: 'unauthenticated_user',
    };
  }

  const topLevelEmail = normalizeEmail(authCandidate.email);
  const {
    isServerVerifiedGoogleSession,
    isServerVerifiedTokenEmail,
    verifiedSessionEmail,
  } = evaluateServerVerifiedSessionToken(authCandidate);

  // إذا كان user.email في المستوى الأعلى فارغًا، لا يُقبل أي بريد بديل إلا إذا ثبت توثيقه من رمز جلسة Firebase الموقّع (getIdTokenResult)
  const normalizedEmail = topLevelEmail || verifiedSessionEmail;
  if (!normalizedEmail) {
    return {
      isVerifiedOwner: false,
      ownerRole: null,
      normalizedEmail: '',
      isExemptFromSubscription: false,
      hasFullPlatformPrivileges: false,
      isFreeLifetime: false,
      planId: null,
      rejectionReason: 'missing_email',
    };
  }

  const ownerRole = getPermanentOwnerRole(normalizedEmail);
  if (!ownerRole) {
    return {
      isVerifiedOwner: false,
      ownerRole: null,
      normalizedEmail,
      isExemptFromSubscription: false,
      hasFullPlatformPrivileges: false,
      isFreeLifetime: false,
      planId: null,
      rejectionReason: 'not_in_permanent_owners_list',
    };
  }

  const isEmailCryptographicallyVerified =
    authCandidate.emailVerified === true ||
    isServerVerifiedGoogleSession ||
    isServerVerifiedTokenEmail;

  if (!isEmailCryptographicallyVerified) {
    return {
      isVerifiedOwner: false,
      ownerRole: null,
      normalizedEmail,
      isExemptFromSubscription: false,
      hasFullPlatformPrivileges: false,
      isFreeLifetime: false,
      planId: null,
      rejectionReason: 'unverified_email_token',
    };
  }

  return {
    isVerifiedOwner: true,
    ownerRole,
    normalizedEmail,
    isExemptFromSubscription: true,
    hasFullPlatformPrivileges: true,
    isFreeLifetime: true,
    planId: 'owner_permanent',
    rejectionReason: null,
  };
}

/**
 * فحص تشخيصي آمن لحالة جلسة المالك ومقارنة auth.currentUser.email و firebaseUser.email و providerData (google.com)
 * دون كشف أي أسرار أو رموز دخول أو منح صلاحيات غير موثقة
 */
export function inspectOwnerSessionDiagnostic(
  authCandidate: PlatformOwnerAuthCandidate | null | undefined,
  currentAuthUser?: PlatformOwnerAuthCandidate | null
): OwnerSessionDiagnosticInfo {
  const verification = verifyPlatformOwnerIdentity(authCandidate);
  const {
    isServerVerifiedGoogleSession,
    isServerVerifiedTokenEmail,
    verifiedSessionEmail,
    meta,
  } = evaluateServerVerifiedSessionToken(authCandidate);

  const isAuthenticated = Boolean(
    authCandidate && typeof authCandidate.uid === 'string' && authCandidate.uid.trim()
  );

  const firebaseEmailRaw =
    authCandidate && typeof authCandidate.email === 'string' && authCandidate.email.trim()
      ? authCandidate.email.trim()
      : null;

  const effectiveCurrentAuth = currentAuthUser !== undefined ? currentAuthUser : authCandidate;
  const authCurrentUserEmailRaw =
    effectiveCurrentAuth &&
    typeof effectiveCurrentAuth.email === 'string' &&
    effectiveCurrentAuth.email.trim()
      ? effectiveCurrentAuth.email.trim()
      : null;

  const rawProviders = Array.isArray(authCandidate?.providerData)
    ? authCandidate!.providerData
    : [];
  const authProviderIds = rawProviders
    .map((p) => (p && typeof p.providerId === 'string' ? p.providerId.trim() : ''))
    .filter(Boolean);

  const googleProviderEntry =
    rawProviders.find((p) => p && p.providerId === 'google.com') || null;
  const hasGoogleProviderInProviderData = Boolean(googleProviderEntry);
  const googleProviderEmailRaw =
    googleProviderEntry &&
    typeof googleProviderEntry.email === 'string' &&
    googleProviderEntry.email.trim()
      ? googleProviderEntry.email.trim()
      : null;

  const isOriginalFirebaseUserInstance = Boolean(
    authCandidate &&
      typeof (authCandidate as { reload?: unknown }).reload === 'function' &&
      typeof (authCandidate as { getIdTokenResult?: unknown }).getIdTokenResult === 'function'
  );

  const isSameAsAuthCurrentUser = Boolean(
    authCandidate && effectiveCurrentAuth && authCandidate === effectiveCurrentAuth
  );

  const topLevelEmailVerifiedRaw = authCandidate?.emailVerified === true;
  const emailVerified =
    topLevelEmailVerifiedRaw || isServerVerifiedGoogleSession || isServerVerifiedTokenEmail;

  const normalizedEmail =
    normalizeEmail(authCandidate?.email) ||
    verifiedSessionEmail ||
    normalizeEmail(googleProviderEmailRaw);

  const matchedOwnerRole = getPermanentOwnerRole(normalizedEmail);
  const isPermanentOwnerEmailMatch = matchedOwnerRole !== null;

  const effectiveVerifiedEmail = verification.normalizedEmail || null;
  const verifiedTokenSignInProvider = meta?.signInProvider || null;
  const emailSyncStatus: OwnerSessionDiagnosticInfo['emailSyncStatus'] =
    meta?.emailSyncStatus ||
    (firebaseEmailRaw ? 'top_level_email_present' : 'unverified_or_missing');
  const updateEmailErrorCode = meta?.updateEmailErrorCode || null;

  const requiresEmailVerificationForAdmin =
    isAuthenticated && isPermanentOwnerEmailMatch && !verification.isVerifiedOwner;

  let rejectionReasonAr: string | null = null;
  if (verification.rejectionReason === 'unauthenticated_user') {
    rejectionReasonAr = 'لا توجد جلسة مصادقة نشطة في Firebase Auth.';
  } else if (verification.rejectionReason === 'missing_email') {
    if (hasGoogleProviderInProviderData && googleProviderEmailRaw) {
      rejectionReasonAr =
        'حقل firebaseUser.email فارغ (null) بينما البريد موجود في providerData (google.com) — يرجى الضغط على «تحديث الجلسة» لمزامنة رمز جلسة Google الموثق.';
    } else {
      rejectionReasonAr =
        'كائن المستخدم في Firebase Auth لا يحتوي على بريد إلكتروني أساسي (firebaseUser.email فارغ).';
    }
  } else if (verification.rejectionReason === 'not_in_permanent_owners_list') {
    rejectionReasonAr = 'البريد الإلكتروني الحالي ليس ضمن قائمة مالكي المنصة الدائمين المعتمدين.';
  } else if (verification.rejectionReason === 'unverified_email_token') {
    rejectionReasonAr =
      'البريد الإلكتروني مطابق لمالك المنصة الدائم، لكن الجلسة الحالية غير موثقة بعد (emailVerified === false — يلزم توثيق البريد أو الدخول الموثّق عبر Google).';
  }

  let statusSummaryAr = 'حساب مستخدم عادي غير مدرج ضمن المالكين الدائمين للمنصة.';
  if (!isAuthenticated) {
    statusSummaryAr = 'لم يتم تسجيل الدخول في جلسة المصادقة الحالية.';
  } else if (verification.isVerifiedOwner) {
    const syncNote =
      !firebaseEmailRaw && isServerVerifiedGoogleSession
        ? ' (تم التحقق الرقمي من البريد عبر رمز جلسة Google الموقّع رغم كون حقل user.email الأساسي فارغًا في Firebase Auth)'
        : '';
    statusSummaryAr =
      (matchedOwnerRole === 'primary_owner'
        ? 'جلسة مالك دائم رئيسي موثّقة بالكامل — الصلاحيات الإدارية مفعّلة.'
        : 'جلسة مالك دائم احتياطي موثّقة بالكامل — الصلاحيات الإدارية مفعّلة.') + syncNote;
  } else if (requiresEmailVerificationForAdmin) {
    statusSummaryAr =
      'البريد المسجل مطابق لحساب مالك دائم معتمد، لكن الجلسة الحالية غير موثقة بعد. يمكنك الضغط على «تحديث الجلسة» أو تسجيل الدخول الموثّق عبر Google لتفعيل الصلاحيات فورًا.';
  }

  return {
    isAuthenticated,
    authCurrentUserEmailRaw,
    firebaseEmailRaw,
    googleProviderEmailRaw,
    hasGoogleProviderInProviderData,
    isOriginalFirebaseUserInstance,
    isSameAsAuthCurrentUser,
    verifiedTokenSignInProvider,
    effectiveVerifiedEmail,
    emailSyncStatus,
    updateEmailErrorCode,
    topLevelEmailVerifiedRaw,
    normalizedEmail,
    isPermanentOwnerEmailMatch,
    matchedOwnerRole,
    emailVerified,
    isVerifiedOwner: verification.isVerifiedOwner,
    authProviderIds,
    rejectionReason: verification.rejectionReason,
    rejectionReasonAr,
    requiresEmailVerificationForAdmin,
    statusSummaryAr,
  };
}

/**
 * تحويل أي مدخل تاريخي (Date أو Firestore Timestamp أو ISO string أو رقم) إلى كائن Date صالح
 */
export function parseDateInput(input: unknown, fallback?: Date): Date {
  if (input instanceof Date) {
    if (!Number.isNaN(input.getTime())) {
      return new Date(input.getTime());
    }
  } else if (input instanceof Timestamp) {
    return input.toDate();
  } else if (
    input &&
    typeof input === 'object' &&
    typeof (input as { toDate?: unknown }).toDate === 'function'
  ) {
    const converted = (input as { toDate: () => Date }).toDate();
    if (converted instanceof Date && !Number.isNaN(converted.getTime())) {
      return new Date(converted.getTime());
    }
  } else if (
    input &&
    typeof input === 'object' &&
    typeof (input as { seconds?: unknown }).seconds === 'number'
  ) {
    const secs = (input as { seconds: number }).seconds;
    const nanos =
      typeof (input as { nanoseconds?: unknown }).nanoseconds === 'number'
        ? (input as { nanoseconds: number }).nanoseconds
        : 0;
    return new Date(secs * 1000 + Math.floor(nanos / 1_000_000));
  } else if (typeof input === 'string' && input.trim()) {
    const ms = Date.parse(input.trim());
    if (!Number.isNaN(ms)) {
      return new Date(ms);
    }
  } else if (typeof input === 'number' && Number.isFinite(input)) {
    return new Date(input);
  }

  if (fallback) {
    return new Date(fallback.getTime());
  }
  throw new Error('صيغة التاريخ المدخلة لحساب الاشتراك غير صالحة.');
}

export interface SubscriptionPeriodCalculation {
  planId: SubscriptionPlanId;
  startsAtDate: Date;
  expiresAtDate: Date;
  startsAtIso: string;
  expiresAtIso: string;
  startsAtTimestamp: Timestamp;
  expiresAtTimestamp: Timestamp;
  durationDays: number | null;
  isLifetime: boolean;
  isFreeOwnerPlan: boolean;
}

/**
 * استخراج عدد أيام الاشتراك أو حالة الاشتراك مدى الحياة بناءً على معرف الباقة أو المدة المخصصة
 */
export function resolvePlanDuration(
  planId: SubscriptionPlanId,
  customDurationDays?: number | null
): { durationDays: number | null; isLifetime: boolean; isFreeOwnerPlan: boolean } {
  if (planId === 'owner_permanent') {
    return { durationDays: null, isLifetime: true, isFreeOwnerPlan: true };
  }
  if (planId === 'lifetime') {
    return { durationDays: null, isLifetime: true, isFreeOwnerPlan: false };
  }

  if (typeof customDurationDays === 'number') {
    if (!Number.isFinite(customDurationDays) || customDurationDays <= 0) {
      throw new Error('يجب أن تكون مدة الاشتراك المخصصة (customDurationDays) أكبر من صفر.');
    }
    return {
      durationDays: Math.round(customDurationDays),
      isLifetime: false,
      isFreeOwnerPlan: false,
    };
  }

  const pkg = DEFAULT_SUBSCRIPTION_PACKAGES[planId];
  if (!pkg) {
    throw new Error(`معرف باقة الاشتراك غير معروف: ${String(planId)}`);
  }

  if (pkg.isLifetime || pkg.durationDays === null) {
    return {
      durationDays: null,
      isLifetime: true,
      isFreeOwnerPlan: Boolean(pkg.isFreeOwnerPlan),
    };
  }

  return {
    durationDays: pkg.durationDays,
    isLifetime: false,
    isFreeOwnerPlan: Boolean(pkg.isFreeOwnerPlan),
  };
}

/**
 * حساب تاريخ بداية الاشتراك وانتهائه عند التفعيل الأولي (بما يشمل الاشتراك مدى الحياة وحسابات المالكين الدائمين)
 */
export function calculateSubscriptionPeriod(options: {
  planId: SubscriptionPlanId;
  startDate?: unknown;
  customDurationDays?: number | null;
  ownerEmail?: string | null;
}): SubscriptionPeriodCalculation {
  const effectivePlanId: SubscriptionPlanId = isPermanentPlatformOwnerEmail(options.ownerEmail)
    ? 'owner_permanent'
    : options.planId;

  const startsAtDate =
    options.startDate !== undefined && options.startDate !== null
      ? parseDateInput(options.startDate)
      : new Date();

  const { durationDays, isLifetime, isFreeOwnerPlan } = resolvePlanDuration(
    effectivePlanId,
    options.customDurationDays
  );

  const expiresAtDate = isLifetime
    ? new Date(LIFETIME_EXPIRY_MS)
    : new Date(startsAtDate.getTime() + (durationDays as number) * MS_PER_DAY);

  return {
    planId: effectivePlanId,
    startsAtDate,
    expiresAtDate,
    startsAtIso: startsAtDate.toISOString(),
    expiresAtIso: expiresAtDate.toISOString(),
    startsAtTimestamp: Timestamp.fromDate(startsAtDate),
    expiresAtTimestamp: Timestamp.fromDate(expiresAtDate),
    durationDays,
    isLifetime,
    isFreeOwnerPlan,
  };
}

export type SubscriptionRenewalMode =
  | 'lifetime_permanent'
  | 'extended_from_current_expiry'
  | 'restarted_from_renewal_date';

export interface SubscriptionRenewalCalculation extends SubscriptionPeriodCalculation {
  renewalMode: SubscriptionRenewalMode;
  previousExpiresAtIso: string | null;
  effectiveBaseDateIso: string;
  preservedRemainingDays: number;
}

/**
 * حساب تواريخ تجديد الاشتراك:
 * 1. إذا كان التجديد لباقة مدى الحياة (lifetime) أو لحساب مالك دائم (owner_permanent):
 *    يُعتمد تاريخ الانتهاء الدائم (2099-12-31) مع حالة نشطة دائمة.
 * 2. إذا كان الاشتراك الحالي لا يزال ساريًا (currentExpiresAt > renewalDate):
 *    تُضاف مدة الباقة الجديدة تراكميًا فوق تاريخ الانتهاء الحالي (currentExpiresAt) للحفاظ على الأيام المتبقية للعميل.
 * 3. إذا كان الاشتراك منتهيًا (currentExpiresAt <= renewalDate) أو غير محدد:
 *    تبدأ الدورة الجديدة من تاريخ التجديد الفعلي (renewalDate) وتُضاف مدة الباقة إليه.
 */
export function calculateSubscriptionRenewal(options: {
  planId: SubscriptionPlanId;
  currentStartsAt?: unknown;
  currentExpiresAt?: unknown;
  renewalDate?: unknown;
  customDurationDays?: number | null;
  ownerEmail?: string | null;
}): SubscriptionRenewalCalculation {
  const effectivePlanId: SubscriptionPlanId = isPermanentPlatformOwnerEmail(options.ownerEmail)
    ? 'owner_permanent'
    : options.planId;

  const renewalDateObj =
    options.renewalDate !== undefined && options.renewalDate !== null
      ? parseDateInput(options.renewalDate)
      : new Date();

  const previousExpiresDate =
    options.currentExpiresAt !== undefined && options.currentExpiresAt !== null
      ? parseDateInput(options.currentExpiresAt, renewalDateObj)
      : null;

  const previousStartsDate =
    options.currentStartsAt !== undefined && options.currentStartsAt !== null
      ? parseDateInput(options.currentStartsAt, renewalDateObj)
      : null;

  const { durationDays, isLifetime, isFreeOwnerPlan } = resolvePlanDuration(
    effectivePlanId,
    options.customDurationDays
  );

  if (isLifetime) {
    const startsAtDate = previousStartsDate || renewalDateObj;
    const expiresAtDate = new Date(LIFETIME_EXPIRY_MS);
    return {
      planId: effectivePlanId,
      renewalMode: 'lifetime_permanent',
      previousExpiresAtIso: previousExpiresDate ? previousExpiresDate.toISOString() : null,
      effectiveBaseDateIso: renewalDateObj.toISOString(),
      preservedRemainingDays: 0,
      startsAtDate,
      expiresAtDate,
      startsAtIso: startsAtDate.toISOString(),
      expiresAtIso: expiresAtDate.toISOString(),
      startsAtTimestamp: Timestamp.fromDate(startsAtDate),
      expiresAtTimestamp: Timestamp.fromDate(expiresAtDate),
      durationDays: null,
      isLifetime: true,
      isFreeOwnerPlan,
    };
  }

  const isCurrentlyActive =
    previousExpiresDate !== null && previousExpiresDate.getTime() > renewalDateObj.getTime();

  const effectiveBaseDate = isCurrentlyActive ? previousExpiresDate : renewalDateObj;
  const startsAtDate =
    isCurrentlyActive && previousStartsDate ? previousStartsDate : renewalDateObj;
  const expiresAtDate = new Date(
    effectiveBaseDate.getTime() + (durationDays as number) * MS_PER_DAY
  );

  const preservedRemainingDays = isCurrentlyActive
    ? Math.max(0, Math.ceil((previousExpiresDate.getTime() - renewalDateObj.getTime()) / MS_PER_DAY))
    : 0;

  return {
    planId: effectivePlanId,
    renewalMode: isCurrentlyActive
      ? 'extended_from_current_expiry'
      : 'restarted_from_renewal_date',
    previousExpiresAtIso: previousExpiresDate ? previousExpiresDate.toISOString() : null,
    effectiveBaseDateIso: effectiveBaseDate.toISOString(),
    preservedRemainingDays,
    startsAtDate,
    expiresAtDate,
    startsAtIso: startsAtDate.toISOString(),
    expiresAtIso: expiresAtDate.toISOString(),
    startsAtTimestamp: Timestamp.fromDate(startsAtDate),
    expiresAtTimestamp: Timestamp.fromDate(expiresAtDate),
    durationDays,
    isLifetime: false,
    isFreeOwnerPlan: false,
  };
}

export interface EvaluatedLicenseState {
  effectiveStatus: LicenseStatus;
  isLifetime: boolean;
  isPermanentOwner: boolean;
  isExpired: boolean;
  isReadAllowed: boolean;
  isWriteAllowed: boolean;
  remainingDays: number | null;
  startsAtIso: string;
  expiresAtIso: string;
}

/**
 * تقييم حالة الترخيص الفعلية في لحظة زمنية محددة:
 * - المالكون الدائمون (am1075022@gmail.com, ahah26@gmail.com, ahah26h@gmail.com) نشطون دائمًا ومجانيون مدى الحياة.
 * - باقات مدى الحياة (lifetime / owner_permanent) نشطة دون انتهاء ما دامت حالتها غير معلقة.
 * - عند انتهاء التاريخ (expiresAt <= referenceDate)، تتحول الحالة الفعلية إلى expired مع بقاء القراءة مسموحة وإيقاف الكتابة.
 */
export function evaluateLicenseState(
  license: Pick<
    AccountLicense,
    'ownerEmail' | 'planId' | 'status' | 'startsAt' | 'expiresAt'
  >,
  referenceDate: unknown = new Date()
): EvaluatedLicenseState {
  const refDate = parseDateInput(referenceDate, new Date());
  const isOwner = isPermanentPlatformOwnerEmail(license.ownerEmail);

  if (isOwner) {
    const startsDate = parseDateInput(license.startsAt, refDate);
    return {
      effectiveStatus: 'active',
      isLifetime: true,
      isPermanentOwner: true,
      isExpired: false,
      isReadAllowed: true,
      isWriteAllowed: true,
      remainingDays: null,
      startsAtIso: startsDate.toISOString(),
      expiresAtIso: LIFETIME_EXPIRY_ISO,
    };
  }

  const startsDate = parseDateInput(license.startsAt, refDate);
  const expiresDate = parseDateInput(license.expiresAt, refDate);

  const isLifetimePlan =
    license.planId === 'lifetime' ||
    license.planId === 'owner_permanent' ||
    expiresDate.getTime() >= LIFETIME_THRESHOLD_MS;

  if (license.status === 'suspended' || license.status === 'pending') {
    return {
      effectiveStatus: license.status,
      isLifetime: isLifetimePlan,
      isPermanentOwner: false,
      isExpired: false,
      isReadAllowed: true,
      isWriteAllowed: false,
      remainingDays: isLifetimePlan
        ? null
        : Math.max(0, Math.ceil((expiresDate.getTime() - refDate.getTime()) / MS_PER_DAY)),
      startsAtIso: startsDate.toISOString(),
      expiresAtIso: expiresDate.toISOString(),
    };
  }

  if (isLifetimePlan && license.status === 'active') {
    return {
      effectiveStatus: 'active',
      isLifetime: true,
      isPermanentOwner: false,
      isExpired: false,
      isReadAllowed: true,
      isWriteAllowed: true,
      remainingDays: null,
      startsAtIso: startsDate.toISOString(),
      expiresAtIso: expiresDate.toISOString(),
    };
  }

  const diffMs = expiresDate.getTime() - refDate.getTime();
  const isExpiredNow = license.status === 'expired' || diffMs <= 0;

  return {
    effectiveStatus: isExpiredNow ? 'expired' : 'active',
    isLifetime: false,
    isPermanentOwner: false,
    isExpired: isExpiredNow,
    isReadAllowed: true,
    isWriteAllowed: !isExpiredNow && license.status === 'active',
    remainingDays: isExpiredNow ? 0 : Math.ceil(diffMs / MS_PER_DAY),
    startsAtIso: startsDate.toISOString(),
    expiresAtIso: expiresDate.toISOString(),
  };
}

/**
 * إنشاء كائن ترخيص دائم ومجاني مدى الحياة لأحد مالكي المنصة الدائمين
 */
export function buildPermanentOwnerLicense(params: {
  workspaceId: string;
  ownerId: string;
  ownerEmail: string;
  now?: unknown;
}): AccountLicense {
  const normalizedEmail = normalizeEmail(params.ownerEmail);
  if (!isPermanentPlatformOwnerEmail(normalizedEmail)) {
    throw new Error(
      `لا يجوز إصدار ترخيص مالك دائم مجاني (owner_permanent) للبريد غير المعتمد: ${params.ownerEmail}`
    );
  }

  const nowDate = params.now ? parseDateInput(params.now) : new Date();
  const nowTimestamp = Timestamp.fromDate(nowDate);
  const lifetimeTimestamp = Timestamp.fromDate(new Date(LIFETIME_EXPIRY_MS));

  return {
    id: params.workspaceId,
    workspaceId: params.workspaceId,
    ownerId: params.ownerId,
    ownerEmail: normalizedEmail,
    planId: 'owner_permanent',
    status: 'active',
    startsAt: nowTimestamp,
    expiresAt: lifetimeTimestamp,
    maxMembers: 10,
    notes: 'حساب مالك منصة دائم — معفي من الاشتراكات ومدد الانتهاء بصلاحيات كاملة مدى الحياة.',
    createdAt: nowTimestamp,
    updatedAt: nowTimestamp,
  };
}

/**
 * التحقق من صلاحية مساعد إدارة المنصة (Platform Staff) لتنفيذ إجراء محدد
 */
export function checkPlatformStaffPermission(
  staffRecord: PlatformStaff | null | undefined,
  permissionKey: keyof PlatformStaffPermissions
): boolean {
  if (!staffRecord) return false;
  if (staffRecord.status !== 'active') return false;
  if (!staffRecord.permissions || typeof staffRecord.permissions !== 'object') return false;
  return staffRecord.permissions[permissionKey] === true;
}

// ============================================================================
// نظام طلبات تسجيل العملاء وبوابة الموافقة (المرحلة الثانية — استقبال الطلبات)
// ============================================================================

/**
 * علامة المسمى الوظيفي المبدئية للحسابات الجديدة التي سجلت ذاتيًا وتنتظر موافقة إدارة المنصة.
 * متوافقة 100% مع قواعد /firestore.rules الحالية (string <= 100 chars) لضمان بقاء الحساب الجديد
 * في حالة انتظار الموافقة حتى قبل نشر مجموعة /account_licenses في قواعد الإنتاج، ودون المساس بالحسابات الحالية.
 */
export const PENDING_REGISTRATION_JOB_TITLE_MARKER = 'طلب تسجيل جديد - بانتظار الموافقة';

/**
 * تضمين البيانات الوصفية لطلب التسجيل داخل حقل notes في وثيقة الترخيص (/account_licenses)
 * مع ضمان عدم تجاوز الحد الأقصى المسموح به في قواعد Firestore (1000 حرف).
 */
export function encodeRegistrationMetaIntoNotes(
  humanNotes: string,
  meta: Partial<RegistrationRequestMetadata>
): string {
  const cleanNotes = (humanNotes || '')
    .replace(/\[REG_META:\{.*?\}\]/g, '')
    .trim()
    .slice(0, 350);
  const compactMeta: Record<string, string> = {};
  if (meta.applicantUid) compactMeta.applicantUid = String(meta.applicantUid).slice(0, 64);
  if (meta.applicantName) compactMeta.applicantName = String(meta.applicantName).slice(0, 80);
  if (meta.applicantEmail) compactMeta.applicantEmail = String(meta.applicantEmail).slice(0, 120);
  if (meta.applicantPhone) compactMeta.applicantPhone = String(meta.applicantPhone).slice(0, 40);
  if (meta.workspaceId) compactMeta.workspaceId = String(meta.workspaceId).slice(0, 64);
  if (meta.workspaceName) compactMeta.workspaceName = String(meta.workspaceName).slice(0, 80);
  if (meta.requestedPlanId) compactMeta.requestedPlanId = String(meta.requestedPlanId).slice(0, 32);
  if (meta.requestedAtIso) compactMeta.requestedAtIso = String(meta.requestedAtIso).slice(0, 40);

  const metaTag = `[REG_META:${JSON.stringify(compactMeta)}]`;
  const combined = cleanNotes ? `${cleanNotes}\n${metaTag}` : metaTag;
  return combined.slice(0, 950);
}

/**
 * فك ترميز البيانات الوصفية لطلب التسجيل من حقل notes في وثيقة الترخيص
 */
export function decodeRegistrationMetaFromNotes(rawNotes: string | null | undefined): {
  cleanNotes: string;
  meta: Partial<RegistrationRequestMetadata>;
} {
  if (!rawNotes || typeof rawNotes !== 'string') {
    return { cleanNotes: '', meta: {} };
  }
  const match = rawNotes.match(/\[REG_META:(\{.*?\})\]/);
  if (!match) {
    return { cleanNotes: rawNotes.trim(), meta: {} };
  }
  try {
    const parsed = JSON.parse(match[1]) as Partial<RegistrationRequestMetadata>;
    const cleanNotes = rawNotes.replace(/\[REG_META:\{.*?\}\]/g, '').trim();
    return { cleanNotes, meta: parsed };
  } catch {
    return { cleanNotes: rawNotes.trim(), meta: {} };
  }
}

/**
 * فحص ما إذا كان الملف الشخصي أو سجل العضوية يحمل علامة طلب تسجيل جديد بانتظار الموافقة
 */
export function isPendingRegistrationProfileMarker(
  jobTitle: string | null | undefined,
  ownerMemberStatus?: string | null
): boolean {
  const cleanJob = typeof jobTitle === 'string' ? jobTitle.trim() : '';
  if (cleanJob === PENDING_REGISTRATION_JOB_TITLE_MARKER) {
    return true;
  }
  if (ownerMemberStatus === 'invited') {
    return true;
  }
  return false;
}

/**
 * إنشاء وثيقة طلب تسجيل وترخيص مبدئي بحالة انتظار الموافقة (status = 'pending')
 * متوافقة بالكامل مع دالة isValidAccountLicense في DRAFT_firestore.rules.
 */
export function buildPendingRegistrationLicense(params: {
  workspaceId: string;
  ownerId: string;
  ownerEmail: string;
  applicantName: string;
  applicantPhone?: string;
  workspaceName?: string;
  requestedPlanId?: SubscriptionPlanId;
  now?: unknown;
}): AccountLicense {
  const normalizedEmail = normalizeEmail(params.ownerEmail);
  if (isPermanentPlatformOwnerEmail(normalizedEmail)) {
    throw new Error(
      'حسابات مالكي المنصة الدائمين معفاة من طلبات الانتظار وتحصل على ترخيص مالك دائم تلقائيًا.'
    );
  }

  const requestedPlan: SubscriptionPlanId =
    params.requestedPlanId && params.requestedPlanId !== 'owner_permanent'
      ? params.requestedPlanId
      : 'trial';

  const nowDate = params.now ? parseDateInput(params.now) : new Date();
  const period = calculateSubscriptionPeriod({
    planId: requestedPlan,
    startDate: nowDate,
  });

  const pkg = DEFAULT_SUBSCRIPTION_PACKAGES[requestedPlan] || DEFAULT_SUBSCRIPTION_PACKAGES.trial;
  const cleanName = (params.applicantName || normalizedEmail.split('@')[0] || 'عميل جديد').trim();
  const cleanWsName = (params.workspaceName || `مساحة عمل ${cleanName}`).trim();

  const humanSummary = `طلب تسجيل عميل جديد (${cleanName}) — بانتظار مراجعة واعتماد إدارة المنصة.`;
  const encodedNotes = encodeRegistrationMetaIntoNotes(humanSummary, {
    applicantUid: params.ownerId,
    applicantName: cleanName,
    applicantEmail: normalizedEmail,
    applicantPhone: (params.applicantPhone || '').trim(),
    workspaceId: params.workspaceId,
    workspaceName: cleanWsName,
    requestedPlanId: requestedPlan,
    requestedAtIso: nowDate.toISOString(),
  });

  return {
    id: params.workspaceId,
    workspaceId: params.workspaceId,
    ownerId: params.ownerId,
    ownerEmail: normalizedEmail,
    planId: requestedPlan,
    status: 'pending',
    startsAt: period.startsAtTimestamp,
    expiresAt: period.expiresAtTimestamp,
    maxMembers: pkg.defaultMaxMembers,
    notes: encodedNotes,
    createdAt: period.startsAtTimestamp,
    updatedAt: period.startsAtTimestamp,
  };
}

/**
 * استخلاص ملخص موحد لطلب التسجيل لعرضه للمستخدم أو لإدارة المنصة
 */
export function buildRegistrationRequestSummary(params: {
  license?: AccountLicense | null;
  userProfile?: Partial<UserProfile> | null;
  workspace?: Partial<Workspace> | null;
  memberStatus?: string | null;
  fallbackUid?: string;
  fallbackEmail?: string;
  fallbackName?: string;
  sourceOverride?: RegistrationRequestMetadata['source'];
}): RegistrationRequestMetadata {
  const { license, userProfile, workspace } = params;
  const decoded = decodeRegistrationMetaFromNotes(license?.notes);

  const applicantUid =
    license?.ownerId ||
    decoded.meta.applicantUid ||
    userProfile?.uid ||
    workspace?.ownerId ||
    params.fallbackUid ||
    '';

  const applicantEmail = normalizeEmail(
    license?.ownerEmail ||
      decoded.meta.applicantEmail ||
      userProfile?.email ||
      params.fallbackEmail ||
      ''
  );

  const applicantName = (
    decoded.meta.applicantName ||
    userProfile?.displayName ||
    workspace?.ownerName ||
    params.fallbackName ||
    applicantEmail.split('@')[0] ||
    'مستخدم رصد'
  ).trim();

  const applicantPhone = (decoded.meta.applicantPhone || userProfile?.phone || '').trim();
  const workspaceId =
    license?.workspaceId ||
    decoded.meta.workspaceId ||
    userProfile?.activeWorkspaceId ||
    workspace?.id ||
    (applicantUid ? `ws_${applicantUid.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48)}` : '');

  const workspaceName = (
    decoded.meta.workspaceName ||
    workspace?.name ||
    `مساحة عمل ${applicantName}`
  ).trim();

  const requestedPlanId: SubscriptionPlanId =
    license?.planId ||
    (decoded.meta.requestedPlanId as SubscriptionPlanId | undefined) ||
    (isPermanentPlatformOwnerEmail(applicantEmail) ? 'owner_permanent' : 'trial');

  const status: LicenseStatus = isPermanentPlatformOwnerEmail(applicantEmail)
    ? 'active'
    : license?.status ||
      (params.memberStatus === 'suspended'
        ? 'suspended'
        : isPendingRegistrationProfileMarker(userProfile?.jobTitle, params.memberStatus)
        ? 'pending'
        : 'active');

  let requestedAtIso = decoded.meta.requestedAtIso || '';
  if (!requestedAtIso && license?.createdAt) {
    try {
      requestedAtIso = parseDateInput(license.createdAt).toISOString();
    } catch {
      requestedAtIso = new Date().toISOString();
    }
  }
  if (!requestedAtIso) {
    requestedAtIso = new Date().toISOString();
  }

  const source: RegistrationRequestMetadata['source'] =
    params.sourceOverride ||
    (license ? 'account_licenses' : 'workspace_member_marker');

  return {
    applicantUid,
    applicantName,
    applicantEmail,
    applicantPhone,
    workspaceId,
    workspaceName,
    requestedPlanId,
    status,
    requestedAtIso,
    source,
    notes:
      decoded.cleanNotes ||
      (status === 'pending'
        ? 'طلب تسجيل عميل جديد بانتظار مراجعة واعتماد إدارة المنصة.'
        : status === 'suspended'
        ? 'تم إيقاف الحساب مؤقتًا من قِبل إدارة المنصة.'
        : 'الحساب معتمد ونشط.'),
  };
}

export interface AccountAccessGateEvaluation {
  gateStatus: Exclude<AccountApprovalGateStatus, 'checking'>;
  canAccessWorkScreens: boolean;
  isPermanentOwner: boolean;
  isExistingGrandfatheredAccount: boolean;
  isNewPendingAccount: boolean;
  reasonCode: AccountApprovalReasonCode;
  statusLabelAr: string;
  statusDescriptionAr: string;
}

/**
 * تقييم بوابة الدخول لحساب المستخدم (المرحلة الثانية — نظام طلبات التسجيل والموافقة):
 * 1. الحسابان الدائمان لمالكي المنصة (am1075022@gmail.com و ahah26@gmail.com / ahah26h@gmail.com):
 *    صلاحيات كاملة ومجانية مدى الحياة دون انتظار موافقة.
 * 2. الحسابات الجديدة المسجلة ذاتيًا:
 *    تدخل في حالة انتظار الموافقة (pending_approval) وتُمنع من شاشات العمل حتى اعتمادها.
 * 3. الحسابات الحالية القائمة قبل هذه المرحلة (وأعضاء الفرق المدعوون لمساحات قائمة):
 *    يُسمح لها بالعمل الطبيعي (legacy_active / approved) دون حجب أو ترحيل بيانات ودون فرض انتهاء الاشتراك في هذه المرحلة.
 */
export function evaluateAccountAccessGate(params: {
  authCandidate: PlatformOwnerAuthCandidate | null | undefined;
  isNewSelfRegistration: boolean;
  existingUserProfile?: {
    uid?: string;
    email?: string;
    displayName?: string;
    phone?: string;
    jobTitle?: string;
    activeWorkspaceId?: string;
  } | null;
  existingOwnerMember?: {
    role?: string;
    status?: string;
  } | null;
  isInvitedTeamMember?: boolean;
  invitedMemberStatus?: 'active' | 'invited' | 'suspended' | null;
  accountLicense?: AccountLicense | null;
  /** في المرحلة الحالية (2-B) يظل false لعدم فرض انتهاء الاشتراك على الحسابات الحالية */
  enforceSubscriptionExpiryOnExisting?: boolean;
  referenceDate?: unknown;
}): AccountAccessGateEvaluation {
  const ownerVerification = verifyPlatformOwnerIdentity(params.authCandidate);

  // 1. المالكون الدائمون للمنصة (معفون دائمًا ومجانيون مدى الحياة)
  if (ownerVerification.isVerifiedOwner) {
    return {
      gateStatus: 'approved',
      canAccessWorkScreens: true,
      isPermanentOwner: true,
      isExistingGrandfatheredAccount: false,
      isNewPendingAccount: false,
      reasonCode: 'permanent_owner',
      statusLabelAr: 'مالك منصة دائم (معتمد مدى الحياة)',
      statusDescriptionAr:
        'حساب مالك منصة دائم وموثق بصلاحيات إدارية وميدانية كاملة ومجانية مدى الحياة.',
    };
  }

  // 2. إذا وجدت وثيقة ترخيص صريحة في /account_licenses/{workspaceId}
  if (params.accountLicense) {
    if (params.accountLicense.status === 'pending') {
      return {
        gateStatus: 'pending_approval',
        canAccessWorkScreens: false,
        isPermanentOwner: false,
        isExistingGrandfatheredAccount: false,
        isNewPendingAccount: true,
        reasonCode: 'existing_pending_request',
        statusLabelAr: 'بانتظار موافقة إدارة المنصة',
        statusDescriptionAr:
          'تم استلام طلب تسجيل حسابك بنجاح، وهو قيد المراجعة والاعتماد من قِبل إدارة منصة رَصْد.',
      };
    }

    if (params.accountLicense.status === 'suspended') {
      return {
        gateStatus: 'suspended',
        canAccessWorkScreens: false,
        isPermanentOwner: false,
        isExistingGrandfatheredAccount: false,
        isNewPendingAccount: false,
        reasonCode: 'account_suspended',
        statusLabelAr: 'الحساب موقوف مؤقتًا',
        statusDescriptionAr:
          'تم إيقاف هذا الحساب مؤقتًا من قِبل إدارة المنصة مع حفظ جميع بياناته. يرجى التواصل مع الإدارة لإعادة التفعيل.',
      };
    }

    const licenseState = evaluateLicenseState(
      params.accountLicense,
      params.referenceDate ?? new Date()
    );

    if (licenseState.isExpired && params.enforceSubscriptionExpiryOnExisting === true) {
      return {
        gateStatus: 'suspended',
        canAccessWorkScreens: false,
        isPermanentOwner: false,
        isExistingGrandfatheredAccount: false,
        isNewPendingAccount: false,
        reasonCode: 'account_suspended',
        statusLabelAr: 'انتهت مدة الاشتراك',
        statusDescriptionAr: 'انتهت فترة الاشتراك المحددة للحساب مع بقاء جميع البيانات محفوظة.',
      };
    }

    return {
      gateStatus: 'approved',
      canAccessWorkScreens: true,
      isPermanentOwner: false,
      isExistingGrandfatheredAccount: false,
      isNewPendingAccount: false,
      reasonCode: licenseState.isExpired ? 'expired_license_not_enforced_yet' : 'active_license',
      statusLabelAr: 'حساب معتمد ونشط',
      statusDescriptionAr: 'الحساب معتمد ومصرح له بالوصول إلى شاشات العمل.',
    };
  }

  // 3. عضو فريق مدعو إلى مساحة عمل قائمة
  if (params.isInvitedTeamMember) {
    if (params.invitedMemberStatus === 'suspended') {
      return {
        gateStatus: 'suspended',
        canAccessWorkScreens: false,
        isPermanentOwner: false,
        isExistingGrandfatheredAccount: false,
        isNewPendingAccount: false,
        reasonCode: 'account_suspended',
        statusLabelAr: 'عضوية الفريق موقوفة',
        statusDescriptionAr: 'تم إيقاف عضويتك في مساحة العمل من قِبل مدير الفريق.',
      };
    }

    return {
      gateStatus: 'approved',
      canAccessWorkScreens: true,
      isPermanentOwner: false,
      isExistingGrandfatheredAccount: false,
      isNewPendingAccount: false,
      reasonCode: 'invited_team_member',
      statusLabelAr: 'عضو فريق معتمد',
      statusDescriptionAr: 'عضو فريق مرتبط بمساحة عمل قائمة.',
    };
  }

  // 4. تسجيل ذاتي لحساب عميل جديد لم يكن موجودًا من قبل
  if (params.isNewSelfRegistration) {
    return {
      gateStatus: 'pending_approval',
      canAccessWorkScreens: false,
      isPermanentOwner: false,
      isExistingGrandfatheredAccount: false,
      isNewPendingAccount: true,
      reasonCode: 'new_account_pending_approval',
      statusLabelAr: 'بانتظار موافقة إدارة المنصة',
      statusDescriptionAr:
        'تم تسجيل حسابك الجديد وإرسال طلب التفعيل إلى إدارة المنصة. ستُفتح شاشات العمل فور الموافقة على الطلب.',
    };
  }

  // 5. حساب سجل طلبًا سابقًا ولا يزال يحمل علامة انتظار الموافقة
  if (
    isPendingRegistrationProfileMarker(
      params.existingUserProfile?.jobTitle,
      params.existingOwnerMember?.status
    )
  ) {
    return {
      gateStatus: 'pending_approval',
      canAccessWorkScreens: false,
      isPermanentOwner: false,
      isExistingGrandfatheredAccount: false,
      isNewPendingAccount: true,
      reasonCode: 'existing_pending_request',
      statusLabelAr: 'بانتظار موافقة إدارة المنصة',
      statusDescriptionAr:
        'طلب تسجيل حسابك لا يزال قيد المراجعة وبانتظار موافقة إدارة المنصة قبل فتح شاشات العمل.',
    };
  }

  // 6. حساب موقوف صراحةً في سجل العضوية
  if (params.existingOwnerMember?.status === 'suspended') {
    return {
      gateStatus: 'suspended',
      canAccessWorkScreens: false,
      isPermanentOwner: false,
      isExistingGrandfatheredAccount: false,
      isNewPendingAccount: false,
      reasonCode: 'account_suspended',
      statusLabelAr: 'الحساب موقوف مؤقتًا',
      statusDescriptionAr: 'تم إيقاف الحساب مؤقتًا مع الاحتفاظ الكامل بالبيانات.',
    };
  }

  // 7. الحسابات الحالية القائمة قبل هذه المرحلة (يُسمح لها بالعمل دون منع أو ترحيل بيانات ودون فرض انتهاء الاشتراك)
  return {
    gateStatus: 'legacy_active',
    canAccessWorkScreens: true,
    isPermanentOwner: false,
    isExistingGrandfatheredAccount: true,
    isNewPendingAccount: false,
    reasonCode: 'grandfathered_existing_account',
    statusLabelAr: 'حساب حالي نشط',
    statusDescriptionAr:
      'حساب عميل حالي قائم يعمل بكامل صلاحياته المعتادة دون تغيير بياناته أو فرض انتهاء الاشتراك في هذه المرحلة.',
  };
}

// ============================================================================
// المرحلة الثالثة (2-C): لوحة إدارة منصة «رَصْد» والتحقق الصارم من الصلاحيات الإدارية
// ============================================================================

export interface PlatformOperationAuthResult {
  allowed: boolean;
  actorRole: 'permanent_owner' | 'platform_staff' | 'unauthorized';
  ownerRole: PlatformOwnerRole | null;
  operation: PlatformAdminOperation;
  denialReason:
    | null
    | 'unauthenticated'
    | 'not_owner_or_active_staff'
    | 'owner_only_operation'
    | 'owner_only_pending_request'
    | 'staff_missing_permission'
    | 'staff_missing_package_permission'
    | 'cannot_modify_permanent_owner';
  messageAr: string;
}

/**
 * بوابة التحقق الصارم من صلاحية تنفيذ أي عملية في لوحة إدارة منصة «رَصْد»
 * - قبول أو رفض طلبات تسجيل العملاء الجدد (decide_registration_request) حصري للمالكين الدائمين فقط.
 * - إدارة مساعدي المنصة وصلاحياتهم (manage_platform_staff) حصرية للمالكين الدائمين فقط.
 * - لا يجوز لأي عملية (سواء من مالك أو مساعد) تعليق أو رفض أو المساس بصلاحيات حسابَي المالكين الدائمين.
 * - مساعد المنصة النشط يعمل فقط ضمن حدود التفويض المحدد له (canViewRequests, canApproveAndRenew, canManagePackages).
 */
export function authorizePlatformOperation(params: {
  actorAuth: PlatformOwnerAuthCandidate | null | undefined;
  actorStaffRecord?: PlatformStaff | null;
  operation: PlatformAdminOperation;
  targetOwnerEmail?: string | null;
  targetCurrentStatus?: LicenseStatus | null;
  changingPackageOrMaxMembers?: boolean;
}): PlatformOperationAuthResult {
  const { actorAuth, actorStaffRecord, operation, targetOwnerEmail, targetCurrentStatus } = params;

  if (!actorAuth || !actorAuth.uid) {
    return {
      allowed: false,
      actorRole: 'unauthorized',
      ownerRole: null,
      operation,
      denialReason: 'unauthenticated',
      messageAr: 'رفض أمني: يجب تسجيل الدخول بحساب موثق للوصول إلى عمليات إدارة المنصة.',
    };
  }

  // حماية سيادية لحسابَي المالكين الدائمين ضد الإيقاف أو الرفض أو تقليص الصلاحيات
  if (
    targetOwnerEmail &&
    isPermanentPlatformOwnerEmail(targetOwnerEmail) &&
    (operation === 'suspend_subscription' || operation === 'decide_registration_request')
  ) {
    return {
      allowed: false,
      actorRole: 'unauthorized',
      ownerRole: null,
      operation,
      denialReason: 'cannot_modify_permanent_owner',
      messageAr:
        'رفض أمني إلزامي: حسابا المالكين الدائمين للمنصة يتمتعان بصلاحيات كاملة ومجانية مدى الحياة ولا يجوز تعليقهما أو رفضهما.',
    };
  }

  // 1. فحص ما إذا كان المنفذ أحد المالكين الدائمين الموثقين
  const ownerCheck = verifyPlatformOwnerIdentity(actorAuth);
  if (ownerCheck.isVerifiedOwner) {
    return {
      allowed: true,
      actorRole: 'permanent_owner',
      ownerRole: ownerCheck.ownerRole,
      operation,
      denialReason: null,
      messageAr: 'مصرح به بصلاحية مالك المنصة الدائم.',
    };
  }

  // 2. فحص ما إذا كان المنفذ مساعد منصة نشطًا ومطابقًا لمعرف الجلسة الموثقة
  const isStaffMatch =
    actorStaffRecord &&
    actorStaffRecord.status === 'active' &&
    actorStaffRecord.uid === actorAuth.uid;

  if (!isStaffMatch) {
    return {
      allowed: false,
      actorRole: 'unauthorized',
      ownerRole: null,
      operation,
      denialReason: 'not_owner_or_active_staff',
      messageAr: 'رفض أمني: هذا الحساب غير مخول بالوصول إلى لوحة إدارة منصة رَصْد.',
    };
  }

  // 3. منع مساعد المنصة من المساس بحسابات المالكين الدائمين تحت أي ظرف
  if (targetOwnerEmail && isPermanentPlatformOwnerEmail(targetOwnerEmail)) {
    return {
      allowed: false,
      actorRole: 'platform_staff',
      ownerRole: null,
      operation,
      denialReason: 'cannot_modify_permanent_owner',
      messageAr: 'رفض أمني: لا يملك مساعد المنصة صلاحية تعديل حسابات المالكين الدائمين.',
    };
  }

  // 4. العمليات الحصرية للمالكين الدائمين فقط (قبول/رفض طلبات التسجيل الأولية، وإدارة مساعدي المنصة)
  if (operation === 'decide_registration_request' || operation === 'manage_platform_staff') {
    return {
      allowed: false,
      actorRole: 'platform_staff',
      ownerRole: null,
      operation,
      denialReason: 'owner_only_operation',
      messageAr:
        operation === 'decide_registration_request'
          ? 'رفض أمني: قبول أو رفض طلبات تسجيل العملاء الجدد حصري لمالكي المنصة الدائمين فقط.'
          : 'رفض أمني: إضافة أو تعديل صلاحيات مساعدي المنصة حصري لمالكي المنصة الدائمين فقط.',
    };
  }

  // منع التفاف مساعد المنصة على طلب تسجيل في حالة pending عبر إجراءات الاشتراك
  if (targetCurrentStatus === 'pending') {
    return {
      allowed: false,
      actorRole: 'platform_staff',
      ownerRole: null,
      operation,
      denialReason: 'owner_only_pending_request',
      messageAr:
        'رفض أمني: الحساب لا يزال في مرحلة طلب التسجيل الأولي (بانتظار الموافقة)، واعتماده حصري لمالكي المنصة الدائمين فقط.',
    };
  }

  // 5. التحقق من الأذونات المفوضة لمساعد المنصة بحسب العملية
  if (operation === 'view_admin_dashboard') {
    const canView =
      checkPlatformStaffPermission(actorStaffRecord, 'canViewRequests') ||
      checkPlatformStaffPermission(actorStaffRecord, 'canApproveAndRenew') ||
      checkPlatformStaffPermission(actorStaffRecord, 'canManagePackages');
    if (!canView) {
      return {
        allowed: false,
        actorRole: 'platform_staff',
        ownerRole: null,
        operation,
        denialReason: 'staff_missing_permission',
        messageAr: 'رفض أمني: لا يملك حساب المساعد أي صلاحية مفوضة لعرض لوحة الإدارة.',
      };
    }
    return {
      allowed: true,
      actorRole: 'platform_staff',
      ownerRole: null,
      operation,
      denialReason: null,
      messageAr: 'مصرح به كمساعد منصة مفوض.',
    };
  }

  if (operation === 'manage_packages') {
    if (!checkPlatformStaffPermission(actorStaffRecord, 'canManagePackages')) {
      return {
        allowed: false,
        actorRole: 'platform_staff',
        ownerRole: null,
        operation,
        denialReason: 'staff_missing_package_permission',
        messageAr: 'رفض أمني: لا يملك مساعد المنصة تفويض إدارة الباقات وحدود الفرق (canManagePackages).',
      };
    }
    return {
      allowed: true,
      actorRole: 'platform_staff',
      ownerRole: null,
      operation,
      denialReason: null,
      messageAr: 'مصرح به لإدارة الباقات بموجب التفويض.',
    };
  }

  if (
    operation === 'activate_subscription' ||
    operation === 'renew_subscription' ||
    operation === 'suspend_subscription' ||
    operation === 'reactivate_subscription'
  ) {
    if (!checkPlatformStaffPermission(actorStaffRecord, 'canApproveAndRenew')) {
      return {
        allowed: false,
        actorRole: 'platform_staff',
        ownerRole: null,
        operation,
        denialReason: 'staff_missing_permission',
        messageAr:
          'رفض أمني: لا يملك مساعد المنصة تفويض تفعيل أو تجديد أو تعليق الاشتراكات (canApproveAndRenew).',
      };
    }
    if (
      params.changingPackageOrMaxMembers &&
      !checkPlatformStaffPermission(actorStaffRecord, 'canManagePackages')
    ) {
      return {
        allowed: false,
        actorRole: 'platform_staff',
        ownerRole: null,
        operation,
        denialReason: 'staff_missing_package_permission',
        messageAr:
          'رفض أمني: تغيير نوع الباقة أو الحد الأقصى لأعضاء الفريق يتطلب تفويض إدارة الباقات (canManagePackages).',
      };
    }
    return {
      allowed: true,
      actorRole: 'platform_staff',
      ownerRole: null,
      operation,
      denialReason: null,
      messageAr: 'مصرح به لإدارة اشتراك العميل بموجب التفويض.',
    };
  }

  return {
    allowed: false,
    actorRole: 'unauthorized',
    ownerRole: null,
    operation,
    denialReason: 'staff_missing_permission',
    messageAr: 'رفض أمني: عملية غير مصرح بها.',
  };
}

/**
 * فرض التحقق الأمني برمجيًا ورمي خطأ صريح عند عدم توفر الصلاحية (لا يعتمد على إخفاء أزرار الواجهة)
 */
export function assertPlatformOperationAuthorized(params: {
  actorAuth: PlatformOwnerAuthCandidate | null | undefined;
  actorStaffRecord?: PlatformStaff | null;
  operation: PlatformAdminOperation;
  targetOwnerEmail?: string | null;
  targetCurrentStatus?: LicenseStatus | null;
  changingPackageOrMaxMembers?: boolean;
}): PlatformOperationAuthResult {
  const res = authorizePlatformOperation(params);
  if (!res.allowed) {
    throw new Error(res.messageAr);
  }
  return res;
}

export interface RegistrationDecisionResult {
  decision: 'approve' | 'reject';
  updatedLicense: AccountLicense;
  userProfilePatch: { jobTitle: string };
  ownerMemberPatch: { status: 'active' | 'suspended' };
  auditSummary: string;
}

/**
 * بناء انتقال قبول أو رفض طلب تسجيل عميل جديد (حصري للمالكين الدائمين فقط)
 */
export function buildRegistrationDecisionTransition(params: {
  actorAuth: PlatformOwnerAuthCandidate | null | undefined;
  actorStaffRecord?: PlatformStaff | null;
  request: RegistrationRequestMetadata;
  decision: 'approve' | 'reject';
  approvedPlanId?: SubscriptionPlanId;
  customDurationDays?: number | null;
  maxMembers?: number;
  decisionNotes?: string;
  packagesMap?: Record<SubscriptionPlanId, SubscriptionPackage>;
  now?: unknown;
}): RegistrationDecisionResult {
  assertPlatformOperationAuthorized({
    actorAuth: params.actorAuth,
    actorStaffRecord: params.actorStaffRecord,
    operation: 'decide_registration_request',
    targetOwnerEmail: params.request.applicantEmail,
    targetCurrentStatus: 'pending',
  });

  const pkgs = params.packagesMap || DEFAULT_SUBSCRIPTION_PACKAGES;
  const nowDate = params.now ? parseDateInput(params.now) : new Date();
  const nowTimestamp = Timestamp.fromDate(nowDate);
  const normalizedApplicantEmail = normalizeEmail(params.request.applicantEmail);

  if (isPermanentPlatformOwnerEmail(normalizedApplicantEmail)) {
    throw new Error(
      'حسابات مالكي المنصة الدائمين معتمدة تلقائيًا مدى الحياة ولا تخضع لقرارات قبول أو رفض طلبات التسجيل.'
    );
  }

  const chosenPlanId: SubscriptionPlanId =
    params.approvedPlanId && params.approvedPlanId !== 'owner_permanent'
      ? params.approvedPlanId
      : params.request.requestedPlanId && params.request.requestedPlanId !== 'owner_permanent'
      ? params.request.requestedPlanId
      : 'monthly';

  const pkg = pkgs[chosenPlanId] || DEFAULT_SUBSCRIPTION_PACKAGES.monthly;
  const effectiveMaxMembers = Math.max(
    1,
    Math.min(10, Math.round(params.maxMembers ?? pkg.defaultMaxMembers))
  );

  if (params.decision === 'approve') {
    const period = calculateSubscriptionPeriod({
      planId: chosenPlanId,
      startDate: nowDate,
      customDurationDays: params.customDurationDays ?? pkg.durationDays,
    });

    const humanNote =
      (params.decisionNotes || '').trim() ||
      `تمت الموافقة على طلب التسجيل وتفعيل (${pkg.nameAr}) بواسطة مالك المنصة.`;

    const encodedNotes = encodeRegistrationMetaIntoNotes(humanNote, {
      applicantUid: params.request.applicantUid,
      applicantName: params.request.applicantName,
      applicantEmail: normalizedApplicantEmail,
      applicantPhone: params.request.applicantPhone,
      workspaceId: params.request.workspaceId,
      workspaceName: params.request.workspaceName,
      requestedPlanId: chosenPlanId,
      requestedAtIso: params.request.requestedAtIso,
    });

    const updatedLicense: AccountLicense = {
      id: params.request.workspaceId,
      workspaceId: params.request.workspaceId,
      ownerId: params.request.applicantUid,
      ownerEmail: normalizedApplicantEmail,
      planId: chosenPlanId,
      status: 'active',
      startsAt: period.startsAtTimestamp,
      expiresAt: period.expiresAtTimestamp,
      maxMembers: effectiveMaxMembers,
      notes: encodedNotes,
      createdAt: nowTimestamp,
      updatedAt: nowTimestamp,
    };

    return {
      decision: 'approve',
      updatedLicense,
      userProfilePatch: { jobTitle: 'مدير مساحة العمل' },
      ownerMemberPatch: { status: 'active' },
      auditSummary: `[إدارة المنصة] قبول طلب تسجيل العميل (${params.request.applicantName} - ${normalizedApplicantEmail}) وتفعيل ${pkg.nameAr} بحد ${effectiveMaxMembers} أعضاء`,
    };
  }

  // في حالة الرفض (reject)
  const period = calculateSubscriptionPeriod({
    planId: chosenPlanId,
    startDate: nowDate,
  });

  const rejectReason =
    (params.decisionNotes || '').trim() || 'تم رفض طلب التسجيل من قِبل مالك المنصة.';

  const encodedNotes = encodeRegistrationMetaIntoNotes(rejectReason, {
    applicantUid: params.request.applicantUid,
    applicantName: params.request.applicantName,
    applicantEmail: normalizedApplicantEmail,
    applicantPhone: params.request.applicantPhone,
    workspaceId: params.request.workspaceId,
    workspaceName: params.request.workspaceName,
    requestedPlanId: chosenPlanId,
    requestedAtIso: params.request.requestedAtIso,
  });

  const updatedLicense: AccountLicense = {
    id: params.request.workspaceId,
    workspaceId: params.request.workspaceId,
    ownerId: params.request.applicantUid,
    ownerEmail: normalizedApplicantEmail,
    planId: chosenPlanId,
    status: 'suspended',
    startsAt: period.startsAtTimestamp,
    expiresAt: period.expiresAtTimestamp,
    maxMembers: effectiveMaxMembers,
    notes: encodedNotes,
    createdAt: nowTimestamp,
    updatedAt: nowTimestamp,
  };

  return {
    decision: 'reject',
    updatedLicense,
    userProfilePatch: { jobTitle: 'طلب تسجيل مرفوض' },
    ownerMemberPatch: { status: 'suspended' },
    auditSummary: `[إدارة المنصة] رفض طلب تسجيل العميل (${params.request.applicantName} - ${normalizedApplicantEmail}) — السبب: ${rejectReason}`,
  };
}

export interface ClientSubscriptionMutationResult {
  action: 'activate' | 'renew' | 'suspend' | 'reactivate';
  updatedLicense: AccountLicense;
  ownerMemberStatusPatch: 'active' | 'suspended';
  evaluation: EvaluatedLicenseState;
  dataPreserved: true;
  auditSummary: string;
}

/**
 * بناء انتقالات إدارة اشتراك العميل (تفعيل، تجديد، تعليق، إعادة تفعيل)
 * مع التحقق الصارم من صلاحية المنفذ (مالك دائم أو مساعد مفوض) والحفاظ الكامل على بيانات العميل.
 */
export function buildClientSubscriptionMutation(params: {
  actorAuth: PlatformOwnerAuthCandidate | null | undefined;
  actorStaffRecord?: PlatformStaff | null;
  action: 'activate' | 'renew' | 'suspend' | 'reactivate';
  workspaceId: string;
  ownerId: string;
  ownerEmail: string;
  ownerName?: string;
  existingLicense?: AccountLicense | null;
  planId?: SubscriptionPlanId;
  customDurationDays?: number | null;
  maxMembers?: number;
  notes?: string;
  packagesMap?: Record<SubscriptionPlanId, SubscriptionPackage>;
  now?: unknown;
}): ClientSubscriptionMutationResult {
  const operationMap: Record<typeof params.action, PlatformAdminOperation> = {
    activate: 'activate_subscription',
    renew: 'renew_subscription',
    suspend: 'suspend_subscription',
    reactivate: 'reactivate_subscription',
  };

  const normalizedOwnerEmail = normalizeEmail(params.ownerEmail);
  if (isPermanentPlatformOwnerEmail(normalizedOwnerEmail)) {
    if (params.action === 'suspend') {
      throw new Error(
        'رفض أمني إلزامي: لا يجوز تعليق أو إيقاف حساب أحد مالكي المنصة الدائمين.'
      );
    }
    const permLic = buildPermanentOwnerLicense({
      workspaceId: params.workspaceId,
      ownerId: params.ownerId,
      ownerEmail: normalizedOwnerEmail,
      now: params.now,
    });
    return {
      action: params.action,
      updatedLicense: permLic,
      ownerMemberStatusPatch: 'active',
      evaluation: evaluateLicenseState(permLic, params.now),
      dataPreserved: true,
      auditSummary: `[إدارة المنصة] تأكيد العضوية الدائمة المجانية مدى الحياة لمالك المنصة (${normalizedOwnerEmail})`,
    };
  }

  const pkgs = params.packagesMap || DEFAULT_SUBSCRIPTION_PACKAGES;
  const existing = params.existingLicense || null;

  const targetPlanId: SubscriptionPlanId =
    params.planId && params.planId !== 'owner_permanent'
      ? params.planId
      : existing?.planId && existing.planId !== 'owner_permanent'
      ? existing.planId
      : 'monthly';

  const pkg = pkgs[targetPlanId] || DEFAULT_SUBSCRIPTION_PACKAGES.monthly;
  const targetMaxMembers = Math.max(
    1,
    Math.min(10, Math.round(params.maxMembers ?? existing?.maxMembers ?? pkg.defaultMaxMembers))
  );

  const isChangingPlanOrMembers = Boolean(
    existing &&
      ((params.planId && params.planId !== existing.planId) ||
        (params.maxMembers !== undefined && targetMaxMembers !== existing.maxMembers))
  );

  assertPlatformOperationAuthorized({
    actorAuth: params.actorAuth,
    actorStaffRecord: params.actorStaffRecord,
    operation: operationMap[params.action],
    targetOwnerEmail: normalizedOwnerEmail,
    targetCurrentStatus: existing?.status || null,
    changingPackageOrMaxMembers: isChangingPlanOrMembers,
  });

  const nowDate = params.now ? parseDateInput(params.now) : new Date();
  const nowTimestamp = Timestamp.fromDate(nowDate);
  const createdTimestamp = existing?.createdAt
    ? Timestamp.fromDate(parseDateInput(existing.createdAt, nowDate))
    : nowTimestamp;
  const clientLabel = params.ownerName
    ? `${params.ownerName} (${normalizedOwnerEmail})`
    : normalizedOwnerEmail;

  if (params.action === 'activate') {
    const period = calculateSubscriptionPeriod({
      planId: targetPlanId,
      startDate: nowDate,
      customDurationDays: params.customDurationDays ?? pkg.durationDays,
    });
    const cleanNote =
      (params.notes || '').trim() ||
      `تم تفعيل اشتراك العميل على (${pkg.nameAr}) بحد ${targetMaxMembers} أعضاء.`;
    const updatedLicense: AccountLicense = {
      id: params.workspaceId,
      workspaceId: params.workspaceId,
      ownerId: params.ownerId,
      ownerEmail: normalizedOwnerEmail,
      planId: targetPlanId,
      status: 'active',
      startsAt: period.startsAtTimestamp,
      expiresAt: period.expiresAtTimestamp,
      maxMembers: targetMaxMembers,
      notes: cleanNote.slice(0, 950),
      createdAt: createdTimestamp,
      updatedAt: nowTimestamp,
    };
    return {
      action: 'activate',
      updatedLicense,
      ownerMemberStatusPatch: 'active',
      evaluation: evaluateLicenseState(updatedLicense, nowDate),
      dataPreserved: true,
      auditSummary: `[إدارة المنصة] تفعيل اشتراك العميل ${clientLabel} — الباقة: ${pkg.nameAr} — الحد: ${targetMaxMembers} أعضاء`,
    };
  }

  if (params.action === 'renew') {
    const renewal = calculateSubscriptionRenewal({
      planId: targetPlanId,
      currentStartsAt: existing?.startsAt ?? nowDate,
      currentExpiresAt: existing?.expiresAt ?? nowDate,
      renewalDate: nowDate,
      customDurationDays: params.customDurationDays ?? pkg.durationDays,
    });
    const cleanNote =
      (params.notes || '').trim() ||
      `تم تجديد الاشتراك على (${pkg.nameAr}) حتى ${renewal.expiresAtIso.slice(0, 10)}.`;
    const updatedLicense: AccountLicense = {
      id: params.workspaceId,
      workspaceId: params.workspaceId,
      ownerId: params.ownerId,
      ownerEmail: normalizedOwnerEmail,
      planId: targetPlanId,
      status: 'active',
      startsAt: renewal.startsAtTimestamp,
      expiresAt: renewal.expiresAtTimestamp,
      maxMembers: targetMaxMembers,
      notes: cleanNote.slice(0, 950),
      createdAt: createdTimestamp,
      updatedAt: nowTimestamp,
    };
    return {
      action: 'renew',
      updatedLicense,
      ownerMemberStatusPatch: 'active',
      evaluation: evaluateLicenseState(updatedLicense, nowDate),
      dataPreserved: true,
      auditSummary: `[إدارة المنصة] تجديد اشتراك العميل ${clientLabel} — الباقة: ${pkg.nameAr} — ينتهي في: ${
        renewal.isLifetime ? 'مدى الحياة' : renewal.expiresAtIso.slice(0, 10)
      }`,
    };
  }

  if (params.action === 'suspend') {
    const startsTs = existing?.startsAt
      ? Timestamp.fromDate(parseDateInput(existing.startsAt, nowDate))
      : nowTimestamp;
    const expiresTs = existing?.expiresAt
      ? Timestamp.fromDate(parseDateInput(existing.expiresAt, nowDate))
      : nowTimestamp;
    const suspendReason =
      (params.notes || '').trim() ||
      'تم تعليق الاشتراك مؤقتًا من قِبل إدارة المنصة مع حفظ جميع بيانات العميل.';
    const updatedLicense: AccountLicense = {
      id: params.workspaceId,
      workspaceId: params.workspaceId,
      ownerId: params.ownerId,
      ownerEmail: normalizedOwnerEmail,
      planId: targetPlanId,
      status: 'suspended',
      startsAt: startsTs,
      expiresAt: expiresTs,
      maxMembers: targetMaxMembers,
      notes: suspendReason.slice(0, 950),
      createdAt: createdTimestamp,
      updatedAt: nowTimestamp,
    };
    return {
      action: 'suspend',
      updatedLicense,
      ownerMemberStatusPatch: 'suspended',
      evaluation: evaluateLicenseState(updatedLicense, nowDate),
      dataPreserved: true,
      auditSummary: `[إدارة المنصة] تعليق اشتراك العميل ${clientLabel} مع حفظ البيانات — السبب: ${suspendReason}`,
    };
  }

  // reactivate
  const existingExpiresDate = existing?.expiresAt
    ? parseDateInput(existing.expiresAt, nowDate)
    : nowDate;
  const needsFreshPeriod = existingExpiresDate.getTime() <= nowDate.getTime();
  const reactivatedPeriod = needsFreshPeriod
    ? calculateSubscriptionPeriod({
        planId: targetPlanId,
        startDate: nowDate,
        customDurationDays: params.customDurationDays ?? pkg.durationDays,
      })
    : {
        startsAtTimestamp: existing?.startsAt
          ? Timestamp.fromDate(parseDateInput(existing.startsAt, nowDate))
          : nowTimestamp,
        expiresAtTimestamp: Timestamp.fromDate(existingExpiresDate),
      };

  const reactivateNote =
    (params.notes || '').trim() || 'تمت إعادة تفعيل اشتراك العميل واستئناف الصلاحيات التشغيلية.';
  const updatedLicense: AccountLicense = {
    id: params.workspaceId,
    workspaceId: params.workspaceId,
    ownerId: params.ownerId,
    ownerEmail: normalizedOwnerEmail,
    planId: targetPlanId,
    status: 'active',
    startsAt: reactivatedPeriod.startsAtTimestamp,
    expiresAt: reactivatedPeriod.expiresAtTimestamp,
    maxMembers: targetMaxMembers,
    notes: reactivateNote.slice(0, 950),
    createdAt: createdTimestamp,
    updatedAt: nowTimestamp,
  };

  return {
    action: 'reactivate',
    updatedLicense,
    ownerMemberStatusPatch: 'active',
    evaluation: evaluateLicenseState(updatedLicense, nowDate),
    dataPreserved: true,
    auditSummary: `[إدارة المنصة] إعادة تفعيل اشتراك العميل ${clientLabel} (${pkg.nameAr})`,
  };
}

/**
 * التحقق وبناء تحديث باقة اشتراك (مع حماية باقة المالك الدائم والتحقق من حدود الأعضاء 1-10)
 */
export function validateAndBuildSubscriptionPackageUpdate(params: {
  actorAuth: PlatformOwnerAuthCandidate | null | undefined;
  actorStaffRecord?: PlatformStaff | null;
  planId: SubscriptionPlanId;
  existingPackage?: SubscriptionPackage;
  patch: {
    nameAr?: string;
    descriptionAr?: string;
    durationDays?: number | null;
    defaultMaxMembers?: number;
    priceAmount?: number;
    currency?: CurrencyCode;
    isActive?: boolean;
  };
}): { updatedPackage: SubscriptionPackage; auditSummary: string } {
  assertPlatformOperationAuthorized({
    actorAuth: params.actorAuth,
    actorStaffRecord: params.actorStaffRecord,
    operation: 'manage_packages',
  });

  if (params.planId === 'owner_permanent') {
    throw new Error(
      'رفض أمني إلزامي: باقة المالك الدائم (owner_permanent) محمية ولا تقبل التعديل أو التعطيل.'
    );
  }

  const basePkg = params.existingPackage || DEFAULT_SUBSCRIPTION_PACKAGES[params.planId];
  if (!basePkg) {
    throw new Error(`معرف الباقة غير موجود: ${params.planId}`);
  }

  const maxMembers =
    params.patch.defaultMaxMembers !== undefined
      ? Math.round(Number(params.patch.defaultMaxMembers))
      : basePkg.defaultMaxMembers;

  if (!Number.isFinite(maxMembers) || maxMembers < 1 || maxMembers > 10) {
    throw new Error('الحد الأقصى لأعضاء الفريق (maxMembers) يجب أن يكون بين 1 و 10 أعضاء.');
  }

  let durationDays: number | null = basePkg.durationDays;
  if (basePkg.isLifetime || params.planId === 'lifetime') {
    durationDays = null;
  } else if (params.patch.durationDays !== undefined && params.patch.durationDays !== null) {
    const parsedDuration = Math.round(Number(params.patch.durationDays));
    if (!Number.isFinite(parsedDuration) || parsedDuration < 1 || parsedDuration > 36500) {
      throw new Error('مدة الباقة بالأيام يجب أن تكون رقمًا صحيحًا بين يوم واحد و 36500 يوم.');
    }
    durationDays = parsedDuration;
  }

  const priceAmount =
    params.patch.priceAmount !== undefined
      ? Math.max(0, Number(params.patch.priceAmount) || 0)
      : basePkg.priceAmount;

  const nameAr = (params.patch.nameAr ?? basePkg.nameAr).trim();
  if (nameAr.length < 2 || nameAr.length > 120) {
    throw new Error('اسم الباقة يجب أن يتراوح بين حرفين و 120 حرفًا.');
  }

  const rawDescriptionAr =
    params.patch.descriptionAr !== undefined ? params.patch.descriptionAr : basePkg.descriptionAr;
  const descriptionAr = String(rawDescriptionAr ?? '').trim();
  if (descriptionAr.length < 2 || descriptionAr.length > 500) {
    throw new Error('وصف الباقة يجب أن يتراوح بين حرفين و 500 حرف.');
  }

  const currency: CurrencyCode = params.patch.currency || basePkg.currency;
  const isActive =
    params.patch.isActive !== undefined ? Boolean(params.patch.isActive) : basePkg.isActive;

  const updatedPackage: SubscriptionPackage = {
    ...basePkg,
    nameAr,
    descriptionAr,
    durationDays,
    defaultMaxMembers: maxMembers,
    priceAmount,
    currency,
    isActive,
  };

  return {
    updatedPackage,
    auditSummary: `[إدارة المنصة] تحديث باقة (${updatedPackage.nameAr}) — الحالة: ${
      updatedPackage.isActive ? 'مفعلة' : 'معطلة'
    } — المدة: ${
      updatedPackage.isLifetime ? 'مدى الحياة' : `${updatedPackage.durationDays} يوم`
    } — حد الفريق: ${updatedPackage.defaultMaxMembers} أعضاء`,
  };
}

/**
 * التحقق من أن معرف حساب مساعد المنصة (UID) ليس معرفًا اصطناعيًا مشتقًا من البريد الإلكتروني
 */
export function isSyntheticOrInvalidStaffUid(
  rawUid: string | null | undefined,
  email?: string | null
): { isInvalidOrSynthetic: boolean; reasonAr: string | null } {
  const trimmed = (rawUid || '').trim();
  if (!trimmed) {
    return {
      isInvalidOrSynthetic: true,
      reasonAr: 'يرجى إدخال معرف الحساب الحقيقي (Firebase UID) لموظف المنصة وعدم تركه فارغًا.',
    };
  }
  if (!/^[a-zA-Z0-9_-]{3,128}$/.test(trimmed)) {
    return {
      isInvalidOrSynthetic: true,
      reasonAr: 'صيغة معرف الحساب (UID) غير صالحة؛ يجب أن يتكون من أحرف أو أرقام إنجليزية (3 إلى 128 خانة) مطابقة لحساب Firebase.',
    };
  }
  const lowerUid = trimmed.toLowerCase();
  const emailPrefix = normalizeEmail(email || '')
    .split('@')[0]
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .toLowerCase();

  if (
    lowerUid.startsWith('synthetic_') ||
    lowerUid.startsWith('fake_') ||
    lowerUid.startsWith('temp_') ||
    lowerUid.startsWith('placeholder_') ||
    (emailPrefix.length >= 2 && lowerUid === `staff_${emailPrefix}`)
  ) {
    return {
      isInvalidOrSynthetic: true,
      reasonAr:
        'رفض أمني: لا يُسمح بحفظ معرف UID اصطناعي مشتق من البريد الإلكتروني. يجب إدخال معرف حساب Firebase الحقيقي للمستخدم.',
    };
  }

  return { isInvalidOrSynthetic: false, reasonAr: null };
}

/**
 * التحقق وبناء سجل مساعد إدارة المنصة (PlatformStaff) — حصري للمالكين الدائمين فقط
 */
export function validateAndBuildPlatformStaffRecord(params: {
  actorAuth: PlatformOwnerAuthCandidate | null | undefined;
  actorStaffRecord?: PlatformStaff | null;
  staffUid: string;
  email: string;
  displayName: string;
  status: 'active' | 'suspended';
  permissions: Partial<PlatformStaffPermissions>;
  verifiedUserRecord?: { uid: string; email?: string | null } | null;
  requireVerifiedUserMatch?: boolean;
}): { staffRecord: PlatformStaff; auditSummary: string } {
  assertPlatformOperationAuthorized({
    actorAuth: params.actorAuth,
    actorStaffRecord: params.actorStaffRecord,
    operation: 'manage_platform_staff',
  });

  const normalizedEmail = normalizeEmail(params.email);
  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    throw new Error('يرجى إدخال بريد إلكتروني صالح لمساعد المنصة.');
  }

  if (isPermanentPlatformOwnerEmail(normalizedEmail)) {
    throw new Error(
      'هذا البريد يعود لأحد مالكي المنصة الدائمين الذين يملكون صلاحيات كاملة تلقائيًا ولا يُضاف كمساعد مقيد.'
    );
  }

  const uidCheck = isSyntheticOrInvalidStaffUid(params.staffUid, normalizedEmail);
  if (uidCheck.isInvalidOrSynthetic) {
    throw new Error(uidCheck.reasonAr || 'معرف المستخدم (UID) لمساعد المنصة غير صالح.');
  }

  const cleanUid = params.staffUid.trim();

  if (params.requireVerifiedUserMatch) {
    if (!params.verifiedUserRecord || !params.verifiedUserRecord.uid) {
      throw new Error(
        `تعذر التحقق من وجود حساب Firebase حقيقي في المنصة يطابق المعرف (${cleanUid}) أو البريد (${normalizedEmail}). يجب أن يسجل الموظف دخوله في المنصة أولًا قبل تفويضه.`
      );
    }
    if (params.verifiedUserRecord.uid !== cleanUid) {
      throw new Error(
        `معرف الحساب المدخل (${cleanUid}) لا يطابق معرف حساب Firebase الحقيقي المسجل لهذا البريد (${params.verifiedUserRecord.uid}).`
      );
    }
    const verifiedRecordEmail = normalizeEmail(params.verifiedUserRecord.email || '');
    if (
      verifiedRecordEmail &&
      verifiedRecordEmail !== 'user@rasd.app' &&
      verifiedRecordEmail !== 'owner@rasd.app' &&
      verifiedRecordEmail !== normalizedEmail
    ) {
      throw new Error(
        `معرف الحساب (${cleanUid}) مسجل في قاعدة البيانات لبريد إلكتروني آخر (${verifiedRecordEmail}) ولا يطابق (${normalizedEmail}).`
      );
    }
  }

  const cleanName = (params.displayName || normalizedEmail.split('@')[0] || 'مساعد منصة')
    .trim()
    .slice(0, 120);
  if (cleanName.length < 2) {
    throw new Error('يرجى إدخال اسم واضح لمساعد المنصة (حرفين على الأقل).');
  }

  const safePermissions: PlatformStaffPermissions = {
    canViewRequests: Boolean(params.permissions.canViewRequests),
    canApproveAndRenew: Boolean(params.permissions.canApproveAndRenew),
    canManagePackages: Boolean(params.permissions.canManagePackages),
  };

  const staffRecord: PlatformStaff = {
    id: cleanUid,
    uid: cleanUid,
    email: normalizedEmail,
    displayName: cleanName,
    status: params.status === 'suspended' ? 'suspended' : 'active',
    permissions: safePermissions,
    assignedByUid: String(params.actorAuth?.uid || ''),
  };

  const permsList: string[] = [];
  if (safePermissions.canViewRequests) permsList.push('عرض الطلبات والعملاء');
  if (safePermissions.canApproveAndRenew) permsList.push('تجديد وتعليق الاشتراكات');
  if (safePermissions.canManagePackages) permsList.push('إدارة الباقات وحدود الفرق');

  return {
    staffRecord,
    auditSummary: `[إدارة المنصة] ${
      staffRecord.status === 'active' ? 'اعتماد/تحديث' : 'إيقاف'
    } مساعد المنصة (${cleanName} - ${normalizedEmail}) — الصلاحيات المفوضة: [${
      permsList.join('، ') || 'بلا صلاحيات'
    }]`,
  };
}

/**
 * تجميع سجل موحد لعميل ومساحة عمله وحالة ترخيصه دون تنفيذ أي ترحيل جماعي على الحسابات الحالية
 */
export function buildPlatformClientAccountSummary(params: {
  workspace?: Partial<Workspace> | null;
  userProfile?: Partial<UserProfile> | null;
  license?: AccountLicense | null;
  packagesMap?: Record<SubscriptionPlanId, SubscriptionPackage>;
  referenceDate?: unknown;
}): PlatformClientAccountSummary {
  const pkgs = params.packagesMap || DEFAULT_SUBSCRIPTION_PACKAGES;
  const refDate = params.referenceDate ? parseDateInput(params.referenceDate) : new Date();

  const ownerEmail = normalizeEmail(
    params.license?.ownerEmail || params.userProfile?.email || ''
  );
  const isOwner = isPermanentPlatformOwnerEmail(ownerEmail);

  const ownerId =
    params.license?.ownerId ||
    params.workspace?.ownerId ||
    params.userProfile?.uid ||
    '';

  const workspaceId =
    params.license?.workspaceId ||
    params.workspace?.id ||
    params.userProfile?.activeWorkspaceId ||
    (ownerId ? `ws_${ownerId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48)}` : '');

  const ownerName = (
    params.workspace?.ownerName ||
    params.userProfile?.displayName ||
    ownerEmail.split('@')[0] ||
    'عميل رصد'
  ).trim();

  const workspaceName = (params.workspace?.name || `مساحة عمل ${ownerName}`).trim();
  const currentMembersCount =
    typeof params.workspace?.memberCount === 'number'
      ? params.workspace.memberCount
      : Array.isArray(params.workspace?.memberUids)
      ? params.workspace.memberUids.length
      : 1;

  if (isOwner) {
    return {
      workspaceId: workspaceId || `ws_${ownerEmail.split('@')[0]}`,
      workspaceName,
      ownerId: ownerId || `owner_${ownerEmail.split('@')[0]}`,
      ownerName,
      ownerEmail,
      ownerPhone: params.userProfile?.phone || '',
      regionName: params.workspace?.regionName || 'عدن',
      defaultCurrency: params.workspace?.defaultCurrency || 'YER',
      currentMembersCount,
      maxMembers: 10,
      planId: 'owner_permanent',
      planNameAr: pkgs.owner_permanent.nameAr,
      licenseStatus: 'active',
      effectiveStatus: 'active',
      isPermanentOwner: true,
      isLifetime: true,
      isGrandfatheredLegacy: false,
      isExpired: false,
      remainingDays: null,
      startsAtIso: refDate.toISOString(),
      expiresAtIso: LIFETIME_EXPIRY_ISO,
      notes: 'حساب مالك منصة دائم — معفي من الاشتراكات ومدد الانتهاء بصلاحيات كاملة مدى الحياة.',
      source: 'permanent_owner',
    };
  }

  if (params.license) {
    const evalState = evaluateLicenseState(params.license, refDate);
    const pkg = pkgs[params.license.planId] || DEFAULT_SUBSCRIPTION_PACKAGES.monthly;
    const decoded = decodeRegistrationMetaFromNotes(params.license.notes);
    return {
      workspaceId,
      workspaceName: decoded.meta.workspaceName || workspaceName,
      ownerId,
      ownerName: decoded.meta.applicantName || ownerName,
      ownerEmail,
      ownerPhone: decoded.meta.applicantPhone || params.userProfile?.phone || '',
      regionName: params.workspace?.regionName || 'عدن',
      defaultCurrency: params.workspace?.defaultCurrency || 'YER',
      currentMembersCount,
      maxMembers: params.license.maxMembers,
      planId: params.license.planId,
      planNameAr: pkg.nameAr,
      licenseStatus: params.license.status,
      effectiveStatus: evalState.effectiveStatus,
      isPermanentOwner: false,
      isLifetime: evalState.isLifetime,
      isGrandfatheredLegacy: false,
      isExpired: evalState.isExpired,
      remainingDays: evalState.remainingDays,
      startsAtIso: evalState.startsAtIso,
      expiresAtIso: evalState.expiresAtIso,
      notes: decoded.cleanNotes || params.license.notes || '',
      source: 'account_licenses',
    };
  }

  // حساب عميل حالي قائم قبل نظام التراخيص (أو طلب تسجيل يحمل علامة الانتظار في users)
  const isPendingMarker = isPendingRegistrationProfileMarker(params.userProfile?.jobTitle);
  return {
    workspaceId,
    workspaceName,
    ownerId,
    ownerName,
    ownerEmail,
    ownerPhone: params.userProfile?.phone || '',
    regionName: params.workspace?.regionName || 'عدن',
    defaultCurrency: params.workspace?.defaultCurrency || 'YER',
    currentMembersCount,
    maxMembers: 10,
    planId: isPendingMarker ? 'trial' : 'annual',
    planNameAr: isPendingMarker
      ? 'طلب تسجيل جديد (بانتظار الموافقة)'
      : 'حساب عميل حالي قائم (قبل نظام التراخيص)',
    licenseStatus: isPendingMarker ? 'pending' : 'active',
    effectiveStatus: isPendingMarker ? 'pending' : 'active',
    isPermanentOwner: false,
    isLifetime: false,
    isGrandfatheredLegacy: !isPendingMarker,
    isExpired: false,
    remainingDays: null,
    startsAtIso: refDate.toISOString(),
    expiresAtIso: LIFETIME_EXPIRY_ISO,
    notes: isPendingMarker
      ? 'طلب تسجيل عميل جديد بانتظار موافقة مالك المنصة.'
      : 'حساب عميل حالي يعمل بكامل صلاحياته دون ترحيل قسري.',
    source: 'legacy_workspace',
  };
}

export interface TeamMemberLimitValidationResult {
  allowed: boolean;
  currentCount: number;
  effectiveMaxMembers: number;
  remainingSlots: number;
  denialReason: null | 'license_not_active' | 'max_members_limit_reached';
  messageAr: string;
}

/**
 * التحقق البرمجي الصارم من الحد الأقصى لأعضاء الفريق (maxMembers من 1 إلى 10)
 * حسب ترخيص مساحة العمل أو الباقة المعتمدة، مع إعفاء المالكين الدائمين والحسابات القائمة غير المقيدة بحد 10 أعضاء.
 */
export function validateTeamMemberAdditionLimit(params: {
  currentMembersCount: number;
  currentMemberUidsCount?: number;
  accountLicense?: Pick<AccountLicense, 'maxMembers' | 'planId' | 'status' | 'ownerEmail'> | null;
  isPermanentOwner?: boolean;
}): TeamMemberLimitValidationResult {
  const isOwnerExempt =
    Boolean(params.isPermanentOwner) ||
    isPermanentPlatformOwnerEmail(params.accountLicense?.ownerEmail);

  const currentCount = Math.max(
    0,
    Math.round(Number(params.currentMembersCount) || 0),
    Math.round(Number(params.currentMemberUidsCount) || 0)
  );

  if (
    !isOwnerExempt &&
    params.accountLicense &&
    (params.accountLicense.status === 'suspended' || params.accountLicense.status === 'pending')
  ) {
    return {
      allowed: false,
      currentCount,
      effectiveMaxMembers: Math.max(1, Math.min(10, Number(params.accountLicense.maxMembers) || 1)),
      remainingSlots: 0,
      denialReason: 'license_not_active',
      messageAr:
        'رفض أمني: لا يمكن إضافة أعضاء جدد للفريق بينما ترخيص مساحة العمل في حالة انتظار الموافقة أو موقوف مؤقتًا.',
    };
  }

  const effectiveMaxMembers = isOwnerExempt
    ? 10
    : params.accountLicense && typeof params.accountLicense.maxMembers === 'number'
      ? Math.max(1, Math.min(10, Math.round(params.accountLicense.maxMembers)))
      : 10;

  if (currentCount >= effectiveMaxMembers) {
    return {
      allowed: false,
      currentCount,
      effectiveMaxMembers,
      remainingSlots: 0,
      denialReason: 'max_members_limit_reached',
      messageAr:
        effectiveMaxMembers === 10
          ? 'تم الوصول للحد الأقصى للفريق (10 أعضاء: المدير الأساسي + 9 مساعدين).'
          : `تم الوصول للحد الأقصى المسموح به لأعضاء الفريق في باقتك الحالية (${effectiveMaxMembers} أعضاء). يرجى ترقية الباقة أو التواصل مع إدارة المنصة لزيادة السعة.`,
    };
  }

  return {
    allowed: true,
    currentCount,
    effectiveMaxMembers,
    remainingSlots: effectiveMaxMembers - currentCount,
    denialReason: null,
    messageAr: `مسموح بإضافة عضو جديد (${currentCount}/${effectiveMaxMembers}).`,
  };
}



