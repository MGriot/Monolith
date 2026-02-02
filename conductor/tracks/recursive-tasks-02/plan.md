# Plan: Recursive N-Level Tasks

## Atomic Tasks

- [ ] **[REC-001] Model Unification** <!-- id: 0 -->
    - **Goal**: Add `parent_id` to `Task`, update relationships, and remove `Subtask` model.
    - **Files**: `backend/app/models/task.py`.
    - **Verification**: `python backend/mcp_sync_db.py`.

- [ ] **[REC-002] Data Migration** <!-- id: 1 -->
    - **Goal**: Script to move existing subtasks to the main task table.
    - **Files**: `backend/mcp_migrate_subtasks.py`.
    - **Verification**: Check DB count.

- [ ] **[REC-003] Schema Unification** <!-- id: 2 -->
    - **Goal**: Refactor Pydantic schemas into a single recursive `Task` structure.
    - **Files**: `backend/app/schemas/task.py`.
    - **Verification**: `pytest backend/tests/test_recursive_schemas.py`.

- [ ] **[REC-004] Recursive CRUD & Logic** <!-- id: 3 -->
    - **Goal**: Update `CRUDTask` to support recursive status updates and project progress.
    - **Files**: `backend/app/crud/crud_task.py`.
    - **Verification**: `pytest backend/tests/test_recursive_logic.py`.

- [ ] **[REC-005] API & Frontend Adaption** <!-- id: 4 -->
    - **Goal**: Consolidate endpoints and update frontend to handle nested task trees.
    - **Files**: `backend/app/api/api_v1/endpoints/tasks.py`, frontend components.
    - **Verification**: Manual UI check.
