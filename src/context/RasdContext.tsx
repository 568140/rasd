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
  handleFirestoreError,
  generateSafeId,
  sanitizeText,
  translateFirebaseError,
} from '../services/firebase';
import {
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
  Property,
  PropertyUnit,
  ScreenId,
  Taxpayer,
  UserProfile,
  Workspace,
  WorkspaceMember,
  WorkspaceRole,
} from '../types/rasd';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

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

  // Workspace & Permissions
  workspace: Workspace | null;
  members: WorkspaceMember[];
  currentUserRole: WorkspaceRole;
  isOwner: boolean;
  canApproveFinancials: boolean;
  canDeleteRecords: boolean;
  pendingSyncCount: number;

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
  }) => Promise<{
    taxpayerId: string;
    taxpayerCode: string;
    propertyId: string;
    propertyCode: string;
    createdUnitsCount: number;
    createdUnitNumbers: string[];
  }>;

  addFieldVisit: (input: Omit<FieldVisit, 'id' | 'workspaceId' | 'ownerId' | 'memberUids' | 'officerId' | 'officerName' | 'createdAt' | 'updatedAt'>) => Promise<string>;

  addAppointment: (input: Omit<Appointment, 'id' | 'workspaceId' | 'ownerId' | 'memberUids' | 'postponeCount' | 'lastPostponeReason' | 'createdBy' | 'createdByName' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  postponeAppointment: (appointment: Appointment, newDate: string, newTime: string, reason: string) => Promise<void>;
  updateAppointmentStatus: (appointment: Appointment, status: Appointment['status']) => Promise<void>;

  addFinancialAssessment: (input: Omit<FinancialAssessment, 'id' | 'workspaceId' | 'ownerId' | 'memberUids' | 'createdBy' | 'createdByName' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  approveFinancialAssessment: (assessment: FinancialAssessment) => Promise<void>;
  cancelFinancialAssessment: (assessment: FinancialAssessment, reasonNote: string) => Promise<void>;

  addFinancialTransaction: (input: Omit<FinancialTransaction, 'id' | 'workspaceId' | 'ownerId' | 'memberUids' | 'createdBy' | 'createdByName' | 'createdAt' | 'updatedAt'>) => Promise<{ id: string; referenceNumber: string }>;
  approveFinancialTransaction: (tx: FinancialTransaction) => Promise<void>;
  reverseFinancialTransaction: (tx: FinancialTransaction, reasonNote: string) => Promise<void>;

  addTeamMember: (displayName: string, email: string, userIdInput: string, role: WorkspaceRole, canApprove: boolean, canDelete: boolean) => Promise<void>;
  updateTeamMember: (member: WorkspaceMember, role: WorkspaceRole, status: WorkspaceMember['status'], canApprove: boolean, canDelete: boolean) => Promise<void>;
  removeTeamMember: (member: WorkspaceMember) => Promise<void>;

  markNotificationRead: (id: string) => Promise<void>;
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
    setSelectedPropertyId(null);
    setSelectedTaxpayerId(null);
    setActiveScreen('home');
  }, []);

  const bootstrappingPromiseRef = React.useRef<{ uid: string; promise: Promise<void> } | null>(null);

  // Bootstrap User & Workspace on verified login
  const ensureUserAndWorkspace = useCallback(async (user: FirebaseUser) => {
    if (!user.emailVerified) {
      return;
    }
    const uid = user.uid;
    if (bootstrappingPromiseRef.current?.uid === uid) {
      return bootstrappingPromiseRef.current.promise;
    }

    const runBootstrap = async () => {
      const defaultWsId = `ws_${uid.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48)}`;
      const userDocRef = doc(db, 'users', uid);
      let currentStepPath = `users/${uid}`;

      try {
        const userSnap = await getDoc(userDocRef);
        const activeWsId = userSnap.exists()
          ? userSnap.data().activeWorkspaceId || defaultWsId
          : defaultWsId;

        const wsRef = doc(db, 'workspaces', activeWsId);
        const memberId = `${activeWsId}_${uid}`.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120);
        const memberRef = doc(db, 'workspace_members', memberId);

        // If activeWsId is the user's own default workspace, check wsSnap and memberSnap safely
        const isOwnDefaultWs = activeWsId === defaultWsId;
        const [wsSnap, memberSnap] = isOwnDefaultWs
          ? await Promise.all([getDoc(wsRef), getDoc(memberRef)])
          : [null, null];

        const needsUserDoc = !userSnap.exists();
        const needsWsDoc = isOwnDefaultWs && wsSnap !== null && !wsSnap.exists();
        const needsMemberDoc = isOwnDefaultWs && memberSnap !== null && !memberSnap.exists();

        if (needsUserDoc || needsWsDoc || needsMemberDoc) {
          const displayName = sanitizeText(
            user.displayName || user.email?.split('@')[0] || 'مستخدم رصد',
            120,
            1,
            'مستخدم رصد'
          );
          const email = sanitizeText(user.email || 'user@rasd.app', 200, 3, 'user@rasd.app');
          const inviteCode = `RASD-${uid.slice(0, 6).toUpperCase()}`;

          const batch = writeBatch(db);

          if (needsWsDoc) {
            currentStepPath = `workspaces/${activeWsId}`;
            batch.set(wsRef, {
              name: sanitizeText(`مساحة عمل ${displayName}`, 120, 1, 'مساحة العمل الميدانية'),
              ownerId: uid,
              ownerName: displayName,
              defaultCurrency: 'SAR',
              taxRatePercent: 0,
              regionName: 'الرياض',
              inviteCode: sanitizeText(inviteCode.replace(/[^a-zA-Z0-9_-]/g, ''), 64, 4, 'RASD1000'),
              memberUids: [uid],
              memberCount: 1,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }

          if (needsUserDoc) {
            currentStepPath = `users/${uid}`;
            batch.set(userDocRef, {
              uid,
              displayName,
              email,
              phone: '',
              jobTitle: 'مسؤول ميداني أول',
              activeWorkspaceId: activeWsId,
              createdAt: serverTimestamp(),
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
              status: 'active',
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

        currentStepPath = `users/${uid}`;
        const finalUserSnap = await getDoc(userDocRef);
        if (finalUserSnap.exists()) {
          const d = finalUserSnap.data();
          setUserProfile({
            id: finalUserSnap.id,
            uid: d.uid,
            displayName: d.displayName,
            email: d.email,
            phone: d.phone || '',
            jobTitle: d.jobTitle || '',
            activeWorkspaceId: d.activeWorkspaceId || activeWsId,
            isPendingSync: finalUserSnap.metadata.hasPendingWrites,
            fromCache: finalUserSnap.metadata.fromCache,
          });
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, currentStepPath);
      } finally {
        if (bootstrappingPromiseRef.current?.uid === uid) {
          bootstrappingPromiseRef.current = null;
        }
      }
    };

    const p = runBootstrap();
    bootstrappingPromiseRef.current = { uid, promise: p };
    return p;
  }, []);

  // Auth State Listener
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        if (user.emailVerified) {
          try {
            await ensureUserAndWorkspace(user);
          } catch (e) {
            console.error(e);
          }
        }
      } else {
        clearAllUserState();
      }
      setAuthReady(true);
    });

    return () => unsubAuth();
  }, [ensureUserAndWorkspace, clearAllUserState]);

  // Attach Real-time Listeners once user is authenticated and verified
  useEffect(() => {
    if (!authReady || !firebaseUser || !firebaseUser.emailVerified || !userProfile?.activeWorkspaceId) {
      return;
    }

    const uid = firebaseUser.uid;
    const unsubs: Unsubscribe[] = [];

    // 1. User Profile listener
    unsubs.push(
      onSnapshot(
        doc(db, 'users', uid),
        { includeMetadataChanges: true },
        (snap) => {
          if (snap.exists()) {
            const d = snap.data();
            setUserProfile({
              id: snap.id,
              uid: d.uid,
              displayName: d.displayName,
              email: d.email,
              phone: d.phone || '',
              jobTitle: d.jobTitle || '',
              activeWorkspaceId: d.activeWorkspaceId,
              isPendingSync: snap.metadata.hasPendingWrites,
              fromCache: snap.metadata.fromCache,
            });
          }
        },
        (err) => handleFirestoreError(err, OperationType.GET, `users/${uid}`)
      )
    );

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
            .map((d) => ({
              ...(d.data() as unknown as T),
              id: d.id,
              isPendingSync: d.metadata.hasPendingWrites,
              fromCache: d.metadata.fromCache,
            }))
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
  }, [authReady, firebaseUser, userProfile?.activeWorkspaceId]);

  // Computed Permissions
  const isOwner = useMemo(() => {
    if (!firebaseUser || !workspace) return false;
    return workspace.ownerId === firebaseUser.uid;
  }, [firebaseUser, workspace]);

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
      if (!firebaseUser || !workspace || !userProfile) return;
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
    [firebaseUser, workspace, userProfile]
  );

  // Auth Handlers
  const loginWithGoogle = useCallback(async () => {
    try {
      const res = await signInWithPopup(auth, googleProvider);
      if (res.user) {
        await ensureUserAndWorkspace(res.user);
        showToast('تم تسجيل الدخول بنجاح', 'success');
      }
    } catch (error) {
      showToast(translateFirebaseError(error), 'error');
      throw error;
    }
  }, [ensureUserAndWorkspace, showToast]);

  const loginWithEmail = useCallback(
    async (email: string, pass: string) => {
      try {
        const res = await signInWithEmailAndPassword(auth, email.trim(), pass);
        if (res.user && res.user.emailVerified) {
          await ensureUserAndWorkspace(res.user);
          showToast('تم تسجيل الدخول بنجاح', 'success');
        } else if (res.user && !res.user.emailVerified) {
          showToast('يرجى تفعيل بريدك الإلكتروني عبر الرابط المرسل إليك لإتمام الدخول الآمن.', 'warning');
        }
      } catch (error) {
        showToast(translateFirebaseError(error), 'error');
        throw error;
      }
    },
    [ensureUserAndWorkspace, showToast]
  );

  const registerWithEmail = useCallback(
    async (name: string, email: string, pass: string) => {
      try {
        const res = await createUserWithEmailAndPassword(auth, email.trim(), pass);
        if (res.user) {
          await updateProfile(res.user, { displayName: name.trim() });
          await sendEmailVerification(res.user);
          showToast('تم إنشاء الحساب وإرسال رابط التفعيل إلى بريدك الإلكتروني.', 'success');
        }
      } catch (error) {
        showToast(translateFirebaseError(error), 'error');
        throw error;
      }
    },
    [showToast]
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
      showToast('تمت إعادة إرسال رسالة تأكيد البريد الإلكتروني.', 'success');
    } catch (error) {
      showToast(translateFirebaseError(error), 'error');
    }
  }, [showToast]);

  const refreshAuthUser = useCallback(async () => {
    if (!auth.currentUser) return;
    await auth.currentUser.reload();
    const refreshed = auth.currentUser;
    setFirebaseUser({ ...refreshed } as FirebaseUser);
    if (refreshed.emailVerified) {
      await ensureUserAndWorkspace(refreshed);
      showToast('تم التحقق من البريد الإلكتروني وتفعيل مساحة العمل بنجاح!', 'success');
    } else {
      showToast('لم يتم تأكيد البريد بعد. يرجى فتح الرسالة في بريدك والضغط على رابط التفعيل.', 'warning');
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
      if (!firebaseUser || !workspace || !isOwner) {
        showToast('فقط مالك مساحة العمل يمكنه تعديل إعداداتها.', 'error');
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
    [firebaseUser, workspace, isOwner, writeAuditLog, showToast]
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
        // Do NOT randomly distribute units across floors when not specified by user
        const floorNote =
          input.floorsCount > 0 ? `غير محدد (إجمالي أدوار المبنى: ${input.floorsCount})` : 'غير محدد';

        for (let i = 1; i <= (Number(input.apartmentsCount) || 0); i++) {
          const unitId = generateSafeId(`unit_apt${i}`);
          const unitNumber = `شقة ${i}`;
          createdUnitNumbers.push(unitNumber);
          batch.set(doc(db, 'property_units', unitId), {
            workspaceId: workspace.id,
            ownerId: workspace.ownerId,
            propertyId: createdPropertyId,
            propertyTitle: finalPropertyTitle,
            taxpayerId,
            unitNumber: sanitizeText(unitNumber, 50, 1, `A-${i}`),
            unitType: 'apartment',
            floor: sanitizeText(floorNote, 40),
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
            floor: sanitizeText('الدور الأرضي / غير محدد', 40),
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
            floor: sanitizeText(floorNote, 40),
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
        await setDoc(visitRef, {
          workspaceId: workspace.id,
          ownerId: workspace.ownerId,
          propertyId: sanitizeText(input.propertyId || 'general_prop', 128, 1, 'general_prop'),
          propertyTitle: sanitizeText(input.propertyTitle, 150, 1, 'عقار'),
          taxpayerId: sanitizeText(input.taxpayerId, 128, 1, 'general_tp'),
          taxpayerName: sanitizeText(input.taxpayerName, 150, 1, 'مكلف'),
          visitDate: sanitizeText(input.visitDate, 40, 8, new Date().toISOString().slice(0, 10)),
          visitTime: sanitizeText(input.visitTime, 20, 3, '10:00'),
          purpose: input.purpose,
          status: input.status,
          latitude: Math.max(-90, Math.min(90, Number(input.latitude) || 0)),
          longitude: Math.max(-180, Math.min(180, Number(input.longitude) || 0)),
          hasCoordinates: Boolean(input.hasCoordinates),
          photoSummary: sanitizeText(input.photoSummary, 500),
          notes: sanitizeText(input.notes, 1500),
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

        await writeAuditLog('create', 'visit', id, `تسجيل زيارة ميدانية للعقار: ${input.propertyTitle}`);
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
        await setDoc(apptRef, {
          workspaceId: workspace.id,
          ownerId: workspace.ownerId,
          title: sanitizeText(input.title, 150, 2, 'موعد ميداني'),
          propertyId: sanitizeText(input.propertyId || 'general_prop', 128, 1, 'general_prop'),
          propertyTitle: sanitizeText(input.propertyTitle, 150, 1, 'عقار'),
          taxpayerId: sanitizeText(input.taxpayerId || 'general_tp', 128, 1, 'general_tp'),
          taxpayerName: sanitizeText(input.taxpayerName, 150, 1, 'مكلف'),
          scheduledDate: sanitizeText(input.scheduledDate, 40, 8, new Date().toISOString().slice(0, 10)),
          scheduledTime: sanitizeText(input.scheduledTime, 20, 3, '10:00'),
          locationText: sanitizeText(input.locationText, 250),
          status: input.status,
          postponeCount: 0,
          lastPostponeReason: '',
          notes: sanitizeText(input.notes, 1000),
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
        await setDoc(doc(db, 'notifications', notifId), {
          workspaceId: workspace.id,
          ownerId: workspace.ownerId,
          title: sanitizeText(`موعد جديد: ${input.title}`, 150, 1, 'موعد جديد'),
          message: sanitizeText(
            `بتاريخ ${input.scheduledDate} الساعة ${input.scheduledTime} — ${input.propertyTitle}`,
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

        await writeAuditLog('create', 'appointment', id, `جدولة موعد: ${input.title} (${input.scheduledDate})`);
        showToast('تمت جدولة الموعد وإضافة تذكير', 'success');
        return id;
      } catch (error) {
        showToast(translateFirebaseError(error), 'error');
        handleFirestoreError(error, OperationType.CREATE, path);
      }
    },
    [firebaseUser, workspace, userProfile, writeAuditLog, showToast]
  );

  const postponeAppointment = useCallback(
    async (appointment: Appointment, newDate: string, newTime: string, reason: string) => {
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

        // 2. Update Appointment
        await updateDoc(doc(db, 'appointments', appointment.id), {
          title: appointment.title,
          scheduledDate: sanitizeText(newDate, 40, 8, appointment.scheduledDate),
          scheduledTime: sanitizeText(newTime, 20, 3, appointment.scheduledTime),
          locationText: appointment.locationText,
          status: 'postponed',
          postponeCount: (appointment.postponeCount || 0) + 1,
          lastPostponeReason: sanitizeText(reason, 500, 2, 'تأجيل تشغيلي'),
          notes: appointment.notes,
          memberUids: workspace.memberUids,
          updatedAt: serverTimestamp(),
        });

        await writeAuditLog(
          'postpone',
          'appointment',
          appointment.id,
          `تأجيل الموعد (${appointment.title}) إلى ${newDate} — السبب: ${reason}`
        );
        showToast('تمت إعادة جدولة الموعد وتوثيق سبب التأجيل', 'success');
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
        await updateDoc(doc(db, 'appointments', appointment.id), {
          title: appointment.title,
          scheduledDate: appointment.scheduledDate,
          scheduledTime: appointment.scheduledTime,
          locationText: appointment.locationText,
          status,
          postponeCount: appointment.postponeCount,
          lastPostponeReason: appointment.lastPostponeReason,
          notes: appointment.notes,
          memberUids: workspace.memberUids,
          updatedAt: serverTimestamp(),
        });
        await writeAuditLog('update', 'appointment', appointment.id, `تحديث حالة الموعد (${appointment.title}) إلى ${status}`);
        showToast('تم تحديث حالة الموعد', 'success');
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
          currency: sanitizeText(input.currency || workspace.defaultCurrency, 10, 3, 'SAR'),
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
          currency: sanitizeText(input.currency || workspace.defaultCurrency, 10, 3, 'SAR'),
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

  // Team Management (Max 10 members including owner: owner + up to 9 assistants)
  const addTeamMember = useCallback(
    async (
      displayName: string,
      email: string,
      userIdInput: string,
      role: WorkspaceRole,
      canApprove: boolean,
      canDelete: boolean
    ) => {
      if (!isOwner || !workspace || !firebaseUser) {
        showToast('فقط مالك مساحة العمل يستطيع إضافة أو دعوة المساعدين.', 'error');
        return;
      }
      if (members.length >= 10 || workspace.memberUids.length >= 10) {
        showToast('تم الوصول للحد الأقصى للفريق (10 أعضاء: المالك + 9 مساعدين).', 'error');
        return;
      }
      if (role === 'owner') {
        showToast('لا يمكن تعيين عضو آخر بدور مالك مساحة العمل.', 'error');
        return;
      }

      const cleanUid =
        userIdInput.trim().replace(/[^a-zA-Z0-9_-]/g, '') ||
        generateSafeId('assist');
      const memberDocId = `${workspace.id}_${cleanUid}`.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120);
      const updatedMemberUids = Array.from(new Set([...workspace.memberUids, cleanUid])).slice(0, 10);

      try {
        // 1. Update Workspace memberUids if a real UID was linked
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
          displayName: sanitizeText(displayName, 120, 1, 'مساعد ميداني'),
          email: sanitizeText(email, 200, 3, 'assistant@rasd.app'),
          role,
          status: userIdInput.trim() ? 'active' : 'invited',
          canApproveFinancials: canApprove,
          canDeleteRecords: canDelete,
          memberUids: updatedMemberUids,
          createdBy: firebaseUser.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        await writeAuditLog(
          'team_change',
          'member',
          memberDocId,
          `إضافة عضو للفريق: ${displayName} (${email}) بدور ${role}`
        );
        showToast('تمت إضافة المساعد إلى فريق مساحة العمل بنجاح', 'success');
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `workspace_members/${memberDocId}`);
      }
    },
    [isOwner, workspace, firebaseUser, members.length, writeAuditLog, showToast]
  );

  const updateTeamMember = useCallback(
    async (
      member: WorkspaceMember,
      role: WorkspaceRole,
      status: WorkspaceMember['status'],
      canApprove: boolean,
      canDelete: boolean
    ) => {
      if (!isOwner || !workspace) {
        showToast('فقط المالك يستطيع تعديل صلاحيات أعضاء الفريق.', 'error');
        return;
      }
      if (member.userId === workspace.ownerId) {
        showToast('لا يمكن تخفيض أو تعطيل صلاحيات مالك مساحة العمل.', 'warning');
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
        showToast('تم تحديث صلاحيات عضو الفريق', 'success');
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    },
    [isOwner, workspace, writeAuditLog, showToast]
  );

  const removeTeamMember = useCallback(
    async (member: WorkspaceMember) => {
      if (!isOwner || !workspace) return;
      if (member.userId === workspace.ownerId) {
        showToast('لا يمكن إزالة مالك مساحة العمل.', 'error');
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
        }
        await writeAuditLog('team_change', 'member', member.id, `إزالة العضو (${member.displayName}) من الفريق`);
        showToast('تم إزالة العضو من مساحة العمل', 'info');
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, path);
      }
    },
    [isOwner, workspace, writeAuditLog, showToast]
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
    canApproveFinancials,
    canDeleteRecords,
    pendingSyncCount,
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
    addAppointment,
    postponeAppointment,
    updateAppointmentStatus,
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
