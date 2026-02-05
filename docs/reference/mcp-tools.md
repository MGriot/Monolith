# Reference: MCP Tools

The Monolith MCP server exposes the following tools for AI interaction.

## Project Management

### `create_project`
Creates a new root project.
- **Parameters:**
    - `name` (string): Project title.
    - `topic` (string, optional): Category (Plain text).
    - `type` (string, optional): Nature of work (Plain text).
    - `description` (string, optional): Markdown supported.
    - `owner_id` (uuid, optional): Target user ID.

### `delete_project`
Removes a project and all associated children.
- **Parameters:**
    - `project_id` (uuid): The ID of the project to delete.

## Task Management

### `create_task` / `create_subtask`
Builds out the hierarchy.
- **Parameters:**
    - `project_id` / `task_id` (uuid): The parent container.
    - `title` (string): Item name.
    - `status` (string, optional): Todo, In Progress, Review, Done.

### `update_task_status`
Updates state and triggers progress propagation.
- **Parameters:**
    - `task_id` (uuid): Item to update.
    - `status` (string): New status value.

## Discovery

### `search_projects`
Search by name to find IDs.
- **Parameters:**
    - `query` (string): Term to search for.
