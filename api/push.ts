import webpush from 'web-push';

// Ephemeral fallback keys if the user has not yet configured VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY in Vercel
let cachedFallbackKeys: { publicKey: string; privateKey: string } | null = null;

function getVapidConfig() {
  const envPublic = (process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY || '').trim();
  const envPrivate = (process.env.VAPID_PRIVATE_KEY || '').trim();
  const subject = (process.env.VAPID_SUBJECT || 'mailto:admin@rasd-field.app').trim();

  if (
    envPublic &&
    envPrivate &&
    envPublic !== 'YOUR_VAPID_PUBLIC_KEY' &&
    envPrivate !== 'YOUR_VAPID_PRIVATE_KEY'
  ) {
    return { publicKey: envPublic, privateKey: envPrivate, subject, isConfigured: true };
  }

  if (!cachedFallbackKeys) {
    cachedFallbackKeys = webpush.generateVAPIDKeys();
  }
  return {
    publicKey: cachedFallbackKeys.publicKey,
    privateKey: cachedFallbackKeys.privateKey,
    subject,
    isConfigured: false,
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

  try {
    webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
  } catch {
    // Fallback if invalid custom keys were entered in env vars
    if (!cachedFallbackKeys) {
      cachedFallbackKeys = webpush.generateVAPIDKeys();
    }
    webpush.setVapidDetails(
      'mailto:admin@rasd-field.app',
      cachedFallbackKeys.publicKey,
      cachedFallbackKeys.privateKey
    );
  }

  if (req.method === 'GET' && (action === 'vapid-key' || !action)) {
    return res.status(200).json({
      publicKey: vapid.publicKey,
      isConfiguredInEnv: vapid.isConfigured,
    });
  }

  if (req.method === 'POST' && action === 'subscribe') {
    return res.status(200).json({
      success: true,
      isConfiguredInEnv: vapid.isConfigured,
    });
  }

  if (req.method === 'POST' && action === 'test') {
    const subscription = req.body?.subscription;
    if (!subscription?.endpoint) {
      return res.status(200).json({
        success: true,
        delivered: 0,
        localFallback: true,
        message: 'No active PushSubscription provided in request body; using local Service Worker notification.',
      });
    }

    const payload = JSON.stringify({
      title: 'رَصْد — اختبار التنبيهات المباشرة (Vercel)',
      body: 'تم ربط مفتاح إشعارات الخادم بنجاح! نظام التنبيهات في الخلفية يعمل بصورة مثالية.',
      icon: '/pwa-192x192.png',
      data: { url: '/?screen=appointments' },
    });

    try {
      await webpush.sendNotification(subscription, payload);
      return res.status(200).json({ success: true, delivered: 1 });
    } catch (err: unknown) {
      return res.status(200).json({
        success: false,
        delivered: 0,
        localFallback: true,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (req.method === 'POST' && action === 'send-alert') {
    const {
      subscription,
      appointmentId,
      title,
      scheduledTime,
      propertyTitle,
      idempotencyKey,
    } = req.body || {};

    if (!subscription?.endpoint) {
      return res.status(200).json({
        success: true,
        sentCount: 0,
        localFallback: true,
        idempotencyKey,
      });
    }

    const payload = JSON.stringify({
      title: title || 'تنبيه موعد ميداني مستحق — رَصْد',
      body: `حان موعد: ${title} الساعة ${scheduledTime} (${propertyTitle || 'العقار الميداني'})`,
      icon: '/pwa-192x192.png',
      badge: '/icon.svg',
      data: {
        url: `/?screen=appointments&id=${appointmentId}`,
        appointmentId,
      },
    });

    try {
      await webpush.sendNotification(subscription, payload);
      return res.status(200).json({ success: true, sentCount: 1, idempotencyKey });
    } catch (err: unknown) {
      return res.status(200).json({
        success: false,
        sentCount: 0,
        localFallback: true,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return res.status(404).json({ error: `Unknown push endpoint action: ${action}` });
}
