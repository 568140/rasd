/**
 * RASD Date & Time Utilities — Asia/Aden Timezone Enforced
 * Timezone: Asia/Aden (UTC+3, AST - Arabia Standard Time)
 */

export const ADEN_TIMEZONE = 'Asia/Aden';

/**
 * Formats a Date object or timestamp into Asia/Aden ISO-like date string: YYYY-MM-DD
 */
export function getAdenDateString(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: ADEN_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date); // en-CA yields YYYY-MM-DD
}

export const getAdenTodayString = getAdenDateString;

/**
 * Formats a Date object into Asia/Aden time string: HH:mm (24-hour)
 */
export function getAdenTimeString(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: ADEN_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return formatter.format(date); // en-GB yields HH:mm
}

/**
 * Formats a 24-hour time string (e.g. "14:30", "09:05") or a Date object into a 12-hour Arabic display format (e.g. "02:30 م", "09:05 ص").
 */
export function formatTimeTo12Hour(timeStrOrDate?: string | Date | null): string {
  if (!timeStrOrDate) return '';
  try {
    if (timeStrOrDate instanceof Date) {
      if (isNaN(timeStrOrDate.getTime())) return '';
      const hours = timeStrOrDate.getHours();
      const minutes = timeStrOrDate.getMinutes();
      const period = hours >= 12 ? 'م' : 'ص';
      const h12 = hours % 12 === 0 ? 12 : hours % 12;
      return `${String(h12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${period}`;
    }

    const trimmed = String(timeStrOrDate).trim();
    if (!trimmed) return '';

    // If it's already formatted with Arabic or English 12-hour markers
    if (trimmed.includes('ص') || trimmed.includes('م') || /am|pm/i.test(trimmed)) {
      return trimmed;
    }

    const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (!match) return trimmed;

    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      return trimmed;
    }

    const period = hours >= 12 ? 'م' : 'ص';
    const h12 = hours % 12 === 0 ? 12 : hours % 12;
    return `${String(h12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${period}`;
  } catch {
    return String(timeStrOrDate);
  }
}

/**
 * Converts a scheduled date string (YYYY-MM-DD) and time string (HH:mm) into
 * an absolute UTC Epoch timestamp (milliseconds), correctly interpreting the date/time as Asia/Aden (+03:00).
 */
export function parseAdenDateTimeToTimestamp(dateStr: string, timeStr: string): number {
  if (!dateStr) return 0;
  const cleanDate = dateStr.trim().slice(0, 10);
  const cleanTime = (timeStr || '10:00').trim().slice(0, 5);
  
  // Format as ISO with +03:00 offset for Asia/Aden
  const isoString = `${cleanDate}T${cleanTime}:00+03:00`;
  const parsed = Date.parse(isoString);
  if (isNaN(parsed)) {
    // Fallback: create date in UTC assuming +3
    const [y, m, d] = cleanDate.split('-').map(Number);
    const [h, min] = cleanTime.split(':').map(Number);
    return Date.UTC(y, (m || 1) - 1, d || 1, (h || 0) - 3, min || 0, 0);
  }
  return parsed;
}

/**
 * Computes difference in minutes between current time in Asia/Aden and target appointment time.
 * Positive = appointment is in the future (X minutes remaining).
 * Negative = appointment time has already passed (X minutes overdue).
 */
export function getMinutesUntilAden(dateStr: string, timeStr: string, now: Date = new Date()): number {
  const targetTs = parseAdenDateTimeToTimestamp(dateStr, timeStr);
  const nowTs = now.getTime();
  return Math.round((targetTs - nowTs) / (60 * 1000));
}

/**
 * Evaluates the dynamic appointment lifecycle state based on current Asia/Aden time.
 * - 'completed' and 'cancelled' are immutable final states that require deliberate action.
 * - If postponed, status is 'postponed' until the new scheduled time is approached.
 * - 'due': within reminder threshold or up to 60 minutes after scheduled time.
 * - 'missed': more than 60 minutes past scheduled time and not marked completed.
 * - 'upcoming': future appointment beyond due window.
 */
export type DynamicAppointmentState = 'upcoming' | 'due' | 'completed' | 'postponed' | 'cancelled' | 'missed';

export const MIN_REMINDER_MINUTES = 1;
export const MAX_REMINDER_MINUTES = 1440; // 24 hours (يوم كامل)
export const DEFAULT_REMINDER_MINUTES = 30;

/**
 * Sanitizes any value into a valid positive integer reminder lead-time in minutes [1..1440].
 */
export function sanitizeReminderMinutes(
  value: unknown,
  fallback: number = DEFAULT_REMINDER_MINUTES
): number {
  const num = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.trim()) : NaN;
  if (!Number.isFinite(num)) return fallback;
  const rounded = Math.round(num);
  if (rounded < MIN_REMINDER_MINUTES || rounded > MAX_REMINDER_MINUTES) {
    return fallback;
  }
  return rounded;
}

/**
 * Validates raw user input for "التنبيه قبل الموعد بـ ... دقيقة"
 * Prohibits negative, zero, non-integer, or out-of-bounds values.
 */
export function validateReminderMinutesInput(rawInput: string | number): {
  isValid: boolean;
  minutes: number;
  error?: string;
} {
  const str = String(rawInput ?? '').trim();
  if (!str) {
    return {
      isValid: false,
      minutes: DEFAULT_REMINDER_MINUTES,
      error: 'يرجى إدخال عدد الدقائق (بين 1 و 1440 دقيقة).',
    };
  }
  const num = Number(str);
  if (!Number.isFinite(num) || isNaN(num)) {
    return {
      isValid: false,
      minutes: DEFAULT_REMINDER_MINUTES,
      error: 'يرجى إدخال رقم صحيح صالح.',
    };
  }
  if (!Number.isInteger(num)) {
    return {
      isValid: false,
      minutes: Math.max(MIN_REMINDER_MINUTES, Math.min(MAX_REMINDER_MINUTES, Math.round(num))),
      error: 'يرجى إدخال عدد دقائق صحيح بدون كسور عشرية.',
    };
  }
  if (num <= 0) {
    return {
      isValid: false,
      minutes: MIN_REMINDER_MINUTES,
      error: 'يجب أن يكون وقت التنبيه عددًا موجبًا أكبر من صفر (1 دقيقة على الأقل).',
    };
  }
  if (num > MAX_REMINDER_MINUTES) {
    return {
      isValid: false,
      minutes: MAX_REMINDER_MINUTES,
      error: `الحد الأقصى المسموح به للتنبيه المسبق هو ${MAX_REMINDER_MINUTES} دقيقة (24 ساعة).`,
    };
  }
  return {
    isValid: true,
    minutes: num,
  };
}

export function evaluateAppointmentStatus(
  currentStatus: string,
  scheduledDate: string,
  scheduledTime: string,
  reminderMinutesBefore: number = DEFAULT_REMINDER_MINUTES,
  now: Date = new Date()
): DynamicAppointmentState {
  if (currentStatus === 'completed') return 'completed';
  if (currentStatus === 'cancelled') return 'cancelled';

  const minutesUntil = getMinutesUntilAden(scheduledDate, scheduledTime, now);

  // If time has passed by more than 90 minutes without completion
  if (minutesUntil < -90) {
    return 'missed';
  }

  // If reminder is explicitly disabled (0 minutes or negative)
  if (reminderMinutesBefore <= 0) {
    // Only marked due once the actual scheduled appointment time arrives and up to 90 mins after
    if (minutesUntil <= 0 && minutesUntil >= -90) {
      return 'due';
    }
    return currentStatus === 'postponed' ? 'postponed' : 'upcoming';
  }

  const safeReminderMins = sanitizeReminderMinutes(reminderMinutesBefore, DEFAULT_REMINDER_MINUTES);

  // If within the user's configured reminder window (e.g. 5 or 75 minutes before) or up to 90 minutes after scheduled time
  if (minutesUntil <= safeReminderMins && minutesUntil >= -90) {
    return 'due';
  }

  if (currentStatus === 'postponed') {
    return 'postponed';
  }

  return 'upcoming';
}

/**
 * Calculates the exact target alert time in Asia/Aden timezone.
 * Returns formatted 24h string, 12h Arabic string, date, and flag whether it triggers on same day.
 */
export function calculateAlertTimeAden(
  scheduledDate: string,
  scheduledTime: string,
  reminderMinutes: number
): {
  alertTimeStr: string;
  alertDateStr: string;
  alertFormattedArabic: string;
  isSameDay: boolean;
} | null {
  if (!scheduledDate || !scheduledTime || reminderMinutes <= 0) return null;
  const targetTs = parseAdenDateTimeToTimestamp(scheduledDate, scheduledTime);
  if (!targetTs) return null;
  const alertTs = targetTs - reminderMinutes * 60 * 1000;
  const alertDate = new Date(alertTs);
  const alertDateStr = getAdenDateString(alertDate);
  const alertTimeStr = getAdenTimeString(alertDate);

  const formattedArabic = new Intl.DateTimeFormat('ar-YE', {
    timeZone: ADEN_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(alertDate);

  return {
    alertTimeStr,
    alertDateStr,
    alertFormattedArabic: formattedArabic,
    isSameDay: alertDateStr === scheduledDate,
  };
}

export interface AppointmentNotificationInput {
  id: string;
  title: string;
  taxpayerName?: string;
  propertyTitle?: string;
  scheduledDate?: string;
  scheduledTime: string;
  locationText?: string;
  taxpayerId?: string;
  propertyId?: string;
}

export interface FormattedAppointmentNotification {
  title: string;
  body: string;
  isOverdue: boolean;
  urgency: 'upcoming' | 'due_now' | 'overdue';
  minutesRemaining: number;
  tag: string;
  renotify: boolean;
  url: string;
  data: {
    url: string;
    appointmentId: string;
    taxpayerId?: string;
    propertyId?: string;
    scheduledDate?: string;
    scheduledTime: string;
    isOverdue: boolean;
    urgency: 'upcoming' | 'due_now' | 'overdue';
  };
}

/**
 * Builds an official, administrative Arabic notification payload for Web Push, Service Worker, and In-App Alerts.
 * Distinguishes clearly between upcoming appointments, appointments due right now, and overdue appointments.
 */
export function buildAppointmentNotificationPayload(
  appt: AppointmentNotificationInput,
  explicitMinutesRemaining?: number,
  now: Date = new Date()
): FormattedAppointmentNotification {
  const dateStr = (appt.scheduledDate || getAdenDateString(now)).trim();
  const timeStr = (appt.scheduledTime || '10:00').trim();
  const minutesRemaining =
    typeof explicitMinutesRemaining === 'number' && Number.isFinite(explicitMinutesRemaining)
      ? Math.round(explicitMinutesRemaining)
      : getMinutesUntilAden(dateStr, timeStr, now);

  const clientName = (appt.taxpayerName || '').trim() || 'المكلف المعني';
  const transactionType = (appt.title || '').trim() || 'متابعة التزام ميداني';
  const propertyLabel = (appt.propertyTitle || '').trim();
  const hasProperty = Boolean(
    propertyLabel &&
      propertyLabel !== 'عقار' &&
      propertyLabel !== 'عقار عام' &&
      propertyLabel !== 'العقار الميداني'
  );

  const scheduleDetails = [
    hasProperty ? `العقار: ${propertyLabel}` : '',
    dateStr ? `التاريخ: ${dateStr}` : '',
    timeStr ? `الساعة: ${formatTimeTo12Hour(timeStr)}` : '',
  ]
    .filter(Boolean)
    .join(' — ');

  const isOverdue = minutesRemaining < 0;
  const urgency: 'upcoming' | 'due_now' | 'overdue' =
    minutesRemaining < 0 ? 'overdue' : minutesRemaining === 0 ? 'due_now' : 'upcoming';

  let title = 'اقترب موعد الالتزام — رَصْد';
  let body = '';

  if (minutesRemaining > 0) {
    title = minutesRemaining <= 10 ? 'تنبيه موعد مستحق قريبًا — رَصْد' : 'اقترب موعد الالتزام — رَصْد';
    body = `تبقّى ${minutesRemaining} دقيقة على موعد ${clientName} بشأن «${transactionType}»${
      scheduleDetails ? ` (${scheduleDetails})` : ''
    }. يرجى الاستعداد لاتخاذ الإجراء اللازم.`;
  } else if (minutesRemaining === 0) {
    title = 'تنبيه موعد مستحق الآن — رَصْد';
    body = `حان الآن موعد ${clientName} بشأن «${transactionType}»${
      scheduleDetails ? ` (${scheduleDetails})` : ''
    }. يرجى مباشرة الإجراء اللازم.`;
  } else {
    const overdueMins = Math.abs(minutesRemaining);
    title = 'تأخر موعد الالتزام — يتطلب إجراءً';
    body = `تأخر موعد ${clientName} بشأن «${transactionType}» بمقدار ${overdueMins} دقيقة${
      scheduleDetails ? ` (كان مقررًا: ${scheduleDetails})` : ''
    }. يرجى المتابعة الفورية أو إعادة الجدولة.`;
  }

  const params = new URLSearchParams();
  params.set('screen', 'appointments');
  if (appt.id) params.set('appointmentId', appt.id);
  if (appt.taxpayerId) params.set('taxpayerId', appt.taxpayerId);
  if (appt.propertyId) params.set('propertyId', appt.propertyId);
  const url = `/?${params.toString()}`;

  // Distinct tag per appointment + stage (upcoming vs overdue) so browser updates neatly without spam
  const stageKey = isOverdue ? 'overdue' : 'upcoming';
  const tag = `rasd-appt-${appt.id || 'general'}-${stageKey}`;

  return {
    title,
    body,
    isOverdue,
    urgency,
    minutesRemaining,
    tag,
    renotify: isOverdue,
    url,
    data: {
      url,
      appointmentId: appt.id,
      taxpayerId: appt.taxpayerId,
      propertyId: appt.propertyId,
      scheduledDate: dateStr,
      scheduledTime: timeStr,
      isOverdue,
      urgency,
    },
  };
}

/**
 * Localized Arabic date/time display in Asia/Aden timezone
 */
export function formatAdenDateTimeDisplay(dateStr: string, timeStr?: string): string {
  try {
    const ts = parseAdenDateTimeToTimestamp(dateStr, timeStr || '10:00');
    const d = new Date(ts);
    return d.toLocaleString('ar-YE', {
      timeZone: ADEN_TIMEZONE,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: timeStr ? '2-digit' : undefined,
      minute: timeStr ? '2-digit' : undefined,
      hour12: true,
    });
  } catch {
    return `${dateStr} ${timeStr ? formatTimeTo12Hour(timeStr) : ''}`.trim();
  }
}
