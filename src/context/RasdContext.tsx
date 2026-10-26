import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import {
  User as FirebaseUser,
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  Unsubscribe,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  createTeamUserAuthAccount,
  handleFirestoreError,
  generateSafeId,
  sanitizeText,
  translateFirebaseError,
} from '../services/firebase';
import {
  DEFAULT_SUBSCRIPTION_PACKAGES,
  PENDING_REGISTRATION_JOB_TITLE_MARKER,
  assertPlatformOperationAuthorized,
  authorizePlatformOperation,
  buildClientSubscriptionMutation,
  buildPendingRegistrationLicense,
  buildPermanentOwnerLicense,
  buildPlatformClientAccountSummary,
  buildRegistrationDecisionTransition,
  buildRegistrationRequestSummary,
  evaluateAccountAccessGate,
  inspectOwnerSessionDiagnostic,
  isPermanentPlatformOwnerEmail,
  isPendingRegistrationProfileMarker,
  OwnerSessionDiagnosticInfo,
  validateAndBuildPlatformStaffRecord,
  validateAndBuildSubscriptionPackageUpdate,
  validateTeamMemberAdditionLimit,
  verifyPlatformOwnerIdentity,
} from '../services/licenseService';
import {
  AccountApprovalGateStatus,
  AccountLicense,
  Appointment,
  AppointmentPostponement,
  AuditActionType,
  AuditEntityType,
  AuditLog,
  CurrencyCode,
  FieldVisit,
  FinancialAssessment,
  FinancialTransaction,
  NotificationItem,
  OperationType,
  PlatformAdminAuditEntry,
  PlatformAdminOperation,
  PlatformClientAccountSummary,
  PlatformStaff,
  PlatformStaffPermissions,
  Property,
  PropertyUnit,
  RegistrationRequestMetadata,
  ScreenId,
  SubscriptionPackage,
  SubscriptionPlanId,
  Taxpayer,
  UserProfile,
  Workspace,
  WorkspaceMember,
  WorkspaceRole,
} from '../types/rasd';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import {
  getAdenDateString,
  getAdenTimeString,
  getMinutesUntilAden,
  sanitizeReminderMinutes,
  formatTimeTo12Hour,
} from '../utils/dateUtils';
import { alertSound } from '../services/alertSound';
import { pushService } from '../services/pushService';

export function encodeMetaIntoNotes(notes: string, meta: Record<string, unknown>): string {
  const cleanNotes = (notes || '').replace(/\[META:\{.*?\}\]/g, '').trim();
  const metaStr = `[META:${JSON.stringify(meta)}]`;
  return cleanNotes ? `${cleanNotes}\n${metaStr}` : metaStr;
}

export function decodeMetaFromNotes<T extends Record<string, unknown>>(notes: string): { notes: string; meta: Partial<T> } {
  if (!notes) return { notes: '', meta: {} };
  const match = notes.match(/\[META:(\{.*?\})\]/);
  if (!match) return { notes, meta: {} };
  try {
    const meta = JSON.parse(match[1]);
    const cleanNotes = notes.replace(/\[META:\{.*?\}\]/g, '').trim();
    return { notes: cleanNotes, meta };
  } catch {
    return { notes, meta: {} };
  }
}

interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  text: string;
}

interface RasdContextValue {
  // Auth & Session
  firebaseUser: FirebaseUser | null;
  userProfile: UserProfile | null;
  authReady: boolean;
  isOnline: boolean;
  darkMode: boolean;
  toggleDarkMode: () => void;
  activeScreen: ScreenId;
  setActiveScreen: (screen: ScreenId) => void;
  selectedPropertyId: string | null;
  setSelectedPropertyId: (id: string | null) => void;
  selectedTaxpayerId: string | null;
  setSelectedTaxpayerId: (id: string | null) => void;
  selectedAppointmentId: string | null;
  setSelectedAppointmentId: (id: string | null) => void;
  toasts: ToastMessage[];
  showToast: (text: string, type?: ToastMessage['type']) => void;
  dismissToast: (id: string) => void;

  // Auth Actions
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  registerWithEmail: (name: string, email: string, pass: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
  refreshAuthUser: () => Promise<void>;
  logout: () => Promise<void>;

  // Workspace, Approval Gate & Permissions
  workspace: Workspace | null;
  members: WorkspaceMember[];
  currentUserRole: WorkspaceRole;
  isOwner: boolean;
  isPlatformAdmin: boolean;
  canApproveFinancials: boolean;
  canDeleteRecords: boolean;
  pendingSyncCount: number;
  accountApprovalStatus: AccountApprovalGateStatus;
  canAccessWorkScreens: boolean;
  accountLicense: AccountLicense | null;
  registrationRequest: RegistrationRequestMetadata | null;
  receivedRegistrationRequests: RegistrationRequestMetadata[];
  refreshRegistrationStatus: () => Promise<void>;
  refreshReceivedRegistrationRequests: () => Promise<void>;

  // Stage 2-C: Platform Administration Dashboard (لوحة إدارة منصة رَصْد)
  ownerSessionDiagnostic: OwnerSessionDiagnosticInfo;
  platformStaffRecord: PlatformStaff | null;
  canAccessPlatformAdmin: boolean;
  platformClientAccounts: PlatformClientAccountSummary[];
  subscriptionPackages: Record<SubscriptionPlanId, SubscriptionPackage>;
  platformStaffList: PlatformStaff[];
  platformAdminAuditLogs: PlatformAdminAuditEntry[];
  refreshPlatformAdminData: () => Promise<void>;
  decideRegistrationRequest: (params: {
    request: RegistrationRequestMetadata;
    decision: 'approve' | 'reject';
    approvedPlanId?: SubscriptionPlanId;
    customDurationDays?: number | null;
    maxMembers?: number;
    decisionNotes?: string;
  }) => Promise<void>;
  mutateClientSubscription: (params: {
    client: PlatformClientAccountSummary;
    action: 'activate' | 'renew' | 'suspend' | 'reactivate';
    planId?: SubscriptionPlanId;
    customDurationDays?: number | null;
    maxMembers?: number;
    notes?: string;
  }) => Promise<void>;
  updateSubscriptionPackageConfig: (
    planId: SubscriptionPlanId,
    patch: {
      nameAr?: string;
      descriptionAr?: string;
      durationDays?: number | null;
      defaultMaxMembers?: number;
      priceAmount?: number;
      currency?: CurrencyCode;
      isActive?: boolean;
    }
  ) => Promise<void>;
  upsertPlatformStaffMember: (params: {
    staffUid: string;
    email: string;
    displayName: string;
    status: 'active' | 'suspended';
    permissions: PlatformStaffPermissions;
  }) => Promise<void>;
  removePlatformStaffMember: (staffUid: string) => Promise<void>;

  // Collections
  taxpayers: Taxpayer[];
  properties: Property[];
  propertyUnits: PropertyUnit[];
  fieldVisits: FieldVisit[];
  appointments: Appointment[];
  postponements: AppointmentPostponement[];
  assessments: FinancialAssessment[];
  transactions: FinancialTransaction[];
  notifications: NotificationItem[];
  auditLogs: AuditLog[];

  // Business Mutations
  updateUserProfileInfo: (displayName: string, phone: string, jobTitle: string) => Promise<void>;
  updateWorkspaceSettings: (name: string, defaultCurrency: CurrencyCode, taxRatePercent: number, regionName: string) => Promise<void>;
  addTaxpayer: (input: Omit<Taxpayer, 'id' | 'workspaceId' | 'ownerId' | 'memberUids' | 'createdBy' | 'createdByName' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  updateTaxpayer: (id: string, input: Partial<Taxpayer>) => Promise<void>;
  deleteTaxpayer: (id: string) => Promise<void>;

  addProperty: (input: Omit<Property, 'id' | 'workspaceId' | 'ownerId' | 'memberUids' | 'createdBy' | 'createdByName' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  updateProperty: (id: string, input: Partial<Property>) => Promise<void>;
  deleteProperty: (id: string) => Promise<void>;

  addPropertyUnit: (input: Omit<PropertyUnit, 'id' | 'workspaceId' | 'ownerId' | 'memberUids' | 'createdBy' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  updatePropertyUnit: (id: string, input: Partial<PropertyUnit>) => Promise<void>;
  deletePropertyUnit: (unit: PropertyUnit) => Promise<void>;

  executeCompoundVoiceCreation: (input: {
    existingTaxpayerId?: string;
    taxpayerName: string;
    taxpayerPhone?: string;
    address: string;
    region: string;
    propertyTitle: string;
    propertyType: Property['propertyType'];
    floorsCount: number;
    apartmentsCount: number;
    shopsCount: number;
    officesCount: number;
    agentName?: string;
    agentPhone?: string;
    notes?: string;
    amount?: number;
    currency?: string;
  }) => Promise<{
    taxpayerId: string;
    taxpayerCode: string;
    propertyId: string;
    propertyCode: string;
    createdUnitsCount: number;
    createdUnitNumbers: string[];
  }>;

  addFieldVisit: (input: Omit<FieldVisit, 'id' | 'workspaceId' | 'ownerId' | 'memberUids' | 'officerId' | 'officerName' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  updateFieldVisitStatus: (visit: FieldVisit, status: FieldVisit['status'], impedimentReason?: string, additionalNotes?: string) => Promise<void>;

  addAppointment: (input: Omit<Appointment, 'id' | 'workspaceId' | 'ownerId' | 'memberUids' | 'postponeCount' | 'lastPostponeReason' | 'createdBy' | 'createdByName' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  postponeAppointment: (appointment: Appointment, newDate: string, newTime: string, reason: string, newReminderMinutesBefore?: number) => Promise<void>;
  updateAppointmentStatus: (appointment: Appointment, status: Appointment['status']) => Promise<void>;
  cancelAppointment: (appointment: Appointment, reason: string) => Promise<void>;

  addFinancialAssessment: (input: Omit<FinancialAssessment, 'id' | 'workspaceId' | 'ownerId' | 'memberUids' | 'createdBy' | 'createdByName' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  approveFinancialAssessment: (assessment: FinancialAssessment) => Promise<void>;
  cancelFinancialAssessment: (assessment: FinancialAssessment, reasonNote: string) => Promise<void>;

  addFinancialTransaction: (input: Omit<FinancialTransaction, 'id' | 'workspaceId' | 'ownerId' | 'memberUids' | 'createdBy' | 'createdByName' | 'createdAt' | 'updatedAt'>) => Promise<{ id: string; referenceNumber: string }>;
  approveFinancialTransaction: (tx: FinancialTransaction) => Promise<void>;
  reverseFinancialTransaction: (tx: FinancialTransaction, reasonNote: string) => Promise<void>;

  addTeamMember: (
    displayName: string,
    email: string,
    userIdInput: string,
    role: WorkspaceRole,
    canApprove: boolean,
    canDelete: boolean,
    initialPassword?: string
  ) => Promise<void>;
  updateTeamMember: (member: WorkspaceMember, role: WorkspaceRole, status: WorkspaceMember['status'], canApprove: boolean, canDelete: boolean) => Promise<void>;
  removeTeamMember: (member: WorkspaceMember) => Promise<void>;

  markNotificationRead: (id: string) => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  clearAllNotifications: () => Promise<void>;
  recordVoiceAudit: (transcript: string, summary: string) => Promise<void>;
}

const RasdContext = createContext<RasdContextValue | undefined>(undefined);

export const RasdProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isOnline = useOnlineStatus();
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('rasd_theme') === 'dark';
  });

  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);

  const [activeScreen, setActiveScreen] = useState<ScreenId>('home');
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [selectedTaxpayerId, setSelectedTaxpayerId] = useState<string | null>(null);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [taxpayers, setTaxpayers] = useState<Taxpayer[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyUnits, setPropertyUnits] = useState<PropertyUnit[]>([]);
  const [fieldVisits, setFieldVisits] = useState<FieldVisit[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [postponements, setPostponements] = useState<AppointmentPostponement[]>([]);
  const [assessments, setAssessments] = useState<FinancialAssessment[]>([]);
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [accountApprovalStatus, setAccountApprovalStatus] =
    useState<AccountApprovalGateStatus>('checking');
  const [accountLicense, setAccountLicense] = useState<AccountLicense | null>(null);
  const [registrationRequest, setRegistrationRequest] =
    useState<RegistrationRequestMetadata | null>(null);
  const [receivedRegistrationRequests, setReceivedRegistrationRequests] = useState<
    RegistrationRequestMetadata[]
  >([]);
  const [platformStaffRecord, setPlatformStaffRecord] = useState<PlatformStaff | null>(null);
  const [authSessionVersion, setAuthSessionVersion] = useState<number>(0);
  const [platformClientAccounts, setPlatformClientAccounts] = useState<
    PlatformClientAccountSummary[]
  >([]);
  const [subscriptionPackages, setSubscriptionPackages] = useState<
    Record<SubscriptionPlanId, SubscriptionPackage>
  >(() => {
    try {
      const cached = localStorage.getItem('rasd_subscription_packages_v1');
      if (cached) {
        const parsed = JSON.parse(cached) as Partial<Record<SubscriptionPlanId, SubscriptionPackage>>;
        return {
          ...DEFAULT_SUBSCRIPTION_PACKAGES,
          ...parsed,
          owner_permanent: DEFAULT_SUBSCRIPTION_PACKAGES.owner_permanent,
        };
      }
    } catch {
      // ignore storage errors
    }
    return { ...DEFAULT_SUBSCRIPTION_PACKAGES };
  });
  const [platformStaffList, setPlatformStaffList] = useState<PlatformStaff[]>(() => {
    try {
      const cached = localStorage.getItem('rasd_platform_staff_v1');
      if (cached) return JSON.parse(cached) as PlatformStaff[];
    } catch {
      // ignore storage errors
    }
    return [];
  });
  const [platformAdminAuditLogs, setPlatformAdminAuditLogs] = useState<PlatformAdminAuditEntry[]>(
    () => {
      try {
        const cached = localStorage.getItem('rasd_platform_admin_audit_v1');
        if (cached) return JSON.parse(cached) as PlatformAdminAuditEntry[];
      } catch {
        // ignore storage errors
      }
      return [];
    }
  );

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('rasd_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('rasd_theme', 'light');
    }
  }, [darkMode]);

  const toggleDarkMode = useCallback(() => {
    setDarkMode((prev) => !prev);
  }, []);

  const showToast = useCallback((text: string, type: ToastMessage['type'] = 'info') => {
    const id = generateSafeId('toast');
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clearAllUserState = useCallback(() => {
    setUserProfile(null);
    setWorkspace(null);
    setMembers([]);
    setTaxpayers([]);
    setProperties([]);
    setPropertyUnits([]);
    setFieldVisits([]);
    setAppointments([]);
    setPostponements([]);
    setAssessments([]);
    setTransactions([]);
    setNotifications([]);
    setAuditLogs([]);
    setAccountApprovalStatus('checking');
    setAccountLicense(null);
    setRegistrationRequest(null);
    setReceivedRegistrationRequests([]);
    setPlatformStaffRecord(null);
    setPlatformClientAccounts([]);
    setSelectedPropertyId(null);
    setSelectedTaxpayerId(null);
    setActiveScreen('home');
  }, []);

  const bootstrappingPromiseRef = React.useRef<{ uid: string; promise: Promise<void> } | null>(null);

  const applyOptimisticSession = useCallback((user: FirebaseUser, customDisplayName?: string) => {
    const uid = user.uid;
    const defaultWsId = `ws_${uid.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48)}`;
    const displayName = sanitizeText(
      customDisplayName || user.displayName || user.email?.split('@')[0] || 'مستخدم رصد',
      120,
      1,
      'مستخدم رصد'
    );
    const email = sanitizeText(user.email || 'user@rasd.app', 200, 3, 'user@rasd.app');
    const inviteCode = sanitizeText(`RASD-${uid.slice(0, 6).toUpperCase()}`.replace(/[^a-zA-Z0-9_-]/g, ''), 64, 4, 'RASD1000');

    setUserProfile((prev) =>
      prev && prev.uid === uid
        ? prev
        : {
            id: uid,
            uid,
            displayName,
            email,
            phone: '',
            jobTitle: 'مسؤول ميداني أول',
            activeWorkspaceId: defaultWsId,
          }
    );

    setWorkspace((prev) =>
      prev && prev.ownerId === uid
        ? prev
        : {
            id: defaultWsId,
            name: sanitizeText(`مساحة عمل ${displayName}`, 120, 1, 'مساحة العمل الميدانية'),
            ownerId: uid,
            ownerName: displayName,
            defaultCurrency: 'YER',
            taxRatePercent: 0,
            regionName: 'عدن',
            inviteCode,
            memberUids: [uid],
            memberCount: 1,
          }
    );
  }, []);

  // Bootstrap User & Workspace on login / registration with Stage 2-B Approval Gate
  const ensureUserAndWorkspace = useCallback(
    async (
      user: FirebaseUser,
      customDisplayName?: string,
      options?: { isExplicitRegistration?: boolean }
    ) => {
      const uid = user.uid;
      applyOptimisticSession(user, customDisplayName);

      // إذا كان البريد مطابقًا لأحد المالكين الدائمين وكان يظهر غير موثق محليًا، نتحقق أولًا من حالة التوثيق الفعلية في خادم Firebase Auth
      if (isPermanentPlatformOwnerEmail(user.email) && !user.emailVerified) {
        try {
          if (typeof user.reload === 'function') {
            await user.reload();
            if (user.emailVerified && typeof user.getIdToken === 'function') {
              await user.getIdToken(true);
            }
            setAuthSessionVersion((v) => v + 1);
          }
        } catch {
          // ignore if offline
        }
      }

      const ownerCheck = verifyPlatformOwnerIdentity(user);
      if (ownerCheck.isVerifiedOwner) {
        setAccountApprovalStatus('approved');
        try {
          localStorage.setItem(`rasd_gate_status_${uid}`, 'approved');
        } catch {
          // ignore storage errors
        }
      } else if (options?.isExplicitRegistration) {
        setAccountApprovalStatus('checking');
      } else {
        try {
          const cachedGate = localStorage.getItem(
            `rasd_gate_status_${uid}`
          ) as AccountApprovalGateStatus | null;
          if (
            cachedGate === 'approved' ||
            cachedGate === 'legacy_active' ||
            cachedGate === 'pending_approval' ||
            cachedGate === 'suspended'
          ) {
            setAccountApprovalStatus(cachedGate);
          } else {
            setAccountApprovalStatus('checking');
          }
        } catch {
          setAccountApprovalStatus('checking');
        }
      }

      if (bootstrappingPromiseRef.current?.uid === uid && !options?.isExplicitRegistration) {
        return bootstrappingPromiseRef.current.promise;
      }

      const runBootstrap = async () => {
        const defaultWsId = `ws_${uid.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48)}`;
        const userDocRef = doc(db, 'users', uid);
        let currentStepPath = `users/${uid}`;

        try {
          const userSnap = await getDoc(userDocRef);
          const userExistedPrior = userSnap.exists();
          let activeWsId = userExistedPrior
            ? userSnap.data().activeWorkspaceId || defaultWsId
            : defaultWsId;

          let isInvitedTeamMember = activeWsId !== defaultWsId;
          let invitedMemberStatus: 'active' | 'invited' | 'suspended' | null = null;

          // Check if this user was invited to a team workspace by email
          const normalizedUserEmail = (user.email || '').trim().toLowerCase();
          if (normalizedUserEmail && activeWsId === defaultWsId) {
            try {
              const inviteQuery = query(
                collection(db, 'workspace_members'),
                where('email', '==', normalizedUserEmail)
              );
              const inviteSnap = await getDocs(inviteQuery);
              const validInviteDoc = inviteSnap.docs.find((d) => {
                const data = d.data();
                return data.status !== 'suspended' && data.workspaceId && data.workspaceId !== defaultWsId;
              });

              if (validInviteDoc) {
                const invData = validInviteDoc.data();
                const targetWsId = invData.workspaceId as string;
                const targetWsRef = doc(db, 'workspaces', targetWsId);
                const targetWsSnap = await getDoc(targetWsRef);

                if (targetWsSnap.exists()) {
                  const targetWsData = targetWsSnap.data();
                  const existingUids: string[] = Array.isArray(targetWsData.memberUids)
                    ? targetWsData.memberUids
                    : [targetWsData.ownerId];
                  const filteredUids = existingUids.filter(
                    (id) => id !== invData.userId || id === uid
                  );
                  const updatedMemberUids = Array.from(new Set([...filteredUids, uid])).slice(0, 10);

                  activeWsId = targetWsId;
                  isInvitedTeamMember = true;
                  invitedMemberStatus = 'active';

                  await updateDoc(targetWsRef, {
                    memberUids: updatedMemberUids,
                    memberCount: updatedMemberUids.length,
                    updatedAt: serverTimestamp(),
                  }).catch(() => {});

                  const realMemberDocId = `${targetWsId}_${uid}`
                    .replace(/[^a-zA-Z0-9_-]/g, '')
                    .slice(0, 120);

                  await setDoc(doc(db, 'workspace_members', realMemberDocId), {
                    workspaceId: targetWsId,
                    ownerId: invData.ownerId,
                    userId: uid,
                    displayName: sanitizeText(
                      customDisplayName || user.displayName || invData.displayName || 'مساعد ميداني',
                      120,
                      1,
                      'مساعد ميداني'
                    ),
                    email: normalizedUserEmail,
                    role: invData.role || 'field_assistant',
                    status: 'active',
                    canApproveFinancials: Boolean(invData.canApproveFinancials),
                    canDeleteRecords: Boolean(invData.canDeleteRecords),
                    memberUids: updatedMemberUids,
                    createdBy: uid,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                  }).catch(() => {});

                  if (validInviteDoc.id !== realMemberDocId) {
                    await deleteDoc(validInviteDoc.ref).catch(() => {});
                  }
                }
              }
            } catch {
              // Ignore if query is not permitted or offline
            }
          }

          const wsRef = doc(db, 'workspaces', activeWsId);
          const memberId = `${activeWsId}_${uid}`.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120);
          const memberRef = doc(db, 'workspace_members', memberId);

          const isOwnDefaultWs = activeWsId === defaultWsId;
          const [wsSnap, memberSnap] = isOwnDefaultWs
            ? await Promise.all([getDoc(wsRef), getDoc(memberRef)])
            : [null, await getDoc(memberRef).catch(() => null)];

          const wsExistedPrior = Boolean(wsSnap && wsSnap.exists());
          const memberExistedPrior = Boolean(memberSnap && memberSnap.exists());

          if (isInvitedTeamMember && memberExistedPrior && memberSnap) {
            invitedMemberStatus = (memberSnap.data()?.status as 'active' | 'invited' | 'suspended') || 'active';
          }

          // التحقق الصارم المتطابق مع licenseService.ts وقواعد Firestore: لا تُمنح صفة المالك الدائم إلا بتوثيق البريد الفعلي (emailVerified === true)
          const isVerifiedOwnerNow = ownerCheck.isVerifiedOwner;

          // الحساب الجديد المسجل ذاتيًا: لم يكن له سجل مستخدم أو مساحة عمل سابقة وليس مالكًا دائمًا موثقًا ولا عضو فريق مدعوًا
          const isNewSelfRegistration =
            !isVerifiedOwnerNow &&
            !isInvitedTeamMember &&
            !userExistedPrior &&
            !wsExistedPrior &&
            !memberExistedPrior;

          const needsUserDoc =
            !userExistedPrior ||
            (userExistedPrior && userSnap.data().activeWorkspaceId !== activeWsId);
          const needsWsDoc = isOwnDefaultWs && wsSnap !== null && !wsExistedPrior;
          const needsMemberDoc = isOwnDefaultWs && memberSnap !== null && !memberExistedPrior;

          const displayName = sanitizeText(
            customDisplayName || user.displayName || user.email?.split('@')[0] || 'مستخدم رصد',
            120,
            1,
            'مستخدم رصد'
          );
          const email = sanitizeText(user.email || 'user@rasd.app', 200, 3, 'user@rasd.app');
          const inviteCode = sanitizeText(
            `RASD-${uid.slice(0, 6).toUpperCase()}`.replace(/[^a-zA-Z0-9_-]/g, ''),
            64,
            4,
            'RASD1000'
          );
          const workspaceName = sanitizeText(
            `مساحة عمل ${displayName}`,
            120,
            1,
            'مساحة العمل الميدانية'
          );

          // تحديد المسمى الوظيفي وحالة العضوية عند الإنشاء الأولي فقط (دون المساس بالحسابات الحالية إطلاقًا)
          const initialJobTitle = isNewSelfRegistration
            ? PENDING_REGISTRATION_JOB_TITLE_MARKER
            : 'مسؤول ميداني أول';
          const initialOwnerMemberStatus: WorkspaceMember['status'] = isNewSelfRegistration
            ? 'invited'
            : 'active';

          if (needsUserDoc || needsWsDoc || needsMemberDoc) {
            const batch = writeBatch(db);

            if (needsWsDoc) {
              currentStepPath = `workspaces/${activeWsId}`;
              batch.set(wsRef, {
                name: workspaceName,
                ownerId: uid,
                ownerName: displayName,
                defaultCurrency: 'YER',
                taxRatePercent: 0,
                regionName: 'عدن',
                inviteCode,
                memberUids: [uid],
                memberCount: 1,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
            }

            if (needsUserDoc) {
              currentStepPath = `users/${uid}`;
              const preservedJobTitle =
                userExistedPrior && userSnap.data().jobTitle
                  ? userSnap.data().jobTitle
                  : initialJobTitle;
              batch.set(userDocRef, {
                uid,
                displayName,
                email,
                phone: userExistedPrior ? userSnap.data().phone || '' : '',
                jobTitle: preservedJobTitle,
                activeWorkspaceId: activeWsId,
                createdAt: userExistedPrior && userSnap.data().createdAt ? userSnap.data().createdAt : serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
            }

            if (needsMemberDoc) {
              currentStepPath = `workspace_members/${memberId}`;
              batch.set(memberRef, {
                workspaceId: activeWsId,
                ownerId: uid,
                userId: uid,
                displayName,
                email,
                role: 'owner',
                status: initialOwnerMemberStatus,
                canApproveFinancials: true,
                canDeleteRecords: true,
                memberUids: [uid],
                createdBy: uid,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
            }

            await batch.commit();
          }

          // للعملاء الجدد: تجهيز وتسجيل طلب الترخيص بحالة pending في /account_licenses/{activeWsId} وفي التخزين المحلي
          let resolvedLicense: AccountLicense | null = null;
          if (isNewSelfRegistration && !isPermanentPlatformOwnerEmail(email)) {
            const pendingLicense = buildPendingRegistrationLicense({
              workspaceId: activeWsId,
              ownerId: uid,
              ownerEmail: email,
              applicantName: displayName,
              workspaceName,
              requestedPlanId: 'trial',
            });
            resolvedLicense = pendingLicense;

            try {
              localStorage.setItem(
                `rasd_reg_req_${uid}`,
                JSON.stringify({
                  applicantUid: uid,
                  applicantName: displayName,
                  applicantEmail: email.toLowerCase(),
                  applicantPhone: '',
                  workspaceId: activeWsId,
                  workspaceName,
                  requestedPlanId: 'trial',
                  status: 'pending',
                  requestedAtIso: new Date().toISOString(),
                  source: 'local_cache',
                  notes: 'طلب تسجيل عميل جديد بانتظار مراجعة واعتماد إدارة المنصة.',
                } satisfies RegistrationRequestMetadata)
              );
            } catch {
              // ignore storage errors
            }

            // محاولة إنشاء وثيقة /account_licenses/{activeWsId} بحالة pending (تنجح فور تفعيل قواعد المجموعة ولا تعطل التطبيق قبل نشرها)
            try {
              await setDoc(doc(db, 'account_licenses', activeWsId), {
                workspaceId: pendingLicense.workspaceId,
                ownerId: pendingLicense.ownerId,
                ownerEmail: pendingLicense.ownerEmail,
                planId: pendingLicense.planId,
                status: 'pending',
                startsAt: pendingLicense.startsAt,
                expiresAt: pendingLicense.expiresAt,
                maxMembers: pendingLicense.maxMembers,
                notes: pendingLicense.notes,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
            } catch {
              // القواعد الحالية في /firestore.rules قبل النشر قد ترفض الوصول إلى /account_licenses؛ تعتمد البوابة حينها على علامة الانتظار المحفوظة في users و workspace_members
            }
          } else {
            // محاولة قراءة وثيقة الترخيص إن وجدت دون فرض أي ترحيل أو كتابة على الحسابات الحالية النشطة
            try {
              const licRef = doc(db, 'account_licenses', activeWsId);
              const licSnap = await getDoc(licRef);
              if (licSnap.exists()) {
                const licData = licSnap.data();
                resolvedLicense = {
                  id: licSnap.id,
                  workspaceId: licData.workspaceId || licSnap.id,
                  ownerId: licData.ownerId,
                  ownerEmail: licData.ownerEmail,
                  planId: licData.planId,
                  status: licData.status,
                  startsAt: licData.startsAt,
                  expiresAt: licData.expiresAt,
                  maxMembers: licData.maxMembers,
                  notes: licData.notes || '',
                  createdAt: licData.createdAt,
                  updatedAt: licData.updatedAt,
                };
              } else if (
                !ownerCheck.isVerifiedOwner &&
                !isPermanentPlatformOwnerEmail(email) &&
                !isInvitedTeamMember &&
                isPendingRegistrationProfileMarker(
                  userExistedPrior ? userSnap.data().jobTitle : initialJobTitle,
                  memberSnap?.exists() ? memberSnap.data().status : initialOwnerMemberStatus
                )
              ) {
                // إذا كان الحساب معلقًا بانتظار الموافقة ولم تُنشأ وثيفته في /account_licenses بعد، نسجلها الآن
                const pendingLicense = buildPendingRegistrationLicense({
                  workspaceId: activeWsId,
                  ownerId: uid,
                  ownerEmail: email,
                  applicantName: displayName,
                  workspaceName,
                  requestedPlanId: 'trial',
                });
                resolvedLicense = pendingLicense;
                await setDoc(licRef, {
                  workspaceId: pendingLicense.workspaceId,
                  ownerId: pendingLicense.ownerId,
                  ownerEmail: pendingLicense.ownerEmail,
                  planId: pendingLicense.planId,
                  status: 'pending',
                  startsAt: pendingLicense.startsAt,
                  expiresAt: pendingLicense.expiresAt,
                  maxMembers: pendingLicense.maxMembers,
                  notes: pendingLicense.notes,
                  createdAt: serverTimestamp(),
                  updatedAt: serverTimestamp(),
                });
              }
            } catch {
              // ignore if offline
            }
          }

          currentStepPath = `users/${uid}`;
          const [finalUserSnap, finalMemberSnap] = await Promise.all([
            getDoc(userDocRef),
            getDoc(memberRef).catch(() => null),
          ]);

          let latestProfile: UserProfile | null = null;
          if (finalUserSnap.exists()) {
            const d = finalUserSnap.data();
            latestProfile = {
              id: finalUserSnap.id,
              uid: d.uid,
              displayName: d.displayName,
              email: d.email,
              phone: d.phone || '',
              jobTitle: d.jobTitle || '',
              activeWorkspaceId: d.activeWorkspaceId || activeWsId,
              isPendingSync: finalUserSnap.metadata.hasPendingWrites,
              fromCache: finalUserSnap.metadata.fromCache,
            };
            setUserProfile(latestProfile);
          }

          const finalOwnerMemberData =
            finalMemberSnap && finalMemberSnap.exists() ? finalMemberSnap.data() : null;

          // تقييم بوابة الموافقة والاشتراك للحساب (مع الحفاظ على الحسابات الحالية القائمة قبل نظام التراخيص دون ترحيل قسري)
          const gateEval = evaluateAccountAccessGate({
            authCandidate: user,
            isNewSelfRegistration,
            existingUserProfile: latestProfile || (userExistedPrior ? (userSnap.data() as Partial<UserProfile>) : null),
            existingOwnerMember: finalOwnerMemberData
              ? { role: finalOwnerMemberData.role, status: finalOwnerMemberData.status }
              : null,
            isInvitedTeamMember,
            invitedMemberStatus,
            accountLicense: resolvedLicense,
            enforceSubscriptionExpiryOnExisting: true,
          });

          setAccountLicense(resolvedLicense);
          setAccountApprovalStatus(gateEval.gateStatus);
          try {
            localStorage.setItem(`rasd_gate_status_${uid}`, gateEval.gateStatus);
          } catch {
            // ignore storage errors
          }

          let cachedReqMeta: Partial<RegistrationRequestMetadata> | null = null;
          try {
            const rawCached = localStorage.getItem(`rasd_reg_req_${uid}`);
            if (rawCached) {
              cachedReqMeta = JSON.parse(rawCached) as Partial<RegistrationRequestMetadata>;
            }
          } catch {
            cachedReqMeta = null;
          }

          const regSummary = buildRegistrationRequestSummary({
            license: resolvedLicense,
            userProfile: latestProfile || {
              uid,
              displayName,
              email,
              phone: '',
              jobTitle: initialJobTitle,
              activeWorkspaceId: activeWsId,
            },
            workspace: {
              id: activeWsId,
              name: workspaceName,
              ownerId: uid,
              ownerName: displayName,
            },
            memberStatus:
              (finalOwnerMemberData?.status as string | undefined) || initialOwnerMemberStatus,
            fallbackUid: uid,
            fallbackEmail: email,
            fallbackName: displayName,
          });

          if (cachedReqMeta?.requestedAtIso && !resolvedLicense) {
            regSummary.requestedAtIso = cachedReqMeta.requestedAtIso;
          }

          setRegistrationRequest(regSummary);
        } catch (error) {
          console.warn('Bootstrap Firestore notice at', currentStepPath, error);
          // في حال الانقطاع عن الشبكة، نحافظ على حالة المالك الدائم الموثق أو الحالة المخزنة محليًا دون قفل الحسابات الحالية
          if (ownerCheck.isVerifiedOwner) {
            setAccountApprovalStatus('approved');
          } else {
            try {
              const cachedGate = localStorage.getItem(
                `rasd_gate_status_${uid}`
              ) as AccountApprovalGateStatus | null;
              if (cachedGate === 'pending_approval' || cachedGate === 'suspended') {
                setAccountApprovalStatus(cachedGate);
              } else if (options?.isExplicitRegistration) {
                setAccountApprovalStatus('pending_approval');
              } else {
                setAccountApprovalStatus('legacy_active');
              }
            } catch {
              setAccountApprovalStatus(
                options?.isExplicitRegistration ? 'pending_approval' : 'legacy_active'
              );
            }
          }
        } finally {
          if (bootstrappingPromiseRef.current?.uid === uid) {
            bootstrappingPromiseRef.current = null;
          }
        }
      };

      const p = runBootstrap();
      bootstrappingPromiseRef.current = { uid, promise: p };
      return p;
    },
    [applyOptimisticSession]
  );

  // Auth State Listener with immediate hydration & safety timeout so welcome screen never hangs
  useEffect(() => {
    let resolved = false;

    if (auth.currentUser) {
      resolved = true;
      setFirebaseUser(auth.currentUser);
      alertSound.syncUserReminderPreference(auth.currentUser.uid);
      applyOptimisticSession(auth.currentUser);
      setAuthReady(true);
    }

    const fallbackTimer = window.setTimeout(() => {
      if (!resolved) {
        setAuthReady(true);
      }
    }, 2000);

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      resolved = true;
      window.clearTimeout(fallbackTimer);
      setFirebaseUser(user);
      if (user) {
        alertSound.syncUserReminderPreference(user.uid);
        applyOptimisticSession(user);
        setAuthReady(true);
        ensureUserAndWorkspace(user).catch((e) => {
          console.warn(e);
        });
      } else {
        alertSound.syncUserReminderPreference(null);
        clearAllUserState();
        setAuthReady(true);
      }
    });

    return () => {
      window.clearTimeout(fallbackTimer);
      unsubAuth();
    };
  }, [applyOptimisticSession, ensureUserAndWorkspace, clearAllUserState]);

  const canAccessWorkScreens = useMemo(() => {
    return accountApprovalStatus === 'approved' || accountApprovalStatus === 'legacy_active';
  }, [accountApprovalStatus]);

  // Attach Real-time Listeners once user is authenticated
  useEffect(() => {
    if (!authReady || !firebaseUser || !userProfile?.activeWorkspaceId) {
      return;
    }

    const uid = firebaseUser.uid;
    const activeWsId = userProfile.activeWorkspaceId;
    const unsubs: Unsubscribe[] = [];

    // 1. User Profile listener (يرصد أيضًا أي تحديث إداري لحالة الحساب)
    unsubs.push(
      onSnapshot(
        doc(db, 'users', uid),
        { includeMetadataChanges: true },
        (snap) => {
          if (snap.exists()) {
            const d = snap.data();
            const updatedProfile: UserProfile = {
              id: snap.id,
              uid: d.uid,
              displayName: d.displayName,
              email: d.email,
              phone: d.phone || '',
              jobTitle: d.jobTitle || '',
              activeWorkspaceId: d.activeWorkspaceId,
              isPendingSync: snap.metadata.hasPendingWrites,
              fromCache: snap.metadata.fromCache,
            };
            setUserProfile(updatedProfile);
          }
        },
        (err) => handleFirestoreError(err, OperationType.GET, `users/${uid}`)
      )
    );

    // 1B. Account License real-time listener (يحدث حالة الموافقة والاشتراك لحظيًا فور اعتماد المالك أو التجديد أو الإيقاف)
    unsubs.push(
      onSnapshot(
        doc(db, 'account_licenses', activeWsId),
        { includeMetadataChanges: true },
        (licSnap) => {
          if (licSnap.exists()) {
            const licData = licSnap.data();
            const liveLicense: AccountLicense = {
              id: licSnap.id,
              workspaceId: licData.workspaceId || licSnap.id,
              ownerId: licData.ownerId,
              ownerEmail: licData.ownerEmail,
              planId: licData.planId,
              status: licData.status,
              startsAt: licData.startsAt,
              expiresAt: licData.expiresAt,
              maxMembers: licData.maxMembers,
              notes: licData.notes || '',
              createdAt: licData.createdAt,
              updatedAt: licData.updatedAt,
            };
            setAccountLicense(liveLicense);

            const gateEval = evaluateAccountAccessGate({
              authCandidate: firebaseUser,
              isNewSelfRegistration: false,
              existingUserProfile: userProfile,
              accountLicense: liveLicense,
              enforceSubscriptionExpiryOnExisting: true,
            });
            setAccountApprovalStatus(gateEval.gateStatus);
            try {
              localStorage.setItem(`rasd_gate_status_${uid}`, gateEval.gateStatus);
            } catch {
              // ignore storage errors
            }

            const regSummary = buildRegistrationRequestSummary({
              license: liveLicense,
              userProfile,
              fallbackUid: uid,
              fallbackEmail: firebaseUser.email || userProfile.email,
              fallbackName: userProfile.displayName,
              sourceOverride: 'account_licenses',
            });
            setRegistrationRequest(regSummary);
          }
        },
        () => {
          // ignore if document doesn't exist or user is a grandfathered client without a license doc
        }
      )
    );

    // إذا كان الحساب في حالة انتظار الموافقة أو موقوفًا، لا نفتح مستمعات مجموعات العمل التشغيلية قبل الموافقة
    if (!canAccessWorkScreens) {
      return () => {
        unsubs.forEach((u) => u());
      };
    }

    // 2. Workspaces listener
    unsubs.push(
      onSnapshot(
        query(collection(db, 'workspaces'), where('memberUids', 'array-contains', uid)),
        { includeMetadataChanges: true },
        (snap) => {
          const list: Workspace[] = snap.docs.map((docSnap) => ({
            ...(docSnap.data() as Omit<Workspace, 'id'>),
            id: docSnap.id,
            isPendingSync: docSnap.metadata.hasPendingWrites,
            fromCache: docSnap.metadata.fromCache,
          }));
          const active = list.find((w) => w.id === userProfile.activeWorkspaceId) || list[0] || null;
          if (active) {
            if (!active.defaultCurrency || active.defaultCurrency === 'SAR') {
              active.defaultCurrency = 'YER';
              if (active.ownerId === uid) {
                updateDoc(doc(db, 'workspaces', active.id), {
                  defaultCurrency: 'YER',
                  updatedAt: serverTimestamp(),
                }).catch(() => {});
              }
            }
          }
          setWorkspace(active);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'workspaces')
      )
    );

    // Helper to subscribe to a workspace collection using memberUids array-contains
    function subscribeCollection<T extends { id: string; workspaceId: string }>(
      colName: string,
      setter: React.Dispatch<React.SetStateAction<T[]>>
    ) {
      const q = query(collection(db, colName), where('memberUids', 'array-contains', uid));
      const u = onSnapshot(
        q,
        { includeMetadataChanges: true },
        (snap) => {
          const items = snap.docs
            .map((d) => {
              const raw = d.data() as Record<string, unknown>;
              let decodedNotes = typeof raw.notes === 'string' ? raw.notes : '';
              let meta: Record<string, unknown> = {};
              if (typeof raw.notes === 'string' && raw.notes.includes('[META:')) {
                const dec = decodeMetaFromNotes<Record<string, unknown>>(raw.notes);
                decodedNotes = dec.notes;
                meta = dec.meta;
              }
              const exactStatus = meta.exactStatus || raw.status;
              return {
                ...raw,
                notes: decodedNotes,
                ...meta,
                status: exactStatus,
                id: d.id,
                isPendingSync: d.metadata.hasPendingWrites,
                fromCache: d.metadata.fromCache,
              } as unknown as T;
            })
            .filter((item) => item.workspaceId === userProfile?.activeWorkspaceId);
          setter(items);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, colName)
      );
      unsubs.push(u);
    }

    subscribeCollection<WorkspaceMember>('workspace_members', setMembers);
    subscribeCollection<Taxpayer>('taxpayers', setTaxpayers);
    subscribeCollection<Property>('properties', setProperties);
    subscribeCollection<PropertyUnit>('property_units', setPropertyUnits);
    subscribeCollection<FieldVisit>('field_visits', setFieldVisits);
    subscribeCollection<Appointment>('appointments', setAppointments);
    subscribeCollection<AppointmentPostponement>('appointment_postponements', setPostponements);
    subscribeCollection<FinancialAssessment>('financial_assessments', setAssessments);
    subscribeCollection<FinancialTransaction>('financial_transactions', setTransactions);
    subscribeCollection<NotificationItem>('notifications', setNotifications);
    subscribeCollection<AuditLog>('audit_logs', setAuditLogs);

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [authReady, firebaseUser, userProfile?.activeWorkspaceId, canAccessWorkScreens]);

  // Computed Permissions & Owner Session Verification Diagnostic
  const ownerSessionDiagnostic = useMemo(() => {
    void authSessionVersion;
    return inspectOwnerSessionDiagnostic(firebaseUser);
  }, [firebaseUser, authSessionVersion]);

  const isPlatformAdmin = useMemo(() => {
    void authSessionVersion;
    return verifyPlatformOwnerIdentity(firebaseUser).isVerifiedOwner;
  }, [firebaseUser, authSessionVersion]);

  // فحص ما إذا كان المستخدم الحالي ضمن مساعدي المنصة المفوضين
  useEffect(() => {
    if (!firebaseUser) {
      setPlatformStaffRecord(null);
      return;
    }
    if (isPlatformAdmin) {
      setPlatformStaffRecord(null);
      return;
    }
    let cancelled = false;
    const resolveStaff = async () => {
      try {
        const staffSnap = await getDoc(doc(db, 'platform_staff', firebaseUser.uid));
        if (!cancelled && staffSnap.exists()) {
          const d = staffSnap.data();
          setPlatformStaffRecord({
            id: staffSnap.id,
            uid: d.uid || staffSnap.id,
            email: (d.email || '').toLowerCase(),
            displayName: d.displayName || 'مساعد منصة',
            status: d.status === 'suspended' ? 'suspended' : 'active',
            permissions: {
              canViewRequests: Boolean(d.permissions?.canViewRequests),
              canApproveAndRenew: Boolean(d.permissions?.canApproveAndRenew),
              canManagePackages: Boolean(d.permissions?.canManagePackages),
            },
            assignedByUid: d.assignedByUid || '',
          });
          return;
        }
      } catch {
        // fallback to local list if /platform_staff rules are not yet deployed
      }
      if (!cancelled) {
        const matched =
          platformStaffList.find(
            (s) =>
              s.uid === firebaseUser.uid ||
              (firebaseUser.email && s.email === firebaseUser.email.trim().toLowerCase())
          ) || null;
        setPlatformStaffRecord(
          matched ? { ...matched, uid: firebaseUser.uid, id: firebaseUser.uid } : null
        );
      }
    };
    void resolveStaff();
    return () => {
      cancelled = true;
    };
  }, [firebaseUser, isPlatformAdmin, platformStaffList]);

  const canAccessPlatformAdmin = useMemo(() => {
    void authSessionVersion;
    if (isPlatformAdmin) return true;
    return authorizePlatformOperation({
      actorAuth: firebaseUser,
      actorStaffRecord: platformStaffRecord,
      operation: 'view_admin_dashboard',
    }).allowed;
  }, [firebaseUser, isPlatformAdmin, platformStaffRecord, authSessionVersion]);

  // جلب شامل لبيانات لوحة إدارة المنصة (الطلبات، العملاء والتراخيص، الباقات، والمساعدين) دون ترحيل جماعي
  const refreshPlatformAdminData = useCallback(async () => {
    if (!firebaseUser || !canAccessPlatformAdmin) {
      setReceivedRegistrationRequests([]);
      setPlatformClientAccounts([]);
      return;
    }

    const byWorkspaceReq = new Map<string, RegistrationRequestMetadata>();
    const licensesByWs = new Map<string, AccountLicense>();
    const usersByUid = new Map<string, UserProfile>();
    const workspacesById = new Map<string, Workspace>();

    // 1. محاولة جلب التراخيص من /account_licenses
    try {
      const licSnap = await getDocs(collection(db, 'account_licenses'));
      licSnap.docs.forEach((docSnap) => {
        const d = docSnap.data();
        const wsId = d.workspaceId || docSnap.id;
        const lic: AccountLicense = {
          id: docSnap.id,
          workspaceId: wsId,
          ownerId: d.ownerId,
          ownerEmail: d.ownerEmail,
          planId: d.planId,
          status: d.status,
          startsAt: d.startsAt,
          expiresAt: d.expiresAt,
          maxMembers: d.maxMembers,
          notes: d.notes || '',
          createdAt: d.createdAt,
          updatedAt: d.updatedAt,
        };
        licensesByWs.set(wsId, lic);
        const summary = buildRegistrationRequestSummary({
          license: lic,
          sourceOverride: 'account_licenses',
        });
        byWorkspaceReq.set(summary.workspaceId, summary);
      });
    } catch {
      // قد لا تكون /account_licenses منشورة بعد في قواعد الإنتاج الحالية
    }

    // دمج التراخيص المخزنة محليًا أثناء مرحلة ما قبل نشر القواعد
    try {
      const cachedLicsRaw = localStorage.getItem('rasd_platform_licenses_v1');
      if (cachedLicsRaw) {
        const cachedLics = JSON.parse(cachedLicsRaw) as Record<string, AccountLicense>;
        Object.entries(cachedLics).forEach(([wsId, lic]) => {
          if (!licensesByWs.has(wsId)) {
            licensesByWs.set(wsId, lic);
            const summary = buildRegistrationRequestSummary({
              license: lic,
              sourceOverride: 'local_cache',
            });
            byWorkspaceReq.set(wsId, summary);
          }
        });
      }
    } catch {
      // ignore storage errors
    }

    // 2. جلب المستخدمين من /users (مسموح لمالكي المنصة في قواعد الإنتاج الحالية)
    try {
      const usersSnap = await getDocs(collection(db, 'users'));
      usersSnap.docs.forEach((uDoc) => {
        const d = uDoc.data();
        const u: UserProfile = {
          id: uDoc.id,
          uid: d.uid || uDoc.id,
          displayName: d.displayName || 'مستخدم رصد',
          email: (d.email || '').toLowerCase(),
          phone: d.phone || '',
          jobTitle: d.jobTitle || '',
          activeWorkspaceId:
            d.activeWorkspaceId ||
            `ws_${String(d.uid || uDoc.id).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48)}`,
          createdAt: d.createdAt,
          updatedAt: d.updatedAt,
        };
        usersByUid.set(u.uid, u);

        if (u.jobTitle === PENDING_REGISTRATION_JOB_TITLE_MARKER && !byWorkspaceReq.has(u.activeWorkspaceId)) {
          let requestedAtIso = new Date().toISOString();
          if (d.createdAt && typeof d.createdAt.toDate === 'function') {
            requestedAtIso = d.createdAt.toDate().toISOString();
          }
          byWorkspaceReq.set(u.activeWorkspaceId, {
            applicantUid: u.uid,
            applicantName: u.displayName,
            applicantEmail: u.email,
            applicantPhone: u.phone,
            workspaceId: u.activeWorkspaceId,
            workspaceName: `مساحة عمل ${u.displayName}`,
            requestedPlanId: 'trial',
            status: 'pending',
            requestedAtIso,
            source: 'workspace_member_marker',
            notes: 'طلب تسجيل عميل جديد بانتظار موافقة إدارة المنصة.',
          });
        }
      });
    } catch {
      // في حال عدم توفر صلاحية قراءة جميع المستخدمين، نحاول استعلام الطلبات المعلقة فقط
      try {
        const pendingUsersQuery = query(
          collection(db, 'users'),
          where('jobTitle', '==', PENDING_REGISTRATION_JOB_TITLE_MARKER)
        );
        const pendingUsersSnap = await getDocs(pendingUsersQuery);
        pendingUsersSnap.docs.forEach((uDoc) => {
          const d = uDoc.data();
          const wsId =
            d.activeWorkspaceId ||
            `ws_${String(d.uid || uDoc.id).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48)}`;
          if (!byWorkspaceReq.has(wsId)) {
            let requestedAtIso = new Date().toISOString();
            if (d.createdAt && typeof d.createdAt.toDate === 'function') {
              requestedAtIso = d.createdAt.toDate().toISOString();
            }
            byWorkspaceReq.set(wsId, {
              applicantUid: d.uid || uDoc.id,
              applicantName: d.displayName || 'عميل جديد',
              applicantEmail: (d.email || '').toLowerCase(),
              applicantPhone: d.phone || '',
              workspaceId: wsId,
              workspaceName: `مساحة عمل ${d.displayName || 'عميل جديد'}`,
              requestedPlanId: 'trial',
              status: 'pending',
              requestedAtIso,
              source: 'workspace_member_marker',
              notes: 'طلب تسجيل عميل جديد بانتظار موافقة إدارة المنصة.',
            });
          }
        });
      } catch {
        // ignore if offline
      }
    }

    // 3. جلب مساحات العمل من /workspaces (مسموح لمالكي المنصة في قواعد الإنتاج الحالية)
    try {
      const wsSnap = await getDocs(collection(db, 'workspaces'));
      wsSnap.docs.forEach((wDoc) => {
        const d = wDoc.data();
        workspacesById.set(wDoc.id, {
          id: wDoc.id,
          name: d.name || 'مساحة عمل',
          ownerId: d.ownerId || '',
          ownerName: d.ownerName || 'مدير المساحة',
          defaultCurrency: d.defaultCurrency || 'YER',
          taxRatePercent: Number(d.taxRatePercent) || 0,
          regionName: d.regionName || 'عدن',
          inviteCode: d.inviteCode || '',
          memberUids: Array.isArray(d.memberUids) ? d.memberUids : [],
          memberCount: Number(d.memberCount) || 1,
        });
      });
    } catch {
      // ignore if offline
    }

    // 4. جلب الباقات من /subscription_packages (وتهيئتها في Firestore عند الحاجة للمالك الدائم)
    try {
      const pkgSnap = await getDocs(collection(db, 'subscription_packages'));
      if (!pkgSnap.empty) {
        setSubscriptionPackages((prev) => {
          const next = { ...prev };
          pkgSnap.docs.forEach((pDoc) => {
            const d = pDoc.data() as SubscriptionPackage;
            const pid = (d.id || pDoc.id) as SubscriptionPlanId;
            if (pid && pid !== 'owner_permanent' && pid in next) {
              next[pid] = {
                ...next[pid],
                ...d,
                id: pid,
              };
            }
          });
          next.owner_permanent = DEFAULT_SUBSCRIPTION_PACKAGES.owner_permanent;
          return next;
        });
      } else if (isPlatformAdmin) {
        // تهيئة الباقات الافتراضية القابلة للإدارة في مجموعة /subscription_packages في قاعدة البيانات الفعلية
        const editablePlans: SubscriptionPlanId[] = [
          'trial',
          'monthly',
          'quarterly',
          'semi_annual',
          'annual',
          'lifetime',
          'custom',
        ];
        await Promise.all(
          editablePlans.map(async (planId) => {
            const pkg = subscriptionPackages[planId] || DEFAULT_SUBSCRIPTION_PACKAGES[planId];
            if (!pkg) return;
            try {
              await setDoc(doc(db, 'subscription_packages', planId), {
                id: pkg.id,
                nameAr: pkg.nameAr,
                descriptionAr: pkg.descriptionAr,
                billingCycle: pkg.billingCycle,
                durationDays: pkg.durationDays,
                isLifetime: Boolean(pkg.isLifetime),
                isFreeOwnerPlan: Boolean(pkg.isFreeOwnerPlan),
                defaultMaxMembers: pkg.defaultMaxMembers,
                priceAmount: pkg.priceAmount,
                currency: pkg.currency,
                isActive: Boolean(pkg.isActive),
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
            } catch {
              // ignore individual package seed failure
            }
          })
        );
      }
    } catch {
      // ignore if offline
    }

    // 5. جلب مساعدي المنصة من /platform_staff (للمالكين الدائمين فقط)
    if (isPlatformAdmin) {
      try {
        const staffSnap = await getDocs(collection(db, 'platform_staff'));
        if (!staffSnap.empty) {
          const list: PlatformStaff[] = staffSnap.docs.map((sDoc) => {
            const d = sDoc.data();
            return {
              id: sDoc.id,
              uid: d.uid || sDoc.id,
              email: (d.email || '').toLowerCase(),
              displayName: d.displayName || 'مساعد منصة',
              status: d.status === 'suspended' ? 'suspended' : 'active',
              permissions: {
                canViewRequests: Boolean(d.permissions?.canViewRequests),
                canApproveAndRenew: Boolean(d.permissions?.canApproveAndRenew),
                canManagePackages: Boolean(d.permissions?.canManagePackages),
              },
              assignedByUid: d.assignedByUid || '',
            };
          });
          setPlatformStaffList(list);
          try {
            localStorage.setItem('rasd_platform_staff_v1', JSON.stringify(list));
          } catch {
            // ignore storage errors
          }
        }
      } catch {
        // ignore if offline
      }
    }

    // 5B. جلب سجلات التدقيق الإدارية من /audit_logs في Firestore ودمجها مع السجل المحلي
    try {
      const auditSnap = await getDocs(collection(db, 'audit_logs'));
      if (!auditSnap.empty) {
        const remoteAdminEntries: PlatformAdminAuditEntry[] = [];
        auditSnap.docs.forEach((aDoc) => {
          const d = aDoc.data();
          const summaryStr = typeof d.summary === 'string' ? d.summary : '';
          if (aDoc.id.startsWith('adm_log') || summaryStr.startsWith('[إدارة المنصة]')) {
            let createdAtIso = new Date().toISOString();
            if (d.createdAt && typeof d.createdAt.toDate === 'function') {
              createdAtIso = d.createdAt.toDate().toISOString();
            }
            const inferredOperation: PlatformAdminOperation = summaryStr.includes('طلب تسجيل')
              ? 'decide_registration_request'
              : summaryStr.includes('تجديد')
              ? 'renew_subscription'
              : summaryStr.includes('إيقاف') || summaryStr.includes('تعليق')
              ? 'suspend_subscription'
              : summaryStr.includes('إعادة تفعيل')
              ? 'reactivate_subscription'
              : summaryStr.includes('باقة') || summaryStr.includes('إعدادات')
              ? 'manage_packages'
              : summaryStr.includes('مساعد')
              ? 'manage_platform_staff'
              : 'activate_subscription';

            remoteAdminEntries.push({
              id: aDoc.id,
              operation: inferredOperation,
              actionType: d.actionType || 'update',
              entityType: d.entityType || 'workspace',
              entityId: d.entityId || '',
              targetWorkspaceId: d.entityId || d.workspaceId || '',
              summary: summaryStr,
              actorUid: d.actorId || '',
              actorEmail: '',
              actorName: d.actorName || 'مسؤول المنصة',
              actorRole: 'permanent_owner',
              createdAtIso,
              persistedToFirestore: true,
            });
          }
        });

        if (remoteAdminEntries.length > 0) {
          setPlatformAdminAuditLogs((prev) => {
            const byId = new Map<string, PlatformAdminAuditEntry>();
            prev.forEach((item) => byId.set(item.id, item));
            remoteAdminEntries.forEach((remoteItem) => {
              const existingLocal = byId.get(remoteItem.id);
              byId.set(remoteItem.id, {
                ...(existingLocal || remoteItem),
                persistedToFirestore: true,
              });
            });
            const merged = Array.from(byId.values())
              .sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso))
              .slice(0, 250);
            try {
              localStorage.setItem('rasd_platform_admin_audit_v1', JSON.stringify(merged));
            } catch {
              // ignore storage errors
            }
            return merged;
          });
        }
      }
    } catch {
      // ignore if offline
    }

    const sortedReqs = Array.from(byWorkspaceReq.values()).sort((a, b) =>
      b.requestedAtIso.localeCompare(a.requestedAtIso)
    );
    setReceivedRegistrationRequests(sortedReqs);

    // 6. تجميع قائمة العملاء وحالة تراخيصهم دون أي تعديل أو ترحيل على البيانات الحالية
    const allWsIds = new Set<string>([
      ...Array.from(workspacesById.keys()),
      ...Array.from(licensesByWs.keys()),
    ]);
    usersByUid.forEach((u) => {
      if (u.activeWorkspaceId && u.uid && u.activeWorkspaceId.includes(u.uid.slice(0, 12))) {
        allWsIds.add(u.activeWorkspaceId);
      }
    });

    const clientSummaries: PlatformClientAccountSummary[] = [];
    allWsIds.forEach((wsId) => {
      const ws = workspacesById.get(wsId) || null;
      const lic = licensesByWs.get(wsId) || null;
      const ownerUid = lic?.ownerId || ws?.ownerId || '';
      const ownerProfile = ownerUid ? usersByUid.get(ownerUid) || null : null;

      const summary = buildPlatformClientAccountSummary({
        workspace: ws,
        userProfile: ownerProfile,
        license: lic,
        packagesMap: subscriptionPackages,
      });
      if (summary.workspaceId) {
        clientSummaries.push(summary);
      }
    });

    // ضمان ظهور حسابَي المالكين الدائمين دائمًا في أعلى القائمة بصلاحياتهما الكاملة والمجانية مدى الحياة
    const permanentOwnersGuaranteed: { email: string; name: string; defaultWsId: string; uid: string }[] = [
      {
        email: 'am1075022@gmail.com',
        name: 'المالك الدائم الرئيسي للمنصة',
        defaultWsId: 'ws_owner_primary_am1075022',
        uid: 'owner_primary_am1075022',
      },
      {
        email: 'ahah26@gmail.com',
        name: 'المالك الدائم الثاني للمنصة',
        defaultWsId: 'ws_owner_backup_ahah26',
        uid: 'owner_backup_ahah26',
      },
    ];

    permanentOwnersGuaranteed.forEach((po) => {
      const alreadyPresent = clientSummaries.some(
        (c) =>
          c.ownerEmail === po.email ||
          (po.email === 'ahah26@gmail.com' && c.ownerEmail === 'ahah26h@gmail.com')
      );
      if (!alreadyPresent) {
        const permLic = buildPermanentOwnerLicense({
          workspaceId: po.defaultWsId,
          ownerId: po.uid,
          ownerEmail: po.email,
        });
        clientSummaries.unshift(
          buildPlatformClientAccountSummary({
            workspace: {
              id: po.defaultWsId,
              name: `مساحة ${po.name}`,
              ownerId: po.uid,
              ownerName: po.name,
              defaultCurrency: 'YER',
              regionName: 'عدن',
              memberCount: 1,
            },
            userProfile: {
              uid: po.uid,
              displayName: po.name,
              email: po.email,
              phone: '',
            },
            license: permLic,
            packagesMap: subscriptionPackages,
          })
        );
      }
    });

    clientSummaries.sort((a, b) => {
      if (a.isPermanentOwner !== b.isPermanentOwner) return a.isPermanentOwner ? -1 : 1;
      if (a.effectiveStatus === 'pending' && b.effectiveStatus !== 'pending') return -1;
      if (b.effectiveStatus === 'pending' && a.effectiveStatus !== 'pending') return 1;
      return a.workspaceName.localeCompare(b.workspaceName, 'ar');
    });

    setPlatformClientAccounts(clientSummaries);
  }, [firebaseUser, canAccessPlatformAdmin, isPlatformAdmin, subscriptionPackages]);

  const refreshReceivedRegistrationRequests = useCallback(async () => {
    await refreshPlatformAdminData();
  }, [refreshPlatformAdminData]);

  useEffect(() => {
    if (authReady && canAccessPlatformAdmin && canAccessWorkScreens) {
      void refreshPlatformAdminData();
    }
  }, [authReady, canAccessPlatformAdmin, canAccessWorkScreens, refreshPlatformAdminData]);

  const refreshRegistrationStatus = useCallback(async () => {
    if (!auth.currentUser) return;
    await auth.currentUser.reload();
    const refreshed = auth.currentUser;
    setFirebaseUser({ ...refreshed } as FirebaseUser);
    await ensureUserAndWorkspace(refreshed);
    showToast('تم فحص وتحديث حالة طلب التسجيل من الخادم.', 'info');
  }, [ensureUserAndWorkspace, showToast]);

  const isOwner = useMemo(() => {
    if (!firebaseUser) return false;
    if (isPlatformAdmin) return true;
    if (!workspace) return false;
    return workspace.ownerId === firebaseUser.uid;
  }, [firebaseUser, workspace, isPlatformAdmin]);

  const currentMemberRecord = useMemo(() => {
    if (!firebaseUser) return null;
    return members.find((m) => m.userId === firebaseUser.uid) || null;
  }, [members, firebaseUser]);

  const currentUserRole: WorkspaceRole = useMemo(() => {
    if (isOwner) return 'owner';
    return currentMemberRecord?.role || 'field_assistant';
  }, [isOwner, currentMemberRecord]);

  const canApproveFinancials = useMemo(() => {
    if (isOwner) return true;
    return Boolean(currentMemberRecord?.canApproveFinancials);
  }, [isOwner, currentMemberRecord]);

  const canDeleteRecords = useMemo(() => {
    if (isOwner) return true;
    return Boolean(currentMemberRecord?.canDeleteRecords);
  }, [isOwner, currentMemberRecord]);

  const pendingSyncCount = useMemo(() => {
    const all = [
      ...taxpayers,
      ...properties,
      ...propertyUnits,
      ...fieldVisits,
      ...appointments,
      ...assessments,
      ...transactions,
    ];
    return all.filter((item) => item.isPendingSync).length;
  }, [taxpayers, properties, propertyUnits, fieldVisits, appointments, assessments, transactions]);

  // Internal Audit Logger
  const writeAuditLog = useCallback(
    async (actionType: AuditActionType, entityType: AuditEntityType, entityId: string, summary: string) => {
      if (!firebaseUser || !workspace || !userProfile || !canAccessWorkScreens) return;
      const logId = generateSafeId('log');
      const path = `audit_logs/${logId}`;
      try {
        await setDoc(doc(db, 'audit_logs', logId), {
          workspaceId: workspace.id,
          ownerId: workspace.ownerId,
          actionType,
          entityType,
          entityId: sanitizeText(entityId, 128, 1, 'rec_1'),
          summary: sanitizeText(summary, 500, 2, 'عملية مسجلة'),
          actorId: firebaseUser.uid,
          actorName: sanitizeText(userProfile.displayName, 120, 1, 'مستخدم'),
          memberUids: workspace.memberUids,
          createdAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, path);
      }
    },
    [firebaseUser, workspace, userProfile, canAccessWorkScreens]
  );

  // سجل تدقيق خاص بالعمليات الإدارية على مستوى المنصة (يحفظ في /audit_logs وفي سجل التدقيق الإداري)
  const recordPlatformAdminAudit = useCallback(
    async (params: {
      operation: PlatformAdminOperation;
      actionType: AuditActionType;
      entityType: AuditEntityType;
      entityId: string;
      targetWorkspaceId: string;
      targetOwnerEmail?: string;
      summary: string;
      actorRole: 'permanent_owner' | 'platform_staff';
    }) => {
      if (!firebaseUser) return;
      const logId = generateSafeId('adm_log');
      const cleanEntityId = sanitizeText(
        params.entityId.replace(/[^a-zA-Z0-9_-]/g, '_'),
        120,
        1,
        'platform_entity'
      );
      const cleanSummary = sanitizeText(params.summary, 490, 2, '[إدارة المنصة] عملية إدارية');
      const actorName = sanitizeText(
        userProfile?.displayName || firebaseUser.displayName || firebaseUser.email || 'مسؤول المنصة',
        120,
        1,
        'مسؤول المنصة'
      );

      let persistedToFirestore = false;
      const fallbackAuditWsId =
        workspace?.id ||
        userProfile?.activeWorkspaceId ||
        `ws_${firebaseUser.uid.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48)}`;
      const fallbackAuditOwnerId = workspace?.ownerId || firebaseUser.uid;
      const fallbackAuditMemberUids =
        workspace && workspace.memberUids.includes(firebaseUser.uid)
          ? workspace.memberUids
          : [firebaseUser.uid];

      try {
        await setDoc(doc(db, 'audit_logs', logId), {
          workspaceId: fallbackAuditWsId,
          ownerId: fallbackAuditOwnerId,
          actionType: params.actionType,
          entityType: params.entityType,
          entityId: cleanEntityId,
          summary: cleanSummary,
          actorId: firebaseUser.uid,
          actorName,
          memberUids: fallbackAuditMemberUids,
          createdAt: serverTimestamp(),
        });
        persistedToFirestore = true;
      } catch {
        persistedToFirestore = false;
      }

      const newEntry: PlatformAdminAuditEntry = {
        id: logId,
        operation: params.operation,
        actionType: params.actionType,
        entityType: params.entityType,
        entityId: cleanEntityId,
        targetWorkspaceId: params.targetWorkspaceId,
        targetOwnerEmail: params.targetOwnerEmail,
        summary: cleanSummary,
        actorUid: firebaseUser.uid,
        actorEmail: (firebaseUser.email || '').toLowerCase(),
        actorName,
        actorRole: params.actorRole,
        createdAtIso: new Date().toISOString(),
        persistedToFirestore,
      };

      setPlatformAdminAuditLogs((prev) => {
        const next = [newEntry, ...prev].slice(0, 250);
        try {
          localStorage.setItem('rasd_platform_admin_audit_v1', JSON.stringify(next));
        } catch {
          // ignore storage errors
        }
        return next;
      });
    },
    [firebaseUser, userProfile, workspace]
  );

  const persistLicenseLocally = useCallback((lic: AccountLicense) => {
    try {
      const raw = localStorage.getItem('rasd_platform_licenses_v1');
      const map: Record<string, AccountLicense> = raw ? JSON.parse(raw) : {};
      map[lic.workspaceId] = lic;
      localStorage.setItem('rasd_platform_licenses_v1', JSON.stringify(map));
    } catch {
      // ignore storage errors
    }
  }, []);

  // 1. قبول أو رفض طلب تسجيل عميل جديد (حصري للمالكين الدائمين فقط)
  const decideRegistrationRequest = useCallback(
    async (params: {
      request: RegistrationRequestMetadata;
      decision: 'approve' | 'reject';
      approvedPlanId?: SubscriptionPlanId;
      customDurationDays?: number | null;
      maxMembers?: number;
      decisionNotes?: string;
    }) => {
      const authRes = assertPlatformOperationAuthorized({
        actorAuth: firebaseUser,
        actorStaffRecord: platformStaffRecord,
        operation: 'decide_registration_request',
        targetOwnerEmail: params.request.applicantEmail,
        targetCurrentStatus: 'pending',
      });

      const transition = buildRegistrationDecisionTransition({
        actorAuth: firebaseUser,
        actorStaffRecord: platformStaffRecord,
        request: params.request,
        decision: params.decision,
        approvedPlanId: params.approvedPlanId,
        customDurationDays: params.customDurationDays,
        maxMembers: params.maxMembers,
        decisionNotes: params.decisionNotes,
        packagesMap: subscriptionPackages,
      });

      // حفظ في التخزين المحلي التكميلي
      persistLicenseLocally(transition.updatedLicense);

      // حفظ وثيقة الترخيص في /account_licenses/{workspaceId} بما يتوافق مع قواعد create و update الصارمة
      try {
        const licRef = doc(db, 'account_licenses', transition.updatedLicense.workspaceId);
        const existingLicSnap = await getDoc(licRef);
        if (existingLicSnap.exists()) {
          await updateDoc(licRef, {
            planId: transition.updatedLicense.planId,
            status: transition.updatedLicense.status,
            startsAt: transition.updatedLicense.startsAt,
            expiresAt: transition.updatedLicense.expiresAt,
            maxMembers: transition.updatedLicense.maxMembers,
            notes: transition.updatedLicense.notes,
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(licRef, {
            workspaceId: transition.updatedLicense.workspaceId,
            ownerId: transition.updatedLicense.ownerId,
            ownerEmail: transition.updatedLicense.ownerEmail,
            planId: transition.updatedLicense.planId,
            status: transition.updatedLicense.status,
            startsAt: transition.updatedLicense.startsAt,
            expiresAt: transition.updatedLicense.expiresAt,
            maxMembers: transition.updatedLicense.maxMembers,
            notes: transition.updatedLicense.notes,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        console.warn('account_licenses update notice:', err);
      }

      // تحديث وثيقة المستخدم وعضوية مساحة العمل في Firestore
      if (params.request.applicantUid) {
        try {
          await updateDoc(doc(db, 'users', params.request.applicantUid), {
            jobTitle: transition.userProfilePatch.jobTitle,
            updatedAt: serverTimestamp(),
          });
        } catch {
          // ignore if user doc doesn't exist in Firestore yet
        }

        const ownerMemberDocId = `${params.request.workspaceId}_${params.request.applicantUid}`
          .replace(/[^a-zA-Z0-9_-]/g, '')
          .slice(0, 120);
        try {
          await updateDoc(doc(db, 'workspace_members', ownerMemberDocId), {
            status: transition.ownerMemberPatch.status,
            updatedAt: serverTimestamp(),
          });
        } catch {
          // ignore if member doc doesn't exist
        }
      }

      await recordPlatformAdminAudit({
        operation: 'decide_registration_request',
        actionType: params.decision === 'approve' ? 'approve' : 'update',
        entityType: 'workspace',
        entityId: params.request.workspaceId,
        targetWorkspaceId: params.request.workspaceId,
        targetOwnerEmail: params.request.applicantEmail,
        summary: transition.auditSummary,
        actorRole: authRes.actorRole === 'permanent_owner' ? 'permanent_owner' : 'platform_staff',
      });

      await refreshPlatformAdminData();
      showToast(
        params.decision === 'approve'
          ? `تمت الموافقة على طلب تسجيل (${params.request.applicantName}) وتفعيل الاشتراك بنجاح.`
          : `تم رفض طلب تسجيل (${params.request.applicantName}) وتوثيق العملية في سجل التدقيق.`,
        params.decision === 'approve' ? 'success' : 'warning'
      );
    },
    [
      firebaseUser,
      platformStaffRecord,
      subscriptionPackages,
      persistLicenseLocally,
      recordPlatformAdminAudit,
      refreshPlatformAdminData,
      showToast,
    ]
  );

  // 2. إجراءات تفعيل الاشتراك وتجديده وتعليقه وإعادة تفعيله
  const mutateClientSubscription = useCallback(
    async (params: {
      client: PlatformClientAccountSummary;
      action: 'activate' | 'renew' | 'suspend' | 'reactivate';
      planId?: SubscriptionPlanId;
      customDurationDays?: number | null;
      maxMembers?: number;
      notes?: string;
    }) => {
      const existingLicense: AccountLicense | null =
        params.client.source === 'account_licenses'
          ? {
              id: params.client.workspaceId,
              workspaceId: params.client.workspaceId,
              ownerId: params.client.ownerId,
              ownerEmail: params.client.ownerEmail,
              planId: params.client.planId,
              status: params.client.licenseStatus,
              startsAt: params.client.startsAtIso,
              expiresAt: params.client.expiresAtIso,
              maxMembers: params.client.maxMembers,
              notes: params.client.notes,
            }
          : null;

      const mutation = buildClientSubscriptionMutation({
        actorAuth: firebaseUser,
        actorStaffRecord: platformStaffRecord,
        action: params.action,
        workspaceId: params.client.workspaceId,
        ownerId: params.client.ownerId,
        ownerEmail: params.client.ownerEmail,
        ownerName: params.client.ownerName,
        existingLicense,
        planId: params.planId,
        customDurationDays: params.customDurationDays,
        maxMembers: params.maxMembers,
        notes: params.notes,
        packagesMap: subscriptionPackages,
      });

      persistLicenseLocally(mutation.updatedLicense);

      try {
        const licRef = doc(db, 'account_licenses', mutation.updatedLicense.workspaceId);
        const existingLicSnap = await getDoc(licRef);
        if (existingLicSnap.exists()) {
          await updateDoc(licRef, {
            planId: mutation.updatedLicense.planId,
            status: mutation.updatedLicense.status,
            startsAt: mutation.updatedLicense.startsAt,
            expiresAt: mutation.updatedLicense.expiresAt,
            maxMembers: mutation.updatedLicense.maxMembers,
            notes: mutation.updatedLicense.notes,
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(licRef, {
            workspaceId: mutation.updatedLicense.workspaceId,
            ownerId: mutation.updatedLicense.ownerId,
            ownerEmail: mutation.updatedLicense.ownerEmail,
            planId: mutation.updatedLicense.planId,
            status: mutation.updatedLicense.status,
            startsAt: mutation.updatedLicense.startsAt,
            expiresAt: mutation.updatedLicense.expiresAt,
            maxMembers: mutation.updatedLicense.maxMembers,
            notes: mutation.updatedLicense.notes,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        console.warn('mutateClientSubscription Firestore notice:', err);
      }

      if (params.client.ownerId && !params.client.isPermanentOwner) {
        const ownerMemberDocId = `${params.client.workspaceId}_${params.client.ownerId}`
          .replace(/[^a-zA-Z0-9_-]/g, '')
          .slice(0, 120);
        try {
          await updateDoc(doc(db, 'workspace_members', ownerMemberDocId), {
            status: mutation.ownerMemberStatusPatch,
            updatedAt: serverTimestamp(),
          });
        } catch {
          // ignore if member doc not accessible
        }
      }

      const opMap: Record<typeof params.action, PlatformAdminOperation> = {
        activate: 'activate_subscription',
        renew: 'renew_subscription',
        suspend: 'suspend_subscription',
        reactivate: 'reactivate_subscription',
      };

      await recordPlatformAdminAudit({
        operation: opMap[params.action],
        actionType: params.action === 'activate' || params.action === 'reactivate' ? 'approve' : 'update',
        entityType: 'workspace',
        entityId: params.client.workspaceId,
        targetWorkspaceId: params.client.workspaceId,
        targetOwnerEmail: params.client.ownerEmail,
        summary: mutation.auditSummary,
        actorRole: isPlatformAdmin ? 'permanent_owner' : 'platform_staff',
      });

      await refreshPlatformAdminData();
      showToast(mutation.auditSummary.replace('[إدارة المنصة] ', ''), 'success');
    },
    [
      firebaseUser,
      platformStaffRecord,
      subscriptionPackages,
      persistLicenseLocally,
      recordPlatformAdminAudit,
      isPlatformAdmin,
      refreshPlatformAdminData,
      showToast,
    ]
  );

  // 3. إدارة الباقات ومددها وحدود أعضاء الفريق
  const updateSubscriptionPackageConfig = useCallback(
    async (
      planId: SubscriptionPlanId,
      patch: {
        nameAr?: string;
        descriptionAr?: string;
        durationDays?: number | null;
        defaultMaxMembers?: number;
        priceAmount?: number;
        currency?: CurrencyCode;
        isActive?: boolean;
      }
    ) => {
      const { updatedPackage, auditSummary } = validateAndBuildSubscriptionPackageUpdate({
        actorAuth: firebaseUser,
        actorStaffRecord: platformStaffRecord,
        planId,
        existingPackage: subscriptionPackages[planId],
        patch,
      });

      setSubscriptionPackages((prev) => {
        const next = {
          ...prev,
          [planId]: updatedPackage,
          owner_permanent: DEFAULT_SUBSCRIPTION_PACKAGES.owner_permanent,
        };
        try {
          localStorage.setItem('rasd_subscription_packages_v1', JSON.stringify(next));
        } catch {
          // ignore storage errors
        }
        return next;
      });

      try {
        await setDoc(doc(db, 'subscription_packages', planId), {
          id: updatedPackage.id,
          nameAr: updatedPackage.nameAr,
          descriptionAr: updatedPackage.descriptionAr,
          billingCycle: updatedPackage.billingCycle,
          durationDays: updatedPackage.durationDays,
          isLifetime: Boolean(updatedPackage.isLifetime),
          isFreeOwnerPlan: Boolean(updatedPackage.isFreeOwnerPlan),
          defaultMaxMembers: updatedPackage.defaultMaxMembers,
          priceAmount: updatedPackage.priceAmount,
          currency: updatedPackage.currency,
          isActive: Boolean(updatedPackage.isActive),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        console.warn('subscription_packages update notice:', err);
      }

      await recordPlatformAdminAudit({
        operation: 'manage_packages',
        actionType: 'update',
        entityType: 'workspace',
        entityId: `pkg_${planId}`,
        targetWorkspaceId: workspace?.id || 'platform_packages',
        summary: auditSummary,
        actorRole: isPlatformAdmin ? 'permanent_owner' : 'platform_staff',
      });

      showToast(`تم حفظ إعدادات (${updatedPackage.nameAr}) بنجاح.`, 'success');
    },
    [
      firebaseUser,
      platformStaffRecord,
      subscriptionPackages,
      recordPlatformAdminAudit,
      workspace?.id,
      isPlatformAdmin,
      showToast,
    ]
  );

  // 4. إدارة مساعدي المنصة وصلاحياتهم (حصري للمالكين الدائمين فقط)
  const upsertPlatformStaffMember = useCallback(
    async (params: {
      staffUid: string;
      email: string;
      displayName: string;
      status: 'active' | 'suspended';
      permissions: PlatformStaffPermissions;
    }) => {
      const { staffRecord, auditSummary } = validateAndBuildPlatformStaffRecord({
        actorAuth: firebaseUser,
        actorStaffRecord: platformStaffRecord,
        staffUid: params.staffUid,
        email: params.email,
        displayName: params.displayName,
        status: params.status,
        permissions: params.permissions,
      });

      setPlatformStaffList((prev) => {
        const filtered = prev.filter(
          (item) => item.uid !== staffRecord.uid && item.email !== staffRecord.email
        );
        const next = [staffRecord, ...filtered];
        try {
          localStorage.setItem('rasd_platform_staff_v1', JSON.stringify(next));
        } catch {
          // ignore storage errors
        }
        return next;
      });

      try {
        const staffRef = doc(db, 'platform_staff', staffRecord.uid);
        const existingStaffSnap = await getDoc(staffRef);
        if (existingStaffSnap.exists()) {
          await updateDoc(staffRef, {
            email: staffRecord.email,
            displayName: staffRecord.displayName,
            status: staffRecord.status,
            permissions: staffRecord.permissions,
            assignedByUid: staffRecord.assignedByUid,
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(staffRef, {
            uid: staffRecord.uid,
            email: staffRecord.email,
            displayName: staffRecord.displayName,
            status: staffRecord.status,
            permissions: staffRecord.permissions,
            assignedByUid: staffRecord.assignedByUid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        console.warn('platform_staff update notice:', err);
      }

      await recordPlatformAdminAudit({
        operation: 'manage_platform_staff',
        actionType: 'team_change',
        entityType: 'member',
        entityId: staffRecord.uid,
        targetWorkspaceId: workspace?.id || 'platform_staff',
        targetOwnerEmail: staffRecord.email,
        summary: auditSummary,
        actorRole: 'permanent_owner',
      });

      showToast(`تم حفظ بيانات وصلاحيات المساعد (${staffRecord.displayName}) بنجاح.`, 'success');
    },
    [firebaseUser, platformStaffRecord, recordPlatformAdminAudit, workspace?.id, showToast]
  );

  const removePlatformStaffMember = useCallback(
    async (staffUid: string) => {
      assertPlatformOperationAuthorized({
        actorAuth: firebaseUser,
        actorStaffRecord: platformStaffRecord,
        operation: 'manage_platform_staff',
      });

      const target = platformStaffList.find((s) => s.uid === staffUid);
      setPlatformStaffList((prev) => {
        const next = prev.filter((s) => s.uid !== staffUid);
        try {
          localStorage.setItem('rasd_platform_staff_v1', JSON.stringify(next));
        } catch {
          // ignore storage errors
        }
        return next;
      });

      try {
        await deleteDoc(doc(db, 'platform_staff', staffUid));
      } catch (err) {
        console.warn('platform_staff delete notice:', err);
      }

      await recordPlatformAdminAudit({
        operation: 'manage_platform_staff',
        actionType: 'delete',
        entityType: 'member',
        entityId: staffUid,
        targetWorkspaceId: workspace?.id || 'platform_staff',
        targetOwnerEmail: target?.email,
        summary: `[إدارة المنصة] إزالة مساعد المنصة (${target?.displayName || staffUid}) وإلغاء تفويضه`,
        actorRole: 'permanent_owner',
      });

      showToast('تم إزالة مساعد المنصة وإلغاء تفويضه بنجاح.', 'info');
    },
    [firebaseUser, platformStaffRecord, platformStaffList, recordPlatformAdminAudit, workspace?.id, showToast]
  );

  // Auth Handlers
  const loginWithGoogle = useCallback(async () => {
    try {
      const res = await signInWithPopup(auth, googleProvider);
      if (res.user) {
        setFirebaseUser(res.user);
        applyOptimisticSession(res.user);
        setAuthReady(true);
        setActiveScreen('home');
        await ensureUserAndWorkspace(res.user).catch((err) => {
          console.error('Background workspace sync error:', err);
        });
        showToast(
          `تم تسجيل الدخول بنجاح — مرحبًا بك ${res.user.displayName || res.user.email || ''}`,
          'success'
        );
      }
    } catch (error) {
      showToast(translateFirebaseError(error), 'error');
      throw error;
    }
  }, [applyOptimisticSession, ensureUserAndWorkspace, showToast]);

  const loginWithEmail = useCallback(
    async (email: string, pass: string) => {
      try {
        const res = await signInWithEmailAndPassword(auth, email.trim(), pass);
        if (res.user) {
          setFirebaseUser(res.user);
          applyOptimisticSession(res.user);
          setAuthReady(true);
          setActiveScreen('home');
          await ensureUserAndWorkspace(res.user).catch((err) => {
            console.error('Background workspace sync error:', err);
          });
          showToast('تم تسجيل الدخول بنجاح', 'success');
        }
      } catch (error) {
        showToast(translateFirebaseError(error), 'error');
        throw error;
      }
    },
    [applyOptimisticSession, ensureUserAndWorkspace, showToast]
  );

  const registerWithEmail = useCallback(
    async (name: string, email: string, pass: string) => {
      try {
        const cleanName = name.trim();
        const res = await createUserWithEmailAndPassword(auth, email.trim(), pass);
        if (res.user) {
          await updateProfile(res.user, { displayName: cleanName });
          setFirebaseUser(res.user);
          applyOptimisticSession(res.user, cleanName);
          setAuthReady(true);
          setActiveScreen('home');
          await ensureUserAndWorkspace(res.user, cleanName, {
            isExplicitRegistration: true,
          }).catch((err) => {
            console.error('Background workspace sync error:', err);
          });
          if (verifyPlatformOwnerIdentity(res.user).isVerifiedOwner) {
            showToast('تم إنشاء وتفعيل حساب مالك المنصة الدائم بنجاح', 'success');
          } else if (isPermanentPlatformOwnerEmail(res.user.email)) {
            showToast(
              'تم إنشاء الحساب ببريد مالك المنصة — يرجى توثيق البريد الإلكتروني أو تسجيل الدخول عبر Google لتفعيل صلاحيات الإدارة.',
              'warning'
            );
          } else {
            showToast(
              'تم استلام طلب تسجيل حسابك بنجاح — حسابك الآن بانتظار موافقة إدارة المنصة.',
              'info'
            );
          }
        }
      } catch (error) {
        showToast(translateFirebaseError(error), 'error');
        throw error;
      }
    },
    [applyOptimisticSession, ensureUserAndWorkspace, showToast]
  );

  const resetPassword = useCallback(
    async (email: string) => {
      try {
        await sendPasswordResetEmail(auth, email.trim());
        showToast('تم إرسال رابط استعادة كلمة المرور إلى بريدك الإلكتروني.', 'success');
      } catch (error) {
        showToast(translateFirebaseError(error), 'error');
        throw error;
      }
    },
    [showToast]
  );

  const resendVerificationEmail = useCallback(async () => {
    if (!auth.currentUser) return;
    try {
      await sendEmailVerification(auth.currentUser);
      showToast('تم إرسال رابط توثيق البريد الإلكتروني إلى صندوق الوارد بنجاح.', 'success');
    } catch (error) {
      showToast(translateFirebaseError(error), 'error');
    }
  }, [showToast]);

  const refreshAuthUser = useCallback(async () => {
    if (!auth.currentUser) return;
    await auth.currentUser.reload();
    if (typeof auth.currentUser.getIdToken === 'function') {
      await auth.currentUser.getIdToken(true);
    }
    const refreshed = auth.currentUser;
    setFirebaseUser(refreshed);
    setAuthSessionVersion((v) => v + 1);
    await ensureUserAndWorkspace(refreshed);
    if (verifyPlatformOwnerIdentity(refreshed).isVerifiedOwner) {
      showToast('تم التحقق من توثيق بريد المالك وتفعيل صلاحيات إدارة المنصة بنجاح!', 'success');
    } else {
      showToast('تم تحديث بيانات الجلسة وحالة توثيق البريد بنجاح.', 'info');
    }
  }, [ensureUserAndWorkspace, showToast]);

  const logout = useCallback(async () => {
    clearAllUserState();
    await firebaseSignOut(auth);
    showToast('تم تسجيل الخروج بأمان ومسح الجلسة المحلية.', 'info');
  }, [clearAllUserState, showToast]);

  // Profile & Workspace Mutations
  const updateUserProfileInfo = useCallback(
    async (displayName: string, phone: string, jobTitle: string) => {
      if (!firebaseUser || !userProfile) return;
      const path = `users/${firebaseUser.uid}`;
      try {
        await updateDoc(doc(db, 'users', firebaseUser.uid), {
          displayName: sanitizeText(displayName, 120, 1, userProfile.displayName),
          phone: sanitizeText(phone, 40),
          jobTitle: sanitizeText(jobTitle, 100),
          activeWorkspaceId: userProfile.activeWorkspaceId,
          updatedAt: serverTimestamp(),
        });
        showToast('تم تحديث الملف الشخصي بنجاح', 'success');
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    },
    [firebaseUser, userProfile, showToast]
  );

  const updateWorkspaceSettings = useCallback(
    async (name: string, defaultCurrency: CurrencyCode, taxRatePercent: number, regionName: string) => {
      if (!firebaseUser || !workspace || (!isOwner && !isPlatformAdmin)) {
        showToast('فقط المدير الأساسي أو مالك مساحة العمل يمكنه تعديل إعدادات مساحة العمل.', 'error');
        return;
      }
      const path = `workspaces/${workspace.id}`;
      try {
        const cleanRate = Math.max(0, Math.min(100, Number(taxRatePercent) || 0));
        await updateDoc(doc(db, 'workspaces', workspace.id), {
          name: sanitizeText(name, 120, 1, workspace.name),
          ownerName: workspace.ownerName,
          defaultCurrency,
          taxRatePercent: cleanRate,
          regionName: sanitizeText(regionName, 120),
          inviteCode: workspace.inviteCode,
          memberUids: workspace.memberUids,
          memberCount: workspace.memberUids.length,
          updatedAt: serverTimestamp(),
        });
        await writeAuditLog('update', 'workspace', workspace.id, `تحديث إعدادات مساحة العمل (${name})`);
        showToast('تم حفظ إعدادات مساحة العمل', 'success');
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    },
    [firebaseUser, workspace, isOwner, isPlatformAdmin, writeAuditLog, showToast]
  );

  // Taxpayer Mutations
  const addTaxpayer = useCallback(
    async (
      input: Omit<
        Taxpayer,
        'id' | 'workspaceId' | 'ownerId' | 'memberUids' | 'createdBy' | 'createdByName' | 'createdAt' | 'updatedAt'
      >
    ): Promise<string> => {
      if (!firebaseUser || !workspace || !userProfile) throw new Error('غير مصرح');
      const id = generateSafeId('tp');
      const path = `taxpayers/${id}`;
      try {
        await setDoc(doc(db, 'taxpayers', id), {
          workspaceId: workspace.id,
          ownerId: workspace.ownerId,
          fullName: sanitizeText(input.fullName, 150, 2, 'مكلف جديد'),
          internalCode: sanitizeText(input.internalCode, 64, 1, `TP-${Date.now().toString().slice(-4)}`),
          nationalOrCommercialId: sanitizeText(input.nationalOrCommercialId, 64),
          phone: sanitizeText(input.phone, 40),
          email: sanitizeText(input.email, 200),
          address: sanitizeText(input.address, 300),
          region: sanitizeText(input.region, 120),
          status: input.status,
          notes: sanitizeText(input.notes, 1000),
          memberUids: workspace.memberUids,
          createdBy: firebaseUser.uid,
          createdByName: sanitizeText(userProfile.displayName, 120, 1, 'مستخدم'),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        await writeAuditLog('create', 'taxpayer', id, `إضافة المكلف: ${input.fullName}`);
        showToast(isOnline ? 'تمت إضافة المكلف وحفظه' : 'تم حفظ المكلف محليًا، وستتم المزامنة فور عودة الاتصال', 'success');
        return id;
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, path);
      }
    },
    [firebaseUser, workspace, userProfile, writeAuditLog, showToast, isOnline]
  );

  const updateTaxpayer = useCallback(
    async (id: string, input: Partial<Taxpayer>) => {
      if (!firebaseUser || !workspace) return;
      const existing = taxpayers.find((t) => t.id === id);
      if (!existing) return;
      const path = `taxpayers/${id}`;
      try {
        await updateDoc(doc(db, 'taxpayers', id), {
          fullName: sanitizeText(input.fullName ?? existing.fullName, 150, 2, existing.fullName),
          internalCode: sanitizeText(input.internalCode ?? existing.internalCode, 64, 1, existing.internalCode),
          nationalOrCommercialId: sanitizeText(input.nationalOrCommercialId ?? existing.nationalOrCommercialId, 64),
          phone: sanitizeText(input.phone ?? existing.phone, 40),
          email: sanitizeText(input.email ?? existing.email, 200),
          address: sanitizeText(input.address ?? existing.address, 300),
          region: sanitizeText(input.region ?? existing.region, 120),
          status: input.status ?? existing.status,
          notes: sanitizeText(input.notes ?? existing.notes, 1000),
          memberUids: workspace.memberUids,
          updatedAt: serverTimestamp(),
        });
        await writeAuditLog('update', 'taxpayer', id, `تعديل بيانات المكلف: ${input.fullName ?? existing.fullName}`);
        showToast('تم تحديث بيانات المكلف', 'success');
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    },
    [firebaseUser, workspace, taxpayers, writeAuditLog, showToast]
  );

  const deleteTaxpayer = useCallback(
    async (id: string) => {
      if (!isOwner) {
        showToast('فقط مالك مساحة العمل يملك صلاحية حذف السجلات.', 'error');
        return;
      }
      const linkedProps = properties.filter((p) => p.taxpayerId === id);
      if (linkedProps.length > 0) {
        showToast(`لا يمكن حذف المكلف لوجود ${linkedProps.length} عقارات مرتبطة به. يرجى معالجة العقارات أولًا.`, 'error');
        return;
      }
      const target = taxpayers.find((t) => t.id === id);
      const path = `taxpayers/${id}`;
      try {
        await deleteDoc(doc(db, 'taxpayers', id));
        await writeAuditLog('delete', 'taxpayer', id, `حذف المكلف: ${target?.fullName || id}`);
        showToast('تم حذف سجل المكلف', 'info');
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, path);
      }
    },
    [isOwner, properties, taxpayers, writeAuditLog, showToast]
  );

  // Property Mutations
  const addProperty = useCallback(
    async (
      input: Omit<
        Property,
        'id' | 'workspaceId' | 'ownerId' | 'memberUids' | 'createdBy' | 'createdByName' | 'createdAt' | 'updatedAt'
      >
    ): Promise<string> => {
      if (!firebaseUser || !workspace || !userProfile) throw new Error('غير مصرح');
      const id = generateSafeId('prop');
      const path = `properties/${id}`;
      try {
        await setDoc(doc(db, 'properties', id), {
          workspaceId: workspace.id,
          ownerId: workspace.ownerId,
          taxpayerId: input.taxpayerId,
          taxpayerName: sanitizeText(input.taxpayerName, 150, 1, 'مكلف'),
          title: sanitizeText(input.title, 150, 2, 'عقار جديد'),
          code: sanitizeText(input.code, 64, 1, `PR-${Date.now().toString().slice(-4)}`),
          propertyType: input.propertyType,
          status: input.status,
          region: sanitizeText(input.region, 120, 1, 'غير محدد'),
          address: sanitizeText(input.address, 300, 1, 'عنوان غير محدد'),
          latitude: Math.max(-90, Math.min(90, Number(input.latitude) || 0)),
          longitude: Math.max(-180, Math.min(180, Number(input.longitude) || 0)),
          hasCoordinates: Boolean(input.hasCoordinates),
          unitsCount: Math.max(0, Math.min(10000, Math.round(Number(input.unitsCount) || 0))),
          areaSqm: Math.max(0, Math.min(10000000, Number(input.areaSqm) || 0)),
          notes: sanitizeText(input.notes, 1000),
          memberUids: workspace.memberUids,
          createdBy: firebaseUser.uid,
          createdByName: sanitizeText(userProfile.displayName, 120, 1, 'مستخدم'),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        await writeAuditLog('create', 'property', id, `إضافة عقار: ${input.title}`);
        showToast(isOnline ? 'تم حفظ العقار بنجاح' : 'تم حفظ العقار محليًا بانتظار المزامنة', 'success');
        return id;
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, path);
      }
    },
    [firebaseUser, workspace, userProfile, writeAuditLog, showToast, isOnline]
  );

  const updateProperty = useCallback(
    async (id: string, input: Partial<Property>) => {
      if (!firebaseUser || !workspace) return;
      const existing = properties.find((p) => p.id === id);
      if (!existing) return;
      const path = `properties/${id}`;
      try {
        await updateDoc(doc(db, 'properties', id), {
          taxpayerId: input.taxpayerId ?? existing.taxpayerId,
          taxpayerName: sanitizeText(input.taxpayerName ?? existing.taxpayerName, 150, 1, existing.taxpayerName),
          title: sanitizeText(input.title ?? existing.title, 150, 2, existing.title),
          code: sanitizeText(input.code ?? existing.code, 64, 1, existing.code),
          propertyType: input.propertyType ?? existing.propertyType,
          status: input.status ?? existing.status,
          region: sanitizeText(input.region ?? existing.region, 120, 1, existing.region),
          address: sanitizeText(input.address ?? existing.address, 300, 1, existing.address),
          latitude: Math.max(-90, Math.min(90, Number(input.latitude ?? existing.latitude) || 0)),
          longitude: Math.max(-180, Math.min(180, Number(input.longitude ?? existing.longitude) || 0)),
          hasCoordinates: input.hasCoordinates ?? existing.hasCoordinates,
          unitsCount: Math.max(0, Math.min(10000, Math.round(Number(input.unitsCount ?? existing.unitsCount) || 0))),
          areaSqm: Math.max(0, Math.min(10000000, Number(input.areaSqm ?? existing.areaSqm) || 0)),
          notes: sanitizeText(input.notes ?? existing.notes, 1000),
          memberUids: workspace.memberUids,
          updatedAt: serverTimestamp(),
        });
        await writeAuditLog('update', 'property', id, `تحديث بيانات العقار: ${input.title ?? existing.title}`);
        showToast('تم تحديث العقار بنجاح', 'success');
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    },
    [firebaseUser, workspace, properties, writeAuditLog, showToast]
  );

  const deleteProperty = useCallback(
    async (id: string) => {
      if (!isOwner) {
        showToast('فقط مالك مساحة العمل يملك صلاحية حذف العقار.', 'error');
        return;
      }
      const linkedUnits = propertyUnits.filter((u) => u.propertyId === id);
      const linkedVisits = fieldVisits.filter((v) => v.propertyId === id);
      const linkedAssessments = assessments.filter((a) => a.propertyId === id);
      const linkedTx = transactions.filter((t) => t.propertyId === id);

      if (linkedUnits.length > 0 || linkedVisits.length > 0 || linkedAssessments.length > 0 || linkedTx.length > 0) {
        showToast(
          `لا يمكن حذف العقار لارتباطه بـ (${linkedUnits.length} وحدة، ${linkedVisits.length} زيارة، ${linkedAssessments.length} تقييم، ${linkedTx.length} معاملة).`,
          'error'
        );
        return;
      }

      const target = properties.find((p) => p.id === id);
      const path = `properties/${id}`;
      try {
        await deleteDoc(doc(db, 'properties', id));
        await writeAuditLog('delete', 'property', id, `حذف العقار: ${target?.title || id}`);
        if (selectedPropertyId === id) setSelectedPropertyId(null);
        showToast('تم حذف العقار بنجاح', 'info');
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, path);
      }
    },
    [
      isOwner,
      propertyUnits,
      fieldVisits,
      assessments,
      transactions,
      properties,
      selectedPropertyId,
      writeAuditLog,
      showToast,
    ]
  );

  // Property Unit Mutations
  const addPropertyUnit = useCallback(
    async (
      input: Omit<
        PropertyUnit,
        'id' | 'workspaceId' | 'ownerId' | 'memberUids' | 'createdBy' | 'createdAt' | 'updatedAt'
      >
    ): Promise<string> => {
      if (!firebaseUser || !workspace) throw new Error('غير مصرح');
      const id = generateSafeId('unit');
      const path = `property_units/${id}`;
      try {
        const unitRef = doc(db, 'property_units', id);
        await setDoc(unitRef, {
          workspaceId: workspace.id,
          ownerId: workspace.ownerId,
          propertyId: sanitizeText(input.propertyId, 128, 1, 'general_prop'),
          propertyTitle: sanitizeText(input.propertyTitle, 150, 1, 'عقار'),
          taxpayerId: sanitizeText(input.taxpayerId, 128, 1, 'general_tp'),
          unitNumber: sanitizeText(input.unitNumber, 50, 1, '1'),
          unitType: input.unitType,
          floor: sanitizeText(input.floor, 40),
          areaSqm: Math.max(0, Math.min(1000000, Number(input.areaSqm) || 0)),
          occupancyStatus: input.occupancyStatus,
          tenantName: sanitizeText(input.tenantName, 150),
          annualRentEstimate: Math.max(0, Number(input.annualRentEstimate) || 0),
          notes: sanitizeText(input.notes, 500),
          memberUids: workspace.memberUids,
          createdBy: firebaseUser.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        const verifySnap = await getDoc(unitRef);
        if (!verifySnap.exists()) {
          throw new Error('تعذر التحقق من حفظ الوحدة العقارية في قاعدة البيانات.');
        }

        const prop = properties.find((p) => p.id === input.propertyId);
        if (prop) {
          await updateProperty(prop.id, { unitsCount: (prop.unitsCount || 0) + 1 });
        }
        await writeAuditLog('create', 'unit', id, `إضافة وحدة (${input.unitNumber}) للعقار: ${input.propertyTitle}`);
        showToast('تمت إضافة الوحدة العقارية بنجاح', 'success');
        return id;
      } catch (error) {
        showToast(translateFirebaseError(error), 'error');
        handleFirestoreError(error, OperationType.CREATE, path);
      }
    },
    [firebaseUser, workspace, properties, updateProperty, writeAuditLog, showToast]
  );

  const updatePropertyUnit = useCallback(
    async (id: string, input: Partial<PropertyUnit>) => {
      if (!firebaseUser || !workspace) return;
      const existing = propertyUnits.find((u) => u.id === id);
      if (!existing) return;
      const path = `property_units/${id}`;
      try {
        await updateDoc(doc(db, 'property_units', id), {
          propertyTitle: sanitizeText(input.propertyTitle ?? existing.propertyTitle, 150, 1, existing.propertyTitle),
          unitNumber: sanitizeText(input.unitNumber ?? existing.unitNumber, 50, 1, existing.unitNumber),
          unitType: input.unitType ?? existing.unitType,
          floor: sanitizeText(input.floor ?? existing.floor, 40),
          areaSqm: Math.max(0, Math.min(1000000, Number(input.areaSqm ?? existing.areaSqm) || 0)),
          occupancyStatus: input.occupancyStatus ?? existing.occupancyStatus,
          tenantName: sanitizeText(input.tenantName ?? existing.tenantName, 150),
          annualRentEstimate: Math.max(0, Number(input.annualRentEstimate ?? existing.annualRentEstimate) || 0),
          notes: sanitizeText(input.notes ?? existing.notes, 500),
          memberUids: workspace.memberUids,
          updatedAt: serverTimestamp(),
        });
        await writeAuditLog(
          'update',
          'unit',
          id,
          `تحديث الوحدة العقارية (${input.unitNumber ?? existing.unitNumber}) — النوع: ${input.unitType ?? existing.unitType}`
        );
        showToast('تم تحديث بيانات الوحدة العقارية', 'success');
      } catch (error) {
        showToast(translateFirebaseError(error), 'error');
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    },
    [firebaseUser, workspace, propertyUnits, writeAuditLog, showToast]
  );

  const deletePropertyUnit = useCallback(
    async (unit: PropertyUnit) => {
      if (!isOwner) {
        showToast('فقط مالك مساحة العمل يمكنه حذف الوحدات العقارية.', 'error');
        return;
      }
      const path = `property_units/${unit.id}`;
      try {
        await deleteDoc(doc(db, 'property_units', unit.id));
        const prop = properties.find((p) => p.id === unit.propertyId);
        if (prop && prop.unitsCount > 0) {
          await updateProperty(prop.id, { unitsCount: Math.max(0, prop.unitsCount - 1) });
        }
        await writeAuditLog('delete', 'unit', unit.id, `حذف وحدة (${unit.unitNumber}) من العقار: ${unit.propertyTitle}`);
        showToast('تم حذف الوحدة العقارية', 'info');
      } catch (error) {
        showToast(translateFirebaseError(error), 'error');
        handleFirestoreError(error, OperationType.DELETE, path);
      }
    },
    [isOwner, properties, updateProperty, writeAuditLog, showToast]
  );

  const executeCompoundVoiceCreation = useCallback(
    async (input: {
      existingTaxpayerId?: string;
      taxpayerName: string;
      taxpayerPhone?: string;
      address: string;
      region: string;
      propertyTitle: string;
      propertyType: Property['propertyType'];
      floorsCount: number;
      apartmentsCount: number;
      shopsCount: number;
      officesCount: number;
      agentName?: string;
      agentPhone?: string;
      notes?: string;
      amount?: number;
      currency?: string;
    }) => {
      if (!firebaseUser || !workspace || !userProfile) {
        throw new Error('غير مصرح بتنفيذ العملية بدون جلسة نشطة');
      }

      let taxpayerId = input.existingTaxpayerId || '';
      let taxpayerCode = '';
      let createdNewTaxpayer = false;
      let createdPropertyId = '';

      const agentMetaParts: string[] = [];
      if (input.agentName?.trim()) agentMetaParts.push(`الوكيل: ${input.agentName.trim()}`);
      if (input.agentPhone?.trim()) agentMetaParts.push(`هاتف الوكيل: ${input.agentPhone.trim()}`);
      if (input.floorsCount > 0) agentMetaParts.push(`عدد الأدوار: ${input.floorsCount}`);
      if (input.amount && input.amount > 0) {
        agentMetaParts.push(`قيمة العقد: ${input.amount.toLocaleString('ar-SA')} ${input.currency || 'ريال يمني'}`);
      }
      if (input.notes?.trim()) agentMetaParts.push(input.notes.trim());
      const combinedNotes = agentMetaParts.join(' | ');

      try {
        // Step 1: Ensure Taxpayer exists in Firestore (required by properties security rule exists(/taxpayers/...))
        if (taxpayerId) {
          const existingTp = taxpayers.find((t) => t.id === taxpayerId);
          taxpayerCode = existingTp?.internalCode || `TP-${taxpayerId.slice(-4)}`;
        } else {
          taxpayerId = generateSafeId('tp');
          taxpayerCode = `TP-${Date.now().toString().slice(-4)}`;
          await setDoc(doc(db, 'taxpayers', taxpayerId), {
            workspaceId: workspace.id,
            ownerId: workspace.ownerId,
            fullName: sanitizeText(input.taxpayerName, 150, 2, 'مكلف جديد'),
            internalCode: sanitizeText(taxpayerCode, 64, 1, 'TP-1001'),
            nationalOrCommercialId: '',
            phone: sanitizeText(input.taxpayerPhone || input.agentPhone || '', 40),
            email: '',
            address: sanitizeText(input.address, 300),
            region: sanitizeText(input.region, 120),
            status: 'active',
            notes: sanitizeText(combinedNotes, 1000),
            memberUids: workspace.memberUids,
            createdBy: firebaseUser.uid,
            createdByName: sanitizeText(userProfile.displayName, 120, 1, 'مستخدم'),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          createdNewTaxpayer = true;
        }

        // Step 2: Create Property document linked to Taxpayer (required by property_units security rule exists(/properties/...))
        const totalUnits =
          Math.max(0, Number(input.apartmentsCount) || 0) +
          Math.max(0, Number(input.shopsCount) || 0) +
          Math.max(0, Number(input.officesCount) || 0);

        createdPropertyId = generateSafeId('prop');
        const propertyCode = `PR-${Date.now().toString().slice(-4)}`;
        const finalPropertyTitle = sanitizeText(
          input.propertyTitle || `عقار ${input.taxpayerName} — ${input.address}`,
          150,
          2,
          'عقار جديد'
        );

        await setDoc(doc(db, 'properties', createdPropertyId), {
          workspaceId: workspace.id,
          ownerId: workspace.ownerId,
          taxpayerId,
          taxpayerName: sanitizeText(input.taxpayerName, 150, 1, 'مكلف'),
          title: finalPropertyTitle,
          code: sanitizeText(propertyCode, 64, 1, 'PR-1001'),
          propertyType: input.propertyType,
          status: 'active',
          region: sanitizeText(input.region || input.address, 120, 1, 'غير محدد'),
          address: sanitizeText(input.address, 300, 1, 'عنوان غير محدد'),
          latitude: 0,
          longitude: 0,
          hasCoordinates: false,
          unitsCount: totalUnits,
          areaSqm: 0,
          notes: sanitizeText(combinedNotes, 1000),
          memberUids: workspace.memberUids,
          createdBy: firebaseUser.uid,
          createdByName: sanitizeText(userProfile.displayName, 120, 1, 'مستخدم'),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        // Step 3: Atomic writeBatch for all PropertyUnits (apartments + commercial shops + offices) + Audit Log
        const batch = writeBatch(db);
        const createdUnitNumbers: string[] = [];
        const aptsCount = Number(input.apartmentsCount) || 0;
        const floors = Number(input.floorsCount) || 0;
        const aptsPerFloor = floors > 0 && aptsCount > 0 ? Math.ceil(aptsCount / floors) : 0;
        const perUnitEstimate =
          input.amount && input.amount > 0 && totalUnits > 0
            ? Math.round(input.amount / totalUnits)
            : 0;

        for (let i = 1; i <= aptsCount; i++) {
          const unitId = generateSafeId(`unit_apt${i}`);
          const unitNumber = `شقة ${i}`;
          createdUnitNumbers.push(unitNumber);
          const currentFloor =
            aptsPerFloor > 0
              ? `الدور ${Math.min(floors, Math.floor((i - 1) / aptsPerFloor) + 1)}`
              : floors > 0
                ? `غير محدد (إجمالي أدوار المبنى: ${floors})`
                : 'غير محدد';

          batch.set(doc(db, 'property_units', unitId), {
            workspaceId: workspace.id,
            ownerId: workspace.ownerId,
            propertyId: createdPropertyId,
            propertyTitle: finalPropertyTitle,
            taxpayerId,
            unitNumber: sanitizeText(unitNumber, 50, 1, `A-${i}`),
            unitType: 'apartment',
            floor: sanitizeText(currentFloor, 40),
            areaSqm: 0,
            occupancyStatus: 'occupied',
            tenantName: '',
            annualRentEstimate: perUnitEstimate,
            notes: sanitizeText(combinedNotes, 500),
            memberUids: workspace.memberUids,
            createdBy: firebaseUser.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        for (let i = 1; i <= (Number(input.shopsCount) || 0); i++) {
          const unitId = generateSafeId(`unit_shop${i}`);
          const unitNumber = `فتحة تجارية ${i}`;
          createdUnitNumbers.push(unitNumber);
          batch.set(doc(db, 'property_units', unitId), {
            workspaceId: workspace.id,
            ownerId: workspace.ownerId,
            propertyId: createdPropertyId,
            propertyTitle: finalPropertyTitle,
            taxpayerId,
            unitNumber: sanitizeText(unitNumber, 50, 1, `S-${i}`),
            unitType: 'shop',
            floor: sanitizeText('الدور الأرضي (تجاري)', 40),
            areaSqm: 0,
            occupancyStatus: 'occupied',
            tenantName: '',
            annualRentEstimate: perUnitEstimate,
            notes: sanitizeText(combinedNotes, 500),
            memberUids: workspace.memberUids,
            createdBy: firebaseUser.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        for (let i = 1; i <= (Number(input.officesCount) || 0); i++) {
          const unitId = generateSafeId(`unit_off${i}`);
          const unitNumber = `مكتب ${i}`;
          createdUnitNumbers.push(unitNumber);
          batch.set(doc(db, 'property_units', unitId), {
            workspaceId: workspace.id,
            ownerId: workspace.ownerId,
            propertyId: createdPropertyId,
            propertyTitle: finalPropertyTitle,
            taxpayerId,
            unitNumber: sanitizeText(unitNumber, 50, 1, `O-${i}`),
            unitType: 'office',
            floor: sanitizeText(floors > 0 ? `غير محدد (إجمالي أدوار المبنى: ${floors})` : 'غير محدد', 40),
            areaSqm: 0,
            occupancyStatus: 'occupied',
            tenantName: '',
            annualRentEstimate: 0,
            notes: sanitizeText(combinedNotes, 500),
            memberUids: workspace.memberUids,
            createdBy: firebaseUser.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        const auditId = generateSafeId('audit');
        batch.set(doc(db, 'audit_logs', auditId), {
          workspaceId: workspace.id,
          ownerId: workspace.ownerId,
          actionType: 'voice_command',
          entityType: 'property',
          entityId: createdPropertyId,
          summary: sanitizeText(
            `تنفيذ أمر صوتي مركب: المكلف (${input.taxpayerName}) + العقار (${finalPropertyTitle}) + ${totalUnits} وحدات عقارية`,
            500,
            2,
            'تنفيذ أمر صوتي مركب'
          ),
          actorId: firebaseUser.uid,
          actorName: sanitizeText(userProfile.displayName, 120, 1, 'مستخدم'),
          memberUids: workspace.memberUids,
          createdAt: serverTimestamp(),
        });

        await batch.commit();

        showToast(
          `تم إنشاء ملف المكلف والعقار و(${totalUnits}) وحدات عقارية بنجاح`,
          'success'
        );

        return {
          taxpayerId,
          taxpayerCode,
          propertyId: createdPropertyId,
          propertyCode,
          createdUnitsCount: totalUnits,
          createdUnitNumbers,
        };
      } catch (error) {
        // Compensating rollback if partial creation failed
        if (createdPropertyId && isOwner) {
          try {
            await deleteDoc(doc(db, 'properties', createdPropertyId));
          } catch {
            // ignore rollback error
          }
        }
        if (createdNewTaxpayer && taxpayerId && isOwner) {
          try {
            await deleteDoc(doc(db, 'taxpayers', taxpayerId));
          } catch {
            // ignore rollback error
          }
        }
        showToast(translateFirebaseError(error), 'error');
        handleFirestoreError(error, OperationType.WRITE, 'compound_voice_creation');
      }
    },
    [firebaseUser, workspace, userProfile, taxpayers, isOwner, showToast]
  );

  // Field Visit Mutations
  const addFieldVisit = useCallback(
    async (
      input: Omit<
        FieldVisit,
        'id' | 'workspaceId' | 'ownerId' | 'memberUids' | 'officerId' | 'officerName' | 'createdAt' | 'updatedAt'
      >
    ): Promise<string> => {
      if (!firebaseUser || !workspace || !userProfile) throw new Error('غير مصرح');
      const id = generateSafeId('visit');
      const path = `field_visits/${id}`;
      try {
        const visitRef = doc(db, 'field_visits', id);

        const compliantFirestoreStatus =
          input.status === 'completed'
            ? 'completed'
            : input.status === 'impeded'
            ? 'access_denied'
            : input.status === 'postponed'
            ? 'requires_followup'
            : 'requires_followup';

        const metaToStore: Record<string, unknown> = {
          exactStatus: input.status || 'planned',
          linkedAppointmentId: input.linkedAppointmentId || '',
          governorate: input.governorate || '',
          directorate: input.directorate || '',
          zone: input.zone || '',
          dailyPlanId: input.dailyPlanId || '',
          impedimentReason: input.impedimentReason || '',
        };

        const notesWithMeta = encodeMetaIntoNotes(input.notes || '', metaToStore);

        await setDoc(visitRef, {
          workspaceId: workspace.id,
          ownerId: workspace.ownerId,
          propertyId: sanitizeText(input.propertyId || 'general_prop', 128, 1, 'general_prop'),
          propertyTitle: sanitizeText(input.propertyTitle, 150, 1, 'عقار'),
          taxpayerId: sanitizeText(input.taxpayerId, 128, 1, 'general_tp'),
          taxpayerName: sanitizeText(input.taxpayerName, 150, 1, 'مكلف'),
          visitDate: sanitizeText(input.visitDate, 40, 8, getAdenDateString()),
          visitTime: sanitizeText(input.visitTime, 20, 3, getAdenTimeString()),
          purpose: input.purpose,
          status: compliantFirestoreStatus,
          latitude: Math.max(-90, Math.min(90, Number(input.latitude) || 0)),
          longitude: Math.max(-180, Math.min(180, Number(input.longitude) || 0)),
          hasCoordinates: Boolean(input.hasCoordinates),
          photoSummary: sanitizeText(input.photoSummary, 500),
          notes: sanitizeText(notesWithMeta, 1500),
          memberUids: workspace.memberUids,
          officerId: firebaseUser.uid,
          officerName: sanitizeText(userProfile.displayName, 120, 1, 'موظف ميداني'),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        const verifySnap = await getDoc(visitRef);
        if (!verifySnap.exists()) {
          throw new Error('تعذر التحقق من حفظ الزيارة الميدانية في قاعدة البيانات.');
        }

        await writeAuditLog('create', 'visit', id, `تسجيل زيارة ميدانية للعقار: ${input.propertyTitle} (الحالة: ${input.status || 'مخططة'})`);
        showToast(
          isOnline
            ? 'تم توثيق الزيارة الميدانية بنجاح'
            : 'تم حفظ الزيارة محليًا دون اتصال، وستتم مزامنتها تلقائيًا عند توفر الإنترنت',
          'success'
        );
        return id;
      } catch (error) {
        showToast(translateFirebaseError(error), 'error');
        handleFirestoreError(error, OperationType.CREATE, path);
      }
    },
    [firebaseUser, workspace, userProfile, writeAuditLog, showToast, isOnline]
  );

  const updateFieldVisitStatus = useCallback(
    async (
      visit: FieldVisit,
      status: FieldVisit['status'],
      impedimentReason?: string,
      additionalNotes?: string
    ) => {
      if (!firebaseUser || !workspace) return;
      const path = `field_visits/${visit.id}`;
      try {
        const compliantFirestoreStatus =
          status === 'completed'
            ? 'completed'
            : status === 'impeded'
            ? 'access_denied'
            : status === 'postponed'
            ? 'requires_followup'
            : 'requires_followup';

        const metaToStore: Record<string, unknown> = {
          exactStatus: status,
          linkedAppointmentId: visit.linkedAppointmentId || '',
          governorate: visit.governorate || '',
          directorate: visit.directorate || '',
          zone: visit.zone || '',
          dailyPlanId: visit.dailyPlanId || '',
          impedimentReason: impedimentReason || visit.impedimentReason || '',
        };

        const notesWithMeta = encodeMetaIntoNotes(
          additionalNotes !== undefined ? additionalNotes : (visit.notes || ''),
          metaToStore
        );

        await updateDoc(doc(db, 'field_visits', visit.id), {
          status: compliantFirestoreStatus,
          notes: sanitizeText(notesWithMeta, 1500),
          memberUids: workspace.memberUids,
          updatedAt: serverTimestamp(),
        });

        await writeAuditLog(
          'update',
          'visit',
          visit.id,
          `تحديث حالة الزيارة للعقار (${visit.propertyTitle}) إلى: ${status}${impedimentReason ? ` — سبب التعثر: ${impedimentReason}` : ''}`
        );
        showToast(`تم تحديث حالة الزيارة إلى "${status}" بنجاح`, 'success');
      } catch (error) {
        showToast(translateFirebaseError(error), 'error');
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    },
    [firebaseUser, workspace, writeAuditLog, showToast]
  );

  // Appointment Mutations
  const addAppointment = useCallback(
    async (
      input: Omit<
        Appointment,
        | 'id'
        | 'workspaceId'
        | 'ownerId'
        | 'memberUids'
        | 'postponeCount'
        | 'lastPostponeReason'
        | 'createdBy'
        | 'createdByName'
        | 'createdAt'
        | 'updatedAt'
      >
    ): Promise<string> => {
      if (!firebaseUser || !workspace || !userProfile) throw new Error('غير مصرح');
      const id = generateSafeId('appt');
      const path = `appointments/${id}`;
      try {
        const apptRef = doc(db, 'appointments', id);

        const defaultUserMins = alertSound.getDefaultReminderMinutes();
        const resolvedReminderMinutes =
          input.reminderMinutesBefore === 0
            ? 0
            : sanitizeReminderMinutes(
                input.reminderMinutesBefore ?? defaultUserMins,
                defaultUserMins
              );

        const metaToStore: Record<string, unknown> = {
          reminderMinutesBefore: resolvedReminderMinutes,
          linkedVisitId: input.linkedVisitId || '',
          durationMinutes: input.durationMinutes || 30,
          assignedOfficerId: input.assignedOfficerId || firebaseUser.uid,
          assignedOfficerName: input.assignedOfficerName || userProfile.displayName,
        };

        const notesWithMeta = encodeMetaIntoNotes(input.notes || '', metaToStore);

        const scheduledDateStr = sanitizeText(input.scheduledDate, 40, 8, getAdenDateString());
        const scheduledTimeStr = sanitizeText(input.scheduledTime, 20, 3, getAdenTimeString());
        const cleanTitle = sanitizeText(input.title, 150, 2, 'موعد ميداني');
        const cleanPropId = sanitizeText(input.propertyId || 'general_prop', 128, 1, 'general_prop');
        const cleanPropTitle = sanitizeText(input.propertyTitle, 150, 1, 'عقار');
        const cleanTpId = sanitizeText(input.taxpayerId || 'general_tp', 128, 1, 'general_tp');
        const cleanTpName = sanitizeText(input.taxpayerName, 150, 1, 'مكلف');
        const cleanLocation = sanitizeText(input.locationText, 250);

        await setDoc(apptRef, {
          workspaceId: workspace.id,
          ownerId: workspace.ownerId,
          title: cleanTitle,
          propertyId: cleanPropId,
          propertyTitle: cleanPropTitle,
          taxpayerId: cleanTpId,
          taxpayerName: cleanTpName,
          scheduledDate: scheduledDateStr,
          scheduledTime: scheduledTimeStr,
          locationText: cleanLocation,
          status: 'upcoming',
          postponeCount: 0,
          lastPostponeReason: '',
          notes: sanitizeText(notesWithMeta, 1000),
          memberUids: workspace.memberUids,
          createdBy: firebaseUser.uid,
          createdByName: sanitizeText(userProfile.displayName, 120, 1, 'مستخدم'),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        const verifySnap = await getDoc(apptRef);
        if (!verifySnap.exists()) {
          throw new Error('تعذر التحقق من حفظ الموعد في قاعدة البيانات.');
        }

        // Also create an in-app notification item
        const notifId = generateSafeId('notif');
        const notifDesc =
          resolvedReminderMinutes === 0
            ? 'التنبيه معطل'
            : `التنبيه قبل الموعد بـ ${resolvedReminderMinutes} دقيقة`;

        await setDoc(doc(db, 'notifications', notifId), {
          workspaceId: workspace.id,
          ownerId: workspace.ownerId,
          title: sanitizeText(`موعد مجدول: ${cleanTitle}`, 150, 1, 'موعد جديد'),
          message: sanitizeText(
            `المكلف: ${cleanTpName} — ${cleanPropTitle} | التاريخ: ${scheduledDateStr} الساعة ${formatTimeTo12Hour(scheduledTimeStr)} (${notifDesc})`,
            500,
            1,
            'موعد مجدول'
          ),
          category: 'appointment',
          isRead: false,
          memberUids: workspace.memberUids,
          createdBy: firebaseUser.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        // If reminder is enabled and newly created appointment is already within reminder window, trigger alert
        const diffUntilNow = getMinutesUntilAden(scheduledDateStr, scheduledTimeStr);
        if (resolvedReminderMinutes > 0 && diffUntilNow <= resolvedReminderMinutes && diffUntilNow >= -90) {
          pushService
            .sendAppointmentAlert(
              {
                id,
                title: cleanTitle,
                taxpayerName: cleanTpName,
                taxpayerId: cleanTpId,
                propertyTitle: cleanPropTitle,
                propertyId: cleanPropId,
                scheduledDate: scheduledDateStr,
                scheduledTime: scheduledTimeStr,
                locationText: cleanLocation,
              },
              diffUntilNow,
              workspace.id
            )
            .catch(() => {});
        }

        await writeAuditLog(
          'create',
          'appointment',
          id,
          `جدولة موعد: ${cleanTitle} (${scheduledDateStr} ${formatTimeTo12Hour(scheduledTimeStr)}) — ${notifDesc}`
        );
        showToast(`تمت جدولة الموعد بنجاح (${notifDesc})`, 'success');
        return id;
      } catch (error) {
        showToast(translateFirebaseError(error), 'error');
        handleFirestoreError(error, OperationType.CREATE, path);
      }
    },
    [firebaseUser, workspace, userProfile, writeAuditLog, showToast]
  );

  const postponeAppointment = useCallback(
    async (
      appointment: Appointment,
      newDate: string,
      newTime: string,
      reason: string,
      newReminderMinutesBefore?: number
    ) => {
      if (!firebaseUser || !workspace || !userProfile) return;
      const postId = generateSafeId('post');
      try {
        // 1. Create immutable AppointmentPostponement record
        await setDoc(doc(db, 'appointment_postponements', postId), {
          workspaceId: workspace.id,
          ownerId: workspace.ownerId,
          appointmentId: appointment.id,
          previousDate: appointment.scheduledDate,
          previousTime: appointment.scheduledTime,
          newDate: sanitizeText(newDate, 40, 8, appointment.scheduledDate),
          newTime: sanitizeText(newTime, 20, 3, appointment.scheduledTime),
          reason: sanitizeText(reason, 500, 2, 'تأجيل تشغيلي'),
          memberUids: workspace.memberUids,
          createdBy: firebaseUser.uid,
          createdByName: sanitizeText(userProfile.displayName, 120, 1, 'مستخدم'),
          createdAt: serverTimestamp(),
        });

        // 2. Update Appointment metadata (preserves durationMinutes, updates reminderMinutesBefore)
        const defaultUserMins = alertSound.getDefaultReminderMinutes();
        let resolvedReminderMins: number;
        if (newReminderMinutesBefore === 0) {
          resolvedReminderMins = 0;
        } else if (newReminderMinutesBefore !== undefined) {
          resolvedReminderMins = sanitizeReminderMinutes(newReminderMinutesBefore, defaultUserMins);
        } else if (appointment.reminderMinutesBefore === 0) {
          resolvedReminderMins = 0;
        } else {
          resolvedReminderMins = sanitizeReminderMinutes(
            appointment.reminderMinutesBefore ?? defaultUserMins,
            defaultUserMins
          );
        }

        const existingMeta = {
          reminderMinutesBefore: resolvedReminderMins,
          linkedVisitId: appointment.linkedVisitId || '',
          durationMinutes: appointment.durationMinutes || 30,
          assignedOfficerId: appointment.assignedOfficerId || firebaseUser.uid,
          assignedOfficerName: appointment.assignedOfficerName || userProfile.displayName,
        };

        const notesWithMeta = encodeMetaIntoNotes(appointment.notes || '', existingMeta);

        await updateDoc(doc(db, 'appointments', appointment.id), {
          title: appointment.title,
          scheduledDate: sanitizeText(newDate, 40, 8, appointment.scheduledDate),
          scheduledTime: sanitizeText(newTime, 20, 3, appointment.scheduledTime),
          locationText: appointment.locationText,
          status: 'postponed',
          postponeCount: (appointment.postponeCount || 0) + 1,
          lastPostponeReason: sanitizeText(reason, 500, 2, 'تأجيل تشغيلي'),
          notes: sanitizeText(notesWithMeta, 1000),
          memberUids: workspace.memberUids,
          updatedAt: serverTimestamp(),
        });

        const alertNote =
          resolvedReminderMins === 0
            ? 'التنبيه معطل'
            : `تنبيه قبل الموعد بـ ${resolvedReminderMins} د`;

        await writeAuditLog(
          'postpone',
          'appointment',
          appointment.id,
          `تأجيل الموعد (${appointment.title}) إلى ${newDate} ${formatTimeTo12Hour(newTime)} — السبب: ${reason} — ${alertNote}`
        );
        showToast(
          resolvedReminderMins === 0
            ? 'تمت إعادة جدولة الموعد بنجاح (التنبيه معطل)'
            : `تمت إعادة جدولة الموعد بنجاح (التنبيه قبل الموعد بـ ${resolvedReminderMins} دقيقة)`,
          'success'
        );
      } catch (error) {
        showToast(translateFirebaseError(error), 'error');
        handleFirestoreError(error, OperationType.UPDATE, `appointments/${appointment.id}`);
      }
    },
    [firebaseUser, workspace, userProfile, writeAuditLog, showToast]
  );

  const updateAppointmentStatus = useCallback(
    async (appointment: Appointment, status: Appointment['status']) => {
      if (!firebaseUser || !workspace) return;
      const path = `appointments/${appointment.id}`;
      try {
        const compliantStatus =
          status === 'completed'
            ? 'completed'
            : status === 'cancelled'
            ? 'cancelled'
            : status === 'postponed'
            ? 'postponed'
            : 'upcoming';

        await updateDoc(doc(db, 'appointments', appointment.id), {
          status: compliantStatus,
          updatedAt: serverTimestamp(),
        });
        await writeAuditLog('update', 'appointment', appointment.id, `تحديث حالة الموعد (${appointment.title}) إلى ${status}`);
        showToast(`تم تحديث حالة الموعد إلى "${status}"`, 'success');
      } catch (error) {
        showToast(translateFirebaseError(error), 'error');
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    },
    [firebaseUser, workspace, writeAuditLog, showToast]
  );

  const cancelAppointment = useCallback(
    async (appointment: Appointment, reason: string) => {
      if (!firebaseUser || !workspace) return;
      const path = `appointments/${appointment.id}`;
      try {
        const existingMeta = {
          cancelReason: reason,
          reminderMinutesBefore: appointment.reminderMinutesBefore,
          linkedVisitId: appointment.linkedVisitId,
        };
        const notesWithMeta = encodeMetaIntoNotes(appointment.notes || '', existingMeta);

        await updateDoc(doc(db, 'appointments', appointment.id), {
          status: 'cancelled',
          notes: sanitizeText(notesWithMeta, 1000),
          updatedAt: serverTimestamp(),
        });
        await writeAuditLog('update', 'appointment', appointment.id, `إلغاء الموعد (${appointment.title}) — السبب: ${reason}`);
        showToast('تم إلغاء الموعد وتوثيق السبب في سجل التدقيق', 'info');
      } catch (error) {
        showToast(translateFirebaseError(error), 'error');
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    },
    [firebaseUser, workspace, writeAuditLog, showToast]
  );

  // Financial Assessments
  const addFinancialAssessment = useCallback(
    async (
      input: Omit<
        FinancialAssessment,
        'id' | 'workspaceId' | 'ownerId' | 'memberUids' | 'createdBy' | 'createdByName' | 'createdAt' | 'updatedAt'
      >
    ): Promise<string> => {
      if (!firebaseUser || !workspace || !userProfile) throw new Error('غير مصرح');
      const id = generateSafeId('assess');
      const path = `financial_assessments/${id}`;
      const resolvedStatus: FinancialAssessment['status'] =
        canApproveFinancials && input.status === 'approved' ? 'approved' : 'draft';
      try {
        const assessRef = doc(db, 'financial_assessments', id);
        await setDoc(assessRef, {
          workspaceId: workspace.id,
          ownerId: workspace.ownerId,
          propertyId: sanitizeText(input.propertyId || 'general_prop', 128, 1, 'general_prop'),
          propertyTitle: sanitizeText(input.propertyTitle, 150, 1, 'عقار'),
          taxpayerId: sanitizeText(input.taxpayerId, 128, 1, 'general_tp'),
          taxpayerName: sanitizeText(input.taxpayerName, 150, 1, 'مكلف'),
          amount: Math.max(0, Number(input.amount) || 0),
          currency: sanitizeText(input.currency || workspace?.defaultCurrency, 10, 3, 'YER'),
          periodLabel: sanitizeText(input.periodLabel, 80, 2, '2026'),
          assessmentDate: sanitizeText(input.assessmentDate, 40, 8, new Date().toISOString().slice(0, 10)),
          status: resolvedStatus,
          notes: sanitizeText(input.notes, 1000),
          memberUids: workspace.memberUids,
          createdBy: firebaseUser.uid,
          createdByName: sanitizeText(userProfile.displayName, 120, 1, 'مستخدم'),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        const verifySnap = await getDoc(assessRef);
        if (!verifySnap.exists()) {
          throw new Error('تعذر التحقق من حفظ التقييم المالي في قاعدة البيانات.');
        }

        await writeAuditLog(
          'create',
          'assessment',
          id,
          `إنشاء تقييم مالي (${resolvedStatus === 'approved' ? 'معتمد' : 'مسودة'}) للعقار (${input.propertyTitle}) بمبلغ ${input.amount} ${input.currency}`
        );
        showToast(
          resolvedStatus === 'approved'
            ? 'تم حفظ واعتماد التقييم المالي بنجاح'
            : 'تم حفظ مسودة التقييم المالي بنجاح',
          'success'
        );
        return id;
      } catch (error) {
        showToast(translateFirebaseError(error), 'error');
        handleFirestoreError(error, OperationType.CREATE, path);
      }
    },
    [firebaseUser, workspace, userProfile, canApproveFinancials, writeAuditLog, showToast]
  );

  const approveFinancialAssessment = useCallback(
    async (assessment: FinancialAssessment) => {
      if (!canApproveFinancials || !workspace) {
        showToast('ليس لديك صلاحية اعتماد التقييمات المالية.', 'error');
        return;
      }
      if (assessment.status !== 'draft') {
        showToast('لا يمكن اعتماد تقييم غير مسودة.', 'warning');
        return;
      }
      const path = `financial_assessments/${assessment.id}`;
      try {
        await updateDoc(doc(db, 'financial_assessments', assessment.id), {
          amount: assessment.amount,
          currency: assessment.currency,
          periodLabel: assessment.periodLabel,
          assessmentDate: assessment.assessmentDate,
          status: 'approved',
          notes: assessment.notes,
          memberUids: workspace.memberUids,
          updatedAt: serverTimestamp(),
        });
        await writeAuditLog(
          'approve',
          'assessment',
          assessment.id,
          `اعتماد التقييم المالي للعقار (${assessment.propertyTitle}) بقيمة ${assessment.amount} ${assessment.currency}`
        );
        showToast('تم اعتماد التقييم المالي وقفله ضد التعديل المباشر', 'success');
      } catch (error) {
        showToast(translateFirebaseError(error), 'error');
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    },
    [canApproveFinancials, workspace, writeAuditLog, showToast]
  );

  const cancelFinancialAssessment = useCallback(
    async (assessment: FinancialAssessment, reasonNote: string) => {
      if (!isOwner || !workspace) {
        showToast('فقط مالك مساحة العمل يمكنه إلغاء تقييم مالي مع توثيق السبب.', 'error');
        return;
      }
      const path = `financial_assessments/${assessment.id}`;
      const updatedNotes = sanitizeText(`${assessment.notes ? assessment.notes + ' | ' : ''}سبب الإلغاء: ${reasonNote}`, 1000);
      try {
        await updateDoc(doc(db, 'financial_assessments', assessment.id), {
          status: 'cancelled',
          notes: updatedNotes,
          memberUids: workspace.memberUids,
          updatedAt: serverTimestamp(),
        });
        await writeAuditLog(
          'reverse',
          'assessment',
          assessment.id,
          `إلغاء التقييم المالي (${assessment.propertyTitle}) — السبب: ${reasonNote}`
        );
        showToast('تم إلغاء التقييم المالي وتوثيق العملية في سجل التدقيق', 'info');
      } catch (error) {
        showToast(translateFirebaseError(error), 'error');
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    },
    [isOwner, workspace, writeAuditLog, showToast]
  );

  // Financial Transactions
  const addFinancialTransaction = useCallback(
    async (
      input: Omit<
        FinancialTransaction,
        'id' | 'workspaceId' | 'ownerId' | 'memberUids' | 'createdBy' | 'createdByName' | 'createdAt' | 'updatedAt'
      >
    ): Promise<{ id: string; referenceNumber: string }> => {
      if (!firebaseUser || !workspace || !userProfile) throw new Error('غير مصرح');
      const id = generateSafeId('tx');
      const finalRef = sanitizeText(input.referenceNumber, 80, 1, `REF-${Date.now().toString().slice(-5)}`);
      const path = `financial_transactions/${id}`;
      try {
        const txRef = doc(db, 'financial_transactions', id);
        await setDoc(txRef, {
          workspaceId: workspace.id,
          ownerId: workspace.ownerId,
          propertyId: sanitizeText(input.propertyId || 'general_prop', 128, 1, 'general_prop'),
          propertyTitle: sanitizeText(input.propertyTitle, 150, 1, 'عقار'),
          taxpayerId: sanitizeText(input.taxpayerId, 128, 1, 'general_tp'),
          taxpayerName: sanitizeText(input.taxpayerName, 150, 1, 'مكلف'),
          assessmentId: sanitizeText(input.assessmentId || 'general_account', 128, 1, 'general_account'),
          transactionType: input.transactionType,
          amount: Math.max(0, Number(input.amount) || 0),
          currency: sanitizeText(input.currency || workspace?.defaultCurrency, 10, 3, 'YER'),
          transactionDate: sanitizeText(input.transactionDate, 40, 8, new Date().toISOString().slice(0, 10)),
          referenceNumber: finalRef,
          status: isOwner ? input.status : 'pending',
          notes: sanitizeText(input.notes, 1000),
          memberUids: workspace.memberUids,
          createdBy: firebaseUser.uid,
          createdByName: sanitizeText(userProfile.displayName, 120, 1, 'مستخدم'),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        const verifySnap = await getDoc(txRef);
        if (!verifySnap.exists()) {
          throw new Error('تعذر التحقق من حفظ المعاملة المالية في قاعدة البيانات.');
        }

        await writeAuditLog(
          'create',
          'transaction',
          id,
          `تسجيل معاملة مالية (${finalRef}) بمبلغ ${input.amount} ${input.currency}`
        );
        showToast('تم تسجيل المعاملة المالية وتوثيقها في سجل التدقيق', 'success');
        return { id, referenceNumber: finalRef };
      } catch (error) {
        showToast(translateFirebaseError(error), 'error');
        handleFirestoreError(error, OperationType.CREATE, path);
      }
    },
    [firebaseUser, workspace, userProfile, isOwner, writeAuditLog, showToast]
  );

  const approveFinancialTransaction = useCallback(
    async (tx: FinancialTransaction) => {
      if (!isOwner || !workspace) {
        showToast('اعتماد المعاملات المالية النهائية محصور بمالك مساحة العمل.', 'error');
        return;
      }
      const path = `financial_transactions/${tx.id}`;
      try {
        await updateDoc(doc(db, 'financial_transactions', tx.id), {
          status: 'approved',
          notes: tx.notes,
          memberUids: workspace.memberUids,
          updatedAt: serverTimestamp(),
        });
        await writeAuditLog(
          'approve',
          'transaction',
          tx.id,
          `اعتماد المعاملة المالية (${tx.referenceNumber}) بمبلغ ${tx.amount} ${tx.currency}`
        );
        showToast('تم اعتماد المعاملة المالية رسميًا', 'success');
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    },
    [isOwner, workspace, writeAuditLog, showToast]
  );

  const reverseFinancialTransaction = useCallback(
    async (tx: FinancialTransaction, reasonNote: string) => {
      if (!isOwner || !workspace || !firebaseUser || !userProfile) {
        showToast('عكس المعاملات المالية المعتمدة يتطلب صلاحية مالك مساحة العمل.', 'error');
        return;
      }
      if (tx.status === 'reversed') {
        showToast('هذه المعاملة معكوسة مسبقًا.', 'warning');
        return;
      }
      const path = `financial_transactions/${tx.id}`;
      const revId = generateSafeId('txrev');
      try {
        // 1. Mark original transaction as 'reversed'
        await updateDoc(doc(db, 'financial_transactions', tx.id), {
          status: 'reversed',
          notes: sanitizeText(`${tx.notes ? tx.notes + ' | ' : ''}معكوسة: ${reasonNote}`, 1000),
          memberUids: workspace.memberUids,
          updatedAt: serverTimestamp(),
        });

        // 2. Create offsetting reversal transaction entry
        await setDoc(doc(db, 'financial_transactions', revId), {
          workspaceId: workspace.id,
          ownerId: workspace.ownerId,
          propertyId: tx.propertyId,
          propertyTitle: tx.propertyTitle,
          taxpayerId: tx.taxpayerId,
          taxpayerName: tx.taxpayerName,
          assessmentId: tx.assessmentId,
          transactionType: 'reversal',
          amount: tx.amount,
          currency: tx.currency,
          transactionDate: new Date().toISOString().slice(0, 10),
          referenceNumber: sanitizeText(`REV-${tx.referenceNumber}`, 80, 1, 'REV-TX'),
          status: 'approved',
          notes: sanitizeText(`قيد عكسي للمعاملة ${tx.referenceNumber} — السبب: ${reasonNote}`, 1000),
          memberUids: workspace.memberUids,
          createdBy: firebaseUser.uid,
          createdByName: sanitizeText(userProfile.displayName, 120, 1, 'مستخدم'),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        await writeAuditLog(
          'reverse',
          'transaction',
          tx.id,
          `عكس المعاملة المالية (${tx.referenceNumber}) بقيد عكسي (${revId}) — السبب: ${reasonNote}`
        );
        showToast('تم تنفيذ القيد العكسي للمعاملة وتوثيقه في سجل التدقيق', 'success');
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    },
    [isOwner, workspace, firebaseUser, userProfile, writeAuditLog, showToast]
  );

  // Helper to propagate updated memberUids to existing workspace documents so all team members have immediate access
  const syncMemberUidsAcrossWorkspace = useCallback(
    async (updatedMemberUids: string[]) => {
      if (!workspace) return;
      try {
        const batch = writeBatch(db);
        let ops = 0;
        const commitIfFull = async () => {
          if (ops >= 400) {
            await batch.commit();
            ops = 0;
          }
        };

        for (const m of members) {
          batch.update(doc(db, 'workspace_members', m.id), {
            memberUids: updatedMemberUids,
            updatedAt: serverTimestamp(),
          });
          ops++;
          await commitIfFull();
        }
        for (const tp of taxpayers) {
          batch.update(doc(db, 'taxpayers', tp.id), {
            memberUids: updatedMemberUids,
            updatedAt: serverTimestamp(),
          });
          ops++;
          await commitIfFull();
        }
        for (const p of properties) {
          batch.update(doc(db, 'properties', p.id), {
            memberUids: updatedMemberUids,
            updatedAt: serverTimestamp(),
          });
          ops++;
          await commitIfFull();
        }
        for (const u of propertyUnits) {
          batch.update(doc(db, 'property_units', u.id), {
            memberUids: updatedMemberUids,
            updatedAt: serverTimestamp(),
          });
          ops++;
          await commitIfFull();
        }
        for (const v of fieldVisits) {
          batch.update(doc(db, 'field_visits', v.id), {
            memberUids: updatedMemberUids,
            updatedAt: serverTimestamp(),
          });
          ops++;
          await commitIfFull();
        }
        for (const a of appointments) {
          batch.update(doc(db, 'appointments', a.id), {
            memberUids: updatedMemberUids,
            updatedAt: serverTimestamp(),
          });
          ops++;
          await commitIfFull();
        }
        for (const asmt of assessments) {
          batch.update(doc(db, 'financial_assessments', asmt.id), {
            memberUids: updatedMemberUids,
            updatedAt: serverTimestamp(),
          });
          ops++;
          await commitIfFull();
        }
        for (const n of notifications) {
          batch.update(doc(db, 'notifications', n.id), {
            memberUids: updatedMemberUids,
            updatedAt: serverTimestamp(),
          });
          ops++;
          await commitIfFull();
        }

        if (ops > 0) {
          await batch.commit();
        }
      } catch (err) {
        console.warn('Non-critical memberUids propagation notice:', err);
      }
    },
    [
      workspace,
      members,
      taxpayers,
      properties,
      propertyUnits,
      fieldVisits,
      appointments,
      assessments,
      notifications,
    ]
  );

  // Team Management (Max 10 members including owner: owner + up to 9 assistants)
  const addTeamMember = useCallback(
    async (
      displayName: string,
      email: string,
      userIdInput: string,
      role: WorkspaceRole,
      canApprove: boolean,
      canDelete: boolean,
      initialPassword?: string
    ) => {
      if ((!isOwner && !isPlatformAdmin) || !workspace || !firebaseUser) {
        showToast('فقط المدير الأساسي أو مالك مساحة العمل يستطيع إضافة مستخدمين للفريق.', 'error');
        return;
      }
      const teamLimitCheck = validateTeamMemberAdditionLimit({
        currentMembersCount: members.length,
        currentMemberUidsCount: workspace.memberUids.length,
        accountLicense,
        isPermanentOwner: isPlatformAdmin,
      });
      if (!teamLimitCheck.allowed) {
        showToast(teamLimitCheck.messageAr, 'error');
        return;
      }
      if (role === 'owner') {
        showToast('لا يمكن تعيين عضو آخر بدور مالك مساحة العمل.', 'error');
        return;
      }

      const cleanName = sanitizeText(displayName, 120, 1, 'مساعد ميداني');
      const cleanEmail = sanitizeText(email.trim().toLowerCase(), 200, 3, 'assistant@rasd.app');
      const trimmedUidInput = userIdInput.trim().replace(/[^a-zA-Z0-9_-]/g, '');

      // Check for duplicate email or UID in current workspace members
      const alreadyExists = members.some(
        (m) =>
          m.email.trim().toLowerCase() === cleanEmail ||
          (trimmedUidInput && m.userId === trimmedUidInput)
      );
      if (alreadyExists) {
        showToast('هذا المستخدم مضاف بالفعل ضمن أعضاء الفريق الحاليين.', 'warning');
        return;
      }

      let createdUid = '';
      let accountAlreadyExistedInAuth = false;

      // If the Primary Manager entered an initial password, create the Firebase Auth account directly
      if (initialPassword && initialPassword.trim().length > 0) {
        if (initialPassword.trim().length < 6) {
          showToast('يجب أن تتكون كلمة المرور المبدئية للمستخدم من 6 أحرف على الأقل.', 'error');
          return;
        }
        try {
          const created = await createTeamUserAuthAccount(
            cleanEmail,
            initialPassword.trim(),
            cleanName
          );
          createdUid = created.uid;
        } catch (authErr) {
          const rawMsg = authErr instanceof Error ? authErr.message : String(authErr);
          if (rawMsg.includes('auth/email-already-in-use')) {
            accountAlreadyExistedInAuth = true;
          } else {
            showToast(translateFirebaseError(authErr), 'error');
            throw authErr;
          }
        }
      }

      const cleanUid = createdUid || trimmedUidInput || generateSafeId('assist');
      const isRealUid = Boolean(createdUid || trimmedUidInput);
      const memberDocId = `${workspace.id}_${cleanUid}`.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120);
      const updatedMemberUids = Array.from(new Set([...workspace.memberUids, cleanUid])).slice(
        0,
        teamLimitCheck.effectiveMaxMembers
      );

      try {
        // 1. Update Workspace memberUids
        if (updatedMemberUids.length !== workspace.memberUids.length) {
          await updateDoc(doc(db, 'workspaces', workspace.id), {
            name: workspace.name,
            ownerName: workspace.ownerName,
            defaultCurrency: workspace.defaultCurrency,
            taxRatePercent: workspace.taxRatePercent,
            regionName: workspace.regionName,
            inviteCode: workspace.inviteCode,
            memberUids: updatedMemberUids,
            memberCount: updatedMemberUids.length,
            updatedAt: serverTimestamp(),
          });
        }

        // 2. Create WorkspaceMember document
        await setDoc(doc(db, 'workspace_members', memberDocId), {
          workspaceId: workspace.id,
          ownerId: workspace.ownerId,
          userId: cleanUid,
          displayName: cleanName,
          email: cleanEmail,
          role,
          status: isRealUid ? 'active' : 'invited',
          canApproveFinancials: canApprove,
          canDeleteRecords: canDelete,
          memberUids: updatedMemberUids,
          createdBy: firebaseUser.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        // 3. If we have the user's real UID, bind their /users/{uid} profile to this workspace
        if (isRealUid) {
          const roleLabel =
            role === 'finance_assistant'
              ? 'مساعد مالي'
              : role === 'viewer'
              ? 'مشاهد فقط'
              : 'مساعد ميداني';
          await setDoc(doc(db, 'users', cleanUid), {
            uid: cleanUid,
            displayName: cleanName,
            email: cleanEmail,
            phone: '',
            jobTitle: roleLabel,
            activeWorkspaceId: workspace.id,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }).catch(() => {});
        }

        // 4. Propagate updated memberUids across existing workspace documents
        void syncMemberUidsAcrossWorkspace(updatedMemberUids);

        await writeAuditLog(
          'team_change',
          'member',
          memberDocId,
          `إضافة عضو للفريق بواسطة المدير: ${cleanName} (${cleanEmail}) بدور ${role}`
        );

        if (createdUid) {
          showToast(
            `تم إنشاء حساب المستخدم (${cleanName}) وإضافته كعضو نشط في الفريق بنجاح!`,
            'success'
          );
        } else if (accountAlreadyExistedInAuth) {
          showToast(
            `تمت إضافة (${cleanName}) للفريق بنجاح! بريد المستخدم مسجل مسبقًا وسيرتبط تلقائيًا فور دخوله.`,
            'success'
          );
        } else {
          showToast(
            `تمت إضافة (${cleanName}) إلى فريق مساحة العمل بنجاح!`,
            'success'
          );
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `workspace_members/${memberDocId}`);
      }
    },
    [
      isOwner,
      isPlatformAdmin,
      workspace,
      firebaseUser,
      members,
      syncMemberUidsAcrossWorkspace,
      writeAuditLog,
      showToast,
    ]
  );

  const updateTeamMember = useCallback(
    async (
      member: WorkspaceMember,
      role: WorkspaceRole,
      status: WorkspaceMember['status'],
      canApprove: boolean,
      canDelete: boolean
    ) => {
      if ((!isOwner && !isPlatformAdmin) || !workspace) {
        showToast('فقط المدير الأساسي أو مالك مساحة العمل يستطيع تعديل صلاحيات أعضاء الفريق.', 'error');
        return;
      }
      if (member.userId === workspace.ownerId) {
        showToast('لا يمكن تخفيض أو تعطيل صلاحيات المالك الأساسي لمساحة العمل.', 'warning');
        return;
      }
      const path = `workspace_members/${member.id}`;
      try {
        await updateDoc(doc(db, 'workspace_members', member.id), {
          displayName: member.displayName,
          email: member.email,
          role: role === 'owner' ? 'field_assistant' : role,
          status,
          canApproveFinancials: canApprove,
          canDeleteRecords: canDelete,
          memberUids: workspace.memberUids,
          updatedAt: serverTimestamp(),
        });
        await writeAuditLog(
          'team_change',
          'member',
          member.id,
          `تحديث صلاحيات العضو (${member.displayName}): الدور=${role}، الحالة=${status}`
        );
        showToast('تم تحديث صلاحيات عضو الفريق بنجاح', 'success');
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    },
    [isOwner, isPlatformAdmin, workspace, writeAuditLog, showToast]
  );

  const removeTeamMember = useCallback(
    async (member: WorkspaceMember) => {
      if ((!isOwner && !isPlatformAdmin) || !workspace) return;
      if (member.userId === workspace.ownerId) {
        showToast('لا يمكن إزالة المالك الأساسي لمساحة العمل.', 'error');
        return;
      }
      const path = `workspace_members/${member.id}`;
      try {
        const updatedUids = workspace.memberUids.filter((u) => u !== member.userId);
        await deleteDoc(doc(db, 'workspace_members', member.id));
        if (updatedUids.length !== workspace.memberUids.length && updatedUids.length >= 1) {
          await updateDoc(doc(db, 'workspaces', workspace.id), {
            name: workspace.name,
            ownerName: workspace.ownerName,
            defaultCurrency: workspace.defaultCurrency,
            taxRatePercent: workspace.taxRatePercent,
            regionName: workspace.regionName,
            inviteCode: workspace.inviteCode,
            memberUids: updatedUids,
            memberCount: updatedUids.length,
            updatedAt: serverTimestamp(),
          });
          void syncMemberUidsAcrossWorkspace(updatedUids);
        }
        await writeAuditLog('team_change', 'member', member.id, `إزالة العضو (${member.displayName}) من الفريق`);
        showToast('تم إزالة العضو من مساحة العمل', 'info');
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, path);
      }
    },
    [isOwner, isPlatformAdmin, workspace, syncMemberUidsAcrossWorkspace, writeAuditLog, showToast]
  );

  const markNotificationRead = useCallback(
    async (id: string) => {
      if (!workspace) return;
      const path = `notifications/${id}`;
      try {
        await updateDoc(doc(db, 'notifications', id), {
          isRead: true,
          memberUids: workspace.memberUids,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    },
    [workspace]
  );

  const deleteNotification = useCallback(
    async (id: string) => {
      if (!workspace) return;
      const path = `notifications/${id}`;
      try {
        await deleteDoc(doc(db, 'notifications', id));
        setNotifications((prev) => prev.filter((n) => n.id !== id));
        showToast('تم حذف الإشعار', 'info');
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, path);
      }
    },
    [workspace, showToast]
  );

  const clearAllNotifications = useCallback(
    async () => {
      if (!workspace || notifications.length === 0) {
        showToast('لا توجد إشعارات لتنظيفها', 'info');
        return;
      }
      try {
        const batch = writeBatch(db);
        notifications.forEach((n) => {
          batch.delete(doc(db, 'notifications', n.id));
        });
        await batch.commit();
        setNotifications([]);
        showToast('تم تنظيف وحذف كافة الإشعارات بنجاح', 'success');
      } catch (error) {
        showToast(translateFirebaseError(error), 'error');
      }
    },
    [workspace, notifications, showToast]
  );

  const recordVoiceAudit = useCallback(
    async (transcript: string, summary: string) => {
      await writeAuditLog(
        'voice_command',
        'workspace',
        workspace?.id || 'ws',
        `أمر صوتي: "${transcript.slice(0, 120)}" -> ${summary}`
      );
    },
    [writeAuditLog, workspace?.id]
  );

  const value: RasdContextValue = {
    firebaseUser,
    userProfile,
    authReady,
    isOnline,
    darkMode,
    toggleDarkMode,
    activeScreen,
    setActiveScreen,
    selectedPropertyId,
    setSelectedPropertyId,
    selectedTaxpayerId,
    setSelectedTaxpayerId,
    selectedAppointmentId,
    setSelectedAppointmentId,
    toasts,
    showToast,
    dismissToast,
    loginWithGoogle,
    loginWithEmail,
    registerWithEmail,
    resetPassword,
    resendVerificationEmail,
    refreshAuthUser,
    logout,
    workspace,
    members,
    currentUserRole,
    isOwner,
    isPlatformAdmin,
    canApproveFinancials,
    canDeleteRecords,
    pendingSyncCount,
    accountApprovalStatus,
    canAccessWorkScreens,
    accountLicense,
    registrationRequest,
    receivedRegistrationRequests,
    refreshRegistrationStatus,
    refreshReceivedRegistrationRequests,
    ownerSessionDiagnostic,
    platformStaffRecord,
    canAccessPlatformAdmin,
    platformClientAccounts,
    subscriptionPackages,
    platformStaffList,
    platformAdminAuditLogs,
    refreshPlatformAdminData,
    decideRegistrationRequest,
    mutateClientSubscription,
    updateSubscriptionPackageConfig,
    upsertPlatformStaffMember,
    removePlatformStaffMember,
    taxpayers,
    properties,
    propertyUnits,
    fieldVisits,
    appointments,
    postponements,
    assessments,
    transactions,
    notifications,
    auditLogs,
    updateUserProfileInfo,
    updateWorkspaceSettings,
    addTaxpayer,
    updateTaxpayer,
    deleteTaxpayer,
    addProperty,
    updateProperty,
    deleteProperty,
    addPropertyUnit,
    updatePropertyUnit,
    deletePropertyUnit,
    executeCompoundVoiceCreation,
    addFieldVisit,
    updateFieldVisitStatus,
    addAppointment,
    postponeAppointment,
    updateAppointmentStatus,
    cancelAppointment,
    addFinancialAssessment,
    approveFinancialAssessment,
    cancelFinancialAssessment,
    addFinancialTransaction,
    approveFinancialTransaction,
    reverseFinancialTransaction,
    addTeamMember,
    updateTeamMember,
    removeTeamMember,
    markNotificationRead,
    deleteNotification,
    clearAllNotifications,
    recordVoiceAudit,
  };

  return <RasdContext.Provider value={value}>{children}</RasdContext.Provider>;
};

export function useRasd(): RasdContextValue {
  const ctx = useContext(RasdContext);
  if (!ctx) {
    throw new Error('useRasd must be used within a RasdProvider');
  }
  return ctx;
}
