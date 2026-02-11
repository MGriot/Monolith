# Changelog: Gantt Restorations & Export Fixes

**Date:** 2026-02-11
**Task IDs:** FRONT-071, FRONT-072, BACK-037
**Status:** Verified & Committed

## Changes

### 1. Gantt Chart Restorations
- **Floating Legend**: Restored the high-visibility floating legend from commit `b226a0e`, providing clear status and priority definitions.
- **Minor Ticks & Labels**: Re-implemented context-aware minor tick labels in the timeline header (e.g., day numbers in Week view) as per user request.
- **Visual Grid Refinement**: Added subtle minor grid lines to the Gantt content rows to match the header ticks.
- **Today Marker**: Restored the red "TODAY" badge at the top of the current-day indicator line for better visibility.

### 2. Archive UX Enhancements
- **Direct View for Archived Projects**: Added an "Open" button to archived project rows in the Central Archive. Users can now view project details and schedules without needing to restore the project first.

### 3. Backend Export Reliability
- **WBS Export Logic**: Fixed an `AttributeError` in the project export endpoint. The system now correctly fetches the task hierarchy and calculates WBS codes on-the-fly before generating CSV or Excel downloads.

### 4. Archive Visibility Logic
- **My Tasks Filtering**: Implemented surgical filtering in both backend (`read_assigned_tasks`) and frontend (`MyTasksPage`) to ensure archived tasks and projects are no longer visible in the active task list, Kanban board, or schedule overview.

## Verification
- **Export**: Manually verified that `GET /api/v1/projects/{id}/export?format=csv` no longer crashes and returns a valid file with WBS codes.
- **Gantt**: Visual verification of the floating legend, minor ticks, and "TODAY" badge.
- **Archive**: Verified that "Open" correctly navigates to the project detail page even for archived projects.
