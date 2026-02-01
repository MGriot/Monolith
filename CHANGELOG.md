# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2026-02-01

### Added
- **Unified Type System:** Created centralized interfaces for Project, Task, Subtask, and User in the frontend.
- **Global Activity Dashboard:** Added a system-wide activity heatmap to the main dashboard.
- **Advanced Visualization:** Implemented orthogonal stepped lines and multi-level zoom in the Gantt chart.
- **Delete Functionality:** Implemented deletion for Projects, Tasks, and Subtasks across UI and Backend.
- **MCP Agent Tools:** Expanded MCP server with `delete_project` and `owner_id` support.
- **Omega Stress Test:** Created an autonomous script to generate complex planetary colonization project data.

### Fixed
- **Type-only Imports:** Resolved `TS1484` errors by complying with `verbatimModuleSyntax`.
- **Status Propagation:** Fixed parent task status updates and project progress calculation logic.
- **Nginx Upstream:** Resolved 502 errors caused by backend container IP changes.
- **Subtask Manager:** Fixed reactive state issues when switching between editing different subtasks.

### Removed
- **Redundant Tabs:** Removed the dedicated "Activity" tab from project details in favor of an integrated Overview heatmap.

---
## [0.1.0] - 2026-01-27
### Added
- Initial project scaffold with Docker, FastAPI, and React.
- Basic Project/Task CRUD.
- Authentication system.
