import React, { useState } from 'react';
import {
  ShieldCheck,
  Mail,
  Lock,
  User,
  ArrowLeft,
  RefreshCw,
  AlertCircle,
  WifiOff,
  CheckCircle2,
  Info,
} from 'lucide-react';
import { useRasd } from '../context/RasdContext';
import { FIREBASE_PROJECT_ID, translateFirebaseError } from '../services/firebase';

export const AuthScreen: React.FC = () => {
  const {
    isOnline,
    loginWithGoogle,
    loginWithEmail,
    registerWithEmail,
    resetPassword,
  } = useRasd();

  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [showSetupHint, setShowSetupHint] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || googleSubmitting) return;
    setLocalError(null);

    if (!isOnline) {
      setLocalError('أنت غير متصل بالإنترنت حاليًا. تتطلب المصادقة الأولى اتصالًا بالشبكة.');
      return;
    }

    if (!email.trim()) {
      setLocalError('يرجى إدخال البريد الإلكتروني.');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'login') {
        await loginWithEmail(email, password);
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
        await registerWithEmail(fullName, email, password);
      } else if (mode === 'reset') {
        await resetPassword(email);
        setMode('login');
      }
    } catch (err) {
      setLocalError(translateFirebaseError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (submitting || googleSubmitting) return;
    setLocalError(null);
    if (!isOnline) {
      setLocalError('يتطلب تسجيل الدخول عبر Google اتصالًا بالإنترنت.');
      return;
    }
    setGoogleSubmitting(true);
    try {
      await loginWithGoogle();
    } catch (err) {
      setLocalError(translateFirebaseError(err));
    } finally {
      setGoogleSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F7FA] dark:bg-[#060D18] flex flex-col justify-between p-4 md:p-8" dir="rtl">
      {/* Top Connectivity Bar */}
      <div className="w-full max-w-5xl mx-auto flex items-center justify-between py-2">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#0B192C] via-[#0369A1] to-[#0D9488] text-white flex items-center justify-center shadow-sm">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <span className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-white block leading-none">
              رَصْد
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              المساعد الميداني الذكي
            </span>
          </div>
        </div>

        {!isOnline && (
          <div className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 px-3 py-1.5 rounded-xl border border-amber-200 dark:border-amber-800">
            <WifiOff className="w-3.5 h-3.5" />
            <span>دون اتصال</span>
          </div>
        )}
      </div>

      {/* Main Split Container */}
      <div className="w-full max-w-5xl mx-auto my-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-center py-6">
        {/* Right Column: Deep Navy Brand Showcase */}
        <div className="lg:col-span-6 rounded-3xl bg-gradient-to-br from-[#0B192C] via-[#102A46] to-[#0369A1] text-white p-6 sm:p-8 shadow-lg space-y-5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-xl bg-white/10 border border-white/15 text-xs font-bold text-teal-300">
            <span>منظومة إدارة العمل الميداني العقاري والمالي</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold leading-tight">
            إدارة ميدانية دقيقة للمكلفين والعقارات والزيارات والتقييمات
          </h1>
          <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
            يعمل تطبيق رَصْد كأداة مهنية متكاملة للمسؤول الميداني وفريقه (حتى 10 أعضاء في مساحة عمل معزولة)، مع دعم الأوامر الصوتية العربية، وتحديد المواقع GPS، والعمل دون اتصال مع المزامنة التلقائية عبر Firebase.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <div className="p-4 rounded-2xl bg-white/10 border border-white/15">
              <div className="flex items-center gap-2 text-sm font-bold text-white mb-1">
                <CheckCircle2 className="w-4 h-4 text-teal-300 shrink-0" />
                <span>عزلة مساحات العمل</span>
              </div>
              <p className="text-xs text-slate-300">
                قواعد أمان Firestore صارمة تفصل بيانات كل مالك وفريقه بالكامل.
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-white/10 border border-white/15">
              <div className="flex items-center gap-2 text-sm font-bold text-white mb-1">
                <CheckCircle2 className="w-4 h-4 text-teal-300 shrink-0" />
                <span>عمل ميداني دون اتصال</span>
              </div>
              <p className="text-xs text-slate-300">
                تخزين محلي مستمر ومزامنة ذكية مع تمييز السجلات المحلية عن المؤكدة.
              </p>
            </div>
          </div>
        </div>

        {/* Left Column: Android Material 3 Auth Card */}
        <div className="lg:col-span-6">
          <div className="bg-white dark:bg-[#0D1829] border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 md:p-8 shadow-sm">
            {/* Segmented Mode Switcher */}
            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-2xl mb-6">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setLocalError(null);
                }}
                className={`min-h-[42px] text-xs font-bold rounded-xl transition-colors cursor-pointer ${
                  mode === 'login'
                    ? 'bg-[#0B192C] dark:bg-[#0284C7] text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                تسجيل الدخول
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setLocalError(null);
                }}
                className={`min-h-[42px] text-xs font-bold rounded-xl transition-colors cursor-pointer ${
                  mode === 'register'
                    ? 'bg-[#0B192C] dark:bg-[#0284C7] text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                حساب جديد
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('reset');
                  setLocalError(null);
                }}
                className={`min-h-[42px] text-xs font-bold rounded-xl transition-colors cursor-pointer ${
                  mode === 'reset'
                    ? 'bg-[#0B192C] dark:bg-[#0284C7] text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                استعادة المرور
              </button>
            </div>

            {localError && (
              <div className="mb-4 p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{localError}</span>
              </div>
            )}

            {/* Primary Recommended Action: Google Sign-In */}
            {mode !== 'reset' && (
              <div className="mb-5">
                <button
                  type="button"
                  disabled={submitting || googleSubmitting}
                  onClick={handleGoogleLogin}
                  className="w-full min-h-[48px] rounded-2xl bg-[#0D9488] hover:bg-[#0F766E] disabled:opacity-60 text-white font-bold text-sm flex items-center justify-center gap-2.5 shadow-xs transition-colors cursor-pointer"
                >
                  {googleSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>جاري فتح نافذة Google وتأكيد الدخول...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                        <path d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 15.64 5 12c0-3.64 3.36-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81Z" />
                      </svg>
                      <span>المتابعة السريعة باستخدام حساب Google</span>
                    </>
                  )}
                </button>
                <div className="relative my-5 flex items-center justify-center">
                  <div className="border-t border-slate-200 dark:border-slate-800 w-full" />
                  <span className="bg-white dark:bg-[#0D1829] px-3 text-xs text-slate-400 whitespace-nowrap">
                    أو عبر البريد الإلكتروني
                  </span>
                  <div className="border-t border-slate-200 dark:border-slate-800 w-full" />
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'register' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    الاسم الكامل
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5" />
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="مثال: أحمد العتيبي"
                      className="w-full min-h-[46px] pr-10 pl-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-[#0284C7]"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  البريد الإلكتروني
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5" />
                  <input
                    type="email"
                    required
                    dir="ltr"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full min-h-[46px] pr-10 pl-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-left text-slate-900 dark:text-white focus:outline-none focus:border-[#0284C7]"
                  />
                </div>
              </div>

              {mode !== 'reset' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    كلمة المرور
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5" />
                    <input
                      type="password"
                      required
                      dir="ltr"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full min-h-[46px] pr-10 pl-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-left text-slate-900 dark:text-white focus:outline-none focus:border-[#0284C7]"
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full min-h-[48px] rounded-2xl bg-[#0B192C] hover:bg-[#102A46] dark:bg-[#0284C7] dark:hover:bg-[#0369A1] text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
              >
                <span>
                  {submitting
                    ? 'جاري التنفيذ...'
                    : mode === 'login'
                    ? 'تسجيل الدخول بالبريد'
                    : mode === 'register'
                    ? 'إنشاء حساب جديد'
                    : 'إرسال رابط استعادة كلمة المرور'}
                </span>
                <ArrowLeft className="w-4 h-4" />
              </button>
            </form>

            {/* Transparency & External Setup Notice */}
            <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowSetupHint((p) => !p)}
                className="w-full flex items-center justify-between text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 py-1 cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-[#0284C7]" />
                  <span>معلومات تهيئة المصادقة ومشروع Firebase</span>
                </span>
                <span>{showSetupHint ? 'إخفاء' : 'عرض'}</span>
              </button>

              {showSetupHint && (
                <div className="mt-2 p-3 rounded-2xl bg-slate-50 dark:bg-slate-900 text-xs text-slate-600 dark:text-slate-300 space-y-1.5 leading-relaxed">
                  <p>
                    • مشروع Firebase المرتبط فعليًا: <span className="font-mono font-bold">{FIREBASE_PROJECT_ID}</span>
                  </p>
                  <p>
                    • <strong>الدخول عبر Google</strong> مفعّل تلقائيًا وجاهز للعمل الفوري.
                  </p>
                  <p>
                    • لاستخدام <strong>البريد وكلمة المرور</strong> لأول مرة، يرجى تفعيل مزود <em>Email/Password</em> من لوحة تحكم Firebase Console (Authentication &rarr; Sign-in method).
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <footer className="w-full max-w-5xl mx-auto py-3 text-center text-xs text-slate-400">
        رَصْد — المساعد الميداني الذكي · متصل بقاعدة بيانات Cloud Firestore الحقيقية
      </footer>
    </div>
  );
};
