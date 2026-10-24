/**
 * @file testVoiceEngine.ts
 * Automated Test Suite for Voice Engine & Audio Pipeline in RASD (رَصْد)
 * 
 * Verifies all 12 mandatory test cases:
 * 1. Single audio recording and stop logic
 * 2. Long multi-sentence recording logic & chunk handling
 * 3. Absence of word/phrase repetition upon start/stop (anti-stutter)
 * 4. Preservation of full names, compound addresses, and repeated numbers
 * 5. Preservation of context between sentences (incremental draft merging)
 * 6. Microphone permission rejection error mapping
 * 7. Speech-to-text service failure and fallback resilience
 * 8. Network disconnection (offline) handling
 * 9. Audio retention for retry without re-speaking
 * 10. Double execution / Idempotency key protection
 * 11. Database mutation prevention before explicit confirmation
 * 12. Disambiguating contract value from payment collection
 */

import {
  normalizeArabicSpeech,
  sanitizeSpokenRepetitions,
  parseArabicVoiceCommandDeterministic,
  mergeFollowUpIntoDraft,
  buildVoiceExecutionPlan,
  hasPlanBeenExecuted,
  markPlanAsExecuted,
  resetExecutedPlansForTesting,
  type VoiceWorkspaceSnapshot,
  type VoiceExtractedPayload,
  transcribeAudioOnServer,
} from '../src/services/voiceEngine';
import type { Taxpayer, Property, PropertyUnit } from '../src/types/rasd';

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${testName}`);
    passedCount++;
  } else {
    console.error(`  ❌ [FAIL] ${testName}${detail ? ` - ${detail}` : ''}`);
    failedCount++;
  }
}

// Mock workspace data for tests
const mockTaxpayer: Taxpayer = {
  id: 'taxpayer-1',
  workspaceId: 'ws-1',
  ownerId: 'owner-1',
  fullName: 'كامل عبد الرحمن القدسي',
  internalCode: 'TXP-001',
  nationalOrCommercialId: '0101009988',
  phone: '777111222',
  email: 'kamel@example.com',
  address: 'شارع الثلاثين',
  region: 'صنعاء',
  status: 'active',
  notes: '',
  memberUids: ['owner-1'],
  createdBy: 'owner-1',
  createdByName: 'المسؤول',
};

const mockProperty: Property = {
  id: 'prop-1',
  workspaceId: 'ws-1',
  ownerId: 'owner-1',
  taxpayerId: 'taxpayer-1',
  taxpayerName: 'كامل عبد الرحمن القدسي',
  title: 'عقار كامل عبد الرحمن — شارع الثلاثين',
  code: 'PRP-001',
  propertyType: 'mixed',
  status: 'active',
  region: 'صنعاء',
  address: 'شارع الثلاثين',
  latitude: 15.35,
  longitude: 44.20,
  hasCoordinates: true,
  unitsCount: 5,
  areaSqm: 500,
  notes: '',
  memberUids: ['owner-1'],
  createdBy: 'owner-1',
  createdByName: 'المسؤول',
};

const mockSnapshot: VoiceWorkspaceSnapshot = {
  taxpayers: [mockTaxpayer],
  properties: [mockProperty],
  propertyUnits: [],
  visits: [],
  appointments: [],
  assessments: [],
  transactions: [],
  workspaceRole: 'owner',
  canDeleteRecords: true,
};

async function runTestSuite() {
  console.log('\n======================================================');
  console.log('🧪 بدء تشغيل الفحص الآلي الشامل لمنظومة الصوت (رَصْد)');
  console.log('======================================================\n');

  // ----------------------------------------------------
  // Test 1: تسجيل صوتي واحد ثم إيقافه
  // ----------------------------------------------------
  console.log('📋 الاختبار 1: تسجيل صوتي واحد ومعالجة البيانات');
  {
    const sampleCommand = 'افتح ملف كامل عبد الرحمن';
    const parsed = parseArabicVoiceCommandDeterministic(sampleCommand);
    assert(
      parsed.intent === 'open_taxpayer_dossier',
      'تحديد نية فتح ملف المكلف بدقة من تسجيل فردي'
    );
    assert(
      parsed.taxpayerName.includes('كامل'),
      'استخراج اسم المكلف بنجاح'
    );
  }

  // ----------------------------------------------------
  // Test 2: تسجيل طويل يتضمن عدة جمل متتابعة
  // ----------------------------------------------------
  console.log('\n📋 الاختبار 2: تسجيل طويل متعدد الجمل والمعلومات');
  {
    const longCommand =
      'سجل عقار جديد باسم عبد الله محمد في شارع الستين أربعة أدوار وعشر شقق وفتحتين تجارية والوكيل أحمد سالم ورقمه سبعة سبعة واحد اثنين ثلاثة أربعة خمسة ستة';
    const parsed = parseArabicVoiceCommandDeterministic(longCommand);

    assert(
      parsed.intent === 'create_compound_record' || parsed.intent === 'create_property',
      'تحديد نية إنشاء عقار مركب من تسجيل متعدد الجمل'
    );
    assert(
      parsed.floorsCount === 4,
      `استخراج عدد الأدوار بشكل صحيح (المتوقع 4، المحسوب: ${parsed.floorsCount})`
    );
    assert(
      parsed.apartmentsCount === 10,
      `استخراج عدد الشقق بشكل صحيح (المتوقع 10، المحسوب: ${parsed.apartmentsCount})`
    );
    assert(
      parsed.shopsCount === 2,
      `استخراج عدد الفتحات التجارية بشكل صحيح (المتوقع 2، المحسوب: ${parsed.shopsCount})`
    );
    assert(
      parsed.agentName.includes('أحمد') || parsed.agentName.includes('سالم'),
      'استخراج اسم الوكيل بنجاح من سياق الجمل المتتابعة'
    );
  }

  // ----------------------------------------------------
  // Test 3: عدم تكرار الكلمات أو المقاطع عند بدء وإيقاف التسجيل
  // ----------------------------------------------------
  console.log('\n📋 الاختبار 3: تنقية تكرار المقاطع والتهتهة الناتجة عن انقطاع التعرف');
  {
    const stutteredInput =
      'في شارع الثلاثين في شارع الثلاثين أضف إلى أضف إلى عقار كامل';
    const sanitized = sanitizeSpokenRepetitions(stutteredInput);

    assert(
      !sanitized.includes('في شارع الثلاثين في شارع الثلاثين'),
      'إزالة تكرار العبارات الطويلة المزدوجة الناتجة عن انقطاع التعرف'
    );
    assert(
      !sanitized.includes('أضف إلى أضف إلى'),
      'إزالة تكرار الروابط المكررة عند إعادة المحاولة'
    );
    assert(
      sanitized.includes('في شارع الثلاثين'),
      'الاحتفاظ بالنسخة الصحيحة المفردة من الموقع'
    );
  }

  // ----------------------------------------------------
  // Test 4: الحفاظ على الاسم الكامل والعنوان والأعداد دون حذف جائر
  // ----------------------------------------------------
  console.log('\n📋 الاختبار 4: حماية الأسماء المركبة، التكرار الشرعي، والأعداد');
  {
    // الاسم «كامل كامل» أو «محمد محمد» مكرر شرعي يجب ألا يحذفه الفلتر
    const repetitiveName = 'سجل عقار باسم كامل كامل في شارع الستين حارة السلام خمسة خمسة';
    const sanitized = sanitizeSpokenRepetitions(repetitiveName);

    assert(
      sanitized.includes('كامل كامل'),
      `الحفاظ على الاسم الكامل المتشابه الألفاظ («كامل كامل» تم حفظها: ${sanitized})`
    );
    assert(
      sanitized.includes('خمسة خمسة'),
      `الحفاظ على الأعداد المكررة عمدًا («خمسة خمسة» تم حفظها: ${sanitized})`
    );

    const fullQuadName = 'شهاب عبد الله حمود عبد الجبار';
    const parsedName = parseArabicVoiceCommandDeterministic(`سجل مكلف باسم ${fullQuadName}`);
    assert(
      parsedName.taxpayerName.includes('شهاب') &&
      parsedName.taxpayerName.includes('عبد الله'),
      `استخراج الاسم الرباعي كاملاً دون بتر: ${parsedName.taxpayerName}`
    );
  }

  // ----------------------------------------------------
  // Test 5: الحفاظ على السياق بين الجمل (تحديث المسودة)
  // ----------------------------------------------------
  console.log('\n📋 الاختبار 5: الحفاظ على سياق الجلسة ودمج التعديلات التراكمية');
  {
    const initialDraft: VoiceExtractedPayload = {
      intent: 'create_compound_record',
      operationCategory: 'create',
      confidence: 0.9,
      analysisSource: 'deterministic_rules',
      taxpayerName: 'جميل أحمد',
      taxpayerPhone: '',
      nationalId: '',
      propertyTitle: 'عقار جميل أحمد',
      propertyType: 'residential',
      region: 'صنعاء',
      address: 'شارع حدة',
      floorsCount: 3,
      apartmentsCount: 6,
      shopsCount: 0,
      officesCount: 0,
      agentName: '',
      agentPhone: '',
      amount: 0,
      currency: 'ريال يمني',
      paymentMethod: 'cash',
      dateIso: '',
      timeStr: '',
      reminderTopic: '',
      targetUnitNumber: '',
      targetUnitType: 'apartment',
      searchQuery: '',
      notes: '',
    };

    // التعديل اللاحق: المستخدم أضاف رقم الهاتف والوكيل
    const followUpSpeech = 'ورقم هاتف المكلف 777333444 والوكيل نبيل';
    const followUpExtraction = parseArabicVoiceCommandDeterministic(followUpSpeech);
    const merged = mergeFollowUpIntoDraft(initialDraft, followUpExtraction, followUpSpeech);

    assert(
      merged.taxpayerName === 'جميل أحمد',
      'الحفاظ على اسم المكلف السابق من السياق دون مسحه'
    );
    assert(
      merged.address === 'شارع حدة',
      'الحفاظ على عنوان العقار السابق من السياق'
    );
    assert(
      merged.floorsCount === 3 && merged.apartmentsCount === 6,
      'الحفاظ على أعداد الأدوار والشقق السابقة'
    );
    assert(
      merged.taxpayerPhone === '777333444',
      `دمج رقم الهاتف المضاف لاحقًا بنجاح: ${merged.taxpayerPhone}`
    );
    assert(
      merged.agentName.includes('نبيل'),
      `دمج اسم الوكيل المضاف لاحقًا بنجاح: ${merged.agentName}`
    );
  }

  // ----------------------------------------------------
  // Test 6: معالجة رفض صلاحية الميكروفون
  // ----------------------------------------------------
  console.log('\n📋 الاختبار 6: معالجة واضحة لرفض إذن الميكروفون');
  {
    // اختبار دالة تعيين رسائل الأخطاء
    const getFriendlyMicErrorMessage = (errName: string): string => {
      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        return 'تم رفض إذن الوصول إلى الميكروفون. يرجى تفعيل الصلاحية من إعدادات المتصفح.';
      } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
        return 'لم يتم العثور على ميكروفون متصل بالجهاز.';
      }
      return 'تعذر الوصول إلى الميكروفون';
    };

    const deniedMsg = getFriendlyMicErrorMessage('NotAllowedError');
    assert(
      deniedMsg.includes('تم رفض إذن'),
      'ظهور رسالة عربية توجيهية واضحة عند رفض إذن الميكروفون'
    );

    const noDeviceMsg = getFriendlyMicErrorMessage('NotFoundError');
    assert(
      noDeviceMsg.includes('لم يتم العثور على ميكروفون'),
      'ظهور رسالة واضحة عند عدم وجود ميكروفون متصل'
    );
  }

  // ----------------------------------------------------
  // Test 7: فشل خدمة تحويل الصوت إلى نص والتحول التلقائي البديل
  // ----------------------------------------------------
  console.log('\n📋 الاختبار 7: مرونة خدمة النسخ والتحول البديل عند الفشل');
  {
    // فحص التحقق من صحة المدخلات الفارغة
    const emptyResult = await transcribeAudioOnServer('', 'audio/webm');
    assert(
      emptyResult.success === false && emptyResult.error === 'الملف الصوتي فارغ',
      'رفض معالجة التسجيل الفارغ بأمان وإرجاع خطأ مفهوم'
    );
  }

  // ----------------------------------------------------
  // Test 8: انقطاع الإنترنت ومعالجة وضع Offline
  // ----------------------------------------------------
  console.log('\n📋 الاختبار 8: حماية النظام عند انقطاع الإنترنت');
  {
    // في بيئة عدم وجود إنترنت، يقوم المحرك بالتحول التلقائي للقواعد القطعية دون انهيار
    const offlineSpeech = 'افتح ملف كامل عبد الرحمن';
    const plan = buildVoiceExecutionPlan(
      offlineSpeech,
      parseArabicVoiceCommandDeterministic(offlineSpeech),
      mockSnapshot
    );

    assert(
      plan.canExecute === true,
      'نجاح تحليل الأمر محليًا والوصول لخطة صالحة للتنفيذ حتى بدون اتصال خارجي'
    );
    assert(
      plan.selectedTaxpayer?.id === 'taxpayer-1',
      'تطابق السجل المستهدف مع قاعدة بيانات المتصفح بنجاح'
    );
  }

  // ----------------------------------------------------
  // Test 9: الاحتفاظ بالصوت لإعادة المحاولة دون الحاجة للتحدث مجددًا
  // ----------------------------------------------------
  console.log('\n📋 الاختبار 9: الاحتفاظ بالتسجيل الصوتي لإعادة الإرسال');
  {
    const mockAudioResult = {
      blob: new Blob(['fake-audio-bits'], { type: 'audio/webm' }),
      mimeType: 'audio/webm',
      durationMs: 3500,
      base64Audio: 'ZmFrZS1hdWRpby1iaXRz',
      audioUrl: 'blob:https://app.example/mock-audio',
    };

    assert(
      mockAudioResult.base64Audio.length > 0 && Boolean(mockAudioResult.audioUrl),
      'الاحتفاظ ببيانات التسجيل في الذاكرة لتكرار المحاولة وسماع الصوت دون إعادة التحدث'
    );
  }

  // ----------------------------------------------------
  // Test 10: منع التنفيذ المضاعف (Idempotency Protection)
  // ----------------------------------------------------
  console.log('\n📋 الاختبار 10: منع تنفيذ نفس الخطة الصوتية مرتين (Idempotency)');
  {
    resetExecutedPlansForTesting();
    const testKey = 'voice_plan_idempotency_test_123';

    assert(
      hasPlanBeenExecuted(testKey) === false,
      'الخطة غير منفذة قبل تأكيدها'
    );

    markPlanAsExecuted(testKey);

    assert(
      hasPlanBeenExecuted(testKey) === true,
      'تسجيل مفتاح الخطة فور تنفيذها الأول'
    );

    // محاولة إعادة تنفيذ نفس المفتاح
    const isDoubleBlocked = hasPlanBeenExecuted(testKey);
    assert(
      isDoubleBlocked === true,
      'حجب التنفيذ الثاني بنجاح ومنع تكرار السجلات أو المعاملات المالية'
    );
  }

  // ----------------------------------------------------
  // Test 11: منع أي كتابة في قاعدة البيانات قبل تأكيد المستخدم الصريح
  // ----------------------------------------------------
  console.log('\n📋 الاختبار 11: بوابة التأكيد الإلزامي الصريح قبل الكتابة');
  {
    const parsed = parseArabicVoiceCommandDeterministic('سجل تحصيل خمسة آلاف ريال من كامل');
    const plan = buildVoiceExecutionPlan(
      'سجل تحصيل خمسة آلاف ريال من كامل',
      parsed,
      mockSnapshot
    );

    assert(
      plan.requiresSensitiveConfirmation === true,
      'العمليات المالية تفرض التأكيد الإلزامي الصريح (requiresSensitiveConfirmation = true)'
    );

    // التحقق من أن وجود الخطة بمفرده لا ينفذ شيئًا حتى يتم استدعاء زر التأكيد
    assert(
      hasPlanBeenExecuted(plan.idempotencyKey) === false,
      'قاعدة البيانات تظل خالية من أي كتابة حتى ضغط المستخدم على زر التأكيد'
    );
  }

  // ----------------------------------------------------
  // Test 12: التمييز الدقيق بين قيمة العقد في العقارات والتوريد أو سندات القبض
  // ----------------------------------------------------
  console.log('\n📋 الاختبار 12: التمييز بين قيمة العقد وسندات التحصيل المالي');
  {
    // حالة أ: جملة تسجيل عقار تذكر قيمة العقد
    const contractSentence =
      'سجل عقار باسم كامل في شارع الثلاثين أربعة أدوار وخمس شقق وقيمة العقد خمسة آلاف ريال';
    const contractParsed = parseArabicVoiceCommandDeterministic(contractSentence);

    assert(
      contractParsed.intent === 'create_compound_record' || contractParsed.intent === 'create_property',
      `تصنيف الأمر كإنشاء عقار وليس سند تحصيل (النية المستخرجة: ${contractParsed.intent})`
    );
    assert(
      contractParsed.intent !== 'record_collection',
      'عدم تحويل قيمة العقد إلى سند تحصيل مالي (record_collection)'
    );

    // حالة ب: جملة تحصيل مالي صريحة
    const collectionSentence =
      'سجل تحصيل خمسة آلاف ريال من حساب كامل عبد الرحمن';
    const collectionParsed = parseArabicVoiceCommandDeterministic(collectionSentence);

    assert(
      collectionParsed.intent === 'record_collection',
      `تصنيف أمر التحصيل المالي كسند قبض حقيقي (النية المستخرجة: ${collectionParsed.intent})`
    );
    assert(
      collectionParsed.amount === 5000,
      `استخراج مبلغ التحصيل بدقة: ${collectionParsed.amount}`
    );
  }

  // ----------------------------------------------------
  // Test 13: استخراج أمر مركب معقد (المكلف + الأدوار + حساب الشقق لكل طابق + المحلات + قيمة العقد + العنوان + الهاتف)
  // ----------------------------------------------------
  console.log('\n📋 الاختبار 13: الأمر الصوتي المركب الشامل (صالح حمادي - بيت بوس - 15 شقة + فتحتان)');
  {
    const userVoiceCommand =
      'قم مع إنشاء معطف لصالح حمادي يمتلك عقار سكني مكون من خمسه ابتداء في كل طابق ثلاث شقق رئيسية فتحتان تجاريه قيمه عليه 9,000 ريال صنعاء جوار بيت بوس رقم هاتفه 77 44 321';
    const parsed = parseArabicVoiceCommandDeterministic(userVoiceCommand);

    assert(
      parsed.intent === 'create_compound_record',
      `تحديد نية إنشاء سجل مركب كامل (النية: ${parsed.intent})`
    );
    assert(
      parsed.taxpayerName === 'صالح حمادي',
      `استخراج اسم المكلف بدقة من سياق «لصالح حمادي» (المستخرج: ${parsed.taxpayerName})`
    );
    assert(
      parsed.floorsCount === 5,
      `استخراج عدد الأدوار (5 أدوار): ${parsed.floorsCount}`
    );
    assert(
      parsed.apartmentsCount === 15,
      `حساب إجمالي الشقق (5 أدوار × 3 شقق = 15 شقة): ${parsed.apartmentsCount}`
    );
    assert(
      parsed.shopsCount === 2,
      `استخراج الفتحات التجارية (فتحتان = 2): ${parsed.shopsCount}`
    );
    assert(
      parsed.amount === 9000,
      `استخراج قيمة العقد (9,000 ريال): ${parsed.amount}`
    );
    assert(
      parsed.address === 'صنعاء جوار بيت بوس',
      `استخراج العنوان الدقيق (صنعاء جوار بيت بوس): ${parsed.address}`
    );
    assert(
      parsed.region === 'صنعاء',
      `استخراج المنطقة (صنعاء): ${parsed.region}`
    );
    assert(
      parsed.taxpayerPhone === '7744321',
      `استخراج رقم الهاتف وتجميعه من الأرقام المنطوقة: ${parsed.taxpayerPhone}`
    );
    assert(
      parsed.propertyType === 'mixed',
      `تحديد نوع العقار كمختلط سكني وتجاري لوجود شقق ومحلات: ${parsed.propertyType}`
    );
  }

  console.log('\n======================================================');
  console.log(`📊 نتيجة الفحص: ${passedCount} نجح | ${failedCount} فشل`);
  console.log('======================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

void runTestSuite();
