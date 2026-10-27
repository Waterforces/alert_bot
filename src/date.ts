/**
 * Date and Time utilities strictly aligned with Asia/Bangkok (UTC+7)
 * and Gregorian (AD) calendar formats (DD/MM/YY and DD/MM/YYYY).
 */

import { BANGKOK_OFFSET_HOURS } from './config';

/**
 * Parses user-provided date strings like "25/12/26" or "25/12/2026" (or with hyphens).
 * Returns ISO "YYYY-MM-DD" on success, or null on invalid date.
 */
export function parseInputDate(input: string): string | null {
  if (!input) return null;
  const cleaned = input.trim();
  const match = cleaned.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (!match) return null;

  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  let year = parseInt(match[3], 10);

  // Normalize 2-digit year (AD: 26 -> 2026)
  if (year < 100) {
    year = 2000 + year;
  }

  // Basic sanity check
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 2000 || year > 2100) {
    return null;
  }

  // Validate actual calendar days (handles leap years and month lengths)
  const dateObj = new Date(Date.UTC(year, month - 1, day));
  if (
    dateObj.getUTCFullYear() !== year ||
    dateObj.getUTCMonth() !== month - 1 ||
    dateObj.getUTCDate() !== day
  ) {
    return null; // e.g. Feb 30 or Nov 31
  }

  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

/**
 * Parses 24-hr time input like "18:00" or "9:30" -> returns normalized "HH:mm" or null.
 */
export function parseInputTime(input?: string): string | null {
  if (!input) return null;
  const cleaned = input.trim();
  const match = cleaned.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Returns current Date adjusted to Bangkok timezone (UTC+7).
 */
export function getBangkokNow(date = new Date()): Date {
  const utcMillis = date.getTime() + date.getTimezoneOffset() * 60000;
  return new Date(utcMillis + BANGKOK_OFFSET_HOURS * 3600000);
}

/**
 * Returns "YYYY-MM-DD" for current day in Bangkok.
 */
export function getBangkokTodayString(date = new Date()): string {
  const bkk = getBangkokNow(date);
  const yyyy = bkk.getFullYear();
  const mm = String(bkk.getMonth() + 1).padStart(2, '0');
  const dd = String(bkk.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Returns "HH:mm" for current time in Bangkok.
 */
export function getBangkokTimeString(date = new Date()): string {
  const bkk = getBangkokNow(date);
  const hh = String(bkk.getHours()).padStart(2, '0');
  const mm = String(bkk.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * Calculates remaining days from baseDate to targetDate.
 * e.g., target="2026-10-15", base="2026-10-13" -> returns 2
 */
export function calculateDaysRemaining(targetDateStr: string, baseDateStr = getBangkokTodayString()): number {
  const [tY, tM, tD] = targetDateStr.split('-').map(Number);
  const [bY, bM, bD] = baseDateStr.split('-').map(Number);

  const targetUtc = Date.UTC(tY, tM - 1, tD);
  const baseUtc = Date.UTC(bY, bM - 1, bD);

  const diffMs = targetUtc - baseUtc;
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Formats "YYYY-MM-DD" to human-readable "DD/MM/YYYY".
 */
export function formatDateDisplay(isoDate: string): string {
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * Returns metadata about a month: total days, starting day of week (0=Monday, 6=Sunday), and month name.
 * month is 1-indexed (1 = January, 12 = December).
 */
export function getMonthDaysInfo(year: number, month: number): {
  totalDays: number;
  startDayOfWeek: number;
  monthName: string;
} {
  // Day 0 of next month is the last day of the current month
  const totalDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
  // 0 = Sunday, 1 = Monday ... 6 = Saturday in JS
  // We convert to ISO Monday-first: Monday = 0, Tuesday = 1 ... Sunday = 6
  const jsDay = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const startDayOfWeek = (jsDay + 6) % 7;
  const monthName = MONTH_NAMES[month - 1] || '';

  return { totalDays, startDayOfWeek, monthName };
}

/**
 * Parses user input for month and year, defaulting to current month/year in Bangkok timezone if not provided.
 */
export function parseMonthInput(
  monthStr?: string,
  yearStr?: string,
  defaultYear?: number
): { year: number; month: number } | null {
  const now = getBangkokNow();
  let year = defaultYear || now.getFullYear();
  let month = now.getMonth() + 1;

  if (monthStr !== undefined && monthStr.trim() !== '') {
    const cleaned = monthStr.trim();
    if (cleaned.includes('/') || cleaned.includes('-')) {
      const parts = cleaned.split(/[\/\-]/);
      const parsedMonth = parseInt(parts[0], 10);
      let parsedYear = parseInt(parts[1], 10);
      if (isNaN(parsedMonth) || isNaN(parsedYear)) return null;
      if (parsedYear < 100) parsedYear += 2000;
      month = parsedMonth;
      year = parsedYear;
    } else {
      const parsedMonth = parseInt(cleaned, 10);
      if (isNaN(parsedMonth)) return null;
      month = parsedMonth;
      if (yearStr !== undefined && yearStr.trim() !== '') {
        let parsedYear = parseInt(yearStr.trim(), 10);
        if (isNaN(parsedYear)) return null;
        if (parsedYear < 100) parsedYear += 2000;
        year = parsedYear;
      }
    }
  } else if (yearStr !== undefined && yearStr.trim() !== '') {
    let parsedYear = parseInt(yearStr.trim(), 10);
    if (isNaN(parsedYear)) return null;
    if (parsedYear < 100) parsedYear += 2000;
    year = parsedYear;
  }

  if (month < 1 || month > 12 || year < 2000 || year > 2100) {
    return null;
  }

  return { year, month };
}

/**
 * Generates an ANSI-formatted calendar grid string for Discord.
 */
export function generateMonthlyCalendarGrid(
  year: number,
  month: number,
  eventDays: Set<number>,
  todayDate?: { year: number; month: number; day: number } | null
): string {
  const { totalDays, startDayOfWeek, monthName } = getMonthDaysInfo(year, month);

  const headerTitle = `${monthName.toUpperCase()} ${year}`;
  const totalWidth = 35; // 7 columns * 5 width
  const padLeft = Math.max(0, Math.floor((totalWidth - headerTitle.length) / 2));
  const padRight = Math.max(0, totalWidth - headerTitle.length - padLeft);
  const centeredHeader = ' '.repeat(padLeft) + headerTitle + ' '.repeat(padRight);

  const lines: string[] = [];
  lines.push(`\u001b[1;37m${centeredHeader}\u001b[0m`);
  lines.push(`\u001b[1;34m Mon   Tue   Wed   Thu   Fri   Sat   Sun \u001b[0m`);

  // Build grid of day slots (Monday=0 ... Sunday=6)
  let currentDay = 1;
  while (currentDay <= totalDays) {
    const weekSlots: (number | null)[] = [];
    for (let col = 0; col < 7; col++) {
      if (lines.length === 2 && col < startDayOfWeek) {
        weekSlots.push(null);
      } else if (currentDay <= totalDays) {
        weekSlots.push(currentDay);
        currentDay++;
      } else {
        weekSlots.push(null);
      }
    }

    // Row 1: Day numbers
    let dateRow = '';
    let hasEventsInWeek = false;
    for (const slot of weekSlots) {
      if (slot === null) {
        dateRow += '     ';
      } else {
        const isToday =
          todayDate &&
          todayDate.year === year &&
          todayDate.month === month &&
          todayDate.day === slot;

        if (isToday) {
          const dayStr = `(${slot})`;
          const paddedToday = dayStr.length === 3 ? ' ' + dayStr + ' ' : dayStr + ' ';
          dateRow += `\u001b[1;31m${paddedToday}\u001b[0m`;
        } else {
          const dayStr = String(slot);
          const padded = dayStr.length === 1 ? '  ' + dayStr + '  ' : ' ' + dayStr + '  ';
          dateRow += padded;
        }

        if (eventDays.has(slot)) {
          hasEventsInWeek = true;
        }
      }
    }
    lines.push(dateRow);

    // Row 2: Event dots underneath dates with events
    let dotRow = '';
    for (const slot of weekSlots) {
      if (slot !== null && eventDays.has(slot)) {
        dotRow += '\u001b[1;36m  •  \u001b[0m';
      } else {
        dotRow += '     ';
      }
    }
    lines.push(dotRow);
  }

  return '```ansi\n' + lines.join('\n') + '\n```';
}

