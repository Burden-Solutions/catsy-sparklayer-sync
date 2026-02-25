import requests
import csv
import time
from dotenv import load_dotenv
import os

load_dotenv()

# ==================== CONFIG ====================
BASE_URL = f"https://api.catsy.com/api/v3/queries/{os.getenv('CATSY_QUERY_ID')}/items"

BEARER_TOKEN = os.getenv("CATSY_BEARER_TOKEN")
if not BEARER_TOKEN:
    raise ValueError("Please set CATSY_BEARER_TOKEN in your .env file")

HEADERS = {
    "Authorization": f"Bearer {BEARER_TOKEN}",
    "Accept": "application/json"
}

LIMIT = 400  # Start with 200; increase to 500 if it works (fewer requests = faster)
OUTPUT_FILE = "catsy_products_full_export.csv"
DELAY = 0.5  # Seconds between requests — increase if you hit rate limits
# ================================================

all_products = []
offset = 0
total = None

print("Starting full Catsy export...\n")
print(f"Using endpoint: {BASE_URL}")
print(f"Limit per page: {LIMIT}\n")

while True:
    params = {
        "limit": LIMIT,
        "offset": offset
    }

    print(f"Fetching offset {offset} (limit: {LIMIT})...")

    try:
        response = requests.get(BASE_URL, headers=HEADERS, params=params, timeout=90)
    except Exception as e:
        print(f"Request failed: {e}")
        break

    if response.status_code != 200:
        print(f"Error {response.status_code}: {response.text[:500]}")
        break

    data = response.json()

    # First response: show structure for debugging
    if offset == 0:
        print(f"Response keys: {list(data.keys())}")
        total = data.get("total") or data.get("totalCount") or data.get("pagination", {}).get("total_results")
        if total:
            print(f"Total products to export: {total}")
            estimated_pages = (total // LIMIT) + 1
            print(f"Estimated pages: {estimated_pages}")

    # Extract items (common key is "items")
    items = data.get("items", [])
    if not items:
        print("No 'items' found. Full response keys:", list(data.keys()))
        print("Sample response:", data)
        break

    all_products.extend(items)
    print(f"✓ Fetched {len(items)} products | Total collected: {len(all_products)}")

    # Stop if last page
    if len(items) < LIMIT:
        print("Last page detected (fewer than limit items).")
        break

    if total and offset + LIMIT >= total:
        print("Reached total count.")
        break

    offset += LIMIT
    time.sleep(DELAY)

# ==================== EXPORT TO CSV ====================
print("\nExporting to CSV...")

if not all_products:
    print("No products were fetched. Export aborted.")
else:
    # Get all unique columns
    all_keys = set()
    for product in all_products:
        all_keys.update(product.keys())

    # Prioritize your key columns
    priority_keys = ["sku", "price_trade"]
    sorted_keys = [k for k in priority_keys if k in all_keys] + sorted([k for k in all_keys if k not in priority_keys])

    print(f"Writing {len(all_products)} rows with {len(sorted_keys)} columns to {OUTPUT_FILE}...")

    with open(OUTPUT_FILE, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=sorted_keys)
        writer.writeheader()
        writer.writerows(all_products)

    print(f"\n🎉 SUCCESS! Full export complete.")
    print(f"   → {len(all_products)} products saved to {OUTPUT_FILE}")

print("\nDone!")