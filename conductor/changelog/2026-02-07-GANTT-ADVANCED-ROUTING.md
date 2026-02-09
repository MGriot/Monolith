# Changelog: FRONT-054-056 - Gantt Connection & Routing Overhaul

**Date:** 2026-02-07
**Task IDs:** FRONT-054, FRONT-055, FRONT-056, BACK-025
**Status:** Verified & Deployed (Docker)

## Changes

### Frontend (Gantt Chart)
- **Gutter-Based Orthogonal Routing**: Implemented a "gutter offset" system in `getOrthogonalPath`. Horizontal transit segments now travel in the white space (±22px) between rows, ensuring lines never overlap task bars.
- **Two-Color Visual Standard**:
    - **Blue-600 (`#2563eb`)**: Primary color for all task dependencies.
    - **Slate-400 (`#94a3b8`)**: Primary color for WBS hierarchy (Parent -> Subtask) lines.
- **WBS Aesthetic & Backwards Routing**: 
    - Hierarchy lines now use smooth, curved orthogonal paths.
    - **Shared Spine Alignment**: Implemented a "leftmost spine" logic that automatically shifts the vertical axis to the left of the entire parent-child cluster, ensuring connections never cross task bars even when subtasks start before their parents.
- **Dependency Recovery Fallback**: Added logic to synthesize connection lines from `blocked_by_ids` when the hydrated `blocked_by` objects are missing.
- **Conflict Visualization**: Refined the "Amber Dashed" loopback path for tasks starting before their predecessors finish, now integrated with gutter routing.
- **Marker Synchronization**: Arrowheads (`marker-end`) now dynamically match the connection color (Blue, Amber, Red, or Slate).
- **Sidebar Indicators**: Updated the `Link2` icon color to match the new Blue dependency standard.

### Backend (Core Logic)
- **CPM Harmonization**: Updated `calculate_cpm` in `app/core/cpm.py` to correctly map successors using both the explicit `Dependency` table and the `blocked_by_ids` fallback array.
- **Docker Integrity**: Resolved TypeScript build blockers and type mismatches (`null` vs `undefined`) in the project/task schemas.

## Verification
- **Visual Audit**: Confirmed via browser subagent that all tasks with link icons now have visible connection lines.
- **Routing Audit**: Verified that lines stay within gutters and do not cross over task bars.
- **Docker Build**: Successfully ran `docker-compose up -d --build` with all changes integrated.