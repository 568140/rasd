# وثيقة مواصفات الأمان واختبارات الاختراق (Security Specification — RASD)

## 1. ثوابت البيانات (Data Invariants)
1. **عزلة الهوية والبيانات الشخصية (`/users/{userId}`)**: لا يمكن لأي مستخدم قراءة أو تعديل ملف مستخدم آخر؛ القراءة والكتابة محصورة بمالك الحساب (`userId == request.auth.uid`) والمشرف المعتمد.
2. **عزلة مساحات العمل (`/workspaces/{workspaceId}`)**: كل مساحة عمل تضم مالكًا واحدًا (`ownerId`) وقائمة محكومة من الأعضاء (`memberUids.size() <= 10`). لا يمكن لأي مستخدم غير مدرج في `memberUids` الوصول إلى بيانات مساحة العمل.
3. **منع السجلات اليتيمة (Relational Sync / Master Gate)**: لا يمكن إنشاء أي مكلف أو عقار أو وحدة أو زيارة أو موعد أو تقييم أو معاملة أو سجل تدقيق إلا إذا كانت مساحة العمل `workspaceId` موجودة فعليًا في `/workspaces/{workspaceId}` والمستخدم الحالي عضو معتمد فيها.
4. **حماية التقييمات والمعاملات المالية المعتمدة (Terminal State Locking)**: بمجرد وصول التقييم المالي إلى حالة `approved` أو `cancelled`، أو وصول المعاملة المالية إلى حالة `reversed`، يُمنع تعديلها أو حذفها من قِبل المساعدين.
5. **عدم قابلية تعديل أو حذف سجل التدقيق (`/audit_logs/{logId}`) وسجل التأجيلات (`/appointment_postponements/{postponementId}`)**: هذه السجلات للإضافة فقط (Append-Only) ولا يُسمح بتعديلها أو حذفها من قِبل العميل إطلاقًا (`allow update, delete: if false`).
6. **النزاهة الزمنية (Temporal Integrity)**: جميع حقول `createdAt` و`updatedAt` يجب أن تطابق وقت الخادم `request.time`.

## 2. حمولات الاختبار الاثنتا عشرة ("Dirty Dozen" Payloads)
1. **Payload 1 (Identity Spoofing on User Profile)**: مستخدم يحاول إنشاء ملف `/users/victim_uid` بمعرف `uid: "victim_uid"` لا يطابق `request.auth.uid`. -> `PERMISSION_DENIED`
2. **Payload 2 (Unverified Email Spoof)**: مستخدم يحمل البريد `ahah26h@gmail.com` ولكن `email_verified: false` يحاول الكتابة في النظام. -> `PERMISSION_DENIED`
3. **Payload 3 (Cross-Workspace Read/Write)**: مستخدم عضو في `ws_alpha` يحاول قراءة أو إضافة عقار في `ws_beta` التي لا ينتمي إليها. -> `PERMISSION_DENIED`
4. **Payload 4 (Self-Privilege Escalation in WorkspaceMember)**: مساعد (`field_assistant`) يحاول تحديث دوره في `/workspace_members/{memberId}` إلى `owner` أو تفعيل `canApproveFinancials: true`. -> `PERMISSION_DENIED`
5. **Payload 5 (Workspace Member Cap Overflow > 10)**: مالك يحاول تحديث `memberUids` في `/workspaces/{workspaceId}` لتضم 11 عضوًا (تجاوز الحد الأقصى 10 أعضاء). -> `PERMISSION_DENIED`
6. **Payload 6 (Shadow Field Injection)**: مستخدم يرسل حمولة عقار صحيحة مع حقل إضافي غير مصرح به `isSystemVerified: true`. -> `PERMISSION_DENIED`
7. **Payload 7 (Orphaned Property Creation)**: مستخدم يحاول إنشاء عقار مرتبط بـ `workspaceId: "non_existent_ws"` أو `taxpayerId: "non_existent_tp"`. -> `PERMISSION_DENIED`
8. **Payload 8 (Tampering with Approved Financial Assessment)**: مساعد يحاول تعديل قيمة `amount` لتقييم مالي حالته الحالية `status == "approved"`. -> `PERMISSION_DENIED`
9. **Payload 9 (Deleting or Updating an Audit Log)**: مالك أو مساعد يحاول حذف أو تعديل وثيقة في `/audit_logs/{logId}`. -> `PERMISSION_DENIED`
10. **Payload 10 (Resource Poisoning / Oversized String)**: مهاجم يحاول إدخال سلسلة نصية طولها 5000 حرف في حقل `title` أو معرف وثيقة غير صالح. -> `PERMISSION_DENIED`
11. **Payload 11 (Forged Client Timestamp)**: مستخدم يحاول تمرير تاريخ ماضٍ أو مستقبلي في `createdAt` لا يساوي `request.time`. -> `PERMISSION_DENIED`
12. **Payload 12 (Blanket List Query Scraping)**: مستخدم مسجل يحاول تنفيذ استعلام `list` على `/properties` دون تقييد `memberUids` بمعرفه الشخصي. -> `PERMISSION_DENIED`
