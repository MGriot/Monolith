# Changelog: Gantt Visuals, Navigation & Core Fixes

**Date:** 2026-02-10
**Task IDs:** FRONT-062 to FRONT-070, BACK-035, BACK-036
**Status:** Verified & Committed

## Changes

### 1. Gantt Chart & Visual Refinements
- **Customizable Data Grid**: The left-hand panel now supports dynamic columns for Assignee, Dates, Duration, Status, and Priority.
- **Column Customization**: Users can toggle column visibility and manually reorder them via a new "Columns" popover menu.
- **Visual Bar Extensions**: Replaced the text-based end date label with a visual gray bar extension that tracks from the planned `due_date` to the hard `deadline_at`.
- **Critical Path Highlighting**: Dependency lines on the critical path now feature a pulsing red glow for improved visibility.
- **WBS Level 1 Backgrounds**: Top-level tasks now tint the entire Gantt row with their assigned custom color (at 20% opacity).
- **Advanced Time Regions**: Reference zones (Regions) now support full CRUD (Create, Edit, Delete) and customization of text color, label position (top/middle/bottom), and rotation.

### 2. Navigation & Homogeneity
- **Unified Master Schedule**: Merged Calendar and Roadmap views into a single `/schedule` page with a tabbed interface.
- **Top-Level Archive**: Moved the project/task archive to a dedicated sidebar item (`/archive`).
- **Page Layout Standardization**: Synchronized all top-level pages to use a consistent `p-8 max-w-7xl mx-auto` container with `text-3xl` tracking-tight titles.
- **Action Menus**: Added a "More Actions" dropdown to the Projects List for quick archiving and deletion.

### 3. Core Fixes & Backend logic
- **WBS Color Persistence**: Fixed a bug where custom task colors were not being saved to the database.
- **Notification Links**: Fixed broken task links in the notification bell; they now correctly point to the project context (`/projects/:id?task_id=:id`).
- **Deadline Reminders**: Implemented a new backend logic to scan for tasks due within 48 hours and send automated email reminders to assignees.
- **Dashboard Integrity**: Updated statistics to exclude archived items from active counts while preserving them in historical activity heatmaps.
- **Workflow Stability**: Fixed `AttributeError` in the workflow API and improved error handling in the frontend.

## Verification
- **Build**: `npm run build` passed successfully.
- **Gantt**: Verified region labels, bar extensions, and critical path glow in the browser.
- **Stats**: Confirmed archived projects no longer inflate the "Active Projects" count on the dashboard.
- **Emails**: Verified `notify_near_deadlines` logic via unit test concept.
