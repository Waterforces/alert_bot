export interface Env {
  // Cloudflare D1 Database binding
  DB: D1Database;

  // LINE Bot Credentials (Optional during Discord-only testing)
  LINE_CHANNEL_SECRET?: string;
  LINE_CHANNEL_ACCESS_TOKEN?: string;
  LINE_GROUP_ID?: string;

  // Discord Bot Credentials
  DISCORD_APPLICATION_ID: string;
  DISCORD_PUBLIC_KEY: string;
  DISCORD_BOT_TOKEN: string;
  DISCORD_WEBHOOK_URL: string;
  DISCORD_CHANNEL_ID?: string;
}

// Canonical Timezone for all date calculations
export const TIMEZONE = 'Asia/Bangkok'; // UTC+7
export const BANGKOK_OFFSET_HOURS = 7;
