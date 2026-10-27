# 📅 Cross-Platform Family Event Alert Bot (LINE + Discord)

A lightweight, reliable, and **100% free** cross-platform calendar reminder bot designed for families.
Powered by **Cloudflare Workers (TypeScript)**, **Cloudflare D1 (Serverless SQLite)**, and **Cron Triggers**.

---

## 🚀 Key Features

* **Single Source of Truth**: Events added in LINE are visible in Discord, and vice versa.
* **Instant Cross-Channel Sync**: Adding or deleting an event in LINE automatically notifies Discord (and vice versa).
* **Automated Countdown Alerts**: Alerts are posted to both platforms at:
  * ⏳ **14 Days before**
  * ⏳ **7 Days before (1 week)**
  * ⏳ **3 Days before**
  * ⏳ **2 Days before**
  * ⏳ **1 Day before (tomorrow)**
  * 🚨 **Day 0 (Today at 00:01 AM Bangkok Time)**
* **Double Announcement**: If an event has a specific start time (e.g. `18:00`), on the day of the event it receives a second announcement at that exact time!
* **Automatic Event Cleanup**: Once an event finishes alerting on Day 0 (after the Day 0 countdown alert for all-day events, or after the scheduled start-time announcement for timed events), it is automatically and silently deleted from the database.
* **100% Free Forever**: Runs entirely within Cloudflare, LINE, and Discord's permanent free tiers.

---

## 📂 Project Structure

```text
Calendar_alert/
│
├── 📁 migrations/
│   └── 📄 0001_initial_schema.sql     # SQLite schema (events & alert_logs)
│
├── 📁 src/
│   ├── 📄 index.ts                    # Entry point: HTTP routes & Cloudflare cron handler
│   ├── 📄 config.ts                   # Environment types & Asia/Bangkok UTC+7 settings
│   ├── 📄 db.ts                       # Cloudflare D1 database queries & deduplication
│   ├── 📄 date.ts                     # Gregorian (AD) date parser & countdown calculator
│   ├── 📄 line.ts                     # LINE Webhook verification, commands, and Push API
│   ├── 📄 discord.ts                  # Discord Ed25519 verification, slash commands, webhook
│   └── 📄 scheduler.ts                # 00:01 AM countdowns & event-time double announcements
│
├── 📁 scripts/
│   └── 📄 register-discord-commands.mjs # Script to register /add, /list, /delete to Discord
│
├── 📁 tests/
│   └── 📄 date.test.ts                # Unit tests for date logic & countdowns
│
├── 📄 wrangler.toml                   # Cloudflare Worker, D1 DB, and Cron configuration
├── 📄 package.json                    # Dependencies & scripts
└── 📄 tsconfig.json                   # TypeScript configuration
```

---

## 💬 Command Cheat Sheet

### 1. LINE Bot (Chat in Family Group)
* **Add Event**:  
  `Add: [Event Name] | [DD/MM/YY] | [HH:mm]` *(Time is optional)*  
  *Example*: `Add: Mom's Birthday | 25/12/26 | 18:00`
* **List Upcoming Events**:  
  `/list`
* **List Events for Specific Date**:  
  `/list 25/12/26`
* **Delete Event**:  
  `Del: 3`
* **Find / Search Event**:  
  `/find Meeting` or `Find: Meeting`

### 2. Discord Bot (Channel Slash Commands)
* **Add Event**:  
  `/add title: Mom's Birthday date: 25/12/26 time: 18:00`
* **List Upcoming Events**:  
  `/list`
* **List Events for Specific Date**:  
  `/list date: 25/12/26`
* **Delete Event**:  
  `/delete id: 3`
* **Find / Search Event**:  
  `/find query: Meeting`
* **Monthly Calendar View**:  
  `/month` *(view current month)* or `/month month: 11` or `/month month: 11/26`

---

## 🛠️ Step-by-Step Setup Guide

### 1. Prerequisites
* Node.js v18+ installed.
* A free [Cloudflare Account](https://dash.cloudflare.com/).
* A free [LINE Developers Account](https://developers.line.biz/).
* A free [Discord Developer Portal Account](https://discord.com/developers/applications).

---

### 2. Configure Environment Variables
Copy `.env.example` to `.dev.vars` (for local development):
```bash
cp .env.example .dev.vars
```

Fill in your credentials:
```ini
# LINE Bot Credentials
LINE_CHANNEL_SECRET=your_line_channel_secret
LINE_CHANNEL_ACCESS_TOKEN=your_line_channel_access_token
LINE_GROUP_ID=your_family_line_group_id

# Discord Bot Credentials
DISCORD_APPLICATION_ID=your_discord_app_id
DISCORD_PUBLIC_KEY=your_discord_public_key
DISCORD_BOT_TOKEN=your_discord_bot_token
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

> **💡 How to find your LINE Group ID:**  
> When the bot is invited into your family LINE group, the first message sent in the group will output the Group ID to your Cloudflare logs:  
> `[LINE Info] Group ID: cxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`. Simply copy this into `LINE_GROUP_ID`!

---

### 3. Local Development & Testing

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Run Unit Tests**:
   ```bash
   npm test
   ```

3. **Initialize Local Database**:
   ```bash
   npm run db:migrate:local
   ```

4. **Start Local Server**:
   ```bash
   npm run dev
   ```

---

### 4. Register Discord Slash Commands
Once `DISCORD_APPLICATION_ID` and `DISCORD_BOT_TOKEN` are in your `.dev.vars`, register the commands to Discord:
```bash
npm run discord:register
```

---

### 5. Deploying to Cloudflare (Free 24/7 Hosting)

1. **Create the Remote D1 Database**:
   ```bash
   npx wrangler d1 create calendar-alert-db
   ```
   *Copy the generated `database_id` into your `wrangler.toml`.*

2. **Run Remote Database Migration**:
   ```bash
   npm run db:migrate:remote
   ```

3. **Set Cloudflare Production Secrets**:
   ```bash
   npx wrangler secret put LINE_CHANNEL_SECRET
   npx wrangler secret put LINE_CHANNEL_ACCESS_TOKEN
   npx wrangler secret put LINE_GROUP_ID
   npx wrangler secret put DISCORD_PUBLIC_KEY
   npx wrangler secret put DISCORD_WEBHOOK_URL
   ```

4. **Deploy the Worker**:
   ```bash
   npm run deploy
   ```

5. **Configure Webhook URLs**:
   * **Discord**: In Discord Developer Portal $\rightarrow$ General Information $\rightarrow$ **Interactions Endpoint URL**:  
     `https://<your-worker>.<subdomain>.workers.dev/api/discord`
   * **LINE**: In LINE Developers Console $\rightarrow$ Messaging API $\rightarrow$ **Webhook URL**:  
     `https://<your-worker>.<subdomain>.workers.dev/api/line` (Enable "Use Webhook").
