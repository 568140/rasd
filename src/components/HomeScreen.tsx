import React, { useState } from 'react';
import {
  Building2,
  Users,
  MapPin,
  CalendarClock,
  Mic,
  Plus,
  Bell,
  FileSpreadsheet,
  ArrowLeft,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Wifi,
  WifiOff,
  RefreshCw,
  Shield,
  Compass,
  Layers,
  Wallet,
  ChevronDown,
  ChevronUp,
  TrendingUp,
} from 'lucide-react';
import { useRasd } from '../context/RasdContext';

export const HomeScreen: React.FC = () => {
  const [isTasksCardCollapsed, setIsTasksCardCollapsed] = useState(false);
  const [isFinanceCardCollapsed, setIsFinanceCardCollapsed] = useState(false);
  const {
    userProfile,
    workspace,
    isOnline,
    pendingSyncCount,
    isOwner,
    currentUserRole,
    taxpayers,
    properties,
    propertyUnits,
    fieldVisits,
    appointments,
    assessments,
    transactions,
    notifications,
    auditLogs,
    setActiveScreen,
    setSelectedTaxpayerId,
    setSelectedPropertyId,
    markNotificationRead,
  } = useRasd();

  const todayStr = new Date().toISOString().slice(0, 10);

  const todayAppointments = appointments.filter(
    (a) => a.scheduledDate === todayStr && (a.status === 'upcoming' || a.status === 'postponed')
  );
  const overdueAppointments = appointments.filter(
    (a) => a.scheduledDate < todayStr && (a.status === 'upcoming' || a.status === 'postponed')
  );
  const upcomingAppointments = appointments
    .filter((a) => a.scheduledDate >= todayStr && (a.status === 'upcoming' || a.status === 'postponed'))
    .sort((a, b) => `${a.scheduledDate} ${a.scheduledTime}`.localeCompare(`${b.scheduledDate} ${b.scheduledTime}`))
    .slice(0, 4);

  // Featured Priority Task (Overdue first, then Today, then Next Upcoming)
  const priorityAppointment =
    overdueAppointments[0] || todayAppointments[0] || upcomingAppointments[0] || null;

  const approvedAssessmentsTotal = assessments
    .filter((a) => a.status === 'approved')
    .reduce((sum, a) => sum + (Number(a.amount) || 0), 0);

  const approvedPaymentsTotal = transactions
    .filter((t) => t.status === 'approved' && t.transactionType === 'payment')
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

  const unreadNotifications = notifications.filter((n) => !n.isRead);
  const recentAudit = [...auditLogs].slice(0, 5);

  const roleLabelMap: Record<string, string> = {
    owner: 'مالك مساحة العمل',
    field_assistant: 'مساعد ميداني',
    finance_assistant: 'مساعد مالي',
    viewer: 'مشاهد فقط',
  };

  return (
    <div className="space-y-5 pb-6">
      {/* 1. Welcome & Priority Mission Hero Card (Deep Navy + Technical Blue + Turquoise) */}
      <section className="rounded-3xl bg-gradient-to-l from-[#0B192C] via-[#102A46] to-[#0B4F6C] text-white p-5 sm:p-6 shadow-md">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-sky-200/90">
              <span>{workspace?.name || 'مساحة العمل الميدانية'}</span>
              <span aria-hidden="true">·</span>
              <span>{roleLabelMap[currentUserRole] || currentUserRole}</span>
              {workspace?.regionName && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{workspace.regionName}</span>
                </>
              )}
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight font-display">
              مرحبًا بك، {userProfile?.displayName || 'المسؤول الميداني'}
            </h1>
            <p className="text-xs text-slate-300 max-w-xl leading-relaxed">
              ملخص ميداني لحظي مرتبط بقاعدة بيانات الفروع والعقارات والمواعيد في مساحة عملك.
            </p>
          </div>

          {/* Live Connection & Sync Status */}
          <div
            className={`px-3.5 py-2 rounded-2xl text-xs font-semibold flex items-center gap-2 border ${
              !isOnline
                ? 'bg-amber-500/20 text-amber-200 border-amber-400/30'
                : pendingSyncCount > 0
                ? 'bg-sky-500/20 text-sky-100 border-sky-400/30'
                : 'bg-teal-500/20 text-teal-100 border-teal-400/30'
            }`}
          >
            {!isOnline ? (
              <>
                <WifiOff className="w-4 h-4 shrink-0" />
                <span>دون اتصال ({pendingSyncCount} محلي)</span>
              </>
            ) : pendingSyncCount > 0 ? (
              <>
                <RefreshCw className="w-4 h-4 shrink-0 animate-spin" />
                <span>جاري مزامنة {pendingSyncCount} سجل...</span>
              </>
            ) : (
              <>
                <Wifi className="w-4 h-4 shrink-0" />
                <span>متصل ومزامن بالكامل</span>
              </>
            )}
          </div>
        </div>

        {/* Featured Next Appointment / Priority Task Callout */}
        <div className="mt-5 pt-4 border-t border-white/15 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {priorityAppointment ? (
            <>
              <div className="flex items-start gap-3">
                <div
                  className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                    priorityAppointment.scheduledDate < todayStr
                      ? 'bg-rose-500/25 text-rose-200'
                      : 'bg-[#0D9488]/35 text-teal-200'
                  }`}
                >
                  <CalendarClock className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-[11px] text-sky-200 font-medium">
                    {priorityAppointment.scheduledDate < todayStr
                      ? 'أولوية قصوى — موعد متأخر يتطلب متابعة'
                      : priorityAppointment.scheduledDate === todayStr
                      ? 'مهمة اليوم القادمة'
                      : 'أقرب موعد ميداني قادم'}
                  </div>
                  <div className="text-sm font-bold text-white mt-0.5">
                    {priorityAppointment.title} — {priorityAppointment.propertyTitle}
                  </div>
                  <div className="text-xs text-slate-300 mt-0.5 flex flex-wrap items-center gap-1.5">
                    <span>المكلف: {priorityAppointment.taxpayerName}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono">
                      {priorityAppointment.scheduledDate} ({priorityAppointment.scheduledTime})
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveScreen('appointments')}
                className="min-h-[42px] px-4 rounded-2xl bg-white text-[#0B192C] hover:bg-sky-50 text-xs font-bold flex items-center justify-center gap-1.5 shrink-0 transition-colors cursor-pointer"
              >
                <span>فتح الموعد</span>
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/10 text-teal-200 flex items-center justify-center shrink-0">
                  <CalendarClock className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white">لا توجد مواعيد ميدانية مستحقة اليوم</div>
                  <div className="text-[11px] text-slate-300 mt-0.5">
                    يمكنك جدولة معاينة جديدة أو استخدام المساعد الصوتي لتسجيل مهامك الميدانية بسرعة.
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveScreen('appointments')}
                className="min-h-[42px] px-4 rounded-2xl bg-[#0D9488] hover:bg-teal-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 shrink-0 transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>جدولة موعد</span>
              </button>
            </>
          )}
        </div>
      </section>

      {/* 2. Quick Action Shortcuts (5 Tactile Material 3 Action Tiles) */}
      <section aria-label="اختصارات الإجراءات السريعة">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          <button
            type="button"
            onClick={() => {
              setSelectedTaxpayerId(null);
              setActiveScreen('taxpayers');
            }}
            className="min-h-[54px] px-3.5 py-3 rounded-2xl bg-[#0B192C] hover:bg-[#132A46] dark:bg-[#0D9488] dark:hover:bg-teal-600 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
          >
            <Users className="w-4 h-4 shrink-0" />
            <span className="whitespace-nowrap">المكلفون والعقارات</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveScreen('properties')}
            className="min-h-[54px] px-3.5 py-3 rounded-2xl bg-white hover:bg-slate-50 dark:bg-[#0F1E33] dark:hover:bg-slate-800 border border-slate-200/90 dark:border-slate-800 text-[#0B192C] dark:text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Building2 className="w-4 h-4 text-[#0284C7] shrink-0" />
            <span className="whitespace-nowrap">سجل العقارات العام</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveScreen('visits')}
            className="min-h-[54px] px-3.5 py-3 rounded-2xl bg-white hover:bg-slate-50 dark:bg-[#0F1E33] dark:hover:bg-slate-800 border border-slate-200/90 dark:border-slate-800 text-[#0B192C] dark:text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <MapPin className="w-4 h-4 text-[#0D9488] shrink-0" />
            <span className="whitespace-nowrap">توثيق زيارة</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveScreen('appointments')}
            className="min-h-[54px] px-3.5 py-3 rounded-2xl bg-white hover:bg-slate-50 dark:bg-[#0F1E33] dark:hover:bg-slate-800 border border-slate-200/90 dark:border-slate-800 text-[#0B192C] dark:text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <CalendarClock className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="whitespace-nowrap">جدولة موعد</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveScreen('voice')}
            className="col-span-2 sm:col-span-1 min-h-[54px] px-3.5 py-3 rounded-2xl bg-gradient-to-l from-[#0284C7] to-[#0D9488] hover:opacity-95 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition-opacity cursor-pointer"
          >
            <Mic className="w-4 h-4 shrink-0" />
            <span className="whitespace-nowrap">أمر صوتي ذكي</span>
          </button>
        </div>
      </section>

      {/* 3. Differentiated Statistical Cards (4 Distinct Visual Layouts) */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Card A: Properties & Units (Turquoise Accent) */}
        <button
          type="button"
          onClick={() => setActiveScreen('properties')}
          className="text-right p-4 sm:p-5 rounded-3xl bg-white dark:bg-[#0D1829] border border-slate-200/90 dark:border-slate-800 hover:border-[#0D9488] transition-all flex flex-col justify-between cursor-pointer shadow-2xs"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">العقارات والوحدات</span>
            <div className="w-9 h-9 rounded-2xl bg-teal-50 dark:bg-teal-950/70 text-[#0D9488] dark:text-teal-400 flex items-center justify-center">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div className="my-2.5 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-bold text-[#0B192C] dark:text-white tabular-nums">
              {properties.length}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">عقار مسجل</span>
          </div>
          <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1">
              <Layers className="w-3 h-3 text-[#0D9488]" />
              <span>{propertyUnits.length} وحدة</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <Compass className="w-3 h-3 text-[#0284C7]" />
              <span>{properties.filter((p) => p.hasCoordinates).length} بـ GPS</span>
            </span>
          </div>
        </button>

        {/* Card B: Taxpayers (Technical Blue Accent) */}
        <button
          type="button"
          onClick={() => setActiveScreen('taxpayers')}
          className="text-right p-4 sm:p-5 rounded-3xl bg-white dark:bg-[#0D1829] border border-slate-200/90 dark:border-slate-800 hover:border-[#0284C7] transition-all flex flex-col justify-between cursor-pointer shadow-2xs"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">المكلفون والمُلّاك</span>
            <div className="w-9 h-9 rounded-2xl bg-sky-50 dark:bg-sky-950/70 text-[#0284C7] dark:text-sky-400 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="my-2.5 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-bold text-[#0B192C] dark:text-white tabular-nums">
              {taxpayers.length}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">ملف مكلف</span>
          </div>
          <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span>{taxpayers.filter((t) => t.status === 'active').length} نشط</span>
            <span>{taxpayers.filter((t) => t.status === 'under_review').length} قيد المراجعة</span>
          </div>
        </button>

        {/* Card C: Field Visits (Deep Navy Accent) */}
        <button
          type="button"
          onClick={() => setActiveScreen('visits')}
          className="text-right p-4 sm:p-5 rounded-3xl bg-white dark:bg-[#0D1829] border border-slate-200/90 dark:border-slate-800 hover:border-[#0B192C] dark:hover:border-sky-500 transition-all flex flex-col justify-between cursor-pointer shadow-2xs"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">الزيارات الميدانية</span>
            <div className="w-9 h-9 rounded-2xl bg-slate-100 dark:bg-slate-800 text-[#0B192C] dark:text-sky-300 flex items-center justify-center">
              <MapPin className="w-4 h-4" />
            </div>
          </div>
          <div className="my-2.5 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-bold text-[#0B192C] dark:text-white tabular-nums">
              {fieldVisits.length}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">معاينة</span>
          </div>
          <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span>{fieldVisits.filter((v) => v.visitDate === todayStr).length} منفذة اليوم</span>
            <span>{fieldVisits.filter((v) => v.status === 'requires_followup').length} للمتابعة</span>
          </div>
        </button>

        {/* Card D: Appointments & Schedule (Amber / Alert Aware) */}
        <button
          type="button"
          onClick={() => setActiveScreen('appointments')}
          className="text-right p-4 sm:p-5 rounded-3xl bg-white dark:bg-[#0D1829] border border-slate-200/90 dark:border-slate-800 hover:border-amber-500 transition-all flex flex-col justify-between cursor-pointer shadow-2xs"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">المواعيد المجدولة</span>
            <div className="w-9 h-9 rounded-2xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <CalendarClock className="w-4 h-4" />
            </div>
          </div>
          <div className="my-2.5 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-bold text-[#0B192C] dark:text-white tabular-nums">
              {appointments.length}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">موعد</span>
          </div>
          <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px]">
            <span className="text-[#0D9488] dark:text-teal-400 font-semibold">
              {todayAppointments.length} اليوم
            </span>
            <span
              className={
                overdueAppointments.length > 0
                  ? 'text-rose-600 dark:text-rose-400 font-bold'
                  : 'text-slate-500 dark:text-slate-400'
              }
            >
              {overdueAppointments.length} متأخر
            </span>
          </div>
        </button>
      </section>

      {/* 4. Two-Column Section: Due Tasks / Alerts & Financial Ledger Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Right Column (7 cols): Due Tasks & Upcoming Schedule */}
        <section className="lg:col-span-7 relative overflow-hidden bg-gradient-to-b from-white via-white to-slate-50/70 dark:from-[#0D1829] dark:via-[#0D1829] dark:to-[#0A1322] border border-slate-200/90 dark:border-slate-800/90 rounded-3xl p-5 shadow-sm hover:shadow-md transition-all duration-300">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-[#0284C7] via-[#0D9488] to-sky-400" />
          <div className={`flex items-center justify-between gap-3 ${isTasksCardCollapsed ? '' : 'mb-4 pb-3.5 border-b border-slate-100 dark:border-slate-800/80'}`}>
            <div
              onClick={() => setIsTasksCardCollapsed((prev) => !prev)}
              className="flex items-center gap-3 cursor-pointer select-none group min-w-0 flex-1"
            >
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-sky-500/15 to-teal-500/15 dark:from-sky-500/20 dark:to-teal-500/20 border border-sky-200/60 dark:border-sky-800/60 text-[#0284C7] dark:text-sky-400 flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 transition-transform">
                <CalendarClock className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-bold text-[#0B192C] dark:text-white font-display group-hover:text-[#0284C7] dark:group-hover:text-sky-400 transition-colors">
                    المهام المستحقة والتنبيهات الميدانية
                  </h2>
                  <span className="px-2 py-0.5 rounded-lg text-[11px] font-bold bg-sky-50 dark:bg-sky-950/80 text-[#0284C7] dark:text-sky-300 border border-sky-200/60 dark:border-sky-800/70">
                    {upcomingAppointments.length} قادم
                  </span>
                  {overdueAppointments.length > 0 && (
                    <span className="px-2 py-0.5 rounded-lg text-[11px] font-bold bg-rose-50 dark:bg-rose-950/80 text-rose-600 dark:text-rose-300 border border-rose-200/60 dark:border-rose-800/70">
                      {overdueAppointments.length} متأخر
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                  {isTasksCardCollapsed
                    ? `اضغط لتوسيع جدول اليوم (${todayStr}) والمواعيد الميدانية`
                    : <>جدول اليوم (<span className="font-mono font-semibold text-slate-700 dark:text-slate-300">{todayStr}</span>) والمواعيد القادمة</>}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setActiveScreen('appointments')}
                className="min-h-[36px] px-3 rounded-xl text-xs font-semibold text-[#0284C7] dark:text-sky-400 bg-sky-50/70 hover:bg-sky-100/80 dark:bg-sky-950/40 dark:hover:bg-sky-950/80 border border-sky-200/50 dark:border-sky-800/50 flex items-center gap-1 cursor-pointer transition-colors"
              >
                <span className="hidden sm:inline">كل المواعيد</span>
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setIsTasksCardCollapsed((prev) => !prev)}
                aria-expanded={!isTasksCardCollapsed}
                title={isTasksCardCollapsed ? 'توسيع البطاقة' : 'طي البطاقة'}
                className="w-9 h-9 rounded-xl bg-slate-100/90 hover:bg-slate-200/80 dark:bg-slate-800/90 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center cursor-pointer transition-colors"
              >
                {isTasksCardCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {!isTasksCardCollapsed && (
            <div className="space-y-3 animate-in fade-in duration-200">
              {overdueAppointments.length > 0 && (
                <div className="p-3.5 rounded-2xl bg-gradient-to-l from-rose-50 via-rose-50/90 to-orange-50/50 dark:from-rose-950/50 dark:via-rose-950/40 dark:to-slate-900 border border-rose-200/90 dark:border-rose-800/80 flex items-center justify-between gap-3 shadow-2xs">
                  <div className="flex items-center gap-2.5 text-xs text-rose-800 dark:text-rose-300">
                    <div className="w-8 h-8 rounded-xl bg-rose-100 dark:bg-rose-900/60 flex items-center justify-center shrink-0">
                      <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                    </div>
                    <span>
                      يوجد <strong>{overdueAppointments.length}</strong> موعد متأخر تجاوز وقت استحقاقه ويتطلب إنجازًا أو إعادة جدولة.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveScreen('appointments')}
                    className="min-h-[34px] px-3.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shrink-0 cursor-pointer shadow-2xs transition-colors"
                  >
                    معالجة الآن
                  </button>
                </div>
              )}

              {upcomingAppointments.length === 0 ? (
                <div className="py-8 px-4 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-900/30">
                  <CalendarClock className="w-9 h-9 text-slate-400 mx-auto mb-2" />
                  <p className="text-sm font-bold text-[#0B192C] dark:text-slate-200">
                    لا توجد مواعيد قادمة مجدولة حاليًا
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-4">
                    أضف موعدًا ميدانيًا وربطه بمكلف أو عقار لتلقي التذكيرات.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveScreen('appointments')}
                    className="min-h-[42px] px-4 rounded-xl bg-[#0B192C] hover:bg-[#132A46] dark:bg-[#0D9488] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
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
                        className="p-3 rounded-2xl bg-slate-50/80 hover:bg-sky-50/40 dark:bg-slate-900/60 dark:hover:bg-slate-800/70 border border-slate-200/70 dark:border-slate-800/90 flex items-center justify-between gap-3 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`px-3 py-2 rounded-xl text-center shrink-0 font-mono text-xs font-bold shadow-2xs ${
                              isToday
                                ? 'bg-gradient-to-br from-teal-500/15 to-emerald-500/10 dark:from-teal-950 dark:to-teal-900/60 text-[#0D9488] dark:text-teal-300 border border-teal-300/70 dark:border-teal-700'
                                : 'bg-white dark:bg-slate-800 text-[#0B192C] dark:text-slate-200 border border-slate-200/80 dark:border-slate-700'
                            }`}
                          >
                            <div>{appt.scheduledTime}</div>
                            <div className="text-[10px] font-normal opacity-80 mt-0.5">{appt.scheduledDate.slice(5)}</div>
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="text-sm font-bold text-[#0B192C] dark:text-white truncate">
                                {appt.title}
                              </div>
                              {isToday && (
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-teal-100/80 dark:bg-teal-950 text-[#0D9488] dark:text-teal-300 shrink-0">
                                  اليوم
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex flex-wrap items-center gap-1.5">
                              <span className="font-medium text-slate-700 dark:text-slate-300">{appt.propertyTitle}</span>
                              <span aria-hidden="true">·</span>
                              <span>{appt.taxpayerName}</span>
                              {appt.isPendingSync && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="px-1.5 py-0.5 rounded bg-amber-100/80 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 text-[10px] font-semibold">
                                    محلي
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedTaxpayerId(appt.taxpayerId);
                            setSelectedPropertyId(appt.propertyId);
                            setActiveScreen('taxpayers');
                          }}
                          className="min-h-[36px] px-3.5 rounded-xl bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-700 text-xs font-semibold text-[#0B192C] dark:text-slate-200 shrink-0 cursor-pointer shadow-2xs transition-colors"
                        >
                          ملف المكلف
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
        <section className="lg:col-span-5 relative overflow-hidden bg-gradient-to-b from-white via-white to-slate-50/70 dark:from-[#0D1829] dark:via-[#0D1829] dark:to-[#0A1322] border border-slate-200/90 dark:border-slate-800/90 rounded-3xl p-5 flex flex-col justify-between shadow-sm hover:shadow-md transition-all duration-300">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-[#0D9488] via-[#0284C7] to-indigo-500" />
          <div>
            <div
              onClick={() => setIsFinanceCardCollapsed((prev) => !prev)}
              className={`flex items-center justify-between gap-3 cursor-pointer select-none group ${
                isFinanceCardCollapsed ? '' : 'mb-4 pb-3.5 border-b border-slate-100 dark:border-slate-800/80'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-teal-500/15 to-sky-500/15 dark:from-teal-500/20 dark:to-sky-500/20 border border-teal-200/60 dark:border-teal-800/60 text-[#0D9488] dark:text-teal-400 flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 transition-transform">
                  <Wallet className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-[#0B192C] dark:text-white font-display group-hover:text-[#0D9488] dark:group-hover:text-teal-400 transition-colors">
                      الملخص المالي المعتمد
                    </h2>
                    <span className="px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      {workspace?.defaultCurrency || 'SAR'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                    {isFinanceCardCollapsed ? (
                      <span className="font-mono font-semibold text-[#0D9488] dark:text-teal-400">
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
                className="w-9 h-9 rounded-xl bg-slate-100/90 hover:bg-slate-200/80 dark:bg-slate-800/90 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0 cursor-pointer transition-colors"
              >
                {isFinanceCardCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
              </button>
            </div>

            {!isFinanceCardCollapsed && (
              <div className="space-y-3 animate-in fade-in duration-200">
                <div className="p-4 rounded-2xl bg-gradient-to-l from-[#F4F7FA] to-slate-50/90 dark:from-slate-900/95 dark:to-slate-900/60 border border-slate-200/80 dark:border-slate-800 shadow-2xs">
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-semibold">إجمالي التقييمات المعتمدة</span>
                    <div className="w-7 h-7 rounded-lg bg-sky-100/80 dark:bg-sky-950/80 flex items-center justify-center">
                      <FileSpreadsheet className="w-3.5 h-3.5 text-[#0284C7] dark:text-sky-400" />
                    </div>
                  </div>
                  <div className="text-xl font-bold text-[#0B192C] dark:text-white tabular-nums mt-1.5 font-mono">
                    {approvedAssessmentsTotal.toLocaleString('en-US')} {workspace?.defaultCurrency || 'SAR'}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700 font-medium">
                      {assessments.filter((a) => a.status === 'approved').length} معتمد ومقفل
                    </span>
                    <span>·</span>
                    <span>{assessments.filter((a) => a.status === 'draft').length} مسودة</span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-gradient-to-l from-teal-50/80 via-teal-50/40 to-emerald-50/30 dark:from-teal-950/40 dark:via-teal-950/25 dark:to-slate-900/80 border border-teal-200/80 dark:border-teal-900/70 shadow-2xs">
                  <div className="flex items-center justify-between text-xs text-teal-800 dark:text-teal-300">
                    <span className="font-semibold">إجمالي المدفوعات المحصلة</span>
                    <div className="w-7 h-7 rounded-lg bg-teal-100/80 dark:bg-teal-900/60 flex items-center justify-center">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#0D9488] dark:text-teal-400" />
                    </div>
                  </div>
                  <div className="text-xl font-bold text-[#0D9488] dark:text-teal-400 tabular-nums mt-1.5 font-mono">
                    {approvedPaymentsTotal.toLocaleString('en-US')} {workspace?.defaultCurrency || 'SAR'}
                  </div>
                  <div className="mt-2.5">
                    <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                      <span className="flex items-center gap-1">
                        <TrendingUp className="w-3 h-3 text-[#0D9488]" />
                        نسبة التحصيل الفعلي
                      </span>
                      <span className="font-mono font-bold text-[#0D9488] dark:text-teal-400">
                        {approvedAssessmentsTotal > 0
                          ? `${Math.min(100, Math.round((approvedPaymentsTotal / approvedAssessmentsTotal) * 100))}%`
                          : '0%'}
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-teal-950/10 dark:bg-teal-950 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-l from-[#0D9488] to-sky-500 transition-all duration-500"
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
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
                    {transactions.length} معاملة مسجلة ·{' '}
                    {transactions.filter((t) => t.status === 'reversed').length} قيد عكسي
                  </div>
                </div>
              </div>
            )}
          </div>

          {!isFinanceCardCollapsed && (
            <div className="grid grid-cols-2 gap-2.5 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/80">
              <button
                type="button"
                onClick={() => setActiveScreen('assessments')}
                className="min-h-[42px] rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-semibold text-[#0B192C] dark:text-slate-200 cursor-pointer transition-colors"
              >
                التقييمات المالية
              </button>
              <button
                type="button"
                onClick={() => setActiveScreen('transactions')}
                className="min-h-[42px] rounded-xl bg-gradient-to-l from-[#0B192C] to-[#132A46] hover:opacity-95 dark:from-[#0284C7] dark:to-[#0D9488] text-xs font-semibold text-white cursor-pointer shadow-2xs transition-all"
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
