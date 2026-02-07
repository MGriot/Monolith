# Getting Started with Monolith

This tutorial will guide you through your first steps in Monolith, from launching the application to creating your first project hierarchy.

## 1. Launch the Environment
Ensure you have Docker and Docker Compose installed. In your terminal, run:
```bash
docker-compose up -d --build
```

## 2. Log In
Open your browser and navigate to `http://localhost:8080`.
Log in with the default administrator credentials:
- **Email:** `admin@admin.com`
- **Password:** `admin123` (Initial default)

## 3. Configure Metadata (Admins Only)
Before creating projects, an administrator should define global categories:
1. Navigate to the **Metadata** page in the sidebar.
2. Under **Topics**, create labels like "Frontend", "Marketing", or "DevOps".
3. Under **Work Types**, create labels like "Feature", "Bug", or "Research".
4. Colors assigned to Topics will be reflected in the project headers and Gantt bars.

## 4. Create a Project
1. Click the **"New Project"** button on the Dashboard or Projects page.
2. **Choose a Template:** You can select a predefined template (like "Standard Feature Release") or start with a **Blank Project**.
3. Enter a name (e.g., "Mars Rover Deployment").
4. Select a **Topic** and **Type** from the managed dropdowns.
5. Set a Start and Due date to enable Gantt features.

## 5. Templates & Indentation
Templates allow you to pre-define entire project structures.
- Navigate to the **Templates** page.
- In the task list, use **indentation** to create subtasks.
- Example:
  ```text
  Phase 1: Setup
    Repo Initialization
    Environment Config
  Phase 2: Execution
    ...
  ```
- When you create a project from this template, Monolith builds the entire hierarchy for you automatically.

## 6. Build the Hierarchy (Manual)
1. Open your new project.
2. Click **"Add Task"** to create high-level milestones (e.g., "Build Chassis").
3. Click on a task to open the Edit Dialog.
4. Use the **Subtask Manager** within the dialog to add granular steps (e.g., "Procure Titanium", "Weld Joints").

## 7. Track Progress
- Switch to the **Kanban** tab to drag items across columns.
- Return to **Overview** to see how subtask completions automatically drive the progress bars and activity heatmap.
