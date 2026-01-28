from mcp.server.fastmcp import FastMCP
from app.crud import crud_project, crud_task
from app.db.session import AsyncSessionLocal
from app.schemas.task import TaskCreate, TaskUpdate
from app.core.enums import Status
from uuid import UUID

mcp = FastMCP("Monolith Planner")

@mcp.resource("projects://list")
async def list_projects() -> str:
    """List all projects in the system."""
    async with AsyncSessionLocal() as db:
        projects = await crud_project.project.get_multi(db, limit=1000)
        if not projects:
            return "No projects found."
        return "\n".join([f"- {p.name} (ID: {p.id}, Progress: {p.progress_percent}%, Status: {p.status})" for p in projects])

@mcp.resource("tasks://list")
async def list_all_tasks() -> str:
    """List all tasks across all projects."""
    async with AsyncSessionLocal() as db:
        tasks = await crud_task.task.get_multi(db, limit=1000)
        if not tasks:
            return "No tasks found."
        return "\n".join([f"- {t.title} (ID: {t.id}, Status: {t.status}, Project ID: {t.project_id})" for t in tasks])

@mcp.tool()
async def create_task(project_id: str, title: str, description: str = None) -> str:
    """Create a new task in a project."""
    async with AsyncSessionLocal() as db:
        try:
            task_in = TaskCreate(
                title=title,
                project_id=UUID(project_id),
                description=description
            )
            task_obj = await crud_task.task.create(db, obj_in=task_in)
            return f"Successfully created task '{title}' with ID: {task_obj.id}"
        except Exception as e:
            return f"Error creating task: {str(e)}"

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
        return "\n".join([f"- {p.name} (ID: {p.id}, Progress: {p.progress_percent}%)" for p in matches])
