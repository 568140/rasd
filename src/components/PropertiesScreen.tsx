import React, { useState, useMemo, useEffect } from 'react';
import {
  Building2,
  Plus,
  Search,
  MapPin,
  Layers,
  ArrowRight,
  Edit3,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Wallet,
  CalendarClock,
  ClipboardCheck,
  Maximize2,
  UserCheck,
  ChevronDown,
  ChevronUp,
  Home,
  Store,
  Briefcase,
} from 'lucide-react';
import { useRasd } from '../context/RasdContext';
import {
  Property,
  PropertyStatus,
  PropertyType,
  PropertyUnit,
  UnitType,
  OccupancyStatus,
  RentPeriod,
} from '../types/rasd';
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
import { resolvePropertyBackTransition } from '../utils/taxpayerNotes';
import { CascadingLocationSelector } from './CascadingLocationSelector';

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

export const PropertiesScreen: React.FC = () => {
  const {
    properties,
    taxpayers,
    propertyUnits,
    fieldVisits,
    appointments,
    assessments,
    transactions,
    workspace,
    selectedPropertyId,
    setSelectedPropertyId,
    selectedTaxpayerId,
    setSelectedTaxpayerId,
    propertyNavigationOrigin,
    setPropertyNavigationOrigin,
    setActiveDossierTab,
    setActiveScreen,
    addProperty,
    updateProperty,
    deleteProperty,
    addPropertyUnit,
    updatePropertyUnit,
    deletePropertyUnit,
    executeCompoundVoiceCreation,
    addFinancialAssessment,
    approveFinancialAssessment,
    cancelFinancialAssessment,
    isOwner,
    canApproveFinancials,
    canDeleteRecords,
    showToast,
  } = useRasd();

  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'title' | 'area' | 'units'>('title');

  // Expanded floors state in Property Details accordion
  const [expandedFloors, setExpandedFloors] = useState<Record<string, boolean>>({});

  // Property Form Modal State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [taxpayerId, setTaxpayerId] = useState('');
  const [title, setTitle] = useState('');
  const [code, setCode] = useState('');
  const [propertyType, setPropertyType] = useState<PropertyType>('commercial');
  const [status, setStatus] = useState<PropertyStatus>('active');
  const [region, setRegion] = useState('صنعاء');
  const [address, setAddress] = useState('');
  const [areaSqm, setAreaSqm] = useState('250');
  const [floorsCount, setFloorsCount] = useState('4');
  const [hasBasement, setHasBasement] = useState(false);
  const [apartmentsCount, setApartmentsCount] = useState('0');
  const [shopsCount, setShopsCount] = useState('0');
  const [officesCount, setOfficesCount] = useState('0');
  const [annexesCount, setAnnexesCount] = useState('0');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Unit Add / Edit Modal State
  const [isUnitModalOpen, setIsUnitModalOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<PropertyUnit | null>(null);
  const [unitNumber, setUnitNumber] = useState('');
  const [unitType, setUnitType] = useState<UnitType>('apartment');
  const [floor, setFloor] = useState('الطابق الأرضي');
  const [unitArea, setUnitArea] = useState('85');
  const [occupancyStatus, setOccupancyStatus] = useState<OccupancyStatus>('occupied');
  const [tenantName, setTenantName] = useState('');
  const [rentAmount, setRentAmount] = useState('0');
  const [rentPeriod, setRentPeriod] = useState<RentPeriod | 'legacy_unclassified'>('monthly');
  const [unitNotes, setUnitNotes] = useState('');

  // Assessment Modal State
  const [isAssessmentModalOpen, setIsAssessmentModalOpen] = useState(false);
  const [assessmentAmount, setAssessmentAmount] = useState('150000');
  const [periodLabel, setPeriodLabel] = useState(`تقييم سنوي ${new Date().getFullYear()}`);
  const [assessmentDate, setAssessmentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [assessmentNotes, setAssessmentNotes] = useState('');

  // Confirm Delete States
  const [confirmDeletePropId, setConfirmDeletePropId] = useState<string | null>(null);
  const [confirmDeleteUnit, setConfirmDeleteUnit] = useState<PropertyUnit | null>(null);

  const selectedProperty = useMemo(
    () => properties.find((p) => p.id === selectedPropertyId) || null,
    [properties, selectedPropertyId]
  );

  // Auto-open property creation modal when triggered from Home Screen quick action
  useEffect(() => {
    try {
      const quickAction = sessionStorage.getItem('rasd_quick_action');
      if (quickAction === 'open_add_property') {
        sessionStorage.removeItem('rasd_quick_action');
        if (taxpayers.length === 0) {
          showToast('يرجى إضافة مكلف أولًا قبل تسجيل العقار.', 'warning');
          setActiveScreen('taxpayers');
          return;
        }
        setSelectedPropertyId(null);
        setEditingProperty(null);
        setTaxpayerId(taxpayers[0]?.id || '');
        setTitle('');
        setCode(`PR-${Math.floor(1000 + Math.random() * 9000)}`);
        setPropertyType('commercial');
        setStatus('active');
        setRegion(workspace?.regionName || 'صنعاء');
        setAddress('');
        setAreaSqm('250');
        setFloorsCount('4');
        setHasBasement(false);
        setApartmentsCount('0');
        setShopsCount('0');
        setOfficesCount('0');
        setAnnexesCount('0');
        setNotes('');
        setIsFormOpen(true);
      }
    } catch {
      // ignore storage errors
    }
  }, [taxpayers, workspace, showToast, setActiveScreen, setSelectedPropertyId]);

  const filteredProperties = useMemo(() => {
    const list = properties.filter((p) => {
      const q = searchQuery.trim().toLowerCase();
      const matchesQ =
        !q ||
        p.title.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q) ||
        p.taxpayerName.toLowerCase().includes(q) ||
        p.region.toLowerCase().includes(q) ||
        p.address.toLowerCase().includes(q);
      const matchesType = typeFilter === 'all' || p.propertyType === typeFilter;
      const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
      return matchesQ && matchesType && matchesStatus;
    });

    return list.sort((a, b) => {
      if (sortBy === 'area') return b.areaSqm - a.areaSqm;
      if (sortBy === 'units') return b.unitsCount - a.unitsCount;
      return a.title.localeCompare(b.title, 'ar');
    });
  }, [properties, searchQuery, typeFilter, statusFilter, sortBy]);

  const openCreateForm = () => {
    if (taxpayers.length === 0) {
      showToast('يرجى إضافة مكلف واحد على الأقل قبل إنشاء عقار مرتبط.', 'warning');
      setActiveScreen('taxpayers');
      return;
    }
    const firstTp = taxpayers[0];
    setEditingProperty(null);
    setTaxpayerId(firstTp?.id || '');
    setTitle('');
    setCode(`PR-${Math.floor(1000 + Math.random() * 9000)}`);
    setPropertyType('commercial');
    setStatus('active');
    setRegion(firstTp?.region || workspace?.regionName || 'أمانة العاصمة صنعاء');
    setAddress(firstTp?.address || '');
    setAreaSqm('250');
    setFloorsCount('4');
    setHasBasement(false);
    setApartmentsCount('0');
    setShopsCount('0');
    setOfficesCount('0');
    setAnnexesCount('0');
    setNotes('');
    setIsFormOpen(true);
  };

  const openEditForm = (prop: Property) => {
    const propUnits = propertyUnits.filter((u) => u.propertyId === prop.id);
    const arch = getPropertyArchitecturalSummary(prop, propUnits);
    setEditingProperty(prop);
    setTaxpayerId(prop.taxpayerId);
    setTitle(prop.title);
    setCode(prop.code);
    setPropertyType(prop.propertyType);
    setStatus(prop.status);
    setRegion(prop.region);
    setAddress(prop.address);
    setAreaSqm(String(prop.areaSqm || 0));
    setFloorsCount(String(arch.floorsCount || 1));
    setHasBasement(arch.hasBasement);
    setApartmentsCount(String(arch.apartmentsCount || 0));
    setShopsCount(String(arch.shopsCount || 0));
    setOfficesCount(String(arch.officesCount || 0));
    setAnnexesCount(String(arch.annexesCount || 0));
    setNotes(prop.notes || '');
    setIsFormOpen(true);
  };

  const handleSaveProperty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !taxpayerId || submitting) return;
    const selectedTp = taxpayers.find((t) => t.id === taxpayerId);
    if (!selectedTp) {
      showToast('يرجى اختيار المكلف المالك للعقار', 'error');
      return;
    }

    const floorsNum = Math.max(1, parseInt(floorsCount || '1', 10) || 1);
    const aptsNum = Math.max(0, parseInt(apartmentsCount || '0', 10) || 0);
    const shopsNum = Math.max(0, parseInt(shopsCount || '0', 10) || 0);
    const officesNum = Math.max(0, parseInt(officesCount || '0', 10) || 0);
    const annexesNum = Math.max(0, parseInt(annexesCount || '0', 10) || 0);

    setSubmitting(true);
    try {
      if (editingProperty) {
        await updateProperty(editingProperty.id, {
          taxpayerId: selectedTp.id,
          taxpayerName: selectedTp.fullName,
          title,
          code,
          propertyType,
          status,
          region,
          address,
          areaSqm: parseFloat(areaSqm) || 0,
          floorsCount: floorsNum,
          hasBasement,
          apartmentsCount: aptsNum,
          shopsCount: shopsNum,
          officesCount: officesNum,
          annexesCount: annexesNum,
          notes,
        });
      } else if (aptsNum > 0 || shopsNum > 0 || officesNum > 0 || annexesNum > 0) {
        const res = await executeCompoundVoiceCreation({
          existingTaxpayerId: selectedTp.id,
          taxpayerName: selectedTp.fullName,
          taxpayerPhone: selectedTp.phone,
          address: address || selectedTp.address || 'غير محدد',
          region: region || selectedTp.region || 'صنعاء',
          propertyTitle: title,
          propertyType,
          floorsCount: floorsNum,
          hasBasement,
          apartmentsCount: aptsNum,
          shopsCount: shopsNum,
          officesCount: officesNum,
          annexesCount: annexesNum,
          notes,
        });
        if (res?.propertyId) {
          setSelectedPropertyId(res.propertyId);
        }
      } else {
        const newPropId = await addProperty({
          taxpayerId: selectedTp.id,
          taxpayerName: selectedTp.fullName,
          title,
          code,
          propertyType,
          status,
          region,
          address,
          latitude: 0,
          longitude: 0,
          hasCoordinates: false,
          unitsCount: 0,
          areaSqm: parseFloat(areaSqm) || 0,
          floorsCount: floorsNum,
          hasBasement,
          apartmentsCount: 0,
          shopsCount: 0,
          officesCount: 0,
          annexesCount: 0,
          notes,
        });
        if (newPropId) {
          setSelectedPropertyId(newPropId);
        }
      }
      setIsFormOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  const openAddUnitModal = (defaultFloorLabel?: string) => {
    if (!selectedProperty) return;
    const existingUnits = propertyUnits.filter((u) => u.propertyId === selectedProperty.id);
    setEditingUnit(null);
    setUnitNumber(`وحدة ${existingUnits.length + 1}`);
    const isRoof = defaultFloorLabel === 'السطح / الملاحق';
    setUnitType(isRoof ? 'annex' : 'apartment');
    setFloor(defaultFloorLabel || 'الطابق الأرضي');
    setUnitArea('85');
    setOccupancyStatus('occupied');
    setTenantName('');
    setRentAmount('0');
    setRentPeriod('monthly');
    setUnitNotes('');
    setIsUnitModalOpen(true);
  };

  const openEditUnitModal = (unit: PropertyUnit) => {
    const rentInfo = getUnitRentDisplayInfo(unit);
    setEditingUnit(unit);
    setUnitNumber(unit.unitNumber);
    setUnitType(unit.unitType);
    setFloor(unit.floor || '');
    setUnitArea(String(unit.areaSqm || 0));
    setOccupancyStatus(unit.occupancyStatus);
    setTenantName(unit.tenantName || '');
    setRentAmount(String(rentInfo.activeRentAmount || unit.annualRentEstimate || 0));
    setRentPeriod(
      unit.rentPeriod
        ? unit.rentPeriod
        : rentInfo.isLegacyEstimateOnly
        ? 'legacy_unclassified'
        : 'monthly'
    );
    setUnitNotes(unit.notes || '');
    setIsUnitModalOpen(true);
  };

  const handleSaveUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProperty || !unitNumber.trim() || submitting) return;
    const isOccupied = occupancyStatus === 'occupied';
    const parsedRent = isOccupied ? Math.max(0, parseFloat(rentAmount) || 0) : 0;

    if (
      isOccupied &&
      editingUnit &&
      !editingUnit.rentPeriod &&
      rentPeriod === 'legacy_unclassified' &&
      parsedRent !== Number(editingUnit.annualRentEstimate || 0)
    ) {
      showToast(
        'يرجى تحديد فترة الإيجار (شهري، ربع سنوي، نصف سنوي، سنوي) عند تعديل قيمة الإيجار.',
        'warning'
      );
      return;
    }

    const resolvedPeriod: RentPeriod | undefined = isOccupied
      ? rentPeriod === 'legacy_unclassified'
        ? undefined
        : rentPeriod
      : undefined;

    setSubmitting(true);
    try {
      if (editingUnit) {
        await updatePropertyUnit(editingUnit.id, {
          unitNumber,
          unitType,
          floor,
          areaSqm: parseFloat(unitArea) || 0,
          occupancyStatus,
          tenantName: isOccupied ? tenantName.trim() : '',
          rentAmount: parsedRent,
          rentPeriod: resolvedPeriod,
          annualRentEstimate: parsedRent,
          notes: unitNotes,
        });
      } else {
        await addPropertyUnit({
          propertyId: selectedProperty.id,
          propertyTitle: selectedProperty.title,
          taxpayerId: selectedProperty.taxpayerId,
          unitNumber,
          unitType,
          floor,
          areaSqm: parseFloat(unitArea) || 0,
          occupancyStatus,
          tenantName: isOccupied ? tenantName.trim() : '',
          rentAmount: parsedRent,
          rentPeriod: resolvedPeriod || 'monthly',
          annualRentEstimate: parsedRent,
          notes: unitNotes,
        });
      }
      setIsUnitModalOpen(false);
      setEditingUnit(null);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddAssessment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProperty || submitting) return;
    const amt = parseFloat(assessmentAmount);
    if (isNaN(amt) || amt <= 0) {
      showToast('يرجى إدخال مبلغ تقييم صحيح أكبر من صفر.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await addFinancialAssessment({
        propertyId: selectedProperty.id,
        propertyTitle: selectedProperty.title,
        taxpayerId: selectedProperty.taxpayerId,
        taxpayerName: selectedProperty.taxpayerName,
        amount: amt,
        currency: workspace?.defaultCurrency || 'YER',
        periodLabel,
        assessmentDate,
        status: canApproveFinancials ? 'approved' : 'draft',
        notes: assessmentNotes,
      });
      setIsAssessmentModalOpen(false);
      setAssessmentNotes('');
    } finally {
      setSubmitting(false);
    }
  };

  // ============================================================================
  // PROPERTY DETAILS VIEW (تفاصيل العقار والطوابق والوحدات — مطابق للصورة المرجعية 4)
  // ============================================================================
  if (selectedProperty) {
    const propUnits = propertyUnits.filter((u) => u.propertyId === selectedProperty.id);
    const propVisits = fieldVisits.filter((v) => v.propertyId === selectedProperty.id);
    const propAppts = appointments.filter((a) => a.propertyId === selectedProperty.id);
    const propAssessments = assessments.filter((a) => a.propertyId === selectedProperty.id);
    const propTx = transactions.filter((t) => t.propertyId === selectedProperty.id);

    const archSummary = getPropertyArchitecturalSummary(selectedProperty, propUnits);
    const floorGroups = groupPropertyUnitsByFloor(selectedProperty, propUnits);
    const rentalSummary = computeUnitsRentalSummary(propUnits);
    const floorOptions = getAvailableFloorOptions(selectedProperty);

    // Tax / Financial Ledger calculations (strictly separated from unit rentals)
    const totalAssessed = propAssessments
      .filter((a) => a.status === 'approved' || a.status === 'draft')
      .reduce((s, a) => s + a.amount, 0);
    const totalPaid = propTx
      .filter((t) => t.status === 'approved' && t.transactionType === 'payment')
      .reduce((s, t) => s + t.amount, 0);
    const totalFees = propTx
      .filter(
        (t) =>
          t.status === 'approved' &&
          (t.transactionType === 'fee' || t.transactionType === 'adjustment')
      )
      .reduce((s, t) => s + t.amount, 0);
    const remainingBalance = Math.max(0, totalAssessed + totalFees - totalPaid);
    const currencyLabel = workspace?.defaultCurrency === 'SAR' ? 'ر.س' : 'ر.ي';

    const isFloorExpanded = (floorLabel: string, index: number) => {
      if (expandedFloors[floorLabel] !== undefined) {
        return expandedFloors[floorLabel];
      }
      // Default: expand Ground Floor or the first floor that has units
      if (floorLabel === 'الطابق الأرضي') return true;
      const firstNonEmptyIdx = floorGroups.findIndex((g) => g.units.length > 0);
      return index === (firstNonEmptyIdx >= 0 ? firstNonEmptyIdx : 0);
    };

    const toggleFloorAccordion = (floorLabel: string, index: number) => {
      const current = isFloorExpanded(floorLabel, index);
      setExpandedFloors((prev) => ({
        ...prev,
        [floorLabel]: !current,
      }));
    };

    const cameFromTaxpayerDossier =
      propertyNavigationOrigin?.source === 'taxpayer_dossier' &&
      Boolean(propertyNavigationOrigin.taxpayerId);

    const handleContextualBack = () => {
      const transition = resolvePropertyBackTransition({
        activeScreen: 'properties',
        selectedPropertyId,
        selectedTaxpayerId,
        propertyNavigationOrigin,
      });
      setPropertyNavigationOrigin(transition.nextOrigin);
      if (transition.nextDossierTab) {
        setActiveDossierTab(transition.nextDossierTab);
      }
      setSelectedPropertyId(transition.nextSelectedPropertyId);
      setSelectedTaxpayerId(transition.nextSelectedTaxpayerId);
      setActiveScreen(transition.nextScreen);
    };

    const handleGoToTaxpayerDossier = () => {
      setPropertyNavigationOrigin(null);
      setSelectedPropertyId(null);
      setSelectedTaxpayerId(selectedProperty.taxpayerId);
      setActiveScreen('taxpayers');
    };

    const handleGoToPropertiesList = () => {
      setPropertyNavigationOrigin(null);
      setSelectedPropertyId(null);
    };

    return (
      <div className="space-y-4 pb-8 max-w-2xl mx-auto">
        {/* Top Navigation & Actions Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleContextualBack}
            className="min-h-[40px] px-3.5 rounded-xl bg-white dark:bg-[#0D1829] border border-[#E2E8F0] dark:border-slate-800 text-xs font-bold text-[#0B192C] dark:text-slate-200 flex items-center gap-1.5 shadow-2xs cursor-pointer"
          >
            <ArrowRight className="w-4 h-4" />
            <span>
              {cameFromTaxpayerDossier
                ? `العودة لملف المكلف (${selectedProperty.taxpayerName})`
                : 'قائمة العقارات'}
            </span>
          </button>

          <div className="flex flex-wrap items-center gap-1.5">
            {cameFromTaxpayerDossier ? (
              <button
                type="button"
                onClick={handleGoToPropertiesList}
                className="min-h-[40px] px-3 rounded-xl bg-white dark:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700 text-xs font-bold text-[#0B192C] dark:text-slate-200 flex items-center gap-1.5 cursor-pointer"
              >
                <Building2 className="w-3.5 h-3.5 text-[#B48327]" />
                <span>قائمة العقارات</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleGoToTaxpayerDossier}
                className="min-h-[40px] px-3 rounded-xl bg-white dark:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700 text-xs font-bold text-[#0B192C] dark:text-slate-200 flex items-center gap-1.5 cursor-pointer"
              >
                <UserCheck className="w-3.5 h-3.5 text-[#B48327]" />
                <span>ملف المكلف ({selectedProperty.taxpayerName})</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => openEditForm(selectedProperty)}
              className="min-h-[40px] px-3.5 rounded-xl bg-[#0B192C] hover:bg-[#132A46] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5 text-[#B48327]" />
              <span>تعديل العقار</span>
            </button>
            {(isOwner || canDeleteRecords) && (
              <button
                type="button"
                onClick={() => setConfirmDeletePropId(selectedProperty.id)}
                className="min-h-[40px] px-3 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 text-xs font-bold text-rose-700 dark:text-rose-300 flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>حذف</span>
              </button>
            )}
          </div>
        </div>

        {/* 1. Reference-Aligned Property Header Card (بطاقة رأس العقار) */}
        <div className="rounded-2xl bg-white dark:bg-[#0D1829] border border-[#E2E8F0] dark:border-slate-800 p-4 sm:p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#64748B] mb-1">
                <span className="font-mono font-bold text-[#0B192C] dark:text-sky-400">
                  {selectedProperty.code}
                </span>
                <span>·</span>
                <span className="font-semibold">
                  {PROPERTY_TYPE_LABELS[selectedProperty.propertyType]}
                </span>
                <span>·</span>
                <span className="text-[#059669] font-bold">
                  {PROPERTY_STATUS_LABELS[selectedProperty.status]}
                </span>
              </div>
              <h1 className="text-base sm:text-lg font-extrabold text-[#172334] dark:text-white font-display leading-snug">
                {selectedProperty.title}
              </h1>
              <p className="text-xs text-[#64748B] dark:text-slate-400 mt-1 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-[#B48327] shrink-0" />
                <span>
                  {selectedProperty.region} - {selectedProperty.address}
                </span>
              </p>
              <p className="text-[11px] text-[#64748B] dark:text-slate-400 mt-1">
                المالك / المكلف:{' '}
                <button
                  type="button"
                  onClick={handleGoToTaxpayerDossier}
                  className="font-bold text-[#0B192C] dark:text-white underline cursor-pointer"
                >
                  {selectedProperty.taxpayerName}
                </button>
              </p>
            </div>

            <div className="w-14 h-14 rounded-2xl bg-[#0B192C] text-[#B48327] flex flex-col items-center justify-center shrink-0 shadow-xs border border-[#B48327]/30">
              <Building2 className="w-6 h-6" />
              <span className="text-[9px] font-bold text-white mt-0.5">
                {archSummary.totalUnitsCount} وحدة
              </span>
            </div>
          </div>

          {/* 2. Reference Architectural Summary Strip (عدد الطوابق | البدروم | الشقق | المحلات | الملحقات) — 320px-safe */}
          <div className="grid grid-cols-5 gap-1.5 sm:gap-2 pt-3 border-t border-[#E2E8F0] dark:border-slate-800 text-center">
            <div className="px-1 py-2 sm:p-2.5 rounded-xl bg-[#F4F6F9] dark:bg-slate-900 border border-[#E2E8F0]/70 dark:border-slate-800">
              <div className="text-[10px] sm:text-[11px] text-[#64748B] font-semibold leading-tight">عدد الطوابق</div>
              <div className="text-sm sm:text-base font-extrabold text-[#172334] dark:text-white font-mono mt-0.5">
                {archSummary.floorsCount}
              </div>
            </div>
            <div className="px-1 py-2 sm:p-2.5 rounded-xl bg-[#F4F6F9] dark:bg-slate-900 border border-[#E2E8F0]/70 dark:border-slate-800">
              <div className="text-[10px] sm:text-[11px] text-[#64748B] font-semibold leading-tight">البدروم</div>
              <div className="text-xs sm:text-sm font-extrabold text-[#172334] dark:text-white mt-1">
                {archSummary.hasBasement ? 'نعم' : 'لا'}
              </div>
            </div>
            <div className="px-1 py-2 sm:p-2.5 rounded-xl bg-[#F4F6F9] dark:bg-slate-900 border border-[#E2E8F0]/70 dark:border-slate-800">
              <div className="text-[10px] sm:text-[11px] text-[#64748B] font-semibold leading-tight">الشقق</div>
              <div className="text-sm sm:text-base font-extrabold text-[#172334] dark:text-white font-mono mt-0.5">
                {archSummary.apartmentsCount}
              </div>
            </div>
            <div className="px-1 py-2 sm:p-2.5 rounded-xl bg-[#F4F6F9] dark:bg-slate-900 border border-[#E2E8F0]/70 dark:border-slate-800">
              <div className="text-[10px] sm:text-[11px] text-[#64748B] font-semibold leading-tight">المحلات</div>
              <div className="text-sm sm:text-base font-extrabold text-[#172334] dark:text-white font-mono mt-0.5">
                {archSummary.shopsCount}
              </div>
            </div>
            <div className="px-1 py-2 sm:p-2.5 rounded-xl bg-[#F4F6F9] dark:bg-slate-900 border border-[#E2E8F0]/70 dark:border-slate-800">
              <div className="text-[10px] sm:text-[11px] text-[#64748B] font-semibold leading-tight">الملحقات</div>
              <div className="text-sm sm:text-base font-extrabold text-[#172334] dark:text-white font-mono mt-0.5">
                {archSummary.annexesCount}
              </div>
            </div>
          </div>

          {selectedProperty.notes && (
            <div className="selectable-text text-xs text-[#64748B] dark:text-slate-300 bg-[#F4F6F9] dark:bg-slate-900/70 px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] dark:border-slate-800">
              <strong className="text-[#172334] dark:text-white">ملاحظات العقار:</strong>{' '}
              {selectedProperty.notes}
            </div>
          )}
        </div>

        {/* 3. Floors & Units Accordion Section (الطوابق والوحدات — مطابق للصورة المرجعية 4) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-extrabold text-[#172334] dark:text-white font-display flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-[#0B192C] dark:text-[#B48327]" />
              <span>الطوابق والوحدات ({propUnits.length} وحدة)</span>
            </h2>
            <button
              type="button"
              onClick={() => openAddUnitModal()}
              className="min-h-[38px] px-3.5 rounded-xl bg-[#0B192C] hover:bg-[#132A46] text-white text-xs font-bold flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-[#B48327]" />
              <span>إضافة وحدة</span>
            </button>
          </div>

          <div className="space-y-2.5">
            {floorGroups.map((group, idx) => {
              const expanded = isFloorExpanded(group.floorLabel, idx);
              return (
                <div
                  key={group.floorLabel}
                  className="rounded-2xl bg-white dark:bg-[#0D1829] border border-[#E2E8F0] dark:border-slate-800 overflow-hidden shadow-2xs"
                >
                  {/* Accordion Floor Header */}
                  <div
                    onClick={() => toggleFloorAccordion(group.floorLabel, idx)}
                    className="w-full px-4 py-3.5 bg-[#F4F6F9]/80 dark:bg-slate-900/80 flex items-center justify-between gap-2 cursor-pointer select-none hover:bg-[#F4F6F9] transition"
                  >
                    <div className="flex items-center gap-2">
                      {expanded ? (
                        <ChevronUp className="w-4 h-4 text-[#64748B]" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-[#64748B]" />
                      )}
                      <span className="text-xs sm:text-sm font-extrabold text-[#172334] dark:text-white font-display">
                        {group.floorLabel}
                      </span>
                    </div>

                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <span className="text-xs font-bold text-[#64748B] dark:text-slate-400">
                        ({group.units.length} {group.units.length === 1 ? 'وحدة' : 'وحدات'})
                      </span>
                      <button
                        type="button"
                        onClick={() => openAddUnitModal(group.floorLabel)}
                        title={`إضافة وحدة في ${group.floorLabel}`}
                        className="min-h-[30px] px-2.5 rounded-lg bg-white dark:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700 text-[11px] font-bold text-[#0B192C] dark:text-slate-200 hover:border-[#0B192C] flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3 h-3 text-[#B48327]" />
                        <span>وحدة</span>
                      </button>
                    </div>
                  </div>

                  {/* Accordion Floor Body */}
                  {expanded && (
                    <div className="p-3 space-y-2.5 border-t border-[#E2E8F0] dark:border-slate-800">
                      {group.units.length === 0 ? (
                        <div className="py-4 text-center text-xs text-[#64748B]">
                          لا توجد وحدات مسجلة في {group.floorLabel} بعد.{' '}
                          <button
                            type="button"
                            onClick={() => openAddUnitModal(group.floorLabel)}
                            className="font-bold text-[#0B192C] dark:text-[#B48327] underline cursor-pointer"
                          >
                            + إضافة وحدة في هذا الطابق
                          </button>
                        </div>
                      ) : (
                        group.units.map((unit) => {
                          const badgeStyle = OCCUPANCY_BADGE_STYLES[unit.occupancyStatus];
                          const rentInfo = getUnitRentDisplayInfo(unit);
                          const UnitIcon =
                            unit.unitType === 'shop'
                              ? Store
                              : unit.unitType === 'office'
                              ? Briefcase
                              : Home;

                          return (
                            <div
                              key={unit.id}
                              className="rounded-xl bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 p-3.5 flex items-center justify-between gap-3 shadow-2xs"
                            >
                              {/* Right Side: Unit Icon + Unit Number + Unit Type + Tenant Name */}
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-10 h-10 rounded-full bg-[#F4F6F9] dark:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700 flex items-center justify-center text-[#0B192C] dark:text-white shrink-0">
                                  <UnitIcon className="w-5 h-5 stroke-[1.8]" />
                                </div>
                                <div className="min-w-0">
                                  <div className="text-sm font-extrabold text-[#172334] dark:text-white leading-snug">
                                    {unit.unitNumber}
                                  </div>
                                  <div className="text-xs text-[#64748B] dark:text-slate-400 flex flex-wrap items-center gap-1.5 mt-0.5">
                                    <span>{UNIT_TYPE_LABELS[unit.unitType]}</span>
                                    {unit.occupancyStatus === 'occupied' && unit.tenantName && (
                                      <>
                                        <span>·</span>
                                        <span className="font-semibold text-[#172334] dark:text-slate-200">
                                          المستأجر: {unit.tenantName}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Left Side: Status Pill + Rent Value & Period + Edit/Delete Actions */}
                              <div className="flex items-center gap-3 shrink-0">
                                <div className="text-left">
                                  <span
                                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${badgeStyle.bg} ${badgeStyle.text} ${badgeStyle.border}`}
                                  >
                                    <span className={`w-1.5 h-1.5 rounded-full ${badgeStyle.dot}`} />
                                    {OCCUPANCY_STATUS_LABELS[unit.occupancyStatus]}
                                  </span>
                                  <div className="mt-1 text-xs font-mono font-extrabold text-[#172334] dark:text-white">
                                    {unit.occupancyStatus === 'occupied' ? (
                                      <>
                                        {rentInfo.activeRentAmount.toLocaleString('en-US')}{' '}
                                        <span className="text-[11px] font-sans font-semibold text-[#64748B]">
                                          {currencyLabel}
                                        </span>
                                        {rentInfo.periodLabel && (
                                          <span className="mr-1 text-[10px] font-sans font-bold text-[#B48327]">
                                            ({rentInfo.periodLabel})
                                          </span>
                                        )}
                                      </>
                                    ) : (
                                      <span className="text-[#64748B]">0 {currencyLabel}</span>
                                    )}
                                  </div>
                                </div>

                                <div className="flex flex-col gap-1 border-r border-[#E2E8F0] dark:border-slate-800 pr-2.5">
                                  <button
                                    type="button"
                                    onClick={() => openEditUnitModal(unit)}
                                    title="تعديل الوحدة وحالة الإشغال والإيجار"
                                    className="p-1.5 rounded-lg bg-[#F4F6F9] hover:bg-slate-200 dark:bg-slate-800 text-[#0B192C] dark:text-slate-200 cursor-pointer"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                  {(isOwner || canDeleteRecords) && (
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteUnit(unit)}
                                      title="حذف الوحدة"
                                      className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 text-rose-600 cursor-pointer"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 4. Standalone Unit Rentals Summary Card (ملخص إيجارات الوحدات المؤجرة حسب الفترة — مستقل عن الضرائب) */}
        <div className="rounded-2xl bg-white dark:bg-[#0D1829] border border-[#E2E8F0] dark:border-slate-800 p-4 sm:p-5 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-extrabold text-[#172334] dark:text-white font-display">
                ملخص الإيجارات (الوحدات المؤجرة فقط)
              </h3>
              <p className="text-[11px] text-[#64748B]">
                مستقل تمامًا عن قيمة العقد والمبالغ الضريبية المطلوبة والمدفوعة
              </p>
            </div>
            <div className="text-left">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#ECFDF5] dark:bg-emerald-950/40 border border-[#A7F3D0] text-xs font-extrabold text-[#059669]">
                <span className="font-mono">{rentalSummary.occupiedCount}</span>
                <span>وحدات مؤجرة نشطة</span>
              </div>
              <div className="text-[10px] text-[#64748B] mt-0.5">
                مصنفة حسب كل فترة إيجار أدناه
              </div>
            </div>
          </div>

          {/* Occupancy Breakdown Pills */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="p-2.5 rounded-xl bg-[#ECFDF5]/70 dark:bg-emerald-950/30 border border-[#A7F3D0]/60 flex items-center justify-between">
              <span className="font-bold text-[#059669]">مؤجرة</span>
              <span className="font-mono font-extrabold text-[#059669]">
                {rentalSummary.occupiedCount}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-[#FEF3C7]/60 dark:bg-amber-950/30 border border-amber-200 flex items-center justify-between">
              <span className="font-bold text-[#D97706]">شاغرة</span>
              <span className="font-mono font-extrabold text-[#D97706]">
                {rentalSummary.vacantCount}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-sky-50 dark:bg-sky-950/30 border border-sky-200 flex items-center justify-between">
              <span className="font-bold text-[#0284C7]">يستخدمها المالك</span>
              <span className="font-mono font-extrabold text-[#0284C7]">
                {rentalSummary.ownerUsedCount}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 flex items-center justify-between">
              <span className="font-bold text-slate-600 dark:text-slate-300">تحت الصيانة</span>
              <span className="font-mono font-extrabold text-slate-700 dark:text-slate-200">
                {rentalSummary.underMaintenanceCount}
              </span>
            </div>
          </div>

          {/* Breakdown by Rent Period */}
          <div className="pt-2 border-t border-[#E2E8F0] dark:border-slate-800">
            <div className="text-xs font-bold text-[#172334] dark:text-white mb-2">
              تفصيل إيجارات الوحدات المؤجرة حسب الفترة:
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              {(['monthly', 'quarterly', 'semi_annual', 'annual'] as RentPeriod[]).map((per) => (
                <div
                  key={per}
                  className="p-2.5 rounded-xl bg-[#F4F6F9] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800"
                >
                  <div className="flex items-center justify-between text-[11px] text-[#64748B]">
                    <span className="font-bold">{RENT_PERIOD_LABELS[per]}</span>
                    <span className="font-mono">({rentalSummary.byPeriod[per].count})</span>
                  </div>
                  <div className="font-mono font-extrabold text-[#172334] dark:text-white mt-1">
                    {rentalSummary.byPeriod[per].totalAmount.toLocaleString('en-US')}{' '}
                    <span className="text-[10px] font-sans text-[#64748B]">{currencyLabel}</span>
                  </div>
                </div>
              ))}
            </div>
            {rentalSummary.legacyUnclassifiedCount > 0 && (
              <div className="mt-2 p-2.5 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/80 text-[11px] text-amber-800 dark:text-amber-300 flex items-center justify-between">
                <span>
                  وحدات ذات تقدير سابق غير محدد الفترة ({rentalSummary.legacyUnclassifiedCount}{' '}
                  وحدة — يمكنك تعديل الوحدة لتحديد فترتها):
                </span>
                <span className="font-mono font-extrabold">
                  {rentalSummary.legacyUnclassifiedTotal.toLocaleString('en-US')} {currencyLabel}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 5. Tax & Financial Ledger Card (الحساب المالي والضريبي للعقار — منفصل عن الإيجارات) */}
        <div className="rounded-2xl bg-white dark:bg-[#0D1829] border border-[#E2E8F0] dark:border-slate-800 p-4 sm:p-5 shadow-2xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-extrabold text-[#172334] dark:text-white font-display flex items-center gap-1.5">
                <Wallet className="w-4 h-4 text-[#B48327]" />
                <span>المؤشرات المالية والالتزامات الضريبية للعقار</span>
              </h3>
              <p className="text-[11px] text-[#64748B]">
                المطلوب (قيمة العقد/الربط) والمدفوع والمتبقي على العقار
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setIsAssessmentModalOpen(true)}
                className="min-h-[36px] px-3 rounded-xl bg-[#F4F6F9] hover:bg-slate-200 dark:bg-slate-800 text-[#0B192C] dark:text-white text-xs font-bold cursor-pointer"
              >
                + إصدار تقييم
              </button>
              <button
                type="button"
                onClick={() => setActiveScreen('transactions')}
                className="min-h-[36px] px-3 rounded-xl bg-[#0B192C] text-white text-xs font-bold cursor-pointer"
              >
                تسجيل تحصيل
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2.5 text-xs">
            <div className="p-3 rounded-xl bg-[#F4F6F9] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800">
              <div className="text-[11px] text-[#64748B] font-semibold">المطلوب / قيمة العقد</div>
              <div className="text-sm sm:text-base font-mono font-extrabold text-[#172334] dark:text-white mt-1">
                {(totalAssessed + totalFees).toLocaleString('en-US')}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-[#ECFDF5]/60 dark:bg-emerald-950/30 border border-[#A7F3D0]/70">
              <div className="text-[11px] text-[#059669] font-semibold">المدفوع</div>
              <div className="text-sm sm:text-base font-mono font-extrabold text-[#059669] mt-1">
                {totalPaid.toLocaleString('en-US')}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200/70">
              <div className="text-[11px] text-rose-700 dark:text-rose-300 font-semibold">المتبقي</div>
              <div className="text-sm sm:text-base font-mono font-extrabold text-rose-600 dark:text-rose-400 mt-1">
                {remainingBalance.toLocaleString('en-US')}
              </div>
            </div>
          </div>

          {/* Field Visits & Appointments Quick Strip */}
          <div className="pt-3 border-t border-[#E2E8F0] dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-[#64748B]">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1 font-semibold">
                <ClipboardCheck className="w-3.5 h-3.5 text-[#0B192C] dark:text-sky-400" />
                الزيارات الميدانية: <strong>{propVisits.length}</strong>
              </span>
              <span>·</span>
              <span className="inline-flex items-center gap-1 font-semibold">
                <CalendarClock className="w-3.5 h-3.5 text-[#B48327]" />
                المواعيد: <strong>{propAppts.length}</strong>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveScreen('visits')}
                className="text-[#0B192C] dark:text-sky-400 font-bold hover:underline cursor-pointer"
              >
                فتح المحاضر
              </button>
              <span>·</span>
              <button
                type="button"
                onClick={() => setActiveScreen('appointments')}
                className="text-[#B48327] font-bold hover:underline cursor-pointer"
              >
                فتح المواعيد
              </button>
            </div>
          </div>
        </div>

        {/* Add / Edit Unit Modal */}
        {isUnitModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="w-full max-w-lg bg-white dark:bg-[#0D1829] rounded-t-3xl sm:rounded-3xl p-6 border border-[#E2E8F0] dark:border-slate-800 max-h-[90vh] overflow-y-auto space-y-4 shadow-xl">
              <h3 className="text-base font-extrabold text-[#0B192C] dark:text-white font-display">
                {editingUnit
                  ? `تعديل الوحدة «${editingUnit.unitNumber}» — ${selectedProperty.title}`
                  : `إضافة وحدة عقارية جديدة — ${selectedProperty.title}`}
              </h3>
              <form onSubmit={handleSaveUnit} className="space-y-3.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold mb-1">رقم / مسمى الوحدة *</label>
                    <input
                      type="text"
                      required
                      value={unitNumber}
                      onChange={(e) => setUnitNumber(e.target.value)}
                      placeholder="مثال: وحدة 1 أو شقة 101"
                      className="w-full min-h-[42px] px-3.5 rounded-xl bg-[#F4F6F9] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-700 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-1">الطابق *</label>
                    <select
                      value={floor}
                      onChange={(e) => setFloor(e.target.value)}
                      className="w-full min-h-[42px] px-3 rounded-xl bg-[#F4F6F9] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-700 text-xs font-semibold"
                    >
                      {!floorOptions.includes(floor) && (
                        <option value={floor}>
                          {floor ? `${floor} (القيمة المحفوظة)` : 'غير محدد (القيمة المحفوظة)'}
                        </option>
                      )}
                      {floorOptions.map((fl) => (
                        <option key={fl} value={fl}>
                          {fl}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold mb-1">نوع الوحدة *</label>
                    <select
                      value={unitType}
                      onChange={(e) => setUnitType(e.target.value as UnitType)}
                      className="w-full min-h-[42px] px-3 rounded-xl bg-[#F4F6F9] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-700 text-xs font-semibold"
                    >
                      {Object.entries(UNIT_TYPE_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-1">حالة الإشغال *</label>
                    <select
                      value={occupancyStatus}
                      onChange={(e) => setOccupancyStatus(e.target.value as OccupancyStatus)}
                      className="w-full min-h-[42px] px-3 rounded-xl bg-[#F4F6F9] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-700 text-xs font-semibold"
                    >
                      {Object.entries(OCCUPANCY_STATUS_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Rental Fields — Shown ONLY when unit is Rented (occupied) */}
                {occupancyStatus === 'occupied' ? (
                  <div className="p-3.5 rounded-2xl bg-[#ECFDF5]/60 dark:bg-emerald-950/25 border border-[#A7F3D0] dark:border-emerald-800/60 space-y-3">
                    <div className="text-xs font-extrabold text-[#059669] dark:text-emerald-300">
                      بيانات الإيجار للوحدة المؤجرة
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold mb-1">قيمة الإيجار *</label>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          required
                          value={rentAmount}
                          onChange={(e) => setRentAmount(e.target.value)}
                          placeholder="مثال: 15000"
                          className="w-full min-h-[42px] px-3.5 rounded-xl bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-700 text-xs font-mono font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold mb-1">فترة الإيجار *</label>
                        <select
                          value={rentPeriod}
                          onChange={(e) =>
                            setRentPeriod(e.target.value as RentPeriod | 'legacy_unclassified')
                          }
                          className="w-full min-h-[42px] px-3 rounded-xl bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-700 text-xs font-bold"
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
                      <label className="block text-xs font-bold mb-1">
                        اسم المستأجر (عند التوفر)
                      </label>
                      <input
                        type="text"
                        value={tenantName}
                        onChange={(e) => setTenantName(e.target.value)}
                        placeholder="اسم المستأجر الحالي..."
                        className="w-full min-h-[42px] px-3.5 rounded-xl bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-700 text-xs"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-[#F4F6F9] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 text-xs text-[#64748B]">
                    الوحدة في حالة «<strong>{OCCUPANCY_STATUS_LABELS[occupancyStatus]}</strong>» — لا
                    يُطلب إدخال إيجار حالي أو اسم مستأجر.
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold mb-1">المساحة التقريبية (م²)</label>
                    <input
                      type="number"
                      min="0"
                      value={unitArea}
                      onChange={(e) => setUnitArea(e.target.value)}
                      className="w-full min-h-[42px] px-3 rounded-xl bg-[#F4F6F9] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-700 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-1">ملاحظات الوحدة</label>
                    <input
                      type="text"
                      value={unitNotes}
                      onChange={(e) => setUnitNotes(e.target.value)}
                      className="w-full min-h-[42px] px-3 rounded-xl bg-[#F4F6F9] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-700 text-xs"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsUnitModalOpen(false);
                      setEditingUnit(null);
                    }}
                    className="min-h-[42px] px-4 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="min-h-[42px] px-5 rounded-xl bg-[#0B192C] text-white text-xs font-bold cursor-pointer"
                  >
                    {submitting ? 'جاري الحفظ...' : 'حفظ بيانات الوحدة'}
                  </button>
                </div>
              </form>
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
                هل أنت متأكد من حذف الوحدة «{confirmDeleteUnit.unitNumber}» من{' '}
                {confirmDeleteUnit.floor || 'العقار'}؟
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

        {/* Add Assessment Modal */}
        {isAssessmentModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="w-full max-w-lg bg-white dark:bg-[#0D1829] rounded-3xl p-6 border border-slate-200 dark:border-slate-800 space-y-4 shadow-xl">
              <h3 className="text-base font-bold text-[#0B192C] dark:text-white font-display">
                إصدار تقييم مالي — {selectedProperty.title}
              </h3>
              <form onSubmit={handleAddAssessment} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">
                      مبلغ التقييم ({workspace?.defaultCurrency || 'YER'}) *
                    </label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={assessmentAmount}
                      onChange={(e) => setAssessmentAmount(e.target.value)}
                      className="w-full min-h-[42px] px-3 rounded-xl bg-[#F4F6F9] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">تاريخ التقييم *</label>
                    <input
                      type="date"
                      required
                      value={assessmentDate}
                      onChange={(e) => setAssessmentDate(e.target.value)}
                      className="w-full min-h-[42px] px-3 rounded-xl bg-[#F4F6F9] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">الفترة الضريبية / البيان *</label>
                  <input
                    type="text"
                    required
                    value={periodLabel}
                    onChange={(e) => setPeriodLabel(e.target.value)}
                    className="w-full min-h-[42px] px-3 rounded-xl bg-[#F4F6F9] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">ملاحظات التقييم</label>
                  <textarea
                    rows={2}
                    value={assessmentNotes}
                    onChange={(e) => setAssessmentNotes(e.target.value)}
                    className="w-full p-3 rounded-xl bg-[#F4F6F9] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsAssessmentModalOpen(false)}
                    className="min-h-[42px] px-4 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="min-h-[42px] px-5 rounded-xl bg-[#0B192C] text-white text-xs font-bold cursor-pointer"
                  >
                    {submitting ? 'جاري الحفظ...' : 'حفظ التقييم'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Property Modal inside Details View */}
        {isFormOpen && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="w-full max-w-xl bg-white dark:bg-[#0D1829] rounded-t-3xl sm:rounded-3xl p-6 border border-[#E2E8F0] dark:border-slate-800 max-h-[90vh] overflow-y-auto shadow-xl">
              <h2 className="text-lg font-bold text-[#0B192C] dark:text-white mb-4 font-display">
                تعديل بيانات العقار وبنية الطوابق
              </h2>
              <form onSubmit={handleSaveProperty} className="space-y-3.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">اسم / مسمى العقار *</label>
                    <input
                      type="text"
                      required
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full min-h-[42px] px-3.5 rounded-xl bg-[#F4F6F9] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-700 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">الرمز المرجعي *</label>
                    <input
                      type="text"
                      required
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      className="w-full min-h-[42px] px-3.5 rounded-xl bg-[#F4F6F9] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-700 text-xs font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">المكلف / المالك المرتبط *</label>
                  <select
                    required
                    value={taxpayerId}
                    onChange={(e) => setTaxpayerId(e.target.value)}
                    className="w-full min-h-[42px] px-3.5 rounded-xl bg-[#F4F6F9] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-700 text-xs"
                  >
                    {taxpayers.map((tp) => (
                      <option key={tp.id} value={tp.id}>
                        {tp.fullName} ({tp.internalCode})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">نوع العقار</label>
                    <select
                      value={propertyType}
                      onChange={(e) => setPropertyType(e.target.value as PropertyType)}
                      className="w-full min-h-[42px] px-3 rounded-xl bg-[#F4F6F9] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-700 text-xs"
                    >
                      {Object.entries(PROPERTY_TYPE_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">الحالة</label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as PropertyStatus)}
                      className="w-full min-h-[42px] px-3 rounded-xl bg-[#F4F6F9] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-700 text-xs"
                    >
                      {Object.entries(PROPERTY_STATUS_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">المساحة (م²)</label>
                    <input
                      type="number"
                      min="0"
                      value={areaSqm}
                      onChange={(e) => setAreaSqm(e.target.value)}
                      className="w-full min-h-[42px] px-3 rounded-xl bg-[#F4F6F9] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-700 text-xs font-mono"
                    />
                  </div>
                </div>

                {/* Architectural Structure Inputs */}
                <div className="p-3.5 rounded-2xl bg-[#F4F6F9] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 space-y-3">
                  <div className="text-xs font-extrabold text-[#172334] dark:text-white">
                    بنية العقار وتوزيع الطوابق والوحدات
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-bold mb-1">عدد الطوابق *</label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={floorsCount}
                        onChange={(e) => setFloorsCount(e.target.value)}
                        className="w-full min-h-[38px] px-2.5 rounded-xl bg-white dark:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700 text-xs font-mono font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold mb-1">البدروم (القبو)</label>
                      <select
                        value={hasBasement ? 'yes' : 'no'}
                        onChange={(e) => setHasBasement(e.target.value === 'yes')}
                        className="w-full min-h-[38px] px-2.5 rounded-xl bg-white dark:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700 text-xs font-bold"
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
                        value={apartmentsCount}
                        onChange={(e) => setApartmentsCount(e.target.value)}
                        className="w-full min-h-[38px] px-2.5 rounded-xl bg-white dark:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold mb-1">عدد المحلات</label>
                      <input
                        type="number"
                        min="0"
                        value={shopsCount}
                        onChange={(e) => setShopsCount(e.target.value)}
                        className="w-full min-h-[38px] px-2.5 rounded-xl bg-white dark:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold mb-1">الملحقات</label>
                      <input
                        type="number"
                        min="0"
                        value={annexesCount}
                        onChange={(e) => setAnnexesCount(e.target.value)}
                        className="w-full min-h-[38px] px-2.5 rounded-xl bg-white dark:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700 text-xs font-mono"
                      />
                    </div>
                  </div>
                </div>

                <CascadingLocationSelector
                  region={region}
                  address={address}
                  onChange={({ region: nextReg, address: nextAddr }) => {
                    setRegion(nextReg);
                    setAddress(nextAddr);
                  }}
                  title="موقع العقار (المحافظة ← المديرية ← العزلة ← الحي ← الشارع)"
                  streetPlaceholder="اسم الشارع، رقم المبنى، أو المعلم القريب للعقار"
                  streetRequired
                />

                <div>
                  <label className="block text-xs font-semibold mb-1">ملاحظات إضافية</label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full p-3 rounded-xl bg-[#F4F6F9] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-700 text-xs"
                  />
                </div>

                <div className="flex justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsFormOpen(false)}
                    className="min-h-[42px] px-5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="min-h-[42px] px-6 rounded-xl bg-[#0B192C] text-white text-xs font-bold cursor-pointer"
                  >
                    {submitting ? 'جاري الحفظ...' : 'حفظ التعديلات'}
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
                سيقوم النظام بالتحقق من عدم وجود وحدات أو زيارات أو تقييمات أو معاملات مرتبطة بهذا
                العقار قبل تنفيذ الحذف النهائي وتوثيقه في سجل التدقيق.
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmDeletePropId(null)}
                  className="min-h-[44px] px-4 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold cursor-pointer"
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
                  className="min-h-[44px] px-5 rounded-xl bg-rose-600 text-white text-xs font-bold cursor-pointer"
                >
                  تأكيد الحذف
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ============================================================================
  // PROPERTIES DIRECTORY LIST VIEW (قائمة العقارات العامة)
  // ============================================================================
  return (
    <div className="space-y-4 pb-8 max-w-2xl mx-auto">
      {/* Header & Add Button */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-extrabold text-[#172334] dark:text-white font-display">
            العقارات والطوابق والوحدات
          </h1>
          <p className="text-xs text-[#64748B] dark:text-slate-400 mt-0.5">
            إجمالي العقارات: <span className="font-mono font-bold text-[#0B192C] dark:text-white">{properties.length}</span> · الوحدات:{' '}
            <span className="font-mono font-bold text-[#B48327]">{propertyUnits.length}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateForm}
          className="min-h-[44px] px-4 rounded-xl bg-[#0B192C] hover:bg-[#132A46] text-white text-xs font-bold flex items-center gap-1.5 shadow-2xs cursor-pointer transition-colors"
        >
          <Plus className="w-4 h-4 text-[#B48327]" />
          <span>إضافة عقار جديد</span>
        </button>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white dark:bg-[#0D1829] border border-[#E2E8F0] dark:border-slate-800 rounded-2xl p-3.5 space-y-3 shadow-2xs">
        <div className="relative">
          <Search className="w-4 h-4 text-[#64748B] absolute right-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ابحث باسم العقار، الرمز، اسم المكلف، أو الشارع..."
            className="w-full min-h-[42px] pr-10 pl-4 rounded-xl bg-[#F4F6F9] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-700 text-xs focus:outline-none focus:border-[#0B192C]"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="min-h-[38px] px-3 rounded-xl bg-[#F4F6F9] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-700 text-xs font-semibold"
          >
            <option value="all">جميع أنواع العقارات</option>
            {Object.entries(PROPERTY_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="min-h-[38px] px-3 rounded-xl bg-[#F4F6F9] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-700 text-xs font-semibold"
          >
            <option value="all">جميع الحالات</option>
            {Object.entries(PROPERTY_STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'title' | 'area' | 'units')}
            className="min-h-[38px] px-3 rounded-xl bg-[#F4F6F9] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-700 text-xs font-semibold"
          >
            <option value="title">الفرز: الاسم أبجديًا</option>
            <option value="units">الفرز: عدد الوحدات</option>
            <option value="area">الفرز: المساحة</option>
          </select>
        </div>
      </div>

      {/* Properties Cards List */}
      {filteredProperties.length === 0 ? (
        <div className="bg-white dark:bg-[#0D1829] border border-[#E2E8F0] dark:border-slate-800 rounded-2xl p-8 text-center shadow-2xs">
          <Building2 className="w-10 h-10 text-[#64748B] mx-auto mb-2.5" />
          <h3 className="text-sm font-bold text-[#172334] dark:text-white mb-1 font-display">
            لا توجد عقارات مطابقة للبحث
          </h3>
          <p className="text-xs text-[#64748B] dark:text-slate-400 mb-4 max-w-md mx-auto leading-relaxed">
            ابدأ بإضافة أول عقار وربطه بالمكلف التابع له وتحديد الطوابق والشقق والمحلات التجارية.
          </p>
          <button
            type="button"
            onClick={openCreateForm}
            className="min-h-[42px] px-5 rounded-xl bg-[#0B192C] text-white text-xs font-bold inline-flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4 text-[#B48327]" />
            <span>إضافة عقار الآن</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredProperties.map((prop) => {
            const pUnits = propertyUnits.filter((u) => u.propertyId === prop.id);
            const arch = getPropertyArchitecturalSummary(prop, pUnits);
            return (
              <div
                key={prop.id}
                onClick={() => {
                  setPropertyNavigationOrigin({ source: 'properties_list' });
                  setSelectedPropertyId(prop.id);
                }}
                className="bg-white dark:bg-[#0D1829] border border-[#E2E8F0] dark:border-slate-800 hover:border-[#0B192C]/40 rounded-2xl p-4 transition-all cursor-pointer shadow-2xs space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-[11px] text-[#64748B] mb-1">
                      <span className="font-mono font-bold text-[#0B192C] dark:text-sky-400">
                        {prop.code}
                      </span>
                      <span>·</span>
                      <span>{PROPERTY_TYPE_LABELS[prop.propertyType]}</span>
                      <span>·</span>
                      <span className="text-[#059669] font-bold">
                        {PROPERTY_STATUS_LABELS[prop.status]}
                      </span>
                    </div>
                    <h3 className="text-[15px] font-extrabold text-[#172334] dark:text-white font-display">
                      {prop.title}
                    </h3>
                    <p className="text-xs text-[#64748B] mt-0.5 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-[#B48327] shrink-0" />
                      <span className="truncate">
                        {prop.region} - {prop.address}
                      </span>
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-[#F4F6F9] dark:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700 text-[#0B192C] dark:text-white flex items-center justify-center shrink-0">
                    <Building2 className="w-5 h-5" />
                  </div>
                </div>

                <div className="pt-2.5 border-t border-[#E2E8F0] dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-[#172334] dark:text-slate-200">
                    المكلف: {prop.taxpayerName}
                  </span>
                  <div className="flex items-center gap-2 text-[11px] font-bold text-[#64748B]">
                    <span>{arch.floorsCount} طوابق</span>
                    <span>·</span>
                    <span className="text-[#0B192C] dark:text-white">
                      {arch.totalUnitsCount} وحدات
                    </span>
                    {arch.apartmentsCount > 0 && (
                      <>
                        <span>·</span>
                        <span>{arch.apartmentsCount} شقة</span>
                      </>
                    )}
                    {arch.shopsCount > 0 && (
                      <>
                        <span>·</span>
                        <span>{arch.shopsCount} محل</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Property Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-xl bg-white dark:bg-[#0D1829] rounded-t-3xl sm:rounded-3xl p-6 border border-[#E2E8F0] dark:border-slate-800 max-h-[90vh] overflow-y-auto shadow-xl">
            <h2 className="text-lg font-bold text-[#0B192C] dark:text-white mb-4 font-display">
              {editingProperty ? 'تعديل بيانات العقار' : 'إضافة عقار جديد وتحديد الطوابق والوحدات'}
            </h2>

            <form onSubmit={handleSaveProperty} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">اسم / مسمى العقار *</label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="مثال: عقار تجاري - حدة"
                    className="w-full min-h-[42px] px-3.5 rounded-xl bg-[#F4F6F9] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-700 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">الرمز المرجعي للعقار *</label>
                  <input
                    type="text"
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="w-full min-h-[42px] px-3.5 rounded-xl bg-[#F4F6F9] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-700 text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">المكلف / المالك المرتبط *</label>
                <select
                  required
                  value={taxpayerId}
                  onChange={(e) => {
                    const nextTpId = e.target.value;
                    setTaxpayerId(nextTpId);
                    if (!editingProperty) {
                      const tp = taxpayers.find((t) => t.id === nextTpId);
                      if (tp) {
                        if (tp.region) setRegion(tp.region);
                        if (tp.address) setAddress(tp.address);
                      }
                    }
                  }}
                  className="w-full min-h-[42px] px-3.5 rounded-xl bg-[#F4F6F9] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-700 text-xs"
                >
                  {taxpayers.map((tp) => (
                    <option key={tp.id} value={tp.id}>
                      {tp.fullName} ({tp.internalCode})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">نوع العقار</label>
                  <select
                    value={propertyType}
                    onChange={(e) => setPropertyType(e.target.value as PropertyType)}
                    className="w-full min-h-[42px] px-3 rounded-xl bg-[#F4F6F9] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-700 text-xs"
                  >
                    {Object.entries(PROPERTY_TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">الحالة</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as PropertyStatus)}
                    className="w-full min-h-[42px] px-3 rounded-xl bg-[#F4F6F9] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-700 text-xs"
                  >
                    {Object.entries(PROPERTY_STATUS_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">المساحة (م²)</label>
                  <input
                    type="number"
                    min="0"
                    value={areaSqm}
                    onChange={(e) => setAreaSqm(e.target.value)}
                    className="w-full min-h-[42px] px-3 rounded-xl bg-[#F4F6F9] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-700 text-xs font-mono"
                  />
                </div>
              </div>

              {/* Building Floors, Basement, Apartments, Shops, and Annexes */}
              <div className="p-3.5 rounded-2xl bg-[#F4F6F9] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 space-y-3">
                <div className="text-xs font-extrabold text-[#172334] dark:text-white">
                  بنية العقار وتوزيع الطوابق والوحدات
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-bold mb-1">عدد الطوابق *</label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={floorsCount}
                      onChange={(e) => setFloorsCount(e.target.value)}
                      className="w-full min-h-[38px] px-2.5 rounded-xl bg-white dark:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700 text-xs font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold mb-1">البدروم (القبو)</label>
                    <select
                      value={hasBasement ? 'yes' : 'no'}
                      onChange={(e) => setHasBasement(e.target.value === 'yes')}
                      className="w-full min-h-[38px] px-2.5 rounded-xl bg-white dark:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700 text-xs font-bold"
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
                      value={apartmentsCount}
                      onChange={(e) => setApartmentsCount(e.target.value)}
                      className="w-full min-h-[38px] px-2.5 rounded-xl bg-white dark:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold mb-1">عدد المحلات</label>
                    <input
                      type="number"
                      min="0"
                      value={shopsCount}
                      onChange={(e) => setShopsCount(e.target.value)}
                      className="w-full min-h-[38px] px-2.5 rounded-xl bg-white dark:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold mb-1">الملحقات</label>
                    <input
                      type="number"
                      min="0"
                      value={annexesCount}
                      onChange={(e) => setAnnexesCount(e.target.value)}
                      className="w-full min-h-[38px] px-2.5 rounded-xl bg-white dark:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700 text-xs font-mono"
                    />
                  </div>
                </div>
              </div>

              <CascadingLocationSelector
                region={region}
                address={address}
                onChange={({ region: nextReg, address: nextAddr }) => {
                  setRegion(nextReg);
                  setAddress(nextAddr);
                }}
                title="موقع العقار (المحافظة ← المديرية ← العزلة ← الحي ← الشارع)"
                streetPlaceholder="اسم الشارع، رقم المبنى، أو المعلم القريب للعقار"
                streetRequired
              />

              <div>
                <label className="block text-xs font-semibold mb-1">ملاحظات إضافية</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full p-3 rounded-xl bg-[#F4F6F9] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-700 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="min-h-[44px] px-5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-[44px] px-6 rounded-xl bg-[#0B192C] text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  {submitting ? 'جاري الحفظ...' : 'حفظ بيانات العقار'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
