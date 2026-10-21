import React, { useState, useMemo } from 'react';
import {
  FileSpreadsheet,
  Plus,
  CheckCircle2,
  RotateCcw,
  ShieldCheck,
  Search,
  Lock,
  Calculator,
  Wallet,
} from 'lucide-react';
import { useRasd } from '../context/RasdContext';
import { FinancialAssessment, FinancialTransaction, TransactionType } from '../types/rasd';

const TX_TYPE_LABELS: Record<TransactionType, string> = {
  payment: 'دفعة مسددة',
  fee: 'رسوم / مستحقات',
  adjustment: 'تسوية مالية',
  reversal: 'قيد عكسي',
};

export const FinancialsScreen: React.FC<{ initialTab?: 'assessments' | 'transactions' }> = ({
  initialTab = 'assessments',
}) => {
  const {
    workspace,
    properties,
    propertyUnits,
    assessments,
    transactions,
    isOwner,
    canApproveFinancials,
    addFinancialAssessment,
    approveFinancialAssessment,
    cancelFinancialAssessment,
    addFinancialTransaction,
    approveFinancialTransaction,
    reverseFinancialTransaction,
    setActiveScreen,
    setSelectedTaxpayerId,
    setSelectedPropertyId,
    showToast,
  } = useRasd();

  const [tab, setTab] = useState<'assessments' | 'transactions'>(initialTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPropertyId, setFilterPropertyId] = useState('all');

  // New Assessment Form
  const [isAssessOpen, setIsAssessOpen] = useState(false);
  const [assessPropId, setAssessPropId] = useState('');
  const [assessAmount, setAssessAmount] = useState('');
  const [assessCurrency, setAssessCurrency] = useState(workspace?.defaultCurrency || 'SAR');
  const [periodLabel, setPeriodLabel] = useState('الفترة السنوية 2026');
  const [assessmentDate, setAssessmentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [assessNotes, setAssessNotes] = useState('');

  // New Transaction Form
  const [isTxOpen, setIsTxOpen] = useState(false);
  const [txPropId, setTxPropId] = useState('');
  const [txAssessmentId, setTxAssessmentId] = useState('general_account');
  const [txType, setTxType] = useState<TransactionType>('payment');
  const [txAmount, setTxAmount] = useState('');
  const [txCurrency, setTxCurrency] = useState(workspace?.defaultCurrency || 'SAR');
  const [txDate, setTxDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [referenceNumber, setReferenceNumber] = useState('');
  const [txNotes, setTxNotes] = useState('');

  // Reversal / Cancellation Reason Modal
  const [reversingTx, setReversingTx] = useState<FinancialTransaction | null>(null);
  const [cancellingAssess, setCancellingAssess] = useState<FinancialAssessment | null>(null);
  const [reasonNote, setReasonNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const filteredAssessments = useMemo(() => {
    return assessments.filter((a) => {
      const matchesProp = filterPropertyId === 'all' || a.propertyId === filterPropertyId;
      const q = searchQuery.trim().toLowerCase();
      const matchesQ =
        !q ||
        a.propertyTitle.toLowerCase().includes(q) ||
        a.taxpayerName.toLowerCase().includes(q) ||
        a.periodLabel.toLowerCase().includes(q);
      return matchesProp && matchesQ;
    });
  }, [assessments, filterPropertyId, searchQuery]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      const matchesProp = filterPropertyId === 'all' || t.propertyId === filterPropertyId;
      const q = searchQuery.trim().toLowerCase();
      const matchesQ =
        !q ||
        t.propertyTitle.toLowerCase().includes(q) ||
        t.taxpayerName.toLowerCase().includes(q) ||
        t.referenceNumber.toLowerCase().includes(q);
      return matchesProp && matchesQ;
    });
  }, [transactions, filterPropertyId, searchQuery]);

  const approvedAssessmentsSum = useMemo(
    () =>
      filteredAssessments
        .filter((a) => a.status === 'approved')
        .reduce((s, a) => s + (Number(a.amount) || 0), 0),
    [filteredAssessments]
  );

  const approvedPaymentsSum = useMemo(
    () =>
      filteredTransactions
        .filter((t) => t.status === 'approved' && t.transactionType === 'payment')
        .reduce((s, t) => s + (Number(t.amount) || 0), 0),
    [filteredTransactions]
  );

  // Configurable Rate Helper
  const applyConfigurableCalculation = () => {
    if (!assessPropId) return;
    const units = propertyUnits.filter((u) => u.propertyId === assessPropId);
    const totalRent = units.reduce((s, u) => s + (Number(u.annualRentEstimate) || 0), 0);
    const rate = workspace?.taxRatePercent || 0;
    if (totalRent <= 0) {
      showToast('لا توجد تقديرات إيجار سنوية مسجلة في وحدات هذا العقار لحساب النسبة منها.', 'info');
      return;
    }
    const calculated = rate > 0 ? Math.round((totalRent * rate) / 100) : totalRent;
    setAssessAmount(String(calculated));
    showToast(
      rate > 0
        ? `تم احتساب ${rate}% من إجمالي إيجارات الوحدات (${totalRent.toLocaleString('en-US')}) = ${calculated.toLocaleString('en-US')}`
        : `تم جلب إجمالي القيمة التقديرية للوحدات (${totalRent.toLocaleString('en-US')})`,
      'info'
    );
  };

  const handleOpenAssessForm = () => {
    if (properties.length === 0) {
      showToast('يرجى إضافة عقار أولًا من ملف المكلف قبل إنشاء تقييم مالي.', 'warning');
      setActiveScreen('taxpayers');
      return;
    }
    setAssessPropId(properties[0].id);
    setAssessAmount('');
    setAssessCurrency(workspace?.defaultCurrency || 'SAR');
    setPeriodLabel('الفترة السنوية 2026');
    setAssessmentDate(new Date().toISOString().slice(0, 10));
    setAssessNotes('');
    setIsAssessOpen(true);
  };

  const handleOpenTxForm = () => {
    if (properties.length === 0) {
      showToast('يرجى إضافة عقار أولًا من ملف المكلف قبل تسجيل معاملة مالية.', 'warning');
      setActiveScreen('taxpayers');
      return;
    }
    setTxPropId(properties[0].id);
    setTxAssessmentId('general_account');
    setTxType('payment');
    setTxAmount('');
    setTxCurrency(workspace?.defaultCurrency || 'SAR');
    setTxDate(new Date().toISOString().slice(0, 10));
    setReferenceNumber(`TX-${Math.floor(10000 + Math.random() * 90000)}`);
    setTxNotes('');
    setIsTxOpen(true);
  };

  const handleCreateAssessment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const prop = properties.find((p) => p.id === assessPropId);
    const amt = parseFloat(assessAmount);
    if (!prop || isNaN(amt) || amt <= 0) {
      showToast('يرجى إدخال قيمة مالية صحيحة أكبر من الصفر.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await addFinancialAssessment({
        propertyId: prop.id,
        propertyTitle: prop.title,
        taxpayerId: prop.taxpayerId,
        taxpayerName: prop.taxpayerName,
        amount: amt,
        currency: assessCurrency,
        periodLabel,
        assessmentDate,
        status: 'draft',
        notes: assessNotes,
      });
      setIsAssessOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const prop = properties.find((p) => p.id === txPropId);
    const amt = parseFloat(txAmount);
    if (!prop || isNaN(amt) || amt <= 0) {
      showToast('يرجى إدخال مبلغ معاملة صحيح أكبر من الصفر.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await addFinancialTransaction({
        propertyId: prop.id,
        propertyTitle: prop.title,
        taxpayerId: prop.taxpayerId,
        taxpayerName: prop.taxpayerName,
        assessmentId: txAssessmentId,
        transactionType: txType,
        amount: amt,
        currency: txCurrency,
        transactionDate: txDate,
        referenceNumber,
        status: isOwner ? 'approved' : 'pending',
        notes: txNotes,
      });
      setIsTxOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmReverseOrCancel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || !reasonNote.trim()) return;
    setSubmitting(true);
    try {
      if (reversingTx) {
        await reverseFinancialTransaction(reversingTx, reasonNote);
        setReversingTx(null);
      } else if (cancellingAssess) {
        await cancelFinancialAssessment(cancellingAssess, reasonNote);
        setCancellingAssess(null);
      }
      setReasonNote('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#0B192C] dark:text-white font-display">
            التقييمات والمعاملات المالية
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            محمية بقواعد القفل بعد الاعتماد وتوثيق القيود العكسية في سجل التدقيق
          </p>
        </div>

        <button
          type="button"
          onClick={tab === 'assessments' ? handleOpenAssessForm : handleOpenTxForm}
          className="min-h-[46px] px-4 rounded-2xl bg-[#0B192C] hover:bg-[#132A46] dark:bg-[#0D9488] dark:hover:bg-teal-600 text-white text-xs font-bold flex items-center gap-2 shadow-xs cursor-pointer transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>{tab === 'assessments' ? 'إنشاء تقييم مالي' : 'تسجيل معاملة مالية'}</span>
        </button>
      </div>

      {/* Live Financial Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-l from-[#0B192C] to-[#132A46] text-white flex items-center justify-between">
          <div>
            <div className="text-xs text-sky-200">إجمالي التقييمات المعتمدة</div>
            <div className="text-xl sm:text-2xl font-bold font-mono tabular-nums mt-1">
              {approvedAssessmentsSum.toLocaleString('en-US')} {workspace?.defaultCurrency || 'SAR'}
            </div>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-white/10 text-teal-300 flex items-center justify-center">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-l from-[#0369A1] to-[#0D9488] text-white flex items-center justify-between">
          <div>
            <div className="text-xs text-teal-100">إجمالي المدفوعات المعتمدة</div>
            <div className="text-xl sm:text-2xl font-bold font-mono tabular-nums mt-1">
              {approvedPaymentsSum.toLocaleString('en-US')} {workspace?.defaultCurrency || 'SAR'}
            </div>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-white/15 text-white flex items-center justify-center">
            <Wallet className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Mode Switcher */}
      <div className="grid grid-cols-2 gap-1.5 p-1.5 bg-slate-200/75 dark:bg-[#0D1829] rounded-2xl border border-slate-200/60 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setTab('assessments')}
          className={`min-h-[44px] rounded-xl text-xs font-bold transition-all cursor-pointer ${
            tab === 'assessments'
              ? 'bg-[#0B192C] dark:bg-[#0D9488] text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          التقييمات المالية ({assessments.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('transactions')}
          className={`min-h-[44px] rounded-xl text-xs font-bold transition-all cursor-pointer ${
            tab === 'transactions'
              ? 'bg-[#0B192C] dark:bg-[#0D9488] text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          المعاملات المالية ({transactions.length})
        </button>
      </div>

      {/* Filter & Search */}
      <div className="bg-white dark:bg-[#0D1829] border border-slate-200/90 dark:border-slate-800 rounded-3xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-3 shadow-2xs">
        <div className="sm:col-span-2 relative">
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ابحث بالعقار، المكلف، الفترة، أو الرقم المرجعي..."
            className="w-full min-h-[44px] pr-10 pl-4 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs focus:outline-none focus:border-[#0284C7]"
          />
        </div>
        <select
          value={filterPropertyId}
          onChange={(e) => setFilterPropertyId(e.target.value)}
          className="min-h-[44px] px-3 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
        >
          <option value="all">جميع العقارات</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      </div>

      {/* Assessments View */}
      {tab === 'assessments' ? (
        filteredAssessments.length === 0 ? (
          <div className="bg-white dark:bg-[#0D1829] border border-slate-200/90 dark:border-slate-800 rounded-3xl p-10 text-center shadow-2xs">
            <FileSpreadsheet className="w-10 h-10 text-slate-400 mx-auto mb-3" />
            <h3 className="text-base font-bold text-[#0B192C] dark:text-white mb-1 font-display">
              لا توجد تقييمات مالية مسجلة
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
              أنشئ مسودة تقييم مالي للعقار واعتمدها وفق الصلاحيات المعتمدة في مساحة العمل.
            </p>
            <button
              type="button"
              onClick={handleOpenAssessForm}
              className="min-h-[44px] px-5 rounded-2xl bg-[#0D9488] text-white text-xs font-bold inline-flex items-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>إنشاء تقييم الآن</span>
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredAssessments.map((a) => (
              <div
                key={a.id}
                className="bg-white dark:bg-[#0D1829] border border-slate-200/90 dark:border-slate-800 rounded-3xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="font-semibold text-[#0284C7] dark:text-sky-400">{a.periodLabel}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono">{a.assessmentDate}</span>
                    <span aria-hidden="true">·</span>
                    <span>المنشئ: {a.createdByName}</span>
                    <span aria-hidden="true">·</span>
                    <span
                      className={
                        a.status === 'approved'
                          ? 'text-[#0D9488] dark:text-teal-400 font-bold'
                          : a.status === 'cancelled'
                          ? 'text-rose-600 line-through'
                          : 'text-amber-600 font-bold'
                      }
                    >
                      {a.status === 'approved'
                        ? 'معتمد ومقفل'
                        : a.status === 'cancelled'
                        ? 'ملغى بتدقيق'
                        : 'مسودة قيد المراجعة'}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTaxpayerId(a.taxpayerId);
                      setSelectedPropertyId(a.propertyId);
                      setActiveScreen('taxpayers');
                    }}
                    className="text-base font-bold text-[#0B192C] dark:text-white hover:text-[#0284C7] dark:hover:text-sky-400 font-display text-right cursor-pointer"
                  >
                    {a.propertyTitle} — المكلف: {a.taxpayerName}
                  </button>

                  {a.notes && <p className="text-xs text-slate-500">{a.notes}</p>}
                </div>

                <div className="flex flex-wrap items-center justify-between sm:justify-end gap-3 shrink-0">
                  <div className="text-lg font-bold text-[#0B192C] dark:text-white font-mono tabular-nums">
                    {a.amount.toLocaleString('en-US')} {a.currency}
                  </div>

                  {a.status === 'draft' && canApproveFinancials && (
                    <button
                      type="button"
                      onClick={() => approveFinancialAssessment(a)}
                      className="min-h-[40px] px-3.5 rounded-xl bg-[#0D9488] hover:bg-teal-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      <span>اعتماد</span>
                    </button>
                  )}

                  {a.status === 'approved' && isOwner && (
                    <button
                      type="button"
                      onClick={() => {
                        setCancellingAssess(a);
                        setReasonNote('');
                      }}
                      className="min-h-[40px] px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-xs font-semibold text-rose-600 flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>إلغاء بتدقيق</span>
                    </button>
                  )}

                  {a.status === 'approved' && !isOwner && (
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <Lock className="w-3.5 h-3.5" />
                      <span>مقفل</span>
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      ) : filteredTransactions.length === 0 ? (
        <div className="bg-white dark:bg-[#0D1829] border border-slate-200/90 dark:border-slate-800 rounded-3xl p-10 text-center shadow-2xs">
          <FileSpreadsheet className="w-10 h-10 text-slate-400 mx-auto mb-3" />
          <h3 className="text-base font-bold text-[#0B192C] dark:text-white mb-1 font-display">
            لا توجد معاملات مالية مسجلة
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
            سجّل المدفوعات أو التسويات المالية مع ربطها بالعقار والمكلف وسجل التدقيق.
          </p>
          <button
            type="button"
            onClick={handleOpenTxForm}
            className="min-h-[44px] px-5 rounded-2xl bg-[#0D9488] text-white text-xs font-bold inline-flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>تسجيل معاملة الآن</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredTransactions.map((tx) => (
            <div
              key={tx.id}
              className="bg-white dark:bg-[#0D1829] border border-slate-200/90 dark:border-slate-800 rounded-3xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs"
            >
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="font-mono font-bold text-[#0284C7] dark:text-sky-400">
                    {tx.referenceNumber}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{TX_TYPE_LABELS[tx.transactionType]}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono">{tx.transactionDate}</span>
                  <span aria-hidden="true">·</span>
                  <span>بواسطة: {tx.createdByName}</span>
                  <span aria-hidden="true">·</span>
                  <span
                    className={
                      tx.status === 'approved'
                        ? 'text-[#0D9488] dark:text-teal-400 font-bold'
                        : tx.status === 'reversed'
                        ? 'text-rose-600 line-through'
                        : 'text-amber-600 font-bold'
                    }
                  >
                    {tx.status === 'approved'
                      ? 'معتمدة'
                      : tx.status === 'reversed'
                      ? 'معكوسة بقيد'
                      : 'بانتظار الاعتماد'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedTaxpayerId(tx.taxpayerId);
                    setSelectedPropertyId(tx.propertyId);
                    setActiveScreen('taxpayers');
                  }}
                  className="text-base font-bold text-[#0B192C] dark:text-white hover:text-[#0284C7] dark:hover:text-sky-400 font-display text-right cursor-pointer"
                >
                  {tx.propertyTitle} — {tx.taxpayerName}
                </button>

                {tx.notes && <p className="text-xs text-slate-500">{tx.notes}</p>}
              </div>

              <div className="flex flex-wrap items-center justify-between sm:justify-end gap-3 shrink-0">
                <div
                  className={`text-lg font-bold font-mono tabular-nums ${
                    tx.transactionType === 'reversal'
                      ? 'text-rose-600'
                      : 'text-[#0B192C] dark:text-white'
                  }`}
                >
                  {tx.transactionType === 'reversal' ? '-' : ''}
                  {tx.amount.toLocaleString('en-US')} {tx.currency}
                </div>

                {tx.status === 'pending' && isOwner && (
                  <button
                    type="button"
                    onClick={() => approveFinancialTransaction(tx)}
                    className="min-h-[40px] px-3.5 rounded-xl bg-[#0D9488] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>اعتماد</span>
                  </button>
                )}

                {tx.status === 'approved' && tx.transactionType !== 'reversal' && isOwner && (
                  <button
                    type="button"
                    onClick={() => {
                      setReversingTx(tx);
                      setReasonNote('');
                    }}
                    className="min-h-[40px] px-3 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>قيد عكسي</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Assessment Modal */}
      {isAssessOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-lg bg-white dark:bg-[#0D1829] rounded-t-3xl sm:rounded-3xl p-6 border border-slate-200 dark:border-slate-800 max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mb-4 sm:hidden" />
            <h2 className="text-lg font-bold text-[#0B192C] dark:text-white mb-4 font-display">
              إنشاء تقييم مالي جديد
            </h2>

            <form onSubmit={handleCreateAssessment} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold mb-1">العقار المرتبط *</label>
                <select
                  required
                  value={assessPropId}
                  onChange={(e) => setAssessPropId(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                >
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title} — ({p.taxpayerName})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold">المبلغ المالي *</label>
                    <button
                      type="button"
                      onClick={applyConfigurableCalculation}
                      className="text-[11px] font-bold text-[#0284C7] dark:text-sky-400 flex items-center gap-1 cursor-pointer"
                    >
                      <Calculator className="w-3 h-3" />
                      <span>حساب من وحدات العقار</span>
                    </button>
                  </div>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    required
                    value={assessAmount}
                    onChange={(e) => setAssessAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full min-h-[44px] px-3.5 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">العملة</label>
                  <input
                    type="text"
                    required
                    value={assessCurrency}
                    onChange={(e) => setAssessCurrency(e.target.value as any)}
                    className="w-full min-h-[44px] px-3.5 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">الفترة المالية *</label>
                  <input
                    type="text"
                    required
                    value={periodLabel}
                    onChange={(e) => setPeriodLabel(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">تاريخ التقييم *</label>
                  <input
                    type="date"
                    required
                    value={assessmentDate}
                    onChange={(e) => setAssessmentDate(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">ملاحظات وأسس التقييم</label>
                <textarea
                  rows={2}
                  value={assessNotes}
                  onChange={(e) => setAssessNotes(e.target.value)}
                  className="w-full p-3 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAssessOpen(false)}
                  className="min-h-[44px] px-5 rounded-2xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-[44px] px-6 rounded-2xl bg-[#0B192C] dark:bg-[#0D9488] text-white text-xs font-bold cursor-pointer"
                >
                  حفظ مسودة التقييم
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Transaction Modal */}
      {isTxOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-lg bg-white dark:bg-[#0D1829] rounded-t-3xl sm:rounded-3xl p-6 border border-slate-200 dark:border-slate-800 max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mb-4 sm:hidden" />
            <h2 className="text-lg font-bold text-[#0B192C] dark:text-white mb-4 font-display">
              تسجيل معاملة مالية جديدة
            </h2>

            <form onSubmit={handleCreateTransaction} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold mb-1">العقار المرتبط *</label>
                <select
                  required
                  value={txPropId}
                  onChange={(e) => setTxPropId(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                >
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title} — ({p.taxpayerName})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">ربط بتقييم مالي (اختياري)</label>
                <select
                  value={txAssessmentId}
                  onChange={(e) => setTxAssessmentId(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                >
                  <option value="general_account">حساب العقار العام</option>
                  {assessments
                    .filter((a) => a.propertyId === txPropId)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.periodLabel} ({a.amount} {a.currency})
                      </option>
                    ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">نوع المعاملة</label>
                  <select
                    value={txType}
                    onChange={(e) => setTxType(e.target.value as TransactionType)}
                    className="w-full min-h-[44px] px-3.5 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                  >
                    <option value="payment">دفعة مسددة</option>
                    <option value="fee">رسوم / مستحقات</option>
                    <option value="adjustment">تسوية مالية</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">المبلغ *</label>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    required
                    value={txAmount}
                    onChange={(e) => setTxAmount(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">الرقم المرجعي / السند *</label>
                  <input
                    type="text"
                    required
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">التاريخ *</label>
                  <input
                    type="date"
                    required
                    value={txDate}
                    onChange={(e) => setTxDate(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">ملاحظات</label>
                <textarea
                  rows={2}
                  value={txNotes}
                  onChange={(e) => setTxNotes(e.target.value)}
                  className="w-full p-3 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsTxOpen(false)}
                  className="min-h-[44px] px-5 rounded-2xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-[44px] px-6 rounded-2xl bg-[#0B192C] dark:bg-[#0D9488] text-white text-xs font-bold cursor-pointer"
                >
                  حفظ المعاملة المالية
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reversal / Cancellation Audit Reason Modal */}
      {(reversingTx || cancellingAssess) && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-[#0D1829] rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xl">
            <h3 className="text-base font-bold text-[#0B192C] dark:text-white mb-2 font-display">
              {reversingTx ? 'تنفيذ قيد عكسي للمعاملة المعتمدة' : 'إلغاء التقييم المالي المعتمد'}
            </h3>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              لا يسمح النظام بحذف السجلات المالية المعتمدة أو تعديل أرصدتها بطريقة مباشرة. سيتم توثيق السبب أدناه في سجل التدقيق غير القابل للتعديل.
            </p>
            <form onSubmit={handleConfirmReverseOrCancel} className="space-y-3">
              <textarea
                rows={3}
                required
                value={reasonNote}
                onChange={(e) => setReasonNote(e.target.value)}
                placeholder="اكتب السبب الرسمي للعملية ليُحفظ في سجل التدقيق..."
                className="w-full p-3 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setReversingTx(null);
                    setCancellingAssess(null);
                  }}
                  className="min-h-[42px] px-4 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold cursor-pointer"
                >
                  تراجع
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-[42px] px-5 rounded-xl bg-rose-600 text-white text-xs font-bold cursor-pointer"
                >
                  تأكيد العملية وتوثيقها
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
