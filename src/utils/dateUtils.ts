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

export function evaluateAppointmentStatus(
  currentStatus: string,
  scheduledDate: string,
  scheduledTime: string,
  reminderMinutesBefore: number = 15,
  now: Date = new Date()
): DynamicAppointmentState {
  if (currentStatus === 'completed') return 'completed';
  if (currentStatus === 'cancelled') return 'cancelled';

  const minutesUntil = getMinutesUntilAden(scheduledDate, scheduledTime, now);

  // If time has passed by more than 90 minutes without completion
  if (minutesUntil < -90) {
    return 'missed';
  }

  // If within the reminder window (e.g. 15 minutes before) or up to 90 minutes after scheduled time
  if (minutesUntil <= reminderMinutesBefore && minutesUntil >= -90) {
    return 'due';
  }

  if (currentStatus === 'postponed') {
    return 'postponed';
  }

  return 'upcoming';
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
    });
  } catch {
    return `${dateStr} ${timeStr || ''}`.trim();
  }
}
