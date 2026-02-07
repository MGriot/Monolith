# Changelog - 2026-02-07

## Enhanced Task Management

### Status & Priority
- Added **"On hold"** status across backend and frontend.
- Implemented **consistent color coding** for all statuses and priorities.
- Created a **centralized style configuration** (`frontend/src/constants/colors.ts`) to manage visual tokens.

### Task List & WBS
- Added **reordering and nesting controls** to the project task list:
  - **Move Up / Down**: Change the sort order of tasks within their level.
  - **Indent / Outdent**: Change the WBS level (nesting) of tasks.
- Updated WBS calculation logic to reflect immediate hierarchy changes.

### Metadata Management
- Added **color support for Work Types** in the database and API.
- Updated **Admin Metadata Management page** to allow setting and editing colors for both Topics and Work Types.
- Improved the UI for metadata creation and table editing.

### Gantt Chart
- Updated the **Gantt Legend** to reflect the new "On hold" status and all priorities.
- Refactored task bar coloring to use the shared color configuration.

### Fixed
- **Database Integrity**: Resolved `InvalidTextRepresentationError` by adding 'ON_HOLD' value to PostgreSQL `status` enum type.
- **Form Consistency**: Added missing 'On hold' option to Project and Task creation/edit dropdowns.
- **Build Types**: Fixed `ProjectTaskList` prop interface mismatch in `project-detail.tsx`, ensuring correct type safety for task indentation handlers.
