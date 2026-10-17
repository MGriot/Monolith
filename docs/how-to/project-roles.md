# Project roles

Every project member has one of three roles. The **owner** and **superusers** are always admins.

| | viewer | editor | admin |
|---|:--:|:--:|:--:|
| Read the project, tasks, comments, ideas, files, whiteboards, time entries, custom-field definitions | yes | yes | yes |
| Create/edit/delete tasks and subtasks, dependencies | | yes | yes |
| Comment, propose and vote on ideas, upload files, edit folders and whiteboards | | yes | yes |
| Start timers / log time (own entries) | only on tasks assigned to them | yes | yes |
| Project settings, taxonomy, archive/restore | | | yes |
| Add, remove members and change roles | | | yes |
| Define custom fields | | | yes |
| Promote an idea to a task or project | | | yes |
| Delete the project | | | owner / superuser only |

Notes:

* A task's **owner or assignee** can always read it and log time on it, even without a project role (a viewer who is assigned to a task can log time but not edit it).
* **Existing members became editors** when the roles migration ran (`0005`), so nobody lost anything. Members added the old way (`member_ids` on `PUT /projects/{id}`) are editors;
  an update of `member_ids` never changes other members' roles.
* Roles take effect immediately (they are read from the database on every request). Removing a member removes their access at once.
* The owner's role cannot be changed or removed. A project always has an admin.
* Unknown role values in the database are treated as **viewer** (least privilege), and the database rejects them anyway (`ck_project_members_role`).

## API

```
GET    /api/v1/projects/{id}/members            any role     -> [{user_id, email, full_name, role, is_owner}]  (owner first)
PUT    /api/v1/projects/{id}/members/{user_id}  admin        {"role": "viewer|editor|admin"}   add or change
DELETE /api/v1/projects/{id}/members/{user_id}  admin        (204)
GET    /api/v1/projects/{id}                    any role     response has "my_role" for the caller (the UI uses it to hide controls)
```

## For developers

* Authorization lives in `app/api/access.py`: `project_role()`, `has_project_access(min_role=...)`, `require_project_access(min_role=...)`, `require_task_access(write=/participate=)`,
  `require_idea_access/whiteboard/folder(... write=...)`, `require_context_access(write=...)`. Never compare `owner_id` inline in an endpoint.
* `tests/test_project_roles.py` holds an endpoint matrix: every route is listed with the role it needs, and the test calls it as viewer, editor and admin. Adding a route
  that writes without asking for a level is caught by adding it to the matrix; removing a guard fails the matching case.
* `tests/live/smoke_roles.py` runs the same scenarios against the real stack (62 checks).
* The UI (`src/lib/roles.ts`, `ProjectMembersCard`, `project-detail.tsx`) hides what a role cannot do; the API is the actual gate.
