# Changelog

All notable changes to this project will be documented in this file.

## [2.1.1] - 2026-02-11

### Added
- **Archived Project Navigation**: Added an "Open" action to archived projects, allowing users to view historical data without full restoration.

### Fixed
- **Gantt Visual Restoration**: Reinstated the floating legend, minor tick labels, and the red "TODAY" marker badge from previous stable versions.
- **Export Crash**: Fixed `AttributeError` during project CSV/Excel exports by implementing on-the-fly WBS calculation for hierarchical data.
- **Gantt Grid Alignment**: Synchronized row grid lines with minor ticks for improved temporal alignment.
- **My Tasks Filtering**: Surgically filtered out archived tasks and tasks from archived projects from the "My Tasks" page.

## [2.1.0] - 2026-02-10

### Added
- **Master Schedule**: Unified the Calendar and Roadmap views into a single, high-performance schedule management page.
- **Advanced Gantt Grid**: The Gantt chart now includes a customizable left-hand data grid with columns for assignees, duration, status, and priority.
- **Deadline Visual Extensions**: Task bars now visually extend in gray to represent the buffer between planned due dates and hard deadlines.
- **Custom Reference Zones**: Users can now create, edit, and style (text color, rotation, position) vertical background regions in the Gantt chart.
- **Automated Deadline Reminders**: Implemented a notification engine that scans for near deadlines and sends email alerts to assignees.
- **Project Action Menus**: Added a "More" dropdown to project list items for rapid access to Archive and Delete functions.

### Fixed
- **Critical Path Visuals**: Connection lines on the critical path now feature a pulsing red glow, complementing the task bar highlighting.
- **Layout Homogeneity**: Standardized all application pages to use a consistent container width, padding, and title typography.
- **Notification Links**: Fixed broken task links in the notification center; they now correctly open the project detail view with the task context.
- **Metadata Persistence**: Resolved issues where WBS Level 1 colors and other metadata fields were not correctly saved to the database.
- **Archive Isolation**: Dashboard statistics now strictly exclude archived projects and tasks from active workload calculations.

## [2.0.0] - 2026-02-08

### Added
- **Central Archive**: A new unified archive page at `/archive` that separates Archived Projects and Individual Archived Tasks using a tabbed interface.
- **Individual Task Archiving**: Users can now archive specific tasks without archiving the entire project. This is useful for clearing cluttered projects or preserving specific work independent of the project lifecycle.
- **Decentralized Team Management**: Standard users can now create and manage their own teams, assigning members from the organization.
- **Workflow Library (SOPs)**: A full-featured repository for Standard Operating Procedures with Markdown support, search, and decentralized ownership.
- **Automated Weekly Summaries**: Implemented a backend reporting engine that sends personalized project and team health summaries to users via email every week.
- **Advanced Project Exports**: Added support for exporting project task lists to **CSV** and **Excel (.xlsx)** formats.
- **High-DPI Gantt Export**: Improved Gantt PNG export resolution to **3x scale** for professional-grade imaging.
- **Task Duration Tracking**: Added a "Days" column to the project task list, showing the inclusive duration between start and due dates.
- **Full Kanban Parity**: Added missing "Backlog" and "On hold" columns to the Kanban board.
- **Precise Kanban Reordering**: Implemented `sort_index` persistence for stable reordering and cross-column moves.
- **Weighted Progress Logic**: Refined project completion calculation to weight statuses accurately (Done: 100%, Review: 80%, In Progress: 50%, On Hold: 25%).
- **Dashboard Breakdown**: Added a detailed "Task Status Breakdown" section to the main dashboard with percentage distributions.

### Fixed
- **Registration Auth Bug**: Resolved an issue where standard user registration incorrectly returned `401 Unauthorized`.
- **Gantt Download directory**: Fixed PNG export logic to ensure files are handled as browser downloads rather than server-side savings.
- **Project Metadata Integrity**: Fixed a `TypeError` in project creation when assigning multiple topics or work types.
- **Percentage Formatting**: Standardized all UI and API percentages to show a maximum of two decimal places.

## [1.5.1] - 2026-02-07

### Added
- **Gantt Header Precision**: Added labels to **minor ticks** in the Gantt timeline (e.g., day numbers in Week view) for better temporal orientation.

## [1.5.0] - 2026-02-07

### Added
- **Priority-Status Dual Coding**: Gantt bars now visualize both **Status** (fill color) and **Priority** (border color) simultaneously.
- **Critical Path Aura**: Connection lines on the critical path now feature a pulsing "red aura" animation for maximum visibility.
- **Floating Legend**: Redesigned the Gantt legend as a compact, floating, semi-transparent element with clear sections for Fill and Border meanings.
- **Intuitive Task Controls**: Replaced generic buttons with clear Arrow icons for moving and nesting tasks in the list view.

## [1.4.0] - 2026-02-07

### Added
- **Status & Priority**: Added **"On hold"** status across backend, frontend, and database enum.
- **Consistent Color Coding**: Implemented centralized style configuration for all statuses and priorities.
- **Task List Controls**: Added **reordering (Up/Down)** and **nesting (Indent/Outdent)** controls for WBS management.
- **Metadata Colors**: Added color support for Work Types in the database and Admin UI.
- **Gantt Legend**: Updated legend to reflect new status and priorities.

### Fixed
- **Database Integrity**: Resolved `InvalidTextRepresentationError` by adding 'ON_HOLD' value to PostgreSQL `status` enum type.
- **Form Consistency**: Added missing 'On hold' option to Project and Task creation/edit dropdowns.
- **Build Types**: Fixed `ProjectTaskList` prop interface mismatch in `project-detail.tsx`, ensuring correct type safety for task indentation handlers.

## [1.3.0] - 2026-02-07

### Added
- **Gutter-Based Gantt Routing**: Implemented a sophisticated orthogonal routing system that directs all connection lines through the "gutters" between task rows, preventing overlap with task bars.
- **Two-Color Connection Standard**: Established a high-contrast visual standard using **Blue-600** for dependencies and **Slate-400** for WBS hierarchy lines.
- **WBS Aesthetic & Backwards Routing**: Refactored hierarchy lines to use smooth, curved orthogonal paths with a "shared leftmost spine" logic that prevents bar overlap even when subtasks start before their parents.
- **Dependency Recovery System**: Implemented a frontend fallback mechanism that synthesizes connection lines from `blocked_by_ids`, ensuring visibility even when relationship objects aren't fully hydrated.
- **Conflict Visuals**: Integrated "Amber Dashed" loopback paths for scheduling conflicts (Successor Start < Predecessor Finish) within the new gutter routing system.

### Fixed
- **Docker Build Integrity**: Resolved TypeScript errors and type mismatches in project/task schemas that were blocking successful container builds.
- **CPM Harmonization**: Synchronized Critical Path Method calculations to support both the explicit Dependency table and the ID-based fallback array.

## [1.2.0] - 2026-02-07

### Added
- **Hierarchical Template Indentation:** The project template editor now supports nested task structures via indentation. Using 2 spaces (or tabs) in the task list automatically creates a parent-child relationship, allowing for complex project scaffolding in a single text field.
- **Recursive Template Parsing:** Implemented intelligent parsing and serialization logic in the frontend to handle transformation between indented text and recursive JSON structures.

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
