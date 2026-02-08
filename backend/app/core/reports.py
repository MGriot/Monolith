import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, func
from datetime import datetime, timedelta
from app.models.user import User
from app.models.task import Task
from app.models.project import Project
from app.models.team import Team
from app.core.enums import Status
from app.core.notifications import send_email_notification

logger = logging.getLogger(__name__)

async def generate_weekly_summaries(db: AsyncSession):
    """
    Aggregates project, team, and task data to send weekly email summaries.
    """
    logger.info("Starting weekly summary generation...")
    
    # 1. Fetch all users
    result = await db.execute(select(User))
    users = result.scalars().all()
    
    now = datetime.utcnow()
    last_week = now - timedelta(days=7)

    for user in users:
        summary_sections = []
        
        # --- Section A: Personal Tasks (Assigned) ---
        from app.models.associations import task_assignees
        personal_tasks_query = (
            select(Task)
            .join(task_assignees)
            .filter(task_assignees.c.user_id == user.id)
            .filter(Task.status != Status.DONE)
            .filter(or_(Task.due_date <= now + timedelta(days=7), Task.deadline_at <= now + timedelta(days=7)))
        )
        res = await db.execute(personal_tasks_query)
        my_tasks = res.scalars().all()
        
        if my_tasks:
            summary_sections.append("### Your Upcoming & Overdue Tasks")
            for t in my_tasks:
                due = t.due_date.strftime("%Y-%m-%d") if t.due_date else "No due date"
                status_val = t.status.value if hasattr(t.status, 'value') else str(t.status)
                summary_sections.append(f"- [{status_val}] {t.title} (Due: {due})")
        
        # --- Section B: Team Ownership Summary ---
        teams_owned_query = select(Team).filter(Team.owner_id == user.id)
        res = await db.execute(teams_owned_query)
        my_teams = res.scalars().all()
        
        for team in my_teams:
            from app.models.associations import team_members
            m_res = await db.execute(select(User.id).join(team_members).filter(team_members.c.team_id == team.id))
            member_ids = m_res.scalars().all()
            
            completions_query = (
                select(Task)
                .join(task_assignees)
                .filter(task_assignees.c.user_id.in_(member_ids))
                .filter(Task.status == Status.DONE)
                .filter(Task.completed_at >= last_week)
            )
            c_res = await db.execute(completions_query)
            team_completions = c_res.scalars().all()
            
            summary_sections.append(f"\n### Team Activity: {team.name}")
            summary_sections.append(f"Total members: {len(member_ids)}")
            summary_sections.append(f"Tasks completed this week: {len(team_completions)}")
            for c in team_completions[:5]:
                summary_sections.append(f"- {c.title}")

        # --- Section C: Project Ownership Summary ---
        projects_owned_query = select(Project).filter(Project.owner_id == user.id)
        res = await db.execute(projects_owned_query)
        my_projects = res.scalars().all()
        
        for proj in my_projects:
            total_res = await db.execute(select(func.count(Task.id)).filter(Task.project_id == proj.id))
            total_tasks = total_res.scalar()
            
            done_res = await db.execute(select(func.count(Task.id)).filter(Task.project_id == proj.id, Task.status == Status.DONE))
            done_tasks = done_res.scalar()
            
            summary_sections.append(f"\n### Project Health: {proj.name}")
            summary_sections.append(f"Overall Progress: {proj.progress_percent:.2f}%")
            summary_sections.append(f"Task Completion: {done_tasks}/{total_tasks}")
            
            from app.models.dependency import Dependency
            blocked_query = select(Task).join(Dependency, Task.id == Dependency.successor_id).filter(Task.project_id == proj.id, Task.status != Status.DONE)
            b_res = await db.execute(blocked_query)
            blocked_tasks = b_res.scalars().all()
            if blocked_tasks:
                summary_sections.append(f"Blocked Tasks: {len(blocked_tasks)} ⚠️")

        if summary_sections:
            subject = f"[Monolith] Weekly Summary - {now.strftime('%b %d, %Y')}"
            body = f"Hello {user.full_name or user.email},\n\nHere is your project management summary for the week:\n\n"
            body += "\n".join(summary_sections)
            body += "\n\nBest regards,\nMonolith Automator"
            
            await send_email_notification(user.email, subject, body)
            
    logger.info("Weekly summary generation complete.")