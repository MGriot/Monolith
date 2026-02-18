# Changelog - 2026-02-18 - PERT Estimation

## Tasks: 
- BACK-045: Model: PERT Estimation Fields
- BACK-046: Logic: PERT Expected Duration Calculation
- FRONT-082: UI: PERT Estimation Form Fields

### Changes:
- Backend:
    - Added `optimistic_days`, `normal_days`, and `pessimistic_days` integer fields to the `Task` model.
    - Implemented a hybrid property `expected_duration_days` on the `Task` model using the PERT formula: `(O + 4M + P) / 6`.
    - Updated `TaskBase` and `TaskInDBBase` Pydantic schemas to support PERT fields and the calculated expected duration.
- Frontend:
    - Updated `Task` interface in `frontend/src/types/index.ts` to include PERT fields.
    - Enhanced `TaskForm` component in `frontend/src/components/task-form.tsx`:
        - Added a "PERT Estimation" section with inputs for Optimistic, Most Likely, and Pessimistic days.
        - Implemented real-time calculation and display of the Expected Duration within the form.
        - Used a `Calculator` icon for the estimation section header.
- Verified changes with `npx tsc --noEmit`.

### Implementation Details:
- PERT formula: `Math.round(((opt + 4*norm + pess) / 6) * 100) / 100` for frontend display.
- Backend property handles nulls/zeros gracefully, returning `0.0`.
