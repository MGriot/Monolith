# Plan: Project Management Overhaul (Phase 2)

Comprehensive upgrade including Risk Management, Cost Tracking, Chat Communication, Recursive Checklists, and Hierarchical File Management.

## Objective
Enhance Monolith with professional PMO features:
1.  **Financials:** Budget vs. Actual cost tracking.
2.  **Risk Management:** Probability/Impact scoring and Dashboard Heatmap.
3.  **Communication:** Evolution of Comments into a Project Chat with rich media.
4.  **Task Execution:** Checklist-driven progress.
5.  **Files & Notes:** Hierarchical folder tree with Markdown notes and unified media storage.

## Key Files & Context
### Backend (FastAPI + SQLAlchemy)
- `app/models/project.py`, `app/models/task.py`: New metadata and metrics fields.
- `app/models/comment.py`: Extend for Chat (attachments/links).
- New `app/models/folder.py`, `app/models/file.py`: Hierarchical storage.
- `app/crud/crud_task.py`: Checklist-progress logic.
- `app/api/api_v1/endpoints/`: New endpoints for Folders, Files, and Analytics.

### Frontend (React + Tailwind + Lucide)
- `src/components/task-form.tsx`, `src/components/project-form.tsx`: Input fields for Risk/Cost.
- `src/components/chat-section.tsx`: New communication component.
- `src/components/folder-tree.tsx`: Navigation for the file system.
- `src/components/risk-heatmap.tsx`: Dashboard visualization.
- `src/components/task-checklist.tsx`: New component for task-level points.

## Implementation Steps

### Phase 1: Database & Schemas (The Foundation)
1.  **Migration:** Add fields to `Project` and `Task`:
    - `budget`, `real_cost` (Numeric)
    - `risk_probability` (1-5 or 0-1), `risk_impact` (1-5)
    - `priority` (Enum) to Projects.
    - `checklist` (JSONB) to Tasks.
2.  **Migration:** Add `attachments` (ARRAY) and `links` (ARRAY) to `Comment`.
3.  **New Models:** Implement `Folder` and `File` models with recursive relationships.
4.  **Schema Update:** Update Pydantic schemas in `app/schemas/`.

### Phase 2: Backend Logic & APIs
1.  **Task Logic:** Implement signal/method to auto-calculate `progress_percent` when `checklist` items are toggled.
2.  **Folder API:** CRUD for project/task folders.
3.  **Analytics API:** Calculate Risk Exposure ($Score = Probability \times Impact$) for the Dashboard Heatmap.
4.  **Chat API:** Update Comment CRUD to handle rich media storage.

### Phase 3: Enhanced UI Components
1.  **Task Overhaul:**
    - Integrated Checklist component in `TaskForm`.
    - Risk & Cost inputs.
2.  **Attachment Decision 2.0:**
    - Allow choosing from PC, Link, or **Excalidraw Whiteboard**.
    - Implement preview for Whiteboards in lists.
3.  **Chat Evolution:**
    - Replace/Upgrade `CommentSection` into `ChatSection` (Left/Right bubbles, embedded previews).
4.  **The Hub (Folder Tree):**
    - Sidebar or Tab component for Project Files.
    - Specialized `media/` and `notes/` folders.
    - Markdown editor/renderer for notes.

### Phase 4: Dashboard & Analytics
1.  **Risk Heatmap:** Implement a 5x5 grid visualization on the Dashboard.
2.  **Financial Stats:** Add Budget vs. Actual charts to Project Detail and Dashboard.

## Verification & Testing
- **Checklist Test:** Verify that checking 2/4 items updates task progress to 50%.
- **Risk Test:** Verify that a High Prob/High Impact task appears in the top-right corner of the heatmap.
- **Cost Test:** Verify sum of task costs rolls up (optional) or displays correctly against project budget.
- **File Test:** Create a folder, add a Markdown note, and verify it renders correctly.

## Approval
Informal agreement on this multi-phased approach is required before execution.
