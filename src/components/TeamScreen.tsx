import React, { useState } from 'react';
import {
  Users,
  UserPlus,
  Trash2,
  Copy,
  Lock,
  ShieldCheck,
  AlertTriangle,
  KeyRound,
  Mail,
  Eye,
  EyeOff,
  CheckCircle2,
} from 'lucide-react';
import { useRasd } from '../context/RasdContext';
import { WorkspaceMember, WorkspaceRole } from '../types/rasd';

const ROLE_LABELS: Record<WorkspaceRole, string> = {
  owner: 'المدير الأساسي (المالك)',
  field_assistant: 'مساعد ميداني',
  finance_assistant: 'مساعد مالي',
  viewer: 'مشاهد فقط',
};

export const TeamScreen: React.FC = () => {
  const {
    workspace,
    members,
    auditLogs,
    isOwner,
    isPlatformAdmin,
    addTeamMember,
    updateTeamMember,
    removeTeamMember,
    showToast,
  } = useRasd();

  const canManageTeam = isOwner || isPlatformAdmin;

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addMethod, setAddMethod] = useState<'direct_account' | 'email_invite'>('direct_account');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [initialPassword, setInitialPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [userIdInput, setUserIdInput] = useState('');
  const [role, setRole] = useState<WorkspaceRole>('field_assistant');
  const [canApprove, setCanApprove] = useState(false);
  const [canDelete, setCanDelete] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [memberPendingRemoval, setMemberPendingRemoval] = useState<WorkspaceMember | null>(null);

  const totalMembersCount = Math.max(members.length, workspace?.memberUids.length || 1);
  const remainingSlots = Math.max(0, 10 - totalMembersCount);

  const handleCopyInvite = () => {
    if (!workspace?.inviteCode) return;
    navigator.clipboard.writeText(workspace.inviteCode);
    showToast('تم نسخ رمز دعوة مساحة العمل', 'success');
  };

  const resetAddForm = () => {
    setDisplayName('');
    setEmail('');
    setInitialPassword('');
    setShowPassword(false);
    setUserIdInput('');
    setRole('field_assistant');
    setCanApprove(false);
    setCanDelete(false);
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (addMethod === 'direct_account' && initialPassword.trim().length < 6) {
      showToast('يرجى إدخال كلمة مرور مبدئية لا تقل عن 6 أحرف للمستخدم الجديد.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await addTeamMember(
        displayName,
        email,
        userIdInput,
        role,
        canApprove,
        canDelete,
        addMethod === 'direct_account' ? initialPassword : undefined
      );
      setIsAddOpen(false);
      resetAddForm();
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmRemove = async () => {
    if (!memberPendingRemoval) return;
    await removeTeamMember(memberPendingRemoval);
    setMemberPendingRemoval(null);
  };

  return (
    <div className="space-y-5 pb-6" dir="rtl">
      {/* Deep Navy Team & Isolation Header */}
      <div className="rounded-3xl bg-gradient-to-l from-[#0B192C] via-[#102A46] to-[#0369A1] text-white p-5 sm:p-6 shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs text-teal-300 font-bold">
              <ShieldCheck className="w-4 h-4" />
              <span>مساحة العمل المعزولة: {workspace?.name || 'مساحة رَصْد'}</span>
            </div>
            <h1 className="text-xl font-extrabold">إدارة الفريق وإضافة المستخدمين</h1>
            <p className="text-xs text-slate-300 max-w-xl leading-relaxed">
              الحد الأقصى لمساحة العمل: 10 أعضاء (المدير الأساسي + 9 مستخدمين) · المسجلون حاليًا:{' '}
              <span className="font-mono font-bold text-teal-300">{totalMembersCount}/10</span>
            </p>
          </div>

          {canManageTeam && (
            <div className="flex flex-wrap items-center gap-2.5">
              {workspace?.inviteCode && (
                <div className="flex items-center gap-2 bg-white/10 border border-white/15 px-3.5 py-2 rounded-2xl">
                  <div>
                    <div className="text-[10px] text-slate-300">رمز ربط المساحة</div>
                    <div className="text-xs font-mono font-bold text-teal-300">
                      {workspace.inviteCode}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyInvite}
                    className="min-h-[34px] min-w-[34px] rounded-xl hover:bg-white/15 flex items-center justify-center cursor-pointer"
                    title="نسخ الرمز"
                  >
                    <Copy className="w-4 h-4 text-white" />
                  </button>
                </div>
              )}

              {remainingSlots > 0 && (
                <button
                  type="button"
                  onClick={() => setIsAddOpen(true)}
                  className="min-h-[46px] px-4 rounded-2xl bg-[#0D9488] hover:bg-[#0F766E] text-white text-xs font-bold flex items-center gap-2 shadow-sm cursor-pointer transition-colors"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>إضافة مستخدم للفريق ({remainingSlots} متاح)</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Team Members Directory */}
      <div className="bg-white dark:bg-[#0D1829] border border-slate-200/80 dark:border-slate-800/80 rounded-3xl p-5 space-y-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-[#0284C7]" />
            <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
              أعضاء الفريق ({members.length})
            </h2>
          </div>

          <div className="flex items-center gap-2">
            {canManageTeam && remainingSlots > 0 && (
              <button
                type="button"
                onClick={() => setIsAddOpen(true)}
                className="min-h-[38px] px-3.5 rounded-xl bg-[#743B46] hover:bg-[#5D2D37] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>+ إضافة مستخدم جديد</span>
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {members.map((m) => {
            const isMemberOwner = m.role === 'owner' || m.userId === workspace?.ownerId;
            const memberActionsCount = auditLogs.filter((l) => l.actorId === m.userId).length;

            return (
              <div
                key={m.id}
                className="p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-900/50 border border-slate-200/70 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="flex items-start gap-3.5">
                  <div
                    className={`w-11 h-11 rounded-2xl font-extrabold text-sm flex items-center justify-center shrink-0 ${
                      isMemberOwner
                        ? 'bg-[#0B192C] text-white dark:bg-sky-900/70 dark:text-sky-200'
                        : 'bg-teal-50 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300'
                    }`}
                  >
                    {m.displayName?.slice(0, 1) || 'م'}
                  </div>

                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-extrabold text-slate-900 dark:text-white">
                        {m.displayName}
                      </span>
                      <span className="text-[11px] px-2.5 py-0.5 rounded-lg bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 font-bold">
                        {ROLE_LABELS[m.role]}
                      </span>
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-lg font-bold ${
                          m.status === 'active'
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                            : m.status === 'invited'
                            ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                            : 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                        }`}
                      >
                        {m.status === 'active'
                          ? 'نشط'
                          : m.status === 'invited'
                          ? 'مدعو (يرتبط تلقائيًا عند دخوله)'
                          : 'موقوف'}
                      </span>
                    </div>

                    <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2">
                      <span className="font-mono">{m.email}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        معرف: <span className="font-mono">{m.userId}</span>
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        عمليات موثقة: <strong>{memberActionsCount}</strong>
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-2 pt-1">
                      {canManageTeam && !isMemberOwner ? (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              updateTeamMember(
                                m,
                                m.role,
                                m.status,
                                !m.canApproveFinancials,
                                m.canDeleteRecords
                              )
                            }
                            className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold cursor-pointer transition-colors ${
                              m.canApproveFinancials
                                ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500'
                            }`}
                          >
                            اعتماد التقييمات: {m.canApproveFinancials ? 'مسموح ✓' : 'غير مسموح'}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateTeamMember(
                                m,
                                m.role,
                                m.status,
                                m.canApproveFinancials,
                                !m.canDeleteRecords
                              )
                            }
                            className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold cursor-pointer transition-colors ${
                              m.canDeleteRecords
                                ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500'
                            }`}
                          >
                            حذف السجلات: {m.canDeleteRecords ? 'مسموح ✓' : 'غير مسموح'}
                          </button>
                        </>
                      ) : (
                        <>
                          <span>
                            اعتماد التقييمات:{' '}
                            <strong>{m.canApproveFinancials ? 'مسموح' : 'غير مسموح'}</strong>
                          </span>
                          <span>·</span>
                          <span>
                            حذف السجلات: <strong>{m.canDeleteRecords ? 'مسموح' : 'غير مسموح'}</strong>
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {canManageTeam && !isMemberOwner ? (
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <select
                      value={m.role}
                      onChange={(e) =>
                        updateTeamMember(
                          m,
                          e.target.value as WorkspaceRole,
                          m.status,
                          m.canApproveFinancials,
                          m.canDeleteRecords
                        )
                      }
                      className="min-h-[38px] px-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                    >
                      <option value="field_assistant">مساعد ميداني</option>
                      <option value="finance_assistant">مساعد مالي</option>
                      <option value="viewer">مشاهد فقط</option>
                    </select>

                    <button
                      type="button"
                      onClick={() =>
                        updateTeamMember(
                          m,
                          m.role,
                          m.status === 'suspended' ? 'active' : 'suspended',
                          m.canApproveFinancials,
                          m.canDeleteRecords
                        )
                      }
                      className="min-h-[38px] px-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold cursor-pointer"
                    >
                      {m.status === 'suspended' ? 'تفعيل' : 'إيقاف مؤقت'}
                    </button>

                    <button
                      type="button"
                      onClick={() => setMemberPendingRemoval(m)}
                      className="min-h-[38px] min-w-[38px] rounded-xl text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center justify-center cursor-pointer"
                      title="إزالة العضو"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <span className="text-xs text-slate-400 flex items-center gap-1 shrink-0 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700">
                    <Lock className="w-3.5 h-3.5" />
                    <span>{isMemberOwner ? 'المدير الأساسي' : 'محمي'}</span>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Confirmation Modal Before Removing Member */}
      {memberPendingRemoval && (
        <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-center justify-center p-4" dir="rtl">
          <div className="w-full max-w-md bg-white dark:bg-[#0D1829] rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400">
              <div className="w-11 h-11 rounded-2xl bg-rose-50 dark:bg-rose-950/60 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                  تأكيد إزالة مستخدم من الفريق
                </h3>
                <p className="text-xs text-slate-500">إجراء حساس في صلاحيات مساحة العمل</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              هل أنت متأكد من إزالة <strong>{memberPendingRemoval.displayName}</strong> (
              {memberPendingRemoval.email}) من مساحة العمل؟ سيفقد صلاحية الوصول فورًا مع بقاء العمليات
              السابقة التي نفذها موثقة في سجل التدقيق.
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setMemberPendingRemoval(null)}
                className="min-h-[42px] px-4 rounded-2xl bg-slate-100 dark:bg-slate-800 text-xs font-bold cursor-pointer"
              >
                تراجع
              </button>
              <button
                type="button"
                onClick={handleConfirmRemove}
                className="min-h-[42px] px-5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer"
              >
                تأكيد الإزالة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add User / Assistant Modal */}
      {isAddOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto"
          dir="rtl"
        >
          <div className="w-full max-w-lg bg-white dark:bg-[#0D1829] rounded-t-3xl sm:rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xl my-auto">
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white mb-1">
              إضافة مستخدم جديد للفريق
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              المقاعد المتاحة في مساحة العمل: {remainingSlots} من أصل 9 مستخدمين
            </p>

            {/* Method Selector Tabs */}
            <div className="grid grid-cols-2 gap-1.5 p-1.5 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 mb-4">
              <button
                type="button"
                onClick={() => setAddMethod('direct_account')}
                className={`min-h-[40px] px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  addMethod === 'direct_account'
                    ? 'bg-[#0B192C] dark:bg-[#0284C7] text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>إنشاء حساب مباشر بكلمة مرور</span>
              </button>
              <button
                type="button"
                onClick={() => setAddMethod('email_invite')}
                className={`min-h-[40px] px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  addMethod === 'email_invite'
                    ? 'bg-[#0B192C] dark:bg-[#0284C7] text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Mail className="w-3.5 h-3.5" />
                <span>إضافة بالبريد (Google / حساب حالي)</span>
              </button>
            </div>

            <form onSubmit={handleAddMember} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold mb-1">اسم المستخدم الكامل *</label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="مثال: خالد القحطاني"
                  className="w-full min-h-[44px] px-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold mb-1">البريد الإلكتروني للمستخدم *</label>
                <input
                  type="email"
                  required
                  dir="ltr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="w-full min-h-[44px] px-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-left font-mono"
                />
              </div>

              {addMethod === 'direct_account' ? (
                <div>
                  <label className="block text-xs font-bold mb-1">
                    كلمة المرور المبدئية للمستخدم (6 أحرف فأكثر) *
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      dir="ltr"
                      value={initialPassword}
                      onChange={(e) => setInitialPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full min-h-[44px] px-3.5 pl-10 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-left font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                      aria-label="إظهار أو إخفاء كلمة المرور"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-1 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      سيتم إنشاء حساب الدخول للمستخدم وتفعيله في فريقك فورًا دون الخروج من حسابك.
                    </span>
                  </p>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-bold mb-1">
                    معرف Firebase UID للمستخدم (اختياري)
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={userIdInput}
                    onChange={(e) => setUserIdInput(e.target.value)}
                    placeholder="اتركه فارغًا ليتم الربط التلقائي بمجرد دخول المستخدم ببريده"
                    className="w-full min-h-[44px] px-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-left font-mono"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    بمجرد تسجيل المستخدم الدخول بهذا البريد الإلكتروني (عبر Google أو البريد)، سينضم تلقائيًا إلى فريق مساحة العمل.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold mb-1">الدور الوظيفي في الفريق</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as WorkspaceRole)}
                  className="w-full min-h-[44px] px-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                >
                  <option value="field_assistant">مساعد ميداني (مكلفون، عقارات، زيارات، مواعيد)</option>
                  <option value="finance_assistant">مساعد مالي (تقييمات ومعاملات مالية)</option>
                  <option value="viewer">مشاهد فقط (اطلاع وتقارير)</option>
                </select>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 space-y-2 text-xs">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={canApprove}
                    onChange={(e) => setCanApprove(e.target.checked)}
                    className="w-4 h-4 accent-[#0D9488]"
                  />
                  <span>السماح باعتماد مسودات التقييمات المالية</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={canDelete}
                    onChange={(e) => setCanDelete(e.target.checked)}
                    className="w-4 h-4 accent-[#0D9488]"
                  />
                  <span>منح صلاحية حذف السجلات غير المرتبطة</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddOpen(false);
                    resetAddForm();
                  }}
                  className="min-h-[44px] px-5 rounded-2xl bg-slate-100 dark:bg-slate-800 text-xs font-bold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-[44px] px-6 rounded-2xl bg-[#0B192C] hover:bg-[#102A46] dark:bg-[#0284C7] text-white text-xs font-bold cursor-pointer disabled:opacity-60"
                >
                  {submitting ? 'جاري الإضافة...' : 'إضافة المستخدم للفريق'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

