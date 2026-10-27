import { describe, it, expect, vi } from 'vitest';
import nacl from 'tweetnacl';
import {
  getMonthDaysInfo,
  parseMonthInput,
  generateMonthlyCalendarGrid,
} from '../src/date';
import { getEventsByMonth, EventRecord } from '../src/db';
import * as discordModule from '../src/discord';
import { Env } from '../src/config';

describe('Calendar Utilities', () => {
  describe('getMonthDaysInfo', () => {
    it('should return correct total days and start day for October 2026', () => {
      // 2026-10-01 was Thursday (Mon=0, Tue=1, Wed=2, Thu=3, Fri=4, Sat=5, Sun=6)
      const info = getMonthDaysInfo(2026, 10);
      expect(info.totalDays).toBe(31);
      expect(info.startDayOfWeek).toBe(3); // Thursday
      expect(info.monthName).toBe('October');
    });

    it('should handle leap year correctly (Feb 2028 vs Feb 2026)', () => {
      const feb2028 = getMonthDaysInfo(2028, 2);
      expect(feb2028.totalDays).toBe(29);

      const feb2026 = getMonthDaysInfo(2026, 2);
      expect(feb2026.totalDays).toBe(28);
    });
  });

  describe('parseMonthInput', () => {
    it('should parse single number month (e.g. "11")', () => {
      const res = parseMonthInput('11', undefined, 2026);
      expect(res).toEqual({ year: 2026, month: 11 });
    });

    it('should parse "MM/YY" format (e.g. "12/26")', () => {
      const res = parseMonthInput('12/26');
      expect(res).toEqual({ year: 2026, month: 12 });
    });

    it('should parse "MM/YYYY" format (e.g. "05/2027")', () => {
      const res = parseMonthInput('05/2027');
      expect(res).toEqual({ year: 2027, month: 5 });
    });

    it('should parse separate month and year arguments (e.g. "3", "2027")', () => {
      const res = parseMonthInput('3', '2027');
      expect(res).toEqual({ year: 2027, month: 3 });
    });

    it('should return null for invalid months', () => {
      expect(parseMonthInput('13')).toBeNull();
      expect(parseMonthInput('0')).toBeNull();
      expect(parseMonthInput('abc')).toBeNull();
    });
  });

  describe('generateMonthlyCalendarGrid', () => {
    it('should render calendar grid with today highlighted and event dots', () => {
      const eventDays = new Set([1, 8, 27]);
      const today = { year: 2026, month: 10, day: 27 };

      const grid = generateMonthlyCalendarGrid(2026, 10, eventDays, today);

      // Check header
      expect(grid).toContain('OCTOBER 2026');
      expect(grid).toContain('Mon');
      expect(grid).toContain('Sun');

      // Check today's date formatted with red ANSI and brackets/parentheses
      expect(grid).toContain('(27)');
      expect(grid).toContain('\u001b[1;31m'); // Red ANSI escape

      // Check event dots exist (medium-large circle ●)
      expect(grid).toContain('●');
    });
  });

  describe('getEventsByMonth DB query', () => {
    it('should query events matching year and month pattern', async () => {
      const mockEvents: EventRecord[] = [
        {
          id: 1,
          title: 'Event 1',
          event_date: '2026-10-05',
          event_time: '10:00',
          created_by_platform: 'discord',
          created_by_user: 'User1',
          created_at: '2026-10-01',
        },
        {
          id: 2,
          title: 'Event 2',
          event_date: '2026-10-27',
          event_time: null,
          created_by_platform: 'discord',
          created_by_user: 'User1',
          created_at: '2026-10-01',
        },
      ];

      const mockPrepare = (query: string) => ({
        bind: (...params: any[]) => ({
          all: async () => {
            expect(query).toContain('WHERE event_date LIKE ?');
            expect(params[0]).toBe('2026-10-%');
            return { results: mockEvents };
          },
        }),
      });

      const mockDb = { prepare: mockPrepare } as unknown as D1Database;
      const res = await getEventsByMonth(mockDb, '2026-10');
      expect(res).toEqual(mockEvents);
    });
  });

  describe('Discord /month interaction handler', () => {
    it('should respond with calendar embed for /month command', async () => {
      const keypair = nacl.sign.keyPair();
      const publicKeyHex = Array.from(keypair.publicKey)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      const mockEnv = {
        DB: {
          prepare: vi.fn((query: string) => ({
            bind: vi.fn((...params: any[]) => ({
              all: vi.fn().mockImplementation(async () => {
                if (query.includes('event_date < ?')) {
                  return { results: [] };
                }
                return {
                  results: [
                    {
                      id: 1,
                      title: "Mom's Birthday",
                      event_date: '2026-10-27',
                      event_time: '18:00',
                      created_by_platform: 'discord',
                      created_by_user: 'User',
                      created_at: '2026-10-01',
                    },
                  ],
                };
              }),
              first: vi.fn().mockResolvedValue(null),
              run: vi.fn().mockResolvedValue({ success: true }),
            })),
          })),
        } as unknown as D1Database,
        DISCORD_PUBLIC_KEY: publicKeyHex,
      } as Env;

      const body = JSON.stringify({
        type: 2, // APPLICATION_COMMAND
        data: {
          name: 'month',
          options: [{ name: 'month', value: '10/26' }],
        },
      });

      const timestamp = '1234567890';
      const message = new TextEncoder().encode(timestamp + body);
      const signature = nacl.sign.detached(message, keypair.secretKey);
      const signatureHex = Array.from(signature)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      const req = new Request('https://test/api/discord', {
        method: 'POST',
        headers: {
          'X-Signature-Ed25519': signatureHex,
          'X-Signature-Timestamp': timestamp,
        },
        body,
      });

      const res = await discordModule.handleDiscordInteraction(req, mockEnv);
      expect(res.status).toBe(200);
      const json: any = await res.json();
      expect(json.data.embeds[0].title).toBe('🗓️ Family Calendar: October 2026');
      expect(json.data.embeds[0].description).toContain('OCTOBER 2026');
      expect(json.data.embeds[0].description).toContain("Mom's Birthday");
    });
  });
});
