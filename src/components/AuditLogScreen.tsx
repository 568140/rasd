import React, { useState, useMemo } from 'react';
import {
  ShieldCheck,
  Search,
  Lock,
  Clock,
} from 'lucide-react';
import { useRasd } from '../context/RasdContext';

const ACTION_BADGE_STYLES: Record<string, string> = {
  create: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  update: 'bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300',
  delete: 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
  approve: 'bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300',
  reverse: 'bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
  postpone: 'bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
  team_change: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300',
  voice_command: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300',
};

export const AuditLogScreen: React.FC = () => {
  const { auditLogs } = useRasd();
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('all');

  const filteredLogs = useMemo(() => {
    return auditLogs.filter((l) => {
      const matchesAction = actionFilter === 'all' || l.actionType === actionFilter;
      const q = searchQuery.trim().toLowerCase();
      const matchesQ =
        !q ||
        l.summary.toLowerCase().includes(q) ||
        l.actorName.toLowerCase().includes(q) ||
        l.entityId.toLowerCase().includes(q);
      return matchesAction && matchesQ;
    });
  }, [auditLogs, actionFilter, searchQuery]);

  return (
    <div className="space-y-5 pb-6">
      {/* Deep Navy Security Audit Header */}
      <div className="rounded-3xl bg-gradient-to-l from-[#0B192C] via-[#102A46] to-[#0369A1] text-white p-5 sm:p-6 shadow-md flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-6 h-6 text-teal-300" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-extrabold">
              سجل التدقيق الأمني والتشغيلي (Audit Trail)
            </h1>
            <p className="text-xs text-slate-300 mt-0.5">
              سجل غير قابل للتعديل أو الحذف من جانب العميل (`allow update, delete: if false`)
            </p>
          </div>
        </div>

        <div className="px-3.5 py-2 rounded-2xl bg-white/10 border border-white/15 text-xs font-bold text-teal-300 flex items-center gap-1.5">
          <Lock className="w-3.5 h-3.5" />
          <span>محمي بقواعد Firestore الصارمة</span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white dark:bg-[#0D1829] border border-slate-200/80 dark:border-slate-800/80 rounded-3xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-3 shadow-xs">
        <div className="sm:col-span-2 relative">
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ابحث في تفاصيل العملية، اسم المنفذ، أو معرف السجل..."
            className="w-full min-h-[44px] pr-10 pl-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
          />
        </div>
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="min-h-[44px] px-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold"
        >
          <option value="all">جميع أنواع العمليات ({auditLogs.length})</option>
          <option value="create">إضافة سجل (create)</option>
          <option value="update">تعديل سجل (update)</option>
          <option value="delete">حذف سجل (delete)</option>
          <option value="approve">اعتماد مالي (approve)</option>
          <option value="reverse">قيد عكسي / إلغاء (reverse)</option>
          <option value="postpone">تأجيل موعد (postpone)</option>
          <option value="team_change">إدارة الفريق (team_change)</option>
          <option value="voice_command">أمر صوتي (voice_command)</option>
        </select>
      </div>

      {filteredLogs.length === 0 ? (
        <div className="bg-white dark:bg-[#0D1829] border border-slate-200/80 dark:border-slate-800/80 rounded-3xl p-10 text-center">
          <ShieldCheck className="w-10 h-10 text-slate-400 mx-auto mb-2" />
          <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
            لا توجد سجلات تدقيق مطابقة
          </h3>
        </div>
      ) : (
        <div className="bg-white dark:bg-[#0D1829] border border-slate-200/80 dark:border-slate-800/80 rounded-3xl divide-y divide-slate-100 dark:divide-slate-800/80 shadow-xs">
          {filteredLogs.map((log) => (
            <div key={log.id} className="p-4 sm:p-5 flex items-start justify-between gap-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-lg ${
                      ACTION_BADGE_STYLES[log.actionType] ||
                      'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    {log.actionType}
                  </span>
                  <span className="text-sm font-bold text-slate-900 dark:text-white">
                    {log.summary}
                  </span>
                </div>
                <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2">
                  <span>المنفذ: <strong className="text-slate-700 dark:text-slate-300">{log.actorName}</strong></span>
                  <span aria-hidden="true">·</span>
                  <span>الكيان: <span className="font-mono">{log.entityType}</span></span>
                  <span aria-hidden="true">·</span>
                  <span>المعرف: <span className="font-mono">{log.entityId}</span></span>
                </div>
              </div>
              <div className="text-[11px] font-bold text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/50 px-2.5 py-1 rounded-xl flex items-center gap-1 shrink-0">
                <Clock className="w-3.5 h-3.5" />
                <span>موثق</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
