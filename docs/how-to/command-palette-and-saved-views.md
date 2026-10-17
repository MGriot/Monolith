# Command palette, shortcuts and saved views

## Command palette

Press **Ctrl/Cmd + K** anywhere (or click the search box in the header) to open it.

- **Actions**: new task, new project, toggle list/board view on the current page, keyboard shortcuts.
- **Navigate**: every page in the sidebar (admin pages only for admins). Fuzzy matching, e.g. `sch` finds Schedule.
- **Results**: typing 2+ characters queries `GET /api/v1/search/` (debounced 250 ms, query sent via axios `params`) and lists matching projects, tasks and ideas.

Use ↑/↓ (Home/End) to move, Enter to run, Esc to close. The input is an ARIA `combobox` controlling a `listbox` of `option`s (`aria-activedescendant`).

## Keyboard shortcuts

| Keys | Action |
| --- | --- |
| `?` | Show the shortcut sheet |
| `c` | Create task |
| `g` then `p` / `t` / `d` | Go to projects / tasks / dashboard (chord expires after ~1.2 s) |

Single-key shortcuts are ignored while typing in inputs, textareas, selects, contenteditable areas, or inside open menus/dialogs, and when Ctrl/Cmd/Alt is held.

## Filters, sort, group and saved views

The project task list, project Kanban tab and **My Tasks** (list and Kanban) share one filter bar:

- Filter by text (title), status, priority and assignee (including "Unassigned"). A parent task is kept when a subtask matches.
- Sort (manual, due date, priority, status, title, created) and group (status, priority, assignee) apply to list layouts. The Kanban board is always grouped by status and keeps its manual order, so only filters apply there.
- The state lives in the **URL query string** (`?q=api&status=Todo,In%20Progress&priority=High&sort=due&dir=desc&group=assignee`), so any link can be shared or bookmarked. Defaults are omitted and unknown values are ignored.
- **Views** menu: *Save current view...* stores the current filters under a name in `localStorage` (per list, per browser); picking a saved view applies it to the URL. Saving under an existing name overwrites it. Saved views are not synced across devices.

## Code map

Pure, unit-tested logic (`npm test`) lives in `frontend/src/lib`: `task-filters.ts` (parse/serialize/filter/sort/group), `saved-views.ts`, `command-palette.ts` (scoring, item building), `shortcuts.ts` (typing detection and chord state machine). UI: `components/command-palette.tsx`, `shortcut-sheet.tsx`, `task-filter-bar.tsx`, `hooks/use-task-view.ts`.
