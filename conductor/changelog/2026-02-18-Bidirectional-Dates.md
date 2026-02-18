# Changelog - 2026-02-18 - Bidirectional Date Calculation

## Task: BACK-047: Logic: Bidirectional Date/Duration Calculation

### Changes:
- Backend:
    - Added `duration_days` integer field to the `Task` model.
    - Updated `TaskBase` schema to support `duration_days`.
    - Implemented bidirectional sync logic in `CRUDTask.create`:
        - Calculate `due_date` if `start_date` and `duration_days` are provided.
        - Calculate `duration_days` if `start_date` and `due_date` are provided.
        - Calculate `start_date` if `due_date` and `duration_days` are provided.
    - Implemented intelligent sync logic in `CRUDTask.update`:
        - Detects which specific field changed to decide calculation priority.
        - Updating `duration_days` shifts the `due_date`.
        - Updating `start_date` shifts the `due_date` (preserving duration).
        - Updating `due_date` recalculates the `duration_days`.
- Verified changes with `npx tsc --noEmit`.

### Implementation Details:
- Duration definition: 1 day means `start_date` and `due_date` are the same (inclusive).
- Uses `timedelta(days=duration - 1)` for date offsets.
