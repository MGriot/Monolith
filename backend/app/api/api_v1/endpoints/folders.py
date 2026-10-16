from typing import Any, List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File as FastAPIFile
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app import crud, models, schemas
from app.api import deps
from app.api.access import require_folder_access, require_project_access, require_task_access
from app.core.uploads import save_upload
from app.models.folder import Folder, FolderType
from app.models.file import File as FileModel
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
        await require_project_access(db, folder_in.project_id, current_user)
    if folder_in.task_id:
        await require_task_access(db, folder_in.task_id, current_user, write=True)
    if folder_in.parent_id:
        await require_folder_access(db, folder_in.parent_id, current_user)

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
    await require_folder_access(db, folder_id, current_user)

    # Save file to disk (size/extension limits enforced, streamed in chunks)
    filename, ext, _size = await save_upload(file)

    file_url = f"/uploads/{filename}"
    
    db_obj = FileModel(
        name=file.filename,
        url=file_url,
        extension=ext,
        folder_id=folder_id,
        owner_id=current_user.id
    )
    db.add(db_obj)
    await db.commit()
    await db.refresh(db_obj)
    return db_obj

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
    await require_folder_access(db, folder_id, current_user)

    db_obj = FileModel(
        name=note_in.name or "Untitled Note.md",
        url="note://internal",
        content="# New Note\nStart typing...",
        extension=".md",
        folder_id=folder_id,
        owner_id=current_user.id
    )
    db.add(db_obj)
    await db.commit()
    await db.refresh(db_obj)
    return db_obj

@router.put("/files/{file_id}", response_model=FileSchema)
async def update_file(
    *,
    db: AsyncSession = Depends(deps.get_db),
    file_id: UUID,
    file_in: schemas.file.FileUpdate,
    current_user: models.User = Depends(deps.get_current_user),
) -> Any:
    """
    Update a file (rename or update note content).
    """
    file = await db.get(FileModel, file_id)
    if not file:
        raise HTTPException(status_code=404, detail="File not found")
    if file.owner_id != current_user.id and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    update_data = file_in.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(file, field, value)
    
    db.add(file)
    await db.commit()
    await db.refresh(file)
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
    Update a folder (rename).
    """
    folder = await db.get(Folder, folder_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    if folder.owner_id != current_user.id and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    update_data = folder_in.dict(exclude_unset=True)
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
    folder = await db.get(Folder, folder_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    if folder.owner_id != current_user.id and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    await db.delete(folder)
    await db.commit()
    return folder
