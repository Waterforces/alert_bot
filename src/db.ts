/**
 * Database client for Cloudflare D1 (SQLite)
 */

export interface EventRecord {
  id: number;
  title: string;
  event_date: string; // ISO format: YYYY-MM-DD
  event_time: string | null; // 24-hr format: HH:mm
  created_by_platform: 'line' | 'discord';
  created_by_user: string | null;
  created_at: string;
}

export interface AlertLogRecord {
  id: number;
  event_id: number;
  alert_type: 'countdown' | 'event_time';
  milestone_days: number | null;
  platform: 'line' | 'discord';
  sent_at: string;
}

/**
 * Inserts a new event into the database.
 */
export async function addEvent(
  db: D1Database,
  data: {
    title: string;
    event_date: string;
    event_time?: string | null;
    created_by_platform: 'line' | 'discord';
    created_by_user?: string | null;
  }
): Promise<EventRecord> {
  const result = await db
    .prepare(
      `INSERT INTO events (title, event_date, event_time, created_by_platform, created_by_user)
       VALUES (?, ?, ?, ?, ?)
       RETURNING *`
    )
    .bind(
      data.title,
      data.event_date,
      data.event_time || null,
      data.created_by_platform,
      data.created_by_user || null
    )
    .first<EventRecord>();

  if (!result) {
    throw new Error('Failed to insert event');
  }

  return result;
}

/**
 * Automatically purges any events whose scheduled dates have completely passed (prior to today).
 */
export async function purgePastEvents(db: D1Database, todayStr: string): Promise<number> {
  const { results } = await db
    .prepare(`SELECT id FROM events WHERE event_date < ?`)
    .bind(todayStr)
    .all<{ id: number }>();

  if (!results || results.length === 0) return 0;

  for (const row of results) {
    await deleteEvent(db, row.id);
  }
  return results.length;
}

/**
 * Retrieves all events in the database regardless of date (ordered by date ASC).
 */
export async function getAllEvents(db: D1Database): Promise<EventRecord[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM events
       ORDER BY event_date ASC, event_time ASC`
    )
    .all<EventRecord>();

  return results || [];
}

/**
 * Retrieves all events scheduled from a given date onwards (e.g. today).
 */
export async function getUpcomingEvents(db: D1Database, fromDate: string): Promise<EventRecord[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM events
       WHERE event_date >= ?
       ORDER BY event_date ASC, event_time ASC`
    )
    .bind(fromDate)
    .all<EventRecord>();

  return results || [];
}

/**
 * Searches for upcoming events matching a keyword in title (case-insensitive).
 */
export async function searchEventsByTitle(
  db: D1Database,
  query: string,
  fromDate: string
): Promise<EventRecord[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM events
       WHERE title LIKE ? AND event_date >= ?
       ORDER BY event_date ASC, event_time ASC`
    )
    .bind(`%${query}%`, fromDate)
    .all<EventRecord>();

  return results || [];
}

/**
 * Retrieves all events for a specific target date.
 */
export async function getEventsByDate(db: D1Database, dateStr: string): Promise<EventRecord[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM events
       WHERE event_date = ?
       ORDER BY event_time ASC`
    )
    .bind(dateStr)
    .all<EventRecord>();

  return results || [];
}

/**
 * Retrieves all events for a given year and month (e.g. "2026-10").
 */
export async function getEventsByMonth(db: D1Database, yearMonthStr: string): Promise<EventRecord[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM events
       WHERE event_date LIKE ?
       ORDER BY event_date ASC, event_time ASC`
    )
    .bind(`${yearMonthStr}-%`)
    .all<EventRecord>();

  return results || [];
}

/**
 * Deletes an event by its ID. Returns true if an event was deleted.
 */
export async function deleteEvent(db: D1Database, id: number): Promise<{ deleted: boolean; event: EventRecord | null }> {
  // First fetch the event to get its details before deletion
  const event = await db
    .prepare(`SELECT * FROM events WHERE id = ?`)
    .bind(id)
    .first<EventRecord>();

  if (!event) {
    return { deleted: false, event: null };
  }

  // Delete associated alert logs to maintain clean foreign key relationships
  await db.prepare(`DELETE FROM alert_logs WHERE event_id = ?`).bind(id).run();
  await db.prepare(`DELETE FROM events WHERE id = ?`).bind(id).run();
  return { deleted: true, event };
}

/**
 * Checks if a specific alert has already been sent to prevent duplicates.
 */
export async function hasAlertBeenSent(
  db: D1Database,
  eventId: number,
  alertType: 'countdown' | 'event_time',
  milestoneDays: number | null,
  platform: 'line' | 'discord'
): Promise<boolean> {
  let query = `SELECT 1 FROM alert_logs WHERE event_id = ? AND alert_type = ? AND platform = ?`;
  const params: (number | string)[] = [eventId, alertType, platform];

  if (milestoneDays !== null) {
    query += ` AND milestone_days = ?`;
    params.push(milestoneDays);
  } else {
    query += ` AND milestone_days IS NULL`;
  }

  const existing = await db.prepare(query).bind(...params).first();
  return !!existing;
}

/**
 * Records that an alert was dispatched.
 */
export async function recordAlertSent(
  db: D1Database,
  eventId: number,
  alertType: 'countdown' | 'event_time',
  milestoneDays: number | null,
  platform: 'line' | 'discord'
): Promise<void> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO alert_logs (event_id, alert_type, milestone_days, platform)
       VALUES (?, ?, ?, ?)`
    )
    .bind(eventId, alertType, milestoneDays, platform)
    .run();
}

/**
 * Fetches events occurring today that match a specific HH:mm time.
 */
export async function getTodayEventsMatchingTime(
  db: D1Database,
  todayStr: string,
  timeStr: string
): Promise<EventRecord[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM events
       WHERE event_date = ? AND event_time = ?`
    )
    .bind(todayStr, timeStr)
    .all<EventRecord>();

  return results || [];
}
