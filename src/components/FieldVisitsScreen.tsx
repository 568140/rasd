import React, { useState, useMemo } from 'react';
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
} from 'lucide-react';
import { useRasd } from '../context/RasdContext';
import { VisitPurpose, VisitStatus } from '../types/rasd';

const PURPOSE_LABELS: Record<VisitPurpose, string> = {
  initial_survey: 'مسح ميداني أولي',
  periodic_inspection: 'معاينة دورية',
  valuation_verify: 'تحقق من التقييم',
  collection_followup: 'متابعة تحصيل',
  dispute_check: 'فحص اعتراض ميداني',
};

const STATUS_LABELS: Record<VisitStatus, string> = {
  completed: 'مكتملة بنجاح',
  requires_followup: 'تتطلب متابعة لاحقة',
  occupant_absent: 'عدم تواجد الشاغل/المكلف',
  access_denied: 'تعذر الدخول للعقار',
};

export const FieldVisitsScreen: React.FC = () => {
  const {
    fieldVisits,
    properties,
    userProfile,
    isOnline,
    addFieldVisit,
    setActiveScreen,
    setSelectedTaxpayerId,
    setSelectedPropertyId,
    showToast,
  } = useRasd();

  const [filterPropertyId, setFilterPropertyId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // New Visit Form State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [propertyId, setPropertyId] = useState('');
  const [visitDate, setVisitDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [visitTime, setVisitTime] = useState(() => new Date().toTimeString().slice(0, 5));
  const [purpose, setPurpose] = useState<VisitPurpose>('periodic_inspection');
  const [status, setStatus] = useState<VisitStatus>('completed');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [photoSummary, setPhotoSummary] = useState('');
  const [notes, setNotes] = useState('');
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const filteredVisits = useMemo(() => {
    return fieldVisits
      .filter((v) => {
        const matchesProp = filterPropertyId === 'all' || v.propertyId === filterPropertyId;
        const q = searchQuery.trim().toLowerCase();
        const matchesQ =
          !q ||
          v.propertyTitle.toLowerCase().includes(q) ||
          v.taxpayerName.toLowerCase().includes(q) ||
          v.officerName.toLowerCase().includes(q) ||
          v.notes.toLowerCase().includes(q);
        return matchesProp && matchesQ;
      })
      .sort((a, b) => b.visitDate.localeCompare(a.visitDate));
  }, [fieldVisits, filterPropertyId, searchQuery]);

  const openNewVisitModal = () => {
    if (properties.length === 0) {
      showToast('يرجى إضافة عقار واحد على الأقل من ملف المكلف قبل توثيق زيارة ميدانية.', 'warning');
      setActiveScreen('taxpayers');
      return;
    }
    const defaultProp = properties[0];
    setPropertyId(defaultProp.id);
    setVisitDate(new Date().toISOString().slice(0, 10));
    setVisitTime(new Date().toTimeString().slice(0, 5));
    setPurpose('periodic_inspection');
    setStatus('completed');
    setLatitude(defaultProp.hasCoordinates ? String(defaultProp.latitude) : '');
    setLongitude(defaultProp.hasCoordinates ? String(defaultProp.longitude) : '');
    setPhotoSummary('');
    setNotes('');
    setIsFormOpen(true);
  };

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
        showToast(
          err.code === err.PERMISSION_DENIED
            ? 'تم رفض إذن الموقع الجغرافي. يمكنك المتابعة دون إحداثيات أو إدخالها يدويًا.'
            : 'تعذر الحصول على إشارة GPS.',
          'warning'
        );
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handlePhotoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const sizeKb = Math.round(file.size / 1024);
    const stamp = new Date().toLocaleTimeString('ar-SA');
    setPhotoSummary(`صورة ميدانية موثقة: ${file.name} (${sizeKb} KB — التُقطت ${stamp})`);
    showToast('تم إرفاق توثيق الصورة الميدانية بالزيارة', 'success');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const prop = properties.find((p) => p.id === propertyId);
    if (!prop) return;

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
      await addFieldVisit({
        propertyId: prop.id,
        propertyTitle: prop.title,
        taxpayerId: prop.taxpayerId,
        taxpayerName: prop.taxpayerName,
        visitDate,
        visitTime,
        purpose,
        status,
        latitude: hasCoords ? latNum : 0,
        longitude: hasCoords ? lngNum : 0,
        hasCoordinates: hasCoords,
        photoSummary,
        notes,
      });
      setIsFormOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#0B192C] dark:text-white font-display">
            سجل الزيارات والمعاينات الميدانية
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            توثيق المعاينات مع إحداثيات GPS والصور الميدانية والعمل دون اتصال
          </p>
        </div>

        <button
          type="button"
          onClick={openNewVisitModal}
          className="min-h-[46px] px-4 rounded-2xl bg-[#0B192C] hover:bg-[#132A46] dark:bg-[#0D9488] dark:hover:bg-teal-600 text-white text-xs font-bold flex items-center gap-2 shadow-xs cursor-pointer transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>توثيق زيارة جديدة</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-white dark:bg-[#0D1829] border border-slate-200/90 dark:border-slate-800 rounded-3xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-3 shadow-2xs">
        <div className="sm:col-span-2 relative">
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ابحث بالعقار، المكلف، الموظف الميداني، أو الملاحظات..."
            className="w-full min-h-[44px] pr-10 pl-4 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs focus:outline-none focus:border-[#0284C7]"
          />
        </div>
        <select
          value={filterPropertyId}
          onChange={(e) => setFilterPropertyId(e.target.value)}
          className="min-h-[44px] px-3 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
        >
          <option value="all">جميع العقارات ({properties.length})</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      </div>

      {filteredVisits.length === 0 ? (
        <div className="bg-white dark:bg-[#0D1829] border border-slate-200/90 dark:border-slate-800 rounded-3xl p-10 text-center shadow-2xs">
          <MapPin className="w-10 h-10 text-slate-400 mx-auto mb-3" />
          <h3 className="text-base font-bold text-[#0B192C] dark:text-white mb-1 font-display">
            لا توجد زيارات ميدانية مسجلة
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
            وثّق زيارتك الميدانية الأولى مع إحداثيات GPS والصور المرفقة حتى أثناء انقطاع الاتصال.
          </p>
          <button
            type="button"
            onClick={openNewVisitModal}
            className="min-h-[44px] px-5 rounded-2xl bg-[#0D9488] text-white text-xs font-bold inline-flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>تسجيل زيارة الآن</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredVisits.map((v) => (
            <div
              key={v.id}
              className="bg-white dark:bg-[#0D1829] border border-slate-200/90 dark:border-slate-800 rounded-3xl p-5 space-y-3 shadow-2xs"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex flex-wrap items-center gap-2 text-slate-500">
                  <span className="font-mono font-bold text-[#0284C7] dark:text-sky-400">
                    {v.visitDate} · {v.visitTime}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-semibold text-[#0B192C] dark:text-slate-200">
                    {PURPOSE_LABELS[v.purpose]}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span
                    className={
                      v.status === 'completed'
                        ? 'text-[#0D9488] dark:text-teal-400 font-semibold'
                        : 'text-amber-600 dark:text-amber-400 font-semibold'
                    }
                  >
                    {STATUS_LABELS[v.status]}
                  </span>
                </div>

                {v.isPendingSync ? (
                  <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1 text-[11px] font-semibold">
                    <Clock className="w-3.5 h-3.5" />
                    <span>محفوظة محليًا (بانتظار المزامنة)</span>
                  </span>
                ) : (
                  <span className="text-[#0D9488] dark:text-teal-400 flex items-center gap-1 text-[11px] font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>مؤكدة على الخادم</span>
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-2xl bg-teal-50 dark:bg-teal-950/70 text-[#0D9488] flex items-center justify-center shrink-0">
                    <ClipboardCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-[#0B192C] dark:text-white font-display">
                      {v.propertyTitle}
                    </div>
                    <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2 mt-0.5">
                      <span className="inline-flex items-center gap-1">
                        <User className="w-3 h-3" />
                        <span>المكلف: {v.taxpayerName}</span>
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>الموظف المنفذ: {v.officerName}</span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedTaxpayerId(v.taxpayerId);
                    setSelectedPropertyId(v.propertyId);
                    setActiveScreen('taxpayers');
                  }}
                  className="min-h-[38px] px-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-xs font-bold text-[#0284C7] dark:text-sky-400 flex items-center gap-1.5 cursor-pointer"
                >
                  <User className="w-3.5 h-3.5" />
                  <span>فتح ملف المكلف</span>
                </button>
              </div>

              {v.notes && (
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed bg-[#F4F7FA] dark:bg-slate-900 p-3 rounded-2xl">
                  {v.notes}
                </p>
              )}

              {(v.hasCoordinates || v.photoSummary) && (
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center gap-4 text-xs">
                  {v.hasCoordinates && (
                    <button
                      type="button"
                      onClick={() => setActiveScreen('map')}
                      className="font-mono font-semibold text-[#0284C7] dark:text-sky-400 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      <span>
                        GPS: {v.latitude.toFixed(5)}, {v.longitude.toFixed(5)}
                      </span>
                    </button>
                  )}
                  {v.photoSummary && (
                    <span className="flex items-center gap-1 text-slate-600 dark:text-slate-300">
                      <Camera className="w-3.5 h-3.5 text-[#0D9488]" />
                      <span>{v.photoSummary}</span>
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* New Visit Sheet */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-xl bg-white dark:bg-[#0D1829] rounded-t-3xl sm:rounded-3xl p-6 border border-slate-200 dark:border-slate-800 max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mb-4 sm:hidden" />
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-[#0B192C] dark:text-white font-display">
                توثيق زيارة ميدانية جديدة
              </h2>
              {!isOnline && (
                <span className="text-xs text-amber-600 font-bold">
                  وضع عدم الاتصال (حفظ محلي فوري)
                </span>
              )}
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold mb-1">العقار محل الزيارة *</label>
                <select
                  required
                  value={propertyId}
                  onChange={(e) => {
                    setPropertyId(e.target.value);
                    const p = properties.find((x) => x.id === e.target.value);
                    if (p && p.hasCoordinates) {
                      setLatitude(String(p.latitude));
                      setLongitude(String(p.longitude));
                    }
                  }}
                  className="w-full min-h-[44px] px-3.5 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                >
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title} — المكلف: {p.taxpayerName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">تاريخ الزيارة *</label>
                  <input
                    type="date"
                    required
                    value={visitDate}
                    onChange={(e) => setVisitDate(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">وقت الزيارة *</label>
                  <input
                    type="time"
                    required
                    value={visitTime}
                    onChange={(e) => setVisitTime(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">الغرض من الزيارة</label>
                  <select
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value as VisitPurpose)}
                    className="w-full min-h-[44px] px-3.5 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                  >
                    {Object.entries(PURPOSE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">نتيجة / حالة الزيارة</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as VisitStatus)}
                    className="w-full min-h-[44px] px-3.5 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                  >
                    {Object.entries(STATUS_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* GPS Capture */}
              <div className="p-3.5 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#0B192C] dark:text-white">
                    إحداثيات موقع الزيارة (GPS)
                  </span>
                  <button
                    type="button"
                    onClick={handleCaptureGPS}
                    disabled={locating}
                    className="min-h-[36px] px-3 rounded-xl bg-[#0D9488] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Compass className="w-3.5 h-3.5" />
                    <span>{locating ? 'جاري التحديد...' : 'تثبيت موقعي الحالي'}</span>
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    step="any"
                    value={latitude}
                    onChange={(e) => setLatitude(e.target.value)}
                    placeholder="Latitude"
                    className="min-h-[40px] px-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                  />
                  <input
                    type="number"
                    step="any"
                    value={longitude}
                    onChange={(e) => setLongitude(e.target.value)}
                    placeholder="Longitude"
                    className="min-h-[40px] px-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                  />
                </div>
              </div>

              {/* Photo Attachment */}
              <div className="p-3.5 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs">
                  <div className="font-bold text-[#0B192C] dark:text-white">إرفاق صورة ميدانية (اختياري)</div>
                  <div className="text-slate-500 mt-0.5">
                    {photoSummary || 'لم يتم اختيار صورة بعد'}
                  </div>
                </div>
                <label className="min-h-[38px] px-3.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
                  <Camera className="w-4 h-4 text-[#0284C7]" />
                  <span>التقاط / اختيار صورة</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handlePhotoFileChange}
                    className="hidden"
                  />
                </label>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">ملاحظات المعاينة الميدانية</label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="سجّل مشاهداتك حول حالة العقار والوحدات..."
                  className="w-full p-3 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                />
              </div>

              <div className="text-[11px] text-slate-500">
                سيتم تسجيل الزيارة باسم الموظف الميداني: <strong>{userProfile?.displayName}</strong>
              </div>

              <div className="flex justify-end gap-2 pt-2">
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
                  {submitting ? 'جاري التوثيق...' : 'حفظ الزيارة الميدانية'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
