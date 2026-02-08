# Changelog: 2026-02-08-WORKFLOWS-COMPLETION

## Tasks: BACK-026, FRONT-054, FRONT-056
**Status**: Verified & Committed

### Changes
- **Backend (FastAPI)**:
    - Updated `CRUDTask.create` and `CRUDTask.update` to handle `completed_at` timestamps.
    - Added logic to allow manual override of `completed_at` in API requests.
- **Frontend (React)**:
    - **Workflow Library**: Implemented `/workflows` page with a catalog of standard procedures.
    - **Task List**: Added "Concluded" column to show `completed_at` dates.
    - **Task Form**: Added "Conclusion Date" editable field for manual tracking.
    - **Navigation**: Added "Workflows" link to the main sidebar.

### Verification Results
- **Automated Test**: `backend/test_task_completion_logic.py`
    - [PASS] Create task with `Status.DONE` -> `completed_at` auto-set.
    - [PASS] Update task `TODO` -> `DONE` -> `completed_at` auto-set.
    - [PASS] Update task `DONE` -> `TODO` -> `completed_at` cleared.
    - [PASS] Manual `completed_at` override is respected.
- **Manual Verification**:
    - [PASS] Navigate to `/workflows` -> Page renders correctly.
    - [PASS] Open Task Form -> "Conclusion Date" field is visible.
    - [PASS] View Project Tasks -> "Concluded" column shows dates for completed tasks.