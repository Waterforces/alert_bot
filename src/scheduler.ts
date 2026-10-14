import { Env } from './config';
import {
  getUpcomingEvents,
  hasAlertBeenSent,
  recordAlertSent,
  deleteEvent,
  purgePastEvents,
  EventRecord
} from './db';
import {
  getBangkokTodayString,
  getBangkokTimeString,
  calculateDaysRemaining,
  formatDateDisplay
} from './date';
// import { sendLinePushMessage } from './line'; // [Testing Mode: LINE disabled]
import { sendDiscordAlert } from './discord';

const COUNTDOWN_MILESTONES = [14, 7, 3, 1, 0];

/**
 * Main dispatcher invoked by Cloudflare Scheduled Cron events.
 */
export async function handleScheduledEvent(
  cronEvent: ScheduledEvent,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  const cron = cronEvent.cron;
  console.log(`[Scheduler] Triggered cron: "${cron}" at ${new Date().toISOString()}`);

  // Run the daily 00:01 AM countdown routine
  await runDailyCountdownRoutine(env);

  // Run the event-time double announcement routine
  await runEventTimeDoubleAnnouncementRoutine(env);
}

/**
 * 00:01 AM Daily Countdown Check (D-14, D-7, D-3, D-1, D-0)
 */
export async function runDailyCountdownRoutine(env: Env): Promise<void> {
  const today = getBangkokTodayString();

  // 1. Purge any expired/finished events from the database
  await purgePastEvents(env.DB, today);

  // 2. Fetch upcoming events
  const upcomingEvents = await getUpcomingEvents(env.DB, today);

  for (const event of upcomingEvents) {
    try {
      const daysRemaining = calculateDaysRemaining(event.event_date, today);

      if (COUNTDOWN_MILESTONES.includes(daysRemaining)) {
        // 1. Check & send Discord alert
        const discordSent = await hasAlertBeenSent(
          env.DB,
          event.id,
          'countdown',
          daysRemaining,
          'discord'
        );

        if (!discordSent) {
          await dispatchDiscordCountdownAlert(env, event, daysRemaining);
          await recordAlertSent(env.DB, event.id, 'countdown', daysRemaining, 'discord');
        }

        // 2. Check & send LINE alert (Disabled during testing mode)
        /*
        const lineSent = await hasAlertBeenSent(
          env.DB,
          event.id,
          'countdown',
          daysRemaining,
          'line'
        );

        if (!lineSent) {
          await dispatchLineCountdownAlert(env, event, daysRemaining);
          await recordAlertSent(env.DB, event.id, 'countdown', daysRemaining, 'line');
        }
        */

        // Auto-delete all-day events on Day 0 (daysRemaining === 0 with no specific event_time)
        // after the Day 0 countdown alert is sent.
        if (daysRemaining === 0 && !event.event_time) {
          await deleteEvent(env.DB, event.id);
          console.log(
            `[Scheduler] Auto-deleted all-day event #${event.id} ("${event.title}") after Day 0 countdown alert.`
          );
        }
      }
    } catch (err) {
      console.error(`[Scheduler] Failed processing countdown for event #${event.id}:`, err);
    }
  }
}

/**
 * Double Announcement Check for events on Day 0 that have reached their scheduled start time.
 */
export async function runEventTimeDoubleAnnouncementRoutine(env: Env): Promise<void> {
  const today = getBangkokTodayString();
  const currentTime = getBangkokTimeString();

  // Find events today that have a scheduled time which has arrived (event_time <= currentTime)
  const { results: todayEvents } = await env.DB
    .prepare(
      `SELECT * FROM events
       WHERE event_date = ? AND event_time IS NOT NULL AND event_time <= ?`
    )
    .bind(today, currentTime)
    .all<EventRecord>();

  if (!todayEvents || todayEvents.length === 0) return;

  for (const event of todayEvents) {
    try {
      // 1. Discord Double Announce
      const discordSent = await hasAlertBeenSent(
        env.DB,
        event.id,
        'event_time',
        null,
        'discord'
      );

      if (!discordSent) {
        await sendDiscordAlert(
          env,
          `⏰ **[Happening Now]** Family Event Alert!`,
          {
            title: `🔔 ${event.title}`,
            description: `This event is scheduled for **${event.event_time}** today!`,
            color: 0xFEE75C, // Yellow
            fields: [
              { name: '🗓 Date', value: formatDateDisplay(event.event_date), inline: true },
              { name: '⏰ Time', value: event.event_time || 'Now', inline: true },
            ],
          }
        );
        await recordAlertSent(env.DB, event.id, 'event_time', null, 'discord');
      }

      // 2. LINE Double Announce (Disabled during testing mode)
      /*
      const lineSent = await hasAlertBeenSent(
        env.DB,
        event.id,
        'event_time',
        null,
        'line'
      );

      if (!lineSent) {
        await sendLinePushMessage(
          env,
          `⏰ [Happening Now]\n${event.title}\n🗓 Today @ ${event.event_time}`
        );
        await recordAlertSent(env.DB, event.id, 'event_time', null, 'line');
      }
      */

      // Auto-delete the event after its scheduled time alert has been dispatched
      await deleteEvent(env.DB, event.id);
      console.log(
        `[Scheduler] Auto-deleted event #${event.id} ("${event.title}") after event-time alert.`
      );
    } catch (err) {
      console.error(`[Scheduler] Failed processing event-time announcement for event #${event.id}:`, err);
    }
  }
}

function getMilestoneBadge(days: number): { label: string; emoji: string } {
  switch (days) {
    case 0:
      return { label: "TODAY'S EVENT", emoji: '🚨' };
    case 1:
      return { label: 'Tomorrow', emoji: '⏳' };
    case 3:
      return { label: 'In 3 Days', emoji: '⏳' };
    case 7:
      return { label: 'In 1 Week (7 Days)', emoji: '⏳' };
    case 14:
      return { label: 'In 2 Weeks (14 Days)', emoji: '⏳' };
    default:
      return { label: `In ${days} Days`, emoji: '⏳' };
  }
}

async function dispatchDiscordCountdownAlert(
  env: Env,
  event: EventRecord,
  daysRemaining: number
): Promise<void> {
  const { label, emoji } = getMilestoneBadge(daysRemaining);
  const timeStr = event.event_time ? ` @ ${event.event_time}` : ' (All Day)';
  const color = daysRemaining === 0 ? 0xED4245 : daysRemaining <= 3 ? 0xFEE75C : 0x5865F2;

  await sendDiscordAlert(
    env,
    `${emoji} **[Reminder: ${label}]**`,
    {
      title: event.title,
      color,
      fields: [
        { name: '🗓 Date', value: formatDateDisplay(event.event_date), inline: true },
        { name: '⏰ Time', value: event.event_time || 'All Day', inline: true },
        { name: '⏳ Remaining', value: daysRemaining === 0 ? 'Today!' : `${daysRemaining} days left`, inline: true },
      ],
      footer: { text: `Event #${event.id}` },
    }
  );
}

/*
async function dispatchLineCountdownAlert(
  env: Env,
  event: EventRecord,
  daysRemaining: number
): Promise<void> {
  const { label, emoji } = getMilestoneBadge(daysRemaining);
  const timeStr = event.event_time ? ` @ ${event.event_time}` : '';

  const message = `${emoji} [Reminder: ${label}]\n${event.title}\n🗓 Date: ${formatDateDisplay(event.event_date)}${timeStr}\n⏳ ${daysRemaining === 0 ? 'Happening today!' : `${daysRemaining} days remaining`}`;

  await sendLinePushMessage(env, message);
}
*/
