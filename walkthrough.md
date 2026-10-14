# Walkthrough: Cross-Platform Family Event Alert Bot (LINE + Discord)

The cross-platform family event reminder bot has been fully implemented based on the specifications in **[`workplan_alert.md`](file:///c:/Coding/Mini_Project/Calendar_alert/workplan_alert.md)**.

---

## 📦 What Was Built

### 1. Database & Migrations
* [`migrations/0001_initial_schema.sql`](file:///c:/Coding/Mini_Project/Calendar_alert/migrations/0001_initial_schema.sql):
  * `events`: Tracks `id`, `title`, `event_date` (YYYY-MM-DD), `event_time` (HH:mm), `created_by_platform`, `created_by_user`.
  * `alert_logs`: Deduplication table tracking `(event_id, alert_type, milestone_days, platform)` to prevent spam.
* [`src/db.ts`](file:///c:/Coding/Mini_Project/Calendar_alert/src/db.ts): D1 SQLite queries for adding, listing upcoming, single-date filtering, deleting, and deduplicating alerts.

### 2. Timezone & Gregorian (AD) Date Engine
* [`src/date.ts`](file:///c:/Coding/Mini_Project/Calendar_alert/src/date.ts):
  * Converts 2-digit years (`25/12/26` $\rightarrow$ `2026-12-25`) and 4-digit years (`25/12/2026`).
  * Enforces `Asia/Bangkok` (UTC+7) timezone calculation for "Today" and countdown milestones ($D-14, 7, 3, 1, 0$).

### 3. Messaging & Command Handlers
* [`src/discord.ts`](file:///c:/Coding/Mini_Project/Calendar_alert/src/discord.ts):
  * **Primary Active Interface**: Ed25519 signature verification via `tweetnacl`.
  * Slash Commands: `/add title: date: time:`, `/list [date]`, `/delete id:`.
  * Incoming Webhook integration for outbound automated countdown alerts.
* [`src/line.ts`](file:///c:/Coding/Mini_Project/Calendar_alert/src/line.ts):
  * *[Testing Phase Notice]*: Temporarily paused as requested. All LINE Webhook verification, command parsers (`Add:`, `/list`, `Del:`), and Push APIs are preserved and ready to be re-enabled.
  * Cross-channel LINE alerts in `src/discord.ts` and `src/scheduler.ts` are commented out so the bot functions standalone on Discord.

### 4. Scheduler & Double Announcement
* [`src/scheduler.ts`](file:///c:/Coding/Mini_Project/Calendar_alert/src/scheduler.ts):
  * **00:01 AM (Bangkok time)**: Scans upcoming events and fires countdown alerts at $14, 7, 3, 1, \text{and } 0$ days.
  * **Event-Time Double Announcement**: If an event has a scheduled time (e.g. `18:00`), on Day 0 it receives a second announcement at that exact time.

### 5. Setup & Registration Automation
* [`scripts/register-discord-commands.mjs`](file:///c:/Coding/Mini_Project/Calendar_alert/scripts/register-discord-commands.mjs): Registers global `/add`, `/list`, `/delete` commands with Discord.
* [`README.md`](file:///c:/Coding/Mini_Project/Calendar_alert/README.md): Complete setup guide with instructions on creating bots and deploying to Cloudflare Workers for free.

---

## 🧪 Verification Results

### 1. Automated Unit Tests (Vitest)
Executed:
```bash
npm test
```
**Result**: 11 out of 11 unit tests passed (`tests/date.test.ts`), verifying:
* 2-digit and 4-digit Gregorian (AD) year parsing (`25/12/26` and `25/12/2026`).
* Leap year validation (`29/02/2028` accepted, `29/02/2025` rejected).
* Calendar day validity (rejecting invalid dates like `31/02/26`).
* 24-hr time parsing (`18:00`, `9:30`).
* Accurate countdown intervals ($14, 7, 3, 1, 0$ days).

### 2. TypeScript Compilation Check
Executed:
```bash
npx tsc --noEmit
```
**Result**: Exited with code 0. Zero compiler errors or type mismatches across all files.

### 3. Local D1 Database Migration
Executed:
```bash
npm run db:migrate:local
```
**Result**: 4 SQL commands executed successfully, creating tables `events` and `alert_logs` alongside their query indexes in the local SQLite engine.

