import os
import requests
from dotenv import load_dotenv  # If using python-dotenv to load .env
import json

load_dotenv()  # Load your .env file

# Use test environment
BASE_URL = os.getenv('SPARKLAYER_URL')  # https://test.app.sparklayer.io
SITE_ID = os.getenv('SITE_ID')
CLIENT_ID = os.getenv('CLIENT_ID')
CLIENT_SECRET = os.getenv('CLIENT_SECRET')

#OAuth 2
def get_access_token():
    token_url = f"{BASE_URL}/api/auth/token"
    payload = {
        'grant_type': 'client_credentials',
        'client_id': CLIENT_ID,
        'client_secret': CLIENT_SECRET,
    }
    headers = {'Content-Type': 'application/json'}
    
    response = requests.post(token_url, data=payload, headers=headers)
    response.raise_for_status()
    return response.json()['access_token']

# JSON
def get_access_token2():
    token_url = f"{BASE_URL}/api/auth/token"

    payload = {
        "grant_type": "client_credentials",
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET
    }

    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Site-ID": SITE_ID
    }

    response = requests.post(token_url, json=payload, headers=headers)
    response.raise_for_status()

    return response.json()["access_token"]

def upload_data(data):
    token = get_access_token2()

    url = f"{BASE_URL}/api/v1/price-lists/wholesale/pricing"

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Site-Id": SITE_ID
    }

    response = requests.patch(url, json=data, headers=headers)

    if response.status_code in (200, 201, 204):
        print("✅ Patch successful")
        if response.content:
            return response.json()
        else:
            return None
    else:
        print(f"❌ Patch error {response.status_code}: {response.text}")
        return None

sample_data = [
    {
        "sku": "EXAMPLE-SKU-123",
        "pricing": [
            {
                "quantity": 1,
                "price": 99.99
            }
        ]
    }
]

upload_data(sample_data)

