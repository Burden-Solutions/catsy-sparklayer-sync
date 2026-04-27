import 'dotenv/config';
import axios from 'axios';
import winston from 'winston';
import { createObjectCsvWriter } from 'csv-writer';
import { DateTime } from 'luxon';
import fs from 'fs';
import path from 'path';
import { parseArgs } from 'util';
import { fileURLToPath } from 'url';

// ==================== ARGUMENT PARSER ====================
const { values: cliArgs } = parseArgs({
  options: { debug: { type: 'boolean', default: false } },
  strict: false
});

// ==================== LOGGING SETUP ====================
const logFormat = winston.format.printf(({ timestamp, level, label, message }) =>
  `${timestamp} [${label || 'ROOT'}] [${level.toUpperCase()}] ${message}`
);

const rootLogger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss,SSS' }),
    logFormat
  ),
  transports: [
    new winston.transports.File({ filename: 'sync_info.log', level: 'info' }),
    new winston.transports.File({ filename: 'sync_debug.log', level: 'debug' }),
    new winston.transports.Console({ level: cliArgs.debug ? 'debug' : 'info' }),
  ]
});

export const mainLogger = rootLogger.child({ label: 'MAIN' });
export const catsyLogger = rootLogger.child({ label: 'CATSY' });
export const sparkLogger = rootLogger.child({ label: 'SPARKLAYER' });

if (cliArgs.debug) mainLogger.debug('Debug mode enabled - verbose output active');

// ==================== CONFIG ====================
const CATSY_BASE_URL = `https://api.catsy.com/api/v3/queries/${process.env.CATSY_QUERY_ID}/items`;
const CATSY_BEARER_TOKEN = process.env.CATSY_BEARER_TOKEN;
if (!CATSY_BEARER_TOKEN) throw new Error('Please set CATSY_BEARER_TOKEN in your .env file');

const CATSY_HEADERS = {
  Authorization: `Bearer ${CATSY_BEARER_TOKEN}`,
  Accept: 'application/json'
};

export const CATSY_LIMIT = 500;
const CATSY_DELAY = 500;

const SPARK_BASE_URL = process.env.SPARKLAYER_URL;
const SITE_ID = process.env.SITE_ID;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;

const BATCH_SIZE = 500;
const BATCH_DELAY = 500;

export const EXPORT_FOLDER = 'exports';
fs.mkdirSync(EXPORT_FOLDER, { recursive: true });

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || 'YOUR_DISCORD_WEBHOOK_URL_HERE';
const TEAMS_WEBHOOK_URL = process.env.TEAMS_WEBHOOK_URL || 'YOUR_TEAMS_WEBHOOK_URL_HERE';

// ==================== HELPERS ====================
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Only retry on network errors or 5xx — not 4xx (client errors are not recoverable)
const isRetryable = (err) => !err.response || err.response.status >= 500;

async function withRetry(fn, { maxAttempts = 3, baseDelay = 2000, logger = mainLogger } = {}) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxAttempts || !isRetryable(err)) throw err;
      const delay = baseDelay * 2 ** (attempt - 1);
      logger.warn(`Attempt ${attempt} failed: ${err.message}. Retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }
}

function cleanupExports(folder, keepLast = 7) {
  const files = fs.readdirSync(folder)
    .filter(f => f.startsWith('catsy_export_') && f.endsWith('.csv'))
    .sort(); // ISO timestamps are lexicographically sortable

  const toDelete = files.slice(0, Math.max(0, files.length - keepLast));
  for (const f of toDelete) {
    fs.unlinkSync(path.join(folder, f));
    mainLogger.info(`Deleted old export: ${f}`);
  }
}

// ==================== NOTIFICATION FUNCTIONS ====================
export async function sendDiscordMessage(message, isError = false) {
  try {
    if (DISCORD_WEBHOOK_URL === 'YOUR_DISCORD_WEBHOOK_URL_HERE') {
      mainLogger.info(`Discord webhook URL not configured. Message: ${message}`);
      return;
    }
    const payload = {
      username: process.env.INTEGRATION_NAME || 'Health Monitor',
      embeds: [{
        color: isError ? 0xFF0000 : 0x00FF00,
        title: isError ? '❌ Health Check Failed' : '✅ Health Check Status',
        description: message,
        timestamp: new Date().toISOString()
      }]
    };
    await axios.post(DISCORD_WEBHOOK_URL, payload);
    mainLogger.info('Discord notification sent successfully');
  } catch (err) {
    mainLogger.error(`Failed to send Discord notification: ${err.message}`);
  }
}

export async function sendTeamsMessage(message, isError = false) {
  try {
    if (TEAMS_WEBHOOK_URL === 'YOUR_TEAMS_WEBHOOK_URL_HERE') {
      mainLogger.info(`Teams webhook URL not configured. Message: ${message}`);
      return;
    }
    const sydneyTime = DateTime.now().setZone('Australia/Sydney');
    const timeStr = sydneyTime.toFormat('MMM dd, yyyy hh:mm a');

    const payload = {
      type: 'message',
      attachments: [{
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: {
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.4',
          body: [
            {
              type: 'TextBlock',
              text: isError ? '❌ Health Check Failed' : '✅ Health Check Status',
              weight: 'Bolder',
              size: 'Medium',
              color: isError ? 'Attention' : 'Good'
            },
            {
              type: 'TextBlock',
              text: message,
              wrap: true,
              color: 'Default'
            },
            {
              type: 'TextBlock',
              text: `🕐 ${timeStr}`,
              size: 'Small',
              isSubtle: true
            }
          ]
        }
      }]
    };
    await axios.post(TEAMS_WEBHOOK_URL, payload);
    mainLogger.info('Teams notification sent successfully');
  } catch (err) {
    mainLogger.error(`Failed to send Teams notification: ${err.message}`);
  }
}

export async function notify(message, isError = false) {
  await Promise.all([
    sendDiscordMessage(message, isError),
    sendTeamsMessage(message, isError)
  ]);
}

// ==================== CATSY EXPORT ====================
export async function fetchCatsyProducts(limit = CATSY_LIMIT) {
  const allProducts = [];
  let offset = 0;
  let total = null;

  catsyLogger.info('Starting full Catsy export...');
  if (cliArgs.debug) catsyLogger.debug(`Using URL: ${CATSY_BASE_URL}`);

  while (true) {
    const params = { limit, offset };
    catsyLogger.info(`Fetching offset ${offset}...`);

    let response;
    try {
      response = await withRetry(
        () => axios.get(CATSY_BASE_URL, { headers: CATSY_HEADERS, params, timeout: 90000 }),
        { maxAttempts: 3, baseDelay: 2000, logger: catsyLogger }
      );
      if (cliArgs.debug) catsyLogger.debug(`Response status: ${response.status}`);
    } catch (err) {
      catsyLogger.error(`Request failed after retries: ${err.message}`);
      break;
    }

    const data = response.data;

    if (offset === 0) {
      total = data.total ?? data.totalCount ?? data.pagination?.total_results ?? null;
      if (total) catsyLogger.info(`Total products: ${total}`);
    }

    const items = data.items || [];
    if (!items.length) {
      catsyLogger.info('No items found. Stopping export.');
      break;
    }

    allProducts.push(...items);
    catsyLogger.info(`✓ Fetched ${items.length} products | Total: ${allProducts.length}`);

    if (items.length < limit || (total && offset + limit >= total)) {
      catsyLogger.info('Reached last page.');
      break;
    }

    offset += limit;
    await sleep(CATSY_DELAY);
  }

  return allProducts;
}

export async function saveDebugCsv(products, timestampStr) {
  if (!products.length) {
    mainLogger.info('No products to save to debug CSV.');
    return;
  }

  const allKeys = new Set(products.flatMap(p => Object.keys(p)));
  const priorityKeys = ['sku', 'price_trade'];
  const fieldnames = [
    ...priorityKeys.filter(k => allKeys.has(k)),
    ...[...allKeys].filter(k => !priorityKeys.includes(k)).sort()
  ];

  const filepath = path.join(EXPORT_FOLDER, `catsy_export_${timestampStr}.csv`);
  const csvWriter = createObjectCsvWriter({
    path: filepath,
    header: fieldnames.map(id => ({ id, title: id }))
  });

  await csvWriter.writeRecords(products);
  mainLogger.info(`🗄️  Debug export saved: ${filepath} (${products.length} products)`);

  cleanupExports(EXPORT_FOLDER, 7);
}

// ==================== SPARKLAYER AUTH & PATCH ====================
export async function getSparkLayerToken() {
  const tokenUrl = `${SPARK_BASE_URL}/api/auth/token`;
  const payload = {
    grant_type: 'client_credentials',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET
  };
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'Site-Id': SITE_ID
  };

  sparkLogger.info('Requesting new access token from SparkLayer...');
  if (cliArgs.debug) sparkLogger.debug(`Token URL: ${tokenUrl}`);

  const response = await withRetry(
    () => axios.post(tokenUrl, payload, { headers }),
    { maxAttempts: 3, baseDelay: 2000, logger: sparkLogger }
  );
  sparkLogger.info('Access token obtained successfully.');
  return response.data.access_token;
}

// Accepts a pre-fetched token so the caller controls token lifecycle
export async function patchToSparkLayer(token, data, resource = 'price-lists/wholesale/pricing') {
  const url = `${SPARK_BASE_URL}/api/v1/${resource}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'Site-Id': SITE_ID
  };

  const response = await withRetry(
    () => axios.patch(url, data, { headers, timeout: 180000 }),
    { maxAttempts: 3, baseDelay: 2000, logger: sparkLogger }
  );

  sparkLogger.info(`✅ Patch successful (${data.length} items)`);
  return response.data || null;
}

function* batchItems(arr, n = 500) {
  for (let i = 0; i < arr.length; i += n) {
    yield arr.slice(i, i + n);
  }
}

// ==================== MAIN ====================
async function main() {
  const requiredEnv = ['CATSY_BEARER_TOKEN', 'SPARKLAYER_URL', 'SITE_ID', 'CLIENT_ID', 'CLIENT_SECRET'];
  const missing = requiredEnv.filter(v => !process.env[v]);
  if (missing.length) {
    mainLogger.error(`Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }

  try {
    mainLogger.info('=== Starting Catsy → SparkLayer Sync ===');

    const timestampStr = DateTime.now().toFormat('yyyy-MM-dd_HH-mm-ss');

    mainLogger.info('Fetching fresh product data from Catsy...');
    const catsyProducts = await fetchCatsyProducts();

    if (!catsyProducts.length) {
      mainLogger.warn('No products received from Catsy. Nothing to sync.');
      process.exit(0);
    }

    await saveDebugCsv(catsyProducts, timestampStr);

    const sparkLayerItems = [];
    for (const p of catsyProducts) {
      const sku = p.sku;
      const price = p.price_trade;
      if (sku && price != null) {
        const priceFloat = parseFloat(price);
        if (!isNaN(priceFloat)) {
          sparkLayerItems.push({
            sku,
            pricing: [{ quantity: 1, price: priceFloat, unit_of_measure: null }]
          });
        } else {
          catsyLogger.warn(`Invalid price_trade value for SKU ${sku}: ${price}`);
        }
      }
    }

    mainLogger.info(`Prepared ${sparkLayerItems.length} items for upload to SparkLayer.`);

    if (sparkLayerItems.length) {
      const totalBatches = Math.ceil(sparkLayerItems.length / BATCH_SIZE);
      mainLogger.info(`Uploading in ${totalBatches} batch(es)...`);

      // Fetch token once — reused across all batches
      const token = await getSparkLayerToken();

      let successCount = 0;
      let failedBatches = 0;
      let batchIndex = 1;

      for (const chunk of batchItems(sparkLayerItems, BATCH_SIZE)) {
        sparkLogger.info(`Uploading batch ${batchIndex} (${chunk.length} items)...`);
        if (cliArgs.debug) {
          sparkLogger.debug(`Batch ${batchIndex} first SKU: ${chunk[0]?.sku || 'N/A'}`);
        }
        try {
          await patchToSparkLayer(token, chunk);
          successCount += chunk.length;
        } catch (err) {
          sparkLogger.error(`Batch ${batchIndex} failed after retries: ${err.message}`);
          failedBatches++;
        }
        await sleep(BATCH_DELAY);
        batchIndex++;
      }

      mainLogger.info('🎉 All batches processed!');

      const failureNote = failedBatches > 0 ? `\n⚠️ ${failedBatches} batch(es) failed` : '';
      const successMessage =
        `✅ Sync completed!\n` +
        `📊 ${catsyProducts.length} products fetched from Catsy\n` +
        `📤 ${successCount} of ${sparkLayerItems.length} items confirmed uploaded in ${totalBatches} batches` +
        failureNote;
      await notify(successMessage, failedBatches > 0);
    } else {
      mainLogger.info('No valid products to upload to SparkLayer.');
      await notify('⚠️ Sync completed but no valid products found to upload');
    }

    mainLogger.info('=== Sync completed successfully ===');
    process.exit(0);
  } catch (err) {
    mainLogger.error(`Sync failed with unexpected error: ${err.message}`);
    mainLogger.error(err.stack);
    await notify(`❌ Sync failed with error: ${err.message}`, true);
    process.exit(1);
  }
}

// Only run when executed directly — not when imported by other scripts
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
