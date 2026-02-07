import asyncio
from app.db.session import AsyncSessionLocal
from app import crud, schemas
from app.models.user import User
from app.models.task import Task
from sqlalchemy.future import select
from datetime import datetime

async def test_team_activity():
    async with AsyncSessionLocal() as db:
        # 1. Setup: Ensure we have two users
        result = await db.execute(select(User).limit(2))
        users = result.scalars().all()
        if len(users) < 2:
            print("Need at least 2 users for this test")
            return
        
        user1, user2 = users[0], users[1]
        print(f"Users: {user1.email}, {user2.email}")

        # 2. Create a team with both users
        team_in = schemas.team.TeamCreate(
            name="Activity Test Team",
            member_ids=[user1.id, user2.id]
        )
        team = await crud.team.create(db, obj_in=team_in)
        print(f"Team Created: {team.name}")

        # 3. User 1 completes a task
        # Need a project first
        project_in = schemas.project.ProjectCreate(name="Activity Project")
        project = await crud.project.create_with_owner(db, obj_in=project_in, owner_id=user1.id)
        
        task_in = schemas.task.TaskCreate(
            title="Teammate Task",
            project_id=project.id,
            owner_id=user1.id,
            assignee_ids=[user1.id]
        )
        task = await crud.task.create(db, obj_in=task_in)
        
        # Mark as done
        await crud.task.update(db, db_obj=task, obj_in={"status": "Done"})
        print(f"Task '{task.title}' completed by {user1.email}")

        # 4. Verify Activity (Logic check)
        # We simulate the endpoint logic here since we are in a script
        from app.models.associations import team_members
        
        # Current user is user2
        team_ids_query = select(team_members.c.team_id).where(team_members.c.user_id == user2.id)
        team_ids = (await db.execute(team_ids_query)).scalars().all()
        
        teammates_query = select(team_members.c.user_id).where(team_members.c.team_id.in_(team_ids))
        teammate_ids = set((await db.execute(teammates_query)).scalars().all())
        if user2.id in teammate_ids: teammate_ids.remove(user2.id)
        
        from app.models.associations import task_assignees
        from sqlalchemy import desc
        from sqlalchemy.orm import selectinload
        
        query = (
            select(Task)
            .join(task_assignees)
            .filter(task_assignees.c.user_id.in_(teammate_ids))
            .filter(Task.completed_at != None)
            .order_by(desc(Task.completed_at))
            .options(selectinload(Task.project), selectinload(Task.assignees))
        )
        
        tasks = (await db.execute(query)).scalars().all()
        print(f"Activity found: {len(tasks)} items")
        for t in tasks:
            print(f" - {t.title} in {t.project.name} (Completed: {t.completed_at})")
            
        assert len(tasks) >= 1
        assert tasks[0].title == "Teammate Task"
        
        # Cleanup
        await crud.team.remove(db, id=team.id)
        await crud.project.remove(db, id=project.id)
        print("Test passed and cleaned up")

if __name__ == "__main__":
    asyncio.run(test_team_activity())
