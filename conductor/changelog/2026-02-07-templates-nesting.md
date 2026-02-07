# Changelog: Hierarchical Template Indentation

**Date:** 2026-02-07
**Tasks:** FRONT-042

## Changes
- **Template Editor Enhancements:**
    - Modified `frontend/src/pages/templates.tsx` to support nested tasks via indentation.
    - Added `parseTasks` helper to convert indented text (2 spaces per level) into a recursive JSON structure (`subtasks` array).
    - Added `serializeTasks` helper to convert recursive JSON back into indented text for editing.
    - Updated `handleEdit` and `handleSubmit` to use these helpers.
- **UI/UX:**
    - Updated the "Tasks" label and placeholder in the template dialog to guide users on indentation usage.
    - Enabled `font-mono` for the task editor to ensure visual alignment of indentation.

## Verification
- Verified that 2-level and 3-level hierarchies are correctly parsed into the `tasks_json` field.
- Verified that existing templates (flat lists) are still correctly serialized and displayed.
- Verified that "New Project" from an indented template correctly builds the task/subtask tree in the backend.
