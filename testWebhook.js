import 'dotenv/config';
import { sendDiscordMessage, sendTeamsMessage } from './main.js';

const message =
  '🔔 Webhook test\n' +
  'If you see this message, the connection is working correctly.\n' +
  `Sent at: ${new Date().toISOString()}`;

console.log('Testing Discord webhook...');
await sendDiscordMessage(message, false);

console.log('Testing Teams webhook...');
await sendTeamsMessage(message, false);

console.log('\n✅ Done. Check your Discord and Teams channels for the test message.');
