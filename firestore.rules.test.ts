/**
 * مجموعة اختبارات قواعد الأمان (Firestore Security Rules Test Suite — RASD)
 * تغطي:
 * 1. حمولات الاختبار الاثنتي عشرة (Dirty Dozen Payloads)
 * 2. اختبارات غير العضو، والمساعد، والمالك، ومحاولات العبور بين مساحات العمل
 */

export interface SecurityTestCase {
  id: string;
  title: string;
  actor: 'unauthenticated' | 'unverified_user' | 'outsider' | 'assistant' | 'owner';
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  payload?: Record<string, unknown>;
  expectedResult: 'PERMISSION_DENIED' | 'ALLOWED';
}

export const DIRTY_DOZEN_AND_RBAC_TESTS: SecurityTestCase[] = [
  {
    id: 'DD-01',
    title: 'انتحال الهوية عند إنشاء ملف مستخدم آخر',
    actor: 'assistant',
    operation: 'create',
    path: '/users/victim_uid_999',
    payload: {
      uid: 'victim_uid_999',
      displayName: 'Spoofed User',
      email: 'spoof@example.com',
      phone: '',
      jobTitle: 'Assistant',
      activeWorkspaceId: 'ws_1',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-02',
    title: 'انتحال بريد المشرف دون تأكيد البريد الإلكتروني (email_verified: false)',
    actor: 'unverified_user',
    operation: 'create',
    path: '/workspaces/ws_unverified',
    payload: {
      name: 'مساحة غير موثقة',
      ownerId: 'uid_unverified',
      ownerName: 'Spoofer',
      defaultCurrency: 'SAR',
      taxRatePercent: 0,
      regionName: 'الرياض',
      inviteCode: 'INV1234',
      memberUids: ['uid_unverified'],
      memberCount: 1,
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-03',
    title: 'محاولة قراءة أو كتابة عقار في مساحة عمل أخرى (Cross-Workspace)',
    actor: 'outsider',
    operation: 'get',
    path: '/properties/prop_ws_alpha_1',
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-04',
    title: 'محاولة المساعد ترقية صلاحياته لنفسه إلى مالك (Self-Privilege Escalation)',
    actor: 'assistant',
    operation: 'update',
    path: '/workspace_members/ws_1_assistant_uid',
    payload: {
      role: 'owner',
      canApproveFinancials: true,
      canDeleteRecords: true,
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-05',
    title: 'تجاوز الحد الأقصى لأعضاء الفريق (أكثر من 10 أعضاء)',
    actor: 'owner',
    operation: 'update',
    path: '/workspaces/ws_1',
    payload: {
      memberUids: ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8', 'u9', 'u10', 'u11'],
      memberCount: 11,
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-06',
    title: 'حقن حقل خفي غير معرف في المخطط (Shadow Field Injection)',
    actor: 'owner',
    operation: 'create',
    path: '/taxpayers/tp_shadow_1',
    payload: {
      workspaceId: 'ws_1',
      ownerId: 'owner_uid',
      fullName: 'مكلف تجريبي',
      internalCode: 'TP-100',
      isSystemVerified: true,
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-07',
    title: 'إنشاء عقار يتيم مرتبط بمكلف غير موجود (Orphaned Write)',
    actor: 'owner',
    operation: 'create',
    path: '/properties/prop_orphan_1',
    payload: {
      workspaceId: 'ws_1',
      ownerId: 'owner_uid',
      taxpayerId: 'non_existent_taxpayer',
      taxpayerName: 'غير موجود',
      title: 'عقار يتيم',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-08',
    title: 'تعديل تقييم مالي معتمد من قبل مساعد (Terminal State Lock)',
    actor: 'assistant',
    operation: 'update',
    path: '/financial_assessments/assess_approved_1',
    payload: {
      amount: 500,
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-09',
    title: 'محاولة حذف أو تعديل سجل التدقيق (Immutable Audit Log)',
    actor: 'owner',
    operation: 'delete',
    path: '/audit_logs/log_101',
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-10',
    title: 'تسميم الموارد عبر سلسلة نصية ضخمة تتجاوز الحدود',
    actor: 'assistant',
    operation: 'create',
    path: '/field_visits/visit_huge_1',
    payload: {
      notes: 'A'.repeat(5000),
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-11',
    title: 'تزوير الطابع الزمني للإنشاء من جانب العميل',
    actor: 'owner',
    operation: 'create',
    path: '/appointments/appt_forged_time',
    payload: {
      createdAt: '2020-01-01T00:00:00Z',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-12',
    title: 'استعلام قائمة عشوائي دون تقييد العضوية (Blanket List Query)',
    actor: 'outsider',
    operation: 'list',
    path: '/properties',
    expectedResult: 'PERMISSION_DENIED',
  },
];
