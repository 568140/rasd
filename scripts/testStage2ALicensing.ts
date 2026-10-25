import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  LIFETIME_EXPIRY_ISO,
  PERMANENT_PLATFORM_OWNER_EMAILS,
  buildPermanentOwnerLicense,
  calculateSubscriptionPeriod,
  calculateSubscriptionRenewal,
  checkPlatformStaffPermission,
  evaluateLicenseState,
  getPermanentOwnerRole,
  isPermanentPlatformOwnerEmail,
  verifyPlatformOwnerIdentity,
} from '../src/services/licenseService';
import { PlatformStaff } from '../src/types/rasd';

function assertCondition(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`فشل الاختبار: ${message}`);
  }
}

async function runStage2ATests(): Promise<void> {
  console.log('=== بدء اختبارات المرحلة الأولى (نظام الحسابات والاشتراكات والتراخيص) ===\n');

  // 1. اختبار التحقق من هوية مالكي المنصة الدائمين
  console.log('1) اختبار التحقق من هوية مالكي المنصة الدائمين...');
  assertCondition(
    PERMANENT_PLATFORM_OWNER_EMAILS.includes('am1075022@gmail.com') &&
      PERMANENT_PLATFORM_OWNER_EMAILS.includes('ahah26@gmail.com') &&
      PERMANENT_PLATFORM_OWNER_EMAILS.includes('ahah26h@gmail.com'),
    'يجب أن تتضمن قائمة المالكين الدائمين الحسابين المعتمدين'
  );

  const primaryOwnerCheck = verifyPlatformOwnerIdentity({
    uid: 'uid_owner_primary',
    email: '  AM1075022@GMAIL.COM ',
    emailVerified: true,
  });
  assertCondition(
    primaryOwnerCheck.isVerifiedOwner === true &&
      primaryOwnerCheck.ownerRole === 'primary_owner' &&
      primaryOwnerCheck.isExemptFromSubscription === true &&
      primaryOwnerCheck.hasFullPlatformPrivileges === true &&
      primaryOwnerCheck.isFreeLifetime === true &&
      primaryOwnerCheck.planId === 'owner_permanent',
    'يجب اعتماد المالك الرئيسي am1075022@gmail.com بصلاحيات كاملة ومجانية مدى الحياة'
  );

  const backupOwner1Check = verifyPlatformOwnerIdentity({
    uid: 'uid_owner_backup_1',
    email: 'ahah26@gmail.com',
    emailVerified: true,
  });
  assertCondition(
    backupOwner1Check.isVerifiedOwner === true &&
      backupOwner1Check.ownerRole === 'backup_owner' &&
      backupOwner1Check.isExemptFromSubscription === true &&
      backupOwner1Check.hasFullPlatformPrivileges === true &&
      backupOwner1Check.isFreeLifetime === true &&
      backupOwner1Check.planId === 'owner_permanent',
    'يجب اعتماد المالك الدائم الثاني ahah26@gmail.com بصلاحيات كاملة ومجانية مدى الحياة'
  );

  const backupOwner2Check = verifyPlatformOwnerIdentity({
    uid: 'uid_owner_backup_2',
    email: 'ahah26h@gmail.com',
    emailVerified: true,
  });
  assertCondition(
    backupOwner2Check.isVerifiedOwner === true &&
      backupOwner2Check.ownerRole === 'backup_owner' &&
      backupOwner2Check.isExemptFromSubscription === true &&
      backupOwner2Check.hasFullPlatformPrivileges === true &&
      backupOwner2Check.isFreeLifetime === true,
    'يجب اعتماد البريد المطابق في الإنتاج ahah26h@gmail.com بصلاحيات كاملة ومجانية مدى الحياة'
  );

  const unverifiedOwnerCheck = verifyPlatformOwnerIdentity({
    uid: 'uid_spoof',
    email: 'am1075022@gmail.com',
    emailVerified: false,
  });
  assertCondition(
    unverifiedOwnerCheck.isVerifiedOwner === false &&
      unverifiedOwnerCheck.rejectionReason === 'unverified_email_token',
    'يجب رفض منح صلاحية المالك إذا لم يكن البريد مؤكدًا في رمز المصادقة (emailVerified !== true)'
  );

  const clientCheck = verifyPlatformOwnerIdentity({
    uid: 'uid_client_1',
    email: 'client@example.com',
    emailVerified: true,
  });
  assertCondition(
    clientCheck.isVerifiedOwner === false &&
      clientCheck.rejectionReason === 'not_in_permanent_owners_list' &&
      getPermanentOwnerRole('client@example.com') === null &&
      !isPermanentPlatformOwnerEmail('client@example.com'),
    'يجب رفض أي بريد غير مدرج في قائمة مالكي المنصة الدائمين'
  );
  console.log('   ✔ نجح اختبار التحقق الصارم من هوية مالكي المنصة الدائمين.\n');

  // 2. اختبار حساب بداية ونهاية الاشتراكات القياسية واشتراك مدى الحياة
  console.log('2) اختبار حساب تواريخ بداية الاشتراك وانتهائه والاشتراك مدى الحياة...');
  const baseStartIso = '2026-01-01T00:00:00.000Z';

  const monthlyCalc = calculateSubscriptionPeriod({
    planId: 'monthly',
    startDate: baseStartIso,
  });
  assertCondition(
    monthlyCalc.startsAtIso === '2026-01-01T00:00:00.000Z' &&
      monthlyCalc.expiresAtIso === '2026-01-31T00:00:00.000Z' &&
      monthlyCalc.durationDays === 30 &&
      monthlyCalc.isLifetime === false,
    'يجب أن يحسب الاشتراك الشهري 30 يومًا بدقة'
  );

  const annualCalc = calculateSubscriptionPeriod({
    planId: 'annual',
    startDate: baseStartIso,
  });
  assertCondition(
    annualCalc.startsAtIso === '2026-01-01T00:00:00.000Z' &&
      annualCalc.expiresAtIso === '2027-01-01T00:00:00.000Z' &&
      annualCalc.durationDays === 365 &&
      annualCalc.isLifetime === false,
    'يجب أن يحسب الاشتراك السنوي 365 يومًا بدقة'
  );

  const customCalc = calculateSubscriptionPeriod({
    planId: 'custom',
    startDate: baseStartIso,
    customDurationDays: 45,
  });
  assertCondition(
    customCalc.durationDays === 45 &&
      customCalc.expiresAtIso === '2026-02-15T00:00:00.000Z',
    'يجب أن يحسب الاشتراك المخصص 45 يومًا بدقة'
  );

  const lifetimeCalc = calculateSubscriptionPeriod({
    planId: 'lifetime',
    startDate: baseStartIso,
  });
  assertCondition(
    lifetimeCalc.isLifetime === true &&
      lifetimeCalc.durationDays === null &&
      lifetimeCalc.expiresAtIso === LIFETIME_EXPIRY_ISO,
    'يجب أن يضبط الاشتراك مدى الحياة تاريخ الانتهاء على 2099-12-31T23:59:59.000Z'
  );

  const ownerOverrideCalc = calculateSubscriptionPeriod({
    planId: 'monthly',
    startDate: baseStartIso,
    ownerEmail: 'ahah26@gmail.com',
  });
  assertCondition(
    ownerOverrideCalc.planId === 'owner_permanent' &&
      ownerOverrideCalc.isLifetime === true &&
      ownerOverrideCalc.isFreeOwnerPlan === true &&
      ownerOverrideCalc.expiresAtIso === LIFETIME_EXPIRY_ISO,
    'يجب ترقية اشتراك مالك المنصة تلقائيًا إلى باقة المالك الدائمة المجانية مدى الحياة'
  );
  console.log('   ✔ نجح اختبار حساب بداية ونهاية الاشتراكات والاشتراك مدى الحياة.\n');

  // 3. اختبار حساب التجديد (تراكمي للاشتراك الساري، ودورة جديدة للاشتراك المنتهي، وترقية مدى الحياة)
  console.log('3) اختبار حساب تواريخ التجديد (الساري، المنتهي، ومدى الحياة)...');
  // 3-أ: تجديد اشتراك لا يزال ساريًا (يتبقى فيه 10 أيام) -> يمدد فوق currentExpiresAt
  const activeRenewal = calculateSubscriptionRenewal({
    planId: 'monthly',
    currentStartsAt: '2026-01-01T00:00:00.000Z',
    currentExpiresAt: '2026-01-31T00:00:00.000Z',
    renewalDate: '2026-01-21T00:00:00.000Z',
  });
  assertCondition(
    activeRenewal.renewalMode === 'extended_from_current_expiry' &&
      activeRenewal.preservedRemainingDays === 10 &&
      activeRenewal.effectiveBaseDateIso === '2026-01-31T00:00:00.000Z' &&
      activeRenewal.expiresAtIso === '2026-03-02T00:00:00.000Z',
    'عند تجديد اشتراك سارٍ، يجب إضافة المدة الجديدة فوق تاريخ الانتهاء الحالي دون إضاعة الأيام المتبقية'
  );

  // 3-ب: تجديد اشتراك منتهٍ -> يبدأ من تاريخ التجديد الفعلي
  const expiredRenewal = calculateSubscriptionRenewal({
    planId: 'monthly',
    currentStartsAt: '2026-01-01T00:00:00.000Z',
    currentExpiresAt: '2026-01-31T00:00:00.000Z',
    renewalDate: '2026-02-10T00:00:00.000Z',
  });
  assertCondition(
    expiredRenewal.renewalMode === 'restarted_from_renewal_date' &&
      expiredRenewal.preservedRemainingDays === 0 &&
      expiredRenewal.startsAtIso === '2026-02-10T00:00:00.000Z' &&
      expiredRenewal.expiresAtIso === '2026-03-12T00:00:00.000Z',
    'عند تجديد اشتراك منتهٍ، يجب بدء الدورة الجديدة من تاريخ التجديد'
  );

  // 3-ج: تجديد / ترقية إلى مدى الحياة
  const lifetimeRenewal = calculateSubscriptionRenewal({
    planId: 'lifetime',
    currentStartsAt: '2026-01-01T00:00:00.000Z',
    currentExpiresAt: '2026-01-31T00:00:00.000Z',
    renewalDate: '2026-02-10T00:00:00.000Z',
  });
  assertCondition(
    lifetimeRenewal.renewalMode === 'lifetime_permanent' &&
      lifetimeRenewal.isLifetime === true &&
      lifetimeRenewal.expiresAtIso === LIFETIME_EXPIRY_ISO,
    'عند التجديد إلى باقة مدى الحياة، يجب اعتماد تاريخ 2099-12-31T23:59:59.000Z'
  );
  console.log('   ✔ نجح اختبار حساب التجديد بجميع حالاته.\n');

  // 4. اختبار تقييم حالة الترخيص وصلاحيات مساعدي المنصة
  console.log('4) اختبار تقييم حالة التراخيص وصلاحيات مساعدي إدارة المنصة...');
  const ownerLicense = buildPermanentOwnerLicense({
    workspaceId: 'ws_owner_1',
    ownerId: 'uid_owner_1',
    ownerEmail: 'am1075022@gmail.com',
    now: '2026-01-01T00:00:00.000Z',
  });
  const ownerEval = evaluateLicenseState(ownerLicense, '2080-01-01T00:00:00.000Z');
  assertCondition(
    ownerEval.effectiveStatus === 'active' &&
      ownerEval.isLifetime === true &&
      ownerEval.isPermanentOwner === true &&
      ownerEval.isWriteAllowed === true,
    'ترخيص مالك المنصة الدائم يجب أن يظل نشطًا ومسموحًا بالكتابة دائمًا'
  );

  const expiredEval = evaluateLicenseState(
    {
      ownerEmail: 'client@example.com',
      planId: 'monthly',
      status: 'active',
      startsAt: '2026-01-01T00:00:00.000Z',
      expiresAt: '2026-01-31T00:00:00.000Z',
    },
    '2026-02-01T00:00:00.000Z'
  );
  assertCondition(
    expiredEval.effectiveStatus === 'expired' &&
      expiredEval.isExpired === true &&
      expiredEval.isReadAllowed === true &&
      expiredEval.isWriteAllowed === false &&
      expiredEval.remainingDays === 0,
    'الاشتراك المنتهي زمنيًا يجب أن يتحول إلى expired مع السماح بالقراءة فقط وإيقاف الكتابة'
  );

  const staffSample: PlatformStaff = {
    id: 'staff_1',
    uid: 'staff_1',
    email: 'assistant@example.com',
    displayName: 'مساعد المنصة',
    status: 'active',
    permissions: {
      canViewRequests: true,
      canApproveAndRenew: true,
      canManagePackages: false,
    },
    assignedByUid: 'uid_owner_primary',
  };
  assertCondition(
    checkPlatformStaffPermission(staffSample, 'canViewRequests') === true &&
      checkPlatformStaffPermission(staffSample, 'canApproveAndRenew') === true &&
      checkPlatformStaffPermission(staffSample, 'canManagePackages') === false,
    'يجب فحص صلاحيات مساعد المنصة بدقة وفق الأذونات الممنوحة'
  );
  console.log('   ✔ نجح اختبار تقييم التراخيص وصلاحيات مساعدي المنصة.\n');

  // 5. اختبار مراجعة ملف DRAFT_firestore.rules وعدم المساس بملف الإنتاج firestore.rules
  console.log('5) التحقق من قواعد DRAFT_firestore.rules وسلامة ملف الإنتاج firestore.rules...');
  const draftRules = fs.readFileSync(path.resolve(process.cwd(), 'DRAFT_firestore.rules'), 'utf8');
  assertCondition(
    draftRules.includes('function isPermanentOwnerEmail(email)') &&
      draftRules.includes("email == 'am1075022@gmail.com'") &&
      draftRules.includes("email == 'ahah26@gmail.com'") &&
      draftRules.includes("email == 'ahah26h@gmail.com'"),
    'يجب أن يعتمد DRAFT_firestore.rules حسابات المالكين الدائمين'
  );
  assertCondition(
    draftRules.includes("get(licPath).data.planId in ['lifetime', 'owner_permanent']"),
    'يجب أن يدعم isWorkspaceLicenseActive في DRAFT_firestore.rules الاشتراكات مدى الحياة'
  );
  assertCondition(
    draftRules.includes('!isPermanentOwnerEmail(existing().ownerEmail)') &&
      draftRules.includes("hasStaffPermission('canManagePackages')"),
    'يجب أن يمنع DRAFT_firestore.rules مساعد المنصة من المساس بتراخيص المالكين أو تعديل الباقات دون صلاحية canManagePackages'
  );
  assertCondition(
    draftRules.includes('incoming().email == existing().email'),
    'يجب أن يمنع DRAFT_firestore.rules تغيير حقل البريد الإلكتروني في /users بعد الإنشاء لغير المالك'
  );
  console.log('   ✔ نجح التحقق من قواعد DRAFT_firestore.rules.\n');

  console.log('=== اكتملت جميع اختبارات المرحلة الأولى بنجاح (100%) ===');
}

runStage2ATests().catch((err) => {
  console.error(err);
  process.exit(1);
});
