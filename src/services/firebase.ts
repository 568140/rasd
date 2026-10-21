import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  getFirestore,
  doc,
  getDocFromServer,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { FirestoreErrorInfo, OperationType } from '../types/rasd';

const app = initializeApp(firebaseConfig);

const dbId =
  firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
    ? firebaseConfig.firestoreDatabaseId
    : undefined;

let firestoreInstance;
try {
  firestoreInstance = dbId
    ? initializeFirestore(
        app,
        {
          localCache: persistentLocalCache({
            tabManager: persistentMultipleTabManager(),
          }),
        },
        dbId
      )
    : initializeFirestore(app, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      });
} catch {
  firestoreInstance = dbId ? getFirestore(app, dbId) : getFirestore(app);
}

export const db = firestoreInstance;
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const FIREBASE_PROJECT_ID = firebaseConfig.projectId;
export const FIRESTORE_DATABASE_ID = firebaseConfig.firestoreDatabaseId;

export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
      return false;
    }
    // Permission denied on /test/connection still proves server connectivity
    return true;
  }
}

// Run connection test on boot as required
testConnection();

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
  console.error('Firestore Error: ', JSON.stringify(errInfo));
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
  if (raw.includes('auth/operation-not-allowed')) {
    return 'تسجيل الدخول بالبريد وكلمة المرور غير مفعل بعد في Firebase Console. يرجى استخدام الدخول عبر Google أو تفعيل Email/Password من لوحة تحكم Firebase.';
  }
  if (raw.includes('auth/popup-closed-by-user')) {
    return 'تم إغلاق نافذة تسجيل الدخول قبل إتمام العملية.';
  }
  if (raw.includes('auth/network-request-failed')) {
    return 'تعذر الاتصال بالشبكة. يرجى التحقق من اتصالك بالإنترنت.';
  }
  if (raw.includes('auth/unauthorized-domain')) {
    return 'هذا النطاق (رابط Vercel) غير مصرح به في Firebase. يرجى إضافة رابط موقعك إلى النطاقات المصرح بها (Authorized Domains) في لوحة تحكم Firebase Console.';
  }
  if (raw.includes('auth/popup-blocked')) {
    return 'قام المتصفح بحظر النافذة المنبثقة لتسجيل الدخول. يرجى السماح بالنوافذ المنبثقة (Popups) وإعادة المحاولة.';
  }
  if (raw.includes('Missing or insufficient permissions') || raw.includes('PERMISSION_DENIED')) {
    if (auth.currentUser && !auth.currentUser.emailVerified) {
      return 'يرجى تأكيد بريدك الإلكتروني أولًا لتتمكن من قراءة أو حفظ البيانات.';
    }
    return 'ليس لديك صلاحية كافية لتنفيذ هذه العملية في مساحة العمل الحالية.';
  }
  return 'حدث خطأ أثناء تنفيذ العملية. يرجى المحاولة مرة أخرى.';
}
