# Plan: Idea Enhancements - Voting, Task Integration & Project Promotion

## Objective
Enhance the collaborative "Ideas" system to allow community voting, link ideas to specific tasks, and support a full promotion workflow where ideas can become either tasks or entirely new projects.

## Key Files & Context
- **Backend Models**: `backend/app/models/idea.py`, `backend/app/models/associations.py`
- **Backend Logic**: `backend/app/crud/crud_idea.py`, `backend/app/api/api_v1/endpoints/ideas.py`
- **Frontend Components**: `frontend/src/components/project-ideas.tsx`, `frontend/src/pages/my-tasks.tsx`
- **Migration**: `backend/apply_idea_updates.py` (New)

## Implementation Steps

### Phase 1: Backend Schema & Infrastructure
1. **Migration Script**: Create `backend/apply_idea_updates.py` to add `task_id` and `promoted_project_id` columns to the `ideas` table and create the `idea_votes` join table.
2. **Model Updates**:
    - Update `associations.py` to include `idea_votes` table.
    - Update `idea.py` to include new foreign keys and the `votes` relationship.
3. **Schema Updates**:
    - Add `task_id` to `IdeaCreate`.
    - Add `vote_count` and `has_voted` (calculated) to the `Idea` response schema.

### Phase 2: Backend Logic Refinement
1. **CRUD Enhancements**:
    - Implement `toggle_vote` in `CRUDIdea`.
    - Implement `promote_to_project` in `CRUDIdea` (copying title/description to a new project).
    - Update fetching logic to correctly count votes and check if the current user has voted.
2. **API Endpoints**:
    - Add `POST /ideas/{id}/vote` to toggle the current user's vote.
    - Add `POST /ideas/{id}/promote-project` to handle promotion to project.
    - Allow filtering by `task_id` in `GET /ideas/`.

### Phase 3: Frontend User Interface
1. **Voting System**:
    - Add a "Vote" button (Heart/Thumbs-up icon) to the Idea cards.
    - Show the total vote count on each card.
2. **Task Integration**:
    - Integrate the `ProjectIdeas` component into the `MyTasksPage` edit dialog.
    - Pass the current `taskId` to ensure ideas proposed from a task are linked to it.
3. **Promotion Workflow**:
    - In the Idea detail dialog, add a "Promote to Project" button next to "Promote to Task".
    - Standardize the status management (Approve/Reject) buttons for project owners.

## Verification & Testing
1. **Unit Test**: Run a Python script to verify voting toggles and promotion logic.
2. **UI Test**:
    - Navigate to a task in "My Tasks".
    - Create an idea linked to that task.
    - Vote for the idea from another account (or same).
    - Promote the idea to a new project and verify navigation to the new project.
3. **Consistency Check**: Ensure user avatars remain consistent with the standardized style.
