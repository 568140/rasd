import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  PENDING_REGISTRATION_JOB_TITLE_MARKER,
  buildPendingRegistrationLicense,
  buildRegistrationRequestSummary,
  decodeRegistrationMetaFromNotes,
  encodeRegistrationMetaIntoNotes,
  evaluateAccountAccessGate,
  isPendingRegistrationProfileMarker,
} from '../src/services/licenseService';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

function runStage2BRegistrationApprovalTests(): void {
  console.log('=== بدء اختبارات المرحلة الثانية (2-B): نظام طلبات تسجيل العملاء والموافقة عليها ===\n');

  // --------------------------------------------------------------------------
  // 1. اختبار تسجيل الحسابات الجديدة ودخولها في حالة انتظار الموافقة ومنعها من شاشات العمل
  // --------------------------------------------------------------------------
  console.log('1. اختبار الحسابات الجديدة المسجلة ذاتيًا (Pending Approval Gate)...');

  const newClientEval = evaluateAccountAccessGate({
    authCandidate: {
      uid: 'uid_new_client_01',
      email: 'newclient@office.com',
      emailVerified: true,
    },
    isNewSelfRegistration: true,
    existingUserProfile: null,
    existingOwnerMember: null,
    isInvitedTeamMember: false,
    accountLicense: null,
  });

  assert(
    newClientEval.gateStatus === 'pending_approval',
    'يجب أن يدخل الحساب الجديد المسجل ذاتيًا في حالة pending_approval'
  );
  assert(
    newClientEval.canAccessWorkScreens === false,
    'يجب منع الحساب الجديد من الوصول إلى شاشات العمل قبل الموافقة'
  );
  assert(newClientEval.isNewPendingAccount === true, 'يجب تمييز الحساب الجديد كطلب معلق');
  assert(
    newClientEval.reasonCode === 'new_account_pending_approval',
    'يجب أن يكون سبب المنع new_account_pending_approval'
  );

  // اختبار بقاء الحساب الجديد في حالة انتظار الموافقة عند إعادة الدخول أو تحديث الصفحة (عبر علامة الملف الشخصي أو وثيقة الترخيص)
  const returningPendingViaMarker = evaluateAccountAccessGate({
    authCandidate: {
      uid: 'uid_new_client_01',
      email: 'newclient@office.com',
      emailVerified: true,
    },
    isNewSelfRegistration: false,
    existingUserProfile: {
      uid: 'uid_new_client_01',
      email: 'newclient@office.com',
      displayName: 'مكتب الأفق العقاري',
      jobTitle: PENDING_REGISTRATION_JOB_TITLE_MARKER,
      activeWorkspaceId: 'ws_uid_new_client_01',
    },
    existingOwnerMember: {
      role: 'owner',
      status: 'invited',
    },
    isInvitedTeamMember: false,
    accountLicense: null,
  });

  assert(
    returningPendingViaMarker.gateStatus === 'pending_approval' &&
      returningPendingViaMarker.canAccessWorkScreens === false,
    'يجب أن يبقى الحساب الجديد محجوبًا عن شاشات العمل عند إعادة تسجيل الدخول قبل الموافقة'
  );

  const pendingLicense = buildPendingRegistrationLicense({
    workspaceId: 'ws_uid_new_client_01',
    ownerId: 'uid_new_client_01',
    ownerEmail: 'NewClient@Office.com',
    applicantName: 'مكتب الأفق العقاري',
    applicantPhone: '777123456',
    workspaceName: 'مساحة عمل مكتب الأفق العقاري',
    requestedPlanId: 'trial',
    now: '2026-04-01T10:00:00.000Z',
  });

  assert(pendingLicense.status === 'pending', 'يجب أن تكون حالة وثيقة طلب التسجيل الجديد pending');
  assert(
    pendingLicense.ownerEmail === 'newclient@office.com',
    'يجب توحيد البريد الإلكتروني في وثيقة طلب التسجيل'
  );
  assert(
    pendingLicense.planId === 'trial',
    'يجب أن تكون الباقة المبدئية لطلب التسجيل الجديد trial'
  );
  assert(
    pendingLicense.notes.length <= 1000,
    'يجب ألا يتجاوز طول حقل notes الحد الأقصى المسموح به في قواعد Firestore (1000 حرف)'
  );

  const returningPendingViaLicense = evaluateAccountAccessGate({
    authCandidate: {
      uid: 'uid_new_client_01',
      email: 'newclient@office.com',
      emailVerified: true,
    },
    isNewSelfRegistration: false,
    existingUserProfile: {
      uid: 'uid_new_client_01',
      email: 'newclient@office.com',
      displayName: 'مكتب الأفق العقاري',
      jobTitle: 'مسؤول ميداني أول',
      activeWorkspaceId: 'ws_uid_new_client_01',
    },
    accountLicense: pendingLicense,
  });

  assert(
    returningPendingViaLicense.gateStatus === 'pending_approval' &&
      returningPendingViaLicense.canAccessWorkScreens === false,
    'يجب أن تظل شاشات العمل مغلقة ما دامت وثيقة /account_licenses في حالة pending'
  );

  // اختبار فتح شاشات العمل فور موافقة الإدارة وتغيير حالة الترخيص إلى active
  const approvedLicense = {
    ...pendingLicense,
    status: 'active' as const,
  };
  const afterApprovalEval = evaluateAccountAccessGate({
    authCandidate: {
      uid: 'uid_new_client_01',
      email: 'newclient@office.com',
      emailVerified: true,
    },
    isNewSelfRegistration: false,
    existingUserProfile: {
      uid: 'uid_new_client_01',
      email: 'newclient@office.com',
      displayName: 'مكتب الأفق العقاري',
      jobTitle: PENDING_REGISTRATION_JOB_TITLE_MARKER,
      activeWorkspaceId: 'ws_uid_new_client_01',
    },
    accountLicense: approvedLicense,
    referenceDate: '2026-04-05T10:00:00.000Z',
  });

  assert(
    afterApprovalEval.gateStatus === 'approved' &&
      afterApprovalEval.canAccessWorkScreens === true,
    'يجب السماح بالوصول إلى شاشات العمل فور تغيير حالة الترخيص إلى active'
  );

  console.log('   ✓ نجح اختبار بوابة انتظار الموافقة للحسابات الجديدة ومنع شاشات العمل قبل الاعتماد.\n');

  // --------------------------------------------------------------------------
  // 2. اختبار الحفاظ على الحسابين الدائمين المعتمدين بصلاحياتهما الكاملة والمجانية
  // --------------------------------------------------------------------------
  console.log('2. اختبار الحسابات الدائمة لمالكي المنصة (am1075022@gmail.com و ahah26@gmail.com و ahah26h@gmail.com)...');

  for (const ownerEmail of ['am1075022@gmail.com', 'ahah26@gmail.com', 'ahah26h@gmail.com']) {
    const ownerEval = evaluateAccountAccessGate({
      authCandidate: {
        uid: `uid_${ownerEmail}`,
        email: ownerEmail,
        emailVerified: true,
      },
      isNewSelfRegistration: true, // حتى لو كان أول تسجيل دخول
      existingUserProfile: null,
      existingOwnerMember: null,
      accountLicense: null,
    });

    assert(ownerEval.gateStatus === 'approved', `يجب اعتماد المالك الدائم فورًا: ${ownerEmail}`);
    assert(
      ownerEval.canAccessWorkScreens === true,
      `يجب السماح للمالك الدائم بالوصول الكامل دون انتظار: ${ownerEmail}`
    );
    assert(
      ownerEval.isPermanentOwner === true,
      `يجب تمييز الحساب كمالك منصة دائم: ${ownerEmail}`
    );
    assert(
      ownerEval.reasonCode === 'permanent_owner',
      `يجب أن يكون سبب الاعتماد permanent_owner لـ ${ownerEmail}`
    );

    let threwOnPendingForOwner = false;
    try {
      buildPendingRegistrationLicense({
        workspaceId: 'ws_owner',
        ownerId: 'uid_owner',
        ownerEmail,
        applicantName: 'مالك المنصة',
      });
    } catch {
      threwOnPendingForOwner = true;
    }
    assert(
      threwOnPendingForOwner === true,
      `يجب منع وضع حساب المالك الدائم (${ownerEmail}) في حالة طلب انتظار`
    );
  }

  console.log('   ✓ نجح اختبار الحفاظ على الحسابات الدائمة لمالكي المنصة بصلاحياتهم الكاملة والمجانية.\n');

  // --------------------------------------------------------------------------
  // 3. اختبار الحسابات الحالية القائمة وأعضاء الفرق المدعوين وعدم فرض انتهاء الاشتراك عليها الآن
  // --------------------------------------------------------------------------
  console.log('3. اختبار عدم منع الحسابات الحالية من العمل وعدم فرض انتهاء الاشتراك عليها في هذه المرحلة...');

  const existingLegacyUserEval = evaluateAccountAccessGate({
    authCandidate: {
      uid: 'uid_existing_customer_99',
      email: 'existing.customer@company.com',
      emailVerified: true,
    },
    isNewSelfRegistration: false,
    existingUserProfile: {
      uid: 'uid_existing_customer_99',
      email: 'existing.customer@company.com',
      displayName: 'عميل حالي في المنصة',
      jobTitle: 'مسؤول ميداني أول',
      activeWorkspaceId: 'ws_uid_existing_customer_99',
    },
    existingOwnerMember: {
      role: 'owner',
      status: 'active',
    },
    isInvitedTeamMember: false,
    accountLicense: null, // لا توجد وثيقة ترخيص لأننا لا ننفذ ترحيلًا على الحسابات الحالية
  });

  assert(
    existingLegacyUserEval.gateStatus === 'legacy_active',
    'يجب أن تكون حالة الحساب الحالي القائم legacy_active دون حاجة لترحيل بيانات'
  );
  assert(
    existingLegacyUserEval.canAccessWorkScreens === true,
    'يجب السماح للحساب الحالي بالعمل الطبيعي دون أي حجب'
  );
  assert(
    existingLegacyUserEval.isExistingGrandfatheredAccount === true,
    'يجب التعرف على الحساب الحالي كحساب قائم محتفظ بصلاحياته'
  );

  // اختبار عدم فرض انتهاء الاشتراك على الحسابات الحالية في هذه المرحلة (Requirement #6)
  const expiredLicenseNotEnforcedEval = evaluateAccountAccessGate({
    authCandidate: {
      uid: 'uid_existing_customer_99',
      email: 'existing.customer@company.com',
      emailVerified: true,
    },
    isNewSelfRegistration: false,
    existingUserProfile: {
      uid: 'uid_existing_customer_99',
      email: 'existing.customer@company.com',
      displayName: 'عميل حالي في المنصة',
      jobTitle: 'مسؤول ميداني أول',
      activeWorkspaceId: 'ws_uid_existing_customer_99',
    },
    accountLicense: {
      ...approvedLicense,
      status: 'expired',
    },
    enforceSubscriptionExpiryOnExisting: false, // الافتراضي في المرحلة 2-B
    referenceDate: '2026-06-01T00:00:00.000Z',
  });

  assert(
    expiredLicenseNotEnforcedEval.canAccessWorkScreens === true &&
      expiredLicenseNotEnforcedEval.reasonCode === 'expired_license_not_enforced_yet',
    'يجب عدم منع الحسابات الحالية بسبب انتهاء الاشتراك في هذه المرحلة (enforceSubscriptionExpiryOnExisting = false)'
  );

  // اختبار عضو فريق مدعو إلى مساحة عمل قائمة
  const invitedTeamMemberEval = evaluateAccountAccessGate({
    authCandidate: {
      uid: 'uid_team_member_05',
      email: 'assistant@company.com',
      emailVerified: false,
    },
    isNewSelfRegistration: false,
    existingUserProfile: null,
    isInvitedTeamMember: true,
    invitedMemberStatus: 'active',
    accountLicense: null,
  });

  assert(
    invitedTeamMemberEval.gateStatus === 'approved' &&
      invitedTeamMemberEval.canAccessWorkScreens === true &&
      invitedTeamMemberEval.reasonCode === 'invited_team_member',
    'يجب السماح لعضو الفريق المدعو إلى مساحة عمل قائمة بالدخول للعمل مع فريقه'
  );

  console.log('   ✓ نجح اختبار استمرار عمل الحسابات الحالية وأعضاء الفرق دون تغيير بياناتها أو فرض انتهاء الاشتراك.\n');

  // --------------------------------------------------------------------------
  // 4. اختبار استقبال طلبات التسجيل واستخلاص حالتها وبياناتها الوصفية
  // --------------------------------------------------------------------------
  console.log('4. اختبار استقبال طلبات التسجيل وفك ترميز بياناتها وإظهار حالتها...');

  const encoded = encodeRegistrationMetaIntoNotes('ملاحظة طلب التسجيل', {
    applicantUid: 'uid_new_client_01',
    applicantName: 'مكتب الأفق العقاري',
    applicantEmail: 'newclient@office.com',
    applicantPhone: '777123456',
    workspaceId: 'ws_uid_new_client_01',
    workspaceName: 'مساحة عمل مكتب الأفق العقاري',
    requestedPlanId: 'trial',
    requestedAtIso: '2026-04-01T10:00:00.000Z',
  });

  const decoded = decodeRegistrationMetaFromNotes(encoded);
  assert(decoded.cleanNotes === 'ملاحظة طلب التسجيل', 'يجب فصل الملاحظة النصية عن بيانات REG_META');
  assert(
    decoded.meta.applicantName === 'مكتب الأفق العقاري' &&
      decoded.meta.applicantPhone === '777123456' &&
      decoded.meta.requestedPlanId === 'trial',
    'يجب استرجاع بيانات مقدم الطلب بدقة من REG_META'
  );

  const summaryFromLicense = buildRegistrationRequestSummary({
    license: pendingLicense,
  });
  assert(
    summaryFromLicense.status === 'pending' &&
      summaryFromLicense.applicantName === 'مكتب الأفق العقاري' &&
      summaryFromLicense.applicantEmail === 'newclient@office.com' &&
      summaryFromLicense.workspaceId === 'ws_uid_new_client_01' &&
      summaryFromLicense.source === 'account_licenses',
    'يجب بناء ملخص طلب التسجيل بدقة من وثيقة الترخيص'
  );

  const summaryFromMarker = buildRegistrationRequestSummary({
    license: null,
    userProfile: {
      uid: 'uid_marker_02',
      displayName: 'مؤسسة النور الميدانية',
      email: 'noor@field.org',
      phone: '733000111',
      jobTitle: PENDING_REGISTRATION_JOB_TITLE_MARKER,
      activeWorkspaceId: 'ws_uid_marker_02',
    },
    memberStatus: 'invited',
  });
  assert(
    summaryFromMarker.status === 'pending' &&
      summaryFromMarker.applicantName === 'مؤسسة النور الميدانية' &&
      summaryFromMarker.source === 'workspace_member_marker',
    'يجب بناء ملخص طلب التسجيل بدقة من علامة الانتظار المتوافقة مع قواعد الإنتاج'
  );
  assert(
    isPendingRegistrationProfileMarker(PENDING_REGISTRATION_JOB_TITLE_MARKER, 'active') === true &&
      isPendingRegistrationProfileMarker('مسؤول ميداني أول', 'invited') === true &&
      isPendingRegistrationProfileMarker('مسؤول ميداني أول', 'active') === false,
    'يجب أن تميز دالة isPendingRegistrationProfileMarker بدقة بين الحسابات المعلقة والحسابات النشطة'
  );

  console.log('   ✓ نجح اختبار استقبال طلبات التسجيل واستخلاص حالتها.\n');

  // --------------------------------------------------------------------------
  // 5. التحقق من تفعيل قواعد /account_licenses في ملف قواعد الإنتاج /firestore.rules
  // --------------------------------------------------------------------------
  console.log('5. التحقق من تفعيل قواعد التراخيص والموافقة في ملف قواعد الإنتاج (/firestore.rules)...');
  const prodRulesPath = path.resolve(process.cwd(), 'firestore.rules');
  const prodRulesContent = fs.readFileSync(prodRulesPath, 'utf8');
  assert(
    prodRulesContent.includes('match /account_licenses/{workspaceId}') &&
      prodRulesContent.includes("incoming().status == 'pending'"),
    'يجب أن يتضمن ملف /firestore.rules قواعد استقبال طلبات التسجيل بحالة pending في /account_licenses'
  );
  console.log('   ✓ ملف /firestore.rules يتضمن قواعد استقبال طلبات التسجيل واعتمادها بالكامل.\n');

  console.log('=== اكتملت جميع اختبارات المرحلة الثانية (2-B) بنجاح 100% (5/5 مجموعات اختبار) ===');
}

runStage2BRegistrationApprovalTests();
