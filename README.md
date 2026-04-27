# Catsy to SparkLayer Sync

A Node.js utility that synchronises B2B pricing data from Catsy PIM into SparkLayer. On every run it fetches fresh product data from Catsy, exports a timestamped CSV snapshot, then pushes trade pricing to SparkLayer via batched PATCH requests.

## How it works

1. **Fetch** — Paginates through the Catsy API (`GET /api/v3/queries/:id/items`) collecting all products. Retries up to 3 times with exponential backoff on transient failures.
2. **Export** — Saves a timestamped CSV snapshot to `exports/`. Automatically keeps only the last 7 files.
3. **Transform** — Maps each product's `sku` and `price_trade` fields to the SparkLayer pricing schema.
4. **Authenticate** — Obtains a single OAuth2 token from SparkLayer, reused across all batches in the same run.
5. **Upload** — Pushes items to SparkLayer in batches via `PATCH /api/v1/price-lists/wholesale/pricing`. Failed batches are retried up to 3 times and counted separately so the notification reflects confirmed uploads only.
6. **Notify** — Sends a success or failure message to Discord and/or Teams, reporting confirmed vs total item counts.

## Prerequisites

- Node.js 18 or higher

## Installation

```bash
npm install
```

## Environment Configuration

Copy `.env.example` to `.env` and fill in your values:

```env
# Catsy API
CATSY_BEARER_TOKEN=your_catsy_bearer_token_here
CATSY_QUERY_ID=your_query_id_here

# SparkLayer API
SPARKLAYER_URL=https://your-sparklayer-instance.com
SITE_ID=your_site_id_here
CLIENT_ID=your_client_id_here
CLIENT_SECRET=your_client_secret_here

# Notifications (optional)
DISCORD_WEBHOOK_URL=your_discord_webhook_url
TEAMS_WEBHOOK_URL=your_teams_webhook_url
INTEGRATION_NAME=Catsy SparkLayer Sync
```

## Usage

```bash
# Standard sync run
npm start

# Verbose debug output
npm run start:debug

# Test Discord and Teams webhook connectivity
npm run test-webhook

# Standalone Catsy → CSV export only
npm run catsy-export

# Test SparkLayer upload with a sample SKU
npm run sparklayer-test
```

## Scheduling on Linux (systemd)

The repo includes `catsy-sparklayer-sync.service` and `catsy-sparklayer-sync.timer` which run the sync daily at **7am AEST** via systemd.

**Setup:**

1. Edit both files and update `WorkingDirectory` and `User` to match your server.
2. Copy them into systemd and enable the timer:

```bash
sudo cp catsy-sparklayer-sync.service catsy-sparklayer-sync.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now catsy-sparklayer-sync.timer
```

3. Verify the timer is scheduled:

```bash
systemctl status catsy-sparklayer-sync.timer
systemctl list-timers catsy-sparklayer-sync.timer
```

4. Trigger a manual run at any time:

```bash
sudo systemctl start catsy-sparklayer-sync.service
journalctl -u catsy-sparklayer-sync.service -f
```

## Logging

Two log files are written on every run:

| File | Level | Purpose |
|---|---|---|
| `sync_info.log` | INFO and above | Clean log for daily monitoring |
| `sync_debug.log` | DEBUG and above | Full trace for troubleshooting |

Pass `--debug` to also print debug-level messages to the console.

## Key Configuration

These constants live at the top of `main.js`:

| Variable | Description | Default |
|---|---|---|
| `CATSY_LIMIT` | Page size for Catsy API requests | 500 |
| `CATSY_DELAY` | Delay (ms) between Catsy pages | 500 |
| `BATCH_SIZE` | Items per SparkLayer PATCH request | 500 |
| `BATCH_DELAY` | Delay (ms) between SparkLayer batches | 500 |

## Project Structure

```
main.js                          # Main sync entrypoint — exports shared functions
catsyApi.js                      # Standalone Catsy → CSV export script
sparkLayerApi.js                 # Standalone SparkLayer upload test script
testWebhook.js                   # Discord + Teams webhook connectivity test
catsy-sparklayer-sync.service    # systemd service unit
catsy-sparklayer-sync.timer      # systemd timer (7am AEST daily)
exports/                         # Timestamped CSV snapshots — last 7 kept automatically
sync_info.log                    # INFO-level log (auto-created on first run)
sync_debug.log                   # DEBUG-level log (auto-created on first run)
```
