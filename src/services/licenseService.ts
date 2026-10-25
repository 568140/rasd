import { Timestamp } from 'firebase/firestore';
import {
  AccountLicense,
  LicenseStatus,
  PermanentPlatformOwnerEmail,
  PlatformOwnerRole,
  PlatformStaff,
  PlatformStaffPermissions,
  SubscriptionPackage,
  SubscriptionPlanId,
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

export interface PlatformOwnerAuthCandidate {
  uid?: string | null;
  email?: string | null;
  emailVerified?: boolean | null;
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
 * التحقق الصارم من هوية مالك المنصة بالاعتماد الحصري على جلسة Firebase Auth الموثقة (request.auth / firebaseUser)
 * دون الاعتماد على حقل البريد القابل للتعديل في وثيقة Firestore (/users) لمنع انتحال الصلاحيات.
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

  const normalizedEmail = normalizeEmail(authCandidate.email);
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

  if (authCandidate.emailVerified !== true) {
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
