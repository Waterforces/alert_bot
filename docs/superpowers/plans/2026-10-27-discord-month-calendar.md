# Discord Monthly Calendar (`/month`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

This plan implements the `/month` slash command in the Discord bot to render a monthly calendar grid with today's date highlighted, dot indicators underneath dates with scheduled events, and a full chronological listing of all events in that month (from 1st to the last day) below the calendar.

---

## User Requirements & Architecture

1. **Discord Slash Command**: `/month`
   - Optional parameters:
     - `month` (e.g., `11` or `11/26`, defaults to current month in Bangkok time UTC+7)
     - `year` (e.g., `2026`, defaults to current year in Bangkok time)
2. **Visual Calendar Grid** (Monospace / ANSI in Discord Embed):
   - Header with Month & Year (e.g. `OCTOBER 2026`)
   - Day columns: `Mon Tue Wed Thu Fri Sat Sun`
   - Day rows: Day numbers 1..31 properly aligned under weekday columns.
   - **Today Highlight**: Day number wrapped in `(DD)` and highlighted in Red ANSI (`\u001b[1;31m(DD)\u001b[0m`).
   - **Event Indicators**: Under each week row, a sub-row placing dots (`•`) directly beneath dates that have scheduled events.
3. **Monthly Events List**:
   - Below the calendar codeblock, display all events scheduled in that month ordered chronologically (1st to last day of month).
   - If an event is today, add a badge `👈 [TODAY!]`.
   - Show sequential numbering `1.`, `2.`, Date, Time (or All Day), Title, and ID `#X`.
4. **Registration & Deployment**:
   - Add `/month` command to `scripts/register-discord-commands.mjs`.
   - Register the command with Discord API.
   - Deploy to Cloudflare Workers (`npm run deploy`).

---

## File Changes & Responsibilities

- **`src/date.ts`**:
  - Add calendar helper functions:
    - `getMonthDaysInfo(year: number, month: number)`: calculates total days in month, starting day of week (Monday = 0 .. Sunday = 6).
    - `parseMonthInput(monthStr?: string, yearStr?: string)`: parses user input or defaults to current Bangkok month & year.
    - `generateMonthlyCalendarGrid(year: number, month: number, eventDays: Set<number>, todayDate?: { year: number; month: number; day: number } | null)`: generates the ANSI calendar block.
- **`src/db.ts`**:
  - Add `getEventsByMonth(db: D1Database, yearMonthStr: string)`: fetches all events matching `YYYY-MM-%` ordered by `event_date ASC, event_time ASC`.
- **`src/discord.ts`**:
  - Handle `interaction.data.name === 'month'`.
  - Parse options, query D1 DB, generate calendar grid and event list, and return embed.
- **`scripts/register-discord-commands.mjs`**:
  - Register `/month` slash command with Discord.
- **`tests/calendar.test.ts`**:
  - Unit tests for `getMonthDaysInfo`, `parseMonthInput`, and `generateMonthlyCalendarGrid`.
  - Unit tests for `getEventsByMonth` DB query.

---

## Tasks

### Task 1: Date & Calendar Grid Generator
- [ ] Write unit tests in `tests/calendar.test.ts` for calendar calculations:
  - Total days in month (e.g., February 2028 = 29 days, February 2026 = 28 days, October = 31 days).
  - First day of week alignment (Monday = 0, Sunday = 6).
  - ANSI grid formatting with today's date highlighted and event dot rows.
- [ ] Implement `getMonthDaysInfo`, `parseMonthInput`, and `generateMonthlyCalendarGrid` in `src/date.ts`.
- [ ] Run `npm test` to verify all tests pass.

### Task 2: Database Query for Monthly Events
- [ ] Add `getEventsByMonth(db: D1Database, yearMonthStr: string)` in `src/db.ts`.
- [ ] Add unit test verifying `getEventsByMonth` in `tests/calendar.test.ts`.
- [ ] Run `npm test` and `npx tsc --noEmit`.

### Task 3: Discord `/month` Command Handler
- [ ] In `src/discord.ts`, add handler for command `month`.
- [ ] Format response with Discord Embed:
  - Title: `🗓️ Calendar: [Month Name] [Year]`
  - Description: ANSI calendar codeblock + Legend (`🔴 (DD) = Today | • = Has event`) + Chronological event list.
- [ ] Add tests for `/month` command interaction in `tests/scheduler.test.ts` or `tests/calendar.test.ts`.
- [ ] Run `npm test` and `npx tsc --noEmit`.

### Task 4: Command Registration & Cloudflare Deployment
- [ ] Add `/month` command to `scripts/register-discord-commands.mjs`.
- [ ] Register new slash command to Discord via `npm run discord:register`.
- [ ] Deploy updated bot to Cloudflare Workers with `npm run deploy`.
- [ ] Verify live health check and test `/month` command.
