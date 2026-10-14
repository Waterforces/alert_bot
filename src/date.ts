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
