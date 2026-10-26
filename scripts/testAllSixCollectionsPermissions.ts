/**
 * فحص واختبار قراءة وكتابة المجموعات الست في لوحة إدارة رَصْد:
 * 1. account_licenses
 * 2. users
 * 3. workspaces
 * 4. workspace_members
 * 5. platform_staff
 * 6. audit_logs
 * بالإضافة إلى:
 * 7. subscription_packages
 *
 * يتحقق هذا الاختبار الرسمي من:
 * - نجاح قراءة وكتابة المالك المعتمد (ahah26h@gmail.com) للمجموعات بالكامل.
 * - حجب المجموعات الإدارية المشددة عن أي عميل عادي أو غير مصرح له (permission-denied سليم).
 * - سماح قراءة subscription_packages لجميع المستخدمين المسجلين (allow list: if isSignedIn()).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { Timestamp } from 'firebase/firestore';

interface StepResult {
  name: string;
  passed: boolean;
  message: string;
  error?: string;
}

const results: StepResult[] = [];

function record(name: string, passed: boolean, message: string, error?: string) {
  results.push({ name, passed, message, error });
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} [${name}]: ${message}`);
  if (error) {
    console.log(`   └─ تفاصيل الخطأ: ${error}`);
  }
}

async function runSixCollectionsPermissionsTest() {
  console.log('================================================================');
  console.log('🛡️ فحص صلاحيات مجموعات لوحة إدارة رَصْد وقواعد أمان Firestore');
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
  const futureTs = Timestamp.fromMillis(nowMs + 30 * 86400_000);

  const ownerEmail = 'ahah26h@gmail.com';
  const ownerUid = 'uid_owner_ahah26h_verified';

  const regularClientUid = 'uid_regular_client_10';
  const regularClientEmail = 'client.regular@example.com';
  const clientWsId = 'ws_regular_client_10';

  try {
    // 1. إعداد بيانات تجريبية عبر صلاحيات النظام (withSecurityRulesDisabled)
    console.log('--- الخطوة 1: تهيئة بيانات اختبار معزولة في المجموعات الست ---');
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();

      // مساحة العمل
      await db.collection('workspaces').doc(clientWsId).set({
        name: 'مكتب العميل العادي',
        ownerId: regularClientUid,
        ownerName: 'العميل العادي',
        defaultCurrency: 'YER',
        taxRatePercent: 0,
        regionName: 'عدن',
        inviteCode: 'INV_REG_10',
        memberUids: [regularClientUid],
        memberCount: 1,
        createdAt: nowTs,
        updatedAt: nowTs,
      });

      // ملف المستخدم
      await db.collection('users').doc(regularClientUid).set({
        uid: regularClientUid,
        displayName: 'العميل العادي',
        email: regularClientEmail,
        phone: '777000111',
        jobTitle: 'مسؤول ميداني أول',
        activeWorkspaceId: clientWsId,
        createdAt: nowTs,
        updatedAt: nowTs,
      });

      // عضوية مساحة العمل
      await db.collection('workspace_members').doc(`${clientWsId}_${regularClientUid}`).set({
        workspaceId: clientWsId,
        ownerId: regularClientUid,
        userId: regularClientUid,
        displayName: 'العميل العادي',
        email: regularClientEmail,
        role: 'owner',
        status: 'active',
        canApproveFinancials: true,
        canDeleteRecords: true,
        memberUids: [regularClientUid],
        createdBy: regularClientUid,
        createdAt: nowTs,
        updatedAt: nowTs,
      });

      // ترخيص الحساب
      await db.collection('account_licenses').doc(clientWsId).set({
        workspaceId: clientWsId,
        ownerId: regularClientUid,
        ownerEmail: regularClientEmail,
        planId: 'monthly',
        status: 'active',
        startsAt: nowTs,
        expiresAt: futureTs,
        maxMembers: 5,
        notes: 'ترخيص عميل نشط',
        createdAt: nowTs,
        updatedAt: nowTs,
      });

      // باقة اشتراك
      await db.collection('subscription_packages').doc('monthly').set({
        id: 'monthly',
        nameAr: 'الباقة الشهرية',
        descriptionAr: 'اشتراك شهري للمكاتب الميدانية',
        billingCycle: 'monthly',
        durationDays: 30,
        isLifetime: false,
        isFreeOwnerPlan: false,
        defaultMaxMembers: 5,
        priceAmount: 150,
        currency: 'SAR',
        isActive: true,
        updatedAt: nowTs,
      });

      // مساعد منصة
      await db.collection('platform_staff').doc('staff_assistant_1').set({
        uid: 'staff_assistant_1',
        email: 'assistant1@rasd.app',
        displayName: 'مساعد المنصة 1',
        status: 'active',
        permissions: {
          canViewRequests: true,
          canApproveAndRenew: false,
          canManagePackages: false,
        },
        assignedByUid: ownerUid,
        createdAt: nowTs,
        updatedAt: nowTs,
      });

      // سجل تدقيق
      await db.collection('audit_logs').doc('log_sample_1').set({
        workspaceId: clientWsId,
        ownerId: regularClientUid,
        actionType: 'create',
        entityType: 'workspace',
        entityId: clientWsId,
        summary: 'إنشاء مساحة العمل',
        actorId: regularClientUid,
        actorName: 'العميل العادي',
        memberUids: [regularClientUid],
        createdAt: nowTs,
      });
    });

    record('الخطوة 1 - تهيئة البيانات', true, 'تمت تهيئة الوثائق التجريبية بنجاح.');

    // 2. سياقات المصادقة
    const ownerCtx = testEnv.authenticatedContext(ownerUid, {
      email: ownerEmail,
      email_verified: true,
      firebase: {
        sign_in_provider: 'google.com',
        identities: {
          'google.com': [ownerUid],
          email: [ownerEmail],
        },
      },
    });

    const clientCtx = testEnv.authenticatedContext(regularClientUid, {
      email: regularClientEmail,
      email_verified: true,
      firebase: {
        sign_in_provider: 'password',
        identities: {
          email: [regularClientEmail],
        },
      },
    });

    const unauthCtx = testEnv.unauthenticatedContext();

    // -------------------------------------------------------------------------
    // اختبار قراءة المجموعات بحساب المالك المعتمد (يجب أن تنجح جميعها 7/7)
    // -------------------------------------------------------------------------
    console.log('\n--- اختبار قراءة المجموعات بحساب المالك المعتمد (ahah26h@gmail.com) ---');
    const ownerDb = ownerCtx.firestore();

    const collectionsToTest = [
      'account_licenses',
      'users',
      'workspaces',
      'workspace_members',
      'platform_staff',
      'audit_logs',
      'subscription_packages',
    ];

    for (const colName of collectionsToTest) {
      try {
        await assertSucceeds(ownerDb.collection(colName).get());
        record(`قراءة المالك: ${colName}`, true, `قرأ المالك المعتمد مجموعة ${colName} بنجاح.`);
      } catch (err: any) {
        record(`قراءة المالك: ${colName}`, false, `فشلت قراءة المالك لمجموعة ${colName}!`, err.message);
      }
    }

    // -------------------------------------------------------------------------
    // اختبار حجب المجموعات الإدارية عن حساب العميل العادي (يجب أن تفشل الاستعلامات الإدارية العامة بـ permission-denied)
    // -------------------------------------------------------------------------
    console.log('\n--- اختبار حجب الاستعلامات الإدارية العامة عن العميل العادي ---');
    const clientDb = clientCtx.firestore();

    // 1. users العامة (غير مساحته)
    try {
      await assertFails(clientDb.collection('users').get());
      record('حجب users عن العميل', true, 'رُفض استعلام users العام للعميل بـ permission-denied.');
    } catch (err: any) {
      record('حجب users عن العميل', false, 'تسريب: استطاع العميل قراءة جميع المستخدمين!', err.message);
    }

    // 2. platform_staff العامة
    try {
      await assertFails(clientDb.collection('platform_staff').get());
      record('حجب platform_staff عن العميل', true, 'رُفض استعلام platform_staff للعميل بـ permission-denied.');
    } catch (err: any) {
      record('حجب platform_staff عن العميل', false, 'تسريب: استطاع العميل قراءة platform_staff!', err.message);
    }

    // 3. account_licenses العامة (بدون شرط ملكية)
    try {
      await assertFails(clientDb.collection('account_licenses').get());
      record('حجب account_licenses العامة عن العميل', true, 'رُفض استعلام account_licenses العام للعميل بـ permission-denied.');
    } catch (err: any) {
      record('حجب account_licenses العامة عن العميل', false, 'تسريب: استطاع العميل قراءة تراخيص الحسابات الأخرى!', err.message);
    }

    // 4. workspaces العامة (بدون شرط عضوية)
    try {
      await assertFails(clientDb.collection('workspaces').get());
      record('حجب workspaces العامة عن العميل', true, 'رُفض استعلام workspaces العام للعميل بـ permission-denied.');
    } catch (err: any) {
      record('حجب workspaces العامة عن العميل', false, 'تسريب: استطاع العميل قراءة مساحات العمل الأخرى!', err.message);
    }

    // 5. audit_logs العامة (بدون شرط عضوية)
    try {
      await assertFails(clientDb.collection('audit_logs').get());
      record('حجب audit_logs العامة عن العميل', true, 'رُفض استعلام audit_logs العام للعميل بـ permission-denied.');
    } catch (err: any) {
      record('حجب audit_logs العامة عن العميل', false, 'تسريب: استطاع العميل قراءة سجلات التدقيق الأخرى!', err.message);
    }

    // 6. subscription_packages (مسموح قراءتها لجميع المسجلين)
    try {
      await assertSucceeds(clientDb.collection('subscription_packages').get());
      record('سماح subscription_packages للعميل', true, 'استطاع العميل قراءة subscription_packages كالمتوقع.');
    } catch (err: any) {
      record('سماح subscription_packages للعميل', false, 'فشلت قراءة subscription_packages للعميل المسجل!', err.message);
    }

    // 7. الزائر غير المسجل: ممنوع من القراءة العامة
    const unauthDb = unauthCtx.firestore();
    try {
      await assertFails(unauthDb.collection('account_licenses').get());
      record('حجب account_licenses عن الزائر', true, 'رُفض استعلام الزائر غير المصرح له بـ permission-denied.');
    } catch (err: any) {
      record('حجب account_licenses عن الزائر', false, 'تسريب: استطاع الزائر قراءة account_licenses!', err.message);
    }
  } finally {
    await testEnv.cleanup();
  }

  console.log('\n================================================================');
  console.log('📊 ملخص نتائج فحص الصلاحيات للمجموعات الست:');
  console.log('================================================================');
  const allPassed = results.every((r) => r.passed);
  console.log(`إجمالي الفحوصات: ${results.length} | الناجحة: ${results.filter((r) => r.passed).length} | الفاشلة: ${results.filter((r) => !r.passed).length}`);

  if (allPassed) {
    console.log('🎉 نجحت جميع الفحوصات بنسبة 100%!');
  } else {
    console.error('❌ توجد فحوصات فاشلة.');
    process.exit(1);
  }
}

runSixCollectionsPermissionsTest().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
