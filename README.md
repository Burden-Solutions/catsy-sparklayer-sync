# Catsy to SparkLayer Sync Script

A reliable Python script for syncing product pricing data from **Catsy** (PIM system) to **SparkLayer** (B2B pricing engine).

## Overview

The script performs the following steps:

1. Checks for a locally cached CSV file containing the full Catsy product export.
2. If the CSV exists and has data → loads it quickly (no API calls).
3. If no CSV or it's empty → fetches all products from the Catsy API (paginated) and caches them to CSV.
4. Extracts `sku` and `price_trade` from each product.
5. Uploads pricing updates to SparkLayer in batched PATCH requests.

Designed for daily or automated runs – safe, repeatable, and easy to monitor.

## Requirements

- Python 3.7+
- Install dependencies:

```bash
pip install requests python-dotenv
```
## Setup

Create a `.env` file in the same directory as the script:
```env
<!-- Catsy -->
CATSY_BEARER_TOKEN=your_catsy_bearer_token_here

<!-- Spark Layer -->
SPARKLAYER_URL=https://app.sparklayer.io
SITE_ID=your_site_id
CLIENT_ID=your_sparklayer_client_id
CLIENT_SECRET=your_sparklayer_client_secret
```

## Output Files
|File | Description |
|------|------|
|`catsy_products_full_export.csv` |Cached full export of all Catsy products (speeds up subsequent runs)|
|`sync_info.log` | Clean log with INFO level and above – perfect for daily monitoring|
|`sync_debug.log` | Full detailed log including DEBUG messages – for troubleshooting|

## Logging System
The script uses **two separate log files** based on severity:

| Log File | Contents | Best For |
|------|------|------|
`sync_info.log` | "INFO, WARNING, ERROR, CRITICAL only" | Normal operation & quick reviews
`sync_debug.log` |DEBUG + everything above |Investigating issues

### Console output:

- Normal run: INFO and higher
- `--debug` mode: DEBUG and higher (very verbose)

All messages are tagged with their source:

- `[MAIN]` – overall script flow
- `[CATSY]` – Catsy API operations
- `[SPARKLAYER]` – SparkLayer operations

## How to Run
### Normal daily run

```bash
python sync_script.py
```
→ Clean output and logs.

### Debug / troubleshooting run
```bash
python sync_script.py --debug
```
→ Verbose console + extra debug details in logs.

## Key Configuration (top of script)
Variable|Description|Default Value
|--------|--------|--------|
`CATSY_LIMIT`|Page size for Catsy API requests|500|
`CATSY_DELAY`|Delay (seconds) between Catsy pages|0.5|
`BATCH_SIZE`| Items per SparkLayer PATCH request|500|
`BATCH_DELAY`|Delay (seconds) between SparkLayer batches|0.5|
`OUTPUT_FILE`|Name of the cached CSV file|`catsy_products_full_export.csv`

## Safety & Reliability Features

- CSV caching avoids unnecessary Catsy API load
- Batched uploads prevent payload-too-large errors
- Polite delays between requests
- Fresh SparkLayer token for every batch
- Clear per-batch success/failure logging
- Easy `--debug` flag for deeper insight

