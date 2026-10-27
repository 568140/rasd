import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Users,
  User,
  Plus,
  Search,
  Phone,
  Mail,
  MapPin,
  Building2,
  Edit3,
  Trash2,
  ArrowRight,
  AlertTriangle,
  IdCard,
  Layers,
  Wallet,
  CalendarClock,
  ClipboardCheck,
  Mic,
  Compass,
  CheckCircle2,
  Clock,
  RotateCcw,
  FileSpreadsheet,
  UserCheck,
  Sparkles,
  History,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  FileText,
  Bell,
  SlidersHorizontal,
  X,
  CloudOff,
  Calendar,
} from 'lucide-react';
import { useRasd } from '../context/RasdContext';
import {
  Appointment,
  AssessmentStatus,
  DossierTabId,
  OccupancyStatus,
  Property,
  PropertyStatus,
  PropertyType,
  PropertyUnit,
  Taxpayer,
  TaxpayerStatus,
  TransactionType,
  UnitType,
  VisitPurpose,
  VisitStatus,
  RentPeriod,
  CURRENCY_LIST,
} from '../types/rasd';
import {
  parseTaxpayerNotesAndAgent,
  composeTaxpayerNotesWithAgent,
} from '../utils/taxpayerNotes';
import {
  UNIT_TYPE_LABELS,
  OCCUPANCY_STATUS_LABELS,
  OCCUPANCY_BADGE_STYLES,
  RENT_PERIOD_LABELS,
  getPropertyArchitecturalSummary,
  groupPropertyUnitsByFloor,
  getAvailableFloorOptions,
  getUnitRentDisplayInfo,
  computeUnitsRentalSummary,
  normalizeFloorLabel,
} from '../utils/propertyFloors';
import {
  MIN_REMINDER_MINUTES,
  MAX_REMINDER_MINUTES,
  validateReminderMinutesInput,
  formatTimeTo12Hour,
  getAdenTodayString,
  getAdenTimeString,
} from '../utils/dateUtils';
import { alertSound } from '../services/alertSound';

const STATUS_LABELS: Record<TaxpayerStatus, string> = {
  active: 'نشط',
  under_review: 'قيد المراجعة',
  archived: 'مؤرشف',
};

const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  residential: 'سكني',
  commercial: 'تجاري',
  industrial: 'صناعي',
  agricultural: 'زراعي',
  mixed: 'مختلط (سكني وتجاري)',
};

const PROPERTY_STATUS_LABELS: Record<PropertyStatus, string> = {
  active: 'نشط',
  under_inspection: 'قيد الفحص الميداني',
  disputed: 'محل اعتراض',
  exempt: 'معفى',
  archived: 'مؤرشف',
};

const OCCUPANCY_LABELS: Record<OccupancyStatus, string> = OCCUPANCY_STATUS_LABELS;

const VISIT_PURPOSE_LABELS: Record<VisitPurpose, string> = {
  initial_survey: 'حصر ومسح ميداني أولي',
  periodic_inspection: 'تفتيش دوري اعتيادي',
  valuation_verify: 'تحقق من التقييم العقاري',
  collection_followup: 'متابعة تحصيل مالي',
  dispute_check: 'فحص اعتراض مكلف',
};

const VISIT_STATUS_LABELS: Record<VisitStatus, string> = {
  planned: 'مخططة',
  in_progress: 'قيد التنفيذ',
  completed: 'مكتملة بنجاح',
  postponed: 'مؤجلة',
  impeded: 'تعثرت / تعذرت',
  cancelled: 'ملغاة',
  requires_followup: 'تتطلب متابعة لاحقة',
  occupant_absent: 'المكلف / الشاغل غير متواجد',
  access_denied: 'تعذر الوصول للعقار',
};

interface ExtractedAgentInfo {
  name: string;
  phone: string;
  sourceLabel: string;
}

function extractAgentsFromNotes(
  taxpayer: Taxpayer,
  properties: Property[]
): ExtractedAgentInfo[] {
  const list: ExtractedAgentInfo[] = [];
  const seen = new Set<string>();

  const parseNoteText = (text: string, sourceLabel: string) => {
    if (!text) return;
    const parsed = parseTaxpayerNotesAndAgent(text);
    if (parsed.agentName || parsed.agentPhone) {
      const name = (parsed.agentName || 'وكيل معتمد').trim();
      const phone = (parsed.agentPhone || '').trim();
      const key = `${name}:${phone}`;
      if (!seen.has(key)) {
        seen.add(key);
        list.push({ name, phone, sourceLabel });
      }
    }
  };

  parseNoteText(taxpayer.notes, 'ملف المكلف الرئيسي');
  for (const prop of properties) {
    parseNoteText(prop.notes, `عقار: ${prop.title}`);
  }
  return list;
}

function extractFloorsFromNotes(notes: string): number {
  if (!notes) return 0;
  const m = notes.match(/عدد الأدوار:\s*(\d+)/);
  return m?.[1] ? parseInt(m[1], 10) : 0;
}

export const TaxpayersScreen: React.FC = () => {
  const {
    taxpayers,
    properties,
    propertyUnits,
    fieldVisits,
    appointments,
    postponements,
    assessments,
    transactions,
    auditLogs,
    workspace,
    selectedTaxpayerId,
    setSelectedTaxpayerId,
    selectedPropertyId,
    setSelectedPropertyId,
    setPropertyNavigationOrigin,
    activeDossierTab: dossierTab,
    setActiveDossierTab: setDossierTab,
    setActiveScreen,
    addTaxpayer,
    updateTaxpayer,
    deleteTaxpayer,
    addProperty,
    updateProperty,
    deleteProperty,
    addPropertyUnit,
    updatePropertyUnit,
    deletePropertyUnit,
    executeCompoundVoiceCreation,
    addFieldVisit,
    addAppointment,
    postponeAppointment,
    updateAppointmentStatus,
    addFinancialAssessment,
    approveFinancialAssessment,
    cancelFinancialAssessment,
    addFinancialTransaction,
    approveFinancialTransaction,
    reverseFinancialTransaction,
    isOwner,
    canApproveFinancials,
    canDeleteRecords,
    showToast,
  } = useRasd();

  const defaultCurrency = workspace?.defaultCurrency || 'YER';
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Directory Mode State (Unified Taxpayers & Properties Directory)
  const [directoryViewMode, setDirectoryViewMode] = useState<'taxpayers' | 'properties'>('taxpayers');
  const [searchQuery, setSearchQuery] = useState('');
  const [regionFilter, setRegionFilter] = useState<string>('all');
  const [appointmentFilter, setAppointmentFilter] = useState<'all' | 'has_appointments' | 'overdue_or_due' | 'upcoming' | 'none'>('all');
  const [visitFilter, setVisitFilter] = useState<'all' | 'visited' | 'not_visited' | 'requires_followup'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [propertyTypeFilter, setPropertyTypeFilter] = useState<string>('all');
  const [showFiltersPanel, setShowFiltersPanel] = useState(false);

  // Taxpayer Appointments Bell Modal State
  const [bellModalTaxpayer, setBellModalTaxpayer] = useState<Taxpayer | null>(null);

  // Collapsible General Taxpayer Notes Section inside Dossier
  const [isTaxpayerNotesCollapsed, setIsTaxpayerNotesCollapsed] = useState(false);

  // If a property was selected from another screen, automatically resolve its owner taxpayer so the unified dossier opens
  useEffect(() => {
    if (selectedPropertyId && !selectedTaxpayerId) {
      const prop = properties.find((p) => p.id === selectedPropertyId);
      if (prop && prop.taxpayerId) {
        setSelectedTaxpayerId(prop.taxpayerId);
      }
    }
  }, [selectedPropertyId, selectedTaxpayerId, properties, setSelectedTaxpayerId]);

  const selectedTaxpayer = useMemo(
    () => taxpayers.find((t) => t.id === selectedTaxpayerId) || null,
    [taxpayers, selectedTaxpayerId]
  );

  // Taxpayer Create/Edit Modal State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTaxpayer, setEditingTaxpayer] = useState<Taxpayer | null>(null);
  const [fullName, setFullName] = useState('');
  const [internalCode, setInternalCode] = useState('');
  const [nationalOrCommercialId, setNationalOrCommercialId] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [region, setRegion] = useState('صنعاء');
  const [address, setAddress] = useState('');
  const [status, setStatus] = useState<TaxpayerStatus>('active');
  const [agentNameInput, setAgentNameInput] = useState('');
  const [agentPhoneInput, setAgentPhoneInput] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [ignoreDuplicateWarning, setIgnoreDuplicateWarning] = useState(false);

  // Quick Agent Update Modal State
  const [isAgentModalOpen, setIsAgentModalOpen] = useState(false);
  const [quickAgentName, setQuickAgentName] = useState('');
  const [quickAgentPhone, setQuickAgentPhone] = useState('');

  // In-Dossier Add/Edit Property Modal State (Pre-filled with selectedTaxpayer)
  const [isPropertyModalOpen, setIsPropertyModalOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [propTitle, setPropTitle] = useState('');
  const [propCode, setPropCode] = useState('');
  const [propType, setPropType] = useState<PropertyType>('mixed');
  const [propStatus, setPropStatus] = useState<PropertyStatus>('active');
  const [propRegion, setPropRegion] = useState('');
  const [propAddress, setPropAddress] = useState('');
  const [propAreaSqm, setPropAreaSqm] = useState('300');
  const [propFloorsCount, setPropFloorsCount] = useState('4');
  const [propHasBasement, setPropHasBasement] = useState(false);
  const [propApartmentsCount, setPropApartmentsCount] = useState('0');
  const [propShopsCount, setPropShopsCount] = useState('0');
  const [propOfficesCount, setPropOfficesCount] = useState('0');
  const [propAnnexesCount, setPropAnnexesCount] = useState('0');
  const [propNotes, setPropNotes] = useState('');

  // In-Dossier Add/Edit Unit Modal State
  const [unitModalProperty, setUnitModalProperty] = useState<Property | null>(null);
  const [editingUnit, setEditingUnit] = useState<PropertyUnit | null>(null);
  const [unitNumber, setUnitNumber] = useState('');
  const [unitType, setUnitType] = useState<UnitType>('apartment');
  const [unitFloor, setUnitFloor] = useState('الطابق الأرضي');
  const [unitArea, setUnitArea] = useState('85');
  const [unitOccupancy, setUnitOccupancy] = useState<OccupancyStatus>('occupied');
  const [unitTenantName, setUnitTenantName] = useState('');
  const [unitAnnualRent, setUnitAnnualRent] = useState('0');
  const [unitRentPeriod, setUnitRentPeriod] = useState<RentPeriod | 'legacy_unclassified'>('monthly');
  const [unitNotes, setUnitNotes] = useState('');

  // In-Dossier Record Collection Modal State
  const [isCollectionModalOpen, setIsCollectionModalOpen] = useState(false);
  const [collectionPropertyId, setCollectionPropertyId] = useState<string>('');
  const [collectionAssessmentId, setCollectionAssessmentId] = useState<string>('general_account');
  const [collectionTxType, setCollectionTxType] = useState<TransactionType>('payment');
  const [collectionAmount, setCollectionAmount] = useState('');
  const [collectionCurrency, setCollectionCurrency] = useState(defaultCurrency);
  const [collectionDate, setCollectionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [collectionRef, setCollectionRef] = useState('');
  const [collectionNotes, setCollectionNotes] = useState('');

  // In-Dossier Issue Assessment Modal State
  const [isAssessmentModalOpen, setIsAssessmentModalOpen] = useState(false);
  const [assessmentPropertyId, setAssessmentPropertyId] = useState<string>('');
  const [assessmentAmount, setAssessmentAmount] = useState('');
  const [assessmentPeriod, setAssessmentPeriod] = useState(`ربط مالي ${new Date().getFullYear()}`);
  const [assessmentDate, setAssessmentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [assessmentStatus, setAssessmentStatus] = useState<AssessmentStatus>('approved');
  const [assessmentNotes, setAssessmentNotes] = useState('');

  // In-Dossier Field Visit Modal State
  const [isVisitModalOpen, setIsVisitModalOpen] = useState(false);
  const [visitPropertyId, setVisitPropertyId] = useState<string>('');
  const [visitDate, setVisitDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [visitTime, setVisitTime] = useState(() => new Date().toTimeString().slice(0, 5));
  const [visitPurpose, setVisitPurpose] = useState<VisitPurpose>('periodic_inspection');
  const [visitStatus, setVisitStatus] = useState<VisitStatus>('completed');
  const [visitLat, setVisitLat] = useState('');
  const [visitLng, setVisitLng] = useState('');
  const [visitPhotoSummary, setVisitPhotoSummary] = useState('');
  const [visitNotes, setVisitNotes] = useState('');

  // In-Dossier Appointment / Reminder Modal State
  const [isAppointmentModalOpen, setIsAppointmentModalOpen] = useState(false);
  const [apptPropertyId, setApptPropertyId] = useState<string>('');
  const [apptTitle, setApptTitle] = useState('');
  const [apptDate, setApptDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [apptTime, setApptTime] = useState('10:00');
  const [apptReminderInput, setApptReminderInput] = useState<string>(() =>
    String(alertSound.getDefaultReminderMinutes())
  );
  const [apptReminderError, setApptReminderError] = useState<string | null>(null);
  const [apptLocation, setApptLocation] = useState('');
  const [apptNotes, setApptNotes] = useState('');

  // Postpone Appointment Modal State inside Dossier
  const [postponingAppt, setPostponingAppt] = useState<Appointment | null>(null);
  const [newPostponeDate, setNewPostponeDate] = useState('');
  const [newPostponeTime, setNewPostponeTime] = useState('10:00');
  const [postponeReason, setPostponeReason] = useState('');

  // Confirm Delete States
  const [confirmDeleteTpId, setConfirmDeleteTpId] = useState<string | null>(null);
  const [confirmDeletePropId, setConfirmDeletePropId] = useState<string | null>(null);
  const [confirmDeleteUnit, setConfirmDeleteUnit] = useState<PropertyUnit | null>(null);

  // Exact Blocking Duplicate Detection (رقم الملف internalCode أو رقم الهوية/المكلف nationalOrCommercialId)
  const exactDuplicateMatch = useMemo(() => {
    const codeClean = internalCode.trim().toLowerCase();
    const natClean = nationalOrCommercialId.trim().toLowerCase();

    if (!codeClean && !natClean) return null;

    for (const t of taxpayers) {
      if (editingTaxpayer && t.id === editingTaxpayer.id) continue;

      if (codeClean && (t.internalCode || '').trim().toLowerCase() === codeClean) {
        return {
          taxpayer: t,
          fieldLabel: 'رقم الملف (المعرف الداخلي)',
          duplicateValue: internalCode.trim(),
        };
      }

      if (natClean && (t.nationalOrCommercialId || '').trim().toLowerCase() === natClean) {
        return {
          taxpayer: t,
          fieldLabel: 'رقم المكلف / الهوية أو السجل التجاري',
          duplicateValue: nationalOrCommercialId.trim(),
        };
      }
    }
    return null;
  }, [taxpayers, editingTaxpayer, internalCode, nationalOrCommercialId]);

  // Advisory Name Similarity Detection (تشابه الاسم فقط دون تطابق رقم الملف أو الهوية)
  const similarTaxpayers = useMemo(() => {
    if (editingTaxpayer) return [];
    const nameClean = fullName.trim().toLowerCase();
    if (nameClean.length < 3) return [];

    return taxpayers.filter((t) => {
      if (exactDuplicateMatch && exactDuplicateMatch.taxpayer.id === t.id) return false;
      return t.fullName.toLowerCase().includes(nameClean);
    });
  }, [taxpayers, editingTaxpayer, fullName, exactDuplicateMatch]);

  // Available unique regions for filter pill
  const availableRegions = useMemo(() => {
    const set = new Set<string>();
    for (const t of taxpayers) {
      if (t.region && t.region.trim()) {
        set.add(t.region.trim());
      }
    }
    return Array.from(set);
  }, [taxpayers]);

  // Helper to get appointment status summary for a taxpayer
  const getTaxpayerAppointmentsStatus = useMemo(() => {
    const todayStr = getAdenTodayString();
    const nowTimeStr = getAdenTimeString();
    const [nowH, nowM] = (nowTimeStr || '00:00').split(':').map((n) => parseInt(n, 10) || 0);
    const nowMinutes = nowH * 60 + nowM;

    const map = new Map<
      string,
      {
        all: Appointment[];
        activeCount: number;
        overdueOrDueCount: number;
        upcomingCount: number;
        completedCount: number;
        badgeState: 'overdue_or_due' | 'upcoming' | 'completed' | 'none';
      }
    >();

    for (const tp of taxpayers) {
      const tpPropIds = new Set(properties.filter((p) => p.taxpayerId === tp.id).map((p) => p.id));
      const tpAppts = appointments
        .filter((a) => a.taxpayerId === tp.id || tpPropIds.has(a.propertyId))
        .sort((a, b) => `${a.scheduledDate} ${a.scheduledTime}`.localeCompare(`${b.scheduledDate} ${b.scheduledTime}`));

      let overdueOrDueCount = 0;
      let upcomingCount = 0;
      let completedCount = 0;

      for (const a of tpAppts) {
        if (a.status === 'completed') {
          completedCount += 1;
          continue;
        }
        if (a.status === 'cancelled') continue;

        if (a.scheduledDate < todayStr) {
          overdueOrDueCount += 1;
        } else if (a.scheduledDate === todayStr) {
          const [hh, mm] = (a.scheduledTime || '00:00').split(':').map((n) => parseInt(n, 10) || 0);
          if (hh * 60 + mm <= nowMinutes) {
            overdueOrDueCount += 1;
          } else {
            upcomingCount += 1;
          }
        } else {
          upcomingCount += 1;
        }
      }

      const activeCount = overdueOrDueCount + upcomingCount;
      let badgeState: 'overdue_or_due' | 'upcoming' | 'completed' | 'none' = 'none';
      if (overdueOrDueCount > 0) {
        badgeState = 'overdue_or_due';
      } else if (upcomingCount > 0) {
        badgeState = 'upcoming';
      } else if (completedCount > 0) {
        badgeState = 'completed';
      }

      map.set(tp.id, {
        all: tpAppts,
        activeCount,
        overdueOrDueCount,
        upcomingCount,
        completedCount,
        badgeState,
      });
    }

    return map;
  }, [taxpayers, properties, appointments]);

  const filteredTaxpayers = useMemo(() => {
    return taxpayers.filter((t) => {
      const q = searchQuery.trim().toLowerCase();
      const matchesQ =
        !q ||
        t.fullName.toLowerCase().includes(q) ||
        t.internalCode.toLowerCase().includes(q) ||
        t.nationalOrCommercialId.toLowerCase().includes(q) ||
        t.phone.includes(q) ||
        t.region.toLowerCase().includes(q) ||
        t.address.toLowerCase().includes(q) ||
        (t.notes || '').toLowerCase().includes(q);

      const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
      const matchesRegion = regionFilter === 'all' || (t.region || '').trim() === regionFilter;

      const apptSummary = getTaxpayerAppointmentsStatus.get(t.id);
      let matchesAppt = true;
      if (appointmentFilter === 'has_appointments') {
        matchesAppt = (apptSummary?.all.length || 0) > 0;
      } else if (appointmentFilter === 'overdue_or_due') {
        matchesAppt = (apptSummary?.overdueOrDueCount || 0) > 0;
      } else if (appointmentFilter === 'upcoming') {
        matchesAppt = (apptSummary?.upcomingCount || 0) > 0;
      } else if (appointmentFilter === 'none') {
        matchesAppt = (apptSummary?.activeCount || 0) === 0;
      }

      let matchesVisit = true;
      if (visitFilter !== 'all') {
        const tpPropIds = new Set(properties.filter((p) => p.taxpayerId === t.id).map((p) => p.id));
        const tpVisits = fieldVisits.filter((v) => v.taxpayerId === t.id || tpPropIds.has(v.propertyId));
        if (visitFilter === 'visited') {
          matchesVisit = tpVisits.some((v) => v.status === 'completed');
        } else if (visitFilter === 'not_visited') {
          matchesVisit = tpVisits.length === 0;
        } else if (visitFilter === 'requires_followup') {
          matchesVisit = tpVisits.some(
            (v) =>
              v.status === 'requires_followup' ||
              v.status === 'postponed' ||
              v.status === 'impeded' ||
              v.status === 'occupant_absent'
          );
        }
      }

      return matchesQ && matchesStatus && matchesRegion && matchesAppt && matchesVisit;
    });
  }, [
    taxpayers,
    searchQuery,
    statusFilter,
    regionFilter,
    appointmentFilter,
    visitFilter,
    getTaxpayerAppointmentsStatus,
    properties,
    fieldVisits,
  ]);

  const filteredProperties = useMemo(() => {
    return properties.filter((p) => {
      const q = searchQuery.trim().toLowerCase();
      const matchesQ =
        !q ||
        p.title.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q) ||
        p.taxpayerName.toLowerCase().includes(q) ||
        p.region.toLowerCase().includes(q) ||
        p.address.toLowerCase().includes(q);
      const matchesType = propertyTypeFilter === 'all' || p.propertyType === propertyTypeFilter;
      return matchesQ && matchesType;
    });
  }, [properties, searchQuery, propertyTypeFilter]);

  const getTaxpayerFinancialSummary = (tpId: string, propId?: string) => {
    const tpPropIds = new Set(
      properties.filter((p) => p.taxpayerId === tpId).map((p) => p.id)
    );
    const tpAssessments = assessments.filter(
      (a) =>
        (a.taxpayerId === tpId || tpPropIds.has(a.propertyId)) &&
        (!propId || a.propertyId === propId)
    );
    const tpTransactions = transactions.filter(
      (t) =>
        (t.taxpayerId === tpId || tpPropIds.has(t.propertyId)) &&
        (!propId || t.propertyId === propId)
    );

    const approvedAssessmentsTotal = tpAssessments
      .filter((a) => a.status === 'approved')
      .reduce((sum, a) => sum + (Number(a.amount) || 0), 0);

    const draftAssessmentsTotal = tpAssessments
      .filter((a) => a.status === 'draft')
      .reduce((sum, a) => sum + (Number(a.amount) || 0), 0);

    const approvedFeesAndAdjustments = tpTransactions
      .filter(
        (t) =>
          t.status === 'approved' &&
          (t.transactionType === 'fee' || t.transactionType === 'adjustment')
      )
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

    const approvedCollectionsTotal = tpTransactions
      .filter((t) => t.status === 'approved' && t.transactionType === 'payment')
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

    const pendingCollectionsTotal = tpTransactions
      .filter((t) => t.status === 'pending' && t.transactionType === 'payment')
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

    const totalApprovedObligations =
      approvedAssessmentsTotal + draftAssessmentsTotal + approvedFeesAndAdjustments;
    const netRemaining = Math.max(0, totalApprovedObligations - approvedCollectionsTotal);

    return {
      approvedAssessmentsTotal,
      draftAssessmentsTotal,
      approvedFeesAndAdjustments,
      totalApprovedObligations,
      approvedCollectionsTotal,
      pendingCollectionsTotal,
      netRemaining,
      assessmentsCount: tpAssessments.length,
      transactionsCount: tpTransactions.length,
    };
  };

  const openCreateForm = () => {
    setEditingTaxpayer(null);
    setFullName('');
    setInternalCode(`TP-${Math.floor(1000 + Math.random() * 9000)}`);
    setNationalOrCommercialId('');
    setPhone('');
    setEmail('');
    setRegion(workspace?.regionName || 'صنعاء');
    setAddress('');
    setStatus('active');
    setAgentNameInput('');
    setAgentPhoneInput('');
    setNotes('');
    setIgnoreDuplicateWarning(false);
    setIsFormOpen(true);
  };

  // Consume quick actions or search queries passed from Home Screen
  useEffect(() => {
    try {
      const quickSearch = sessionStorage.getItem('rasd_quick_search_q');
      if (quickSearch) {
        sessionStorage.removeItem('rasd_quick_search_q');
        setSelectedPropertyId(null);
        setSelectedTaxpayerId(null);
        setDirectoryViewMode('taxpayers');
        setSearchQuery(quickSearch);
      }

      const quickAction = sessionStorage.getItem('rasd_quick_action');
      if (quickAction === 'open_add_taxpayer') {
        sessionStorage.removeItem('rasd_quick_action');
        setSelectedPropertyId(null);
        setSelectedTaxpayerId(null);
        openCreateForm();
      } else if (quickAction === 'focus_search') {
        sessionStorage.removeItem('rasd_quick_action');
        setSelectedPropertyId(null);
        setSelectedTaxpayerId(null);
        setTimeout(() => {
          searchInputRef.current?.focus();
        }, 80);
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  const openEditForm = (tp: Taxpayer) => {
    setEditingTaxpayer(tp);
    setFullName(tp.fullName);
    setInternalCode(tp.internalCode);
    setNationalOrCommercialId(tp.nationalOrCommercialId);
    setPhone(tp.phone);
    setEmail(tp.email);
    setRegion(tp.region);
    setAddress(tp.address);
    setStatus(tp.status);
    const parsed = parseTaxpayerNotesAndAgent(tp.notes || '');
    setAgentNameInput(parsed.agentName);
    setAgentPhoneInput(parsed.agentPhone);
    setNotes(parsed.generalNotes);
    setIgnoreDuplicateWarning(true);
    setIsFormOpen(true);
  };

  const handleSaveTaxpayer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    // Strict blocking check for duplicate file code or national/commercial ID
    if (exactDuplicateMatch) {
      showToast(
        `لا يمكن الحفظ: ${exactDuplicateMatch.fieldLabel} (${exactDuplicateMatch.duplicateValue}) مسجل مسبقًا للمكلف «${exactDuplicateMatch.taxpayer.fullName}».`,
        'error'
      );
      return;
    }

    if (similarTaxpayers.length > 0 && !ignoreDuplicateWarning) {
      return;
    }

    setSubmitting(true);
    try {
      const composedNotes = composeTaxpayerNotesWithAgent(
        notes,
        agentNameInput,
        agentPhoneInput
      );

      if (editingTaxpayer) {
        await updateTaxpayer(editingTaxpayer.id, {
          fullName,
          internalCode,
          nationalOrCommercialId,
          phone,
          email,
          region,
          address,
          status,
          notes: composedNotes,
        });
      } else {
        const createdId = await addTaxpayer({
          fullName,
          internalCode,
          nationalOrCommercialId,
          phone,
          email,
          region,
          address,
          status,
          notes: composedNotes,
        });
        setSelectedTaxpayerId(createdId);
      }
      setIsFormOpen(false);
    } catch {
      // Keep form open with user's entered inputs intact if validation/save fails
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveAgentQuick = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTaxpayer || submitting) return;
    setSubmitting(true);
    try {
      const parsed = parseTaxpayerNotesAndAgent(selectedTaxpayer.notes || '');
      const updatedNotes = composeTaxpayerNotesWithAgent(
        parsed.generalNotes,
        quickAgentName.trim() || parsed.agentName,
        quickAgentPhone.trim() || parsed.agentPhone
      );
      await updateTaxpayer(selectedTaxpayer.id, {
        phone: quickAgentPhone.trim() || selectedTaxpayer.phone,
        notes: updatedNotes,
      });
      setIsAgentModalOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  const openPropertyDetailsFromDossier = (propertyId: string, tabOverride?: DossierTabId) => {
    if (!selectedTaxpayer) return;
    setPropertyNavigationOrigin({
      source: 'taxpayer_dossier',
      taxpayerId: selectedTaxpayer.id,
      dossierTab: tabOverride || dossierTab,
    });
    setSelectedPropertyId(propertyId);
    setActiveScreen('properties');
  };

  // Open Property Modal inside Dossier (Pre-filled with selectedTaxpayer)
  const openAddPropertyInDossier = () => {
    if (!selectedTaxpayer) return;
    setEditingProperty(null);
    setPropTitle(`عقار ${selectedTaxpayer.fullName}`);
    setPropCode(`PR-${Math.floor(1000 + Math.random() * 9000)}`);
    setPropType('mixed');
    setPropStatus('active');
    setPropRegion(selectedTaxpayer.region || workspace?.regionName || 'صنعاء');
    setPropAddress(selectedTaxpayer.address || '');
    setPropAreaSqm('300');
    setPropFloorsCount('4');
    setPropHasBasement(false);
    setPropApartmentsCount('0');
    setPropShopsCount('0');
    setPropOfficesCount('0');
    setPropAnnexesCount('0');
    setPropNotes('');
    setIsPropertyModalOpen(true);
  };

  const openEditPropertyInDossier = (prop: Property) => {
    const pUnits = propertyUnits.filter((u) => u.propertyId === prop.id);
    const arch = getPropertyArchitecturalSummary(prop, pUnits);
    setEditingProperty(prop);
    setPropTitle(prop.title);
    setPropCode(prop.code);
    setPropType(prop.propertyType);
    setPropStatus(prop.status);
    setPropRegion(prop.region);
    setPropAddress(prop.address);
    setPropAreaSqm(String(prop.areaSqm || 0));
    setPropFloorsCount(String(arch.floorsCount || 1));
    setPropHasBasement(arch.hasBasement);
    setPropApartmentsCount(String(arch.apartmentsCount || 0));
    setPropShopsCount(String(arch.shopsCount || 0));
    setPropOfficesCount(String(arch.officesCount || 0));
    setPropAnnexesCount(String(arch.annexesCount || 0));
    setPropNotes(prop.notes);
    setIsPropertyModalOpen(true);
  };

  const handleSavePropertyInDossier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTaxpayer || submitting) return;

    const floorsNum = Math.max(1, parseInt(propFloorsCount || '1', 10) || 1);
    const aptsNum = Math.max(0, parseInt(propApartmentsCount || '0', 10) || 0);
    const shopsNum = Math.max(0, parseInt(propShopsCount || '0', 10) || 0);
    const officesNum = Math.max(0, parseInt(propOfficesCount || '0', 10) || 0);
    const annexesNum = Math.max(0, parseInt(propAnnexesCount || '0', 10) || 0);

    setSubmitting(true);
    try {
      if (editingProperty) {
        await updateProperty(editingProperty.id, {
          title: propTitle,
          code: propCode,
          propertyType: propType,
          status: propStatus,
          region: propRegion,
          address: propAddress,
          areaSqm: parseFloat(propAreaSqm) || 0,
          floorsCount: floorsNum,
          hasBasement: propHasBasement,
          apartmentsCount: aptsNum,
          shopsCount: shopsNum,
          officesCount: officesNum,
          annexesCount: annexesNum,
          notes: propNotes,
        });
      } else if (aptsNum > 0 || shopsNum > 0 || officesNum > 0 || annexesNum > 0) {
        await executeCompoundVoiceCreation({
          existingTaxpayerId: selectedTaxpayer.id,
          taxpayerName: selectedTaxpayer.fullName,
          taxpayerPhone: selectedTaxpayer.phone,
          address: propAddress || selectedTaxpayer.address || 'غير محدد',
          region: propRegion || selectedTaxpayer.region || 'غير محدد',
          propertyTitle: propTitle || `عقار ${selectedTaxpayer.fullName}`,
          propertyType: propType,
          floorsCount: floorsNum,
          hasBasement: propHasBasement,
          apartmentsCount: aptsNum,
          shopsCount: shopsNum,
          officesCount: officesNum,
          annexesCount: annexesNum,
          notes: propNotes,
        });
      } else {
        await addProperty({
          taxpayerId: selectedTaxpayer.id,
          taxpayerName: selectedTaxpayer.fullName,
          title: propTitle || `عقار ${selectedTaxpayer.fullName}`,
          code: propCode,
          propertyType: propType,
          status: propStatus,
          region: propRegion || selectedTaxpayer.region || 'غير محدد',
          address: propAddress || selectedTaxpayer.address || 'غير محدد',
          areaSqm: parseFloat(propAreaSqm) || 0,
          unitsCount: 0,
          latitude: 0,
          longitude: 0,
          hasCoordinates: false,
          floorsCount: floorsNum,
          hasBasement: propHasBasement,
          apartmentsCount: 0,
          shopsCount: 0,
          officesCount: 0,
          annexesCount: 0,
          notes: propNotes,
        });
      }
      setIsPropertyModalOpen(false);
      setDossierTab('properties_and_units');
    } finally {
      setSubmitting(false);
    }
  };

  // Unit Add/Edit inside Dossier
  const openAddUnitModal = (prop: Property, defaultFloorLabel?: string) => {
    setUnitModalProperty(prop);
    setEditingUnit(null);
    const existingUnits = propertyUnits.filter((u) => u.propertyId === prop.id);
    setUnitNumber(`وحدة ${existingUnits.length + 1}`);
    setUnitType(defaultFloorLabel === 'السطح / الملاحق' ? 'annex' : 'apartment');
    setUnitFloor(defaultFloorLabel || 'الطابق الأرضي');
    setUnitArea('80');
    setUnitOccupancy('occupied');
    setUnitTenantName('');
    setUnitAnnualRent('0');
    setUnitRentPeriod('monthly');
    setUnitNotes('');
  };

  const openEditUnitModal = (prop: Property, unit: PropertyUnit) => {
    const rentInfo = getUnitRentDisplayInfo(unit);
    setUnitModalProperty(prop);
    setEditingUnit(unit);
    setUnitNumber(unit.unitNumber);
    setUnitType(unit.unitType);
    setUnitFloor(unit.floor || '');
    setUnitArea(String(unit.areaSqm || 0));
    setUnitOccupancy(unit.occupancyStatus);
    setUnitTenantName(unit.tenantName || '');
    setUnitAnnualRent(String(rentInfo.activeRentAmount || unit.annualRentEstimate || 0));
    setUnitRentPeriod(
      unit.rentPeriod
        ? unit.rentPeriod
        : rentInfo.isLegacyEstimateOnly
        ? 'legacy_unclassified'
        : 'monthly'
    );
    setUnitNotes(unit.notes || '');
  };

  const handleSaveUnitInDossier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unitModalProperty || !selectedTaxpayer || submitting) return;
    const isOccupied = unitOccupancy === 'occupied';
    const parsedRent = isOccupied ? Math.max(0, parseFloat(unitAnnualRent) || 0) : 0;

    if (
      isOccupied &&
      editingUnit &&
      !editingUnit.rentPeriod &&
      unitRentPeriod === 'legacy_unclassified' &&
      parsedRent !== Number(editingUnit.annualRentEstimate || 0)
    ) {
      showToast(
        'يرجى تحديد فترة الإيجار (شهري، ربع سنوي، نصف سنوي، سنوي) عند تعديل قيمة الإيجار.',
        'warning'
      );
      return;
    }

    const resolvedPeriod: RentPeriod | undefined = isOccupied
      ? unitRentPeriod === 'legacy_unclassified'
        ? undefined
        : unitRentPeriod
      : undefined;

    setSubmitting(true);
    try {
      if (editingUnit) {
        await updatePropertyUnit(editingUnit.id, {
          unitNumber,
          unitType,
          floor: unitFloor,
          areaSqm: parseFloat(unitArea) || 0,
          occupancyStatus: unitOccupancy,
          tenantName: isOccupied ? unitTenantName.trim() : '',
          rentAmount: parsedRent,
          rentPeriod: resolvedPeriod,
          annualRentEstimate: parsedRent,
          notes: unitNotes,
        });
      } else {
        await addPropertyUnit({
          propertyId: unitModalProperty.id,
          propertyTitle: unitModalProperty.title,
          taxpayerId: selectedTaxpayer.id,
          unitNumber,
          unitType,
          floor: unitFloor,
          areaSqm: parseFloat(unitArea) || 0,
          occupancyStatus: unitOccupancy,
          tenantName: isOccupied ? unitTenantName.trim() : '',
          rentAmount: parsedRent,
          rentPeriod: resolvedPeriod || 'monthly',
          annualRentEstimate: parsedRent,
          notes: unitNotes,
        });
      }
      setUnitModalProperty(null);
      setEditingUnit(null);
      setDossierTab('properties_and_units');
    } finally {
      setSubmitting(false);
    }
  };

  // Open Collection Modal inside Dossier
  const openCollectionModalInDossier = (preselectedPropId?: string) => {
    if (!selectedTaxpayer) return;
    const tpProps = properties.filter((p) => p.taxpayerId === selectedTaxpayer.id);
    const resolvedPropId =
      preselectedPropId ||
      (selectedPropertyId && tpProps.some((p) => p.id === selectedPropertyId)
        ? selectedPropertyId
        : tpProps[0]?.id || 'general_prop');
    setCollectionPropertyId(resolvedPropId);
    setCollectionAssessmentId('general_account');
    setCollectionTxType('payment');
    setCollectionAmount('');
    setCollectionCurrency(defaultCurrency);
    setCollectionDate(new Date().toISOString().slice(0, 10));
    setCollectionRef(`RCV-${Math.floor(10000 + Math.random() * 90000)}`);
    setCollectionNotes('');
    setIsCollectionModalOpen(true);
  };

  const handleSaveCollectionInDossier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTaxpayer || submitting) return;
    const amt = parseFloat(collectionAmount);
    if (isNaN(amt) || amt <= 0) {
      showToast('يرجى إدخال مبلغ مالي صحيح أكبر من صفر', 'warning');
      return;
    }

    const tpProps = properties.filter((p) => p.taxpayerId === selectedTaxpayer.id);
    const chosenProp = tpProps.find((p) => p.id === collectionPropertyId);

    setSubmitting(true);
    try {
      await addFinancialTransaction({
        propertyId: chosenProp?.id || 'general_prop',
        propertyTitle: chosenProp?.title || `حساب المكلف ${selectedTaxpayer.fullName}`,
        taxpayerId: selectedTaxpayer.id,
        taxpayerName: selectedTaxpayer.fullName,
        assessmentId: collectionAssessmentId || 'general_account',
        transactionType: collectionTxType,
        amount: amt,
        currency: collectionCurrency,
        transactionDate: collectionDate,
        referenceNumber: collectionRef || `RCV-${Date.now().toString().slice(-5)}`,
        status: canApproveFinancials ? 'approved' : 'pending',
        notes: collectionNotes,
      });
      setIsCollectionModalOpen(false);
      setDossierTab('financial_file');
    } finally {
      setSubmitting(false);
    }
  };

  // Open Assessment Modal inside Dossier
  const openAssessmentModalInDossier = (preselectedPropId?: string) => {
    if (!selectedTaxpayer) return;
    const tpProps = properties.filter((p) => p.taxpayerId === selectedTaxpayer.id);
    const resolvedPropId =
      preselectedPropId ||
      (selectedPropertyId && tpProps.some((p) => p.id === selectedPropertyId)
        ? selectedPropertyId
        : tpProps[0]?.id || 'general_prop');
    setAssessmentPropertyId(resolvedPropId);
    setAssessmentAmount('');
    setAssessmentPeriod(`ربط مالي سنوي ${new Date().getFullYear()}`);
    setAssessmentDate(new Date().toISOString().slice(0, 10));
    setAssessmentStatus(canApproveFinancials ? 'approved' : 'draft');
    setAssessmentNotes('');
    setIsAssessmentModalOpen(true);
  };

  const handleSaveAssessmentInDossier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTaxpayer || submitting) return;
    const amt = parseFloat(assessmentAmount);
    if (isNaN(amt) || amt <= 0) {
      showToast('يرجى إدخال قيمة التقييم المالي بشكل صحيح', 'warning');
      return;
    }
    const tpProps = properties.filter((p) => p.taxpayerId === selectedTaxpayer.id);
    const chosenProp = tpProps.find((p) => p.id === assessmentPropertyId);

    setSubmitting(true);
    try {
      await addFinancialAssessment({
        propertyId: chosenProp?.id || 'general_prop',
        propertyTitle: chosenProp?.title || `ملف المكلف ${selectedTaxpayer.fullName}`,
        taxpayerId: selectedTaxpayer.id,
        taxpayerName: selectedTaxpayer.fullName,
        amount: amt,
        currency: defaultCurrency,
        periodLabel: assessmentPeriod,
        assessmentDate,
        status: canApproveFinancials ? assessmentStatus : 'draft',
        notes: assessmentNotes,
      });
      setIsAssessmentModalOpen(false);
      setDossierTab('financial_file');
    } finally {
      setSubmitting(false);
    }
  };

  // Open Field Visit Modal inside Dossier
  const openVisitModalInDossier = (preselectedPropId?: string) => {
    if (!selectedTaxpayer) return;
    const tpProps = properties.filter((p) => p.taxpayerId === selectedTaxpayer.id);
    const resolvedPropId =
      preselectedPropId ||
      (selectedPropertyId && tpProps.some((p) => p.id === selectedPropertyId)
        ? selectedPropertyId
        : tpProps[0]?.id || 'general_prop');
    const chosenProp = tpProps.find((p) => p.id === resolvedPropId);
    setVisitPropertyId(resolvedPropId);
    setVisitDate(new Date().toISOString().slice(0, 10));
    setVisitTime(new Date().toTimeString().slice(0, 5));
    setVisitPurpose('periodic_inspection');
    setVisitStatus('completed');
    setVisitLat(chosenProp?.hasCoordinates ? String(chosenProp.latitude) : '');
    setVisitLng(chosenProp?.hasCoordinates ? String(chosenProp.longitude) : '');
    setVisitPhotoSummary('');
    setVisitNotes('');
    setIsVisitModalOpen(true);
  };

  const handleSaveVisitInDossier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTaxpayer || submitting) return;
    const tpProps = properties.filter((p) => p.taxpayerId === selectedTaxpayer.id);
    const chosenProp = tpProps.find((p) => p.id === visitPropertyId);
    const latNum = parseFloat(visitLat);
    const lngNum = parseFloat(visitLng);
    const hasCoords =
      !isNaN(latNum) &&
      !isNaN(lngNum) &&
      latNum >= -90 &&
      latNum <= 90 &&
      lngNum >= -180 &&
      lngNum <= 180 &&
      (latNum !== 0 || lngNum !== 0);

    setSubmitting(true);
    try {
      await addFieldVisit({
        propertyId: chosenProp?.id || 'general_prop',
        propertyTitle: chosenProp?.title || `ملف المكلف ${selectedTaxpayer.fullName}`,
        taxpayerId: selectedTaxpayer.id,
        taxpayerName: selectedTaxpayer.fullName,
        visitDate,
        visitTime,
        purpose: visitPurpose,
        status: visitStatus,
        latitude: hasCoords ? latNum : 0,
        longitude: hasCoords ? lngNum : 0,
        hasCoordinates: hasCoords,
        photoSummary: visitPhotoSummary || 'معاينة ميدانية موثقة',
        notes: visitNotes,
      });
      setIsVisitModalOpen(false);
      setDossierTab('visits_and_appointments');
    } finally {
      setSubmitting(false);
    }
  };

  // Open Appointment / Reminder Modal inside Dossier
  const openAppointmentModalInDossier = (preselectedPropId?: string) => {
    if (!selectedTaxpayer) return;
    const tpProps = properties.filter((p) => p.taxpayerId === selectedTaxpayer.id);
    const resolvedPropId =
      preselectedPropId ||
      (selectedPropertyId && tpProps.some((p) => p.id === selectedPropertyId)
        ? selectedPropertyId
        : tpProps[0]?.id || 'general_prop');
    const chosenProp = tpProps.find((p) => p.id === resolvedPropId);
    const fin = getTaxpayerFinancialSummary(selectedTaxpayer.id);

    setApptPropertyId(resolvedPropId);
    setApptTitle(
      fin.netRemaining > 0
        ? `متابعة تحصيل المتبقي (${fin.netRemaining.toLocaleString('en-US')} ${defaultCurrency}) — ${selectedTaxpayer.fullName}`
        : `موعد متابعة ميدانية — ${selectedTaxpayer.fullName}`
    );
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setApptDate(tomorrow.toISOString().slice(0, 10));
    setApptTime('10:00');
    setApptReminderInput(String(alertSound.getDefaultReminderMinutes()));
    setApptReminderError(null);
    setApptLocation(chosenProp?.address || selectedTaxpayer.address || '');
    setApptNotes('');
    setIsAppointmentModalOpen(true);
  };

  const handleSaveAppointmentInDossier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTaxpayer || submitting) return;

    const remCheck = validateReminderMinutesInput(apptReminderInput);
    if (!remCheck.isValid) {
      setApptReminderError(remCheck.error || 'يرجى إدخال عدد دقائق صحيح موجب.');
      showToast(remCheck.error || 'يرجى التحقق من حقل وقت التنبيه قبل الموعد.', 'warning');
      return;
    }

    alertSound.setDefaultReminderMinutes(remCheck.minutes);

    const tpProps = properties.filter((p) => p.taxpayerId === selectedTaxpayer.id);
    const chosenProp = tpProps.find((p) => p.id === apptPropertyId);

    setSubmitting(true);
    try {
      await addAppointment({
        title: apptTitle || `متابعة المكلف ${selectedTaxpayer.fullName}`,
        propertyId: chosenProp?.id || 'general_prop',
        propertyTitle: chosenProp?.title || `ملف المكلف ${selectedTaxpayer.fullName}`,
        taxpayerId: selectedTaxpayer.id,
        taxpayerName: selectedTaxpayer.fullName,
        scheduledDate: apptDate,
        scheduledTime: apptTime,
        reminderMinutesBefore: remCheck.minutes,
        locationText: apptLocation || chosenProp?.address || selectedTaxpayer.address || 'غير محدد',
        status: 'upcoming',
        notes: apptNotes,
      });
      setIsAppointmentModalOpen(false);
      setDossierTab('visits_and_appointments');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePostponeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!postponingAppt || !newPostponeDate || !postponeReason.trim() || submitting) return;
    setSubmitting(true);
    try {
      await postponeAppointment(postponingAppt, newPostponeDate, newPostponeTime, postponeReason);
      setPostponingAppt(null);
      setPostponeReason('');
    } finally {
      setSubmitting(false);
    }
  };

  // ============================================================================
  // UNIFIED TAXPAYER DOSSIER VIEW (ملف المكلف الموحد والمتكامل)
  // ============================================================================
  if (selectedTaxpayer) {
    const tpProps = properties.filter((p) => p.taxpayerId === selectedTaxpayer.id);
    const tpPropIds = new Set(tpProps.map((p) => p.id));
    const tpUnits = propertyUnits.filter(
      (u) => u.taxpayerId === selectedTaxpayer.id || tpPropIds.has(u.propertyId)
    );
    const tpVisits = fieldVisits
      .filter((v) => v.taxpayerId === selectedTaxpayer.id || tpPropIds.has(v.propertyId))
      .sort((a, b) => b.visitDate.localeCompare(a.visitDate));
    const tpAppts = appointments
      .filter((a) => a.taxpayerId === selectedTaxpayer.id || tpPropIds.has(a.propertyId))
      .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
    const tpApptIds = new Set(tpAppts.map((a) => a.id));
    const tpPostponements = postponements.filter((p) => tpApptIds.has(p.appointmentId));
    const tpAssessments = assessments.filter(
      (a) => a.taxpayerId === selectedTaxpayer.id || tpPropIds.has(a.propertyId)
    );
    const tpTransactions = transactions.filter(
      (t) => t.taxpayerId === selectedTaxpayer.id || tpPropIds.has(t.propertyId)
    );
    const tpFinSummary = getTaxpayerFinancialSummary(selectedTaxpayer.id);
    const extractedAgents = extractAgentsFromNotes(selectedTaxpayer, tpProps);
    const parsedTaxpayerNotes = parseTaxpayerNotesAndAgent(selectedTaxpayer.notes || '');

    // Build chronological activity timeline for this taxpayer & their properties
    const relatedEntityIds = new Set<string>([
      selectedTaxpayer.id,
      ...tpProps.map((p) => p.id),
      ...tpUnits.map((u) => u.id),
      ...tpVisits.map((v) => v.id),
      ...tpAppts.map((a) => a.id),
      ...tpAssessments.map((a) => a.id),
      ...tpTransactions.map((t) => t.id),
    ]);

    const taxpayerAuditTimeline = auditLogs.filter(
      (log) =>
        relatedEntityIds.has(log.entityId) ||
        log.summary.includes(selectedTaxpayer.fullName) ||
        log.summary.includes(selectedTaxpayer.internalCode)
    );

    const totalApartments = tpUnits.filter((u) => u.unitType === 'apartment').length;
    const totalCommercialShops = tpUnits.filter((u) => u.unitType === 'shop').length;
    const totalOffices = tpUnits.filter((u) => u.unitType === 'office').length;

    return (
      <div className="space-y-4 pb-8 max-w-2xl mx-auto">
        {/* Top Navigation & Dossier Management Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              setSelectedPropertyId(null);
              setSelectedTaxpayerId(null);
            }}
            className="min-h-[40px] px-3.5 rounded-xl bg-white dark:bg-[#0D1829] border border-[#E2E8F0] dark:border-slate-800 text-xs font-bold text-[#0B192C] dark:text-slate-200 flex items-center gap-1.5 shadow-2xs cursor-pointer"
          >
            <ArrowRight className="w-4 h-4 text-[#0B192C] dark:text-slate-200" />
            <span>قائمة المكلفين</span>
          </button>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveScreen('voice')}
              className="min-h-[40px] px-3 rounded-xl bg-white hover:bg-slate-50 dark:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700 text-xs font-bold text-[#0B192C] dark:text-slate-200 flex items-center gap-1.5 cursor-pointer"
            >
              <Mic className="w-3.5 h-3.5 text-[#B48327]" />
              <span>أمر صوتي</span>
            </button>
            <button
              type="button"
              onClick={() => openEditForm(selectedTaxpayer)}
              className="min-h-[40px] px-3.5 rounded-xl bg-[#0B192C] hover:bg-[#132A46] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5 text-[#B48327]" />
              <span>تعديل</span>
            </button>
            {(isOwner || canDeleteRecords) && (
              <button
                type="button"
                onClick={() => setConfirmDeleteTpId(selectedTaxpayer.id)}
                className="min-h-[40px] px-3 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 text-xs font-bold text-rose-700 dark:text-rose-300 flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>حذف</span>
              </button>
            )}
          </div>
        </div>

        {/* 1. Reference-Aligned Taxpayer Details Card (بطاقة تفاصيل المكلف وفق المرجع البصري) */}
        <div className="rounded-2xl bg-white dark:bg-[#0D1829] border border-[#E2E8F0] dark:border-slate-800 p-4 sm:p-5 shadow-2xs">
          <div className="flex items-start justify-between gap-3">
            {/* Right side: Avatar + Name + File Code + ID */}
            <div className="flex items-start gap-3.5 min-w-0">
              <div className="w-12 h-12 rounded-full bg-[#F4F6F9] dark:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700 flex items-center justify-center shrink-0 text-[#0B192C] dark:text-white">
                <User className="w-6 h-6 stroke-[1.8]" />
              </div>
              <div className="min-w-0">
                <h1 className="text-base sm:text-lg font-extrabold text-[#172334] dark:text-white font-display leading-snug">
                  {selectedTaxpayer.fullName}
                </h1>
                <div className="text-xs text-[#64748B] dark:text-slate-400 mt-1 space-y-0.5">
                  <div>
                    الملف:{' '}
                    <span className="font-mono font-bold text-[#172334] dark:text-slate-200">
                      {selectedTaxpayer.internalCode}
                    </span>
                  </div>
                  <div>
                    الهوية:{' '}
                    <span className="font-mono font-bold text-[#172334] dark:text-slate-200">
                      {selectedTaxpayer.nationalOrCommercialId || 'غير مسجل'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Left side: Active Status Badge */}
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                  selectedTaxpayer.status === 'active'
                    ? 'bg-[#ECFDF5] text-[#059669] border border-[#A7F3D0]/60'
                    : selectedTaxpayer.status === 'under_review'
                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                    : 'bg-slate-100 text-slate-600 border border-slate-200'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    selectedTaxpayer.status === 'active'
                      ? 'bg-[#10B981]'
                      : selectedTaxpayer.status === 'under_review'
                      ? 'bg-amber-500'
                      : 'bg-slate-400'
                  }`}
                />
                {STATUS_LABELS[selectedTaxpayer.status]}
              </span>
              {selectedTaxpayer.isPendingSync && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 text-[10px] font-bold">
                  <CloudOff className="w-3 h-3" />
                  محلي بانتظار المزامنة
                </span>
              )}
            </div>
          </div>

          {/* Contact & Agent Rows matching Screen 3 of the Reference Image */}
          <div className="mt-4 pt-3.5 border-t border-[#E2E8F0] dark:border-slate-800 space-y-2 text-xs text-[#172334] dark:text-slate-200">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-[#0B192C] dark:text-slate-300 shrink-0" />
                <span className="font-mono font-bold" dir="ltr">
                  {selectedTaxpayer.phone || 'لا يوجد رقم هاتف'}
                </span>
              </div>
              {selectedTaxpayer.phone && (
                <a
                  href={`tel:${selectedTaxpayer.phone}`}
                  className="px-2.5 py-1 rounded-lg bg-[#F4F6F9] hover:bg-slate-200/70 dark:bg-slate-800 text-[11px] font-bold text-[#0B192C] dark:text-white inline-flex items-center gap-1"
                >
                  <Phone className="w-3 h-3 text-[#B48327]" />
                  اتصال
                </a>
              )}
            </div>

            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[#0B192C] dark:text-slate-300 shrink-0" />
              <span className="font-semibold text-[#172334] dark:text-slate-200">
                {selectedTaxpayer.region || 'صنعاء'}
                {selectedTaxpayer.address ? ` - ${selectedTaxpayer.address}` : ''}
              </span>
            </div>

            <div className="flex items-center justify-between gap-2 pt-0.5">
              <div className="flex items-center gap-2 min-w-0">
                <UserCheck className="w-4 h-4 text-[#0B192C] dark:text-slate-300 shrink-0" />
                {extractedAgents.length === 0 ? (
                  <span className="text-[#64748B]">الوكيل: غير مسجل</span>
                ) : (
                  <span className="font-semibold truncate">
                    الوكيل: {extractedAgents[0].name}
                    {extractedAgents[0].phone ? ` - ${extractedAgents[0].phone}` : ''}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setQuickAgentName(extractedAgents[0]?.name || '');
                  setQuickAgentPhone(extractedAgents[0]?.phone || selectedTaxpayer.phone || '');
                  setIsAgentModalOpen(true);
                }}
                className="text-[11px] font-bold text-[#B48327] hover:underline shrink-0 cursor-pointer"
              >
                {extractedAgents.length > 0 ? 'تعديل الوكيل' : '+ إضافة وكيل'}
              </button>
            </div>
          </div>
        </div>

        {/* 1B. Collapsible General Taxpayer Notes Card (قسم ملاحظات المكلف العامة القابل للطي) */}
        <div className="rounded-2xl bg-white dark:bg-[#0D1829] border border-[#E2E8F0] dark:border-slate-800 p-4 shadow-2xs">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setIsTaxpayerNotesCollapsed((prev) => !prev)}
              className="flex items-center gap-2 text-right flex-1 cursor-pointer"
            >
              <div className="w-8 h-8 rounded-xl bg-[#F4F6F9] dark:bg-slate-800 flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4 text-[#B48327]" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-extrabold text-[#0B192C] dark:text-white font-display">
                    ملاحظات المكلف العامة
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      parsedTaxpayerNotes.generalNotes
                        ? 'bg-amber-50 text-[#B48327] border border-amber-200/70 dark:bg-amber-950/40 dark:border-amber-800'
                        : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                    }`}
                  >
                    {parsedTaxpayerNotes.generalNotes ? 'مسجلة' : 'لا توجد ملاحظات'}
                  </span>
                </div>
              </div>
              {isTaxpayerNotesCollapsed ? (
                <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
              ) : (
                <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
              )}
            </button>

            <button
              type="button"
              onClick={() => openEditForm(selectedTaxpayer)}
              className="px-2.5 py-1.5 rounded-xl bg-[#F4F6F9] hover:bg-slate-200/70 dark:bg-slate-800 text-[11px] font-bold text-[#0B192C] dark:text-white flex items-center gap-1 shrink-0 cursor-pointer"
            >
              <Edit3 className="w-3 h-3 text-[#B48327]" />
              <span>{parsedTaxpayerNotes.generalNotes ? 'تعديل الملاحظات' : '+ إضافة ملاحظة'}</span>
            </button>
          </div>

          {!isTaxpayerNotesCollapsed && (
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              {parsedTaxpayerNotes.generalNotes ? (
                <p className="text-xs text-[#172334] dark:text-slate-200 whitespace-pre-line leading-relaxed bg-[#F4F6F9]/70 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-200/60 dark:border-slate-800">
                  {parsedTaxpayerNotes.generalNotes}
                </p>
              ) : (
                <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 bg-[#F4F6F9]/50 dark:bg-slate-900/40 px-3 py-2.5 rounded-xl">
                  <span>لا توجد ملاحظات عامة مسجلة في ملف هذا المكلف حتى الآن.</span>
                  <button
                    type="button"
                    onClick={() => openEditForm(selectedTaxpayer)}
                    className="text-[11px] font-bold text-[#B48327] hover:underline shrink-0 cursor-pointer"
                  >
                    إضافة ملاحظة الآن
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 2. Comprehensive Financial Summary Strip (الملف المالي الإجمالي للمكلف) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-white dark:bg-[#0D1829] border border-slate-200/90 dark:border-slate-800 rounded-3xl p-4 shadow-2xs">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span className="font-bold">إجمالي الالتزامات المعتمدة</span>
              <FileSpreadsheet className="w-4 h-4 text-[#0284C7]" />
            </div>
            <div className="text-xl font-extrabold text-[#0B192C] dark:text-white font-mono mt-1.5">
              {tpFinSummary.totalApprovedObligations.toLocaleString('en-US')}{' '}
              <span className="text-xs font-sans font-bold text-slate-500">{defaultCurrency}</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              يشمل ({tpAssessments.length}) تقييمات ورسوم مسجلة على عقارات المكلف
            </div>
          </div>

          <div className="bg-white dark:bg-[#0D1829] border border-slate-200/90 dark:border-slate-800 rounded-3xl p-4 shadow-2xs">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span className="font-bold">إجمالي التحصيلات المعتمدة</span>
              <CheckCircle2 className="w-4 h-4 text-[#0D9488]" />
            </div>
            <div className="text-xl font-extrabold text-[#0D9488] dark:text-teal-400 font-mono mt-1.5">
              {tpFinSummary.approvedCollectionsTotal.toLocaleString('en-US')}{' '}
              <span className="text-xs font-sans font-bold">{defaultCurrency}</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              {tpFinSummary.pendingCollectionsTotal > 0
                ? `يوجد (${tpFinSummary.pendingCollectionsTotal.toLocaleString('en-US')}) بانتظار الاعتماد`
                : `مجموع المدفوعات المسددة فعليًا (${tpTransactions.filter((t) => t.transactionType === 'payment').length} سند)`}
            </div>
          </div>

          <div className="bg-gradient-to-br from-[#0B192C] to-[#102A46] text-white border border-sky-500/30 rounded-3xl p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs text-sky-200">
              <span className="font-bold">المتبقي الصافي على المكلف</span>
              <Wallet className="w-4 h-4 text-teal-300" />
            </div>
            <div className="text-xl font-extrabold text-amber-300 font-mono mt-1.5">
              {tpFinSummary.netRemaining.toLocaleString('en-US')}{' '}
              <span className="text-xs font-sans font-bold text-sky-200">{defaultCurrency}</span>
            </div>
            <div className="text-[11px] text-sky-200/80 mt-1">
              بعد احتساب جميع المدفوعات والتسويات المعتمدة
            </div>
          </div>
        </div>

        {/* 3. Direct Pre-filled Field Operations Bar (تنفيذ العمليات مباشرة من داخل ملف المكلف) */}
        <div className="bg-white dark:bg-[#0D1829] border border-slate-200/90 dark:border-slate-800 rounded-3xl p-4 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-extrabold text-[#0B192C] dark:text-white flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-[#0D9488]" />
              تنفيذ العمليات الميدانية المباشرة (مربوطة تلقائيًا بمعرّف المكلف «{selectedTaxpayer.internalCode}»):
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            <button
              type="button"
              onClick={openAddPropertyInDossier}
              className="min-h-[44px] px-3 py-2 rounded-2xl bg-[#0B192C] hover:bg-[#132A46] text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer transition"
            >
              <Building2 className="w-4 h-4 text-teal-300 shrink-0" />
              <span>+ إضافة عقار / وحدات</span>
            </button>

            <button
              type="button"
              onClick={() => openCollectionModalInDossier()}
              className="min-h-[44px] px-3 py-2 rounded-2xl bg-[#0D9488] hover:bg-teal-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer transition"
            >
              <Wallet className="w-4 h-4 shrink-0" />
              <span>+ تسجيل تحصيل مالي</span>
            </button>

            <button
              type="button"
              onClick={() => openVisitModalInDossier()}
              className="min-h-[44px] px-3 py-2 rounded-2xl bg-[#0284C7] hover:bg-sky-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer transition"
            >
              <ClipboardCheck className="w-4 h-4 shrink-0" />
              <span>+ تسجيل زيارة ميدانية</span>
            </button>

            <button
              type="button"
              onClick={() => openAppointmentModalInDossier()}
              className="min-h-[44px] px-3 py-2 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer transition"
            >
              <CalendarClock className="w-4 h-4 shrink-0" />
              <span>+ جدولة موعد / تذكير</span>
            </button>

            <button
              type="button"
              onClick={() => openAssessmentModalInDossier()}
              className="min-h-[44px] px-3 py-2 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-[#0B192C] dark:text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition col-span-2 sm:col-span-1"
            >
              <FileSpreadsheet className="w-4 h-4 text-[#0284C7] shrink-0" />
              <span>+ إصدار تقييم مالي</span>
            </button>
          </div>
        </div>

        {/* 4. Sticky Dossier Section Navigation Tabs with Smooth Touch Scroll & Glass UI */}
        <div className="sticky-below-header flex gap-2 p-2 rounded-2xl border border-slate-200/90 dark:border-slate-800 rasd-glass-sticky rasd-scroll-x">
          <button
            type="button"
            onClick={() => setDossierTab('properties_and_units')}
            className={`px-3.5 sm:px-4 py-2.5 rounded-xl text-xs font-extrabold whitespace-nowrap flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
              dossierTab === 'properties_and_units'
                ? 'bg-[#0B192C] text-white dark:bg-[#0D9488]'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Building2 className="w-4 h-4 shrink-0" />
            <span>العقارات والوحدات التابعة ({tpProps.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setDossierTab('financial_file')}
            className={`px-3.5 sm:px-4 py-2.5 rounded-xl text-xs font-extrabold whitespace-nowrap flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
              dossierTab === 'financial_file'
                ? 'bg-[#0B192C] text-white dark:bg-[#0D9488]'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Wallet className="w-4 h-4 shrink-0" />
            <span>الملف المالي وتفاصيل العقارات ({tpAssessments.length + tpTransactions.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setDossierTab('visits_and_appointments')}
            className={`px-3.5 sm:px-4 py-2.5 rounded-xl text-xs font-extrabold whitespace-nowrap flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
              dossierTab === 'visits_and_appointments'
                ? 'bg-[#0B192C] text-white dark:bg-[#0D9488]'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <CalendarClock className="w-4 h-4 shrink-0" />
            <span>الزيارات والمواعيد والتأجيلات ({tpVisits.length + tpAppts.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setDossierTab('activity_timeline')}
            className={`px-3.5 sm:px-4 py-2.5 rounded-xl text-xs font-extrabold whitespace-nowrap flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
              dossierTab === 'activity_timeline'
                ? 'bg-[#0B192C] text-white dark:bg-[#0D9488]'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <History className="w-4 h-4 shrink-0" />
            <span>السجل الزمني للعمليات ({taxpayerAuditTimeline.length})</span>
          </button>
        </div>

        {/* ====================================================================
            TAB 1: PROPERTIES & UNITS (العقارات والوحدات وتفاصيل كل عقار)
           ==================================================================== */}
        {dossierTab === 'properties_and_units' && (
          <div className="space-y-4">
            {tpProps.length === 0 ? (
              <div className="bg-white dark:bg-[#0D1829] border border-slate-200/90 dark:border-slate-800 rounded-3xl p-8 text-center shadow-2xs">
                <Building2 className="w-10 h-10 text-slate-400 mx-auto mb-2.5" />
                <h3 className="text-base font-bold text-[#0B192C] dark:text-white font-display">
                  لا توجد عقارات مسجلة لهذا المكلف بعد
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-4">
                  أضف أول عقار وحدد عدد الأدوار والشقق والفتحات التجارية ليتم ربطها تلقائيًا بملف المكلف.
                </p>
                <button
                  type="button"
                  onClick={openAddPropertyInDossier}
                  className="min-h-[44px] px-5 rounded-2xl bg-[#0D9488] text-white text-xs font-bold inline-flex items-center gap-2 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>إضافة عقار ووحدات الآن</span>
                </button>
              </div>
            ) : (
              tpProps.map((prop) => {
                const units = tpUnits.filter((u) => u.propertyId === prop.id);
                const arch = getPropertyArchitecturalSummary(prop, units);
                const floorGroups = groupPropertyUnitsByFloor(prop, units);
                const rentalSummary = computeUnitsRentalSummary(units);
                const propFin = getTaxpayerFinancialSummary(selectedTaxpayer.id, prop.id);
                const isFocusedProperty = selectedPropertyId === prop.id;
                const currencyLabel = defaultCurrency === 'SAR' ? 'ر.س' : 'ر.ي';

                return (
                  <div
                    key={prop.id}
                    onClick={() => openPropertyDetailsFromDossier(prop.id, 'properties_and_units')}
                    className={`bg-white dark:bg-[#0D1829] border rounded-3xl p-5 shadow-2xs transition cursor-pointer hover:border-[#0B192C]/60 dark:hover:border-[#B48327]/70 ${
                      isFocusedProperty
                        ? 'border-2 border-[#0B192C] dark:border-[#B48327]'
                        : 'border-slate-200/90 dark:border-slate-800'
                    }`}
                  >
                    {/* Property Header */}
                    <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mb-1">
                          <span className="font-mono font-bold text-[#0B192C] dark:text-sky-400">
                            {prop.code}
                          </span>
                          <span>·</span>
                          <span className="px-2 py-0.5 rounded-md bg-sky-50 dark:bg-sky-950/60 text-[#0284C7] dark:text-sky-300 font-bold">
                            {PROPERTY_TYPE_LABELS[prop.propertyType]}
                          </span>
                          <span>·</span>
                          <span className="font-bold text-[#059669]">
                            {PROPERTY_STATUS_LABELS[prop.status]}
                          </span>
                        </div>
                        <h3 className="text-lg font-extrabold text-[#0B192C] dark:text-white font-display flex items-center gap-1.5">
                          <span>{prop.title}</span>
                          <ChevronLeft className="w-4 h-4 text-[#B48327] shrink-0" />
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-[#B48327] shrink-0" />
                          <span>
                            {prop.region} — {prop.address}
                          </span>
                        </p>
                      </div>

                      {/* Direct Property Action Buttons */}
                      <div
                        className="flex flex-wrap items-center gap-1.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openPropertyDetailsFromDossier(prop.id, 'properties_and_units');
                          }}
                          className="min-h-[36px] px-3 rounded-xl bg-[#F4F6F9] hover:bg-slate-200 dark:bg-slate-800 text-[#0B192C] dark:text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Layers className="w-3.5 h-3.5 text-[#B48327]" />
                          <span>شاشة الطوابق</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openCollectionModalInDossier(prop.id)}
                          className="min-h-[36px] px-3 rounded-xl bg-teal-50 hover:bg-teal-100 dark:bg-teal-950/60 text-[#0D9488] dark:text-teal-300 text-xs font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Wallet className="w-3.5 h-3.5" />
                          <span>تحصيل</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openAddUnitModal(prop)}
                          className="min-h-[36px] px-3 rounded-xl bg-[#0B192C] hover:bg-[#132A46] text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5 text-[#B48327]" />
                          <span>إضافة وحدة</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditPropertyInDossier(prop)}
                          className="min-h-[36px] px-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold cursor-pointer"
                          title="تعديل العقار"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        {(isOwner || canDeleteRecords) && (
                          <button
                            type="button"
                            onClick={() => setConfirmDeletePropId(prop.id)}
                            className="min-h-[36px] px-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 text-rose-600 text-xs font-bold cursor-pointer"
                            title="حذف العقار"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Architectural Summary Strip (عدد الطوابق | البدروم | الشقق | المحلات | الملحقات) — 320px-safe */}
                    <div className="grid grid-cols-5 gap-1.5 sm:gap-2 py-3.5 border-b border-slate-100 dark:border-slate-800 text-center text-xs">
                      <div className="px-1 py-2 sm:p-2.5 rounded-2xl bg-[#F4F6F9] dark:bg-slate-900">
                        <div className="text-[10px] text-slate-500 leading-tight">عدد الطوابق</div>
                        <div className="font-mono font-extrabold text-[#0B192C] dark:text-white mt-0.5">
                          {arch.floorsCount}
                        </div>
                      </div>
                      <div className="px-1 py-2 sm:p-2.5 rounded-2xl bg-[#F4F6F9] dark:bg-slate-900">
                        <div className="text-[10px] text-slate-500 leading-tight">البدروم</div>
                        <div className="font-extrabold text-[#0B192C] dark:text-white mt-0.5">
                          {arch.hasBasement ? 'نعم' : 'لا'}
                        </div>
                      </div>
                      <div className="px-1 py-2 sm:p-2.5 rounded-2xl bg-[#F4F6F9] dark:bg-slate-900">
                        <div className="text-[10px] text-slate-500 leading-tight">الشقق</div>
                        <div className="font-mono font-extrabold text-[#0284C7] dark:text-sky-400 mt-0.5">
                          {arch.apartmentsCount}
                        </div>
                      </div>
                      <div className="px-1 py-2 sm:p-2.5 rounded-2xl bg-[#F4F6F9] dark:bg-slate-900">
                        <div className="text-[10px] text-slate-500 leading-tight">المحلات</div>
                        <div className="font-mono font-extrabold text-[#0D9488] dark:text-teal-400 mt-0.5">
                          {arch.shopsCount}
                        </div>
                      </div>
                      <div className="px-1 py-2 sm:p-2.5 rounded-2xl bg-[#F4F6F9] dark:bg-slate-900">
                        <div className="text-[10px] text-slate-500 leading-tight">الملحقات</div>
                        <div className="font-mono font-extrabold text-[#B48327] mt-0.5">
                          {arch.annexesCount}
                        </div>
                      </div>
                    </div>

                    {/* Separated Financial Summary vs Rental Summary by Period */}
                    <div className="space-y-2.5 py-3 border-b border-slate-100 dark:border-slate-800 text-xs">
                      <div className="grid grid-cols-3 gap-2.5">
                        <div className="p-2.5 rounded-2xl bg-[#F4F6F9] dark:bg-slate-900">
                          <div className="text-[10px] text-slate-500">المطلوب الضريبي للعقار</div>
                          <div className="font-mono font-extrabold text-[#0B192C] dark:text-white mt-0.5">
                            {propFin.totalApprovedObligations.toLocaleString('en-US')}
                          </div>
                        </div>
                        <div className="p-2.5 rounded-2xl bg-[#F4F6F9] dark:bg-slate-900">
                          <div className="text-[10px] text-slate-500">المدفوع للعقار</div>
                          <div className="font-mono font-extrabold text-[#0D9488] mt-0.5">
                            {propFin.approvedCollectionsTotal.toLocaleString('en-US')}
                          </div>
                        </div>
                        <div className="p-2.5 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/60">
                          <div className="text-[10px] text-amber-800 dark:text-amber-300">المتبقي الضريبي</div>
                          <div className="font-mono font-extrabold text-amber-700 dark:text-amber-300 mt-0.5">
                            {propFin.netRemaining.toLocaleString('en-US')}
                          </div>
                        </div>
                      </div>

                      {/* Standalone Unit Rentals Breakdown by Explicit Period */}
                      <div className="p-3 rounded-2xl bg-[#ECFDF5]/50 dark:bg-emerald-950/20 border border-[#A7F3D0]/60 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                          <span className="font-extrabold text-[#059669]">
                            ملخص إيجارات الوحدات المؤجرة حسب الفترة (مستقل عن الضرائب):
                          </span>
                          <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold text-slate-600 dark:text-slate-300">
                            <span className="text-[#059669]">مؤجرة: {rentalSummary.occupiedCount}</span>
                            <span>·</span>
                            <span className="text-[#D97706]">شاغرة: {rentalSummary.vacantCount}</span>
                            <span>·</span>
                            <span className="text-[#0284C7]">يستخدمها المالك: {rentalSummary.ownerUsedCount}</span>
                            <span>·</span>
                            <span className="text-slate-500">تحت الصيانة: {rentalSummary.underMaintenanceCount}</span>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                          {(['monthly', 'quarterly', 'semi_annual', 'annual'] as RentPeriod[]).map((per) => (
                            <div
                              key={per}
                              className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 flex items-center justify-between"
                            >
                              <span className="text-slate-500 font-semibold">
                                {RENT_PERIOD_LABELS[per]} ({rentalSummary.byPeriod[per].count})
                              </span>
                              <span className="font-mono font-extrabold text-[#0B192C] dark:text-white">
                                {rentalSummary.byPeriod[per].totalAmount.toLocaleString('en-US')} {currencyLabel}
                              </span>
                            </div>
                          ))}
                        </div>
                        {rentalSummary.legacyUnclassifiedCount > 0 && (
                          <div className="px-2.5 py-1.5 rounded-xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200 text-[11px] text-amber-800 dark:text-amber-300 flex items-center justify-between">
                            <span>
                              تقدير إيجار سابق غير محدد الفترة ({rentalSummary.legacyUnclassifiedCount} وحدة):
                            </span>
                            <span className="font-mono font-extrabold">
                              {rentalSummary.legacyUnclassifiedTotal.toLocaleString('en-US')} {currencyLabel}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {prop.notes && (
                      <div className="mt-3 text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/60 px-3.5 py-2 rounded-xl">
                        <strong>تفاصيل وملاحظات العقار:</strong> {prop.notes}
                      </div>
                    )}

                    {/* Units Grouped by Floor inside Property */}
                    <div className="mt-4 space-y-2.5" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                          <Layers className="w-4 h-4 text-[#0D9488]" />
                          الطوابق والوحدات التابعة ({units.length} وحدة):
                        </span>
                      </div>

                      {floorGroups.map((fg) => (
                        <div
                          key={fg.floorLabel}
                          className="rounded-2xl border border-[#E2E8F0] dark:border-slate-800 overflow-hidden"
                        >
                          <div className="px-3.5 py-2.5 bg-[#F4F6F9] dark:bg-slate-900 flex items-center justify-between text-xs">
                            <span className="font-extrabold text-[#172334] dark:text-white">
                              {fg.floorLabel} ({fg.units.length} وحدة)
                            </span>
                            <button
                              type="button"
                              onClick={() => openAddUnitModal(prop, fg.floorLabel)}
                              className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700 text-[11px] font-bold text-[#0B192C] dark:text-white cursor-pointer"
                            >
                              + وحدة في {fg.floorLabel}
                            </button>
                          </div>

                          {fg.units.length > 0 && (
                            <div className="p-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2 bg-white dark:bg-[#0D1829]">
                              {fg.units.map((u) => {
                                const badgeStyle = OCCUPANCY_BADGE_STYLES[u.occupancyStatus];
                                const rentInfo = getUnitRentDisplayInfo(u);
                                return (
                                  <div
                                    key={u.id}
                                    className="p-3 rounded-xl bg-[#F4F6F9]/60 dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 flex items-start justify-between gap-2"
                                  >
                                    <div className="min-w-0">
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        <span className="text-xs font-extrabold text-[#0B192C] dark:text-white">
                                          {u.unitNumber}
                                        </span>
                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 text-[#64748B] border border-[#E2E8F0] dark:border-slate-700">
                                          {UNIT_TYPE_LABELS[u.unitType]}
                                        </span>
                                        <span
                                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badgeStyle.bg} ${badgeStyle.text} ${badgeStyle.border}`}
                                        >
                                          {OCCUPANCY_STATUS_LABELS[u.occupancyStatus]}
                                        </span>
                                      </div>
                                      <div className="text-[11px] font-mono font-bold text-[#172334] dark:text-slate-200 mt-1">
                                        {u.occupancyStatus === 'occupied' ? (
                                          <>
                                            الإيجار: {rentInfo.activeRentAmount.toLocaleString('en-US')}{' '}
                                            {currencyLabel}
                                            {rentInfo.periodLabel ? ` (${rentInfo.periodLabel})` : ''}
                                          </>
                                        ) : (
                                          <span className="text-[#64748B]">0 {currencyLabel}</span>
                                        )}
                                      </div>
                                      {u.occupancyStatus === 'occupied' && u.tenantName && (
                                        <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                                          المستأجر: {u.tenantName}
                                        </div>
                                      )}
                                    </div>

                                    <div className="flex items-center gap-1 shrink-0">
                                      <button
                                        type="button"
                                        onClick={() => openEditUnitModal(prop, u)}
                                        className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
                                        title="تعديل الوحدة"
                                      >
                                        <Edit3 className="w-3.5 h-3.5" />
                                      </button>
                                      {(isOwner || canDeleteRecords) && (
                                        <button
                                          type="button"
                                          onClick={() => setConfirmDeleteUnit(u)}
                                          className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 cursor-pointer"
                                          title="حذف الوحدة"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ====================================================================
            TAB 2: FINANCIAL FILE (الملف المالي التفصيلي لكل عقار وللمكلف)
           ==================================================================== */}
        {dossierTab === 'financial_file' && (
          <div className="space-y-5">
            {/* Per-Property Financial Breakdown Table */}
            <section className="bg-white dark:bg-[#0D1829] border border-slate-200/90 dark:border-slate-800 rounded-3xl p-5 shadow-2xs">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div>
                  <h3 className="text-base font-extrabold text-[#0B192C] dark:text-white font-display">
                    التفاصيل المالية لكل عقار على حدة والإجمالي على مستوى المكلف
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    يوضح الالتزامات المعتمدة والتحصيلات المسددة والرصيد المتبقي لكل عقار مرتبط بالمكلف
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openAssessmentModalInDossier()}
                    className="min-h-[38px] px-3.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-[#0B192C] dark:text-white cursor-pointer"
                  >
                    + تقييم مالي
                  </button>
                  <button
                    type="button"
                    onClick={() => openCollectionModalInDossier()}
                    className="min-h-[38px] px-3.5 rounded-xl bg-[#0D9488] text-white text-xs font-bold cursor-pointer"
                  >
                    + تسجيل تحصيل
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                      <th className="py-2.5 px-3 font-bold">العقار / الحساب</th>
                      <th className="py-2.5 px-3 font-bold">الالتزامات المعتمدة</th>
                      <th className="py-2.5 px-3 font-bold">التحصيلات المعتمدة</th>
                      <th className="py-2.5 px-3 font-bold">المتبقي الصافي</th>
                      <th className="py-2.5 px-3 font-bold">إجراء سريع</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {tpProps.map((p) => {
                      const pf = getTaxpayerFinancialSummary(selectedTaxpayer.id, p.id);
                      return (
                        <tr key={p.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-900/40">
                          <td className="py-3 px-3 font-bold text-[#0B192C] dark:text-white">
                            <button
                              type="button"
                              onClick={() => openPropertyDetailsFromDossier(p.id, 'financial_file')}
                              className="hover:underline text-right cursor-pointer inline-flex items-center gap-1"
                            >
                              <span>{p.title}</span>
                              <span className="font-mono text-[11px] text-[#0284C7]">({p.code})</span>
                            </button>
                          </td>
                          <td className="py-3 px-3 font-mono font-bold">
                            {pf.totalApprovedObligations.toLocaleString('en-US')} {defaultCurrency}
                          </td>
                          <td className="py-3 px-3 font-mono font-bold text-[#0D9488]">
                            {pf.approvedCollectionsTotal.toLocaleString('en-US')} {defaultCurrency}
                          </td>
                          <td className="py-3 px-3 font-mono font-extrabold text-amber-600 dark:text-amber-400">
                            {pf.netRemaining.toLocaleString('en-US')} {defaultCurrency}
                          </td>
                          <td className="py-3 px-3">
                            <button
                              type="button"
                              onClick={() => openCollectionModalInDossier(p.id)}
                              className="px-2.5 py-1 rounded-lg bg-teal-50 dark:bg-teal-950/60 text-[#0D9488] dark:text-teal-300 font-bold cursor-pointer"
                            >
                              تحصيل من العقار
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="bg-[#F4F7FA] dark:bg-slate-900 font-extrabold">
                      <td className="py-3 px-3 text-[#0B192C] dark:text-white">
                        الإجمالي الكلي على مستوى المكلف ({selectedTaxpayer.fullName})
                      </td>
                      <td className="py-3 px-3 font-mono text-[#0B192C] dark:text-white">
                        {tpFinSummary.totalApprovedObligations.toLocaleString('en-US')} {defaultCurrency}
                      </td>
                      <td className="py-3 px-3 font-mono text-[#0D9488]">
                        {tpFinSummary.approvedCollectionsTotal.toLocaleString('en-US')} {defaultCurrency}
                      </td>
                      <td className="py-3 px-3 font-mono text-amber-600 dark:text-amber-400">
                        {tpFinSummary.netRemaining.toLocaleString('en-US')} {defaultCurrency}
                      </td>
                      <td className="py-3 px-3">—</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* Transactions Ledger & Assessments History */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Recorded Collections & Transactions */}
              <section className="bg-white dark:bg-[#0D1829] border border-slate-200/90 dark:border-slate-800 rounded-3xl p-5 shadow-2xs">
                <h3 className="text-sm font-extrabold text-[#0B192C] dark:text-white mb-3 font-display">
                  سجل التحصيلات والمدفوعات والمعاملات ({tpTransactions.length})
                </h3>
                {tpTransactions.length === 0 ? (
                  <p className="text-xs text-slate-500 py-6 text-center">
                    لا توجد معاملات أو تحصيلات مسجلة لهذا المكلف حتى الآن.
                  </p>
                ) : (
                  <div className="space-y-2.5 text-xs">
                    {tpTransactions.map((t) => (
                      <div
                        key={t.id}
                        className="p-3.5 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <div className="font-extrabold text-[#0B192C] dark:text-white flex items-center gap-1.5">
                            <span className="font-mono text-[#0284C7]">{t.referenceNumber}</span>
                            <span>·</span>
                            <span>
                              {t.transactionType === 'payment'
                                ? 'سند تحصيل'
                                : t.transactionType === 'fee'
                                  ? 'رسوم إضافية'
                                  : 'تسوية مالية'}
                            </span>
                          </div>
                          <span className="font-mono font-extrabold text-sm text-[#0D9488] dark:text-teal-400">
                            {t.amount.toLocaleString('en-US')} {t.currency}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-500">
                          <span>
                            العقار: {t.propertyTitle} · التاريخ: <span className="font-mono">{t.transactionDate}</span>
                          </span>
                          <span
                            className={`font-bold ${
                              t.status === 'approved'
                                ? 'text-emerald-600'
                                : t.status === 'reversed'
                                  ? 'text-rose-600 line-through'
                                  : 'text-amber-600'
                            }`}
                          >
                            {t.status === 'approved'
                              ? 'معتمد'
                              : t.status === 'reversed'
                                ? 'ملغى / معكوس'
                                : 'قيد المراجعة'}
                          </span>
                        </div>
                        {t.notes && <div className="text-[11px] text-slate-600 dark:text-slate-400">{t.notes}</div>}
                        {canApproveFinancials && t.status !== 'reversed' && (
                          <div className="flex items-center justify-end gap-2 pt-1">
                            {t.status === 'pending' && (
                              <button
                                type="button"
                                onClick={() => void approveFinancialTransaction(t)}
                                className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-bold cursor-pointer"
                              >
                                اعتماد التحصيل
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                void reverseFinancialTransaction(t, 'عكس قيد من داخل ملف المكلف')
                              }
                              className="px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/50 text-rose-600 text-[11px] font-bold cursor-pointer"
                            >
                              عكس العملية
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Financial Assessments */}
              <section className="bg-white dark:bg-[#0D1829] border border-slate-200/90 dark:border-slate-800 rounded-3xl p-5 shadow-2xs">
                <h3 className="text-sm font-extrabold text-[#0B192C] dark:text-white mb-3 font-display">
                  التقييمات والالتزامات المالية المسجلة ({tpAssessments.length})
                </h3>
                {tpAssessments.length === 0 ? (
                  <p className="text-xs text-slate-500 py-6 text-center">
                    لا توجد تقييمات مالية مسجلة لهذا المكلف بعد.
                  </p>
                ) : (
                  <div className="space-y-2.5 text-xs">
                    {tpAssessments.map((a) => (
                      <div
                        key={a.id}
                        className="p-3.5 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold text-[#0B192C] dark:text-white">
                            {a.periodLabel} — {a.propertyTitle}
                          </span>
                          <span className="font-mono font-extrabold text-sm text-[#0B192C] dark:text-white">
                            {a.amount.toLocaleString('en-US')} {a.currency}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-slate-500">
                          <span className="font-mono">تاريخ التقييم: {a.assessmentDate}</span>
                          <span
                            className={`font-bold ${
                              a.status === 'approved'
                                ? 'text-emerald-600'
                                : a.status === 'cancelled'
                                  ? 'text-rose-600'
                                  : 'text-amber-600'
                            }`}
                          >
                            {a.status === 'approved'
                              ? 'معتمد'
                              : a.status === 'cancelled'
                                ? 'ملغى'
                                : 'مسودة'}
                          </span>
                        </div>
                        {canApproveFinancials && a.status === 'draft' && (
                          <div className="flex justify-end gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => void approveFinancialAssessment(a)}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-bold cursor-pointer"
                            >
                              اعتماد التقييم
                            </button>
                            <button
                              type="button"
                              onClick={() => void cancelFinancialAssessment(a, 'إلغاء من ملف المكلف')}
                              className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-600 text-[11px] font-bold cursor-pointer"
                            >
                              إلغاء
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>
        )}

        {/* ====================================================================
            TAB 3: VISITS, APPOINTMENTS & POSTPONEMENTS (الزيارات والمواعيد والتأجيلات)
           ==================================================================== */}
        {dossierTab === 'visits_and_appointments' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Field Visits */}
            <section className="bg-white dark:bg-[#0D1829] border border-slate-200/90 dark:border-slate-800 rounded-3xl p-5 shadow-2xs">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-extrabold text-[#0B192C] dark:text-white font-display">
                  الزيارات الميدانية المرتبطة بالمكلف ({tpVisits.length})
                </h3>
                <button
                  type="button"
                  onClick={() => openVisitModalInDossier()}
                  className="px-3 py-1.5 rounded-xl bg-[#0284C7] text-white text-xs font-bold cursor-pointer"
                >
                  + تسجيل زيارة
                </button>
              </div>
              {tpVisits.length === 0 ? (
                <p className="text-xs text-slate-500 py-6 text-center">
                  لا توجد زيارات ميدانية مسجلة لهذا المكلف بعد.
                </p>
              ) : (
                <div className="space-y-2.5 text-xs">
                  {tpVisits.map((v) => (
                    <div
                      key={v.id}
                      className="p-3.5 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-[#0B192C] dark:text-white">
                          {v.propertyTitle}
                        </span>
                        <span className="font-mono text-[11px] text-[#0284C7]">
                          {v.visitDate} ({formatTimeTo12Hour(v.visitTime)})
                        </span>
                      </div>
                      <div className="text-[11px] text-[#0D9488] font-bold">
                        {VISIT_PURPOSE_LABELS[v.purpose]} · {VISIT_STATUS_LABELS[v.status]}
                      </div>
                      {v.notes && <div className="text-slate-600 dark:text-slate-300">{v.notes}</div>}
                      <div className="text-[10px] text-slate-400">
                        الموظف الميداني: {v.officerName}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Appointments, Reminders & Postponements */}
            <section className="bg-white dark:bg-[#0D1829] border border-slate-200/90 dark:border-slate-800 rounded-3xl p-5 shadow-2xs space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-[#0B192C] dark:text-white font-display">
                  المواعيد والتذكيرات والتأجيلات ({tpAppts.length})
                </h3>
                <button
                  type="button"
                  onClick={() => openAppointmentModalInDossier()}
                  className="px-3 py-1.5 rounded-xl bg-amber-600 text-white text-xs font-bold cursor-pointer"
                >
                  + جدولة موعد / تذكير
                </button>
              </div>

              {tpAppts.length === 0 ? (
                <p className="text-xs text-slate-500 py-6 text-center">
                  لا توجد مواعيد أو تذكيرات مسجلة لهذا المكلف.
                </p>
              ) : (
                <div className="space-y-2.5 text-xs">
                  {tpAppts.map((a) => (
                    <div
                      key={a.id}
                      className="p-3.5 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-extrabold text-[#0B192C] dark:text-white">
                            {a.title}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            العقار: {a.propertyTitle} · الموقع: {a.locationText}
                          </div>
                        </div>
                        <span className="font-mono font-bold text-[#0284C7] shrink-0">
                          {a.scheduledDate} · {formatTimeTo12Hour(a.scheduledTime)}
                        </span>
                      </div>

                      {a.postponeCount > 0 && (
                        <div className="text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 px-2.5 py-1 rounded-lg">
                          تم تأجيله ({a.postponeCount}) مرات — آخر سبب: {a.lastPostponeReason}
                        </div>
                      )}

                      {a.status !== 'completed' && a.status !== 'cancelled' && (
                        <div className="flex items-center justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setPostponingAppt(a);
                              setNewPostponeDate(a.scheduledDate);
                              setNewPostponeTime(a.scheduledTime);
                              setPostponeReason('');
                            }}
                            className="px-2.5 py-1 rounded-lg bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Clock className="w-3 h-3" />
                            <span>تأجيل الموعد</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void updateAppointmentStatus(a, 'completed')}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            <span>إتمام</span>
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {tpPostponements.length > 0 && (
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                  <h4 className="text-xs font-extrabold text-slate-600 dark:text-slate-300 mb-2">
                    سجل تأجيلات المواعيد الموثق ({tpPostponements.length}):
                  </h4>
                  <div className="space-y-1.5 text-[11px]">
                    {tpPostponements.map((p) => (
                      <div
                        key={p.id}
                        className="p-2.5 rounded-xl bg-amber-50/60 dark:bg-amber-950/25 border border-amber-200/60 dark:border-amber-800/40"
                      >
                        من <span className="font-mono">{p.previousDate}</span> إلى{' '}
                        <span className="font-mono font-bold">{p.newDate} ({formatTimeTo12Hour(p.newTime)})</span> — السبب:{' '}
                        <strong>{p.reason}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </div>
        )}

        {/* ====================================================================
            TAB 4: CHRONOLOGICAL ACTIVITY TIMELINE (السجل الزمني للعمليات والأنشطة)
           ==================================================================== */}
        {dossierTab === 'activity_timeline' && (
          <section className="bg-white dark:bg-[#0D1829] border border-slate-200/90 dark:border-slate-800 rounded-3xl p-5 shadow-2xs">
            <h3 className="text-base font-extrabold text-[#0B192C] dark:text-white mb-1 font-display">
              السجل الزمني للعمليات والأنشطة المرتبطة بالمكلف «{selectedTaxpayer.fullName}»
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              توثيق زمني متسلسل لجميع العمليات المنفذة على ملف المكلف وعقاراته ووحداته ومعاملاته المالية
            </p>
            {taxpayerAuditTimeline.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">
                لا توجد عمليات مسجلة في السجل الزمني لهذا المكلف بعد.
              </p>
            ) : (
              <div className="space-y-2.5">
                {taxpayerAuditTimeline.map((log) => (
                  <div
                    key={log.id}
                    className="p-3.5 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex items-start justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="font-bold text-[#0B192C] dark:text-white">{log.summary}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        المنفذ: {log.actorName} · نوع الكيان: {log.entityType} ({log.actionType})
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 text-[10px] font-mono text-slate-500 shrink-0">
                      موثق
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ====================================================================
            IN-DOSSIER MODALS (Pre-filled with selectedTaxpayer)
           ==================================================================== */}

        {/* Quick Agent Update Modal */}
        {isAgentModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white dark:bg-[#0D1829] rounded-3xl p-6 border border-slate-200 dark:border-slate-800 space-y-4 shadow-xl">
              <h3 className="text-base font-extrabold text-[#0B192C] dark:text-white font-display">
                بيانات الوكيل المرتبط بالمكلف «{selectedTaxpayer.fullName}»
              </h3>
              <form onSubmit={handleSaveAgentQuick} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">اسم الوكيل المعتمد *</label>
                  <input
                    type="text"
                    required
                    value={quickAgentName}
                    onChange={(e) => setQuickAgentName(e.target.value)}
                    placeholder="مثال: توفيق"
                    className="w-full min-h-[42px] px-3.5 rounded-xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">رقم هاتف الوكيل</label>
                  <input
                    type="tel"
                    dir="ltr"
                    value={quickAgentPhone}
                    onChange={(e) => setQuickAgentPhone(e.target.value)}
                    placeholder="777123456"
                    className="w-full min-h-[42px] px-3.5 rounded-xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono text-left"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsAgentModalOpen(false)}
                    className="min-h-[40px] px-4 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="min-h-[40px] px-5 rounded-xl bg-[#0D9488] text-white text-xs font-bold cursor-pointer"
                  >
                    حفظ بيانات الوكيل
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* In-Dossier Add/Edit Property Modal */}
        {isPropertyModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="w-full max-w-xl bg-white dark:bg-[#0D1829] rounded-t-3xl sm:rounded-3xl p-6 border border-slate-200 dark:border-slate-800 max-h-[90vh] overflow-y-auto shadow-xl">
              <h3 className="text-lg font-extrabold text-[#0B192C] dark:text-white mb-1 font-display">
                {editingProperty
                  ? `تعديل العقار «${editingProperty.title}»`
                  : `إضافة عقار جديد لملف «${selectedTaxpayer.fullName}»`}
              </h3>
              <p className="text-xs text-[#0D9488] font-bold mb-4">
                مربوط تلقائيًا بالمكلف: {selectedTaxpayer.fullName} ({selectedTaxpayer.internalCode})
              </p>

              <form onSubmit={handleSavePropertyInDossier} className="space-y-3.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">مسمى العقار *</label>
                    <input
                      type="text"
                      required
                      value={propTitle}
                      onChange={(e) => setPropTitle(e.target.value)}
                      className="w-full min-h-[42px] px-3.5 rounded-xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">الرمز المرجعي *</label>
                    <input
                      type="text"
                      required
                      value={propCode}
                      onChange={(e) => setPropCode(e.target.value)}
                      className="w-full min-h-[42px] px-3.5 rounded-xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">نوع الاستخدام</label>
                    <select
                      value={propType}
                      onChange={(e) => setPropType(e.target.value as PropertyType)}
                      className="w-full min-h-[42px] px-3 rounded-xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                    >
                      {Object.entries(PROPERTY_TYPE_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">المنطقة / المدينة *</label>
                    <input
                      type="text"
                      required
                      value={propRegion}
                      onChange={(e) => setPropRegion(e.target.value)}
                      className="w-full min-h-[42px] px-3 rounded-xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">العنوان / الشارع *</label>
                    <input
                      type="text"
                      required
                      value={propAddress}
                      onChange={(e) => setPropAddress(e.target.value)}
                      placeholder="مثال: شارع الثلاثين"
                      className="w-full min-h-[42px] px-3 rounded-xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                    />
                  </div>
                </div>

                {/* Floors, Basement, Apartments, Shops, and Annexes */}
                <div className="p-3.5 rounded-2xl bg-[#F4F6F9] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-700 space-y-2.5">
                  <div className="text-xs font-extrabold text-[#0B192C] dark:text-white">
                    بنية العقار (عدد الطوابق، البدروم، الشقق، المحلات، الملحقات):
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-bold mb-1">عدد الطوابق *</label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={propFloorsCount}
                        onChange={(e) => setPropFloorsCount(e.target.value)}
                        className="w-full min-h-[38px] px-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold mb-1">البدروم (القبو)</label>
                      <select
                        value={propHasBasement ? 'yes' : 'no'}
                        onChange={(e) => setPropHasBasement(e.target.value === 'yes')}
                        className="w-full min-h-[38px] px-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold"
                      >
                        <option value="no">لا</option>
                        <option value="yes">نعم</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold mb-1">عدد الشقق</label>
                      <input
                        type="number"
                        min="0"
                        value={propApartmentsCount}
                        onChange={(e) => setPropApartmentsCount(e.target.value)}
                        className="w-full min-h-[38px] px-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold mb-1">عدد المحلات</label>
                      <input
                        type="number"
                        min="0"
                        value={propShopsCount}
                        onChange={(e) => setPropShopsCount(e.target.value)}
                        className="w-full min-h-[38px] px-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold mb-1">الملحقات</label>
                      <input
                        type="number"
                        min="0"
                        value={propAnnexesCount}
                        onChange={(e) => setPropAnnexesCount(e.target.value)}
                        className="w-full min-h-[38px] px-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsPropertyModalOpen(false)}
                    className="min-h-[42px] px-5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="min-h-[42px] px-6 rounded-xl bg-[#0B192C] dark:bg-[#0D9488] text-white text-xs font-bold cursor-pointer"
                  >
                    {submitting ? 'جارٍ الحفظ...' : 'حفظ العقار في ملف المكلف'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* In-Dossier Add/Edit Unit Modal */}
        {unitModalProperty && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="w-full max-w-lg bg-white dark:bg-[#0D1829] rounded-3xl p-6 border border-slate-200 dark:border-slate-800 space-y-4 shadow-xl">
              <h3 className="text-base font-extrabold text-[#0B192C] dark:text-white font-display">
                {editingUnit
                  ? `تعديل الوحدة «${editingUnit.unitNumber}» — ${unitModalProperty.title}`
                  : `إضافة وحدة عقارية جديدة — ${unitModalProperty.title}`}
              </h3>
              <form onSubmit={handleSaveUnitInDossier} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">رقم / مسمى الوحدة *</label>
                    <input
                      type="text"
                      required
                      value={unitNumber}
                      onChange={(e) => setUnitNumber(e.target.value)}
                      className="w-full min-h-[42px] px-3 rounded-xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">الطابق *</label>
                    <select
                      value={unitFloor}
                      onChange={(e) => setUnitFloor(e.target.value)}
                      className="w-full min-h-[42px] px-3 rounded-xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                    >
                      {!getAvailableFloorOptions(unitModalProperty).includes(unitFloor) && (
                        <option value={unitFloor}>
                          {unitFloor ? `${unitFloor} (القيمة المحفوظة)` : 'غير محدد (القيمة المحفوظة)'}
                        </option>
                      )}
                      {getAvailableFloorOptions(unitModalProperty).map((fl) => (
                        <option key={fl} value={fl}>
                          {fl}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">نوع الوحدة *</label>
                    <select
                      value={unitType}
                      onChange={(e) => setUnitType(e.target.value as UnitType)}
                      className="w-full min-h-[42px] px-3 rounded-xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                    >
                      {Object.entries(UNIT_TYPE_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">حالة الإشغال *</label>
                    <select
                      value={unitOccupancy}
                      onChange={(e) => setUnitOccupancy(e.target.value as OccupancyStatus)}
                      className="w-full min-h-[42px] px-3 rounded-xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                    >
                      {Object.entries(OCCUPANCY_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {unitOccupancy === 'occupied' ? (
                  <div className="p-3.5 rounded-2xl bg-[#ECFDF5]/60 dark:bg-emerald-950/25 border border-[#A7F3D0] dark:border-emerald-800/60 space-y-3">
                    <div className="text-xs font-extrabold text-[#059669] dark:text-emerald-300">
                      بيانات الإيجار للوحدة المؤجرة
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold mb-1">قيمة الإيجار *</label>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          required
                          value={unitAnnualRent}
                          onChange={(e) => setUnitAnnualRent(e.target.value)}
                          className="w-full min-h-[42px] px-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold mb-1">فترة الإيجار *</label>
                        <select
                          value={unitRentPeriod}
                          onChange={(e) =>
                            setUnitRentPeriod(e.target.value as RentPeriod | 'legacy_unclassified')
                          }
                          className="w-full min-h-[42px] px-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold"
                        >
                          {editingUnit && !editingUnit.rentPeriod && (
                            <option value="legacy_unclassified">
                              تقدير سابق (الاحتفاظ بالقيمة دون تحديد فترة)
                            </option>
                          )}
                          {Object.entries(RENT_PERIOD_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1">اسم المستأجر (عند التوفر)</label>
                      <input
                        type="text"
                        value={unitTenantName}
                        onChange={(e) => setUnitTenantName(e.target.value)}
                        className="w-full min-h-[42px] px-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-[#F4F6F9] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 text-xs text-[#64748B]">
                    الوحدة في حالة «<strong>{OCCUPANCY_LABELS[unitOccupancy]}</strong>» — لا يُطلب
                    إدخال إيجار حالي أو اسم مستأجر.
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setUnitModalProperty(null);
                      setEditingUnit(null);
                    }}
                    className="min-h-[40px] px-4 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="min-h-[40px] px-5 rounded-xl bg-[#0D9488] text-white text-xs font-bold cursor-pointer"
                  >
                    {submitting ? 'جارٍ الحفظ...' : 'حفظ الوحدة'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* In-Dossier Record Collection Modal */}
        {isCollectionModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="w-full max-w-lg bg-white dark:bg-[#0D1829] rounded-3xl p-6 border border-slate-200 dark:border-slate-800 space-y-4 shadow-xl">
              <div>
                <h3 className="text-base font-extrabold text-[#0B192C] dark:text-white font-display">
                  تسجيل تحصيل مالي مباشر — {selectedTaxpayer.fullName}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  المتبقي الحالي على المكلف قبل العملية:{' '}
                  <strong className="font-mono text-amber-600">
                    {tpFinSummary.netRemaining.toLocaleString('en-US')} {defaultCurrency}
                  </strong>
                </p>
              </div>

              <form onSubmit={handleSaveCollectionInDossier} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">العقار المرتبط بالتحصيل *</label>
                  <select
                    value={collectionPropertyId}
                    onChange={(e) => setCollectionPropertyId(e.target.value)}
                    className="w-full min-h-[42px] px-3 rounded-xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                  >
                    {tpProps.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title} ({p.code})
                      </option>
                    ))}
                    <option value="general_prop">حساب المكلف العام ({selectedTaxpayer.fullName})</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">المبلغ المحصل *</label>
                    <input
                      type="number"
                      required
                      min="1"
                      step="any"
                      value={collectionAmount}
                      onChange={(e) => setCollectionAmount(e.target.value)}
                      placeholder="مثال: 4000"
                      className="w-full min-h-[42px] px-3.5 rounded-xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">رقم السند / المرجع *</label>
                    <input
                      type="text"
                      required
                      value={collectionRef}
                      onChange={(e) => setCollectionRef(e.target.value)}
                      className="w-full min-h-[42px] px-3.5 rounded-xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">تاريخ العملية</label>
                    <input
                      type="date"
                      value={collectionDate}
                      onChange={(e) => setCollectionDate(e.target.value)}
                      className="w-full min-h-[42px] px-3 rounded-xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">العملة</label>
                    <select
                      value={collectionCurrency}
                      onChange={(e) => setCollectionCurrency(e.target.value as any)}
                      className="w-full min-h-[42px] px-3 rounded-xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold"
                    >
                      {CURRENCY_LIST.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">بيان / ملاحظات السند</label>
                  <input
                    type="text"
                    value={collectionNotes}
                    onChange={(e) => setCollectionNotes(e.target.value)}
                    placeholder="دفعة من الحساب..."
                    className="w-full min-h-[42px] px-3.5 rounded-xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsCollectionModalOpen(false)}
                    className="min-h-[40px] px-4 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="min-h-[40px] px-5 rounded-xl bg-[#0D9488] text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                  >
                    {submitting ? 'جارٍ الحفظ في Firestore...' : 'تأكيد وحفظ سند التحصيل'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* In-Dossier Issue Assessment Modal */}
        {isAssessmentModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="w-full max-w-lg bg-white dark:bg-[#0D1829] rounded-3xl p-6 border border-slate-200 dark:border-slate-800 space-y-4 shadow-xl">
              <h3 className="text-base font-extrabold text-[#0B192C] dark:text-white font-display">
                إصدار تقييم / التزام مالي — {selectedTaxpayer.fullName}
              </h3>
              <form onSubmit={handleSaveAssessmentInDossier} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">العقار المرتبط *</label>
                  <select
                    value={assessmentPropertyId}
                    onChange={(e) => setAssessmentPropertyId(e.target.value)}
                    className="w-full min-h-[42px] px-3 rounded-xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                  >
                    {tpProps.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title} ({p.code})
                      </option>
                    ))}
                    <option value="general_prop">ملف المكلف العام ({selectedTaxpayer.fullName})</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">قيمة الالتزام / التقييم *</label>
                    <input
                      type="number"
                      required
                      min="1"
                      step="any"
                      value={assessmentAmount}
                      onChange={(e) => setAssessmentAmount(e.target.value)}
                      className="w-full min-h-[42px] px-3.5 rounded-xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">الفترة / البيان *</label>
                    <input
                      type="text"
                      required
                      value={assessmentPeriod}
                      onChange={(e) => setAssessmentPeriod(e.target.value)}
                      className="w-full min-h-[42px] px-3.5 rounded-xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsAssessmentModalOpen(false)}
                    className="min-h-[40px] px-4 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="min-h-[40px] px-5 rounded-xl bg-[#0B192C] dark:bg-[#0D9488] text-white text-xs font-bold cursor-pointer"
                  >
                    {submitting ? 'جارٍ الحفظ...' : 'حفظ التقييم المالي'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* In-Dossier Record Field Visit Modal */}
        {isVisitModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="w-full max-w-lg bg-white dark:bg-[#0D1829] rounded-3xl p-6 border border-slate-200 dark:border-slate-800 space-y-4 shadow-xl">
              <h3 className="text-base font-extrabold text-[#0B192C] dark:text-white font-display">
                تسجيل زيارة ميدانية — {selectedTaxpayer.fullName}
              </h3>
              <form onSubmit={handleSaveVisitInDossier} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">العقار الذي تمت زيارته *</label>
                  <select
                    value={visitPropertyId}
                    onChange={(e) => setVisitPropertyId(e.target.value)}
                    className="w-full min-h-[42px] px-3 rounded-xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                  >
                    {tpProps.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title} ({p.code})
                      </option>
                    ))}
                    <option value="general_prop">زيارة عامة للمكلف ({selectedTaxpayer.fullName})</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">تاريخ الزيارة</label>
                    <input
                      type="date"
                      value={visitDate}
                      onChange={(e) => setVisitDate(e.target.value)}
                      className="w-full min-h-[42px] px-3 rounded-xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold">وقت الزيارة</label>
                      {visitTime && (
                        <span className="text-[11px] font-bold text-[#0284C7] font-mono">
                          ({formatTimeTo12Hour(visitTime)})
                        </span>
                      )}
                    </div>
                    <input
                      type="time"
                      value={visitTime}
                      onChange={(e) => setVisitTime(e.target.value)}
                      className="w-full min-h-[42px] px-3 rounded-xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">الغرض من الزيارة</label>
                    <select
                      value={visitPurpose}
                      onChange={(e) => setVisitPurpose(e.target.value as VisitPurpose)}
                      className="w-full min-h-[42px] px-3 rounded-xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                    >
                      {Object.entries(VISIT_PURPOSE_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">نتيجة الزيارة</label>
                    <select
                      value={visitStatus}
                      onChange={(e) => setVisitStatus(e.target.value as VisitStatus)}
                      className="w-full min-h-[42px] px-3 rounded-xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                    >
                      {Object.entries(VISIT_STATUS_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">ملاحظات ومشاهدات الزيارة</label>
                  <textarea
                    rows={2}
                    value={visitNotes}
                    onChange={(e) => setVisitNotes(e.target.value)}
                    placeholder="اكتب خلاصة المعاينة الميدانية..."
                    className="w-full p-3 rounded-xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsVisitModalOpen(false)}
                    className="min-h-[40px] px-4 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="min-h-[40px] px-5 rounded-xl bg-[#0284C7] text-white text-xs font-bold cursor-pointer"
                  >
                    {submitting ? 'جارٍ الحفظ...' : 'حفظ الزيارة الميدانية'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* In-Dossier Schedule Appointment / Reminder Modal */}
        {isAppointmentModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="w-full max-w-lg bg-white dark:bg-[#0D1829] rounded-3xl p-6 border border-slate-200 dark:border-slate-800 space-y-4 shadow-xl">
              <h3 className="text-base font-extrabold text-[#0B192C] dark:text-white font-display">
                جدولة موعد أو تذكير متابعة — {selectedTaxpayer.fullName}
              </h3>
              <form onSubmit={handleSaveAppointmentInDossier} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">عنوان الموعد / التذكير *</label>
                  <input
                    type="text"
                    required
                    value={apptTitle}
                    onChange={(e) => setApptTitle(e.target.value)}
                    className="w-full min-h-[42px] px-3.5 rounded-xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">العقار المرتبط</label>
                  <select
                    value={apptPropertyId}
                    onChange={(e) => setApptPropertyId(e.target.value)}
                    className="w-full min-h-[42px] px-3 rounded-xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                  >
                    {tpProps.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title} ({p.code})
                      </option>
                    ))}
                    <option value="general_prop">ملف المكلف العام ({selectedTaxpayer.fullName})</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">التاريخ *</label>
                    <input
                      type="date"
                      required
                      value={apptDate}
                      onChange={(e) => setApptDate(e.target.value)}
                      className="w-full min-h-[42px] px-3 rounded-xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold">الوقت *</label>
                      {apptTime && (
                        <span className="text-[11px] font-bold text-[#0284C7] font-mono">
                          ({formatTimeTo12Hour(apptTime)})
                        </span>
                      )}
                    </div>
                    <input
                      type="time"
                      required
                      value={apptTime}
                      onChange={(e) => setApptTime(e.target.value)}
                      className="w-full min-h-[42px] px-3 rounded-xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">
                    التنبيه قبل الموعد بـ
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      inputMode="numeric"
                      required
                      min={MIN_REMINDER_MINUTES}
                      max={MAX_REMINDER_MINUTES}
                      step={1}
                      value={apptReminderInput}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setApptReminderInput(raw);
                        const check = validateReminderMinutesInput(raw);
                        setApptReminderError(check.isValid ? null : check.error || null);
                      }}
                      placeholder="مثال: 30 أو 75"
                      className={`w-full min-h-[42px] px-3.5 rounded-xl bg-[#F4F7FA] dark:bg-slate-900 border text-xs font-mono font-bold ${
                        apptReminderError
                          ? 'border-rose-500 text-rose-600'
                          : 'border-slate-200 dark:border-slate-700'
                      }`}
                    />
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300 shrink-0">
                      دقيقة
                    </span>
                  </div>
                  {apptReminderError ? (
                    <div className="text-[10px] font-semibold text-rose-600 mt-1">
                      {apptReminderError}
                    </div>
                  ) : (
                    <div className="text-[10px] text-slate-500 mt-1">
                      عدد صحيح موجب من {MIN_REMINDER_MINUTES} إلى {MAX_REMINDER_MINUTES} دقيقة
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">الموقع / الملاحظات</label>
                  <input
                    type="text"
                    value={apptLocation}
                    onChange={(e) => setApptLocation(e.target.value)}
                    className="w-full min-h-[42px] px-3.5 rounded-xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsAppointmentModalOpen(false)}
                    className="min-h-[40px] px-4 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="min-h-[40px] px-5 rounded-xl bg-amber-600 text-white text-xs font-bold cursor-pointer"
                  >
                    {submitting ? 'جارٍ الحفظ...' : 'حفظ الموعد والتذكير'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Postpone Appointment Modal */}
        {postponingAppt && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white dark:bg-[#0D1829] rounded-3xl p-6 border border-slate-200 dark:border-slate-800 space-y-4 shadow-xl">
              <h3 className="text-base font-extrabold text-[#0B192C] dark:text-white font-display">
                تأجيل الموعد: {postponingAppt.title}
              </h3>
              <form onSubmit={handlePostponeSubmit} className="space-y-3">
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-xs font-semibold mb-1">التاريخ الجديد *</label>
                    <input
                      type="date"
                      required
                      value={newPostponeDate}
                      onChange={(e) => setNewPostponeDate(e.target.value)}
                      className="w-full min-h-[40px] px-3 rounded-xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold">الوقت الجديد *</label>
                      {newPostponeTime && (
                        <span className="text-[11px] font-bold text-amber-600 font-mono">
                          ({formatTimeTo12Hour(newPostponeTime)})
                        </span>
                      )}
                    </div>
                    <input
                      type="time"
                      required
                      value={newPostponeTime}
                      onChange={(e) => setNewPostponeTime(e.target.value)}
                      className="w-full min-h-[40px] px-3 rounded-xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">سبب التأجيل *</label>
                  <input
                    type="text"
                    required
                    value={postponeReason}
                    onChange={(e) => setPostponeReason(e.target.value)}
                    placeholder="مثال: بناءً على طلب المكلف أو الوكيل..."
                    className="w-full min-h-[40px] px-3 rounded-xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setPostponingAppt(null)}
                    className="min-h-[40px] px-4 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="min-h-[40px] px-5 rounded-xl bg-amber-600 text-white text-xs font-bold cursor-pointer"
                  >
                    تأكيد التأجيل
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Confirm Property Delete Modal */}
        {confirmDeletePropId && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white dark:bg-[#0D1829] rounded-3xl p-6 border border-slate-200 dark:border-slate-800 space-y-4 shadow-xl">
              <div className="flex items-center gap-2.5 text-rose-600">
                <AlertTriangle className="w-6 h-6" />
                <h3 className="text-base font-bold">تأكيد حذف العقار</h3>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                سيقوم النظام بالتحقق من عدم وجود وحدات أو زيارات أو تقييمات أو معاملات مالية مرتبطة بهذا العقار قبل تنفيذ الحذف النهائي.
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmDeletePropId(null)}
                  className="min-h-[42px] px-4 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold cursor-pointer"
                >
                  تراجع
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const id = confirmDeletePropId;
                    setConfirmDeletePropId(null);
                    await deleteProperty(id);
                  }}
                  className="min-h-[42px] px-5 rounded-xl bg-rose-600 text-white text-xs font-bold cursor-pointer"
                >
                  تأكيد الحذف
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Confirm Unit Delete Modal */}
        {confirmDeleteUnit && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white dark:bg-[#0D1829] rounded-3xl p-6 border border-slate-200 dark:border-slate-800 space-y-4 shadow-xl">
              <div className="flex items-center gap-2.5 text-rose-600">
                <AlertTriangle className="w-6 h-6" />
                <h3 className="text-base font-bold">تأكيد حذف الوحدة العقارية</h3>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                هل أنت متأكد من حذف الوحدة «{confirmDeleteUnit.unitNumber}»؟
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmDeleteUnit(null)}
                  className="min-h-[42px] px-4 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold cursor-pointer"
                >
                  تراجع
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const u = confirmDeleteUnit;
                    setConfirmDeleteUnit(null);
                    await deletePropertyUnit(u);
                  }}
                  className="min-h-[42px] px-5 rounded-xl bg-rose-600 text-white text-xs font-bold cursor-pointer"
                >
                  تأكيد حذف الوحدة
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Confirm Taxpayer Delete Modal */}
        {confirmDeleteTpId && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white dark:bg-[#0D1829] rounded-3xl p-6 border border-slate-200 dark:border-slate-800 space-y-4 shadow-xl">
              <div className="flex items-center gap-2.5 text-rose-600">
                <AlertTriangle className="w-6 h-6" />
                <h3 className="text-base font-bold">تأكيد حذف ملف المكلف</h3>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                سيقوم النظام بالتحقق من عدم وجود عقارات مرتبطة بهذا المكلف قبل تنفيذ الحذف النهائي وتوثيقه في سجل التدقيق.
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmDeleteTpId(null)}
                  className="min-h-[42px] px-4 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold cursor-pointer"
                >
                  تراجع
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const id = confirmDeleteTpId;
                    setConfirmDeleteTpId(null);
                    await deleteTaxpayer(id);
                    setSelectedTaxpayerId(null);
                  }}
                  className="min-h-[42px] px-5 rounded-xl bg-rose-600 text-white text-xs font-bold cursor-pointer"
                >
                  تأكيد الحذف
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Taxpayer Modal (when opened from inside Dossier) */}
        {isFormOpen && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="w-full max-w-xl bg-white dark:bg-[#0D1829] rounded-t-3xl sm:rounded-3xl p-6 border border-[#E2E8F0] dark:border-slate-800 max-h-[90vh] overflow-y-auto shadow-xl">
              <h2 className="text-lg font-bold text-[#0B192C] dark:text-white mb-4 font-display">
                تعديل بيانات المكلف والوكيل
              </h2>

              {exactDuplicateMatch && (
                <div className="mb-4 p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-extrabold text-rose-700 dark:text-rose-300">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>
                      منع التكرار: {exactDuplicateMatch.fieldLabel} ({exactDuplicateMatch.duplicateValue}) مسجل مسبقًا!
                    </span>
                  </div>
                  <div className="text-xs text-rose-600 dark:text-rose-300 flex items-center justify-between gap-2">
                    <span>
                      المكلف المسجل: <strong>{exactDuplicateMatch.taxpayer.fullName}</strong> (ملف:{' '}
                      {exactDuplicateMatch.taxpayer.internalCode})
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setIsFormOpen(false);
                        setSelectedTaxpayerId(exactDuplicateMatch.taxpayer.id);
                      }}
                      className="underline font-bold cursor-pointer shrink-0"
                    >
                      فتح ملف المكلف
                    </button>
                  </div>
                </div>
              )}

              <form onSubmit={handleSaveTaxpayer} className="space-y-3.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">اسم المكلف *</label>
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full min-h-[42px] px-3.5 rounded-xl bg-[#F4F6F9] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-700 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">رقم الملف (المعرف الداخلي) *</label>
                    <input
                      type="text"
                      required
                      value={internalCode}
                      onChange={(e) => setInternalCode(e.target.value)}
                      className="w-full min-h-[42px] px-3.5 rounded-xl bg-[#F4F6F9] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-700 text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">رقم المكلف / الهوية</label>
                    <input
                      type="text"
                      value={nationalOrCommercialId}
                      onChange={(e) => setNationalOrCommercialId(e.target.value)}
                      className="w-full min-h-[42px] px-3.5 rounded-xl bg-[#F4F6F9] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-700 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">رقم هاتف المكلف</label>
                    <input
                      type="tel"
                      dir="ltr"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full min-h-[42px] px-3.5 rounded-xl bg-[#F4F6F9] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-700 text-xs font-mono text-left"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">الحالة</label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as TaxpayerStatus)}
                      className="w-full min-h-[42px] px-3 rounded-xl bg-[#F4F6F9] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-700 text-xs"
                    >
                      {Object.entries(STATUS_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">اسم الوكيل (إن وجد)</label>
                    <input
                      type="text"
                      value={agentNameInput}
                      onChange={(e) => setAgentNameInput(e.target.value)}
                      placeholder="مثال: محمد عبدالله"
                      className="w-full min-h-[42px] px-3.5 rounded-xl bg-[#F4F6F9] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-700 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">رقم هاتف الوكيل</label>
                    <input
                      type="tel"
                      dir="ltr"
                      value={agentPhoneInput}
                      onChange={(e) => setAgentPhoneInput(e.target.value)}
                      placeholder="777..."
                      className="w-full min-h-[42px] px-3.5 rounded-xl bg-[#F4F6F9] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-700 text-xs font-mono text-left"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">المنطقة / المديرية</label>
                    <input
                      type="text"
                      value={region}
                      onChange={(e) => setRegion(e.target.value)}
                      className="w-full min-h-[42px] px-3.5 rounded-xl bg-[#F4F6F9] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-700 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">العنوان / الحي</label>
                    <input
                      type="text"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="w-full min-h-[42px] px-3.5 rounded-xl bg-[#F4F6F9] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-700 text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">ملاحظات المكلف</label>
                  <textarea
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="أضف أي ملاحظات عامة أو ميدانية خاصة بالمكلف..."
                    className="w-full p-3 rounded-xl bg-[#F4F6F9] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-700 text-xs leading-relaxed"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsFormOpen(false)}
                    className="min-h-[42px] px-5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || Boolean(exactDuplicateMatch)}
                    className="min-h-[42px] px-6 rounded-xl bg-[#0B192C] text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                  >
                    حفظ التعديلات
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ============================================================================
  // UNIFIED DIRECTORY VIEW (البحث والتصفية - دافعو الضرائب وفق المرجع البصري)
  // ============================================================================
  const bellModalData = bellModalTaxpayer
    ? getTaxpayerAppointmentsStatus.get(bellModalTaxpayer.id)
    : null;

  return (
    <div className="space-y-3.5 pb-8 max-w-2xl mx-auto">
      {/* 1. Reference Search Bar + Quick Add Button */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 text-[#64748B] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              directoryViewMode === 'taxpayers'
                ? 'ابحث بالاسم، الرقم، الملف، الهاتف...'
                : 'ابحث باسم العقار، الرمز، المالك، أو الشارع...'
            }
            className="w-full min-h-[46px] pr-10 pl-10 rounded-xl bg-white dark:bg-[#0D1829] border border-[#E2E8F0] dark:border-slate-800 text-xs text-[#172334] dark:text-white placeholder:text-[#64748B] shadow-2xs focus:outline-none focus:border-[#0B192C]"
          />
          <button
            type="button"
            onClick={() => setShowFiltersPanel((prev) => !prev)}
            title="تصفية النتائج"
            className={`w-8 h-8 rounded-lg absolute left-2 top-1/2 -translate-y-1/2 flex items-center justify-center transition cursor-pointer ${
              showFiltersPanel ||
              regionFilter !== 'all' ||
              appointmentFilter !== 'all' ||
              visitFilter !== 'all' ||
              statusFilter !== 'all'
                ? 'bg-[#0B192C] text-[#B48327]'
                : 'text-[#64748B] hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={openCreateForm}
          title="إضافة مكلف جديد"
          className="min-h-[46px] px-3 sm:px-3.5 rounded-xl bg-[#0B192C] hover:bg-[#132A46] text-white text-xs font-bold flex items-center gap-1.5 shadow-2xs shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4 text-[#B48327]" />
          <span>إضافة مكلف</span>
        </button>
      </div>

      {/* 2. Reference Filter Pills Row (المنطقة/الحي | حالة المواعيد | حالة الزيارة | الحالة) */}
      {directoryViewMode === 'taxpayers' && (
        <div className="flex items-center gap-2 rasd-scroll-x pb-0.5">
          {/* Region / Neighborhood Filter Pill */}
          <div className="relative shrink-0">
            <select
              aria-label="تصفية حسب المنطقة أو الحي"
              value={regionFilter}
              onChange={(e) => setRegionFilter(e.target.value)}
              className={`min-h-[34px] px-3 rounded-full text-[11px] font-bold border transition cursor-pointer appearance-none pr-3 pl-6 ${
                regionFilter !== 'all'
                  ? 'bg-[#0B192C] text-white border-[#0B192C]'
                  : 'bg-white dark:bg-[#0D1829] text-[#172334] dark:text-slate-200 border-[#E2E8F0] dark:border-slate-800'
              }`}
            >
              <option value="all">المنطقة/الحي</option>
              {availableRegions.map((reg) => (
                <option key={reg} value={reg}>
                  {reg}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[9px] opacity-70">
              ▼
            </span>
          </div>

          {/* Appointments Status Filter Pill */}
          <div className="relative shrink-0">
            <select
              aria-label="تصفية حسب حالة المواعيد"
              value={appointmentFilter}
              onChange={(e) =>
                setAppointmentFilter(
                  e.target.value as 'all' | 'has_appointments' | 'overdue_or_due' | 'upcoming' | 'none'
                )
              }
              className={`min-h-[34px] px-3 rounded-full text-[11px] font-bold border transition cursor-pointer appearance-none pr-3 pl-6 ${
                appointmentFilter !== 'all'
                  ? 'bg-[#0B192C] text-white border-[#0B192C]'
                  : 'bg-white dark:bg-[#0D1829] text-[#172334] dark:text-slate-200 border-[#E2E8F0] dark:border-slate-800'
              }`}
            >
              <option value="all">حالة المواعيد</option>
              <option value="overdue_or_due">مواعيد متأخرة / مستحقة</option>
              <option value="upcoming">مواعيد قادمة</option>
              <option value="has_appointments">مرتبط بمواعيد</option>
              <option value="none">بدون مواعيد نشطة</option>
            </select>
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[9px] opacity-70">
              ▼
            </span>
          </div>

          {/* Visit Status Filter Pill */}
          <div className="relative shrink-0">
            <select
              aria-label="تصفية حسب حالة الزيارة"
              value={visitFilter}
              onChange={(e) =>
                setVisitFilter(
                  e.target.value as 'all' | 'visited' | 'not_visited' | 'requires_followup'
                )
              }
              className={`min-h-[34px] px-3 rounded-full text-[11px] font-bold border transition cursor-pointer appearance-none pr-3 pl-6 ${
                visitFilter !== 'all'
                  ? 'bg-[#0B192C] text-white border-[#0B192C]'
                  : 'bg-white dark:bg-[#0D1829] text-[#172334] dark:text-slate-200 border-[#E2E8F0] dark:border-slate-800'
              }`}
            >
              <option value="all">حالة الزيارة</option>
              <option value="visited">تمت زيارته</option>
              <option value="requires_followup">يحتاج متابعة</option>
              <option value="not_visited">لم تُسجل زيارة</option>
            </select>
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[9px] opacity-70">
              ▼
            </span>
          </div>

          {/* Taxpayer Status Filter Pill */}
          <div className="relative shrink-0">
            <select
              aria-label="تصفية حسب حالة الملف"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={`min-h-[34px] px-3 rounded-full text-[11px] font-bold border transition cursor-pointer appearance-none pr-3 pl-6 ${
                statusFilter !== 'all'
                  ? 'bg-[#0B192C] text-white border-[#0B192C]'
                  : 'bg-white dark:bg-[#0D1829] text-[#172334] dark:text-slate-200 border-[#E2E8F0] dark:border-slate-800'
              }`}
            >
              <option value="all">حالة الملف</option>
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[9px] opacity-70">
              ▼
            </span>
          </div>

          {(regionFilter !== 'all' ||
            appointmentFilter !== 'all' ||
            visitFilter !== 'all' ||
            statusFilter !== 'all' ||
            searchQuery.trim() !== '') && (
            <button
              type="button"
              onClick={() => {
                setRegionFilter('all');
                setAppointmentFilter('all');
                setVisitFilter('all');
                setStatusFilter('all');
                setSearchQuery('');
              }}
              className="min-h-[34px] px-3 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-bold shrink-0 cursor-pointer"
            >
              مسح الفلاتر
            </button>
          )}
        </div>
      )}

      {/* Optional Expanded Filter & View Mode Bar when SlidersHorizontal is clicked */}
      {showFiltersPanel && (
        <div className="bg-white dark:bg-[#0D1829] border border-[#E2E8F0] dark:border-slate-800 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-2 shadow-2xs">
          <div className="inline-flex rounded-xl bg-[#F4F6F9] dark:bg-slate-900 p-1 border border-[#E2E8F0] dark:border-slate-800">
            <button
              type="button"
              onClick={() => setDirectoryViewMode('taxpayers')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                directoryViewMode === 'taxpayers'
                  ? 'bg-[#0B192C] text-white'
                  : 'text-[#64748B] dark:text-slate-300'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>دافعو الضرائب ({taxpayers.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setDirectoryViewMode('properties')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                directoryViewMode === 'properties'
                  ? 'bg-[#0B192C] text-white'
                  : 'text-[#64748B] dark:text-slate-300'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>العقارات ({properties.length})</span>
            </button>
          </div>

          {directoryViewMode === 'properties' && (
            <select
              value={propertyTypeFilter}
              onChange={(e) => setPropertyTypeFilter(e.target.value)}
              className="min-h-[36px] px-3 rounded-xl bg-[#F4F6F9] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-700 text-xs"
            >
              <option value="all">جميع أنواع العقارات</option>
              {Object.entries(PROPERTY_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* 3. Directory Cards: Taxpayers Mode (مطابق للصورة المرجعية «دافعو الضرائب») */}
      {directoryViewMode === 'taxpayers' ? (
        filteredTaxpayers.length === 0 ? (
          <div className="bg-white dark:bg-[#0D1829] border border-[#E2E8F0] dark:border-slate-800 rounded-2xl p-8 text-center shadow-2xs">
            <Users className="w-10 h-10 text-[#64748B] mx-auto mb-2.5" />
            <h3 className="text-sm font-bold text-[#172334] dark:text-white mb-1 font-display">
              لا توجد سجلات مكلفين مطابقة
            </h3>
            <p className="text-xs text-[#64748B] dark:text-slate-400 mb-4">
              جرّب تعديل كلمات البحث أو الفلاتر، أو أضف مكلفًا جديدًا الآن.
            </p>
            <button
              type="button"
              onClick={openCreateForm}
              className="min-h-[42px] px-5 rounded-xl bg-[#0B192C] text-white text-xs font-bold inline-flex items-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4 text-[#B48327]" />
              <span>إضافة مكلف جديد</span>
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredTaxpayers.map((tp) => {
              const apptInfo = getTaxpayerAppointmentsStatus.get(tp.id);
              const hasAppts = (apptInfo?.all.length || 0) > 0;
              const badgeCount =
                (apptInfo?.activeCount || 0) > 0
                  ? apptInfo?.activeCount || 0
                  : apptInfo?.all.length || 0;
              const isCompany =
                tp.fullName.includes('شركة') ||
                tp.fullName.includes('مؤسسة') ||
                tp.fullName.includes('مكتب') ||
                tp.fullName.includes('مركز');

              return (
                <div
                  key={tp.id}
                  onClick={() => {
                    setSelectedPropertyId(null);
                    setSelectedTaxpayerId(tp.id);
                  }}
                  className="bg-white dark:bg-[#0D1829] border border-[#E2E8F0] dark:border-slate-800 hover:border-[#0B192C]/40 rounded-2xl p-4 transition-all cursor-pointer shadow-2xs flex items-stretch justify-between gap-3"
                >
                  {/* Right Side: Avatar + Taxpayer Name + File Number + National/Commercial ID + Location */}
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="w-11 h-11 rounded-full bg-[#F4F6F9] dark:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700 flex items-center justify-center text-[#0B192C] dark:text-white shrink-0 mt-0.5">
                      {isCompany ? (
                        <Building2 className="w-5 h-5 stroke-[1.8]" />
                      ) : (
                        <User className="w-5 h-5 stroke-[1.8]" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1 space-y-1">
                      <h3 className="text-[15px] font-extrabold text-[#172334] dark:text-white truncate font-display leading-snug">
                        {tp.fullName}
                      </h3>

                      <div className="text-xs text-[#64748B] dark:text-slate-400 space-y-0.5">
                        <div>
                          الملف:{' '}
                          <span className="font-mono font-bold text-[#172334] dark:text-slate-200">
                            {tp.internalCode}
                          </span>
                        </div>
                        <div>
                          الهوية:{' '}
                          <span className="font-mono font-bold text-[#172334] dark:text-slate-200">
                            {tp.nationalOrCommercialId || '—'}
                          </span>
                        </div>
                      </div>

                      <div className="pt-0.5 flex items-center gap-1 text-xs text-[#64748B] dark:text-slate-400">
                        <MapPin className="w-3.5 h-3.5 text-[#64748B] shrink-0" />
                        <span className="truncate">
                          {tp.region || 'صنعاء'}
                          {tp.address ? ` - ${tp.address}` : ''}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Left Side: Appointment Bell Indicator + Direct Call Icon + Status Badge */}
                  <div
                    className="flex flex-col items-end justify-between shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Top Left: Appointment Bell + Call Button */}
                    <div className="flex items-center gap-1.5">
                      {tp.phone && (
                        <a
                          href={`tel:${tp.phone}`}
                          title={`اتصال بالمكلف: ${tp.phone}`}
                          className="w-8 h-8 rounded-full bg-[#F4F6F9] hover:bg-slate-200/80 dark:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700 flex items-center justify-center text-[#64748B] hover:text-[#0B192C] dark:text-slate-300 transition"
                        >
                          <Phone className="w-3.5 h-3.5" />
                        </a>
                      )}

                      {hasAppts && (
                        <button
                          type="button"
                          onClick={() => setBellModalTaxpayer(tp)}
                          title={
                            apptInfo?.badgeState === 'overdue_or_due'
                              ? `يوجد (${apptInfo.overdueOrDueCount}) موعد متأخر أو مستحق — اضغط لعرض مواعيد المكلف`
                              : `يوجد (${badgeCount}) مواعيد مرتبطة بالمكلف — اضغط للعرض`
                          }
                          className={`relative w-9 h-9 rounded-full flex items-center justify-center border transition cursor-pointer ${
                            apptInfo?.badgeState === 'overdue_or_due'
                              ? 'bg-rose-50 border-rose-200 text-[#EF4444] hover:bg-rose-100'
                              : apptInfo?.badgeState === 'upcoming'
                              ? 'bg-amber-50/80 border-amber-200 text-[#B48327] hover:bg-amber-100/80'
                              : 'bg-emerald-50 border-emerald-200 text-[#059669]'
                          }`}
                        >
                          <Bell className="w-4 h-4 fill-current" />
                          <span
                            className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-mono font-extrabold text-white flex items-center justify-center shadow-2xs ${
                              apptInfo?.badgeState === 'overdue_or_due'
                                ? 'bg-[#EF4444]'
                                : apptInfo?.badgeState === 'upcoming'
                                ? 'bg-[#B48327]'
                                : 'bg-[#059669]'
                            }`}
                          >
                            {badgeCount}
                          </span>
                        </button>
                      )}
                    </div>

                    {/* Bottom Left: Status Pill + Sync Indicator */}
                    <div className="flex flex-col items-end gap-1 mt-2">
                      {tp.isPendingSync && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 text-[10px] font-bold">
                          <CloudOff className="w-2.5 h-2.5" />
                          محلي
                        </span>
                      )}
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                          tp.status === 'active'
                            ? 'bg-[#ECFDF5] text-[#059669]'
                            : tp.status === 'under_review'
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            tp.status === 'active'
                              ? 'bg-[#10B981]'
                              : tp.status === 'under_review'
                              ? 'bg-amber-500'
                              : 'bg-slate-400'
                          }`}
                        />
                        {STATUS_LABELS[tp.status]}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        /* Directory Cards: General Properties Mode (linked to Unified Taxpayer Dossier) */
        <div className="space-y-3">
          {filteredProperties.map((prop) => {
            const units = propertyUnits.filter((u) => u.propertyId === prop.id);
            const apts = units.filter((u) => u.unitType === 'apartment').length;
            const shops = units.filter((u) => u.unitType === 'shop').length;
            const pf = getTaxpayerFinancialSummary(prop.taxpayerId, prop.id);

            return (
              <div
                key={prop.id}
                onClick={() => {
                  setSelectedPropertyId(prop.id);
                  setSelectedTaxpayerId(prop.taxpayerId);
                }}
                className="bg-white dark:bg-[#0D1829] border border-[#E2E8F0] dark:border-slate-800 hover:border-[#0B192C]/40 rounded-2xl p-4 transition-all cursor-pointer shadow-2xs flex flex-col justify-between gap-3"
              >
                <div>
                  <div className="flex items-center justify-between text-xs text-[#64748B] mb-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-[#0B192C] dark:text-sky-400">{prop.code}</span>
                      <span>·</span>
                      <span>{PROPERTY_TYPE_LABELS[prop.propertyType]}</span>
                    </div>
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => {
                          setPropertyNavigationOrigin({
                            source: 'taxpayers_properties_directory',
                            taxpayerId: prop.taxpayerId,
                          });
                          setSelectedPropertyId(prop.id);
                          setActiveScreen('properties');
                        }}
                        className="px-2 py-0.5 rounded-lg bg-[#F4F6F9] dark:bg-slate-800 text-[11px] font-bold text-[#0B192C] dark:text-white cursor-pointer"
                      >
                        تفاصيل العقار
                      </button>
                      <span
                        onClick={() => {
                          setSelectedPropertyId(prop.id);
                          setSelectedTaxpayerId(prop.taxpayerId);
                        }}
                        className="text-[11px] font-bold text-[#B48327] cursor-pointer"
                      >
                        فتح في ملف المكلف ←
                      </span>
                    </div>
                  </div>
                  <h3 className="text-sm font-extrabold text-[#172334] dark:text-white font-display">
                    {prop.title}
                  </h3>
                  <p className="text-xs text-[#64748B] mt-0.5">
                    المكلف المالك: <strong className="text-[#172334] dark:text-white">{prop.taxpayerName}</strong> ·{' '}
                    {prop.address}
                  </p>
                </div>

                <div className="pt-2.5 border-t border-[#E2E8F0] dark:border-slate-800 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <div className="text-[10px] text-[#64748B]">الوحدات التابعة</div>
                    <div className="font-bold text-[#172334] dark:text-white mt-0.5">
                      {units.length} ({apts} شقة، {shops} محل)
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-[#64748B]">المدفوعات</div>
                    <div className="font-mono font-bold text-[#059669] mt-0.5">
                      {pf.approvedCollectionsTotal.toLocaleString('en-US')}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-[#64748B]">المتبقي على العقار</div>
                    <div className="font-mono font-extrabold text-[#B48327] mt-0.5">
                      {pf.netRemaining.toLocaleString('en-US')} {defaultCurrency}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ======================================================================
          TAXPAYER APPOINTMENTS QUICK MODAL (عند الضغط على جرس المواعيد في البطاقة)
         ====================================================================== */}
      {bellModalTaxpayer && bellModalData && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setBellModalTaxpayer(null)}
        >
          <div
            className="w-full max-w-lg bg-white dark:bg-[#0D1829] rounded-t-3xl sm:rounded-3xl p-5 border border-[#E2E8F0] dark:border-slate-800 max-h-[85vh] overflow-y-auto shadow-xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-[#E2E8F0] dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                    bellModalData.badgeState === 'overdue_or_due'
                      ? 'bg-rose-50 text-[#EF4444]'
                      : 'bg-amber-50 text-[#B48327]'
                  }`}
                >
                  <Bell className="w-5 h-5 fill-current" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-[#172334] dark:text-white font-display">
                    مواعيد المكلف: {bellModalTaxpayer.fullName}
                  </h3>
                  <p className="text-[11px] text-[#64748B]">
                    رقم الملف: <span className="font-mono font-bold">{bellModalTaxpayer.internalCode}</span> · إجمالي
                    المواعيد: {bellModalData.all.length}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBellModalTaxpayer(null)}
                className="w-8 h-8 rounded-full bg-[#F4F6F9] dark:bg-slate-800 flex items-center justify-center text-[#64748B] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Summary badges */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2.5 rounded-xl bg-rose-50/70 border border-rose-200/70">
                <div className="text-[10px] font-bold text-rose-700">متأخرة / مستحقة</div>
                <div className="text-base font-mono font-extrabold text-[#EF4444]">
                  {bellModalData.overdueOrDueCount}
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-amber-50/70 border border-amber-200/70">
                <div className="text-[10px] font-bold text-amber-800">قادمة</div>
                <div className="text-base font-mono font-extrabold text-[#B48327]">
                  {bellModalData.upcomingCount}
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200/70">
                <div className="text-[10px] font-bold text-emerald-800">مكتملة</div>
                <div className="text-base font-mono font-extrabold text-[#059669]">
                  {bellModalData.completedCount}
                </div>
              </div>
            </div>

            {/* Appointments List */}
            <div className="space-y-2.5">
              {bellModalData.all.map((appt) => {
                const todayStr = getAdenTodayString();
                const isOverdue =
                  appt.status !== 'completed' &&
                  appt.status !== 'cancelled' &&
                  appt.scheduledDate <= todayStr;

                return (
                  <div
                    key={appt.id}
                    className="p-3.5 rounded-2xl bg-[#F4F6F9] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-xs font-extrabold text-[#172334] dark:text-white">
                          {appt.title}
                        </div>
                        <div className="text-[11px] text-[#64748B] mt-0.5 flex items-center gap-2 font-mono">
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {appt.scheduledDate}
                          </span>
                          <span>·</span>
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatTimeTo12Hour(appt.scheduledTime)}
                          </span>
                        </div>
                      </div>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                          appt.status === 'completed'
                            ? 'bg-[#ECFDF5] text-[#059669]'
                            : isOverdue
                            ? 'bg-rose-100 text-[#EF4444]'
                            : 'bg-amber-100 text-[#B48327]'
                        }`}
                      >
                        {appt.status === 'completed'
                          ? 'مكتمل'
                          : isOverdue
                          ? 'متأخر / مستحق'
                          : 'قادم'}
                      </span>
                    </div>

                    {appt.locationText && (
                      <div className="text-[11px] text-[#64748B] flex items-center gap-1">
                        <MapPin className="w-3 h-3 shrink-0" />
                        <span>{appt.locationText}</span>
                      </div>
                    )}

                    {appt.status !== 'completed' && (
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={async () => {
                            await updateAppointmentStatus(appt, 'completed');
                          }}
                          className="min-h-[34px] px-3 rounded-xl bg-[#059669] text-white text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>إنجاز الموعد</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const targetTp = bellModalTaxpayer;
                            setBellModalTaxpayer(null);
                            setSelectedTaxpayerId(targetTp.id);
                            setDossierTab('visits_and_appointments');
                          }}
                          className="min-h-[34px] px-3 rounded-xl bg-white dark:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700 text-[11px] font-bold text-[#0B192C] dark:text-white cursor-pointer"
                        >
                          فتح في ملف المكلف
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#E2E8F0] dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  const targetTp = bellModalTaxpayer;
                  setBellModalTaxpayer(null);
                  setSelectedTaxpayerId(targetTp.id);
                  setDossierTab('visits_and_appointments');
                }}
                className="min-h-[42px] px-4 rounded-xl bg-[#0B192C] text-white text-xs font-bold flex-1 cursor-pointer"
              >
                فتح تبويب مواعيد وزيارات المكلف
              </button>
              <button
                type="button"
                onClick={() => {
                  setBellModalTaxpayer(null);
                  setActiveScreen('appointments');
                }}
                className="min-h-[42px] px-4 rounded-xl bg-[#F4F6F9] dark:bg-slate-800 text-[#172334] dark:text-white text-xs font-bold cursor-pointer"
              >
                كل المواعيد
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================================
          ADD / EDIT TAXPAYER MODAL (مع منع التكرار الفعلي لرقم الملف ورقم المكلف)
         ====================================================================== */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-xl bg-white dark:bg-[#0D1829] rounded-t-3xl sm:rounded-3xl p-6 border border-[#E2E8F0] dark:border-slate-800 max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mb-4 sm:hidden" />
            <h2 className="text-lg font-bold text-[#0B192C] dark:text-white mb-4 font-display">
              {editingTaxpayer ? 'تعديل بيانات المكلف' : 'إضافة مكلف جديد وفتح ملفه الموحد'}
            </h2>

            {/* Strict Blocking Duplicate Alert for internalCode or nationalOrCommercialId */}
            {exactDuplicateMatch && (
              <div className="mb-4 p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 space-y-2">
                <div className="flex items-center gap-2 text-xs font-extrabold text-rose-700 dark:text-rose-300">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>
                    منع التكرار: {exactDuplicateMatch.fieldLabel} ({exactDuplicateMatch.duplicateValue}) مسجل مسبقًا!
                  </span>
                </div>
                <p className="text-[11px] text-rose-600 dark:text-rose-300">
                  لا يمكن حفظ مكلف جديد بنفس رقم الملف أو رقم الهوية/السجل التجاري. يمكنك تعديل الرقم أدناه أو فتح ملف المكلف المسجل مباشرة:
                </p>
                <div className="flex items-center justify-between pt-1 text-xs font-bold text-rose-800 dark:text-rose-200">
                  <span>
                    • {exactDuplicateMatch.taxpayer.fullName} (ملف: {exactDuplicateMatch.taxpayer.internalCode})
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setIsFormOpen(false);
                      setSelectedTaxpayerId(exactDuplicateMatch.taxpayer.id);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-rose-600 text-white text-[11px] font-bold cursor-pointer"
                  >
                    فتح ملف المكلف المسجل
                  </button>
                </div>
              </div>
            )}

            {/* Advisory Name Similarity Alert */}
            {!exactDuplicateMatch && similarTaxpayers.length > 0 && !ignoreDuplicateWarning && (
              <div className="mb-4 p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>تنبيه تشابه الأسماء: تم العثور على اسم مشابه مسجل مسبقًا:</span>
                </div>
                <div className="text-xs text-amber-700 dark:text-amber-300 space-y-1">
                  {similarTaxpayers.map((st) => (
                    <div key={st.id} className="flex items-center justify-between">
                      <span>
                        • {st.fullName} (ملف: {st.internalCode})
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setIsFormOpen(false);
                          setSelectedTaxpayerId(st.id);
                        }}
                        className="underline font-bold cursor-pointer"
                      >
                        فتح الملف الموجود
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setIgnoreDuplicateWarning(true)}
                  className="text-[11px] font-bold text-amber-900 dark:text-amber-200 underline pt-1 cursor-pointer"
                >
                  تأكيد أن هذا مكلف مختلف والمتابعة بالحفظ
                </button>
              </div>
            )}

            <form onSubmit={handleSaveTaxpayer} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">اسم المكلف الرباعي / الجهة *</label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => {
                      setFullName(e.target.value);
                      setIgnoreDuplicateWarning(false);
                    }}
                    placeholder="مثال: أحمد محمد علي"
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#F4F6F9] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-700 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">رقم الملف (المعرف الداخلي) *</label>
                  <input
                    type="text"
                    required
                    value={internalCode}
                    onChange={(e) => {
                      setInternalCode(e.target.value);
                      setIgnoreDuplicateWarning(false);
                    }}
                    className={`w-full min-h-[44px] px-3.5 rounded-xl bg-[#F4F6F9] dark:bg-slate-900 border text-xs font-mono ${
                      exactDuplicateMatch?.fieldLabel.includes('الملف')
                        ? 'border-rose-500 ring-2 ring-rose-500/20'
                        : 'border-[#E2E8F0] dark:border-slate-700'
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">رقم المكلف / الهوية أو السجل</label>
                  <div className="relative">
                    <IdCard className="w-4 h-4 text-[#64748B] absolute right-3 top-3.5" />
                    <input
                      type="text"
                      value={nationalOrCommercialId}
                      onChange={(e) => {
                        setNationalOrCommercialId(e.target.value);
                        setIgnoreDuplicateWarning(false);
                      }}
                      placeholder="987654321"
                      className={`w-full min-h-[44px] pr-9 pl-3.5 rounded-xl bg-[#F4F6F9] dark:bg-slate-900 border text-xs font-mono ${
                        exactDuplicateMatch?.fieldLabel.includes('الهوية')
                          ? 'border-rose-500 ring-2 ring-rose-500/20'
                          : 'border-[#E2E8F0] dark:border-slate-700'
                      }`}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">رقم الهاتف</label>
                  <input
                    type="tel"
                    dir="ltr"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="777..."
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#F4F6F9] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-700 text-xs font-mono text-left"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">الحالة</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as TaxpayerStatus)}
                    className="w-full min-h-[44px] px-3 rounded-xl bg-[#F4F6F9] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-700 text-xs"
                  >
                    {Object.entries(STATUS_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">اسم الوكيل (اختياري)</label>
                  <input
                    type="text"
                    value={agentNameInput}
                    onChange={(e) => setAgentNameInput(e.target.value)}
                    placeholder="مثال: محمد عبدالله"
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#F4F6F9] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-700 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">هاتف الوكيل (اختياري)</label>
                  <input
                    type="tel"
                    dir="ltr"
                    value={agentPhoneInput}
                    onChange={(e) => setAgentPhoneInput(e.target.value)}
                    placeholder="777..."
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#F4F6F9] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-700 text-xs font-mono text-left"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">المنطقة / المديرية</label>
                  <input
                    type="text"
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    placeholder="صنعاء - حدة"
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#F4F6F9] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-700 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">العنوان التفصيلي</label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="شارع الستين"
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#F4F6F9] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-700 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">ملاحظات المكلف</label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="أضف أي ملاحظات عامة أو ميدانية خاصة بالمكلف..."
                  className="w-full p-3 rounded-xl bg-[#F4F6F9] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-700 text-xs leading-relaxed"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="min-h-[46px] px-5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={
                    submitting ||
                    Boolean(exactDuplicateMatch) ||
                    (similarTaxpayers.length > 0 && !ignoreDuplicateWarning)
                  }
                  className="min-h-[46px] px-6 rounded-xl bg-[#0B192C] text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  {submitting ? 'جاري الحفظ...' : 'حفظ وفتح ملف المكلف'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
