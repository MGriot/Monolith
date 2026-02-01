# Product Requirements Document (PRD): Project Planner Application

## 1. Executive Summary
**Project Name:** Project Planner (Internal Codename: *Monolith Planner*)
**Vision:** A robust, dockerized project management platform designed for technical teams. It combines hierarchical task management (Project > Task > Subtask) with high-level visualization tools (Gantt, Activity Heatmaps) and AI-readiness via a Model Context Protocol (MCP) module.
**Key Differentiator:** Seamless status propagation through the hierarchy and a "GitHub-style" contribution graph for visual progress tracking, all built on a modern React + Python stack.

## 2. Tech Stack Recommendations

### Frontend
*   **Framework:** React 19 (using Vite for build tooling).
*   **Language:** TypeScript (strict mode).
*   **State Management:** TanStack Query (React Query) for server state; Zustand for local UI state.
*   **UI Component Library:** Shadcn/UI (Tailwind CSS based) for a clean, accessible, and customizable design system.
*   **Visualization:** 
    *   `recharts` for generic charts.
    *   `d3-gantt` or a custom SVG implementation for the Gantt chart to ensure performance with many items.
    *   `react-calendar-heatmap` for the contribution graph.

### Backend
*   **Framework:** FastAPI (Python 3.12+). Async by default, auto-generated OpenAPI docs.
*   **Database:** PostgreSQL. Reliable, robust support for relational data and JSONB if needed.
*   **ORM:** SQLAlchemy (Async) or Prisma Client Python.
*   **AI/MCP:** A dedicated module implementing the Model Context Protocol (MCP) server standard, allowing external AI agents to query/mutate project data safely.

### Infrastructure & DevOps
*   **Containerization:** Docker & Docker Compose (dev & prod).
*   **Reverse Proxy:** Nginx (or Traefik) to route traffic between React and FastAPI containers.
*   **File Storage:** Local Docker Volume (e.g., `monolith_media` mapped to `/app/media`) to ensure data persistence across container restarts without needing external cloud storage for the MVP.

## 3. User Personas
1.  **The Architect (Admin/Owner):** Creates projects, defines teams, and views high-level Gantt/Calendar charts to track roadmap alignment.
2.  **The Builder (Developer/Member):** Focuses on Tasks and Subtasks. Updates status, adds notes/attachments, and wants to see their "contribution graph" light up.
3.  **The AI Agent (MCP Client):** An automated entity that reads project status or updates tasks via the MCP interface.

## 4. Functional Requirements

### 4.1 Hierarchy & Data Management
*   **Structure:** Strict `Project -> Task -> Subtask` hierarchy.
*   **WBS (Work Breakdown Structure):** 
    *   Implementation of a **Unified WBS Entity**. Tasks and Subtasks must be exposed through a shared interface/object that generates a hierarchical WBS code (e.g., `1.1`, `1.1.2`) based on their `sort_index` and parent relation.
*   **CRUD Operations:** Full Create/Read/Update/Delete for all three levels.
*   **Advanced Dependencies:** 
    *   Support for the four standard relationship types:
        1.  **FS (Finish-to-Start):** Successor cannot start until Predecessor finishes.
        2.  **SS (Start-to-Start):** Successor cannot start until Predecessor starts.
        3.  **FF (Finish-to-Finish):** Successor cannot finish until Predecessor finishes.
        4.  **SF (Start-to-Finish):** Successor cannot finish until Predecessor starts.
    *   **Leads & Lags:** Ability to set an offset duration (in days) on any dependency (e.g., FS + 2 days lag).
    *   **Critical Path Method (CPM):** Automated calculation of the longest path of planned activities to the end of the project.
*   **Status Propagation (Automated Logic):**
    *   If all *Subtasks* are `Completed`, parent *Task* moves to `Completed`.
    *   If any *Subtask* is `In Progress`, parent *Task* moves to `In Progress`.
    *   Project progress % calculated as a weighted average of Task completion.

### 4.2 Metadata & Fields
*   **Common Fields (All Levels - Projects, Tasks, Subtasks):**
    *   `UUID` (Primary Key)
    *   `Title` & `Description` (Rich Text/Markdown)
    *   `Topic` & `Type` (e.g., Topic: "Backend", Type: "Feature" or "Bug")
    *   `Status` (Backlog, Todo, In Progress, Review, Done)
    *   `Priority` (Low, Medium, High, Critical)
    *   `Is Milestone:` (Boolean) If true, the item represents a zero-duration significant event.
    *   `Deadline:` (DateTime) A hard constraint date, separate from the planned `due_date`.
    *   `Owner` (User ID) & `Assignees` (List[User ID] - Required for all levels)
    *   `Dates` (Required for all levels): `created_at`, `updated_at`, `start_date`, `due_date`, `completed_at`.
    *   `Tags` (Array of strings - Required for all levels)
    *   `Attachments` (File URLs - Local Volume)
*   **Dependency Fields:** 
    *   `blocked_by` (List of Objects: `{id, type: ENUM(FS, SS, FF, SF), lag: Integer}`)
    *   `blocking` (List of IDs).

### 4.3 Visualization
*   **Project Dashboard (Single Project):**
    *   **Layout:** The main content area must utilize 100% of the available horizontal and vertical space.
    *   **Consolidated Overview (Default View):**
        *   **Top Section:** Project Metadata (Header) and Progress Bar.
        *   **Middle Section:** **Gantt Chart** showing the timeline of all Tasks AND Subtasks.
        *   **Bottom Section:** **Task List View** showing a hierarchical table of all Tasks AND Subtasks.
    *   **Secondary Views (Tabs):** 
        *   **Kanban Board:** Drag-and-drop tasks between statuses. Cards must be color-coded based on `Priority` (e.g., Red for Critical, Blue for Low) and `Status`.
        *   **Activity Heatmap:** A "GitHub-style" graph showing task completion activity over time.
    *   **Gantt Chart Details:** 
        *   **Hierarchy:** Must include a toggle/flag to show/hide Subtasks.
        *   **Color Logic:** 
            *   Bars must be color-coded based on task `Status` and `Priority`.
            *   **Critical Path Highlight:** Items on the critical path should have a distinct border or glow (e.g., Red glow).
        *   **Visual Cues & Alerts:** 
            *   **Overdue Warning:** If `current_date > due_date` and `status != DONE`, display a warning icon (⚠️) on the Gantt bar and in the list view.
            *   **Milestone Marker:** Milestones must be represented as diamond-shaped markers (◆) instead of bars.
            *   **Deadline Indicator:** Show a vertical line or small marker on the timeline for items with an explicit `Deadline`.
        *   **Timeline:** Interactive zoom levels (Day, Week, Month).
    *   **Management:** Functional "Edit Project" button and a robust **Attachment System** allowing file uploads and previews (Images/PDFs).
*   **Global Dashboard (All Projects):**
    *   **Master Gantt:** High-level view of all active projects.
    *   **Master Calendar:** Monthly view of all due dates across projects.

### 4.4 MCP Module (AI Integration)
*   **Architecture:** **Dedicated container service (`mcp-server`)** sharing the database connection but independent from the API backend.
*   **Location:** Source code must reside in a dedicated `mcp/` directory with its own `Dockerfile`.
*   **Access:** Exposed via standard MCP protocol (Stdio/SSE) on the independent container.
*   **Resources:** Expose `projects://`, `tasks://` as readable resources.
*   **Tools:** Expose `create_task`, `update_status`, `search_projects`, `create_user`, `update_project`, `create_subtask` as executable tools for AI agents.
  
### 4.5 Notifications
*   **Triggers:**
    *   Dependency Unblocked (e.g., Task A finishes, Task B starts).
    *   Subtask/Task Completion.
    *   Assignment (User assigned to task).
*   **Channels:**
    *   **In-App:** "Bell" icon in the UI with a dropdown of unread alerts. Real-time updates via polling or SSE.
    *   **Email:** Asynchronous email dispatch (via SMTP) for critical updates.

## 5. Data Model Draft (ER Diagram Concept)

```mermaid
erDiagram
    User ||--o{ Project : owns
    User ||--o{ Task : assigned_to
    Project ||--|{ Task : contains
    Task ||--o{ Subtask : contains
    Task ||--o{ Dependency : has_predecessor
    
    Project {
        uuid id
        string name
        string topic
        string type
        enum status
        float progress_percent
        datetime created_at
        datetime start_date
        datetime due_date
        string[] tags
    }
    
    Task {
        uuid id
        uuid project_id
        string title
        string topic
        string type
        enum status
        enum priority
        boolean is_milestone
        datetime deadline_at
        datetime created_at
        datetime start_date
        datetime due_date
        string[] tags
        uuid[] assignees
    }
    
    Subtask {
        uuid id
        uuid task_id
        string title
        string topic
        string type
        enum status
        boolean is_milestone
        datetime deadline_at
        datetime created_at
        datetime start_date
        datetime due_date
        string[] tags
        uuid[] assignees
    }

    Dependency {
        uuid id
        uuid task_id
        uuid predecessor_id
        enum type
        integer lag_days
    }
```

## 6. API Endpoint Rough Sketch

*   `GET /projects` - List all projects (with filtering).
*   `POST /projects` - Create new.
*   `GET /projects/{id}/statistics` - Returns data for Gantt and Contribution graph.
*   `GET /calendar` - Returns aggregated items with due dates for a given range.
*   `POST /tasks/{id}/dependencies` - Add a dependency relation.
*   `POST /mcp` - Endpoint for AI Agent interaction.

## 7. Non-Functional Requirements
*   **Performance:** Dashboards must load within 200ms. Gantt chart must handle 500+ items without lag (windowing).
*   **Docker:** 1-command setup (`docker-compose up`).
*   **Data Integrity:** Recursive status updates must happen atomically (Database Transactions).

## 8. Risks & Mitigation
*   **Risk:** Status propagation logic becoming infinite loops if circular dependencies exist.
    *   *Mitigation:* Validate for cycles (DAG check) before saving dependency links.
*   **Risk:** Gantt chart becoming unreadable on mobile.
    *   *Mitigation:* Disable complex Gantt on mobile; default to List/Card view.

## 9. Gap Analysis & Improvement Plan (Current State Review)

### 9.1 Frontend Gaps
*   **Navigation & Discoverability:** 
    *   Project names in the "Projects List" and "Upcoming Deadlines" are now direct links.
    *   **Improvement:** Maintain prominent navigation anchors for all hierarchical levels.
*   **Missing Project Editing:**
    *   Users can now update project metadata via the "Settings" action in the project header.
*   **Task List View (Project Level):**
    *   Implemented a "List" tab in `ProjectDetailPage` with a sortable table of tasks and their subtasks.
*   **Dashboard Placeholder:** The main Dashboard (`/`) now features real statistics and links to active work.

### 9.2 Infrastructure & MCP
*   **MCP Container Visibility:** Users noted the absence of a dedicated MCP container. 
    *   **Requirement:** Split MCP into a separate service in `docker-compose.yml` with its own `Dockerfile` in a dedicated `mcp/` directory to allow independent agent access and scaling.

### 9.4 Subtask Creation & Metadata Parity
*   **Creation Flow:** The subtask creation UI (both inline in TaskForm and in SubtaskManager) must allow users to specify `start_date` and `due_date` at the moment of creation, not just post-creation editing.
*   **Circular Dependencies:** Validate for cycles (DAG check) before saving dependency links.
    *   **Gantt Visibility:** Disable complex Gantt on mobile; default to List/Card view.

## 10. Addendum: Orthogonal Stepped Lines (Gantt Visualization)

### 10.1 Conceptual Description
Visual connections in the Gantt chart must follow an **Orthogonal Connector** pattern, using only 90-degree vertical and horizontal segments.

#### A. Hierarchy Connector (Parent -> First Subtask)
*   **Purpose:** Visualizes ownership and initialization scope.
*   **Visual Path:** Starts at the **Start-Left** edge of the Parent Task bar -> Drops **Vertically Down** to the row of the first Subtask -> Moves **Horizontally Right** to touch the **Start-Left** edge of the Subtask.

#### B. Dependency Connector (Predecessor -> Successor)
*   **Purpose:** Visualizes a classic "Finish-to-Start" (Blocking) dependency.
*   **Visual Path:** Starts at the **End-Right** edge of the Predecessor -> Drops **Vertically Down** halfway toward the Successor's row -> Moves **Horizontally Right/Left** to align with the start of the Successor -> Drops **Vertically Down** to connect to the **Start-Left** edge of the Successor.

### 10.2 Technical Implementation
*   **Coordinate System:** Calculate `(x1, y1)` from Predecessor End and `(x2, y2)` from Successor Start.
*   **SVG Path Logic:** Use `M` (Move), `V` (Vertical), and `H` (Horizontal) commands.
*   **Sharpness:** Apply `shapeRendering: "crispEdges"` to ensure lines remain sharp on all displays.
*   **Color Matching:** Line color must match the Predecessor's priority/status color.
*   **Z-Index:** Dependency layer must sit behind task bars.

