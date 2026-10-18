"""File Hub: folders and text notes. Binary uploads go through the web UI or POST /folders/{id}/upload."""
from typing import Annotated, Any, Literal
from uuid import UUID

from mcp.server.fastmcp.exceptions import ToolError
from pydantic import Field

from app.api.api_v1.endpoints import folders as folders_api
from app.mcp.context import build, call, fields
from app.mcp.server import mcp
from app.schemas.file import FileUpdate
from app.schemas.folder import FolderCreate, FolderUpdate


@mcp.tool()
async def list_folders(project_id: UUID | None = None, task_id: UUID | None = None) -> list[dict[str, Any]]:
    """The File Hub tree of a project or task (give one): folders, subfolders and their files with URLs."""
    if (project_id is None) == (task_id is None):
        raise ToolError("Give exactly one of project_id or task_id")
    return await call(folders_api.read_folders, project_id=project_id, task_id=task_id)


@mcp.tool()
async def create_folder(
    name: str,
    project_id: UUID | None = None,
    task_id: UUID | None = None,
    parent_id: Annotated[UUID | None, Field(description="Create inside this folder")] = None,
    type: Literal["generic", "media", "notes"] = "generic",
) -> dict[str, Any]:
    """Create a folder in a project's or task's File Hub (editor role)."""
    body = build(FolderCreate, fields(name=name, project_id=project_id, task_id=task_id, parent_id=parent_id, type=type))
    return await call(folders_api.create_folder, folder_in=body)


@mcp.tool()
async def rename_or_move_folder(folder_id: UUID, name: str | None = None, parent_id: UUID | None = None) -> dict[str, Any]:
    """Rename a folder and/or move it under another folder of the same project."""
    return await call(folders_api.update_folder, folder_id=folder_id,
                      folder_in=build(FolderUpdate, fields(name=name, parent_id=parent_id)))


@mcp.tool()
async def delete_folder(folder_id: UUID) -> dict[str, Any]:
    """Delete a folder with everything inside it."""
    return await call(folders_api.delete_folder, folder_id=folder_id)


@mcp.tool()
async def create_note(folder_id: UUID, name: str, content: Annotated[str, Field(description="Markdown text")]) -> dict[str, Any]:
    """Write a text note (Markdown) into a folder."""
    return await call(folders_api.create_note, folder_id=folder_id,
                      note_in=build(FileUpdate, {"name": name, "content": content}))


@mcp.tool()
async def update_file(
    file_id: UUID,
    name: str | None = None,
    content: Annotated[str | None, Field(description="New text (notes only)")] = None,
    folder_id: Annotated[UUID | None, Field(description="Move to this folder")] = None,
    topic_ids: Annotated[list[UUID] | None, Field(description="Replace the file's topic tags")] = None,
) -> dict[str, Any]:
    """Rename, move, re-tag a file, or rewrite a note."""
    body = build(FileUpdate, fields(name=name, content=content, folder_id=folder_id, topic_ids=topic_ids))
    return await call(folders_api.update_file, file_id=file_id, file_in=body)


@mcp.tool()
async def delete_file(file_id: UUID) -> dict[str, Any]:
    """Delete a file or note."""
    return await call(folders_api.delete_file, file_id=file_id)
