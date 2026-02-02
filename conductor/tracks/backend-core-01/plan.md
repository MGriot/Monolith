# Plan: Core Backend Enhancements

## Atomic Tasks

- [ ] **[CORE-001] Model Update** <!-- id: 0 -->
    - **Goal**: Create `Dependency` model and add fields to `Task`/`Subtask`.
    - **Files**: `backend/app/models/task.py`, `backend/app/models/dependency.py` (new).
    - **Verification**: `python backend/test_schema_check.py` (Create this script to verify table creation).

- [ ] **[CORE-002] Schema Update** <!-- id: 1 -->
    - **Goal**: Update Pydantic schemas to expose new fields (`is_milestone`, `deadline_at`) and dependency structure.
    - **Files**: `backend/app/schemas/task.py`.
    - **Verification**: `pytest backend/tests/test_schemas_standalone.py`.

- [ ] **[CORE-003] Cycle Detection** <!-- id: 2 -->
    - **Goal**: Implement graph cycle detection algorithm.
    - **Files**: `backend/app/core/dependencies.py`.
    - **Verification**: `pytest backend/tests/test_cycle_detection_standalone.py`.

- [ ] **[CORE-004] CRUD Dependency** <!-- id: 3 -->
    - **Goal**: Implement logic to add dependencies with validation.
    - **Files**: `backend/app/crud/crud_task.py`.
    - **Verification**: `pytest backend/tests/test_crud_dependencies_standalone.py`.

- [ ] **[CORE-005] WBS Generation** <!-- id: 4 -->
    - **Goal**: Implement WBS code generation for Project responses.
    - **Files**: `backend/app/api/api_v1/endpoints/projects.py` (or similar).
    - **Verification**: `pytest backend/tests/test_wbs_standalone.py`.
