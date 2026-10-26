import assert from 'node:assert/strict';
import {
  logPermissionDeniedSecurityEvent,
  subscribeToAccessDeniedEvents,
  PermissionDeniedSecurityEvent,
} from '../src/services/firebase';
import { PlatformAdminOperation } from '../src/types/rasd';

console.log('=== بدء اختبار ميزة توثيق محاولات الوصول المرفوضة في سجل التدقيق الأمني ===\n');

// 1. التحقق من دعم نوع العملية الإدارية permission_denied_attempt
const testOp: PlatformAdminOperation = 'permission_denied_attempt';
assert.equal(testOp, 'permission_denied_attempt', 'يجب أن يكون نوع العملية متاحًا في PlatformAdminOperation');
console.log('✅ 1. نوع العملية permission_denied_attempt متاح ومتوافق في أنواع النظام.');

// 2. التحقق من عمل المستمع subscribeToAccessDeniedEvents
let receivedEvent: PermissionDeniedSecurityEvent | null = null;
const unsubscribe = subscribeToAccessDeniedEvents((ev) => {
  receivedEvent = ev;
});

// 3. تجربة تسجيل حدث رفض وصول (permission-denied)
const loggedEvent = logPermissionDeniedSecurityEvent({
  path: 'account_licenses/ws_test_restricted',
  operationType: 'list',
  error: new Error('FirebaseError: Missing or insufficient permissions.'),
});

assert.ok(loggedEvent, 'يجب إنشاء كائن الحدث بنجاح');
assert.ok(loggedEvent.id.startsWith('sec_denied'), 'يجب أن يحمل السجل بادئة تعريفية خاصة sec_denied');
assert.equal(loggedEvent.path, 'account_licenses/ws_test_restricted');
assert.equal(loggedEvent.operationType, 'list');
assert.ok(loggedEvent.summary.includes('محاولة وصول مرفوضة'), 'يجب أن يوضح الملخص أنها محاولة وصول مرفوضة');
assert.ok(loggedEvent.summary.includes('account_licenses/ws_test_restricted'));

console.log('✅ 2. تم تسجيل الحدث الأمني وتوليد ملخص واضح دون أي بيانات حساسة:');
console.log(`    ${loggedEvent.summary}`);

// 4. التحقق من وصول الحدث إلى المستمع
assert.ok(receivedEvent !== null, 'يجب أن يتلقى المستمع المسجل إشعارًا بالحدث فور وقوعه');
const nonNullEvent = receivedEvent as PermissionDeniedSecurityEvent;
assert.equal(nonNullEvent.id, loggedEvent.id);
console.log('✅ 3. نجح المستمع subscribeToAccessDeniedEvents في التقاط الحدث في الوقت الفعلي.');

// 5. التحقق الصارم من خلو الحدث من أي أسرار أو رموز دخول (Sensitive Data Absence)
const serialized = JSON.stringify(loggedEvent);
assert.ok(!serialized.includes('password'), 'يجب ألا يحتوي السجل على كلمة مرور');
assert.ok(!serialized.includes('secret'), 'يجب ألا يحتوي السجل على أي سر برمجي');
assert.ok(!serialized.includes('accessToken'), 'يجب ألا يحتوي السجل على رمز وصول');
assert.ok(!serialized.includes('refreshToken'), 'يجب ألا يحتوي السجل على رمز تحديث');
assert.ok(!serialized.includes('apiKey'), 'يجب ألا يحتوي السجل على مفتاح API');
console.log('✅ 4. تأكيد أمني قطعي: السجل خالي 100% من أي رموز أو كلمات مرور أو بيانات حساسة.');

unsubscribe();
console.log('\n🎉 اكتمل اختبار ميزة توثيق محاولات الوصول المرفوضة بنجاح تام 100%!\n');
