import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runDailyCountdownRoutine, runEventTimeDoubleAnnouncementRoutine } from '../src/scheduler';
import { deleteEvent, EventRecord } from '../src/db';
import * as dbModule from '../src/db';
import * as discordModule from '../src/discord';
import * as dateModule from '../src/date';
import { Env } from '../src/config';

describe('Scheduler Auto-Deletion Logic', () => {
  let mockEnv: Env;
  let eventsInDb: EventRecord[];
  let deletedEventIds: number[];
  let alertSentLogs: any[];

  beforeEach(() => {
    vi.restoreAllMocks();
    eventsInDb = [];
    deletedEventIds = [];
    alertSentLogs = [];

    // Mock DB
    mockEnv = {
      DB: {
        prepare: vi.fn(),
      } as unknown as D1Database,
      DISCORD_WEBHOOK_URL: 'https://discord.test/webhook',
    } as Env;

    vi.spyOn(discordModule, 'sendDiscordAlert').mockResolvedValue();
    vi.spyOn(dateModule, 'getBangkokTodayString').mockReturnValue('2026-10-14');
    vi.spyOn(dateModule, 'getBangkokTimeString').mockReturnValue('18:00');
  });

  describe('runDailyCountdownRoutine', () => {
    beforeEach(() => {
      vi.spyOn(dbModule, 'purgePastEvents').mockResolvedValue(0);
    });

    it('should NOT delete event on Day 14 milestone', async () => {
      const event: EventRecord = {
        id: 1,
        title: 'Future Vacation',
        event_date: '2026-10-28', // 14 days from 2026-10-14
        event_time: null,
        created_by_platform: 'discord',
        created_by_user: 'User1',
        created_at: '2026-10-01',
      };

      vi.spyOn(dbModule, 'getUpcomingEvents').mockResolvedValue([event]);
      vi.spyOn(dbModule, 'hasAlertBeenSent').mockResolvedValue(false);
      const recordSpy = vi.spyOn(dbModule, 'recordAlertSent').mockResolvedValue();
      const deleteSpy = vi.spyOn(dbModule, 'deleteEvent').mockResolvedValue({ deleted: true, event });

      await runDailyCountdownRoutine(mockEnv);

      expect(recordSpy).toHaveBeenCalledWith(mockEnv.DB, 1, 'countdown', 14, 'discord');
      expect(deleteSpy).not.toHaveBeenCalled();
    });

    it('should fire countdown alert and NOT delete event on Day 2 milestone', async () => {
      const event: EventRecord = {
        id: 20,
        title: 'Project Presentation',
        event_date: '2026-10-16', // 2 days from 2026-10-14
        event_time: '14:00',
        created_by_platform: 'discord',
        created_by_user: 'User1',
        created_at: '2026-10-01',
      };

      vi.spyOn(dbModule, 'getUpcomingEvents').mockResolvedValue([event]);
      vi.spyOn(dbModule, 'hasAlertBeenSent').mockResolvedValue(false);
      const recordSpy = vi.spyOn(dbModule, 'recordAlertSent').mockResolvedValue();
      const deleteSpy = vi.spyOn(dbModule, 'deleteEvent').mockResolvedValue({ deleted: true, event });

      await runDailyCountdownRoutine(mockEnv);

      expect(recordSpy).toHaveBeenCalledWith(mockEnv.DB, 20, 'countdown', 2, 'discord');
      expect(deleteSpy).not.toHaveBeenCalled();
    });

    it('should NOT delete event on Day 1 milestone', async () => {
      const event: EventRecord = {
        id: 2,
        title: 'Tomorrow Meeting',
        event_date: '2026-10-15', // 1 day from 2026-10-14
        event_time: '10:00',
        created_by_platform: 'discord',
        created_by_user: 'User1',
        created_at: '2026-10-01',
      };

      vi.spyOn(dbModule, 'getUpcomingEvents').mockResolvedValue([event]);
      vi.spyOn(dbModule, 'hasAlertBeenSent').mockResolvedValue(false);
      vi.spyOn(dbModule, 'recordAlertSent').mockResolvedValue();
      const deleteSpy = vi.spyOn(dbModule, 'deleteEvent').mockResolvedValue({ deleted: true, event });

      await runDailyCountdownRoutine(mockEnv);

      expect(deleteSpy).not.toHaveBeenCalled();
    });

    it('should NOT delete event on Day 0 milestone if event has a scheduled time', async () => {
      const event: EventRecord = {
        id: 3,
        title: 'Dinner Tonight',
        event_date: '2026-10-14', // Day 0
        event_time: '19:00',      // Has time, so time alert will happen later
        created_by_platform: 'discord',
        created_by_user: 'User1',
        created_at: '2026-10-01',
      };

      vi.spyOn(dbModule, 'getUpcomingEvents').mockResolvedValue([event]);
      vi.spyOn(dbModule, 'hasAlertBeenSent').mockResolvedValue(false);
      vi.spyOn(dbModule, 'recordAlertSent').mockResolvedValue();
      const deleteSpy = vi.spyOn(dbModule, 'deleteEvent').mockResolvedValue({ deleted: true, event });

      await runDailyCountdownRoutine(mockEnv);

      expect(deleteSpy).not.toHaveBeenCalled();
    });

    it('SHOULD auto-delete all-day event on Day 0 after countdown alert is sent', async () => {
      const event: EventRecord = {
        id: 4,
        title: "All-day Birthday",
        event_date: '2026-10-14', // Day 0
        event_time: null,        // All-day event (no time)
        created_by_platform: 'discord',
        created_by_user: 'User1',
        created_at: '2026-10-01',
      };

      vi.spyOn(dbModule, 'getUpcomingEvents').mockResolvedValue([event]);
      vi.spyOn(dbModule, 'hasAlertBeenSent').mockResolvedValue(false);
      const recordSpy = vi.spyOn(dbModule, 'recordAlertSent').mockResolvedValue();
      const deleteSpy = vi.spyOn(dbModule, 'deleteEvent').mockResolvedValue({ deleted: true, event });

      await runDailyCountdownRoutine(mockEnv);

      expect(recordSpy).toHaveBeenCalledWith(mockEnv.DB, 4, 'countdown', 0, 'discord');
      expect(deleteSpy).toHaveBeenCalledWith(mockEnv.DB, 4);
    });
  });

  describe('runEventTimeDoubleAnnouncementRoutine', () => {
    it('SHOULD alert and auto-delete event when its scheduled time has arrived', async () => {
      const event: EventRecord = {
        id: 5,
        title: 'Doctor Appointment',
        event_date: '2026-10-14',
        event_time: '18:00',
        created_by_platform: 'discord',
        created_by_user: 'User1',
        created_at: '2026-10-01',
      };

      const mockPrepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          all: vi.fn().mockResolvedValue({ results: [event] }),
        }),
      });
      mockEnv.DB.prepare = mockPrepare;

      vi.spyOn(dbModule, 'hasAlertBeenSent').mockResolvedValue(false);
      const recordSpy = vi.spyOn(dbModule, 'recordAlertSent').mockResolvedValue();
      const deleteSpy = vi.spyOn(dbModule, 'deleteEvent').mockResolvedValue({ deleted: true, event });

      await runEventTimeDoubleAnnouncementRoutine(mockEnv);

      expect(recordSpy).toHaveBeenCalledWith(mockEnv.DB, 5, 'event_time', null, 'discord');
      expect(deleteSpy).toHaveBeenCalledWith(mockEnv.DB, 5);
    });
  });

  describe('deleteEvent DB helper', () => {
    it('should delete from alert_logs and events when event exists', async () => {
      const mockEvent: EventRecord = {
        id: 10,
        title: 'Clean Up Test',
        event_date: '2026-10-14',
        event_time: '12:00',
        created_by_platform: 'discord',
        created_by_user: 'User',
        created_at: '2026-10-01',
      };

      const queries: string[] = [];
      const mockPrepare = vi.fn((query: string) => {
        queries.push(query);
        return {
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(mockEvent),
            run: vi.fn().mockResolvedValue({ success: true }),
          }),
        };
      });

      const mockDb = { prepare: mockPrepare } as unknown as D1Database;
      const res = await deleteEvent(mockDb, 10);

      expect(res.deleted).toBe(true);
      expect(res.event).toEqual(mockEvent);
      expect(queries).toContain('SELECT * FROM events WHERE id = ?');
      expect(queries).toContain('DELETE FROM alert_logs WHERE event_id = ?');
      expect(queries).toContain('DELETE FROM events WHERE id = ?');
    });

    it('should return deleted: false when event does not exist', async () => {
      const mockPrepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(null),
        }),
      });

      const mockDb = { prepare: mockPrepare } as unknown as D1Database;
      const res = await deleteEvent(mockDb, 999);

      expect(res.deleted).toBe(false);
      expect(res.event).toBeNull();
    });
  });

  describe('purgePastEvents DB helper', () => {
    it('should delete events with dates before today', async () => {
      const mockPastEvents = [{ id: 1 }, { id: 2 }];
      const deleteCalls: number[] = [];

      const mockPrepare = vi.fn((query: string) => {
        return {
          bind: vi.fn().mockReturnValue({
            all: vi.fn().mockResolvedValue({ results: mockPastEvents }),
            first: vi.fn().mockResolvedValue({ id: 1, title: 'Old Event' }),
            run: vi.fn().mockResolvedValue({ success: true }),
          }),
        };
      });

      const mockDb = { prepare: mockPrepare } as unknown as D1Database;
      const count = await dbModule.purgePastEvents(mockDb, '2026-10-13');

      expect(count).toBe(2);
      expect(mockPrepare).toHaveBeenCalledWith('SELECT id FROM events WHERE event_date < ?');
      expect(mockPrepare).toHaveBeenCalledWith('DELETE FROM events WHERE id = ?');
    });
  });

  describe('Event Sorting (Nearest to Farthest)', () => {
    it('should sort upcoming events chronologically from nearest date/time to farthest', () => {
      const events = [
        { id: 3, title: 'Discrete(4th)', event_date: '2026-11-06', event_time: null },   // In 24 days
        { id: 5, title: 'DigLo(theory)', event_date: '2026-10-27', event_time: '18:00' }, // In 14 days @ 18:00
        { id: 6, title: 'Morning Lab', event_date: '2026-10-27', event_time: '09:00' },   // In 14 days @ 09:00
        { id: 4, title: 'Discrete(3th)', event_date: '2026-10-30', event_time: null },   // In 17 days
      ];

      events.sort((a, b) => {
        if (a.event_date !== b.event_date) {
          return a.event_date.localeCompare(b.event_date);
        }
        return (a.event_time || '00:00').localeCompare(b.event_time || '00:00');
      });

      // Expected order:
      // 1. Oct 27 @ 09:00 (id: 6) -> Nearest!
      // 2. Oct 27 @ 18:00 (id: 5)
      // 3. Oct 30 (id: 4)
      // 4. Nov 06 (id: 3) -> Farthest!
      expect(events.map(e => e.id)).toEqual([6, 5, 4, 3]);
    });
  });

  describe('searchEventsByTitle DB helper', () => {
    it('should query events matching title pattern and from date', async () => {
      const mockMatches = [
        { id: 4, title: 'Discrete(3th)', event_date: '2026-10-30', event_time: '14:00' },
      ];

      const mockPrepare = vi.fn((query: string) => {
        return {
          bind: vi.fn().mockReturnValue({
            all: vi.fn().mockResolvedValue({ results: mockMatches }),
          }),
        };
      });

      const mockDb = { prepare: mockPrepare } as unknown as D1Database;
      const results = await dbModule.searchEventsByTitle(mockDb, 'Discrete', '2026-10-13');

      expect(results).toEqual(mockMatches);
      expect(mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining('WHERE title LIKE ? AND event_date >= ?')
      );
    });
  });
});
