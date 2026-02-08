# How-to: Administrator Guide

This guide covers the administrative features available to Superusers in Monolith.

## 1. Access Control
Access to the following areas is strictly restricted to users with `is_superuser=True`:
- **Team Management** (`/users`)
- **Metadata Management** (`/admin/metadata`)

If a non-admin attempts to access these routes, they will be automatically redirected to the Dashboard.

## 2. Managing Team Members
Navigate to the **Team** page to oversee users:
- **View Email & ID:** Unique identifiers for all registered users.
- **Toggle Admin Status:** Use the "Make Admin" or "Demote" buttons to manage permissions.
- **Reset Password:** Admins can trigger a password reset for any user. This will prompt for a new password (min 6 characters) which is immediately hashed and updated.

## 3. Dynamic Metadata
Monolith uses database-backed categories instead of plain text for better organization and visualization.

### Topics
Topics are high-level category labels (e.g., "Backend", "Design").
- **Colors:** Each topic has a color. This color is used for:
    - Glowing borders on active Gantt bars.
    - Labels in the Project Header.
- **Creation:** Admins can create new topics with a name and color picker.

### Work Types
Work Types define the nature of the task (e.g., "Feature", "Bug", "Epic").
- These are selectable in both Project and Task creation forms.

## 4. Automated Reporting
Admins can oversee the automated reporting infrastructure.
- **Trigger Summaries:** If needed, admins can manually trigger the generation of weekly email summaries for all users. This is useful for immediate synchronization or testing. Currently, this action is performed via the API backend or a future admin utility button.

## 5. Troubleshooting Login
If a user cannot log in:
1. Ensure their password is at least **6 characters** long.
2. If they have forgotten their password, use the **Reset Password** tool in the Team page.
3. Check the backend logs for `Connection refused` errors, which may require a service restart (`docker-compose restart nginx`).
