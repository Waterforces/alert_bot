/**
 * Utility script to register Discord Slash Commands (/add, /list, /delete)
 * Usage: node scripts/register-discord-commands.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

// Load credentials from .dev.vars or environment
function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.dev.vars');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [k, ...v] = trimmed.split('=');
        process.env[k.trim()] = v.join('=').trim();
      }
    }
  }
}

loadEnv();

const appId = process.env.DISCORD_APPLICATION_ID;
const botToken = process.env.DISCORD_BOT_TOKEN;
const guildId = process.env.DISCORD_GUILD_ID;

if (!appId || !botToken) {
  console.error('❌ Error: DISCORD_APPLICATION_ID and DISCORD_BOT_TOKEN must be set in .dev.vars');
  process.exit(1);
}

const commands = [
  {
    name: 'add',
    description: 'Add a new family calendar event',
    options: [
      {
        name: 'title',
        description: 'Event title / description',
        type: 3, // STRING
        required: true,
      },
      {
        name: 'date',
        description: 'Event date (DD/MM/YY or DD/MM/YYYY)',
        type: 3, // STRING
        required: true,
      },
      {
        name: 'time',
        description: 'Optional start time (HH:mm in 24hr format)',
        type: 3, // STRING
        required: false,
      },
    ],
  },
  {
    name: 'list',
    description: 'View upcoming family events or events on a specific date',
    options: [
      {
        name: 'date',
        description: 'Optional date filter (DD/MM/YY)',
        type: 3, // STRING
        required: false,
      },
    ],
  },
  {
    name: 'delete',
    description: 'Delete an event by its ID',
    options: [
      {
        name: 'id',
        description: 'Event ID number (e.g. 1)',
        type: 4, // INTEGER
        required: true,
      },
    ],
  },
  {
    name: 'find',
    description: 'Search for an event to check its date and start time',
    options: [
      {
        name: 'query',
        description: 'Event name or keyword to search for',
        type: 3, // STRING
        required: true,
      },
    ],
  },
];

async function registerCommands() {
  console.log(`Registering ${commands.length} slash commands to Discord...`);
  const url = `https://discord.com/api/v10/applications/${appId}/commands`;

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bot ${botToken}`,
    },
    body: JSON.stringify(commands),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`❌ Failed to register commands (${response.status}):`, errorText);
  } else {
    const data = await response.json();
    console.log('✅ Successfully registered global slash commands:');
    for (const cmd of data) {
      console.log(`   - /${cmd.name}: ${cmd.description}`);
    }
  }

  // Guild-specific registration for 0-second instant propagation
  if (guildId) {
    console.log(`Registering commands to Guild (${guildId}) for instant update...`);
    const guildUrl = `https://discord.com/api/v10/applications/${appId}/guilds/${guildId}/commands`;
    const guildRes = await fetch(guildUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bot ${botToken}`,
      },
      body: JSON.stringify(commands),
    });
    if (guildRes.ok) {
      console.log(`⚡ Instant guild commands updated for server ${guildId}!`);
    } else {
      console.error(`Failed to register guild commands:`, await guildRes.text());
    }
  }
}

registerCommands().catch(console.error);
