import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type, Modality } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import webpush from 'web-push';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

function sanitizeAudioMimeType(rawMime: unknown): string {
  if (typeof rawMime !== 'string' || !rawMime) return 'audio/webm';
  const clean = rawMime.split(';')[0].trim().toLowerCase();
  if (clean.includes('webm')) return 'audio/webm';
  if (clean.includes('mp4') || clean.includes('m4a')) return 'audio/mp4';
  if (clean.includes('ogg')) return 'audio/ogg';
  if (clean.includes('wav')) return 'audio/wav';
  if (clean.includes('aac')) return 'audio/aac';
  if (clean.includes('mp3') || clean.includes('mpeg')) return 'audio/mp3';
  return 'audio/webm';
}

function getGenAIClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey.trim() === '') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });
}

const NLU_MODEL_CANDIDATES = [
  'gemini-3.8-flash',
  'gemini-flash-latest',
  'gemini-3.1-flash-lite',
] as const;

const modelQuotaCooldownUntil = new Map<string, number>();
const analyzeResponseCache = new Map<
  string,
  { analysis: Record<string, unknown>; source: string; expiresAt: number }
>();

function isQuotaOrRateLimitError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('quota') ||
    msg.includes('Quota exceeded')
  );
}

async function startServer() {
  try {
    const clientMjsPath = path.resolve(__dirname, 'node_modules/vite/dist/client/client.mjs');
    if (fs.existsSync(clientMjsPath)) {
      let clientCode = fs.readFileSync(clientMjsPath, 'utf-8');
      if (clientCode.includes('WebSocket closed without opened.')) {
        clientCode = clientCode
          .replace(
            'reject(/* @__PURE__ */ new Error("WebSocket closed without opened."));',
            'resolve();'
          )
          .replace(
            'reject(new Error("WebSocket closed without opened."));',
            'resolve();'
          )
          .replace(
            /console\.error\(`\[vite\] failed to connect to websocket\.[\s\S]*?\`\);/g,
            '/* [vite] connection error suppressed */'
          );
        fs.writeFileSync(clientMjsPath, clientCode, 'utf-8');
      }
    }
  } catch {
    // ignore
  }

  const app = express();
  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));

  // CORS and Preflight handler to prevent 404 on preflight or reverse proxies
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // Health & capability check endpoint
  app.get(['/api/voice/status', '/api/voice/status/'], (_req, res) => {
    const ai = getGenAIClient();
    const now = Date.now();
    const activeNluModel =
      NLU_MODEL_CANDIDATES.find((m) => (modelQuotaCooldownUntil.get(m) || 0) <= now) ||
      'deterministic-hybrid';
    res.json({
      aiAvailable: Boolean(ai),
      models: {
        nlu: activeNluModel,
        stt: 'gemini-3.5-transcribe',
        tts: 'gemini-3.8-flash-lite-tts',
      },
    });
  });

  // Stage 1 Server-side Audio Transcription (supports Yemeni & standard Arabic)
  const STT_MODEL_CANDIDATES = [
    'gemini-3.5-transcribe',
    'gemini-3.8-flash',
    'gemini-flash-latest',
    'gemini-3.1-flash-lite',
  ] as const;

  app.post(['/api/voice/transcribe', '/api/voice/transcribe/'], async (req, res) => {
    try {
      const { audioBase64, mimeType = 'audio/webm', dialectHint = 'ar-YE' } = req.body || {};
      const cleanBase64 =
        typeof audioBase64 === 'string'
          ? audioBase64.replace(/^data:[^;]+;base64,/, '').replace(/\s+/g, '')
          : '';
      if (!cleanBase64) {
        res.status(400).json({ error: 'Missing audioBase64 payload' });
        return;
      }

      const ai = getGenAIClient();
      if (!ai) {
        res.status(200).json({ transcript: '', fallback: true, reason: 'AI_CLIENT_UNAVAILABLE' });
        return;
      }

      const cleanMime = sanitizeAudioMimeType(mimeType);

      const transcriptionPrompt = `أنت نظام نسخ وتفريغ صوتي عالي الدقة متخصص في العربية واللهجات المحلية (بما فيها اللهجة اليمنية ${dialectHint} ومصطلحات العمل الميداني: مكلف، عقار، عمارة، أدوار، دور، شقق، شقة، فتحة تجارية، فتحات تجارية، دكان، محل، وكيل، تحصيل، ريال، ألف، غدًا، بكره).
مهمتك الوحيدة: تفريغ الكلام المنطوق في هذا الملف الصوتي حرفياً (Verbatim) وبدقة كاملة.
القواعد الإلزامية:
1. انسخ الكلمات كما نطقها المتحدث تماماً دون حذف أي كلمة أو اختصار أو تعديل.
2. حافظ على الأسماء الكاملة (مثل: شهاب عبد الله حمود، صالح حمادي)، والأعداد، والعناوين كما هي.
3. لا تضف أي نص أو مقدمة أو خاتمة أو تعليق، فقط النص المفرغ نفسه.`;

      const now = Date.now();
      for (const candidateModel of STT_MODEL_CANDIDATES) {
        if ((modelQuotaCooldownUntil.get(candidateModel) || 0) > now) {
          continue;
        }

        try {
          const response = await ai.models.generateContent({
            model: candidateModel,
            contents: {
              parts: [
                {
                  inlineData: {
                    mimeType: cleanMime,
                    data: cleanBase64,
                  },
                },
                {
                  text: transcriptionPrompt,
                },
              ],
            },
          });

          const rawText = (response.text || '')
            .replace(/^```[\w]*\s*/i, '')
            .replace(/\s*```$/i, '')
            .replace(/^["'«»]+|["'«»]+$/g, '')
            .trim();
          if (rawText) {
            res.json({
              success: true,
              transcript: rawText,
              modelUsed: candidateModel,
            });
            return;
          }
        } catch (modelErr) {
          if (isQuotaOrRateLimitError(modelErr)) {
            modelQuotaCooldownUntil.set(candidateModel, Date.now() + 15 * 60 * 1000);
            continue;
          }
          console.error(`STT error with ${candidateModel}:`, modelErr);
          continue;
        }
      }

      // If all models failed or were in cooldown
      res.status(200).json({
        success: false,
        transcript: '',
        fallback: true,
        reason: 'MODELS_EXHAUSTED_OR_UNAVAILABLE',
      });
    } catch (err) {
      res.status(200).json({
        success: false,
        transcript: '',
        fallback: true,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // Stage 2 Server-side NLU Intent & Structured Entity Extraction
  app.post(['/api/voice/analyze', '/api/voice/analyze/'], async (req, res) => {
    try {
      const { transcript, contextSummary, previousDraft } = req.body || {};
      if (!transcript || typeof transcript !== 'string') {
        res.status(400).json({ error: 'Missing transcript' });
        return;
      }

      const cacheKey = `${transcript.trim()}|${JSON.stringify(previousDraft || null)}`;
      const now = Date.now();
      const cached = analyzeResponseCache.get(cacheKey);
      if (cached && cached.expiresAt > now) {
        res.json({ analysis: cached.analysis, source: cached.source, cached: true });
        return;
      }

      const ai = getGenAIClient();
      if (!ai) {
        res.status(200).json({ analysis: null, source: 'deterministic-fallback', fallback: true });
        return;
      }

      const systemInstruction = `أنت محلل الأوامر الصوتية الذكي لنظام «رَصْد — المساعد الميداني الذكي» لإدارة المكلفين والعقارات والوحدات العقارية والزيارات الميدانية والتحصيل المالي والمواعيد في اليمن والمنطقة العربية.
مهمتك: فهم الكلام الطبيعي للموظف الميداني (بالفصحى أو باللهجة اليمنية مثل: فتحة تجارية، فتحات تجارية، دكان، عمارة، دور، أدوار، وكيل، الفلوس، الزلط، المتبقي، الباقي، بكره، غدًا، ذكّرني، أمس، اليوم) وتحويله إلى بنية JSON محكمة ودقيقة.

أنواع النوايا المسموحة فقط (intent):
- "open_taxpayer_dossier": فتح ملف مكلف وعرض عقاراته وزياراته وملخصه المالي.
- "create_compound_record": إنشاء مكلف مع عقار و/أو وحدات عقارية (شقق، فتحات تجارية/محلات، مكاتب، أدوار، وكيل).
- "create_taxpayer": إنشاء مكلف جديد فقط.
- "create_property": إنشاء عقار جديد مرتبط بمكلف (مع أو بدون وحدات).
- "record_collection": تسجيل تحصيل أو دفعة مالية من مكلف أو حساب عقار.
- "create_appointment": إنشاء موعد أو تذكير ميداني أو متابعة مالية.
- "create_visit": تسجيل زيارة ميدانية لمكلف أو عقار.
- "create_assessment": تسجيل تقييم أو التزام مالي على عقار/مكلف.
- "search_records": البحث عن مكلف أو عقار أو وحدة.
- "query_balance": الاستعلام عن المتبقي أو الرصيد المالي على مكلف أو عقار.
- "update_agent_phone": تعديل رقم هاتف الوكيل أو المكلف.
- "update_unit_type": تغيير نوع وحدة عقارية (مثلاً إلى تجاري/محل أو شقة أو مكتب).
- "delete_property": حذف عقار محدد.
- "unknown": أمر غير معروف.

قواعد ذكية إلزامية:
1. معالجة التراجع والتصحيح الذاتي أثناء الكلام (Self-Correction):
   إذا قال المتحدث شيئًا ثم استدرك أو صحّح كلامه باستخدام عبارات مثل («لا، أقصد...»، «لا اقصد...»، «بل...»، «عفوًا...»، «قصدي...»، «تعديل...»)، اعتمد القيمة المصححة النهائية وأهمل القيمة الملغاة تمامًا!
   مثال 1: «سجل عقار باسم كامل، لا، أقصد باسم خالد» -> taxpayerName = "خالد"، وضع selfCorrectionDetected = true و selfCorrectionNote = "تم اعتماد الاسم المصحح (خالد) بدلًا من (كامل) بناءً على استدراك المتحدث".
   مثال 2: «سجل تحصيل ثلاثة آلاف، بل أربعة آلاف ريال من كامل» -> amount = 4000، selfCorrectionDetected = true.
2. دمج الحوار التكميلي (Conversational Follow-up):
   إذا وُجدت مسودة سابقة غير مكتملة في (previousDraft) وكان الكلام الجديد إجابة تكميلية (مثل ذكر المبلغ فقط أو اسم المكلف فقط أو التاريخ فقط)، ادمج المعلومات الجديدة مع المسودة السابقة لإكمال الأمر!
3. تحويل الأعداد المنطوقة بالعربية أو العامية اليمنية إلى أرقام:
   (أربعة أدوار = 4، خمس شقق = 5، ثلاث فتحات تجارية = 3، أربعة آلاف ريال = 4000، نص مليون = 500000).
4. تصنيف الوحدات:
   - «فتحة تجارية» / «فتحات تجارية» / «محل» / «دكان» -> shopsCount
   - «شقة» / «شقق» -> apartmentsCount
   - «مكتب» / «مكاتب» -> officesCount
   - «دور» / «أدوار» / «طابق» -> floorsCount
5. تصنيف العملية (operationCategory):
   - "query" للبحث والاستعلام عن الرصيد أو فتح ملف المكلف
   - "create" لإنشاء مكلف أو عقار أو زيارة أو موعد
   - "update" لتعديل بيانات موجودة
   - "financial" للتحصيل المالي والتقييمات المالية
   - "delete" للحذف
6. تحديد الحقول الناقصة (missingFieldsList) وصياغة سؤال استيضاحي طبيعي ومختصر بالعربية (clarificationQuestion) إذا كانت هناك بيانات جوهرية ناقصة تمنع التنفيذ الآمن.
7. الأسماء العربية الكاملة:
   استخلص الاسم الكامل للمكلف بدقة وشمول دون حذف أو بتر للأسماء المركبة (مثال: «شهاب عبد الله حمود» يجب استخلاصها كاملة «شهاب عبد الله حمود»).
8. صيغ المثنى:
   «فتحتان» أو «فتحتين» أو «محلين» تعني 2 في shopsCount، «شقتان» أو «شقتين» تعني 2 في apartmentsCount، «طابقان» أو «دورين» تعني 2 في floorsCount.
9. العناوين وتمايز قيمة العقد عن التحصيل المالي:
   استخلص العنوان بدقة (مثل «شارع الثلاثين») دون تكرار كلمة شارع.
   إذا ذُكرت «قيمة العقد» أو «الإيجار» ضمن أمر إضافة عقار أو مكلف (مثل: «وقيمة العقد خمسة آلاف ريال»)، استخلص القيمة في notes («قيمة العقد: 5000 ريال») وضع amount = 5000، مع الحفاظ الصارم على النية "create_compound_record" أو "create_property"، وعدم تحويلها مطلقًا إلى "record_collection" لأنها شرط عقدي وليست سند قبض مالي فعلي ما لم يطلب المستخدم التحصيل صراحةً.`;

      const promptContents = `الأمر الصوتي الحالي: "${transcript}"
سياق الأسماء الموجودة في مساحة العمل: ${JSON.stringify(contextSummary || {})}
المسودة السابقة قيد الاستكمال (إن وجدت): ${JSON.stringify(previousDraft || null)}`;

      const generationConfig = {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            intent: {
              type: Type.STRING,
              description:
                'One of: open_taxpayer_dossier, create_compound_record, create_taxpayer, create_property, record_collection, create_appointment, create_visit, create_assessment, search_records, query_balance, update_agent_phone, update_unit_type, delete_property, unknown',
            },
            operationCategory: {
              type: Type.STRING,
              description: 'One of: query, create, update, financial, delete',
            },
            confidence: {
              type: Type.NUMBER,
              description: 'Confidence score between 0 and 1',
            },
            selfCorrectionDetected: {
              type: Type.BOOLEAN,
              description: 'True if the speaker corrected themselves mid-utterance',
            },
            selfCorrectionNote: {
              type: Type.STRING,
              description: 'Arabic explanation of what the speaker corrected',
            },
            requiresClarification: {
              type: Type.BOOLEAN,
              description: 'True if essential fields are missing or ambiguous',
            },
            clarificationQuestion: {
              type: Type.STRING,
              description: 'Polite, specific Arabic follow-up question asking for missing or ambiguous details',
            },
            missingFieldsList: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            taxpayerName: { type: Type.STRING },
            taxpayerPhone: { type: Type.STRING },
            nationalId: { type: Type.STRING },
            propertyTitle: { type: Type.STRING },
            propertyType: {
              type: Type.STRING,
              description: 'residential, commercial, industrial, agricultural, mixed',
            },
            region: { type: Type.STRING },
            address: { type: Type.STRING },
            floorsCount: { type: Type.NUMBER },
            apartmentsCount: { type: Type.NUMBER },
            shopsCount: { type: Type.NUMBER },
            officesCount: { type: Type.NUMBER },
            agentName: { type: Type.STRING },
            agentPhone: { type: Type.STRING },
            amount: { type: Type.NUMBER },
            currency: { type: Type.STRING },
            paymentMethod: { type: Type.STRING },
            dateOffsetDays: {
              type: Type.NUMBER,
              description: '0 for today, 1 for tomorrow (غدًا/بكره), 2 for day after tomorrow, etc.',
            },
            explicitDate: { type: Type.STRING },
            explicitTime: { type: Type.STRING },
            reminderTopic: { type: Type.STRING },
            visitPurpose: {
              type: Type.STRING,
              description: 'initial_survey, periodic_inspection, valuation_verify, collection_followup, dispute_check',
            },
            visitStatus: {
              type: Type.STRING,
              description: 'completed, requires_followup, occupant_absent, access_denied',
            },
            targetUnitNumber: { type: Type.STRING },
            targetUnitType: {
              type: Type.STRING,
              description: 'apartment, shop, office, warehouse, other',
            },
            searchQuery: { type: Type.STRING },
            notes: { type: Type.STRING },
          },
          required: ['intent', 'confidence'],
        },
      };

      for (const candidateModel of NLU_MODEL_CANDIDATES) {
        if ((modelQuotaCooldownUntil.get(candidateModel) || 0) > Date.now()) {
          continue;
        }
        try {
          const response = await ai.models.generateContent({
            model: candidateModel,
            contents: promptContents,
            config: generationConfig,
          });
          const parsed = JSON.parse(response.text || '{}');
          if (parsed && typeof parsed === 'object') {
            analyzeResponseCache.set(cacheKey, {
              analysis: parsed,
              source: candidateModel,
              expiresAt: Date.now() + 10 * 60 * 1000,
            });
            res.json({ analysis: parsed, source: candidateModel });
            return;
          }
        } catch (modelErr) {
          if (isQuotaOrRateLimitError(modelErr)) {
            modelQuotaCooldownUntil.set(candidateModel, Date.now() + 15 * 60 * 1000);
            continue;
          }
          break;
        }
      }

      // Graceful fallback to client-side deterministic + self-correction engine when quota is exhausted
      res.status(200).json({
        analysis: null,
        source: 'deterministic-fallback',
        fallback: true,
      });
    } catch {
      res.status(200).json({
        analysis: null,
        source: 'deterministic-fallback',
        fallback: true,
      });
    }
  });

  // Stage 8 Optional Server-side Arabic TTS Readout
  app.post('/api/voice/tts', async (req, res) => {
    try {
      const { text } = req.body || {};
      if (!text || typeof text !== 'string') {
        res.status(400).json({ error: 'Missing text' });
        return;
      }

      const ai = getGenAIClient();
      if (!ai || (modelQuotaCooldownUntil.get('gemini-3.8-flash-lite-tts') || 0) > Date.now()) {
        res.status(200).json({ audioBase64: null, fallback: true });
        return;
      }

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash-lite-tts',
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Zephyr' },
            },
          },
        },
      });

      const inlineData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
      if (!inlineData?.data) {
        res.status(200).json({ audioBase64: null, fallback: true });
        return;
      }

      res.json({
        audioBase64: inlineData.data,
        mimeType: inlineData.mimeType || 'audio/pcm;rate=24000',
      });
    } catch (err) {
      if (isQuotaOrRateLimitError(err)) {
        modelQuotaCooldownUntil.set('gemini-3.8-flash-lite-tts', Date.now() + 15 * 60 * 1000);
      }
      res.status(200).json({
        audioBase64: null,
        fallback: true,
      });
    }
  });

  // ==========================================
  // Web Push & Background Alerts Subsystem
  // ==========================================
  const vapidKeysFilePath = path.resolve(__dirname, '.vapid-keys.json');
  const isProduction = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
  let vapidKeys: { publicKey: string; privateKey: string } = { publicKey: '', privateKey: '' };
  let isVapidConfiguredInEnv = false;
  let isVapidReady = false;
  const envPublicKey = (process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY || '').trim();
  const envPrivateKey = (process.env.VAPID_PRIVATE_KEY || '').trim();
  const vapidSubject = (process.env.VAPID_SUBJECT || 'mailto:admin@rasd-field.local').trim();

  if (
    envPublicKey &&
    envPrivateKey &&
    envPublicKey !== 'YOUR_VAPID_PUBLIC_KEY' &&
    envPrivateKey !== 'YOUR_VAPID_PRIVATE_KEY'
  ) {
    vapidKeys = { publicKey: envPublicKey, privateKey: envPrivateKey };
    isVapidConfiguredInEnv = true;
  } else if (!isProduction) {
    try {
      if (fs.existsSync(vapidKeysFilePath)) {
        vapidKeys = JSON.parse(fs.readFileSync(vapidKeysFilePath, 'utf-8'));
      } else {
        vapidKeys = webpush.generateVAPIDKeys();
        fs.writeFileSync(vapidKeysFilePath, JSON.stringify(vapidKeys, null, 2), 'utf-8');
      }
    } catch {
      vapidKeys = webpush.generateVAPIDKeys();
    }
  }

  if (vapidKeys.publicKey && vapidKeys.privateKey) {
    try {
      webpush.setVapidDetails(vapidSubject, vapidKeys.publicKey, vapidKeys.privateKey);
      isVapidReady = true;
    } catch {
      if (!isProduction) {
        vapidKeys = webpush.generateVAPIDKeys();
        webpush.setVapidDetails('mailto:admin@rasd-field.local', vapidKeys.publicKey, vapidKeys.privateKey);
        isVapidReady = true;
      } else {
        vapidKeys = { publicKey: '', privateKey: '' };
        isVapidConfiguredInEnv = false;
        isVapidReady = false;
      }
    }
  }

  interface StoredSubscription {
    endpoint: string;
    keys: { p256dh: string; auth: string };
    userId?: string;
    workspaceId?: string;
    subscribedAt: string;
  }

  const subscriptionsStore = new Map<string, StoredSubscription>();
  const sentAlertsIdempotency = new Set<string>();

  app.get('/api/push/vapid-key', (_req, res) => {
    res.json({
      publicKey: vapidKeys.publicKey,
      isConfiguredInEnv: isVapidConfiguredInEnv,
      status: isVapidConfiguredInEnv
        ? 'configured'
        : isVapidReady
        ? 'dev_file_fallback'
        : 'missing_production_env',
    });
  });

  app.post('/api/push/subscribe', (req, res) => {
    const { subscription, userId, workspaceId } = req.body || {};
    if (!subscription?.endpoint) {
      res.status(400).json({ error: 'Invalid subscription object' });
      return;
    }
    subscriptionsStore.set(subscription.endpoint, {
      endpoint: subscription.endpoint,
      keys: subscription.keys,
      userId: userId || 'anonymous',
      workspaceId: workspaceId || 'default',
      subscribedAt: new Date().toISOString(),
    });
    res.json({ success: true, count: subscriptionsStore.size });
  });

  app.post('/api/push/test', async (req, res) => {
    const directSub = req.body?.subscription;
    if (directSub?.endpoint && directSub?.keys) {
      subscriptionsStore.set(directSub.endpoint, {
        endpoint: directSub.endpoint,
        keys: directSub.keys,
        userId: 'anonymous',
        workspaceId: 'default',
        subscribedAt: new Date().toISOString(),
      });
    }

    if (subscriptionsStore.size === 0) {
      res.status(200).json({ success: true, delivered: 0, message: 'No registered push subscriptions yet' });
      return;
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

    let delivered = 0;
    for (const [endpoint, sub] of subscriptionsStore.entries()) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: sub.keys,
          },
          payload
        );
        delivered++;
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          subscriptionsStore.delete(endpoint);
        }
      }
    }

    res.json({ success: true, delivered, total: subscriptionsStore.size });
  });

  app.post('/api/push/send-alert', async (req, res) => {
    const {
      subscription: directSub,
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
      workspaceId,
    } = req.body || {};

    if (directSub?.endpoint && directSub?.keys) {
      subscriptionsStore.set(directSub.endpoint, {
        endpoint: directSub.endpoint,
        keys: directSub.keys,
        userId: 'anonymous',
        workspaceId: workspaceId || 'default',
        subscribedAt: new Date().toISOString(),
      });
    }

    const mins = typeof minutesRemaining === 'number' && Number.isFinite(minutesRemaining) ? Math.round(minutesRemaining) : null;
    const isOverdue = typeof explicitOverdue === 'boolean' ? explicitOverdue : mins !== null && mins < 0;
    const stageKey = isOverdue ? 'overdue' : 'upcoming';

    const key = idempotencyKey || `alert_${appointmentId}_${scheduledDate || ''}_${scheduledTime}_${stageKey}`;
    if (sentAlertsIdempotency.has(key)) {
      res.json({ success: true, skippedDuplicate: true, key });
      return;
    }

    sentAlertsIdempotency.add(key);

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

    let sent = 0;
    for (const [endpoint, sub] of subscriptionsStore.entries()) {
      if (workspaceId && sub.workspaceId && sub.workspaceId !== 'default' && sub.workspaceId !== workspaceId) {
        continue;
      }
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload);
        sent++;
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          subscriptionsStore.delete(endpoint);
        }
      }
    }

    res.json({ success: true, sentCount: sent, idempotencyKey: key });
  });

  const distPath = path.join(__dirname, 'dist');
  if (process.env.NODE_ENV === 'production' || fs.existsSync(path.join(distPath, 'index.html'))) {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, ws: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`RASD Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
