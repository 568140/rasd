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
  AlertTriangle,
  Receipt,
  User,
  Building2,
  ArrowRight,
  TrendingDown,
  Printer,
  X,
  FileText,
} from 'lucide-react';
import { useRasd } from '../context/RasdContext';
import {
  FinancialAssessment,
  FinancialTransaction,
  TransactionType,
  CurrencyCode,
  CURRENCY_LIST,
} from '../types/rasd';
import { getAdenDateString } from '../utils/dateUtils';

const TX_TYPE_LABELS: Record<TransactionType, string> = {
  payment: 'دفعة سداد نقدية/بنكية',
  fee: 'رسوم ومستحقات إضافية',
  adjustment: 'تسوية محاسبية معتمدة',
  reversal: 'قيد عكسي',
};

export const FinancialsScreen: React.FC<{ initialTab?: 'assessments' | 'transactions' | 'ledger' }> = ({
  initialTab = 'ledger',
}) => {
  const {
    workspace,
    taxpayers,
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

  const [tab, setTab] = useState<'ledger' | 'assessments' | 'transactions'>(initialTab);
  const [selectedTpId, setSelectedTpId] = useState<string>('all');
  const [filterPropertyId, setFilterPropertyId] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // New Assessment Form
  const [isAssessOpen, setIsAssessOpen] = useState(false);
  const [assessPropId, setAssessPropId] = useState('');
  const [contractValue, setContractValue] = useState('');
  const [assessAmount, setAssessAmount] = useState('');
  const [assessCurrency, setAssessCurrency] = useState<CurrencyCode>(workspace?.defaultCurrency || 'YER');
  const [periodLabel, setPeriodLabel] = useState('المطالبة المالية لعام 2026');
  const [assessmentDate, setAssessmentDate] = useState(() => getAdenDateString());
  const [assessNotes, setAssessNotes] = useState('');

  // New Transaction Form (Collection)
  const [isTxOpen, setIsTxOpen] = useState(false);
  const [txPropId, setTxPropId] = useState('');
  const [txAssessmentId, setTxAssessmentId] = useState('general_account');
  const [txType, setTxType] = useState<TransactionType>('payment');
  const [txAmount, setTxAmount] = useState('');
  const [txCurrency, setTxCurrency] = useState<CurrencyCode>(workspace?.defaultCurrency || 'YER');
  const [txDate, setTxDate] = useState(() => getAdenDateString());
  const [referenceNumber, setReferenceNumber] = useState('');
  const [txNotes, setTxNotes] = useState('');
  const [allowOverpayment, setAllowOverpayment] = useState(false);

  // Reversal / Cancellation Reason Modal
  const [reversingTx, setReversingTx] = useState<FinancialTransaction | null>(null);
  const [cancellingAssess, setCancellingAssess] = useState<FinancialAssessment | null>(null);
  const [reasonNote, setReasonNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Filtered Assessments & Transactions
  const filteredAssessments = useMemo(() => {
    return assessments.filter((a) => {
      const matchesTp = selectedTpId === 'all' || a.taxpayerId === selectedTpId;
      const matchesProp = filterPropertyId === 'all' || a.propertyId === filterPropertyId;
      const q = searchQuery.trim().toLowerCase();
      const matchesQ =
        !q ||
        a.propertyTitle.toLowerCase().includes(q) ||
        a.taxpayerName.toLowerCase().includes(q) ||
        a.periodLabel.toLowerCase().includes(q);
      return matchesTp && matchesProp && matchesQ;
    });
  }, [assessments, selectedTpId, filterPropertyId, searchQuery]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      const matchesTp = selectedTpId === 'all' || t.taxpayerId === selectedTpId;
      const matchesProp = filterPropertyId === 'all' || t.propertyId === filterPropertyId;
      const q = searchQuery.trim().toLowerCase();
      const matchesQ =
        !q ||
        t.propertyTitle.toLowerCase().includes(q) ||
        t.taxpayerName.toLowerCase().includes(q) ||
        t.referenceNumber.toLowerCase().includes(q);
      return matchesTp && matchesProp && matchesQ;
    });
  }, [transactions, selectedTpId, filterPropertyId, searchQuery]);

  // Overall Financial Math: Formula: Remaining = Demand - Collections
  const totalApprovedAssessments = useMemo(
    () =>
      filteredAssessments
        .filter((a) => a.status === 'approved')
        .reduce((sum, a) => sum + (Number(a.amount) || 0), 0),
    [filteredAssessments]
  );

  const totalContractValues = useMemo(
    () =>
      filteredAssessments
        .reduce((sum, a) => sum + (Number(a.contractValue) || Number(a.amount) || 0), 0),
    [filteredAssessments]
  );

  const totalApprovedCollections = useMemo(
    () =>
      filteredTransactions
        .filter((t) => t.status === 'approved' && t.transactionType === 'payment')
        .reduce((sum, t) => sum + (Number(t.amount) || 0), 0),
    [filteredTransactions]
  );

  const totalRemainingBalance = useMemo(
    () => Math.max(0, totalApprovedAssessments - totalApprovedCollections),
    [totalApprovedAssessments, totalApprovedCollections]
  );

  // Specific Selected Taxpayer Financials (for Ledger & Overpayment calculation)
  const currentTargetFinance = useMemo(() => {
    const targetPropId = txPropId || properties[0]?.id;
    if (!targetPropId) return { demand: 0, collections: 0, remaining: 0, contract: 0 };

    const targetProp = properties.find((p) => p.id === targetPropId);
    const tpId = targetProp?.taxpayerId;

    const tpAssessments = assessments.filter(
      (a) => a.propertyId === targetPropId || (tpId && a.taxpayerId === tpId)
    );
    const tpApprovedAssess = tpAssessments
      .filter((a) => a.status === 'approved')
      .reduce((sum, a) => sum + (Number(a.amount) || 0), 0);

    const tpContract = tpAssessments
      .reduce((sum, a) => sum + (Number(a.contractValue) || Number(a.amount) || 0), 0);

    const tpTransactions = transactions.filter(
      (t) => t.propertyId === targetPropId || (tpId && t.taxpayerId === tpId)
    );
    const tpApprovedPay = tpTransactions
      .filter((t) => t.status === 'approved' && t.transactionType === 'payment')
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

    const remaining = Math.max(0, tpApprovedAssess - tpApprovedPay);

    return {
      demand: tpApprovedAssess,
      collections: tpApprovedPay,
      remaining,
      contract: tpContract,
    };
  }, [txPropId, properties, assessments, transactions]);

  // Check if current txAmount exceeds remaining
  const enteredTxAmount = parseFloat(txAmount) || 0;
  const isOverpaying =
    txType === 'payment' &&
    enteredTxAmount > currentTargetFinance.remaining &&
    currentTargetFinance.remaining > 0;

  const handleOpenAssessForm = () => {
    if (properties.length === 0) {
      showToast('يرجى إضافة عقار أولًا قبل إنشاء تقييم مالي.', 'warning');
      setActiveScreen('taxpayers');
      return;
    }
    const p = properties[0];
    setAssessPropId(p.id);
    setContractValue('');
    setAssessAmount('');
    setAssessCurrency(workspace?.defaultCurrency || 'YER');
    setPeriodLabel('المطالبة المالية لعام 2026');
    setAssessmentDate(getAdenDateString());
    setAssessNotes('');
    setIsAssessOpen(true);
  };

  const handleOpenTxForm = (targetPropId?: string) => {
    if (properties.length === 0) {
      showToast('يرجى إضافة عقار أولًا قبل تسجيل تحصيل مالي.', 'warning');
      setActiveScreen('taxpayers');
      return;
    }
    const chosenProp = targetPropId ? properties.find((p) => p.id === targetPropId) : properties[0];
    setTxPropId(chosenProp?.id || properties[0].id);
    setTxAssessmentId('general_account');
    setTxType('payment');
    setTxAmount('');
    setTxCurrency(workspace?.defaultCurrency || 'YER');
    setTxDate(getAdenDateString());
    setReferenceNumber(`REC-${Date.now().toString().slice(-6)}`);
    setTxNotes('');
    setAllowOverpayment(false);
    setIsTxOpen(true);
  };

  const handleCreateAssessment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const prop = properties.find((p) => p.id === assessPropId);
    const amt = parseFloat(assessAmount);
    const contractAmt = parseFloat(contractValue) || amt;

    if (!prop || isNaN(amt) || amt <= 0) {
      showToast('يرجى إدخال قيمة مطالبة صحيحة أكبر من الصفر.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await addFinancialAssessment({
        propertyId: prop.id,
        propertyTitle: prop.title,
        taxpayerId: prop.taxpayerId,
        taxpayerName: prop.taxpayerName,
        contractValue: contractAmt,
        amount: amt,
        currency: assessCurrency,
        periodLabel,
        assessmentDate,
        status: canApproveFinancials ? 'approved' : 'draft',
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
      showToast('يرجى إدخال مبلغ تحصيل صحيح أكبر من الصفر.', 'error');
      return;
    }

    if (isOverpaying && !allowOverpayment) {
      showToast('المبلغ يتجاوز الرصيد المتبقي! يرجى تأكيد استثناء الزيادة أو تعديل المبلغ.', 'warning');
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
        status: 'approved', // Auto-approve collection on recording
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
    <div className="space-y-5 pb-8" dir="rtl">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#0B192C] dark:text-white font-display">
            التحصيل والعمليات المالية
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            المعادلة المعتمدة: الرصيد المتبقي = إجمالي المطالبة المعتمدة - إجمالي التحصيلات المعتمدة
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleOpenAssessForm}
            className="min-h-[42px] px-3.5 rounded-2xl bg-white dark:bg-[#0D1829] border border-slate-200 dark:border-slate-800 text-xs font-semibold text-[#0B192C] dark:text-slate-200 flex items-center gap-1.5 shadow-2xs hover:bg-slate-50 cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-[#0284C7]" />
            <span>مطالبة / تقييم جديد</span>
          </button>
          <button
            type="button"
            onClick={() => handleOpenTxForm()}
            className="min-h-[42px] px-4 rounded-2xl bg-[#0D9488] hover:bg-teal-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
          >
            <Receipt className="w-4 h-4" />
            <span>تسجيل سند تحصيل</span>
          </button>
        </div>
      </div>

      {/* Primary Mathematical Ledger Strip (4 Cards) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* 1. Contract Value */}
        <div className="p-4 rounded-3xl bg-white dark:bg-[#0D1829] border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            قيمة العقد الأصلية
          </div>
          <div className="text-lg sm:text-xl font-bold font-mono text-slate-700 dark:text-slate-200 mt-1">
            {totalContractValues.toLocaleString('en-US')} {workspace?.defaultCurrency || 'YER'}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">قيمة ثابتة لا تعدل بالتحصيل</div>
        </div>

        {/* 2. Total Approved Demand */}
        <div className="p-4 rounded-3xl bg-gradient-to-l from-[#0B192C] to-[#132A46] text-white shadow-2xs">
          <div className="text-[11px] font-semibold text-sky-200">
            إجمالي المطالبة المعتمدة
          </div>
          <div className="text-lg sm:text-xl font-bold font-mono text-white mt-1">
            {totalApprovedAssessments.toLocaleString('en-US')} {workspace?.defaultCurrency || 'YER'}
          </div>
          <div className="text-[10px] text-sky-300 mt-1">إجمالي الالتزام المقر</div>
        </div>

        {/* 3. Total Approved Collections */}
        <div className="p-4 rounded-3xl bg-gradient-to-l from-[#0D9488] to-[#047857] text-white shadow-2xs">
          <div className="text-[11px] font-semibold text-teal-100">
            إجمالي التحصيلات المعتمدة
          </div>
          <div className="text-lg sm:text-xl font-bold font-mono text-white mt-1">
            {totalApprovedCollections.toLocaleString('en-US')} {workspace?.defaultCurrency || 'YER'}
          </div>
          <div className="text-[10px] text-teal-200 mt-1">مجموع الدفعات المسددة</div>
        </div>

        {/* 4. Net Remaining Balance */}
        <div className="p-4 rounded-3xl bg-gradient-to-l from-amber-500 to-amber-600 text-slate-950 shadow-2xs">
          <div className="text-[11px] font-semibold text-amber-950">
            صافي الرصيد المتبقي
          </div>
          <div className="text-lg sm:text-xl font-bold font-mono text-slate-950 mt-1">
            {totalRemainingBalance.toLocaleString('en-US')} {workspace?.defaultCurrency || 'YER'}
          </div>
          <div className="text-[10px] text-amber-900 mt-1">المطالبة - التحصيل</div>
        </div>
      </div>

      {/* Filter and Taxpayer Selector */}
      <div className="bg-white dark:bg-[#0D1829] border border-slate-200/90 dark:border-slate-800 rounded-3xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-3 shadow-2xs">
        <div>
          <label className="block text-[11px] font-bold text-slate-500 mb-1">تصفية حسب المكلف</label>
          <select
            value={selectedTpId}
            onChange={(e) => {
              setSelectedTpId(e.target.value);
              setFilterPropertyId('all');
            }}
            className="w-full min-h-[40px] px-3 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
          >
            <option value="all">كافة المكلفين</option>
            {taxpayers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.fullName} ({t.internalCode})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-bold text-slate-500 mb-1">تصفية حسب العقار</label>
          <select
            value={filterPropertyId}
            onChange={(e) => setFilterPropertyId(e.target.value)}
            className="w-full min-h-[40px] px-3 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
          >
            <option value="all">كافة العقارات</option>
            {properties
              .filter((p) => selectedTpId === 'all' || p.taxpayerId === selectedTpId)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} — {p.taxpayerName}
                </option>
              ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-bold text-slate-500 mb-1">بحث برقم السند أو الوصف</label>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-3.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث بالرقم المرجعي أو البيان..."
              className="w-full min-h-[40px] pr-9 pl-3 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Segmented View Tabs */}
      <div className="grid grid-cols-3 gap-1.5 p-1.5 bg-slate-200/75 dark:bg-[#0D1829] rounded-2xl border border-slate-200/60 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setTab('ledger')}
          className={`min-h-[40px] rounded-xl text-xs font-bold transition-all cursor-pointer ${
            tab === 'ledger'
              ? 'bg-[#0B192C] dark:bg-[#0D9488] text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          كشف الحساب وسجل التحصيل
        </button>
        <button
          type="button"
          onClick={() => setTab('transactions')}
          className={`min-h-[40px] rounded-xl text-xs font-bold transition-all cursor-pointer ${
            tab === 'transactions'
              ? 'bg-[#0B192C] dark:bg-[#0D9488] text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          سندات التحصيل ({filteredTransactions.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('assessments')}
          className={`min-h-[40px] rounded-xl text-xs font-bold transition-all cursor-pointer ${
            tab === 'assessments'
              ? 'bg-[#0B192C] dark:bg-[#0D9488] text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          المطالبات والتقييمات ({filteredAssessments.length})
        </button>
      </div>

      {/* Tab 1: Ledger / Statement of Account */}
      {tab === 'ledger' && (
        <div className="space-y-4">
          {/* Taxpayer Grouped Cards */}
          {(selectedTpId === 'all' ? taxpayers : taxpayers.filter((t) => t.id === selectedTpId)).map((tp) => {
            const tpAssessments = assessments.filter((a) => a.taxpayerId === tp.id);
            const tpTransactions = transactions.filter((t) => t.taxpayerId === tp.id);

            const tpContract = tpAssessments.reduce(
              (sum, a) => sum + (Number(a.contractValue) || Number(a.amount) || 0),
              0
            );
            const tpApprovedDemand = tpAssessments
              .filter((a) => a.status === 'approved')
              .reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
            const tpApprovedCollections = tpTransactions
              .filter((t) => t.status === 'approved' && t.transactionType === 'payment')
              .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
            const tpRemaining = Math.max(0, tpApprovedDemand - tpApprovedCollections);

            return (
              <div
                key={tp.id}
                className="bg-white dark:bg-[#0D1829] border border-slate-200/90 dark:border-slate-800 rounded-3xl p-5 shadow-2xs space-y-4"
              >
                {/* Header Strip */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-sky-50 dark:bg-sky-950/60 text-[#0284C7] flex items-center justify-center font-bold">
                      <User className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm sm:text-base font-bold text-[#0B192C] dark:text-white">
                        {tp.fullName}
                      </h3>
                      <div className="text-xs text-slate-500 font-mono">
                        الكود: {tp.internalCode} {tp.phone ? `· ${tp.phone}` : ''}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const prop = properties.find((p) => p.taxpayerId === tp.id);
                        handleOpenTxForm(prop?.id);
                      }}
                      className="min-h-[36px] px-3.5 rounded-xl bg-[#0D9488] hover:bg-teal-700 text-white text-xs font-bold flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
                    >
                      <Receipt className="w-3.5 h-3.5" />
                      <span>تحصيل دفعة</span>
                    </button>
                  </div>
                </div>

                {/* 4 Financial Metric Badges for this Taxpayer */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
                  <div className="p-3 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800">
                    <div className="text-[10px] text-slate-500">قيمة العقد</div>
                    <div className="text-sm font-bold font-mono text-slate-800 dark:text-slate-200 mt-0.5">
                      {tpContract.toLocaleString('en-US')}
                    </div>
                  </div>
                  <div className="p-3 rounded-2xl bg-sky-50/70 dark:bg-sky-950/40 border border-sky-200/60 dark:border-sky-800/60">
                    <div className="text-[10px] text-sky-800 dark:text-sky-300 font-semibold">إجمالي المطالبة</div>
                    <div className="text-sm font-bold font-mono text-sky-900 dark:text-sky-200 mt-0.5">
                      {tpApprovedDemand.toLocaleString('en-US')}
                    </div>
                  </div>
                  <div className="p-3 rounded-2xl bg-teal-50/70 dark:bg-teal-950/40 border border-teal-200/60 dark:border-teal-800/60">
                    <div className="text-[10px] text-teal-800 dark:text-teal-300 font-semibold">إجمالي المحصل</div>
                    <div className="text-sm font-bold font-mono text-teal-900 dark:text-teal-200 mt-0.5">
                      {tpApprovedCollections.toLocaleString('en-US')}
                    </div>
                  </div>
                  <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800">
                    <div className="text-[10px] text-amber-800 dark:text-amber-300 font-bold">الرصيد المتبقي</div>
                    <div className="text-sm font-bold font-mono text-amber-900 dark:text-amber-200 mt-0.5">
                      {tpRemaining.toLocaleString('en-US')}
                    </div>
                  </div>
                </div>

                {/* Statement of Account Ledger Table */}
                <div className="space-y-2 pt-1">
                  <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    حركات التحصيل المسجلة ({tpTransactions.length})
                  </div>
                  {tpTransactions.length === 0 ? (
                    <div className="text-xs text-slate-400 py-3 text-center border border-dashed rounded-2xl border-slate-200 dark:border-slate-800">
                      لا توجد دفعات محصلة بعد لهذا المكلف.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden">
                      {tpTransactions.map((tx) => (
                        <div
                          key={tx.id}
                          className="p-3 flex items-center justify-between text-xs bg-white dark:bg-slate-900/60"
                        >
                          <div className="space-y-0.5">
                            <div className="font-bold font-mono text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                              <Receipt className="w-3.5 h-3.5 text-teal-600" />
                              <span>{tx.referenceNumber}</span>
                              <span className="text-slate-400 font-normal">({tx.transactionDate})</span>
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {tx.propertyTitle} {tx.notes ? `· ${tx.notes}` : ''}
                            </div>
                          </div>

                          <div className="text-left font-mono">
                            <div className="font-bold text-teal-700 dark:text-teal-400 text-sm">
                              +{Number(tx.amount).toLocaleString('en-US')} {tx.currency}
                            </div>
                            <span className="text-[10px] text-teal-600 dark:text-teal-500">
                              {tx.status === 'approved' ? 'معتمد' : 'قيد المراجعة'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tab 2: Transactions View */}
      {tab === 'transactions' && (
        <div className="space-y-3">
          {filteredTransactions.length === 0 ? (
            <div className="bg-white dark:bg-[#0D1829] border border-slate-200/90 dark:border-slate-800 rounded-3xl p-10 text-center shadow-2xs">
              <Receipt className="w-10 h-10 text-slate-400 mx-auto mb-2" />
              <h3 className="text-base font-bold text-[#0B192C] dark:text-white mb-1 font-display">
                لا توجد سندات تحصيل مسجلة
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                سجل دفعة نقدية جديدة للمكلف لحفظها في سجل المعاملات واحتساب المتبقي تلقائيًا.
              </p>
            </div>
          ) : (
            filteredTransactions.map((tx) => (
              <div
                key={tx.id}
                className="bg-white dark:bg-[#0D1829] border border-slate-200/90 dark:border-slate-800 rounded-3xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-teal-50 dark:bg-teal-950/60 text-[#0D9488] border border-teal-200 dark:border-teal-800">
                      {TX_TYPE_LABELS[tx.transactionType] || tx.transactionType}
                    </span>
                    <span className="font-bold text-xs font-mono text-[#0B192C] dark:text-white">
                      {tx.referenceNumber}
                    </span>
                    <span className="text-xs text-slate-400">·</span>
                    <span className="text-xs text-slate-500">{tx.transactionDate}</span>
                  </div>

                  <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {tx.taxpayerName} — {tx.propertyTitle}
                  </div>

                  {tx.notes && (
                    <div className="text-[11px] text-slate-500">{tx.notes}</div>
                  )}
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-4 border-t sm:border-t-0 pt-2 sm:pt-0">
                  <div className="text-left font-mono">
                    <div className="text-base font-bold text-teal-700 dark:text-teal-400">
                      {Number(tx.amount).toLocaleString('en-US')} {tx.currency}
                    </div>
                    <div className="text-[10px] text-slate-400">محصل ومعتمد</div>
                  </div>

                  {isOwner && tx.status !== 'reversed' && (
                    <button
                      type="button"
                      onClick={() => {
                        setReversingTx(tx);
                        setReasonNote('');
                      }}
                      className="min-h-[32px] px-2.5 rounded-xl border border-rose-200 dark:border-rose-900 text-rose-600 hover:bg-rose-50 text-[11px] font-semibold transition-colors cursor-pointer"
                    >
                      قيد عكسي
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab 3: Assessments View */}
      {tab === 'assessments' && (
        <div className="space-y-3">
          {filteredAssessments.length === 0 ? (
            <div className="bg-white dark:bg-[#0D1829] border border-slate-200/90 dark:border-slate-800 rounded-3xl p-10 text-center shadow-2xs">
              <FileSpreadsheet className="w-10 h-10 text-slate-400 mx-auto mb-2" />
              <h3 className="text-base font-bold text-[#0B192C] dark:text-white mb-1 font-display">
                لا توجد تقييمات مسجلة
              </h3>
            </div>
          ) : (
            filteredAssessments.map((a) => (
              <div
                key={a.id}
                className="bg-white dark:bg-[#0D1829] border border-slate-200/90 dark:border-slate-800 rounded-3xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                        a.status === 'approved'
                          ? 'bg-sky-50 dark:bg-sky-950/60 text-[#0284C7] border border-sky-200'
                          : a.status === 'draft'
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : 'bg-rose-50 text-rose-700'
                      }`}
                    >
                      {a.status === 'approved' ? 'مطالبة معتمدة' : a.status === 'draft' ? 'مسودة' : 'ملغى'}
                    </span>
                    <span className="text-xs font-bold text-[#0B192C] dark:text-white">
                      {a.periodLabel}
                    </span>
                    <span className="text-xs text-slate-400">·</span>
                    <span className="text-xs text-slate-500">{a.assessmentDate}</span>
                  </div>

                  <div className="text-xs text-slate-700 dark:text-slate-300">
                    {a.taxpayerName} — {a.propertyTitle}
                  </div>

                  {a.contractValue && (
                    <div className="text-[11px] text-slate-500 font-mono">
                      قيمة العقد المرجعية: {Number(a.contractValue).toLocaleString('en-US')} {a.currency}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 border-t sm:border-t-0 pt-2 sm:pt-0">
                  <div className="text-left font-mono">
                    <div className="text-base font-bold text-slate-800 dark:text-slate-100">
                      {Number(a.amount).toLocaleString('en-US')} {a.currency}
                    </div>
                    <div className="text-[10px] text-slate-400">قيمة المطالبة</div>
                  </div>

                  {a.status === 'draft' && canApproveFinancials && (
                    <button
                      type="button"
                      onClick={() => approveFinancialAssessment(a)}
                      className="min-h-[34px] px-3 rounded-xl bg-[#0D9488] hover:bg-teal-700 text-white text-xs font-bold transition-colors cursor-pointer"
                    >
                      اعتماد المطالبة
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* New Assessment Modal */}
      {isAssessOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="relative w-full max-w-lg bg-white dark:bg-[#0D1829] border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-base font-bold text-[#0B192C] dark:text-white font-display">
                إنشاء مطالبة / تقييم مالي جديد
              </h2>
              <button
                type="button"
                onClick={() => setIsAssessOpen(false)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateAssessment} className="space-y-4 pt-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  العقار المستهدف *
                </label>
                <select
                  required
                  value={assessPropId}
                  onChange={(e) => setAssessPropId(e.target.value)}
                  className="w-full min-h-[42px] px-3 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                >
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title} — {p.taxpayerName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    قيمة العقد الأصلية
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={contractValue}
                    onChange={(e) => setContractValue(e.target.value)}
                    placeholder="مثال: 500000"
                    className="w-full min-h-[42px] px-3 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    قيمة المطالبة المعتمدة *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    step="any"
                    value={assessAmount}
                    onChange={(e) => setAssessAmount(e.target.value)}
                    placeholder="مثال: 150000"
                    className="w-full min-h-[42px] px-3 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    العملة *
                  </label>
                  <select
                    value={assessCurrency}
                    onChange={(e) => setAssessCurrency(e.target.value as CurrencyCode)}
                    className="w-full min-h-[42px] px-3 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold"
                  >
                    {CURRENCY_LIST.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    الفترة المالية / البيان *
                  </label>
                  <input
                    type="text"
                    required
                    value={periodLabel}
                    onChange={(e) => setPeriodLabel(e.target.value)}
                    className="w-full min-h-[42px] px-3 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    تاريخ التقييم *
                  </label>
                  <input
                    type="date"
                    required
                    value={assessmentDate}
                    onChange={(e) => setAssessmentDate(e.target.value)}
                    className="w-full min-h-[42px] px-3 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsAssessOpen(false)}
                  className="min-h-[42px] px-4 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-[42px] px-5 rounded-2xl bg-[#0B192C] dark:bg-[#0D9488] hover:bg-[#132A46] text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
                >
                  {submitting ? 'جاري الحفظ...' : 'حفظ المطالبة المالية'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Transaction / Collection Modal */}
      {isTxOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="relative w-full max-w-lg bg-white dark:bg-[#0D1829] border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-base font-bold text-[#0B192C] dark:text-white font-display">
                تسجيل سند تحصيل مالي
              </h2>
              <button
                type="button"
                onClick={() => setIsTxOpen(false)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTransaction} className="space-y-4 pt-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  العقار / المكلف المسدد *
                </label>
                <select
                  required
                  value={txPropId}
                  onChange={(e) => setTxPropId(e.target.value)}
                  className="w-full min-h-[42px] px-3 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                >
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title} — {p.taxpayerName}
                    </option>
                  ))}
                </select>
              </div>

              {/* Target Financial Summary Box */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 grid grid-cols-3 gap-2 text-center text-xs">
                <div>
                  <div className="text-[10px] text-slate-500">المطالبة المقرة</div>
                  <div className="font-bold font-mono text-slate-800 dark:text-slate-200 mt-0.5">
                    {currentTargetFinance.demand.toLocaleString('en-US')}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-teal-600 font-semibold">المحصل سابقًا</div>
                  <div className="font-bold font-mono text-teal-700 dark:text-teal-400 mt-0.5">
                    {currentTargetFinance.collections.toLocaleString('en-US')}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-amber-700 font-bold">الرصيد المتبقي</div>
                  <div className="font-bold font-mono text-amber-800 dark:text-amber-300 mt-0.5">
                    {currentTargetFinance.remaining.toLocaleString('en-US')}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    مبلغ التحصيل *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    step="any"
                    value={txAmount}
                    onChange={(e) => setTxAmount(e.target.value)}
                    placeholder="مثال: 50000"
                    className="w-full min-h-[42px] px-3.5 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold focus:outline-none focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    العملة *
                  </label>
                  <select
                    value={txCurrency}
                    onChange={(e) => setTxCurrency(e.target.value as CurrencyCode)}
                    className="w-full min-h-[42px] px-3 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold"
                  >
                    {CURRENCY_LIST.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    رقم السند المرجعي *
                  </label>
                  <input
                    type="text"
                    required
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    className="w-full min-h-[42px] px-3.5 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold"
                  />
                </div>
              </div>

              {/* Overpayment Warning Safeguard */}
              {isOverpaying && (
                <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 text-xs text-amber-900 dark:text-amber-200 space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="font-bold leading-relaxed">
                      تنبيه: المبلغ المدخل ({enteredTxAmount.toLocaleString('en-US')}) يتجاوز الرصيد المتبقي المستحق ({currentTargetFinance.remaining.toLocaleString('en-US')})!
                    </div>
                  </div>
                  <label className="inline-flex items-center gap-2 cursor-pointer font-semibold text-[11px] text-amber-900 dark:text-amber-100">
                    <input
                      type="checkbox"
                      checked={allowOverpayment}
                      onChange={(e) => setAllowOverpayment(e.target.checked)}
                      className="rounded"
                    />
                    <span>أؤكد إدخال مبلغ يفوق الرصيد المتبقي (فائض أو رصيد دائن للمكلف)</span>
                  </label>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    طريقة / نوع التحصيل
                  </label>
                  <select
                    value={txType}
                    onChange={(e) => setTxType(e.target.value as TransactionType)}
                    className="w-full min-h-[42px] px-3 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                  >
                    <option value="payment">دفعة سداد نقدية/بنكية</option>
                    <option value="adjustment">تسوية محاسبية</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    تاريخ السند *
                  </label>
                  <input
                    type="date"
                    required
                    value={txDate}
                    onChange={(e) => setTxDate(e.target.value)}
                    className="w-full min-h-[42px] px-3 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  ملاحظات أو رقم الإيداع البنكي
                </label>
                <textarea
                  rows={2}
                  value={txNotes}
                  onChange={(e) => setTxNotes(e.target.value)}
                  placeholder="مثال: شيك مصرفي رقم ... أو إيداع نقدي بالخزينة"
                  className="w-full p-3 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsTxOpen(false)}
                  className="min-h-[42px] px-4 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={submitting || (isOverpaying && !allowOverpayment)}
                  className="min-h-[42px] px-5 rounded-2xl bg-[#0D9488] hover:bg-teal-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  {submitting ? 'جاري التسجيل...' : 'تأكيد وحفظ سند التحصيل'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reversal / Cancellation Modal */}
      {(reversingTx || cancellingAssess) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="relative w-full max-w-md bg-white dark:bg-[#0D1829] border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl p-6">
            <h2 className="text-base font-bold text-rose-700 dark:text-rose-400 font-display mb-1">
              {reversingTx ? 'توثيق قيد عكسي لسند تحصيل' : 'إلغاء مطالبة مالية'}
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              المعاملة: {reversingTx?.referenceNumber || cancellingAssess?.periodLabel}
            </p>

            <form onSubmit={handleConfirmReverseOrCancel} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  السبب المالي الموثق *
                </label>
                <textarea
                  required
                  rows={3}
                  value={reasonNote}
                  onChange={(e) => setReasonNote(e.target.value)}
                  placeholder="مثال: تسجيل خاطئ لمبلغ الدفعة، أو تسوية قضائية معتمدة..."
                  className="w-full p-3 rounded-2xl bg-[#F4F7FA] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setReversingTx(null);
                    setCancellingAssess(null);
                  }}
                  className="min-h-[40px] px-4 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                >
                  تراجع
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-[40px] px-5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
                >
                  {submitting ? 'جاري التنفيذ...' : 'تأكيد وحفظ القيد في سجل التدقيق'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
