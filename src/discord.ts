import nacl from 'tweetnacl';
import { Env } from './config';
import {
  addEvent,
  getUpcomingEvents,
  getEventsByDate,
  getEventsByMonth,
  deleteEvent,
  purgePastEvents,
  searchEventsByTitle
} from './db';
import {
  parseInputDate,
  parseInputTime,
  getBangkokTodayString,
  getBangkokNow,
  calculateDaysRemaining,
  formatDateDisplay,
  parseMonthInput,
  generateMonthlyCalendarGrid,
  getMonthDaysInfo
} from './date';
// import { sendLinePushMessage } from './line'; // [Testing Mode: LINE disabled]

// Discord Interaction Types
export const InteractionType = {
  PING: 1,
  APPLICATION_COMMAND: 2,
};

export const InteractionResponseType = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
};

export interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  footer?: { text: string };
  timestamp?: string;
}

/**
 * Verifies that the incoming request is genuinely signed by Discord.
 */
export function verifyDiscordSignature(
  publicKeyHex: string,
  signatureHex: string,
  timestamp: string,
  body: string
): boolean {
  try {
    const publicKey = hexToUint8Array(publicKeyHex);
    const signature = hexToUint8Array(signatureHex);
    const message = new TextEncoder().encode(timestamp + body);
    return nacl.sign.detached.verify(message, signature, publicKey);
  } catch (err) {
    console.error('Discord signature verification error:', err);
    return false;
  }
}

function hexToUint8Array(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

/**
 * Handles incoming Discord HTTP Interaction requests.
 */
export async function handleDiscordInteraction(
  req: Request,
  env: Env
): Promise<Response> {
  const signature = req.headers.get('X-Signature-Ed25519');
  const timestamp = req.headers.get('X-Signature-Timestamp');
  const rawBody = await req.text();

  if (!signature || !timestamp || !env.DISCORD_PUBLIC_KEY) {
    return new Response('Missing signature headers', { status: 401 });
  }

  const isValid = verifyDiscordSignature(
    env.DISCORD_PUBLIC_KEY,
    signature,
    timestamp,
    rawBody
  );

  if (!isValid) {
    return new Response('Invalid request signature', { status: 401 });
  }

  const interaction = JSON.parse(rawBody);

  // 1. Handle Discord Ping (Required for endpoint verification)
  if (interaction.type === InteractionType.PING) {
    return new Response(
      JSON.stringify({ type: InteractionResponseType.PONG }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  }

  // 2. Handle Slash Commands
  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    const commandName = interaction.data?.name;
    const options = interaction.data?.options || [];
    const callerName =
      interaction.member?.user?.global_name ||
      interaction.member?.user?.username ||
      'Discord User';

    const getOption = (name: string) =>
      options.find((o: { name: string; value: any }) => o.name === name)?.value;

    // --- /add command ---
    if (commandName === 'add') {
      const title = getOption('title');
      const dateRaw = getOption('date');
      const timeRaw = getOption('time');

      const isoDate = parseInputDate(dateRaw);
      if (!isoDate) {
        return respondMessage(
          `⚠️ Invalid date: \`${dateRaw}\`. Please use format **DD/MM/YY** (e.g. 25/12/26).`
        );
      }

      const todayIso = getBangkokTodayString();
      if (isoDate < todayIso) {
        return respondMessage(
          `⚠️ The date \`${formatDateDisplay(isoDate)}\` has already passed. Please enter an upcoming date.`
        );
      }

      const normalizedTime = parseInputTime(timeRaw);

      const event = await addEvent(env.DB, {
        title,
        event_date: isoDate,
        event_time: normalizedTime,
        created_by_platform: 'discord',
        created_by_user: callerName,
      });

      // 📢 Cross-channel announcement to LINE (Disabled during testing mode)
      // const timeStr = normalizedTime ? ` @ ${normalizedTime}` : '';
      // await sendLinePushMessage(
      //   env,
      //   `📢 [From Discord by ${callerName}]\nNew Event: ${title}\n🗓 Date: ${formatDateDisplay(isoDate)}${timeStr}`
      // ).catch(err => console.error('Error cross-announcing to LINE:', err));

      return respondEmbed({
        title: '✅ Event Created',
        description: `**${event.title}** has been scheduled!`,
        color: 0x57F287, // Green
        fields: [
          { name: '🗓 Date', value: formatDateDisplay(event.event_date), inline: true },
          { name: '⏰ Time', value: event.event_time || 'All Day', inline: true },
          { name: '🆔 Event ID', value: `#${event.id}`, inline: true },
        ],
        footer: { text: `Added by ${callerName} via Discord` },
      });
    }

    // --- /list command ---
    if (commandName === 'list') {
      const dateRaw = getOption('date');

      if (dateRaw) {
        // Targeted single-date search
        const isoDate = parseInputDate(dateRaw);
        if (!isoDate) {
          return respondMessage(
            `⚠️ Invalid date: \`${dateRaw}\`. Please use format **DD/MM/YY** (e.g. 25/12/26).`
          );
        }

        const events = await getEventsByDate(env.DB, isoDate);
        if (events.length === 0) {
          return respondEmbed({
            title: `📅 Events for ${formatDateDisplay(isoDate)}`,
            description: '🎉 No events scheduled on this date! The calendar is free.',
            color: 0x5865F2, // Blurple
          });
        }

        const listContent = events
          .map((e, idx) => `• **${idx + 1}.** [${e.event_time || 'All Day'}] **${e.title}** • ID: #${e.id}`)
          .join('\n');

        return respondEmbed({
          title: `📅 Events for ${formatDateDisplay(isoDate)}`,
          description: listContent,
          color: 0x5865F2,
          footer: { text: `Found ${events.length} event(s)` },
        });
      }

      // Default: List upcoming events from today onwards (purge any finished events first)
      const todayIso = getBangkokTodayString();
      await purgePastEvents(env.DB, todayIso);

      const events = await getUpcomingEvents(env.DB, todayIso);

      if (events.length === 0) {
        return respondEmbed({
          title: '📅 Upcoming Family Events',
          description: '🎉 No upcoming events found! Use `/add` to schedule one.',
          color: 0x5865F2,
        });
      }

      // Sort from nearest to farthest date/time
      events.sort((a, b) => {
        if (a.event_date !== b.event_date) {
          return a.event_date.localeCompare(b.event_date);
        }
        return (a.event_time || '00:00').localeCompare(b.event_time || '00:00');
      });

      const listContent = events
        .map((e, idx) => {
          const daysLeft = calculateDaysRemaining(e.event_date, todayIso);
          const badge =
            daysLeft === 0
              ? '🚨 TODAY'
              : daysLeft === 1
              ? '⏳ Tomorrow'
              : `⏳ In ${daysLeft} days`;
          const time = e.event_time ? ` @ ${e.event_time}` : '';
          return `**${idx + 1}.** [${badge}] **${e.title}**\n🗓 ${formatDateDisplay(e.event_date)}${time} • ID: #${e.id}`;
        })
        .join('\n\n');

      return respondEmbed({
        title: '📅 Upcoming Family Events',
        description: listContent,
        color: 0x5865F2,
        footer: { text: `Showing all ${events.length} upcoming event(s) • To delete: /delete id: [ID]` },
      });
    }

    // --- /delete command ---
    if (commandName === 'delete') {
      const id = parseInt(getOption('id'), 10);
      if (isNaN(id)) {
        return respondMessage('⚠️ Please provide a valid Event ID number.');
      }

      const result = await deleteEvent(env.DB, id);
      if (!result.deleted || !result.event) {
        return respondMessage(`❌ Event #${id} not found.`);
      }

      // 📢 Cross-channel announcement to LINE (Disabled during testing mode)
      // await sendLinePushMessage(
      //   env,
      //   `🗑️ [From Discord by ${callerName}]\nEvent #${id} "${result.event.title}" has been deleted.`
      // ).catch(err => console.error('Error cross-announcing to LINE:', err));

      return respondEmbed({
        title: '🗑️ Event Deleted',
        description: `Event **#${id} (${result.event.title})** was deleted.\nNo further alerts will be sent.`,
        color: 0xED4245, // Red
      });
    }

    // --- /find command ---
    if (commandName === 'find') {
      const query = (getOption('query') || '').trim();
      if (!query) {
        return respondMessage('⚠️ Please provide an event name or keyword to search for.');
      }

      const todayIso = getBangkokTodayString();
      await purgePastEvents(env.DB, todayIso);

      const matches = await searchEventsByTitle(env.DB, query, todayIso);

      if (matches.length === 0) {
        return respondEmbed({
          title: '🔍 Event Search',
          description: `❌ **Not found**\nNo upcoming event matching "**${query}**" was found in the calendar.`,
          color: 0xED4245, // Red
          footer: { text: `Searched for: "${query}"` },
        });
      }

      if (matches.length === 1) {
        const e = matches[0];
        const daysLeft = calculateDaysRemaining(e.event_date, todayIso);
        const remainingStr =
          daysLeft === 0
            ? '🚨 Today!'
            : daysLeft === 1
            ? '⏳ Tomorrow'
            : `⏳ In ${daysLeft} days`;

        return respondEmbed({
          title: `🔍 Event Found: ${e.title}`,
          color: 0x57F287, // Green
          fields: [
            { name: '🗓 Date', value: formatDateDisplay(e.event_date), inline: true },
            { name: '⏰ Start Time', value: e.event_time ? `**${e.event_time}**` : 'All Day (No specific time)', inline: true },
            { name: '⏳ Remaining', value: remainingStr, inline: true },
            { name: '🆔 Event ID', value: `#${e.id}`, inline: true },
          ],
          footer: { text: `Scheduled on ${formatDateDisplay(e.event_date)}` },
        });
      }

      // Multiple matches
      const listContent = matches
        .map((e, idx) => {
          const daysLeft = calculateDaysRemaining(e.event_date, todayIso);
          const badge =
            daysLeft === 0
              ? '🚨 TODAY'
              : daysLeft === 1
              ? '⏳ Tomorrow'
              : `⏳ In ${daysLeft} days`;
          const time = e.event_time ? ` @ **${e.event_time}**` : ' (All Day)';
          return `**${idx + 1}.** [${badge}] **${e.title}**\n🗓 ${formatDateDisplay(e.event_date)}${time} • ID: #${e.id}`;
        })
        .join('\n\n');

      return respondEmbed({
        title: `🔍 Found ${matches.length} Events matching "${query}"`,
        description: listContent,
        color: 0x5865F2, // Blurple
        footer: { text: `Total: ${matches.length} matching event(s)` },
      });
    }

    // --- /month command ---
    if (commandName === 'month') {
      const monthArg = getOption('month');
      const yearArg = getOption('year');

      const parsed = parseMonthInput(monthArg, yearArg);
      if (!parsed) {
        return respondMessage(
          `⚠️ Invalid month format: \`${monthArg}\`. Please use 1-12 or MM/YY (e.g. \`10\` or \`10/26\`).`
        );
      }

      const { year, month } = parsed;
      const mmStr = String(month).padStart(2, '0');
      const yearMonthStr = `${year}-${mmStr}`;

      // Purge past events prior to today
      const todayIso = getBangkokTodayString();
      await purgePastEvents(env.DB, todayIso);

      // Fetch all events for the target month (ordered by event_date ASC, event_time ASC)
      const events = await getEventsByMonth(env.DB, yearMonthStr);

      // Extract set of day numbers that have events
      const eventDays = new Set<number>();
      for (const e of events) {
        const d = parseInt(e.event_date.split('-')[2], 10);
        if (!isNaN(d)) {
          eventDays.add(d);
        }
      }

      // Today's date object in Bangkok
      const nowBkk = getBangkokNow();
      const todayDate = {
        year: nowBkk.getFullYear(),
        month: nowBkk.getMonth() + 1,
        day: nowBkk.getDate(),
      };

      // Generate the ANSI calendar grid
      const calendarGrid = generateMonthlyCalendarGrid(year, month, eventDays, todayDate);

      // Format the event list below the calendar
      const { monthName } = getMonthDaysInfo(year, month);
      let eventListContent = '';

      if (events.length === 0) {
        eventListContent = `🎉 *No events scheduled in ${monthName} ${year}.*`;
      } else {
        const formattedEvents = events.map((e, idx) => {
          const daysLeft = calculateDaysRemaining(e.event_date, todayIso);
          const isToday = daysLeft === 0;
          const todayBadge = isToday ? ' 🚨 **[TODAY!]**' : '';
          const time = e.event_time ? ` @ **${e.event_time}**` : ' *(All Day)*';
          return `**${idx + 1}.** 🗓️ **${formatDateDisplay(e.event_date)}**${time} • **${e.title}**${todayBadge} \`#${e.id}\``;
        });

        eventListContent = `📋 **Events in ${monthName} ${year} (${events.length}):**\n` + formattedEvents.join('\n');
      }

      const description = `${calendarGrid}\n🔴 **(Date)** = Today  •  • = Has Event\n\n${eventListContent}`;

      return respondEmbed({
        title: `🗓️ Family Calendar: ${monthName} ${year}`,
        description,
        color: 0x5865F2,
        footer: { text: `Total: ${events.length} event(s) in ${monthName} • To add: /add • To delete: /delete id: [ID]` },
      });
    }
  }

  return new Response('Unhandled interaction', { status: 400 });
}

function respondMessage(content: string): Response {
  return new Response(
    JSON.stringify({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content },
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}

function respondEmbed(embed: DiscordEmbed): Response {
  return new Response(
    JSON.stringify({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { embeds: [embed] },
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}

/**
 * Sends a notification directly to Discord via Incoming Webhook.
 * Used for automated countdown alerts and cross-channel sync.
 */
export async function sendDiscordAlert(
  env: Env,
  content: string,
  embed?: DiscordEmbed
): Promise<void> {
  if (!env.DISCORD_WEBHOOK_URL) {
    console.warn('DISCORD_WEBHOOK_URL is not set.');
    return;
  }

  const payload: any = { content };
  if (embed) {
    payload.embeds = [embed];
  }

  const res = await fetch(env.DISCORD_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('Discord Webhook error:', res.status, errText);
  }
}
