import React, { useState } from 'react';
import {
  KeyRound,
  Copy,
  Check,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  Eye,
  EyeOff,
  Lock,
  Smartphone,
  X,
} from 'lucide-react';

interface GeneratedVapidPair {
  publicKey: string;
  privateKey: string;
  generatedAt: string;
  checks: {
    curveP256: boolean;
    pubUncompressed65Bytes: boolean;
    privRaw32Bytes: boolean;
    urlSafeBase64NoPadding: boolean;
    ecdsaSignVerifyMatch: boolean;
  };
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window
    .btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlToBytes(base64Url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export const TempVapidGenerator: React.FC<{
  onClose?: () => void;
  onShowToast?: (text: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
}> = ({ onClose, onShowToast }) => {
  const [pair, setPair] = useState<GeneratedVapidPair | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedPub, setCopiedPub] = useState(false);
  const [copiedPriv, setCopiedPriv] = useState(false);
  const [showPrivate, setShowPrivate] = useState(true);

  const generateAndVerifyVapidKeys = async () => {
    setIsGenerating(true);
    setErrorMsg(null);
    setCopiedPub(false);
    setCopiedPriv(false);

    try {
      if (!window.crypto || !window.crypto.subtle) {
        throw new Error('متصفحك الحالي لا يدعم Web Crypto API أو أن الصفحة غير مفتوحة عبر HTTPS.');
      }

      // 1. Generate ECDSA P-256 key pair locally in browser memory
      const keyPair = await window.crypto.subtle.generateKey(
        {
          name: 'ECDSA',
          namedCurve: 'P-256',
        },
        true,
        ['sign', 'verify']
      );

      // 2. Export Public Key in raw uncompressed format (65 bytes: 0x04 + 32-byte X + 32-byte Y)
      const rawPubBuffer = await window.crypto.subtle.exportKey('raw', keyPair.publicKey);
      const rawPubBytes = new Uint8Array(rawPubBuffer);

      // 3. Export Private Key in JWK format to extract the 32-byte scalar "d"
      const jwkPriv = await window.crypto.subtle.exportKey('jwk', keyPair.privateKey);
      if (!jwkPriv.d || !jwkPriv.x || !jwkPriv.y) {
        throw new Error('تعذر استخراج المعاملات الرياضية للمفتاح من Web Crypto API.');
      }

      const rawPrivBytes = base64UrlToBytes(jwkPriv.d);
      const publicKey = bytesToBase64Url(rawPubBytes);
      const privateKey = bytesToBase64Url(rawPrivBytes);

      // 4. Strict web-push compatibility checks before displaying
      const pubUncompressed65Bytes =
        rawPubBytes.byteLength === 65 && rawPubBytes[0] === 0x04 && publicKey.length === 87;
      const privRaw32Bytes = rawPrivBytes.byteLength === 32 && privateKey.length === 43;
      const urlSafeBase64Regex = /^[A-Za-z0-9\-_]+$/;
      const urlSafeBase64NoPadding =
        urlSafeBase64Regex.test(publicKey) &&
        urlSafeBase64Regex.test(privateKey) &&
        !publicKey.includes('=') &&
        !privateKey.includes('=');

      // 5. Re-import exported keys and perform real ECDSA P-256 SHA-256 Sign + Verify roundtrip
      const reimportedPub = await window.crypto.subtle.importKey(
        'raw',
        base64UrlToBytes(publicKey) as unknown as BufferSource,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify']
      );

      const xBytes = rawPubBytes.slice(1, 33);
      const yBytes = rawPubBytes.slice(33, 65);
      const reimportedPriv = await window.crypto.subtle.importKey(
        'jwk',
        {
          kty: 'EC',
          crv: 'P-256',
          x: bytesToBase64Url(xBytes),
          y: bytesToBase64Url(yBytes),
          d: privateKey,
          ext: false,
          key_ops: ['sign'],
        },
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['sign']
      );

      const testPayload = new TextEncoder().encode(
        `vapid-self-test.${Date.now()}.https://fcm.googleapis.com`
      );
      const signature = await window.crypto.subtle.sign(
        { name: 'ECDSA', hash: { name: 'SHA-256' } },
        reimportedPriv,
        testPayload
      );
      const ecdsaSignVerifyMatch = await window.crypto.subtle.verify(
        { name: 'ECDSA', hash: { name: 'SHA-256' } },
        reimportedPub,
        signature,
        testPayload
      );

      if (
        !pubUncompressed65Bytes ||
        !privRaw32Bytes ||
        !urlSafeBase64NoPadding ||
        !ecdsaSignVerifyMatch
      ) {
        throw new Error('فشل اختبار التطابق الرياضي مع معيار web-push، يرجى المحاولة مرة أخرى.');
      }

      setPair({
        publicKey,
        privateKey,
        generatedAt: new Date().toLocaleTimeString('ar-SA'),
        checks: {
          curveP256: true,
          pubUncompressed65Bytes,
          privRaw32Bytes,
          urlSafeBase64NoPadding,
          ecdsaSignVerifyMatch,
        },
      });

      onShowToast?.('تم توليد واختبار زوج مفاتيح VAPID محليًا بنجاح', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'حدث خطأ غير متوقع أثناء توليد المفاتيح';
      setErrorMsg(msg);
      onShowToast?.(msg, 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = async (text: string, type: 'pub' | 'priv') => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'pub') {
        setCopiedPub(true);
        setTimeout(() => setCopiedPub(false), 2500);
        onShowToast?.('تم نسخ المفتاح العام (Public Key) إلى الحافظة', 'success');
      } else {
        setCopiedPriv(true);
        setTimeout(() => setCopiedPriv(false), 2500);
        onShowToast?.('تم نسخ المفتاح الخاص (Private Key) إلى الحافظة', 'success');
      }
    } catch {
      // Fallback for older mobile webviews
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      if (type === 'pub') {
        setCopiedPub(true);
        setTimeout(() => setCopiedPub(false), 2500);
      } else {
        setCopiedPriv(true);
        setTimeout(() => setCopiedPriv(false), 2500);
      }
      onShowToast?.('تم النسخ إلى الحافظة', 'success');
    }
  };

  return (
    <div
      className="bg-white dark:bg-[#0D1829] border-2 border-teal-500/40 dark:border-teal-500/30 rounded-3xl p-5 sm:p-6 space-y-5 shadow-md"
      dir="rtl"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-teal-50 dark:bg-teal-950/70 border border-teal-200 dark:border-teal-800 text-[#0D9488] dark:text-teal-300 flex items-center justify-center shrink-0">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                أداة توليد مفاتيح VAPID المحلية (مؤقتة)
              </h3>
              <span className="px-2.5 py-0.5 rounded-lg bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 text-[11px] font-bold">
                أداة مؤقتة قابلة للإزالة
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              تعمل بالكامل داخل ذاكرة متصفح هاتفك عبر Web Crypto API (منحنى P-256 المتوافق مع web-push)
            </p>
          </div>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={() => {
              setPair(null);
              onClose();
            }}
            className="min-h-[36px] px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold flex items-center gap-1 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
            <span>إغلاق ومسح الذاكرة</span>
          </button>
        )}
      </div>

      {/* Security & Independence Notices */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="p-3.5 rounded-2xl bg-teal-50/70 dark:bg-teal-950/40 border border-teal-200/80 dark:border-teal-800/80 text-xs space-y-1">
          <div className="font-extrabold text-teal-900 dark:text-teal-300 flex items-center gap-1.5">
            <Lock className="w-4 h-4 shrink-0" />
            <span>حماية كاملة للمفتاح الخاص:</span>
          </div>
          <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
            لا يتم إرسال المفتاح الخاص إلى أي خادم، ولا يُحفظ في قاعدة البيانات أو الملفات أو سجلات التشغيل، ويُمسح فور إغلاق هذه النافذة.
          </p>
        </div>

        <div className="p-3.5 rounded-2xl bg-amber-50/70 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/80 text-xs space-y-1">
          <div className="font-extrabold text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>زوج مستقل ومترابط رياضياً:</span>
          </div>
          <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
            المفتاحان المولّدان هنا يشكلان <strong>زوجًا مستقلًا جديدًا</strong> ويجب استخدامهما معًا في Vercel (لا تخلط هذا المفتاح الخاص مع أي مفتاح عام سابق).
          </p>
        </div>
      </div>

      {/* Generate Trigger Button */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 dark:bg-slate-900/60 p-4 rounded-2xl border border-slate-200/70 dark:border-slate-800">
        <div className="text-xs text-slate-600 dark:text-slate-300">
          اضغط على الزر لتوليد زوج مفاتيح جديد واختبار توافقه مع <code className="font-mono font-bold">web-push</code> قبل عرضه:
        </div>
        <button
          type="button"
          onClick={generateAndVerifyVapidKeys}
          disabled={isGenerating}
          className="min-h-[44px] px-5 rounded-2xl bg-gradient-to-l from-[#0B192C] via-[#0369A1] to-[#0D9488] hover:opacity-95 text-white text-xs font-extrabold flex items-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
          <span>{pair ? 'توليد زوج مفاتيح جديد' : 'توليد واختبار زوج مفاتيح VAPID الآن'}</span>
        </button>
      </div>

      {errorMsg && (
        <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs font-bold text-rose-700 dark:text-rose-300">
          {errorMsg}
        </div>
      )}

      {/* Results & Copy Controls */}
      {pair && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* Self-Test Verification Badge */}
          <div className="p-3.5 rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="font-extrabold text-emerald-900 dark:text-emerald-300 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>اجتاز الفحص الذاتي والتوافق مع مكتبة web-push بنجاح (تم التوليد {pair.generatedAt})</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono text-emerald-800 dark:text-emerald-300">
              <span className="px-2 py-0.5 rounded-md bg-white/80 dark:bg-slate-900">P-256 ✓</span>
              <span className="px-2 py-0.5 rounded-md bg-white/80 dark:bg-slate-900">Pub: 65B (87 chars) ✓</span>
              <span className="px-2 py-0.5 rounded-md bg-white/80 dark:bg-slate-900">Priv: 32B (43 chars) ✓</span>
              <span className="px-2 py-0.5 rounded-md bg-white/80 dark:bg-slate-900">ECDSA Sign/Verify ✓</span>
            </div>
          </div>

          {/* 1. Public Key Box */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                  1. المفتاح العام (Public Key)
                </span>
                <span className="block text-[11px] text-slate-500 font-mono mt-0.5">
                  اسم المتغير في Vercel: VAPID_PUBLIC_KEY (وأيضًا VITE_VAPID_PUBLIC_KEY)
                </span>
              </div>

              <button
                type="button"
                onClick={() => copyToClipboard(pair.publicKey, 'pub')}
                className={`min-h-[40px] px-4 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  copiedPub
                    ? 'bg-emerald-600 text-white'
                    : 'bg-[#0284C7] hover:bg-sky-700 text-white'
                }`}
              >
                {copiedPub ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copiedPub ? 'تم نسخ المفتاح العام!' : 'نسخ المفتاح العام'}</span>
              </button>
            </div>

            <div
              dir="ltr"
              className="p-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 font-mono text-xs text-slate-800 dark:text-sky-300 break-all select-all leading-relaxed"
            >
              {pair.publicKey}
            </div>
          </div>

          {/* 2. Private Key Box */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/90 border border-amber-300/80 dark:border-amber-800/80 space-y-2.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                  2. المفتاح الخاص السري (Private Key)
                </span>
                <span className="block text-[11px] text-amber-700 dark:text-amber-400 font-mono mt-0.5">
                  اسم المتغير في Vercel: VAPID_PRIVATE_KEY (سري للخادم فقط — لا تشاركه)
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowPrivate((v) => !v)}
                  className="min-h-[40px] px-3 rounded-xl bg-slate-200/80 hover:bg-slate-300/70 dark:bg-slate-800 text-xs font-bold flex items-center gap-1 cursor-pointer"
                  title={showPrivate ? 'إخفاء المفتاح الخاص' : 'إظهار المفتاح الخاص'}
                >
                  {showPrivate ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  <span>{showPrivate ? 'إخفاء' : 'إظهار'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => copyToClipboard(pair.privateKey, 'priv')}
                  className={`min-h-[40px] px-4 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-colors cursor-pointer ${
                    copiedPriv
                      ? 'bg-emerald-600 text-white'
                      : 'bg-[#0D9488] hover:bg-teal-700 text-white'
                  }`}
                >
                  {copiedPriv ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedPriv ? 'تم نسخ المفتاح الخاص!' : 'نسخ المفتاح الخاص'}</span>
                </button>
              </div>
            </div>

            <div
              dir="ltr"
              className="p-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 font-mono text-xs text-slate-800 dark:text-amber-300 break-all select-all leading-relaxed"
            >
              {showPrivate ? pair.privateKey : '•••••••••••••••••••••••••••••••••••••••••••'}
            </div>
          </div>

          {/* Mobile Quick Guide */}
          <div className="p-3.5 rounded-2xl bg-slate-100/80 dark:bg-slate-900/60 text-xs text-slate-600 dark:text-slate-300 space-y-1">
            <div className="font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Smartphone className="w-4 h-4 text-[#0284C7]" />
              <span>خطوة الربط في Vercel من الهاتف:</span>
            </div>
            <p>
              انسخ <strong>المفتاح العام</strong> وضعه في متغير <code className="font-mono font-bold">VAPID_PUBLIC_KEY</code> (و <code className="font-mono font-bold">VITE_VAPID_PUBLIC_KEY</code>)، ثم انسخ <strong>المفتاح الخاص</strong> وضعه في <code className="font-mono font-bold">VAPID_PRIVATE_KEY</code> داخل إعدادات مشروعك في Vercel، ثم أعد النشر (Redeploy).
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
