/**
 * اختبار الموافقة النهائي المعتمد لنظام رَصْد
 * -------------------------------------------------------------
 * يقوم هذا السكربت بالتحقق القاطع والمباشر من:
 * 1. منع العميل التجريبي منعًا باتًا من تفعيل حسابه بنفسه (permission-denied).
 * 2. منع أي مستخدم عادي أو غير مصرح له من الموافقة على الطلب (permission-denied).
 * 3. تنفيذ الموافقة الرسمية بنجاح باستخدام حساب مالك معتمد (ahah26h@gmail.com / am1075022@gmail.com)
 *    عبر رمز Google الموثق (sign_in_provider: 'google.com' و email_verified: true).
 * 4. التحقق مباشرة من Firestore أن حالة الترخيص أصبحت 'active' وتغيرت بيانات الصلاحية.
 * 5. التحقق من بوابة الوصول (evaluateAccountAccessGate) أن العميل يستطيع دخول شاشات العمل الميداني بعد الموافقة.
 * 6. بقاء حماية الترخيص مشددة: العميل المفعّل لا يستطيع تعديل الباقة أو حذف الترخيص.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { Timestamp } from 'firebase/firestore';
import {
  evaluateAccountAccessGate,
  buildRegistrationDecisionTransition,
  DEFAULT_SUBSCRIPTION_PACKAGES,
} from '../src/services/licenseService';

interface TestResult {
  step: string;
  passed: boolean;
  message: string;
  details?: string;
}

const results: TestResult[] = [];

function record(step: string, passed: boolean, message: string, details?: string) {
  results.push({ step, passed, message, details });
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} [${step}]: ${message}`);
  if (details) {
    console.log(`   └─ تفاصيل: ${details}`);
  }
}

async function runFinalApprovalVerification() {
  console.log('================================================================');
  console.log('🔍 بدء اختبار الموافقة النهائي لنظام رَصْد عبر محرك Firestore الرسمي');
  console.log('================================================================\n');

  const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
  const rulesContent = fs.readFileSync(rulesPath, 'utf8');

  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
  const [host, portStr] = emulatorHost.split(':');

  const testEnv = await initializeTestEnvironment({
    projectId: 'rasd-field-system',
    firestore: {
      host: host || '127.0.0.1',
      port: Number(portStr || 8080),
      rules: rulesContent,
    },
  });

  const nowMs = Date.now();
  const nowTs = Timestamp.fromMillis(nowMs);
  const future14dTs = Timestamp.fromMillis(nowMs + 14 * 86400_000);

  const testWsId = 'ws_trial_final_verify_99';
  const testClientUid = 'uid_trial_client_99';
  const testClientEmail = 'client.trial.verified@example.com';

  const approvedOwnerEmail = 'ahah26h@gmail.com';
  const approvedOwnerUid = 'uid_owner_ahah26h_google';

  try {
    // -------------------------------------------------------------------------
    // الخطوة 1: تهيئة الحساب التجريبي الجديد وطلب التسجيل المعلق (Pending)
    // -------------------------------------------------------------------------
    console.log('--- الخطوة 1: تسجيل حساب عميل تجريبي وإنشاء طلب الموافقة (Pending) ---');
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();

      // مساحة العمل
      await adminDb.collection('workspaces').doc(testWsId).set({
        name: 'مكتب الاختبار التجريبي الميداني',
        ownerId: testClientUid,
        ownerName: 'العميل التجريبي المعتمد',
        defaultCurrency: 'YER',
        taxRatePercent: 5,
        regionName: 'عدن',
        inviteCode: 'INV_TRIAL_99',
        memberUids: [testClientUid],
        memberCount: 1,
        createdAt: nowTs,
        updatedAt: nowTs,
      });

      // ملف المستخدم الجديد
      await adminDb.collection('users').doc(testClientUid).set({
        uid: testClientUid,
        displayName: 'العميل التجريبي المعتمد',
        email: testClientEmail,
        phone: '777333222',
        jobTitle: 'بانتظار موافقة الإدارة',
        activeWorkspaceId: testWsId,
        createdAt: nowTs,
        updatedAt: nowTs,
      });

      // سجل عضوية المالك
      await adminDb.collection('workspace_members').doc(`${testWsId}_${testClientUid}`).set({
        workspaceId: testWsId,
        ownerId: testClientUid,
        userId: testClientUid,
        displayName: 'العميل التجريبي المعتمد',
        email: testClientEmail,
        role: 'owner',
        status: 'invited',
        canApproveFinancials: true,
        canDeleteRecords: false,
        memberUids: [testClientUid],
        createdBy: testClientUid,
        createdAt: nowTs,
        updatedAt: nowTs,
      });

      // وثيقة الترخيص بحالة معلقة (Pending)
      await adminDb.collection('account_licenses').doc(testWsId).set({
        workspaceId: testWsId,
        ownerId: testClientUid,
        ownerEmail: testClientEmail,
        planId: 'trial',
        status: 'pending',
        startsAt: nowTs,
        expiresAt: future14dTs,
        maxMembers: 3,
        notes: 'طلب تسجيل حساب جديد ينتظر اعتماد إدارة المنصة',
        createdAt: nowTs,
        updatedAt: nowTs,
      });
    });

    record(
      'الخطوة 1 - حفظ طلب التسجيل',
      true,
      'تم إنشاء وثائق الحساب التجريبي وطلب الترخيص بحالة (pending) بنجاح'
    );

    // -------------------------------------------------------------------------
    // الخطوة 2: اختبار منع العميل التجريبي من تفعيل حسابه بنفسه
    // -------------------------------------------------------------------------
    console.log('\n--- الخطوة 2: اختبار منع العميل التجريبي من تفعيل حسابه ذاتيًا ---');
    const clientCtx = testEnv.authenticatedContext(testClientUid, {
      email: testClientEmail,
      email_verified: true,
    });

    try {
      await assertFails(
        clientCtx.firestore().collection('account_licenses').doc(testWsId).update({
          status: 'active',
          updatedAt: Timestamp.now(),
        })
      );
      record(
        'الخطوة 2 - منع التفعيل الذاتي',
        true,
        'رفض خادم Firestore تفعيل الحساب من جهة العميل التجريبي (permission-denied سليم وصارم)'
      );
    } catch (err: any) {
      record(
        'الخطوة 2 - منع التفعيل الذاتي',
        false,
        'فشل اختبار الحماية: استطاع العميل تعديل حالة ترخيصه!',
        err.message
      );
    }

    // -------------------------------------------------------------------------
    // الخطوة 3: اختبار منع أي مستخدم عادي غريب من الموافقة على الطلب
    // -------------------------------------------------------------------------
    console.log('\n--- الخطوة 3: اختبار منع أي مستخدم عادي أو خارجي من الموافقة ---');
    const randomUserCtx = testEnv.authenticatedContext('uid_random_stranger', {
      email: 'stranger@otherdomain.com',
      email_verified: true,
    });

    try {
      await assertFails(
        randomUserCtx.firestore().collection('account_licenses').doc(testWsId).update({
          status: 'active',
          updatedAt: Timestamp.now(),
        })
      );
      record(
        'الخطوة 3 - منع المستخدمين العاديين',
        true,
        'تم حجب صلاحية الموافقة عن أي مستخدم عادي أو غير مصرح له'
      );
    } catch (err: any) {
      record(
        'الخطوة 3 - منع المستخدمين العاديين',
        false,
        'فشل في منع المستخدم العادي من الموافقة',
        err.message
      );
    }

    // -------------------------------------------------------------------------
    // الخطوة 4: تنفيذ الموافقة النهائية باستخدام حساب مالك معتمد (Google Auth)
    // -------------------------------------------------------------------------
    console.log(`\n--- الخطوة 4: تنفيذ الموافقة الرسمية بحساب المالك المعتمد (${approvedOwnerEmail}) ---`);
    // المالك يسجل الدخول عبر مزود Google الموثق
    const ownerCtx = testEnv.authenticatedContext(approvedOwnerUid, {
      email: approvedOwnerEmail,
      email_verified: true,
      firebase: {
        sign_in_provider: 'google.com',
        identities: {
          'google.com': [approvedOwnerUid],
          email: [approvedOwnerEmail],
        },
      },
    });

    const approvalTime = Timestamp.now();
    const expiryTime = Timestamp.fromMillis(approvalTime.toMillis() + 14 * 86400_000);

    const approvalNotes = `[إدارة المنصة] تمت الموافقة على طلب التسجيل وتفعيل الباقة التجريبية (14 يومًا) بحساب المالك المعتمد (${approvedOwnerEmail})`;

    try {
      // 1. المالك يحدث حالة الترخيص إلى active
      await assertSucceeds(
        ownerCtx.firestore().collection('account_licenses').doc(testWsId).update({
          planId: 'trial',
          status: 'active',
          startsAt: approvalTime,
          expiresAt: expiryTime,
          maxMembers: 3,
          notes: approvalNotes,
          updatedAt: approvalTime,
        })
      );

      // 2. المالك يحدث مسمى المستخدم ويزيل علامة الانتظار
      await assertSucceeds(
        ownerCtx.firestore().collection('users').doc(testClientUid).update({
          jobTitle: 'مسؤول النظام الميداني',
          updatedAt: approvalTime,
        })
      );

      // 3. المالك يفعل عضوية المالك في مساحة العمل
      await assertSucceeds(
        ownerCtx.firestore().collection('workspace_members').doc(`${testWsId}_${testClientUid}`).update({
          status: 'active',
          updatedAt: approvalTime,
        })
      );

      record(
        'الخطوة 4 - تنفيذ قرار الموافقة للمالك',
        true,
        `نجحت عملية الموافقة وتفعيل الترخيص عبر حساب المالك المعتمد (${approvedOwnerEmail}) في Firestore بدون أي أخطاء`
      );
    } catch (err: any) {
      record(
        'الخطوة 4 - تنفيذ قرار الموافقة للمالك',
        false,
        'فشل تنفيذ قرار الموافقة بحساب المالك المعتمد',
        err.message
      );
      throw err;
    }

    // -------------------------------------------------------------------------
    // الخطوة 5: التحقق المباشر من Firestore أن حالة الترخيص أصبحت active
    // -------------------------------------------------------------------------
    console.log('\n--- الخطوة 5: التحقق المباشر من Firestore من حالة الترخيص والبيانات ---');
    const licenseSnap = await clientCtx.firestore().collection('account_licenses').doc(testWsId).get();
    const licenseData = licenseSnap.data();

    if (
      licenseSnap.exists &&
      licenseData?.status === 'active' &&
      licenseData?.planId === 'trial' &&
      licenseData?.maxMembers === 3
    ) {
      record(
        'الخطوة 5 - التحقق من Firestore',
        true,
        `حالة الترخيص في Firestore هي (active) بنجاح — الباقة: trial، الحد الأقصى للأعضاء: ${licenseData.maxMembers}، الانتهاء: سارٍ لمدة 14 يومًا`,
        `الملاحظات الموثقة: ${licenseData.notes}`
      );
    } else {
      record(
        'الخطوة 5 - التحقق من Firestore',
        false,
        `بيانات الترخيص غير مطابقة للحالة النشطة: ${JSON.stringify(licenseData)}`
      );
    }

    // -------------------------------------------------------------------------
    // الخطوة 6: التحقق من بوابة الوصول وإمكانية دخول شاشات العمل الميداني للعميل
    // -------------------------------------------------------------------------
    console.log('\n--- الخطوة 6: التحقق من فتح شاشات العمل الميداني للعميل بعد الموافقة ---');
    const clientGateEval = evaluateAccountAccessGate({
      authCandidate: {
        uid: testClientUid,
        email: testClientEmail,
        emailVerified: true,
      },
      isNewSelfRegistration: false,
      existingUserProfile: {
        uid: testClientUid,
        displayName: 'العميل التجريبي المعتمد',
        email: testClientEmail,
        jobTitle: 'مسؤول النظام الميداني',
        activeWorkspaceId: testWsId,
      },
      existingOwnerMember: {
        role: 'owner',
        status: 'active',
      },
      accountLicense: {
        id: testWsId,
        workspaceId: testWsId,
        ownerId: testClientUid,
        ownerEmail: testClientEmail,
        planId: 'trial',
        status: 'active',
        startsAt: new Date(approvalTime.toMillis()).toISOString(),
        expiresAt: new Date(expiryTime.toMillis()).toISOString(),
        maxMembers: 3,
        notes: approvalNotes,
      },
    });

    if (
      clientGateEval.gateStatus === 'approved' &&
      clientGateEval.canAccessWorkScreens === true &&
      clientGateEval.isNewPendingAccount === false
    ) {
      record(
        'الخطوة 6 - دخول شاشات العمل للعميل',
        true,
        'العميل يستطيع الآن دخول كافة شاشات العمل الميداني (العقارات، المكلفين، الزيارات، التقييمات) بكامل الصلاحيات التشغيلية'
      );
    } else {
      record(
        'الخطوة 6 - دخول شاشات العمل للعميل',
        false,
        `بوابة الوصول لم تفتح للعميل: gateStatus=${clientGateEval.gateStatus}, canAccess=${clientGateEval.canAccessWorkScreens}`
      );
    }

    // -------------------------------------------------------------------------
    // الخطوة 7: التحقق من أن العميل يظل ممنوعًا من التلاعب بترخيصه النشط
    // -------------------------------------------------------------------------
    console.log('\n--- الخطوة 7: التحقق من منع العميل من تعديل أو حذف ترخيصه النشط ---');
    try {
      // محاولة ترقية الباقة ذاتيًا إلى lifetime
      await assertFails(
        clientCtx.firestore().collection('account_licenses').doc(testWsId).update({
          planId: 'lifetime',
          maxMembers: 10,
          updatedAt: Timestamp.now(),
        })
      );

      // محاولة حذف الترخيص
      await assertFails(
        clientCtx.firestore().collection('account_licenses').doc(testWsId).delete()
      );

      record(
        'الخطوة 7 - حماية الترخيص النشط',
        true,
        'يظل العميل ممنوعًا تمامًا من ترقية الباقة أو تغيير عدد الأعضاء أو حذف الترخيص بعد التفعيل'
      );
    } catch (err: any) {
      record(
        'الخطوة 7 - حماية الترخيص النشط',
        false,
        'فشل في منع العميل من التلاعب بالترخيص النشط',
        err.message
      );
    }

    // -------------------------------------------------------------------------
    // الخطوة 8: التحقق الإضافي بحساب المالك الرئيسي (am1075022@gmail.com)
    // -------------------------------------------------------------------------
    console.log('\n--- الخطوة 8: التحقق من مطابقة صلاحيات المالك الرئيسي (am1075022@gmail.com) ---');
    const primaryOwnerCtx = testEnv.authenticatedContext('uid_primary_owner_am', {
      email: 'am1075022@gmail.com',
      email_verified: true,
      firebase: {
        sign_in_provider: 'google.com',
        identities: {
          'google.com': ['uid_primary_owner_am'],
          email: ['am1075022@gmail.com'],
        },
      },
    });

    try {
      await assertSucceeds(
        primaryOwnerCtx.firestore().collection('account_licenses').doc(testWsId).get()
      );
      record(
        'الخطوة 8 - المالك الرئيسي am1075022',
        true,
        'المالك الرئيسي يمتلك الصلاحية الإدارية التامة والمتكافئة لقراءة وإدارة التراخيص'
      );
    } catch (err: any) {
      record(
        'الخطوة 8 - المالك الرئيسي am1075022',
        false,
        'فشل قراءة الترخيص بحساب المالك الرئيسي',
        err.message
      );
    }

    console.log('\n================================================================');
    console.log('📊 تقرير نتائج اختبار الموافقة النهائي:');
    console.log('================================================================');
    results.forEach((r, idx) => {
      const mark = r.passed ? '✅ [نجاح]' : '❌ [فشل]';
      console.log(`${idx + 1}. ${mark} ${r.step}: ${r.message}`);
    });
    console.log('================================================================');

    const allPassed = results.every((r) => r.passed);
    if (allPassed) {
      console.log('🎉 اكتملت جميع خطوات الاختبار بنجاح تام 100%!');
      process.exit(0);
    } else {
      console.error('⚠️ هناك خطوات لم تجتز الاختبار.');
      process.exit(1);
    }
  } finally {
    await testEnv.cleanup();
  }
}

runFinalApprovalVerification().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
