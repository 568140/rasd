import React, { useState, useMemo } from 'react';
import {
  CalendarClock,
  Plus,
  Bell,
  CheckCircle2,
  RotateCcw,
  AlertTriangle,
  History,
  MapPin,
  Building2,
} from 'lucide-react';
import { useRasd } from '../context/RasdContext';
import { Appointment } from '../types/rasd';

export const AppointmentsScreen: React.FC = () => {
  const {
    appointments,
    postponements,
    properties,
    taxpayers,
    addAppointment,
    postponeAppointment,
    updateAppointmentStatus,
    setActiveScreen,
    setSelectedTaxpayerId,
    setSelectedPropertyId,
    showToast,
  } = useRasd();

  const [tab, setTab] = useState<'upcoming' | 'overdue' | 'completed' | 'history'>('upcoming');

  // Create Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const [scheduledDate, setScheduledDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [scheduledTime, setScheduledTime] = useState('10:00');
  const [locationText, setLocationText] = useState('');
  const [notes, setNotes] = useState('');
  const [ignoreConflict, setIgnoreConflict] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Postpone Modal State
  const [postponingAppt, setPostponingAppt] = useState<Appointment | null>(null);
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [postponeReason, setPostponeReason] = useState('');

  const todayStr = new Date().toISOString().slice(0, 10);

  // Duplicate / Conflict Detection
  const conflictingAppointments = useMemo(() => {
    if (!scheduledDate) return [];
    return appointments.filter(
      (a) =>
        a.status !== 'cancelled' &&
        a.scheduledDate === scheduledDate &&
        (a.scheduledTime === scheduledTime || (propertyId && a.propertyId === propertyId))
    );
  }, [appointments, scheduledDate, scheduledTime, propertyId]);

  const filteredList = useMemo(() => {
    return appointments
      .filter((a) => {
        if (tab === 'upcoming') {
          return a.scheduledDate >= todayStr && (a.status === 'upcoming' || a.status === 'postponed');
        }
        if (tab === 'overdue') {
          return a.scheduledDate < todayStr && (a.status === 'upcoming' || a.status === 'postponed');
        }
        if (tab === 'completed') {
          return a.status === 'completed' || a.status === 'cancelled';
        }
        return true;
      })
      .sort((a, b) => `${a.scheduledDate} ${a.scheduledTime}`.localeCompare(`${b.scheduledDate} ${b.scheduledTime}`));
  }, [appointments, tab, todayStr]);

  const openCreateModal = () => {
    if (properties.length === 0 && taxpayers.length === 0) {
      showToast('يرجى إضافة مكلف أو عقار أولًا لربط الموعد به.', 'warning');
      return;
    }
    setTitle('');
    setPropertyId(properties[0]?.id || '');
    setScheduledDate(todayStr);
    setScheduledTime('10:00');
    setLocationText(properties[0]?.address || '');
    setNotes('');
    setIgnoreConflict(false);
    setIsCreateOpen(true);
  };

  const handleRequestBrowserNotifications = async () => {
    if (!('Notification' in window)) {
      showToast('هذا المتصفح لا يدعم إشعارات سطح المكتب/الهاتف المباشرة.', 'warning');
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      new Notification('رَصْد — المساعد الميداني الذكي', {
        body: 'تم تفعيل تذكيرات المواعيد الميدانية بنجاح.',
      });
      showToast('تم تفعيل إشعارات المتصفح للمواعيد', 'success');
    } else {
      showToast('تم رفض إذن الإشعارات. ستستمر التذكيرات بالظهور داخل التطبيق.', 'info');
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (conflictingAppointments.length > 0 && !ignoreConflict) {
      return;
    }

    const prop = properties.find((p) => p.id === propertyId);
    const tp = taxpayers.find((t) => t.id === prop?.taxpayerId) || taxpayers[0];

    setSubmitting(true);
    try {
      await addAppointment({
        title,
        propertyId: prop?.id || 'general_prop',
        propertyTitle: prop?.title || 'عقار عام',
        taxpayerId: prop?.taxpayerId || tp?.id || 'general_tp',
        taxpayerName: prop?.taxpayerName || tp?.fullName || 'مكلف',
        scheduledDate,
        scheduledTime,
        locationText: locationText || prop?.address || '',
        status: 'upcoming',
        notes,
      });
      setIsCreateOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handlePostponeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!postponingAppt || submitting) return;
    setSubmitting(true);
    try {
      await postponeAppointment(postponingAppt, newDate, newTime, postponeReason);
      setPostponingAppt(null);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#0B192C] dark:text-white font-display">
            المواعيد والتذكيرات الميدانية
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            جدولة المعاينات وإدارة التأجيلات وتوثيق أسبابها
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRequestBrowserNotifications}
            className="min-h-[44px] px-3.5 rounded-2xl bg-white dark:bg-[#0D1829] border border-slate-200 dark:border-slate-800 text-xs font-semibold text-[#0B192C] dark:text-slate-200 flex items-center gap-1.5 shadow-2xs cursor-pointer"
          >
            <Bell className="w-4 h-4 text-[#0284C7]" />
            <span>تفعيل التنبيهات</span>
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            className="min-h-[44px] px-4 rounded-2xl bg-[#0B192C] hover:bg-[#132A46] dark:bg-[#0D9488] dark:hover:bg-teal-600 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>موعد جديد</span>
          </button>
        </div>
      </div>

      {/* Interactive Segmented Filter Tabs */}
      <div className="grid grid-cols-4 gap-1.5 p-1.5 bg-slate-200/75 dark:bg-[#0D1829] rounded-2xl border border-slate-200/60 dark:border-slate-800">
        {[
          { id: 'upcoming', label: 'القادمة' },
          { id: 'overdue', label: 'المتأخرة' },
          { id: 'completed', label: 'المنجزة' },
          { id: 'history', label: 'سجل التأجيلات' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id as any)}
            className={`min-h-[42px] rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              tab === t.id
                ? 'bg-[#0B192C] dark:bg-[#0D9488] text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-[#0B192C] dark:hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Postponements Immutable Log Tab */}
      {tab === 'history' ? (
        <div className="bg-white dark:bg-[#0D1829] border border-slate-200/90 dark:border-slate-800 rounded-3xl p-5 shadow-2xs">
          <div className="flex items-center gap-2 mb-4">
            <History className="w-5 h-5 text-[#0284C7]" />
            <h2 className="text-base font-bold text-[#0B192C] dark:text-white font-display">
              سجل إعادة الجدولة والتأجيلات الموثق ({postponements.length})
            </h2>
          </div>
          {postponements.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">لم يتم تأجيل أي موعد حتى الآن.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {postponements.map((p) => (
                <div key={p.id} className="py-3.5 text-xs space-y-1">
                  <div className="font-bold text-[#0B192C] dark:text-white">
                    السبب الموثق: {p.reason}
                  </div>
                  <div className="text-slate-500 flex flex-wrap items-center gap-2">
                    <span>
                      من: <strong className="font-mono">{p.previousDate} ({p.previousTime})</strong>
                    </span>
                    <span aria-hidden="true">&larr;</span>
                    <span>
                      إلى:{' '}
                      <strong className="font-mono text-[#0D9488] dark:text-teal-400">
                        {p.newDate} ({p.newTime})
                      </strong>
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>بواسطة: {p.createdByName}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : filteredList.length === 0 ? (
        <div className="bg-white dark:bg-[#0D1829] border border-slate-200/90 dark:border-slate-800 rounded-3xl p-10 text-center shadow-2xs">
          <CalendarClock className="w-10 h-10 text-slate-400 mx-auto mb-2" />
          <h3 className="text-base font-bold text-[#0B192C] dark:text-white mb-1 font-display">
            لا توجد مواعيد في هذا التصنيف
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            يمكنك إضافة موعد جديد وربطه بأي عقار أو مكلف في مساحة عملك.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredList.map((appt) => {
            const isOverdue = appt.scheduledDate < todayStr && appt.status !== 'completed';
            return (
              <div
                key={appt.id}
                className="bg-white dark:bg-[#0D1829] border border-slate-200/90 dark:border-slate-800 rounded-3xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs"
              >
                <div className="flex items-start gap-3.5 min-w-0">
                  {/* Date / Time Badge Block */}
                  <div
                    className={`px-3 py-2 rounded-2xl text-center shrink-0 font-mono ${
                      isOverdue
                        ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                        : appt.scheduledDate === todayStr
                        ? 'bg-teal-50 dark:bg-teal-950/70 text-[#0D9488] dark:text-teal-300 border border-teal-200 dark:border-teal-800'
                        : 'bg-[#F4F7FA] dark:bg-slate-900 text-[#0B192C] dark:text-slate-200 border border-slate-200/80 dark:border-slate-800'
                    }`}
                  >
                    <div className="text-sm font-bold">{appt.scheduledTime}</div>
                    <div className="text-[11px] opacity-85 mt-0.5">{appt.scheduledDate}</div>
                  </div>

                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedTaxpayerId(appt.taxpayerId);
                          setSelectedPropertyId(appt.propertyId);
                          setActiveScreen('taxpayers');
                        }}
                        className="inline-flex items-center gap-1 font-semibold text-[#0284C7] dark:text-sky-400 hover:underline cursor-pointer"
                      >
                        <Building2 className="w-3.5 h-3.5" />
                        <span>{appt.propertyTitle}</span>
                      </button>
                      <span aria-hidden="true">·</span>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedTaxpayerId(appt.taxpayerId);
                          setSelectedPropertyId(appt.propertyId);
                          setActiveScreen('taxpayers');
                        }}
                        className="font-semibold hover:text-[#0284C7] hover:underline cursor-pointer"
                      >
                        المكلف: {appt.taxpayerName}
                      </button>
                      {appt.postponeCount > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-amber-600 dark:text-amber-400 font-semibold">
                            مؤجل {appt.postponeCount} مرة
                          </span>
                        </>
                      )}
                    </div>

                    <h3 className="text-base font-bold text-[#0B192C] dark:text-white font-display">
                      {appt.title}
                    </h3>

                    {appt.locationText && (
                      <p className="text-xs text-slate-500 flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-[#0D9488] shrink-0" />
                        <span>{appt.locationText}</span>
                      </p>
                    )}
                    {appt.lastPostponeReason && (
                      <p className="text-xs text-amber-700 dark:text-amber-400">
                        آخر سبب تأجيل: {appt.lastPostponeReason}
                      </p>
                    )}
                  </div>
                </div>

                {appt.status !== 'completed' && appt.status !== 'cancelled' && (
                  <div className="flex items-center justify-end gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setPostponingAppt(appt);
                        setNewDate(appt.scheduledDate);
                        setNewTime(appt.scheduledTime);
                        setPostponeReason('');
                      }}
                      className="min-h-[42px] px-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-xs font-semibold text-[#0B192C] dark:text-slate-200 flex items-center gap-1.5 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>تأجيل</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => updateAppointmentStatus(appt, 'completed')}
                      className="min-h-[42px] px-4 rounded-xl bg-[#0D9488] hover:bg-teal-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>إنجاز</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create Appointment Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-lg bg-white dark:bg-[#0D1829] rounded-t-3xl sm:rounded-3xl p-6 border border-slate-200 dark:border-slate-800 max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mb-4 sm:hidden" />
            <h2 className="text-lg font-bold text-[#0B192C] dark:text-white mb-4 font-display">
              جدولة موعد ميداني جديد
            </h2>

            {conflictingAppointments.length > 0 && !ignoreConflict && (
              <div className="mb-4 p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 space-y-2 text-xs">
                <div className="flex items-center gap-2 font-bold text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>تنبيه: يوجد موعد آخر مجدول في نفس اليوم أو لنفس العقار!</span>
                </div>
                <p className="text-amber-700 dark:text-amber-300">
                  الموعد المتعارض: {conflictingAppointments[0].title} ({conflictingAppointments[0].scheduledTime})
                </p>
                <button
                  type="button"
                  onClick={() => setIgnoreConflict(true)}
                  className="underline font-bold text-amber-900 dark:text-amber-200 cursor-pointer"
                >
                  المتابعة بإنشاء الموعد رغم التداخل
                </button>
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold mb-1">عنوان الموعد / المهمة *</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="مثال: معاينة ميدانية للوحدات المستحدثة"
                  className="w-full min-h-[44px] px-3.5 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">العقار المرتبط</label>
                <select
                  value={propertyId}
                  onChange={(e) => {
                    setPropertyId(e.target.value);
                    const p = properties.find((x) => x.id === e.target.value);
                    if (p) setLocationText(p.address);
                  }}
                  className="w-full min-h-[44px] px-3.5 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                >
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title} — ({p.taxpayerName})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">التاريخ *</label>
                  <input
                    type="date"
                    required
                    value={scheduledDate}
                    onChange={(e) => {
                      setScheduledDate(e.target.value);
                      setIgnoreConflict(false);
                    }}
                    className="w-full min-h-[44px] px-3.5 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">الوقت *</label>
                  <input
                    type="time"
                    required
                    value={scheduledTime}
                    onChange={(e) => {
                      setScheduledTime(e.target.value);
                      setIgnoreConflict(false);
                    }}
                    className="w-full min-h-[44px] px-3.5 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">الموقع</label>
                <input
                  type="text"
                  value={locationText}
                  onChange={(e) => setLocationText(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">ملاحظات</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full p-3 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="min-h-[44px] px-5 rounded-2xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={submitting || (conflictingAppointments.length > 0 && !ignoreConflict)}
                  className="min-h-[44px] px-6 rounded-2xl bg-[#0B192C] dark:bg-[#0D9488] text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  حفظ الموعد
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Postpone Appointment Modal */}
      {postponingAppt && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-[#0D1829] rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xl">
            <h3 className="text-base font-bold text-[#0B192C] dark:text-white mb-1 font-display">
              إعادة جدولة الموعد وتوثيق سبب التأجيل
            </h3>
            <p className="text-xs text-slate-500 mb-4">{postponingAppt.title}</p>

            <form onSubmit={handlePostponeSubmit} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">التاريخ الجديد *</label>
                  <input
                    type="date"
                    required
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="w-full min-h-[42px] px-3 rounded-xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">الوقت الجديد *</label>
                  <input
                    type="time"
                    required
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                    className="w-full min-h-[42px] px-3 rounded-xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">سبب التأجيل (إلزامي للتوثيق) *</label>
                <textarea
                  rows={2}
                  required
                  value={postponeReason}
                  onChange={(e) => setPostponeReason(e.target.value)}
                  placeholder="مثال: طلب المكلف تأجيل المعاينة لعدم تواجده في الموقع"
                  className="w-full p-3 rounded-xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPostponingAppt(null)}
                  className="min-h-[42px] px-4 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-[42px] px-5 rounded-xl bg-[#0D9488] text-white text-xs font-bold cursor-pointer"
                >
                  حفظ التأجيل
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
