# Changelog

All notable changes to this project will be documented in this file.

## [1.1.0] - 2026-02-06

### Added
- **Project Templates:** Implemented a full template system allowing users to define reusable project shells and task lists.
- **Multi-Metadata Support:** Transitioned Topics and Types to many-to-many relationships, allowing projects and tasks to belong to multiple categories.
- **Project Auto-Sync:** Implemented backend logic to automatically inherit and aggregate dates, topics, and types from constituent tasks up to the project level.
- **Template Management UI:** Created a dedicated page for template CRUD operations.
- **Scaffolded Creation:** Integrated template selection into the "New Project" workflow.

### Changed
- **Calendar Simplification:** Refined the calendar view to display only discrete deadline events, improving readability by removing overlapping range bars.
- **Task List UI:** Removed the redundant 'ORDER' column from the project task list.
- **Deadline Logic:** Updated overdue warning logic to strictly compare completion/today dates against hard deadlines.
- **Multi-select Forms:** Refactored Project and Task forms to use a modern button-toggle interface for multiple topic/type selection.

### Fixed
- **Recursive Lazy Loading:** Resolved `MissingGreenlet` errors by eager-loading many-to-many relationships in deep task hierarchies.
- **Nginx Upstream Resolution:** Fixed intermittent 502 errors during login by implementing dynamic DNS resolution using the Docker resolver (`127.0.0.11`) and variable-based `proxy_pass` in `nginx.conf`. This prevents stale IP caching when backend containers restart.
- **Build Integrity:** Fixed newline escaping issues in TSX string literals and removed dead imports.
- **Template API Auth:** Fixed an `AttributeError` in template endpoints by correcting current user dependency usage.

## [1.0.0] - 2026-02-01

### Added
- **Unified Type System:** Created centralized interfaces for Project, Task, Subtask, and User in the frontend, resolving inconsistent model definitions.
- **Global Activity Dashboard:** Added a system-wide activity heatmap to the main dashboard aggregating completions across all projects.
- **Advanced Visualization:** Implemented orthogonal stepped lines and multi-level zoom (Day/Week/Month/Year) in the Gantt chart with pixel-perfect coordinate alignment.
- **Delete Functionality:** Implemented comprehensive deletion for Projects, Tasks, and Subtasks across UI and Backend with confirmation prompts.
- **MCP Agent Tools:** Expanded MCP server with `delete_project`, `create_project` with `owner_id`, and improved ID extraction for automated scripts.
- **Omega Stress Test:** Created `mcp/agent_create_huge_project.py` to generate complex planetary colonization project data for feature validation.
- **Orthogonal Connectors:** Specified and implemented PRD addendum for hierarchy (dashed) and dependency (Z-shape) connectors in Gantt views.

### Fixed
- **Type-only Imports:** Resolved `TS1484` errors by complying with `verbatimModuleSyntax`.
- **Status Propagation:** Fixed parent task status updates and project progress calculation logic in `crud_task.py`.
- **Nginx Upstream:** Resolved 502 errors by refreshing proxy connections after backend container IP changes.
- **Subtask Manager:** Fixed reactive state issues when switching between editing different subtasks by introducing `editingSubtaskId` and `draftSubtask` local state.
- **SQLAlchemy Silence:** Disabled `echo=True` in production engine to prevent stdout pollution during MCP stdio communication.

### Removed
- **Redundant Tabs:** Removed the dedicated "Activity" tab from project details in favor of an integrated, resized Overview heatmap.

---

## [0.5.0] - 2026-01-31

### Added
- **Projects List Page:** Dedicated view at `/projects` with table-based tracking of all user projects.
- **Create Project Workflow:** Reusable `ProjectForm` and deep-linking support via `?create=true`.
- **Dashboard Implementation:** Aggregated statistics for tasks (Done, In Progress, Todo) and upcoming deadlines.
- **Improved Task Creation:** Support for atomic task+subtasks creation in a single form using `useFieldArray`.
- **Subtask Metadata Parity:** Added Start/Due dates, Priority, and Assignees to subtasks at creation time.
- **MCP Documentation:** Created `MCP_GUIDE.md` and dedicated server entrypoint `backend/mcp_server.py`.

### Fixed
- **Calendar Navigation:** Fixed "dead" buttons in the calendar view; added `project_id` to calendar items for direct navigation.

---

## [0.4.0] - 2026-01-30

### Added
- **Task Management UI:** Creation and edit dialogs with Zod validation and React Hook Form.
- **Subtask Management:** Full lifecycle UI (create, toggle, delete) with automatic progress propagation.
- **Dependency UI:** Graphical manager for Finish-to-Start task dependencies with cycle prevention.
- **File Attachment System:** Backend storage and frontend manager for task-related files.
- **User & Team UI:** Organization-wide user list and role management.
- **Notification Center:** Bell icon with dropdown, unread badges, and real-time polling.
- **Markdown Support:** Consistent rendering for project and task descriptions using `react-markdown`.
- **Task Assignment:** Multi-user assignment UI for both tasks and subtasks.

---

## [0.3.0] - 2026-01-29

### Added
- **Auth Infrastructure:** Axios interceptors for JWT management and `AuthProvider` for global state.
- **Master Calendar:** Full-width monthly grid view for cross-project task tracking.
- **Master Gantt (Roadmap):** Custom SVG-based roadmap view with monthly subdivisions and status-based coloring.
- **Project Detail Shell:** Tabbed interface (Overview, Kanban, Activity) for individual project management.
- **Kanban Board:** Drag-and-drop board using `@dnd-kit` with priority-coded task cards.

---

## [0.2.0] - 2026-01-28

### Added
- **Status Propagation Logic:** Backend implementation for subtask-to-task and task-to-project progress updates.
- **Dependency Tracking:** Recursive cycle detection using DFS and Finish-to-Start validation logic.
- **MCP Server Init:** Initial implementation of "Monolith Planner" MCP server with task/project resources.
- **Notification Engine:** Backend models and triggers for assignment and unblocking notifications.
- **UI Foundation:** Configured Tailwind CSS and initialized Shadcn/UI component library.

---

## [0.1.0] - 2026-01-27

### Added
- **Project Scaffold:** Initialized FastAPI backend and React/Vite frontend.
- **Infra Init:** Created `docker-compose.yml` with PostgreSQL, Nginx, and core app services.
- **Database Core:** Implemented SQLAlchemy models for Users, Projects, and Tasks.
- **Auth System:** Established JWT-based authentication and security utilities.
- **Base CRUD:** Implemented generic `CRUDBase` class for streamlined API development.