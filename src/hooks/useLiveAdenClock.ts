import { useState, useEffect } from 'react';
import { getAdenDateString, getAdenTimeString, ADEN_TIMEZONE } from '../utils/dateUtils';

export interface LiveAdenClock {
  now: Date;
  todayStr: string;
  timeStr: string;
  secondsStr: string;
  formattedDateArabic: string;
  formattedTimeArabic: string;
}

/**
 * Real-time live clock synchronized to Asia/Aden timezone.
 * Ticks continuously to ensure dynamic appointment countdowns,
 * temporal filtering, and status badges never freeze or stay static.
 */
export function useLiveAdenClock(intervalMs: number = 1000): LiveAdenClock {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  const todayStr = getAdenDateString(now);
  const timeStr = getAdenTimeString(now);

  const secondsStr = new Intl.DateTimeFormat('ar-YE', {
    timeZone: ADEN_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(now);

  const formattedDateArabic = new Intl.DateTimeFormat('ar-YE', {
    timeZone: ADEN_TIMEZONE,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(now);

  const formattedTimeArabic = new Intl.DateTimeFormat('ar-YE', {
    timeZone: ADEN_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(now);

  return {
    now,
    todayStr,
    timeStr,
    secondsStr,
    formattedDateArabic,
    formattedTimeArabic,
  };
}
