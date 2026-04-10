import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import select, and_, or_, func

from app.models.task import Task
from app.models.project import Project
from app.models.user import User
from app.models.team import Team
from app.models.associations import task_assignees, team_members
from app.core.enums import Status, Priority

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
                        Task.due_date == None
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
        now = datetime.utcnow()
        start_date = now - timedelta(days=days)
        
        # Get team members
        member_ids_query = select(team_members.c.user_id).where(team_members.c.team_id == team_id)
        member_ids = self.db.execute(member_ids_query).scalars().all()
        
        if not member_ids:
            return {"completions": 0, "new_tasks": 0, "blockers": 0, "active_members": 0}

        # Completions
        completions_query = select(func.count(Task.id)).where(
            and_(
                Task.status == Status.DONE,
                Task.completed_at >= start_date,
                Task.id.in_(
                    select(task_assignees.c.task_id).where(task_assignees.c.user_id.in_(member_ids))
                )
            )
        )
        completions = self.db.execute(completions_query).scalar() or 0

        # New Tasks
        new_tasks_query = select(func.count(Task.id)).where(
            and_(
                Task.created_at >= start_date,
                Task.id.in_(
                    select(task_assignees.c.task_id).where(task_assignees.c.user_id.in_(member_ids))
                )
            )
        )
        new_tasks = self.db.execute(new_tasks_query).scalar() or 0

        # Blockers (tasks with status indicating issues or high priority that are not done)
        blockers_query = select(func.count(Task.id)).where(
            and_(
                Task.status != Status.DONE,
                Task.priority == Priority.HIGH,
                Task.id.in_(
                    select(task_assignees.c.task_id).where(task_assignees.c.user_id.in_(member_ids))
                )
            )
        )
        blockers = self.db.execute(blockers_query).scalar() or 0

        return {
            "completions": completions,
            "new_tasks": new_tasks,
            "blockers": blockers,
            "active_members": len(member_ids)
        }

    def generate_team_summary_html(self, team: Team, summary: Dict[str, Any]) -> str:
        """
        Generate HTML for team activity summary.
        """
        html = f"<h2>Team Activity Summary: {team.name}</h2>"
        html += "<ul>"
        html += f"<li><b>Completions:</b> {summary['completions']} tasks finished this week</li>"
        html += f"<li><b>New Work:</b> {summary['new_tasks']} tasks created</li>"
        html += f"<li><b>Priority Blockers:</b> {summary['blockers']} active high-priority tasks</li>"
        html += f"<li><b>Team Size:</b> {summary['active_members']} active members</li>"
        html += "</ul>"
        return html

    def get_project_health_report(self, project_id: Any) -> Dict[str, Any]:
        """
        Calculate progress metrics for a specific project.
        """
        now = datetime.utcnow()
        
        tasks_query = select(Task).where(Task.project_id == project_id)
        all_tasks = self.db.execute(tasks_query).scalars().all()
        
        if not all_tasks:
            return {"completion_rate": 0.0, "overdue_count": 0, "total_tasks": 0}

        done_tasks = [t for t in all_tasks if t.status == Status.DONE]
        overdue_tasks = [t for t in all_tasks if t.status != Status.DONE and t.due_date and t.due_date < now]
        
        completion_rate = (len(done_tasks) / len(all_tasks)) * 100
        
        return {
            "completion_rate": round(completion_rate, 2),
            "overdue_count": len(overdue_tasks),
            "total_tasks": len(all_tasks),
            "done_tasks": len(done_tasks)
        }

    def generate_project_health_html(self, project: Project, report: Dict[str, Any]) -> str:
        """
        Generate HTML for project health report.
        """
        status_color = "green" if report['overdue_count'] == 0 else "orange"
        if report['completion_rate'] < 20 and report['total_tasks'] > 5:
            status_color = "red"

        html = f"<h2>Project Health: {project.name}</h2>"
        html += f"<p>Overall Progress: <b>{report['completion_rate']}%</b> ({report['done_tasks']}/{report['total_tasks']} tasks done)</p>"
        html += f"<p style='color: {status_color};'>Overdue Tasks: <b>{report['overdue_count']}</b></p>"
        
        if project.due_date:
            days_left = (project.due_date - datetime.utcnow()).days
            html += f"<p>Deadline: {project.due_date.strftime('%Y-%m-%d')} ({days_left} days remaining)</p>"
            
        return html
