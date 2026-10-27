import React, { useState, useMemo, useEffect } from 'react';
import {
  Building2,
  Plus,
  Search,
  MapPin,
  Layers,
  Trash2,
  Edit3,
  ArrowRight,
  Compass,
  User,
  Calendar,
  FileSpreadsheet,
  AlertTriangle,
  Maximize2,
} from 'lucide-react';
import { useRasd } from '../context/RasdContext';
import { OccupancyStatus, Property, PropertyStatus, PropertyType, PropertyUnit, UnitType } from '../types/rasd';

const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  residential: 'سكني',
  commercial: 'تجاري',
  industrial: 'صناعي',
  agricultural: 'زراعي',
  mixed: 'متعدد الاستخدام',
};

const PROPERTY_STATUS_LABELS: Record<PropertyStatus, string> = {
  active: 'نشط',
  under_inspection: 'قيد الفحص الميداني',
  disputed: 'محل اعتراض',
  exempt: 'معفى',
  archived: 'مؤرشف',
};

const UNIT_TYPE_LABELS: Record<UnitType, string> = {
  apartment: 'شقة سكنية',
  shop: 'معرض / محل تجاري',
  office: 'مكتب إداري',
  warehouse: 'مستودع',
  other: 'وحدة أخرى',
};

const OCCUPANCY_LABELS: Record<OccupancyStatus, string> = {
  occupied: 'مشغولة / مؤجرة',
  vacant: 'شاغرة',
  under_maintenance: 'تحت الصيانة',
};

export const PropertiesScreen: React.FC = () => {
  const {
    properties,
    taxpayers,
    propertyUnits,
    fieldVisits,
    assessments,
    transactions,
    selectedPropertyId,
    setSelectedPropertyId,
    setSelectedTaxpayerId,
    setActiveScreen,
    addProperty,
    updateProperty,
    deleteProperty,
    addPropertyUnit,
    deletePropertyUnit,
    isOwner,
    showToast,
  } = useRasd();

  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'title' | 'area' | 'units'>('title');

  // Add / Edit Property Sheet State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [title, setTitle] = useState('');
  const [code, setCode] = useState('');
  const [taxpayerId, setTaxpayerId] = useState('');
  const [propertyType, setPropertyType] = useState<PropertyType>('commercial');
  const [status, setStatus] = useState<PropertyStatus>('active');
  const [region, setRegion] = useState('صنعاء');
  const [address, setAddress] = useState('');
  const [areaSqm, setAreaSqm] = useState('350');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [locating, setLocating] = useState(false);

  // Add Unit Sheet State (inside Property Details)
  const [isUnitFormOpen, setIsUnitFormOpen] = useState(false);
  const [unitNumber, setUnitNumber] = useState('');
  const [unitType, setUnitType] = useState<UnitType>('shop');
  const [floor, setFloor] = useState('الأرضي');
  const [unitArea, setUnitArea] = useState('60');
  const [occupancyStatus, setOccupancyStatus] = useState<OccupancyStatus>('occupied');
  const [tenantName, setTenantName] = useState('');
  const [annualRentEstimate, setAnnualRentEstimate] = useState('24000');
  const [unitNotes, setUnitNotes] = useState('');

  // Confirm Delete States
  const [confirmDeletePropId, setConfirmDeletePropId] = useState<string | null>(null);
  const [confirmDeleteUnit, setConfirmDeleteUnit] = useState<PropertyUnit | null>(null);

  const selectedProperty = useMemo(
    () => properties.find((p) => p.id === selectedPropertyId) || null,
    [properties, selectedPropertyId]
  );

  const filteredProperties = useMemo(() => {
    return properties
      .filter((p) => {
        const q = searchQuery.trim().toLowerCase();
        const matchesQuery =
          !q ||
          p.title.toLowerCase().includes(q) ||
          p.code.toLowerCase().includes(q) ||
          p.taxpayerName.toLowerCase().includes(q) ||
          p.region.toLowerCase().includes(q) ||
          p.address.toLowerCase().includes(q);
        const matchesType = typeFilter === 'all' || p.propertyType === typeFilter;
        const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
        return matchesQuery && matchesType && matchesStatus;
      })
      .sort((a, b) => {
        if (sortBy === 'area') return (b.areaSqm || 0) - (a.areaSqm || 0);
        if (sortBy === 'units') return (b.unitsCount || 0) - (a.unitsCount || 0);
        return a.title.localeCompare(b.title, 'ar');
      });
  }, [properties, searchQuery, typeFilter, statusFilter, sortBy]);

  const openCreateForm = () => {
    if (taxpayers.length === 0) {
      showToast('يرجى إضافة مكلف واحد على الأقل قبل إنشاء عقار مرتبط به.', 'warning');
      setActiveScreen('taxpayers');
      return;
    }
    setEditingProperty(null);
    setTitle('');
    setCode(`PR-${Math.floor(1000 + Math.random() * 9000)}`);
    setTaxpayerId(taxpayers[0]?.id || '');
    setPropertyType('commercial');
    setStatus('active');
    setRegion('صنعاء');
    setAddress('');
    setAreaSqm('350');
    setLatitude('');
    setLongitude('');
    setNotes('');
    setIsFormOpen(true);
  };

  useEffect(() => {
    try {
      const action = sessionStorage.getItem('rasd_quick_action');
      if (action === 'open_add_property') {
        sessionStorage.removeItem('rasd_quick_action');
        openCreateForm();
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  const openEditForm = (prop: Property) => {
    setEditingProperty(prop);
    setTitle(prop.title);
    setCode(prop.code);
    setTaxpayerId(prop.taxpayerId);
    setPropertyType(prop.propertyType);
    setStatus(prop.status);
    setRegion(prop.region);
    setAddress(prop.address);
    setAreaSqm(String(prop.areaSqm || 0));
    setLatitude(prop.hasCoordinates ? String(prop.latitude) : '');
    setLongitude(prop.hasCoordinates ? String(prop.longitude) : '');
    setNotes(prop.notes);
    setIsFormOpen(true);
  };

  const handleCaptureGPS = () => {
    if (!navigator.geolocation) {
      showToast('متصفحك أو جهازك لا يدعم تحديد الموقع الجغرافي.', 'error');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude.toFixed(6));
        setLongitude(pos.coords.longitude.toFixed(6));
        setLocating(false);
        showToast('تم التقاط إحداثيات GPS الحالية بنجاح', 'success');
      },
      (err) => {
        setLocating(false);
        showToast(
          err.code === err.PERMISSION_DENIED
            ? 'تم رفض إذن الموقع الجغرافي. يمكنك إدخال الإحداثيات يدويًا.'
            : 'تعذر قراءة إحداثيات GPS الحالية.',
          'warning'
        );
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSaveProperty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const tp = taxpayers.find((t) => t.id === taxpayerId);
    if (!tp) {
      showToast('يرجى اختيار المكلف المرتبط بالعقار.', 'error');
      return;
    }

    const latNum = parseFloat(latitude);
    const lngNum = parseFloat(longitude);
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
      if (editingProperty) {
        await updateProperty(editingProperty.id, {
          taxpayerId: tp.id,
          taxpayerName: tp.fullName,
          title,
          code,
          propertyType,
          status,
          region,
          address,
          areaSqm: parseFloat(areaSqm) || 0,
          latitude: hasCoords ? latNum : 0,
          longitude: hasCoords ? lngNum : 0,
          hasCoordinates: hasCoords,
          notes,
        });
      } else {
        await addProperty({
          taxpayerId: tp.id,
          taxpayerName: tp.fullName,
          title,
          code,
          propertyType,
          status,
          region,
          address,
          areaSqm: parseFloat(areaSqm) || 0,
          unitsCount: 0,
          latitude: hasCoords ? latNum : 0,
          longitude: hasCoords ? lngNum : 0,
          hasCoordinates: hasCoords,
          notes,
        });
      }
      setIsFormOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProperty || submitting) return;
    setSubmitting(true);
    try {
      await addPropertyUnit({
        propertyId: selectedProperty.id,
        propertyTitle: selectedProperty.title,
        taxpayerId: selectedProperty.taxpayerId,
        unitNumber,
        unitType,
        floor,
        areaSqm: parseFloat(unitArea) || 0,
        occupancyStatus,
        tenantName,
        annualRentEstimate: parseFloat(annualRentEstimate) || 0,
        notes: unitNotes,
      });
      setIsUnitFormOpen(false);
      setUnitNumber('');
      setTenantName('');
      setUnitNotes('');
    } finally {
      setSubmitting(false);
    }
  };

  // Dedicated Full Property Detail Page
  if (selectedProperty) {
    const units = propertyUnits.filter((u) => u.propertyId === selectedProperty.id);
    const visits = fieldVisits.filter((v) => v.propertyId === selectedProperty.id);
    const propAssessments = assessments.filter((a) => a.propertyId === selectedProperty.id);
    const propTransactions = transactions.filter((t) => t.propertyId === selectedProperty.id);

    return (
      <div className="space-y-5 pb-8">
        {/* Top Back & Actions Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setSelectedPropertyId(null)}
            className="min-h-[44px] px-4 rounded-2xl bg-white dark:bg-[#0D1829] border border-slate-200 dark:border-slate-800 text-xs font-bold text-[#0B192C] dark:text-slate-200 flex items-center gap-2 shadow-2xs cursor-pointer"
          >
            <ArrowRight className="w-4 h-4 text-[#0284C7]" />
            <span>العودة لقائمة العقارات</span>
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setSelectedTaxpayerId(selectedProperty.taxpayerId);
                setActiveScreen('taxpayers');
              }}
              className="min-h-[44px] px-4 rounded-2xl bg-[#0D9488] hover:bg-teal-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <User className="w-4 h-4" />
              <span>فتح الملف الموحد للمكلف ({selectedProperty.taxpayerName})</span>
            </button>
            <button
              type="button"
              onClick={() => openEditForm(selectedProperty)}
              className="min-h-[44px] px-4 rounded-2xl bg-[#0B192C] hover:bg-[#132A46] dark:bg-slate-800 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Edit3 className="w-4 h-4" />
              <span>تعديل العقار</span>
            </button>
            {isOwner && (
              <button
                type="button"
                onClick={() => setConfirmDeletePropId(selectedProperty.id)}
                className="min-h-[44px] px-4 rounded-2xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 text-xs font-semibold text-rose-700 dark:text-rose-300 flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>حذف</span>
              </button>
            )}
          </div>
        </div>

        {/* Architectural Property Hero Banner */}
        <div className="rounded-3xl bg-gradient-to-l from-[#0B192C] via-[#102A46] to-[#0B4F6C] text-white p-5 sm:p-6 shadow-md">
          <div className="flex flex-wrap items-center gap-2 text-xs text-sky-200 mb-2">
            <span className="font-mono font-bold text-teal-300">{selectedProperty.code}</span>
            <span aria-hidden="true">·</span>
            <span>{PROPERTY_TYPE_LABELS[selectedProperty.propertyType]}</span>
            <span aria-hidden="true">·</span>
            <span>{PROPERTY_STATUS_LABELS[selectedProperty.status]}</span>
            <span aria-hidden="true">·</span>
            <span>{selectedProperty.region}</span>
            {selectedProperty.isPendingSync && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-amber-300 font-semibold">محفوظ محليًا (قيد المزامنة)</span>
              </>
            )}
          </div>

          <h1 className="text-xl sm:text-2xl font-bold font-display mb-1.5">
            {selectedProperty.title}
          </h1>
          <p className="text-xs sm:text-sm text-slate-300">{selectedProperty.address}</p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-white/15">
            <div>
              <div className="text-[11px] text-sky-200">المالك / المكلف</div>
              <button
                type="button"
                onClick={() => {
                  setSelectedTaxpayerId(selectedProperty.taxpayerId);
                  setActiveScreen('taxpayers');
                }}
                className="text-xs sm:text-sm font-bold text-teal-300 hover:underline mt-0.5 flex items-center gap-1 cursor-pointer"
              >
                <User className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{selectedProperty.taxpayerName}</span>
              </button>
            </div>
            <div>
              <div className="text-[11px] text-sky-200">المساحة الإجمالية</div>
              <div className="text-sm font-bold text-white tabular-nums mt-0.5 font-mono">
                {selectedProperty.areaSqm.toLocaleString('en-US')} م²
              </div>
            </div>
            <div>
              <div className="text-[11px] text-sky-200">الوحدات التابعة</div>
              <div className="text-sm font-bold text-white tabular-nums mt-0.5 font-mono">
                {units.length} وحدة
              </div>
            </div>
            <div>
              <div className="text-[11px] text-sky-200">الإحداثيات الجغرافية</div>
              {selectedProperty.hasCoordinates ? (
                <button
                  type="button"
                  onClick={() => setActiveScreen('map')}
                  className="text-xs font-mono font-bold text-teal-300 hover:underline mt-0.5 flex items-center gap-1 cursor-pointer"
                >
                  <MapPin className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {selectedProperty.latitude.toFixed(4)}, {selectedProperty.longitude.toFixed(4)}
                  </span>
                </button>
              ) : (
                <div className="text-xs text-slate-400 mt-0.5">غير مسجلة بعد</div>
              )}
            </div>
          </div>

          {selectedProperty.notes && (
            <div className="mt-4 p-3.5 rounded-2xl bg-white/10 text-xs text-slate-200 leading-relaxed">
              <strong>ملاحظات العقار:</strong> {selectedProperty.notes}
            </div>
          )}
        </div>

        {/* Units Management Section */}
        <section className="bg-white dark:bg-[#0D1829] border border-slate-200/90 dark:border-slate-800 rounded-3xl p-5 shadow-2xs">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-teal-50 dark:bg-teal-950/70 text-[#0D9488] flex items-center justify-center">
                <Layers className="w-4 h-4" />
              </div>
              <h2 className="text-base font-bold text-[#0B192C] dark:text-white font-display">
                الوحدات العقارية التابعة ({units.length})
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setIsUnitFormOpen((p) => !p)}
              className="min-h-[40px] px-3.5 rounded-xl bg-[#0D9488] hover:bg-teal-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة وحدة</span>
            </button>
          </div>

          {isUnitFormOpen && (
            <form
              onSubmit={handleSaveUnit}
              className="mb-5 p-4 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-3"
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">رقم / رمز الوحدة *</label>
                  <input
                    type="text"
                    required
                    value={unitNumber}
                    onChange={(e) => setUnitNumber(e.target.value)}
                    placeholder="مثال: شقة 101 أو محل 3"
                    className="w-full min-h-[42px] px-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">نوع الوحدة</label>
                  <select
                    value={unitType}
                    onChange={(e) => setUnitType(e.target.value as UnitType)}
                    className="w-full min-h-[42px] px-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                  >
                    {Object.entries(UNIT_TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">الطابق</label>
                  <input
                    type="text"
                    value={floor}
                    onChange={(e) => setFloor(e.target.value)}
                    className="w-full min-h-[42px] px-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">حالة الإشغال</label>
                  <select
                    value={occupancyStatus}
                    onChange={(e) => setOccupancyStatus(e.target.value as OccupancyStatus)}
                    className="w-full min-h-[42px] px-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                  >
                    {Object.entries(OCCUPANCY_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">اسم الشاغل / المستأجر</label>
                  <input
                    type="text"
                    value={tenantName}
                    onChange={(e) => setTenantName(e.target.value)}
                    placeholder="اختياري"
                    className="w-full min-h-[42px] px-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">الإيجار السنوي التقديري</label>
                  <input
                    type="number"
                    min="0"
                    value={annualRentEstimate}
                    onChange={(e) => setAnnualRentEstimate(e.target.value)}
                    className="w-full min-h-[42px] px-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsUnitFormOpen(false)}
                  className="min-h-[40px] px-4 rounded-xl bg-slate-200 dark:bg-slate-700 text-xs font-semibold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-[40px] px-5 rounded-xl bg-[#0D9488] text-white text-xs font-bold cursor-pointer"
                >
                  حفظ الوحدة
                </button>
              </div>
            </form>
          )}

          {units.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">
              لا توجد وحدات فرعية مسجلة لهذا العقار بعد.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {units.map((u) => (
                <div
                  key={u.id}
                  className="p-3.5 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-3"
                >
                  <div>
                    <div className="text-sm font-bold text-[#0B192C] dark:text-white">
                      وحدة {u.unitNumber} · {UNIT_TYPE_LABELS[u.unitType]}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      الطابق: {u.floor || 'غير محدد'} · {OCCUPANCY_LABELS[u.occupancyStatus]}
                    </div>
                    <div className="text-xs text-[#0284C7] dark:text-sky-400 mt-1 font-medium">
                      الشاغل: {u.tenantName || 'غير محدد'} · تقدير سنوي:{' '}
                      <span className="font-mono font-bold">{u.annualRentEstimate.toLocaleString('en-US')}</span>
                    </div>
                  </div>
                  {isOwner && (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteUnit(u)}
                      className="min-h-[38px] min-w-[38px] rounded-xl text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center justify-center cursor-pointer shrink-0"
                      title="حذف الوحدة"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Related Visits & Financial Records */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <section className="bg-white dark:bg-[#0D1829] border border-slate-200/90 dark:border-slate-800 rounded-3xl p-5 shadow-2xs">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#0284C7]" />
                <h3 className="text-sm font-bold text-[#0B192C] dark:text-white font-display">
                  سجل الزيارات الميدانية ({visits.length})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveScreen('visits')}
                className="text-xs font-bold text-[#0D9488] dark:text-teal-400 hover:underline cursor-pointer"
              >
                + توثيق زيارة
              </button>
            </div>
            {visits.length === 0 ? (
              <p className="text-xs text-slate-500 py-5 text-center">لم تُسجل زيارات ميدانية لهذا العقار بعد.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {visits.map((v) => (
                  <div key={v.id} className="py-2.5 text-xs">
                    <div className="font-bold text-[#0B192C] dark:text-white">
                      <span className="font-mono">{v.visitDate} ({v.visitTime})</span> — {v.officerName}
                    </div>
                    <div className="text-slate-500 mt-0.5">{v.notes || 'دون ملاحظات إضافية'}</div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="bg-white dark:bg-[#0D1829] border border-slate-200/90 dark:border-slate-800 rounded-3xl p-5 shadow-2xs">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-[#0D9488]" />
                <h3 className="text-sm font-bold text-[#0B192C] dark:text-white font-display">
                  التقييمات والمعاملات المالية ({propAssessments.length + propTransactions.length})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveScreen('assessments')}
                className="text-xs font-bold text-[#0284C7] dark:text-sky-400 hover:underline cursor-pointer"
              >
                فتح المالية
              </button>
            </div>
            {propAssessments.length === 0 && propTransactions.length === 0 ? (
              <p className="text-xs text-slate-500 py-5 text-center">لا توجد تقييمات أو معاملات مالية مرتبطة بهذا العقار.</p>
            ) : (
              <div className="space-y-2 text-xs">
                {propAssessments.map((a) => (
                  <div
                    key={a.id}
                    className="p-3 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 flex items-center justify-between"
                  >
                    <span>تقييم ({a.periodLabel}) · {a.status}</span>
                    <span className="font-mono font-bold text-[#0B192C] dark:text-white">
                      {a.amount.toLocaleString('en-US')} {a.currency}
                    </span>
                  </div>
                ))}
                {propTransactions.map((t) => (
                  <div
                    key={t.id}
                    className="p-3 rounded-2xl bg-teal-50/60 dark:bg-teal-950/30 flex items-center justify-between"
                  >
                    <span>معاملة ({t.referenceNumber}) · {t.status}</span>
                    <span className="font-mono font-bold text-[#0D9488] dark:text-teal-400">
                      {t.amount.toLocaleString('en-US')} {t.currency}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Confirm Unit Delete Modal */}
        {confirmDeleteUnit && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white dark:bg-[#0D1829] rounded-3xl p-6 border border-slate-200 dark:border-slate-800 space-y-4 shadow-xl">
              <div className="flex items-center gap-2.5 text-rose-600">
                <AlertTriangle className="w-6 h-6" />
                <h3 className="text-base font-bold">تأكيد حذف الوحدة العقارية</h3>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                هل أنت متأكد من حذف الوحدة <strong>«{confirmDeleteUnit.unitNumber}»</strong>؟ سيتم تحديث عدد وحدات العقار وتوثيق العملية في سجل التدقيق.
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

        {/* Confirm Property Delete Modal */}
        {confirmDeletePropId && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white dark:bg-[#0D1829] rounded-3xl p-6 border border-slate-200 dark:border-slate-800 space-y-4 shadow-xl">
              <div className="flex items-center gap-2.5 text-rose-600">
                <AlertTriangle className="w-6 h-6" />
                <h3 className="text-base font-bold">تأكيد حذف العقار</h3>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                سيقوم النظام بالتحقق من عدم وجود وحدات أو زيارات أو تقييمات أو معاملات مرتبطة بهذا العقار قبل تنفيذ الحذف النهائي وتوثيقه في سجل التدقيق.
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

  return (
    <div className="space-y-5 pb-8">
      {/* Header & Add Button */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#0B192C] dark:text-white font-display">
            إدارة العقارات والوحدات التابعة
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            إجمالي العقارات المسجلة: <span className="font-mono font-bold text-[#0284C7]">{properties.length}</span> · الوحدات:{' '}
            <span className="font-mono font-bold text-[#0D9488]">{propertyUnits.length}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateForm}
          className="min-h-[46px] px-4 rounded-2xl bg-[#0B192C] hover:bg-[#132A46] dark:bg-[#0D9488] dark:hover:bg-teal-600 text-white text-xs font-bold flex items-center gap-2 shadow-xs cursor-pointer transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>إضافة عقار جديد</span>
        </button>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white dark:bg-[#0D1829] border border-slate-200/90 dark:border-slate-800 rounded-3xl p-4 space-y-3 shadow-2xs">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ابحث باسم العقار، الرمز المرجعي، اسم المكلف، أو المنطقة..."
            className="w-full min-h-[44px] pr-10 pl-4 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs focus:outline-none focus:border-[#0284C7]"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="min-h-[42px] px-3 rounded-xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
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
            className="min-h-[42px] px-3 rounded-xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
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
            className="min-h-[42px] px-3 rounded-xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
          >
            <option value="title">الفرز حسب: الاسم أبجديًا</option>
            <option value="area">الفرز حسب: المساحة الأكبر</option>
            <option value="units">الفرز حسب: عدد الوحدات</option>
          </select>
        </div>
      </div>

      {/* Properties Architectural Cards Grid */}
      {filteredProperties.length === 0 ? (
        <div className="bg-white dark:bg-[#0D1829] border border-slate-200/90 dark:border-slate-800 rounded-3xl p-10 text-center shadow-2xs">
          <Building2 className="w-10 h-10 text-slate-400 mx-auto mb-3" />
          <h3 className="text-base font-bold text-[#0B192C] dark:text-white mb-1 font-display">
            لا توجد عقارات مطابقة للبحث
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-5 max-w-md mx-auto leading-relaxed">
            ابدأ بإضافة أول عقار وربطه بالمكلف التابع له لتتمكن من إدارة الوحدات والزيارات والتقييمات الميدانية.
          </p>
          <button
            type="button"
            onClick={openCreateForm}
            className="min-h-[44px] px-5 rounded-2xl bg-[#0D9488] text-white text-xs font-bold inline-flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة عقار الآن</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredProperties.map((prop) => (
            <div
              key={prop.id}
              onClick={() => setSelectedPropertyId(prop.id)}
              className="bg-white dark:bg-[#0D1829] border border-slate-200/90 dark:border-slate-800 hover:border-[#0284C7] rounded-3xl p-5 transition-all cursor-pointer flex flex-col justify-between shadow-2xs"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-mono font-bold text-[#0284C7] dark:text-sky-400">{prop.code}</span>
                    <span aria-hidden="true">·</span>
                    <span>{PROPERTY_TYPE_LABELS[prop.propertyType]}</span>
                    <span aria-hidden="true">·</span>
                    <span
                      className={
                        prop.status === 'active'
                          ? 'text-[#0D9488] dark:text-teal-400 font-semibold'
                          : prop.status === 'disputed'
                          ? 'text-rose-600 font-semibold'
                          : 'text-amber-600'
                      }
                    >
                      {PROPERTY_STATUS_LABELS[prop.status]}
                    </span>
                  </div>
                  <div className="w-9 h-9 rounded-2xl bg-sky-50 dark:bg-sky-950/60 text-[#0284C7] dark:text-sky-400 flex items-center justify-center shrink-0">
                    <Building2 className="w-4 h-4" />
                  </div>
                </div>

                <h3 className="text-base font-bold text-[#0B192C] dark:text-white mb-1 font-display">
                  {prop.title}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-[#0D9488] shrink-0" />
                  <span>{prop.region} — {prop.address}</span>
                </p>
              </div>

              <div className="mt-4 pt-3.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
                <span className="font-medium truncate">المكلف: {prop.taxpayerName}</span>
                <div className="flex items-center gap-2.5 font-mono text-[11px] shrink-0">
                  <span className="inline-flex items-center gap-1 text-[#0D9488] dark:text-teal-400 font-bold">
                    <Layers className="w-3.5 h-3.5" />
                    <span>{prop.unitsCount} وحدة</span>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1">
                    <Maximize2 className="w-3 h-3 text-slate-400" />
                    <span>{prop.areaSqm} م²</span>
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Property Bottom Sheet / Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-xl bg-white dark:bg-[#0D1829] rounded-t-3xl sm:rounded-3xl p-6 border border-slate-200 dark:border-slate-800 max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mb-4 sm:hidden" />
            <h2 className="text-lg font-bold text-[#0B192C] dark:text-white mb-4 font-display">
              {editingProperty ? 'تعديل بيانات العقار' : 'إضافة عقار جديد'}
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
                    placeholder="مثال: مجمع النخيل التجاري"
                    className="w-full min-h-[44px] px-3.5 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">الرمز المرجعي للعقار *</label>
                  <input
                    type="text"
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">المكلف / المالك المرتبط *</label>
                <select
                  required
                  value={taxpayerId}
                  onChange={(e) => setTaxpayerId(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
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
                    className="w-full min-h-[44px] px-3 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
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
                    className="w-full min-h-[44px] px-3 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
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
                    className="w-full min-h-[44px] px-3 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">المنطقة / المدينة *</label>
                  <input
                    type="text"
                    required
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">العنوان التفصيلي *</label>
                  <input
                    type="text"
                    required
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="الحي، الشارع، رقم المبنى"
                    className="w-full min-h-[44px] px-3.5 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                  />
                </div>
              </div>

              {/* GPS Coordinates Box */}
              <div className="p-3.5 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#0B192C] dark:text-white">
                    إحداثيات الموقع الجغرافي (GPS)
                  </span>
                  <button
                    type="button"
                    onClick={handleCaptureGPS}
                    disabled={locating}
                    className="min-h-[36px] px-3 rounded-xl bg-[#0D9488] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Compass className="w-3.5 h-3.5" />
                    <span>{locating ? 'جاري الالتقاط...' : 'التقاط موقعي الحالي'}</span>
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <input
                    type="number"
                    step="any"
                    value={latitude}
                    onChange={(e) => setLatitude(e.target.value)}
                    placeholder="خط العرض (Latitude)"
                    className="w-full min-h-[40px] px-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                  />
                  <input
                    type="number"
                    step="any"
                    value={longitude}
                    onChange={(e) => setLongitude(e.target.value)}
                    placeholder="خط الطول (Longitude)"
                    className="w-full min-h-[40px] px-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">ملاحظات إضافية</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full p-3 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="min-h-[46px] px-5 rounded-2xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-[46px] px-6 rounded-2xl bg-[#0B192C] dark:bg-[#0D9488] text-white text-xs font-bold cursor-pointer disabled:opacity-50"
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
