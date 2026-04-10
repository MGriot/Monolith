from mcp.server.fastmcp import FastMCP
from app.crud import crud_project, crud_task, crud_user, crud_whiteboard
from app.db.session import AsyncSessionLocal
from app.schemas.task import TaskCreate, TaskUpdate
from app.schemas.project import ProjectCreate, ProjectUpdate
from app.schemas.whiteboard import WhiteboardCreate
from app.core.enums import Status, Priority
from uuid import UUID
from datetime import datetime
from typing import List, Optional
import json

mcp = FastMCP("Monolith Planner", dependencies=["sqlalchemy", "asyncpg", "pydantic"])

# --- USER TOOLS ---

@mcp.tool()
async def create_user(email: str, password: str, full_name: str = None, is_superuser: bool = False) -> str:
    """Create a new user in the system."""
    async with AsyncSessionLocal() as db:
        try:
            user_exists = await crud_user.get_by_email(db, email=email)
            if user_exists:
                return f"User with email '{email}' already exists."
            
            from app.schemas.user import UserCreate
            user_in = UserCreate(
                email=email,
                password=password,
                full_name=full_name,
                is_superuser=is_superuser
            )
            user_obj = await crud_user.create(db, obj_in=user_in)
            return f"Successfully created user '{email}' with ID: {user_obj.id}"
        except Exception as e:
            return f"Error creating user: {str(e)}"

@mcp.resource("users://list")
async def list_users() -> str:
    """List all users in the system."""
    async with AsyncSessionLocal() as db:
        users = await crud_user.get_multi(db, limit=1000)
        if not users:
            return "No users found."
        return "\n".join([f"- {u.email} (ID: {u.id}, Name: {u.full_name}, Superuser: {u.is_superuser})" for u in users])

# --- PROJECT TOOLS ---

@mcp.tool()
async def create_project(
    name: str, 
    topic: str = None, 
    type: str = None, 
    description: str = None,
    start_date: str = None,
    due_date: str = None,
    owner_id: str = None
) -> str:
    """Create a new project. Dates in ISO format (YYYY-MM-DD)."""
    async with AsyncSessionLocal() as db:
        try:
            target_owner_id = None
            if owner_id:
                target_owner_id = UUID(owner_id)
            else:
                users = await crud_user.get_multi(db, limit=1)
                if not users:
                    return "Error: No users found. Create a user first."
                target_owner_id = users[0].id
            
            project_in = ProjectCreate(
                name=name,
                topic=topic,
                type=type,
                description=description,
                start_date=datetime.fromisoformat(start_date) if start_date else None,
                due_date=datetime.fromisoformat(due_date) if due_date else None
            )
            project_obj = await crud_project.project.create_with_owner(
                db, obj_in=project_in, owner_id=target_owner_id
            )
            return f"Successfully created project '{name}' with ID: {project_obj.id}"
        except Exception as e:
            return f"Error creating project: {str(e)}"

@mcp.tool()
async def update_project(
    project_id: str,
    name: str = None,
    topic: str = None,
    type: str = None,
    description: str = None,
    status: str = None,
    start_date: str = None,
    due_date: str = None
) -> str:
    """Update an existing project."""
    async with AsyncSessionLocal() as db:
        try:
            project_obj = await crud_project.project.get(db, id=UUID(project_id))
            if not project_obj:
                return f"Project with ID {project_id} not found."
            
            update_data = {}
            if name: update_data["name"] = name
            if topic: update_data["topic"] = topic
            if type: update_data["type"] = type
            if description: update_data["description"] = description
            if status:
                try:
                    update_data["status"] = next(s for s in Status if s.value.lower() == status.lower())
                except StopIteration: pass
            if start_date: update_data["start_date"] = datetime.fromisoformat(start_date)
            if due_date: update_data["due_date"] = datetime.fromisoformat(due_date)
            
            project_in = ProjectUpdate(**update_data)
            await crud_project.project.update(db, db_obj=project_obj, obj_in=project_in)
            return f"Successfully updated project '{project_obj.name}'"
        except Exception as e:
            return f"Error updating project: {str(e)}"

@mcp.tool()
async def search_projects(query: str) -> str:
    """Search for projects by name or description."""
    async with AsyncSessionLocal() as db:
        projects = await crud_project.project.get_multi(db, limit=1000)
        matches = [p for p in projects if query.lower() in p.name.lower() or (p.description and query.lower() in p.description.lower())]
        if not matches:
            return f"No projects found matching '{query}'"
        return "\n".join([f"- {p.name} (ID: {p.id}, Status: {p.status})" for p in matches])

@mcp.tool()
async def unified_search(query: str) -> str:
    """Search across projects, tasks, and ideas in one go."""
    async with AsyncSessionLocal() as db:
        # Projects
        projects = await crud_project.project.get_multi(db, limit=500)
        p_matches = [p for p in projects if query.lower() in p.name.lower()]
        
        # Tasks
        tasks = await crud_task.task.get_multi(db, limit=500)
        t_matches = [t for t in tasks if query.lower() in t.title.lower()]
        
        # Ideas
        from app.models.idea import Idea
        from sqlalchemy import select
        idea_res = await db.execute(select(Idea).filter(Idea.title.ilike(f"%{query}%")))
        i_matches = idea_res.scalars().all()
        
        output = []
        if p_matches:
            output.append("PROJECTS:")
            output.extend([f"  - {p.name} (ID: {p.id})" for p in p_matches])
        if t_matches:
            output.append("TASKS:")
            output.extend([f"  - [{t.wbs_code}] {t.title} (ID: {t.id})" for t in t_matches])
        if i_matches:
            output.append("IDEAS:")
            output.extend([f"  - {i.title} (ID: {i.id})" for i in i_matches])
            
        return "\n".join(output) if output else f"No results for '{query}'"

@mcp.tool()
async def get_project_details(project_id: str) -> str:
    """Get full details of a project including its WBS structure."""
    async with AsyncSessionLocal() as db:
        project = await crud_project.project.get(db, id=UUID(project_id))
        if not project:
            return f"Project {project_id} not found."
        
        tasks = await crud_task.task.get_multi_by_project(db, project_id=UUID(project_id))
        
        # Simple tree representation
        def build_tree(task_list, parent_id=None, indent=0):
            res = []
            for t in [x for x in task_list if x.parent_id == parent_id]:
                res.append(f"{'  ' * indent}- [{t.wbs_code}] {t.title} ({t.status})")
                res.extend(build_tree(task_list, t.id, indent + 1))
            return res

        tree = build_tree(tasks)
        return (
            f"Project: {project.name}\n"
            f"Topic: {project.topic} | Type: {project.type}\n"
            f"Status: {project.status} | Progress: {project.progress_percent:.1f}%\n"
            f"Description: {project.description or 'No description'}\n"
            f"WBS Structure:\n" + "\n".join(tree)
        )

@mcp.resource("projects://list")
async def list_projects() -> str:
    """List all projects in the system."""
    async with AsyncSessionLocal() as db:
        projects = await crud_project.project.get_multi(db, limit=1000)
        if not projects:
            return "No projects found."
        lines = []
        for p in projects:
            lines.append(f"- {p.name} (ID: {p.id}, Progress: {p.progress_percent:.1f}%, Status: {p.status})")
        return "\n".join(lines)

# --- TASK TOOLS ---

@mcp.tool()
async def create_task(
    project_id: str, 
    title: str, 
    description: str = None, 
    status: str = "Todo",
    priority: str = "Medium",
    start_date: str = None,
    due_date: str = None,
    parent_id: str = None
) -> str:
    """Create a new task or subtask. Dates in ISO format (YYYY-MM-DD)."""
    async with AsyncSessionLocal() as db:
        try:
            status_enum = Status.TODO
            try:
                status_enum = next(s for s in Status if s.value.lower() == status.lower())
            except StopIteration: pass

            priority_enum = Priority.MEDIUM
            try:
                priority_enum = next(p for p in Priority if p.value.lower() == priority.lower())
            except StopIteration: pass

            task_in = TaskCreate(
                title=title,
                project_id=UUID(project_id),
                parent_id=UUID(parent_id) if parent_id else None,
                description=description,
                status=status_enum,
                priority=priority_enum,
                start_date=datetime.fromisoformat(start_date) if start_date else None,
                due_date=datetime.fromisoformat(due_date) if due_date else None
            )
            task_obj = await crud_task.task.create(db, obj_in=task_in)
            return f"Successfully created task '{title}' with ID: {task_obj.id} and WBS: {task_obj.wbs_code}"
        except Exception as e:
            return f"Error creating task: {str(e)}"

@mcp.tool()
async def update_task(
    task_id: str,
    title: str = None,
    description: str = None,
    status: str = None,
    priority: str = None,
    start_date: str = None,
    due_date: str = None,
    deadline_at: str = None,
    completed_at: str = None,
    is_milestone: bool = None
) -> str:
    """Update an existing task."""
    async with AsyncSessionLocal() as db:
        try:
            task_obj = await crud_task.task.get(db, id=UUID(task_id))
            if not task_obj:
                return f"Task with ID {task_id} not found."
            
            update_data = {}
            if title: update_data["title"] = title
            if description: update_data["description"] = description
            if status:
                try:
                    update_data["status"] = next(s for s in Status if s.value.lower() == status.lower())
                except StopIteration: pass
            if priority:
                try:
                    update_data["priority"] = next(p for p in Priority if p.value.lower() == priority.lower())
                except StopIteration: pass
            if start_date: update_data["start_date"] = datetime.fromisoformat(start_date)
            if due_date: update_data["due_date"] = datetime.fromisoformat(due_date)
            if deadline_at: update_data["deadline_at"] = datetime.fromisoformat(deadline_at)
            if completed_at: update_data["completed_at"] = datetime.fromisoformat(completed_at)
            if is_milestone is not None: update_data["is_milestone"] = is_milestone
            
            task_update = TaskUpdate(**update_data)
            await crud_task.task.update(db, db_obj=task_obj, obj_in=task_update)
            return f"Successfully updated task '{task_obj.title}'"
        except Exception as e:
            return f"Error updating task: {str(e)}"

@mcp.tool()
async def assign_task(task_id: str, user_ids: List[str]) -> str:
    """Assign users to a task by their IDs."""
    async with AsyncSessionLocal() as db:
        try:
            task_obj = await crud_task.task.get(db, id=UUID(task_id))
            if not task_obj:
                return f"Task {task_id} not found."
            
            uids = [UUID(uid) for uid in user_ids]
            # Use specialized method if available, or manual update
            await crud_task.task.update_assignees(db, task_id=UUID(task_id), user_ids=uids)
            return f"Successfully updated assignees for task '{task_obj.title}'"
        except Exception as e:
            return f"Error assigning task: {str(e)}"

@mcp.tool()
async def search_tasks(query: str, project_id: str = None) -> str:
    """Search tasks by title or description."""
    async with AsyncSessionLocal() as db:
        tasks = await crud_task.task.get_multi(db, limit=1000)
        matches = [t for t in tasks if query.lower() in t.title.lower() or (t.description and query.lower() in t.description.lower())]
        if project_id:
            matches = [t for t in matches if str(t.project_id) == project_id]
        
        if not matches:
            return f"No tasks found matching '{query}'"
        
        return "\n".join([f"- [{t.wbs_code}] {t.title} (ID: {t.id}, Status: {t.status})" for t in matches])

# --- SYSTEM TAXONOMY TOOLS ---

@mcp.resource("system://topics")
async def list_topics() -> str:
    """List all project topics used in the system."""
    async with AsyncSessionLocal() as db:
        projects = await crud_project.project.get_multi(db, limit=1000)
        topics = sorted(list(set([p.topic for p in projects if p.topic])))
        return "\n".join([f"- {t}" for t in topics]) if topics else "No topics defined."

@mcp.resource("system://types")
async def list_types() -> str:
    """List all project types used in the system."""
    async with AsyncSessionLocal() as db:
        projects = await crud_project.project.get_multi(db, limit=1000)
        types = sorted(list(set([p.type for p in projects if p.type])))
        return "\n".join([f"- {t}" for t in types]) if types else "No types defined."

# --- WHITEBOARD TOOLS ---

@mcp.tool()
async def create_whiteboard_sketch(title: str, project_id: str, task_id: str = None, description: str = None) -> str:
    """Create a new Whiteboard sketch for a project or task."""
    async with AsyncSessionLocal() as db:
        try:
            wb_in = WhiteboardCreate(
                title=title,
                description=description,
                project_id=UUID(project_id),
                task_id=UUID(task_id) if task_id else None,
                data={} # Initial empty sketch
            )
            wb_obj = await crud_whiteboard.whiteboard.create(db, obj_in=wb_in)
            return f"Successfully created sketch '{title}' with ID: {wb_obj.id}"
        except Exception as e:
            return f"Error creating sketch: {str(e)}"

@mcp.tool()
async def list_project_whiteboards(project_id: str) -> str:
    """List all whiteboards associated with a project."""
    async with AsyncSessionLocal() as db:
        sketches = await crud_whiteboard.whiteboard.get_multi_by_project(db, project_id=UUID(project_id))
        if not sketches:
            return f"No whiteboards found for project {project_id}."
        return "\n".join([f"- {s.title} (ID: {s.id}, Created: {s.created_at})" for s in sketches])
