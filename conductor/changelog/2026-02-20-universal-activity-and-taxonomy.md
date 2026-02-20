# Changelog: Universal Activity & Taxonomy Whitelisting

**Date:** 2026-02-20
**Task IDs:** BACK-048 to BACK-050, FRONT-084 to FRONT-087, UX-008
**Status:** Verified

## 1. Universal Threaded Activity Logs (PRD 18.1)
- **Unified Comment Model**: Created a polymorphic `Comment` model supporting parent-child threading and optional linking to Projects, Tasks, or Ideas.
- **Deep Eager Loading**: Implemented recursive `selectinload` in `CRUDComment` to support up to 5 levels of nested replies in async contexts, preventing `MissingGreenlet` errors.
- **Full Stack Integration**: 
    - **Frontend**: Created `CommentSection`, `CommentItem`, and `CommentInput` components with recursive rendering.
    - **UI**: Added a new "Activity" tab to the Project Details page and integrated a "Task Activity" section within the Task Edit dialog.
    - **Avatar Support**: Integrated `@radix-ui/react-avatar` for user initials/images in discussion threads.

## 2. Template-Driven Taxonomy Whitelisting (PRD 18.2)
- **Restrictive Creation**: Updated Project Templates to store `allowed_global_topics` and `allowed_global_work_types` (whitelists).
- **On-the-fly Creation**: Enhanced `RichDropdown` to support immediate creation of new project-scoped metadata within the task/project creation flow.
- **Enforcement Logic**: Implemented frontend filtering to restrict selection to whitelisted global items while always permitting project-specific scoped items.
- **UI Configuration**: Added multi-select fields to the Template Management page for configuring whitelists.

## 3. High-Precision Hybrid Gantt Theme (UX-008)
- **Legibility**: Forced dark text (`text-slate-800`) against faint background bars (15% opacity) for maximum title contrast.
- **Progress Line**: Replaced full-bar fills with a thin bottom underline (`h-1`) to separate time allocation from effort completion.
- **Variance Visualization**: Added color-coded completion pins (Red if late, Green if on-time) to provide immediate variance feedback.
- **Buffer Hatching**: Implemented a diagonal CSS pattern for buffer zones between due dates and hard deadlines.

## Verification
- **Build**: `npm run build` passed with no TypeScript errors.
- **Database**: Schema synchronized successfully within Docker environment.
- **Functionality**: Verified threaded replies, whitelist filtering, and Gantt visuals in browser.
