# Changelog - 2026-02-26 - Integrated Whiteboard & UI Refinements

## 🎨 New Feature: Integrated Whiteboard (Sketching)
- **Full-Stack Persistence**: Implemented a dedicated `whiteboards` model and API for storing infinite-canvas drawings using `JSONB` state.
- **Project Library Integration**: Added a "Library" tab to the project view to list, manage, and edit saved sketches.
- **Task Attachments**: Enabled exporting sketches as high-quality PNGs directly into task attachments.
- **Engine**: Initially implemented with `@tldraw/tldraw`, then migrated to `@excalidraw/excalidraw` for better stability and aesthetic.

## 🚀 Navigation & UI Consolidation
- **Unified Master Schedule**: Merged the Calendar and Roadmap pages into a high-performance unified view at `/schedule`.
- **Consolidated Action Button**: Removed redundant "Create Project" and "Independent Task" buttons in favor of a single global "Add" dropdown in the header.
- **Cleaner Project Views**: Removed the "Settings" button from the sub-nav; settings and taxonomy management are now integrated into the **Library** tab.
- **Gantt De-cluttering**: Removed month/year labels from the task-list column in the Gantt chart to maximize vertical space.

## 🛠️ Logic & Bug Fixes
- **Smart Overdue Alerts**: Refined logic to automatically hide "Overdue" icons if a task is marked done on or before its deadline.
- **SOP Upgrades**: Integrated a Markdown editor with image support for the Workflow Library (SOPs).
- **Gantt Row Colors**: Fixed a bug in row color rendering and added a user toggle to enable/disable them.
- **Payload Fix**: Resolved serialization errors when creating independent tasks.
- **Avatar Consistency**: Standardized the use of the `UserAvatar` component across comments and threads.

## 🏗️ Infrastructure
- **Docker Optimization**: Evaluated and removed the standalone Nginx container, moving proxy logic into the frontend container for a leaner footprint.
- **MCP Server Upgrade**: Migrated to the official `mcp` library abstractions and added new tools for search, taxonomy management, and whiteboard CRUD.
