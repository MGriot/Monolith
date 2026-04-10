import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import select, and_, or_

from app.models.task import Task
from app.models.project import Project
from app.models.user import User
from app.models.team import Team
from app.models.associations import task_assignees
from app.core.enums import Status

logger = logging.getLogger(__name__)

class SummaryGenerator:
    def __init__(self, db: Session):
        self.db = db

    def get_user_tasks_due_soon(self, user_id: Any, days: int = 7) -> List[Task]:
        """
        Retrieve tasks assigned to a user that are due within the next 'days' days or are already overdue.
        """
        now = datetime.utcnow()
        limit = now + timedelta(days=days)
        
        query = (
            select(Task)
            .join(task_assignees)
            .where(
                and_(
                    task_assignees.c.user_id == user_id,
                    Task.status != Status.DONE,
                    or_(
                        Task.due_date <= limit,
                        Task.due_date == None # Optional: how to handle tasks without due dates?
                    )
                )
            )
        )
        return self.db.execute(query).scalars().all()

    def generate_user_weekly_summary_html(self, user: User, tasks: List[Task]) -> str:
        """
        Generate an HTML summary of tasks due/overdue for a specific user.
        """
        now = datetime.utcnow()
        overdue = [t for t in tasks if t.due_date and t.due_date < now]
        due_soon = [t for t in tasks if not t.due_date or t.due_date >= now]

        html = f"<h2>Weekly Summary for {user.full_name or user.email}</h2>"
        
        if overdue:
            html += "<h3>🔴 Overdue Tasks</h3><ul>"
            for t in overdue:
                html += f"<li><b>{t.title}</b> (Due: {t.due_date.strftime('%Y-%m-%d')})</li>"
            html += "</ul>"
        
        if due_soon:
            html += "<h3>📅 Due Soon</h3><ul>"
            for t in due_soon:
                due_str = t.due_date.strftime('%Y-%m-%d') if t.due_date else "No due date"
                html += f"<li><b>{t.title}</b> (Due: {due_str})</li>"
            html += "</ul>"
            
        if not tasks:
            html += "<p>You have no pending tasks for the coming week. Great job!</p>"
            
        return html

    def get_team_activity_summary(self, team_id: Any, days: int = 7) -> Dict[str, Any]:
        """
        Aggregate completions and progress for a team over the last 'days' days.
        """
        # Placeholder for team aggregation logic (NOTIF-06)
        return {
            "completions": 0,
            "new_tasks": 0,
            "blockers": 0
        }

    def get_project_health_report(self, project_id: Any) -> Dict[str, Any]:
        """
        Calculate progress metrics for a specific project.
        """
        # Placeholder for project health logic (NOTIF-06)
        return {
            "completion_rate": 0.0,
            "overdue_count": 0,
            "days_until_deadline": 0
        }
