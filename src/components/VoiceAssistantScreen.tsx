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
  Pause,
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
  Loader2,
  RefreshCw,
  FileAudio,
} from 'lucide-react';
import { useRasd } from '../context/RasdContext';
import { AudioRecorder, type AudioRecordingResult, type RecorderState } from '../services/audioRecorder';
import {
  analyzeVoiceTranscriptHybrid,
  buildVoiceExecutionPlan,
  computeFinancialSummary,
  markPlanAsExecuted,
  parseArabicVoiceCommandDeterministic,
  sanitizeSpokenRepetitions,
  transcribeAudioOnServer,
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

export type VoiceSessionPhase =
  | 'ready'
  | 'recording'
  | 'transcribing'
  | 'analyzing'
  | 'review'
  | 'executing'
  | 'executed';

const SAMPLE_VOICE_COMMANDS: {
  category: string;
  label: string;
  command: string;
}[] = [
  {
    category: 'سجل مركب متكامل',
    label: 'إنشاء ملف مكلف وعقار ووحدات وقيمة العقد',
    command: 'قم مع إنشاء ملف لصالح حمادي يمتلك عقار سكني مكون من خمسة أدوار في كل طابق ثلاث شقق رئيسية وفتحتين تجارية وقيمة العقد 9000 ريال صنعاء جوار بيت بوس رقم هاتفه 774432100',
  },
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
    category: 'قيمة العقد مع العقار',
    label: 'إنشاء عقار مع تحديد قيمة العقد كشرط عقدي',
    command: 'سجل عقار باسم كامل في شارع الثلاثين أربعة أدوار وخمس شقق وقيمة العقد خمسة آلاف ريال',
  },
  {
    category: 'استعلام مالي',
    label: 'معرفة الرصيد المتبقي على المكلف',
    command: 'كم المتبقي على كامل؟',
  },
  {
    category: 'تحصيل مالي',
    label: 'تحصيل 4,000 ريال من حساب المكلف',
    command: 'سجّل تحصيل أربعة آلاف ريال من حساب العقار الخاص بكامل عبد الرحمن',
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

  // Engine & UI states
  const [dialect, setDialect] = useState<'ar-YE' | 'ar-SA'>('ar-YE');
  const [phase, setPhase] = useState<VoiceSessionPhase>('ready');
  const [recordingDuration, setRecordingDuration] = useState<number>(0);
  const [recordingVolume, setRecordingVolume] = useState<number>(0);
  const [audioResult, setAudioResult] = useState<AudioRecordingResult | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState<boolean>(false);

  const [liveInterimSpeech, setLiveInterimSpeech] = useState<string>('');
  const [transcriptInput, setTranscriptInput] = useState<string>('');
  const [transcriptionSource, setTranscriptionSource] = useState<'server_gemini' | 'browser_speech' | 'manual'>('manual');
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null);

  const [extractedState, setExtractedState] = useState<VoiceExtractedPayload | null>(null);
  const [selectedTaxpayerIdOverride, setSelectedTaxpayerIdOverride] = useState<string | undefined>();
  const [selectedPropertyIdOverride, setSelectedPropertyIdOverride] = useState<string | undefined>();
  const [selectedUnitIdOverride, setSelectedUnitIdOverride] = useState<string | undefined>();
  const [followUpInput, setFollowUpInput] = useState<string>('');

  const [executionReport, setExecutionReport] = useState<VoiceExecutionReport | null>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);

  // Secondary toggles
  const [isEditingTranscript, setIsEditingTranscript] = useState(false);
  const [isEditingFields, setIsEditingFields] = useState(false);
  const [showManualInput, setShowManualInput] = useState(false);
  const [showFullResultDetails, setShowFullResultDetails] = useState(false);
  const [showAdvancedDiagnostics, setShowAdvancedDiagnostics] = useState(false);
  const [autoSpeakReport, setAutoSpeakReport] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Service & Lifecycle references
  const audioRecorderRef = useRef<AudioRecorder | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const unmountedRef = useRef<boolean>(false);
  const accumulatedBaseTranscriptRef = useRef<string>('');
  const livePreviewChunksRef = useRef<string[]>([]);

  // Initialize AudioRecorder instance
  useEffect(() => {
    unmountedRef.current = false;
    const recorder = new AudioRecorder({
      onStateChange: (recState: RecorderState) => {
        if (unmountedRef.current) return;
        if (recState === 'recording') {
          setPhase('recording');
        } else if (recState === 'stopping') {
          // Keep phase moving to transcribing
        } else if (recState === 'idle' && phase === 'recording') {
          setPhase('ready');
        }
      },
      onVolumeChange: (vol: number) => {
        if (!unmountedRef.current) setRecordingVolume(vol);
      },
      onDurationChange: (sec: number) => {
        if (!unmountedRef.current) setRecordingDuration(sec);
      },
      onError: (msg: string) => {
        if (!unmountedRef.current) {
          setPhase('ready');
          showToast(msg, 'error');
        }
      },
    });

    audioRecorderRef.current = recorder;

    return () => {
      unmountedRef.current = true;
      if (audioRecorderRef.current) {
        audioRecorderRef.current.cancel();
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.onend = null;
          recognitionRef.current.onerror = null;
          recognitionRef.current.onresult = null;
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
        recognitionRef.current = null;
      }
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

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

  // Dynamically build the 8-stage execution plan
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

  const handleAudioPlaybackToggle = () => {
    if (!audioResult?.audioUrl) return;

    if (!audioPlayerRef.current) {
      audioPlayerRef.current = new Audio(audioResult.audioUrl);
      audioPlayerRef.current.onended = () => setIsPlayingAudio(false);
      audioPlayerRef.current.onerror = () => setIsPlayingAudio(false);
    }

    if (isPlayingAudio) {
      audioPlayerRef.current.pause();
      setIsPlayingAudio(false);
    } else {
      audioPlayerRef.current.currentTime = 0;
      audioPlayerRef.current
        .play()
        .then(() => setIsPlayingAudio(true))
        .catch(() => setIsPlayingAudio(false));
    }
  };

  const resetCurrentCommand = () => {
    if (phase === 'recording') {
      audioRecorderRef.current?.cancel();
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current = null;
    }

    accumulatedBaseTranscriptRef.current = '';
    livePreviewChunksRef.current = [];
    setPhase('ready');
    setRecordingDuration(0);
    setRecordingVolume(0);
    setAudioResult(null);
    setIsPlayingAudio(false);
    setLiveInterimSpeech('');
    setTranscriptInput('');
    setTranscriptionSource('manual');
    setTranscriptionError(null);
    setExtractedState(null);
    setExecutionReport(null);
    setExecutionError(null);
    setIsEditingTranscript(false);
    setIsEditingFields(false);
    setShowFullResultDetails(false);
    setFollowUpInput('');
    setSelectedTaxpayerIdOverride(undefined);
    setSelectedPropertyIdOverride(undefined);
    setSelectedUnitIdOverride(undefined);
  };

  // Start live browser speech preview concurrently if supported
  const startLiveBrowserPreview = () => {
    const win = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const SpeechRec = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SpeechRec) return;

    try {
      const rec = new SpeechRec();
      rec.lang = dialect;
      rec.continuous = true;
      rec.interimResults = true;

      rec.onresult = (event: SpeechRecognitionEventLike) => {
        if (unmountedRef.current) return;
        let interim = '';
        const len = event.results.length;
        for (let i = 0; i < len; i++) {
          const res = event.results[i];
          const transcriptPiece = (res[0]?.transcript || '').trim();
          if (res.isFinal) {
            if (transcriptPiece && !livePreviewChunksRef.current.includes(transcriptPiece)) {
              livePreviewChunksRef.current.push(transcriptPiece);
            }
          } else if (transcriptPiece) {
            interim = transcriptPiece;
          }
        }
        setLiveInterimSpeech(interim);
      };

      rec.onerror = () => {
        // Silent error for optional live preview
      };

      rec.onend = () => {
        // Do not auto-restart; authoritative audio is in MediaRecorder
      };

      recognitionRef.current = rec;
      rec.start();
    } catch {
      // Live preview is optional
    }
  };

  const stopLiveBrowserPreview = (): string => {
    let combined = livePreviewChunksRef.current.join(' ').trim();
    if (liveInterimSpeech.trim()) {
      combined = [combined, liveInterimSpeech.trim()].filter(Boolean).join(' ');
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
    setLiveInterimSpeech('');
    return combined;
  };

  // Step 1 -> Step 2: Start Audio Recording
  const handleStartRecording = async () => {
    if (phase === 'recording' || phase === 'transcribing' || phase === 'analyzing') {
      return;
    }

    if (!AudioRecorder.isSupported()) {
      setShowManualInput(true);
      showToast('المتصفح لا يدعم تسجيل الصوت المباشر (MediaRecorder). يمكنك كتابة طلبك نصيًا.', 'warning');
      return;
    }

    setExecutionReport(null);
    setExecutionError(null);
    setTranscriptionError(null);
    livePreviewChunksRef.current = [];
    setLiveInterimSpeech('');

    if (!executionReport && transcriptInput.trim()) {
      accumulatedBaseTranscriptRef.current = transcriptInput.trim();
    } else {
      accumulatedBaseTranscriptRef.current = '';
      setTranscriptInput('');
      setExtractedState(null);
    }

    const started = await audioRecorderRef.current?.start();
    if (started) {
      startLiveBrowserPreview();
    }
  };

  // Step 2 -> Step 3 & 4: Stop Recording & Transcribe
  const handleStopRecording = async () => {
    if (phase !== 'recording') return;

    setPhase('transcribing');
    const livePreviewText = stopLiveBrowserPreview();
    const result = await audioRecorderRef.current?.stop();
    setAudioResult(result || null);

    if (!result) {
      // If recorder produced empty audio, fall back to live preview or manual
      if (livePreviewText) {
        setTranscriptionSource('browser_speech');
        await proceedWithTranscript(livePreviewText, 'browser_speech');
      } else {
        setPhase('ready');
      }
      return;
    }

    // Call server Gemini STT layer
    try {
      const serverStt = await transcribeAudioOnServer(
        result.base64Audio,
        result.mimeType,
        dialect
      );

      if (serverStt.success && serverStt.transcript.trim()) {
        setTranscriptionSource('server_gemini');
        setTranscriptionError(null);
        await proceedWithTranscript(serverStt.transcript.trim(), 'server_gemini');
      } else if (livePreviewText.trim()) {
        // Server failed or was offline, fallback seamlessly to browser live capture
        setTranscriptionSource('browser_speech');
        setTranscriptionError(serverStt.error || 'تم استخدام التعرف المحلي لعدم توفر خادم النسخ');
        await proceedWithTranscript(livePreviewText.trim(), 'browser_speech');
      } else {
        setTranscriptionSource('manual');
        setTranscriptionError(serverStt.error || 'لم يتم تمييز كلمات واضحة في التسجيل');
        setPhase('review');
        setIsEditingTranscript(true);
        showToast('لم نتمكن من تفريغ الصوت آلياً. يرجى كتابة طلبك أو إعادة التسجيل بصوت أوضح.', 'warning');
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (livePreviewText.trim()) {
        setTranscriptionSource('browser_speech');
        await proceedWithTranscript(livePreviewText.trim(), 'browser_speech');
      } else {
        setTranscriptionError(errMsg);
        setPhase('review');
        setIsEditingTranscript(true);
      }
    }
  };

  // Step 4 -> Step 5: Process Transcript & Run Understanding Layer
  const proceedWithTranscript = async (
    newText: string,
    source: 'server_gemini' | 'browser_speech' | 'manual'
  ) => {
    const base = accumulatedBaseTranscriptRef.current.trim();
    const cleanTurn = newText.trim();
    const fullTranscript =
      base && cleanTurn && !base.includes(cleanTurn)
        ? `${base} ، ${cleanTurn}`
        : cleanTurn || base;

    setTranscriptInput(fullTranscript);
    setTranscriptionSource(source);
    setIsEditingTranscript(false);

    await handleAnalyzeCommand(fullTranscript);
  };

  // Understanding Layer: Extract Intent, Entities & Plan
  const handleAnalyzeCommand = async (
    targetTranscript?: string,
    previousDraftForMerge?: VoiceExtractedPayload | null
  ) => {
    const textToAnalyze = (targetTranscript ?? transcriptInput).trim();
    if (!textToAnalyze) {
      showToast('يرجى التحدث أو إدخال النص أولًا', 'warning');
      setPhase('ready');
      return;
    }

    setPhase('analyzing');
    setExecutionReport(null);
    setExecutionError(null);

    // 1. Immediate deterministic extraction
    const deterministic = parseArabicVoiceCommandDeterministic(textToAnalyze);
    if (!previousDraftForMerge) {
      setExtractedState(deterministic);
    }

    // 2. Hybrid Gemini NLU enrichment
    try {
      const enriched = await analyzeVoiceTranscriptHybrid(
        textToAnalyze,
        workspaceSnapshot,
        previousDraftForMerge ?? extractedState
      );
      setExtractedState(enriched);
    } catch {
      // Keep deterministic result
    } finally {
      setPhase('review');
    }
  };

  const handleFollowUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!followUpInput.trim() || !extractedState) return;
    const answer = followUpInput.trim();
    setFollowUpInput('');

    const currentFull = transcriptInput.trim();
    const combined = `${currentFull} ، ${answer}`;
    setTranscriptInput(combined);
    accumulatedBaseTranscriptRef.current = combined;

    await handleAnalyzeCommand(combined, extractedState);
  };

  const updateExtractedField = <K extends keyof VoiceExtractedPayload>(
    key: K,
    value: VoiceExtractedPayload[K]
  ) => {
    setExtractedState((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  // Step 6: Explicit User Confirmation Gate before executing into Firestore
  const handleExecuteConfirmedPlan = useCallback(
    async (planToExecute?: VoiceEnginePlan) => {
      const activePlan = planToExecute || currentPlan;
      if (!activePlan || !activePlan.canExecute || isExecuting) return;

      setIsExecuting(true);
      setPhase('executing');
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
            amount: extracted.amount,
            currency: extracted.currency,
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

          const apptTitle = extracted.reminderTopic || `متابعة المكلف ${tpName}`;

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
          setPhase('executed');
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
        setPhase('review');
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

  // Build clean summary rows for the "فهمت طلبك" card
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
        rows.push({ label: 'المحلات التجارية (الفتحات)', value: String(extracted.shopsCount) });
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

  const formattedTimer = useMemo(() => {
    const mins = Math.floor(recordingDuration / 60);
    const secs = recordingDuration % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }, [recordingDuration]);

  return (
    <div className="max-w-lg mx-auto space-y-4 pb-12" dir="rtl">
      {/* 1. Primary Mobile Voice Assistant Card */}
      <div className="rounded-3xl bg-gradient-to-b from-[#0B192C] via-[#102542] to-[#0D3B66] text-white p-6 shadow-xl border border-sky-400/20">
        {/* Top Bar: Title + Sound Toggle + Manual Write */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-teal-400/20 border border-teal-300/30 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-teal-300" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold tracking-tight">المساعد الصوتي الميداني</h2>
              <span className="text-[11px] text-sky-200/80 block leading-none">
                تسجيل متصل عبر MediaRecorder + تفريغ عربي فوري
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowManualInput((v) => !v)}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                showManualInput
                  ? 'bg-white/20 border-white/30 text-white'
                  : 'bg-white/5 border-white/10 text-sky-200 hover:bg-white/10'
              }`}
            >
              كتابة
            </button>
            <button
              type="button"
              onClick={() => {
                if (isSpeaking) stopSpeaking();
                setAutoSpeakReport((v) => !v);
              }}
              title={autoSpeakReport ? 'إيقاف النطق' : 'تفعيل النطق'}
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

        {/* Center: Stage Status + Large Microphone Control */}
        <div className="py-5 flex flex-col items-center text-center">
          {/* Status Label */}
          <div className="inline-flex items-center gap-2 mb-4 px-3 py-1 rounded-full bg-white/10 border border-white/15">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                phase === 'recording'
                  ? 'bg-rose-400 animate-ping'
                  : phase === 'transcribing' || phase === 'analyzing'
                    ? 'bg-amber-400 animate-pulse'
                    : 'bg-teal-400'
              }`}
            />
            <span className="text-xs font-extrabold text-sky-100">
              {phase === 'recording'
                ? `جارٍ تسجيل كلامك (${formattedTimer})`
                : phase === 'transcribing'
                  ? 'جارٍ تحويل التسجيل إلى نص...'
                  : phase === 'analyzing'
                    ? 'جارٍ فهم وتحليل الأمر...'
                    : phase === 'review'
                      ? 'تم التقاط الأمر — جاهز للمراجعة'
                      : 'جاهز للتسجيل'}
            </span>
          </div>

          {/* Active Audio Visualizer Waves (while recording) */}
          {phase === 'recording' && (
            <div className="flex items-center justify-center gap-1.5 h-8 mb-4">
              {[0.4, 0.7, 1.0, 0.6, 0.85, 0.5, 0.9, 0.3].map((factor, i) => {
                const height = Math.max(6, Math.min(32, Math.round((recordingVolume * factor * 32) / 100)));
                return (
                  <span
                    key={i}
                    style={{ height: `${height}px` }}
                    className="w-1.5 rounded-full bg-gradient-to-t from-teal-400 to-rose-400 transition-all duration-75"
                  />
                );
              })}
            </div>
          )}

          {/* Main Microphone Button */}
          <button
            type="button"
            onClick={phase === 'recording' ? handleStopRecording : handleStartRecording}
            disabled={phase === 'transcribing' || phase === 'analyzing' || phase === 'executing'}
            aria-label={phase === 'recording' ? 'إيقاف التسجيل' : 'بدء التسجيل'}
            className={`w-24 h-24 rounded-full flex flex-col items-center justify-center transition-all shadow-xl cursor-pointer select-none disabled:opacity-50 ${
              phase === 'recording'
                ? 'bg-rose-500 hover:bg-rose-400 text-white ring-8 ring-rose-500/25 scale-105 animate-pulse'
                : phase === 'transcribing' || phase === 'analyzing'
                  ? 'bg-amber-500 text-white ring-8 ring-amber-500/20'
                  : 'bg-gradient-to-br from-teal-400 to-[#0284C7] hover:opacity-95 text-slate-950 ring-8 ring-teal-400/15'
            }`}
          >
            {phase === 'recording' ? (
              <MicOff className="w-9 h-9 stroke-[2.2]" />
            ) : phase === 'transcribing' || phase === 'analyzing' ? (
              <Loader2 className="w-9 h-9 animate-spin" />
            ) : (
              <Mic className="w-9 h-9 stroke-[2.2]" />
            )}
          </button>

          <p className="text-xs text-sky-200/80 mt-3 font-medium">
            {phase === 'recording'
              ? 'تحدث بأمرك كاملًا بدون استعجال... ثم اضغط لإيقاف التسجيل'
              : phase === 'transcribing'
                ? 'جارٍ معالجة الملف الصوتي بالكامل عبر الذكاء الاصطناعي...'
                : 'اضغط على الميكروفون وتحدث بأمرك الميداني'}
          </p>

          {/* Actions during/after recording */}
          <div className="flex items-center justify-center gap-2 mt-4">
            {phase === 'recording' && (
              <button
                type="button"
                onClick={handleStopRecording}
                className="px-4 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-extrabold flex items-center gap-1.5 shadow-md transition cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                إيقاف التسجيل وتحويل النص
              </button>
            )}

            {(phase === 'recording' || transcriptInput || audioResult) && (
              <button
                type="button"
                onClick={resetCurrentCommand}
                className="px-3 py-2 rounded-xl bg-white/10 hover:bg-rose-500/30 text-sky-100 hover:text-white text-xs font-bold flex items-center gap-1 border border-white/10 transition cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                {phase === 'recording' ? 'إلغاء' : 'بدء من جديد'}
              </button>
            )}
          </div>
        </div>

        {/* Live speech recognition preview while speaking */}
        {phase === 'recording' && liveInterimSpeech && (
          <div className="rounded-2xl bg-slate-950/40 border border-white/10 p-3 text-right">
            <span className="text-[11px] font-bold text-teal-300 ml-1.5">أستمع الآن:</span>
            <span className="text-xs text-slate-200 font-medium">{liveInterimSpeech}</span>
          </div>
        )}

        {/* Manual Text Input Accordion */}
        {showManualInput && (
          <div className="rounded-2xl bg-slate-950/60 border border-white/15 p-3.5 space-y-2.5 mt-3">
            <textarea
              rows={2}
              value={transcriptInput}
              onChange={(e) => setTranscriptInput(e.target.value)}
              placeholder="اكتب طلبك الميداني هنا... مثال: سجل عقار باسم كامل في شارع الثلاثين أربعة أدوار وخمس شقق"
              className="w-full rounded-xl bg-slate-900 border border-white/15 px-3 py-2 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:border-teal-400"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => void handleAnalyzeCommand()}
                disabled={!transcriptInput.trim() || phase === 'analyzing'}
                className="px-4 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-slate-950 font-extrabold text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                فهم وتحليل الطلب
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 2. Step 4: Full Transcribed Text & Audio Review Card */}
      {transcriptInput && !executionReport && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
            <div className="flex items-center gap-2">
              <FileAudio className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              <span className="text-xs font-extrabold text-slate-800 dark:text-slate-100">
                النص المفرغ من التسجيل
              </span>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  transcriptionSource === 'server_gemini'
                    ? 'bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300'
                    : transcriptionSource === 'browser_speech'
                      ? 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300'
                      : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {transcriptionSource === 'server_gemini'
                  ? 'نسخ ذكي عالي الدقة'
                  : transcriptionSource === 'browser_speech'
                    ? 'نسخ محلي'
                    : 'نص يدوي'}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              {audioResult?.audioUrl && (
                <button
                  type="button"
                  onClick={handleAudioPlaybackToggle}
                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1 cursor-pointer"
                  title={isPlayingAudio ? 'إيقاف الصوت' : 'استماع للتسجيل'}
                >
                  {isPlayingAudio ? <Pause className="w-3.5 h-3.5 text-rose-500" /> : <Play className="w-3.5 h-3.5 text-teal-600" />}
                  <span className="hidden sm:inline">{isPlayingAudio ? 'إيقاف' : 'استماع'}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsEditingTranscript((v) => !v)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1 cursor-pointer"
              >
                <Edit3 className="w-3 h-3" />
                {isEditingTranscript ? 'إلغاء' : 'تعديل النص'}
              </button>
            </div>
          </div>

          {transcriptionError && (
            <div className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 p-2 rounded-xl border border-amber-200 dark:border-amber-800">
              ملاحظة: {transcriptionError}
            </div>
          )}

          {isEditingTranscript ? (
            <div className="space-y-2">
              <textarea
                rows={3}
                value={transcriptInput}
                onChange={(e) => setTranscriptInput(e.target.value)}
                className="w-full rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 p-3 text-sm text-slate-900 dark:text-white font-bold leading-relaxed focus:outline-none focus:border-teal-500"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditingTranscript(false);
                    void handleAnalyzeCommand(transcriptInput);
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-extrabold flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  حفظ وإعادة التحليل
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm font-bold leading-relaxed text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-2xl border border-slate-100 dark:border-slate-800/80">
              «{transcriptInput}»
            </p>
          )}
        </div>
      )}

      {/* 3. Step 5 & 6: Extracted Plan, Structured Summary & Explicit Confirmation Gate */}
      {currentPlan && !executionReport && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <span className="text-xs font-extrabold text-teal-600 dark:text-teal-400">
                فهمت طلبك الميداني
              </span>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white mt-0.5">
                العملية: {SIMPLE_INTENT_NAMES[currentPlan.extracted.intent] || currentPlan.intentLabel}
              </h3>
            </div>

            {phase === 'analyzing' && (
              <span className="text-xs font-bold text-sky-600 dark:text-sky-400 flex items-center gap-1 animate-pulse">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                جارٍ التحليل...
              </span>
            )}
          </div>

          {currentPlan.extracted.selfCorrectionDetected && (
            <div className="p-3 rounded-2xl bg-teal-50/80 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800/70 text-xs text-teal-900 dark:text-teal-200 font-bold">
              {currentPlan.extracted.selfCorrectionNote || 'تم رصد وتطبيق استدراكك وتصحيحك أثناء الكلام تلقائيًا.'}
            </div>
          )}

          {/* Structured Field Values Table */}
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

          {/* Edit Extracted Fields Form */}
          {isEditingFields && (
            <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-4 space-y-3">
              <span className="text-xs font-extrabold text-slate-700 dark:text-slate-200 block mb-1">
                تعديل الحقول المستخرجة
              </span>

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
                        المحلات التجارية (الفتحات)
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
              </div>
            </div>
          )}

          {/* Clarification or Disambiguation */}
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
                    placeholder="اكتب الإجابة التكميلية هنا..."
                    className="flex-1 rounded-xl border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold text-slate-900 dark:text-white"
                  />
                  <button
                    type="submit"
                    disabled={!followUpInput.trim() || phase === 'analyzing'}
                    className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-extrabold flex items-center gap-1 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    إرسال
                  </button>
                </form>
              )}
            </div>
          )}

          {executionError && (
            <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-xs font-bold text-rose-800 dark:text-rose-200 leading-relaxed">
              تعذر التنفيذ: {executionError}
            </div>
          )}

          {/* Phase 6 Explicit Confirmation Gate: User Must Click to Write into Firestore */}
          <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsEditingFields((v) => !v)}
                className="px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs font-extrabold flex items-center gap-1.5 transition cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" />
                {isEditingFields ? 'إنهاء التعديل' : 'تعديل الحقول'}
              </button>

              <button
                type="button"
                onClick={resetCurrentCommand}
                className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-slate-600 dark:text-slate-300 hover:text-rose-600 text-xs font-extrabold transition cursor-pointer"
              >
                إلغاء
              </button>
            </div>

            {/* Crucial Explicit Confirmation Button */}
            <button
              type="button"
              disabled={!currentPlan.canExecute || isExecuting}
              onClick={() => void handleExecuteConfirmedPlan()}
              className="flex-1 sm:flex-initial justify-center px-6 py-2.5 rounded-2xl bg-gradient-to-l from-[#0284C7] to-[#0D9488] hover:opacity-95 disabled:opacity-40 text-white font-extrabold text-sm flex items-center gap-2 shadow-lg transition cursor-pointer"
            >
              {isExecuting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>جارٍ الحفظ في السجلات...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>تأكيد وتنفيذ العملية في السجلات</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* 4. Execution Complete Report Card */}
      {executionReport && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border-2 border-emerald-500/60 shadow-lg space-y-4">
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
              title="قراءة النتيجة"
              className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 shrink-0 cursor-pointer"
            >
              <Play className="w-4 h-4" />
            </button>
          </div>

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
                  عرض في ملف المكلف
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={resetCurrentCommand}
              className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              طلب صوتي جديد
            </button>
          </div>
        </div>
      )}

      {/* 5. Diagnostic Settings & Quick Samples Drawer */}
      <div className="pt-2">
        <button
          type="button"
          onClick={() => setShowAdvancedDiagnostics((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-2.5 rounded-2xl bg-slate-100/80 dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-800 text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <Settings2 className="w-4 h-4" />
            خيارات الميكروفون وتشخيص المحرك
          </span>
          {showAdvancedDiagnostics ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showAdvancedDiagnostics && (
          <div className="mt-3 space-y-4 bg-white dark:bg-slate-900 rounded-3xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
              <span className="text-xs font-extrabold text-slate-700 dark:text-slate-200">
                لهجة التفريغ الصوتي:
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDialect('ar-YE')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold border cursor-pointer ${
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
                  className={`px-3 py-1 rounded-lg text-xs font-bold border cursor-pointer ${
                    dialect === 'ar-SA'
                      ? 'bg-teal-500/15 border-teal-500 text-teal-800 dark:text-teal-300'
                      : 'border-slate-200 dark:border-slate-700 text-slate-500'
                  }`}
                >
                  العربية العامة (ar-SA)
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-extrabold text-slate-700 dark:text-slate-300">
                أوامر تجريبية سريعة:
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                {SAMPLE_VOICE_COMMANDS.map((sample, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setShowAdvancedDiagnostics(false);
                      setTranscriptInput(sample.command);
                      void handleAnalyzeCommand(sample.command);
                    }}
                    className="text-right p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-sky-500 bg-slate-50/70 dark:bg-slate-800/40 text-xs font-bold text-slate-700 dark:text-slate-200 transition cursor-pointer"
                  >
                    «{sample.command}»
                  </button>
                ))}
              </div>
            </div>

            {currentPlan && (
              <div className="space-y-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-1.5 text-xs font-extrabold text-slate-700 dark:text-slate-200">
                  <ShieldCheck className="w-4 h-4 text-teal-600" />
                  <span>مراحل معالجة الخطة والأمان</span>
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
