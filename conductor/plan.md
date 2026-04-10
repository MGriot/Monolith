# Track: Notifications Engine (Priority 1)
## Objective
Replace the current email stub with a functional dispatcher and implement the automated weekly summary logic as per Feature 15.3 and 16.4.

## Key Files & Context
- `backend/app/core/notifications.py`: Current stub implementation.
- `backend/app/api/v1/endpoints/notifications.py`: API for notifications.
- `conductor/product.md`: Requirements for 15.3 (Weekly Summaries).
- `backend/app/models/`: To gather data for summaries.

## Implementation Steps
### Phase 1: Core Dispatcher
1. **TASK NOTIF-01**: Define `EmailService` class with SMTP configuration using environment variables.
2. **TASK NOTIF-02**: Implement `send_email` method in `EmailService` replacing the `print` stub.
3. **TASK NOTIF-03**: Add unit tests for `EmailService` using a mock SMTP server.

### Phase 2: Weekly Summary Logic
4. **TASK NOTIF-04**: Create `SummaryGenerator` utility to aggregate user/team/project data.
5. **TASK NOTIF-05**: Implement `generate_weekly_summary` for Standard Users (tasks due/overdue).
6. **TASK NOTIF-06**: Implement `generate_weekly_summary` for Team/Project Owners (activity/health).
7. **TASK NOTIF-07**: Integrate with a task scheduler (e.g., APScheduler or simple cron-like loop) to dispatch every Monday at 08:00 UTC.

## Verification & Testing
- Unit tests for `EmailService` and `SummaryGenerator`.
- Integration test for the weekly summary dispatch flow.
