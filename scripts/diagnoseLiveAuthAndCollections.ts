import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  terminate,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import {
  syncFirebaseUserAuthSession,
  createVerifiedUserProxy,
  getVerifiedAuthSessionMeta,
} from '../src/services/firebase';
import {
  verifyPlatformOwnerIdentity,
  inspectOwnerSessionDiagnostic,
} from '../src/services/licenseService';

async function runLiveDiagnostics() {
  console.log('================================================================');
  console.log('🔍 تشخيص بيئة Firebase الحية وفحص التوافق والجلسات');
  console.log('================================================================\n');

  console.log('معلومات المشروع الحي:');
  console.log('- Project ID:', firebaseConfig.projectId);
  console.log('- Database ID:', firebaseConfig.firestoreDatabaseId);
  console.log('- Auth Domain:', firebaseConfig.authDomain);

  const app = initializeApp(firebaseConfig, 'live-diag-app');
  const auth = getAuth(app);
  const db =
    firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
      ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
      : getFirestore(app);

  try {
    // 1. اختبار التوافق البرمجي لتغليف Proxy مع دوال Firebase SDK الأصلية
    console.log('\n--- 1. اختبار توافق createVerifiedUserProxy مع دوال Firebase SDK ---');
    const dummyUser = {
      uid: 'test_uid_proxy_123',
      email: null,
      emailVerified: false,
      providerData: [{ providerId: 'google.com', email: 'ahah26h@gmail.com' }],
      getIdToken: async (force?: boolean) => `mock_token_force_${Boolean(force)}`,
      getIdTokenResult: async () => ({
        token: 'mock_jwt',
        claims: { email: 'ahah26h@gmail.com', email_verified: true },
        signInProvider: 'google.com',
      }),
      reload: async () => {},
    } as any;

    const proxied = createVerifiedUserProxy(dummyUser, 'ahah26h@gmail.com', true);
    console.log('خاصية proxied.email:', proxied.email);
    console.log('خاصية proxied.emailVerified:', proxied.emailVerified);
    const tokenVal = await proxied.getIdToken(true);
    console.log('استدعاء proxied.getIdToken(true) بنجاح:', tokenVal);
    const tokenRes = await proxied.getIdTokenResult();
    console.log('استدعاء proxied.getIdTokenResult() بنجاح:', tokenRes.signInProvider);

    // 2. اختبار محاولة المصادقة في بيئة Node الحية
    console.log('\n--- 2. محاولة فحص تسجيل الدخول عبر Firebase Auth في بيئة السحابة الحية ---');
    let liveClientUser = null;
    const testClientEmail = `client.test.${Date.now()}@example.com`;
    const testClientPass = 'RasdSecureTestPass2026!';

    try {
      const cred = await createUserWithEmailAndPassword(auth, testClientEmail, testClientPass);
      liveClientUser = cred.user;
      console.log('تم إنشاء حساب عميل تجريبي حي بنجاح في Firebase Auth:');
      console.log('- UID:', liveClientUser.uid);
      console.log('- Email:', liveClientUser.email);
      console.log('- EmailVerified:', liveClientUser.emailVerified);
      console.log('- ProviderData:', JSON.stringify(liveClientUser.providerData));

      const tokenResult = await liveClientUser.getIdTokenResult();
      console.log('- Claims الفعلية (بدون أسرار):', {
        aud: tokenResult.claims.aud,
        iss: tokenResult.claims.iss,
        sign_in_provider: tokenResult.signInProvider,
        email: tokenResult.claims.email,
        email_verified: tokenResult.claims.email_verified,
      });

      // اختبار قراءة المجموعات الإدارية بحساب العميل الحي
      console.log('\n--- 3. اختبار قراءة مجموعات الإدارة بحساب العميل الحي في Firestore الحقيقي ---');
      const collectionsToCheck = [
        'account_licenses',
        'users',
        'workspaces',
        'workspace_members',
        'platform_staff',
        'audit_logs',
      ];

      for (const col of collectionsToCheck) {
        try {
          await getDocs(collection(db, col));
          console.log(`❌ ثغرة أمنية: استطاع العميل الحي قراءة مجموعة ${col}!`);
        } catch (err: any) {
          console.log(`✅ [أمان سليم] رُفضت قراءة ${col} للعميل الحي بـ:`, err.code || err.message);
        }
      }

      // اختبار محاولة العميل الحي تعديل ترخيصه في /account_licenses
      try {
        await setDoc(doc(db, 'account_licenses', `ws_${liveClientUser.uid}`), {
          workspaceId: `ws_${liveClientUser.uid}`,
          ownerId: liveClientUser.uid,
          ownerEmail: testClientEmail,
          status: 'active', // محاولة تفعيل الحساب ذاتيًا
          planId: 'lifetime',
          startsAt: new Date(),
          expiresAt: new Date(Date.now() + 86400000),
          maxMembers: 10,
          notes: 'self-activation attempt',
        });
        console.log('❌ ثغرة أمنية: استطاع العميل الحي تفعيل حسابه ذاتيًا!');
      } catch (err: any) {
        console.log('✅ [أمان سليم] رُفض تفعيل الحساب الذاتي للعميل الحي بـ:', err.code || err.message);
      }
    } catch (authErr: any) {
      console.log('ملاحظة مصادقة البريد في بيئة Node الحية:', authErr.code, authErr.message);
    } finally {
      if (auth.currentUser) {
        try {
          await signOut(auth);
        } catch {}
      }
    }
  } finally {
    try {
      await terminate(db);
    } catch {}
  }
  process.exit(0);
}

runLiveDiagnostics().catch((err) => {
  console.error('Fatal live diag error:', err);
  process.exit(1);
});
