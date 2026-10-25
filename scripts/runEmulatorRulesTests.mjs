/**
 * أداة الاختبار الفعلي لقواعد Firestore باستخدام Firebase Emulator الرسمي
 * -----------------------------------------------------------------------
 * ملاحظة هامة (المرحلة 1B & 1C):
 * - تم تثبيت حزمة `@firebase/rules-unit-testing` في المشروع.
 * - لتشغيل محرك Firestore Emulator الرسمي (`cloud-firestore-emulator.jar`)، يشترط النظام وجود `Java JRE 11+`.
 * - في حال عدم توفر `java` في حاوية السحابة الحالية، يخرج السكربت برمز صريح ويعلن بوضوح أن اختبار المحاكي الرسمي لم يُنفذ بعد.
 *
 * أمر التشغيل عند توفر Java 11+:
 *   npx firebase emulators:exec --config firebase.emulator.json --only firestore --project rasd-stage1-test "node scripts/runEmulatorRulesTests.mjs"
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { Timestamp } from 'firebase/firestore';

async function main() {
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
  const rulesPath = path.resolve(process.cwd(), 'DRAFT_firestore.rules');
  const rulesContent = fs.readFileSync(rulesPath, 'utf8');

  // التحقق الصريح من توفر Java JRE أو اتصال المحاكي قبل الادعاء بنجاح الاختبار
  try {
    execSync('java -version', { stdio: 'ignore' });
  } catch {
    console.error(
      '❌ [Emulator Prerequisite Missing] بيئة Java JRE (الإصدار 11+) غير متوفرة في حاوية التشغيل الحالية (sh: java: not found).'
    );
    console.error(
      '⚠️ حزمة @firebase/rules-unit-testing مثبتة وجاهزة، ولكن لا يمكن تشغيل cloud-firestore-emulator.jar بدون Java JRE. لذلك لا يُعتبر اختبار المحاكي الرسمي منفذًا بعد.'
    );
    process.exit(2);
  }

  const [host, portStr] = emulatorHost.split(':');
  const nowTs = Timestamp.now();
  const futureTs = Timestamp.fromMillis(Date.now() + 30 * 86400_000);
  const pastTs = Timestamp.fromMillis(Date.now() - 86400_000);

  const testEnv = await initializeTestEnvironment({
    projectId: 'rasd-stage1-isolated-test',
    firestore: {
      host,
      port: Number(portStr || 8080),
      rules: rulesContent,
    },
  });

  try {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();

      // 1. مساحة عمل عميل مفعّل (باستخدام الحقل المعتمد ownerId ودون حقن id داخل الوثيقة)
      await adminDb.collection('workspaces').doc('ws_active').set({
        name: 'مكتب عدن المفعّل',
        ownerId: 'client_active_uid',
        ownerName: 'عميل عدن',
        defaultCurrency: 'YER',
        taxRatePercent: 5,
        regionName: 'عدن',
        inviteCode: 'INV_ADEN_01',
        memberUids: ['client_active_uid', 'team_assistant_uid'],
        memberCount: 2,
        createdAt: nowTs,
        updatedAt: nowTs,
      });

      await adminDb.collection('account_licenses').doc('ws_active').set({
        workspaceId: 'ws_active',
        ownerId: 'client_active_uid',
        ownerEmail: 'active@example.com',
        planId: 'plan_annual',
        status: 'active',
        startsAt: nowTs,
        expiresAt: futureTs,
        maxMembers: 10,
        notes: 'اشتراك سنوي سارٍ',
        createdAt: nowTs,
        updatedAt: nowTs,
      });

      await adminDb.collection('workspace_members').doc('ws_active_team_assistant_uid').set({
        workspaceId: 'ws_active',
        ownerId: 'client_active_uid',
        userId: 'team_assistant_uid',
        displayName: 'مساعد ميداني',
        email: 'assistant@example.com',
        role: 'field_assistant',
        status: 'active',
        canApproveFinancials: false,
        canDeleteRecords: false,
        memberUids: ['client_active_uid', 'team_assistant_uid'],
        createdBy: 'client_active_uid',
        createdAt: nowTs,
        updatedAt: nowTs,
      });

      // 2. مساحة عمل عميل منتهي الاشتراك (بياناته محفوظة للقراءة، والكتابة موقوفة)
      await adminDb.collection('workspaces').doc('ws_expired').set({
        name: 'مكتب المكلا المنتهي',
        ownerId: 'client_expired_uid',
        ownerName: 'عميل المكلا',
        defaultCurrency: 'SAR',
        taxRatePercent: 5,
        regionName: 'المكلا',
        inviteCode: 'INV_MUK_02',
        memberUids: ['client_expired_uid'],
        memberCount: 1,
        createdAt: nowTs,
        updatedAt: nowTs,
      });

      await adminDb.collection('account_licenses').doc('ws_expired').set({
        workspaceId: 'ws_expired',
        ownerId: 'client_expired_uid',
        ownerEmail: 'expired@example.com',
        planId: 'plan_monthly',
        status: 'expired',
        startsAt: pastTs,
        expiresAt: pastTs,
        maxMembers: 5,
        notes: 'اشتراك منتهي',
        createdAt: pastTs,
        updatedAt: pastTs,
      });

      await adminDb.collection('taxpayers').doc('tx_expired_1').set({
        workspaceId: 'ws_expired',
        ownerId: 'client_expired_uid',
        fullName: 'مكلف محفوظ البيانات',
        internalCode: 'TX-EXP-1',
        nationalOrCommercialId: '100200300',
        phone: '+967770000000',
        email: 'tp@example.com',
        address: 'المكلا - الديس',
        region: 'المكلا',
        status: 'active',
        notes: 'سجل محفوظ للقراءة بعد انتهاء الاشتراك',
        memberUids: ['client_expired_uid'],
        createdBy: 'client_expired_uid',
        createdByName: 'عميل المكلا',
        createdAt: pastTs,
        updatedAt: pastTs,
      });

      // 3. مساعد منصة بصلاحية الاطلاع فقط دون الموافقة
      await adminDb.collection('platform_staff').doc('staff_viewer_uid').set({
        uid: 'staff_viewer_uid',
        email: 'staff@example.com',
        displayName: 'مساعد مراجعة الطلبات',
        status: 'active',
        permissions: {
          canViewRequests: true,
          canApproveAndRenew: false,
          canManagePackages: false,
        },
        assignedByUid: 'owner_primary_uid',
        createdAt: nowTs,
        updatedAt: nowTs,
      });
    });

    // أ) المالك الرئيسي (am1075022@gmail.com)
    const primaryOwnerCtx = testEnv.authenticatedContext('owner_primary_uid', {
      email: 'am1075022@gmail.com',
      email_verified: true,
    });
    await assertSucceeds(
      primaryOwnerCtx.firestore().collection('account_licenses').doc('ws_expired').get()
    );

    // ب) المالك الاحتياطي (ahah26h@gmail.com) بصلاحيات كاملة مساوية
    const backupOwnerCtx = testEnv.authenticatedContext('owner_backup_uid', {
      email: 'ahah26h@gmail.com',
      email_verified: true,
    });
    await assertSucceeds(
      backupOwnerCtx.firestore().collection('account_licenses').doc('ws_active').get()
    );

    // ج) مستخدم جديد غير موافق عليه لا يستطيع تفعيل نفسه كـ active
    const pendingUserCtx = testEnv.authenticatedContext('new_user_uid', {
      email: 'newclient@example.com',
      email_verified: true,
    });
    await assertFails(
      pendingUserCtx.firestore().collection('account_licenses').doc('ws_new').set({
        workspaceId: 'ws_new',
        ownerId: 'new_user_uid',
        ownerEmail: 'newclient@example.com',
        planId: 'plan_pro',
        status: 'active',
        startsAt: nowTs,
        expiresAt: futureTs,
        maxMembers: 10,
        notes: 'محاولة تفعيل ذاتي غير مصرح بها',
        createdAt: nowTs,
        updatedAt: nowTs,
      })
    );

    // د) العميل المنتهي: يستطيع قراءة بياناته المحفوظة، ولا يستطيع الحذف أو التعديل
    const expiredClientCtx = testEnv.authenticatedContext('client_expired_uid', {
      email: 'expired@example.com',
      email_verified: true,
    });
    await assertSucceeds(
      expiredClientCtx.firestore().collection('taxpayers').doc('tx_expired_1').get()
    );
    await assertFails(
      expiredClientCtx.firestore().collection('taxpayers').doc('tx_expired_1').delete()
    );

    // هـ) مساعد المنصة: يقرأ الطلبات المسموحة له، ويفشل في ترقية صلاحياته بنفسه
    const staffCtx = testEnv.authenticatedContext('staff_viewer_uid', {
      email: 'staff@example.com',
      email_verified: true,
    });
    await assertSucceeds(
      staffCtx.firestore().collection('account_licenses').doc('ws_active').get()
    );
    await assertFails(
      staffCtx.firestore().collection('platform_staff').doc('staff_viewer_uid').delete()
    );

    console.log('✅ جميع اختبارات المحاكي الرسمي (@firebase/rules-unit-testing) اجتازت بنجاح.');
  } finally {
    await testEnv.cleanup();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
