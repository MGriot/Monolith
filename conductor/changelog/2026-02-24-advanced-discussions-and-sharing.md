# Changelog: Advanced Discussions, Sharing & Office Previews

**Date:** 2026-02-24
**Task IDs:** BACK-051 to BACK-057, FRONT-089 to FRONT-095
**Status:** Verified & Built

## 1. Enhanced Threaded Discussions (FRONT-089, BACK-051, BACK-057, FRONT-094)
- **SimpleMDE Integration**: Replaced standard textareas with a full Markdown editor featuring formatting toolbars and real-time preview.
- **Infinite Nesting**: Removed the 5-level hard limit. Backend now utilizes recursive `selectinload` (chained 15 levels) to handle deep threads without async errors.
- **Inline Images**: Added support for embedding images directly within discussion threads.
- **Contextual Image Gallery**: Users can now select and insert existing images from the parent project or task via a new "Gallery" dialog.
- **Gallery API**: Implemented `GET /available-images` with automatic permission checks to ensure users only see assets they are authorized to view.
- **UX Improvements**: Added "Show/Hide Replies" toggles to manage long discussion threads.

## 2. Decentralized Sharing & Co-Ownership (FRONT-090, BACK-052)
- **Co-Property System**: Users can now share editing rights for **Teams**, **Templates**, and **Workflows** with other specific users.
- **Public Visibility**: Added `is_public` flags to allow global read-only access to organizational entities.
- **Schema Migration**: Created `template_shares`, `team_shares`, and `workflow_shares` association tables to manage multi-owner relationships.

## 3. Comprehensive Office Previews (FRONT-091, FRONT-095)
- **Inline Renderers**: Added a rich preview modal in the attachment manager for:
    - **CSV/XLSX**: Rendered as interactive Markdown tables.
    - **DOCX**: Rendered as HTML using `mammoth`.
    - **TXT/Emails**: Rendered as formatted raw text.
- **Preview Button Fix**: Restored missing "Preview" buttons for all supported office and text formats in the attachment manager.
- **Library Integration**: Added `xlsx`, `mammoth`, and `papaparse` to the frontend production bundle.

## 4. Kanban & Navigation Refinements (FRONT-092)
- **Hierarchical Cards**: Kanban cards now display **WBS Codes** (e.g., 1.2.1) and "Subtask" badges for better context.
- **Column Alignment**: Standardized Kanban columns to follow the `Backlog -> To Do -> In Progress -> On Hold -> Review -> Done` lifecycle.

## 5. Metadata & Data Integrity (FRONT-093, BACK-053 to BACK-056)
- **Title Case Formatting**: Implemented automatic Title Case conversion for all Topics and WorkTypes.
- **Scope Conversion**: Enabled the ability to promote Project/Task-scoped metadata to Global scope via the Admin panel.
- **JSON Serialization Fix**: Resolved a critical `500 Error` by implementing `clean_dict_for_json` utility to convert UUIDs to strings before database commits.
- **Computed ID Serialization**: Switched to Pydantic `@computed_field` for `topic_ids`, `type_ids`, and `member_ids` to ensure metadata selection persists correctly in frontend dropdowns.
- **Lazy-Loading Resolution**: Fixed `MissingGreenlet` exceptions during serialization by implementing robust recursive `selectinload` and post-update refetching for all organizational models and Ideas.

## Verification
- **Build**: Final Docker build passed successfully for all services.
- **Database**: Applied schema updates via `apply_sharing_updates.py`.
- **API Stability**: Verified that Ideas, Comments, and Templates now serialize correctly without ASGI exceptions.
- **Frontend Persistence**: Confirmed Topics and Types remain populated in Settings after saving.
