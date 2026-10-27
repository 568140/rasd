/**
 * خدمة المصادقة البيومترية الحقيقية (WebAuthn / Passkeys + AES-GCM Vault)
 * تتيح للمستخدم:
 * 1. تسجيل بصمة الإصبع أو الوجه الحقيقية من الجهاز عبر `navigator.credentials.create`
 * 2. التحقق الفعلي من البصمة عبر `navigator.credentials.get`
 * 3. قفل التطبيق بالبصمة وفتحه فوراً، أو تسجيل الدخول السريع من شاشة الدخول
 */

const BIOMETRIC_CONFIG_KEY = 'rasd_biometric_config_v1';
const BIOMETRIC_VAULT_KEY = 'rasd_biometric_vault_v1';
const BIOMETRIC_SESSION_UNLOCKED_KEY = 'rasd_biometric_session_unlocked_v1';
const BIOMETRIC_MANUAL_LOCK_KEY = 'rasd_biometric_manual_lock_v1';
const BIOMETRIC_SOFT_LOGOUT_KEY = 'rasd_biometric_soft_logout_v1';
const BIOMETRIC_OFFLINE_SESSION_KEY = 'rasd_biometric_offline_session_v1';

export interface BiometricConfig {
  enabled: boolean;
  credentialIdBase64: string;
  userUid: string;
  userEmail: string;
  userDisplayName: string;
  authMethod: 'email' | 'google';
  requireUnlockOnLaunch: boolean;
  hasEncryptedCredentials: boolean;
  enrolledAt: string;
}

export interface BiometricOfflineSession {
  uid: string;
  email: string;
  displayName: string;
  activeWorkspaceId: string;
  emailVerified: boolean;
  isGoogleProvider: boolean;
  savedAt: string;
}

interface EncryptedVaultPayload {
  ivBase64: string;
  cipherBase64: string;
  rawKeyBase64: string;
}

export interface BiometricSupportStatus {
  isWebAuthnSupported: boolean;
  isPlatformAuthenticatorAvailable: boolean;
  isInCrossOriginIframe: boolean;
  reasonAr: string | null;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function notifyBiometricStateChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('rasd:biometric-state-change'));
  }
}

export async function checkBiometricSupport(): Promise<BiometricSupportStatus> {
  if (typeof window === 'undefined') {
    return {
      isWebAuthnSupported: false,
      isPlatformAuthenticatorAvailable: false,
      isInCrossOriginIframe: false,
      reasonAr: 'بيئة المتصفح غير متاحة.',
    };
  }

  let isInCrossOriginIframe = false;
  try {
    isInCrossOriginIframe = window.self !== window.top;
  } catch {
    isInCrossOriginIframe = true;
  }

  const isWebAuthnSupported =
    typeof window.PublicKeyCredential !== 'undefined' &&
    typeof navigator.credentials !== 'undefined' &&
    typeof navigator.credentials.create === 'function' &&
    typeof navigator.credentials.get === 'function';

  if (!isWebAuthnSupported) {
    return {
      isWebAuthnSupported: false,
      isPlatformAuthenticatorAvailable: false,
      isInCrossOriginIframe,
      reasonAr:
        'هذا المتصفح لا يدعم واجهة البصمة المعيارية (WebAuthn). يرجى فتح المنصة في متصفح حديث مثل Chrome أو Safari.',
    };
  }

  let isPlatformAuthenticatorAvailable = false;
  try {
    isPlatformAuthenticatorAvailable =
      await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    isPlatformAuthenticatorAvailable = false;
  }

  if (!isPlatformAuthenticatorAvailable) {
    return {
      isWebAuthnSupported: true,
      isPlatformAuthenticatorAvailable: false,
      isInCrossOriginIframe,
      reasonAr: isInCrossOriginIframe
        ? 'أنت تتصفح داخل نافذة معاينة مدمجة (iframe). لتشغيل حساس بصمة الهاتف أو الوجه فعلياً، افتح رابط التطبيق في تبويب مستقل أو من أيقونة التطبيق المثبت على هاتفك.'
        : 'لم يتم العثور على قارئ بصمة أو قفل شاشة مفعّل على هذا الجهاز. يرجى التأكد من تفعيل البصمة أو Face ID في إعدادات جهازك.',
    };
  }

  return {
    isWebAuthnSupported: true,
    isPlatformAuthenticatorAvailable: true,
    isInCrossOriginIframe,
    reasonAr: null,
  };
}

export function getBiometricConfig(): BiometricConfig | null {
  try {
    const raw = localStorage.getItem(BIOMETRIC_CONFIG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BiometricConfig;
    if (!parsed || !parsed.enabled || !parsed.credentialIdBase64) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveBiometricOfflineSession(session: BiometricOfflineSession): void {
  try {
    localStorage.setItem(BIOMETRIC_OFFLINE_SESSION_KEY, JSON.stringify(session));
  } catch {
    // Ignore storage errors
  }
}

export function getBiometricOfflineSession(): BiometricOfflineSession | null {
  try {
    const raw = localStorage.getItem(BIOMETRIC_OFFLINE_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BiometricOfflineSession;
    if (!parsed || !parsed.uid) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function isBiometricSoftLoggedOut(): boolean {
  try {
    return localStorage.getItem(BIOMETRIC_SOFT_LOGOUT_KEY) === '1';
  } catch {
    return false;
  }
}

export function setBiometricSoftLoggedOut(loggedOut: boolean): void {
  try {
    if (loggedOut) {
      localStorage.setItem(BIOMETRIC_SOFT_LOGOUT_KEY, '1');
      sessionStorage.removeItem(BIOMETRIC_SESSION_UNLOCKED_KEY);
    } else {
      localStorage.removeItem(BIOMETRIC_SOFT_LOGOUT_KEY);
    }
    notifyBiometricStateChanged();
  } catch {
    // Ignore storage errors
  }
}

async function encryptCredentials(email: string, password: string): Promise<boolean> {
  try {
    if (!window.crypto?.subtle || !password) return false;
    const key = await window.crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
    const exportedKey = await window.crypto.subtle.exportKey('raw', key);
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(JSON.stringify({ email, password }));
    const cipherBuffer = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoded
    );

    const payload: EncryptedVaultPayload = {
      ivBase64: bytesToBase64(iv),
      cipherBase64: bytesToBase64(new Uint8Array(cipherBuffer)),
      rawKeyBase64: bytesToBase64(new Uint8Array(exportedKey)),
    };
    localStorage.setItem(BIOMETRIC_VAULT_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

async function decryptCredentials(): Promise<{ email: string; password: string } | null> {
  try {
    const raw = localStorage.getItem(BIOMETRIC_VAULT_KEY);
    if (!raw || !window.crypto?.subtle) return null;
    const payload = JSON.parse(raw) as EncryptedVaultPayload;
    if (!payload.ivBase64 || !payload.cipherBase64 || !payload.rawKeyBase64) return null;

    const rawKeyBytes = base64ToBytes(payload.rawKeyBase64);
    const ivBytes = base64ToBytes(payload.ivBase64);
    const cipherBytes = base64ToBytes(payload.cipherBase64);

    const key = await window.crypto.subtle.importKey(
      'raw',
      rawKeyBytes.buffer as ArrayBuffer,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );
    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBytes.buffer as ArrayBuffer },
      key,
      cipherBytes.buffer as ArrayBuffer
    );
    const decoded = JSON.parse(new TextDecoder().decode(decryptedBuffer));
    if (decoded?.email && decoded?.password) {
      return { email: String(decoded.email), password: String(decoded.password) };
    }
    return null;
  } catch {
    return null;
  }
}

export async function saveEncryptedCredentialsForBiometric(
  email: string,
  password: string
): Promise<void> {
  const config = getBiometricConfig();
  if (!config || !config.enabled) return;
  if (config.userEmail.toLowerCase() !== email.trim().toLowerCase()) return;

  const saved = await encryptCredentials(email.trim(), password);
  if (saved) {
    const updated: BiometricConfig = {
      ...config,
      hasEncryptedCredentials: true,
      authMethod: 'email',
    };
    localStorage.setItem(BIOMETRIC_CONFIG_KEY, JSON.stringify(updated));
    notifyBiometricStateChanged();
  }
}

export async function enrollBiometric(params: {
  uid: string;
  email: string;
  displayName: string;
  authMethod: 'email' | 'google';
  passwordForQuickLogin?: string;
  requireUnlockOnLaunch?: boolean;
}): Promise<BiometricConfig> {
  const support = await checkBiometricSupport();
  if (!support.isWebAuthnSupported) {
    throw new Error(
      support.reasonAr || 'المتصفح الحالي لا يدعم المصادقة البيومترية (WebAuthn).'
    );
  }

  const challenge = new Uint8Array(32);
  window.crypto.getRandomValues(challenge);

  const userIdBytes = new TextEncoder().encode(params.uid || params.email);
  const rpId = window.location.hostname;

  try {
    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: {
          name: 'رَصْد — المساعد الميداني الذكي',
          id: rpId,
        },
        user: {
          id: userIdBytes,
          name: params.email || params.displayName || 'rasd-user',
          displayName: params.displayName || params.email || 'مستخدم رَصْد',
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 }, // ES256
          { type: 'public-key', alg: -257 }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred',
        },
        timeout: 60000,
        attestation: 'none',
      },
    })) as PublicKeyCredential | null;

    if (!credential || !credential.rawId) {
      throw new Error('لم يكتمل تسجيل البصمة من الجهاز.');
    }

    const credentialIdBase64 = bytesToBase64(new Uint8Array(credential.rawId));
    let hasEncryptedCredentials = false;
    if (params.passwordForQuickLogin && params.email) {
      hasEncryptedCredentials = await encryptCredentials(
        params.email.trim(),
        params.passwordForQuickLogin
      );
    } else if (localStorage.getItem(BIOMETRIC_VAULT_KEY)) {
      hasEncryptedCredentials = true;
    }

    const config: BiometricConfig = {
      enabled: true,
      credentialIdBase64,
      userUid: params.uid,
      userEmail: params.email.trim(),
      userDisplayName: params.displayName.trim() || params.email.trim(),
      authMethod: hasEncryptedCredentials ? 'email' : params.authMethod,
      requireUnlockOnLaunch: params.requireUnlockOnLaunch ?? true,
      hasEncryptedCredentials,
      enrolledAt: new Date().toISOString(),
    };

    const defaultWsId = `ws_${(params.uid || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || 'default'}`;
    saveBiometricOfflineSession({
      uid: params.uid,
      email: params.email.trim(),
      displayName: params.displayName.trim() || params.email.trim(),
      activeWorkspaceId: defaultWsId,
      emailVerified: true,
      isGoogleProvider: params.authMethod === 'google',
      savedAt: new Date().toISOString(),
    });

    localStorage.setItem(BIOMETRIC_CONFIG_KEY, JSON.stringify(config));
    sessionStorage.setItem(BIOMETRIC_SESSION_UNLOCKED_KEY, '1');
    localStorage.removeItem(BIOMETRIC_MANUAL_LOCK_KEY);
    localStorage.removeItem(BIOMETRIC_SOFT_LOGOUT_KEY);
    notifyBiometricStateChanged();
    return config;
  } catch (err: unknown) {
    const domErr = err as { name?: string; message?: string };
    if (domErr?.name === 'NotAllowedError') {
      if (support.isInCrossOriginIframe) {
        throw new Error(
          'متصفحك يمنع تشغيل حساس البصمة داخل نافذة المعاينة المدمجة (iframe). افتح رابط التطبيق في تبويب مستقل أو من تطبيق الهاتف المثبت لتفعيل البصمة مباشرة.'
        );
      }
      throw new Error('تم إلغاء عملية مسح البصمة أو لم يتم التأكيد من قِبل المستخدم.');
    }
    if (domErr?.name === 'SecurityError') {
      throw new Error(
        'قيود أمان المتصفح تمنع تشغيل البصمة داخل هذه النافذة المدمجة. يرجى فتح الرابط في نافذة متصفح مستقلة أو تطبيق PWA المثبت.'
      );
    }
    throw new Error(
      domErr?.message || 'تعذر تسجيل البصمة على هذا الجهاز. تأكد من تفعيل قفل البصمة في إعدادات جهازك.'
    );
  }
}

export async function verifyBiometric(): Promise<{
  verified: boolean;
  config: BiometricConfig;
  decryptedCredentials: { email: string; password: string } | null;
  offlineSession: BiometricOfflineSession | null;
}> {
  const config = getBiometricConfig();
  if (!config || !config.enabled || !config.credentialIdBase64) {
    throw new Error('البصمة غير مفعّلة على هذا الجهاز بعد.');
  }

  const support = await checkBiometricSupport();
  if (!support.isWebAuthnSupported) {
    throw new Error(
      support.reasonAr || 'هذا المتصفح لا يدعم التحقق بالبصمة (WebAuthn).'
    );
  }

  const challenge = new Uint8Array(32);
  window.crypto.getRandomValues(challenge);
  const credentialIdBytes = base64ToBytes(config.credentialIdBase64);

  try {
    const assertion = (await navigator.credentials.get({
      publicKey: {
        challenge,
        rpId: window.location.hostname,
        allowCredentials: [
          {
            id: credentialIdBytes.buffer as ArrayBuffer,
            type: 'public-key',
            transports: ['internal'],
          },
        ],
        userVerification: 'required',
        timeout: 60000,
      },
    })) as PublicKeyCredential | null;

    if (!assertion) {
      throw new Error('لم يتم التحقق من البصمة.');
    }

    sessionStorage.setItem(BIOMETRIC_SESSION_UNLOCKED_KEY, '1');
    localStorage.removeItem(BIOMETRIC_MANUAL_LOCK_KEY);
    localStorage.removeItem(BIOMETRIC_SOFT_LOGOUT_KEY);
    notifyBiometricStateChanged();

    const decryptedCredentials = config.hasEncryptedCredentials
      ? await decryptCredentials()
      : null;

    return {
      verified: true,
      config,
      decryptedCredentials,
      offlineSession: getBiometricOfflineSession(),
    };
  } catch (err: unknown) {
    const domErr = err as { name?: string; message?: string };
    if (domErr?.name === 'NotAllowedError') {
      if (support.isInCrossOriginIframe) {
        throw new Error(
          'لتشغيل حساس البصمة الفعلي، يرجى فتح المنصة في تبويب مستقل أو من تطبيق الهاتف المثبت (PWA) خارج نافذة المعاينة.'
        );
      }
      throw new Error('لم يكتمل التحقق من البصمة أو تم إلغاء العملية.');
    }
    throw new Error(domErr?.message || 'فشل التحقق من البصمة. حاول مرة أخرى.');
  }
}

export function updateBiometricPreferences(patch: {
  requireUnlockOnLaunch?: boolean;
}): BiometricConfig | null {
  const config = getBiometricConfig();
  if (!config) return null;
  const updated: BiometricConfig = {
    ...config,
    ...(typeof patch.requireUnlockOnLaunch === 'boolean'
      ? { requireUnlockOnLaunch: patch.requireUnlockOnLaunch }
      : {}),
  };
  localStorage.setItem(BIOMETRIC_CONFIG_KEY, JSON.stringify(updated));
  notifyBiometricStateChanged();
  return updated;
}

export function disableBiometric(): void {
  try {
    localStorage.removeItem(BIOMETRIC_CONFIG_KEY);
    localStorage.removeItem(BIOMETRIC_VAULT_KEY);
    localStorage.removeItem(BIOMETRIC_MANUAL_LOCK_KEY);
    localStorage.removeItem(BIOMETRIC_SOFT_LOGOUT_KEY);
    localStorage.removeItem(BIOMETRIC_OFFLINE_SESSION_KEY);
    sessionStorage.removeItem(BIOMETRIC_SESSION_UNLOCKED_KEY);
    notifyBiometricStateChanged();
  } catch {
    // Ignore storage errors
  }
}

export function isSessionBiometricLocked(): boolean {
  try {
    const config = getBiometricConfig();
    if (!config || !config.enabled) return false;
    const manualLock = localStorage.getItem(BIOMETRIC_MANUAL_LOCK_KEY) === '1';
    if (manualLock) return true;
    if (!config.requireUnlockOnLaunch) return false;
    return sessionStorage.getItem(BIOMETRIC_SESSION_UNLOCKED_KEY) !== '1';
  } catch {
    return false;
  }
}

export function lockSessionWithBiometric(): void {
  try {
    const config = getBiometricConfig();
    if (!config || !config.enabled) return;
    sessionStorage.removeItem(BIOMETRIC_SESSION_UNLOCKED_KEY);
    localStorage.setItem(BIOMETRIC_MANUAL_LOCK_KEY, '1');
    notifyBiometricStateChanged();
  } catch {
    // Ignore storage errors
  }
}

export function markSessionBiometricUnlocked(): void {
  try {
    sessionStorage.setItem(BIOMETRIC_SESSION_UNLOCKED_KEY, '1');
    localStorage.removeItem(BIOMETRIC_MANUAL_LOCK_KEY);
    localStorage.removeItem(BIOMETRIC_SOFT_LOGOUT_KEY);
    notifyBiometricStateChanged();
  } catch {
    // Ignore storage errors
  }
}
