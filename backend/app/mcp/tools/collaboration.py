"""Comments, the Ideas Hub and Excalidraw sketches."""
from typing import Annotated, Any, Literal
from uuid import UUID

from mcp.server.fastmcp.exceptions import ToolError
from pydantic import Field

from app.api.api_v1.endpoints import comments as comments_api
from app.api.api_v1.endpoints import ideas as ideas_api
from app.api.api_v1.endpoints import whiteboards as whiteboards_api
from app.mcp.context import build, call, fields, Json
from app.mcp.server import mcp
from app.schemas.comment import CommentCreate, CommentUpdate
from app.schemas.idea import IdeaCreate, IdeaUpdate
from app.schemas.whiteboard import WhiteboardCreate, WhiteboardUpdate

# --- comments ----------------------------------------------------------------------------------------------------


@mcp.tool()
async def list_comments(
    project_id: UUID | None = None, task_id: UUID | None = None, idea_id: UUID | None = None
) -> list[dict[str, Any]]:
    """Threaded comments on a project, a task or an idea (give exactly one id). Replies are nested in `replies`."""
    if sum(x is not None for x in (project_id, task_id, idea_id)) != 1:
        raise ToolError("Give exactly one of project_id, task_id or idea_id")
    return await call(comments_api.read_comments, project_id=project_id, task_id=task_id, idea_id=idea_id)


@mcp.tool()
async def add_comment(
    content: Annotated[str, Field(min_length=1, description="Markdown text")],
    project_id: UUID | None = None,
    task_id: UUID | None = None,
    idea_id: UUID | None = None,
    parent_id: Annotated[UUID | None, Field(description="Reply to this comment")] = None,
    links: list[str] | None = None,
) -> dict[str, Any]:
    """Comment on a project, task or idea (give exactly one), or reply to a comment."""
    if sum(x is not None for x in (project_id, task_id, idea_id)) != 1:
        raise ToolError("Give exactly one of project_id, task_id or idea_id")
    body = build(CommentCreate, fields(content=content, project_id=project_id, task_id=task_id, idea_id=idea_id,
                                       parent_id=parent_id, links=links))
    return await call(comments_api.create_comment, comment_in=body)


@mcp.tool()
async def edit_comment(comment_id: UUID, content: Annotated[str, Field(min_length=1)]) -> dict[str, Any]:
    """Change the text of one of your comments."""
    return await call(comments_api.update_comment, id=comment_id, comment_in=build(CommentUpdate, {"content": content}))


@mcp.tool()
async def delete_comment(comment_id: UUID) -> dict[str, Any]:
    """Delete a comment (yours, or any as project admin)."""
    return await call(comments_api.delete_comment, id=comment_id)


# --- ideas -------------------------------------------------------------------------------------------------------


@mcp.tool()
async def list_ideas(
    project_id: UUID | None = None,
    task_id: UUID | None = None,
    limit: Annotated[int, Field(ge=1, le=500)] = 100,
    offset: Annotated[int, Field(ge=0)] = 0,
) -> list[dict[str, Any]]:
    """Ideas Hub entries with vote counts, for one project or task (or everything you can see)."""
    return await call(ideas_api.read_ideas, project_id=project_id, task_id=task_id, skip=offset, limit=limit)


@mcp.tool()
async def propose_idea(project_id: UUID, title: str, description: str | None = None,
                       task_id: UUID | None = None) -> dict[str, Any]:
    """Propose an idea on a project (optionally about one task). You are its author."""
    body = build(IdeaCreate, fields(project_id=project_id, title=title, description=description, task_id=task_id))
    return await call(ideas_api.create_idea, idea_in=body)


@mcp.tool()
async def update_idea(
    idea_id: UUID,
    title: str | None = None,
    description: str | None = None,
    status: Literal["Proposed", "Approved", "Rejected", "Converted"] | None = None,
) -> dict[str, Any]:
    """Edit an idea (author), or approve / reject it (project admin)."""
    body = build(IdeaUpdate, fields(title=title, description=description, status=status))
    return await call(ideas_api.update_idea, idea_id=idea_id, idea_in=body)


@mcp.tool()
async def vote_idea(idea_id: UUID, direction: Literal["up", "down"] = "up") -> Json:
    """Up- or down-vote an idea (voting again the same way removes your vote)."""
    endpoint = ideas_api.vote_idea if direction == "up" else ideas_api.downvote_idea
    return await call(endpoint, idea_id=idea_id)


@mcp.tool()
async def promote_idea_to_task(idea_id: UUID) -> dict[str, Any]:
    """Turn an idea into a task in its project (marks the idea Converted)."""
    return await call(ideas_api.promote_idea, idea_id=idea_id)


@mcp.tool()
async def promote_idea_to_project(idea_id: UUID) -> dict[str, Any]:
    """Turn an idea into a new project of its own."""
    return await call(ideas_api.promote_idea_to_project, idea_id=idea_id)


@mcp.tool()
async def delete_idea(idea_id: UUID) -> dict[str, Any]:
    """Delete an idea (author or project admin)."""
    return await call(ideas_api.delete_idea, idea_id=idea_id)


# --- whiteboards (Excalidraw) ------------------------------------------------------------------------------------

ELEMENTS_HELP = (
    "Excalidraw elements, e.g. {\"type\": \"rectangle\"|\"ellipse\"|\"diamond\"|\"arrow\"|\"line\"|\"text\", "
    "\"id\": \"...\", \"x\": 0, \"y\": 0, \"width\": 160, \"height\": 80, \"strokeColor\": \"#1e1e1e\", "
    "\"backgroundColor\": \"#a5d8ff\", \"text\": \"...\" (text), \"points\": [[0,0],[120,0]] (arrow/line)}. "
    "Missing Excalidraw bookkeeping fields (version, seed, ...) are filled in."
)


@mcp.tool()
async def list_whiteboards(
    project_id: UUID | None = None, task_id: UUID | None = None,
    limit: Annotated[int, Field(ge=1, le=500)] = 100, offset: Annotated[int, Field(ge=0)] = 0,
) -> list[dict[str, Any]]:
    """Sketches of a project or task: id, title, owner, last change and the preview image URL (no scene data)."""
    return await call(whiteboards_api.read_whiteboards, project_id=project_id, task_id=task_id, skip=offset, limit=limit)


@mcp.tool()
async def get_whiteboard(whiteboard_id: UUID) -> dict[str, Any]:
    """A sketch with its full Excalidraw scene (`data.elements`, `data.files`)."""
    return await call(whiteboards_api.read_whiteboard, id=whiteboard_id)


@mcp.tool(description="Create an Excalidraw sketch in a project (editor role); a preview is rendered. " + ELEMENTS_HELP)
async def create_whiteboard(
    project_id: UUID,
    title: str,
    elements: list[dict[str, Any]],
    description: str | None = None,
    task_id: Annotated[UUID | None, Field(description="Attach the sketch to this task")] = None,
) -> dict[str, Any]:
    from app.core.excalidraw import normalize_elements

    body = build(WhiteboardCreate, fields(
        project_id=project_id, title=title, description=description, task_id=task_id,
        data={"type": "excalidraw", "version": 2, "source": "monolith-mcp",
              "elements": normalize_elements(elements), "files": {}},
    ))
    return await call(whiteboards_api.create_whiteboard, obj_in=body)


@mcp.tool(description="Replace a sketch's title, description and/or elements (editor role). " + ELEMENTS_HELP)
async def update_whiteboard(
    whiteboard_id: UUID,
    title: str | None = None,
    description: str | None = None,
    elements: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    from app.core.excalidraw import normalize_elements

    changes = fields(title=title, description=description)
    if elements is not None:
        current = await call(whiteboards_api.read_whiteboard, id=whiteboard_id)
        data = dict(current.get("data") or {})
        data["elements"] = normalize_elements(elements)
        changes["data"] = data
    return await call(whiteboards_api.update_whiteboard, id=whiteboard_id, obj_in=build(WhiteboardUpdate, changes))


@mcp.tool()
async def delete_whiteboard(whiteboard_id: UUID) -> dict[str, Any]:
    """Delete a sketch (its owner or a project editor)."""
    return await call(whiteboards_api.delete_whiteboard, id=whiteboard_id)
