# Changelog - 2026-02-18 - Dynamic Duration UI

## Task: FRONT-083: UI: Dynamic Date vs. Duration Inputs

### Changes:
- Frontend:
    - Enhanced `TaskForm` component in `frontend/src/components/task-form.tsx` with bidirectional scheduling logic.
    - Implemented "Planning Mode" toggle using `Tabs` (Fixed Dates vs. Duration Based).
    - Added `duration_days` input field with real-time sync:
        - In **Fixed Dates** mode: Changing `start_date` or `due_date` automatically calculates the duration.
        - In **Duration Based** mode: Changing the duration automatically shifts the `due_date` from the `start_date`.
    - Integrated `date-fns` for robust date calculations.
    - Used helpful icons (`CalendarDays`, `Clock`) to distinguish scheduling fields.
- Verified changes with `npx tsc --noEmit`.

### Implementation Details:
- Fixed Dates mode: Duration = `differenceInDays(due, start) + 1`.
- Duration Based mode: Due Date = `addDays(start, duration - 1)`.
- UI disables the calculated field based on the active mode to prevent user confusion while maintaining consistency.
