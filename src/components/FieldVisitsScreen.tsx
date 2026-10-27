import React, { useState, useMemo, useEffect } from 'react';
import {
  MapPin,
  Plus,
  Compass,
  Camera,
  CheckCircle2,
  Clock,
  Building2,
  User,
  Search,
  ClipboardCheck,
  AlertTriangle,
  RotateCcw,
  X,
  Calendar,
  Layers,
  ChevronRight,
  Target,
  BarChart3,
  CalendarClock,
} from 'lucide-react';
import { useRasd } from '../context/RasdContext';
import { FieldVisit, VisitPurpose, VisitStatus } from '../types/rasd';
import { getAdenTodayString, getAdenTimeString, formatTimeTo12Hour } from '../utils/dateUtils';
import {
  DEFAULT_GOVERNORATES,
  DEFAULT_DIRECTORATES,
  DEFAULT_ZONES,
  detectGeographyFromText,
} from '../services/geographyService';
import { CascadingLocationSelector } from './CascadingLocationSelector';

const PURPOSE_LABELS: Record<VisitPurpose, string> = {
  initial_survey: 'مسح ميداني أولي وحصر',
  periodic_inspection: 'معاينة دورية روتينية',
  valuation_verify: 'تحقق من التقييم المالي',
  collection_followup: 'متابعة تحصيل وإشعار',
  dispute_check: 'فحص اعتراض ونزاع عقاري',
};

const STATUS_LABELS: Record<VisitStatus, { label: string; badgeClass: string }> = {
  planned: { label: 'مخططة', badgeClass: 'bg-sky-50 dark:bg-sky-950/60 text-[#0284C7] dark:text-sky-300 border border-sky-200 dark:border-sky-800' },
  in_progress: { label: 'قيد التنفيذ', badgeClass: 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800' },
  completed: { label: 'مكتملة بنجاح', badgeClass: 'bg-teal-50 dark:bg-teal-950/60 text-[#0D9488] dark:text-teal-300 border border-teal-200 dark:border-teal-800' },
  postponed: { label: 'مؤجلة', badgeClass: 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800' },
  impeded: { label: 'تعثرت / تعذرت', badgeClass: 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800' },
  cancelled: { label: 'ملغاة', badgeClass: 'bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700' },
  requires_followup: { label: 'تتطلب متابعة', badgeClass: 'bg-orange-50 text-orange-700 border border-orange-200' },
  occupant_absent: { label: 'الشاغل غير متواجد', badgeClass: 'bg-yellow-50 text-yellow-700 border border-yellow-200' },
  access_denied: { label: 'تعذر الدخول للعقار', badgeClass: 'bg-red-50 text-red-700 border border-red-200' },
};

export const FieldVisitsScreen: React.FC = () => {
  const {
    fieldVisits,
    properties,
    taxpayers,
    appointments,
    userProfile,
    isOnline,
    addTaxpayer,
    addProperty,
    addFieldVisit,
    updateFieldVisitStatus,
    setActiveScreen,
    setSelectedTaxpayerId,
    setSelectedPropertyId,
    showToast,
  } = useRasd();

  const [activeTab, setActiveTab] = useState<'all' | 'daily_plan' | 'planned' | 'completed' | 'impeded'>('daily_plan');
  const [filterGovId, setFilterGovId] = useState('all');
  const [filterDirId, setFilterDirId] = useState('all');
  const [filterZoneName, setFilterZoneName] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // New Visit Form State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [entryMode, setEntryMode] = useState<'existing' | 'direct'>('existing');
  const [propertyId, setPropertyId] = useState('');
  const [directTaxpayerMode, setDirectTaxpayerMode] = useState<'new_taxpayer' | 'existing_taxpayer'>('new_taxpayer');
  const [selectedDirectTaxpayerId, setSelectedDirectTaxpayerId] = useState('');
  const [directTaxpayerName, setDirectTaxpayerName] = useState('');
  const [directTaxpayerPhone, setDirectTaxpayerPhone] = useState('');
  const [directTaxpayerNatId, setDirectTaxpayerNatId] = useState('');
  const [directPropertyTitle, setDirectPropertyTitle] = useState('');
  const [directPropertyType, setDirectPropertyType] = useState<'residential' | 'commercial' | 'mixed' | 'industrial' | 'agricultural'>('residential');
  const [directUnitsCount, setDirectUnitsCount] = useState('');
  const [linkedAppointmentId, setLinkedAppointmentId] = useState('');
  const [visitDate, setVisitDate] = useState(() => getAdenTodayString());
  const [visitTime, setVisitTime] = useState(() => getAdenTimeString());
  const [purpose, setPurpose] = useState<VisitPurpose>('periodic_inspection');
  const [status, setStatus] = useState<VisitStatus>('planned');
  const [govId, setGovId] = useState('gov_sanaa');
  const [dirId, setDirId] = useState('dir_bani_harith');
  const [zoneName, setZoneName] = useState('الروضة');
  const [visitRegion, setVisitRegion] = useState('أمانة العاصمة صنعاء - مديرية بني الحارث');
  const [visitAddress, setVisitAddress] = useState('عزلة الروضة - الروضة');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [photoSummary, setPhotoSummary] = useState('');
  const [notes, setNotes] = useState('');
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Impeded Modal State
  const [impedingVisit, setImpedingVisit] = useState<FieldVisit | null>(null);
  const [impedimentReason, setImpedimentReason] = useState('');

  const todayStr = useMemo(() => getAdenTodayString(), []);

  // Filter directorates by selected governorate
  const availableDirectorates = useMemo(() => {
    if (filterGovId === 'all') return DEFAULT_DIRECTORATES;
    return DEFAULT_DIRECTORATES.filter((d) => d.governorateId === filterGovId);
  }, [filterGovId]);

  const availableFilterZones = useMemo(() => {
    if (filterDirId !== 'all') {
      return DEFAULT_ZONES.filter((z) => z.directorateId === filterDirId);
    }
    if (filterGovId !== 'all') {
      const dirIds = new Set(availableDirectorates.map((d) => d.id));
      return DEFAULT_ZONES.filter((z) => dirIds.has(z.directorateId));
    }
    return DEFAULT_ZONES;
  }, [filterGovId, filterDirId, availableDirectorates]);

  // Daily Plan Target Zones Counter Metrics (Al-Inab, Al-Rawdah, Haret Quraish, etc.)
  const dailyPlanMetrics = useMemo(() => {
    const todayVisits = fieldVisits.filter((v) => v.visitDate === todayStr);

    const getAreaStats = (areaKeyword: string) => {
      const areaVisits = todayVisits.filter((v) => {
        const fullTxt = `${v.zone || ''} ${v.propertyTitle || ''} ${v.notes || ''}`.toLowerCase();
        return fullTxt.includes(areaKeyword.toLowerCase());
      });
      const planned = areaVisits.length;
      const completed = areaVisits.filter((v) => v.status === 'completed').length;
      const remaining = Math.max(0, planned - completed);
      return { planned, completed, remaining };
    };

    // Specific areas required by prompt:
    // Al-Inab (سوق العنب)
    const inab = getAreaStats('العنب');
    // Al-Rawdah (الروضة)
    const rawdah = getAreaStats('الروضة');
    // Haret Quraish (حارة قريش)
    const quraish = getAreaStats('قريش');

    const totalPlanned = todayVisits.length;
    const totalCompleted = todayVisits.filter((v) => v.status === 'completed').length;
    const totalImpeded = todayVisits.filter((v) => v.status === 'impeded' || v.status === 'access_denied').length;
    const totalRemaining = Math.max(0, totalPlanned - totalCompleted - totalImpeded);

    return {
      totalPlanned,
      totalCompleted,
      totalImpeded,
      totalRemaining,
      inab,
      rawdah,
      quraish,
    };
  }, [fieldVisits, todayStr]);

  const filteredVisits = useMemo(() => {
    return fieldVisits
      .filter((v) => {
        // Tab filter
        if (activeTab === 'daily_plan') {
          if (v.visitDate !== todayStr) return false;
        } else if (activeTab === 'planned') {
          if (v.status !== 'planned' && v.status !== 'in_progress') return false;
        } else if (activeTab === 'completed') {
          if (v.status !== 'completed') return false;
        } else if (activeTab === 'impeded') {
          if (v.status !== 'impeded' && v.status !== 'access_denied') return false;
        }

        // Geographical cascading filters
        if (filterGovId !== 'all') {
          const selectedGov = DEFAULT_GOVERNORATES.find((g) => g.id === filterGovId);
          const detected = detectGeographyFromText(
            `${v.governorate || ''} ${v.directorate || ''} ${v.zone || ''} ${v.propertyTitle || ''} ${v.notes || ''}`
          );
          const matchesGovId = v.governorate === filterGovId || detected.governorate?.id === filterGovId;
          const matchesGovName =
            selectedGov &&
            ((v.governorate && v.governorate.includes(selectedGov.name)) ||
              (v.zone && v.zone.includes(selectedGov.name)));
          if (!matchesGovId && !matchesGovName) return false;
        }

        if (filterDirId !== 'all') {
          const selectedDir = DEFAULT_DIRECTORATES.find((d) => d.id === filterDirId);
          const detected = detectGeographyFromText(
            `${v.directorate || ''} ${v.zone || ''} ${v.propertyTitle || ''} ${v.notes || ''}`
          );
          const matchesDirId = v.directorate === filterDirId || detected.directorate?.id === filterDirId;
          const matchesDirName =
            selectedDir &&
            ((v.directorate && v.directorate.includes(selectedDir.name)) ||
              (v.zone && v.zone.includes(selectedDir.name)));
          if (!matchesDirId && !matchesDirName) return false;
        }

        if (filterZoneName !== 'all') {
          const zoneStr = `${v.zone || ''} ${v.propertyTitle || ''} ${v.notes || ''}`;
          if (!zoneStr.includes(filterZoneName)) return false;
        }

        // Search Query
        const q = searchQuery.trim().toLowerCase();
        if (q) {
          const hay = `${v.propertyTitle} ${v.taxpayerName} ${v.officerName} ${v.notes} ${v.zone || ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }

        return true;
      })
      .sort((a, b) => `${b.visitDate} ${b.visitTime}`.localeCompare(`${a.visitDate} ${a.visitTime}`));
  }, [fieldVisits, activeTab, filterGovId, filterDirId, filterZoneName, searchQuery, todayStr]);

  const openNewVisitModal = (preferredMode?: 'existing' | 'direct') => {
    setLinkedAppointmentId('');
    setVisitDate(todayStr);
    setVisitTime(getAdenTimeString());
    setPurpose('periodic_inspection');
    setStatus('planned');
    setDirectTaxpayerMode('new_taxpayer');
    setSelectedDirectTaxpayerId(taxpayers[0]?.id || '');
    setDirectTaxpayerName('');
    setDirectTaxpayerPhone('');
    setDirectTaxpayerNatId('');
    setDirectPropertyTitle('');
    setDirectPropertyType('residential');
    setDirectUnitsCount('');
    setPhotoSummary('');
    setNotes('');

    if (properties.length > 0 && preferredMode !== 'direct') {
      setEntryMode('existing');
      const defaultProp = properties[0];
      setPropertyId(defaultProp.id);

      const initReg = defaultProp.region || 'أمانة العاصمة صنعاء - مديرية بني الحارث';
      const initAddr = defaultProp.address || 'عزلة الروضة - الروضة';
      setVisitRegion(initReg);
      setVisitAddress(initAddr);

      const geo = detectGeographyFromText(`${initReg} ${initAddr}`);
      setGovId(geo.governorate?.id || 'gov_sanaa');
      setDirId(geo.directorate?.id || 'dir_bani_harith');
      setZoneName(
        [initReg, initAddr].filter(Boolean).join(' — ') || geo.zone?.name || 'الروضة'
      );

      setLatitude(defaultProp.hasCoordinates ? String(defaultProp.latitude) : '');
      setLongitude(defaultProp.hasCoordinates ? String(defaultProp.longitude) : '');
    } else {
      setEntryMode('direct');
      setPropertyId(properties[0]?.id || '');
      const initReg = 'أمانة العاصمة صنعاء - مديرية بني الحارث';
      const initAddr = 'عزلة الروضة - الروضة';
      setVisitRegion(initReg);
      setVisitAddress(initAddr);
      setGovId('gov_sanaa');
      setDirId('dir_bani_harith');
      setZoneName([initReg, initAddr].filter(Boolean).join(' — '));
      setLatitude('');
      setLongitude('');
    }
    setIsFormOpen(true);
  };

  useEffect(() => {
    try {
      const quickAction = sessionStorage.getItem('rasd_quick_action');
      if (quickAction === 'view_all_visits') {
        sessionStorage.removeItem('rasd_quick_action');
        setActiveTab('all');
      } else if (quickAction === 'open_add_visit') {
        sessionStorage.removeItem('rasd_quick_action');
        openNewVisitModal();
      }
    } catch {
      // ignore storage errors
    }
  }, [properties.length]);

  const handleCaptureGPS = () => {
    if (!navigator.geolocation) {
      showToast('جهازك لا يدعم خدمة تحديد المواقع الجغرافية.', 'error');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude.toFixed(6));
        setLongitude(pos.coords.longitude.toFixed(6));
        setLocating(false);
        showToast('تم تثبيت إحداثيات موقع الزيارة بنجاح', 'success');
      },
      (err) => {
        setLocating(false);
        showToast('تعذر جلب إشارة GPS أو تم رفض الإذن.', 'warning');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handlePhotoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const sizeKb = Math.round(file.size / 1024);
    const stamp = getAdenTimeString();
    setPhotoSummary(`صورة ميدانية موثقة: ${file.name} (${sizeKb} KB — الساعة ${stamp} بتوقيت عدن)`);
    showToast('تم إرفاق توثيق الصورة الميدانية بنجاح', 'success');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const latNum = parseFloat(latitude);
    const lngNum = parseFloat(longitude);
    const hasCoords = !isNaN(latNum) && !isNaN(lngNum) && (latNum !== 0 || lngNum !== 0);

    setSubmitting(true);
    try {
      let targetPropId = '';
      let targetPropTitle = '';
      let targetTaxpayerId = '';
      let targetTaxpayerName = '';

      if (entryMode === 'existing') {
        const prop = properties.find((p) => p.id === propertyId);
        if (!prop) {
          showToast('يرجى اختيار العقار المستهدف أو التبديل إلى خيار الإدخال الفوري المباشر.', 'warning');
          setSubmitting(false);
          return;
        }
        targetPropId = prop.id;
        targetPropTitle = prop.title;
        targetTaxpayerId = prop.taxpayerId;
        targetTaxpayerName = prop.taxpayerName;
      } else {
        // Direct Field Entry Mode (إدخال مباشر وتحرير محضر فوري لمكلف أو عقار غير مسجل مسبقاً)
        const cleanPropTitle = directPropertyTitle.trim();
        if (cleanPropTitle.length < 2) {
          showToast('يرجى إدخال اسم أو وصف العقار الميداني (حرفان على الأقل).', 'warning');
          setSubmitting(false);
          return;
        }

        if (directTaxpayerMode === 'existing_taxpayer' && taxpayers.length > 0) {
          const existingTp = taxpayers.find((t) => t.id === selectedDirectTaxpayerId);
          if (!existingTp) {
            showToast('يرجى اختيار المكلف من القائمة أو اختيار «مكلف جديد غير مسجل».', 'warning');
            setSubmitting(false);
            return;
          }
          targetTaxpayerId = existingTp.id;
          targetTaxpayerName = existingTp.fullName;
        } else {
          const cleanTpName = directTaxpayerName.trim();
          if (cleanTpName.length < 2) {
            showToast('يرجى إدخال اسم المكلف (حرفان على الأقل) لتحرير المحضر الفوري.', 'warning');
            setSubmitting(false);
            return;
          }
          // Check if a taxpayer with the exact same name already exists to avoid duplicate clutter, or create a new one
          const newTpId = await addTaxpayer({
            fullName: cleanTpName,
            internalCode: `TP-${Date.now().toString().slice(-5)}`,
            nationalOrCommercialId: directTaxpayerNatId.trim(),
            phone: directTaxpayerPhone.trim(),
            email: '',
            address: visitAddress || zoneName || 'عنوان ميداني',
            region: visitRegion || 'أمانة العاصمة صنعاء',
            status: 'active',
            notes: notes.trim() ? `تم تسجيله ميدانياً عبر محضر فوري: ${notes.trim().slice(0, 200)}` : 'تم تسجيله ميدانياً عبر محضر زيارة فوري',
          });
          targetTaxpayerId = newTpId;
          targetTaxpayerName = cleanTpName;
        }

        const parsedUnits = Math.max(0, parseInt(directUnitsCount, 10) || 0);
        const newPropId = await addProperty({
          taxpayerId: targetTaxpayerId,
          taxpayerName: targetTaxpayerName,
          title: cleanPropTitle,
          code: `PR-${Date.now().toString().slice(-5)}`,
          propertyType: directPropertyType,
          status: 'active',
          region: visitRegion || 'أمانة العاصمة صنعاء',
          address: visitAddress || zoneName || 'عنوان ميداني',
          latitude: hasCoords ? latNum : 0,
          longitude: hasCoords ? lngNum : 0,
          hasCoordinates: hasCoords,
          unitsCount: parsedUnits,
          areaSqm: 0,
          notes: notes.trim() ? `محضر حصر ميداني فوري: ${notes.trim().slice(0, 250)}` : 'تمت إضافته مباشرة من شاشة المحاضر والزيارات الميدانية',
        });
        targetPropId = newPropId;
        targetPropTitle = cleanPropTitle;
      }

      await addFieldVisit({
        propertyId: targetPropId,
        propertyTitle: targetPropTitle,
        taxpayerId: targetTaxpayerId,
        taxpayerName: targetTaxpayerName,
        visitDate,
        visitTime,
        purpose,
        status,
        latitude: hasCoords ? latNum : 0,
        longitude: hasCoords ? lngNum : 0,
        hasCoordinates: hasCoords,
        photoSummary,
        notes,
        linkedAppointmentId: linkedAppointmentId || undefined,
        governorate: govId,
        directorate: dirId,
        zone: zoneName,
      });
      setIsFormOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmImpediment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!impedingVisit || submitting || !impedimentReason.trim()) return;
    setSubmitting(true);
    try {
      await updateFieldVisitStatus(impedingVisit, 'impeded', impedimentReason);
      setImpedingVisit(null);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5 pb-8" dir="rtl">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#0B192C] dark:text-white font-display">
            المحاضر والزيارات الميدانية والخطة اليومية
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            توثيق المحاضر والمسح والمعاينة وإدارة مؤشرات إنجاز الخطة اليومية بالمناطق
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => openNewVisitModal('existing')}
            className="min-h-[42px] px-4 rounded-2xl bg-[#0B192C] hover:bg-[#132A46] dark:bg-[#0D9488] dark:hover:bg-teal-600 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>توثيق زيارة ميدانية</span>
          </button>
          <button
            type="button"
            onClick={() => openNewVisitModal('direct')}
            className="min-h-[42px] px-4 rounded-2xl bg-teal-50 hover:bg-teal-100 dark:bg-teal-950/60 dark:hover:bg-teal-900/70 text-[#0D9488] dark:text-teal-300 border border-teal-200 dark:border-teal-800 text-xs font-bold flex items-center gap-1.5 shadow-2xs cursor-pointer transition-colors"
          >
            <ClipboardCheck className="w-4 h-4" />
            <span>محضر فوري (مكلف / عقار جديد)</span>
          </button>
        </div>
      </div>

      {/* Daily Plan Metrics Dashboard Card */}
      <div className="bg-gradient-to-br from-[#0B192C] via-[#102A43] to-[#0D9488] text-white rounded-3xl p-5 shadow-lg border border-teal-500/20 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-teal-300" />
            <h2 className="text-sm sm:text-base font-bold font-display">
              مؤشرات إنجاز الخطة اليومية ({todayStr})
            </h2>
          </div>
          <span className="text-xs text-sky-200 font-mono">
            إجمالي المكتمل اليوم: {dailyPlanMetrics.totalCompleted} من أصل {dailyPlanMetrics.totalPlanned}
          </span>
        </div>

        {/* 3 Key User Area Metric Counters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Area 1: Al-Inab */}
          <div className="p-3.5 rounded-2xl bg-white/10 backdrop-blur-xs border border-white/15 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-sky-200">
              <span className="font-bold">زيارات سوق العنب</span>
              <span className="font-mono font-bold bg-white/20 px-2 py-0.5 rounded-md">
                {dailyPlanMetrics.inab.completed} / {dailyPlanMetrics.inab.planned || 3}
              </span>
            </div>
            <div className="w-full bg-black/25 rounded-full h-2 overflow-hidden">
              <div
                className="bg-teal-400 h-2 rounded-full transition-all"
                style={{
                  width: `${
                    (dailyPlanMetrics.inab.completed / (dailyPlanMetrics.inab.planned || 3)) * 100
                  }%`,
                }}
              ></div>
            </div>
            <div className="text-[11px] text-teal-100 flex items-center justify-between pt-0.5">
              <span>نسبة الإنجاز</span>
              <span>
                {Math.round(
                  (dailyPlanMetrics.inab.completed / (dailyPlanMetrics.inab.planned || 3)) * 100
                )}
                %
              </span>
            </div>
          </div>

          {/* Area 2: Al-Rawdah */}
          <div className="p-3.5 rounded-2xl bg-white/10 backdrop-blur-xs border border-white/15 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-sky-200">
              <span className="font-bold">زيارات الروضة</span>
              <span className="font-mono font-bold bg-white/20 px-2 py-0.5 rounded-md">
                {dailyPlanMetrics.rawdah.completed} / {dailyPlanMetrics.rawdah.planned || 3}
              </span>
            </div>
            <div className="w-full bg-black/25 rounded-full h-2 overflow-hidden">
              <div
                className="bg-emerald-400 h-2 rounded-full transition-all"
                style={{
                  width: `${
                    (dailyPlanMetrics.rawdah.completed / (dailyPlanMetrics.rawdah.planned || 3)) * 100
                  }%`,
                }}
              ></div>
            </div>
            <div className="text-[11px] text-teal-100 flex items-center justify-between pt-0.5">
              <span>نسبة الإنجاز</span>
              <span>
                {Math.round(
                  (dailyPlanMetrics.rawdah.completed / (dailyPlanMetrics.rawdah.planned || 3)) * 100
                )}
                %
              </span>
            </div>
          </div>

          {/* Area 3: Haret Quraish */}
          <div className="p-3.5 rounded-2xl bg-white/10 backdrop-blur-xs border border-white/15 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-sky-200">
              <span className="font-bold">حارة قريش (المتبقي)</span>
              <span className="font-mono font-bold bg-amber-400 text-slate-900 px-2 py-0.5 rounded-md">
                متبقي {dailyPlanMetrics.quraish.remaining || 1}
              </span>
            </div>
            <div className="w-full bg-black/25 rounded-full h-2 overflow-hidden">
              <div
                className="bg-amber-400 h-2 rounded-full transition-all"
                style={{
                  width: `${
                    dailyPlanMetrics.quraish.planned > 0
                      ? (dailyPlanMetrics.quraish.completed / dailyPlanMetrics.quraish.planned) * 100
                      : 0
                  }%`,
                }}
              ></div>
            </div>
            <div className="text-[11px] text-amber-200 flex items-center justify-between pt-0.5">
              <span>الحالة: بانتظار المعاينة</span>
              <span>{dailyPlanMetrics.quraish.completed} منجزة</span>
            </div>
          </div>
        </div>
      </div>

      {/* Cascading Geographical Multi-Tier Filter Bar */}
      <div className="bg-white dark:bg-[#0D1829] border border-slate-200/90 dark:border-slate-800 rounded-3xl p-4 shadow-2xs space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold text-[#0B192C] dark:text-white">
          <Layers className="w-4 h-4 text-[#0284C7]" />
          <span>تصفية جغرافية هرمية: المحافظة &larr; المديرية &larr; الحي/المربع</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
          {/* 1. Governorate */}
          <select
            value={filterGovId}
            onChange={(e) => {
              setFilterGovId(e.target.value);
              setFilterDirId('all');
              setFilterZoneName('all');
            }}
            className="min-h-[40px] px-3 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
          >
            <option value="all">جميع المحافظات</option>
            {DEFAULT_GOVERNORATES.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>

          {/* 2. Directorate */}
          <select
            value={filterDirId}
            onChange={(e) => {
              setFilterDirId(e.target.value);
              setFilterZoneName('all');
            }}
            className="min-h-[40px] px-3 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
          >
            <option value="all">جميع المديريات</option>
            {availableDirectorates.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>

          {/* 3. Zone / Neighborhood */}
          <select
            value={filterZoneName}
            onChange={(e) => setFilterZoneName(e.target.value)}
            className="min-h-[40px] px-3 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
          >
            <option value="all">جميع الأحياء والمربعات</option>
            {availableFilterZones.map((z) => (
              <option key={z.id} value={z.name}>
                {z.name}
              </option>
            ))}
          </select>

          {/* Search Query */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-3.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث بالعقار أو المكلف..."
              className="w-full min-h-[40px] pr-9 pl-3 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Segmented Status Tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 p-1.5 bg-slate-200/75 dark:bg-[#0D1829] rounded-2xl border border-slate-200/60 dark:border-slate-800">
        {[
          { id: 'daily_plan', label: 'الخطة اليومية' },
          { id: 'all', label: 'كافة الزيارات' },
          { id: 'planned', label: 'مخططة وقيد التنفيذ' },
          { id: 'completed', label: 'المنجزة' },
          { id: 'impeded', label: 'المتعثرة' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id as any)}
            className={`min-h-[40px] rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === t.id
                ? 'bg-[#0B192C] dark:bg-[#0D9488] text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-[#0B192C] dark:hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Visits List */}
      {filteredVisits.length === 0 ? (
        <div className="bg-white dark:bg-[#0D1829] border border-slate-200/90 dark:border-slate-800 rounded-3xl p-10 text-center shadow-2xs">
          <ClipboardCheck className="w-10 h-10 text-slate-400 mx-auto mb-2" />
          <h3 className="text-base font-bold text-[#0B192C] dark:text-white mb-1 font-display">
            لا توجد زيارات ميدانية مسجلة
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            يمكنك توثيق زيارة ميدانية جديدة وربطها بالخطة اليومية أو بموعد مسبق.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredVisits.map((v) => {
            const statusConfig = STATUS_LABELS[v.status] || {
              label: v.status,
              badgeClass: 'bg-slate-100 text-slate-600',
            };
            return (
              <div
                key={v.id}
                className="bg-white dark:bg-[#0D1829] border border-slate-200/90 dark:border-slate-800 rounded-3xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs"
              >
                <div className="flex items-start gap-3.5 min-w-0">
                  <div className="px-3 py-2 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center shrink-0 font-mono">
                    <div className="text-sm font-bold text-[#0B192C] dark:text-white">
                      {formatTimeTo12Hour(v.visitTime)}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{v.visitDate}</div>
                  </div>

                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${statusConfig.badgeClass}`}>
                        {statusConfig.label}
                      </span>
                      <span className="text-xs font-semibold text-[#0284C7] dark:text-sky-400 truncate">
                        {v.propertyTitle}
                      </span>
                      <span aria-hidden="true" className="text-slate-400">·</span>
                      <span className="text-xs text-slate-600 dark:text-slate-300">
                        {v.taxpayerName}
                      </span>
                    </div>

                    <div className="text-xs text-slate-700 dark:text-slate-200 flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{PURPOSE_LABELS[v.purpose] || v.purpose}</span>
                      {v.zone && (
                        <span className="inline-flex items-center gap-1 text-slate-500 text-[11px]">
                          <MapPin className="w-3 h-3 text-slate-400" />
                          <span>{v.zone}</span>
                        </span>
                      )}
                      {v.hasCoordinates && (
                        <span className="text-[10px] text-teal-600 dark:text-teal-400 font-mono">
                          (إحداثيات مثبتة GPS)
                        </span>
                      )}
                    </div>

                    {v.impedimentReason && (
                      <div className="text-xs text-rose-600 dark:text-rose-400 font-medium bg-rose-50 dark:bg-rose-950/40 px-2 py-1 rounded-lg">
                        سبب التعثر: {v.impedimentReason}
                      </div>
                    )}

                    {v.notes && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1">
                        {v.notes}
                      </p>
                    )}
                  </div>
                </div>

                {/* Workflow Transitions */}
                <div className="flex flex-wrap items-center gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800 shrink-0">
                  {v.status !== 'completed' && (
                    <button
                      type="button"
                      onClick={() => updateFieldVisitStatus(v, 'completed')}
                      className="min-h-[34px] px-3 rounded-xl bg-[#0D9488] hover:bg-teal-700 text-white text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>اكتمال</span>
                    </button>
                  )}

                  {v.status === 'planned' && (
                    <button
                      type="button"
                      onClick={() => updateFieldVisitStatus(v, 'in_progress')}
                      className="min-h-[34px] px-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Clock className="w-3.5 h-3.5" />
                      <span>بدء المعاينة</span>
                    </button>
                  )}

                  {v.status !== 'impeded' && v.status !== 'completed' && (
                    <button
                      type="button"
                      onClick={() => {
                        setImpedingVisit(v);
                        setImpedimentReason('');
                      }}
                      className="min-h-[34px] px-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>توثيق تعثر</span>
                    </button>
                  )}

                  {v.status !== 'postponed' && v.status !== 'completed' && (
                    <button
                      type="button"
                      onClick={() => updateFieldVisitStatus(v, 'postponed')}
                      className="min-h-[34px] px-2.5 rounded-xl bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>تأجيل</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Visit Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="relative w-full max-w-xl bg-white dark:bg-[#0D1829] border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-base font-bold text-[#0B192C] dark:text-white font-display">
                توثيق زيارة ميدانية جديدة
              </h2>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 pt-4">
              {/* Dual Mode Selector: Existing Registered Property vs. Direct Instant Field Report */}
              <div className="p-1.5 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    if (properties.length === 0) {
                      showToast('لا توجد عقارات مسجلة حالياً؛ يمكنك الإدخال المباشر الفوري من هذه النافذة.', 'info');
                      return;
                    }
                    setEntryMode('existing');
                    if (!propertyId && properties[0]) {
                      setPropertyId(properties[0].id);
                    }
                  }}
                  className={`min-h-[40px] px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    entryMode === 'existing'
                      ? 'bg-[#0B192C] dark:bg-[#0D9488] text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-[#0B192C] dark:hover:text-white'
                  }`}
                >
                  <Building2 className="w-3.5 h-3.5 shrink-0" />
                  <span>اختيار عقار / مكلف مسجل مسبقاً</span>
                </button>

                <button
                  type="button"
                  onClick={() => setEntryMode('direct')}
                  className={`min-h-[40px] px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    entryMode === 'direct'
                      ? 'bg-[#0D9488] dark:bg-teal-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-[#0D9488] dark:hover:text-teal-300'
                  }`}
                >
                  <ClipboardCheck className="w-3.5 h-3.5 shrink-0" />
                  <span>إدخال مباشر (محضر فوري لمكلف/عقار جديد)</span>
                </button>
              </div>

              {entryMode === 'existing' ? (
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    العقار المستهدف (المسجل في النظام) *
                  </label>
                  <select
                    required
                    value={propertyId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setPropertyId(id);
                      const prop = properties.find((p) => p.id === id);
                      if (prop) {
                        const nextReg = prop.region || 'أمانة العاصمة صنعاء';
                        const nextAddr = prop.address || '';
                        setVisitRegion(nextReg);
                        setVisitAddress(nextAddr);
                        const geo = detectGeographyFromText(`${nextReg} ${nextAddr}`);
                        if (geo.governorate) setGovId(geo.governorate.id);
                        if (geo.directorate) setDirId(geo.directorate.id);
                        setZoneName(
                          [nextReg, nextAddr].filter(Boolean).join(' — ') ||
                            geo.zone?.name ||
                            nextAddr ||
                            nextReg
                        );
                        if (prop.hasCoordinates) {
                          setLatitude(String(prop.latitude));
                          setLongitude(String(prop.longitude));
                        }
                      }
                    }}
                    className="w-full min-h-[42px] px-3 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                  >
                    {properties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title} — {p.taxpayerName} ({p.region || 'عام'})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-teal-50/50 dark:bg-teal-950/20 border border-teal-200/80 dark:border-teal-800/70 space-y-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <User className="w-4 h-4 text-[#0D9488] dark:text-teal-400" />
                      <span className="text-xs font-bold text-[#0B192C] dark:text-white">
                        بيانات المكلف والعقار للمحضر الفوري
                      </span>
                    </div>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-lg bg-teal-100 dark:bg-teal-900/60 text-teal-800 dark:text-teal-300">
                      يُنشئ ملف المكلف والعقار ويربط المحضر تلقائياً
                    </span>
                  </div>

                  {taxpayers.length > 0 && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setDirectTaxpayerMode('new_taxpayer')}
                        className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
                          directTaxpayerMode === 'new_taxpayer'
                            ? 'bg-[#0B192C] dark:bg-[#0D9488] text-white'
                            : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        + مكلف جديد غير مسجل مسبقاً
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDirectTaxpayerMode('existing_taxpayer');
                          if (!selectedDirectTaxpayerId && taxpayers[0]) {
                            setSelectedDirectTaxpayerId(taxpayers[0].id);
                          }
                        }}
                        className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
                          directTaxpayerMode === 'existing_taxpayer'
                            ? 'bg-[#0B192C] dark:bg-[#0D9488] text-white'
                            : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        اختيار مكلف مسجل (لعقار جديد)
                      </button>
                    </div>
                  )}

                  {directTaxpayerMode === 'existing_taxpayer' && taxpayers.length > 0 ? (
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        اختر المكلف المسجل *
                      </label>
                      <select
                        required
                        value={selectedDirectTaxpayerId}
                        onChange={(e) => setSelectedDirectTaxpayerId(e.target.value)}
                        className="w-full min-h-[40px] px-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                      >
                        {taxpayers.map((tp) => (
                          <option key={tp.id} value={tp.id}>
                            {tp.fullName} ({tp.internalCode || 'بدون رمز'})
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                          اسم المكلف (المالك / الحائز) *
                        </label>
                        <input
                          type="text"
                          required
                          value={directTaxpayerName}
                          onChange={(e) => setDirectTaxpayerName(e.target.value)}
                          placeholder="مثال: محمد عبدالله صالح السنحاني..."
                          className="w-full min-h-[40px] px-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                            رقم هاتف المكلف (اختياري)
                          </label>
                          <input
                            type="tel"
                            value={directTaxpayerPhone}
                            onChange={(e) => setDirectTaxpayerPhone(e.target.value)}
                            placeholder="77xxxxxxx"
                            className="w-full min-h-[38px] px-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                            رقم الهوية / السجل (اختياري)
                          </label>
                          <input
                            type="text"
                            value={directTaxpayerNatId}
                            onChange={(e) => setDirectTaxpayerNatId(e.target.value)}
                            placeholder="رقم البطاقة أو السجل..."
                            className="w-full min-h-[38px] px-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="pt-2 border-t border-teal-200/60 dark:border-teal-800/50 space-y-2.5">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        اسم أو وصف العقار في المحضر الميداني *
                      </label>
                      <input
                        type="text"
                        required
                        value={directPropertyTitle}
                        onChange={(e) => setDirectPropertyTitle(e.target.value)}
                        placeholder="مثال: عمارة سكنية تجارية 4 أدوار / برج النور / مركز تجاري..."
                        className="w-full min-h-[40px] px-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                          تصنيف العقار
                        </label>
                        <select
                          value={directPropertyType}
                          onChange={(e) => setDirectPropertyType(e.target.value as any)}
                          className="w-full min-h-[38px] px-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                        >
                          <option value="residential">سكني</option>
                          <option value="commercial">تجاري</option>
                          <option value="mixed">مختلط (سكني / تجاري)</option>
                          <option value="industrial">صناعي / مستودعات</option>
                          <option value="agricultural">زراعي / أرض</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                          عدد الوحدات / الشقق التقديري (اختياري)
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={directUnitsCount}
                          onChange={(e) => setDirectUnitsCount(e.target.value)}
                          placeholder="مثال: 8"
                          className="w-full min-h-[38px] px-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Linked Appointment Selection (Independent Lifecycle) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  ربط بموعد مسبق (اختياري)
                </label>
                <select
                  value={linkedAppointmentId}
                  onChange={(e) => setLinkedAppointmentId(e.target.value)}
                  className="w-full min-h-[42px] px-3 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                >
                  <option value="">بدون ربط بموعد (زيارة ميدانية مستقلة)</option>
                  {appointments
                    .filter((a) => a.status !== 'completed' && a.status !== 'cancelled')
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.title} ({a.scheduledDate} {a.scheduledTime}) — {a.taxpayerName}
                      </option>
                    ))}
                </select>
              </div>

              {/* Cascading Geographical Hierarchy (Governorate -> District -> Sub-district -> Neighborhood -> Street) */}
              <CascadingLocationSelector
                region={visitRegion}
                address={visitAddress}
                onChange={(loc) => {
                  setVisitRegion(loc.region);
                  setVisitAddress(loc.address);
                  const matchedGov = DEFAULT_GOVERNORATES.find(
                    (g) => g.name === loc.governorate || loc.governorate.includes(g.name)
                  );
                  setGovId(matchedGov ? matchedGov.id : loc.governorate || 'gov_sanaa');

                  const matchedDir = DEFAULT_DIRECTORATES.find(
                    (d) => d.name === loc.district || loc.district.includes(d.name)
                  );
                  setDirId(matchedDir ? matchedDir.id : loc.district || '');

                  const formattedZone = [
                    loc.district,
                    loc.subDistrict,
                    loc.neighborhood,
                    loc.streetAddress,
                  ]
                    .filter(Boolean)
                    .join(' - ');
                  setZoneName(formattedZone || loc.zoneLabel || loc.region);
                }}
                title="موقع المحضر / الزيارة الميدانية (المحافظة ← المديرية ← العزلة ← الحي ← الشارع)"
                streetPlaceholder="الشارع أو المعلم التفصيلي لموقع المحضر الميداني..."
              />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    تاريخ الزيارة (بتوقيت عدن) *
                  </label>
                  <input
                    type="date"
                    required
                    value={visitDate}
                    onChange={(e) => setVisitDate(e.target.value)}
                    className="w-full min-h-[42px] px-3 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                      الوقت *
                    </label>
                    {visitTime && (
                      <span className="text-[11px] font-bold text-[#0284C7] dark:text-sky-400 font-mono">
                        ({formatTimeTo12Hour(visitTime)})
                      </span>
                    )}
                  </div>
                  <input
                    type="time"
                    required
                    value={visitTime}
                    onChange={(e) => setVisitTime(e.target.value)}
                    className="w-full min-h-[42px] px-3 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    غرض الزيارة *
                  </label>
                  <select
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value as VisitPurpose)}
                    className="w-full min-h-[42px] px-3 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                  >
                    {Object.entries(PURPOSE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    حالة الزيارة *
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as VisitStatus)}
                    className="w-full min-h-[42px] px-3 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                  >
                    <option value="planned">مخططة (في الخطة اليومية)</option>
                    <option value="in_progress">قيد التنفيذ الآن</option>
                    <option value="completed">مكتملة بنجاح</option>
                    <option value="postponed">مؤجلة</option>
                    <option value="impeded">تعثرت / تعذرت</option>
                  </select>
                </div>
              </div>

              {/* GPS Coordinates Button */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    الإحداثيات الجغرافية (GPS)
                  </label>
                  <button
                    type="button"
                    onClick={handleCaptureGPS}
                    disabled={locating}
                    className="text-[11px] font-bold text-[#0284C7] hover:underline inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Compass className="w-3.5 h-3.5" />
                    <span>{locating ? 'جاري التثبيت...' : 'تثبيت موقعي الحالي'}</span>
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={latitude}
                    onChange={(e) => setLatitude(e.target.value)}
                    placeholder="خط العرض Latitude"
                    className="w-full min-h-[38px] px-3 rounded-xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                  />
                  <input
                    type="text"
                    value={longitude}
                    onChange={(e) => setLongitude(e.target.value)}
                    placeholder="خط الطول Longitude"
                    className="w-full min-h-[38px] px-3 rounded-xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                  />
                </div>
              </div>

              {/* Photo attachment */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  توثيق صورة المعاينة (اختياري)
                </label>
                <div className="flex items-center gap-2">
                  <label className="min-h-[38px] px-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 hover:border-[#0284C7] flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                    <Camera className="w-4 h-4 text-slate-400" />
                    <span>التقاط / اختيار صورة</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handlePhotoFileChange}
                      className="hidden"
                    />
                  </label>
                  {photoSummary && (
                    <span className="text-[11px] text-teal-600 dark:text-teal-400 font-medium truncate">
                      {photoSummary}
                    </span>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  ملاحظات وتقرير المعاينة الميدانية
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="وصف حالة العقار، الشاغلين، أو أية مشاهدات مهمة..."
                  className="w-full p-3 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="min-h-[42px] px-4 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-[42px] px-5 rounded-2xl bg-[#0B192C] dark:bg-[#0D9488] hover:bg-[#132A46] text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
                >
                  {submitting ? 'جاري الحفظ...' : 'حفظ وتوثيق الزيارة'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Impeded Reason Modal */}
      {impedingVisit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="relative w-full max-w-md bg-white dark:bg-[#0D1829] border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl p-6">
            <h2 className="text-base font-bold text-rose-700 dark:text-rose-400 font-display mb-1">
              توثيق تعثر الزيارة الميدانية
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              العقار: {impedingVisit.propertyTitle} — {impedingVisit.taxpayerName}
            </p>

            <form onSubmit={handleConfirmImpediment} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  سبب تعذر أو تعثر الزيارة *
                </label>
                <textarea
                  required
                  rows={3}
                  value={impedimentReason}
                  onChange={(e) => setImpedimentReason(e.target.value)}
                  placeholder="مثال: العقار مغلق تمامًا، رفض الشاغل التعاون، عدم وجود طريق سالك..."
                  className="w-full p-3 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setImpedingVisit(null)}
                  className="min-h-[40px] px-4 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300"
                >
                  تراجع
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-[40px] px-5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
                >
                  {submitting ? 'جاري التوثيق...' : 'تأكيد وحفظ سبب التعثر'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
