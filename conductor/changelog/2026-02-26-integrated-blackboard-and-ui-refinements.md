# Changelog - 2026-02-26 - Integrated Blackboard & UI Refinements

## 🎨 New Feature: Integrated Blackboard (Sketching)
- **Full-Stack Persistence**: Implemented a dedicated `blackboards` model and API for storing infinite-canvas drawings using `JSONB` state.
- **Drawing Editor**: Integrated `@tldraw/tldraw` into a robust, local-first sketching component.
- **Contextual Creation**: 
    - Added a **Project Library** tab for project-wide sketches.
    - Added a **"Create Sketch"** action to task attachments, automatically attaching exported PNGs to the task.
- **Export Capabilities**: Supports high-fidelity exports to PNG/SVG directly into the task attachment system.

## 🚀 UI/UX Consolidation & Navigation
- **Master Schedule**: Merged the separate Calendar and Roadmap pages into a unified, high-performance `/schedule` view.
- **Standardized Avatars**: Replaced generic icons with a centralized `UserAvatar` component using color-hash generation and standard fallbacks.
- **Navigation Cleanup**: 
    - Removed redundant "Settings" buttons from headers.
    - Consolidated Project Settings and Scoped Taxonomy management into the **Library** tab.
- **Unified Task Flow**: Enhanced the global creation dialog to support "Independent Tasks" (not linked to a project) with proper serialization logic.

## 📊 Gantt & Alert Intelligence
- **Row Colors**: Implemented a toggleable row-tinting system based on custom task colors.
- **Refined Alert Logic**: The "Overdue" status is now context-aware; alerts are hidden if a task's conclusion date is on or before its due date/deadline, preventing false positives for completed work.
- **Visual Grid Fixes**: Applied solid backgrounds to sticky header cells to prevent axis bleed-through during scrolling.

## 🔧 Infrastructure & Developer Experience
- **Docker Simplification**: Eliminated the separate Nginx container by integrating reverse proxy rules directly into the frontend container's production stage.
- **MCP Server Upgrade**: Migrated to the official `mcp` library abstractions and added new tools for search, taxonomy management, and blackboard CRUD.
- **Build Integrity**: Fixed numerous TypeScript errors and backend `AttributeError` issues related to dependency injection.

## Verification
- **Docker**: Verified successful 3-container build (`db`, `backend`, `frontend`) using `docker-compose up --build`.
- **API**: Health checks passed via the new consolidated proxy routing.
- **Frontend**: Verified 100% clean production build with `tsc` and `vite build`.
