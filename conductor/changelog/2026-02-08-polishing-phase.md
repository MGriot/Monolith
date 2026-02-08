# Changelog: Production Polishing & Reporting 🚀

**Date:** 2026-02-08
**Task IDs:** BACK-031 to BACK-034, FRONT-059 to FRONT-061, UX-006

## 1. Bug Fixes & Stability
- **User Registration (BACK-031):** Fixed an issue where standard users received a `401 Unauthorized` during signup due to forced token validation. Implementation now uses a truly optional auth scheme.
- **Gantt Export (FRONT-059):** Fixed the PNG export logic to trigger a local browser download instead of saving to server-side Docker volumes.

## 2. Advanced Data Exports (PRD 15.1)
- **High-DPI Gantt (UX-006):** Increased rendering resolution to 3x scale for crisp image quality in exported PNGs.
- **Project Spreadsheets (BACK-032):** Implemented authorized endpoints for exporting project task lists as **CSV** and **Excel (.xlsx)**.

## 3. Workflow Management (PRD 15.2)
- **Workflow Backend (BACK-034):** Created models, schemas, and CRUD for a decentralized SOP repository.
- **Workflow UI (FRONT-060):** Developed a full-featured Workflow Library with search, Markdown editing (with live preview), and rich viewing capabilities.

## 4. Automated Reporting (PRD 15.3)
- **Weekly Summaries (BACK-033):** Implemented logic to aggregate weekly activity reports.
    - **Users:** See upcoming and overdue tasks.
    - **Team Owners:** See team completion rates and recent activities.
    - **Project Owners:** See overall project health and bottlenecks.
- **Trigger:** Added an admin-only endpoint to manually trigger report generation.

## 5. UI Refinements
- **Task Duration (FRONT-061):** Added a "Days" column to the project task list, providing immediate visibility into time allocation.

## Verification
- **Automated:** Created and verified `test_reports_logic.py`, `test_workflows_backend.py`, and `test_reg_fix.py`.
- **Manual:** Verified file downloads (PNG, CSV, XLSX) in the browser. Verified Markdown rendering in the Workflow viewer.
