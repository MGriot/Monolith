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
- If **all** subtasks are "Done", the parent Task becomes "Done".
- If a task has no subtasks, its status is managed manually.

### Task to Project
The Project's `progress_percent` is calculated by the completion status of its Tasks:
- **Done:** 100% contribution.
- **In Progress / Review:** 50% contribution.
- **Todo / Backlog:** 0% contribution.

## Dependency Resolution
Monolith implements **Recursive Dependency Checking**. If Task B depends on Task A:
- Task B cannot be marked "Done" until Task A is "Done".
- Circular dependencies (A depends on B, B depends on A) are detected and blocked at the API level using Depth-First Search (DFS).
