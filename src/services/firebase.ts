import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  inMemoryPersistence,
  GoogleAuthProvider,
  User as FirebaseUser,
  UserCredential,
  getAdditionalUserInfo,
  createUserWithEmailAndPassword,
  reauthenticateWithCredential,
  updateProfile,
  updateEmail,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
  getFirestore,
  doc,
  getDocFromServer,
  setLogLevel,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { FirestoreErrorInfo, OperationType } from '../types/rasd';

// Prevent Firestore internal 10s offline-mode fallback notices from triggering runtime error overlays
try {
  setLogLevel('silent');
} catch {
  // Ignore if unsupported
}

const app = initializeApp(firebaseConfig);

const dbId =
  firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
    ? firebaseConfig.firestoreDatabaseId
    : undefined;

const firestoreSettings = {
  localCache: persistentLocalCache({
    tabManager: persistentSingleTabManager({ forceOwnership: true }),
  }),
  experimentalAutoDetectLongPolling: true,
};

let firestoreInstance;
try {
  firestoreInstance = dbId
    ? initializeFirestore(app, firestoreSettings, dbId)
    : initializeFirestore(app, firestoreSettings);
} catch {
  firestoreInstance = dbId ? getFirestore(app, dbId) : getFirestore(app);
}

export const db = firestoreInstance;
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('openid');
googleProvider.addScope('email');
googleProvider.addScope('profile');
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const FIREBASE_PROJECT_ID = firebaseConfig.projectId;
export const FIRESTORE_DATABASE_ID = firebaseConfig.firestoreDatabaseId;

export const VERIFIED_AUTH_SESSION_META_KEY = '__rasdVerifiedAuthSessionMeta' as const;

export interface VerifiedAuthSessionMeta {
  syncedAtIso: string;
  signInProvider: string | null;
  tokenEmail: string | null;
  tokenEmailVerified: boolean;
  hasVerifiedGoogleTokenIdentity: boolean;
  oauthProfileEmail: string | null;
  oauthProfileEmailVerified: boolean;
  googleProviderEmail: string | null;
  emailSyncStatus:
    | 'top_level_email_present'
    | 'synced_to_top_level_via_update_email'
    | 'verified_via_google_id_token'
    | 'unverified_or_missing';
  updateEmailErrorCode: string | null;
}

/**
 * قراءة بيانات الجلسة الموثقة المرتبطة بكائن FirebaseUser الأصلي دون نسخه أو تحويله لكائن عادي.
 */
export function getVerifiedAuthSessionMeta(
  user: unknown
): VerifiedAuthSessionMeta | null {
  if (!user || typeof user !== 'object') return null;
  const raw = (user as Record<string, unknown>)[VERIFIED_AUTH_SESSION_META_KEY];
  if (!raw || typeof raw !== 'object') return null;
  return raw as VerifiedAuthSessionMeta;
}

/**
 * ربط بيانات التوثيق المستخرجة من رمز جلسة Firebase (getIdTokenResult) بكائن FirebaseUser الأصلي
 * عبر خاصية غير قابلة للتعداد (non-enumerable) لضمان بقاء كائن FirebaseUser الأصلي بكامل خصائصه ودواله.
 */
export function attachVerifiedAuthSessionMeta<T extends object>(
  user: T,
  meta: VerifiedAuthSessionMeta
): T {
  try {
    Object.defineProperty(user, VERIFIED_AUTH_SESSION_META_KEY, {
      value: meta,
      configurable: true,
      enumerable: false,
      writable: true,
    });
  } catch {
    (user as Record<string, unknown>)[VERIFIED_AUTH_SESSION_META_KEY] = meta;
  }
  return user;
}

/**
 * مزامنة وتحديث جلسة مستخدم Firebase الأصلي (خصوصًا عند الدخول عبر Google عندما يكون user.email == null
 * بسبب إعدادات تعدد الحسابات للبريد الواحد أو وجود حساب سابق بنفس البريد في Firebase Auth).
 * - يحتفظ بكائن FirebaseUser الأصلي (auth.currentUser) ولا ينشئ نسخة عادية منه أبدًا.
 * - يحاول تحديث user.email عبر updateEmail + reload إذا كان البريد موجودًا في مزوّد google.com ومفقودًا من المستوى الأعلى.
 * - يفحص رمز الهوية الموقّع من خادم Firebase (getIdTokenResult) للتحقق الفعلي من المزوّد (google.com) وتوثيق البريد.
 */
export async function syncFirebaseUserAuthSession(
  user: FirebaseUser | null,
  credential?: UserCredential | null
): Promise<FirebaseUser | null> {
  if (!user) return null;

  let liveUser: FirebaseUser =
    auth.currentUser && auth.currentUser.uid === user.uid ? auth.currentUser : user;

  // استخراج بيانات ملف OAuth الإضافية من عملية تسجيل الدخول المباشرة إن توفرت
  let oauthProfileEmail: string | null = null;
  let oauthProfileEmailVerified = false;
  if (credential) {
    try {
      const additionalInfo = getAdditionalUserInfo(credential);
      const profile = additionalInfo?.profile as Record<string, unknown> | null | undefined;
      if (profile && typeof profile.email === 'string' && profile.email.trim()) {
        oauthProfileEmail = profile.email.trim().toLowerCase();
      }
      if (
        profile &&
        (profile.verified_email === true || profile.email_verified === true)
      ) {
        oauthProfileEmailVerified = true;
      }
    } catch {
      // ignore if additionalUserInfo is unavailable
    }
  }

  const getGoogleProviderEmail = (u: FirebaseUser): string | null => {
    const providers = Array.isArray(u.providerData) ? u.providerData : [];
    const googleEntry = providers.find((p) => p && p.providerId === 'google.com');
    if (googleEntry && typeof googleEntry.email === 'string' && googleEntry.email.trim()) {
      return googleEntry.email.trim().toLowerCase();
    }
    return null;
  };

  let googleProviderEmail = getGoogleProviderEmail(liveUser) || oauthProfileEmail;
  let updateEmailErrorCode: string | null = null;
  let syncedViaUpdateEmail = false;

  // 1. إذا كان البريد الأساسي مفقودًا أو غير موثق، نحدث الكائن الأصلي من خادم Firebase Auth أولًا
  if (!liveUser.email || !liveUser.emailVerified) {
    try {
      if (typeof liveUser.reload === 'function') {
        await liveUser.reload();
        if (auth.currentUser && auth.currentUser.uid === liveUser.uid) {
          liveUser = auth.currentUser;
        }
        googleProviderEmail = getGoogleProviderEmail(liveUser) || googleProviderEmail;
      }
    } catch {
      // ignore reload network failure
    }
  }

  // 2. إذا ظل liveUser.email فارغًا (null) بينما البريد موجود في مزوّد google.com، نحاول ترقيته للمستوى الأعلى عبر updateEmail
  if (!liveUser.email && googleProviderEmail && typeof updateEmail === 'function') {
    try {
      if (credential && typeof reauthenticateWithCredential === 'function') {
        try {
          const oauthCred = GoogleAuthProvider.credentialFromResult(credential);
          if (oauthCred) {
            await reauthenticateWithCredential(liveUser, oauthCred);
          }
        } catch {
          // ignore reauthentication fallback error and attempt updateEmail directly
        }
      }
      await updateEmail(liveUser, googleProviderEmail);
      syncedViaUpdateEmail = true;
      if (typeof liveUser.reload === 'function') {
        await liveUser.reload();
      }
      if (auth.currentUser && auth.currentUser.uid === liveUser.uid) {
        liveUser = auth.currentUser;
      }
      if (typeof liveUser.getIdToken === 'function') {
        await liveUser.getIdToken(true);
      }
    } catch (err) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code?: unknown }).code)
          : err instanceof Error
          ? err.message
          : 'update_email_failed';
      updateEmailErrorCode = code;
    }
  }

  // 3. فحص رمز الجلسة الموقّع رقميًا من خادم Firebase Auth (getIdTokenResult)
  let signInProvider: string | null = null;
  let tokenEmail: string | null = null;
  let tokenEmailVerified = false;
  let hasVerifiedGoogleTokenIdentity = false;

  if (typeof liveUser.getIdTokenResult === 'function') {
    try {
      let tokenResult;
      try {
        tokenResult = await liveUser.getIdTokenResult(
          Boolean(syncedViaUpdateEmail || !liveUser.email || !liveUser.emailVerified)
        );
      } catch {
        tokenResult = await liveUser.getIdTokenResult(false);
      }

      if (tokenResult) {
        const claims = (tokenResult.claims || {}) as Record<string, unknown>;
        const firebaseClaim =
          claims.firebase && typeof claims.firebase === 'object'
            ? (claims.firebase as Record<string, unknown>)
            : null;

        signInProvider =
          (typeof tokenResult.signInProvider === 'string' && tokenResult.signInProvider) ||
          (firebaseClaim && typeof firebaseClaim.sign_in_provider === 'string'
            ? firebaseClaim.sign_in_provider
            : null);

        if (typeof claims.email === 'string' && claims.email.trim()) {
          tokenEmail = claims.email.trim().toLowerCase();
        }
        if (claims.email_verified === true) {
          tokenEmailVerified = true;
        }

        const identities =
          firebaseClaim &&
          firebaseClaim.identities &&
          typeof firebaseClaim.identities === 'object'
            ? (firebaseClaim.identities as Record<string, unknown>)
            : null;

        const googleIdentities =
          identities && Array.isArray(identities['google.com'])
            ? (identities['google.com'] as unknown[])
            : [];

        const emailIdentities =
          identities && Array.isArray(identities['email'])
            ? (identities['email'] as unknown[])
            : [];

        if (!tokenEmail && emailIdentities.length > 0 && typeof emailIdentities[0] === 'string') {
          tokenEmail = emailIdentities[0].trim().toLowerCase();
        }

        if (signInProvider === 'google.com' && (googleIdentities.length > 0 || emailIdentities.length > 0)) {
          hasVerifiedGoogleTokenIdentity = true;
        }
      }
    } catch {
      // ignore token inspection failure if offline
    }
  }

  const finalGoogleProviderEmail = getGoogleProviderEmail(liveUser) || googleProviderEmail;
  const hasTopLevelEmail = Boolean(
    typeof liveUser.email === 'string' && liveUser.email.trim()
  );

  const isGoogleTokenVerified =
    signInProvider === 'google.com' &&
    (hasVerifiedGoogleTokenIdentity || tokenEmailVerified || oauthProfileEmailVerified);

  let emailSyncStatus: VerifiedAuthSessionMeta['emailSyncStatus'] = 'unverified_or_missing';
  if (hasTopLevelEmail && syncedViaUpdateEmail) {
    emailSyncStatus = 'synced_to_top_level_via_update_email';
  } else if (hasTopLevelEmail) {
    emailSyncStatus = 'top_level_email_present';
  } else if (isGoogleTokenVerified && (tokenEmail || finalGoogleProviderEmail)) {
    emailSyncStatus = 'verified_via_google_id_token';
  }

  attachVerifiedAuthSessionMeta(liveUser, {
    syncedAtIso: new Date().toISOString(),
    signInProvider,
    tokenEmail,
    tokenEmailVerified,
    hasVerifiedGoogleTokenIdentity,
    oauthProfileEmail,
    oauthProfileEmailVerified,
    googleProviderEmail: finalGoogleProviderEmail,
    emailSyncStatus,
    updateEmailErrorCode,
  });

  return liveUser;
}

/**
 * Creates a Firebase Auth account for a new team member using an isolated secondary
 * FirebaseApp with in-memory persistence so the Primary Manager's session is never affected.
 */
export async function createTeamUserAuthAccount(
  email: string,
  password: string,
  displayName: string
): Promise<{ uid: string; email: string }> {
  const secondaryAppName = 'RasdTeamMemberCreatorApp';
  const existingSecondary = getApps().find((a) => a.name === secondaryAppName);
  const secondaryApp = existingSecondary || initializeApp(firebaseConfig, secondaryAppName);

  let secondaryAuth;
  try {
    secondaryAuth = initializeAuth(secondaryApp, {
      persistence: inMemoryPersistence,
    });
  } catch {
    secondaryAuth = getAuth(secondaryApp);
  }

  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email.trim(), password);
    if (displayName.trim()) {
      await updateProfile(cred.user, { displayName: displayName.trim() });
    }
    const uid = cred.user.uid;
    const createdEmail = cred.user.email || email.trim();
    return { uid, email: createdEmail };
  } finally {
    try {
      await firebaseSignOut(secondaryAuth);
    } catch {
      // Ignore signout error on secondary instance
    }
  }
}

export async function testConnection(): Promise<boolean> {
  if (!firebaseConfig.projectId || !firebaseConfig.apiKey) {
    console.warn('Firebase configuration is incomplete.');
    return false;
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return false;
  }
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      // Operating in offline mode with persistentLocalCache enabled
      return false;
    }
    // Permission denied on /test/connection still proves server connectivity
    return true;
  }
}

// Run non-blocking connection check after initial app boot
if (typeof window !== 'undefined') {
  setTimeout(() => {
    void testConnection();
  }, 3500);
}

export interface PermissionDeniedSecurityEvent {
  id: string;
  uid: string;
  email: string;
  path: string;
  operationType: string;
  timestampIso: string;
  summary: string;
}

const accessDeniedListeners: Array<(event: PermissionDeniedSecurityEvent) => void> = [];

export function subscribeToAccessDeniedEvents(
  listener: (event: PermissionDeniedSecurityEvent) => void
): () => void {
  accessDeniedListeners.push(listener);
  return () => {
    const idx = accessDeniedListeners.indexOf(listener);
    if (idx >= 0) accessDeniedListeners.splice(idx, 1);
  };
}

export function logPermissionDeniedSecurityEvent(params: {
  path?: string | null;
  operationType?: string | null;
  error?: unknown;
}): PermissionDeniedSecurityEvent {
  const user = auth.currentUser;
  const uid = user?.uid || 'unauthenticated';
  const email = (user?.email || 'missing_email').toLowerCase();
  const cleanPath = (params.path || 'unknown_path')
    .replace(/[^a-zA-Z0-9_\-\/]/g, '_')
    .slice(0, 120);
  const op = params.operationType || 'unknown_operation';
  const timestampIso = new Date().toISOString();
  const id = generateSafeId('sec_denied');

  // توثيق ملخص أمني خالي من أي أسرار أو رموز دخول لمساعدة المالكين في تشخيص المشكلة
  const summary = `[أمان المنصة] محاولة وصول مرفوضة (permission-denied) للعملية (${op}) على المسار: ${cleanPath} | البريد: ${email} | UID: ${uid}`;

  const event: PermissionDeniedSecurityEvent = {
    id,
    uid,
    email,
    path: cleanPath,
    operationType: op,
    timestampIso,
    summary,
  };

  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem('rasd_security_audit_denied_logs');
      const existing: PermissionDeniedSecurityEvent[] = raw ? JSON.parse(raw) : [];
      const updated = [event, ...existing].slice(0, 100);
      localStorage.setItem('rasd_security_audit_denied_logs', JSON.stringify(updated));
    }
  } catch {
    // ignore local storage errors
  }

  accessDeniedListeners.forEach((listener) => {
    try {
      listener(event);
    } catch {
      // ignore individual listener errors
    }
  });

  return event;
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const isDenied =
    error &&
    typeof error === 'object' &&
    ('code' in error || 'message' in error) &&
    (String((error as { code?: unknown }).code || '').includes('permission-denied') ||
      String((error as { message?: unknown }).message || '').includes('permission-denied') ||
      String((error as { message?: unknown }).message || '').includes('Missing or insufficient permissions'));

  if (isDenied) {
    try {
      logPermissionDeniedSecurityEvent({ path, operationType, error });
    } catch {
      // non-fatal
    }
  }

  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.warn('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function generateSafeId(prefix: string): string {
  const cleanPrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 16) || 'rec';
  const rand = Math.random().toString(36).substring(2, 10);
  const ts = Date.now().toString(36);
  return `${cleanPrefix}_${ts}_${rand}`;
}

export function sanitizeText(value: string, maxLength: number, minLength = 0, fallback = ''): string {
  const trimmed = (value || '').trim().slice(0, maxLength);
  if (trimmed.length < minLength) {
    return fallback.slice(0, maxLength);
  }
  return trimmed;
}

export function translateFirebaseError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (raw.includes('Quota exceeded')) {
    return 'تم تجاوز الحصة اليومية المجانية لقاعدة البيانات (Quota exceeded). ستُعاد تهيئة الحصة غدًا.';
  }
  if (raw.includes('auth/invalid-credential') || raw.includes('auth/wrong-password') || raw.includes('auth/user-not-found')) {
    return 'بيانات الدخول غير صحيحة. يرجى التحقق من البريد الإلكتروني وكلمة المرور.';
  }
  if (raw.includes('auth/email-already-in-use')) {
    return 'هذا البريد الإلكتروني مسجل مسبقًا. يمكنك تسجيل الدخول أو استعادة كلمة المرور.';
  }
  if (raw.includes('auth/weak-password')) {
    return 'كلمة المرور ضعيفة جدًا. يجب أن تتكون من 6 أحرف على الأقل.';
  }
  if (raw.includes('auth/operation-not-allowed') || raw.includes('PASSWORD_LOGIN_DISABLED')) {
    return 'تسجيل الدخول بالبريد وكلمة المرور غير مفعل بعد في Firebase Console. يرجى استخدام الدخول عبر Google أو تفعيل Email/Password من لوحة تحكم Firebase.';
  }
  if (raw.includes('auth/popup-closed-by-user')) {
    return 'تم إغلاق نافذة Google المنبثقة قبل إكمال اختيار الحساب. يرجى الضغط مرة أخرى واختيار حسابك.';
  }
  if (raw.includes('auth/cancelled-popup-request')) {
    return 'توجد نافذة تسجيل دخول مفتوحة بالفعل. يرجى إكمال الدخول من النافذة المفتوحة.';
  }
  if (raw.includes('auth/network-request-failed')) {
    return 'تعذر الاتصال بالشبكة. يرجى التحقق من اتصالك بالإنترنت.';
  }
  if (raw.includes('auth/unauthorized-domain')) {
    const domain = typeof window !== 'undefined' ? window.location.hostname : '';
    return `النطاق الحالي (${domain}) غير مضاف في قائمة النطاقات المصرح بها (Authorized Domains) داخل Firebase Console.`;
  }
  if (raw.includes('auth/popup-blocked')) {
    return 'قام المتصفح بحظر النافذة المنبثقة لتسجيل الدخول. يرجى السماح بالنوافذ المنبثقة (Popups) وإعادة المحاولة.';
  }
  if (raw.includes('Missing or insufficient permissions') || raw.includes('PERMISSION_DENIED')) {
    return 'ليس لديك صلاحية كافية لتنفيذ هذه العملية في مساحة العمل الحالية.';
  }
  return `حدث خطأ أثناء تنفيذ العملية: ${raw.slice(0, 140)}`;
}
