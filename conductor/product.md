## 12. Addendum: Advanced Access & Resource Views (Feb 7, 2026)

### 12.1 Feature: Hierarchy-Based Access Control
We distinguish between full project access and task-specific execution access.

*   **Role Definitions:**
    *   **Project Member:** A user explicitly added to the Project's member list (or the Owner).
        *   **Capabilities:** Full access to Project Details, visible in "Projects" list, can edit project metadata.
    *   **Task Assignee:** A user assigned to a Task but *not* added as a Project Member.
        *   **Capabilities:** Restricted. Cannot see the Project in "Projects" list. Cannot access Project Details page. Can ONLY view/edit their specific assigned tasks via the "My Tasks" page.

*   **UI/UX Changes:**
    *   **Project Forms (Create/Edit):** Add a "Members" selection field (Multi-select User list) to grant Project Member status.
    *   **Route Guards:** The `/projects/{id}` route must verify that `current_user` is either the Owner or a Member. If not, redirect to `/tasks`.

### 12.2 Feature: "My Tasks" Page
A focused execution view for individual contributors.

*   **Route:** `/tasks` (Added to main Navigation Bar).
*   **Data Scope:** Aggregates ALL tasks assigned to the current user across ALL projects.
*   **Views (Toggleable):**
    1.  **Kanban Board:**
        *   **Columns:** Backlog, To Do, In Progress, On Hold, Review, Done.
        *   **Constraints:** Columns display a maximum of 5 tasks by default. If more exist, a "Show X more" indicator is displayed.
        *   **Interaction:** Drag-and-drop enabled for status updates.
    2.  **List View:** A flat, sortable data table showing Task Title, Project Name, Priority, Due Date, and Status.

### 12.3 Feature: Resource Timeline Charts (User-Gantt)
A visualization tool to manage human resources and workload availability.

*   **Chart Logic:**
    *   **Y-Axis (Rows):** Users.
    *   **X-Axis:** Time (Calendar timeline).
    *   **Bars:** Tasks assigned to that user, plotted by `start_date` and `due_date`.
*   **Implementations:**
    1.  **Project Details (Team View):**
        *   Scope: Users involved in *this* project.
        *   Purpose: Visualize team workload for the specific project.
    2.  **Global Dashboard:**
        *   Scope: Users involved in projects accessible to the current user.
        *   Purpose: See cross-project schedule for the user's team.
    3.  **Admin > Team Page (Super View):**
        *   Scope: ALL users and ALL tasks in the system.
        *   Purpose: Global capacity planning and availability check.

## 13. Addendum: Team Management (Feb 7, 2026)

### 13.1 Feature: Multi-Team Organization
Administrators can define organizational units (Teams) to group users.

*   **Logic:**
    *   **Creation:** Admins can create multiple Teams (e.g., "Frontend", "Backend", "Marketing").
    *   **Membership:** A user can belong to zero, one, or multiple teams.
    *   **Independence:** Team membership is purely for organizational visibility and activity tracking. It does NOT restrict project membership or task assignment.

### 13.2 Feature: Team Activity Visibility
Team members can monitor the progress and completions of their teammates.

*   **Logic:**
    *   If User A and User B are in "Team Alpha", User A will see User B's completed tasks in their "Team Activity" feed.
    *   Users who are not in any team see a standard global or project-specific activity feed.
    *   Admins see activity across all teams.

*   **UI/UX:**
    *   **Admin Team Page:** A new management interface for creating teams and dragging members into them.
    *   **Dashboard Integration:** A new widget showing "Teammate Activity" (recent completions by users in the same team).

## 15. Addendum: Production Polishing & Reporting (Feb 8, 2026)

### 15.1 Feature: Advanced Data Exports
Users need to take their data out of the system for external reporting and presentations.

*   **Gantt PNG Export:**
    *   **Requirements:** High DPI rendering (min 2x scale).
    *   **Fix:** Ensure the resulting file is triggered as a browser download, not saved to a internal server directory.
*   **Project Spreadsheet Export:**
    *   **Formats:** CSV and Excel (.xlsx).
    *   **Content:** Full task list including WBS, status, dates, and assignees.

### 15.2 Feature: Decentralized Workflow Library (SOPs)
Transition the workflow page from a static catalog to a user-managed repository.

*   **CRUD:** Users can create, edit, and delete Standard Operating Procedures (SOPs).
*   **Reading:** Dedicated viewer for SOP content (Markdown support).

### 15.3 Feature: Automated Weekly Summaries
Keep users and stakeholders informed without requiring them to log in.

*   **Recipient Logic:**
    *   **Standard User:** List of their specific tasks due/overdue.
    *   **Team Owner:** Summary of team activity and overall team health.
    *   **Project Owner:** Deep dive into project progress, bottlenecks, and completion rate.
*   **Dispatch:** Every Monday at 08:00 UTC.

### 15.4 UI Refinement: Task Duration Visibility
The task list must provide immediate insight into time allocation.

*   **Column:** "Duration" (Days).
*   **Logic:** `due_date` - `start_date` (inclusive). Already calculated for Gantt, now exposing in Table view.

## 16. Addendum: Gantt, Navigation, and Core Fixes (Feb 10, 2026)

### 16.1 Feature: Gantt Advanced Data Columns
Enhance the Gantt chart's left-side data grid to be a fully functional task list.

*   **New Columns:**
    *   **Assignee:** Avatar and Name.
    *   **Start/End Dates:** Explicit date strings.
    *   **Duration:** Calculated day count.
    *   **Status:** Colored badge.
    *   **Priority:** Icon/Color indicator.
*   **Customization:**
    *   **Visibility:** A "Columns" multi-select menu allows users to show/hide specific columns.
    *   **Sorting/Ordering:** Users can manually reorder columns to customize their view.

### 16.2 Feature: Gantt Visual Enhancements
improve the visual clarity and utility of the timeline view.

*   **WBS Level 1 Styling:** The top-level parent rows (WBS 1, 2, 3...) should have a distinct background color (e.g., light gray or a user-defined color) that extends across the full row width to visually separate phases.
*   **Custom Time Regions:** Users can define vertical background highlights ("Reference Zones") by specifying a Name, Start Date, End Date, and Color. Useful for marking Sprints, Holidays, or Deadlines.
*   **Progress Alignment:** The visual progress bar within a task bar must strictly align with the task's status (e.g., 100% fill for "Done") or a manual `% complete` field.
*   **End Date Label:** Display the `end_date` text explicitly to the right of (or inside) the Gantt bar for immediate visibility.

### 16.3 Refinement: Navigation Overhaul
Simplify and reorganize the application structure.

*   **Archive:** Move "Archived Projects" from a tab in the Projects page to a dedicated top-level Sidebar item (`/archive`).
*   **Manual Archiving:** Add an "Archive Project" action to the project context menu in the main list, allowing manual status updates.
*   **Unified Schedule:** Merge the "Calendar" and "Roadmap" pages into a single "Master Schedule" view to reduce redundancy.

### 16.4 Fixes & Stability
Address reported regressions and broken features.

*   **Workflow Library:** Debug and fix the CRUD operations (Create/Edit/Delete) for Workflows, which are currently reported as broken.
*   **Teams:** Fix the "Team Creator" functionality (Admin > Teams) which is failing to create new teams.
*   **Metadata (Admin):** Fix the "Edit" modal for Topics and WorkTypes to correctly update Name, Color, and Status fields.