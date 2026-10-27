import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Mail,
  Lock,
  User,
  ArrowLeft,
  ArrowRight,
  RefreshCw,
  AlertCircle,
  WifiOff,
  Eye,
  EyeOff,
  CheckCircle2,
  Check,
  Fingerprint,
  Info,
} from 'lucide-react';
import { useRasd } from '../context/RasdContext';
import { auth, translateFirebaseError } from '../services/firebase';
import {
  BiometricConfig,
  getBiometricConfig,
  enrollBiometric,
  verifyBiometric,
  disableBiometric,
  saveEncryptedCredentialsForBiometric,
  markSessionBiometricUnlocked,
} from '../services/biometricService';

const REMEMBERED_EMAIL_KEY = 'rasd_remembered_login_email_v1';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const AuthScreen: React.FC = () => {
  const {
    isOnline,
    loginWithGoogle,
    loginWithEmail,
    registerWithEmail,
    resetPassword,
    resumeSessionWithBiometric,
    showToast,
  } = useRasd();

  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [enrollBiometricOnLogin, setEnrollBiometricOnLogin] = useState(false);
  const [biometricConfig, setBiometricConfig] = useState<BiometricConfig | null>(() =>
    getBiometricConfig()
  );
  const [biometricSubmitting, setBiometricSubmitting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [biometricNotice, setBiometricNotice] = useState<string | null>(null);

  // Load remembered email (never plain passwords) and sync biometric config
  useEffect(() => {
    try {
      const savedEmail = localStorage.getItem(REMEMBERED_EMAIL_KEY);
      const currentBio = getBiometricConfig();
      setBiometricConfig(currentBio);
      if (savedEmail) {
        setEmail(savedEmail);
        setRememberMe(true);
      } else if (currentBio?.userEmail) {
        setEmail(currentBio.userEmail);
      }
    } catch {
      // Ignore storage access errors
    }

    const syncBio = () => setBiometricConfig(getBiometricConfig());
    window.addEventListener('rasd:biometric-state-change', syncBio);
    return () => window.removeEventListener('rasd:biometric-state-change', syncBio);
  }, []);

  const trimmedEmail = email.trim();
  const isEmailFormatValid = EMAIL_REGEX.test(trimmedEmail);
  const showInlineEmailError = emailTouched && trimmedEmail.length > 0 && !isEmailFormatValid;

  const switchMode = (nextMode: 'login' | 'register' | 'reset') => {
    setMode(nextMode);
    setLocalError(null);
    setResetSuccess(false);
    setBiometricNotice(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || googleSubmitting || biometricSubmitting) return;
    setLocalError(null);
    setResetSuccess(false);
    setBiometricNotice(null);
    setEmailTouched(true);

    if (!isOnline) {
      setLocalError('أنت غير متصل بالإنترنت حاليًا. تتطلب المصادقة اتصالًا بالشبكة.');
      return;
    }

    if (!trimmedEmail) {
      setLocalError('يرجى إدخال البريد الإلكتروني.');
      return;
    }

    if (!isEmailFormatValid) {
      setLocalError('يرجى إدخال بريد إلكتروني بصيغة صحيحة (مثال: name@domain.com).');
      return;
    }

    if (mode !== 'reset' && !password) {
      setLocalError('يرجى إدخال كلمة المرور.');
      return;
    }

    // Persist or clear only the email preference (never store plain passwords)
    try {
      if (rememberMe && mode === 'login') {
        localStorage.setItem(REMEMBERED_EMAIL_KEY, trimmedEmail);
      } else if (!rememberMe) {
        localStorage.removeItem(REMEMBERED_EMAIL_KEY);
      }
    } catch {
      // Ignore storage errors
    }

    setSubmitting(true);
    try {
      if (mode === 'login') {
        await loginWithEmail(trimmedEmail, password);
        markSessionBiometricUnlocked();
        if (enrollBiometricOnLogin) {
          try {
            const enrolled = await enrollBiometric({
              uid: trimmedEmail.toLowerCase(),
              email: trimmedEmail,
              displayName: trimmedEmail.split('@')[0] || 'مستخدم رَصْد',
              authMethod: 'email',
              passwordForQuickLogin: password,
              requireUnlockOnLaunch: true,
            });
            setBiometricConfig(enrolled);
            showToast('تم تفعيل الدخول والقفل بالبصمة على هذا الجهاز بنجاح.', 'success');
          } catch (bioErr) {
            showToast(
              bioErr instanceof Error
                ? bioErr.message
                : 'تم تسجيل الدخول، ويمكنك تفعيل البصمة لاحقًا من تبويب المزيد.',
              'warning'
            );
          }
        } else {
          await saveEncryptedCredentialsForBiometric(trimmedEmail, password);
        }
      } else if (mode === 'register') {
        if (fullName.trim().length < 2) {
          setLocalError('يرجى إدخال الاسم الكامل (حرفان على الأقل).');
          setSubmitting(false);
          return;
        }
        if (password.length < 6) {
          setLocalError('يجب أن تتكون كلمة المرور من 6 أحرف على الأقل.');
          setSubmitting(false);
          return;
        }
        await registerWithEmail(fullName.trim(), trimmedEmail, password);
        markSessionBiometricUnlocked();
      } else if (mode === 'reset') {
        await resetPassword(trimmedEmail);
        setResetSuccess(true);
      }
    } catch (err) {
      setLocalError(translateFirebaseError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (submitting || googleSubmitting || biometricSubmitting) return;
    setLocalError(null);
    setResetSuccess(false);
    setBiometricNotice(null);
    if (!isOnline) {
      setLocalError('يتطلب تسجيل الدخول عبر Google اتصالًا بالإنترنت.');
      return;
    }
    setGoogleSubmitting(true);
    try {
      await loginWithGoogle();
      markSessionBiometricUnlocked();
      if (enrollBiometricOnLogin) {
        try {
          const liveUser = auth.currentUser;
          const enrolled = await enrollBiometric({
            uid: liveUser?.uid || trimmedEmail || 'google-user',
            email: liveUser?.email || trimmedEmail || 'حساب Google',
            displayName: liveUser?.displayName || trimmedEmail || 'مستخدم Google',
            authMethod: 'google',
            requireUnlockOnLaunch: true,
          });
          setBiometricConfig(enrolled);
          showToast('تم تفعيل البصمة على هذا الجهاز بنجاح.', 'success');
        } catch (bioErr) {
          showToast(
            bioErr instanceof Error
              ? bioErr.message
              : 'تم الدخول عبر Google. يمكنك تفعيل البصمة من تبويب المزيد.',
            'warning'
          );
        }
      }
    } catch (err) {
      setLocalError(translateFirebaseError(err));
    } finally {
      setGoogleSubmitting(false);
    }
  };

  const handleBiometricClick = async () => {
    if (submitting || googleSubmitting || biometricSubmitting) return;
    setLocalError(null);
    setResetSuccess(false);
    setBiometricNotice(null);

    const activeBio = getBiometricConfig();
    if (!activeBio || !activeBio.enabled) {
      setEnrollBiometricOnLogin(true);
      setBiometricNotice(
        'لتفعيل الدخول السريع بالبصمة على هذا الجهاز: تم تفعيل خيار «ربط البصمة تلقائيًا بعد الدخول» بالأسفل — سجّل دخولك الآن بالبريد أو عبر Google ليطلب منك الهاتف تأكيد بصمتك وحفظها، أو فعّلها من تبويب «المزيد» داخل المنصة.'
      );
      return;
    }

    setBiometricSubmitting(true);
    try {
      const result = await verifyBiometric();
      if (result.verified) {
        await resumeSessionWithBiometric(result.decryptedCredentials);
      }
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'تعذر التحقق من البصمة.');
    } finally {
      setBiometricSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-screen w-full overflow-x-hidden bg-[#F7F5F0] dark:bg-[#161514] text-[#292725] dark:text-[#F4F1EA] flex flex-col justify-between relative selection:bg-[#743B46] selection:text-white"
      dir="rtl"
    >
      {/* Very Subtle Yemeni Architectural Ornaments on Background Edges */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 overflow-hidden select-none z-0"
      >
        {/* Top Architectural Frieze (Yemeni Stepper & Geometric Band) */}
        <svg
          className="absolute top-0 left-0 right-0 w-full h-10 text-[#743B46] dark:text-[#E5B9C0] opacity-[0.045]"
          preserveAspectRatio="none"
          viewBox="0 0 1200 40"
          fill="none"
        >
          <pattern id="yemeni-top-frieze" x="0" y="0" width="60" height="40" patternUnits="userSpaceOnUse">
            <path
              d="M0 0 H60 V6 H0 Z M30 8 L44 22 L30 36 L16 22 Z M30 14 L38 22 L30 30 L22 22 Z M0 22 L8 14 L16 22 L8 30 Z M44 22 L52 14 L60 22 L52 30 Z"
              stroke="currentColor"
              strokeWidth="1.2"
              fill="none"
            />
          </pattern>
          <rect width="1200" height="40" fill="url(#yemeni-top-frieze)" />
        </svg>

        {/* Top-Right Yemeni Qamariya Arch Ornament */}
        <svg
          className="absolute -top-12 -right-12 w-72 h-72 sm:w-96 sm:h-96 text-[#743B46] dark:text-[#E5B9C0] opacity-[0.045]"
          viewBox="0 0 240 240"
          fill="none"
        >
          <circle cx="240" cy="0" r="210" stroke="currentColor" strokeWidth="1.5" strokeDasharray="6 6" />
          <circle cx="240" cy="0" r="175" stroke="currentColor" strokeWidth="1.2" />
          <circle cx="240" cy="0" r="140" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="240" cy="0" r="105" stroke="currentColor" strokeWidth="1" strokeDasharray="4 4" />
          <circle cx="240" cy="0" r="70" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M240 0 L30 0 M240 0 L48 95 M240 0 L95 155 M240 0 L155 195 M240 0 L240 210"
            stroke="currentColor"
            strokeWidth="1"
          />
          {/* Traditional Qamariya Star Interlace */}
          <polygon
            points="170,35 190,45 200,65 190,85 170,95 150,85 140,65 150,45"
            stroke="currentColor"
            strokeWidth="1.2"
            fill="none"
          />
        </svg>

        {/* Top-Left Yemeni Qamariya Arch Ornament */}
        <svg
          className="absolute -top-12 -left-12 w-72 h-72 sm:w-96 sm:h-96 text-[#A77B35] dark:text-[#D4AF37] opacity-[0.04]"
          viewBox="0 0 240 240"
          fill="none"
        >
          <circle cx="0" cy="0" r="210" stroke="currentColor" strokeWidth="1.5" strokeDasharray="6 6" />
          <circle cx="0" cy="0" r="175" stroke="currentColor" strokeWidth="1.2" />
          <circle cx="0" cy="0" r="140" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="0" cy="0" r="105" stroke="currentColor" strokeWidth="1" strokeDasharray="4 4" />
          <circle cx="0" cy="0" r="70" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M0 0 L210 0 M0 0 L192 95 M0 0 L145 155 M0 0 L85 195 M0 0 L0 210"
            stroke="currentColor"
            strokeWidth="1"
          />
        </svg>

        {/* Bottom-Right & Bottom-Left Subtle Yemeni Arch Silhouettes */}
        <svg
          className="absolute bottom-0 right-0 w-64 h-64 sm:w-80 sm:h-80 text-[#743B46] dark:text-[#E5B9C0] opacity-[0.04]"
          viewBox="0 0 200 200"
          fill="none"
        >
          <path
            d="M200 200 V80 C200 35 165 0 120 0 C75 0 40 35 40 80 V200"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="M185 200 V85 C185 48 156 18 120 18 C84 18 55 48 55 85 V200"
            stroke="currentColor"
            strokeWidth="1"
            strokeDasharray="5 5"
          />
          <circle cx="120" cy="75" r="32" stroke="currentColor" strokeWidth="1.2" />
          <rect
            x="104"
            y="59"
            width="32"
            height="32"
            transform="rotate(45 120 75)"
            stroke="currentColor"
            strokeWidth="1"
          />
        </svg>

        <svg
          className="absolute bottom-0 left-0 w-64 h-64 sm:w-80 sm:h-80 text-[#743B46] dark:text-[#E5B9C0] opacity-[0.04]"
          viewBox="0 0 200 200"
          fill="none"
        >
          <path
            d="M160 200 V80 C160 35 125 0 80 0 C35 0 0 35 0 80 V200"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="M145 200 V85 C145 48 116 18 80 18 C44 18 15 48 15 85 V200"
            stroke="currentColor"
            strokeWidth="1"
            strokeDasharray="5 5"
          />
          <circle cx="80" cy="75" r="32" stroke="currentColor" strokeWidth="1.2" />
          <rect
            x="64"
            y="59"
            width="32"
            height="32"
            transform="rotate(45 80 75)"
            stroke="currentColor"
            strokeWidth="1"
          />
        </svg>
      </div>

      {/* Offline Connection Indicator */}
      {!isOnline && (
        <div className="relative z-20 w-full max-w-md mx-auto px-4 pt-4">
          <div className="flex items-center justify-center gap-2 text-xs font-bold text-[#8D662A] dark:text-[#E5C17B] bg-[#F6EFE2] dark:bg-[#2E261B] px-4 py-2.5 rounded-2xl border border-[#E6D5B8] dark:border-[#4A3B28]">
            <WifiOff className="w-4 h-4 shrink-0" />
            <span>وضع عدم الاتصال — تتطلب المصادقة اتصالًا بالإنترنت</span>
          </div>
        </div>
      )}

      {/* Main Centered Login Experience */}
      <main className="relative z-10 w-full max-w-[440px] mx-auto px-4 sm:px-6 py-7 sm:py-10 my-auto flex flex-col items-center">
        {/* Top Brand Section: RASD Emblem, Title & Short Description */}
        <div className="w-full flex flex-col items-center text-center mb-6 sm:mb-7 animate-rasd-logo">
          {/* Emblem Container with subtle Yemeni arch framing */}
          <div className="relative mb-3.5">
            <div className="w-[72px] h-[72px] sm:w-[76px] sm:h-[76px] rounded-[24px] bg-gradient-to-br from-[#743B46] via-[#65313B] to-[#50242D] text-[#FFFEFC] flex items-center justify-center shadow-[0_10px_25px_-6px_rgba(116,59,70,0.42)] border border-[#8B4B57]/40 relative overflow-hidden">
              {/* Subtle internal geometric ring */}
              <div className="absolute inset-1.5 rounded-[18px] border border-[#FFFEFC]/15 pointer-events-none" />
              <ShieldCheck className="w-9 h-9 text-[#FFFEFC] drop-shadow-xs" strokeWidth={2} />
            </div>
            {/* Warm golden accent badge */}
            <span
              aria-hidden="true"
              className="absolute -bottom-1 -left-1 w-5 h-5 rounded-full bg-[#A77B35] border-2 border-[#F7F5F0] dark:border-[#161514] flex items-center justify-center"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#FFFEFC]" />
            </span>
          </div>

          <h1 className="text-3xl sm:text-[34px] font-extrabold tracking-tight text-[#292725] dark:text-[#F4F1EA] font-display leading-none">
            رَصْد
          </h1>
          <p className="text-xs sm:text-sm font-medium text-[#77716B] dark:text-[#ACA59C] mt-2 max-w-[310px] leading-relaxed">
            منصة الرصد الميداني ومتابعة الالتزامات الضريبية والعقارية
          </p>
        </div>

        {/* Warm White Login Card */}
        <section
          aria-label={
            mode === 'login'
              ? 'بطاقة تسجيل الدخول'
              : mode === 'register'
              ? 'بطاقة إنشاء حساب جديد'
              : 'بطاقة استعادة كلمة المرور'
          }
          className="w-full bg-[#FFFEFC] dark:bg-[#22201F] border border-[#E7E1D8] dark:border-[#383431] rounded-[28px] p-6 sm:p-8 shadow-[0_14px_38px_-12px_rgba(116,59,70,0.09),0_4px_14px_-4px_rgba(41,39,37,0.04)] dark:shadow-[0_16px_40px_-12px_rgba(0,0,0,0.5)] animate-rasd-card"
        >
          {/* Card Header */}
          {mode === 'reset' ? (
            <div className="mb-6 text-right">
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-[#743B46] dark:text-[#E5B9C0] hover:text-[#5D2D37] mb-3.5 py-1 cursor-pointer transition-colors"
              >
                <ArrowRight className="w-4 h-4" />
                <span>العودة إلى تسجيل الدخول</span>
              </button>
              <h2 className="text-xl sm:text-2xl font-extrabold text-[#292725] dark:text-[#F4F1EA] tracking-tight font-display">
                استعادة كلمة المرور
              </h2>
              <p className="text-xs sm:text-sm text-[#77716B] dark:text-[#ACA59C] mt-1.5 leading-relaxed">
                أدخل بريدك الإلكتروني المسجّل وسنرسل إليك رابطًا رسميًا لإعادة تعيين كلمة المرور.
              </p>
            </div>
          ) : (
            <div className="mb-6">
              <div className="text-center mb-5">
                <h2 className="text-xl sm:text-[22px] font-extrabold text-[#292725] dark:text-[#F4F1EA] tracking-tight font-display">
                  {mode === 'login' ? 'تسجيل الدخول' : 'إنشاء حساب جديد'}
                </h2>
                <p className="text-xs text-[#77716B] dark:text-[#ACA59C] mt-1">
                  {mode === 'login'
                    ? 'أدخل بيانات حسابك للوصول إلى مساحة العمل الميدانية'
                    : 'سجّل بياناتك للبدء في إدارة المعاملات والمواعيد الميدانية'}
                </p>
              </div>

              {/* Clean Segmented Mode Switcher */}
              <div className="grid grid-cols-2 gap-1.5 p-1.5 bg-[#F2EFE9] dark:bg-[#2B2826] rounded-2xl border border-[#E7E1D8] dark:border-[#383431]">
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className={`min-h-[42px] text-xs sm:text-sm font-bold rounded-xl transition-all duration-200 cursor-pointer whitespace-nowrap ${
                    mode === 'login'
                      ? 'bg-[#743B46] text-[#FFFEFC] shadow-xs'
                      : 'text-[#77716B] dark:text-[#ACA59C] hover:text-[#292725] dark:hover:text-[#F4F1EA]'
                  }`}
                >
                  تسجيل الدخول
                </button>
                <button
                  type="button"
                  onClick={() => switchMode('register')}
                  className={`min-h-[42px] text-xs sm:text-sm font-bold rounded-xl transition-all duration-200 cursor-pointer whitespace-nowrap ${
                    mode === 'register'
                      ? 'bg-[#743B46] text-[#FFFEFC] shadow-xs'
                      : 'text-[#77716B] dark:text-[#ACA59C] hover:text-[#292725] dark:hover:text-[#F4F1EA]'
                  }`}
                >
                  حساب جديد
                </button>
              </div>
            </div>
          )}

          {/* Status Messages: Real Auth Errors, Reset Success, or Biometric Info */}
          {localError && (
            <div
              role="alert"
              className="mb-5 p-3.5 rounded-2xl bg-[#F6E9E7] dark:bg-[#3A2020] border border-[#E2C2BE] dark:border-[#5C3030] flex items-start gap-2.5 text-xs text-[#8E352F] dark:text-[#F2B8B5] leading-relaxed animate-rasd-status"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#A64B45] dark:text-[#F2B8B5]" />
              <span className="font-medium">{localError}</span>
            </div>
          )}

          {resetSuccess && (
            <div
              role="status"
              className="mb-5 p-4 rounded-2xl bg-[#ECF2EE] dark:bg-[#1E2E23] border border-[#C6D9CC] dark:border-[#334F3C] flex items-start gap-2.5 text-xs text-[#3B5944] dark:text-[#A6D4B4] leading-relaxed animate-rasd-status"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-[#52765D] dark:text-[#86B394]" />
              <div>
                <p className="font-bold mb-0.5">تم إرسال رابط استعادة كلمة المرور بنجاح</p>
                <p className="opacity-90">
                  يرجى مراجعة بريدك الإلكتروني ({trimmedEmail}) واتباع الرابط لإعادة تعيين كلمة المرور.
                </p>
              </div>
            </div>
          )}

          {biometricNotice && (
            <div
              role="status"
              className="mb-5 p-3.5 rounded-2xl bg-[#F6EFE2] dark:bg-[#2E261B] border border-[#E6D5B8] dark:border-[#4A3B28] flex items-start gap-2.5 text-xs text-[#7D5922] dark:text-[#E5C17B] leading-relaxed animate-rasd-status"
            >
              <Info className="w-4 h-4 shrink-0 mt-0.5 text-[#A77B35]" />
              <span>{biometricNotice}</span>
            </div>
          )}

          {/* Main Authentication Form */}
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {/* Full Name Field (Register Mode Only) */}
            {mode === 'register' && (
              <div>
                <label
                  htmlFor="rasd-auth-fullname"
                  className="block text-xs font-bold text-[#292725] dark:text-[#F4F1EA] mb-1.5"
                >
                  الاسم الكامل
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-[#77716B] dark:text-[#ACA59C] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none transition-colors" />
                  <input
                    id="rasd-auth-fullname"
                    type="text"
                    required
                    autoComplete="name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="أدخل اسمك الثلاثي أو الكامل"
                    className="w-full min-h-[48px] pr-10 pl-4 rounded-2xl bg-[#F7F5F0]/80 dark:bg-[#1B1918] border border-[#E7E1D8] dark:border-[#383431] text-sm text-[#292725] dark:text-[#F4F1EA] placeholder:text-[#9E978F] dark:placeholder:text-[#6E6862] focus:outline-none focus:bg-[#FFFEFC] dark:focus:bg-[#22201F] focus:border-[#743B46] dark:focus:border-[#C47A87] focus:ring-4 focus:ring-[#743B46]/10 transition-all duration-200"
                  />
                </div>
              </div>
            )}

            {/* 1. Email Field with Icon, Smooth Focus Border & Format Validation */}
            <div>
              <label
                htmlFor="rasd-auth-email"
                className="block text-xs font-bold text-[#292725] dark:text-[#F4F1EA] mb-1.5"
              >
                البريد الإلكتروني
              </label>
              <div className="relative">
                <Mail
                  className={`w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none transition-colors duration-200 ${
                    showInlineEmailError
                      ? 'text-[#A64B45]'
                      : emailTouched && isEmailFormatValid
                      ? 'text-[#743B46] dark:text-[#E5B9C0]'
                      : 'text-[#77716B] dark:text-[#ACA59C]'
                  }`}
                />
                <input
                  id="rasd-auth-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  required
                  dir="ltr"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (localError) setLocalError(null);
                  }}
                  onBlur={() => setEmailTouched(true)}
                  placeholder="name@example.com"
                  aria-invalid={showInlineEmailError}
                  className={`w-full min-h-[48px] pr-10 pl-4 rounded-2xl bg-[#F7F5F0]/80 dark:bg-[#1B1918] border text-sm text-left text-[#292725] dark:text-[#F4F1EA] placeholder:text-[#9E978F] dark:placeholder:text-[#6E6862] focus:outline-none focus:bg-[#FFFEFC] dark:focus:bg-[#22201F] transition-all duration-200 ${
                    showInlineEmailError
                      ? 'border-[#A64B45] focus:border-[#A64B45] focus:ring-4 focus:ring-[#A64B45]/12'
                      : 'border-[#E7E1D8] dark:border-[#383431] focus:border-[#743B46] dark:focus:border-[#C47A87] focus:ring-4 focus:ring-[#743B46]/10'
                  }`}
                />
              </div>
              {showInlineEmailError && (
                <p className="mt-1.5 text-[11px] font-medium text-[#A64B45] dark:text-[#F2B8B5] animate-rasd-status">
                  يرجى التحقق من صيغة البريد الإلكتروني (مثال: user@domain.com).
                </p>
              )}
            </div>

            {/* 2. Password Field with Toggle Icon */}
            {mode !== 'reset' && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="rasd-auth-password"
                    className="block text-xs font-bold text-[#292725] dark:text-[#F4F1EA]"
                  >
                    كلمة المرور
                  </label>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#77716B] dark:text-[#ACA59C] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none transition-colors duration-200" />
                  <input
                    id="rasd-auth-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    required
                    dir="ltr"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (localError) setLocalError(null);
                    }}
                    placeholder="••••••••"
                    className="w-full min-h-[48px] pr-10 pl-12 rounded-2xl bg-[#F7F5F0]/80 dark:bg-[#1B1918] border border-[#E7E1D8] dark:border-[#383431] text-sm text-left text-[#292725] dark:text-[#F4F1EA] placeholder:text-[#9E978F] dark:placeholder:text-[#6E6862] focus:outline-none focus:bg-[#FFFEFC] dark:focus:bg-[#22201F] focus:border-[#743B46] dark:focus:border-[#C47A87] focus:ring-4 focus:ring-[#743B46]/10 transition-all duration-200"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                    aria-pressed={showPassword}
                    className="absolute left-1.5 top-1/2 -translate-y-1/2 min-w-[40px] min-h-[40px] flex items-center justify-center text-[#77716B] hover:text-[#743B46] dark:text-[#ACA59C] dark:hover:text-[#E5B9C0] rounded-xl transition-colors duration-150 cursor-pointer"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* 4 & 5. Remember Me Interactive Checkbox, Biometric Enrollment Toggle & Forgot Password Trigger */}
            {mode === 'login' && (
              <div className="space-y-2 pt-0.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="inline-flex items-center gap-2.5 cursor-pointer select-none py-1 group">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="sr-only peer"
                    />
                    <span
                      className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-all duration-150 ${
                        rememberMe
                          ? 'bg-[#743B46] border-[#743B46] text-[#FFFEFC] shadow-2xs'
                          : 'bg-[#F7F5F0] dark:bg-[#1B1918] border-[#D5CEC4] dark:border-[#4A4541] group-hover:border-[#743B46]'
                      } peer-focus-visible:ring-3 peer-focus-visible:ring-[#743B46]/25`}
                    >
                      {rememberMe && <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
                    </span>
                    <span className="text-xs font-semibold text-[#5C554E] dark:text-[#D5CFC7] group-hover:text-[#292725] dark:group-hover:text-[#F4F1EA] transition-colors">
                      تذكرني
                    </span>
                  </label>

                  <button
                    type="button"
                    onClick={() => switchMode('reset')}
                    className="text-xs font-bold text-[#743B46] dark:text-[#E5B9C0] hover:text-[#5D2D37] dark:hover:text-[#F2D5DA] py-1 transition-colors cursor-pointer"
                  >
                    نسيت كلمة المرور؟
                  </button>
                </div>

                {!biometricConfig?.enabled && (
                  <label className="inline-flex items-center gap-2.5 cursor-pointer select-none py-1 group">
                    <input
                      type="checkbox"
                      checked={enrollBiometricOnLogin}
                      onChange={(e) => setEnrollBiometricOnLogin(e.target.checked)}
                      className="sr-only peer"
                    />
                    <span
                      className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-all duration-150 ${
                        enrollBiometricOnLogin
                          ? 'bg-[#A77B35] border-[#A77B35] text-[#FFFEFC] shadow-2xs'
                          : 'bg-[#F7F5F0] dark:bg-[#1B1918] border-[#D5CEC4] dark:border-[#4A4541] group-hover:border-[#A77B35]'
                      } peer-focus-visible:ring-3 peer-focus-visible:ring-[#A77B35]/25`}
                    >
                      {enrollBiometricOnLogin && <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
                    </span>
                    <span className="text-xs font-semibold text-[#5C554E] dark:text-[#D5CFC7] group-hover:text-[#292725] dark:group-hover:text-[#F4F1EA] transition-colors inline-flex items-center gap-1.5">
                      <Fingerprint className="w-3.5 h-3.5 text-[#A77B35]" />
                      <span>ربط البصمة تلقائيًا بهذا الجهاز بعد الدخول</span>
                    </span>
                  </label>
                )}
              </div>
            )}

            {/* 3. Primary Submit Button with Press Motion, Loading State & Duplicate Click Prevention */}
            <div className="pt-1.5">
              <button
                type="submit"
                disabled={submitting || googleSubmitting || biometricSubmitting}
                className="w-full min-h-[50px] px-5 rounded-2xl bg-[#743B46] hover:bg-[#5D2D37] active:bg-[#4E242D] active:scale-[0.985] motion-reduce:transform-none text-[#FFFEFC] font-bold text-sm flex items-center justify-center gap-2.5 shadow-[0_8px_20px_-6px_rgba(116,59,70,0.45)] transition-all duration-150 cursor-pointer disabled:opacity-60 disabled:pointer-events-none"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                    <span>
                      {mode === 'login'
                        ? 'جاري تسجيل الدخول...'
                        : mode === 'register'
                        ? 'جاري إنشاء الحساب...'
                        : 'جاري إرسال الرابط...'}
                    </span>
                  </>
                ) : (
                  <>
                    <span>
                      {mode === 'login'
                        ? 'تسجيل الدخول'
                        : mode === 'register'
                        ? 'إنشاء الحساب والبدء'
                        : 'إرسال رابط الاستعادة'}
                    </span>
                    <ArrowLeft className="w-4 h-4 shrink-0" />
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Secondary Auth Options: Google Sign-In & Real Biometric Trigger */}
          {mode !== 'reset' && (
            <div className="mt-5">
              <div className="relative my-4 flex items-center justify-center">
                <div className="border-t border-[#E7E1D8] dark:border-[#383431] w-full" />
                <span className="bg-[#FFFEFC] dark:bg-[#22201F] px-3 text-[11px] font-medium text-[#8C857E] dark:text-[#9E978F] whitespace-nowrap">
                  أو المتابعة عبر
                </span>
                <div className="border-t border-[#E7E1D8] dark:border-[#383431] w-full" />
              </div>

              <div className="flex flex-col gap-2.5">
                {mode === 'login' && biometricConfig?.enabled && (
                  <div className="space-y-1.5">
                    <button
                      type="button"
                      disabled={submitting || googleSubmitting || biometricSubmitting}
                      onClick={handleBiometricClick}
                      className="w-full min-h-[48px] px-4 rounded-2xl bg-[#F6EFE2] hover:bg-[#EFE4CF] active:scale-[0.99] dark:bg-[#2E261B] dark:hover:bg-[#3A3022] border border-[#DFC9A4] dark:border-[#5C4930] text-[#5C3F14] dark:text-[#E5C17B] font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2.5 transition-all duration-150 cursor-pointer disabled:opacity-60"
                    >
                      {biometricSubmitting ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin text-[#A77B35]" />
                          <span>جاري التحقق من بصمة الجهاز...</span>
                        </>
                      ) : (
                        <>
                          <Fingerprint className="w-5 h-5 text-[#A77B35]" />
                          <span>
                            الدخول السريع بالبصمة ({biometricConfig.userDisplayName || biometricConfig.userEmail})
                          </span>
                        </>
                      )}
                    </button>
                    <div className="flex items-center justify-between px-1 text-[11px] text-[#77716B] dark:text-[#ACA59C]">
                      <span>يعمل فورًا بلمسة البصمة (بإنترنت أو بدون إنترنت)</span>
                      <button
                        type="button"
                        onClick={() => {
                          disableBiometric();
                          setBiometricConfig(null);
                          showToast('تم إلغاء تفعيل البصمة من هذا الجهاز.', 'info');
                        }}
                        className="font-bold text-[#8E352F] dark:text-[#F2B8B5] hover:underline cursor-pointer"
                      >
                        إلغاء تفعيل البصمة
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2.5">
                  {/* Google Sign-In Button */}
                  <button
                    type="button"
                    disabled={submitting || googleSubmitting || biometricSubmitting}
                    onClick={handleGoogleLogin}
                    className="flex-1 min-h-[48px] px-4 rounded-2xl bg-[#F7F5F0]/70 hover:bg-[#EFECE6] active:scale-[0.99] motion-reduce:transform-none dark:bg-[#2B2826] dark:hover:bg-[#35312F] border border-[#E7E1D8] dark:border-[#383431] disabled:opacity-60 disabled:pointer-events-none text-[#292725] dark:text-[#F4F1EA] font-bold text-xs sm:text-sm flex items-center justify-center gap-2.5 transition-all duration-150 cursor-pointer"
                  >
                    {googleSubmitting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-[#743B46] dark:text-[#E5B9C0]" />
                        <span>جاري الاتصال بـ Google...</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                          <path
                            fill="#4285F4"
                            d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82Z"
                          />
                          <path
                            fill="#34A853"
                            d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24Z"
                          />
                          <path
                            fill="#FBBC05"
                            d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.13-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09Z"
                          />
                          <path
                            fill="#EA4335"
                            d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96Z"
                          />
                        </svg>
                        <span>حساب Google</span>
                      </>
                    )}
                  </button>

                  {/* Biometric Trigger Button */}
                  {mode === 'login' && (
                    <button
                      type="button"
                      disabled={submitting || googleSubmitting || biometricSubmitting}
                      onClick={handleBiometricClick}
                      title={
                        biometricConfig?.enabled
                          ? `الدخول بالبصمة (${biometricConfig.userEmail})`
                          : 'تفعيل أو استخدام البصمة'
                      }
                      aria-label="الدخول بالبصمة"
                      className={`min-h-[48px] min-w-[48px] px-3.5 rounded-2xl border flex items-center justify-center transition-all duration-150 cursor-pointer shrink-0 ${
                        biometricConfig?.enabled
                          ? 'bg-[#F6EFE2] hover:bg-[#EFE4CF] dark:bg-[#2E261B] border-[#DFC9A4] dark:border-[#5C4930] text-[#A77B35]'
                          : 'bg-[#F7F5F0]/70 hover:bg-[#EFECE6] dark:bg-[#2B2826] dark:hover:bg-[#35312F] border-[#E7E1D8] dark:border-[#383431] text-[#77716B] hover:text-[#743B46] dark:text-[#ACA59C] dark:hover:text-[#E5B9C0]'
                      }`}
                    >
                      {biometricSubmitting ? (
                        <RefreshCw className="w-5 h-5 animate-spin" />
                      ) : (
                        <Fingerprint className="w-5 h-5" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* Quiet Editorial Footer */}
      <footer className="relative z-10 w-full text-center px-4 py-4 text-[11px] font-medium text-[#8C857E] dark:text-[#77716B]">
        منصة رَصْد — نظام الإدارة الميدانية المتكامل
      </footer>
    </div>
  );
};
