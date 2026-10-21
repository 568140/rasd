import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import {
  Mic,
  MicOff,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Volume2,
  VolumeX,
  Play,
  RotateCcw,
  ShieldCheck,
  Building2,
  UserPlus,
  Edit3,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  X,
  Send,
  Settings2,
} from 'lucide-react';
import { useRasd } from '../context/RasdContext';
import {
  analyzeVoiceTranscriptHybrid,
  buildVoiceExecutionPlan,
  computeFinancialSummary,
  markPlanAsExecuted,
  parseArabicVoiceCommandDeterministic,
  sanitizeSpokenRepetitions,
  type VoiceEnginePlan,
  type VoiceExecutionReport,
  type VoiceExtractedPayload,
  type VoiceWorkspaceSnapshot,
} from '../services/voiceEngine';
import type { PropertyType, UnitType } from '../types/rasd';

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  0: SpeechRecognitionAlternativeLike;
  isFinal?: boolean;
}

interface SpeechRecognitionEventLike {
  resultIndex?: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
}

export type VoiceListeningState = 'idle' | 'starting' | 'listening' | 'stopping';

const SAMPLE_VOICE_COMMANDS: {
  category: string;
  label: string;
  command: string;
}[] = [
  {
    category: 'فتح ملف المكلف',
    label: 'فتح الملف المتكامل للمكلف وعقاراته',
    command: 'افتح ملف كامل عبد الرحمن',
  },
  {
    category: 'تصحيح ذاتي أثناء الكلام',
    label: 'استدراك وتصحيح اسم المكلف أثناء الحديث',
    command: 'سجّل عقار باسم كامل، لا، أقصد باسم خالد عبدربه في شارع الثلاثين، أربعة أدوار وخمس شقق',
  },
  {
    category: 'استعلام مالي',
    label: 'معرفة الرصيد المتبقي على المكلف',
    command: 'كم المتبقي على كامل؟',
  },
  {
    category: 'زيارة ميدانية',
    label: 'تسجيل زيارة ميدانية للمكلف اليوم',
    command: 'سجّل زيارة لكامل اليوم',
  },
  {
    category: 'موعد وتذكير',
    label: 'تذكير بمتابعة المكلف الأسبوع القادم',
    command: 'ذكّرني بمتابعة كامل الأسبوع القادم',
  },
  {
    category: 'تحصيل مالي',
    label: 'تحصيل 4,000 ريال من حساب المكلف',
    command: 'سجّل تحصيل أربعة آلاف ريال من حساب العقار الخاص بكامل عبد الرحمن',
  },
];

const SIMPLE_INTENT_NAMES: Record<VoiceExtractedPayload['intent'], string> = {
  open_taxpayer_dossier: 'فتح ملف المكلف',
  create_compound_record: 'تسجيل عقار ومكلف جديد',
  create_taxpayer: 'تسجيل مكلف جديد',
  create_property: 'تسجيل عقار جديد',
  record_collection: 'تسجيل تحصيل مالي',
  create_assessment: 'إصدار تقييم مالي',
  create_visit: 'تسجيل زيارة ميدانية',
  create_appointment: 'جدولة موعد وتذكير',
  query_balance: 'استعلام عن الرصيد المالي',
  search_records: 'بحث في السجلات',
  update_agent_phone: 'تعديل رقم هاتف الوكيل',
  update_unit_type: 'تعديل نوع وحدة عقارية',
  delete_property: 'حذف عقار',
  unknown: 'طلب صوتي غير مكتمل',
};

export const VoiceAssistantScreen: React.FC = () => {
  const {
    taxpayers,
    properties,
    propertyUnits,
    fieldVisits,
    appointments,
    assessments,
    transactions,
    currentUserRole,
    canApproveFinancials,
    canDeleteRecords,
    workspace,
    selectedTaxpayerId,
    selectedPropertyId,
    addTaxpayer,
    updateTaxpayer,
    addProperty,
    deleteProperty,
    updatePropertyUnit,
    executeCompoundVoiceCreation,
    addFieldVisit,
    addAppointment,
    addFinancialAssessment,
    addFinancialTransaction,
    recordVoiceAudit,
    setActiveScreen,
    setSelectedTaxpayerId,
    setSelectedPropertyId,
    showToast,
  } = useRasd();

  const [dialect, setDialect] = useState<'ar-YE' | 'ar-SA'>('ar-YE');
  const [listeningState, setListeningState] = useState<VoiceListeningState>('idle');
  const [continuousMode, setContinuousMode] = useState<boolean>(true);
  const [interimSpeech, setInterimSpeech] = useState<string>('');
  const [followUpInput, setFollowUpInput] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [autoSpeakReport, setAutoSpeakReport] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const [transcriptInput, setTranscriptInput] = useState('');
  const [committedTextState, setCommittedTextState] = useState('');
  const [extractedState, setExtractedState] = useState<VoiceExtractedPayload | null>(null);
  const [selectedTaxpayerIdOverride, setSelectedTaxpayerIdOverride] = useState<string | undefined>();
  const [selectedPropertyIdOverride, setSelectedPropertyIdOverride] = useState<string | undefined>();
  const [selectedUnitIdOverride, setSelectedUnitIdOverride] = useState<string | undefined>();
  const [executionReport, setExecutionReport] = useState<VoiceExecutionReport | null>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);

  // Clean Mobile UX states
  const [isEditingFields, setIsEditingFields] = useState(false);
  const [showManualInput, setShowManualInput] = useState(false);
  const [showFullResultDetails, setShowFullResultDetails] = useState(false);
  const [showAdvancedDiagnostics, setShowAdvancedDiagnostics] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const isRecognitionRunningRef = useRef<boolean>(false);
  const manualStopRef = useRef<boolean>(false);
  const unmountedRef = useRef<boolean>(false);
  const continuousModeRef = useRef<boolean>(true);
  const committedTranscriptRef = useRef<string>('');
  const committedChunksRef = useRef<string[]>([]);
  const processedFinalIndexRef = useRef<number>(-1);
  const latestFullTranscriptRef = useRef<string>('');
  const restartTimeoutRef = useRef<number | null>(null);
  const consecutiveErrorCountRef = useRef<number>(0);
  const autoExecutedPlanKeyRef = useRef<string | null>(null);
  const accumulatedBaseTranscriptRef = useRef<string>('');

  useEffect(() => {
    continuousModeRef.current = continuousMode;
  }, [continuousMode]);

  const workspaceSnapshot: VoiceWorkspaceSnapshot = useMemo(
    () => ({
      taxpayers,
      properties,
      propertyUnits,
      visits: fieldVisits,
      appointments,
      assessments,
      transactions,
      workspaceRole: currentUserRole,
      canDeleteRecords,
      activeTaxpayerId: selectedTaxpayerId,
      activePropertyId: selectedPropertyId,
    }),
    [
      taxpayers,
      properties,
      propertyUnits,
      fieldVisits,
      appointments,
      assessments,
      transactions,
      currentUserRole,
      canDeleteRecords,
      selectedTaxpayerId,
      selectedPropertyId,
    ]
  );

  // Dynamically build the 8-stage execution plan whenever extractedState or overrides change
  const currentPlan: VoiceEnginePlan | null = useMemo(() => {
    if (!extractedState || !transcriptInput.trim()) return null;
    return buildVoiceExecutionPlan(transcriptInput, extractedState, workspaceSnapshot, {
      selectedTaxpayerId: selectedTaxpayerIdOverride,
      selectedPropertyId: selectedPropertyIdOverride,
      selectedUnitId: selectedUnitIdOverride,
    });
  }, [
    transcriptInput,
    extractedState,
    workspaceSnapshot,
    selectedTaxpayerIdOverride,
    selectedPropertyIdOverride,
    selectedUnitIdOverride,
  ]);

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      manualStopRef.current = true;
      if (restartTimeoutRef.current !== null) {
        window.clearTimeout(restartTimeoutRef.current);
        restartTimeoutRef.current = null;
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.onend = null;
          recognitionRef.current.onerror = null;
          recognitionRef.current.onresult = null;
          recognitionRef.current.stop();
        } catch {
          // ignore cleanup errors
        }
        recognitionRef.current = null;
      }
      isRecognitionRunningRef.current = false;
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const speakArabicText = useCallback(
    (text: string) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = dialect;
        utterance.rate = 0.98;
        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => setIsSpeaking(false);
        utterance.onerror = () => setIsSpeaking(false);
        window.speechSynthesis.speak(utterance);
      } catch {
        setIsSpeaking(false);
      }
    },
    [dialect]
  );

  const stopSpeaking = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  };

  const resetCurrentCommand = () => {
    if (listeningState === 'listening' || listeningState === 'starting') {
      stopSpeechListening(false);
    }
    accumulatedBaseTranscriptRef.current = '';
    setTranscriptInput('');
    setCommittedTextState('');
    committedTranscriptRef.current = '';
    committedChunksRef.current = [];
    processedFinalIndexRef.current = -1;
    latestFullTranscriptRef.current = '';
    setInterimSpeech('');
    setExtractedState(null);
    setExecutionReport(null);
    setExecutionError(null);
    setIsEditingFields(false);
    setShowFullResultDetails(false);
    setFollowUpInput('');
    setSelectedTaxpayerIdOverride(undefined);
    setSelectedPropertyIdOverride(undefined);
    setSelectedUnitIdOverride(undefined);
    autoExecutedPlanKeyRef.current = null;
  };

  const handleAnalyzeCommand = async (
    rawText?: string,
    previousDraftForMerge?: VoiceExtractedPayload | null
  ) => {
    const targetText = sanitizeSpokenRepetitions((rawText ?? transcriptInput).trim());
    if (!targetText) {
      showToast('يرجى التحدث أو كتابة الطلب أولًا', 'warning');
      return;
    }

    const currentBase = accumulatedBaseTranscriptRef.current.trim();
    const displayTranscript =
      currentBase && targetText && !currentBase.includes(targetText)
        ? sanitizeSpokenRepetitions(`${currentBase} ، ${targetText}`)
        : targetText;

    accumulatedBaseTranscriptRef.current = displayTranscript;
    setTranscriptInput(displayTranscript);
    setCommittedTextState(displayTranscript);
    committedTranscriptRef.current = displayTranscript;
    committedChunksRef.current = [displayTranscript];
    processedFinalIndexRef.current = -1;
    latestFullTranscriptRef.current = displayTranscript;
    setExecutionReport(null);
    setExecutionError(null);
    setShowFullResultDetails(false);

    if (!previousDraftForMerge) {
      setIsEditingFields(false);
      setSelectedTaxpayerIdOverride(undefined);
      setSelectedPropertyIdOverride(undefined);
      setSelectedUnitIdOverride(undefined);
      autoExecutedPlanKeyRef.current = null;
    }

    // Immediate deterministic parse + hybrid server Gemini AI enrichment on full accumulated text
    const immediateExtracted = parseArabicVoiceCommandDeterministic(displayTranscript);
    if (!previousDraftForMerge) {
      setExtractedState(immediateExtracted);
    }

    setIsAnalyzing(true);
    try {
      const hybridResult = await analyzeVoiceTranscriptHybrid(
        displayTranscript,
        workspaceSnapshot,
        previousDraftForMerge || null
      );
      setExtractedState(hybridResult);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFollowUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!followUpInput.trim() || !extractedState) return;
    const answerText = followUpInput.trim();
    setFollowUpInput('');
    await handleAnalyzeCommand(answerText, extractedState);
  };

  const stopSpeechListening = (triggerAnalysis = true) => {
    manualStopRef.current = true;
    if (restartTimeoutRef.current !== null) {
      window.clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }
    setListeningState('stopping');

    // Flush any live interim speech into committed chunks so last word is never lost
    const livePiece = interimSpeech ? sanitizeSpokenRepetitions(interimSpeech.trim()) : '';
    if (livePiece) {
      const prev = committedChunksRef.current;
      if (!prev.includes(livePiece)) {
        committedChunksRef.current.push(livePiece);
      }
    }
    setInterimSpeech('');

    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.stop();
      } catch {
        // ignore stop error
      }
      recognitionRef.current = null;
    }
    isRecognitionRunningRef.current = false;
    setListeningState('idle');

    const turnSpoken = sanitizeSpokenRepetitions(committedChunksRef.current.join(' '));
    const base = accumulatedBaseTranscriptRef.current.trim();
    const finalSpoken = sanitizeSpokenRepetitions(
      base && turnSpoken && !base.includes(turnSpoken)
        ? `${base} ، ${turnSpoken}`
        : turnSpoken || base || latestFullTranscriptRef.current.trim()
    );

    if (triggerAnalysis && finalSpoken) {
      accumulatedBaseTranscriptRef.current = finalSpoken;
      void handleAnalyzeCommand(
        finalSpoken,
        !executionReport ? extractedState : null
      );
    }
  };

  const startSpeechListeningSession = (isAutoRestart = false) => {
    if (unmountedRef.current) {
      return;
    }

    // If an existing recognition instance is still active, safely terminate it first to prevent overlapping sessions
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.stop();
      } catch {
        // ignore cleanup error
      }
      recognitionRef.current = null;
    }
    isRecognitionRunningRef.current = false;

    const win = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const SpeechRec = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SpeechRec) {
      setListeningState('idle');
      setShowManualInput(true);
      showToast(
        'المتصفح الحالي لا يدعم الالتقاط الصوتي المباشر. يمكنك كتابة طلبك في الحقل المخصص.',
        'warning'
      );
      return;
    }

    try {
      processedFinalIndexRef.current = -1;

      if (!isAutoRestart) {
        manualStopRef.current = false;
        consecutiveErrorCountRef.current = 0;

        if (executionReport) {
          // A previous command was already executed, start completely fresh
          accumulatedBaseTranscriptRef.current = '';
          setTranscriptInput('');
          setCommittedTextState('');
          committedTranscriptRef.current = '';
          committedChunksRef.current = [];
          latestFullTranscriptRef.current = '';
          setExtractedState(null);
          setExecutionReport(null);
          setExecutionError(null);
        } else {
          // Continuing multi-turn command: keep previous draft and transcript base intact
          accumulatedBaseTranscriptRef.current = transcriptInput.trim();
          committedChunksRef.current = [];
          setCommittedTextState(transcriptInput.trim());
        }
        setListeningState('starting');
      }

      const rec = new SpeechRec();
      rec.lang = dialect;
      rec.continuous = true;
      rec.interimResults = true;

      rec.onstart = () => {
        if (unmountedRef.current) return;
        isRecognitionRunningRef.current = true;
        setListeningState('listening');
      };

      rec.onresult = (event: SpeechRecognitionEventLike) => {
        if (unmountedRef.current) return;
        consecutiveErrorCountRef.current = 0;

        // 1. Commit newly finalized speech chunks monotonically
        const resultsLen = event.results.length;
        for (let i = 0; i < resultsLen; i++) {
          const res = event.results[i];
          if (res.isFinal && i > processedFinalIndexRef.current) {
            const cleanFinal = sanitizeSpokenRepetitions((res[0]?.transcript || '').trim());
            if (cleanFinal) {
              const prevChunks = committedChunksRef.current;
              const lastChunk = prevChunks[prevChunks.length - 1];
              if (lastChunk !== cleanFinal && !prevChunks.includes(cleanFinal)) {
                committedChunksRef.current.push(cleanFinal);
              }
            }
            processedFinalIndexRef.current = i;
          }
        }

        // 2. Derive live interim speech strictly from non-final results (never appended permanently)
        let liveInterim = '';
        for (let i = 0; i < resultsLen; i++) {
          const res = event.results[i];
          if (!res.isFinal) {
            const piece = (res[0]?.transcript || '').trim();
            if (piece) {
              liveInterim += (liveInterim ? ' ' : '') + piece;
            }
          }
        }
        liveInterim = sanitizeSpokenRepetitions(liveInterim);
        setInterimSpeech(liveInterim);

        // 3. Update unified live display with base transcript + current turn without duplicating words
        const turnCommitted = sanitizeSpokenRepetitions(committedChunksRef.current.join(' '));
        const turnLive = sanitizeSpokenRepetitions(
          [turnCommitted, liveInterim].filter(Boolean).join(' ')
        );
        const base = accumulatedBaseTranscriptRef.current.trim();

        const combinedLive = sanitizeSpokenRepetitions(
          base && turnLive
            ? `${base} ، ${turnLive}`
            : turnLive || base
        );

        latestFullTranscriptRef.current = combinedLive;
        setCommittedTextState(combinedLive);
        committedTranscriptRef.current = combinedLive;
        setTranscriptInput(combinedLive);
      };

      rec.onerror = (event: { error?: string }) => {
        if (unmountedRef.current) return;
        const errCode = event.error || '';
        isRecognitionRunningRef.current = false;

        if (
          errCode === 'not-allowed' ||
          errCode === 'service-not-allowed' ||
          errCode === 'audio-capture'
        ) {
          manualStopRef.current = true;
          setListeningState('idle');
          setInterimSpeech('');
          setShowManualInput(true);
          showToast(
            'تعذر الوصول إلى الميكروفون. يرجى تفعيل صلاحية الميكروفون أو كتابة طلبك نصيًا.',
            'error'
          );
          return;
        }

        if (errCode !== 'no-speech' && errCode !== 'aborted') {
          consecutiveErrorCountRef.current += 1;
        }
      };

      rec.onend = () => {
        isRecognitionRunningRef.current = false;
        if (unmountedRef.current) return;

        // If continuous mode is active and user did NOT click stop manually, safely auto-restart
        if (
          !manualStopRef.current &&
          continuousModeRef.current &&
          consecutiveErrorCountRef.current < 5
        ) {
          restartTimeoutRef.current = window.setTimeout(() => {
            if (!manualStopRef.current && !unmountedRef.current) {
              startSpeechListeningSession(true);
            }
          }, 220);
          return;
        }

        setListeningState('idle');
        setInterimSpeech('');
        const turnSpoken = sanitizeSpokenRepetitions(committedChunksRef.current.join(' '));
        const base = accumulatedBaseTranscriptRef.current.trim();
        const finalSpoken = sanitizeSpokenRepetitions(
          base && turnSpoken && !base.includes(turnSpoken)
            ? `${base} ، ${turnSpoken}`
            : turnSpoken || base || latestFullTranscriptRef.current.trim()
        );
        if (finalSpoken) {
          accumulatedBaseTranscriptRef.current = finalSpoken;
          void handleAnalyzeCommand(
            finalSpoken,
            !executionReport ? extractedState : null
          );
        }
      };

      recognitionRef.current = rec;
      rec.start();
    } catch {
      isRecognitionRunningRef.current = false;
      setListeningState('idle');
      showToast('تعذر بدء التسجيل الصوتي في المتصفح', 'error');
    }
  };

  const toggleSpeechListening = () => {
    if (listeningState === 'listening' || listeningState === 'starting') {
      stopSpeechListening(true);
    } else {
      startSpeechListeningSession(false);
    }
  };

  const updateExtractedField = <K extends keyof VoiceExtractedPayload>(
    key: K,
    value: VoiceExtractedPayload[K]
  ) => {
    setExtractedState((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  // Stage 8: Execute Confirmed Plan via Whitelisted Context Services & Read Verified Results
  const handleExecuteConfirmedPlan = useCallback(
    async (planToExecute?: VoiceEnginePlan) => {
      const activePlan = planToExecute || currentPlan;
      if (!activePlan || !activePlan.canExecute || isExecuting) return;

      setIsExecuting(true);
      setExecutionError(null);
      try {
        const { extracted, selectedTaxpayer, selectedProperty, selectedUnit, idempotencyKey } =
          activePlan;
        let report: VoiceExecutionReport | null = null;

        if (extracted.intent === 'open_taxpayer_dossier') {
          const targetTp = selectedTaxpayer || activePlan.matchedTaxpayers[0];
          if (!targetTp) throw new Error('لم يتم العثور على ملف المكلف المطلوب');
          const tpProps = properties.filter((p) => p.taxpayerId === targetTp.id);
          const tpUnits = propertyUnits.filter((u) => u.taxpayerId === targetTp.id);
          const fin =
            activePlan.financialSummary ||
            computeFinancialSummary(
              targetTp,
              undefined,
              0,
              extracted.currency,
              assessments,
              transactions
            );

          await recordVoiceAudit(
            transcriptInput,
            `فتح الملف الموحد للمكلف (${targetTp.fullName} — ${targetTp.internalCode}) صوتيًا`
          );

          setSelectedPropertyId(null);
          setSelectedTaxpayerId(targetTp.id);

          const spokenSummary = `تم تجهيز ملف المكلف ${targetTp.fullName}، ويضم ${
            tpProps.length
          } عقارات و${tpUnits.length} وحدات عقارية، والرصيد المتبقي ${fin.remainingBeforeOperation.toLocaleString(
            'ar-SA'
          )} ${fin.currency}.`;

          report = {
            planId: activePlan.planId,
            idempotencyKey,
            executedAt: new Date().toLocaleTimeString('ar-SA'),
            intent: extracted.intent,
            intentLabel: activePlan.intentLabel,
            success: true,
            headline: `تم فتح وتجهيز ملف المكلف «${targetTp.fullName}»`,
            spokenSummary,
            openedTaxpayerId: targetTp.id,
            createdTaxpayerId: targetTp.id,
            createdTaxpayerCode: targetTp.internalCode,
            remainingBalanceAfter: fin.remainingBeforeOperation,
            currency: fin.currency,
            verifiedDetails: [
              { label: 'اسم المكلف', value: `${targetTp.fullName} (${targetTp.internalCode})` },
              { label: 'العقارات المرتبطة', value: `${tpProps.length} عقارات` },
              { label: 'الوحدات التابعة', value: `${tpUnits.length} وحدة` },
              {
                label: 'الرصيد المتبقي',
                value: `${fin.remainingBeforeOperation.toLocaleString('ar-SA')} ${fin.currency}`,
              },
            ],
          };
        } else if (extracted.intent === 'create_compound_record') {
          const result = await executeCompoundVoiceCreation({
            existingTaxpayerId: selectedTaxpayer?.id,
            taxpayerName: selectedTaxpayer?.fullName || extracted.taxpayerName,
            taxpayerPhone: extracted.taxpayerPhone,
            address: extracted.address,
            region: extracted.region,
            propertyTitle:
              extracted.propertyTitle ||
              `عقار ${selectedTaxpayer?.fullName || extracted.taxpayerName} — ${extracted.address}`,
            propertyType: extracted.propertyType,
            floorsCount: Number(extracted.floorsCount) || 0,
            apartmentsCount: Number(extracted.apartmentsCount) || 0,
            shopsCount: Number(extracted.shopsCount) || 0,
            officesCount: Number(extracted.officesCount) || 0,
            agentName: extracted.agentName,
            agentPhone: extracted.agentPhone,
            notes: extracted.notes,
          });

          markPlanAsExecuted(idempotencyKey);
          const spokenSummary = `تم تسجيل العقار والمكلف ${
            selectedTaxpayer?.fullName || extracted.taxpayerName
          } في ${extracted.address} وإنشاء ${result.createdUnitsCount} وحدات بنجاح.`;

          report = {
            planId: activePlan.planId,
            idempotencyKey,
            executedAt: new Date().toLocaleTimeString('ar-SA'),
            intent: extracted.intent,
            intentLabel: activePlan.intentLabel,
            success: true,
            headline: 'تم تسجيل العقار والمكلف بنجاح',
            spokenSummary,
            createdTaxpayerId: result.taxpayerId,
            createdTaxpayerCode: result.taxpayerCode,
            createdPropertyId: result.propertyId,
            createdPropertyCode: result.propertyCode,
            createdUnitsCount: result.createdUnitsCount,
            createdUnitNumbers: result.createdUnitNumbers,
            verifiedDetails: [
              {
                label: 'اسم المكلف',
                value: `${selectedTaxpayer?.fullName || extracted.taxpayerName} (${result.taxpayerCode})`,
              },
              {
                label: 'العقار والموقع',
                value: `${extracted.address} (${result.propertyCode})`,
              },
              {
                label: 'الوحدات المسجلة',
                value: `${result.createdUnitsCount} وحدة (${extracted.apartmentsCount} شقق، ${extracted.shopsCount} محلات)`,
              },
              ...(extracted.agentName
                ? [
                    {
                      label: 'الوكيل',
                      value: `${extracted.agentName}${extracted.agentPhone ? ` (${extracted.agentPhone})` : ''}`,
                    },
                  ]
                : []),
            ],
          };
        } else if (extracted.intent === 'record_collection') {
          if (!selectedTaxpayer) {
            throw new Error('يرجى تحديد المكلف قبل تسجيل التحصيل');
          }
          const targetProp = selectedProperty || activePlan.matchedProperties[0];
          const propId = targetProp?.id || 'general_prop';
          const propTitle = targetProp?.title || `حساب المكلف ${selectedTaxpayer.fullName}`;
          const refNumber = `RCV-${Date.now().toString().slice(-5)}`;
          const currCode = workspace?.defaultCurrency || 'SAR';

          const savedTx = await addFinancialTransaction({
            propertyId: propId,
            propertyTitle: propTitle,
            taxpayerId: selectedTaxpayer.id,
            taxpayerName: selectedTaxpayer.fullName,
            assessmentId: 'general_account',
            transactionType: 'payment',
            amount: Number(extracted.amount),
            currency: currCode,
            transactionDate: new Date().toISOString().slice(0, 10),
            referenceNumber: refNumber,
            status: 'approved',
            notes: `تحصيل صوتي موثق (${extracted.currency}) — ${transcriptInput}`,
          });

          markPlanAsExecuted(idempotencyKey);

          const finSummary =
            activePlan.financialSummary ||
            computeFinancialSummary(
              selectedTaxpayer,
              targetProp,
              extracted.amount,
              extracted.currency,
              assessments,
              transactions
            );

          const finalRef = savedTx?.referenceNumber || refNumber;
          const spokenSummary = `تم تسجيل تحصيل مبلغ ${extracted.amount.toLocaleString(
            'ar-SA'
          )} ${extracted.currency} من حساب ${selectedTaxpayer.fullName}. الرصيد المتبقي بعد العملية ${finSummary.remainingAfterOperation.toLocaleString(
            'ar-SA'
          )} ${extracted.currency}.`;

          report = {
            planId: activePlan.planId,
            idempotencyKey,
            executedAt: new Date().toLocaleTimeString('ar-SA'),
            intent: extracted.intent,
            intentLabel: activePlan.intentLabel,
            success: true,
            headline: 'تم تسجيل التحصيل المالي بنجاح',
            spokenSummary,
            createdTaxpayerId: selectedTaxpayer.id,
            transactionId: savedTx?.id,
            transactionReferenceNumber: finalRef,
            collectedAmount: extracted.amount,
            currency: extracted.currency,
            remainingBalanceAfter: finSummary.remainingAfterOperation,
            verifiedDetails: [
              { label: 'اسم المكلف', value: selectedTaxpayer.fullName },
              {
                label: 'المبلغ المحصل',
                value: `${extracted.amount.toLocaleString('ar-SA')} ${extracted.currency}`,
              },
              {
                label: 'المتبقي بعد السداد',
                value: `${finSummary.remainingAfterOperation.toLocaleString('ar-SA')} ${extracted.currency}`,
              },
              { label: 'رقم السند', value: finalRef },
            ],
          };
        } else if (extracted.intent === 'create_visit') {
          const targetTp = selectedTaxpayer || activePlan.matchedTaxpayers[0];
          if (!targetTp) throw new Error('يرجى تحديد المكلف قبل تسجيل الزيارة الميدانية');
          const targetProp = selectedProperty || activePlan.matchedProperties[0];
          const visitTimeNow = new Date().toTimeString().slice(0, 5);

          const visitId = await addFieldVisit({
            propertyId: targetProp?.id || 'general_prop',
            propertyTitle: targetProp?.title || `ملف المكلف ${targetTp.fullName}`,
            taxpayerId: targetTp.id,
            taxpayerName: targetTp.fullName,
            visitDate: extracted.dateIso,
            visitTime: visitTimeNow,
            purpose: 'periodic_inspection',
            status: 'completed',
            latitude: targetProp?.latitude || 0,
            longitude: targetProp?.longitude || 0,
            hasCoordinates: Boolean(targetProp?.hasCoordinates),
            photoSummary: 'توثيق صوتي ميداني',
            notes: extracted.notes || `زيارة ميدانية مسجلة صوتيًا: ${transcriptInput}`,
          });

          markPlanAsExecuted(idempotencyKey);
          const spokenSummary = `تم تسجيل الزيارة الميدانية للمكلف ${targetTp.fullName} بتاريخ ${extracted.dateIso} بنجاح.`;

          report = {
            planId: activePlan.planId,
            idempotencyKey,
            executedAt: new Date().toLocaleTimeString('ar-SA'),
            intent: extracted.intent,
            intentLabel: activePlan.intentLabel,
            success: true,
            headline: 'تم تسجيل الزيارة بنجاح',
            spokenSummary,
            createdTaxpayerId: targetTp.id,
            createdVisitId: visitId,
            verifiedDetails: [
              { label: 'اسم المكلف', value: targetTp.fullName },
              { label: 'العقار', value: targetProp?.title || 'ملف المكلف العام' },
              { label: 'التاريخ والوقت', value: `${extracted.dateIso} — ${visitTimeNow}` },
            ],
          };
        } else if (extracted.intent === 'create_appointment') {
          const tpName = selectedTaxpayer?.fullName || extracted.taxpayerName || 'متابعة ميدانية';
          const targetProp = selectedProperty || activePlan.matchedProperties[0];
          const finSummary = activePlan.financialSummary;
          const remainingNote = finSummary
            ? ` — المتبقي المالي: ${finSummary.remainingBeforeOperation.toLocaleString('ar-SA')} ${finSummary.currency}`
            : '';

          const apptTitle =
            extracted.reminderTopic || `متابعة المكلف ${tpName}`;

          const apptId = await addAppointment({
            title: apptTitle,
            propertyId: targetProp?.id || 'general_prop',
            propertyTitle: targetProp?.title || `ملف ${tpName}`,
            taxpayerId: selectedTaxpayer?.id || 'general_tp',
            taxpayerName: tpName,
            scheduledDate: extracted.dateIso,
            scheduledTime: extracted.timeStr,
            locationText: targetProp?.address || selectedTaxpayer?.address || extracted.address,
            status: 'upcoming',
            notes: `تذكير صوتي مجدول${remainingNote}`,
          });

          markPlanAsExecuted(idempotencyKey);
          const spokenSummary = `تم حفظ الموعد والتذكير ليوم ${extracted.dateIso} الساعة ${extracted.timeStr} بخصوص ${apptTitle}.`;

          report = {
            planId: activePlan.planId,
            idempotencyKey,
            executedAt: new Date().toLocaleTimeString('ar-SA'),
            intent: extracted.intent,
            intentLabel: activePlan.intentLabel,
            success: true,
            headline: 'تم تسجيل الموعد والتذكير بنجاح',
            spokenSummary,
            createdTaxpayerId: selectedTaxpayer?.id,
            appointmentId: apptId,
            appointmentDateTime: `${extracted.dateIso} ${extracted.timeStr}`,
            verifiedDetails: [
              { label: 'الموضوع', value: apptTitle },
              { label: 'المكلف', value: tpName },
              { label: 'الموعد', value: `${extracted.dateIso} — ${extracted.timeStr}` },
            ],
          };
        } else if (extracted.intent === 'query_balance') {
          if (!selectedTaxpayer) throw new Error('لم يتم تحديد المكلف');
          const fin =
            activePlan.financialSummary ||
            computeFinancialSummary(
              selectedTaxpayer,
              selectedProperty,
              0,
              extracted.currency,
              assessments,
              transactions
            );
          await recordVoiceAudit(
            transcriptInput,
            `استعلام رصيد صوتي للمكلف (${selectedTaxpayer.fullName}): المتبقي ${fin.remainingBeforeOperation}`
          );
          const spokenSummary = `الرصيد المتبقي على المكلف ${
            selectedTaxpayer.fullName
          } هو ${fin.remainingBeforeOperation.toLocaleString('ar-SA')} ${fin.currency}.`;

          report = {
            planId: activePlan.planId,
            idempotencyKey,
            executedAt: new Date().toLocaleTimeString('ar-SA'),
            intent: extracted.intent,
            intentLabel: activePlan.intentLabel,
            success: true,
            headline: `ملخص حساب المكلف «${selectedTaxpayer.fullName}»`,
            spokenSummary,
            createdTaxpayerId: selectedTaxpayer.id,
            remainingBalanceAfter: fin.remainingBeforeOperation,
            currency: fin.currency,
            verifiedDetails: [
              { label: 'اسم المكلف', value: selectedTaxpayer.fullName },
              {
                label: 'الرصيد المتبقي حاليًا',
                value: `${fin.remainingBeforeOperation.toLocaleString('ar-SA')} ${fin.currency}`,
              },
              {
                label: 'إجمالي المستحقات',
                value: `${fin.totalGrossObligation.toLocaleString('ar-SA')} ${fin.currency}`,
              },
              {
                label: 'إجمالي المسدد',
                value: `${fin.totalPreviousPayments.toLocaleString('ar-SA')} ${fin.currency}`,
              },
            ],
          };
        } else if (extracted.intent === 'search_records') {
          await recordVoiceAudit(
            transcriptInput,
            `بحث صوتي عن (${extracted.searchQuery || extracted.taxpayerName})`
          );
          const spokenSummary = `تم العثور على ${activePlan.matchedTaxpayers.length} مكلفين و${activePlan.matchedProperties.length} عقارات مطابقة.`;
          report = {
            planId: activePlan.planId,
            idempotencyKey,
            executedAt: new Date().toLocaleTimeString('ar-SA'),
            intent: extracted.intent,
            intentLabel: activePlan.intentLabel,
            success: true,
            headline: 'نتائج البحث في السجلات',
            spokenSummary,
            searchResults: {
              taxpayers: activePlan.matchedTaxpayers,
              properties: activePlan.matchedProperties,
              units: activePlan.matchedUnits,
            },
            verifiedDetails: [
              { label: 'المكلفون المطابقون', value: `${activePlan.matchedTaxpayers.length}` },
              { label: 'العقارات المطابقة', value: `${activePlan.matchedProperties.length}` },
            ],
          };
        } else if (extracted.intent === 'update_agent_phone') {
          const targetTp = selectedTaxpayer || activePlan.matchedTaxpayers[0];
          if (!targetTp) throw new Error('لم يتم العثور على السجل المرتبط بالوكيل');

          const updatedNotes = targetTp.notes.includes('هاتف الوكيل:')
            ? targetTp.notes.replace(/هاتف الوكيل:\s*[0-9+]+/, `هاتف الوكيل: ${extracted.agentPhone}`)
            : `${targetTp.notes ? targetTp.notes + ' | ' : ''}الوكيل: ${
                extracted.agentName || 'معتمد'
              } | هاتف الوكيل: ${extracted.agentPhone}`;

          await updateTaxpayer(targetTp.id, {
            phone: extracted.agentPhone,
            notes: updatedNotes,
          });
          markPlanAsExecuted(idempotencyKey);
          const spokenSummary = `تم تحديث رقم هاتف الوكيل في ملف المكلف ${targetTp.fullName} بنجاح.`;

          report = {
            planId: activePlan.planId,
            idempotencyKey,
            executedAt: new Date().toLocaleTimeString('ar-SA'),
            intent: extracted.intent,
            intentLabel: activePlan.intentLabel,
            success: true,
            headline: 'تم تحديث رقم هاتف الوكيل بنجاح',
            spokenSummary,
            createdTaxpayerId: targetTp.id,
            verifiedDetails: [
              { label: 'اسم المكلف', value: targetTp.fullName },
              { label: 'اسم الوكيل', value: extracted.agentName || 'الوكيل المعتمد' },
              { label: 'رقم الهاتف الجديد', value: extracted.agentPhone },
            ],
          };
        } else if (extracted.intent === 'update_unit_type') {
          if (!selectedUnit) throw new Error('يرجى تحديد الوحدة العقارية أولًا');
          await updatePropertyUnit(selectedUnit.id, {
            unitType: extracted.targetUnitType,
          });
          markPlanAsExecuted(idempotencyKey);
          const typeLabel =
            extracted.targetUnitType === 'shop'
              ? 'فتحة تجارية / محل'
              : extracted.targetUnitType === 'office'
                ? 'مكتب'
                : extracted.targetUnitType === 'warehouse'
                  ? 'مستودع'
                  : 'شقة سكنية';
          const spokenSummary = `تم تعديل نوع الوحدة ${selectedUnit.unitNumber} إلى ${typeLabel} بنجاح.`;

          report = {
            planId: activePlan.planId,
            idempotencyKey,
            executedAt: new Date().toLocaleTimeString('ar-SA'),
            intent: extracted.intent,
            intentLabel: activePlan.intentLabel,
            success: true,
            headline: 'تم تعديل نوع الوحدة العقارية بنجاح',
            spokenSummary,
            verifiedDetails: [
              { label: 'الوحدة العقارية', value: selectedUnit.unitNumber },
              { label: 'العقار', value: selectedUnit.propertyTitle },
              { label: 'النوع الجديد', value: typeLabel },
            ],
          };
        } else if (extracted.intent === 'delete_property') {
          if (!selectedProperty) throw new Error('يرجى تحديد العقار المراد حذفه');
          await deleteProperty(selectedProperty.id);
          markPlanAsExecuted(idempotencyKey);
          const spokenSummary = `تم حذف سجل العقار ${selectedProperty.title} بنجاح.`;
          report = {
            planId: activePlan.planId,
            idempotencyKey,
            executedAt: new Date().toLocaleTimeString('ar-SA'),
            intent: extracted.intent,
            intentLabel: activePlan.intentLabel,
            success: true,
            headline: 'تم حذف العقار بنجاح',
            spokenSummary,
            verifiedDetails: [
              { label: 'العقار المحذوف', value: selectedProperty.title },
              { label: 'المكلف', value: selectedProperty.taxpayerName },
            ],
          };
        } else if (extracted.intent === 'create_taxpayer') {
          const tpCode = `TP-${Date.now().toString().slice(-4)}`;
          const tpId = await addTaxpayer({
            fullName: extracted.taxpayerName,
            internalCode: tpCode,
            nationalOrCommercialId: extracted.nationalId,
            phone: extracted.taxpayerPhone,
            email: '',
            address: extracted.address,
            region: extracted.region,
            status: 'active',
            notes: extracted.agentName ? `الوكيل: ${extracted.agentName}` : extracted.notes,
          });
          markPlanAsExecuted(idempotencyKey);
          const spokenSummary = `تم تسجيل المكلف الجديد ${extracted.taxpayerName} بنجاح.`;
          report = {
            planId: activePlan.planId,
            idempotencyKey,
            executedAt: new Date().toLocaleTimeString('ar-SA'),
            intent: extracted.intent,
            intentLabel: activePlan.intentLabel,
            success: true,
            headline: 'تم تسجيل المكلف الجديد بنجاح',
            spokenSummary,
            createdTaxpayerId: tpId,
            createdTaxpayerCode: tpCode,
            verifiedDetails: [
              { label: 'اسم المكلف', value: extracted.taxpayerName },
              { label: 'المنطقة / العنوان', value: extracted.address },
              { label: 'الرمز', value: tpCode },
            ],
          };
        } else if (extracted.intent === 'create_property') {
          const targetTp = selectedTaxpayer || activePlan.matchedTaxpayers[0];
          if (!targetTp) throw new Error('يجب تحديد المكلف لربط العقار الجديد بملفه');
          const propTitleFinal =
            extracted.propertyTitle || `عقار ${targetTp.fullName} — ${extracted.address}`;

          if (
            (Number(extracted.apartmentsCount) || 0) > 0 ||
            (Number(extracted.shopsCount) || 0) > 0 ||
            (Number(extracted.officesCount) || 0) > 0 ||
            (Number(extracted.floorsCount) || 0) > 0
          ) {
            const result = await executeCompoundVoiceCreation({
              existingTaxpayerId: targetTp.id,
              taxpayerName: targetTp.fullName,
              taxpayerPhone: targetTp.phone,
              address: extracted.address,
              region: extracted.region !== 'غير محدد' ? extracted.region : targetTp.region,
              propertyTitle: propTitleFinal,
              propertyType: extracted.propertyType,
              floorsCount: Number(extracted.floorsCount) || 0,
              apartmentsCount: Number(extracted.apartmentsCount) || 0,
              shopsCount: Number(extracted.shopsCount) || 0,
              officesCount: Number(extracted.officesCount) || 0,
              agentName: extracted.agentName,
              agentPhone: extracted.agentPhone,
              notes: extracted.notes,
            });
            markPlanAsExecuted(idempotencyKey);
            const spokenSummary = `تم تسجيل العقار الجديد للمكلف ${targetTp.fullName} مع ${result.createdUnitsCount} وحدات بنجاح.`;
            report = {
              planId: activePlan.planId,
              idempotencyKey,
              executedAt: new Date().toLocaleTimeString('ar-SA'),
              intent: extracted.intent,
              intentLabel: activePlan.intentLabel,
              success: true,
              headline: 'تم تسجيل العقار الجديد بنجاح',
              spokenSummary,
              createdTaxpayerId: targetTp.id,
              createdPropertyId: result.propertyId,
              createdPropertyCode: result.propertyCode,
              createdUnitsCount: result.createdUnitsCount,
              createdUnitNumbers: result.createdUnitNumbers,
              verifiedDetails: [
                { label: 'اسم المكلف', value: targetTp.fullName },
                { label: 'العقار', value: propTitleFinal },
                { label: 'الوحدات المسجلة', value: `${result.createdUnitsCount} وحدة` },
              ],
            };
          } else {
            const propCode = `PR-${Date.now().toString().slice(-4)}`;
            const propId = await addProperty({
              taxpayerId: targetTp.id,
              taxpayerName: targetTp.fullName,
              title: propTitleFinal,
              code: propCode,
              propertyType: extracted.propertyType,
              status: 'active',
              region: extracted.region !== 'غير محدد' ? extracted.region : targetTp.region || 'غير محدد',
              address: extracted.address !== 'غير محدد' ? extracted.address : targetTp.address || 'غير محدد',
              latitude: 0,
              longitude: 0,
              hasCoordinates: false,
              unitsCount: 0,
              areaSqm: 0,
              notes: extracted.notes,
            });
            markPlanAsExecuted(idempotencyKey);
            const spokenSummary = `تم تسجيل العقار الجديد للمكلف ${targetTp.fullName} بنجاح.`;
            report = {
              planId: activePlan.planId,
              idempotencyKey,
              executedAt: new Date().toLocaleTimeString('ar-SA'),
              intent: extracted.intent,
              intentLabel: activePlan.intentLabel,
              success: true,
              headline: 'تم تسجيل العقار الجديد بنجاح',
              spokenSummary,
              createdTaxpayerId: targetTp.id,
              createdPropertyId: propId,
              createdPropertyCode: propCode,
              verifiedDetails: [
                { label: 'اسم المكلف', value: targetTp.fullName },
                { label: 'العقار', value: propTitleFinal },
                { label: 'المنطقة', value: extracted.address },
              ],
            };
          }
        } else if (extracted.intent === 'create_assessment') {
          const targetTp = selectedTaxpayer || activePlan.matchedTaxpayers[0];
          if (!targetTp) throw new Error('يجب تحديد المكلف لإصدار التقييم المالي');
          const targetProp = selectedProperty || activePlan.matchedProperties[0];
          const currCode = workspace?.defaultCurrency || 'SAR';
          const assessId = await addFinancialAssessment({
            propertyId: targetProp?.id || 'general_prop',
            propertyTitle: targetProp?.title || `ملف المكلف ${targetTp.fullName}`,
            taxpayerId: targetTp.id,
            taxpayerName: targetTp.fullName,
            amount: Math.max(0, Number(extracted.amount) || 0),
            currency: currCode,
            periodLabel: `ربط مالي صوتي ${new Date().getFullYear()}`,
            assessmentDate: extracted.dateIso,
            status: canApproveFinancials ? 'approved' : 'draft',
            notes: `تقييم مالي صوتي — ${transcriptInput}`,
          });
          markPlanAsExecuted(idempotencyKey);
          const spokenSummary = `تم تسجيل التقييم المالي بمبلغ ${extracted.amount.toLocaleString('ar-SA')} ${extracted.currency} للمكلف ${targetTp.fullName}.`;
          report = {
            planId: activePlan.planId,
            idempotencyKey,
            executedAt: new Date().toLocaleTimeString('ar-SA'),
            intent: extracted.intent,
            intentLabel: activePlan.intentLabel,
            success: true,
            headline: 'تم تسجيل التقييم المالي بنجاح',
            spokenSummary,
            createdTaxpayerId: targetTp.id,
            verifiedDetails: [
              { label: 'اسم المكلف', value: targetTp.fullName },
              {
                label: 'مبلغ التقييم',
                value: `${extracted.amount.toLocaleString('ar-SA')} ${extracted.currency}`,
              },
              { label: 'رقم التقييم', value: assessId },
            ],
          };
        }

        if (report) {
          setExecutionReport(report);
          if (autoSpeakReport) {
            speakArabicText(report.spokenSummary);
          }
        }
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : 'تعذر إتمام العملية حاليًا. يرجى مراجعة البيانات والمحاولة مرة أخرى.';
        setExecutionError(message);
        showToast(message, 'error');
      } finally {
        setIsExecuting(false);
      }
    },
    [
      currentPlan,
      isExecuting,
      properties,
      propertyUnits,
      assessments,
      transactions,
      recordVoiceAudit,
      transcriptInput,
      setSelectedPropertyId,
      setSelectedTaxpayerId,
      executeCompoundVoiceCreation,
      workspace?.defaultCurrency,
      addFinancialTransaction,
      addFieldVisit,
      addAppointment,
      updateTaxpayer,
      updatePropertyUnit,
      deleteProperty,
      addTaxpayer,
      addProperty,
      addFinancialAssessment,
      canApproveFinancials,
      autoSpeakReport,
      speakArabicText,
      showToast,
    ]
  );

  // Auto-execute read-only queries immediately when ready without requiring unnecessary confirmation
  useEffect(() => {
    if (!currentPlan || isAnalyzing || isExecuting || executionReport || executionError) return;
    const isReadOnlyQuery = !currentPlan.requiresSensitiveConfirmation;
    if (
      isReadOnlyQuery &&
      currentPlan.canExecute &&
      autoExecutedPlanKeyRef.current !== currentPlan.idempotencyKey
    ) {
      autoExecutedPlanKeyRef.current = currentPlan.idempotencyKey;
      void handleExecuteConfirmedPlan(currentPlan);
    }
  }, [
    currentPlan,
    isAnalyzing,
    isExecuting,
    executionReport,
    executionError,
    handleExecuteConfirmedPlan,
  ]);

  // Build clean summary rows for the "فهمت طلبك" card based on the actual extracted command
  const summaryRows = useMemo(() => {
    if (!currentPlan) return [];
    const { extracted, selectedTaxpayer, selectedProperty, selectedUnit } = currentPlan;
    const rows: { label: string; value: string }[] = [];

    const tpDisplayName = selectedTaxpayer?.fullName || extracted.taxpayerName;
    if (tpDisplayName) {
      rows.push({ label: 'اسم المكلف', value: tpDisplayName });
    }

    if (
      extracted.intent === 'create_compound_record' ||
      extracted.intent === 'create_property' ||
      extracted.intent === 'create_taxpayer' ||
      extracted.intent === 'create_appointment'
    ) {
      if (extracted.address && extracted.address !== 'غير محدد') {
        rows.push({ label: 'المنطقة / الموقع', value: extracted.address });
      }
    } else if (selectedProperty?.title) {
      rows.push({ label: 'العقار', value: selectedProperty.title });
    }

    if (extracted.intent === 'create_compound_record' || extracted.intent === 'create_property') {
      if (extracted.floorsCount > 0) {
        rows.push({ label: 'عدد الأدوار', value: String(extracted.floorsCount) });
      }
      if (extracted.apartmentsCount > 0) {
        rows.push({ label: 'عدد الشقق', value: String(extracted.apartmentsCount) });
      }
      if (extracted.shopsCount > 0) {
        rows.push({ label: 'المحلات التجارية', value: String(extracted.shopsCount) });
      }
      if (extracted.officesCount > 0) {
        rows.push({ label: 'المكاتب', value: String(extracted.officesCount) });
      }
      if (extracted.agentName) {
        rows.push({
          label: 'الوكيل',
          value: `${extracted.agentName}${extracted.agentPhone ? ` (${extracted.agentPhone})` : ''}`,
        });
      }
      if (
        extracted.notes?.includes('قيمة العقد') ||
        (extracted.amount > 0 &&
          (extracted.intent === 'create_compound_record' || extracted.intent === 'create_property'))
      ) {
        const valStr = extracted.notes?.includes('قيمة العقد')
          ? extracted.notes
          : `قيمة العقد: ${extracted.amount.toLocaleString('ar-SA')} ${extracted.currency}`;
        rows.push({
          label: 'قيمة العقد / البند المالي',
          value: valStr,
        });
      }
    }

    if (extracted.intent === 'record_collection' || extracted.intent === 'create_assessment') {
      if (extracted.amount > 0) {
        rows.push({
          label: 'المبلغ',
          value: `${extracted.amount.toLocaleString('ar-SA')} ${extracted.currency}`,
        });
      }
      if (currentPlan.financialSummary && extracted.intent === 'record_collection') {
        rows.push({
          label: 'الرصيد المتبقي بعد السداد',
          value: `${currentPlan.financialSummary.remainingAfterOperation.toLocaleString('ar-SA')} ${currentPlan.financialSummary.currency}`,
        });
      }
    }

    if (extracted.intent === 'create_visit') {
      rows.push({ label: 'تاريخ الزيارة', value: extracted.dateIso });
      if (extracted.notes) {
        rows.push({ label: 'ملاحظات', value: extracted.notes });
      }
    }

    if (extracted.intent === 'create_appointment') {
      rows.push({ label: 'التاريخ والوقت', value: `${extracted.dateIso} — ${extracted.timeStr}` });
      if (extracted.reminderTopic) {
        rows.push({ label: 'موضوع المتابعة', value: extracted.reminderTopic });
      }
    }

    if (extracted.intent === 'update_agent_phone') {
      if (extracted.agentName) {
        rows.push({ label: 'اسم الوكيل', value: extracted.agentName });
      }
      if (extracted.agentPhone) {
        rows.push({ label: 'رقم الهاتف الجديد', value: extracted.agentPhone });
      }
    }

    if (extracted.intent === 'update_unit_type') {
      if (selectedUnit) {
        rows.push({ label: 'الوحدة العقارية', value: selectedUnit.unitNumber });
      }
      const typeLabel =
        extracted.targetUnitType === 'shop'
          ? 'محل تجاري'
          : extracted.targetUnitType === 'office'
            ? 'مكتب'
            : extracted.targetUnitType === 'warehouse'
              ? 'مستودع'
              : 'شقة سكنية';
      rows.push({ label: 'النوع الجديد', value: typeLabel });
    }

    if (extracted.intent === 'search_records' && extracted.searchQuery) {
      rows.push({ label: 'عبارة البحث', value: extracted.searchQuery });
    }

    return rows;
  }, [currentPlan]);

  const isListeningActive = listeningState === 'listening' || listeningState === 'starting';

  // Status text according to requirements: «جاهز للاستماع» | «أستمع إليك الآن» | «جارٍ فهم طلبك»
  const statusHeadline = isAnalyzing
    ? 'جارٍ فهم طلبك'
    : isListeningActive
      ? 'أستمع إليك الآن'
      : 'جاهز للاستماع';

  // Single question at a time if missing info or ambiguity
  const singleQuestionText = useMemo(() => {
    if (!currentPlan) return null;
    if (currentPlan.disambiguationRequired) {
      return currentPlan.disambiguationPrompt;
    }
    if (currentPlan.missingFields.length > 0) {
      if (currentPlan.clarificationQuestion) {
        return currentPlan.clarificationQuestion;
      }
      return `يرجى تحديد ${currentPlan.missingFields[0].label} لإتمام الطلب:`;
    }
    return null;
  }, [currentPlan]);

  return (
    <div className="max-w-lg mx-auto space-y-4 pb-10">
      {/* 1. Primary Mobile Voice Assistant Card */}
      <div className="rounded-3xl bg-gradient-to-b from-[#0B192C] via-[#102542] to-[#0D3B66] text-white p-6 shadow-lg border border-sky-400/20">
        {/* Top Row: Short Title + Subtle Sound Toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-teal-400/20 border border-teal-300/30 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-teal-300" />
            </div>
            <h2 className="text-lg font-extrabold tracking-tight">المساعد الصوتي</h2>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowManualInput((v) => !v)}
              title="كتابة الطلب نصيًا"
              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                showManualInput
                  ? 'bg-white/20 border-white/30 text-white'
                  : 'bg-white/5 border-white/10 text-sky-200 hover:bg-white/10'
              }`}
            >
              كتابة نصية
            </button>
            <button
              type="button"
              onClick={() => {
                if (isSpeaking) stopSpeaking();
                setAutoSpeakReport((v) => !v);
              }}
              title={autoSpeakReport ? 'إيقاف القراءة الصوتية' : 'تفعيل القراءة الصوتية'}
              className={`p-2 rounded-xl border transition cursor-pointer ${
                autoSpeakReport
                  ? 'bg-teal-500/20 border-teal-400/40 text-teal-200'
                  : 'bg-white/5 border-white/10 text-slate-400'
              }`}
            >
              {autoSpeakReport ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Center Section: Status + Large Touch-Friendly Microphone Button */}
        <div className="py-6 flex flex-col items-center text-center">
          <div className="inline-flex items-center gap-2 mb-5">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isAnalyzing
                  ? 'bg-amber-400 animate-ping'
                  : isListeningActive
                    ? 'bg-rose-400 animate-ping'
                    : 'bg-teal-400'
              }`}
            />
            <span className="text-base font-extrabold text-sky-100">{statusHeadline}</span>
          </div>

          {/* Large Microphone Button */}
          <button
            type="button"
            onClick={toggleSpeechListening}
            aria-label={isListeningActive ? 'إيقاف الاستماع' : 'بدء الاستماع'}
            className={`w-24 h-24 rounded-full flex flex-col items-center justify-center transition-all shadow-xl cursor-pointer select-none ${
              isListeningActive
                ? 'bg-rose-500 hover:bg-rose-400 text-white ring-8 ring-rose-500/25 scale-105'
                : 'bg-gradient-to-br from-teal-400 to-[#0284C7] hover:opacity-95 text-slate-950 ring-8 ring-teal-400/15'
            }`}
          >
            {isListeningActive ? (
              <MicOff className="w-9 h-9 stroke-[2.2]" />
            ) : (
              <Mic className="w-9 h-9 stroke-[2.2]" />
            )}
          </button>

          <p className="text-xs text-sky-200/80 mt-3 font-medium">
            {isListeningActive
              ? 'تحدث بطبيعتك... واضغط على الزر عند الانتهاء'
              : 'اضغط على الميكروفون وتحدث مباشرة'}
          </p>

          {/* Small Stop or Cancel Button Depending on State */}
          {(isListeningActive || transcriptInput) && (
            <div className="flex items-center justify-center gap-2.5 mt-4">
              {isListeningActive && (
                <button
                  type="button"
                  onClick={() => stopSpeechListening(true)}
                  className="px-4 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold flex items-center gap-1.5 border border-white/20 transition cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-teal-300" />
                  إنهاء الاستماع وفهم الطلب
                </button>
              )}
              <button
                type="button"
                onClick={resetCurrentCommand}
                className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-rose-500/30 text-sky-100 hover:text-white text-xs font-bold flex items-center gap-1 border border-white/10 transition cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                {isListeningActive ? 'إلغاء الاستماع' : 'مسح'}
              </button>
            </div>
          )}
        </div>

        {/* Readable Speech Display Box (Distinguishes Final Text vs Interim Speech) */}
        {(committedTextState || interimSpeech || transcriptInput) && !showManualInput && (
          <div className="rounded-2xl bg-slate-950/50 border border-white/15 p-4 text-right space-y-1.5">
            <div className="text-[11px] font-bold text-teal-300">ما قلته:</div>
            <p className="text-sm font-bold leading-relaxed text-white">
              <span>{committedTextState || transcriptInput}</span>
              {interimSpeech && (
                <span className="text-teal-300/90 font-normal mr-1.5 underline decoration-teal-400/50 decoration-dotted">
                  {interimSpeech}
                </span>
              )}
            </p>
          </div>
        )}

        {/* Optional Manual Text Input for Quiet Environments */}
        {showManualInput && (
          <div className="rounded-2xl bg-slate-950/55 border border-white/15 p-3.5 space-y-2.5">
            <textarea
              rows={2}
              value={transcriptInput}
              onChange={(e) => {
                setTranscriptInput(e.target.value);
                setCommittedTextState(e.target.value);
                committedTranscriptRef.current = e.target.value;
                latestFullTranscriptRef.current = e.target.value;
              }}
              placeholder="اكتب طلبك هنا... مثال: سجل زيارة للمكلف خالد اليوم"
              className="w-full rounded-xl bg-slate-900/90 border border-white/15 px-3 py-2 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:border-teal-400"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => void handleAnalyzeCommand()}
                disabled={!transcriptInput.trim() || isAnalyzing}
                className="px-4 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-slate-950 font-extrabold text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                فهم الطلب
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 2. After Speaking: Single Clean Card «فهمت طلبك» (Hidden once executionReport is shown) */}
      {currentPlan && !executionReport && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          {/* Card Header */}
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <span className="text-xs font-extrabold text-teal-600 dark:text-teal-400">
                فهمت طلبك
              </span>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white mt-0.5">
                العملية: {SIMPLE_INTENT_NAMES[currentPlan.extracted.intent] || currentPlan.intentLabel}
              </h3>
            </div>

            {isAnalyzing && (
              <span className="text-xs font-bold text-sky-600 dark:text-sky-400 animate-pulse">
                جارٍ التحقق...
              </span>
            )}
          </div>

          {/* Subtle Self-Correction Note if User Corrected Themselves During Speech */}
          {currentPlan.extracted.selfCorrectionDetected && (
            <div className="p-3 rounded-2xl bg-teal-50/80 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800/70 text-xs text-teal-900 dark:text-teal-200 font-bold">
              تم اعتماد التصحيح الأخير في كلامك تلقائيًا.
            </div>
          )}

          {/* Read-View of Extracted Summary Fields */}
          {!isEditingFields && summaryRows.length > 0 && (
            <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 divide-y divide-slate-200/70 dark:divide-slate-800">
              {summaryRows.map((row, idx) => (
                <div key={idx} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="text-slate-500 dark:text-slate-400 font-bold">{row.label}:</span>
                  <span className="text-slate-900 dark:text-white font-extrabold">{row.value}</span>
                </div>
              ))}
            </div>
          )}

          {/* Edit Mode Form (Toggled when user presses «تعديل») */}
          {isEditingFields && (
            <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-4 space-y-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-extrabold text-slate-700 dark:text-slate-200">
                  تعديل البيانات قبل التنفيذ
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                  نوع العملية
                </label>
                <select
                  value={currentPlan.extracted.intent}
                  onChange={(e) =>
                    updateExtractedField('intent', e.target.value as VoiceExtractedPayload['intent'])
                  }
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold text-slate-900 dark:text-white"
                >
                  <option value="open_taxpayer_dossier">فتح ملف المكلف</option>
                  <option value="create_compound_record">تسجيل عقار ومكلف جديد</option>
                  <option value="create_property">تسجيل عقار جديد</option>
                  <option value="create_taxpayer">تسجيل مكلف جديد</option>
                  <option value="record_collection">تسجيل تحصيل مالي</option>
                  <option value="create_assessment">إصدار تقييم مالي</option>
                  <option value="create_visit">تسجيل زيارة ميدانية</option>
                  <option value="create_appointment">جدولة موعد وتذكير</option>
                  <option value="query_balance">استعلام عن الرصيد المالي</option>
                  <option value="search_records">بحث في السجلات</option>
                  <option value="update_agent_phone">تعديل رقم هاتف الوكيل</option>
                  <option value="update_unit_type">تعديل نوع وحدة عقارية</option>
                  <option value="delete_property">حذف عقار</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                    اسم المكلف
                  </label>
                  <input
                    type="text"
                    value={currentPlan.extracted.taxpayerName}
                    onChange={(e) => updateExtractedField('taxpayerName', e.target.value)}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold text-slate-900 dark:text-white"
                  />
                </div>

                {(currentPlan.intent === 'create_compound_record' ||
                  currentPlan.intent === 'create_property' ||
                  currentPlan.intent === 'create_taxpayer' ||
                  currentPlan.intent === 'create_appointment') && (
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                      المنطقة / الموقع
                    </label>
                    <input
                      type="text"
                      value={currentPlan.extracted.address}
                      onChange={(e) => {
                        updateExtractedField('address', e.target.value);
                        updateExtractedField('region', e.target.value);
                      }}
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold text-slate-900 dark:text-white"
                    />
                  </div>
                )}

                {(currentPlan.intent === 'create_compound_record' ||
                  currentPlan.intent === 'create_property') && (
                  <>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                        عدد الأدوار
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={currentPlan.extracted.floorsCount}
                        onChange={(e) =>
                          updateExtractedField('floorsCount', parseInt(e.target.value || '0', 10))
                        }
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                        عدد الشقق
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={currentPlan.extracted.apartmentsCount}
                        onChange={(e) =>
                          updateExtractedField('apartmentsCount', parseInt(e.target.value || '0', 10))
                        }
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                        المحلات التجارية
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={currentPlan.extracted.shopsCount}
                        onChange={(e) =>
                          updateExtractedField('shopsCount', parseInt(e.target.value || '0', 10))
                        }
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                        اسم الوكيل (اختياري)
                      </label>
                      <input
                        type="text"
                        value={currentPlan.extracted.agentName}
                        onChange={(e) => updateExtractedField('agentName', e.target.value)}
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                        تصنيف العقار
                      </label>
                      <select
                        value={currentPlan.extracted.propertyType}
                        onChange={(e) =>
                          updateExtractedField('propertyType', e.target.value as PropertyType)
                        }
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold text-slate-900 dark:text-white"
                      >
                        <option value="mixed">مختلط (سكني وتجاري)</option>
                        <option value="residential">سكني</option>
                        <option value="commercial">تجاري</option>
                        <option value="industrial">صناعي</option>
                        <option value="agricultural">زراعي</option>
                      </select>
                    </div>
                  </>
                )}

                {(currentPlan.intent === 'record_collection' ||
                  currentPlan.intent === 'create_assessment') && (
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                      المبلغ
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={currentPlan.extracted.amount}
                      onChange={(e) =>
                        updateExtractedField('amount', parseFloat(e.target.value || '0'))
                      }
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold text-slate-900 dark:text-white"
                    />
                  </div>
                )}

                {(currentPlan.intent === 'create_appointment' ||
                  currentPlan.intent === 'create_visit') && (
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                      التاريخ
                    </label>
                    <input
                      type="date"
                      value={currentPlan.extracted.dateIso}
                      onChange={(e) => updateExtractedField('dateIso', e.target.value)}
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold text-slate-900 dark:text-white"
                    />
                  </div>
                )}

                {currentPlan.intent === 'create_appointment' && (
                  <>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                        الوقت
                      </label>
                      <input
                        type="time"
                        value={currentPlan.extracted.timeStr}
                        onChange={(e) => updateExtractedField('timeStr', e.target.value)}
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold text-slate-900 dark:text-white"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                        موضوع الموعد
                      </label>
                      <input
                        type="text"
                        value={currentPlan.extracted.reminderTopic}
                        onChange={(e) => updateExtractedField('reminderTopic', e.target.value)}
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold text-slate-900 dark:text-white"
                      />
                    </div>
                  </>
                )}

                {currentPlan.intent === 'update_agent_phone' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                      رقم هاتف الوكيل الجديد
                    </label>
                    <input
                      type="text"
                      value={currentPlan.extracted.agentPhone}
                      onChange={(e) => updateExtractedField('agentPhone', e.target.value)}
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold text-slate-900 dark:text-white"
                    />
                  </div>
                )}

                {currentPlan.intent === 'update_unit_type' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                      النوع الجديد للوحدة
                    </label>
                    <select
                      value={currentPlan.extracted.targetUnitType}
                      onChange={(e) =>
                        updateExtractedField('targetUnitType', e.target.value as UnitType)
                      }
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold text-slate-900 dark:text-white"
                    >
                      <option value="shop">محل تجاري</option>
                      <option value="apartment">شقة سكنية</option>
                      <option value="office">مكتب</option>
                      <option value="warehouse">مستودع</option>
                    </select>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Single Question at a Time: Disambiguation OR Missing Field Clarification */}
          {singleQuestionText && (
            <div className="p-4 rounded-2xl bg-amber-50/90 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 space-y-3">
              <div className="flex items-start gap-2 text-amber-900 dark:text-amber-200 font-extrabold text-xs leading-relaxed">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                <span>{singleQuestionText}</span>
              </div>

              {currentPlan.disambiguationRequired ? (
                <div className="grid grid-cols-1 gap-2">
                  {currentPlan.disambiguationCandidates.map((cand) => (
                    <button
                      key={cand.id}
                      type="button"
                      onClick={() => {
                        if (cand.entityType === 'taxpayer') setSelectedTaxpayerIdOverride(cand.id);
                        if (cand.entityType === 'property') setSelectedPropertyIdOverride(cand.id);
                        if (cand.entityType === 'unit') setSelectedUnitIdOverride(cand.id);
                      }}
                      className="text-right p-3 rounded-xl bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 hover:border-sky-600 transition flex items-center justify-between cursor-pointer"
                    >
                      <div>
                        <div className="text-xs font-extrabold text-slate-900 dark:text-white">
                          {cand.label}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {cand.sublabel}
                        </div>
                      </div>
                      <ChevronLeft className="w-4 h-4 text-slate-400" />
                    </button>
                  ))}
                </div>
              ) : (
                <form onSubmit={handleFollowUpSubmit} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={followUpInput}
                    onChange={(e) => setFollowUpInput(e.target.value)}
                    placeholder="اكتب الإجابة هنا أو اضغط الميكروفون للتحدث..."
                    className="flex-1 rounded-xl border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold text-slate-900 dark:text-white"
                  />
                  <button
                    type="submit"
                    disabled={!followUpInput.trim() || isAnalyzing}
                    className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-extrabold flex items-center gap-1 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    إرسال
                  </button>
                </form>
              )}
            </div>
          )}

          {/* Permission or Security Block Message */}
          {(currentPlan.permissionError || currentPlan.deleteBlockedReason) && (
            <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-xs font-bold text-rose-800 dark:text-rose-200 leading-relaxed">
              {currentPlan.permissionError || currentPlan.deleteBlockedReason}
            </div>
          )}

          {/* Execution Error Message if Save Failed */}
          {executionError && (
            <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-xs font-bold text-rose-800 dark:text-rose-200 leading-relaxed">
              <div>تعذر تنفيذ العملية: {executionError}</div>
              <div className="text-[11px] font-normal mt-1 opacity-90">
                يمكنك مراجعة البيانات من زر «تعديل» ثم المحاولة مرة أخرى.
              </div>
            </div>
          )}

          {/* Action Buttons: [تعديل] [إلغاء] [تأكيد التنفيذ] */}
          <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsEditingFields((v) => !v)}
                className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs font-extrabold flex items-center gap-1.5 transition cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" />
                {isEditingFields ? 'تم التعديل' : 'تعديل'}
              </button>

              <button
                type="button"
                onClick={resetCurrentCommand}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-slate-600 dark:text-slate-300 hover:text-rose-600 text-xs font-extrabold transition cursor-pointer"
              >
                إلغاء
              </button>
            </div>

            {currentPlan.requiresSensitiveConfirmation && (
              <button
                type="button"
                disabled={!currentPlan.canExecute || isExecuting}
                onClick={() => void handleExecuteConfirmedPlan()}
                className="flex-1 sm:flex-initial justify-center px-5 py-2.5 rounded-xl bg-gradient-to-l from-[#0284C7] to-[#0D9488] hover:opacity-95 disabled:opacity-40 text-white font-extrabold text-xs flex items-center gap-2 shadow-md transition cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                {isExecuting ? 'جارٍ الحفظ...' : 'تأكيد التنفيذ'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* 3. Post-Execution Concise Result Card */}
      {executionReport && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border-2 border-emerald-500/60 shadow-md space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                  {executionReport.headline}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">
                  {executionReport.spokenSummary}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => speakArabicText(executionReport.spokenSummary)}
              title="قراءة النتيجة صوتيًا"
              className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 shrink-0 cursor-pointer"
            >
              <Play className="w-4 h-4" />
            </button>
          </div>

          {/* Essential Result Details */}
          <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 divide-y divide-slate-200/70 dark:divide-slate-800">
            {executionReport.verifiedDetails
              .slice(0, showFullResultDetails ? executionReport.verifiedDetails.length : 3)
              .map((item, idx) => (
                <div key={idx} className="flex items-center justify-between px-4 py-2.5 text-xs">
                  <span className="text-slate-500 dark:text-slate-400 font-bold">{item.label}:</span>
                  <span className="text-slate-900 dark:text-white font-extrabold">{item.value}</span>
                </div>
              ))}
          </div>

          {/* Expanded Details (Units or Extra Verified Rows) */}
          {showFullResultDetails &&
            executionReport.createdUnitNumbers &&
            executionReport.createdUnitNumbers.length > 0 && (
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                <div className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-2">
                  الوحدات المسجلة ({executionReport.createdUnitsCount}):
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {executionReport.createdUnitNumbers.map((uNum, idx) => (
                    <span
                      key={idx}
                      className="text-xs text-slate-700 dark:text-slate-200 font-bold"
                    >
                      {uNum}
                      {idx < executionReport.createdUnitNumbers!.length - 1 ? ' · ' : ''}
                    </span>
                  ))}
                </div>
              </div>
            )}

          {/* Search Results List if Search Query */}
          {executionReport.searchResults && (
            <div className="space-y-2">
              {executionReport.searchResults.taxpayers.map((tp) => (
                <div
                  key={tp.id}
                  className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800"
                >
                  <div>
                    <div className="text-xs font-extrabold text-slate-900 dark:text-white">
                      {tp.fullName}
                    </div>
                    <div className="text-[11px] text-slate-500">{tp.address}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTaxpayerId(tp.id);
                      setActiveScreen('taxpayers');
                    }}
                    className="px-3 py-1.5 rounded-xl bg-sky-600 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    عرض التفاصيل
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Result Actions: [عرض التفاصيل] [طلب صوتي جديد] */}
          <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              {executionReport.createdTaxpayerId && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTaxpayerId(executionReport.createdTaxpayerId!);
                    setActiveScreen('taxpayers');
                  }}
                  className="px-4 py-2 rounded-xl bg-[#0B192C] dark:bg-sky-600 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  عرض التفاصيل في ملف المكلف
                </button>
              )}

              {!executionReport.createdTaxpayerId && executionReport.createdPropertyId && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPropertyId(executionReport.createdPropertyId!);
                    setActiveScreen('properties');
                  }}
                  className="px-4 py-2 rounded-xl bg-[#0B192C] dark:bg-sky-600 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
                >
                  <Building2 className="w-3.5 h-3.5" />
                  عرض تفاصيل العقار
                </button>
              )}

              {(executionReport.verifiedDetails.length > 3 ||
                (executionReport.createdUnitNumbers &&
                  executionReport.createdUnitNumbers.length > 0)) && (
                <button
                  type="button"
                  onClick={() => setShowFullResultDetails((v) => !v)}
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  {showFullResultDetails ? 'إخفاء التفاصيل الإضافية' : 'عرض التفاصيل'}
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={resetCurrentCommand}
              className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              طلب جديد
            </button>
          </div>
        </div>
      )}

      {/* 4. Hidden-by-Default Advanced Settings & Diagnostics Drawer (Preserves all admin/diagnostic features off the main view) */}
      <div className="pt-2">
        <button
          type="button"
          onClick={() => setShowAdvancedDiagnostics((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-2.5 rounded-2xl bg-slate-100/80 dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-800 text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <Settings2 className="w-4 h-4" />
            خيارات متقدمة وتشخيص المحرك الصوتي
          </span>
          {showAdvancedDiagnostics ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </button>

        {showAdvancedDiagnostics && (
          <div className="mt-3 space-y-4 bg-white dark:bg-slate-900 rounded-3xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs">
            {/* Voice Engine Settings */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
              <span className="text-xs font-extrabold text-slate-700 dark:text-slate-200">
                إعدادات الالتقاط واللهجة:
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDialect('ar-YE')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${
                    dialect === 'ar-YE'
                      ? 'bg-teal-500/15 border-teal-500 text-teal-800 dark:text-teal-300'
                      : 'border-slate-200 dark:border-slate-700 text-slate-500'
                  }`}
                >
                  اللهجة اليمنية (ar-YE)
                </button>
                <button
                  type="button"
                  onClick={() => setDialect('ar-SA')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${
                    dialect === 'ar-SA'
                      ? 'bg-teal-500/15 border-teal-500 text-teal-800 dark:text-teal-300'
                      : 'border-slate-200 dark:border-slate-700 text-slate-500'
                  }`}
                >
                  العربية (ar-SA)
                </button>
                <button
                  type="button"
                  onClick={() => setContinuousMode((v) => !v)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${
                    continuousMode
                      ? 'bg-sky-500/15 border-sky-500 text-sky-800 dark:text-sky-300'
                      : 'border-slate-200 dark:border-slate-700 text-slate-500'
                  }`}
                >
                  {continuousMode ? 'الاستماع المستمر: مفعّل' : 'الاستماع المستمر: متوقف'}
                </button>
              </div>
            </div>

            {/* Quick Sample Commands for Testing */}
            <div className="space-y-2">
              <div className="text-xs font-extrabold text-slate-700 dark:text-slate-300">
                أمثلة سريعة للتجربة:
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                {SAMPLE_VOICE_COMMANDS.map((sample, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setShowAdvancedDiagnostics(false);
                      void handleAnalyzeCommand(sample.command);
                    }}
                    className="text-right p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-sky-500 bg-slate-50/70 dark:bg-slate-800/40 text-xs font-bold text-slate-700 dark:text-slate-200 transition cursor-pointer"
                  >
                    «{sample.command}»
                  </button>
                ))}
              </div>
            </div>

            {/* 8-Stage Pipeline & Technical Diagnostics (Only when a plan is active) */}
            {currentPlan && (
              <div className="space-y-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-1.5 text-xs font-extrabold text-slate-700 dark:text-slate-200">
                  <ShieldCheck className="w-4 h-4 text-teal-600" />
                  <span>تشخيص المراحل الثماني للمحرك الصوتي</span>
                </div>
                <div className="space-y-1.5">
                  {currentPlan.stages.map((st) => (
                    <div
                      key={st.id}
                      className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-[11px]"
                    >
                      <div className="font-extrabold text-slate-800 dark:text-slate-200">
                        {st.stepNumber}. {st.title}
                      </div>
                      <div className="text-slate-500 dark:text-slate-400 mt-0.5">{st.summary}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
