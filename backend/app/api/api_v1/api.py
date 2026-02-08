from fastapi import APIRouter
from app.api.api_v1.endpoints import login, users, projects, tasks, subtasks, notifications, calendar, dashboard, metadata, templates, teams, ideas

api_router = APIRouter()
api_router.include_router(login.router, tags=["login"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(metadata.router, prefix="/metadata", tags=["metadata"])
api_router.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])
api_router.include_router(teams.router, prefix="/teams", tags=["teams"])
api_router.include_router(projects.router, prefix="/projects", tags=["projects"])
api_router.include_router(templates.router, prefix="/templates", tags=["templates"])
api_router.include_router(ideas.router, prefix="/ideas", tags=["ideas"])
api_router.include_router(tasks.router, prefix="/tasks", tags=["tasks"])
api_router.include_router(subtasks.router, prefix="/subtasks", tags=["subtasks"])
api_router.include_router(notifications.router, prefix="/notifications", tags=["notifications"])
api_router.include_router(calendar.router, prefix="/calendar", tags=["calendar"])