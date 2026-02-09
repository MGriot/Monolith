# Changelog: FRONT-062 & BACK-035 - Central Archive

**Date:** 2026-02-09
**Task IDs:** FRONT-062, BACK-035
**Status:** Verified

## Changes

### Backend (BACK-035)
- Implemented `GET /api/v1/tasks/archived/all` endpoint.
- Returns all archived tasks where the current user is either the Owner or an Assignee.
- Supports deep loading of Project and User relationships for context.

### Frontend (FRONT-062)
- **Unified Archive View**: Redesigned `/archive` page using `Tabs` to separate Projects and Tasks.
- **Task Archiving**: Added an "Archive Task" button to the Task Edit Dialog in `ProjectDetailPage`.
- **Task Restoration**: Added logic to restore individual tasks back to their original projects.
- **Improved UX**: Both project and task archive buttons now use mutations with loading states and confirmation prompts.

## Verification
- **Manual**:
    - Archived a project and verified it appears in the "Projects" tab of the archive.
    - Archived a single task from an active project and verified it appears in the "Individual Tasks" tab.
    - Restored both and verified they returned to their active state correctly.
