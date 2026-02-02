# Specification: Recursive N-Level Tasks

## 1. Unified Task Model
- Merge `Subtask` and `Task` into a single `Task` model.
- Add `parent_id: UUID` (nullable, ForeignKey to `tasks.id`).
- Add `subtasks` relationship (self-referencing).

## 2. Recursive WBS
- WBS generation must walk the tree.
- `1` -> `1.1` -> `1.1.1` etc.

## 3. Recursive Status Propagation
- If all children are `DONE`, parent becomes `DONE`.
- If any child is `IN_PROGRESS`, parent becomes `IN_PROGRESS`.
- This must bubble up to the root task.

## 4. API Consolidation
- Remove `/subtasks/` endpoints.
- `/tasks/` will handle all levels.
- Add `parent_id` filter to `GET /tasks/`.
