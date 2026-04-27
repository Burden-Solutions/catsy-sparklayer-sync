import 'dotenv/config';
import { getSparkLayerToken, patchToSparkLayer } from './main.js';

const sampleData = [
  {
    sku: 'EXAMPLE-SKU-123',
    pricing: [{ quantity: 1, price: 99.99 }]
  }
];

async function run() {
  console.log('Testing SparkLayer upload with sample data...\n');
  const token = await getSparkLayerToken();
  await patchToSparkLayer(token, sampleData);
  console.log('\nTest complete.');
}

run().catch(err => {
  console.error('Test failed:', err.message);
  process.exit(1);
});
