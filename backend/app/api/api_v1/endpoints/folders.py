from typing import Any, List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File as FastAPIFile
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app import crud, models, schemas
from app.api import deps
from app.api.access import EDITOR, require_folder_access, require_project_access, require_task_access
from app.core.uploads import save_upload
from app.core.file_hub import creates_cycle, same_scope
from app.models.folder import Folder, FolderType
from app.models.file import File as FileModel
from app.models.metadata import Topic
from app.schemas.folder import FolderCreate, FolderUpdate, Folder as FolderSchema
from app.schemas.file import FileCreate, File as FileSchema
from app.core.config import settings
import os
import uuid as uuid_pkg

router = APIRouter()

@router.get("/", response_model=List[FolderSchema])
async def read_folders(
    db: AsyncSession = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_user),
    project_id: Optional[UUID] = None,
    task_id: Optional[UUID] = None,
) -> Any:
    """
    Retrieve folders for a project or task.
    """
    if project_id:
        # Shared project folders are visible to every project member, not only their creator.
        await require_project_access(db, project_id, current_user)
        stmt = select(Folder).filter(Folder.project_id == project_id)
        if task_id:
            await require_task_access(db, task_id, current_user)
            stmt = stmt.filter(Folder.task_id == task_id)
    elif task_id:
        await require_task_access(db, task_id, current_user)
        stmt = select(Folder).filter(Folder.task_id == task_id)
    else:
        stmt = select(Folder).filter(Folder.owner_id == current_user.id)
    
    # Also include subfolders and files
    stmt = stmt.options(selectinload(Folder.subfolders), selectinload(Folder.files))
    
    result = await db.execute(stmt)
    return result.scalars().all()

@router.post("/", response_model=FolderSchema)
async def create_folder(
    *,
    db: AsyncSession = Depends(deps.get_db),
    folder_in: FolderCreate,
    current_user: models.User = Depends(deps.get_current_user),
) -> Any:
    """
    Create new folder.
    """
    if folder_in.project_id:
        await require_project_access(db, folder_in.project_id, current_user, min_role=EDITOR)
    if folder_in.task_id:
        await require_task_access(db, folder_in.task_id, current_user, write=True)
    if folder_in.parent_id:
        await require_folder_access(db, folder_in.parent_id, current_user, write=True)

    db_obj = Folder(
        **folder_in.dict(),
        owner_id=current_user.id
    )
    db.add(db_obj)
    await db.commit()
    await db.refresh(db_obj)
    return db_obj

@router.post("/{folder_id}/upload", response_model=FileSchema)
async def upload_file_to_folder(
    *,
    db: AsyncSession = Depends(deps.get_db),
    folder_id: UUID,
    file: UploadFile = FastAPIFile(...),
    current_user: models.User = Depends(deps.get_current_user),
) -> Any:
    """
    Upload a file to a specific folder.
    """
    await require_folder_access(db, folder_id, current_user, write=True)

    # Save file to disk (size/extension limits enforced, streamed in chunks)
    filename, ext, size = await save_upload(file)

    file_url = f"/uploads/{filename}"
    
    db_obj = FileModel(
        name=file.filename,
        url=file_url,
        extension=ext,
        size_bytes=size,
        folder_id=folder_id,
        owner_id=current_user.id
    )
    db.add(db_obj)
    await db.commit()
    return await _load_file(db, db_obj.id)

@router.post("/{folder_id}/upload-note", response_model=FileSchema)
async def create_note(
    *,
    db: AsyncSession = Depends(deps.get_db),
    folder_id: UUID,
    note_in: schemas.file.FileUpdate,
    current_user: models.User = Depends(deps.get_current_user),
) -> Any:
    """
    Create a new Markdown note in a folder.
    """
    await require_folder_access(db, folder_id, current_user, write=True)

    db_obj = FileModel(
        name=note_in.name or "Untitled Note.md",
        url="note://internal",
        # the text the caller sent (MCP, API); the UI creates an empty note and edits it in place
        content=note_in.content if note_in.content is not None else "# New Note\nStart typing...",
        extension=".md",
        folder_id=folder_id,
        owner_id=current_user.id
    )
    db.add(db_obj)
    await db.commit()
    return await _load_file(db, db_obj.id)

async def _load_file(db: AsyncSession, file_id: UUID) -> FileModel:
    """Fresh copy with its topics loaded, so the response never triggers a lazy load."""
    result = await db.execute(
        select(FileModel)
        .options(selectinload(FileModel.topics))
        .where(FileModel.id == file_id)
        .execution_options(populate_existing=True)
    )
    return result.scalar_one()


@router.put("/files/{file_id}", response_model=FileSchema)
async def update_file(
    *,
    db: AsyncSession = Depends(deps.get_db),
    file_id: UUID,
    file_in: schemas.file.FileUpdate,
    current_user: models.User = Depends(deps.get_current_user),
) -> Any:
    """
    Update a file: rename, edit note content, move it to another folder of the same project, or set its topics.
    """
    file = await db.get(FileModel, file_id)
    if not file:
        raise HTTPException(status_code=404, detail="File not found")
    source = await require_folder_access(db, file.folder_id, current_user, write=True)
    if file.owner_id != current_user.id and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Not authorized")

    update_data = file_in.model_dump(exclude_unset=True)
    target_id = update_data.pop("folder_id", None)
    topic_ids = update_data.pop("topic_ids", None)

    if target_id and target_id != file.folder_id:
        target = await require_folder_access(db, target_id, current_user, write=True)
        if not same_scope(source, target):
            raise HTTPException(status_code=400, detail="Files can only move between folders of the same project")
        file.folder_id = target_id

    if topic_ids is not None:
        wanted = set(topic_ids)
        topics = (await db.execute(select(Topic).where(Topic.id.in_(wanted)))).scalars().all() if wanted else []
        if len(topics) != len(wanted):
            raise HTTPException(status_code=400, detail="Unknown topic")
        file.topics = list(topics)

    for field, value in update_data.items():
        setattr(file, field, value)

    db.add(file)
    await db.commit()
    return await _load_file(db, file_id)


@router.delete("/files/{file_id}", response_model=FileSchema)
async def delete_file(
    *,
    db: AsyncSession = Depends(deps.get_db),
    file_id: UUID,
    current_user: models.User = Depends(deps.get_current_user),
) -> Any:
    """
    Delete a file, and its stored upload when nothing else points at it.
    """
    file = await db.get(FileModel, file_id)
    if not file:
        raise HTTPException(status_code=404, detail="File not found")
    await require_folder_access(db, file.folder_id, current_user, write=True)
    if file.owner_id != current_user.id and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Not authorized")

    url = file.url
    await db.delete(file)
    await db.commit()

    if url and url.startswith("/uploads/"):
        still_used = (await db.execute(select(FileModel.id).where(FileModel.url == url).limit(1))).first()
        if not still_used:
            path = os.path.join(settings.UPLOAD_DIR, os.path.basename(url))
            try:
                os.remove(path)
            except OSError:
                pass  # already gone: the row was the important part
    return file

@router.put("/{folder_id}", response_model=FolderSchema)
async def update_folder(
    *,
    db: AsyncSession = Depends(deps.get_db),
    folder_id: UUID,
    folder_in: FolderUpdate,
    current_user: models.User = Depends(deps.get_current_user),
) -> Any:
    """
    Update a folder: rename it, or move it under another folder (parent_id null moves it to the top level).
    """
    await require_folder_access(db, folder_id, current_user, write=True)
    folder = await db.get(Folder, folder_id)
    if folder.owner_id != current_user.id and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Not authorized")

    update_data = folder_in.model_dump(exclude_unset=True)
    if "parent_id" in update_data:
        new_parent = update_data.pop("parent_id")
        if new_parent:
            target = await require_folder_access(db, new_parent, current_user, write=True)
            if not same_scope(folder, target):
                raise HTTPException(status_code=400, detail="Folders can only move inside the same project")
            scope = select(Folder.id, Folder.parent_id)
            if folder.project_id:
                scope = scope.where(Folder.project_id == folder.project_id)
            elif folder.task_id:
                scope = scope.where(Folder.task_id == folder.task_id)
            else:
                scope = scope.where(Folder.owner_id == folder.owner_id, Folder.project_id.is_(None))
            parent_of = {row.id: row.parent_id for row in (await db.execute(scope)).all()}
            if creates_cycle(folder.id, new_parent, parent_of):
                raise HTTPException(status_code=400, detail="A folder can't move into itself or one of its subfolders")
        folder.parent_id = new_parent

    for field, value in update_data.items():
        setattr(folder, field, value)
    
    db.add(folder)
    await db.commit()
    await db.refresh(folder)
    return folder

@router.delete("/{folder_id}", response_model=FolderSchema)
async def delete_folder(
    *,
    db: AsyncSession = Depends(deps.get_db),
    folder_id: UUID,
    current_user: models.User = Depends(deps.get_current_user),
) -> Any:
    """
    Delete a folder.
    """
    await require_folder_access(db, folder_id, current_user, write=True)
    folder = await db.get(Folder, folder_id)
    if folder.owner_id != current_user.id and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Not authorized")

    await db.delete(folder)
    await db.commit()
    return folder
