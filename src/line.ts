/**
 * ===================================================================
 * 🟡 [Testing Mode Notice]: LINE Bot module is currently paused.
 * All logic, command parsers, and Push APIs are preserved here,
 * ready to be re-enabled whenever you want to test LINE integration.
 * ===================================================================
 */

import { Env } from './config';
import {
  addEvent,
  getUpcomingEvents,
  getEventsByDate,
  deleteEvent,
  purgePastEvents,
  searchEventsByTitle
} from './db';
import {
  parseInputDate,
  parseInputTime,
  getBangkokTodayString,
  calculateDaysRemaining,
  formatDateDisplay
} from './date';
import { sendDiscordAlert } from './discord';

/**
 * Verifies LINE HMAC-SHA256 signature using standard Web Crypto API.
 */
export async function verifyLineSignature(
  channelSecret: string,
  signatureBase64: string,
  rawBody: string
): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(channelSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signatureBuffer = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(rawBody)
    );

    const computedBase64 = bufferToBase64(signatureBuffer);
    return computedBase64 === signatureBase64;
  } catch (err) {
    console.error('LINE signature verification error:', err);
    return false;
  }
}

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Handles incoming LINE Webhook POST events.
 */
export async function handleLineWebhook(
  req: Request,
  env: Env
): Promise<Response> {
  if (!env.LINE_CHANNEL_SECRET || !env.LINE_CHANNEL_ACCESS_TOKEN) {
    return new Response('LINE bot is paused in testing mode.', { status: 200 });
  }

  const signature = req.headers.get('x-line-signature');
  const rawBody = await req.text();

  if (!signature) {
    return new Response('Missing LINE signature', { status: 401 });
  }

  const isValid = await verifyLineSignature(
    env.LINE_CHANNEL_SECRET,
    signature,
    rawBody
  );

  if (!isValid) {
    return new Response('Invalid LINE signature', { status: 401 });
  }

  const data = JSON.parse(rawBody);
  const events = data.events || [];

  for (const event of events) {
    // Log group ID if the bot is in a group (helpful for initial setup!)
    if (event.source?.groupId) {
      console.log(`[LINE Info] Group ID: ${event.source.groupId}`);
    }

    if (event.type === 'message' && event.message?.type === 'text') {
      const text = event.message.text.trim();
      const replyToken = event.replyToken;

      await processLineCommand(text, replyToken, event.source, env);
    }
  }

  return new Response('OK', { status: 200 });
}

/**
 * Parses user message and executes command.
 */
async function processLineCommand(
  text: string,
  replyToken: string,
  source: any,
  env: Env
): Promise<void> {
  const token = env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) return;

  const lower = text.toLowerCase();

  // 1. /list command
  if (lower.startsWith('/list')) {
    const argument = text.substring(5).trim();

    if (argument) {
      // Filter for specific date
      const isoDate = parseInputDate(argument);
      if (!isoDate) {
        await replyLineText(
          token,
          replyToken,
          `⚠️ Invalid date: "${argument}". Please use format DD/MM/YY (e.g. 25/12/26).`
        );
        return;
      }

      const events = await getEventsByDate(env.DB, isoDate);
      if (events.length === 0) {
        await replyLineText(
          token,
          replyToken,
          `📅 Events for ${formatDateDisplay(isoDate)}\n🎉 No events scheduled on this date! The calendar is free.`
        );
        return;
      }

      const listStr = events
        .map((e, idx) => `${idx + 1}. [${e.event_time || 'All Day'}] ${e.title} • ID: #${e.id}`)
        .join('\n');

      await replyLineText(
        token,
        replyToken,
        `📅 Events for ${formatDateDisplay(isoDate)}\n------------------------\n${listStr}`
      );
      return;
    }

    // Default: List upcoming events from today onwards (purge any finished events first)
    const todayIso = getBangkokTodayString();
    await purgePastEvents(env.DB, todayIso);

    const events = await getUpcomingEvents(env.DB, todayIso);

    if (events.length === 0) {
      await replyLineText(
        token,
        replyToken,
        '📅 Upcoming Family Events\n🎉 No upcoming events found!\nSend "Add: Event | DD/MM/YY | HH:mm" to schedule one.'
      );
      return;
    }

    // Sort from nearest to farthest date/time
    events.sort((a, b) => {
      if (a.event_date !== b.event_date) {
        return a.event_date.localeCompare(b.event_date);
      }
      return (a.event_time || '00:00').localeCompare(b.event_time || '00:00');
    });

    const listStr = events
      .map((e, idx) => {
        const daysLeft = calculateDaysRemaining(e.event_date, todayIso);
        const badge =
          daysLeft === 0
            ? '🚨 TODAY'
            : daysLeft === 1
            ? '⏳ Tomorrow'
            : `⏳ In ${daysLeft} days`;
        const time = e.event_time ? ` @ ${e.event_time}` : '';
        return `${idx + 1}. [${badge}]\n${e.title}\n🗓 ${formatDateDisplay(e.event_date)}${time} • ID: #${e.id}`;
      })
      .join('\n\n');

    await replyLineText(
      token,
      replyToken,
      `📅 Upcoming Family Events\n------------------------\n${listStr}\n------------------------\nType "Del: [ID]" to cancel.`
    );
    return;
  }

  // 2. Add: command
  if (lower.startsWith('add:') || lower.startsWith('add ')) {
    const rawContent = text.replace(/^(add:|add)\s*/i, '').trim();
    const parts = rawContent.split('|').map(s => s.trim());

    if (parts.length < 2) {
      await replyLineText(
        token,
        replyToken,
        '⚠️ Format:\nAdd: Title | DD/MM/YY | HH:mm (time is optional)\n\nExample:\nAdd: Mom Birthday | 25/12/26 | 18:00'
      );
      return;
    }

    const title = parts[0];
    const isoDate = parseInputDate(parts[1]);
    const normalizedTime = parts[2] ? parseInputTime(parts[2]) : null;

    if (!isoDate) {
      await replyLineText(
        token,
        replyToken,
        `⚠️ Invalid date: "${parts[1]}". Please use format DD/MM/YY (e.g. 25/12/26).`
      );
      return;
    }

    const todayIso = getBangkokTodayString();
    if (isoDate < todayIso) {
      await replyLineText(
        token,
        replyToken,
        `⚠️ The date "${formatDateDisplay(isoDate)}" has already passed. Please enter an upcoming date.`
      );
      return;
    }

    const event = await addEvent(env.DB, {
      title,
      event_date: isoDate,
      event_time: normalizedTime,
      created_by_platform: 'line',
      created_by_user: source?.userId || 'LINE User',
    });

    const timeStr = normalizedTime ? ` @ ${normalizedTime}` : '';

    // Reply confirmation to LINE
    await replyLineText(
      token,
      replyToken,
      `✅ Event Created!\n#${event.id}: ${event.title}\n🗓 Date: ${formatDateDisplay(event.event_date)}${timeStr}\n\nAlerts scheduled for 14, 7, 3, 1, and 0 days.`
    );

    // 📢 Cross-channel announcement to Discord!
    await sendDiscordAlert(
      env,
      `📢 **[From LINE] New Event Added**`,
      {
        title: `✅ ${event.title}`,
        color: 0x57F287,
        fields: [
          { name: '🗓 Date', value: formatDateDisplay(event.event_date), inline: true },
          { name: '⏰ Time', value: event.event_time || 'All Day', inline: true },
          { name: '🆔 Event ID', value: `#${event.id}`, inline: true },
        ],
        footer: { text: 'Created via LINE Bot' },
      }
    ).catch(err => console.error('Error cross-announcing to Discord:', err));

    return;
  }

  // 3. Del: command
  if (lower.startsWith('del:') || lower.startsWith('del ') || lower.startsWith('/delete')) {
    const rawId = text.replace(/^(del:|del|\/delete)\s*/i, '').trim();
    const id = parseInt(rawId, 10);

    if (isNaN(id)) {
      await replyLineText(
        token,
        replyToken,
        '⚠️ Please provide a valid Event ID number. Example: Del: 3'
      );
      return;
    }

    const result = await deleteEvent(env.DB, id);
    if (!result.deleted || !result.event) {
      await replyLineText(
        token,
        replyToken,
        `❌ Event #${id} not found.`
      );
      return;
    }

    // Reply confirmation to LINE
    await replyLineText(
      token,
      replyToken,
      `🗑️ Event #${id} "${result.event.title}" has been deleted. No further alerts will be sent.`
    );

    // 📢 Cross-channel announcement to Discord!
    await sendDiscordAlert(
      env,
      `🗑️ **[From LINE] Event Deleted**`,
      {
        title: `Event #${id} Removed`,
        description: `**${result.event.title}** was deleted via LINE.`,
        color: 0xED4245,
      }
    ).catch(err => console.error('Error cross-announcing to Discord:', err));

    return;
  }

  // 4. Find: command (/find [keyword] or find: [keyword])
  if (lower.startsWith('find:') || lower.startsWith('find ') || lower.startsWith('/find')) {
    const query = text.replace(/^(find:|find|\/find)\s*/i, '').trim();

    if (!query) {
      await replyLineText(
        token,
        replyToken,
        '⚠️ Please provide an event name or keyword to search for. Example: /find Meeting'
      );
      return;
    }

    const todayIso = getBangkokTodayString();
    await purgePastEvents(env.DB, todayIso);

    const matches = await searchEventsByTitle(env.DB, query, todayIso);

    if (matches.length === 0) {
      await replyLineText(
        token,
        replyToken,
        `🔍 Event Search:\n❌ Not found! No upcoming event matching "${query}" was found.`
      );
      return;
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

      await replyLineText(
        token,
        replyToken,
        `🔍 Event Found!\n📌 Title: ${e.title}\n🗓 Date: ${formatDateDisplay(e.event_date)}\n⏰ Start Time: ${e.event_time || 'All Day'}\n⏳ Remaining: ${remainingStr}\n🆔 Event ID: #${e.id}`
      );
      return;
    }

    // Multiple matches
    const listStr = matches
      .map((e, idx) => {
        const daysLeft = calculateDaysRemaining(e.event_date, todayIso);
        const badge =
          daysLeft === 0
            ? '🚨 TODAY'
            : daysLeft === 1
            ? '⏳ Tomorrow'
            : `⏳ In ${daysLeft} days`;
        const time = e.event_time ? ` @ ${e.event_time}` : ' (All Day)';
        return `${idx + 1}. [${badge}]\n${e.title}\n🗓 ${formatDateDisplay(e.event_date)}${time} • ID: #${e.id}`;
      })
      .join('\n\n');

    await replyLineText(
      token,
      replyToken,
      `🔍 Found ${matches.length} Events matching "${query}":\n------------------------\n${listStr}`
    );
    return;
  }
}

/**
 * Replies to a user using LINE's free Reply API (does NOT consume the 200 push quota).
 */
export async function replyLineText(
  channelAccessToken: string,
  replyToken: string,
  text: string
): Promise<void> {
  const res = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${channelAccessToken}`,
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: 'text', text }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('LINE Reply API error:', res.status, errText);
  }
}

/**
 * Pushes a message proactively to the family LINE group.
 * Consumes 1 push message from quota.
 */
export async function sendLinePushMessage(
  env: Env,
  text: string
): Promise<void> {
  if (!env.LINE_GROUP_ID || !env.LINE_CHANNEL_ACCESS_TOKEN) {
    // Graceful no-op when LINE is paused or unset
    return;
  }

  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      to: env.LINE_GROUP_ID,
      messages: [{ type: 'text', text }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('LINE Push API error:', res.status, errText);
  }
}
