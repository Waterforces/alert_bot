import { Hono } from 'hono';
import { Env } from './config';
// import { handleLineWebhook } from './line'; // [Testing Mode: LINE disabled]
import { handleDiscordInteraction } from './discord';
import { handleScheduledEvent } from './scheduler';

const app = new Hono<{ Bindings: Env }>();

// Basic health check endpoint
app.get('/', (c) => c.text('Family Calendar Alert Bot is running 24/7! 🚀'));
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

// LINE Webhook Endpoint (Commented out during testing mode)
// app.post('/api/line', async (c) => {
//   return await handleLineWebhook(c.req.raw, c.env);
// });

// Discord Interactions Endpoint (Configure in Discord Developer Portal)
app.post('/api/discord', async (c) => {
  return await handleDiscordInteraction(c.req.raw, c.env);
});

// Export Cloudflare Worker handlers
export default {
  // HTTP Fetch Handler
  fetch: app.fetch,

  // Scheduled Cron Handler (00:01 AM & Event-Time Checks)
  scheduled: handleScheduledEvent,
};
