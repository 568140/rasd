import * as fs from 'node:fs';
import * as path from 'node:path';
import assert from 'node:assert/strict';
import {
  authorizePlatformOperation,
  assertPlatformOperationAuthorized,
  buildPendingRegistrationLicense,
  buildRegistrationRequestSummary,
  buildRegistrationDecisionTransition,
  buildClientSubscriptionMutation,
  validateAndBuildSubscriptionPackageUpdate,
  validateAndBuildPlatformStaffRecord,
  buildPlatformClientAccountSummary,
  evaluateAccountAccessGate,
  verifyPlatformOwnerIdentity,
  isPermanentPlatformOwnerEmail,
  DEFAULT_SUBSCRIPTION_PACKAGES,
} from '../src/services/licenseService';
import { PlatformStaff, UserProfile, Workspace } from '../src/types/rasd';

console.log('=== بدء اختبارات المرحلة 2-C: لوحة إدارة منصة «رَصْد» والصلاحيات السيادية ===\n');

// 1. فحص تفعيل ومطابقة ملف قواعد الإنتاج firestore.rules مع القواعد المعتمدة الكاملة
const prodRulesPath = path.resolve(process.cwd(), 'firestore.rules');
const draftRulesPath = path.resolve(process.cwd(), 'DRAFT_firestore.rules');
const prodRulesContent = fs.readFileSync(prodRulesPath, 'utf8');
const draftRulesContent = fs.readFileSync(draftRulesPath, 'utf8');
assert.equal(
  prodRulesContent,
  draftRulesContent,
  'يجب أن يتطابق ملف /firestore.rules الإنتاجي مع القواعد المعتمدة الكاملة'
);
console.log(`✅ 1. ملف الإنتاج /firestore.rules مفعّل ومتطابق بالكامل (${prodRulesContent.split('\n').length} سطرًا).`);

// 2. فحص القواعد للتأكد من قصر قبول/رفض الطلبات المعلقة على المالكين الدائمين وحماية الباقات والمساعدين
assert.ok(
  draftRulesContent.includes("existing().status != 'pending'") &&
    draftRulesContent.includes("incoming().status != 'pending'"),
  'يجب أن تمنع مسودة القواعد المساعدين من قبول أو رفض الطلبات المعلقة (pending) وتقصرها على المالكين الدائمين'
);
assert.ok(
  draftRulesContent.includes('match /subscription_packages/{packageId}'),
  'يجب أن تتضمن مسودة القواعد حماية مجموعة subscription_packages'
);
assert.ok(
  draftRulesContent.includes('match /platform_staff/{staffUid}'),
  'يجب أن تتضمن مسودة القواعد حماية مجموعة platform_staff للمالكين الدائمين فقط'
);
console.log(
  '✅ 2. مسودة القواعد DRAFT_firestore.rules تقصر البت في طلبات التسجيل وإدارة المساعدين على المالكين الدائمين وتحمي الباقات.'
);

// 3. التحقق من بقاء الحسابين الدائمين بكامل الصلاحيات المجانية مدى الحياة
for (const ownerEmail of ['am1075022@gmail.com', 'ahah26@gmail.com', 'ahah26h@gmail.com']) {
  assert.equal(isPermanentPlatformOwnerEmail(ownerEmail), true);
  assert.equal(
    verifyPlatformOwnerIdentity({ uid: `uid_${ownerEmail}`, email: ownerEmail, emailVerified: true })
      .isVerifiedOwner,
    true,
    `يجب اعتماد المالك الدائم ${ownerEmail}`
  );
  const gate = evaluateAccountAccessGate({
    authCandidate: { uid: `uid_${ownerEmail}`, email: ownerEmail, emailVerified: true },
    isNewSelfRegistration: false,
    existingUserProfile: null,
    accountLicense: null,
  });
  assert.equal(gate.canAccessWorkScreens, true);
  assert.equal(gate.isPermanentOwner, true);
}
console.log(
  '✅ 3. الحسابان الدائمان (am1075022@gmail.com وahah26@gmail.com / ahah26h@gmail.com) يتمتعان بصلاحيات كاملة ومجانية مدى الحياة.'
);

// 4. فحص قبول ورفض طلبات التسجيل: مسموح للمالكين الدائمين فقط ومرفوض لمساعدي المنصة حتى لو امتلكوا canApproveAndRenew
const ownerAuth = {
  uid: 'owner_1',
  email: 'am1075022@gmail.com',
  emailVerified: true,
};
const fullStaffRecord: PlatformStaff = {
  id: 'staff_1',
  uid: 'staff_1',
  email: 'assistant@rasd.ye',
  displayName: 'مساعد مفوض',
  assignedByUid: 'owner_1',
  status: 'active',
  permissions: {
    canViewRequests: true,
    canApproveAndRenew: true,
    canManagePackages: true,
  },
};

const staffDecisionAuth = authorizePlatformOperation({
  actorAuth: { uid: 'staff_1', email: 'assistant@rasd.ye', emailVerified: true },
  actorStaffRecord: fullStaffRecord,
  operation: 'decide_registration_request',
});
assert.equal(
  staffDecisionAuth.allowed,
  false,
  'يجب منع مساعد المنصة من قبول أو رفض طلبات التسجيل الأولية'
);

const pendingLic = buildPendingRegistrationLicense({
  workspaceId: 'ws_client_new_1',
  ownerId: 'client_new_1',
  ownerEmail: 'client1@company.ye',
  applicantName: 'شركة الأفق العقارية',
  applicantPhone: '777123456',
  workspaceName: 'مساحة شركة الأفق',
  requestedPlanId: 'annual',
  now: '2026-03-01T08:00:00.000Z',
});
const pendingReqSummary = buildRegistrationRequestSummary({
  license: pendingLic,
});

// محاولة مساعد المنصة قبول الطلب يجب أن تُرفض برمجيًا
assert.throws(
  () =>
    buildRegistrationDecisionTransition({
      actorAuth: { uid: 'staff_1', email: 'assistant@rasd.ye', emailVerified: true },
      actorStaffRecord: fullStaffRecord,
      request: pendingReqSummary,
      decision: 'approve',
      approvedPlanId: 'annual',
      now: '2026-03-02T10:00:00.000Z',
    }),
  /حصري لمالكي المنصة الدائمين فقط/
);

// قبول الطلب من المالك الدائم
const approvedTransition = buildRegistrationDecisionTransition({
  actorAuth: ownerAuth,
  request: pendingReqSummary,
  decision: 'approve',
  approvedPlanId: 'annual',
  decisionNotes: 'تم التحقق من بيانات العميل واعتماده',
  now: '2026-03-02T10:00:00.000Z',
});
assert.equal(approvedTransition.updatedLicense.status, 'active');
assert.equal(approvedTransition.updatedLicense.planId, 'annual');
assert.equal(approvedTransition.updatedLicense.maxMembers, 10);
assert.equal(approvedTransition.userProfilePatch.jobTitle, 'مدير مساحة العمل');
assert.equal(approvedTransition.ownerMemberPatch.status, 'active');
assert.ok(approvedTransition.auditSummary.includes('قبول طلب تسجيل العميل'));

// رفض طلب تسجيل من المالك الدائم
const rejectedTransition = buildRegistrationDecisionTransition({
  actorAuth: ownerAuth,
  request: pendingReqSummary,
  decision: 'reject',
  decisionNotes: 'بيانات غير مكتملة',
  now: '2026-03-02T11:00:00.000Z',
});
assert.equal(rejectedTransition.updatedLicense.status, 'suspended');
assert.equal(rejectedTransition.userProfilePatch.jobTitle, 'طلب تسجيل مرفوض');
assert.equal(rejectedTransition.ownerMemberPatch.status, 'suspended');
assert.ok(rejectedTransition.auditSummary.includes('رفض طلب تسجيل العميل'));
console.log(
  '✅ 4. قبول أو رفض طلبات التسجيل مقصور حصريًا على المالكين الدائمين ويعمل بدقة مع تحديث حالة الحساب والترخيص وسجل التدقيق.'
);

// 5. فحص إجراءات تفعيل الاشتراك وتجديده وتعليقه وإعادة تفعيله
// أ) تعليق الاشتراك
const suspendedMutation = buildClientSubscriptionMutation({
  actorAuth: ownerAuth,
  actorStaffRecord: null,
  action: 'suspend',
  workspaceId: 'ws_client_new_1',
  ownerId: 'client_new_1',
  ownerEmail: 'client1@company.ye',
  ownerName: 'شركة الأفق العقارية',
  existingLicense: approvedTransition.updatedLicense,
  notes: 'إيقاف مؤقت بناءً على طلب العميل',
  now: '2026-06-01T10:00:00.000Z',
});
assert.equal(suspendedMutation.updatedLicense.status, 'suspended');
assert.equal(suspendedMutation.dataPreserved, true);
assert.equal(suspendedMutation.ownerMemberStatusPatch, 'suspended');

// ب) إعادة تفعيل الاشتراك عبر مساعد مفوض بصلاحية canApproveAndRenew (نفس الباقة والحد)
const reactivatedMutation = buildClientSubscriptionMutation({
  actorAuth: { uid: 'staff_1', email: 'assistant@rasd.ye', emailVerified: true },
  actorStaffRecord: fullStaffRecord,
  action: 'reactivate',
  workspaceId: 'ws_client_new_1',
  ownerId: 'client_new_1',
  ownerEmail: 'client1@company.ye',
  ownerName: 'شركة الأفق العقارية',
  existingLicense: suspendedMutation.updatedLicense,
  planId: 'quarterly',
  notes: 'إعادة تفعيل ربع سنوية',
  now: '2026-06-15T00:00:00.000Z',
});
assert.equal(reactivatedMutation.updatedLicense.status, 'active');
assert.equal(reactivatedMutation.updatedLicense.planId, 'quarterly');
assert.equal(reactivatedMutation.dataPreserved, true);
assert.equal(reactivatedMutation.ownerMemberStatusPatch, 'active');

// ج) تجديد تراكمي لاشتراك نشط
const prevExpiryMs = Date.parse(reactivatedMutation.evaluation.expiresAtIso);
const renewedMutation = buildClientSubscriptionMutation({
  actorAuth: ownerAuth,
  actorStaffRecord: null,
  action: 'renew',
  workspaceId: 'ws_client_new_1',
  ownerId: 'client_new_1',
  ownerEmail: 'client1@company.ye',
  ownerName: 'شركة الأفق العقارية',
  existingLicense: reactivatedMutation.updatedLicense,
  planId: 'monthly',
  now: '2026-07-01T00:00:00.000Z',
});
const newExpiryMs = Date.parse(renewedMutation.evaluation.expiresAtIso);
assert.equal(
  Math.round((newExpiryMs - prevExpiryMs) / (24 * 60 * 60 * 1000)),
  30,
  'يجب أن يضيف التجديد للاشتراك النشط مدة الباقة فوق تاريخ الانتهاء الحالي دون ضياع الأيام المتبقية'
);

// د) منع تعليق حساب المالك الدائم
assert.throws(
  () =>
    buildClientSubscriptionMutation({
      actorAuth: ownerAuth,
      actorStaffRecord: null,
      action: 'suspend',
      workspaceId: 'ws_owner_1',
      ownerId: 'owner_2',
      ownerEmail: 'ahah26@gmail.com',
      ownerName: 'المالك الدائم الثاني',
      existingLicense: null,
    }),
  /لا يجوز تعليق أو إيقاف حساب أحد مالكي المنصة الدائمين/
);
console.log(
  '✅ 5. تفعيل وتجديد وتعليق وإعادة تفعيل الاشتراكات يعمل بدقة مع حفظ البيانات (dataPreserved: true) وحماية المالكين الدائمين.'
);

// 6. فحص إدارة الباقات ومددها وحدود أعضاء الفريق (1..10)
const { updatedPackage: updatedMonthlyPkg } = validateAndBuildSubscriptionPackageUpdate({
  actorAuth: { uid: 'staff_1', email: 'assistant@rasd.ye', emailVerified: true },
  actorStaffRecord: fullStaffRecord,
  planId: 'monthly',
  patch: {
    nameAr: 'الباقة الشهرية المطورة',
    durationDays: 45,
    defaultMaxMembers: 6,
    descriptionAr: 'باقة 45 يومًا حتى 6 أعضاء',
  },
});
assert.equal(updatedMonthlyPkg.durationDays, 45);
assert.equal(updatedMonthlyPkg.defaultMaxMembers, 6);

// منع تجاوز حد أعضاء الفريق 10
assert.throws(
  () =>
    validateAndBuildSubscriptionPackageUpdate({
      actorAuth: ownerAuth,
      actorStaffRecord: null,
      planId: 'annual',
      patch: {
        nameAr: 'باقة غير صالحة',
        durationDays: 365,
        defaultMaxMembers: 15,
        descriptionAr: 'تجاوز الحد',
      },
    }),
  /يجب أن يكون بين 1 و 10 أعضاء/
);

// منع تعديل باقة المالك الدائم
assert.throws(
  () =>
    validateAndBuildSubscriptionPackageUpdate({
      actorAuth: ownerAuth,
      actorStaffRecord: null,
      planId: 'owner_permanent',
      patch: {
        nameAr: 'تعديل مالك',
        durationDays: 30,
        defaultMaxMembers: 2,
      },
    }),
  /باقة المالك الدائم \(owner_permanent\) محمية/
);
console.log(
  '✅ 6. إدارة الباقات ومددها وحدود أعضاء الفريق (1..10) محمية وتتحقق من المدخلات وتمنع المساس بباقة المالك الدائم.'
);

// 7. فحص إدارة مساعدي المنصة وصلاحياتهم دون تجاوز التفويض
// منع المساعد من إضافة مساعد آخر
assert.throws(
  () =>
    validateAndBuildPlatformStaffRecord({
      actorAuth: { uid: 'staff_1', email: 'assistant@rasd.ye', emailVerified: true },
      actorStaffRecord: fullStaffRecord,
      staffUid: 'staff_2',
      email: 'staff2@rasd.ye',
      displayName: 'مساعد ثانٍ',
      status: 'active',
      permissions: { canViewRequests: true, canApproveAndRenew: false, canManagePackages: false },
    }),
  /حصري لمالكي المنصة الدائمين فقط/
);

// منع تحويل مالك دائم إلى مساعد مقيد
assert.throws(
  () =>
    validateAndBuildPlatformStaffRecord({
      actorAuth: ownerAuth,
      staffUid: 'owner_2',
      email: 'ahah26@gmail.com',
      displayName: 'المالك الثاني',
      status: 'active',
      permissions: { canViewRequests: true, canApproveAndRenew: false, canManagePackages: false },
    }),
  /يعود لأحد مالكي المنصة الدائمين/
);

// إنشاء مساعد بصلاحية عرض فقط والتحقق من منعه من التجديد أو تعديل الباقات
const { staffRecord: viewOnlyStaff } = validateAndBuildPlatformStaffRecord({
  actorAuth: ownerAuth,
  staffUid: 'staff_view_only',
  email: 'viewer@rasd.ye',
  displayName: 'مراقب طلبات',
  status: 'active',
  permissions: {
    canViewRequests: true,
    canApproveAndRenew: false,
    canManagePackages: false,
  },
});
assert.equal(
  authorizePlatformOperation({
    actorAuth: { uid: 'staff_view_only', email: 'viewer@rasd.ye', emailVerified: true },
    actorStaffRecord: viewOnlyStaff,
    operation: 'view_admin_dashboard',
  }).allowed,
  true
);
assert.equal(
  authorizePlatformOperation({
    actorAuth: { uid: 'staff_view_only', email: 'viewer@rasd.ye', emailVerified: true },
    actorStaffRecord: viewOnlyStaff,
    operation: 'renew_subscription',
  }).allowed,
  false
);
assert.equal(
  authorizePlatformOperation({
    actorAuth: { uid: 'staff_view_only', email: 'viewer@rasd.ye', emailVerified: true },
    actorStaffRecord: viewOnlyStaff,
    operation: 'manage_packages',
  }).allowed,
  false
);
assert.throws(
  () =>
    assertPlatformOperationAuthorized({
      actorAuth: { uid: 'staff_view_only', email: 'viewer@rasd.ye', emailVerified: true },
      actorStaffRecord: viewOnlyStaff,
      operation: 'renew_subscription',
    }),
  /لا يملك مساعد المنصة تفويض تفعيل أو تجديد أو تعليق الاشتراكات/
);
console.log(
  '✅ 7. إدارة مساعدي المنصة تقصر التفويض على الصلاحيات الممنوحة بدقة وتمنع أي تصعيد في الصلاحيات.'
);

// 8. التحقق من عدم كسر الحسابات الحالية (legacy_workspace) في ملخص العملاء دون ترحيل قسري
const legacyWorkspace: Partial<Workspace> = {
  id: 'ws_legacy_client',
  name: 'مكتب الأمانة العقاري',
  ownerId: 'uid_legacy_client',
  ownerName: 'مكتب الأمانة',
  defaultCurrency: 'YER',
  taxRatePercent: 5,
  regionName: 'عدن',
  memberCount: 3,
  createdAt: '2025-11-10T00:00:00.000Z',
};
const legacyOwnerProfile: Partial<UserProfile> = {
  uid: 'uid_legacy_client',
  email: 'legacy@office.ye',
  displayName: 'مكتب الأمانة',
  phone: '771112233',
  jobTitle: 'مدير المكتب',
  activeWorkspaceId: 'ws_legacy_client',
  createdAt: '2025-11-10T00:00:00.000Z',
};
const legacySummary = buildPlatformClientAccountSummary({
  workspace: legacyWorkspace,
  userProfile: legacyOwnerProfile,
  license: null,
  packagesMap: DEFAULT_SUBSCRIPTION_PACKAGES,
});
assert.equal(legacySummary.isGrandfatheredLegacy, true);
assert.equal(legacySummary.effectiveStatus, 'active');
assert.equal(legacySummary.isPermanentOwner, false);
assert.equal(legacySummary.source, 'legacy_workspace');
console.log(
  '✅ 8. الحسابات الحالية (isGrandfatheredLegacy) تعمل وتظهر في لوحة الإدارة دون أي ترحيل قسري أو تعطيل.'
);

console.log('\n🎉 اكتملت جميع اختبارات المرحلة 2-C (لوحة إدارة منصة «رَصْد») بنجاح تام!');
