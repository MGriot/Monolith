# Changelog: DX-001 & UI-UNIFICATION

**Date:** 2026-03-09
**Task IDs:** DX-001, UI-010, UI-011
**Status:** Verified & Committed

## Changes

### 1. Developer Experience (DX-001)
- **Frontend Hot-Reload**: Modified `docker-compose.yml` and `vite.config.ts` to run the Vite dev server inside Docker.
    - Added `usePolling: true` to support Windows host file system events.
    - Configured `0.0.0.0` binding and automatic proxying for `/api` and `/uploads`.
- **Backend Auto-Reload**: Confirmed `uvicorn --reload` configuration with volume mounting for instantaneous Python logic updates.

### 2. Layout & UI Unification (UI-010)
- **Standardized Sub-Headers**: Refactored `DashboardPage`, `ProjectsListPage`, `MyTasksPage`, `ArchivePage`, `SchedulePage`, `TeamsPage`, `TemplatesPage`, `UsersPage`, `WorkflowsPage`, `SettingsPage`, and `AdminMetadataPage`.
    - Implemented a full-width header with a large icon and title.
    - Added a scrollable content area beneath the sub-header.
- **Global Header Optimization**: Removed redundant titles and icons from the top persistent header in `layout.tsx`.
- **Whiteboard Grid**: Updated `ProjectLibrary.tsx` to use a dynamic grid (`grid-cols-3` up to `grid-cols-6`).

### 3. Navigation Refinement (UI-011)
- **Settings Relocation**: Moved the Project Settings trigger from the Library tab to a dedicated icon near the Archive action in the project detail header.

### 4. Stability & Fixes
- **Import Resolution**: Fixed a missing `cn` utility import in `project-detail.tsx` that caused a crash.
- **Syntax Fix**: Resolved a JSX parsing error in `teams.tsx`.

## Verification
- **Hot-Reload**: Verified that changing a `.tsx` file reflects in the browser without a container restart.
- **Visuals**: Verified consistent padding and typography across all primary routes.
- **Stability**: Confirmed `ProjectDetailPage` loads correctly with the new header icons.
