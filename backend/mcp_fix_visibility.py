import asyncio
from app.db.session import AsyncSessionLocal
from app.crud import crud_project, crud_user

async def fix_visibility():
    async with AsyncSessionLocal() as db:
        users = await crud_user.get_multi(db)
        tester = next((u for u in users if u.email == "tester@example.com"), None)
        admin = next((u for u in users if u.email == "admin@admin.com"), None)
        
        if not tester:
            print("Tester user not found.")
            return
            
        print(f"Tester ID: {tester.id}")
        
        projects = await crud_project.project.get_multi(db)
        for p in projects:
            if p.owner_id != tester.id:
                print(f"Transferring project '{p.name}' to tester...")
                await crud_project.project.update(db, db_obj=p, obj_in={"owner_id": tester.id})
        
        await db.commit()
        print("Done! All projects are now owned by tester@example.com")

if __name__ == "__main__":
    asyncio.run(fix_visibility())
