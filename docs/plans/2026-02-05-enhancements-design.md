# Design: System Enhancements (Admin, Gantt, Schema)

## 1. Dynamic Metadata (Topics & Types)
**Goal**: Replace free-text "Topic" and "Type" fields with database-backed dropdowns manageable by Admins.

### Schema Changes
*   **New Models**:
    *   `Topic` (id, name, color, is_active)
    *   `WorkType` (id, name, icon, is_active) - Renamed from 'Type' to avoid reserved keyword conflicts.
*   **Modifications**:
    *   `Project`: Change `topic` (str) -> `topic_id` (FK), `type` (str) -> `type_id` (FK).
    *   `Task`: Change `topic` (str) -> `topic_id` (FK), `type` (str) -> `type_id` (FK).
    *   **Migration Strategy**: Create new columns, map existing strings to new records (auto-create if missing), drop old columns.

### Admin UI
*   **Page**: `/admin/metadata` (Protected Route).
*   **Features**:
    *   Tabs for "Topics" and "Work Types".
    *   CRUD tables with inline editing.
    *   Color picker for Topics (for badges).

### Impact on Forms
*   `ProjectForm` & `TaskForm`: Replace Input with Select/Combobox fetching from `/api/v1/topics` and `/api/v1/work-types`.

## 2. Admin & User Management
**Goal**: Centralize user management and restrict sensitive data.

### Permissions
*   **Rule**: Only `is_superuser=True` can access `/users`, `/admin`, and see Team data.
*   **Middleware**: Enforce `superuser` check on backend endpoints for user list/edit.

### User Management Page
*   **Enhancements**:
    *   Add "Reset Password" button (Admin only).
    *   Add "Set as Admin" toggle.
    *   **Security Note**: We will **NOT** display passwords. We will allow Admins to *reset* them to a temporary value or trigger a reset flow.

## 3. Gantt Chart Visuals
**Goal**: Improve readability and aesthetics.

### Enhancements
*   **"TODAY" Label**: Fix z-index/clipping issue. Likely needs to be appended to the overlay layer or have `z-index: 50`.
*   **Curved Connectors**:
    *   Replace Orthogonal `H -> V -> H` paths with `H -> Q (curve) -> V -> Q (curve) -> H`.
    *   Use a `radius` parameter (e.g., 10px).
*   **Ticks**:
    *   Add `minorTicks` rendering logic for Week/Day subdivisions in Month/Week views.
    *   Style: Lighter color, shorter height.

### Export
*   **Tool**: `html-to-image` (client-side).
*   **Feature**: "Export PNG" button in Gantt toolbar.
*   **Mechanism**: Capture the scrollable container, handle styling for export (white background).

## 4. Execution Plan (Ralph Tracks)
We will split this into 3 Tracks to run efficiently:

*   **Track 1: Core Data (Schema & Admin)**
    *   Backend migrations, API endpoints, Admin UI.
*   **Track 2: Frontend Forms & Logic**
    *   Update Task/Project forms, integrate new APIs.
*   **Track 3: Gantt Polish**
    *   Visual fixes, curves, export, ticks.
