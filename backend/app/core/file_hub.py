"""Pure rules for moving folders and files in the File Hub (kept free of I/O so they are easy to test)."""
from typing import Mapping, Optional
from uuid import UUID


def creates_cycle(folder_id: UUID, new_parent_id: Optional[UUID], parent_of: Mapping[UUID, Optional[UUID]]) -> bool:
    """True when putting `folder_id` under `new_parent_id` would make a folder its own ancestor.

    `parent_of` maps every folder in scope to its current parent. Walking up from the new parent must never
    reach the folder being moved. A broken chain (a loop already in the data) also counts as a cycle.
    """
    seen = set()
    current = new_parent_id
    while current is not None:
        if current == folder_id or current in seen:
            return True
        seen.add(current)
        current = parent_of.get(current)
    return False


def same_scope(a, b) -> bool:
    """Folders can only exchange content inside one project (and one task, for task folders) or one owner's space."""
    if a.project_id or b.project_id:
        return a.project_id == b.project_id and a.task_id == b.task_id
    if a.task_id or b.task_id:
        return a.task_id == b.task_id
    return a.owner_id == b.owner_id
