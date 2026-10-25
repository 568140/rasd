import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
  Timestamp,
  GeoPoint,
  Bytes,
  Firestore,
} from 'firebase/firestore';
import { db, FIREBASE_PROJECT_ID, FIRESTORE_DATABASE_ID } from './firebase';

/**
 * المجموعات التشغيلية المشمولة في النسخة الاحتياطية القياسية لمساحة العمل أو المنصة
 */
export const BACKUP_WORKSPACE_COLLECTIONS = [
  'workspaces',
  'workspace_members',
  'taxpayers',
  'properties',
  'property_units',
  'field_visits',
  'appointments',
  'appointment_postponements',
  'financial_assessments',
  'financial_transactions',
  'notifications',
  'audit_logs',
] as const;

export type BackupWorkspaceCollectionName = (typeof BACKUP_WORKSPACE_COLLECTIONS)[number];

/**
 * مجموعات حوكمة المنصة والاشتراكات والتراخيص (المرحلة الثانية 2A–2D):
 * - account_licenses: تراخيص الحسابات ومساحات العمل وحالات الموافقة والاشتراك
 * - subscription_packages: باقات الاشتراك ومددها وحدود أعضاء الفريق
 * - platform_staff: مساعدو إدارة المنصة وصلاحياتهم المفوضة
 */
export const BACKUP_PLATFORM_GOVERNANCE_COLLECTIONS = [
  'account_licenses',
  'subscription_packages',
  'platform_staff',
] as const;

export type BackupPlatformCollectionName = (typeof BACKUP_PLATFORM_GOVERNANCE_COLLECTIONS)[number];
export type BackupCollectionName =
  | BackupWorkspaceCollectionName
  | 'users'
  | BackupPlatformCollectionName;

export type BackupScopeMode = 'single_workspace' | 'all_accessible_workspaces';

/**
 * تحديد قائمة المجموعات الفعّالة في النسخة الاحتياطية:
 * - الوضع القياسي (المرحلة الأولى): 13 مجموعة تشغيلية (BACKUP_WORKSPACE_COLLECTIONS + 'users')
 * - وضع شمول حوكمة المنصة والتراخيص (المرحلة 2-D): 16 مجموعة تشمل (account_licenses, subscription_packages, platform_staff)
 */
export function resolveActiveBackupCollections(
  includePlatformGovernance?: boolean,
  rawOrData?: Partial<Record<BackupCollectionName, unknown>>
): BackupCollectionName[] {
  const baseCollections: BackupCollectionName[] = [...BACKUP_WORKSPACE_COLLECTIONS, 'users'];
  const hasPlatformCollectionsInData = Boolean(
    rawOrData &&
      BACKUP_PLATFORM_GOVERNANCE_COLLECTIONS.some((col) =>
        Object.prototype.hasOwnProperty.call(rawOrData, col)
      )
  );
  if (includePlatformGovernance === true || hasPlatformCollectionsInData) {
    return [...baseCollections, ...BACKUP_PLATFORM_GOVERNANCE_COLLECTIONS];
  }
  return baseCollections;
}

/**
 * المجموعات التي يسمح مخطط قواعد الأمان (/firestore.rules) بوجود حقل 'id' داخل جسم الوثيقة (docData).
 * في المخطط الفعلي للمشروع، جميع المجموعات الـ 13 تفرض data.keys().hasOnly(...) ولا تتضمن الحقل 'id' داخل الوثيقة،
 * لذلك يُحفظ معرف الوثيقة حصريًا في غلاف النسخة الاحتياطية (envelope.docId) ولا يُحقن داخل docData.
 */
export const COLLECTIONS_ALLOWING_ID_IN_DOCUMENT_BODY: ReadonlySet<BackupCollectionName> =
  new Set<BackupCollectionName>([]);

/**
 * المجموعات التاريخية غير القابلة للتعديل أو الحذف (Append-Only Immutable Collections)
 * وفقًا لقواعد /firestore.rules:
 * - appointment_postponements (السطر 641): allow update, delete: if false;
 * - audit_logs (السطر 767): allow update, delete: if false;
 */
export const IMMUTABLE_APPEND_ONLY_COLLECTIONS: ReadonlySet<BackupCollectionName> =
  new Set<BackupCollectionName>(['appointment_postponements', 'audit_logs']);

/**
 * المعرّفات المرجعية العامة (Sentinel IDs) المعتمدة في الكود الفعلي (/src/context/RasdContext.tsx)
 * وقواعد الأمان (/firestore.rules):
 * - 'general_prop': عقار عام عند توثيق زيارة أو موعد أو تقييم أو معاملة مالية غير مربوطة بعقار محدد.
 * - 'general_tp': مكلف عام في المواعيد أو كقيمة احتياطية عندما يكون السجل مربوطًا بعقار موجود.
 * - 'general_account': حساب مالي عام عند تسجيل معاملة تحصيل في financial_transactions غير مربوطة بتقييم محدد.
 */
export const APPROVED_GENERAL_PROPERTY_ID = 'general_prop';
export const APPROVED_GENERAL_TAXPAYER_ID = 'general_tp';
export const APPROVED_GENERAL_ASSESSMENT_ID = 'general_account';

/**
 * القائمة البيضاء لجميع أسماء الحقول المشروعة المعتمدة في مخطط المجموعات الـ 13 (/firestore.rules)
 * لضمان عدم حذف أي حقل مشروع تحت أي ظرف أثناء تنقية المفاتيح السرية
 */
export const OFFICIAL_ALLOWED_SCHEMA_FIELDS: ReadonlySet<string> = new Set<string>([
  // users
  'uid',
  'displayName',
  'email',
  'phone',
  'jobTitle',
  'activeWorkspaceId',
  'createdAt',
  'updatedAt',
  // workspaces
  'name',
  'ownerId',
  'ownerName',
  'defaultCurrency',
  'taxRatePercent',
  'regionName',
  'inviteCode',
  'memberUids',
  'memberCount',
  // workspace_members
  'workspaceId',
  'userId',
  'role',
  'status',
  'canApproveFinancials',
  'canDeleteRecords',
  'createdBy',
  // taxpayers
  'fullName',
  'internalCode',
  'nationalOrCommercialId',
  'address',
  'region',
  'notes',
  'createdByName',
  // properties
  'taxpayerId',
  'taxpayerName',
  'title',
  'code',
  'propertyType',
  'latitude',
  'longitude',
  'hasCoordinates',
  'unitsCount',
  'areaSqm',
  // property_units
  'propertyId',
  'propertyTitle',
  'unitNumber',
  'unitType',
  'floor',
  'occupancyStatus',
  'tenantName',
  'annualRentEstimate',
  // field_visits
  'visitDate',
  'visitTime',
  'purpose',
  'photoSummary',
  'officerId',
  'officerName',
  // appointments
  'scheduledDate',
  'scheduledTime',
  'locationText',
  'postponeCount',
  'lastPostponeReason',
  // appointment_postponements
  'appointmentId',
  'previousDate',
  'previousTime',
  'newDate',
  'newTime',
  'reason',
  // financial_assessments
  'amount',
  'currency',
  'periodLabel',
  'assessmentDate',
  'contractValue',
  // financial_transactions
  'assessmentId',
  'transactionType',
  'transactionDate',
  'referenceNumber',
  // notifications
  'message',
  'category',
  'isRead',
  // audit_logs
  'actionType',
  'entityType',
  'entityId',
  'summary',
  'actorId',
  'actorName',
  // account_licenses (المرحلة الثانية)
  'ownerEmail',
  'planId',
  'startsAt',
  'expiresAt',
  'maxMembers',
  // subscription_packages (المرحلة الثانية)
  'nameAr',
  'descriptionAr',
  'billingCycle',
  'durationDays',
  'isLifetime',
  'isFreeOwnerPlan',
  'defaultMaxMembers',
  'priceAmount',
  'isActive',
  // platform_staff (المرحلة الثانية)
  'permissions',
  'canViewRequests',
  'canApproveAndRenew',
  'canManagePackages',
  'assignedByUid',
  // حقول التغليف القياسية لأنواع Firestore داخل النسخة الاحتياطية
  '__rasdFirestoreType',
  'seconds',
  'nanoseconds',
  'iso',
  'base64',
]);

/**
 * أنماط المفاتيح السرية وبيانات الاعتماد المحظورة في ملفات النسخ الاحتياطي.
 * تُطبق هذه الأنماط بعد تطبيع اسم الحقل إلى صيغة snake_case مع حدود كلمات صارمة (?:^|_)...(?:$|_)
 * لمنع أي تطابق جزئي خاطئ مع حقول مشروعة (مثل paidTokenCount أو gatePasscodeNote أو authorizationNumber).
 */
const FORBIDDEN_SECRET_NORMALIZED_PATTERNS: readonly RegExp[] = [
  /^(?:secret|password|passcode|credential|credentials|authorization|vapid)$/,
  /(?:^|_)(?:private_key|vapid_private_key|vapid_private|service_account_key)(?:$|_)/,
  /(?:^|_)(?:api_key|client_secret|api_secret|jwt_secret|webhook_secret|auth_secret|secret_key)(?:$|_)/,
  /(?:^|_)(?:access_token|refresh_token|id_token|auth_token|bearer_token|session_token)(?:$|_)/,
  /(?:^|_)(?:user_password|admin_password|master_password|password_hash)(?:$|_)/,
];

/**
 * تمثيل صريح وموسوم لأنواع Firestore الخاصة داخل ملف JSON لضمان إعادة بنائها بدقة 100% عند الاستعادة
 */
export interface SerializedFirestoreTimestamp {
  __rasdFirestoreType: 'timestamp';
  seconds: number;
  nanoseconds: number;
  iso: string;
}

export interface SerializedFirestoreGeoPoint {
  __rasdFirestoreType: 'geopoint';
  latitude: number;
  longitude: number;
}

export interface SerializedFirestoreBytes {
  __rasdFirestoreType: 'bytes';
  base64: string;
}

/**
 * غلاف الوثيقة في النسخة الاحتياطية: يفصل معرف الوثيقة (docId) عن محتوى الوثيقة الفعلي (docData)
 */
export interface BackupDocumentEnvelope {
  docId: string;
  docData: Record<string, unknown>;
}

export interface CollectionScopeDisclosure {
  backupClassification: 'operational_firestore_data_partial';
  isFullDisasterRecovery: false;
  disclaimerAr: string;
  includedCollections: {
    name: BackupCollectionName;
    acquisitionMethod: 'firestore_collection_query' | 'firestore_document_lookup_by_known_uid';
    immutabilityPolicy: 'mutable_with_rules' | 'append_only_immutable';
    description: string;
  }[];
  excludedCollectionsAndData: {
    name: string;
    category:
      | 'authentication'
      | 'infrastructure_indexes_rules'
      | 'environment_and_secrets'
      | 'external_notifications'
      | 'security_governance'
      | 'privacy_restricted_profiles';
    reason: string;
  }[];
}

export interface RelationalBrokenLink {
  sourceCollection: BackupCollectionName;
  sourceDocId: string;
  foreignKeyField: string;
  targetCollection: BackupCollectionName;
  missingTargetId: string;
}

export interface BackupIntegrityReport {
  isValid: boolean;
  checkedAt: string;
  totalCollectionsChecked: number;
  totalDocumentsChecked: number;
  collectionCountsMatch: boolean;
  documentIdSetMatch: boolean;
  checksumMatches: boolean;
  zeroSecretsConfirmed: boolean;
  envelopeSeparationVerified: boolean;
  unapprovedIdFieldLeaks: { collection: BackupCollectionName; docId: string }[];
  invalidOwnerIdRecords: { collection: BackupCollectionName; docId: string; reason: string }[];
  serializedTimestampsVerifiedCount: number;
  detectedSecretFields: string[];
  duplicateDocumentIds: { collection: string; docId: string }[];
  missingDocumentIds: { collection: string; index: number }[];
  brokenRelations: RelationalBrokenLink[];
  orphanWorkspaceRecords: { collection: string; docId: string; workspaceId: string }[];
  summaryAr: string;
}

export interface RasdBackupPayload {
  schemaVersion: '1.1.0-stage1a';
  backupClassification: 'operational_firestore_data_partial';
  isFullDisasterRecovery: false;
  platformName: 'رَصْد — المساعد الميداني الذكي';
  createdAt: string;
  createdByUid: string;
  createdByEmail: string;
  scopeMode: BackupScopeMode;
  targetWorkspaceId: string | null;
  sourceEnvironment: {
    projectId: string;
    databaseId: string;
  };
  scopeDisclosure: CollectionScopeDisclosure;
  manifest: {
    totalDocuments: number;
    collectionCounts: Record<BackupCollectionName, number>;
    documentIdsByCollection: Record<BackupCollectionName, string[]>;
    checksum: string;
    sanitizedFieldsCount: number;
    sanitizedFieldPaths: string[];
    serializedTimestampsCount: number;
  };
  data: Record<BackupCollectionName, BackupDocumentEnvelope[]>;
}

export interface ImmutableCollectionRestoreReport {
  immutableCollections: BackupCollectionName[];
  createdNewRecordsCount: number;
  skippedIdenticalRecordsCount: number;
  blockedConflictRecords: {
    collection: BackupCollectionName;
    docId: string;
    reason: string;
  }[];
  historicalTimestampRuleNoteAr: string;
  safeRestorationStrategyAr: string;
}

export interface BackupRestoreResult {
  success: boolean;
  targetEnvironment: 'isolated_in_memory_sandbox' | 'isolated_test_firestore';
  dryRun: boolean;
  restoredAt: string;
  restoredCounts: Record<BackupCollectionName, number>;
  totalRestoredDocuments: number;
  reconstructedTimestampsCount: number;
  batchesExecuted: number;
  preRestoreIntegrity: BackupIntegrityReport;
  postRestoreIntegrity: BackupIntegrityReport;
  idPreservationVerified: boolean;
  envelopeNoIdLeakVerified: boolean;
  deepEqualityVerified: boolean;
  immutableHandlingReport: ImmutableCollectionRestoreReport;
  errors: string[];
}

/**
 * بيان صريح ودقيق بأن النسخة هي نسخة بيانات تشغيلية جزئية وليست نسخة تعافٍ كامل للنظام،
 * مع تفصيل كافة المجموعات المشمولة والبيانات والأنظمة المستثناة
 */
export function getBackupScopeDisclosure(
  scopeMode: BackupScopeMode,
  includePlatformGovernance = false
): CollectionScopeDisclosure {
  const baseIncludedCollections: CollectionScopeDisclosure['includedCollections'] = [
    {
      name: 'workspaces',
      acquisitionMethod: 'firestore_collection_query',
      immutabilityPolicy: 'mutable_with_rules',
      description:
        scopeMode === 'all_accessible_workspaces'
          ? 'جميع مساحات العمل المتاحة لمالك المنصة في قاعدة البيانات (تستخدم الحقل المعتمد ownerId)'
          : 'وثيقة مساحة العمل النشطة الحالية بكامل إعداداتها وأعضائها (ownerId, memberUids)',
    },
    {
      name: 'workspace_members',
      acquisitionMethod: 'firestore_collection_query',
      immutabilityPolicy: 'mutable_with_rules',
      description: 'سجلات عضوية الفريق والأدوار المعتمدة (owner, field_assistant, finance_assistant, viewer)',
    },
    {
      name: 'taxpayers',
      acquisitionMethod: 'firestore_collection_query',
      immutabilityPolicy: 'mutable_with_rules',
      description: 'سجلات المكلفين وبيانات الهوية والتواصل والمنطقة',
    },
    {
      name: 'properties',
      acquisitionMethod: 'firestore_collection_query',
      immutabilityPolicy: 'mutable_with_rules',
      description: 'سجلات العقارات وإحداثيات GPS وارتباطها بالمكلفين',
    },
    {
      name: 'property_units',
      acquisitionMethod: 'firestore_collection_query',
      immutabilityPolicy: 'mutable_with_rules',
      description: 'سجلات الوحدات العقارية المستقلة المرتبطة بالعقارات',
    },
    {
      name: 'field_visits',
      acquisitionMethod: 'firestore_collection_query',
      immutabilityPolicy: 'mutable_with_rules',
      description: 'سجلات الزيارات الميدانية وإحداثيات الرصد والملاحظات',
    },
    {
      name: 'appointments',
      acquisitionMethod: 'firestore_collection_query',
      immutabilityPolicy: 'mutable_with_rules',
      description: 'سجلات المواعيد الميدانية وحالاتها وعداد التأجيلات',
    },
    {
      name: 'appointment_postponements',
      acquisitionMethod: 'firestore_collection_query',
      immutabilityPolicy: 'append_only_immutable',
      description: 'سجلات تاريخ تأجيل المواعيد (مجموعة تاريخية غير قابلة للتعديل أو الحذف Append-Only)',
    },
    {
      name: 'financial_assessments',
      acquisitionMethod: 'firestore_collection_query',
      immutabilityPolicy: 'mutable_with_rules',
      description: 'سجلات التقييمات المالية وحالة اعتمادها وقفلها النهائي (Terminal State Lock)',
    },
    {
      name: 'financial_transactions',
      acquisitionMethod: 'firestore_collection_query',
      immutabilityPolicy: 'mutable_with_rules',
      description: 'سجلات المعاملات المالية والمدفوعات والقيود العكسية (لا تقبل الحذف)',
    },
    {
      name: 'notifications',
      acquisitionMethod: 'firestore_collection_query',
      immutabilityPolicy: 'mutable_with_rules',
      description: 'سجلات الإشعارات والتنبيهات الداخلية الخاصة بمساحة العمل',
    },
    {
      name: 'audit_logs',
      acquisitionMethod: 'firestore_collection_query',
      immutabilityPolicy: 'append_only_immutable',
      description: includePlatformGovernance
        ? 'سجل التدقيق الأمني التاريخي الشامل للعمليات الميدانية والعمليات الإدارية للمنصة والتراخيص (غير قابل للتعديل أو الحذف نهائيًا Append-Only)'
        : 'سجل التدقيق الأمني التاريخي (غير قابل للتعديل أو الحذف نهائيًا Append-Only)',
    },
    {
      name: 'users',
      acquisitionMethod: 'firestore_document_lookup_by_known_uid',
      immutabilityPolicy: 'mutable_with_rules',
      description:
        'ملفات تعريف المستخدمين المرتبطين بمساحات العمل المستهدفة ممن يملك المستخدِم الحالي صلاحية قراءتها عبر getDoc',
    },
  ];

  const platformGovernanceIncluded: CollectionScopeDisclosure['includedCollections'] = [
    {
      name: 'account_licenses',
      acquisitionMethod: 'firestore_collection_query',
      immutabilityPolicy: 'mutable_with_rules',
      description:
        'سجلات تراخيص الحسابات ومساحات العمل وحالات الموافقة (pending, active, expired, suspended, rejected) وتواريخ الصلاحية وحدود الفريق',
    },
    {
      name: 'subscription_packages',
      acquisitionMethod: 'firestore_collection_query',
      immutabilityPolicy: 'mutable_with_rules',
      description:
        'سجلات باقات الاشتراك الرسمية ومددها (شهرية، ربع سنوية، سنوية، مدى الحياة) وحدود أعضاء الفريق والأسعار',
    },
    {
      name: 'platform_staff',
      acquisitionMethod: 'firestore_collection_query',
      immutabilityPolicy: 'mutable_with_rules',
      description:
        'سجلات مساعدي إدارة المنصة وصلاحياتهم المفوضة (canViewRequests, canApproveAndRenew, canManagePackages)',
    },
  ];

  const excludedCollectionsAndData: CollectionScopeDisclosure['excludedCollectionsAndData'] = [
    {
      name: 'Firebase Authentication (حسابات المصادقة والهويات)',
      category: 'authentication',
      reason:
        'حسابات تسجيل الدخول في Firebase Auth وكلمات المرور وروابط Google OAuth وحالة توثيق البريد (email_verified) تُدار في خدمة الهوية المستقلة خارج Firestore ولا يمكن تصديرها من المتصفح.',
    },
    {
      name: 'Firestore Indexes & Security Rules (الفهارس وقواعد الأمان)',
      category: 'infrastructure_indexes_rules',
      reason:
        'الفهارس المركبة (Composite Indexes) وقواعد الأمان المنشورة (/firestore.rules) هي إعدادات بنية تحتية في مشروع Firebase وليست وثائق بيانات.',
    },
    {
      name: 'Environment & Deployment Config (متغيرات البيئة وإعدادات النشر)',
      category: 'environment_and_secrets',
      reason:
        'ملفات البيئة (.env) وإعدادات Vercel ومفاتيح VAPID الخاصة ومفاتيح واجهات البرمجة مستثناة ومحظورة أمنيًا لمنع تسرب الأسرار.',
    },
    {
      name: 'External Push Subscriptions (.data/push-subscriptions.json)',
      category: 'external_notifications',
      reason:
        'اشتراكات إشعارات الدفع (Web Push Endpoints & Auth Keys) وسجل الإرسال مخزنة على الخادم المحلي خارج Firestore وتحتوي على مفاتيح تشفير جلسات المتصفح.',
    },
    {
      name: 'admins (مجموعة مشرفي ومالكي المنصة)',
      category: 'security_governance',
      reason:
        'قواعد Firestore تمنع الاستعلام الجماعي (list) على مجموعة admins، كما يُمنع أمنيًا استعادة أو تعديل صلاحيات مالكي المنصة عبر ملفات النسخ الاحتياطي.',
    },
    includePlatformGovernance
      ? {
          name: 'Client LocalStorage & Ephemeral UI Cache (البيانات المؤقتة في متصفح العميل)',
          category: 'security_governance',
          reason:
            'البيانات المحلية المؤقتة في متصفح المستخدم (localStorage والوضع الداكن والتفضيلات المؤقتة) محلية في الجهاز ولا تُعد جزءًا من قاعدة البيانات المركزية.',
        }
      : {
          name: 'account_licenses & platform_staff (مجموعات التراخيص ومساعدي المنصة)',
          category: 'security_governance',
          reason:
            'هذه المجموعات جزء من المخطط المقترح للمرحلة الثانية (في DRAFT_firestore.rules فقط) ولم تُنشأ أو تُفعل في قاعدة بيانات الإنتاج خلال المرحلة الأولى.',
        },
    {
      name: 'users (الحسابات غير المرتبطة أو المحمية بقواعد الخصوصية)',
      category: 'privacy_restricted_profiles',
      reason:
        'قواعد /users/{userId} تمنع list الشامل وتقصر get على صاحب الحساب نفسه أو مالك المنصة (isAdmin)؛ لذا عند التصدير بواسطة مالك مساحة عمل عادي لا تُجلب وثائق /users الخاصة بأعضاء فريقه الآخرين.',
    },
  ];

  return {
    backupClassification: 'operational_firestore_data_partial',
    isFullDisasterRecovery: false,
    disclaimerAr: includePlatformGovernance
      ? 'تنبيه هام: هذه النسخة تغطي البيانات التشغيلية ومجموعات التراخيص والباقات ومساعدي المنصة وسجلات التدقيق المسموح بقراءتها في Firestore فقط، ولا تُعدّ نسخة تعافٍ كامل للنظام (Not Full Disaster Recovery)؛ إذ لا تشمل حسابات Firebase Authentication، ولا الفهارس المركبة وقواعد الأمان، ولا متغيرات البيئة والأسرار، ولا مجموعة /admins، ولا اشتراكات إشعارات الدفع الخارجية على الخادم.'
      : 'تنبيه هام: هذه النسخة تغطي البيانات التشغيلية المسموح بقراءتها في Firestore فقط، ولا تُعدّ نسخة تعافٍ كامل للنظام (Not Full Disaster Recovery)؛ إذ لا تشمل حسابات Firebase Authentication، ولا الفهارس المركبة، ولا متغيرات البيئة، ولا اشتراكات إشعارات الدفع الخارجية على الخادم.',
    includedCollections: includePlatformGovernance
      ? [...baseIncludedCollections, ...platformGovernanceIncluded]
      : baseIncludedCollections,
    excludedCollectionsAndData,
  };
}

/**
 * تطبيع اسم الحقل من camelCase / PascalCase / kebab-case إلى snake_case بحروف صغيرة
 * لضمان فحص حدود الكلمات بدقة دون تطابق جزئي خاطئ
 */
export function normalizeFieldKeyForSecretCheck(key: string): string {
  return key
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/[-\s.]+/g, '_')
    .toLowerCase();
}

/**
 * فحص ما إذا كان اسم الحقل يطابق أي نمط من أنماط المفاتيح السرية أو بيانات الاعتماد،
 * مع ضمان حماية كافة الحقول المشروعة في مخطط المجموعات الـ 13 من أي حذف بالخطأ
 */
export function isForbiddenSecretFieldName(key: string): boolean {
  const trimmed = key.trim();
  if (!trimmed) return false;
  if (OFFICIAL_ALLOWED_SCHEMA_FIELDS.has(trimmed)) {
    return false;
  }
  const normalized = normalizeFieldKeyForSecretCheck(trimmed);
  return FORBIDDEN_SECRET_NORMALIZED_PATTERNS.some((pattern) => pattern.test(normalized));
}

/**
 * التحقق مما إذا كانت القيمة كائن Timestamp من Firestore أو تمثيلاً مباشرًا له
 */
function isFirestoreTimestampLike(
  val: unknown
): val is { seconds: number; nanoseconds: number; toDate?: () => Date } {
  if (!val || typeof val !== 'object') return false;
  if (val instanceof Timestamp) return true;
  const candidate = val as Record<string, unknown>;
  if (
    typeof candidate.seconds === 'number' &&
    typeof candidate.nanoseconds === 'number' &&
    (typeof candidate.toDate === 'function' ||
      typeof candidate.toMillis === 'function' ||
      Object.keys(candidate).every((k) => k === 'seconds' || k === 'nanoseconds' || k === 'type'))
  ) {
    return true;
  }
  if (
    typeof candidate._seconds === 'number' &&
    typeof candidate._nanoseconds === 'number' &&
    Object.keys(candidate).length === 2
  ) {
    return true;
  }
  return false;
}

/**
 * التحقق مما إذا كانت القيمة مغلفة مسبقًا كـ SerializedFirestoreTimestamp
 */
export function isSerializedFirestoreTimestamp(
  val: unknown
): val is SerializedFirestoreTimestamp {
  if (!val || typeof val !== 'object') return false;
  const obj = val as Record<string, unknown>;
  return (
    obj.__rasdFirestoreType === 'timestamp' &&
    typeof obj.seconds === 'number' &&
    typeof obj.nanoseconds === 'number'
  );
}

export function isSerializedFirestoreGeoPoint(
  val: unknown
): val is SerializedFirestoreGeoPoint {
  if (!val || typeof val !== 'object') return false;
  const obj = val as Record<string, unknown>;
  return (
    obj.__rasdFirestoreType === 'geopoint' &&
    typeof obj.latitude === 'number' &&
    typeof obj.longitude === 'number'
  );
}

export function isSerializedFirestoreBytes(
  val: unknown
): val is SerializedFirestoreBytes {
  if (!val || typeof val !== 'object') return false;
  const obj = val as Record<string, unknown>;
  return obj.__rasdFirestoreType === 'bytes' && typeof obj.base64 === 'string';
}

/**
 * تحويل كائنات Firestore الخاصة (Timestamp, GeoPoint, Bytes, Date) إلى تمثيل JSON قياسي موسوم
 * مع تنقية أي حقول سرية في الوقت ذاته
 */
export function sanitizeAndSerializeForBackup(
  input: unknown,
  removedKeysTracker: string[] = [],
  timestampCounter: { count: number } = { count: 0 },
  currentPath = ''
): unknown {
  if (input === null || input === undefined) {
    return input;
  }

  // 1. معالجة الطوابع الزمنية المرقمة مسبقًا
  if (isSerializedFirestoreTimestamp(input)) {
    timestampCounter.count += 1;
    const ts = new Timestamp(input.seconds, input.nanoseconds);
    return {
      __rasdFirestoreType: 'timestamp',
      seconds: input.seconds,
      nanoseconds: input.nanoseconds,
      iso: ts.toDate().toISOString(),
    } satisfies SerializedFirestoreTimestamp;
  }

  // 2. معالجة كائنات Firestore Timestamp الأصلية أو الشبيهة بها
  if (isFirestoreTimestampLike(input)) {
    timestampCounter.count += 1;
    const rawObj = input as Record<string, unknown>;
    const seconds =
      typeof rawObj.seconds === 'number' ? rawObj.seconds : Number(rawObj._seconds || 0);
    const nanoseconds =
      typeof rawObj.nanoseconds === 'number'
        ? rawObj.nanoseconds
        : Number(rawObj._nanoseconds || 0);
    const ts = new Timestamp(seconds, nanoseconds);
    return {
      __rasdFirestoreType: 'timestamp',
      seconds,
      nanoseconds,
      iso: ts.toDate().toISOString(),
    } satisfies SerializedFirestoreTimestamp;
  }

  // 3. معالجة كائنات Date القياسية وتحويلها إلى Timestamp موسوم
  if (input instanceof Date) {
    timestampCounter.count += 1;
    const ts = Timestamp.fromDate(input);
    return {
      __rasdFirestoreType: 'timestamp',
      seconds: ts.seconds,
      nanoseconds: ts.nanoseconds,
      iso: input.toISOString(),
    } satisfies SerializedFirestoreTimestamp;
  }

  // 4. معالجة GeoPoint
  if (input instanceof GeoPoint || isSerializedFirestoreGeoPoint(input)) {
    const gp = input as { latitude: number; longitude: number };
    return {
      __rasdFirestoreType: 'geopoint',
      latitude: gp.latitude,
      longitude: gp.longitude,
    } satisfies SerializedFirestoreGeoPoint;
  }

  // 5. معالجة Bytes
  if (input instanceof Bytes) {
    return {
      __rasdFirestoreType: 'bytes',
      base64: input.toBase64(),
    } satisfies SerializedFirestoreBytes;
  }
  if (isSerializedFirestoreBytes(input)) {
    return {
      __rasdFirestoreType: 'bytes',
      base64: input.base64,
    } satisfies SerializedFirestoreBytes;
  }

  // 6. معالجة المصفوفات
  if (Array.isArray(input)) {
    return input.map((item, idx) =>
      sanitizeAndSerializeForBackup(
        item,
        removedKeysTracker,
        timestampCounter,
        `${currentPath}[${idx}]`
      )
    );
  }

  // 7. معالجة الكائنات (Maps)
  if (typeof input === 'object') {
    const obj = input as Record<string, unknown>;
    const sanitized: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      const fullPath = currentPath ? `${currentPath}.${key}` : key;
      if (isForbiddenSecretFieldName(key)) {
        removedKeysTracker.push(fullPath);
        continue;
      }
      const val = obj[key];
      if (typeof val === 'function' || val === undefined) {
        continue;
      }
      sanitized[key] = sanitizeAndSerializeForBackup(
        val,
        removedKeysTracker,
        timestampCounter,
        fullPath
      );
    }
    return sanitized;
  }

  return input;
}

/**
 * إعادة بناء أنواع Firestore الأصلية (Timestamp, GeoPoint, Bytes) عند الاستعادة من النسخة الاحتياطية
 */
export function reconstructFirestoreTypesFromBackup(
  input: unknown,
  reconstructedTracker: { timestamps: number } = { timestamps: 0 }
): unknown {
  if (input === null || input === undefined) {
    return input;
  }

  if (isSerializedFirestoreTimestamp(input)) {
    reconstructedTracker.timestamps += 1;
    return new Timestamp(input.seconds, input.nanoseconds);
  }

  if (input instanceof Timestamp) {
    reconstructedTracker.timestamps += 1;
    return new Timestamp(input.seconds, input.nanoseconds);
  }

  if (isSerializedFirestoreGeoPoint(input)) {
    return new GeoPoint(input.latitude, input.longitude);
  }

  if (isSerializedFirestoreBytes(input)) {
    return Bytes.fromBase64String(input.base64);
  }

  if (Array.isArray(input)) {
    return input.map((item) => reconstructFirestoreTypesFromBackup(item, reconstructedTracker));
  }

  if (typeof input === 'object') {
    const obj = input as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
      result[key] = reconstructFirestoreTypesFromBackup(obj[key], reconstructedTracker);
    }
    return result;
  }

  return input;
}

/**
 * تجهيز محتوى الوثيقة للاستعادة مع ضمان عدم إرسال حقل 'id' داخل الوثيقة
 * إلا إذا كانت المجموعة تسمح بذلك صراحة في COLLECTIONS_ALLOWING_ID_IN_DOCUMENT_BODY
 */
export function prepareDocumentForRestore(
  collectionName: BackupCollectionName,
  envelope: BackupDocumentEnvelope,
  reconstructedTracker: { timestamps: number } = { timestamps: 0 }
): { docId: string; restoredData: Record<string, unknown> } {
  const rawBody = { ...envelope.docData };
  if (!COLLECTIONS_ALLOWING_ID_IN_DOCUMENT_BODY.has(collectionName)) {
    delete rawBody.id;
  }
  const restoredData = reconstructFirestoreTypesFromBackup(
    rawBody,
    reconstructedTracker
  ) as Record<string, unknown>;
  return {
    docId: envelope.docId,
    restoredData,
  };
}

/**
 * ترتيب المفاتيح بشكل حتمي لحساب بصمة التحقق (Checksum) بدقة، مع دعم كائنات Timestamp الأصلية والموسومة
 */
export function canonicalizeJson(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (value instanceof Timestamp) {
    return canonicalizeJson({
      __rasdFirestoreType: 'timestamp',
      seconds: value.seconds,
      nanoseconds: value.nanoseconds,
      iso: value.toDate().toISOString(),
    });
  }
  if (value instanceof GeoPoint) {
    return canonicalizeJson({
      __rasdFirestoreType: 'geopoint',
      latitude: value.latitude,
      longitude: value.longitude,
    });
  }
  if (value instanceof Bytes) {
    return canonicalizeJson({
      __rasdFirestoreType: 'bytes',
      base64: value.toBase64(),
    });
  }
  if (Array.isArray(value)) {
    return '[' + value.map((item) => canonicalizeJson(item)).join(',') + ']';
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const entries = keys.map((k) => `${JSON.stringify(k)}:${canonicalizeJson(obj[k])}`);
    return '{' + entries.join(',') + '}';
  }
  return 'null';
}

/**
 * حساب بصمة حتمية (Deterministic Checksum) لبيانات النسخة الاحتياطية
 */
export function computeBackupChecksum(
  data: Record<BackupCollectionName, BackupDocumentEnvelope[]>
): string {
  const canonical = canonicalizeJson(data);
  let h1 = 0xdeadbeef ^ canonical.length;
  let h2 = 0x41c6ce57 ^ canonical.length;
  for (let i = 0; i < canonical.length; i++) {
    const ch = canonical.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return `rasd-chk-v2-${hex1}${hex2}-${canonical.length}`;
}

/**
 * فحص وجود أي حقول سرية داخل البيانات
 */
export function findForbiddenSecretFields(
  input: unknown,
  currentPath = '',
  found: string[] = []
): string[] {
  if (!input || typeof input !== 'object') return found;
  if (Array.isArray(input)) {
    input.forEach((item, idx) => findForbiddenSecretFields(item, `${currentPath}[${idx}]`, found));
    return found;
  }
  const obj = input as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    const path = currentPath ? `${currentPath}.${key}` : key;
    if (isForbiddenSecretFieldName(key)) {
      found.push(path);
    }
    findForbiddenSecretFields(obj[key], path, found);
  }
  return found;
}

/**
 * عدّ الطوابع الزمنية الموسومة داخل حزمة البيانات للتحقق من سلامة تصديرها
 */
export function countSerializedTimestamps(input: unknown): number {
  if (!input || typeof input !== 'object') return 0;
  if (isSerializedFirestoreTimestamp(input)) return 1;
  if (Array.isArray(input)) {
    return input.reduce((acc, item) => acc + countSerializedTimestamps(item), 0);
  }
  const obj = input as Record<string, unknown>;
  return Object.values(obj).reduce<number>(
    (acc, val) => acc + countSerializedTimestamps(val),
    0
  );
}

/**
 * التحقق الشامل من سلامة النسخة الاحتياطية:
 * 1. تطابق أعداد السجلات لكل مجموعة.
 * 2. تطابق معرفات الوثائق (envelope.docId) وعدم وجود تكرار أو معرفات مفقودة.
 * 3. فصل معرف الوثيقة (docId) عن محتوى الوثيقة (docData) والتأكد من عدم تسرب حقل 'id' غير المعتمد.
 * 4. التحقق من استخدام الحقل المعتمد 'ownerId' بدلاً من 'ownerUid' في مساحات العمل والسجلات.
 * 5. تطابق بصمة البيانات (Checksum) وخلو النسخة تمامًا من أي مفاتيح سرية.
 * 6. سلامة العلاقات المرجعية (Foreign Keys) بين المجموعات.
 */
export function verifyBackupIntegrity(payload: RasdBackupPayload): BackupIntegrityReport {
  const duplicateDocumentIds: { collection: string; docId: string }[] = [];
  const missingDocumentIds: { collection: string; index: number }[] = [];
  const brokenRelations: RelationalBrokenLink[] = [];
  const orphanWorkspaceRecords: { collection: string; docId: string; workspaceId: string }[] = [];
  const unapprovedIdFieldLeaks: { collection: BackupCollectionName; docId: string }[] = [];
  const invalidOwnerIdRecords: { collection: BackupCollectionName; docId: string; reason: string }[] = [];

  const allCollectionNames: BackupCollectionName[] = resolveActiveBackupCollections(
    undefined,
    payload.data
  );
  let collectionCountsMatch = true;
  let documentIdSetMatch = true;
  let totalDocumentsChecked = 0;

  const idSets: Record<BackupCollectionName, Set<string>> = {
    workspaces: new Set(),
    workspace_members: new Set(),
    taxpayers: new Set(),
    properties: new Set(),
    property_units: new Set(),
    field_visits: new Set(),
    appointments: new Set(),
    appointment_postponements: new Set(),
    financial_assessments: new Set(),
    financial_transactions: new Set(),
    notifications: new Set(),
    audit_logs: new Set(),
    users: new Set(),
    account_licenses: new Set(),
    subscription_packages: new Set(),
    platform_staff: new Set(),
  };

  for (const colName of allCollectionNames) {
    const envelopes = payload.data?.[colName] || [];
    const expectedCount = payload.manifest?.collectionCounts?.[colName] ?? -1;
    if (envelopes.length !== expectedCount) {
      collectionCountsMatch = false;
    }

    envelopes.forEach((env, index) => {
      totalDocumentsChecked += 1;
      const docId = typeof env?.docId === 'string' ? env.docId.trim() : '';
      const docData = env?.docData;

      if (!docId || !docData || typeof docData !== 'object') {
        missingDocumentIds.push({ collection: colName, index });
      } else if (idSets[colName].has(docId)) {
        duplicateDocumentIds.push({ collection: colName, docId });
      } else {
        idSets[colName].add(docId);
      }

      // فحص فصل المعرف عن المحتوى: منع وجود حقل 'id' داخل docData ما لم يكن معتمدًا في المخطط
      if (
        docData &&
        typeof docData === 'object' &&
        !COLLECTIONS_ALLOWING_ID_IN_DOCUMENT_BODY.has(colName) &&
        Object.prototype.hasOwnProperty.call(docData, 'id')
      ) {
        unapprovedIdFieldLeaks.push({ collection: colName, docId: docId || `#${index}` });
      }

      // فحص توافق ownerId مع المخطط الفعلي وعدم استخدام ownerUid الخاطئ
      if (
        colName !== 'users' &&
        colName !== 'subscription_packages' &&
        colName !== 'platform_staff' &&
        docData &&
        typeof docData === 'object'
      ) {
        if (Object.prototype.hasOwnProperty.call(docData, 'ownerUid') && !docData.ownerId) {
          invalidOwnerIdRecords.push({
            collection: colName,
            docId: docId || `#${index}`,
            reason: 'يحتوي السجل على الحقل غير المعتمد ownerUid بدلاً من الحقل الفعلي ownerId',
          });
        }
        if (colName === 'workspaces' || colName === 'account_licenses') {
          const ownerIdVal = typeof docData.ownerId === 'string' ? docData.ownerId.trim() : '';
          if (!ownerIdVal) {
            invalidOwnerIdRecords.push({
              collection: colName,
              docId: docId || `#${index}`,
              reason: `وثيقة ${colName} تفتقر إلى الحقل الإلزامي ownerId`,
            });
          }
        }
        if (colName === 'account_licenses') {
          const wsIdVal = typeof docData.workspaceId === 'string' ? docData.workspaceId.trim() : '';
          const maxMembersVal = Number(docData.maxMembers);
          if (!wsIdVal || wsIdVal !== docId) {
            invalidOwnerIdRecords.push({
              collection: colName,
              docId: docId || `#${index}`,
              reason: 'معرّف وثيقة الترخيص في account_licenses يجب أن يطابق الحقل workspaceId',
            });
          }
          if (!Number.isInteger(maxMembersVal) || maxMembersVal < 1 || maxMembersVal > 10) {
            invalidOwnerIdRecords.push({
              collection: colName,
              docId: docId || `#${index}`,
              reason: 'حقل maxMembers في account_licenses يجب أن يكون عددًا صحيحًا بين 1 و10',
            });
          }
        }
      }

      if (colName === 'platform_staff' && docData && typeof docData === 'object') {
        const staffUid = typeof docData.uid === 'string' ? docData.uid.trim() : '';
        const staffEmail = typeof docData.email === 'string' ? docData.email.trim().toLowerCase() : '';
        if (!staffUid || staffUid !== docId) {
          invalidOwnerIdRecords.push({
            collection: colName,
            docId: docId || `#${index}`,
            reason: 'معرّف وثيقة المساعد في platform_staff يجب أن يطابق الحقل uid',
          });
        }
        if (
          staffEmail === 'am1075022@gmail.com' ||
          staffEmail === 'ahah26@gmail.com' ||
          staffEmail === 'ahah26h@gmail.com'
        ) {
          invalidOwnerIdRecords.push({
            collection: colName,
            docId: docId || `#${index}`,
            reason: 'لا يجوز إدراج البريد الإلكتروني للمالك الدائم ضمن مجموعة مساعدي المنصة platform_staff',
          });
        }
      }
    });

    const manifestIds = payload.manifest?.documentIdsByCollection?.[colName] || [];
    if (manifestIds.length !== idSets[colName].size) {
      documentIdSetMatch = false;
    } else {
      for (const mId of manifestIds) {
        if (!idSets[colName].has(mId)) {
          documentIdSetMatch = false;
          break;
        }
      }
    }
  }

  if (totalDocumentsChecked !== payload.manifest?.totalDocuments) {
    collectionCountsMatch = false;
  }

  // التحقق من العلاقات المرجعية بين السجلات (Relational Integrity)
  const checkForeignKey = (
    sourceCollection: BackupCollectionName,
    sourceDocId: string,
    foreignKeyField: string,
    foreignIdValue: unknown,
    targetCollection: BackupCollectionName,
    optional = false
  ) => {
    if (optional && (foreignIdValue === undefined || foreignIdValue === null || foreignIdValue === '')) {
      return;
    }
    const targetId = typeof foreignIdValue === 'string' ? foreignIdValue.trim() : '';
    if (!targetId || !idSets[targetCollection].has(targetId)) {
      brokenRelations.push({
        sourceCollection,
        sourceDocId,
        foreignKeyField,
        targetCollection,
        missingTargetId: targetId || '(فارغ)',
      });
    }
  };

  const workspaceScopedCollections: BackupWorkspaceCollectionName[] = [
    'workspace_members',
    'taxpayers',
    'properties',
    'property_units',
    'field_visits',
    'appointments',
    'appointment_postponements',
    'financial_assessments',
    'financial_transactions',
    'notifications',
    'audit_logs',
  ];

  for (const colName of workspaceScopedCollections) {
    const envelopes = payload.data?.[colName] || [];
    for (const env of envelopes) {
      const docId = String(env.docId || '');
      const wsId = typeof env.docData?.workspaceId === 'string' ? env.docData.workspaceId.trim() : '';
      if (!wsId || !idSets.workspaces.has(wsId)) {
        orphanWorkspaceRecords.push({
          collection: colName,
          docId,
          workspaceId: wsId || '(مفقود)',
        });
      }
    }
  }

  // التحقق من ارتباط سجلات التراخيص (account_licenses) بمساحات العمل الموجودة في النسخة الاحتياطية
  for (const env of payload.data?.account_licenses || []) {
    const docId = String(env.docId || '');
    const wsId = typeof env.docData?.workspaceId === 'string' ? env.docData.workspaceId.trim() : '';
    if (!wsId || !idSets.workspaces.has(wsId)) {
      orphanWorkspaceRecords.push({
        collection: 'account_licenses',
        docId,
        workspaceId: wsId || '(مفقود)',
      });
    }
  }

  // 1. properties: يجب أن يرتبط كل عقار بمكلف فعلي موجود في taxpayers (لا يُقبل أي معرف عام في properties.taxpayerId وفق /firestore.rules السطر 516)
  for (const env of payload.data.properties || []) {
    checkForeignKey('properties', env.docId, 'taxpayerId', env.docData.taxpayerId, 'taxpayers', false);
  }

  // 2. property_units: يجب أن ترتبط كل وحدة بعقار فعلي موجود في properties (/firestore.rules السطر 546)،
  // بينما يسمح RasdContext.tsx (السطر 1178) بقيمة 'general_tp' كقيمة احتياطية في property_units.taxpayerId
  for (const env of payload.data.property_units || []) {
    checkForeignKey('property_units', env.docId, 'propertyId', env.docData.propertyId, 'properties', false);
    const unitTpId = env.docData.taxpayerId;
    if (unitTpId !== APPROVED_GENERAL_TAXPAYER_ID) {
      checkForeignKey('property_units', env.docId, 'taxpayerId', unitTpId, 'taxpayers', false);
    }
  }

  // 3. field_visits: وفق /firestore.rules (الأسطر 577-581) و RasdContext.tsx (الأسطر 1565-1567):
  // - إذا كان propertyId == 'general_prop' فيجب حتمًا أن يكون taxpayerId موجودًا فعليًا في taxpayers (لا يُقبل 'general_tp' هنا).
  // - إذا كان propertyId يشير إلى عقار فعلي، فيُتحقق من وجود العقار في properties، ويُسمح بـ 'general_tp' في taxpayerId أو وجوده في taxpayers.
  for (const env of payload.data.field_visits || []) {
    const propId = env.docData.propertyId;
    const tpId = env.docData.taxpayerId;
    if (propId === APPROVED_GENERAL_PROPERTY_ID) {
      checkForeignKey('field_visits', env.docId, 'taxpayerId', tpId, 'taxpayers', false);
    } else {
      checkForeignKey('field_visits', env.docId, 'propertyId', propId, 'properties', false);
      if (tpId !== APPROVED_GENERAL_TAXPAYER_ID) {
        checkForeignKey('field_visits', env.docId, 'taxpayerId', tpId, 'taxpayers', false);
      }
    }
  }

  // 4. appointments: وفق /firestore.rules (الأسطر 215-238، 604-611) و RasdContext.tsx (الأسطر 1707-1709):
  // - يُسمح بـ 'general_prop' في propertyId و 'general_tp' في taxpayerId.
  // - لا يوجد حقل علوي باسم linkedVisitId في مخطط appointments (يُرمّز داخل notes).
  for (const env of payload.data.appointments || []) {
    const propId = env.docData.propertyId;
    const tpId = env.docData.taxpayerId;
    if (propId !== APPROVED_GENERAL_PROPERTY_ID) {
      checkForeignKey('appointments', env.docId, 'propertyId', propId, 'properties', false);
    }
    if (tpId !== APPROVED_GENERAL_TAXPAYER_ID) {
      checkForeignKey('appointments', env.docId, 'taxpayerId', tpId, 'taxpayers', false);
    }
  }

  // 5. appointment_postponements: يجب أن يرتبط كل تأجيل بموعد فعلي موجود في appointments (/firestore.rules السطر 639)
  for (const env of payload.data.appointment_postponements || []) {
    checkForeignKey(
      'appointment_postponements',
      env.docId,
      'appointmentId',
      env.docData.appointmentId,
      'appointments',
      false
    );
  }

  // 6. financial_assessments: وفق /firestore.rules (الأسطر 656-660) و RasdContext.tsx (الأسطر 1967-1969):
  // - إذا كان propertyId == 'general_prop' فيجب حتمًا أن يكون taxpayerId موجودًا فعليًا في taxpayers.
  // - إذا كان propertyId يشير إلى عقار فعلي، فيُتحقق من وجود العقار في properties، ويُسمح بـ 'general_tp' في taxpayerId أو وجوده في taxpayers.
  for (const env of payload.data.financial_assessments || []) {
    const propId = env.docData.propertyId;
    const tpId = env.docData.taxpayerId;
    if (propId === APPROVED_GENERAL_PROPERTY_ID) {
      checkForeignKey('financial_assessments', env.docId, 'taxpayerId', tpId, 'taxpayers', false);
    } else {
      checkForeignKey('financial_assessments', env.docId, 'propertyId', propId, 'properties', false);
      if (tpId !== APPROVED_GENERAL_TAXPAYER_ID) {
        checkForeignKey('financial_assessments', env.docId, 'taxpayerId', tpId, 'taxpayers', false);
      }
    }
  }

  // 7. financial_transactions: وفق /firestore.rules (الأسطر 281-304، 703-707) و RasdContext.tsx (الأسطر 2094-2098):
  // - إذا كان propertyId == 'general_prop' فيجب حتمًا أن يكون taxpayerId موجودًا فعليًا في taxpayers.
  // - إذا كان propertyId يشير إلى عقار فعلي، فيُتحقق من وجود العقار في properties، ويُسمح بـ 'general_tp' في taxpayerId أو وجوده في taxpayers.
  // - في assessmentId يُسمح بالمعرف المعتمد 'general_account' عند التحصيل العام، وإلا فيجب أن يشير إلى تقييم موجود في financial_assessments.
  for (const env of payload.data.financial_transactions || []) {
    const propId = env.docData.propertyId;
    const tpId = env.docData.taxpayerId;
    const assessId = env.docData.assessmentId;
    if (propId === APPROVED_GENERAL_PROPERTY_ID) {
      checkForeignKey('financial_transactions', env.docId, 'taxpayerId', tpId, 'taxpayers', false);
    } else {
      checkForeignKey('financial_transactions', env.docId, 'propertyId', propId, 'properties', false);
      if (tpId !== APPROVED_GENERAL_TAXPAYER_ID) {
        checkForeignKey('financial_transactions', env.docId, 'taxpayerId', tpId, 'taxpayers', false);
      }
    }
    if (assessId !== APPROVED_GENERAL_ASSESSMENT_ID) {
      checkForeignKey(
        'financial_transactions',
        env.docId,
        'assessmentId',
        assessId,
        'financial_assessments',
        false
      );
    }
  }

  const computedChecksum = computeBackupChecksum(payload.data);
  const checksumMatches = computedChecksum === payload.manifest?.checksum;

  const detectedSecretFields = findForbiddenSecretFields(payload.data);
  const zeroSecretsConfirmed = detectedSecretFields.length === 0;
  const envelopeSeparationVerified = unapprovedIdFieldLeaks.length === 0;
  const serializedTimestampsVerifiedCount = countSerializedTimestamps(payload.data);

  const isValid =
    collectionCountsMatch &&
    documentIdSetMatch &&
    checksumMatches &&
    zeroSecretsConfirmed &&
    envelopeSeparationVerified &&
    invalidOwnerIdRecords.length === 0 &&
    duplicateDocumentIds.length === 0 &&
    missingDocumentIds.length === 0 &&
    brokenRelations.length === 0 &&
    orphanWorkspaceRecords.length === 0;

  const summaryAr = isValid
    ? `تم التحقق بنجاح من ${totalDocumentsChecked} وثيقة عبر ${allCollectionNames.length} مجموعة؛ المعرفات مفصولة في الأغلفة (بدون تسرب حقل id)، وحقل ownerId متوافق، و${serializedTimestampsVerifiedCount} طابعًا زمنيًا (Timestamp) موثقًا، والعلاقات المرجعية والبصمة الرقمية سليمة 100%.`
    : `فشل التحقق من سلامة النسخة: [تطابق الأعداد=${collectionCountsMatch}, تطابق المعرفات=${documentIdSetMatch}, فصل المعرف عن المحتوى=${envelopeSeparationVerified}, سلامة ownerId=${invalidOwnerIdRecords.length === 0}, البصمة=${checksumMatches}, خلو الأسرار=${zeroSecretsConfirmed}, علاقات مكسورة=${brokenRelations.length}, سجلات يتيمة=${orphanWorkspaceRecords.length}]`;

  return {
    isValid,
    checkedAt: new Date().toISOString(),
    totalCollectionsChecked: allCollectionNames.length,
    totalDocumentsChecked,
    collectionCountsMatch,
    documentIdSetMatch,
    checksumMatches,
    zeroSecretsConfirmed,
    envelopeSeparationVerified,
    unapprovedIdFieldLeaks,
    invalidOwnerIdRecords,
    serializedTimestampsVerifiedCount,
    detectedSecretFields,
    duplicateDocumentIds,
    missingDocumentIds,
    brokenRelations,
    orphanWorkspaceRecords,
    summaryAr,
  };
}

/**
 * تطبيع مدخل السجل الخام إلى غلاف { docId, docData } مع فصل المعرف عن محتوى الوثيقة
 */
function normalizeRawInputToEnvelope(
  colName: BackupCollectionName,
  rawItem: Record<string, unknown> | BackupDocumentEnvelope
): { docId: string; rawDocData: Record<string, unknown> } {
  if (
    rawItem &&
    typeof rawItem === 'object' &&
    typeof (rawItem as BackupDocumentEnvelope).docId === 'string' &&
    (rawItem as BackupDocumentEnvelope).docData &&
    typeof (rawItem as BackupDocumentEnvelope).docData === 'object'
  ) {
    const env = rawItem as BackupDocumentEnvelope;
    const clonedBody = { ...env.docData };
    if (!COLLECTIONS_ALLOWING_ID_IN_DOCUMENT_BODY.has(colName)) {
      delete clonedBody.id;
    }
    return { docId: env.docId.trim(), rawDocData: clonedBody };
  }

  const record = { ...(rawItem as Record<string, unknown>) };
  const extractedId =
    typeof record.id === 'string' && record.id.trim()
      ? record.id.trim()
      : (colName === 'users' || colName === 'platform_staff') && typeof record.uid === 'string'
        ? record.uid.trim()
        : colName === 'account_licenses' && typeof record.workspaceId === 'string'
          ? record.workspaceId.trim()
          : '';

  if (!COLLECTIONS_ALLOWING_ID_IN_DOCUMENT_BODY.has(colName)) {
    delete record.id;
  }

  return {
    docId: extractedId,
    rawDocData: record,
  };
}

/**
 * إنشاء حزمة نسخة احتياطية مهيكلة من مجموعة سجلات خام (سواء من Firestore أو من بيانات اختبارية)
 * تفصل هذه الدالة معرف الوثيقة (docId) في الغلاف الخارجي وتحتفظ بـ docData نظيفًا ومطابقًا لمخطط Firestore
 */
export function buildBackupPayloadFromRawData(params: {
  rawCollections: Partial<
    Record<BackupCollectionName, (Record<string, unknown> | BackupDocumentEnvelope)[]>
  >;
  createdByUid: string;
  createdByEmail: string;
  scopeMode: BackupScopeMode;
  targetWorkspaceId: string | null;
  projectId?: string;
  databaseId?: string;
  includePlatformGovernance?: boolean;
}): RasdBackupPayload {
  const removedKeysTracker: string[] = [];
  const timestampCounter = { count: 0 };
  const allCollectionNames: BackupCollectionName[] = resolveActiveBackupCollections(
    params.includePlatformGovernance,
    params.rawCollections
  );
  const isPlatformGovernanceActive = allCollectionNames.includes('account_licenses');

  const sanitizedData = {} as Record<BackupCollectionName, BackupDocumentEnvelope[]>;
  const collectionCounts = {} as Record<BackupCollectionName, number>;
  const documentIdsByCollection = {} as Record<BackupCollectionName, string[]>;
  let totalDocuments = 0;

  for (const colName of allCollectionNames) {
    const rawList = params.rawCollections[colName] || [];
    const envelopes: BackupDocumentEnvelope[] = rawList
      .map((item) => {
        const { docId, rawDocData } = normalizeRawInputToEnvelope(colName, item);
        const serializedBody = sanitizeAndSerializeForBackup(
          rawDocData,
          removedKeysTracker,
          timestampCounter,
          `${colName}(${docId})`
        ) as Record<string, unknown>;

        if (!COLLECTIONS_ALLOWING_ID_IN_DOCUMENT_BODY.has(colName)) {
          delete serializedBody.id;
        }

        return {
          docId,
          docData: serializedBody,
        };
      })
      .sort((a, b) => a.docId.localeCompare(b.docId));

    sanitizedData[colName] = envelopes;
    collectionCounts[colName] = envelopes.length;
    documentIdsByCollection[colName] = envelopes.map((env) => env.docId);
    totalDocuments += envelopes.length;
  }

  const checksum = computeBackupChecksum(sanitizedData);

  return {
    schemaVersion: '1.1.0-stage1a',
    backupClassification: 'operational_firestore_data_partial',
    isFullDisasterRecovery: false,
    platformName: 'رَصْد — المساعد الميداني الذكي',
    createdAt: new Date().toISOString(),
    createdByUid: params.createdByUid,
    createdByEmail: params.createdByEmail,
    scopeMode: params.scopeMode,
    targetWorkspaceId: params.targetWorkspaceId,
    sourceEnvironment: {
      projectId: params.projectId || FIREBASE_PROJECT_ID,
      databaseId: params.databaseId || FIRESTORE_DATABASE_ID,
    },
    scopeDisclosure: getBackupScopeDisclosure(params.scopeMode, isPlatformGovernanceActive),
    manifest: {
      totalDocuments,
      collectionCounts,
      documentIdsByCollection,
      checksum,
      sanitizedFieldsCount: removedKeysTracker.length,
      sanitizedFieldPaths: [...removedKeysTracker],
      serializedTimestampsCount: timestampCounter.count,
    },
    data: sanitizedData,
  };
}

/**
 * استخراج نسخة احتياطية حقيقية مباشرة من Firestore
 * - يفصل d.id في envelope.docId ويحفظ d.data() في envelope.docData دون حقن حقل id.
 * - يستخدم الحقل الفعلي المعتمد ownerId لاستخراج معرف مالك مساحة العمل.
 * - يدعم اختياريًا تضمين مجموعات حوكمة المنصة والتراخيص (account_licenses, subscription_packages, platform_staff).
 */
export async function exportFirestoreBackup(options: {
  scopeMode: BackupScopeMode;
  workspaceId: string | null;
  currentUserUid: string;
  currentUserEmail: string;
  firestoreInstance?: Firestore;
  includePlatformGovernance?: boolean;
}): Promise<{ payload: RasdBackupPayload; integrity: BackupIntegrityReport }> {
  const targetDb = options.firestoreInstance || db;
  const rawCollections: Partial<Record<BackupCollectionName, BackupDocumentEnvelope[]>> = {};
  const knownUserUids = new Set<string>();
  if (options.currentUserUid) {
    knownUserUids.add(options.currentUserUid);
  }
  const shouldIncludeGovernance =
    options.includePlatformGovernance ?? options.scopeMode === 'all_accessible_workspaces';

  for (const colName of BACKUP_WORKSPACE_COLLECTIONS) {
    if (options.scopeMode === 'all_accessible_workspaces') {
      const snap = await getDocs(collection(targetDb, colName));
      rawCollections[colName] = snap.docs.map((d) => ({
        docId: d.id,
        docData: d.data() as Record<string, unknown>,
      }));
    } else {
      if (!options.workspaceId) {
        throw new Error('يجب تحديد معرف مساحة العمل (workspaceId) عند التصدير على مستوى مساحة عمل واحدة.');
      }
      if (colName === 'workspaces') {
        const wsSnap = await getDoc(doc(targetDb, 'workspaces', options.workspaceId));
        rawCollections.workspaces = wsSnap.exists()
          ? [{ docId: wsSnap.id, docData: wsSnap.data() as Record<string, unknown> }]
          : [];
      } else {
        const q = query(collection(targetDb, colName), where('workspaceId', '==', options.workspaceId));
        const snap = await getDocs(q);
        rawCollections[colName] = snap.docs.map((d) => ({
          docId: d.id,
          docData: d.data() as Record<string, unknown>,
        }));
      }
    }
  }

  // استخراج معرفات المستخدمين المرتبطين بمساحات العمل المستهدفة باستخدام الحقل الفعلي ownerId و memberUids
  for (const wsEnv of rawCollections.workspaces || []) {
    const ws = wsEnv.docData;
    if (typeof ws.ownerId === 'string' && ws.ownerId) {
      knownUserUids.add(ws.ownerId);
    }
    if (Array.isArray(ws.memberUids)) {
      ws.memberUids.forEach((u) => {
        if (typeof u === 'string' && u) knownUserUids.add(u);
      });
    }
  }
  for (const memberEnv of rawCollections.workspace_members || []) {
    const member = memberEnv.docData;
    if (typeof member.userId === 'string' && member.userId) {
      knownUserUids.add(member.userId);
    }
    if (typeof member.ownerId === 'string' && member.ownerId) {
      knownUserUids.add(member.ownerId);
    }
  }

  const userEnvelopes: BackupDocumentEnvelope[] = [];
  for (const uid of Array.from(knownUserUids)) {
    try {
      const uSnap = await getDoc(doc(targetDb, 'users', uid));
      if (uSnap.exists()) {
        userEnvelopes.push({
          docId: uSnap.id,
          docData: uSnap.data() as Record<string, unknown>,
        });
      }
    } catch {
      // في حال عدم امتلاك المستخدم الحالي صلاحية قراءة وثيقة /users الخاصة بعضو آخر، يتم تخطيها بأمان
    }
  }
  rawCollections.users = userEnvelopes;

  if (shouldIncludeGovernance) {
    try {
      if (options.scopeMode === 'all_accessible_workspaces') {
        const licSnap = await getDocs(collection(targetDb, 'account_licenses'));
        rawCollections.account_licenses = licSnap.docs.map((d) => ({
          docId: d.id,
          docData: d.data() as Record<string, unknown>,
        }));
      } else if (options.workspaceId) {
        const licDoc = await getDoc(doc(targetDb, 'account_licenses', options.workspaceId));
        rawCollections.account_licenses = licDoc.exists()
          ? [{ docId: licDoc.id, docData: licDoc.data() as Record<string, unknown> }]
          : [];
      }
    } catch {
      rawCollections.account_licenses = [];
    }

    try {
      const pkgSnap = await getDocs(collection(targetDb, 'subscription_packages'));
      rawCollections.subscription_packages = pkgSnap.docs.map((d) => ({
        docId: d.id,
        docData: d.data() as Record<string, unknown>,
      }));
    } catch {
      rawCollections.subscription_packages = [];
    }

    try {
      if (options.scopeMode === 'all_accessible_workspaces') {
        const staffSnap = await getDocs(collection(targetDb, 'platform_staff'));
        rawCollections.platform_staff = staffSnap.docs.map((d) => ({
          docId: d.id,
          docData: d.data() as Record<string, unknown>,
        }));
      } else {
        rawCollections.platform_staff = [];
      }
    } catch {
      rawCollections.platform_staff = [];
    }
  }

  const payload = buildBackupPayloadFromRawData({
    rawCollections,
    createdByUid: options.currentUserUid,
    createdByEmail: options.currentUserEmail,
    scopeMode: options.scopeMode,
    targetWorkspaceId: options.scopeMode === 'single_workspace' ? options.workspaceId : null,
    includePlatformGovernance: shouldIncludeGovernance,
  });

  const integrity = verifyBackupIntegrity(payload);
  return { payload, integrity };
}

/**
 * بيئة معزولة في الذاكرة (Isolated In-Memory Firestore Sandbox)
 * تحاكي سلوك Firestore الفعلي من حيث:
 * 1. فصل معرف الوثيقة (docId) عن محتوى الوثيقة (docData) وعدم حقن حقل 'id' داخل الوثيقة.
 * 2. الاحتفاظ بكائنات Timestamp و GeoPoint و Bytes كأنواع Firestore حقيقية.
 * 3. فرض عدم قابلية التعديل (Append-Only Immutability) على مجموعتي audit_logs و appointment_postponements.
 */
export class InMemoryFirestoreSandbox {
  private store: Map<BackupCollectionName, Map<string, Record<string, unknown>>> = new Map();
  public batchCommitsCount = 0;

  constructor() {
    const allCols: BackupCollectionName[] = [
      ...BACKUP_WORKSPACE_COLLECTIONS,
      'users',
      ...BACKUP_PLATFORM_GOVERNANCE_COLLECTIONS,
    ];
    allCols.forEach((c) => this.store.set(c, new Map()));
  }

  public clear(): void {
    this.store.forEach((map) => map.clear());
    this.batchCommitsCount = 0;
  }

  public hasDocument(collectionName: BackupCollectionName, docId: string): boolean {
    return this.store.get(collectionName)?.has(docId) ?? false;
  }

  public getDocument(
    collectionName: BackupCollectionName,
    docId: string
  ): Record<string, unknown> | undefined {
    return this.store.get(collectionName)?.get(docId);
  }

  /**
   * كتابة دفعة عمليات مع احترام سياسة المجموعات التاريخية غير القابلة للتعديل (create_only)
   */
  public writeBatchChunk(
    operations: {
      collection: BackupCollectionName;
      docId: string;
      data: Record<string, unknown>;
      mode: 'create_only' | 'set_replace';
    }[]
  ): void {
    for (const op of operations) {
      const colMap = this.store.get(op.collection);
      if (!colMap) {
        throw new Error(`مجموعة غير معروفة في بيئة الاختبار المعزولة: ${op.collection}`);
      }
      if (op.mode === 'create_only' && colMap.has(op.docId)) {
        throw new Error(
          `رفض أمني (Append-Only Immutability): لا يجوز الكتابة فوق الوثيقة التاريخية الموجودة مسبقًا ${op.collection}/${op.docId}.`
        );
      }
      // استنساخ الكائن مع الحفاظ على مثيلات Timestamp و GeoPoint و Bytes الأصلية دون حقن حقل id
      const cloned = reconstructFirestoreTypesFromBackup(
        sanitizeAndSerializeForBackup(op.data)
      ) as Record<string, unknown>;
      if (!COLLECTIONS_ALLOWING_ID_IN_DOCUMENT_BODY.has(op.collection)) {
        delete cloned.id;
      }
      colMap.set(op.docId, cloned);
    }
    this.batchCommitsCount += 1;
  }

  public exportAllCollections(
    activeCollections?: BackupCollectionName[]
  ): Record<BackupCollectionName, BackupDocumentEnvelope[]> {
    const result = {} as Record<BackupCollectionName, BackupDocumentEnvelope[]>;
    const allCols: BackupCollectionName[] =
      activeCollections || [
        ...BACKUP_WORKSPACE_COLLECTIONS,
        'users',
        ...BACKUP_PLATFORM_GOVERNANCE_COLLECTIONS,
      ];
    for (const colName of allCols) {
      const colMap = this.store.get(colName) || new Map();
      result[colName] = Array.from(colMap.entries())
        .map(([docId, docData]) => ({
          docId,
          docData,
        }))
        .sort((a, b) => a.docId.localeCompare(b.docId));
    }
    return result;
  }
}

/**
 * استعادة النسخة الاحتياطية في بيئة الاختبار المعزولة (Isolated Sandbox)
 * مع التحقق من:
 * - إعادة بناء الطوابع الزمنية كـ Firestore Timestamp حقيقي.
 * - عدم حقن حقل 'id' داخل الوثيقة المستعادة.
 * - معالجة المجموعات غير القابلة للتعديل (audit_logs, appointment_postponements) بسياسة:
 *   * إذا كانت الوثيقة غير موجودة: تُنشأ بوضع create_only مع الحفاظ التام على createdAt و actorId/createdBy التاريخيين.
 *   * إذا كانت موجودة ومطابقة 100%: يتم تخطيها بأمان دون تنفيذ update (احترامًا لـ allow update: if false).
 *   * إذا كانت موجودة ومختلفة: تُحظر العملية ويُسجل تعارض صريح لمنع تزوير التاريخ بصمت.
 */
export function restoreBackupToSandbox(
  payload: RasdBackupPayload,
  sandbox: InMemoryFirestoreSandbox = new InMemoryFirestoreSandbox(),
  options: { clearSandboxBeforeRestore?: boolean } = { clearSandboxBeforeRestore: true }
): {
  result: BackupRestoreResult;
  sandbox: InMemoryFirestoreSandbox;
} {
  const preRestoreIntegrity = verifyBackupIntegrity(payload);
  const allCols: BackupCollectionName[] = resolveActiveBackupCollections(undefined, payload.data);
  const isPlatformGovernanceActive = allCols.includes('account_licenses');
  const emptyCounts = {} as Record<BackupCollectionName, number>;
  allCols.forEach((c) => {
    emptyCounts[c] = 0;
  });

  const immutableReport: ImmutableCollectionRestoreReport = {
    immutableCollections: Array.from(IMMUTABLE_APPEND_ONLY_COLLECTIONS),
    createdNewRecordsCount: 0,
    skippedIdenticalRecordsCount: 0,
    blockedConflictRecords: [],
    historicalTimestampRuleNoteAr:
      'قواعد الإنتاج (/firestore.rules) تفرض allow update, delete: if false على audit_logs و appointment_postponements، كما تفرض عند الإنشاء من العميل incoming().createdAt == request.time و actorId/createdBy == request.auth.uid.',
    safeRestorationStrategyAr:
      'لاستعادة السجلات التاريخية بأمان دون تغيير طوابعها الزمنية الأصلية (createdAt) أو منشئيها (actorId / createdBy) ودون كسر قفل التعديل: (1) تُفحص الوثائق الموجودة مسبقًا؛ الوثائق المطابقة 100% يتم تخطيها دون طلب update، والوثائق المتعارضة تُرفض ولا تُستبدل بصمت، (2) تُكتب الوثائق المفقودة فقط كعملية إنشاء (create-only) عبر بيئة استعادة معزولة أو أداة إدارة (Admin SDK / وضع استعادة المالك المعتمد) تحافظ على Timestamp الأصلي.',
  };

  if (!preRestoreIntegrity.isValid) {
    return {
      sandbox,
      result: {
        success: false,
        targetEnvironment: 'isolated_in_memory_sandbox',
        dryRun: true,
        restoredAt: new Date().toISOString(),
        restoredCounts: emptyCounts,
        totalRestoredDocuments: 0,
        reconstructedTimestampsCount: 0,
        batchesExecuted: 0,
        preRestoreIntegrity,
        postRestoreIntegrity: preRestoreIntegrity,
        idPreservationVerified: false,
        envelopeNoIdLeakVerified: false,
        deepEqualityVerified: false,
        immutableHandlingReport: immutableReport,
        errors: [
          `تم رفض الاستعادة لأن ملف النسخة الاحتياطية لم يجتز فحص السلامة الأولي: ${preRestoreIntegrity.summaryAr}`,
        ],
      },
    };
  }

  if (options.clearSandboxBeforeRestore !== false) {
    sandbox.clear();
  }

  const reconstructedTracker = { timestamps: 0 };
  const pendingOps: {
    collection: BackupCollectionName;
    docId: string;
    data: Record<string, unknown>;
    mode: 'create_only' | 'set_replace';
  }[] = [];

  for (const colName of allCols) {
    const isImmutableCol = IMMUTABLE_APPEND_ONLY_COLLECTIONS.has(colName);
    for (const envelope of payload.data[colName] || []) {
      const { docId, restoredData } = prepareDocumentForRestore(
        colName,
        envelope,
        reconstructedTracker
      );

      if (isImmutableCol) {
        const existingDoc = sandbox.getDocument(colName, docId);
        if (existingDoc) {
          if (canonicalizeJson(existingDoc) === canonicalizeJson(restoredData)) {
            immutableReport.skippedIdenticalRecordsCount += 1;
            continue;
          } else {
            immutableReport.blockedConflictRecords.push({
              collection: colName,
              docId,
              reason:
                'تعارض في سجل تاريخي غير قابل للتعديل (Immutable Record Conflict): توجد وثيقة بنفس المعرف ومحتوى مختلف، ويُمنع تعديلها أو الكتابة فوقها.',
            });
            continue;
          }
        }
        immutableReport.createdNewRecordsCount += 1;
        pendingOps.push({
          collection: colName,
          docId,
          data: restoredData,
          mode: 'create_only',
        });
      } else {
        pendingOps.push({
          collection: colName,
          docId,
          data: restoredData,
          mode: 'set_replace',
        });
      }
    }
  }

  if (immutableReport.blockedConflictRecords.length > 0) {
    return {
      sandbox,
      result: {
        success: false,
        targetEnvironment: 'isolated_in_memory_sandbox',
        dryRun: true,
        restoredAt: new Date().toISOString(),
        restoredCounts: emptyCounts,
        totalRestoredDocuments: 0,
        reconstructedTimestampsCount: reconstructedTracker.timestamps,
        batchesExecuted: 0,
        preRestoreIntegrity,
        postRestoreIntegrity: preRestoreIntegrity,
        idPreservationVerified: false,
        envelopeNoIdLeakVerified: true,
        deepEqualityVerified: false,
        immutableHandlingReport: immutableReport,
        errors: immutableReport.blockedConflictRecords.map(
          (c) => `${c.collection}/${c.docId}: ${c.reason}`
        ),
      },
    };
  }

  const BATCH_LIMIT = 400;
  for (let i = 0; i < pendingOps.length; i += BATCH_LIMIT) {
    const chunk = pendingOps.slice(i, i + BATCH_LIMIT);
    sandbox.writeBatchChunk(chunk);
  }

  // التحقق من خلو جميع الوثائق المستعادة في الـ Sandbox من حقل 'id' غير المعتمد، والتحقق من إعادة بناء Timestamp
  let envelopeNoIdLeakVerified = true;
  for (const colName of allCols) {
    if (!COLLECTIONS_ALLOWING_ID_IN_DOCUMENT_BODY.has(colName)) {
      for (const env of payload.data[colName] || []) {
        const storedDoc = sandbox.getDocument(colName, env.docId);
        if (!storedDoc || Object.prototype.hasOwnProperty.call(storedDoc, 'id')) {
          envelopeNoIdLeakVerified = false;
        }
      }
    }
  }

  // إعادة بناء نسخة من البيانات المستعادة داخل البيئة المعزولة للتحقق من سلامتها وتطابقها
  const restoredRaw = sandbox.exportAllCollections(allCols);
  const postRestorePayload = buildBackupPayloadFromRawData({
    rawCollections: restoredRaw,
    createdByUid: payload.createdByUid,
    createdByEmail: payload.createdByEmail,
    scopeMode: payload.scopeMode,
    targetWorkspaceId: payload.targetWorkspaceId,
    projectId: payload.sourceEnvironment.projectId,
    databaseId: payload.sourceEnvironment.databaseId,
    includePlatformGovernance: isPlatformGovernanceActive,
  });

  const postRestoreIntegrity = verifyBackupIntegrity(postRestorePayload);

  let idPreservationVerified = true;
  const restoredCounts = {} as Record<BackupCollectionName, number>;
  let totalRestoredDocuments = 0;

  for (const colName of allCols) {
    const origIds = payload.manifest.documentIdsByCollection[colName] || [];
    const restIds = postRestorePayload.manifest.documentIdsByCollection[colName] || [];
    restoredCounts[colName] = restIds.length;
    totalRestoredDocuments += restIds.length;
    if (
      origIds.length !== restIds.length ||
      origIds.some((id, idx) => id !== restIds[idx])
    ) {
      idPreservationVerified = false;
    }
  }

  const deepEqualityVerified =
    payload.manifest.checksum === postRestorePayload.manifest.checksum &&
    canonicalizeJson(payload.data) === canonicalizeJson(postRestorePayload.data);

  const errors: string[] = [];
  if (!postRestoreIntegrity.isValid) {
    errors.push(`فشل فحص السلامة بعد الاستعادة: ${postRestoreIntegrity.summaryAr}`);
  }
  if (!idPreservationVerified) {
    errors.push('عدم تطابق في معرفات الوثائق (Document IDs) بعد الاستعادة.');
  }
  if (!envelopeNoIdLeakVerified) {
    errors.push('تم اكتشاف تسرب حقل id غير المعتمد إلى جسم الوثيقة المستعادة.');
  }
  if (!deepEqualityVerified) {
    errors.push('عدم تطابق في محتوى السجلات أو الطوابع الزمنية أو البصمة الرقمية بعد الاستعادة.');
  }

  return {
    sandbox,
    result: {
      success:
        postRestoreIntegrity.isValid &&
        idPreservationVerified &&
        envelopeNoIdLeakVerified &&
        deepEqualityVerified,
      targetEnvironment: 'isolated_in_memory_sandbox',
      dryRun: true,
      restoredAt: new Date().toISOString(),
      restoredCounts,
      totalRestoredDocuments,
      reconstructedTimestampsCount: reconstructedTracker.timestamps,
      batchesExecuted: sandbox.batchCommitsCount,
      preRestoreIntegrity,
      postRestoreIntegrity,
      idPreservationVerified,
      envelopeNoIdLeakVerified,
      deepEqualityVerified,
      immutableHandlingReport: immutableReport,
      errors,
    },
  };
}

/**
 * استخراج معرّف المشروع (projectId) الفعلي من داخل كائن Firestore الممرر
 */
export function extractFirestoreInstanceProjectId(firestoreInstance: unknown): string {
  if (!firestoreInstance || typeof firestoreInstance !== 'object') {
    return '';
  }
  const candidate = firestoreInstance as {
    app?: { options?: { projectId?: unknown } };
    _databaseId?: { projectId?: unknown };
  };
  const appProjectId =
    typeof candidate.app?.options?.projectId === 'string'
      ? candidate.app.options.projectId.trim()
      : '';
  if (appProjectId) {
    return appProjectId;
  }
  const internalProjectId =
    typeof candidate._databaseId?.projectId === 'string'
      ? candidate._databaseId.projectId.trim()
      : '';
  return internalProjectId;
}

/**
 * استعادة تجريبية إلى قاعدة Firestore معزولة فقط (مثل Firebase Emulator أو مشروع اختباري منفصل).
 * قيد إلزامي (المرحلة 1A-7): يُمنع منعًا باتًا تنفيذ أي استعادة كتابية على قاعدة بيانات الإنتاج الحية،
 * مع التحقق من:
 * 1. كائن isolatedFirestoreInstance الفعلي ومعرّف المشروع الداخلي فيه (app.options.projectId).
 * 2. رفض نسخة الإنتاج (db) أو معرّف مشروع الإنتاج (rasd-field-system) تحت أي خيارات.
 * 3. رفض الخيارات الناقصة أو المتناقضة (عدم تطابق targetProjectId مع معرّف المشروع داخل isolatedFirestoreInstance).
 */
export async function restoreBackupToIsolatedFirestore(
  payload: RasdBackupPayload,
  options: {
    isolatedFirestoreInstance: Firestore;
    targetProjectId: string;
    isEmulatorOrIsolatedTestProject: boolean;
    dryRun?: boolean;
  }
): Promise<BackupRestoreResult> {
  const forbiddenProdProjects = new Set<string>([
    FIREBASE_PROJECT_ID.trim().toLowerCase(),
    'rasd-field-system',
  ]);

  if (!options || typeof options !== 'object') {
    throw new Error('رفض أمني إلزامي (المرحلة 1): خيارات الاستعادة المعزولة مفقودة أو غير صالحة.');
  }

  const passedTargetProjectId =
    typeof options.targetProjectId === 'string' ? options.targetProjectId.trim() : '';
  const actualInstanceProjectId = extractFirestoreInstanceProjectId(
    options.isolatedFirestoreInstance
  );

  // 1. رفض نسخة أو مشروع الإنتاج تحت أي خيارات كانت
  if (
    options.isolatedFirestoreInstance === db ||
    forbiddenProdProjects.has(passedTargetProjectId.toLowerCase()) ||
    forbiddenProdProjects.has(actualInstanceProjectId.toLowerCase())
  ) {
    throw new Error(
      `رفض أمني إلزامي (المرحلة 1): يُمنع تنفيذ أي استعادة كتابية مباشرة على قاعدة بيانات الإنتاج (${FIREBASE_PROJECT_ID}). تم اكتشاف ارتباط بمشروع الإنتاج (targetProjectId="${passedTargetProjectId || 'فارغ'}"، instanceProjectId="${actualInstanceProjectId || 'فارغ'}").`
    );
  }

  // 2. رفض الخيارات الناقصة أو غير المكتملة
  if (
    options.isEmulatorOrIsolatedTestProject !== true ||
    !options.isolatedFirestoreInstance ||
    typeof options.isolatedFirestoreInstance !== 'object' ||
    !passedTargetProjectId ||
    !actualInstanceProjectId
  ) {
    throw new Error(
      `رفض أمني إلزامي (المرحلة 1): خيارات الاستعادة المعزولة ناقصة أو غير مكتملة (isEmulatorOrIsolatedTestProject=${String(options.isEmulatorOrIsolatedTestProject)}، targetProjectId="${passedTargetProjectId || 'مفقود'}"، instanceProjectId="${actualInstanceProjectId || 'مفقود'}").`
    );
  }

  // 3. رفض الخيارات المتناقضة بين targetProjectId ومعرّف المشروع الفعلي داخل isolatedFirestoreInstance
  if (passedTargetProjectId !== actualInstanceProjectId) {
    throw new Error(
      `رفض أمني إلزامي (المرحلة 1): تناقض في إعدادات الاستعادة المعزولة؛ المعرّف الممرر targetProjectId ("${passedTargetProjectId}") لا يطابق معرّف المشروع الفعلي داخل isolatedFirestoreInstance ("${actualInstanceProjectId}").`
    );
  }

  const { result: sandboxResult } = restoreBackupToSandbox(payload);
  if (!sandboxResult.success) {
    return sandboxResult;
  }

  if (options.dryRun === true) {
    return {
      ...sandboxResult,
      targetEnvironment: 'isolated_test_firestore',
      dryRun: true,
      restoredAt: new Date().toISOString(),
    };
  }

  const targetDb = options.isolatedFirestoreInstance;
  const allCols: BackupCollectionName[] = resolveActiveBackupCollections(undefined, payload.data);
  const reconstructedTracker = { timestamps: 0 };
  const immutableReport: ImmutableCollectionRestoreReport = {
    ...sandboxResult.immutableHandlingReport,
    createdNewRecordsCount: 0,
    skippedIdenticalRecordsCount: 0,
    blockedConflictRecords: [],
  };

  const pendingOps: {
    collection: BackupCollectionName;
    docId: string;
    data: Record<string, unknown>;
  }[] = [];

  for (const colName of allCols) {
    const isImmutable = IMMUTABLE_APPEND_ONLY_COLLECTIONS.has(colName);
    for (const envelope of payload.data[colName] || []) {
      const { docId, restoredData } = prepareDocumentForRestore(
        colName,
        envelope,
        reconstructedTracker
      );

      if (isImmutable) {
        const existingSnap = await getDoc(doc(targetDb, colName, docId));
        if (existingSnap.exists()) {
          const existingData = existingSnap.data() as Record<string, unknown>;
          if (canonicalizeJson(existingData) === canonicalizeJson(restoredData)) {
            immutableReport.skippedIdenticalRecordsCount += 1;
            continue;
          } else {
            immutableReport.blockedConflictRecords.push({
              collection: colName,
              docId,
              reason:
                'تعارض في سجل تاريخي غير قابل للتعديل داخل البيئة التجريبية: الوثيقة موجودة بمحتوى مختلف ولن يتم استبدالها.',
            });
            continue;
          }
        }
        immutableReport.createdNewRecordsCount += 1;
      }

      pendingOps.push({
        collection: colName,
        docId,
        data: restoredData,
      });
    }
  }

  if (immutableReport.blockedConflictRecords.length > 0) {
    return {
      ...sandboxResult,
      success: false,
      targetEnvironment: 'isolated_test_firestore',
      dryRun: false,
      immutableHandlingReport: immutableReport,
      errors: immutableReport.blockedConflictRecords.map(
        (c) => `${c.collection}/${c.docId}: ${c.reason}`
      ),
    };
  }

  const BATCH_LIMIT = 400;
  let batchesExecuted = 0;

  for (let i = 0; i < pendingOps.length; i += BATCH_LIMIT) {
    const chunk = pendingOps.slice(i, i + BATCH_LIMIT);
    const batch = writeBatch(targetDb);
    for (const op of chunk) {
      const ref = doc(targetDb, op.collection, op.docId);
      // نكتب الوثيقة دون حقن id ودون merge على السجلات الجديدة لضمان مطابقة المخطط
      batch.set(ref, op.data);
    }
    await batch.commit();
    batchesExecuted += 1;
  }

  return {
    ...sandboxResult,
    targetEnvironment: 'isolated_test_firestore',
    dryRun: false,
    reconstructedTimestampsCount: reconstructedTracker.timestamps,
    batchesExecuted,
    immutableHandlingReport: immutableReport,
    restoredAt: new Date().toISOString(),
  };
}

/**
 * تنزيل ملف النسخة الاحتياطية بصيغة JSON إلى جهاز المستخدم
 */
export function downloadBackupJsonFile(payload: RasdBackupPayload): string {
  const datePart = payload.createdAt.slice(0, 10);
  const scopePart =
    payload.scopeMode === 'all_accessible_workspaces'
      ? 'full-platform-operational'
      : `workspace-${payload.targetWorkspaceId || 'active'}`;
  const filename = `rasd-backup-${scopePart}-${datePart}.json`;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const jsonString = JSON.stringify(payload, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return filename;
}
