import * as fs from 'fs';
import * as path from 'path';
import { Timestamp } from 'firebase/firestore';
import {
  isPermanentPlatformOwnerEmail,
  verifyPlatformOwnerIdentity,
  authorizePlatformOperation,
  buildClientSubscriptionMutation,
  validateAndBuildPlatformStaffRecord,
  evaluateAccountAccessGate,
  validateTeamMemberAdditionLimit,
  DEFAULT_SUBSCRIPTION_PACKAGES,
} from '../src/services/licenseService';
import {
  BACKUP_WORKSPACE_COLLECTIONS,
  BACKUP_PLATFORM_GOVERNANCE_COLLECTIONS,
  buildBackupPayloadFromRawData,
  verifyBackupIntegrity,
  restoreBackupToSandbox,
  InMemoryFirestoreSandbox,
} from '../src/services/backupService';
import type {
  AccountLicense,
  PlatformStaff,
  SubscriptionPackage,
} from '../src/types/rasd';

interface TestAssertion {
  id: string;
  title: string;
  passed: boolean;
  details: string;
}

const assertions: TestAssertion[] = [];

function assertCondition(id: string, title: string, condition: boolean, details: string) {
  assertions.push({ id, title, passed: Boolean(condition), details });
  const badge = condition ? '✅ PASS' : '❌ FAIL';
  console.log(`${badge} [${id}] ${title} — ${details}`);
}

/**
 * محرك محاكاة منطق قواعد DRAFT_firestore.rules للتحقق البرمجي الدقيق من الحالات المسموحة والمرفوضة
 * يطابق الدوال والشروط الفعلية المكتوبة في /DRAFT_firestore.rules
 */
interface SimulatedAuthContext {
  uid: string;
  email: string;
  emailVerified: boolean;
}

interface SimulatedRulesState {
  nowMs: number;
  users: Map<string, Record<string, any>>;
  workspaces: Map<string, Record<string, any>>;
  workspace_members: Map<string, Record<string, any>>;
  account_licenses: Map<string, Record<string, any>>;
  subscription_packages: Map<string, Record<string, any>>;
  platform_staff: Map<string, Record<string, any>>;
  audit_logs: Map<string, Record<string, any>>;
}

class SimulatedDraftRulesEvaluator {
  constructor(private state: SimulatedRulesState) {}

  public isSignedIn(auth: SimulatedAuthContext | null): boolean {
    return auth != null && Boolean(auth.uid);
  }

  public isPermanentOwnerEmail(email: unknown): boolean {
    return (
      typeof email === 'string' &&
      (email === 'am1075022@gmail.com' ||
        email === 'ahah26@gmail.com' ||
        email === 'ahah26h@gmail.com')
    );
  }

  public isAdmin(auth: SimulatedAuthContext | null): boolean {
    return (
      this.isSignedIn(auth) &&
      auth!.emailVerified === true &&
      this.isPermanentOwnerEmail(auth!.email)
    );
  }

  public isActivePlatformStaff(auth: SimulatedAuthContext | null): boolean {
    if (!this.isSignedIn(auth) || auth!.emailVerified !== true) return false;
    const doc = this.state.platform_staff.get(auth!.uid);
    return Boolean(doc && doc.status === 'active');
  }

  public hasStaffPermission(
    auth: SimulatedAuthContext | null,
    permKey: 'canViewRequests' | 'canApproveAndRenew' | 'canManagePackages'
  ): boolean {
    if (!this.isActivePlatformStaff(auth)) return false;
    const doc = this.state.platform_staff.get(auth!.uid)!;
    return Boolean(doc.permissions && doc.permissions[permKey] === true);
  }

  public isLegacyGrandfatheredWorkspaceActive(wsId: string): boolean {
    if (!wsId || this.state.account_licenses.has(wsId)) return false;
    const ws = this.state.workspaces.get(wsId);
    if (!ws || typeof ws.ownerId !== 'string') return false;
    const ownerMember = this.state.workspace_members.get(`${wsId}_${ws.ownerId}`);
    if (!ownerMember || ownerMember.role !== 'owner' || ownerMember.status !== 'active') {
      return false;
    }
    const ownerUser = this.state.users.get(ws.ownerId);
    if (!ownerUser) return true;
    return (
      ownerUser.jobTitle !== 'طلب تسجيل جديد - بانتظار الموافقة' &&
      ownerUser.jobTitle !== 'طلب تسجيل مرفوض'
    );
  }

  public isWorkspaceLicenseActive(auth: SimulatedAuthContext | null, wsId: string): boolean {
    if (this.isAdmin(auth)) return true;
    const ws = this.state.workspaces.get(wsId);
    if (!ws) return false;
    const lic = this.state.account_licenses.get(wsId);
    if (lic) {
      if (lic.status !== 'active') return false;
      if (lic.expiresAt === null) return true;
      const expMs =
        lic.expiresAt instanceof Timestamp
          ? lic.expiresAt.toMillis()
          : typeof lic.expiresAt === 'number'
            ? lic.expiresAt
            : 0;
      return expMs > this.state.nowMs;
    }
    return this.isLegacyGrandfatheredWorkspaceActive(wsId);
  }

  public getWorkspaceMaxMembers(wsId: string): number {
    const lic = this.state.account_licenses.get(wsId);
    if (
      lic &&
      Number.isInteger(lic.maxMembers) &&
      lic.maxMembers >= 1 &&
      lic.maxMembers <= 10
    ) {
      return lic.maxMembers;
    }
    return 10;
  }

  public canReadOperationalRecord(auth: SimulatedAuthContext | null, wsId: string): boolean {
    if (!this.isSignedIn(auth)) return false;
    if (this.isAdmin(auth)) return true;
    const ws = this.state.workspaces.get(wsId);
    if (!ws) return false;
    const isOwnerOrMember =
      ws.ownerId === auth!.uid ||
      (Array.isArray(ws.memberUids) && ws.memberUids.includes(auth!.uid));
    return isOwnerOrMember && this.isWorkspaceLicenseActive(auth, wsId);
  }

  public canWriteOperationalRecord(auth: SimulatedAuthContext | null, wsId: string): boolean {
    return this.canReadOperationalRecord(auth, wsId);
  }

  public canUpdateAccountLicense(
    auth: SimulatedAuthContext | null,
    wsId: string,
    incoming: Record<string, any>
  ): boolean {
    const existing = this.state.account_licenses.get(wsId);
    if (!existing) return false;
    if (
      incoming.workspaceId !== existing.workspaceId ||
      incoming.ownerId !== existing.ownerId ||
      incoming.createdAt !== existing.createdAt
    ) {
      return false;
    }
    if (!Number.isInteger(incoming.maxMembers) || incoming.maxMembers < 1 || incoming.maxMembers > 10) {
      return false;
    }
    if (this.isAdmin(auth)) return true;
    if (this.hasStaffPermission(auth, 'canApproveAndRenew')) {
      return (
        existing.status !== 'pending' &&
        incoming.status !== 'pending' &&
        incoming.status !== 'rejected' &&
        !this.isPermanentOwnerEmail(existing.ownerEmail) &&
        !this.isPermanentOwnerEmail(incoming.ownerEmail) &&
        (this.hasStaffPermission(auth, 'canManagePackages') ||
          (incoming.planId === existing.planId && incoming.maxMembers === existing.maxMembers))
      );
    }
    return false;
  }

  public canUpdateWorkspaceMember(
    auth: SimulatedAuthContext | null,
    memberDocId: string,
    incoming: Record<string, any>
  ): boolean {
    const existing = this.state.workspace_members.get(memberDocId);
    if (!existing) return false;
    if (this.isAdmin(auth)) return true;
    const ws = this.state.workspaces.get(existing.workspaceId);
    const isWsOwner = Boolean(ws && ws.ownerId === auth?.uid);

    // مسار 1: مالك مساحة العمل يعدل بيانات عضو آخر بشرط فعالية الترخيص وعدم تجاوز الحد وعدم تفعيل نفسه
    if (
      isWsOwner &&
      this.isWorkspaceLicenseActive(auth, existing.workspaceId) &&
      (existing.userId !== existing.ownerId || incoming.status === existing.status)
    ) {
      return true;
    }

    // مسار 2: عضو مدعو يفعل عضويته بنفسه (لا يشمل المالك)
    if (
      this.isWorkspaceLicenseActive(auth, existing.workspaceId) &&
      existing.role !== 'owner' &&
      existing.status === 'invited' &&
      incoming.userId === auth?.uid &&
      incoming.status === 'active'
    ) {
      return true;
    }

    // مسار 3: مساعد المنصة المخول يزامن حالة المالك (active <-> suspended) لغير طلبات التسجيل المعلقة
    if (
      this.hasStaffPermission(auth, 'canApproveAndRenew') &&
      existing.role === 'owner' &&
      existing.userId === existing.ownerId &&
      existing.status !== 'invited' &&
      !this.isPermanentOwnerEmail(existing.email) &&
      (incoming.status === 'active' || incoming.status === 'suspended')
    ) {
      return true;
    }

    return false;
  }

  public canUpdateUser(
    auth: SimulatedAuthContext | null,
    userId: string,
    incoming: Record<string, any>
  ): boolean {
    const existing = this.state.users.get(userId);
    if (!existing) return false;
    if (this.isAdmin(auth)) return true;
    if (auth?.uid !== userId) return false;
    if (!this.isPermanentOwnerEmail(existing.email) && this.isPermanentOwnerEmail(incoming.email)) {
      return false;
    }
    const isLockedPendingOrRejected =
      existing.jobTitle === 'طلب تسجيل جديد - بانتظار الموافقة' ||
      existing.jobTitle === 'طلب تسجيل مرفوض';
    if (isLockedPendingOrRejected && incoming.jobTitle !== existing.jobTitle) {
      if (!this.isWorkspaceLicenseActive(auth, existing.activeWorkspaceId)) {
        return false;
      }
    }
    return true;
  }

  public canAddMemberToWorkspace(
    auth: SimulatedAuthContext | null,
    wsId: string,
    newMemberUids: string[]
  ): boolean {
    const ws = this.state.workspaces.get(wsId);
    if (!ws) return false;
    if (this.isAdmin(auth)) return newMemberUids.length <= 10;
    if (ws.ownerId !== auth?.uid) return false;
    if (!this.isWorkspaceLicenseActive(auth, wsId)) return false;
    const maxMembers = this.getWorkspaceMaxMembers(wsId);
    return newMemberUids.length >= 1 && newMemberUids.length <= maxMembers;
  }
}

async function runStage2DAuditTests() {
  console.log('==================================================================');
  console.log('🚀 بدء اختبارات المرحلة 2-D: فحص الأمان والنسخ الاحتياطي والاختبارات قبل النشر');
  console.log('==================================================================\n');

  // ---------------------------------------------------------------------------
  // 1. التحقق من ترقية ومواءمة ملف قواعد الإنتاج /firestore.rules مع DRAFT_firestore.rules
  // ---------------------------------------------------------------------------
  const prodRulesPath = path.resolve(process.cwd(), 'firestore.rules');
  const draftRulesPath = path.resolve(process.cwd(), 'DRAFT_firestore.rules');
  const prodRulesContent = fs.readFileSync(prodRulesPath, 'utf8');
  const draftRulesContent = fs.readFileSync(draftRulesPath, 'utf8');
  const prodLines = prodRulesContent.split('\n').length;

  assertCondition(
    'S2D-01',
    'ترقية وتطابق ملف قواعد الإنتاج /firestore.rules مع القواعد الكاملة المعتمدة',
    prodRulesContent === draftRulesContent &&
      prodRulesContent.includes('match /account_licenses/{workspaceId}') &&
      prodRulesContent.includes('match /platform_staff/{staffUid}') &&
      prodRulesContent.includes('match /subscription_packages/{packageId}'),
    `عدد أسطر /firestore.rules = ${prodLines} سطرًا (متطابق 100% مع القواعد المعتمدة الكاملة)`
  );

  assertCondition(
    'S2D-02',
    'احتواء /firestore.rules على إصلاحات الفجوات الأمنية الخمس',
    prodRulesContent.includes('function isLegacyGrandfatheredWorkspaceActive(wsId)') &&
      prodRulesContent.includes('function getWorkspaceMaxMembers(wsId)') &&
      prodRulesContent.includes('incoming().memberUids.size() <= getWorkspaceMaxMembers(workspaceId)') &&
      prodRulesContent.includes('!isPermanentOwnerEmail(data.email)') &&
      prodRulesContent.includes("!(existing().jobTitle in ['طلب تسجيل جديد - بانتظار الموافقة', 'طلب تسجيل مرفوض'])"),
    'تم التحقق من وجود دوال حماية الحسابات القديمة وحدود أعضاء الفريق ومنع الترقية الذاتية في /firestore.rules'
  );

  // ---------------------------------------------------------------------------
  // 2. تجهيز حالة المحاكاة الشاملة (المالكون الدائمون، المساعدون، والعملاء بكافة حالاتهم)
  // ---------------------------------------------------------------------------
  const nowDate = new Date('2026-06-15T10:00:00.000Z');
  const nowTs = Timestamp.fromDate(nowDate);
  const futureTs = Timestamp.fromDate(new Date('2026-09-15T10:00:00.000Z'));
  const pastTs = Timestamp.fromDate(new Date('2026-05-01T10:00:00.000Z'));

  const owner1Auth: SimulatedAuthContext = {
    uid: 'owner_perm_1',
    email: 'am1075022@gmail.com',
    emailVerified: true,
  };
  const owner2Auth: SimulatedAuthContext = {
    uid: 'owner_perm_2',
    email: 'ahah26@gmail.com',
    emailVerified: true,
  };
  const owner2AliasAuth: SimulatedAuthContext = {
    uid: 'owner_perm_2b',
    email: 'ahah26h@gmail.com',
    emailVerified: true,
  };

  const staffViewOnlyAuth: SimulatedAuthContext = {
    uid: 'staff_view_1',
    email: 'viewer.staff@rasd.test',
    emailVerified: true,
  };
  const staffRenewOnlyAuth: SimulatedAuthContext = {
    uid: 'staff_renew_1',
    email: 'renew.staff@rasd.test',
    emailVerified: true,
  };
  const staffFullDelegatedAuth: SimulatedAuthContext = {
    uid: 'staff_full_1',
    email: 'manager.staff@rasd.test',
    emailVerified: true,
  };
  const staffSuspendedAuth: SimulatedAuthContext = {
    uid: 'staff_susp_1',
    email: 'suspended.staff@rasd.test',
    emailVerified: true,
  };

  const pendingClientAuth: SimulatedAuthContext = {
    uid: 'client_pending_1',
    email: 'pending.client@office.test',
    emailVerified: true,
  };
  const legacyClientAuth: SimulatedAuthContext = {
    uid: 'client_legacy_1',
    email: 'legacy.client@office.test',
    emailVerified: true,
  };
  const activeClientAuth: SimulatedAuthContext = {
    uid: 'client_active_1',
    email: 'active.client@office.test',
    emailVerified: true,
  };
  const suspendedClientAuth: SimulatedAuthContext = {
    uid: 'client_suspended_1',
    email: 'suspended.client@office.test',
    emailVerified: true,
  };
  const expiredClientAuth: SimulatedAuthContext = {
    uid: 'client_expired_1',
    email: 'expired.client@office.test',
    emailVerified: true,
  };

  const state: SimulatedRulesState = {
    nowMs: nowDate.getTime(),
    users: new Map([
      [
        pendingClientAuth.uid,
        {
          uid: pendingClientAuth.uid,
          displayName: 'عميل جديد بانتظار الموافقة',
          email: pendingClientAuth.email,
          phone: '0501112233',
          jobTitle: 'طلب تسجيل جديد - بانتظار الموافقة',
          activeWorkspaceId: 'ws_pending_1',
          createdAt: nowTs,
          updatedAt: nowTs,
        },
      ],
      [
        legacyClientAuth.uid,
        {
          uid: legacyClientAuth.uid,
          displayName: 'عميل حالي قديم',
          email: legacyClientAuth.email,
          phone: '0502223344',
          jobTitle: 'مالك المكتب',
          activeWorkspaceId: 'ws_legacy_1',
          createdAt: nowTs,
          updatedAt: nowTs,
        },
      ],
      [
        activeClientAuth.uid,
        {
          uid: activeClientAuth.uid,
          displayName: 'عميل مشترك نشط',
          email: activeClientAuth.email,
          phone: '0503334455',
          jobTitle: 'مدير مكتب عقاري',
          activeWorkspaceId: 'ws_active_1',
          createdAt: nowTs,
          updatedAt: nowTs,
        },
      ],
    ]),
    workspaces: new Map([
      [
        'ws_pending_1',
        {
          name: 'مكتب العميل المعلق',
          ownerId: pendingClientAuth.uid,
          ownerName: 'عميل جديد بانتظار الموافقة',
          defaultCurrency: 'SAR',
          taxRatePercent: 15,
          regionName: 'الرياض',
          inviteCode: 'PEND01',
          memberUids: [pendingClientAuth.uid],
          memberCount: 1,
          createdAt: nowTs,
          updatedAt: nowTs,
        },
      ],
      [
        'ws_legacy_1',
        {
          name: 'مكتب العميل القديم (بدون وثيقة ترخيص)',
          ownerId: legacyClientAuth.uid,
          ownerName: 'عميل حالي قديم',
          defaultCurrency: 'SAR',
          taxRatePercent: 15,
          regionName: 'جدة',
          inviteCode: 'LEGC01',
          memberUids: [legacyClientAuth.uid],
          memberCount: 1,
          createdAt: nowTs,
          updatedAt: nowTs,
        },
      ],
      [
        'ws_active_1',
        {
          name: 'مكتب العميل النشط (بحد 3 أعضاء)',
          ownerId: activeClientAuth.uid,
          ownerName: 'عميل مشترك نشط',
          defaultCurrency: 'SAR',
          taxRatePercent: 15,
          regionName: 'الدمام',
          inviteCode: 'ACTV01',
          memberUids: [activeClientAuth.uid, 'member_2', 'member_3'],
          memberCount: 3,
          createdAt: nowTs,
          updatedAt: nowTs,
        },
      ],
      [
        'ws_suspended_1',
        {
          name: 'مكتب العميل المعلق إداريًا',
          ownerId: suspendedClientAuth.uid,
          ownerName: 'عميل موقوف مؤقتًا',
          defaultCurrency: 'SAR',
          taxRatePercent: 15,
          regionName: 'مكة',
          inviteCode: 'SUSP01',
          memberUids: [suspendedClientAuth.uid],
          memberCount: 1,
          createdAt: nowTs,
          updatedAt: nowTs,
        },
      ],
      [
        'ws_expired_1',
        {
          name: 'مكتب العميل المنتهي اشتراكه',
          ownerId: expiredClientAuth.uid,
          ownerName: 'عميل منتهي الاشتراك',
          defaultCurrency: 'SAR',
          taxRatePercent: 15,
          regionName: 'المدينة',
          inviteCode: 'EXPR01',
          memberUids: [expiredClientAuth.uid],
          memberCount: 1,
          createdAt: nowTs,
          updatedAt: nowTs,
        },
      ],
    ]),
    workspace_members: new Map([
      [
        `ws_pending_1_${pendingClientAuth.uid}`,
        {
          workspaceId: 'ws_pending_1',
          ownerId: pendingClientAuth.uid,
          userId: pendingClientAuth.uid,
          displayName: 'عميل جديد بانتظار الموافقة',
          email: pendingClientAuth.email,
          phone: '0501112233',
          role: 'owner',
          status: 'invited',
          canApproveFinancials: true,
          canDeleteRecords: true,
          createdAt: nowTs,
          updatedAt: nowTs,
          createdBy: pendingClientAuth.uid,
        },
      ],
      [
        `ws_legacy_1_${legacyClientAuth.uid}`,
        {
          workspaceId: 'ws_legacy_1',
          ownerId: legacyClientAuth.uid,
          userId: legacyClientAuth.uid,
          displayName: 'عميل حالي قديم',
          email: legacyClientAuth.email,
          phone: '0502223344',
          role: 'owner',
          status: 'active',
          canApproveFinancials: true,
          canDeleteRecords: true,
          createdAt: nowTs,
          updatedAt: nowTs,
          createdBy: legacyClientAuth.uid,
        },
      ],
      [
        `ws_active_1_${activeClientAuth.uid}`,
        {
          workspaceId: 'ws_active_1',
          ownerId: activeClientAuth.uid,
          userId: activeClientAuth.uid,
          displayName: 'عميل مشترك نشط',
          email: activeClientAuth.email,
          phone: '0503334455',
          role: 'owner',
          status: 'active',
          canApproveFinancials: true,
          canDeleteRecords: true,
          createdAt: nowTs,
          updatedAt: nowTs,
          createdBy: activeClientAuth.uid,
        },
      ],
    ]),
    account_licenses: new Map([
      [
        'ws_pending_1',
        {
          workspaceId: 'ws_pending_1',
          ownerId: pendingClientAuth.uid,
          ownerEmail: pendingClientAuth.email,
          status: 'pending',
          planId: 'monthly',
          startsAt: nowTs,
          expiresAt: futureTs,
          maxMembers: 5,
          createdAt: nowTs,
          updatedAt: nowTs,
        },
      ],
      [
        'ws_active_1',
        {
          workspaceId: 'ws_active_1',
          ownerId: activeClientAuth.uid,
          ownerEmail: activeClientAuth.email,
          status: 'active',
          planId: 'quarterly',
          startsAt: nowTs,
          expiresAt: futureTs,
          maxMembers: 3,
          createdAt: nowTs,
          updatedAt: nowTs,
        },
      ],
      [
        'ws_suspended_1',
        {
          workspaceId: 'ws_suspended_1',
          ownerId: suspendedClientAuth.uid,
          ownerEmail: suspendedClientAuth.email,
          status: 'suspended',
          planId: 'monthly',
          startsAt: nowTs,
          expiresAt: futureTs,
          maxMembers: 5,
          createdAt: nowTs,
          updatedAt: nowTs,
        },
      ],
      [
        'ws_expired_1',
        {
          workspaceId: 'ws_expired_1',
          ownerId: expiredClientAuth.uid,
          ownerEmail: expiredClientAuth.email,
          status: 'active',
          planId: 'monthly',
          startsAt: pastTs,
          expiresAt: pastTs,
          maxMembers: 5,
          createdAt: nowTs,
          updatedAt: nowTs,
        },
      ],
    ]),
    subscription_packages: new Map(),
    platform_staff: new Map([
      [
        staffViewOnlyAuth.uid,
        {
          uid: staffViewOnlyAuth.uid,
          email: staffViewOnlyAuth.email,
          displayName: 'مساعد عرض فقط',
          status: 'active',
          permissions: {
            canViewRequests: true,
            canApproveAndRenew: false,
            canManagePackages: false,
          },
          assignedByUid: owner1Auth.uid,
          createdAt: nowTs,
          updatedAt: nowTs,
        },
      ],
      [
        staffRenewOnlyAuth.uid,
        {
          uid: staffRenewOnlyAuth.uid,
          email: staffRenewOnlyAuth.email,
          displayName: 'مساعد تجديد وتعليق فقط',
          status: 'active',
          permissions: {
            canViewRequests: true,
            canApproveAndRenew: true,
            canManagePackages: false,
          },
          assignedByUid: owner1Auth.uid,
          createdAt: nowTs,
          updatedAt: nowTs,
        },
      ],
      [
        staffFullDelegatedAuth.uid,
        {
          uid: staffFullDelegatedAuth.uid,
          email: staffFullDelegatedAuth.email,
          displayName: 'مساعد تجديد وباقات',
          status: 'active',
          permissions: {
            canViewRequests: true,
            canApproveAndRenew: true,
            canManagePackages: true,
          },
          assignedByUid: owner1Auth.uid,
          createdAt: nowTs,
          updatedAt: nowTs,
        },
      ],
      [
        staffSuspendedAuth.uid,
        {
          uid: staffSuspendedAuth.uid,
          email: staffSuspendedAuth.email,
          displayName: 'مساعد موقوف',
          status: 'suspended',
          permissions: {
            canViewRequests: true,
            canApproveAndRenew: true,
            canManagePackages: true,
          },
          assignedByUid: owner1Auth.uid,
          createdAt: nowTs,
          updatedAt: nowTs,
        },
      ],
    ]),
    audit_logs: new Map(),
  };

  const evaluator = new SimulatedDraftRulesEvaluator(state);

  // ---------------------------------------------------------------------------
  // 3. فحص صلاحيات المالكين الدائمين (Permanent Owners)
  // ---------------------------------------------------------------------------
  assertCondition(
    'S2D-03',
    'اعتماد الحسابين الدائمين (am1075022@gmail.com و ahah26@gmail.com / ahah26h@gmail.com) كمالكين دائمين مدى الحياة ومجانًا',
    evaluator.isAdmin(owner1Auth) &&
      evaluator.isAdmin(owner2Auth) &&
      evaluator.isAdmin(owner2AliasAuth) &&
      isPermanentPlatformOwnerEmail('am1075022@gmail.com') &&
      isPermanentPlatformOwnerEmail('ahah26@gmail.com') &&
      isPermanentPlatformOwnerEmail('ahah26h@gmail.com') &&
      verifyPlatformOwnerIdentity(owner1Auth).isVerifiedOwner &&
      verifyPlatformOwnerIdentity(owner2Auth).isVerifiedOwner &&
      verifyPlatformOwnerIdentity(owner2AliasAuth).isVerifiedOwner,
    'كلا الحسابين معتمدان في قواعد Firestore وفي خدمة التراخيص بصلاحيات كاملة ومجانية مدى الحياة'
  );

  // ---------------------------------------------------------------------------
  // 4. فحص منع الترقية الذاتية (Self-Approval Attack) للعميل المعلق
  // ---------------------------------------------------------------------------
  const pendingLicense = state.account_licenses.get('ws_pending_1')!;
  const selfApproveLicenseAttempt = evaluator.canUpdateAccountLicense(
    pendingClientAuth,
    'ws_pending_1',
    {
      ...pendingLicense,
      status: 'active',
      startsAt: nowTs,
      expiresAt: futureTs,
    }
  );
  const selfActivateMemberAttempt = evaluator.canUpdateWorkspaceMember(
    pendingClientAuth,
    `ws_pending_1_${pendingClientAuth.uid}`,
    {
      ...state.workspace_members.get(`ws_pending_1_${pendingClientAuth.uid}`)!,
      status: 'active',
    }
  );
  const selfChangeJobTitleAttempt = evaluator.canUpdateUser(
    pendingClientAuth,
    pendingClientAuth.uid,
    {
      ...state.users.get(pendingClientAuth.uid)!,
      jobTitle: 'مدير مكتب معتمد',
    }
  );
  const pendingReadOperationalAttempt = evaluator.canReadOperationalRecord(
    pendingClientAuth,
    'ws_pending_1'
  );

  assertCondition(
    'S2D-04',
    'منع العميل المعلق (Pending) من تفعيل ترخيصه أو عضويته أو تغيير مسماه الوظيفي أو قراءة بيانات العمل قبل موافقة المالك',
    !selfApproveLicenseAttempt &&
      !selfActivateMemberAttempt &&
      !selfChangeJobTitleAttempt &&
      !pendingReadOperationalAttempt,
    `تفعيل الترخيص ذاتيًا=${selfApproveLicenseAttempt}، تفعيل العضوية ذاتيًا=${selfActivateMemberAttempt}، تغيير المسمى الوظيفي=${selfChangeJobTitleAttempt}، قراءة العمل=${pendingReadOperationalAttempt}`
  );

  // ---------------------------------------------------------------------------
  // 5. فحص حدود صلاحيات مساعدي المنصة (Platform Staff Boundaries)
  // ---------------------------------------------------------------------------
  const staffRenewDoc = state.platform_staff.get(staffRenewOnlyAuth.uid) as unknown as PlatformStaff;
  const staffApprovePendingInRules = evaluator.canUpdateAccountLicense(
    staffRenewOnlyAuth,
    'ws_pending_1',
    {
      ...pendingLicense,
      status: 'active',
      startsAt: nowTs,
      expiresAt: futureTs,
    }
  );
  const staffApprovePendingInService = authorizePlatformOperation({
    actorAuth: staffRenewOnlyAuth,
    actorStaffRecord: staffRenewDoc,
    operation: 'decide_registration_request',
    targetCurrentStatus: 'pending',
  });
  const ownerApprovePendingInRules = evaluator.canUpdateAccountLicense(
    owner1Auth,
    'ws_pending_1',
    {
      ...pendingLicense,
      status: 'active',
      startsAt: nowTs,
      expiresAt: futureTs,
    }
  );
  const ownerApprovePendingInService = authorizePlatformOperation({
    actorAuth: owner1Auth,
    actorStaffRecord: null,
    operation: 'decide_registration_request',
    targetCurrentStatus: 'pending',
  });

  assertCondition(
    'S2D-05',
    'حصر قبول أو رفض طلبات تسجيل العملاء الجدد (pending) بالمالكين الدائمين فقط ومنع المساعدين في القواعد والخدمة',
    !staffApprovePendingInRules &&
      !staffApprovePendingInService.allowed &&
      ownerApprovePendingInRules &&
      ownerApprovePendingInService.allowed,
    `محاولة المساعد في القواعد=${staffApprovePendingInRules}، وفي الخدمة=${staffApprovePendingInService.allowed}؛ موافقة المالك الدائم=${ownerApprovePendingInRules}`
  );

  // 5-ب: مساعد المنصة بصلاحية canApproveAndRenew فقط يستطيع تجديد/تعليق اشتراك قائم ولكنه يُمنع من تغيير الباقة أو الحد الأقصى للأعضاء بدون canManagePackages
  const activeLicense = state.account_licenses.get('ws_active_1')!;
  const staffRenewSamePlanAllowed = evaluator.canUpdateAccountLicense(
    staffRenewOnlyAuth,
    'ws_active_1',
    {
      ...activeLicense,
      status: 'active',
      expiresAt: Timestamp.fromDate(new Date('2026-12-15T10:00:00.000Z')),
    }
  );
  const staffChangePlanWithoutPermDenied = evaluator.canUpdateAccountLicense(
    staffRenewOnlyAuth,
    'ws_active_1',
    {
      ...activeLicense,
      planId: 'annual',
      maxMembers: 8,
    }
  );
  const staffWithPkgPermChangePlanAllowed = evaluator.canUpdateAccountLicense(
    staffFullDelegatedAuth,
    'ws_active_1',
    {
      ...activeLicense,
      planId: 'annual',
      maxMembers: 8,
    }
  );
  const staffViewOnlyRenewDenied = evaluator.canUpdateAccountLicense(
    staffViewOnlyAuth,
    'ws_active_1',
    {
      ...activeLicense,
      status: 'suspended',
    }
  );
  const suspendedStaffRenewDenied = evaluator.canUpdateAccountLicense(
    staffSuspendedAuth,
    'ws_active_1',
    {
      ...activeLicense,
      status: 'suspended',
    }
  );

  assertCondition(
    'S2D-06',
    'التحقق الدقيق من صلاحيات مساعدي المنصة (تجديد اشتراك قائم مقابل تغيير الباقة/الأعضاء مقابل المساعد الموقوف أو صاحب صلاحية العرض فقط)',
    staffRenewSamePlanAllowed &&
      !staffChangePlanWithoutPermDenied &&
      staffWithPkgPermChangePlanAllowed &&
      !staffViewOnlyRenewDenied &&
      !suspendedStaffRenewDenied,
    `تجديد نفس الباقة=${staffRenewSamePlanAllowed}، تغيير الباقة بدون تفويض=${staffChangePlanWithoutPermDenied}، تغيير الباقة مع تفويض=${staffWithPkgPermChangePlanAllowed}، مساعد عرض فقط=${staffViewOnlyRenewDenied}، مساعد موقوف=${suspendedStaffRenewDenied}`
  );

  // 5-ج: منع إدراج بريد المالك الدائم ضمن مجموعة platform_staff ومنع غير المالك من إدارة المساعدين
  let assignOwnerAsStaffBlocked = false;
  try {
    validateAndBuildPlatformStaffRecord({
      actorAuth: owner1Auth,
      staffUid: 'owner_perm_2',
      email: 'ahah26@gmail.com',
      displayName: 'محاولة تحويل مالك إلى مساعد',
      status: 'active',
      permissions: { canViewRequests: true },
    });
  } catch {
    assignOwnerAsStaffBlocked = true;
  }

  const staffFullDoc = state.platform_staff.get(staffFullDelegatedAuth.uid) as unknown as PlatformStaff;
  const staffAssignStaffCheck = authorizePlatformOperation({
    actorAuth: staffFullDelegatedAuth,
    actorStaffRecord: staffFullDoc,
    operation: 'manage_platform_staff',
  });

  assertCondition(
    'S2D-07',
    'منع تحويل المالك الدائم إلى مساعد منصة ومنع المساعدين من تعيين مساعدين آخرين',
    assignOwnerAsStaffBlocked && !staffAssignStaffCheck.allowed,
    `منع إدراج المالك كمساعد=${assignOwnerAsStaffBlocked}، منع تعيين مساعد بواسطة مساعد=${!staffAssignStaffCheck.allowed}`
  );

  // ---------------------------------------------------------------------------
  // 6. فحص توافق الحسابات الحالية القديمة (Legacy Grandfathered Clients) دون ترحيل قسري
  // ---------------------------------------------------------------------------
  const legacyCanReadWriteRules =
    evaluator.canReadOperationalRecord(legacyClientAuth, 'ws_legacy_1') &&
    evaluator.canWriteOperationalRecord(legacyClientAuth, 'ws_legacy_1');
  const legacyAccessService = evaluateAccountAccessGate({
    authCandidate: legacyClientAuth,
    isNewSelfRegistration: false,
    existingUserProfile: state.users.get(legacyClientAuth.uid),
    existingOwnerMember: state.workspace_members.get(`ws_legacy_1_${legacyClientAuth.uid}`),
    accountLicense: null,
    enforceSubscriptionExpiryOnExisting: false,
  });

  assertCondition(
    'S2D-08',
    'استمرار عمل الحسابات الحالية القديمة (التي لا تملك وثيقة account_licenses بعد) بشكل طبيعي في قواعد Firestore وخدمة التراخيص دون ترحيل قسري',
    legacyCanReadWriteRules &&
      legacyAccessService.canAccessWorkScreens &&
      legacyAccessService.isExistingGrandfatheredAccount,
    `السماح في القواعد=${legacyCanReadWriteRules}، السماح في الخدمة=${legacyAccessService.canAccessWorkScreens} (${legacyAccessService.gateStatus})`
  );

  // ---------------------------------------------------------------------------
  // 7. فحص فرض حدود أعضاء الفريق (Team Member Limit 1..10) في القواعد والخدمة
  // ---------------------------------------------------------------------------
  const add4thMemberRules = evaluator.canAddMemberToWorkspace(activeClientAuth, 'ws_active_1', [
    activeClientAuth.uid,
    'member_2',
    'member_3',
    'member_4',
  ]);
  const add4thMemberService = validateTeamMemberAdditionLimit({
    currentMembersCount: 3,
    currentMemberUidsCount: 3,
    accountLicense: state.account_licenses.get('ws_active_1') as unknown as AccountLicense,
    isPermanentOwner: false,
  });
  const addMemberWhenUnderLimitService = validateTeamMemberAdditionLimit({
    currentMembersCount: 2,
    currentMemberUidsCount: 2,
    accountLicense: state.account_licenses.get('ws_active_1') as unknown as AccountLicense,
    isPermanentOwner: false,
  });

  assertCondition(
    'S2D-09',
    'فرض الحد الأقصى لأعضاء الفريق (maxMembers) في كل من قواعد Firestore وخدمة التطبيق',
    !add4thMemberRules &&
      !add4thMemberService.allowed &&
      addMemberWhenUnderLimitService.allowed &&
      add4thMemberService.effectiveMaxMembers === 3,
    `إضافة عضو رابع عند حد 3 في القواعد=${add4thMemberRules}، وفي الخدمة=${add4thMemberService.allowed}؛ إضافة عضو ثالث عند وجود 2=${addMemberWhenUnderLimitService.allowed}`
  );

  // ---------------------------------------------------------------------------
  // 8. فحص التعليق الإداري وإعادة التفعيل وانتهاء الصلاحية مع الحفاظ على البيانات
  // ---------------------------------------------------------------------------
  const suspendedReadAllowed = evaluator.canReadOperationalRecord(
    suspendedClientAuth,
    'ws_suspended_1'
  );
  const expiredWriteAllowed = evaluator.canWriteOperationalRecord(
    expiredClientAuth,
    'ws_expired_1'
  );
  const suspendedLicenseObj = state.account_licenses.get('ws_suspended_1') as unknown as AccountLicense;
  const reactivatedMutation = buildClientSubscriptionMutation({
    actorAuth: owner1Auth,
    action: 'reactivate',
    workspaceId: 'ws_suspended_1',
    ownerId: suspendedClientAuth.uid,
    ownerEmail: suspendedClientAuth.email,
    existingLicense: suspendedLicenseObj,
    now: nowDate,
  });
  state.account_licenses.set(
    'ws_suspended_1',
    reactivatedMutation.updatedLicense as unknown as Record<string, any>
  );
  const reactivatedReadWriteAllowed = evaluator.canWriteOperationalRecord(
    suspendedClientAuth,
    'ws_suspended_1'
  );

  assertCondition(
    'S2D-10',
    'منع الحساب المعلق والمنتهي من العمليات مع الحفاظ الكامل على بياناته واستعادة وصوله فور إعادة التفعيل',
    !suspendedReadAllowed &&
      !expiredWriteAllowed &&
      reactivatedMutation.dataPreserved === true &&
      reactivatedReadWriteAllowed,
    `وصول المعلق=${suspendedReadAllowed}، كتابة المنتهي=${expiredWriteAllowed}، حفظ البيانات=${reactivatedMutation.dataPreserved}، وصول المعلق بعد إعادة التفعيل=${reactivatedReadWriteAllowed}`
  );

  // ---------------------------------------------------------------------------
  // 9. فحص النسخ الاحتياطي والاستعادة المعزولة الشاملة لمجموعات المرحلة الثانية (16 مجموعة)
  // ---------------------------------------------------------------------------
  const packagesList: SubscriptionPackage[] = Object.values(DEFAULT_SUBSCRIPTION_PACKAGES);

  const governanceBackupPayload = buildBackupPayloadFromRawData({
    createdByUid: owner1Auth.uid,
    createdByEmail: owner1Auth.email,
    scopeMode: 'all_accessible_workspaces',
    targetWorkspaceId: null,
    includePlatformGovernance: true,
    rawCollections: {
      workspaces: [
        {
          id: 'ws_active_1',
          name: 'مكتب العميل النشط',
          ownerId: activeClientAuth.uid,
          ownerName: 'عميل مشترك نشط',
          defaultCurrency: 'SAR',
          taxRatePercent: 15,
          regionName: 'الدمام',
          inviteCode: 'ACTV01',
          memberUids: [activeClientAuth.uid],
          memberCount: 1,
          createdAt: nowTs,
          updatedAt: nowTs,
        },
      ],
      workspace_members: [
        {
          id: `ws_active_1_${activeClientAuth.uid}`,
          workspaceId: 'ws_active_1',
          ownerId: activeClientAuth.uid,
          userId: activeClientAuth.uid,
          displayName: 'عميل مشترك نشط',
          email: activeClientAuth.email,
          phone: '0503334455',
          role: 'owner',
          status: 'active',
          canApproveFinancials: true,
          canDeleteRecords: true,
          createdAt: nowTs,
          updatedAt: nowTs,
          createdBy: activeClientAuth.uid,
        },
      ],
      taxpayers: [
        {
          id: 'tp_1',
          workspaceId: 'ws_active_1',
          ownerId: activeClientAuth.uid,
          fullName: 'مكلف تجريبي',
          internalCode: 'TP-100',
          nationalOrCommercialId: '1010101010',
          phone: '0551112222',
          address: 'حي الشاطئ',
          region: 'الدمام',
          status: 'active',
          notes: '',
          createdAt: nowTs,
          updatedAt: nowTs,
          createdBy: activeClientAuth.uid,
          createdByName: 'عميل مشترك نشط',
        },
      ],
      properties: [],
      property_units: [],
      field_visits: [],
      appointments: [],
      appointment_postponements: [],
      financial_assessments: [],
      financial_transactions: [],
      notifications: [],
      audit_logs: [
        {
          id: 'audit_admin_1',
          workspaceId: 'ws_active_1',
          ownerId: activeClientAuth.uid,
          actionType: 'approve_registration_request',
          entityType: 'account_license',
          entityId: 'ws_active_1',
          summary: '[إدارة المنصة] اعتماد تسجيل مكتب العميل النشط وتفعيل الباقة ربع السنوية',
          actorId: owner1Auth.uid,
          actorName: 'المالك الدائم الأول',
          createdAt: nowTs,
        },
      ],
      users: [
        {
          id: activeClientAuth.uid,
          uid: activeClientAuth.uid,
          displayName: 'عميل مشترك نشط',
          email: activeClientAuth.email,
          phone: '0503334455',
          jobTitle: 'مدير مكتب عقاري',
          activeWorkspaceId: 'ws_active_1',
          createdAt: nowTs,
          updatedAt: nowTs,
        },
      ],
      account_licenses: [
        {
          id: 'ws_active_1',
          workspaceId: 'ws_active_1',
          ownerId: activeClientAuth.uid,
          ownerEmail: activeClientAuth.email,
          status: 'active',
          planId: 'quarterly',
          startsAt: nowTs,
          expiresAt: futureTs,
          maxMembers: 5,
          notes: 'ترخيص معتمد',
          createdAt: nowTs,
          updatedAt: nowTs,
          // حقل سري محقون لاختبار التنقية داخل مجموعات التراخيص
          apiSecretKey: 'SHOULD_BE_REMOVED_SECRET',
        },
      ],
      subscription_packages: packagesList.map((pkg: SubscriptionPackage) => ({
        ...pkg,
        createdAt: nowTs,
        updatedAt: nowTs,
      })),
      platform_staff: [
        {
          id: staffFullDelegatedAuth.uid,
          uid: staffFullDelegatedAuth.uid,
          email: staffFullDelegatedAuth.email,
          displayName: 'مساعد تجديد وباقات',
          status: 'active',
          permissions: {
            canViewRequests: true,
            canApproveAndRenew: true,
            canManagePackages: true,
          },
          assignedByUid: owner1Auth.uid,
          createdAt: nowTs,
          updatedAt: nowTs,
        },
      ],
    },
  });

  const governanceIntegrity = verifyBackupIntegrity(governanceBackupPayload);

  assertCondition(
    'S2D-11',
    'شمول النسخ الاحتياطي للمجموعات الـ 16 (بما فيها account_licenses و subscription_packages و platform_staff و audit_logs) مع بقاء isFullDisasterRecovery = false',
    governanceIntegrity.isValid &&
      governanceBackupPayload.isFullDisasterRecovery === false &&
      governanceBackupPayload.backupClassification === 'operational_firestore_data_partial' &&
      governanceBackupPayload.scopeDisclosure.includedCollections.length ===
        BACKUP_WORKSPACE_COLLECTIONS.length + 1 + BACKUP_PLATFORM_GOVERNANCE_COLLECTIONS.length &&
      governanceBackupPayload.manifest.collectionCounts.account_licenses === 1 &&
      governanceBackupPayload.manifest.collectionCounts.subscription_packages ===
        packagesList.length &&
      governanceBackupPayload.manifest.collectionCounts.platform_staff === 1 &&
      governanceBackupPayload.manifest.sanitizedFieldsCount === 1,
    `${governanceIntegrity.summaryAr} | الحقول السرية المنقاة=${governanceBackupPayload.manifest.sanitizedFieldPaths.join(', ')}`
  );

  // ---------------------------------------------------------------------------
  // 10. استعادة النسخة الشاملة في Sandbox والتحقق من إعادة بناء Timestamp وحماية audit_logs
  // ---------------------------------------------------------------------------
  const sandbox = new InMemoryFirestoreSandbox();
  const { result: restoreResult } = restoreBackupToSandbox(governanceBackupPayload, sandbox);
  const restoredLicenseDoc = sandbox.getDocument('account_licenses', 'ws_active_1');
  const restoredStaffDoc = sandbox.getDocument('platform_staff', staffFullDelegatedAuth.uid);
  const restoredPkgDoc = sandbox.getDocument('subscription_packages', 'monthly');

  assertCondition(
    'S2D-12',
    'نجاح الاستعادة المعزولة (Sandbox Restore) لمجموعات التراخيص والباقات والمساعدين مع إعادة بناء Timestamp وفصل المعرف docId',
    restoreResult.success &&
      restoreResult.deepEqualityVerified &&
      restoreResult.envelopeNoIdLeakVerified &&
      restoredLicenseDoc?.startsAt instanceof Timestamp &&
      restoredLicenseDoc?.expiresAt instanceof Timestamp &&
      !Object.prototype.hasOwnProperty.call(restoredLicenseDoc, 'id') &&
      restoredStaffDoc?.createdAt instanceof Timestamp &&
      !Object.prototype.hasOwnProperty.call(restoredStaffDoc, 'id') &&
      restoredPkgDoc?.createdAt instanceof Timestamp &&
      !Object.prototype.hasOwnProperty.call(restoredPkgDoc, 'id'),
    `الوثائق المستعادة=${restoreResult.totalRestoredDocuments}، الطوابع الزمنية المعاد بناؤها=${restoreResult.reconstructedTimestampsCount}`
  );

  // ---------------------------------------------------------------------------
  // 11. التحقق من كشف الأخطاء المرجعية والأمنية في verifyBackupIntegrity لمجموعات الحوكمة
  // ---------------------------------------------------------------------------
  const corruptedPayload = JSON.parse(JSON.stringify(governanceBackupPayload));
  // 1) جعل الترخيص يشير إلى مساحة عمل غير موجودة وبحد أعضاء غير صالح (25)
  corruptedPayload.data.account_licenses[0].docData.workspaceId = 'ws_non_existent';
  corruptedPayload.data.account_licenses[0].docData.maxMembers = 25;
  // 2) دس بريد المالك الدائم داخل platform_staff
  corruptedPayload.data.platform_staff[0].docData.email = 'am1075022@gmail.com';

  const corruptedIntegrity = verifyBackupIntegrity(corruptedPayload);

  assertCondition(
    'S2D-13',
    'كشف التراخيص اليتيمة وتجاوز حد الأعضاء (maxMembers > 10) ودس بريد المالك الدائم داخل platform_staff أثناء فحص سلامة النسخة',
    !corruptedIntegrity.isValid &&
      corruptedIntegrity.orphanWorkspaceRecords.some((r) => r.collection === 'account_licenses') &&
      corruptedIntegrity.invalidOwnerIdRecords.length >= 3,
    `تم رفض النسخة التالفة بنجاح؛ سجلات يتيمة=${corruptedIntegrity.orphanWorkspaceRecords.length}، مخالفات حوكمة=${corruptedIntegrity.invalidOwnerIdRecords.length}`
  );

  // ---------------------------------------------------------------------------
  // الملخص النهائي
  // ---------------------------------------------------------------------------
  const passedCount = assertions.filter((a) => a.passed).length;
  const failedCount = assertions.length - passedCount;
  console.log('\n==================================================================');
  console.log(`📊 ملخص اختبارات المرحلة 2-D: ${passedCount}/${assertions.length} ناجحة (${failedCount} فاشلة)`);
  console.log('==================================================================');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runStage2DAuditTests().catch((err) => {
  console.error('خطأ غير متوقع أثناء تشغيل اختبارات المرحلة 2-D:', err);
  process.exit(1);
});
