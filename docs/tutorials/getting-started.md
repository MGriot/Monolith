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
- **Password:** (Set during initial deployment, usually part of the `.env` or database init)

## 3. Create a Project
1. Click the **"New Project"** button on the Dashboard or Projects page.
2. Enter a name (e.g., "Mars Rover Deployment").
3. Assign a **Topic** (e.g., "Space") and **Type** (e.g., "Hardware").
4. Set a Start and Due date to enable Gantt features.

## 4. Build the Hierarchy
1. Open your new project.
2. Click **"Add Task"** to create high-level milestones (e.g., "Build Chassis").
3. Click on a task to open the Edit Dialog.
4. Use the **Subtask Manager** within the dialog to add granular steps (e.g., "Procure Titanium", "Weld Joints").

## 5. Track Progress
- Switch to the **Kanban** tab to drag items across columns.
- Return to **Overview** to see how subtask completions automatically drive the progress bars and activity heatmap.
