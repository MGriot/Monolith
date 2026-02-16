# Changelog - Task Export Functionality

## [2026-02-16] - Task Export Implementation

Implemented comprehensive task export functionality (CSV and Excel) across the application, unifying the export experience with a generic reusable component.

### Added
- **Backend**:
    - `GET /api/v1/tasks/export`: New endpoint to export tasks assigned to the current user. Supports `summary` and `details` (subtasks explosion) modes.
    - Updated `GET /api/v1/projects/{id}/export`: Added `mode` parameter to support both summary and detailed project exports.
- **Frontend**:
    - `DataExportDialog`: A new generic component for selecting export format (CSV/Excel) and detail level (Summary/Details).
    - Integrated Export buttons in:
        - **My Tasks Page**: Allows users to export their assigned tasks.
        - **Project Details Page**: Refactored to use the new dialog for project-specific task lists.
        - **Archive Page**: Added export support for both archived projects and archived tasks.
        - **Projects List Page**: Migrated to the generic `DataExportDialog`.

### Changed
- Refactored `backend/app/api/api_v1/endpoints/tasks.py` to include the export logic.
- Refactored `backend/app/api/api_v1/endpoints/projects.py` to enhance multi-project export and unify parameters.
- Replaced `ProjectExportDialog` with the more flexible `DataExportDialog`.

### Technical Details
- Exports use `pandas` and `openpyxl` on the backend.
- Files are streamed to the client using `StreamingResponse`.
- Frontend handles downloads via `Blob` and `URL.createObjectURL`.
- Permissions are enforced: users can only export data they have access to.
