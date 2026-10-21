import React, { useState, useMemo } from 'react';
import {
  Download,
  Printer,
  Filter,
  BarChart3,
  Building2,
  Users,
  MapPin,
  Calendar,
  FileSpreadsheet,
} from 'lucide-react';
import { useRasd } from '../context/RasdContext';

export const ReportsScreen: React.FC = () => {
  const {
    workspace,
    taxpayers,
    properties,
    fieldVisits,
    appointments,
    transactions,
    showToast,
  } = useRasd();

  const [reportType, setReportType] = useState<'properties' | 'taxpayers' | 'visits' | 'financials'>('properties');
  const [regionFilter, setRegionFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  const regions = useMemo(() => {
    const set = new Set<string>();
    properties.forEach((p) => {
      if (p.region) set.add(p.region);
    });
    taxpayers.forEach((t) => {
      if (t.region) set.add(t.region);
    });
    return Array.from(set);
  }, [properties, taxpayers]);

  const filteredProperties = useMemo(
    () => properties.filter((p) => regionFilter === 'all' || p.region === regionFilter),
    [properties, regionFilter]
  );

  const filteredTaxpayers = useMemo(
    () => taxpayers.filter((t) => regionFilter === 'all' || t.region === regionFilter),
    [taxpayers, regionFilter]
  );

  const filteredVisits = useMemo(
    () =>
      fieldVisits.filter((v) => {
        if (dateFrom && v.visitDate < dateFrom) return false;
        if (dateTo && v.visitDate > dateTo) return false;
        return true;
      }),
    [fieldVisits, dateFrom, dateTo]
  );

  const filteredTransactions = useMemo(
    () =>
      transactions.filter((t) => {
        if (dateFrom && t.transactionDate < dateFrom) return false;
        if (dateTo && t.transactionDate > dateTo) return false;
        return true;
      }),
    [transactions, dateFrom, dateTo]
  );

  const handleExportCSV = () => {
    let headers: string[] = [];
    let rows: (string | number)[][] = [];

    if (reportType === 'properties') {
      headers = ['الرمز', 'اسم العقار', 'النوع', 'الحالة', 'المنطقة', 'المكلف', 'المساحة م2', 'عدد الوحدات'];
      rows = filteredProperties.map((p) => [
        p.code,
        p.title,
        p.propertyType,
        p.status,
        p.region,
        p.taxpayerName,
        p.areaSqm,
        p.unitsCount,
      ]);
    } else if (reportType === 'taxpayers') {
      headers = ['المعرف الداخلي', 'الاسم الكامل', 'الهوية/السجل', 'الهاتف', 'المنطقة', 'الحالة'];
      rows = filteredTaxpayers.map((t) => [
        t.internalCode,
        t.fullName,
        t.nationalOrCommercialId,
        t.phone,
        t.region,
        t.status,
      ]);
    } else if (reportType === 'visits') {
      headers = ['التاريخ', 'الوقت', 'العقار', 'المكلف', 'الغرض', 'الحالة', 'الموظف المنفذ'];
      rows = filteredVisits.map((v) => [
        v.visitDate,
        v.visitTime,
        v.propertyTitle,
        v.taxpayerName,
        v.purpose,
        v.status,
        v.officerName,
      ]);
    } else {
      headers = ['الرقم المرجعي', 'التاريخ', 'النوع', 'العقار', 'المكلف', 'المبلغ', 'العملة', 'الحالة'];
      rows = filteredTransactions.map((t) => [
        t.referenceNumber,
        t.transactionDate,
        t.transactionType,
        t.propertyTitle,
        t.taxpayerName,
        t.amount,
        t.currency,
        t.status,
      ]);
    }

    const csvContent =
      '\uFEFF' +
      [headers, ...rows]
        .map((row) =>
          row
            .map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`)
            .join(',')
        )
        .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `rasd_report_${reportType}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('تم تصدير ملف التقرير بصيغة CSV بنجاح', 'success');
  };

  const handlePrintPDF = () => {
    window.print();
  };

  return (
    <div className="space-y-5 pb-6">
      {/* Deep Navy Analytics Header */}
      <div className="rounded-3xl bg-gradient-to-l from-[#0B192C] via-[#102A46] to-[#0369A1] text-white p-5 sm:p-6 shadow-md flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center shrink-0">
            <BarChart3 className="w-6 h-6 text-teal-300" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-extrabold">التقارير والإحصاءات الميدانية</h1>
            <p className="text-xs text-slate-300 mt-0.5">
              مساحة العمل: {workspace?.name} · تصدير مباشر بصيغة CSV وطباعة PDF
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrintPDF}
            className="min-h-[44px] px-4 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/15 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Printer className="w-4 h-4 text-teal-300" />
            <span>طباعة / حفظ PDF</span>
          </button>
          <button
            type="button"
            onClick={handleExportCSV}
            className="min-h-[44px] px-4 rounded-2xl bg-[#0D9488] hover:bg-[#0F766E] text-white text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>تصدير CSV</span>
          </button>
        </div>
      </div>

      {/* Differentiated Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-3xl bg-white dark:bg-[#0D1829] border border-slate-200/80 dark:border-slate-800/80 border-r-4 border-r-[#0B192C] dark:border-r-sky-400 shadow-xs">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-slate-500">المكلفون</span>
            <Users className="w-4 h-4 text-[#0B192C] dark:text-sky-400" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 dark:text-white tabular-nums">
            {filteredTaxpayers.length}
          </div>
        </div>

        <div className="p-4 rounded-3xl bg-white dark:bg-[#0D1829] border border-slate-200/80 dark:border-slate-800/80 border-r-4 border-r-[#0284C7] shadow-xs">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-slate-500">العقارات</span>
            <Building2 className="w-4 h-4 text-[#0284C7]" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 dark:text-white tabular-nums">
            {filteredProperties.length}
          </div>
        </div>

        <div className="p-4 rounded-3xl bg-white dark:bg-[#0D1829] border border-slate-200/80 dark:border-slate-800/80 border-r-4 border-r-[#0D9488] shadow-xs">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-slate-500">الزيارات الميدانية</span>
            <MapPin className="w-4 h-4 text-[#0D9488]" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 dark:text-white tabular-nums">
            {filteredVisits.length}
          </div>
        </div>

        <div className="p-4 rounded-3xl bg-white dark:bg-[#0D1829] border border-slate-200/80 dark:border-slate-800/80 border-r-4 border-r-amber-500 shadow-xs">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-slate-500">المواعيد</span>
            <Calendar className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 dark:text-white tabular-nums">
            {appointments.length}
          </div>
        </div>
      </div>

      {/* Filters & Report Selector */}
      <div className="bg-white dark:bg-[#0D1829] border border-slate-200/80 dark:border-slate-800/80 rounded-3xl p-4 sm:p-5 space-y-3.5 shadow-xs">
        <div className="flex items-center gap-2 text-xs font-extrabold text-slate-800 dark:text-slate-200">
          <Filter className="w-4 h-4 text-[#0284C7]" />
          <span>تخصيص التقرير والفلاتر</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">نوع التقرير</label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value as any)}
              className="w-full min-h-[44px] px-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold"
            >
              <option value="properties">تقرير العقارات والوحدات</option>
              <option value="taxpayers">تقرير المكلفين</option>
              <option value="visits">تقرير الزيارات الميدانية</option>
              <option value="financials">تقرير المعاملات المالية</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">تصفية المنطقة</label>
            <select
              value={regionFilter}
              onChange={(e) => setRegionFilter(e.target.value)}
              className="w-full min-h-[44px] px-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold"
            >
              <option value="all">كل المناطق ({regions.length})</option>
              {regions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">من تاريخ</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full min-h-[44px] px-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">إلى تاريخ</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full min-h-[44px] px-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono"
            />
          </div>
        </div>
      </div>

      {/* Tabular Report View */}
      <div className="bg-white dark:bg-[#0D1829] border border-slate-200/80 dark:border-slate-800/80 rounded-3xl overflow-hidden shadow-xs">
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-[#0D9488]" />
            <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">
              معاينة جدول التقرير المباشر
            </h2>
          </div>
          <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
            {reportType === 'properties'
              ? `${filteredProperties.length} سجل`
              : reportType === 'taxpayers'
              ? `${filteredTaxpayers.length} سجل`
              : reportType === 'visits'
              ? `${filteredVisits.length} سجل`
              : `${filteredTransactions.length} سجل`}
          </span>
        </div>

        <div className="overflow-x-auto">
          {reportType === 'properties' && (
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900/90 text-slate-600 dark:text-slate-300 border-b border-slate-200/70 dark:border-slate-800">
                <tr>
                  <th className="p-3.5 font-bold">الرمز</th>
                  <th className="p-3.5 font-bold">العقار</th>
                  <th className="p-3.5 font-bold">المكلف</th>
                  <th className="p-3.5 font-bold">المنطقة</th>
                  <th className="p-3.5 font-bold">المساحة (م²)</th>
                  <th className="p-3.5 font-bold">الوحدات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {filteredProperties.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="p-3.5 font-mono text-slate-500">{p.code}</td>
                    <td className="p-3.5 font-bold text-slate-900 dark:text-white">{p.title}</td>
                    <td className="p-3.5">{p.taxpayerName}</td>
                    <td className="p-3.5">{p.region}</td>
                    <td className="p-3.5 font-mono tabular-nums">{p.areaSqm}</td>
                    <td className="p-3.5 font-mono tabular-nums font-bold">{p.unitsCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {reportType === 'taxpayers' && (
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900/90 text-slate-600 dark:text-slate-300 border-b border-slate-200/70 dark:border-slate-800">
                <tr>
                  <th className="p-3.5 font-bold">المعرف</th>
                  <th className="p-3.5 font-bold">الاسم الكامل</th>
                  <th className="p-3.5 font-bold">الهاتف</th>
                  <th className="p-3.5 font-bold">المنطقة</th>
                  <th className="p-3.5 font-bold">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {filteredTaxpayers.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="p-3.5 font-mono text-slate-500">{t.internalCode}</td>
                    <td className="p-3.5 font-bold text-slate-900 dark:text-white">{t.fullName}</td>
                    <td className="p-3.5 font-mono">{t.phone || '-'}</td>
                    <td className="p-3.5">{t.region}</td>
                    <td className="p-3.5">{t.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {reportType === 'visits' && (
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900/90 text-slate-600 dark:text-slate-300 border-b border-slate-200/70 dark:border-slate-800">
                <tr>
                  <th className="p-3.5 font-bold">التاريخ</th>
                  <th className="p-3.5 font-bold">العقار</th>
                  <th className="p-3.5 font-bold">المكلف</th>
                  <th className="p-3.5 font-bold">الموظف</th>
                  <th className="p-3.5 font-bold">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {filteredVisits.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="p-3.5 font-mono">{v.visitDate}</td>
                    <td className="p-3.5 font-bold text-slate-900 dark:text-white">{v.propertyTitle}</td>
                    <td className="p-3.5">{v.taxpayerName}</td>
                    <td className="p-3.5">{v.officerName}</td>
                    <td className="p-3.5">{v.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {reportType === 'financials' && (
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900/90 text-slate-600 dark:text-slate-300 border-b border-slate-200/70 dark:border-slate-800">
                <tr>
                  <th className="p-3.5 font-bold">المرجع</th>
                  <th className="p-3.5 font-bold">التاريخ</th>
                  <th className="p-3.5 font-bold">العقار</th>
                  <th className="p-3.5 font-bold">المبلغ</th>
                  <th className="p-3.5 font-bold">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {filteredTransactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="p-3.5 font-mono text-slate-500">{tx.referenceNumber}</td>
                    <td className="p-3.5 font-mono">{tx.transactionDate}</td>
                    <td className="p-3.5 font-bold text-slate-900 dark:text-white">{tx.propertyTitle}</td>
                    <td className="p-3.5 font-mono tabular-nums font-bold">
                      {tx.amount.toLocaleString('en-US')} {tx.currency}
                    </td>
                    <td className="p-3.5">{tx.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
