# Changelog: UI-012 - Header Unification & Layout Streamlining

**Date:** 2026-03-10
**Task IDs:** UI-012, UI-013
**Status:** Verified & Committed

## Changes

### 1. Global Header Architecture (UI-012)
- **TitleContext & useTitle Hook**: Established a new React Context in `layout.tsx` to allow dynamic control of the main application header. Pages can now set:
    - `title`: The primary page heading.
    - `icon`: The Lucide icon displayed next to the title.
    - `actions`: A collection of React nodes (buttons, etc.) rendered on the right side of the header.
- **Header Design Update**: The global header in `layout.tsx` was redesigned to include the current page title and icon on the left, perfectly aligned with the user profile on the right. Redundant spacers were removed.

### 2. Page-Level Cleanup (UI-013)
- **Banner Removal**: Eliminated the `p-6 bg-white border-b border-slate-200` banner div from every major page, including:
    - `dashboard.tsx`
    - `projects-list.tsx`
    - `my-tasks.tsx`
    - `archive.tsx`
    - `schedule.tsx`
    - `teams.tsx`
    - `templates.tsx`
    - `users.tsx`
    - `workflows.tsx`
    - `admin-metadata.tsx`
    - `settings.tsx`
- **Action Relocation**: Migrated logic-heavy buttons like "New Project," "Create SOP," and "Export" into the global header using the `useTitle` hook, ensuring they remain accessible while freeing up vertical page content.
- **Project Detail Overhaul**: Refactored the Project Detail header. The status and primary actions are now in the global header, while technical metadata (Topics, Types, Progress) has been moved into a clean `grid` of cards within the Overview tab.

### 3. Critical Fixes
- **Archive Page Import**: Fixed a missing `useEffect` import in `archive.tsx` that caused a blank screen after the Layout refactoring.

## Verification
- **Visual Consistency**: Verified that the title and icon remain sticky and aligned as the user navigates between all primary routes.
- **Functional Check**: Confirmed that "New Project" and "Export" actions correctly trigger their respective dialogs from the new header positions.
- **Archive Recovery**: Confirmed the Archive page now renders correctly.
