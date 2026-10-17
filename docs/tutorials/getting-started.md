# Getting Started with Monolith

This tutorial will guide you through your first steps in Monolith, from launching the application to creating your first project hierarchy.

## 1. Launch the Environment

Monolith runs as a small container stack under rootless Podman or Docker. Full details are in
[Run with Podman](../how-to/run-with-podman.md).

### Production Mode
```bash
cp .env.example .env            # fill in the secrets and the first admin
scripts/mail-bootstrap.sh       # one-time: TLS cert + mailbox for the internal mail server
podman-compose up -d --build    # or: docker compose up -d --build
```
The app is served at `http://localhost:8080` (set `HTTP_PORT` in `.env` to change it).

### Development Mode (with Hot Reload)
Add the dev overlay to get live reloading:
```bash
podman-compose -f compose.yaml -f compose.dev.yaml up -d --build
```
- **Frontend:** Runs Vite on `http://localhost:5173`. Any changes to `./frontend/src` will reflect instantly via Hot Module Replacement (HMR).
- **Backend:** Runs Uvicorn on `http://localhost:8000`. Any changes to `./backend/app` will trigger an automatic server restart.
- **Note for Windows Users:** Hot-reload uses polling to ensure file system events are captured reliably across the volume boundary.

## 2. Log In
Open `http://localhost:5173` (dev) or `http://localhost:8080` (prod).
There are no default accounts: sign in with `FIRST_SUPERUSER_EMAIL` / `FIRST_SUPERUSER_PASSWORD` from your `.env`, then
remove the password from `.env`. Create further users from the admin screen, or set `ALLOW_SIGNUP=true` to let people
request an account that an administrator approves.

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

## 7. Collaborate with Teams
Every user can form their own teams:
1. Navigate to **Teams** in the sidebar.
2. Click **"Create Team"** and give it a name.
3. Assign members from the list of registered users.
4. As an owner, you'll receive weekly activity reports for your team.

## 8. Document Workflows
Standardize your team's knowledge:
1. Navigate to **Workflows** in the sidebar.
2. Search for existing SOPs or click **"Create SOP"**.
3. Use the Markdown editor to draft procedures.
4. View procedures in a clean, readable format.

## 9. Track & Export Progress
- **Kanban:** Drag tasks to update status and priority.
- **Reporting:** Check your email every Monday for an automated weekly summary of your tasks and projects.
- **Exporting:** Use the **CSV** or **Excel** buttons in the Project Header to download your project data for external use.
- **Gantt:** Use **"Export PNG"** to save a high-DPI visualization of your timeline.
