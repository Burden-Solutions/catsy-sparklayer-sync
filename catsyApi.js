import 'dotenv/config';
import { createObjectCsvWriter } from 'csv-writer';
import { DateTime } from 'luxon';
import { fetchCatsyProducts, saveDebugCsv } from './main.js';

const LIMIT = 400; // Lower page size for standalone one-off exports
const OUTPUT_FILE = 'catsy_products_full_export.csv';

async function run() {
  console.log('Starting standalone Catsy export...\n');

  const products = await fetchCatsyProducts(LIMIT);

  if (!products.length) {
    console.log('No products were fetched. Export aborted.');
    return;
  }

  // Save a timestamped snapshot to exports/ (with automatic 7-file rotation)
  const timestampStr = DateTime.now().toFormat('yyyy-MM-dd_HH-mm-ss');
  await saveDebugCsv(products, timestampStr);

  // Also write a flat CSV to the root for quick access
  const allKeys = new Set(products.flatMap(p => Object.keys(p)));
  const priorityKeys = ['sku', 'price_trade'];
  const sortedKeys = [
    ...priorityKeys.filter(k => allKeys.has(k)),
    ...[...allKeys].filter(k => !priorityKeys.includes(k)).sort()
  ];

  console.log(`Writing ${products.length} rows with ${sortedKeys.length} columns to ${OUTPUT_FILE}...`);

  const csvWriter = createObjectCsvWriter({
    path: OUTPUT_FILE,
    header: sortedKeys.map(id => ({ id, title: id }))
  });
  await csvWriter.writeRecords(products);

  console.log(`\n🎉 SUCCESS! ${products.length} products saved to ${OUTPUT_FILE}`);
  console.log('Done!');
}

run().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
