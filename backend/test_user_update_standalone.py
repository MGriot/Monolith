import asyncio
import httpx
from app.core.security import create_access_token
from app.db.session import AsyncSessionLocal
from app.crud import crud_user
from sqlalchemy import select
from app.models.user import User

async def test_user_update():
    async with AsyncSessionLocal() as db:
        # Get a user (e.g., admin)
        res = await db.execute(select(User).filter(User.email == "admin@admin.com"))
        user = res.scalars().first()
        if not user:
            print("Admin user not found for testing.")
            return

        token = create_access_token(subject=user.id)
        
        headers = {"Authorization": f"Bearer {token}"}
        
        async with httpx.AsyncClient(base_url="http://localhost:8000") as client:
            # Test GET /me
            response = await client.get("/api/v1/users/me", headers=headers)
            print(f"GET /me status: {response.status_code}")
            print(f"Current User: {response.json().get('full_name')}")

            # Test PUT /me
            new_name = "Admin Updated"
            response = await client.put(
                "/api/v1/users/me", 
                headers=headers,
                json={"full_name": new_name}
            )
            print(f"PUT /me status: {response.status_code}")
            updated_user = response.json()
            print(f"Updated User Name: {updated_user.get('full_name')}")
            
            if updated_user.get('full_name') == new_name:
                print("Verification PASSED: User full_name updated successfully.")
            else:
                print("Verification FAILED: User full_name was not updated.")

            # Revert change for cleanliness
            await client.put(
                "/api/v1/users/me", 
                headers=headers,
                json={"full_name": "Admin User"}
            )
            print("Reverted full_name to 'Admin User'")

if __name__ == "__main__":
    # Ensure the server is running if using base_url="http://localhost:8000"
    # Or we could use the app directly with httpx.AsyncClient(app=app, base_url="http://test")
    # Let's try to use the app directly to avoid needing the server running.
    from app.main import app
    
    async def run_test_with_app():
        async with AsyncSessionLocal() as db:
            res = await db.execute(select(User).filter(User.email == "admin@admin.com"))
            user = res.scalars().first()
            if not user:
                print("Admin user not found for testing.")
                return
            token = create_access_token(subject=user.id)
            headers = {"Authorization": f"Bearer {token}"}
            
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                # Test GET /me
                response = await client.get("/api/v1/users/me", headers=headers)
                print(f"GET /me status: {response.status_code}")
                
                # Test PUT /me
                new_name = "Admin Updated"
                response = await client.put(
                    "/api/v1/users/me", 
                    headers=headers,
                    json={"full_name": new_name}
                )
                print(f"PUT /me status: {response.status_code}")
                updated_user = response.json()
                print(f"Updated User Name: {updated_user.get('full_name')}")
                
                if response.status_code == 200 and updated_user.get('full_name') == new_name:
                    print("Verification PASSED")
                else:
                    print(f"Verification FAILED: {response.text}")

                # Revert
                await client.put(
                    "/api/v1/users/me", 
                    headers=headers,
                    json={"full_name": "Admin User"}
                )

    asyncio.run(run_test_with_app())
