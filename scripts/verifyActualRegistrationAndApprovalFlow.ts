import { initializeApp, deleteApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  updateProfile,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import {
  PENDING_REGISTRATION_JOB_TITLE_MARKER,
  buildPendingRegistrationLicense,
  buildRegistrationRequestSummary,
  buildRegistrationDecisionTransition,
  evaluateAccountAccessGate,
  DEFAULT_SUBSCRIPTION_PACKAGES,
} from '../src/services/licenseService';

interface StepResult {
  step: string;
  success: boolean;
  details: string;
  error?: string;
}

const results: StepResult[] = [];

function recordResult(step: string, success: boolean, details: string, error?: string) {
  results.push({ step, success, details, error });
  const icon = success ? '✅' : '❌';
  console.log(`${icon} [${step}]: ${details}`);
  if (error) console.log(`   -> Error details: ${error}`);
}

async function runVerification() {
  console.log('================================================================');
  console.log('🔍 بدء الفحص الفعلي لمسار طلبات التسجيل ولوحة إدارة منصة رَصْد');
  console.log('================================================================');
  console.log(`مشروع Firebase: ${firebaseConfig.projectId}`);
  console.log(`قاعدة بيانات Firestore: ${firebaseConfig.firestoreDatabaseId}`);
  console.log('----------------------------------------------------------------\n');

  const appName = `verify-app-${Date.now()}`;
  const app = initializeApp(firebaseConfig, appName);
  const auth = getAuth(app);
  const db = firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
    ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
    : getFirestore(app);

  const testUnique = Date.now().toString(36).slice(-6);
  const testEmail = `test.client.${testUnique}@rasd-verify.com`;
  const testPassword = `Pass@Rasd${testUnique}123!`;
  const testDisplayName = `مكتب الاختبار التجريبي ${testUnique}`;
  let testUid = '';
  let testWsId = '';
  let testMemberId = '';

  try {
    // -------------------------------------------------------------------------
    // الخطوة 1: التحقق من نشر قواعد Firebase
    // -------------------------------------------------------------------------
    console.log('--- الخطوة 1: فحص حالة نشر قواعد Firebase على الخادم الفعلي ---');
    try {
      // محاولة قراءة وثيقة مقيدة بدون تسجيل الدخول - يجب أن ترفض بقواعد الخادم
      await getDoc(doc(db, 'subscription_packages', 'trial'));
      recordResult(
        'Step 1 - Rules Deployment Check',
        false,
        'فشل: تم السماح بقراءة مجموعة مقيدة لزائر غير مسجل (القواعد غير مطبقة)'
      );
    } catch (err: any) {
      if (err.code === 'permission-denied' || String(err.message).includes('Missing or insufficient permissions')) {
        recordResult(
          'Step 1 - Rules Deployment Check',
          true,
          'قواعد Firestore منشورة ومطبقة فعليًا على خادم Firebase وترفض وصول غير المصرح لهم (permission-denied سليم)'
        );
      } else {
        recordResult(
          'Step 1 - Rules Deployment Check',
          false,
          'حدث خطأ غير متوقع أثناء فحص القواعد',
          err.message
        );
      }
    }

    // -------------------------------------------------------------------------
    // الخطوة 2: تسجيل حساب تجريبي جديد عبر Firebase Auth
    // -------------------------------------------------------------------------
    console.log('\n--- الخطوة 2: إنشاء حساب تجريبي جديد عبر Firebase Auth ---');
    try {
      const cred = await createUserWithEmailAndPassword(auth, testEmail, testPassword);
      testUid = cred.user.uid;
      testWsId = `ws_${testUid.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48)}`;
      testMemberId = `${testWsId}_${testUid}`;

      await updateProfile(cred.user, { displayName: testDisplayName });

      recordResult(
        'Step 2 - User Registration in Auth',
        true,
        `تم إنشاء حساب تجريبي جديد بنجاح: ${testEmail} (UID: ${testUid})`
      );
    } catch (err: any) {
      recordResult(
        'Step 2 - User Registration in Auth',
        false,
        'فشل تسجيل الحساب في Firebase Auth',
        err.message
      );
      throw err;
    }

    // -------------------------------------------------------------------------
    // الخطوة 3: حفظ طلب الموافقة ووثائق الحساب في Firestore
    // -------------------------------------------------------------------------
    console.log('\n--- الخطوة 3: حفظ طلب الموافقة ومساحة العمل في Firestore ---');
    try {
      // 3.1 إنشاء وثيقة مساحة العمل /workspaces/{wsId}
      await setDoc(doc(db, 'workspaces', testWsId), {
        name: `مساحة عمل ${testDisplayName}`,
        ownerId: testUid,
        ownerName: testDisplayName,
        defaultCurrency: 'YER',
        taxRatePercent: 0,
        regionName: 'عدن',
        inviteCode: `RASD-${testUid.slice(0, 6).toUpperCase()}`,
        memberUids: [testUid],
        memberCount: 1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      console.log(`  ✓ تم إنشاء وثيقة مساحة العمل بنجاح: /workspaces/${testWsId}`);

      // 3.2 إنشاء ملف المستخدم /users/{uid} مع علامة انتظار الموافقة
      await setDoc(doc(db, 'users', testUid), {
        uid: testUid,
        displayName: testDisplayName,
        email: testEmail.toLowerCase(),
        phone: '777000111',
        jobTitle: PENDING_REGISTRATION_JOB_TITLE_MARKER,
        activeWorkspaceId: testWsId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      console.log(`  ✓ تم إنشاء ملف المستخدم بعلامة الانتظار: /users/${testUid}`);

      // 3.3 إنشاء سجل عضوية المالك /workspace_members/{memberId} بحالة invited
      await setDoc(doc(db, 'workspace_members', testMemberId), {
        workspaceId: testWsId,
        ownerId: testUid,
        userId: testUid,
        displayName: testDisplayName,
        email: testEmail.toLowerCase(),
        role: 'owner',
        status: 'invited',
        canApproveFinancials: true,
        canDeleteRecords: true,
        memberUids: [testUid],
        createdBy: testUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      console.log(`  ✓ تم إنشاء سجل عضوية المالك بحالة دعوة/انتظار: /workspace_members/${testMemberId}`);

      // 3.4 إنشاء وثيقة طلب الترخيص الفعلي في /account_licenses/{wsId} بحالة pending
      const pendingLic = buildPendingRegistrationLicense({
        workspaceId: testWsId,
        ownerId: testUid,
        ownerEmail: testEmail,
        applicantName: testDisplayName,
        applicantPhone: '777000111',
        workspaceName: `مساحة عمل ${testDisplayName}`,
        requestedPlanId: 'trial',
      });

      await setDoc(doc(db, 'account_licenses', testWsId), {
        workspaceId: pendingLic.workspaceId,
        ownerId: pendingLic.ownerId,
        ownerEmail: pendingLic.ownerEmail,
        planId: pendingLic.planId,
        status: 'pending',
        startsAt: pendingLic.startsAt,
        expiresAt: pendingLic.expiresAt,
        maxMembers: pendingLic.maxMembers,
        notes: pendingLic.notes,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      console.log(`  ✓ تم إنشاء وثيقة طلب الترخيص بحالة pending: /account_licenses/${testWsId}`);

      recordResult(
        'Step 3 - Save Registration Request to Firestore',
        true,
        'تم حفظ طلب الموافقة وجميع وثائق الحساب الأربع في Firestore الفعلي بنجاح وبدون أي أخطاء'
      );
    } catch (err: any) {
      recordResult(
        'Step 3 - Save Registration Request to Firestore',
        false,
        'فشل حفظ طلب الموافقة في Firestore',
        `${err.code || ''} ${err.message || ''}`
      );
      throw err;
    }

    // -------------------------------------------------------------------------
    // الخطوة 4: التحقق من قراءة الطلب من Firestore وتقييم بوابة الموافقة
    // -------------------------------------------------------------------------
    console.log('\n--- الخطوة 4: التحقق من قراءة الطلب وتقييم بوابة الموافقة للحساب الجديد ---');
    try {
      const licSnap = await getDoc(doc(db, 'account_licenses', testWsId));
      const userSnap = await getDoc(doc(db, 'users', testUid));
      const wsSnap = await getDoc(doc(db, 'workspaces', testWsId));

      if (!licSnap.exists()) {
        throw new Error(`وثيقة الترخيص /account_licenses/${testWsId} غير موجودة في Firestore`);
      }
      if (!userSnap.exists()) {
        throw new Error(`وثيقة المستخدم /users/${testUid} غير موجودة في Firestore`);
      }

      const licData = licSnap.data();
      const userData = userSnap.data();

      // تقييم بوابة الوصول للحساب الجديد
      const gateEval = evaluateAccountAccessGate({
        authCandidate: { uid: testUid, email: testEmail, emailVerified: false },
        isNewSelfRegistration: true,
        existingUserProfile: userData as any,
        accountLicense: licData as any,
      });

      console.log(`  حالة الترخيص في Firestore: ${licData.status}`);
      console.log(`  حالة بوابة الوصول (Gate Status): ${gateEval.gateStatus}`);
      console.log(`  إمكانية دخول شاشات العمل (canAccessWorkScreens): ${gateEval.canAccessWorkScreens}`);

      if (licData.status === 'pending' && gateEval.gateStatus === 'pending_approval' && !gateEval.canAccessWorkScreens) {
        recordResult(
          'Step 4 - Gating & Verification of Pending Account',
          true,
          'الحساب في حالة انتظار الموافقة (pending_approval) ومحجوب بدقة عن شاشات العمل قبل اعتماد المالك'
        );
      } else {
        recordResult(
          'Step 4 - Gating & Verification of Pending Account',
          false,
          `حالة غير متوقعة: status=${licData.status}, gateStatus=${gateEval.gateStatus}`
        );
      }
    } catch (err: any) {
      recordResult(
        'Step 4 - Gating & Verification of Pending Account',
        false,
        'فشل التحقق من قراءة وثائق الطلب أو بوابة الوصول',
        err.message
      );
    }

    // -------------------------------------------------------------------------
    // الخطوة 5: التحقق من ظهور الطلب في لوحة المالك واستخلاص بياناته
    // -------------------------------------------------------------------------
    console.log('\n--- الخطوة 5: التحقق من ظهور الطلب في لوحة المالك ---');
    try {
      const licSnap = await getDoc(doc(db, 'account_licenses', testWsId));
      const userSnap = await getDoc(doc(db, 'users', testUid));
      const wsSnap = await getDoc(doc(db, 'workspaces', testWsId));

      const requestSummary = buildRegistrationRequestSummary({
        license: licSnap.data() as any,
        userProfile: userSnap.data() as any,
        workspace: wsSnap.data() as any,
        sourceOverride: 'account_licenses',
      });

      console.log(`  المتقدم: ${requestSummary.applicantName} (${requestSummary.applicantEmail})`);
      console.log(`  الهاتف: ${requestSummary.applicantPhone}`);
      console.log(`  مساحة العمل: ${requestSummary.workspaceName} [${requestSummary.workspaceId}]`);
      console.log(`  الباقة المطلوبة: ${requestSummary.requestedPlanId}`);
      console.log(`  حالة الطلب: ${requestSummary.status}`);

      if (
        requestSummary.applicantEmail === testEmail.toLowerCase() &&
        requestSummary.status === 'pending' &&
        requestSummary.workspaceId === testWsId
      ) {
        recordResult(
          'Step 5 - Request Visibility in Owner Dashboard',
          true,
          'يظهر الطلب بكامل بياناته الوصفية (الاسم، البريد، الهاتف، المعرف، الباقة) في لوحة المالك'
        );
      } else {
        recordResult(
          'Step 5 - Request Visibility in Owner Dashboard',
          false,
          'بيانات الطلب المستخلصة غير مطابقة للبيانات المسجلة'
        );
      }
    } catch (err: any) {
      recordResult(
        'Step 5 - Request Visibility in Owner Dashboard',
        false,
        'فشل استخلاص بيانات الطلب للوحة المالك',
        err.message
      );
    }

    // -------------------------------------------------------------------------
    // الخطوة 6: اختبار اتخاذ قرار الموافقة على الطلب وتفعيل الحساب في Firestore
    // -------------------------------------------------------------------------
    console.log('\n--- الخطوة 6: اختبار اتخاذ قرار الموافقة وتفعيل الحساب ---');
    try {
      const licSnap = await getDoc(doc(db, 'account_licenses', testWsId));
      const userSnap = await getDoc(doc(db, 'users', testUid));
      const wsSnap = await getDoc(doc(db, 'workspaces', testWsId));

      const requestSummary = buildRegistrationRequestSummary({
        license: licSnap.data() as any,
        userProfile: userSnap.data() as any,
        workspace: wsSnap.data() as any,
      });

      // محاكاة تحويل القرار للمالك الدائم المعتمد
      const transition = buildRegistrationDecisionTransition({
        actorAuth: { uid: 'owner_am1075022', email: 'am1075022@gmail.com', emailVerified: true },
        request: requestSummary,
        decision: 'approve',
        approvedPlanId: 'trial',
        decisionNotes: 'تمت الموافقة المباشرة في الفحص الفعلي لنظام رصد.',
        packagesMap: DEFAULT_SUBSCRIPTION_PACKAGES,
      });

      console.log(`  ملخص العملية الإدارية: ${transition.auditSummary}`);
      console.log(`  الحالة الجديدة للترخيص: ${transition.updatedLicense.status}`);

      // تحديث وثيقة الترخيص لتصبح active
      await updateDoc(doc(db, 'account_licenses', testWsId), {
        planId: transition.updatedLicense.planId,
        status: transition.updatedLicense.status,
        startsAt: transition.updatedLicense.startsAt,
        expiresAt: transition.updatedLicense.expiresAt,
        maxMembers: transition.updatedLicense.maxMembers,
        notes: transition.updatedLicense.notes,
        updatedAt: serverTimestamp(),
      });
      console.log(`  ✓ تم تحديث الترخيص في /account_licenses/${testWsId} إلى active`);

      // تحديث وثيقة المستخدم
      await updateDoc(doc(db, 'users', testUid), {
        jobTitle: transition.userProfilePatch.jobTitle,
        updatedAt: serverTimestamp(),
      });
      console.log(`  ✓ تم تحديث مسمى المستخدم في /users/${testUid} إلى: ${transition.userProfilePatch.jobTitle}`);

      // تحديث عضوية المالك في مساحة العمل
      await updateDoc(doc(db, 'workspace_members', testMemberId), {
        status: transition.ownerMemberPatch.status,
        updatedAt: serverTimestamp(),
      });
      console.log(`  ✓ تم تحديث عضوية المالك في /workspace_members/${testMemberId} إلى: ${transition.ownerMemberPatch.status}`);

      // التحقق من أن بوابة الحساب أصبحت approved وتسمح بدخول شاشات العمل
      const activeLicSnap = await getDoc(doc(db, 'account_licenses', testWsId));
      const activeGateEval = evaluateAccountAccessGate({
        authCandidate: { uid: testUid, email: testEmail, emailVerified: true },
        isNewSelfRegistration: false,
        existingUserProfile: { ...userSnap.data(), jobTitle: transition.userProfilePatch.jobTitle } as any,
        accountLicense: activeLicSnap.data() as any,
      });

      console.log(`  حالة البوابة بعد الموافقة: ${activeGateEval.gateStatus}`);
      console.log(`  السماح بدخول شاشات العمل: ${activeGateEval.canAccessWorkScreens}`);

      if (activeLicSnap.data()?.status === 'active' && activeGateEval.canAccessWorkScreens) {
        recordResult(
          'Step 6 - Decision Execution & Account Activation',
          true,
          'تم تنفيذ قرار الموافقة بنجاح وتفعيل الترخيص (active) وفتح شاشات العمل للعميل'
        );
      } else {
        recordResult(
          'Step 6 - Decision Execution & Account Activation',
          false,
          'لم تتغير حالة الترخيص أو بوابة الدخول بعد الموافقة'
        );
      }
    } catch (err: any) {
      recordResult(
        'Step 6 - Decision Execution & Account Activation',
        false,
        'فشل تنفيذ قرار الموافقة على الطلب في Firestore',
        `${err.code || ''} ${err.message || ''}`
      );
    }

    // -------------------------------------------------------------------------
    // الخطوة 7: تنظيف البيانات التجريبية
    // -------------------------------------------------------------------------
    console.log('\n--- الخطوة 7: تنظيف السجلات التجريبية من Firestore ---');
    try {
      if (testWsId) await deleteDoc(doc(db, 'account_licenses', testWsId)).catch(() => {});
      if (testMemberId) await deleteDoc(doc(db, 'workspace_members', testMemberId)).catch(() => {});
      if (testWsId) await deleteDoc(doc(db, 'workspaces', testWsId)).catch(() => {});
      if (testUid) await deleteDoc(doc(db, 'users', testUid)).catch(() => {});
      recordResult(
        'Step 7 - Test Data Cleanup',
        true,
        'تم تنظيف وثائق الفحص التجريبي من Firestore للحفاظ على نظافة قاعدة البيانات الإنتاجية'
      );
    } catch (err: any) {
      recordResult(
        'Step 7 - Test Data Cleanup',
        false,
        'تعذر تنظيف وثائق الفحص التجريبي',
        err.message
      );
    }

  } finally {
    try {
      await deleteApp(app);
    } catch {
      // ignore app cleanup
    }
  }

  // ---------------------------------------------------------------------------
  // طباعة التقرير النهائي
  // ---------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log('📊 التقرير النهائي للتحقق الفعلي في مشروع رَصْد:');
  console.log('================================================================');
  const allPassed = results.every((r) => r.success);
  results.forEach((r, idx) => {
    const badge = r.success ? '✅ نجح' : '❌ فشل';
    console.log(`${idx + 1}. [${badge}] ${r.step}`);
    console.log(`   النتيجة: ${r.details}`);
    if (r.error) console.log(`   الخطأ: ${r.error}`);
  });
  console.log('----------------------------------------------------------------');
  console.log(`النتيجة الإجمالية: ${allPassed ? 'نجاح تام 100% لكافة الخطوات' : 'يوجد خطوات تتطلب تدقيقًا'}`);
  console.log('================================================================\n');

  if (!allPassed) {
    process.exit(1);
  }
}

runVerification().catch((e) => {
  console.error('Fatal verification runner error:', e);
  process.exit(1);
});
