# Multi-Project Export Feature

Implemented a comprehensive export system for projects (active and archived) with the following capabilities:

## Backend Changes (BACK-039)
- New endpoint `GET /projects/export/all` supporting:
    - Multiple projects export based on user permissions.
    - Active vs Archived project filtering.
    - **Summary Mode**: Exports project metadata (Name, Status, Progress, etc.).
    - **Details Mode**: Exports a full hierarchical explosion including all tasks and subtasks with WBS codes.
    - **Formats**: CSV and Excel (.xlsx) support using Pandas.
- Updated `CRUDProject` to ensure `owner` relationship is always loaded for export data.

## Frontend Changes (FRONT-074)
- Created `ProjectExportDialog` reusable component for selecting export options.
- Added "Export" buttons to:
    - **Projects List Page**: Export active projects.
    - **Central Archive Page**: Export archived projects.
- Integrated with backend API using blob response for local downloads.
- Fixed TypeScript type-checking issues in the new components.
