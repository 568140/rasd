import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  inMemoryPersistence,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  updateProfile,
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
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const FIREBASE_PROJECT_ID = firebaseConfig.projectId;
export const FIRESTORE_DATABASE_ID = firebaseConfig.firestoreDatabaseId;

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

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
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
