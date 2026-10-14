import { describe, it, expect } from 'vitest';
import {
  parseInputDate,
  parseInputTime,
  calculateDaysRemaining,
  formatDateDisplay,
  getBangkokTodayString,
  getBangkokTimeString
} from '../src/date';

describe('Date Utilities', () => {
  describe('parseInputDate', () => {
    it('should parse 2-digit year (AD: DD/MM/YY)', () => {
      expect(parseInputDate('25/12/26')).toBe('2026-12-25');
      expect(parseInputDate('01/01/27')).toBe('2027-01-01');
      expect(parseInputDate('5/9/26')).toBe('2026-09-05');
    });

    it('should parse 4-digit year (AD: DD/MM/YYYY)', () => {
      expect(parseInputDate('25/12/2026')).toBe('2026-12-25');
      expect(parseInputDate('1/4/2027')).toBe('2027-04-01');
    });

    it('should parse dates with hyphens', () => {
      expect(parseInputDate('25-12-26')).toBe('2026-12-25');
      expect(parseInputDate('25-12-2026')).toBe('2026-12-25');
    });

    it('should reject invalid dates', () => {
      expect(parseInputDate('31/02/26')).toBeNull(); // Feb 31 does not exist
      expect(parseInputDate('29/02/2025')).toBeNull(); // 2025 is not a leap year
      expect(parseInputDate('32/01/26')).toBeNull();
      expect(parseInputDate('15/13/26')).toBeNull();
      expect(parseInputDate('invalid-date')).toBeNull();
      expect(parseInputDate('')).toBeNull();
    });

    it('should handle leap year correctly', () => {
      expect(parseInputDate('29/02/2028')).toBe('2028-02-29'); // 2028 is leap year
      expect(parseInputDate('29/02/28')).toBe('2028-02-29');
    });
  });

  describe('parseInputTime', () => {
    it('should parse valid 24-hr times', () => {
      expect(parseInputTime('18:00')).toBe('18:00');
      expect(parseInputTime('9:30')).toBe('09:30');
      expect(parseInputTime('00:01')).toBe('00:01');
      expect(parseInputTime('23:59')).toBe('23:59');
    });

    it('should reject invalid times', () => {
      expect(parseInputTime('24:00')).toBeNull();
      expect(parseInputTime('12:60')).toBeNull();
      expect(parseInputTime('abc')).toBeNull();
      expect(parseInputTime(undefined)).toBeNull();
    });
  });

  describe('calculateDaysRemaining', () => {
    it('should calculate remaining days correctly', () => {
      expect(calculateDaysRemaining('2026-10-15', '2026-10-13')).toBe(2);
      expect(calculateDaysRemaining('2026-10-13', '2026-10-13')).toBe(0); // Today
      expect(calculateDaysRemaining('2026-10-27', '2026-10-13')).toBe(14); // 14 days
      expect(calculateDaysRemaining('2026-10-20', '2026-10-13')).toBe(7);  // 7 days
      expect(calculateDaysRemaining('2026-10-16', '2026-10-13')).toBe(3);  // 3 days
      expect(calculateDaysRemaining('2026-10-14', '2026-10-13')).toBe(1);  // 1 day
    });
  });

  describe('formatDateDisplay', () => {
    it('should format ISO YYYY-MM-DD to DD/MM/YYYY', () => {
      expect(formatDateDisplay('2026-12-25')).toBe('25/12/2026');
    });
  });

  describe('Bangkok Timezone', () => {
    it('should generate valid date string', () => {
      const today = getBangkokTodayString();
      expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should generate valid time string', () => {
      const time = getBangkokTimeString();
      expect(time).toMatch(/^\d{2}:\d{2}$/);
    });
  });
});
