import React, { useState, useEffect } from 'react';
import {
  Building2,
  Users,
  MapPin,
  CalendarClock,
  Calendar,
  Mic,
  Plus,
  FileSpreadsheet,
  ArrowLeft,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Layers,
  Wallet,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  Settings,
} from 'lucide-react';
import { useRasd } from '../context/RasdContext';
import {
  getMinutesUntilAden,
  evaluateAppointmentStatus,
  sanitizeReminderMinutes,
} from '../utils/dateUtils';
import { alertSound } from '../services/alertSound';
import { useLiveAdenClock } from '../hooks/useLiveAdenClock';

export const HomeScreen: React.FC = () => {
  const [isTasksCardCollapsed, setIsTasksCardCollapsed] = useState(false);
  const [isFinanceCardCollapsed, setIsFinanceCardCollapsed] = useState(false);
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

  const completedTodayCount = appointments.filter(
    (a) => a.status === 'completed' && a.scheduledDate === todayStr
  ).length;

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

  return (
    <div className="space-y-4 sm:space-y-5 pb-6" dir="rtl">
      {/* Live Aden Clock Ticker Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 rounded-2xl bg-[#FFFEFC] dark:bg-[#22201F] border border-[#E7E1D8] dark:border-[#383431] shadow-2xs">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </span>
          <span className="text-xs font-bold text-[#292725] dark:text-[#F4F1EA]">
            توقيت عدن المباشر:{' '}
            <span className="font-mono font-extrabold text-[#743B46] dark:text-[#E5B9C0]">
              {liveClock.formattedTimeArabic}
            </span>
          </span>
        </div>
        <div className="text-[11px] font-semibold text-[#77716B] dark:text-[#ACA59C]">
          {liveClock.formattedDateArabic}
        </div>
      </div>
      {/* 1. Featured "الموعد القادم" (Next Appointment) Hero Card — Matching Reference Image */}
      <section
        aria-label="الموعد القادم"
        className="relative rounded-[22px] bg-[#F2EDE4] dark:bg-[#23201E] border border-[#E4DDD3] dark:border-[#383431] p-4 sm:p-5 shadow-[0_4px_18px_rgba(41,39,37,0.04)] overflow-hidden"
      >
        {/* Vertical Burgundy Accent Bar on Right Edge */}
        <div className="absolute top-3.5 bottom-3.5 right-0 w-1.5 rounded-l-full bg-[#743B46]" />

        <div className="pr-2.5">
          {/* Top Header Row */}
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm sm:text-base font-extrabold text-[#292725] dark:text-[#F4F1EA] font-display">
              الموعد القادم
            </h2>
            <div className="w-8 h-8 rounded-xl bg-[#743B46]/10 dark:bg-[#743B46]/25 text-[#743B46] dark:text-[#E5B9C0] flex items-center justify-center shrink-0">
              <CalendarClock className="w-4 h-4" />
            </div>
          </div>

          {priorityAppointment ? (
            <>
              {/* Client / Taxpayer Name & Transaction Details */}
              <div className="mt-2.5">
                <div className="text-lg sm:text-xl font-extrabold text-[#292725] dark:text-[#F4F1EA] leading-snug">
                  {priorityAppointment.taxpayerName || 'مكلف عام'}
                </div>
                <div className="text-xs sm:text-sm font-medium text-[#6E675F] dark:text-[#B8B1A8] mt-0.5">
                  {priorityAppointment.title}
                  {priorityAppointment.propertyTitle
                    ? ` · ${priorityAppointment.propertyTitle}`
                    : ''}
                </div>
              </div>

              {/* Date, Time & Status Badge Row */}
              <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-3 text-xs font-bold text-[#5C554E] dark:text-[#CFC8BE]">
                  <span className="inline-flex items-center gap-1.5 font-mono">
                    <Calendar className="w-3.5 h-3.5 text-[#77716B]" />
                    <span>{priorityAppointment.scheduledDate}</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 font-mono">
                    <Clock className="w-3.5 h-3.5 text-[#77716B]" />
                    <span>{priorityAppointment.scheduledTime}</span>
                  </span>
                </div>

                {/* Status Badge (قريب / متأخر / مجدول) */}
                {priorityDiffMin !== null && priorityDiffMin < 0 ? (
                  <span className="px-3 py-1 rounded-full text-[11px] font-extrabold bg-[#F5E1DF] dark:bg-[#3F2321] text-[#A64B45] dark:text-[#F2A7A2]">
                    متأخر
                  </span>
                ) : priorityEvalState === 'due' ? (
                  <span className="px-3 py-1 rounded-full text-[11px] font-extrabold bg-[#EFE3C8] dark:bg-[#3D311E] text-[#8C6223] dark:text-[#E5C185]">
                    قريب
                  </span>
                ) : (
                  <span className="px-3 py-1 rounded-full text-[11px] font-extrabold bg-[#E6EDE8] dark:bg-[#213327] text-[#52765D] dark:text-[#9AC2A6]">
                    قادم
                  </span>
                )}
              </div>

              {/* Full-Width Burgundy Action Button */}
              <button
                type="button"
                onClick={() => {
                  setSelectedAppointmentId(priorityAppointment.id);
                  setActiveScreen('appointments');
                }}
                className="mt-4 w-full min-h-[46px] px-4 rounded-xl bg-[#743B46] hover:bg-[#5D2D37] active:scale-[0.99] text-white text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs"
              >
                <span>فتح الموعد</span>
                <ArrowLeft className="w-4 h-4" />
              </button>
            </>
          ) : (
            <div className="mt-2.5">
              <div className="text-base font-extrabold text-[#292725] dark:text-[#F4F1EA]">
                لا توجد مواعيد قادمة مجدولة حاليًا
              </div>
              <p className="text-xs text-[#77716B] dark:text-[#ACA59C] mt-1 leading-relaxed">
                يمكنك جدولة موعد جديد لمتابعة المكلفين والعقارات وتلقي التنبيهات المسبقة في الوقت المحدد.
              </p>
              <button
                type="button"
                onClick={() => setActiveScreen('appointments')}
                className="mt-4 w-full min-h-[46px] px-4 rounded-xl bg-[#743B46] hover:bg-[#5D2D37] text-white text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs"
              >
                <span>جدولة موعد</span>
                <ArrowLeft className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </section>

      {/* 2. Three-Column Appointment Status Summary Cards — Matching Reference Image */}
      <section aria-label="ملخص حالة المواعيد" className="grid grid-cols-3 gap-2.5 sm:gap-3.5">
        {/* Completed Today (المكتملة اليوم) */}
        <button
          type="button"
          onClick={() => setActiveScreen('appointments')}
          className="p-3 sm:p-4 rounded-2xl bg-[#ECF2EE] dark:bg-[#1E2822] border border-[#D7E4DB] dark:border-[#2E4235] flex flex-col items-center justify-center text-center gap-1.5 transition-all hover:opacity-95 cursor-pointer"
        >
          <div className="w-7 h-7 rounded-full bg-[#52765D]/15 text-[#52765D] dark:text-[#86B394] flex items-center justify-center">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <span className="text-[11px] sm:text-xs font-bold text-[#495E50] dark:text-[#B8D1C0] leading-tight">
            المكتملة اليوم
          </span>
          <span className="text-xl sm:text-2xl font-extrabold text-[#292725] dark:text-[#F4F1EA] font-mono tabular-nums leading-none mt-0.5">
            {completedTodayCount}
          </span>
        </button>

        {/* Upcoming Appointments (المواعيد القادمة) */}
        <button
          type="button"
          onClick={() => setActiveScreen('appointments')}
          className="p-3 sm:p-4 rounded-2xl bg-[#F6EFE2] dark:bg-[#2A241B] border border-[#E7DAC2] dark:border-[#463A28] flex flex-col items-center justify-center text-center gap-1.5 transition-all hover:opacity-95 cursor-pointer"
        >
          <div className="w-7 h-7 rounded-full bg-[#A77B35]/15 text-[#A77B35] dark:text-[#DEB46E] flex items-center justify-center">
            <CalendarClock className="w-4 h-4" />
          </div>
          <span className="text-[11px] sm:text-xs font-bold text-[#6E562C] dark:text-[#DFC496] leading-tight">
            المواعيد القادمة
          </span>
          <span className="text-xl sm:text-2xl font-extrabold text-[#292725] dark:text-[#F4F1EA] font-mono tabular-nums leading-none mt-0.5">
            {upcomingAppointmentsAll.length}
          </span>
        </button>

        {/* Overdue Appointments (المواعيد المتأخرة) */}
        <button
          type="button"
          onClick={() => setActiveScreen('appointments')}
          className="p-3 sm:p-4 rounded-2xl bg-[#F6E9E7] dark:bg-[#2C1F1E] border border-[#E8CFCB] dark:border-[#4A2E2B] flex flex-col items-center justify-center text-center gap-1.5 transition-all hover:opacity-95 cursor-pointer"
        >
          <div className="w-7 h-7 rounded-full bg-[#A64B45]/15 text-[#A64B45] dark:text-[#E59893] flex items-center justify-center">
            <Clock className="w-4 h-4" />
          </div>
          <span className="text-[11px] sm:text-xs font-bold text-[#7A3B37] dark:text-[#E5B0AC] leading-tight">
            المواعيد المتأخرة
          </span>
          <span className="text-xl sm:text-2xl font-extrabold text-[#292725] dark:text-[#F4F1EA] font-mono tabular-nums leading-none mt-0.5">
            {overdueAppointments.length}
          </span>
        </button>
      </section>

      {/* 3. Main Shortcuts 3x2 Grid (الاختصارات الرئيسية) — Matching Reference Image */}
      <section aria-label="الاختصارات الرئيسية" className="space-y-3 pt-1">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base sm:text-lg font-extrabold text-[#292725] dark:text-[#F4F1EA] font-display">
            الاختصارات الرئيسية
          </h2>
          <button
            type="button"
            onClick={() => setActiveScreen('voice')}
            className="min-h-[34px] px-3 rounded-xl bg-[#EFECE6] hover:bg-[#E5DFD5] dark:bg-[#2B2826] dark:hover:bg-[#383431] border border-[#E0D9CE] dark:border-[#3E3936] text-[#743B46] dark:text-[#E5B9C0] text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Mic className="w-3.5 h-3.5" />
            <span>أمر صوتي ذكي</span>
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2.5 sm:gap-3.5">
          {/* Tile 1: جدولة موعد */}
          <button
            type="button"
            onClick={() => setActiveScreen('appointments')}
            className="min-h-[96px] sm:min-h-[108px] p-3 sm:p-4 rounded-2xl bg-[#FFFEFC] dark:bg-[#22201F] border border-[#E7E1D8] dark:border-[#383431] hover:border-[#743B46] flex flex-col items-center justify-center text-center gap-2 shadow-[0_2px_10px_rgba(41,39,37,0.03)] transition-all cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-xl bg-[#F7F5F0] dark:bg-[#2B2826] text-[#3D3834] dark:text-[#E5DFD7] group-hover:bg-[#743B46] group-hover:text-white flex items-center justify-center transition-colors">
              <CalendarClock className="w-5 h-5" />
            </div>
            <span className="text-xs sm:text-sm font-bold text-[#292725] dark:text-[#F4F1EA] leading-snug">
              جدولة موعد
            </span>
          </button>

          {/* Tile 2: العقارات والوحدات */}
          <button
            type="button"
            onClick={() => {
              setSelectedTaxpayerId(null);
              setActiveScreen('taxpayers');
            }}
            className="min-h-[96px] sm:min-h-[108px] p-3 sm:p-4 rounded-2xl bg-[#FFFEFC] dark:bg-[#22201F] border border-[#E7E1D8] dark:border-[#383431] hover:border-[#743B46] flex flex-col items-center justify-center text-center gap-2 shadow-[0_2px_10px_rgba(41,39,37,0.03)] transition-all cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-xl bg-[#F7F5F0] dark:bg-[#2B2826] text-[#3D3834] dark:text-[#E5DFD7] group-hover:bg-[#743B46] group-hover:text-white flex items-center justify-center transition-colors">
              <Building2 className="w-5 h-5" />
            </div>
            <span className="text-xs sm:text-sm font-bold text-[#292725] dark:text-[#F4F1EA] leading-snug">
              العقارات والوحدات
            </span>
          </button>

          {/* Tile 3: المكلفون والمنشآت */}
          <button
            type="button"
            onClick={() => {
              setSelectedTaxpayerId(null);
              setActiveScreen('taxpayers');
            }}
            className="min-h-[96px] sm:min-h-[108px] p-3 sm:p-4 rounded-2xl bg-[#FFFEFC] dark:bg-[#22201F] border border-[#E7E1D8] dark:border-[#383431] hover:border-[#743B46] flex flex-col items-center justify-center text-center gap-2 shadow-[0_2px_10px_rgba(41,39,37,0.03)] transition-all cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-xl bg-[#F7F5F0] dark:bg-[#2B2826] text-[#3D3834] dark:text-[#E5DFD7] group-hover:bg-[#743B46] group-hover:text-white flex items-center justify-center transition-colors">
              <Users className="w-5 h-5" />
            </div>
            <span className="text-xs sm:text-sm font-bold text-[#292725] dark:text-[#F4F1EA] leading-snug">
              المكلفون والمنشآت
            </span>
          </button>

          {/* Tile 4: الإعدادات */}
          <button
            type="button"
            onClick={() => setActiveScreen('settings')}
            className="min-h-[96px] sm:min-h-[108px] p-3 sm:p-4 rounded-2xl bg-[#FFFEFC] dark:bg-[#22201F] border border-[#E7E1D8] dark:border-[#383431] hover:border-[#743B46] flex flex-col items-center justify-center text-center gap-2 shadow-[0_2px_10px_rgba(41,39,37,0.03)] transition-all cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-xl bg-[#F7F5F0] dark:bg-[#2B2826] text-[#3D3834] dark:text-[#E5DFD7] group-hover:bg-[#743B46] group-hover:text-white flex items-center justify-center transition-colors">
              <Settings className="w-5 h-5" />
            </div>
            <span className="text-xs sm:text-sm font-bold text-[#292725] dark:text-[#F4F1EA] leading-snug">
              الإعدادات
            </span>
          </button>

          {/* Tile 5: سجل العقارات العام */}
          <button
            type="button"
            onClick={() => setActiveScreen('properties')}
            className="min-h-[96px] sm:min-h-[108px] p-3 sm:p-4 rounded-2xl bg-[#FFFEFC] dark:bg-[#22201F] border border-[#E7E1D8] dark:border-[#383431] hover:border-[#743B46] flex flex-col items-center justify-center text-center gap-2 shadow-[0_2px_10px_rgba(41,39,37,0.03)] transition-all cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-xl bg-[#F7F5F0] dark:bg-[#2B2826] text-[#3D3834] dark:text-[#E5DFD7] group-hover:bg-[#743B46] group-hover:text-white flex items-center justify-center transition-colors">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <span className="text-xs sm:text-sm font-bold text-[#292725] dark:text-[#F4F1EA] leading-snug">
              سجل العقارات العام
            </span>
          </button>

          {/* Tile 6: توثيق زيارة */}
          <button
            type="button"
            onClick={() => setActiveScreen('visits')}
            className="min-h-[96px] sm:min-h-[108px] p-3 sm:p-4 rounded-2xl bg-[#FFFEFC] dark:bg-[#22201F] border border-[#E7E1D8] dark:border-[#383431] hover:border-[#743B46] flex flex-col items-center justify-center text-center gap-2 shadow-[0_2px_10px_rgba(41,39,37,0.03)] transition-all cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-xl bg-[#F7F5F0] dark:bg-[#2B2826] text-[#3D3834] dark:text-[#E5DFD7] group-hover:bg-[#743B46] group-hover:text-white flex items-center justify-center transition-colors">
              <MapPin className="w-5 h-5" />
            </div>
            <span className="text-xs sm:text-sm font-bold text-[#292725] dark:text-[#F4F1EA] leading-snug">
              توثيق زيارة
            </span>
          </button>
        </div>
      </section>

      {/* 4. Compact Records Overview Strip (Properties, Units, Taxpayers, Visits) */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
        <button
          type="button"
          onClick={() => setActiveScreen('properties')}
          className="text-right p-3.5 rounded-2xl bg-[#FFFEFC] dark:bg-[#22201F] border border-[#E7E1D8] dark:border-[#383431] hover:border-[#743B46] transition-all flex items-center justify-between gap-2 cursor-pointer"
        >
          <div>
            <div className="text-[11px] font-semibold text-[#77716B] dark:text-[#ACA59C]">العقارات المسجلة</div>
            <div className="text-lg font-extrabold text-[#292725] dark:text-[#F4F1EA] font-mono tabular-nums mt-0.5">
              {properties.length}
            </div>
          </div>
          <div className="w-8 h-8 rounded-xl bg-[#F0ECE5] dark:bg-[#2B2826] text-[#743B46] dark:text-[#E5B9C0] flex items-center justify-center shrink-0">
            <Building2 className="w-4 h-4" />
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveScreen('properties')}
          className="text-right p-3.5 rounded-2xl bg-[#FFFEFC] dark:bg-[#22201F] border border-[#E7E1D8] dark:border-[#383431] hover:border-[#743B46] transition-all flex items-center justify-between gap-2 cursor-pointer"
        >
          <div>
            <div className="text-[11px] font-semibold text-[#77716B] dark:text-[#ACA59C]">الوحدات العقارية</div>
            <div className="text-lg font-extrabold text-[#292725] dark:text-[#F4F1EA] font-mono tabular-nums mt-0.5">
              {propertyUnits.length}
            </div>
          </div>
          <div className="w-8 h-8 rounded-xl bg-[#F0ECE5] dark:bg-[#2B2826] text-[#743B46] dark:text-[#E5B9C0] flex items-center justify-center shrink-0">
            <Layers className="w-4 h-4" />
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveScreen('taxpayers')}
          className="text-right p-3.5 rounded-2xl bg-[#FFFEFC] dark:bg-[#22201F] border border-[#E7E1D8] dark:border-[#383431] hover:border-[#743B46] transition-all flex items-center justify-between gap-2 cursor-pointer"
        >
          <div>
            <div className="text-[11px] font-semibold text-[#77716B] dark:text-[#ACA59C]">ملفات المكلفين</div>
            <div className="text-lg font-extrabold text-[#292725] dark:text-[#F4F1EA] font-mono tabular-nums mt-0.5">
              {taxpayers.length}
            </div>
          </div>
          <div className="w-8 h-8 rounded-xl bg-[#F0ECE5] dark:bg-[#2B2826] text-[#743B46] dark:text-[#E5B9C0] flex items-center justify-center shrink-0">
            <Users className="w-4 h-4" />
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveScreen('visits')}
          className="text-right p-3.5 rounded-2xl bg-[#FFFEFC] dark:bg-[#22201F] border border-[#E7E1D8] dark:border-[#383431] hover:border-[#743B46] transition-all flex items-center justify-between gap-2 cursor-pointer"
        >
          <div>
            <div className="text-[11px] font-semibold text-[#77716B] dark:text-[#ACA59C]">الزيارات الميدانية</div>
            <div className="text-lg font-extrabold text-[#292725] dark:text-[#F4F1EA] font-mono tabular-nums mt-0.5">
              {fieldVisits.length}
            </div>
          </div>
          <div className="w-8 h-8 rounded-xl bg-[#F0ECE5] dark:bg-[#2B2826] text-[#743B46] dark:text-[#E5B9C0] flex items-center justify-center shrink-0">
            <MapPin className="w-4 h-4" />
          </div>
        </button>
      </section>

      {/* 5. Two-Column Section: Due Tasks Schedule & Financial Ledger Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 items-start">
        {/* Right Column (7 cols): Due Tasks & Upcoming Schedule */}
        <section className="lg:col-span-7 relative overflow-hidden bg-[#FFFEFC] dark:bg-[#22201F] border border-[#E7E1D8] dark:border-[#383431] rounded-3xl p-4 sm:p-5 shadow-2xs transition-all duration-300">
          <div className={`flex items-center justify-between gap-3 ${isTasksCardCollapsed ? '' : 'mb-4 pb-3 border-b border-[#EFECE6] dark:border-[#383431]'}`}>
            <div
              onClick={() => setIsTasksCardCollapsed((prev) => !prev)}
              className="flex items-center gap-3 cursor-pointer select-none group min-w-0 flex-1"
            >
              <div className="w-10 h-10 rounded-2xl bg-[#F0ECE5] dark:bg-[#2B2826] border border-[#E7E1D8] dark:border-[#383431] text-[#743B46] dark:text-[#E5B9C0] flex items-center justify-center shrink-0">
                <CalendarClock className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm sm:text-base font-extrabold text-[#292725] dark:text-[#F4F1EA] font-display">
                    المهام المستحقة والتنبيهات الميدانية
                  </h2>
                  <span className="px-2 py-0.5 rounded-lg text-[11px] font-bold bg-[#F6EFE2] dark:bg-[#2A241B] text-[#8C6223] dark:text-[#DEB46E]">
                    {upcomingAppointmentsAll.length} قادم
                  </span>
                  {overdueAppointments.length > 0 && (
                    <span className="px-2 py-0.5 rounded-lg text-[11px] font-bold bg-[#F6E9E7] dark:bg-[#2C1F1E] text-[#A64B45] dark:text-[#E59893]">
                      {overdueAppointments.length} متأخر
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#77716B] dark:text-[#ACA59C] mt-0.5 truncate">
                  {isTasksCardCollapsed
                    ? `اضغط لتوسيع جدول اليوم (${todayStr}) والمواعيد الميدانية`
                    : <>جدول اليوم (<span className="font-mono font-semibold">{todayStr}</span>) والمواعيد القادمة</>}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setActiveScreen('appointments')}
                className="min-h-[36px] px-3 rounded-xl text-xs font-bold text-[#743B46] dark:text-[#E5B9C0] bg-[#F0ECE5] hover:bg-[#E5DFD5] dark:bg-[#2B2826] flex items-center gap-1 cursor-pointer transition-colors"
              >
                <span className="hidden sm:inline">كل المواعيد</span>
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setIsTasksCardCollapsed((prev) => !prev)}
                aria-expanded={!isTasksCardCollapsed}
                title={isTasksCardCollapsed ? 'توسيع البطاقة' : 'طي البطاقة'}
                className="w-9 h-9 rounded-xl bg-[#F0ECE5] hover:bg-[#E5DFD5] dark:bg-[#2B2826] text-[#5C554E] dark:text-[#ACA59C] flex items-center justify-center cursor-pointer transition-colors"
              >
                {isTasksCardCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {!isTasksCardCollapsed && (
            <div className="space-y-3 animate-in fade-in duration-200">
              {overdueAppointments.length > 0 && (
                <div className="p-3.5 rounded-2xl bg-[#F6E9E7] dark:bg-[#2C1F1E] border border-[#E8CFCB] dark:border-[#4A2E2B] flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 text-xs text-[#7A3B37] dark:text-[#E5B0AC]">
                    <div className="w-8 h-8 rounded-xl bg-[#A64B45]/15 flex items-center justify-center shrink-0">
                      <AlertTriangle className="w-4 h-4 text-[#A64B45]" />
                    </div>
                    <span>
                      يوجد <strong>{overdueAppointments.length}</strong> موعد متأخر تجاوز وقت استحقاقه ويتطلب إنجازًا أو إعادة جدولة.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveScreen('appointments')}
                    className="min-h-[34px] px-3.5 rounded-xl bg-[#A64B45] hover:bg-[#8E3B36] text-white text-xs font-bold shrink-0 cursor-pointer transition-colors"
                  >
                    معالجة الآن
                  </button>
                </div>
              )}

              {upcomingAppointments.length === 0 ? (
                <div className="py-7 px-4 text-center border border-dashed border-[#E7E1D8] dark:border-[#383431] rounded-2xl bg-[#F7F5F0]/60 dark:bg-[#1B1918]">
                  <CalendarClock className="w-8 h-8 text-[#77716B] mx-auto mb-2" />
                  <p className="text-sm font-bold text-[#292725] dark:text-[#F4F1EA]">
                    لا توجد مواعيد قادمة مجدولة حاليًا
                  </p>
                  <p className="text-xs text-[#77716B] dark:text-[#ACA59C] mt-1 mb-3.5">
                    أضف موعدًا ميدانيًا وربطه بمكلف أو عقار لتلقي التذكيرات.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveScreen('appointments')}
                    className="min-h-[40px] px-4 rounded-xl bg-[#743B46] hover:bg-[#5D2D37] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span>جدولة موعد جديد</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {upcomingAppointments.map((appt) => {
                    const isToday = appt.scheduledDate === todayStr;
                    return (
                      <div
                        key={appt.id}
                        className="p-3 rounded-2xl bg-[#F7F5F0] hover:bg-[#F0ECE5] dark:bg-[#2B2826]/70 dark:hover:bg-[#2B2826] border border-[#E7E1D8] dark:border-[#383431] flex items-center justify-between gap-3 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`px-3 py-2 rounded-xl text-center shrink-0 font-mono text-xs font-bold ${
                              isToday
                                ? 'bg-[#743B46] text-white'
                                : 'bg-[#FFFEFC] dark:bg-[#22201F] text-[#292725] dark:text-[#F4F1EA] border border-[#E7E1D8] dark:border-[#383431]'
                            }`}
                          >
                            <div>{appt.scheduledTime}</div>
                            <div className="text-[10px] font-normal opacity-85 mt-0.5">{appt.scheduledDate.slice(5)}</div>
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="text-sm font-bold text-[#292725] dark:text-[#F4F1EA] truncate">
                                {appt.title}
                              </div>
                              {isToday && (
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#F6EFE2] dark:bg-[#3D311E] text-[#8C6223] dark:text-[#E5C185] shrink-0">
                                  اليوم
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-[#77716B] dark:text-[#ACA59C] mt-0.5 flex flex-wrap items-center gap-1.5">
                              <span className="font-semibold text-[#5C554E] dark:text-[#D5CFC7]">{appt.propertyTitle}</span>
                              <span aria-hidden="true">·</span>
                              <span>{appt.taxpayerName}</span>
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
                          className="min-h-[36px] px-3.5 rounded-xl bg-[#FFFEFC] hover:bg-[#EFECE6] dark:bg-[#22201F] border border-[#E7E1D8] dark:border-[#383431] text-xs font-bold text-[#743B46] dark:text-[#E5B9C0] shrink-0 cursor-pointer transition-colors"
                        >
                          فتح السجل
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Left Column (5 cols): Financial Ledger Summary */}
        <section className="lg:col-span-5 relative overflow-hidden bg-[#FFFEFC] dark:bg-[#22201F] border border-[#E7E1D8] dark:border-[#383431] rounded-3xl p-4 sm:p-5 flex flex-col justify-between shadow-2xs transition-all duration-300">
          <div>
            <div
              onClick={() => setIsFinanceCardCollapsed((prev) => !prev)}
              className={`flex items-center justify-between gap-3 cursor-pointer select-none group ${
                isFinanceCardCollapsed ? '' : 'mb-4 pb-3 border-b border-[#EFECE6] dark:border-[#383431]'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-[#F0ECE5] dark:bg-[#2B2826] border border-[#E7E1D8] dark:border-[#383431] text-[#743B46] dark:text-[#E5B9C0] flex items-center justify-center shrink-0">
                  <Wallet className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm sm:text-base font-extrabold text-[#292725] dark:text-[#F4F1EA] font-display">
                      الملخص المالي المعتمد
                    </h2>
                    <span className="px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold bg-[#F0ECE5] dark:bg-[#2B2826] text-[#5C554E] dark:text-[#D5CFC7]">
                      {workspace?.defaultCurrency || 'SAR'}
                    </span>
                  </div>
                  <p className="text-xs text-[#77716B] dark:text-[#ACA59C] mt-0.5 truncate">
                    {isFinanceCardCollapsed ? (
                      <span className="font-mono font-semibold text-[#52765D] dark:text-[#86B394]">
                        المحصّل: {approvedPaymentsTotal.toLocaleString('en-US')} / {approvedAssessmentsTotal.toLocaleString('en-US')} {workspace?.defaultCurrency || 'SAR'}
                      </span>
                    ) : (
                      <>العملة الأساسية: <span className="font-mono font-semibold">{workspace?.defaultCurrency || 'SAR'}</span> · دفتر الأستاذ المالي</>
                    )}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsFinanceCardCollapsed((prev) => !prev);
                }}
                aria-expanded={!isFinanceCardCollapsed}
                title={isFinanceCardCollapsed ? 'توسيع البطاقة' : 'طي البطاقة'}
                className="w-9 h-9 rounded-xl bg-[#F0ECE5] hover:bg-[#E5DFD5] dark:bg-[#2B2826] text-[#5C554E] dark:text-[#ACA59C] flex items-center justify-center shrink-0 cursor-pointer transition-colors"
              >
                {isFinanceCardCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
              </button>
            </div>

            {!isFinanceCardCollapsed && (
              <div className="space-y-3 animate-in fade-in duration-200">
                <div className="p-4 rounded-2xl bg-[#F7F5F0] dark:bg-[#2B2826]/70 border border-[#E7E1D8] dark:border-[#383431]">
                  <div className="flex items-center justify-between text-xs text-[#77716B] dark:text-[#ACA59C]">
                    <span className="font-bold">إجمالي التقييمات المعتمدة</span>
                    <FileSpreadsheet className="w-4 h-4 text-[#743B46] dark:text-[#E5B9C0]" />
                  </div>
                  <div className="text-xl font-extrabold text-[#292725] dark:text-[#F4F1EA] tabular-nums mt-1.5 font-mono">
                    {approvedAssessmentsTotal.toLocaleString('en-US')} {workspace?.defaultCurrency || 'SAR'}
                  </div>
                  <div className="text-[11px] text-[#77716B] dark:text-[#ACA59C] mt-1.5 flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md bg-[#FFFEFC] dark:bg-[#22201F] border border-[#E7E1D8] dark:border-[#383431] font-medium">
                      {assessments.filter((a) => a.status === 'approved').length} معتمد ومقفل
                    </span>
                    <span>·</span>
                    <span>{assessments.filter((a) => a.status === 'draft').length} مسودة</span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-[#ECF2EE] dark:bg-[#1E2822] border border-[#D7E4DB] dark:border-[#2E4235]">
                  <div className="flex items-center justify-between text-xs text-[#495E50] dark:text-[#B8D1C0]">
                    <span className="font-bold">إجمالي المدفوعات المحصلة</span>
                    <CheckCircle2 className="w-4 h-4 text-[#52765D] dark:text-[#86B394]" />
                  </div>
                  <div className="text-xl font-extrabold text-[#52765D] dark:text-[#86B394] tabular-nums mt-1.5 font-mono">
                    {approvedPaymentsTotal.toLocaleString('en-US')} {workspace?.defaultCurrency || 'SAR'}
                  </div>
                  <div className="mt-2.5">
                    <div className="flex items-center justify-between text-[11px] text-[#495E50] dark:text-[#B8D1C0] mb-1">
                      <span className="flex items-center gap-1">
                        <TrendingUp className="w-3 h-3" />
                        نسبة التحصيل الفعلي
                      </span>
                      <span className="font-mono font-bold">
                        {approvedAssessmentsTotal > 0
                          ? `${Math.min(100, Math.round((approvedPaymentsTotal / approvedAssessmentsTotal) * 100))}%`
                          : '0%'}
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-[#52765D]/20 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#52765D] transition-all duration-500"
                        style={{
                          width: `${
                            approvedAssessmentsTotal > 0
                              ? Math.min(100, Math.round((approvedPaymentsTotal / approvedAssessmentsTotal) * 100))
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {!isFinanceCardCollapsed && (
            <div className="grid grid-cols-2 gap-2.5 mt-4 pt-3.5 border-t border-[#EFECE6] dark:border-[#383431]">
              <button
                type="button"
                onClick={() => setActiveScreen('assessments')}
                className="min-h-[42px] rounded-xl bg-[#F0ECE5] hover:bg-[#E5DFD5] dark:bg-[#2B2826] text-xs font-bold text-[#292725] dark:text-[#F4F1EA] cursor-pointer transition-colors"
              >
                التقييمات المالية
              </button>
              <button
                type="button"
                onClick={() => setActiveScreen('transactions')}
                className="min-h-[42px] rounded-xl bg-[#743B46] hover:bg-[#5D2D37] text-xs font-bold text-white cursor-pointer transition-colors"
              >
                المعاملات والدفعات
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

