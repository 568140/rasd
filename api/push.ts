import webpush from 'web-push';

// Local dev-only fallback keys (never used in production or Vercel serverless environments)
let devOnlyFallbackKeys: { publicKey: string; privateKey: string } | null = null;

interface VapidResolution {
  publicKey: string;
  privateKey: string;
  subject: string;
  isConfiguredInEnv: boolean;
  isReady: boolean;
  status: 'configured' | 'dev_ephemeral_fallback' | 'missing_production_env' | 'invalid_production_env';
  errorMessage?: string;
}

function getVapidConfig(): VapidResolution {
  const isProduction = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
  const envPublic = (process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY || '').trim();
  const envPrivate = (process.env.VAPID_PRIVATE_KEY || '').trim();
  const subject = (process.env.VAPID_SUBJECT || 'mailto:admin@rasd-field.app').trim();

  const hasEnvKeys =
    Boolean(envPublic) &&
    Boolean(envPrivate) &&
    envPublic !== 'YOUR_VAPID_PUBLIC_KEY' &&
    envPrivate !== 'YOUR_VAPID_PRIVATE_KEY';

  if (hasEnvKeys) {
    try {
      webpush.setVapidDetails(subject, envPublic, envPrivate);
      return {
        publicKey: envPublic,
        privateKey: envPrivate,
        subject,
        isConfiguredInEnv: true,
        isReady: true,
        status: 'configured',
      };
    } catch {
      if (isProduction) {
        return {
          publicKey: '',
          privateKey: '',
          subject,
          isConfiguredInEnv: false,
          isReady: false,
          status: 'invalid_production_env',
          errorMessage: 'مفاتيح VAPID المضبوطة في متغيرات بيئة الإنتاج غير صالحة.',
        };
      }
    }
  } else if (isProduction) {
    return {
      publicKey: '',
      privateKey: '',
      subject,
      isConfiguredInEnv: false,
      isReady: false,
      status: 'missing_production_env',
      errorMessage: 'مفاتيح VAPID الثابتة غير مضبوطة في متغيرات بيئة الإنتاج (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY).',
    };
  }

  // Non-production local development fallback only
  if (!devOnlyFallbackKeys) {
    devOnlyFallbackKeys = webpush.generateVAPIDKeys();
  }
  webpush.setVapidDetails(subject, devOnlyFallbackKeys.publicKey, devOnlyFallbackKeys.privateKey);
  return {
    publicKey: devOnlyFallbackKeys.publicKey,
    privateKey: devOnlyFallbackKeys.privateKey,
    subject,
    isConfiguredInEnv: false,
    isReady: true,
    status: 'dev_ephemeral_fallback',
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const action = String(req.query?.action || '').replace(/^\/+|\/+$/g, '');
  const vapid = getVapidConfig();

  if (req.method === 'GET' && (action === 'vapid-key' || !action)) {
    return res.status(200).json({
      publicKey: vapid.publicKey,
      isConfiguredInEnv: vapid.isConfiguredInEnv,
      status: vapid.status,
      ...(vapid.errorMessage ? { message: vapid.errorMessage } : {}),
    });
  }

  if (req.method === 'POST' && action === 'subscribe') {
    return res.status(200).json({
      success: vapid.isReady,
      isConfiguredInEnv: vapid.isConfiguredInEnv,
      status: vapid.status,
      ...(vapid.errorMessage ? { message: vapid.errorMessage } : {}),
    });
  }

  if (req.method === 'POST' && action === 'test') {
    const subscription = req.body?.subscription;
    if (!vapid.isReady || !subscription?.endpoint) {
      return res.status(200).json({
        success: false,
        delivered: 0,
        localFallback: true,
        isConfiguredInEnv: vapid.isConfiguredInEnv,
        status: vapid.status,
        message:
          vapid.errorMessage ||
          'No active PushSubscription provided in request body; using local Service Worker notification.',
      });
    }

    const payload = JSON.stringify({
      title: 'تنبيه موعد مستحق — رَصْد (اختبار)',
      body: 'تبقّى 30 دقيقة على موعد المكلف التجريبي بشأن «معاينة عقارية ومتابعة التزام». نظام التنبيهات يعمل بصورة مثالية.',
      icon: '/pwa-192x192.png',
      badge: '/icon.svg',
      tag: 'rasd-push-test',
      renotify: false,
      data: { url: '/?screen=appointments' },
    });

    try {
      await webpush.sendNotification(subscription, payload);
      return res.status(200).json({
        success: true,
        delivered: 1,
        isConfiguredInEnv: vapid.isConfiguredInEnv,
      });
    } catch (err: unknown) {
      return res.status(200).json({
        success: false,
        delivered: 0,
        localFallback: true,
        isConfiguredInEnv: vapid.isConfiguredInEnv,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (req.method === 'POST' && action === 'send-alert') {
    const {
      subscription,
      appointmentId,
      title,
      notificationTitle,
      notificationBody,
      taxpayerName,
      taxpayerId,
      propertyId,
      scheduledDate,
      scheduledTime,
      propertyTitle,
      minutesRemaining,
      isOverdue: explicitOverdue,
      tag: customTag,
      idempotencyKey,
    } = req.body || {};

    if (!vapid.isReady || !subscription?.endpoint) {
      return res.status(200).json({
        success: false,
        sentCount: 0,
        localFallback: true,
        isConfiguredInEnv: vapid.isConfiguredInEnv,
        status: vapid.status,
        idempotencyKey,
        ...(vapid.errorMessage ? { message: vapid.errorMessage } : {}),
      });
    }

    const mins = typeof minutesRemaining === 'number' && Number.isFinite(minutesRemaining) ? Math.round(minutesRemaining) : null;
    const isOverdue = typeof explicitOverdue === 'boolean' ? explicitOverdue : mins !== null && mins < 0;
    const clientName = (taxpayerName || '').trim() || 'المكلف المعني';
    const transactionType = (title || '').trim() || 'متابعة التزام ميداني';
    const propLabel = (propertyTitle || '').trim();
    const scheduleInfo = [
      propLabel && propLabel !== 'عقار عام' ? `العقار: ${propLabel}` : '',
      scheduledDate ? `التاريخ: ${scheduledDate}` : '',
      scheduledTime ? `الساعة: ${scheduledTime}` : '',
    ]
      .filter(Boolean)
      .join(' — ');

    let computedTitle = notificationTitle || 'اقترب موعد الالتزام — رَصْد';
    let computedBody = notificationBody || '';

    if (!computedBody) {
      if (isOverdue) {
        const overdueMins = mins !== null ? Math.abs(mins) : 0;
        computedTitle = 'تأخر موعد الالتزام — يتطلب إجراءً';
        computedBody =
          overdueMins > 0
            ? `تأخر موعد ${clientName} بشأن «${transactionType}» بمقدار ${overdueMins} دقيقة${
                scheduleInfo ? ` (كان مقررًا: ${scheduleInfo})` : ''
              }. يرجى المتابعة الفورية أو إعادة الجدولة.`
            : `تأخر موعد ${clientName} بشأن «${transactionType}»${
                scheduleInfo ? ` (كان مقررًا: ${scheduleInfo})` : ''
              }. يرجى المتابعة الفورية أو إعادة الجدولة.`;
      } else if (mins !== null && mins > 0) {
        computedTitle = mins <= 10 ? 'تنبيه موعد مستحق قريبًا — رَصْد' : 'اقترب موعد الالتزام — رَصْد';
        computedBody = `تبقّى ${mins} دقيقة على موعد ${clientName} بشأن «${transactionType}»${
          scheduleInfo ? ` (${scheduleInfo})` : ''
        }. يرجى الاستعداد لاتخاذ الإجراء اللازم.`;
      } else {
        computedTitle = 'تنبيه موعد مستحق الآن — رَصْد';
        computedBody = `حان الآن موعد ${clientName} بشأن «${transactionType}»${
          scheduleInfo ? ` (${scheduleInfo})` : ''
        }. يرجى مباشرة الإجراء اللازم.`;
      }
    }

    const params = new URLSearchParams();
    params.set('screen', 'appointments');
    if (appointmentId) params.set('appointmentId', String(appointmentId));
    if (taxpayerId) params.set('taxpayerId', String(taxpayerId));
    if (propertyId) params.set('propertyId', String(propertyId));
    const deepLinkUrl = `/?${params.toString()}`;

    const stageKey = isOverdue ? 'overdue' : 'upcoming';
    const tag = customTag || `rasd-appt-${appointmentId || 'general'}-${stageKey}`;

    const payload = JSON.stringify({
      title: computedTitle,
      body: computedBody,
      icon: '/pwa-192x192.png',
      badge: '/icon.svg',
      tag,
      renotify: isOverdue,
      data: {
        url: deepLinkUrl,
        appointmentId,
        taxpayerId,
        propertyId,
        scheduledDate,
        scheduledTime,
        isOverdue,
      },
    });

    try {
      await webpush.sendNotification(subscription, payload);
      return res.status(200).json({
        success: true,
        sentCount: 1,
        isConfiguredInEnv: vapid.isConfiguredInEnv,
        idempotencyKey,
      });
    } catch (err: unknown) {
      return res.status(200).json({
        success: false,
        sentCount: 0,
        localFallback: true,
        isConfiguredInEnv: vapid.isConfiguredInEnv,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (req.method === 'POST' && (action === 'notify-registration' || action === 'register')) {
    return res.status(200).json({
      success: true,
      received: true,
      message: 'Registration notification processed.',
    });
  }

  return res.status(404).json({ error: `Unknown push endpoint action: ${action}` });
}
