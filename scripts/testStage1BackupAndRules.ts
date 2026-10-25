import fs from 'node:fs';
import path from 'node:path';
import { Timestamp, GeoPoint, Bytes, Firestore } from 'firebase/firestore';
import { db, FIREBASE_PROJECT_ID } from '../src/services/firebase';
import {
  BACKUP_WORKSPACE_COLLECTIONS,
  OFFICIAL_ALLOWED_SCHEMA_FIELDS,
  APPROVED_GENERAL_PROPERTY_ID,
  APPROVED_GENERAL_TAXPAYER_ID,
  APPROVED_GENERAL_ASSESSMENT_ID,
  buildBackupPayloadFromRawData,
  verifyBackupIntegrity,
  restoreBackupToSandbox,
  restoreBackupToIsolatedFirestore,
  isForbiddenSecretFieldName,
  InMemoryFirestoreSandbox,
  BackupCollectionName,
} from '../src/services/backupService';

interface Stage1Assertion {
  id: string;
  category:
    | 'backup_completeness'
    | 'owner_id_alignment'
    | 'timestamp_and_types'
    | 'envelope_id_separation'
    | 'immutable_records_safety'
    | 'production_write_block'
    | 'secret_sanitization'
    | 'relational_integrity'
    | 'isolated_restore'
    | 'rules_alignment';
  title: string;
  passed: boolean;
  evidence: string;
}

const assertions: Stage1Assertion[] = [];

function recordAssertion(
  id: string,
  category: Stage1Assertion['category'],
  title: string,
  condition: boolean,
  evidence: string
) {
  assertions.push({ id, category, title, passed: Boolean(condition), evidence });
  if (!condition) {
    console.error(`❌ [FAIL] ${id} - ${title}: ${evidence}`);
  } else {
    console.log(`✅ [PASS] ${id} - ${title}: ${evidence}`);
  }
}

async function runStage1Tests() {
  console.log('====================================================================');
  console.log('بدء اختبارات المرحلة الأولى المحدّثة (Stage 1A / 1B / 1C)');
  console.log('====================================================================\n');

  const tsCreated = Timestamp.fromDate(new Date('2026-10-01T08:00:00.000Z'));
  const tsUpdated = Timestamp.fromDate(new Date('2026-10-20T14:30:00.000Z'));
  const sampleGeo = new GeoPoint(12.7855, 45.0187);
  const sampleBytes = Bytes.fromUint8Array(new Uint8Array([114, 97, 115, 100]));

  // 1. بناء بيانات اختبارية مطابقة لمخطط الإنتاج الفعلي (ownerId، الأدوار المعتمدة، كائنات Timestamp حقيقية، ومخطط appointments الرسمي)
  const rawTestCollections: Partial<Record<BackupCollectionName, Record<string, unknown>[]>> = {
    users: [
      {
        id: 'uid_owner_primary',
        uid: 'uid_owner_primary',
        email: 'am1075022@gmail.com',
        displayName: 'المالك الرئيسي',
        phone: '+967770000001',
        jobTitle: 'مدير المنصة',
        activeWorkspaceId: 'ws_aden_01',
        createdAt: tsCreated,
        updatedAt: tsUpdated,
        privateKey: 'SHOULD_BE_STRIPPED_123',
        accessToken: 'SHOULD_BE_STRIPPED_TOKEN',
      },
      {
        id: 'uid_owner_backup',
        uid: 'uid_owner_backup',
        email: 'ahah26h@gmail.com',
        displayName: 'المالك الاحتياطي',
        phone: '+967770000002',
        jobTitle: 'مدير المنصة الاحتياطي',
        activeWorkspaceId: 'ws_aden_01',
        createdAt: tsCreated,
        updatedAt: tsUpdated,
      },
      {
        id: 'uid_client_mukalla',
        uid: 'uid_client_mukalla',
        email: 'client.mukalla@example.com',
        displayName: 'عميل مكتب المكلا',
        phone: '+967770000003',
        jobTitle: 'مدير مكتب',
        activeWorkspaceId: 'ws_mukalla_02',
        createdAt: tsCreated,
        updatedAt: tsUpdated,
        password: 'PLAIN_PASSWORD_MUST_BE_REMOVED',
      },
    ],
    workspaces: [
      {
        id: 'ws_aden_01',
        name: 'مكتب رصد عدن المركزي',
        ownerId: 'uid_owner_primary',
        ownerName: 'المالك الرئيسي',
        memberUids: ['uid_owner_primary', 'uid_owner_backup'],
        memberCount: 2,
        defaultCurrency: 'YER',
        taxRatePercent: 5,
        regionName: 'عدن',
        inviteCode: 'INV_ADEN_1',
        createdAt: tsCreated,
        updatedAt: tsUpdated,
        vapidPrivateKey: 'SECRET_VAPID_KEY_MUST_NOT_LEAK',
      },
      {
        id: 'ws_mukalla_02',
        name: 'مكتب رصد المكلا الميداني',
        ownerId: 'uid_client_mukalla',
        ownerName: 'عميل مكتب المكلا',
        memberUids: ['uid_client_mukalla'],
        memberCount: 1,
        defaultCurrency: 'SAR',
        taxRatePercent: 10,
        regionName: 'حضرموت - المكلا',
        inviteCode: 'INV_MUK_2',
        createdAt: tsCreated,
        updatedAt: tsUpdated,
      },
    ],
    workspace_members: [
      {
        id: 'ws_aden_01_uid_owner_primary',
        workspaceId: 'ws_aden_01',
        ownerId: 'uid_owner_primary',
        userId: 'uid_owner_primary',
        displayName: 'المالك الرئيسي',
        email: 'am1075022@gmail.com',
        role: 'owner',
        status: 'active',
        canApproveFinancials: true,
        canDeleteRecords: true,
        memberUids: ['uid_owner_primary', 'uid_owner_backup'],
        createdBy: 'uid_owner_primary',
        createdAt: tsCreated,
        updatedAt: tsUpdated,
      },
      {
        id: 'ws_mukalla_02_uid_client_mukalla',
        workspaceId: 'ws_mukalla_02',
        ownerId: 'uid_client_mukalla',
        userId: 'uid_client_mukalla',
        displayName: 'عميل مكتب المكلا',
        email: 'client.mukalla@example.com',
        role: 'field_assistant',
        status: 'active',
        canApproveFinancials: false,
        canDeleteRecords: false,
        memberUids: ['uid_client_mukalla'],
        createdBy: 'uid_client_mukalla',
        createdAt: tsCreated,
        updatedAt: tsUpdated,
      },
    ],
    taxpayers: [
      {
        id: 'tx_aden_101',
        workspaceId: 'ws_aden_01',
        ownerId: 'uid_owner_primary',
        internalCode: 'TX-ADEN-101',
        fullName: 'شركة الميناء التجارية',
        nationalOrCommercialId: 'CR-101',
        phone: '+967771112223',
        email: 'info@mina.example',
        address: 'عدن - كريتر',
        region: 'كريتر',
        status: 'active',
        notes: 'مكلف ملتزم',
        memberUids: ['uid_owner_primary', 'uid_owner_backup'],
        createdBy: 'uid_owner_primary',
        createdByName: 'المالك الرئيسي',
        createdAt: tsCreated,
        updatedAt: tsUpdated,
      },
      {
        id: 'tx_mukalla_201',
        workspaceId: 'ws_mukalla_02',
        ownerId: 'uid_client_mukalla',
        internalCode: 'TX-MUK-201',
        fullName: 'مؤسسة الساحل العقارية',
        nationalOrCommercialId: 'CR-201',
        phone: '+967774445556',
        email: 'info@sahel.example',
        address: 'المكلا - فوه',
        region: 'فوه',
        status: 'active',
        notes: '',
        memberUids: ['uid_client_mukalla'],
        createdBy: 'uid_client_mukalla',
        createdByName: 'عميل مكتب المكلا',
        createdAt: tsCreated,
        updatedAt: tsUpdated,
      },
    ],
    properties: [
      {
        id: 'prop_aden_501',
        workspaceId: 'ws_aden_01',
        ownerId: 'uid_owner_primary',
        code: 'PR-501',
        title: 'برج الميناء التجاري',
        taxpayerId: 'tx_aden_101',
        taxpayerName: 'شركة الميناء التجارية',
        propertyType: 'commercial',
        status: 'active',
        region: 'كريتر',
        address: 'الشارع الرئيسي',
        latitude: 12.7855,
        longitude: 45.0187,
        hasCoordinates: true,
        geoLocation: sampleGeo,
        binaryHash: sampleBytes,
        areaSqm: 450,
        unitsCount: 4,
        notes: '',
        memberUids: ['uid_owner_primary', 'uid_owner_backup'],
        createdBy: 'uid_owner_primary',
        createdByName: 'المالك الرئيسي',
        createdAt: tsCreated,
        updatedAt: tsUpdated,
      },
      {
        id: 'prop_mukalla_601',
        workspaceId: 'ws_mukalla_02',
        ownerId: 'uid_client_mukalla',
        code: 'PR-601',
        title: 'مجمع الساحل السكني',
        taxpayerId: 'tx_mukalla_201',
        taxpayerName: 'مؤسسة الساحل العقارية',
        propertyType: 'residential',
        status: 'active',
        region: 'فوه',
        address: 'حي الإنشاءات',
        latitude: 14.5425,
        longitude: 49.1242,
        hasCoordinates: true,
        areaSqm: 600,
        unitsCount: 6,
        notes: '',
        memberUids: ['uid_client_mukalla'],
        createdBy: 'uid_client_mukalla',
        createdByName: 'عميل مكتب المكلا',
        createdAt: tsCreated,
        updatedAt: tsUpdated,
      },
    ],
    property_units: [
      {
        id: 'unit_aden_901',
        workspaceId: 'ws_aden_01',
        ownerId: 'uid_owner_primary',
        propertyId: 'prop_aden_501',
        propertyTitle: 'برج الميناء التجاري',
        taxpayerId: 'tx_aden_101',
        unitNumber: 'G-01',
        unitType: 'shop',
        floor: 'الأرضي',
        areaSqm: 45,
        occupancyStatus: 'occupied',
        tenantName: 'معرض الخليج',
        annualRentEstimate: 1200000,
        notes: '',
        memberUids: ['uid_owner_primary', 'uid_owner_backup'],
        createdBy: 'uid_owner_primary',
        createdAt: tsCreated,
        updatedAt: tsUpdated,
      },
    ],
    field_visits: [
      {
        id: 'visit_aden_701',
        workspaceId: 'ws_aden_01',
        ownerId: 'uid_owner_primary',
        propertyId: 'prop_aden_501',
        propertyTitle: 'برج الميناء التجاري',
        taxpayerId: 'tx_aden_101',
        taxpayerName: 'شركة الميناء التجارية',
        visitDate: '2026-10-20',
        visitTime: '09:30',
        purpose: 'periodic_inspection',
        status: 'completed',
        latitude: 12.7855,
        longitude: 45.0187,
        hasCoordinates: true,
        photoSummary: '',
        notes: 'تمت المعاينة الميدانية',
        memberUids: ['uid_owner_primary', 'uid_owner_backup'],
        officerId: 'uid_owner_primary',
        officerName: 'المالك الرئيسي',
        createdAt: tsCreated,
        updatedAt: tsUpdated,
      },
    ],
    appointments: [
      {
        id: 'appt_aden_801',
        workspaceId: 'ws_aden_01',
        ownerId: 'uid_owner_primary',
        title: 'موعد تحصيل برج الميناء',
        propertyId: 'prop_aden_501',
        propertyTitle: 'برج الميناء التجاري',
        taxpayerId: 'tx_aden_101',
        taxpayerName: 'شركة الميناء التجارية',
        scheduledDate: '2026-10-21',
        scheduledTime: '10:00',
        locationText: 'كريتر',
        status: 'completed',
        postponeCount: 1,
        lastPostponeReason: 'طلب المكلف تأجيل الموعد ليومين',
        notes: 'مرتبط بالزيارة الميدانية visit_aden_701',
        memberUids: ['uid_owner_primary', 'uid_owner_backup'],
        createdBy: 'uid_owner_primary',
        createdByName: 'المالك الرئيسي',
        createdAt: tsCreated,
        updatedAt: tsUpdated,
      },
    ],
    appointment_postponements: [
      {
        id: 'post_aden_851',
        workspaceId: 'ws_aden_01',
        ownerId: 'uid_owner_primary',
        appointmentId: 'appt_aden_801',
        previousDate: '2026-10-19',
        previousTime: '10:00',
        newDate: '2026-10-21',
        newTime: '10:00',
        reason: 'طلب المكلف تأجيل الموعد ليومين',
        memberUids: ['uid_owner_primary', 'uid_owner_backup'],
        createdBy: 'uid_owner_primary',
        createdByName: 'المالك الرئيسي',
        createdAt: tsCreated,
      },
    ],
    financial_assessments: [
      {
        id: 'assess_aden_301',
        workspaceId: 'ws_aden_01',
        ownerId: 'uid_owner_primary',
        propertyId: 'prop_aden_501',
        propertyTitle: 'برج الميناء التجاري',
        taxpayerId: 'tx_aden_101',
        taxpayerName: 'شركة الميناء التجارية',
        amount: 12500,
        currency: 'YER',
        periodLabel: '2026-Q4',
        assessmentDate: '2026-10-20',
        status: 'approved',
        notes: '',
        memberUids: ['uid_owner_primary', 'uid_owner_backup'],
        createdBy: 'uid_owner_primary',
        createdByName: 'المالك الرئيسي',
        createdAt: tsCreated,
        updatedAt: tsUpdated,
      },
    ],
    financial_transactions: [
      {
        id: 'fin_tx_aden_401',
        workspaceId: 'ws_aden_01',
        ownerId: 'uid_owner_primary',
        propertyId: 'prop_aden_501',
        propertyTitle: 'برج الميناء التجاري',
        taxpayerId: 'tx_aden_101',
        taxpayerName: 'شركة الميناء التجارية',
        assessmentId: 'assess_aden_301',
        amount: 12500,
        currency: 'YER',
        transactionType: 'payment',
        transactionDate: '2026-10-21',
        referenceNumber: 'REC-401',
        status: 'approved',
        notes: '',
        memberUids: ['uid_owner_primary', 'uid_owner_backup'],
        createdBy: 'uid_owner_primary',
        createdByName: 'المالك الرئيسي',
        createdAt: tsCreated,
        updatedAt: tsUpdated,
      },
    ],
    notifications: [
      {
        id: 'notif_aden_11',
        workspaceId: 'ws_aden_01',
        ownerId: 'uid_owner_primary',
        title: 'تم اعتماد التقييم المالي',
        message: 'تم اعتماد التقييم المالي لبرج الميناء',
        category: 'finance',
        isRead: false,
        memberUids: ['uid_owner_primary', 'uid_owner_backup'],
        createdBy: 'uid_owner_primary',
        createdAt: tsCreated,
        updatedAt: tsUpdated,
      },
    ],
    audit_logs: [
      {
        id: 'audit_aden_99',
        workspaceId: 'ws_aden_01',
        ownerId: 'uid_owner_primary',
        actionType: 'approve',
        entityType: 'assessment',
        entityId: 'assess_aden_301',
        summary: 'اعتماد التقييم المالي رقم assess_aden_301',
        actorId: 'uid_owner_primary',
        actorName: 'المالك الرئيسي',
        memberUids: ['uid_owner_primary', 'uid_owner_backup'],
        createdAt: tsCreated,
      },
    ],
  };

  // بناء حزمة النسخة الاحتياطية
  const backupPayload = buildBackupPayloadFromRawData({
    rawCollections: rawTestCollections,
    createdByUid: 'uid_owner_primary',
    createdByEmail: 'am1075022@gmail.com',
    scopeMode: 'all_accessible_workspaces',
    targetWorkspaceId: null,
    projectId: 'rasd-isolated-test',
    databaseId: 'isolated-db-stage1',
  });

  // التحقق من مطابقة مفاتيح appointments للمخطط الفعلي في /firestore.rules (18 حقلًا فقط دون linkedVisitId)
  const expectedAppointmentKeys = [
    'workspaceId',
    'ownerId',
    'title',
    'propertyId',
    'propertyTitle',
    'taxpayerId',
    'taxpayerName',
    'scheduledDate',
    'scheduledTime',
    'locationText',
    'status',
    'postponeCount',
    'lastPostponeReason',
    'notes',
    'memberUids',
    'createdBy',
    'createdByName',
    'createdAt',
    'updatedAt',
  ].sort();
  const actualAppointmentKeys = Object.keys(backupPayload.data.appointments[0].docData).sort();
  const appointmentSchemaExactMatch =
    actualAppointmentKeys.length === expectedAppointmentKeys.length &&
    actualAppointmentKeys.every((k, i) => k === expectedAppointmentKeys[i]) &&
    !Object.prototype.hasOwnProperty.call(
      backupPayload.data.appointments[0].docData,
      'linkedVisitId'
    );

  // التحقق 1: التصنيف الصريح كنسخة بيانات تشغيلية جزئية وشمول الـ 13 مجموعة وتوثيق الـ 7 فئات المستثناة ومطابقة مخطط appointments
  const expectedColCount = BACKUP_WORKSPACE_COLLECTIONS.length + 1;
  recordAssertion(
    'S1A-01',
    'backup_completeness',
    'تصنيف النسخة كبيانات تشغيلية جزئية (isFullDisasterRecovery: false) وشمول الـ 13 مجموعة ومطابقة مخطط appointments الفعلي',
    backupPayload.backupClassification === 'operational_firestore_data_partial' &&
      backupPayload.isFullDisasterRecovery === false &&
      backupPayload.scopeDisclosure.includedCollections.length === expectedColCount &&
      backupPayload.scopeDisclosure.excludedCollectionsAndData.length === 7 &&
      backupPayload.manifest.totalDocuments === 19 &&
      appointmentSchemaExactMatch,
    `التصنيف=${backupPayload.backupClassification}، المجموعات=${backupPayload.scopeDisclosure.includedCollections.length}، مطابقة مخطط appointments (18 حقلًا بدون linkedVisitId)=${appointmentSchemaExactMatch}`
  );

  // التحقق 2: فصل معرف الوثيقة (docId) في الغلاف الخارجي عن المحتوى (docData) وعدم وجود حقل id داخل الوثائق
  const allEnvelopesClean = Object.values(backupPayload.data).every((envelopes) =>
    envelopes.every(
      (env) =>
        typeof env.docId === 'string' &&
        env.docId.length > 0 &&
        !Object.prototype.hasOwnProperty.call(env.docData, 'id')
    )
  );
  recordAssertion(
    'S1A-02',
    'envelope_id_separation',
    'فصل معرفات الوثائق (docId) في غلاف النسخة الاحتياطية وعدم حقن الحقل id داخل محتوى الوثيقة (docData)',
    allEnvelopesClean,
    `خلو جميع الوثائق الـ ${backupPayload.manifest.totalDocuments} من حقل id داخل docData=${allEnvelopesClean}`
  );

  // التحقق 3: رفض أي نسخة احتياطية يتسرب فيها حقل id غير معتمد إلى docData أو يُستخدم فيها ownerUid بدل ownerId
  const leakedIdPayload = JSON.parse(JSON.stringify(backupPayload));
  leakedIdPayload.data.taxpayers[0].docData.id = 'leaked_id_value';
  leakedIdPayload.data.workspaces[0].docData.ownerUid = 'wrong_owner_uid_field';
  delete leakedIdPayload.data.workspaces[0].docData.ownerId;
  const leakedReport = verifyBackupIntegrity(leakedIdPayload);
  recordAssertion(
    'S1A-03',
    'owner_id_alignment',
    'اكتشاف ورفض تسرب الحقل id داخل docData أو استخدام ownerUid بدلاً من ownerId',
    !leakedReport.isValid &&
      leakedReport.unapprovedIdFieldLeaks.length === 1 &&
      leakedReport.invalidOwnerIdRecords.length >= 1,
    `تسرب id المكتشف=${leakedReport.unapprovedIdFieldLeaks.length}، أخطاء ownerId المكتشفة=${leakedReport.invalidOwnerIdRecords.length}`
  );

  // التحقق 4: تصدير الطوابع الزمنية كأنواع موسومة وإعادة بنائها كـ Firestore Timestamp و GeoPoint و Bytes حقيقية عند الاستعادة
  const sandbox = new InMemoryFirestoreSandbox();
  const { result: restoreResult } = restoreBackupToSandbox(backupPayload, sandbox);
  const restoredProp = sandbox.getDocument('properties', 'prop_aden_501');
  const restoredAudit = sandbox.getDocument('audit_logs', 'audit_aden_99');

  const isRealTimestamp =
    restoredProp?.createdAt instanceof Timestamp &&
    (restoredProp.createdAt as Timestamp).toMillis() === tsCreated.toMillis() &&
    restoredAudit?.createdAt instanceof Timestamp &&
    (restoredAudit.createdAt as Timestamp).toMillis() === tsCreated.toMillis();
  const isRealGeoPoint =
    restoredProp?.geoLocation instanceof GeoPoint &&
    (restoredProp.geoLocation as GeoPoint).latitude === 12.7855;
  const isRealBytes =
    restoredProp?.binaryHash instanceof Bytes &&
    (restoredProp.binaryHash as Bytes).toBase64() === sampleBytes.toBase64();
  const noIdInRestoredDoc =
    restoredProp !== undefined &&
    !Object.prototype.hasOwnProperty.call(restoredProp, 'id') &&
    !Object.prototype.hasOwnProperty.call(restoredAudit, 'id');

  recordAssertion(
    'S1A-04',
    'timestamp_and_types',
    'إعادة بناء الطوابع الزمنية كـ Firestore Timestamp والأنواع الأخرى (GeoPoint, Bytes) بدقة 100% دون حقل id',
    restoreResult.success &&
      restoreResult.reconstructedTimestampsCount === 36 &&
      isRealTimestamp &&
      isRealGeoPoint &&
      isRealBytes &&
      noIdInRestoredDoc,
    `عدد Timestamp المعاد بناؤها=${restoreResult.reconstructedTimestampsCount}، instanceof Timestamp=${isRealTimestamp}، GeoPoint=${isRealGeoPoint}، Bytes=${isRealBytes}، خلو الوثيقة المستعادة من id=${noIdInRestoredDoc}`
  );

  // التحقق 5: حماية السجلات غير القابلة للتعديل (audit_logs, appointment_postponements)
  const secondPassRestore = restoreBackupToSandbox(backupPayload, sandbox, {
    clearSandboxBeforeRestore: false,
  });
  const validTamperedPayload = buildBackupPayloadFromRawData({
    rawCollections: {
      ...rawTestCollections,
      audit_logs: [
        {
          id: 'audit_aden_99',
          workspaceId: 'ws_aden_01',
          ownerId: 'uid_owner_primary',
          actionType: 'approve',
          entityType: 'assessment',
          entityId: 'assess_aden_301',
          summary: 'ملخص معدل يتعارض مع السجل التاريخي الأصلي',
          actorId: 'uid_owner_primary',
          actorName: 'المالك الرئيسي',
          memberUids: ['uid_owner_primary', 'uid_owner_backup'],
          createdAt: tsCreated,
        },
      ],
    },
    createdByUid: 'uid_owner_primary',
    createdByEmail: 'am1075022@gmail.com',
    scopeMode: 'all_accessible_workspaces',
    targetWorkspaceId: null,
  });
  const conflictRestore = restoreBackupToSandbox(validTamperedPayload, sandbox, {
    clearSandboxBeforeRestore: false,
  });

  recordAssertion(
    'S1A-05',
    'immutable_records_safety',
    'حماية audit_logs و appointment_postponements: تخطي المطابق دون update وحظر أي تعارض تاريخي دون تعديل صامت',
    secondPassRestore.result.success &&
      secondPassRestore.result.immutableHandlingReport.skippedIdenticalRecordsCount === 2 &&
      !conflictRestore.result.success &&
      conflictRestore.result.immutableHandlingReport.blockedConflictRecords.length === 1,
    `تخطي السجلات التاريخية المطابقة=${secondPassRestore.result.immutableHandlingReport.skippedIdenticalRecordsCount}/2، وحظر التعارض التاريخي=${conflictRestore.result.immutableHandlingReport.blockedConflictRecords.length}`
  );

  // التحقق 6: حارس الاستعادة المعزولة (رفض مشروع/نسخة الإنتاج تحت أي خيارات، رفض الخيارات المتناقضة/الناقصة، وقبول الإعداد الاختباري المعزول الصحيح)
  // 6-أ: رفض تمرير نسخة الإنتاج (db) حتى لو زُوّرت الخيارات الأخرى لتبدو اختبارية
  let prodInstanceBlockedEvenWithFakeOptions = false;
  try {
    await restoreBackupToIsolatedFirestore(backupPayload, {
      isolatedFirestoreInstance: db,
      targetProjectId: 'rasd-isolated-test',
      isEmulatorOrIsolatedTestProject: true,
      dryRun: true,
    });
  } catch (err) {
    prodInstanceBlockedEvenWithFakeOptions =
      err instanceof Error && err.message.includes('رفض أمني إلزامي');
  }

  // 6-ب: رفض كائن Firestore يحمل داخليًا projectId الخاص بالإنتاج (rasd-field-system) حتى لو لم يكن نفس المرجع db
  let disguisedProdProjectBlocked = false;
  const disguisedProdFirestore = {
    app: { options: { projectId: FIREBASE_PROJECT_ID } },
  } as unknown as Firestore;
  try {
    await restoreBackupToIsolatedFirestore(backupPayload, {
      isolatedFirestoreInstance: disguisedProdFirestore,
      targetProjectId: 'rasd-isolated-test',
      isEmulatorOrIsolatedTestProject: true,
      dryRun: true,
    });
  } catch (err) {
    disguisedProdProjectBlocked =
      err instanceof Error && err.message.includes('رفض أمني إلزامي');
  }

  // 6-ج: رفض الخيارات المتناقضة (targetProjectId لا يطابق app.options.projectId داخل isolatedFirestoreInstance)
  let contradictoryOptionsBlocked = false;
  const mismatchedIsolatedFirestore = {
    app: { options: { projectId: 'rasd-test-env-beta' } },
  } as unknown as Firestore;
  try {
    await restoreBackupToIsolatedFirestore(backupPayload, {
      isolatedFirestoreInstance: mismatchedIsolatedFirestore,
      targetProjectId: 'rasd-test-env-alpha',
      isEmulatorOrIsolatedTestProject: true,
      dryRun: true,
    });
  } catch (err) {
    contradictoryOptionsBlocked =
      err instanceof Error && err.message.includes('تناقض في إعدادات الاستعادة المعزولة');
  }

  // 6-د: رفض الخيارات الناقصة (كائن Firestore يفتقر إلى projectId أو isEmulatorOrIsolatedTestProject=false)
  let incompleteOptionsBlocked = false;
  const missingProjectFirestore = { app: { options: {} } } as unknown as Firestore;
  try {
    await restoreBackupToIsolatedFirestore(backupPayload, {
      isolatedFirestoreInstance: missingProjectFirestore,
      targetProjectId: 'rasd-isolated-test',
      isEmulatorOrIsolatedTestProject: true,
      dryRun: true,
    });
  } catch (err) {
    incompleteOptionsBlocked =
      err instanceof Error && err.message.includes('ناقصة أو غير مكتملة');
  }

  // 6-هـ: قبول إعداد اختباري معزول ومتسق (وضع التحقق الجاف dryRun دون أي اتصال بالإنتاج)
  const validIsolatedFirestore = {
    app: { options: { projectId: 'rasd-isolated-test' } },
  } as unknown as Firestore;
  const validIsolatedResult = await restoreBackupToIsolatedFirestore(backupPayload, {
    isolatedFirestoreInstance: validIsolatedFirestore,
    targetProjectId: 'rasd-isolated-test',
    isEmulatorOrIsolatedTestProject: true,
    dryRun: true,
  });

  recordAssertion(
    'S1A-06',
    'production_write_block',
    'حارس الاستعادة: فحص projectId الفعلي داخل isolatedFirestoreInstance، رفض الإنتاج تحت أي خيارات، رفض الخيارات المتناقضة/الناقصة، وقبول الإعداد المعزول الصحيح',
    prodInstanceBlockedEvenWithFakeOptions &&
      disguisedProdProjectBlocked &&
      contradictoryOptionsBlocked &&
      incompleteOptionsBlocked &&
      validIsolatedResult.success &&
      validIsolatedResult.targetEnvironment === 'isolated_test_firestore',
    `حظر db المزيف=${prodInstanceBlockedEvenWithFakeOptions}، حظر projectId الإنتاج المقنّع=${disguisedProdProjectBlocked}، حظر التناقض=${contradictoryOptionsBlocked}، حظر النقص=${incompleteOptionsBlocked}، قبول المعزول الصحيح=${validIsolatedResult.success}`
  );

  // التحقق 7: تنقية المفاتيح السرية (حالات إيجابية وسلبية) وتسجيل المسارات المنقاة دون قيمها
  const serializedBackup = JSON.stringify(backupPayload);
  const expectedSanitizedPaths = [
    'users(uid_owner_primary).accessToken',
    'users(uid_owner_primary).privateKey',
    'users(uid_client_mukalla).password',
    'workspaces(ws_aden_01).vapidPrivateKey',
  ];
  const pathsRecordedWithoutValues =
    backupPayload.manifest.sanitizedFieldsCount === 4 &&
    Array.isArray(backupPayload.manifest.sanitizedFieldPaths) &&
    expectedSanitizedPaths.every((p) => backupPayload.manifest.sanitizedFieldPaths.includes(p)) &&
    !serializedBackup.includes('SHOULD_BE_STRIPPED_123') &&
    !serializedBackup.includes('SHOULD_BE_STRIPPED_TOKEN') &&
    !serializedBackup.includes('PLAIN_PASSWORD_MUST_BE_REMOVED') &&
    !serializedBackup.includes('SECRET_VAPID_KEY_MUST_NOT_LEAK');

  // فحص إيجابي: أنماط الأسرار الحقيقية يجب أن تُكتشف وتُحذف
  const positiveSecretKeys = [
    'privateKey',
    'private_key',
    'vapidPrivateKey',
    'vapid_private_key',
    'apiKey',
    'api_key',
    'geminiApiKey',
    'clientSecret',
    'client_secret',
    'secret',
    'accessToken',
    'access_token',
    'refreshToken',
    'refresh_token',
    'idToken',
    'id_token',
    'password',
    'userPassword',
    'passcode',
    'credential',
    'authorization',
    'vapid',
  ];
  const allTrueSecretsDetected = positiveSecretKeys.every((k) => isForbiddenSecretFieldName(k));

  // فحص سلبي: جميع حقول المخطط الرسمي الـ 13 + الحقول المشروعة المتشابهة بالاسم يجب ألا تُحذف أبدًا
  const lookalikeLegitimateKeys = [
    ...Array.from(OFFICIAL_ALLOWED_SCHEMA_FIELDS),
    'paidTokenCount',
    'validTokenRef',
    'gatePasscodeNote',
    'passcodeRequired',
    'authorizationNumber',
    'secretaryName',
    'isPrivateProperty',
    'tokenCount',
  ];
  const zeroFalsePositives = lookalikeLegitimateKeys.every((k) => !isForbiddenSecretFieldName(k));

  // اختبار بناء حزمة تحتوي على حقول مشروعة متشابهة بالاسم للتأكد من بقائها وعدم حذفها
  const lookalikeTestPayload = buildBackupPayloadFromRawData({
    rawCollections: {
      ...rawTestCollections,
      properties: [
        {
          ...rawTestCollections.properties![0],
          gatePasscodeNote: 'بوابة المجمع رقم 4',
          paidTokenCount: 12,
          authorizationNumber: 'AUTH-2026-99',
          secretaryName: 'أحمد قاسم',
          apiKey: 'LIVE_SECRET_KEY_VALUE_999',
        },
      ],
    },
    createdByUid: 'uid_owner_primary',
    createdByEmail: 'am1075022@gmail.com',
    scopeMode: 'all_accessible_workspaces',
    targetWorkspaceId: null,
  });
  const lookalikePropData = lookalikeTestPayload.data.properties.find(
    (p) => p.docId === 'prop_aden_501'
  )?.docData;
  const lookalikeFieldsPreservedAndSecretRemoved =
    lookalikePropData?.gatePasscodeNote === 'بوابة المجمع رقم 4' &&
    lookalikePropData?.paidTokenCount === 12 &&
    lookalikePropData?.authorizationNumber === 'AUTH-2026-99' &&
    lookalikePropData?.secretaryName === 'أحمد قاسم' &&
    !Object.prototype.hasOwnProperty.call(lookalikePropData, 'apiKey') &&
    lookalikeTestPayload.manifest.sanitizedFieldPaths.includes('properties(prop_aden_501).apiKey') &&
    !JSON.stringify(lookalikeTestPayload).includes('LIVE_SECRET_KEY_VALUE_999');

  recordAssertion(
    'S1A-07',
    'secret_sanitization',
    'تنقية الأسرار بدقة: حذف الأسرار الحقيقية، تسجيل مساراتها في sanitizedFieldPaths دون قيمها، وعدم حذف أي حقل مشروع أو متشابه جزئيًا بالاسم',
    pathsRecordedWithoutValues &&
      allTrueSecretsDetected &&
      zeroFalsePositives &&
      lookalikeFieldsPreservedAndSecretRemoved,
    `المسارات المسجلة=${backupPayload.manifest.sanitizedFieldPaths.join(', ')}، اكتشاف الأسرار الحقيقية (${positiveSecretKeys.length})=${allTrueSecretsDetected}، عدم حذف الحقول المشروعة والمتشابهة (${lookalikeLegitimateKeys.length})=${zeroFalsePositives && lookalikeFieldsPreservedAndSecretRemoved}`
  );

  // التحقق 8: العلاقات المرجعية لـ general_account و general_tp و general_prop في المواضع الصحيحة فقط، ورفض المواضع أو المعرفات غير المعتمدة
  const validSentinelPayload = buildBackupPayloadFromRawData({
    rawCollections: {
      ...rawTestCollections,
      property_units: [
        ...rawTestCollections.property_units!,
        {
          ...rawTestCollections.property_units![0],
          id: 'unit_general_tp_valid',
          propertyId: 'prop_aden_501',
          taxpayerId: APPROVED_GENERAL_TAXPAYER_ID,
        },
      ],
      field_visits: [
        ...rawTestCollections.field_visits!,
        {
          ...rawTestCollections.field_visits![0],
          id: 'visit_general_prop_valid',
          propertyId: APPROVED_GENERAL_PROPERTY_ID,
          taxpayerId: 'tx_aden_101',
        },
        {
          ...rawTestCollections.field_visits![0],
          id: 'visit_general_tp_valid',
          propertyId: 'prop_aden_501',
          taxpayerId: APPROVED_GENERAL_TAXPAYER_ID,
        },
      ],
      appointments: [
        ...rawTestCollections.appointments!,
        {
          ...rawTestCollections.appointments![0],
          id: 'appt_general_both_valid',
          propertyId: APPROVED_GENERAL_PROPERTY_ID,
          taxpayerId: APPROVED_GENERAL_TAXPAYER_ID,
        },
      ],
      financial_assessments: [
        ...rawTestCollections.financial_assessments!,
        {
          ...rawTestCollections.financial_assessments![0],
          id: 'assess_general_prop_valid',
          propertyId: APPROVED_GENERAL_PROPERTY_ID,
          taxpayerId: 'tx_aden_101',
        },
      ],
      financial_transactions: [
        ...rawTestCollections.financial_transactions!,
        {
          ...rawTestCollections.financial_transactions![0],
          id: 'tx_general_account_valid',
          propertyId: APPROVED_GENERAL_PROPERTY_ID,
          taxpayerId: 'tx_aden_101',
          assessmentId: APPROVED_GENERAL_ASSESSMENT_ID,
        },
        {
          ...rawTestCollections.financial_transactions![0],
          id: 'tx_prop_with_general_tp_valid',
          propertyId: 'prop_aden_501',
          taxpayerId: APPROVED_GENERAL_TAXPAYER_ID,
          assessmentId: APPROVED_GENERAL_ASSESSMENT_ID,
        },
      ],
    },
    createdByUid: 'uid_owner_primary',
    createdByEmail: 'am1075022@gmail.com',
    scopeMode: 'all_accessible_workspaces',
    targetWorkspaceId: null,
  });
  const validSentinelReport = verifyBackupIntegrity(validSentinelPayload);

  // اختبار رفض المعرفات العامة في المواضع غير المسموح بها أو المعرفات غير المعتمدة
  const invalidSentinelPayload = buildBackupPayloadFromRawData({
    rawCollections: {
      ...rawTestCollections,
      properties: [
        ...rawTestCollections.properties!,
        {
          ...rawTestCollections.properties![0],
          id: 'prop_invalid_general_tp',
          taxpayerId: APPROVED_GENERAL_TAXPAYER_ID, // غير مسموح في properties
        },
      ],
      property_units: [
        ...rawTestCollections.property_units!,
        {
          ...rawTestCollections.property_units![0],
          id: 'unit_invalid_general_prop',
          propertyId: APPROVED_GENERAL_PROPERTY_ID, // غير مسموح في property_units
        },
      ],
      field_visits: [
        ...rawTestCollections.field_visits!,
        {
          ...rawTestCollections.field_visits![0],
          id: 'visit_invalid_both_general',
          propertyId: APPROVED_GENERAL_PROPERTY_ID,
          taxpayerId: APPROVED_GENERAL_TAXPAYER_ID, // غير مسموح اجتماع general_prop مع general_tp في field_visits
        },
      ],
      financial_transactions: [
        ...rawTestCollections.financial_transactions!,
        {
          ...rawTestCollections.financial_transactions![0],
          id: 'tx_invalid_unapproved_sentinel',
          assessmentId: 'unapproved_general_id', // معرف عام غير معتمد
        },
      ],
    },
    createdByUid: 'uid_owner_primary',
    createdByEmail: 'am1075022@gmail.com',
    scopeMode: 'all_accessible_workspaces',
    targetWorkspaceId: null,
  });
  const invalidSentinelReport = verifyBackupIntegrity(invalidSentinelPayload);

  recordAssertion(
    'S1A-08',
    'relational_integrity',
    'قبول general_account و general_tp و general_prop في مواضعها المعتمدة فقط، ورفض استخدامها في مواضع غير معتمدة أو قبول معرفات عامة عشوائية',
    validSentinelReport.isValid &&
      validSentinelReport.brokenRelations.length === 0 &&
      !invalidSentinelReport.isValid &&
      invalidSentinelReport.brokenRelations.length === 4,
    `صحة المواضع المعتمدة=${validSentinelReport.isValid} (روابط مكسورة=${validSentinelReport.brokenRelations.length})، ورفض المواضع/المعرفات غير المعتمدة=${invalidSentinelReport.brokenRelations.length}/4`
  );

  // التحقق 9: ترقية ومواءمة firestore.rules الإنتاجي مع DRAFT_firestore.rules الكامل
  const prodRulesPath = path.resolve(process.cwd(), 'firestore.rules');
  const draftRulesPath = path.resolve(process.cwd(), 'DRAFT_firestore.rules');
  const prodRulesText = fs.readFileSync(prodRulesPath, 'utf8');
  const draftRulesText = fs.readFileSync(draftRulesPath, 'utf8');

  const prodRulesPromoted =
    prodRulesText === draftRulesText &&
    prodRulesText.includes('match /account_licenses/{workspaceId}') &&
    prodRulesText.includes('match /platform_staff/{staffUid}') &&
    prodRulesText.includes('match /subscription_packages/{packageId}') &&
    prodRulesText.includes('function isAdmin()');

  const requiredValidators = [
    'isValidUser',
    'isValidWorkspace',
    'isValidWorkspaceMember',
    'isValidTaxpayer',
    'isValidProperty',
    'isValidPropertyUnit',
    'isValidFieldVisit',
    'isValidAppointment',
    'isValidAppointmentPostponement',
    'isValidFinancialAssessment',
    'isValidFinancialTransaction',
    'isValidNotificationItem',
    'isValidAuditLog',
    'isValidAccountLicense',
    'isValidPlatformStaff',
  ];

  // التأكد من عدم استخدام ownerUid ككود، وتوحيد account_licenses، والحفاظ على الأدوار الفعلية
  const prodCodeLines = prodRulesText
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');

  const rulesAligned =
    requiredValidators.every((fn) => prodCodeLines.includes(`function ${fn}(`)) &&
    !prodCodeLines.includes('ownerUid') &&
    !prodCodeLines.includes('tenant_licenses') &&
    !prodCodeLines.includes('field_officer') &&
    prodCodeLines.includes("['owner', 'field_assistant', 'finance_assistant', 'viewer']") &&
    prodCodeLines.includes('match /account_licenses/{workspaceId}') &&
    prodCodeLines.includes('match /platform_staff/{staffUid}') &&
    prodCodeLines.includes('am1075022@gmail.com') &&
    prodCodeLines.includes('ahah26h@gmail.com');

  recordAssertion(
    'S1B-09',
    'rules_alignment',
    'تفعيل ومواءمة firestore.rules الإنتاجي بالكامل (ownerId، الأدوار الفعلية، account_licenses، والـ 15+ دالة تحقق)',
    prodRulesPromoted && rulesAligned,
    `تطابق وترقية firestore.rules الإنتاجي=${prodRulesPromoted}، ومواءمة القواعد الكاملة=${rulesAligned}`
  );

  const passedCount = assertions.filter((a) => a.passed).length;
  console.log('\n====================================================================');
  console.log(`النتيجة النهائية لاختبارات المرحلة الأولى (1A / 1B): ${passedCount}/${assertions.length} اجتازت بنجاح`);
  console.log('====================================================================');

  if (passedCount !== assertions.length) {
    process.exit(1);
  }
}

runStage1Tests().catch((err) => {
  console.error(err);
  process.exit(1);
});

