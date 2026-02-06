# Changelog: UX Refinements & Project Templates

**Date:** 2026-02-06
**Tasks:** FRONT-036 to FRONT-041, BACK-017 to BACK-019

## Changes

### 1. Frontend Logic & UI Refinements
- **Deadline Warnings (FRONT-036):** Overdue icons now only show if `end_date` (or `today`) > `deadline_at`.
- **List View (FRONT-037):** Removed the redundant 'ORDER' column from project task lists.
- **Calendar View (FRONT-039):** Simplified the view to show only discrete deadline events instead of full-range task bars.
- **Gantt Chart (FRONT-038):** Implemented fallback logic to use `deadline_at` for plotting tasks without a defined `due_date`.

### 2. Multi-Topic & Multi-Type Support (BACK-017)
- **Database Modeling:** Transitioned Topics and Types from single foreign keys to Many-to-Many relationships.
- **Association Tables:** Created `project_topics`, `project_types`, `task_topics`, and `task_types`.
- **API Support:** Updated Pydantic schemas and CRUD logic to handle list-based topic/type selection.
- **UI Forms:** Refactored Project and Task forms to use a multi-select button interface for metadata.

### 3. Data Inheritance & Automation (BACK-018)
- **Project Sync:** Implemented automated logic to aggregate Topics, Types, and Dates from tasks up to the project level.
- **Date Aggregation:** `Project.start_date` now tracks the minimum task start date; `Project.due_date` tracks the maximum task end/deadline date.

### 4. Project Templates (BACK-019, FRONT-040, FRONT-041)
- **Template Management:** Added a dedicated page at `/templates` for Creating, Editing, and Deleting reusable project structures.
- **Scaffold Flow:** Integrated template selection into the "New Project" workflow, allowing one-click task scaffolding.

### 5. Bug Fixes & Stability
- **Build Fixes:** Resolved syntax errors in `templates.tsx` (newline escaping) and removed unused imports across components.
- **Lazy Loading:** Fixed `MissingGreenlet` errors by eager-loading many-to-many relationships in recursive task queries.
- **Proxy Issues:** Resolved 502/Connection Refused errors during login by refreshing Nginx upstream resolution.
- **API Integrity:** Fixed `AttributeError` in template endpoints by correcting current user retrieval logic.

## Verification
- **Frontend:** Build passed successfully.
- **Backend:** Verified authentication and CRUD logic for multi-metadata and templates.
- **Visuals:** Verified badge rendering and calendar simplification in browser.
