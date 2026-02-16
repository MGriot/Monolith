import asyncio
import httpx
import sys
import os

async def test_export_multi():
    # Login to get token
    async with httpx.AsyncClient() as client:
        # Assuming admin user exists as per memories
        login_data = {"username": "admin@admin.com", "password": "password"} # Password might be 'admin' or 'password'
        # If password is unknown, this might fail. Let's try to find a way to test without valid auth or use a known one.
        # Alternatively, I can mock the DB and call the function directly, but httpx is better for integration.
        
        # Let's try to get projects first to see if we are alive
        try:
            response = await client.post("http://localhost:8000/api/v1/login/access-token", data={"username": "admin@admin.com", "password": "password"})
            if response.status_code != 200:
                print(f"Login failed: {response.text}")
                # Try 'admin' as password
                response = await client.post("http://localhost:8000/api/v1/login/access-token", data={"username": "admin@admin.com", "password": "admin"})
            
            if response.status_code == 200:
                token = response.json()["access_token"]
                headers = {"Authorization": f"Bearer {token}"}
                
                # Test Summary CSV
                resp = await client.get("http://localhost:8000/api/v1/projects/export/all?mode=summary&format=csv", headers=headers)
                print(f"Summary CSV: {resp.status_code}")
                if resp.status_code == 200:
                    print(f"Content-Type: {resp.headers.get('content-type')}")
                    print(f"Filename: {resp.headers.get('content-disposition')}")
                    # print(resp.text[:200])
                
                # Test Details Excel
                resp = await client.get("http://localhost:8000/api/v1/projects/export/all?mode=details&format=excel", headers=headers)
                print(f"Details Excel: {resp.status_code}")
                if resp.status_code == 200:
                    print(f"Content-Type: {resp.headers.get('content-type')}")
                    print(f"Filename: {resp.headers.get('content-disposition')}")
            else:
                print("Could not obtain auth token for testing.")
        except Exception as e:
            print(f"Error during test: {e}")

if __name__ == "__main__":
    asyncio.run(test_export_multi())
