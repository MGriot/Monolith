from mcp.server.fastmcp import FastMCP
from app.crud import crud_project, crud_task, crud_user, crud_whiteboard
from app.db.session import AsyncSessionLocal
from app.schemas.task import TaskCreate, TaskUpdate
from app.schemas.project import ProjectCreate, ProjectUpdate
from app.schemas.whiteboard import WhiteboardCreate
from app.schemas.idea import IdeaCreate
from app.core.enums import Status, Priority
from app.core.cpm import calculate_cpm as run_cpm
from uuid import UUID
from datetime import datetime, timedelta
from typing import List, Optional, Any
import json

from app.models.task import Task
from app.models.project import Project
from app.models.idea import Idea
from sqlalchemy import select, and_, func
from sqlalchemy.orm import selectinload

mcp = FastMCP("Monolith Planner", dependencies=["sqlalchemy", "asyncpg", "pydantic"])

# --- ANALYTICS & RECAP TOOLS ---

@mcp.tool()
async def get_activity_recap(days: int = 30) -> str:
    """Get a detailed recap of all activity (new tasks, completed, deadlines) across projects."""
    async with AsyncSessionLocal() as db:
        try:
            limit_date = datetime.utcnow() - timedelta(days=days)

            # 1. New Tasks
            new_tasks_stmt = select(Task).where(
                Task.created_at >= limit_date,
                Task.is_archived == False
            ).order_by(Task.created_at.desc()).limit(10)
            
            # 2. Completed Tasks
            comp_tasks_stmt = select(Task).where(
                Task.completed_at >= limit_date,
                Task.is_archived == False
            ).order_by(Task.completed_at.desc()).limit(10)

            # 3. Upcoming Deadlines
            deadlines_stmt = select(Task).where(
                Task.due_date >= datetime.utcnow(),
                Task.status != Status.DONE,
                Task.is_archived == False
            ).order_by(Task.due_date.asc()).limit(10)

            res_new = await db.execute(new_tasks_stmt)
            res_comp = await db.execute(comp_tasks_stmt)
            res_dead = await db.execute(deadlines_stmt)

            new_tasks = res_new.scalars().all()
            comp_tasks = res_comp.scalars().all()
            deadlines = res_dead.scalars().all()

            output = [f"SYSTEM ACTIVITY RECAP (Last {days} days)", "=" * 40]
            
            output.append("\nNEWLY CREATED:")
            for t in new_tasks:
                output.append(f"- {t.title} (Created: {t.created_at.strftime('%Y-%m-%d')})")
            
            output.append("\nRECENTLY FINISHED:")
            for t in comp_tasks:
                output.append(f"- {t.title} (Finished: {t.completed_at.strftime('%Y-%m-%d')})")
            
            output.append("\nUPCOMING DEADLINES:")
            for t in deadlines:
                output.append(f"- {t.title} (Due: {t.due_date.strftime('%Y-%m-%d')})")

            return "\n".join(output)
        except Exception as e:
            return f"Error fetching activity recap: {str(e)}"

@mcp.tool()
async def calculate_critical_path(project_id: str) -> str:
    """Run professional CPM calculation for a project to identify critical tasks and slack."""
    async with AsyncSessionLocal() as db:
        try:
            pid = UUID(project_id)
            tasks = await crud_task.task.get_multi_by_project(db, project_id=pid)
            if not tasks:
                return f"No tasks found for project {project_id}"

            # The calculate_cpm tool updates the task objects in-place (if schemas)
            # or we use the logic from core.cpm
            from app import schemas
            schema_tasks = [schemas.Task.from_orm(t) for t in tasks]
            run_cpm(schema_tasks)

            output = [f"CRITICAL PATH ANALYSIS: {project_id}", "=" * 40]
            critical = [t for t in schema_tasks if t.is_critical]
            non_critical = [t for t in schema_tasks if not t.is_critical]

            output.append(f"CRITICAL TASKS ({len(critical)}):")
            for t in sorted(critical, key=lambda x: x.wbs_code):
                output.append(f"- [{t.wbs_code}] {t.title} (ES: {t.start_date.date() if t.start_date else 'N/A'})")

            output.append(f"\nNON-CRITICAL TASKS ({len(non_critical)}):")
            for t in sorted(non_critical, key=lambda x: x.slack_days, reverse=True):
                output.append(f"- [{t.wbs_code}] {t.title} (Slack: {t.slack_days} days)")

            return "\n".join(output)
        except Exception as e:
            return f"Error calculating critical path: {str(e)}"

@mcp.tool()
async def get_portfolio_health() -> str:
    """Get health metrics for all active projects, identifying overdue tasks and risks."""
    async with AsyncSessionLocal() as db:
        try:
            projects = await crud_project.project.get_multi(db, limit=1000)
            projects = [p for p in projects if not p.is_archived]
            if not projects: return "No active projects found."
            
            output = [f"PORTFOLIO HEALTH REPORT ({datetime.utcnow().strftime('%Y-%m-%d')})", "=" * 40]
            now = datetime.utcnow()
            for p in projects:
                tasks_stmt = select(Task).filter(Task.project_id == p.id, Task.is_archived == False)
                tasks_res = await db.execute(tasks_stmt)
                tasks = tasks_res.scalars().all()
                overdue = sum(1 for t in tasks if t.due_date and t.due_date < now and t.status != Status.DONE)
                score = 100.0 - (overdue * 5.0)
                if p.status == "On hold": score -= 20
                score = max(0.0, min(100.0, score))
                risk = "High" if score < 50 or overdue > 5 else "Medium" if score < 80 or overdue > 2 else "Low"
                output.append(f"- {p.name}: {score:.0f}/100 Health | Risk: {risk} | Overdue: {overdue} | Progress: {p.progress_percent:.1f}%")
            return "\n".join(output)
        except Exception as e:
            return f"Error: {str(e)}"

# --- IDEA HUB TOOLS ---

@mcp.tool()
async def propose_idea(title: str, description: str, project_id: str = None, task_id: str = None) -> str:
    """Propose a new project idea or feature request."""
    async with AsyncSessionLocal() as db:
        try:
            # Use admin as default author for MCP-created ideas
            res_admin = await db.execute(select(crud_user.User).filter(crud_user.User.email == 'admin@admin.com'))
            admin = res_admin.scalars().first()
            
            idea_in = IdeaCreate(
                title=title,
                description=description,
                project_id=UUID(project_id) if project_id else None,
                task_id=UUID(task_id) if task_id else None
            )
            
            from app.crud.crud_idea import idea as crud_idea
            idea_obj = await crud_idea.create_with_author(db, obj_in=idea_in, author_id=admin.id)
            return f"Idea '{title}' proposed successfully with ID: {idea_obj.id}"
        except Exception as e:
            return f"Error proposing idea: {str(e)}"

@mcp.tool()
async def list_ideas(project_id: str = None) -> str:
    """List project ideas and feature requests."""
    async with AsyncSessionLocal() as db:
        try:
            stmt = select(Idea)
            if project_id:
                stmt = stmt.where(Idea.project_id == UUID(project_id))
            
            res = await db.execute(stmt)
            ideas = res.scalars().all()
            if not ideas: return "No ideas found."
            return "\n".join([f"- {i.title} (ID: {i.id}, Status: {i.status})" for i in ideas])
        except Exception as e:
            return f"Error listing ideas: {str(e)}"

# --- USER TOOLS ---

@mcp.tool()
async def create_user(email: str, password: str, full_name: str = None, is_superuser: bool = False) -> str:
    """Create a new user."""
    async with AsyncSessionLocal() as db:
        try:
            user_exists = await crud_user.get_by_email(db, email=email)
            if user_exists: return f"User '{email}' exists."
            from app.schemas.user import UserCreate
            user_in = UserCreate(email=email, password=password, full_name=full_name, is_superuser=is_superuser)
            user_obj = await crud_user.create(db, obj_in=user_in)
            return f"User '{email}' created with ID: {user_obj.id}"
        except Exception as e: return f"Error: {str(e)}"

@mcp.resource("users://list")
async def list_users() -> str:
    """List all users."""
    async with AsyncSessionLocal() as db:
        users = await crud_user.get_multi(db, limit=1000)
        return "\n".join([f"- {u.email} (ID: {u.id}, Name: {u.full_name})" for u in users]) if users else "No users."

# --- PROJECT TOOLS ---

@mcp.tool()
async def create_project(name: str, topic: str = None, type: str = None, description: str = None, start_date: str = None, due_date: str = None) -> str:
    """Create a new project. Dates: YYYY-MM-DD."""
    async with AsyncSessionLocal() as db:
        try:
            users = await crud_user.get_multi(db, limit=1)
            project_in = ProjectCreate(
                name=name, topic=topic, type=type, description=description,
                start_date=datetime.fromisoformat(start_date) if start_date else None,
                due_date=datetime.fromisoformat(due_date) if due_date else None
            )
            project_obj = await crud_project.project.create_with_owner(db, obj_in=project_in, owner_id=users[0].id)
            return f"Project '{name}' created: {project_obj.id}"
        except Exception as e: return f"Error: {str(e)}"

@mcp.tool()
async def get_project_details(project_id: str) -> str:
    """Get full project details and WBS structure."""
    async with AsyncSessionLocal() as db:
        project = await crud_project.project.get(db, id=UUID(project_id))
        if not project: return f"Project {project_id} not found."
        tasks = await crud_task.task.get_multi_by_project(db, project_id=UUID(project_id))
        def build_tree(task_list, parent_id=None, indent=0):
            res = []
            for t in [x for x in task_list if x.parent_id == parent_id]:
                res.append(f"{'  ' * indent}- [{t.wbs_code}] {t.title} ({t.status})")
                res.extend(build_tree(task_list, t.id, indent + 1))
            return res
        return f"Project: {project.name}\nStatus: {project.status} | Progress: {project.progress_percent:.1f}%\nWBS:\n" + "\n".join(build_tree(tasks))

@mcp.resource("projects://list")
async def list_projects() -> str:
    """List all projects."""
    async with AsyncSessionLocal() as db:
        projects = await crud_project.project.get_multi(db, limit=1000)
        return "\n".join([f"- {p.name} (ID: {p.id}, Progress: {p.progress_percent:.1f}%)" for p in projects]) if projects else "No projects."

# --- TASK TOOLS ---

@mcp.tool()
async def create_task(project_id: str, title: str, description: str = None, status: str = "Todo", start_date: str = None, due_date: str = None, parent_id: str = None) -> str:
    """Create a task or subtask."""
    async with AsyncSessionLocal() as db:
        try:
            task_in = TaskCreate(
                title=title, project_id=UUID(project_id), parent_id=UUID(parent_id) if parent_id else None,
                description=description, status=Status.TODO, priority=Priority.MEDIUM,
                start_date=datetime.fromisoformat(start_date) if start_date else None,
                due_date=datetime.fromisoformat(due_date) if due_date else None
            )
            task_obj = await crud_task.task.create(db, obj_in=task_in)
            return f"Task '{title}' created: {task_obj.id} (WBS: {task_obj.wbs_code})"
        except Exception as e: return f"Error: {str(e)}"

@mcp.tool()
async def update_task(task_id: str, **kwargs) -> str:
    """Update a task. (title, description, status, priority, etc.)"""
    async with AsyncSessionLocal() as db:
        try:
            task_obj = await crud_task.task.get(db, id=UUID(task_id))
            if not task_obj: return f"Task {task_id} not found."
            for k, v in kwargs.items():
                if k in ["start_date", "due_date", "deadline_at", "completed_at"] and v:
                    kwargs[k] = datetime.fromisoformat(v)
            task_update = TaskUpdate(**kwargs)
            await crud_task.task.update(db, db_obj=task_obj, obj_in=task_update)
            return f"Task '{task_obj.title}' updated."
        except Exception as e: return f"Error: {str(e)}"

# --- SEARCH ---

@mcp.tool()
async def search(query: str) -> str:
    """Search across projects, tasks, and ideas."""
    async with AsyncSessionLocal() as db:
        p_res = await db.execute(select(Project).filter(Project.name.ilike(f"%{query}%")))
        t_res = await db.execute(select(Task).filter(Task.title.ilike(f"%{query}%")))
        i_res = await db.execute(select(Idea).filter(Idea.title.ilike(f"%{query}%")))
        out = []
        for p in p_res.scalars().all(): out.append(f"PROJECT: {p.name} (ID: {p.id})")
        for t in t_res.scalars().all(): out.append(f"TASK: [{t.wbs_code}] {t.title} (ID: {t.id})")
        for i in i_res.scalars().all(): out.append(f"IDEA: {i.title} (ID: {i.id})")
        return "\n".join(out) if out else "No results."
