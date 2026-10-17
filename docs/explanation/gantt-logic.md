# Explanation: Gantt Chart Generation Logic

The Monolith Gantt chart is a high-precision visualization engine that maps project timelines to a responsive SVG and HTML grid. It combines standard DOM elements for the data grid with an SVG overlay for complex relationship routing.

## 1. Temporal Coordinate System

The Gantt chart operates on a custom coordinate system where time is mapped directly to pixels.

### The Scaling Engine
- **`dayWidth`:** The fundamental unit of the chart. It scales based on the `zoomLevel`:
    - **Day:** 120px per day.
    - **Week:** 60px per day.
    - **Month:** 30px per day.
    - **Quarter:** 15px per day.
    - **Year:** 8px per day.
- **`viewWindow`:** A computed range that identifies the absolute earliest `start_date` and latest `effective_end_date` across all tasks and regions, adding a 3-day leading buffer to ensure the first bar isn't clipped.

### Positioning Formulas
- **X-Coordinate (`getPositionPx`):** Calculates the distance from the left edge.
  `px = (daysBetween(date, windowStart) + fractionOfDay) * dayWidth`
- **Width (`getWidthPx`):** Calculates the span of an interval.
  `px = (daysDuration + 1 + endFraction - startFraction) * dayWidth`

## 2. Bar Construction (The "Thermometer" Effect)

Tasks are rendered as horizontal bars with a dual-layered fill to show progress vs. duration.

### Geometry
- **Height:** Each row is fixed at **56px** (`ROW_HEIGHT`). The task bar itself occupies **28px** (`h-7`) and is centered vertically.
- **Hierarchy:** Task titles in the sidebar are indented by **12px per nesting level** to visualize the WBS depth.

### Visual Layers
1.  **Duration Track (Background):** A bar spanning from `start_date` to `due_date` with **20% opacity** of the status color.
2.  **Progress Fill (Foreground):** An inner `div` representing completion (e.g., 100% for "Done", 50% for "In Progress"). It uses **100% opacity** of the status color.
3.  **Priority Frame:** A **1.5px border** matches the priority color (e.g., Red for Critical, Amber for Medium).

### Dynamic Text Contrast
Task titles are rendered inside the bar. To maintain readability:
- If progress is **> 50%**, the text is **White**.
- If progress is **< 50%**, the text is **Dark Slate** (`#1e293b`).

## 3. Date Indicators & Markers

The engine visualizes three distinct "end states" for every task:

- **Planned Due Date (`due_date`):** The right edge of the solid duration track.
- **Hard Deadline (`deadline_at`):**
    - **Ghost Bar:** If the deadline is later than the due date, a **gray extension** (`bg-slate-200/50`) tracks the "buffer zone."
    - **Marker:** A thin vertical **purple line** (`bg-purple-500`) marks the hard cutoff across the entire row.
- **Actual Completion (`completed_at`):** A vertical **emerald line** (`bg-emerald-600`) with circular "lollipop" caps. This allows project managers to see if a task was finished before or after the planned due date.
- **Milestones:** Tasks with zero duration or explicitly marked as milestones render as a **45° rotated square (diamond)** centered on the `start_date`.

## 4. Relationship Routing (SVG Layer)

Connectors are drawn in a dedicated SVG layer using an orthogonal (stepped) routing algorithm.

### Gutter Routing
To prevent lines from crossing over task bars, the `getOrthogonalPath` algorithm uses **Gutters**:
- Horizontal transit segments are offset by **±22px** from the row center.
- This ensures that lines travel in the empty space between rows.

### Line Styles
- **Hierarchy Lines (Slate-400):** Dashed lines connecting a parent task to its children. They use a "shared spine" logic where all children of one parent anchor to the same vertical axis.
- **Dependency Lines (Blue-600):** Solid lines pointing from a predecessor's end-right to a successor's start-left.
- **Conflicts (Amber-500):** A finish-to-start link whose successor starts before the predecessor ends (plus lag).
- **Critical Path (Red-500):** Only while the **Critical Path** toggle is on. A link is red when both of its tasks are critical (`is_critical` from the backend CPM); those links gain a **pulsing red glow** and a thicker stroke, critical bars get a red ring, and everything else is dimmed. The toggle is shared with the *Tasks & Subtasks* table on the project page, which flags critical rows. Priority never colours lines: it is shown by the bar border.

### Critical Path Computation
`backend/app/core/cpm.py` runs a forward/backward pass over all tasks and subtasks:
- Links are `blocked_by` dependencies (FS, SS, FF, SF with lag) plus legacy `blocked_by_ids` (treated as FS).
- Tasks without predecessors start at their planned start; tasks with predecessors are scheduled as soon as their links allow, so gaps in the plan do not hide the longest chain. Completed tasks keep their actual span.
- The backward pass is anchored at the computed project finish (not the project due date), so the longest chain always has zero slack. A task's hard deadline can still tighten it and push slack negative.
- Endpoints that skip CPM leave `slack_days` unset; the UI trusts only `is_critical`.

### Visible Range
The timeline spans the earliest to the latest task date plus a small margin (3 days at Months zoom; see `VIEW_BUFFER_DAYS` in `lib/gantt.ts`). Project dates and reference zones only set the range when no task has dates.

## 5. Summary of Colors

| Element | Logic | Color / Token |
| :--- | :--- | :--- |
| **Task Fill** | Status-based | Emerald (Done), Blue (In Progress), Amber (On Hold) |
| **Task Border** | Priority-based | Red (Critical), Orange (High), Blue (Low) |
| **Ghost Bar** | Deadline Buffer | Slate-200 (50% Opacity) |
| **Actual Date** | Completion | Emerald-600 |
| **Hard Deadline** | Constraint | Purple-500 (40% Opacity) |
| **TODAY** | Real-time | Red-500 |
