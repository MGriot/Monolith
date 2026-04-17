# Ideas Hub and Workflow Enhancements

## Features Added
- **Universal Ideas Hub**: Created a dedicated page to aggregate all relevant ideas (authored, owned, or participated projects).
- **Idea Voting System**: Implemented Thumbs Up/Down voting for project ideas with real-time counters and visual feedback.
- **Task-Idea Integration**: Added "Linked Project Ideas" section to task edit dialogs, allowing task-specific brainstorming.
- **Idea Promotion**: Enabled promoting ideas to either Tasks within a project or entirely new standalone Projects.
- **Enhanced SOPs**:
    - **LaTeX Support**: Integrated `remark-math` and `rehype-katex` for mathematical formulas.
    - **Interactive Tooltips**: Added "Tipsy" support for contextual information using hover triggers.
    - **Professional View**: Overhauled the workflow viewer with technical document styling and meta-information.
    - **Quick Guide**: Added a syntax helper panel to the Workflow editor.

## UI/UX Refinements
- **Unified Avatars**: Standardized all user visuals with a unified `UserAvatar` component.
- **Sidebar Simplification**: Renamed "My Tasks" to "Tasks" and added "Ideas" as a primary navigation item.
- **Gantt Visual Fixes**: Synchronized row colors and bar plot styles with user-defined task colors.

## Bug Fixes
- **Re-render Loops**: Stabilized `TitleContext` setters to prevent infinite loops on the project detail page.
- **Hook Violation**: Fixed "Rules of Hooks" error in the Dashboard's loading state.
- **Idea Retrieval**: Resolved backend 500 error caused by recursive serialization of idea comments.
- **Ambiguous Foreign Keys**: Fixed SQLAlchemy startup error by explicitly mapping the primary idea relationship.
