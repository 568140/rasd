import React, { useState, useEffect, useMemo } from 'react';
import {
  Building2,
  Users,
  UserPlus,
  MapPin,
  CalendarClock,
  Calendar,
  Mic,
  Plus,
  FileText,
  FileSpreadsheet,
  ArrowLeft,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Wallet,
  ChevronDown,
  ChevronUp,
  Search,
  X,
  Phone,
} from 'lucide-react';
import { useRasd } from '../context/RasdContext';
import {
  getMinutesUntilAden,
  evaluateAppointmentStatus,
  sanitizeReminderMinutes,
  formatTimeTo12Hour,
} from '../utils/dateUtils';
import { alertSound } from '../services/alertSound';
import { useLiveAdenClock } from '../hooks/useLiveAdenClock';

export const HomeScreen: React.FC = () => {
  const [isTasksCardCollapsed, setIsTasksCardCollapsed] = useState(false);
  const [isFinanceCardCollapsed, setIsFinanceCardCollapsed] = useState(false);
  const [quickSearchQuery, setQuickSearchQuery] = useState('');
  const [defaultReminderMins, setDefaultReminderMins] = useState<number>(() =>
    alertSound.getDefaultReminderMinutes()
  );

  const liveClock = useLiveAdenClock(1000);

  useEffect(() => {
    return alertSound.subscribe((updated) => {
      setDefaultReminderMins(updated.defaultReminderMinutes);
    });
  }, []);

  const {
    userProfile,
    workspace,
    taxpayers,
    properties,
    propertyUnits,
    fieldVisits,
    appointments,
    assessments,
    transactions,
    setActiveScreen,
    setSelectedTaxpayerId,
    setSelectedPropertyId,
    setSelectedAppointmentId,
  } = useRasd();

  const todayStr = liveClock.todayStr;

  // Quick search results for taxpayers right from the Home Screen
  const quickMatchedTaxpayers = useMemo(() => {
    const q = quickSearchQuery.trim().toLowerCase();
    if (!q) return [];
    return taxpayers
      .filter(
        (t) =>
          t.fullName.toLowerCase().includes(q) ||
          t.internalCode.toLowerCase().includes(q) ||
          t.nationalOrCommercialId.toLowerCase().includes(q) ||
          t.phone.includes(q) ||
          t.region.toLowerCase().includes(q) ||
          t.address.toLowerCase().includes(q)
      )
      .slice(0, 5);
  }, [taxpayers, quickSearchQuery]);

  // Compute appointment groups accurately using live Aden time and configured reminder window
  const activeAppointments = appointments.filter(
    (a) => a.status === 'upcoming' || a.status === 'postponed'
  );

  const overdueAppointments = activeAppointments
    .filter((a) => getMinutesUntilAden(a.scheduledDate, a.scheduledTime, liveClock.now) < 0)
    .sort((a, b) =>
      `${a.scheduledDate} ${a.scheduledTime}`.localeCompare(`${b.scheduledDate} ${b.scheduledTime}`)
    );

  const upcomingAppointmentsAll = activeAppointments
    .filter((a) => getMinutesUntilAden(a.scheduledDate, a.scheduledTime, liveClock.now) >= 0)
    .sort((a, b) =>
      `${a.scheduledDate} ${a.scheduledTime}`.localeCompare(`${b.scheduledDate} ${b.scheduledTime}`)
    );

  const upcomingAppointments = upcomingAppointmentsAll.slice(0, 4);

  const completedApptsTodayCount = appointments.filter(
    (a) => a.status === 'completed' && a.scheduledDate === todayStr
  ).length;

  const completedVisitsTodayCount = fieldVisits.filter(
    (v) => v.status === 'completed' && v.visitDate === todayStr
  ).length;

  const completedTodayTotal = completedApptsTodayCount + completedVisitsTodayCount;

  // Visits requiring follow-up
  const followupVisits = useMemo(
    () =>
      fieldVisits
        .filter(
          (v) =>
            v.status === 'requires_followup' ||
            v.status === 'postponed' ||
            v.status === 'occupant_absent'
        )
        .slice(0, 3),
    [fieldVisits]
  );

  // Featured Next Appointment (Nearest upcoming first, or most recent overdue if none upcoming)
  const priorityAppointment =
    upcomingAppointmentsAll[0] || overdueAppointments[0] || null;

  const priorityDiffMin = priorityAppointment
    ? getMinutesUntilAden(priorityAppointment.scheduledDate, priorityAppointment.scheduledTime, liveClock.now)
    : null;

  const priorityEvalState = priorityAppointment
    ? evaluateAppointmentStatus(
        priorityAppointment.status,
        priorityAppointment.scheduledDate,
        priorityAppointment.scheduledTime,
        priorityAppointment.reminderMinutesBefore === 0
          ? 0
          : sanitizeReminderMinutes(
              priorityAppointment.reminderMinutesBefore ?? defaultReminderMins,
              defaultReminderMins
            ),
        liveClock.now
      )
    : null;

  const approvedAssessmentsTotal = assessments
    .filter((a) => a.status === 'approved')
    .reduce((sum, a) => sum + (Number(a.amount) || 0), 0);

  const approvedPaymentsTotal = transactions
    .filter((t) => t.status === 'approved' && t.transactionType === 'payment')
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

  const handleTriggerAddTaxpayer = () => {
    try {
      sessionStorage.setItem('rasd_quick_action', 'open_add_taxpayer');
    } catch {
      // ignore storage errors
    }
    setSelectedPropertyId(null);
    setSelectedTaxpayerId(null);
    setActiveScreen('taxpayers');
  };

  const handleTriggerAddProperty = () => {
    try {
      sessionStorage.setItem('rasd_quick_action', 'open_add_property');
    } catch {
      // ignore storage errors
    }
    setSelectedPropertyId(null);
    setActiveScreen('properties');
  };

  const handleOpenSearchInTaxpayers = () => {
    try {
      if (quickSearchQuery.trim()) {
        sessionStorage.setItem('rasd_quick_search_q', quickSearchQuery.trim());
      } else {
        sessionStorage.setItem('rasd_quick_action', 'focus_search');
      }
    } catch {
      // ignore storage errors
    }
    setSelectedPropertyId(null);
    setSelectedTaxpayerId(null);
    setActiveScreen('taxpayers');
  };

  const handleOpenProtocols = () => {
    try {
      sessionStorage.setItem('rasd_quick_action', 'view_all_visits');
    } catch {
      // ignore storage errors
    }
    setActiveScreen('visits');
  };

  const handleTriggerAddVisit = () => {
    try {
      sessionStorage.setItem('rasd_quick_action', 'open_add_visit');
    } catch {
      // ignore storage errors
    }
    setActiveScreen('visits');
  };

  return (
    <div className="space-y-4 pb-6" dir="rtl">
      {/* 1. User Greeting & Quick Search Bar — Matching Reference Image */}
      <section className="bg-white dark:bg-[#0D1829] rounded-2xl border border-[#E2E8F0] dark:border-slate-800 p-3.5 sm:p-4 shadow-[0_2px_10px_rgba(11,25,44,0.04)] space-y-3">
        <div className="flex items-center justify-between gap-2.5">
          <div className="min-w-0 flex-1">
            <h2 className="text-base min-[360px]:text-lg sm:text-xl font-extrabold text-[#172334] dark:text-white font-display leading-snug truncate">
              مرحباً أ. {userProfile?.displayName || 'المسؤول الميداني'}
            </h2>
            <p className="text-[11px] min-[360px]:text-xs font-medium text-[#64748B] dark:text-slate-400 mt-0.5 truncate">
              أهلاً بك في منصة رَصْد — المساعد الميداني الذكي
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActiveScreen('voice')}
            className="min-h-[38px] px-2.5 sm:px-3 rounded-xl bg-[#F4F6F9] hover:bg-slate-200/70 dark:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700 text-[#0B192C] dark:text-[#B48327] text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
          >
            <Mic className="w-3.5 h-3.5 text-[#B48327]" />
            <span>أمر صوتي</span>
          </button>
        </div>

        {/* Direct Quick Search Bar for Taxpayers */}
        <div className="relative">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[#64748B] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={quickSearchQuery}
                onChange={(e) => setQuickSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleOpenSearchInTaxpayers();
                  }
                }}
                placeholder="ابحث عن مكلف بالاسم، رقم الملف، الهوية، الهاتف..."
                className="w-full min-h-[44px] pr-10 pl-9 rounded-xl bg-[#F4F6F9] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-700 text-xs text-[#172334] dark:text-white placeholder:text-[#64748B] focus:outline-none focus:border-[#0B192C] dark:focus:border-[#B48327] transition-colors"
              />
              {quickSearchQuery && (
                <button
                  type="button"
                  onClick={() => setQuickSearchQuery('')}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-[#64748B] hover:text-[#172334] cursor-pointer"
                  aria-label="مسح البحث"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={handleOpenSearchInTaxpayers}
              className="min-h-[44px] px-4 rounded-xl bg-[#0B192C] hover:bg-[#132A46] text-white text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors"
            >
              <Search className="w-3.5 h-3.5 text-[#B48327]" />
              <span>بحث</span>
            </button>
          </div>

          {/* Instant Search Dropdown Results */}
          {quickSearchQuery.trim().length > 0 && (
            <div className="mt-2 rounded-xl bg-white dark:bg-[#0D1829] border border-[#E2E8F0] dark:border-slate-700 shadow-lg overflow-hidden divide-y divide-[#E2E8F0] dark:divide-slate-800">
              {quickMatchedTaxpayers.length === 0 ? (
                <div className="p-3.5 text-center text-xs text-[#64748B] dark:text-slate-400 flex items-center justify-between">
                  <span>لا يوجد مكلف مطابق لـ «{quickSearchQuery}»</span>
                  <button
                    type="button"
                    onClick={handleTriggerAddTaxpayer}
                    className="text-[#B48327] font-bold hover:underline cursor-pointer"
                  >
                    + إضافة مكلف جديد
                  </button>
                </div>
              ) : (
                <>
                  {quickMatchedTaxpayers.map((tp) => (
                    <button
                      key={tp.id}
                      type="button"
                      onClick={() => {
                        setQuickSearchQuery('');
                        setSelectedPropertyId(null);
                        setSelectedTaxpayerId(tp.id);
                        setActiveScreen('taxpayers');
                      }}
                      className="w-full p-3 text-right hover:bg-[#F4F6F9] dark:hover:bg-slate-800/70 flex items-center justify-between gap-3 transition-colors cursor-pointer"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-extrabold text-[#172334] dark:text-white truncate">
                          {tp.fullName}
                        </div>
                        <div className="text-[11px] text-[#64748B] dark:text-slate-400 font-mono mt-0.5">
                          الملف: {tp.internalCode}
                          {tp.nationalOrCommercialId ? ` · الهوية: ${tp.nationalOrCommercialId}` : ''}
                          {tp.region ? ` · ${tp.region}` : ''}
                        </div>
                      </div>
                      <span className="text-[11px] font-bold text-[#0B192C] dark:text-[#B48327] shrink-0 flex items-center gap-1">
                        <span>فتح الملف</span>
                        <ArrowLeft className="w-3.5 h-3.5" />
                      </span>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={handleOpenSearchInTaxpayers}
                    className="w-full py-2.5 px-3 bg-[#F4F6F9] dark:bg-slate-900 text-center text-xs font-bold text-[#0B192C] dark:text-[#B48327] hover:underline cursor-pointer"
                  >
                    عرض كل النتائج في شاشة دافعي الضرائب ({quickMatchedTaxpayers.length})
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </section>

      {/* 2. Featured Next Appointment & Live Date/Time Card — Matching Reference Image */}
      <section
        aria-label="أقرب موعد"
        className="bg-white dark:bg-[#0D1829] rounded-2xl border border-[#E2E8F0] dark:border-slate-800 p-4 shadow-[0_2px_10px_rgba(11,25,44,0.04)]"
      >
        {/* Top Row: Region/Date/Time + Clock Icon */}
        <div className="flex items-center justify-between gap-3 pb-3.5 border-b border-[#E2E8F0] dark:border-slate-800">
          <div className="space-y-1">
            <div className="text-xs font-extrabold text-[#172334] dark:text-white">
              {workspace?.regionName ? `النطاق الميداني: ${workspace.regionName}` : 'التوقيت الميداني المباشر'}
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-[#64748B] dark:text-slate-400">
              <span className="inline-flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-[#B48327]" />
                <span>{liveClock.formattedDateArabic}</span>
              </span>
              <span className="inline-flex items-center gap-1 font-mono font-bold text-[#172334] dark:text-slate-200 tabular-nums">
                <Clock className="w-3.5 h-3.5 text-[#0B192C] dark:text-[#B48327]" />
                <span>{liveClock.formattedTimeArabic}</span>
              </span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[#F4F6F9] dark:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700 text-[#0B192C] dark:text-[#B48327] flex items-center justify-center shrink-0">
            <Clock className="w-6 h-6" />
          </div>
        </div>

        {/* Inner Box: Nearest Appointment Details */}
        <div className="mt-3.5 rounded-2xl bg-[#F4F6F9] dark:bg-slate-900/90 border border-[#E2E8F0] dark:border-slate-800 p-3.5">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-xs font-extrabold text-[#172334] dark:text-white">
              أقرب موعد
            </span>
            {priorityAppointment && (
              <>
                {priorityDiffMin !== null && priorityDiffMin < 0 ? (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#FEF2F2] text-[#DC2626] border border-red-200">
                    متأخر
                  </span>
                ) : priorityEvalState === 'due' ? (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#FFFBEB] text-[#D97706] border border-amber-200">
                    مستحق الآن
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#ECFDF5] text-[#059669] border border-emerald-200">
                    قادم
                  </span>
                )}
              </>
            )}
          </div>

          {priorityAppointment ? (
            <div className="space-y-2">
              <div className="text-xs sm:text-sm font-bold text-[#172334] dark:text-white flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-[#64748B] shrink-0" />
                <span className="truncate">
                  {priorityAppointment.title} — {priorityAppointment.taxpayerName || 'مكلف عام'}
                </span>
              </div>
              <div className="text-xs text-[#64748B] dark:text-slate-400 flex items-center gap-1.5 font-mono tabular-nums">
                <Calendar className="w-3.5 h-3.5 text-[#64748B] shrink-0" />
                <span>
                  {priorityAppointment.scheduledDate} - {formatTimeTo12Hour(priorityAppointment.scheduledTime)}
                </span>
              </div>
              <div className="pt-1 flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedAppointmentId(priorityAppointment.id);
                    setActiveScreen('appointments');
                  }}
                  className="min-h-[36px] px-4 rounded-xl bg-[#B48327] hover:bg-[#966B1D] text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                >
                  <span>عرض التفاصيل</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="py-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs font-bold text-[#172334] dark:text-white">
                  لا توجد مواعيد قادمة مجدولة حاليًا
                </div>
                <div className="text-[11px] text-[#64748B] dark:text-slate-400 mt-0.5">
                  يمكنك جدولة موعد ميداني جديد لمتابعة المكلفين والعقارات.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveScreen('appointments')}
                className="min-h-[36px] px-4 rounded-xl bg-[#B48327] hover:bg-[#966B1D] text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>جدولة موعد</span>
              </button>
            </div>
          )}
        </div>
      </section>

      {/* 3. Quick Actions (إجراءات سريعة) — Matching Reference Image (Map replaced with Add Property) */}
      <section className="bg-white dark:bg-[#0D1829] rounded-2xl border border-[#E2E8F0] dark:border-slate-800 p-4 shadow-[0_2px_10px_rgba(11,25,44,0.04)] space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm sm:text-base font-extrabold text-[#172334] dark:text-white font-display">
            إجراءات سريعة
          </h2>
          <button
            type="button"
            onClick={handleOpenSearchInTaxpayers}
            className="text-xs font-bold text-[#B48327] hover:underline flex items-center gap-1 cursor-pointer"
          >
            <Search className="w-3.5 h-3.5" />
            <span>دليل المكلفين ({taxpayers.length})</span>
          </button>
        </div>

        <div className="grid grid-cols-2 min-[360px]:grid-cols-4 gap-2 sm:gap-2.5">
          {/* 1. إضافة مكلف */}
          <button
            type="button"
            onClick={handleTriggerAddTaxpayer}
            className="min-h-[80px] sm:min-h-[84px] p-2 sm:p-2.5 rounded-2xl bg-[#F4F6F9] hover:bg-[#0B192C] dark:bg-slate-900 dark:hover:bg-[#B48327] border border-[#E2E8F0] dark:border-slate-800 text-[#172334] hover:text-white dark:text-white flex flex-col items-center justify-center text-center gap-1.5 sm:gap-2 transition-all cursor-pointer group"
          >
            <div className="w-9 h-9 rounded-xl bg-white dark:bg-slate-800 group-hover:bg-white/15 text-[#0B192C] dark:text-[#B48327] group-hover:text-white flex items-center justify-center border border-[#E2E8F0] dark:border-slate-700 group-hover:border-transparent transition-colors">
              <UserPlus className="w-4 h-4" />
            </div>
            <span className="text-[11px] sm:text-xs font-bold leading-tight">
              إضافة مكلف
            </span>
          </button>

          {/* 2. المحاضر */}
          <button
            type="button"
            onClick={handleOpenProtocols}
            title="عرض سجل المحاضر والزيارات الميدانية"
            className="min-h-[80px] sm:min-h-[84px] p-2 sm:p-2.5 rounded-2xl bg-[#F4F6F9] hover:bg-[#0B192C] dark:bg-slate-900 dark:hover:bg-[#B48327] border border-[#E2E8F0] dark:border-slate-800 text-[#172334] hover:text-white dark:text-white flex flex-col items-center justify-center text-center gap-1.5 sm:gap-2 transition-all cursor-pointer group"
          >
            <div className="w-9 h-9 rounded-xl bg-white dark:bg-slate-800 group-hover:bg-white/15 text-[#0B192C] dark:text-[#B48327] group-hover:text-white flex items-center justify-center border border-[#E2E8F0] dark:border-slate-700 group-hover:border-transparent transition-colors">
              <FileText className="w-4 h-4" />
            </div>
            <span className="text-[11px] sm:text-xs font-bold leading-tight">
              المحاضر
            </span>
          </button>

          {/* 3. زيارة ميدانية */}
          <button
            type="button"
            onClick={handleTriggerAddVisit}
            title="توثيق زيارة ميدانية جديدة"
            className="min-h-[80px] sm:min-h-[84px] p-2 sm:p-2.5 rounded-2xl bg-[#F4F6F9] hover:bg-[#0B192C] dark:bg-slate-900 dark:hover:bg-[#B48327] border border-[#E2E8F0] dark:border-slate-800 text-[#172334] hover:text-white dark:text-white flex flex-col items-center justify-center text-center gap-1.5 sm:gap-2 transition-all cursor-pointer group"
          >
            <div className="w-9 h-9 rounded-xl bg-white dark:bg-slate-800 group-hover:bg-white/15 text-[#0B192C] dark:text-[#B48327] group-hover:text-white flex items-center justify-center border border-[#E2E8F0] dark:border-slate-700 group-hover:border-transparent transition-colors">
              <MapPin className="w-4 h-4" />
            </div>
            <span className="text-[11px] sm:text-xs font-bold leading-tight">
              زيارة ميدانية
            </span>
          </button>

          {/* 4. إضافة عقار (بديل زر الخريطة المستبعد) */}
          <button
            type="button"
            onClick={handleTriggerAddProperty}
            className="min-h-[80px] sm:min-h-[84px] p-2 sm:p-2.5 rounded-2xl bg-[#F4F6F9] hover:bg-[#0B192C] dark:bg-slate-900 dark:hover:bg-[#B48327] border border-[#E2E8F0] dark:border-slate-800 text-[#172334] hover:text-white dark:text-white flex flex-col items-center justify-center text-center gap-1.5 sm:gap-2 transition-all cursor-pointer group"
          >
            <div className="w-9 h-9 rounded-xl bg-white dark:bg-slate-800 group-hover:bg-white/15 text-[#0B192C] dark:text-[#B48327] group-hover:text-white flex items-center justify-center border border-[#E2E8F0] dark:border-slate-700 group-hover:border-transparent transition-colors">
              <Building2 className="w-4 h-4" />
            </div>
            <span className="text-[11px] sm:text-xs font-bold leading-tight">
              إضافة عقار
            </span>
          </button>
        </div>
      </section>

      {/* 4. Today's Summary (ملخص اليوم بأرقام حقيقية) — Matching Reference Image */}
      <section className="bg-white dark:bg-[#0D1829] rounded-2xl border border-[#E2E8F0] dark:border-slate-800 p-4 shadow-[0_2px_10px_rgba(11,25,44,0.04)] space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm sm:text-base font-extrabold text-[#172334] dark:text-white font-display">
            ملخص اليوم
          </h2>
          <span className="text-[11px] font-mono text-[#64748B] dark:text-slate-400 tabular-nums">
            {todayStr}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          {/* المكتملة */}
          <button
            type="button"
            onClick={() => setActiveScreen('appointments')}
            className="p-3 rounded-2xl bg-[#F4F6F9] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 flex flex-col items-center justify-center text-center gap-1.5 hover:border-[#0B192C] transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#172334] dark:text-slate-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              <span>المكتملة</span>
            </div>
            <span className="text-xl sm:text-2xl font-extrabold text-[#172334] dark:text-white font-mono tabular-nums leading-none">
              {completedTodayTotal}
            </span>
          </button>

          {/* القادمة */}
          <button
            type="button"
            onClick={() => setActiveScreen('appointments')}
            className="p-3 rounded-2xl bg-[#F4F6F9] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 flex flex-col items-center justify-center text-center gap-1.5 hover:border-[#0B192C] transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#172334] dark:text-slate-200">
              <span className="w-2 h-2 rounded-full bg-[#0284C7] shrink-0" />
              <span>القادمة</span>
            </div>
            <span className="text-xl sm:text-2xl font-extrabold text-[#172334] dark:text-white font-mono tabular-nums leading-none">
              {upcomingAppointmentsAll.length}
            </span>
          </button>

          {/* المتأخرة */}
          <button
            type="button"
            onClick={() => setActiveScreen('appointments')}
            className="p-3 rounded-2xl bg-[#F4F6F9] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 flex flex-col items-center justify-center text-center gap-1.5 hover:border-[#0B192C] transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#172334] dark:text-slate-200">
              <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
              <span>المتأخرة</span>
            </div>
            <span className="text-xl sm:text-2xl font-extrabold text-[#172334] dark:text-white font-mono tabular-nums leading-none">
              {overdueAppointments.length}
            </span>
          </button>
        </div>
      </section>

      {/* 5. Follow-up & Due Schedule (ملخص المواعيد والزيارات والحالات التي تحتاج إلى متابعة) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        <section className="lg:col-span-7 bg-white dark:bg-[#0D1829] border border-[#E2E8F0] dark:border-slate-800 rounded-2xl p-4 shadow-[0_2px_10px_rgba(11,25,44,0.04)]">
          <div
            className={`flex items-center justify-between gap-3 ${
              isTasksCardCollapsed ? '' : 'mb-3.5 pb-3 border-b border-[#E2E8F0] dark:border-slate-800'
            }`}
          >
            <div
              onClick={() => setIsTasksCardCollapsed((prev) => !prev)}
              className="flex items-center gap-2.5 cursor-pointer select-none min-w-0 flex-1"
            >
              <div className="w-9 h-9 rounded-xl bg-[#F4F6F9] dark:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700 text-[#0B192C] dark:text-[#B48327] flex items-center justify-center shrink-0">
                <CalendarClock className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm sm:text-base font-extrabold text-[#172334] dark:text-white font-display truncate">
                  المواعيد والزيارات التي تحتاج متابعة
                </h2>
                <p className="text-[11px] text-[#64748B] dark:text-slate-400 mt-0.5 truncate">
                  {overdueAppointments.length} متأخر · {upcomingAppointmentsAll.length} قادم ·{' '}
                  {followupVisits.length} زيارة للمتابعة
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setActiveScreen('appointments')}
                className="min-h-[34px] px-3 rounded-xl text-xs font-bold text-[#0B192C] dark:text-[#B48327] bg-[#F4F6F9] hover:bg-slate-200/70 dark:bg-slate-800 flex items-center gap-1 cursor-pointer transition-colors"
              >
                <span>الكل</span>
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setIsTasksCardCollapsed((prev) => !prev)}
                aria-expanded={!isTasksCardCollapsed}
                className="w-8 h-8 rounded-xl bg-[#F4F6F9] dark:bg-slate-800 text-[#64748B] flex items-center justify-center cursor-pointer"
              >
                {isTasksCardCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {!isTasksCardCollapsed && (
            <div className="space-y-2.5">
              {overdueAppointments.length > 0 && (
                <div className="p-3 rounded-xl bg-[#FEF2F2] dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs text-red-800 dark:text-red-300">
                    <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                    <span>
                      يوجد <strong className="font-mono">{overdueAppointments.length}</strong> موعد متأخر يحتاج إلى متابعة أو تأجيل.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveScreen('appointments')}
                    className="min-h-[32px] px-3 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold shrink-0 cursor-pointer"
                  >
                    متابعة
                  </button>
                </div>
              )}

              {upcomingAppointments.length === 0 && followupVisits.length === 0 ? (
                <div className="py-6 px-4 text-center border border-dashed border-[#E2E8F0] dark:border-slate-800 rounded-xl bg-[#F4F6F9]/50 dark:bg-slate-900/40">
                  <CalendarClock className="w-7 h-7 text-[#64748B] mx-auto mb-1.5" />
                  <p className="text-xs font-bold text-[#172334] dark:text-white">
                    لا توجد مواعيد أو زيارات معلّقة للمتابعة حاليًا
                  </p>
                  <p className="text-[11px] text-[#64748B] dark:text-slate-400 mt-0.5">
                    جميع المواعيد والزيارات محدثة وفق البيانات الفعلية.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {upcomingAppointments.map((appt) => {
                    const isToday = appt.scheduledDate === todayStr;
                    return (
                      <div
                        key={appt.id}
                        className="p-3 rounded-xl bg-[#F4F6F9] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`px-2.5 py-1.5 rounded-xl text-center shrink-0 font-mono text-xs font-bold tabular-nums ${
                              isToday
                                ? 'bg-[#0B192C] text-white'
                                : 'bg-white dark:bg-slate-800 text-[#172334] dark:text-white border border-[#E2E8F0] dark:border-slate-700'
                            }`}
                          >
                            <div>{formatTimeTo12Hour(appt.scheduledTime)}</div>
                            <div className="text-[10px] font-normal opacity-80">{appt.scheduledDate.slice(5)}</div>
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs sm:text-sm font-bold text-[#172334] dark:text-white truncate">
                              {appt.title}
                            </div>
                            <div className="text-[11px] text-[#64748B] dark:text-slate-400 mt-0.5 truncate">
                              {appt.taxpayerName}
                              {appt.propertyTitle ? ` · ${appt.propertyTitle}` : ''}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (appt.taxpayerId && appt.taxpayerId !== 'general_tp') {
                              setSelectedTaxpayerId(appt.taxpayerId);
                              setSelectedPropertyId(appt.propertyId);
                              setActiveScreen('taxpayers');
                            } else {
                              setSelectedAppointmentId(appt.id);
                              setActiveScreen('appointments');
                            }
                          }}
                          className="min-h-[34px] px-3 rounded-xl bg-white dark:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700 text-xs font-bold text-[#0B192C] dark:text-[#B48327] shrink-0 cursor-pointer"
                        >
                          فتح
                        </button>
                      </div>
                    );
                  })}

                  {followupVisits.map((visit) => (
                    <div
                      key={visit.id}
                      className="p-3 rounded-xl bg-[#FFFBEB] dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                          <span className="text-xs font-bold text-[#172334] dark:text-white truncate">
                            زيارة تتطلب متابعة: {visit.taxpayerName}
                          </span>
                        </div>
                        <div className="text-[11px] text-[#64748B] dark:text-slate-400 mt-0.5 truncate">
                          {visit.propertyTitle} · {visit.visitDate}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveScreen('visits')}
                        className="min-h-[32px] px-3 rounded-lg bg-[#B48327] text-white text-xs font-bold shrink-0 cursor-pointer"
                      >
                        الزيارة
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Left Column (5 cols): Records & Financial Overview */}
        <section className="lg:col-span-5 bg-white dark:bg-[#0D1829] border border-[#E2E8F0] dark:border-slate-800 rounded-2xl p-4 shadow-[0_2px_10px_rgba(11,25,44,0.04)] space-y-3">
          <div
            onClick={() => setIsFinanceCardCollapsed((prev) => !prev)}
            className="flex items-center justify-between gap-2 cursor-pointer select-none"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#F4F6F9] dark:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700 text-[#0B192C] dark:text-[#B48327] flex items-center justify-center shrink-0">
                <Wallet className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-extrabold text-[#172334] dark:text-white font-display">
                  ملخص السجلات والماليات
                </h2>
                <p className="text-[11px] text-[#64748B] dark:text-slate-400">
                  {taxpayers.length} مكلف · {properties.length} عقار · {propertyUnits.length} وحدة
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsFinanceCardCollapsed((prev) => !prev);
              }}
              className="w-8 h-8 rounded-xl bg-[#F4F6F9] dark:bg-slate-800 text-[#64748B] flex items-center justify-center cursor-pointer"
            >
              {isFinanceCardCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
          </div>

          {!isFinanceCardCollapsed && (
            <div className="space-y-2.5 pt-2 border-t border-[#E2E8F0] dark:border-slate-800">
              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-3 rounded-xl bg-[#F4F6F9] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800">
                  <div className="text-[11px] font-semibold text-[#64748B]">المطلوب المعتمد</div>
                  <div className="text-sm sm:text-base font-extrabold text-[#172334] dark:text-white font-mono tabular-nums mt-1">
                    {approvedAssessmentsTotal.toLocaleString('en-US')}{' '}
                    <span className="text-[10px] font-normal">{workspace?.defaultCurrency || 'YER'}</span>
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-[#ECFDF5] dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50">
                  <div className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300">المدفوع المحصّل</div>
                  <div className="text-sm sm:text-base font-extrabold text-emerald-700 dark:text-emerald-400 font-mono tabular-nums mt-1">
                    {approvedPaymentsTotal.toLocaleString('en-US')}{' '}
                    <span className="text-[10px] font-normal">{workspace?.defaultCurrency || 'YER'}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setActiveScreen('assessments')}
                  className="min-h-[38px] rounded-xl bg-[#F4F6F9] hover:bg-slate-200/70 dark:bg-slate-800 text-xs font-bold text-[#172334] dark:text-white cursor-pointer transition-colors"
                >
                  المؤشرات المالية
                </button>
                <button
                  type="button"
                  onClick={() => setActiveScreen('transactions')}
                  className="min-h-[38px] rounded-xl bg-[#0B192C] hover:bg-[#132A46] text-xs font-bold text-white cursor-pointer transition-colors"
                >
                  سجل المعاملات
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
