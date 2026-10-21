import type {
  Taxpayer,
  Property,
  PropertyUnit,
  FieldVisit,
  Appointment,
  FinancialAssessment,
  FinancialTransaction,
  PropertyType,
  UnitType,
  WorkspaceRole,
} from '../types/rasd';

export type PaymentMethod = 'cash' | 'bank_transfer' | 'check' | 'electronic';

export type VoiceEngineIntent =
  | 'open_taxpayer_dossier'
  | 'create_compound_record'
  | 'create_taxpayer'
  | 'create_property'
  | 'record_collection'
  | 'create_appointment'
  | 'create_visit'
  | 'create_assessment'
  | 'search_records'
  | 'query_balance'
  | 'update_agent_phone'
  | 'update_unit_type'
  | 'delete_property'
  | 'unknown';

export type VoiceStageId =
  | 'stage_1_transcribe'
  | 'stage_2_nlu'
  | 'stage_3_structured_schema'
  | 'stage_4_entity_resolution'
  | 'stage_5_execution_plan'
  | 'stage_6_validation_security'
  | 'stage_7_confirmation_gate'
  | 'stage_8_execution_report';

export interface VoicePipelineStageStatus {
  id: VoiceStageId;
  stepNumber: number;
  title: string;
  status: 'pending' | 'active' | 'completed' | 'warning' | 'blocked';
  summary: string;
}

export type VoiceOperationCategory = 'query' | 'create' | 'update' | 'financial' | 'delete';

export interface VoiceExtractedPayload {
  intent: VoiceEngineIntent;
  operationCategory: VoiceOperationCategory;
  confidence: number;
  analysisSource: 'hybrid_gemini_and_rules' | 'deterministic_rules';
  selfCorrectionDetected?: boolean;
  selfCorrectionNote?: string;
  requiresClarification?: boolean;
  clarificationQuestion?: string;
  taxpayerName: string;
  taxpayerPhone: string;
  nationalId: string;
  propertyTitle: string;
  propertyType: PropertyType;
  region: string;
  address: string;
  floorsCount: number;
  apartmentsCount: number;
  shopsCount: number;
  officesCount: number;
  agentName: string;
  agentPhone: string;
  amount: number;
  currency: string;
  paymentMethod: PaymentMethod;
  dateIso: string;
  timeStr: string;
  reminderTopic: string;
  targetUnitNumber: string;
  targetUnitType: UnitType;
  searchQuery: string;
  notes: string;
}

export interface DisambiguationCandidate {
  id: string;
  entityType: 'taxpayer' | 'property' | 'unit';
  label: string;
  sublabel: string;
}

export interface FinancialObligationSummary {
  taxpayerId: string;
  taxpayerName: string;
  propertyId?: string;
  propertyTitle?: string;
  totalAssessedObligations: number;
  totalAdjustmentsAndPenalties: number;
  totalGrossObligation: number;
  totalPreviousPayments: number;
  remainingBeforeOperation: number;
  currentPaymentAmount: number;
  remainingAfterOperation: number;
  currency: string;
}

export interface VoicePlanOperationStep {
  order: number;
  collection:
    | 'taxpayers'
    | 'properties'
    | 'property_units'
    | 'financial_transactions'
    | 'appointments'
    | 'field_visits'
    | 'assessments'
    | 'audit_logs';
  operation: 'create' | 'update' | 'delete' | 'read';
  description: string;
  recordCount: number;
}

export interface VoiceEnginePlan {
  planId: string;
  idempotencyKey: string;
  rawTranscript: string;
  normalizedTranscript: string;
  intent: VoiceEngineIntent;
  intentLabel: string;
  operationCategory: VoiceOperationCategory;
  extracted: VoiceExtractedPayload;
  stages: VoicePipelineStageStatus[];
  // Resolved Firestore entities
  matchedTaxpayers: Taxpayer[];
  selectedTaxpayer?: Taxpayer;
  matchedProperties: Property[];
  selectedProperty?: Property;
  matchedUnits: PropertyUnit[];
  selectedUnit?: PropertyUnit;
  // Disambiguation
  disambiguationRequired: boolean;
  disambiguationPrompt?: string;
  disambiguationCandidates: DisambiguationCandidate[];
  // Conversational clarification
  clarificationQuestion?: string;
  // Financial summary (when relevant)
  financialSummary?: FinancialObligationSummary;
  // Planned operations
  operations: VoicePlanOperationStep[];
  // Validation, security & conflicts
  missingFields: { key: keyof VoiceExtractedPayload; label: string }[];
  duplicateWarnings: string[];
  conflictWarnings: string[];
  permissionError?: string;
  deleteBlockedReason?: string;
  requiresSensitiveConfirmation: boolean;
  canExecute: boolean;
}

export interface VoiceExecutionReport {
  planId: string;
  idempotencyKey: string;
  executedAt: string;
  intent: VoiceEngineIntent;
  intentLabel: string;
  success: boolean;
  headline: string;
  spokenSummary: string;
  openedTaxpayerId?: string;
  createdTaxpayerId?: string;
  createdTaxpayerCode?: string;
  createdPropertyId?: string;
  createdPropertyCode?: string;
  createdUnitsCount?: number;
  createdUnitNumbers?: string[];
  createdVisitId?: string;
  transactionId?: string;
  transactionReferenceNumber?: string;
  collectedAmount?: number;
  currency?: string;
  remainingBalanceAfter?: number;
  appointmentId?: string;
  appointmentDateTime?: string;
  searchResults?: {
    taxpayers: Taxpayer[];
    properties: Property[];
    units: PropertyUnit[];
  };
  verifiedDetails: { label: string; value: string }[];
}

export interface VoiceWorkspaceSnapshot {
  taxpayers: Taxpayer[];
  properties: Property[];
  propertyUnits: PropertyUnit[];
  visits: FieldVisit[];
  appointments: Appointment[];
  assessments: FinancialAssessment[];
  transactions: FinancialTransaction[];
  workspaceRole: WorkspaceRole;
  canDeleteRecords?: boolean;
  activeTaxpayerId?: string | null;
  activePropertyId?: string | null;
  referenceDate?: Date;
}

// Idempotency registry to prevent duplicate execution of the same confirmed plan
const executedIdempotencyKeys = new Set<string>();

export function hasPlanBeenExecuted(idempotencyKey: string): boolean {
  return executedIdempotencyKeys.has(idempotencyKey);
}

export function markPlanAsExecuted(idempotencyKey: string): void {
  executedIdempotencyKeys.add(idempotencyKey);
}

export function resetExecutedPlansForTesting(): void {
  executedIdempotencyKeys.clear();
}

export const INTENT_LABELS: Record<VoiceEngineIntent, string> = {
  open_taxpayer_dossier: 'فتح ملف المكلف والعقارات الموحد',
  create_compound_record: 'إنشاء سجل مركب (مكلف + عقار + وحدات)',
  create_taxpayer: 'إضافة مكلف جديد',
  create_property: 'إضافة عقار ووحدات عقارية',
  record_collection: 'تسجيل تحصيل مالي',
  create_appointment: 'إنشاء موعد / تذكير متابعة',
  create_visit: 'تسجيل زيارة ميدانية',
  create_assessment: 'إصدار تقييم مالي عقاري',
  search_records: 'بحث واستعلام في السجلات',
  query_balance: 'استعلام عن الرصيد والمتبقي المالي',
  update_agent_phone: 'تحديث رقم هاتف الوكيل / المكلف',
  update_unit_type: 'تعديل نوع وحدة عقارية',
  delete_property: 'حذف عقار (عملية حساسة)',
  unknown: 'أمر غير مكتمل التحديد',
};

/**
 * Stage 1 Helper: Convert Eastern Arabic numerals and normalize Arabic/Yemeni text
 */
export function normalizeArabicSpeech(input: string): string {
  if (!input) return '';
  const easternDigits = '٠١٢٣٤٥٦٧٨٩';
  let text = input
    .split('')
    .map((ch) => {
      const idx = easternDigits.indexOf(ch);
      return idx >= 0 ? String(idx) : ch;
    })
    .join('');

  // Remove tashkeel (diacritics) and tatweel
  text = text.replace(/[\u064B-\u065F\u0670\u0640]/g, '');

  text = text
    .replace(/[،؛,]/g, ' ، ')
    .replace(/\s+/g, ' ')
    .trim();

  return text;
}

/**
 * Strips accidental speech repetitions (words or multi-word ngrams) from speech recognizer
 */
export function sanitizeSpokenRepetitions(input: string): string {
  if (!input) return '';
  let text = input.replace(/\s+/g, ' ').trim();

  // 1. Remove duplicate adjacent single words (e.g. "شارع شارع" -> "شارع", "كامل كامل" -> "كامل")
  text = text.replace(/([\u0600-\u06FF0-9]+)(?:\s+\1)+(?=\s|$)/gu, '$1');

  // 2. Remove duplicate 2-word phrases (e.g. "أضف إلى أضف إلى" -> "أضف إلى")
  text = text.replace(/([\u0600-\u06FF0-9]+\s+[\u0600-\u06FF0-9]+)(?:\s+\1)+(?=\s|$)/gu, '$1');

  // 3. Remove duplicate 3-word phrases (e.g. "قم بإضافة المكلف قم بإضافة المكلف" -> "قم بإضافة المكلف")
  text = text.replace(
    /([\u0600-\u06FF0-9]+\s+[\u0600-\u06FF0-9]+\s+[\u0600-\u06FF0-9]+)(?:\s+\1)+(?=\s|$)/gu,
    '$1'
  );

  // 4. Specifically fix common street / location double prefixes
  text = text.replace(/(?:شارع\s+)+شارع\s+/g, 'شارع ');
  text = text.replace(/(?:حي\s+)+حي\s+/g, 'حي ');
  text = text.replace(/(?:منطقة\s+)+منطقة\s+/g, 'منطقة ');

  return text.trim();
}

export function normalizeForSearchMatch(input: string): string {
  return normalizeArabicSpeech(input)
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[،.؟!]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const ARABIC_WORD_NUMBERS: Record<string, number> = {
  واحد: 1,
  واحده: 1,
  واحدة: 1,
  اول: 1,
  اثنين: 2,
  اثنان: 2,
  ثنتين: 2,
  ثلاث: 3,
  ثلاثه: 3,
  ثلاثة: 3,
  اربع: 4,
  اربعه: 4,
  أربع: 4,
  أربعة: 4,
  خمس: 5,
  خمسه: 5,
  خمسة: 5,
  ست: 6,
  سته: 6,
  ستة: 6,
  سبع: 7,
  سبعه: 7,
  سبعة: 7,
  ثمان: 8,
  ثمانيه: 8,
  ثمانية: 8,
  تسع: 9,
  تسعه: 9,
  تسعة: 9,
  عشر: 10,
  عشره: 10,
  عشرة: 10,
  احدعشر: 11,
  اثناعشر: 12,
  عشرين: 20,
  عشرون: 20,
  ثلاثين: 30,
  ثلاثون: 30,
  اربعين: 40,
  اربعون: 40,
  أربعين: 40,
  خمسين: 50,
  خمسون: 50,
  ستين: 60,
  ستون: 60,
  سبعين: 70,
  سبعون: 70,
  ثمانين: 80,
  ثمانون: 80,
  تسعين: 90,
  تسعون: 90,
  مائه: 100,
  مائة: 100,
  ميه: 100,
  مية: 100,
  مائتين: 200,
  مئتين: 200,
  ثلاثمائه: 300,
  ثلاثميه: 300,
  اربعمائه: 400,
  اربعميه: 400,
  خمسمائه: 500,
  خمسميه: 500,
  الف: 1000,
  ألف: 1000,
  الفين: 2000,
  ألفين: 2000,
  الاف: 1000,
  آلاف: 1000,
  مليون: 1000000,
};

export function extractCountForNoun(text: string, nounRegexSource: string): number {
  const norm = normalizeForSearchMatch(text);

  // Check both nominative and accusative dual forms (فتحتان / فتحتين, دوران / دورين, شقتان / شقتين)
  if (nounRegexSource.includes('دور') || nounRegexSource.includes('طابق')) {
    if (/(دوران|دورين|طابقان|طابقين)/i.test(norm)) return 2;
  }
  if (nounRegexSource.includes('شقق') || nounRegexSource.includes('شقه')) {
    if (/(شقتان|شقتين)/i.test(norm)) return 2;
  }
  if (nounRegexSource.includes('فتح') || nounRegexSource.includes('محل') || nounRegexSource.includes('دكان')) {
    if (/(فتحتان|فتحتين|محلان|محلين|دكانان|دكانين)/i.test(norm)) return 2;
  }
  if (nounRegexSource.includes('مكتب')) {
    if (/(مكتبان|مكتبين)/i.test(norm)) return 2;
  }

  const digitBefore = new RegExp(`(\\d+)\\s+(?:${nounRegexSource})`, 'i');
  const digitMatch = norm.match(digitBefore);
  if (digitMatch) {
    return parseInt(digitMatch[1], 10);
  }

  const wordRegex = new RegExp(
    `([\\u0600-\\u06FF]+)(?:\\s+و([\\u0600-\\u06FF]+))?\\s+(?:${nounRegexSource})`,
    'i'
  );
  const wordMatch = norm.match(wordRegex);
  if (wordMatch) {
    const w1 = wordMatch[1].replace(/^و/, '');
    const w2 = wordMatch[2]?.replace(/^و/, '');
    let total = 0;
    if (ARABIC_WORD_NUMBERS[w1] !== undefined) {
      total += ARABIC_WORD_NUMBERS[w1];
    }
    if (w2 && ARABIC_WORD_NUMBERS[w2] !== undefined) {
      total += ARABIC_WORD_NUMBERS[w2];
    }
    if (total > 0) return total;
  }

  return 0;
}

export function extractMonetaryAmount(text: string): { amount: number; currency: string } {
  const norm = normalizeForSearchMatch(text);

  let currency = 'ريال يمني';
  if (/سعودي/.test(norm)) currency = 'ريال سعودي';
  else if (/دولار/.test(norm)) currency = 'دولار أمريكي';
  else if (/ريال/.test(norm)) currency = 'ريال يمني';

  const allDigitMatches = Array.from(
    norm.matchAll(/(?:تحصيل|دفعه|مبلغ|سند|استلام|دفع|بقيمه|بمبلغ|قدرها)?\s*(\d+(?:\.\d+)?)\s*(الف|الاف|مليون)?\s*(ريال|دولار)?/g)
  );
  for (const m of allDigitMatches) {
    const rawNum = m[1];
    if (!rawNum || rawNum.length >= 8) continue;
    const val = parseFloat(rawNum);
    const multWord = m[2];
    const currWord = m[3];
    if (multWord === 'الف' || multWord === 'الاف') return { amount: val * 1000, currency };
    if (multWord === 'مليون') return { amount: val * 1000000, currency };
    if (currWord || val >= 100) return { amount: val, currency };
  }

  const spokenThousandMatch = norm.match(
    /(واحد|اثنين|ثلاث|ثلاثه|اربع|اربعه|خمس|خمسه|ست|سته|سبع|سبعه|ثمان|ثمانيه|تسع|تسعه|عشر|عشره|عشرين|ثلاثين|اربعين|خمسين|ستين|سبعين|ثمانين|تسعين|مائه|ميه|مائتين|مئتين|خمسمائه|خمسميه)\s+(الف|الاف|مليون)/
  );
  if (spokenThousandMatch) {
    const base = ARABIC_WORD_NUMBERS[spokenThousandMatch[1]] || 0;
    const mult = spokenThousandMatch[2] === 'مليون' ? 1000000 : 1000;
    if (base > 0) {
      return { amount: base * mult, currency };
    }
  }

  if (/\bالفين\b/.test(norm)) {
    return { amount: 2000, currency };
  }
  if (/\bالف\s+ريال\b/.test(norm)) {
    return { amount: 1000, currency };
  }

  const spokenDirectMatch = norm.match(
    /(مائه|ميه|مائتين|مئتين|ثلاثمائه|اربعمائه|خمسمائه|خمسميه|عشرين|ثلاثين|اربعين|خمسين|ستين|سبعين|ثمانين|تسعين)\s+ريال/
  );
  if (spokenDirectMatch && ARABIC_WORD_NUMBERS[spokenDirectMatch[1]]) {
    return { amount: ARABIC_WORD_NUMBERS[spokenDirectMatch[1]], currency };
  }

  return { amount: 0, currency };
}

export function inferOperationCategory(intent: VoiceEngineIntent): VoiceOperationCategory {
  switch (intent) {
    case 'open_taxpayer_dossier':
    case 'search_records':
    case 'query_balance':
      return 'query';
    case 'record_collection':
    case 'create_assessment':
      return 'financial';
    case 'update_agent_phone':
    case 'update_unit_type':
      return 'update';
    case 'delete_property':
      return 'delete';
    default:
      return 'create';
  }
}

/**
 * Resolves in-speech self-corrections in Arabic / Yemeni dialect, such as:
 * - «سجل عقار باسم كامل، لا، أقصد باسم خالد» -> replaces «باسم كامل» with «باسم خالد»
 * - «سجل زيارة للمكلف كامل لا اقصد خالد» -> replaces «كامل» with «خالد»
 * - «سجل تحصيل ثلاثة آلاف، بل أربعة آلاف ريال» -> replaces «ثلاثة آلاف» with «أربعة آلاف»
 */
export function resolveSelfCorrectionsInSpeech(rawInput: string): {
  effectiveTranscript: string;
  selfCorrectionDetected: boolean;
  selfCorrectionNote: string;
} {
  const clean = normalizeArabicSpeech(rawInput);
  const correctionMarkerRegex =
    /(?:،|\s)+(?:لا\s*(?:،\s*)?(?:أقصد|اقصد|قصدي|بل)|عفوًا\s*(?:،\s*)?(?:أقصد|اقصد)?|عفوا\s*(?:،\s*)?(?:أقصد|اقصد)?|أقصد|اقصد|قصدي|بل)\s+/i;

  if (!correctionMarkerRegex.test(clean)) {
    return {
      effectiveTranscript: clean,
      selfCorrectionDetected: false,
      selfCorrectionNote: '',
    };
  }

  let effective = clean;
  let note = 'تم رصد استدراك وتصحيح ذاتي أثناء الكلام واعتماد القيمة المصححة النهائية.';

  // Case 1: Name self-correction after "باسم ... لا أقصد (باسم) ..."
  const nameCorrectionBism = effective.match(
    /(باسم|للمكلف|المكلف|الوكيل)\s+([\u0600-\u06FF]+(?:\s+[\u0600-\u06FF]+){0,2}?)\s*(?:،|\s)+(?:لا\s*(?:،\s*)?(?:أقصد|اقصد|قصدي|بل)|عفوًا\s*(?:أقصد|اقصد)?|عفوا\s*(?:أقصد|اقصد)?|أقصد|اقصد|قصدي|بل)\s+(?:باسم\s+|للمكلف\s+|المكلف\s+|الوكيل\s+)?([\u0600-\u06FF]+(?:\s+[\u0600-\u06FF]+){0,2})/i
  );
  if (nameCorrectionBism) {
    const prefix = nameCorrectionBism[1];
    const oldVal = nameCorrectionBism[2].replace(/،/g, '').trim();
    const newVal = nameCorrectionBism[3].replace(/،/g, '').trim();
    effective = effective.replace(nameCorrectionBism[0], `${prefix} ${newVal}`);
    note = `تم تصحيح الاسم من «${oldVal}» إلى «${newVal}» بناءً على استدراك المتحدث.`;
    return {
      effectiveTranscript: effective,
      selfCorrectionDetected: true,
      selfCorrectionNote: note,
    };
  }

  // Case 2: Street / region self-correction
  const streetCorrection = effective.match(
    /((?:شارع|حي|منطقة|منطقه|حارة|جولة)\s+[\u0600-\u06FF0-9]+)\s*(?:،|\s)+(?:لا\s*(?:،\s*)?(?:أقصد|اقصد|قصدي|بل)|عفوًا|عفوا|أقصد|اقصد|قصدي|بل)\s+((?:شارع|حي|منطقة|منطقه|حارة|جولة)?\s*[\u0600-\u06FF0-9]+)/i
  );
  if (streetCorrection) {
    const oldLoc = streetCorrection[1].trim();
    const newLoc = streetCorrection[2].trim();
    const finalLoc = /^(شارع|حي|منطقة|منطقه|حارة|جولة)/.test(newLoc)
      ? newLoc
      : `${oldLoc.split(/\s+/)[0]} ${newLoc}`;
    effective = effective.replace(streetCorrection[0], finalLoc);
    note = `تم تصحيح الموقع من «${oldLoc}» إلى «${finalLoc}» بناءً على استدراك المتحدث.`;
    return {
      effectiveTranscript: effective,
      selfCorrectionDetected: true,
      selfCorrectionNote: note,
    };
  }

  // Case 3: General segment self-correction — prioritize the segment after the last correction marker while keeping the leading command verb
  const parts = effective.split(correctionMarkerRegex);
  if (parts.length >= 2) {
    const before = parts[0].trim();
    const after = parts[parts.length - 1].trim();
    const verbMatch = before.match(
      /^((?:انشئ|أنشئ|اضف|أضف|سجل|ادخل|أدخل|افتح|اعرض|ابحث\s+عن|وثق|حدث|عدل)\s+(?:عقار|عقارًا|عقارا|مكلف|مكلفًا|مكلفا|زيارة|زياره|تحصيل|دفعة|موعد)?)/i
    );
    if (verbMatch && !after.startsWith(verbMatch[1])) {
      effective = `${verbMatch[1]} ${after}`.replace(/\s+/g, ' ').trim();
    } else {
      effective = `${before} ، ${after}`;
    }
    note = `تم اعتماد التصحيح الأخير للمتحدث: «${after}».`;
  }

  return {
    effectiveTranscript: effective,
    selfCorrectionDetected: true,
    selfCorrectionNote: note,
  };
}

export function parseArabicVoiceCommandDeterministic(
  rawTranscript: string,
  referenceDate: Date = new Date()
): VoiceExtractedPayload {
  const { effectiveTranscript, selfCorrectionDetected, selfCorrectionNote } =
    resolveSelfCorrectionsInSpeech(rawTranscript);
  const clean = normalizeArabicSpeech(effectiveTranscript);
  const norm = normalizeForSearchMatch(effectiveTranscript);

  const floorsCount = extractCountForNoun(clean, 'ادوار|دور|طوابق|طابق');
  const apartmentsCount = extractCountForNoun(clean, 'شقق|شقه|شقة');
  const shopsCount = extractCountForNoun(
    clean,
    'فتحات\\s+تجاريه|فتحه\\s+تجاريه|فتحات|فتحه|محلات\\s+تجاريه|محلات|محل|دكاكين|دكان'
  );
  const officesCount = extractCountForNoun(clean, 'مكاتب|مكتب');

  let agentName = '';
  const agentMatch = clean.match(
    /(?:والوكيل|الوكيل|وكيله|وكيل العقار)\s+([\u0600-\u06FF]+(?:\s+[\u0600-\u06FF]+){0,2}?)(?=\s*(?:،|$|رقمه|برقم|هاتفه|في|لديه|وعنده|بمبلغ|على|إلى|الى))/i
  );
  if (agentMatch?.[1]) {
    agentName = agentMatch[1]
      .replace(/\s+(?:إلى|الى|لـ|هو|برقم|رقمه).*$/i, '')
      .trim();
  }

  const phoneMatches = clean.match(/\b(?:00967|\+967)?(7[01378]\d{7}|\d{7,10})\b/g) || [];
  let taxpayerPhone = '';
  let agentPhone = '';
  if (phoneMatches.length > 0) {
    if (/الوكيل|وكيل/.test(clean) && (/هاتف\s+الوكيل|رقم\s+الوكيل|وكيل.*رقم/.test(norm) || !/مكلف/.test(norm))) {
      agentPhone = phoneMatches[0] || '';
    } else {
      taxpayerPhone = phoneMatches[0] || '';
      if (phoneMatches[1]) agentPhone = phoneMatches[1];
    }
  }

  let intent: VoiceEngineIntent = 'unknown';
  let confidence = 0.85;

  const hasCreateVerb = /(انشئ|اضف|سجل\s+مكلف|ادخل\s+مكلف|مكلف\s+جديد)/.test(norm);
  const hasOpenDossierVerb =
    /(افتح\s+ملف|اعرض\s+ملف|اعرض\s+عقارات|افتح\s+عقارات|ادخل\s+على\s+ملف|افتح\s+صفحه)/.test(norm) &&
    !/(مكلف\s+جديد|لديه\s+عقار|انشئ)/.test(norm);
  const hasTaxpayerKeyword = /(مكلف|مكلفا|باسم)/.test(norm);
  const hasPropertyKeyword = /(عقار|عقارا|عماره|مبنى|فله|بيت|ارض|شارع)/.test(norm);
  const hasUnitsInfo = floorsCount > 0 || apartmentsCount > 0 || shopsCount > 0 || officesCount > 0;

  if (
    /(احذف|حذف|ازل|الغاء\s+عقار)/.test(norm) &&
    /(عقار|عماره|مبنى|هذا\s+العقار|العقار\s+المحدد)/.test(norm)
  ) {
    intent = 'delete_property';
    confidence = 0.95;
  } else if (
    /(غير|عدل|حول|بدل)/.test(norm) &&
    /(نوع\s+هذه\s+الوحده|نوع\s+الوحده|الوحده|شقه|فتحه|محل)/.test(norm) &&
    /(تجار|شقه|مكتب|مستودع|محل)/.test(norm)
  ) {
    intent = 'update_unit_type';
    confidence = 0.94;
  } else if (
    /(عدل|غير|حدث|اضف)/.test(norm) &&
    /(رقم\s+هاتف|جوال|تلفون|رقم)/.test(norm) &&
    /(الوكيل|وكيل|المكلف)/.test(norm)
  ) {
    intent = 'update_agent_phone';
    confidence = 0.94;
  } else if (hasOpenDossierVerb) {
    intent = 'open_taxpayer_dossier';
    confidence = 0.96;
  } else if (
    /(اعرض|كم|ما\s+هو|استعلم\s+عن|احسب)/.test(norm) &&
    /(المتبقي|الباقي|الرصيد|المديونيه|المستحق|حساب)/.test(norm)
  ) {
    intent = 'query_balance';
    confidence = 0.96;
  } else if (
    /(ابحث\s+عن|بحث\s+عن|دور\s+على|فتش\s+عن|اعرض\s+بيانات|اين\s+ملف)/.test(norm)
  ) {
    intent = 'search_records';
    confidence = 0.95;
  } else if (
    /(ذكرني|موعد|جدول|تذكير|نبهني)/.test(norm) ||
    (/(غدا|بكره|بعد\s+غد|الاسبوع\s+القادم)/.test(norm) && /(متابعه|تحصيل|زياره|موعد)/.test(norm))
  ) {
    intent = 'create_appointment';
    confidence = 0.95;
  } else if (/(زياره\s+ميدانيه|سجل\s+زياره|قمت\s+بزياره|وثق\s+زياره)/.test(norm)) {
    intent = 'create_visit';
    confidence = 0.95;
  } else if (
    /(تحصيل|تحصيلا|قبض|دفعه|سدد|تسديد|استلام\s+مبلغ|سند\s+قبض)/.test(norm)
  ) {
    intent = 'record_collection';
    confidence = 0.96;
  } else if (
    (hasCreateVerb || hasTaxpayerKeyword) &&
    hasPropertyKeyword &&
    (hasUnitsInfo || hasTaxpayerKeyword)
  ) {
    intent = 'create_compound_record';
    confidence = 0.97;
  } else if (
    (hasPropertyKeyword && hasUnitsInfo && !hasTaxpayerKeyword) ||
    (/(اضف|انشئ|سجل)/.test(norm) && /(عقار|عقارا|عماره|مبنى)/.test(norm) && !hasTaxpayerKeyword)
  ) {
    intent = 'create_property';
    confidence = 0.94;
  } else if (hasCreateVerb && hasTaxpayerKeyword && !hasPropertyKeyword) {
    intent = 'create_taxpayer';
    confidence = 0.92;
  } else if (/(تقييم|ربط\s+مالي|فرض\s+رسوم)/.test(norm)) {
    intent = 'create_assessment';
    confidence = 0.9;
  }

  let taxpayerName = '';
  const namePatterns = [
    /(?:قم\s+بإضافة|قم\s+باضافة|بإضافة|باضافة|إضافة|اضافة|أضف|اضف|سجل|تسجيل)\s+(?:المكلف\s+|مكلف\s+)([\u0600-\u06FF]+(?:\s+[\u0600-\u06FF]+){0,5}?)(?=\s*(?:،|$|وأضف|واضف|أضف|اضف|له|عنده|لديه|يملك|في|وعنوانه|عنوانه|برقم|رقمه|هاتفه|والوكيل|الوكيل|عقارا|عقارًا|عقار))/i,
    /(?:افتح\s+ملف|اعرض\s+ملف|اعرض\s+عقارات|افتح\s+عقارات)\s+(?:المكلف\s+)?([\u0600-\u06FF]+(?:\s+[\u0600-\u06FF]+){0,4}?)(?=\s*(?:،|$|في|اليوم|غدا|بكره|الاسبوع|الأسبوع|[؟.!]))/i,
    /(?:مكلفا?\s+باسم|مكلف\s+اسمه|باسم\s+المكلف|باسم)\s+([\u0600-\u06FF]+(?:\s+[\u0600-\u06FF]+){0,4}?)(?=\s*(?:،|$|لديه|عنده|يملك|في\s+شارع|في\s+منطقه|رقمه|هاتفه|والوكيل|الوكيل))/,
    /(?:من\s+حساب\s+العقار\s+الخاص\s+ب|العقار\s+الخاص\s+ب|الخاص\s+بالمكلف\s+|الخاص\s+ب)\s*([\u0600-\u06FF]+(?:\s+[\u0600-\u06FF]+){0,4}?)(?=\s*(?:،|$|في|بمبلغ|وقدره|غدا|بكره|الساعه|والوكيل))/,
    /(?:للمكلف|من\s+المكلف|من\s+حساب|على\s+المكلف|متابعه\s+المتبقي\s+على|المتبقي\s+على|بمتابعه\s+المكلف|بمتابعه|متابعه|ابحث\s+عن|بحث\s+عن)\s+([\u0600-\u06FF]+(?:\s+[\u0600-\u06FF]+){0,4}?)(?=\s*(?:،|$|في|بمبلغ|وقدره|اليوم|غدا|غدًا|بكره|بعد\s+غد|الاسبوع|الأسبوع|الساعه|والوكيل|[؟.!]))/,
    /(?:سجل\s+زياره|زياره\s+ميدانيه|زياره|اضف|أضف)\s+(?:للمكلف\s+|لـ\s*|ل)?([\u0600-\u06FF]+(?:\s+[\u0600-\u06FF]+){0,3}?)(?=\s*(?:،|$|اليوم|غدا|غدًا|بكره|الاسبوع|الأسبوع|عقارا|عقارًا|عقار|جديدا|جديدًا|في|[؟.!]))/,
    /(?:مكلف\s+جديد|اضف\s+مكلف)\s+([\u0600-\u06FF]+(?:\s+[\u0600-\u06FF]+){0,4}?)(?=\s*(?:،|$|لديه|في|رقمه))/,
  ];

  for (const np of namePatterns) {
    const m = clean.match(np);
    if (m?.[1]) {
      let candidate = m[1]
        .replace(/^(?:المكلف|الاخ|السيد|حساب\s+العقار\s+الخاص\s+بـ?|العقار\s+الخاص\s+بـ?)\s+/i, '')
        .replace(/\s+(?:لديه|عنده|في|بمبلغ|اليوم|غدًا|غدا|الأسبوع\s+القادم|الاسبوع\s+القادم|عقارًا|عقارا|عقار|جديدًا|جديدا).*$/i, '')
        .replace(/[؟.!،]/g, '')
        .trim();

      const words = candidate.split(/\s+/);
      if (
        words[0] &&
        words[0].startsWith('ل') &&
        words[0].length >= 4 &&
        !['لطفي', 'لؤي', 'لبنى', 'ليلى'].includes(words[0])
      ) {
        words[0] = words[0].slice(1);
        candidate = words.join(' ');
      }

      if (
        candidate &&
        !['هذا', 'هذا المكلف', 'العقار', 'العقار المحدد', 'عقار', 'عقار جديد', 'اليوم', 'غدا'].includes(candidate)
      ) {
        taxpayerName = candidate;
        break;
      }
    }
  }

  let address = '';
  let region = '';
  const streetMatch = clean.match(
    /(?:في\s+|وعنوانه\s+|عنوانه\s+|موقع\s+|بموقع\s+)?((?:شارع|حي|منطقة|منطقه|جولة|جوله|حارة|حاره)\s+[\u0600-\u06FF0-9]+(?:\s+[\u0600-\u06FF0-9]+){0,3}?)(?=\s*(?:،|$|اربع|أربع|ثلاث|خمس|ست|سبع|ثمان|تسع|عشر|\d+|يتكون|مكون|والوكيل|الوكيل|وقيمة|قيمة|ولديه|لديه))/i
  );
  if (streetMatch?.[1]) {
    address = streetMatch[1]
      .replace(/^(?:في|وعنوانه|عنوانه)\s+/i, '')
      .replace(/\s+/g, ' ')
      .trim();
    address = address.replace(/^شارع\s+شارع\s+/i, 'شارع ');
    region = address;
  }

  let propertyType: PropertyType = 'residential';
  if ((floorsCount > 0 || apartmentsCount > 0) && (shopsCount > 0 || officesCount > 0)) {
    propertyType = 'mixed';
  } else if (shopsCount > 0 || officesCount > 0 || /تجاري|تجاريه/.test(norm)) {
    propertyType = 'commercial';
  } else if (/صناعي/.test(norm)) {
    propertyType = 'industrial';
  } else if (/زراعي/.test(norm)) {
    propertyType = 'agricultural';
  } else if (apartmentsCount > 0 || floorsCount > 0 || /سكني|سكنيه/.test(norm)) {
    propertyType = 'residential';
  }

  let propertyTitle = '';
  const explicitPropTitleMatch = clean.match(
    /(?:عقار\s+باسم|عمارة\s+باسم|عقار\s+اسمه)\s+([\u0600-\u06FF0-9\s]+?)(?=\s*(?:،|$|في|لديه))/
  );
  if (explicitPropTitleMatch?.[1] && !intent.includes('taxpayer') && intent !== 'create_compound_record') {
    propertyTitle = explicitPropTitleMatch[1].trim();
  } else if (intent === 'create_compound_record' || intent === 'create_property') {
    if (taxpayerName && address) {
      propertyTitle = `عقار ${taxpayerName} — ${address}`;
    } else if (taxpayerName) {
      propertyTitle = `عقار ${taxpayerName}`;
    } else if (address) {
      propertyTitle = `عقار ${address}`;
    }
  }

  let notes = '';
  let contractAmount = 0;
  const contractMatch = clean.match(
    /(?:وقيمة\s+العقد|قيمة\s+العقد|إيجار\s+العقد|ايجار\s+العقد|الإيجار|الايجار|بقيمة\s+عقد|قيمة\s+الإيجار)\s+([\u0600-\u06FF0-9\s]+?)(?=\s*(?:،|$|و|ريال|دولار))/i
  );
  if (contractMatch?.[0]) {
    const parsedContract = extractMonetaryAmount(contractMatch[0] + ' ريال');
    if (parsedContract.amount > 0) {
      contractAmount = parsedContract.amount;
      notes = `قيمة العقد: ${contractAmount.toLocaleString('ar-SA')} ${parsedContract.currency}`;
    }
  }

  const { amount, currency } = extractMonetaryAmount(clean);
  const effectiveAmount =
    amount > 0
      ? amount
      : contractAmount > 0 && intent !== 'record_collection'
        ? contractAmount
        : 0;

  let paymentMethod: PaymentMethod = 'cash';
  if (/تحويل|بنك|كريمي|حواله/.test(norm)) paymentMethod = 'bank_transfer';
  else if (/شيك/.test(norm)) paymentMethod = 'check';
  else if (/الكترون|محفظه|جوالي|فلوسك/.test(norm)) paymentMethod = 'electronic';

  const targetDate = new Date(referenceDate.getTime());
  if (/بعد\s+غد|بعد\s+بكره/.test(norm)) {
    targetDate.setDate(targetDate.getDate() + 2);
  } else if (/غدا|بكره|غد/.test(norm)) {
    targetDate.setDate(targetDate.getDate() + 1);
  } else if (/بعد\s+اسبوع|الاسبوع\s+القادم/.test(norm)) {
    targetDate.setDate(targetDate.getDate() + 7);
  }
  const dateIso = targetDate.toISOString().slice(0, 10);

  let timeStr = '10:00';
  const hourMatch = norm.match(/الساعه\s+(\d{1,2})(?:\s*:\s*(\d{2}))?\s*(صباحا|مساء|عصرا|ظهرا)?/);
  if (hourMatch) {
    let hr = parseInt(hourMatch[1], 10);
    const min = hourMatch[2] || '00';
    const period = hourMatch[3] || '';
    if ((period === 'مساء' || period === 'عصرا') && hr < 12) hr += 12;
    timeStr = `${String(hr).padStart(2, '0')}:${min}`;
  }

  let reminderTopic = '';
  if (intent === 'create_appointment') {
    const topicMatch = clean.match(/(?:بـ|لـ|حول|بخصوص)?\s*(متابعة\s+[\u0600-\u06FF\s]+|تحصيل\s+[\u0600-\u06FF\s]+|زيارة\s+[\u0600-\u06FF\s]+)/);
    reminderTopic =
      topicMatch?.[1]?.trim() ||
      (taxpayerName ? `متابعة ملف المكلف ${taxpayerName}` : '') ||
      clean.replace(/^(?:ذكّرني|ذكرني|حدّد موعد|موعد)\s*(?:غدًا|غدا|بكره)?\s*(?:بـ)?/i, '').trim();
  }

  let targetUnitType: UnitType = 'apartment';
  if (intent === 'update_unit_type') {
    if (/تجار|محل|فتحه|دكان/.test(norm)) targetUnitType = 'shop';
    else if (/مكتب/.test(norm)) targetUnitType = 'office';
    else if (/مستودع|مخزن/.test(norm)) targetUnitType = 'warehouse';
    else if (/شقه|سكن/.test(norm)) targetUnitType = 'apartment';
  }

  let targetUnitNumber = '';
  const unitNumMatch = clean.match(/(?:الوحدة|وحدة|شقة|محل|فتحة)\s*(?:رقم)?\s*([A-Za-z0-9\u0600-\u06FF-]+)/);
  if (unitNumMatch?.[1] && !['هذه', 'هذا', 'إلى', 'الى'].includes(unitNumMatch[1])) {
    targetUnitNumber = unitNumMatch[1];
  }

  const searchQuery =
    intent === 'search_records' || intent === 'open_taxpayer_dossier'
      ? taxpayerName || clean.replace(/^(?:ابحث\s+عن|بحث\s+عن|دور\s+على|اعرض\s+عقارات|افتح\s+ملف|اعرض)\s+/i, '').trim()
      : '';

  return {
    intent,
    operationCategory: inferOperationCategory(intent),
    confidence,
    analysisSource: 'deterministic_rules',
    selfCorrectionDetected,
    selfCorrectionNote,
    taxpayerName,
    taxpayerPhone,
    nationalId: '',
    propertyTitle,
    propertyType,
    region: region || 'غير محدد',
    address: address || 'غير محدد',
    floorsCount,
    apartmentsCount,
    shopsCount,
    officesCount,
    agentName,
    agentPhone,
    amount: effectiveAmount,
    currency,
    paymentMethod,
    dateIso,
    timeStr,
    reminderTopic,
    targetUnitNumber,
    targetUnitType,
    searchQuery,
    notes,
  };
}

const VALID_VOICE_INTENTS = new Set<VoiceEngineIntent>([
  'open_taxpayer_dossier',
  'create_compound_record',
  'create_taxpayer',
  'create_property',
  'record_collection',
  'create_appointment',
  'create_visit',
  'create_assessment',
  'search_records',
  'query_balance',
  'update_agent_phone',
  'update_unit_type',
  'delete_property',
  'unknown',
]);

/**
 * Merges a follow-up answer into a previous incomplete VoiceExtractedPayload (slot-filling)
 */
export function mergeFollowUpIntoDraft(
  previousDraft: VoiceExtractedPayload,
  newTurn: VoiceExtractedPayload,
  rawFollowUpTranscript: string
): VoiceExtractedPayload {
  const mergedIntent =
    previousDraft.intent !== 'unknown' && newTurn.intent === 'unknown'
      ? previousDraft.intent
      : newTurn.intent !== 'unknown'
        ? newTurn.intent
        : previousDraft.intent;

  // If the follow-up is a short name answer (e.g. "خالد محمد") when taxpayerName was missing
  let resolvedTaxpayerName = newTurn.taxpayerName || previousDraft.taxpayerName;
  if (!resolvedTaxpayerName && rawFollowUpTranscript.trim().split(/\s+/).length <= 4) {
    const candidateName = normalizeArabicSpeech(rawFollowUpTranscript)
      .replace(/^(?:اسم\s+المكلف|المكلف|باسم|هو|اسمه)\s+/i, '')
      .trim();
    if (candidateName && !/\d/.test(candidateName)) {
      resolvedTaxpayerName = candidateName;
    }
  }

  return {
    ...previousDraft,
    intent: mergedIntent,
    operationCategory: inferOperationCategory(mergedIntent),
    confidence: Math.max(previousDraft.confidence, newTurn.confidence),
    analysisSource:
      newTurn.analysisSource === 'hybrid_gemini_and_rules'
        ? 'hybrid_gemini_and_rules'
        : previousDraft.analysisSource,
    selfCorrectionDetected: Boolean(
      newTurn.selfCorrectionDetected || previousDraft.selfCorrectionDetected
    ),
    selfCorrectionNote: newTurn.selfCorrectionNote || previousDraft.selfCorrectionNote || '',
    clarificationQuestion: newTurn.clarificationQuestion || '',
    taxpayerName: resolvedTaxpayerName,
    taxpayerPhone: newTurn.taxpayerPhone || previousDraft.taxpayerPhone,
    propertyTitle: newTurn.propertyTitle || previousDraft.propertyTitle,
    propertyType:
      newTurn.propertyType !== 'residential' ? newTurn.propertyType : previousDraft.propertyType,
    region: newTurn.region !== 'غير محدد' ? newTurn.region : previousDraft.region,
    address: newTurn.address !== 'غير محدد' ? newTurn.address : previousDraft.address,
    floorsCount: newTurn.floorsCount || previousDraft.floorsCount,
    apartmentsCount: newTurn.apartmentsCount || previousDraft.apartmentsCount,
    shopsCount: newTurn.shopsCount || previousDraft.shopsCount,
    officesCount: newTurn.officesCount || previousDraft.officesCount,
    agentName: newTurn.agentName || previousDraft.agentName,
    agentPhone: newTurn.agentPhone || previousDraft.agentPhone,
    amount: newTurn.amount > 0 ? newTurn.amount : previousDraft.amount,
    currency: newTurn.currency || previousDraft.currency,
    paymentMethod: newTurn.paymentMethod || previousDraft.paymentMethod,
    dateIso: newTurn.dateIso || previousDraft.dateIso,
    timeStr: newTurn.timeStr || previousDraft.timeStr,
    reminderTopic: newTurn.reminderTopic || previousDraft.reminderTopic,
    targetUnitNumber: newTurn.targetUnitNumber || previousDraft.targetUnitNumber,
    targetUnitType: newTurn.targetUnitType || previousDraft.targetUnitType,
    searchQuery: newTurn.searchQuery || previousDraft.searchQuery,
    notes: newTurn.notes || previousDraft.notes || '',
  };
}

export async function analyzeVoiceTranscriptHybrid(
  rawTranscript: string,
  snapshot: VoiceWorkspaceSnapshot,
  previousDraft?: VoiceExtractedPayload | null
): Promise<VoiceExtractedPayload> {
  const deterministic = parseArabicVoiceCommandDeterministic(
    rawTranscript,
    snapshot.referenceDate || new Date()
  );

  if (typeof window !== 'undefined' && navigator.onLine) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6500);
      const res = await fetch('/api/voice/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: rawTranscript,
          contextSummary: {
            taxpayerNames: snapshot.taxpayers.slice(0, 35).map((t) => t.fullName),
            propertyTitles: snapshot.properties.slice(0, 35).map((p) => p.title),
          },
          previousDraft: previousDraft
            ? {
                intent: previousDraft.intent,
                taxpayerName: previousDraft.taxpayerName,
                propertyTitle: previousDraft.propertyTitle,
                amount: previousDraft.amount,
                address: previousDraft.address,
              }
            : null,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        const ai = data?.analysis;
        if (ai && typeof ai === 'object') {
          const validatedIntent: VoiceEngineIntent =
            ai.intent && VALID_VOICE_INTENTS.has(ai.intent as VoiceEngineIntent) && ai.intent !== 'unknown'
              ? (ai.intent as VoiceEngineIntent)
              : deterministic.intent !== 'unknown'
                ? deterministic.intent
                : (previousDraft?.intent || 'unknown');

          // Programmatic validation & AI-first priority (so Gemini self-corrections and semantic extraction win over rigid regex)
          const aiTaxpayerName = typeof ai.taxpayerName === 'string' ? ai.taxpayerName.trim() : '';
          const finalTaxpayerName = aiTaxpayerName || deterministic.taxpayerName || '';

          const aiAddress = typeof ai.address === 'string' && ai.address.trim() ? ai.address.trim() : '';
          const aiRegion = typeof ai.region === 'string' && ai.region.trim() ? ai.region.trim() : '';
          const finalAddress =
            aiAddress || (deterministic.address !== 'غير محدد' ? deterministic.address : 'غير محدد');
          const finalRegion =
            aiRegion || (deterministic.region !== 'غير محدد' ? deterministic.region : finalAddress);

          const finalFloors = Math.max(0, Math.min(200, Number(ai.floorsCount) || deterministic.floorsCount || 0));
          const finalApts = Math.max(0, Math.min(2000, Number(ai.apartmentsCount) || deterministic.apartmentsCount || 0));
          const finalShops = Math.max(0, Math.min(2000, Number(ai.shopsCount) || deterministic.shopsCount || 0));
          const finalOffices = Math.max(0, Math.min(2000, Number(ai.officesCount) || deterministic.officesCount || 0));
          const finalAmount = Math.max(0, Number(ai.amount) || deterministic.amount || 0);

          const aiPropTitle = typeof ai.propertyTitle === 'string' ? ai.propertyTitle.trim() : '';
          const finalPropTitle =
            aiPropTitle ||
            (finalTaxpayerName && finalAddress !== 'غير محدد'
              ? `عقار ${finalTaxpayerName} — ${finalAddress}`
              : finalTaxpayerName && (validatedIntent === 'create_compound_record' || validatedIntent === 'create_property')
                ? `عقار ${finalTaxpayerName}`
                : deterministic.propertyTitle);

          let aiResult: VoiceExtractedPayload = {
            ...deterministic,
            intent: validatedIntent,
            operationCategory: inferOperationCategory(validatedIntent),
            confidence: Math.min(1, Math.max(0.5, Number(ai.confidence) || deterministic.confidence || 0.9)),
            analysisSource: 'hybrid_gemini_and_rules',
            selfCorrectionDetected: Boolean(ai.selfCorrectionDetected || deterministic.selfCorrectionDetected),
            selfCorrectionNote:
              (typeof ai.selfCorrectionNote === 'string' && ai.selfCorrectionNote.trim()) ||
              deterministic.selfCorrectionNote ||
              '',
            requiresClarification: Boolean(ai.requiresClarification),
            clarificationQuestion:
              typeof ai.clarificationQuestion === 'string' ? ai.clarificationQuestion.trim() : '',
            taxpayerName: finalTaxpayerName,
            taxpayerPhone:
              (typeof ai.taxpayerPhone === 'string' && ai.taxpayerPhone.trim()) ||
              deterministic.taxpayerPhone ||
              '',
            propertyTitle: finalPropTitle,
            region: finalRegion,
            address: finalAddress,
            floorsCount: finalFloors,
            apartmentsCount: finalApts,
            shopsCount: finalShops,
            officesCount: finalOffices,
            agentName:
              (typeof ai.agentName === 'string' && ai.agentName.trim()) || deterministic.agentName || '',
            agentPhone:
              (typeof ai.agentPhone === 'string' && ai.agentPhone.trim()) || deterministic.agentPhone || '',
            amount: finalAmount,
            currency:
              (typeof ai.currency === 'string' && ai.currency.trim()) ||
              deterministic.currency ||
              'ريال يمني',
            reminderTopic:
              (typeof ai.reminderTopic === 'string' && ai.reminderTopic.trim()) ||
              deterministic.reminderTopic ||
              '',
            searchQuery:
              (typeof ai.searchQuery === 'string' && ai.searchQuery.trim()) ||
              deterministic.searchQuery ||
              '',
          };

          if (previousDraft) {
            aiResult = mergeFollowUpIntoDraft(previousDraft, aiResult, rawTranscript);
          }

          return aiResult;
        }
      }
    } catch {
      // Fallback to deterministic rules when offline or timeout
    }
  }

  return previousDraft
    ? mergeFollowUpIntoDraft(previousDraft, deterministic, rawTranscript)
    : deterministic;
}

export function computeFinancialSummary(
  taxpayer: Taxpayer,
  property: Property | undefined,
  currentPaymentAmount: number,
  currency: string,
  assessments: FinancialAssessment[],
  transactions: FinancialTransaction[]
): FinancialObligationSummary {
  const relevantAssessments = assessments.filter(
    (a) =>
      a.taxpayerId === taxpayer.id &&
      (a.status === 'approved' || a.status === 'draft') &&
      (!property || a.propertyId === property.id)
  );

  const totalAssessedObligations = relevantAssessments.reduce(
    (sum, a) => sum + (Number(a.amount) || 0),
    0
  );

  const relevantTransactions = transactions.filter(
    (t) =>
      t.taxpayerId === taxpayer.id &&
      t.status !== 'reversed' &&
      (!property || !t.propertyId || t.propertyId === property.id)
  );

  const totalAdjustmentsAndPenalties = relevantTransactions
    .filter((t) => t.transactionType === 'fee' || t.transactionType === 'adjustment')
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

  const totalPreviousPayments = relevantTransactions
    .filter((t) => t.transactionType === 'payment')
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

  const totalGrossObligation = totalAssessedObligations + totalAdjustmentsAndPenalties;
  const remainingBeforeOperation = Math.max(0, totalGrossObligation - totalPreviousPayments);
  const remainingAfterOperation = Math.max(0, remainingBeforeOperation - (Number(currentPaymentAmount) || 0));

  return {
    taxpayerId: taxpayer.id,
    taxpayerName: taxpayer.fullName,
    propertyId: property?.id,
    propertyTitle: property?.title,
    totalAssessedObligations,
    totalAdjustmentsAndPenalties,
    totalGrossObligation,
    totalPreviousPayments,
    remainingBeforeOperation,
    currentPaymentAmount: Number(currentPaymentAmount) || 0,
    remainingAfterOperation,
    currency: currency || 'ريال يمني',
  };
}

export function buildVoiceExecutionPlan(
  rawTranscript: string,
  extractedInput: VoiceExtractedPayload,
  snapshot: VoiceWorkspaceSnapshot,
  userSelection?: {
    selectedTaxpayerId?: string;
    selectedPropertyId?: string;
    selectedUnitId?: string;
  }
): VoiceEnginePlan {
  const normalizedTranscript = normalizeArabicSpeech(rawTranscript);
  const normRaw = normalizeForSearchMatch(rawTranscript);
  const extracted = { ...extractedInput };

  if (extracted.apartmentsCount > 0 && (extracted.shopsCount > 0 || extracted.officesCount > 0)) {
    extracted.propertyType = 'mixed';
  } else if (extracted.shopsCount > 0 && extracted.apartmentsCount === 0) {
    extracted.propertyType = 'commercial';
  }

  const normTaxpayerQuery = normalizeForSearchMatch(extracted.taxpayerName);
  const normTaxpayerWithoutLa = normTaxpayerQuery.replace(/^ل/, '').trim();
  const normAgentQuery = normalizeForSearchMatch(extracted.agentName);
  const refersToActiveContext = /(هذا\s+المكلف|المكلف\s+المحدد|هذا\s+العقار|العقار\s+المحدد|الملف\s+الحالي)/.test(
    normRaw
  );

  // Resolve active property / taxpayer from workspace snapshot if referenced
  const activeContextProperty = snapshot.activePropertyId
    ? snapshot.properties.find((p) => p.id === snapshot.activePropertyId)
    : undefined;
  const activeContextTaxpayer = snapshot.activeTaxpayerId
    ? snapshot.taxpayers.find((t) => t.id === snapshot.activeTaxpayerId)
    : activeContextProperty
      ? snapshot.taxpayers.find((t) => t.id === activeContextProperty.taxpayerId)
      : undefined;

  let matchedTaxpayers: Taxpayer[] = [];
  if (normTaxpayerQuery) {
    matchedTaxpayers = snapshot.taxpayers.filter((t) => {
      const nName = normalizeForSearchMatch(t.fullName);
      return (
        nName === normTaxpayerQuery ||
        nName.includes(normTaxpayerQuery) ||
        normTaxpayerQuery.includes(nName) ||
        (normTaxpayerWithoutLa.length >= 3 &&
          (nName === normTaxpayerWithoutLa || nName.includes(normTaxpayerWithoutLa)))
      );
    });
  } else if (normAgentQuery && extracted.intent === 'update_agent_phone') {
    matchedTaxpayers = snapshot.taxpayers.filter((t) =>
      normalizeForSearchMatch(t.notes || '').includes(normAgentQuery)
    );
  } else if (activeContextTaxpayer && (refersToActiveContext || !normTaxpayerQuery)) {
    matchedTaxpayers = [activeContextTaxpayer];
  } else if (snapshot.taxpayers.length === 1 && refersToActiveContext) {
    matchedTaxpayers = [snapshot.taxpayers[0]];
  }

  const selectedTaxpayer: Taxpayer | undefined = userSelection?.selectedTaxpayerId
    ? snapshot.taxpayers.find((t) => t.id === userSelection.selectedTaxpayerId)
    : matchedTaxpayers.length === 1
      ? matchedTaxpayers[0]
      : activeContextTaxpayer && !normTaxpayerQuery
        ? activeContextTaxpayer
        : undefined;

  let matchedProperties: Property[] = [];
  if (activeContextProperty && /(هذا\s+العقار|العقار\s+المحدد)/.test(normRaw)) {
    matchedProperties = [activeContextProperty];
  } else if (selectedTaxpayer) {
    matchedProperties = snapshot.properties.filter((p) => p.taxpayerId === selectedTaxpayer.id);
  } else if (extracted.propertyTitle || extracted.address !== 'غير محدد') {
    const qProp = normalizeForSearchMatch(
      extracted.propertyTitle || extracted.address
    );
    matchedProperties = snapshot.properties.filter((p) => {
      const nTitle = normalizeForSearchMatch(p.title);
      const nAddr = normalizeForSearchMatch(p.address);
      return (
        (qProp && nTitle.includes(qProp)) ||
        (qProp && nAddr.includes(qProp))
      );
    });
  } else if (snapshot.properties.length === 1 && /(هذا\s+العقار|العقار\s+المحدد)/.test(normRaw)) {
    matchedProperties = [snapshot.properties[0]];
  }

  const selectedProperty: Property | undefined = userSelection?.selectedPropertyId
    ? snapshot.properties.find((p) => p.id === userSelection.selectedPropertyId)
    : activeContextProperty && /(هذا\s+العقار|العقار\s+المحدد)/.test(normRaw)
      ? activeContextProperty
      : matchedProperties.length === 1
        ? matchedProperties[0]
        : undefined;

  let matchedUnits: PropertyUnit[] = [];
  if (selectedProperty) {
    matchedUnits = snapshot.propertyUnits.filter((u) => u.propertyId === selectedProperty.id);
  } else if (selectedTaxpayer) {
    matchedUnits = snapshot.propertyUnits.filter((u) => u.taxpayerId === selectedTaxpayer.id);
  } else if (snapshot.propertyUnits.length === 1 && /هذه\s+الوحده/.test(normRaw)) {
    matchedUnits = [snapshot.propertyUnits[0]];
  }

  if (extracted.targetUnitNumber && matchedUnits.length > 1) {
    const exactUnit = matchedUnits.find(
      (u) => normalizeForSearchMatch(u.unitNumber) === normalizeForSearchMatch(extracted.targetUnitNumber)
    );
    if (exactUnit) matchedUnits = [exactUnit];
  }

  const selectedUnit: PropertyUnit | undefined = userSelection?.selectedUnitId
    ? snapshot.propertyUnits.find((u) => u.id === userSelection.selectedUnitId)
    : matchedUnits.length === 1
      ? matchedUnits[0]
      : undefined;

  let disambiguationRequired = false;
  let disambiguationPrompt: string | undefined;
  const disambiguationCandidates: DisambiguationCandidate[] = [];

  const intentsRequiringExistingTaxpayer: VoiceEngineIntent[] = [
    'open_taxpayer_dossier',
    'record_collection',
    'create_appointment',
    'create_visit',
    'create_property',
    'query_balance',
  ];

  if (
    intentsRequiringExistingTaxpayer.includes(extracted.intent) &&
    matchedTaxpayers.length > 1 &&
    !selectedTaxpayer
  ) {
    disambiguationRequired = true;
    disambiguationPrompt = `يوجد (${matchedTaxpayers.length}) مكلفين مطابقين للاسم «${extracted.taxpayerName}». يرجى اختيار المكلف المقصود قبل التنفيذ:`;
    for (const t of matchedTaxpayers) {
      disambiguationCandidates.push({
        id: t.id,
        entityType: 'taxpayer',
        label: t.fullName,
        sublabel: `${t.internalCode} — ${t.region || t.address || 'بدون عنوان'}`,
      });
    }
  } else if (
    extracted.intent === 'record_collection' &&
    selectedTaxpayer &&
    matchedProperties.length > 1 &&
    !selectedProperty &&
    /(حساب\s+العقار|عقار|العقار\s+المحدد)/.test(normRaw)
  ) {
    disambiguationRequired = true;
    disambiguationPrompt = `المكلف «${selectedTaxpayer.fullName}» لديه (${matchedProperties.length}) عقارات مسجلة. حدد العقار المراد تسجيل التحصيل على حسابه:`;
    for (const p of matchedProperties) {
      disambiguationCandidates.push({
        id: p.id,
        entityType: 'property',
        label: p.title,
        sublabel: `${p.code} — ${p.address}`,
      });
    }
  } else if (
    extracted.intent === 'delete_property' &&
    matchedProperties.length > 1 &&
    !selectedProperty
  ) {
    disambiguationRequired = true;
    disambiguationPrompt = `يوجد أكثر من عقار مطابق. يرجى تحديد العقار المقصود بالحذف:`;
    for (const p of matchedProperties) {
      disambiguationCandidates.push({
        id: p.id,
        entityType: 'property',
        label: p.title,
        sublabel: `${p.code} — المكلف: ${p.taxpayerName}`,
      });
    }
  } else if (
    extracted.intent === 'update_unit_type' &&
    matchedUnits.length > 1 &&
    !selectedUnit
  ) {
    disambiguationRequired = true;
    disambiguationPrompt = `يوجد (${matchedUnits.length}) وحدات عقارية. يرجى اختيار الوحدة المراد تعديل نوعها:`;
    for (const u of matchedUnits) {
      disambiguationCandidates.push({
        id: u.id,
        entityType: 'unit',
        label: `وحدة ${u.unitNumber} (${u.propertyTitle})`,
        sublabel: `النوع الحالي: ${u.unitType} — الطابق: ${u.floor}`,
      });
    }
  }

  let financialSummary: FinancialObligationSummary | undefined;
  if (
    selectedTaxpayer &&
    (extracted.intent === 'open_taxpayer_dossier' ||
      extracted.intent === 'record_collection' ||
      extracted.intent === 'query_balance' ||
      extracted.intent === 'create_appointment')
  ) {
    financialSummary = computeFinancialSummary(
      selectedTaxpayer,
      selectedProperty,
      extracted.intent === 'record_collection' ? extracted.amount : 0,
      extracted.currency,
      snapshot.assessments,
      snapshot.transactions
    );
  }

  const operations: VoicePlanOperationStep[] = [];
  const totalUnitsToCreate =
    (Number(extracted.apartmentsCount) || 0) +
    (Number(extracted.shopsCount) || 0) +
    (Number(extracted.officesCount) || 0);

  if (extracted.intent === 'open_taxpayer_dossier') {
    operations.push({
      order: 1,
      collection: 'taxpayers',
      operation: 'read',
      description: `فتح الملف الموحد للمكلف «${selectedTaxpayer?.fullName || extracted.taxpayerName || 'المحدد'}» وعرض عقاراته (${matchedProperties.length}) ووحداته (${matchedUnits.length}) وملفه المالي`,
      recordCount: 1 + matchedProperties.length,
    });
  } else if (extracted.intent === 'create_compound_record') {
    if (selectedTaxpayer) {
      operations.push({
        order: 1,
        collection: 'taxpayers',
        operation: 'read',
        description: `الربط مع سجل المكلف الحالي: «${selectedTaxpayer.fullName}» (${selectedTaxpayer.internalCode})`,
        recordCount: 1,
      });
    } else {
      operations.push({
        order: 1,
        collection: 'taxpayers',
        operation: 'create',
        description: `إنشاء سجل مكلف جديد باسم «${extracted.taxpayerName || 'غير محدد'}»${extracted.agentName ? ` (الوكيل: ${extracted.agentName})` : ''}`,
        recordCount: 1,
      });
    }
    operations.push({
      order: 2,
      collection: 'properties',
      operation: 'create',
      description: `إنشاء سجل عقار في «${extracted.address}» (${extracted.floorsCount > 0 ? `${extracted.floorsCount} أدوار، ` : ''}إجمالي ${totalUnitsToCreate} وحدات)`,
      recordCount: 1,
    });
    if (extracted.apartmentsCount > 0) {
      operations.push({
        order: 3,
        collection: 'property_units',
        operation: 'create',
        description: `إنشاء (${extracted.apartmentsCount}) وحدات سكنية من نوع «شقة» مربوطة بالعقار والمكلف (دون توزيع عشوائي على الأدوار)`,
        recordCount: extracted.apartmentsCount,
      });
    }
    if (extracted.shopsCount > 0) {
      operations.push({
        order: operations.length + 1,
        collection: 'property_units',
        operation: 'create',
        description: `إنشاء (${extracted.shopsCount}) وحدات تجارية من نوع «فتحة تجارية / محل» مربوطة بالعقار والمكلف`,
        recordCount: extracted.shopsCount,
      });
    }
    if (extracted.officesCount > 0) {
      operations.push({
        order: operations.length + 1,
        collection: 'property_units',
        operation: 'create',
        description: `إنشاء (${extracted.officesCount}) وحدات من نوع «مكتب» مربوطة بالعقار والمكلف`,
        recordCount: extracted.officesCount,
      });
    }
    operations.push({
      order: operations.length + 1,
      collection: 'audit_logs',
      operation: 'create',
      description: 'توثيق العملية المركبة في سجل التدقيق الأمني (Audit Log)',
      recordCount: 1,
    });
  } else if (extracted.intent === 'record_collection') {
    operations.push({
      order: 1,
      collection: 'financial_transactions',
      operation: 'create',
      description: `تسجيل سند تحصيل مالي بمبلغ (${extracted.amount.toLocaleString('ar-SA')} ${extracted.currency}) لحساب «${selectedTaxpayer?.fullName || extracted.taxpayerName || 'غير محدد'}»${selectedProperty ? ` — عقار «${selectedProperty.title}»` : ''}`,
      recordCount: 1,
    });
    operations.push({
      order: 2,
      collection: 'audit_logs',
      operation: 'create',
      description: 'توثيق سند التحصيل والرصيد المتبقي في سجل التدقيق',
      recordCount: 1,
    });
  } else if (extracted.intent === 'create_appointment') {
    operations.push({
      order: 1,
      collection: 'appointments',
      operation: 'create',
      description: `جدولة موعد وتذكير بتاريخ ${extracted.dateIso} الساعة ${extracted.timeStr} لمتابعة «${selectedTaxpayer?.fullName || extracted.taxpayerName || extracted.reminderTopic}»`,
      recordCount: 1,
    });
  } else if (extracted.intent === 'create_visit') {
    operations.push({
      order: 1,
      collection: 'field_visits',
      operation: 'create',
      description: `تسجيل زيارة ميدانية بتاريخ ${extracted.dateIso} للمكلف «${selectedTaxpayer?.fullName || extracted.taxpayerName || 'غير محدد'}»${selectedProperty ? ` — العقار: «${selectedProperty.title}»` : ''}`,
      recordCount: 1,
    });
    operations.push({
      order: 2,
      collection: 'audit_logs',
      operation: 'create',
      description: 'توثيق الزيارة الميدانية في سجل التدقيق والملف الموحد للمكلف',
      recordCount: 1,
    });
  } else if (extracted.intent === 'create_property') {
    operations.push({
      order: 1,
      collection: 'properties',
      operation: 'create',
      description: `إضافة عقار جديد مرتبط بملف المكلف «${selectedTaxpayer?.fullName || extracted.taxpayerName || 'غير محدد'}» في «${extracted.address}»`,
      recordCount: 1,
    });
    if (totalUnitsToCreate > 0) {
      operations.push({
        order: 2,
        collection: 'property_units',
        operation: 'create',
        description: `إنشاء (${totalUnitsToCreate}) وحدات عقارية تابعة للعقار الجديد`,
        recordCount: totalUnitsToCreate,
      });
    }
  } else if (extracted.intent === 'search_records') {
    operations.push({
      order: 1,
      collection: 'taxpayers',
      operation: 'read',
      description: `البحث الفوري في المكلفين والعقارات والوحدات عن «${extracted.searchQuery || extracted.taxpayerName}»`,
      recordCount: matchedTaxpayers.length + matchedProperties.length,
    });
  } else if (extracted.intent === 'query_balance') {
    operations.push({
      order: 1,
      collection: 'financial_transactions',
      operation: 'read',
      description: `حساب إجمالي الالتزامات والمدفوعات والمتبقي على «${selectedTaxpayer?.fullName || extracted.taxpayerName}»`,
      recordCount: 1,
    });
  } else if (extracted.intent === 'update_agent_phone') {
    operations.push({
      order: 1,
      collection: 'taxpayers',
      operation: 'update',
      description: `تحديث رقم هاتف الوكيل «${extracted.agentName || 'المحدد'}» إلى (${extracted.agentPhone || 'غير محدد'})`,
      recordCount: 1,
    });
  } else if (extracted.intent === 'update_unit_type') {
    operations.push({
      order: 1,
      collection: 'property_units',
      operation: 'update',
      description: `تغيير نوع الوحدة «${selectedUnit?.unitNumber || extracted.targetUnitNumber || 'المحددة'}» إلى (${extracted.targetUnitType === 'shop' ? 'فتحة تجارية / محل' : extracted.targetUnitType})`,
      recordCount: 1,
    });
  } else if (extracted.intent === 'delete_property') {
    operations.push({
      order: 1,
      collection: 'properties',
      operation: 'delete',
      description: `حذف سجل العقار «${selectedProperty?.title || extracted.propertyTitle || 'المحدد'}» بعد التحقق من عدم وجود التزامات أو وحدات تمنع الحذف`,
      recordCount: 1,
    });
  } else if (extracted.intent === 'create_taxpayer') {
    operations.push({
      order: 1,
      collection: 'taxpayers',
      operation: 'create',
      description: `إنشاء سجل مكلف جديد باسم «${extracted.taxpayerName}»`,
      recordCount: 1,
    });
  }

  const missingFields: { key: keyof VoiceExtractedPayload; label: string }[] = [];
  const duplicateWarnings: string[] = [];
  const conflictWarnings: string[] = [];
  let permissionError: string | undefined;
  let deleteBlockedReason: string | undefined;

  if (extracted.intent === 'unknown') {
    missingFields.push({ key: 'intent', label: 'نوع العملية المطلوبة غير واضح' });
  }

  if (extracted.intent === 'open_taxpayer_dossier') {
    if (!selectedTaxpayer && matchedTaxpayers.length === 0) {
      missingFields.push({
        key: 'taxpayerName',
        label: `لم يتم العثور على مكلف مسجل باسم «${extracted.taxpayerName || 'غير محدد'}» لفتح ملفه`,
      });
    }
  }

  if (extracted.intent === 'create_compound_record' || extracted.intent === 'create_taxpayer') {
    if (!extracted.taxpayerName.trim()) {
      missingFields.push({ key: 'taxpayerName', label: 'اسم المكلف الثلاثي أو الثنائي' });
    }
    if (matchedTaxpayers.length > 0 && extracted.intent === 'create_taxpayer') {
      duplicateWarnings.push(
        `يوجد مكلف مسجل مسبقًا بنفس الاسم «${matchedTaxpayers[0].fullName}» (${matchedTaxpayers[0].internalCode}).`
      );
    }
    if (matchedTaxpayers.length > 0 && extracted.intent === 'create_compound_record') {
      duplicateWarnings.push(
        `المكلف «${matchedTaxpayers[0].fullName}» مسجل مسبقًا؛ سيتم ربط العقار الجديد بسجله الحالي بدلًا من تكرار المكلف.`
      );
    }
  }

  if (extracted.intent === 'create_property') {
    if (!selectedTaxpayer && matchedTaxpayers.length === 0) {
      missingFields.push({
        key: 'taxpayerName',
        label: 'اسم المكلف المالك لربط العقار الجديد بملفه',
      });
    }
  }

  if (extracted.intent === 'create_visit') {
    if (!selectedTaxpayer && matchedTaxpayers.length === 0) {
      missingFields.push({
        key: 'taxpayerName',
        label: 'اسم المكلف المراد تسجيل الزيارة الميدانية في ملفه',
      });
    }
  }

  if (extracted.intent === 'record_collection') {
    if (!extracted.taxpayerName.trim() && !selectedTaxpayer) {
      missingFields.push({ key: 'taxpayerName', label: 'اسم المكلف الدافع' });
    } else if (!selectedTaxpayer && matchedTaxpayers.length === 0) {
      missingFields.push({
        key: 'taxpayerName',
        label: `لم يتم العثور على مكلف مسجل باسم «${extracted.taxpayerName}» في قاعدة البيانات`,
      });
    }
    if (!extracted.amount || extracted.amount <= 0) {
      missingFields.push({ key: 'amount', label: 'المبلغ المحصل (أكبر من صفر)' });
    }
    if (
      financialSummary &&
      financialSummary.totalGrossObligation > 0 &&
      extracted.amount > financialSummary.remainingBeforeOperation
    ) {
      conflictWarnings.push(
        `تنبيه مالي: المبلغ المدخل (${extracted.amount.toLocaleString('ar-SA')}) أكبر من الرصيد المتبقي المسجل حاليًا (${financialSummary.remainingBeforeOperation.toLocaleString('ar-SA')}).`
      );
    }
  }

  if (extracted.intent === 'create_appointment') {
    if (!extracted.taxpayerName.trim() && !selectedTaxpayer && !extracted.reminderTopic.trim()) {
      missingFields.push({ key: 'taxpayerName', label: 'اسم المكلف أو موضوع التذكير' });
    }
    const targetHour = extracted.timeStr.slice(0, 2);
    const conflictingAppts = snapshot.appointments.filter(
      (a) =>
        (a.status === 'upcoming' || a.status === 'postponed') &&
        a.scheduledDate === extracted.dateIso &&
        a.scheduledTime.slice(0, 2) === targetHour
    );
    if (conflictingAppts.length > 0) {
      conflictWarnings.push(
        `يوجد تعارض زمني مع موعد آخر مجدول في نفس الساعة: «${conflictingAppts[0].title}» (${conflictingAppts[0].scheduledDate} ${conflictingAppts[0].scheduledTime}). يمكنك تعديل الوقت.`
      );
    }
  }

  if (extracted.intent === 'update_agent_phone') {
    if (!selectedTaxpayer && matchedTaxpayers.length === 0) {
      missingFields.push({
        key: 'agentName',
        label: `لم يتم العثور على سجل مرتبط بالوكيل «${extracted.agentName || 'غير محدد'}»`,
      });
    }
    if (!extracted.agentPhone.trim()) {
      missingFields.push({ key: 'agentPhone', label: 'رقم الهاتف الجديد للوكيل' });
    }
  }

  if (extracted.intent === 'update_unit_type') {
    if (!selectedUnit) {
      missingFields.push({
        key: 'targetUnitNumber',
        label: 'الوحدة العقارية المراد تعديل نوعها',
      });
    }
  }

  if (extracted.intent === 'query_balance') {
    if (!selectedTaxpayer && matchedTaxpayers.length === 0) {
      missingFields.push({
        key: 'taxpayerName',
        label: `لم يتم العثور على مكلف باسم «${extracted.taxpayerName || 'غير محدد'}»`,
      });
    }
  }

  if (extracted.intent === 'delete_property') {
    if (snapshot.workspaceRole !== 'owner' && !snapshot.canDeleteRecords) {
      permissionError =
        'رفض صلاحيات (Security Policy): حذف العقارات مسموح فقط لمالك مساحة العمل (Owner).';
    }
    if (!selectedProperty && matchedProperties.length === 0) {
      missingFields.push({
        key: 'propertyTitle',
        label: 'العقار المراد حذفه غير موجود أو غير محدد',
      });
    } else if (selectedProperty) {
      const linkedUnits = snapshot.propertyUnits.filter((u) => u.propertyId === selectedProperty.id);
      const linkedTx = snapshot.transactions.filter((t) => t.propertyId === selectedProperty.id);
      const linkedAss = snapshot.assessments.filter((a) => a.propertyId === selectedProperty.id);
      if (linkedUnits.length > 0 || linkedTx.length > 0 || linkedAss.length > 0) {
        deleteBlockedReason = `حماية السجلات: لا يمكن حذف العقار «${selectedProperty.title}» تلقائيًا لوجود (${linkedUnits.length}) وحدات عقارية و(${linkedTx.length}) معاملات مالية و(${linkedAss.length}) تقييمات مرتبطة به.`;
      }
    }
  }

  const requiresSensitiveConfirmation = [
    'create_compound_record',
    'create_taxpayer',
    'create_property',
    'create_visit',
    'record_collection',
    'update_agent_phone',
    'update_unit_type',
    'delete_property',
  ].includes(extracted.intent);

  const idempotencyKey = `${extracted.intent}:${normalizeForSearchMatch(
    extracted.taxpayerName
  )}:${normalizeForSearchMatch(extracted.propertyTitle)}:${extracted.amount}:${extracted.apartmentsCount}:${extracted.shopsCount}:${extracted.dateIso}:${selectedTaxpayer?.id || ''}:${selectedProperty?.id || ''}:${selectedUnit?.id || ''}`;

  if (
    hasPlanBeenExecuted(idempotencyKey) &&
    extracted.intent !== 'open_taxpayer_dossier' &&
    extracted.intent !== 'query_balance' &&
    extracted.intent !== 'search_records'
  ) {
    duplicateWarnings.push(
      'منع التكرار (Idempotency Guard): تم تنفيذ هذه الخطة بالفعل خلال الجلسة الحالية.'
    );
  }

  const canExecute =
    extracted.intent !== 'unknown' &&
    missingFields.length === 0 &&
    !disambiguationRequired &&
    !permissionError &&
    !deleteBlockedReason &&
    (!hasPlanBeenExecuted(idempotencyKey) ||
      extracted.intent === 'open_taxpayer_dossier' ||
      extracted.intent === 'query_balance' ||
      extracted.intent === 'search_records');

  const stages: VoicePipelineStageStatus[] = [
    {
      id: 'stage_1_transcribe',
      stepNumber: 1,
      title: 'استقبال الصوت وتحويله إلى نص عربي (مع دعم اللهجة اليمنية)',
      status: normalizedTranscript ? 'completed' : 'blocked',
      summary: normalizedTranscript
        ? `تم التقاط وتطبيع النص: «${normalizedTranscript}»`
        : 'لا يوجد نص منطوق',
    },
    {
      id: 'stage_2_nlu',
      stepNumber: 2,
      title: 'تحليل النية والحقول الدلالية (NLU)',
      status: extracted.intent !== 'unknown' ? 'completed' : 'warning',
      summary: `${INTENT_LABELS[extracted.intent]} — دقة التحليل ${Math.round(extracted.confidence * 100)}%`,
    },
    {
      id: 'stage_3_structured_schema',
      stepNumber: 3,
      title: 'تحويل الكلام إلى بنية بيانات منظمة ومتحقق منها',
      status: 'completed',
      summary:
        extracted.intent === 'create_compound_record'
          ? `الأدوار: ${extracted.floorsCount} | الشقق: ${extracted.apartmentsCount} | الفتحات التجارية: ${extracted.shopsCount} | الوكيل: ${extracted.agentName || '—'}`
          : extracted.intent === 'record_collection'
            ? `المبلغ المهيكل: ${extracted.amount.toLocaleString('ar-SA')} ${extracted.currency}`
            : `تمت هيكلة الحقول والتحقق من الأعداد والتواريخ`,
    },
    {
      id: 'stage_4_entity_resolution',
      stepNumber: 4,
      title: 'مطابقة الكيانات مع سجلات Firestore الفعلية',
      status: disambiguationRequired ? 'warning' : 'completed',
      summary: disambiguationRequired
        ? disambiguationPrompt || 'تتطلب المطابقة تحديد السجل المقصود'
        : selectedTaxpayer
          ? `تمت المطابقة مع المكلف «${selectedTaxpayer.fullName}» (${selectedTaxpayer.internalCode})${selectedProperty ? ` والعقار «${selectedProperty.title}»` : ''}`
          : extracted.intent === 'create_compound_record' || extracted.intent === 'create_taxpayer'
            ? 'سيتم إنشاء سجل مكلف جديد لعدم وجود تطابق سابق'
            : `نتائج المطابقة: ${matchedTaxpayers.length} مكلف، ${matchedProperties.length} عقار`,
    },
    {
      id: 'stage_5_execution_plan',
      stepNumber: 5,
      title: 'إنشاء خطة التنفيذ قبل التغيير',
      status: operations.length > 0 ? 'completed' : 'warning',
      summary: `تتضمن الخطة (${operations.length}) خطوات عبر طبقة خدمات Firestore المحمية`,
    },
    {
      id: 'stage_6_validation_security',
      stepNumber: 6,
      title: 'فحص الصلاحيات والبيانات الناقصة والتكرار والتعارضات',
      status:
        permissionError || deleteBlockedReason || missingFields.length > 0
          ? 'blocked'
          : duplicateWarnings.length > 0 || conflictWarnings.length > 0
            ? 'warning'
            : 'completed',
      summary:
        permissionError ||
        deleteBlockedReason ||
        (missingFields.length > 0
          ? `بيانات ناقصة: ${missingFields.map((m) => m.label).join('، ')}`
          : conflictWarnings.length > 0
            ? conflictWarnings[0]
            : duplicateWarnings.length > 0
              ? duplicateWarnings[0]
              : 'اجتازت الخطة فحوص الصلاحيات وعدم التكرار بنجاح'),
    },
    {
      id: 'stage_7_confirmation_gate',
      stepNumber: 7,
      title: 'بوابة تأكيد المستخدم للعمليات الحساسة',
      status: canExecute ? 'active' : 'blocked',
      summary: canExecute
        ? 'بانتظار مراجعة المستخدم للحقول المستخرجة والضغط على زر «تأكيد وتنفيذ الخطة»'
        : 'يجب استكمال الحقول الناقصة أو حسم التشابه قبل التفعيل',
    },
    {
      id: 'stage_8_execution_report',
      stepNumber: 8,
      title: 'التنفيذ الفعلي والتحقق من الحفظ وإصدار التقرير',
      status: 'pending',
      summary: 'يتم التنفيذ وقراءة النتيجة المحفوظة من Firestore فور التأكيد',
    },
  ];

  let clarificationQuestion: string | undefined = extracted.clarificationQuestion || undefined;
  if (!clarificationQuestion && missingFields.length > 0) {
    if (extracted.intent === 'record_collection' && (!extracted.amount || extracted.amount <= 0)) {
      clarificationQuestion = `كم المبلغ المالي المحصّل من المكلف «${selectedTaxpayer?.fullName || extracted.taxpayerName || 'المحدد'}»؟`;
    } else if (missingFields.some((f) => f.key === 'taxpayerName')) {
      clarificationQuestion = 'ما اسم المكلف المراد تنفيذ العملية على ملفه؟';
    } else {
      clarificationQuestion = `يرجى توضيح البيان الناقص لإتمام الأمر: ${missingFields.map((m) => m.label).join('، ')}`;
    }
  }

  return {
    planId: `plan_${Date.now()}`,
    idempotencyKey,
    rawTranscript,
    normalizedTranscript,
    intent: extracted.intent,
    intentLabel: INTENT_LABELS[extracted.intent],
    operationCategory: extracted.operationCategory || inferOperationCategory(extracted.intent),
    extracted,
    stages,
    matchedTaxpayers,
    selectedTaxpayer,
    matchedProperties,
    selectedProperty,
    matchedUnits,
    selectedUnit,
    disambiguationRequired,
    disambiguationPrompt,
    disambiguationCandidates,
    clarificationQuestion,
    financialSummary,
    operations,
    missingFields,
    duplicateWarnings,
    conflictWarnings,
    permissionError,
    deleteBlockedReason,
    requiresSensitiveConfirmation,
    canExecute,
  };
}
