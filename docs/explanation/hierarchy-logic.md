# Explanation: Hierarchy & Status Logic

Monolith is built on a "Hierarchical Completion Engine" that ensures data integrity across different zoom levels of a project.

## The Three-Tier Model
1. **Project:** High-level container for a specific goal.
2. **Task:** A significant milestone or deliverable within a project.
3. **Subtask:** An atomic unit of work.

## Status Propagation
To prevent manual work, Monolith automatically calculates progress based on the lowest level of the hierarchy:

### Subtask to Task
- If **any** subtask is "In Progress", the parent Task becomes "In Progress".
- If **all** subtasks are "Done", the parent Task attempts to become "Done".
- **Smart Blocker Logic:** If a parent task is blocked by another task, it will remain "In Progress" even if all its subtasks are complete, preventing dependency violations.
- If a task has no subtasks, its status is managed manually.

### Task to Project
The Project's `progress_percent` is calculated by the weighted completion status of its top-level Tasks:
- **Done:** 100% contribution.
- **Review:** 80% contribution.
- **In Progress:** 50% contribution.
- **On Hold:** 25% contribution.
- **Todo / Backlog:** 0% contribution.

## Kanban Board Dynamics
The Kanban board provides a synchronized view of this hierarchy. Moving a task between status columns (e.g., from "In Progress" to "Review") automatically updates its `status` and `sort_index` in the database, which in turn triggers the recursive status propagation logic described above. Each column is limited to 5 visible tasks to maintain visual performance.

## Dependency Resolution
Monolith implements **Recursive Dependency Checking**. If Task B depends on Task A:
- Task B cannot be marked "Done" until Task A is "Done".
- Circular dependencies (A depends on B, B depends on A) are detected and blocked at the API level using Depth-First Search (DFS).

## Template Hierarchies
Project Templates support the same hierarchical logic as active projects. When defining a template, subtasks can be nested using **indentation** (2 spaces). This structure is preserved when a project is scaffolded from the template, automatically generating the full Task → Subtask tree.
