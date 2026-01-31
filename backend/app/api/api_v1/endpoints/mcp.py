from mcp.server.fastmcp import FastMCP
from app.crud import crud_project, crud_task
from app.db.session import AsyncSessionLocal
from app.schemas.task import TaskCreate, TaskUpdate, SubtaskCreate
from app.schemas.project import ProjectCreate
from app.core.enums import Status
from uuid import UUID

from app.schemas.user import UserCreate
from app.crud import crud_user

mcp = FastMCP("Monolith Planner")

@mcp.tool()
async def create_user(email: str, password: str, full_name: str = None, is_superuser: bool = False) -> str:
    """Create a new user in the system."""
    async with AsyncSessionLocal() as db:
        try:
            # Check if user exists
            user_exists = await crud_user.get_by_email(db, email=email)
            if user_exists:
                return f"User with email '{email}' already exists."
            
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

@mcp.tool()
async def create_project(name: str, topic: str = None, type: str = None, description: str = None) -> str:
    """Create a new project."""
    async with AsyncSessionLocal() as db:
        try:
            # For MCP, we'll assign to the first superuser or a default owner
            users = await crud_user.get_multi(db, limit=1)
            if not users:
                return "Error: No users found in system. Create a user first."
            
            project_in = ProjectCreate(
                name=name,
                topic=topic,
                type=type,
                description=description
            )
            project_obj = await crud_project.project.create_with_owner(
                db, obj_in=project_in, owner_id=users[0].id
            )
            return f"Successfully created project '{name}' with ID: {project_obj.id}"
        except Exception as e:
            return f"Error creating project: {str(e)}"

@mcp.resource("projects://list")
async def list_projects() -> str:
    """List all projects in the system."""
    async with AsyncSessionLocal() as db:
        projects = await crud_project.project.get_multi(db, limit=1000)
        if not projects:
            return "No projects found."
        lines = []
        for p in projects:
            lines.append(f"- {p.name} (ID: {p.id}, Progress: {p.progress_percent}%, Status: {p.status})")
        return "\n".join(lines)

@mcp.resource("tasks://list")
async def list_all_tasks() -> str:
    """List all tasks across all projects."""
    async with AsyncSessionLocal() as db:
        tasks = await crud_task.task.get_multi(db, limit=1000)
        if not tasks:
            return "No tasks found."
        lines = []
        for t in tasks:
            lines.append(f"- {t.title} (ID: {t.id}, Status: {t.status}, Project ID: {t.project_id})")
        return "\n".join(lines)

@mcp.tool()
async def create_task(project_id: str, title: str, description: str = None, status: str = "Todo") -> str:
    """Create a new task in a project."""
    async with AsyncSessionLocal() as db:
        try:
            status_member = Status.TODO
            if status:
                try:
                    status_member = next(s for s in Status if s.value.lower() == status.lower())
                except StopIteration:
                    pass

            task_in = TaskCreate(
                title=title,
                project_id=UUID(project_id),
                description=description,
                status=status_member
            )
            task_obj = await crud_task.task.create(db, obj_in=task_in)
            return f"Successfully created task '{title}' with ID: {task_obj.id}"
        except Exception as e:
            return f"Error creating task: {str(e)}"

@mcp.tool()
async def create_subtask(task_id: str, title: str, status: str = "Todo") -> str:
    """Create a new subtask for a task."""
    async with AsyncSessionLocal() as db:
        try:
            status_member = Status.TODO
            if status:
                try:
                    status_member = next(s for s in Status if s.value.lower() == status.lower())
                except StopIteration:
                    pass

            st_in = SubtaskCreate(
                title=title,
                task_id=UUID(task_id),
                status=status_member
            )
            st_obj = await crud_task.subtask.create(db, obj_in=st_in)
            return f"Successfully created subtask '{title}' with ID: {st_obj.id}"
        except Exception as e:
            return f"Error creating subtask: {str(e)}"

@mcp.tool()
async def update_task_status(task_id: str, status: str) -> str:
    """Update the status of an existing task."""
    # Allowed statuses: Backlog, Todo, In Progress, Review, Done
    async with AsyncSessionLocal() as db:
        try:
            task_obj = await crud_task.task.get(db, id=UUID(task_id))
            if not task_obj:
                return f"Task with ID {task_id} not found."
            
            # Case insensitive match for enum
            try:
                # Find the correct Status enum member
                status_member = next(s for s in Status if s.value.lower() == status.lower())
            except StopIteration:
                return f"Invalid status: {status}. Allowed: {[s.value for s in Status]}"

            task_update = TaskUpdate(status=status_member)
            await crud_task.task.update(db, db_obj=task_obj, obj_in=task_update)
            return f"Task '{task_obj.title}' (ID: {task_id}) status updated to {status_member.value}"
        except Exception as e:
            return f"Error updating task: {str(e)}"

@mcp.tool()
async def search_projects(query: str) -> str:
    """Search projects by name."""
    async with AsyncSessionLocal() as db:
        projects = await crud_project.project.get_multi(db, limit=1000)
        matches = [p for p in projects if query.lower() in p.name.lower()]
        if not matches:
            return f"No projects found matching '{query}'"
        lines = []
        for p in matches:
            lines.append(f"- {p.name} (ID: {p.id}, Progress: {p.progress_percent}%)")
        return "\n".join(lines)