import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_
from sqlalchemy.orm import selectinload
from datetime import datetime, timedelta
from app.models.task import Task
from app.core.enums import Status
from app.core.notifications import send_email_notification

logger = logging.getLogger(__name__)

async def notify_near_deadlines(db: AsyncSession):
    """
    Scans for tasks due in the next 48 hours and sends reminder emails to assignees.
    """
    logger.info("Checking for near deadlines...")
    now = datetime.utcnow()
    near_threshold = now + timedelta(hours=48)
    
    # Fetch tasks that are:
    # 1. Not done
    # 2. Not archived
    # 3. Due within 48h
    # 4. Have assignees
    query = (
        select(Task)
        .filter(
            Task.status != Status.DONE,
            Task.is_archived == False,
            or_(
                and_(Task.due_date >= now, Task.due_date <= near_threshold),
                and_(Task.deadline_at >= now, Task.deadline_at <= near_threshold)
            )
        )
        .options(selectinload(Task.assignees), selectinload(Task.project))
    )
    
    res = await db.execute(query)
    tasks = res.scalars().all()
    
    for task in tasks:
        for user in task.assignees:
            if not (user.is_active and user.notify_email_assignments):
                continue
            subject = f"[Monolith] Reminder: Task '{task.title}' is due soon"
            due_str = task.due_date.strftime("%Y-%m-%d %H:%M") if task.due_date else "N/A"
            deadline_str = task.deadline_at.strftime("%Y-%m-%d %H:%M") if task.deadline_at else "N/A"
            
            body = f"Hello {user.full_name or user.email},\n\n"
            body += f"This is a reminder that the task '{task.title}' in project '{task.project.name if task.project else 'N/A'}' is approaching its deadline.\n\n"
            body += f"Planned Due Date: {due_str}\n"
            body += f"Hard Deadline: {deadline_str}\n\n"
            body += f"Status: {task.status.value if hasattr(task.status, 'value') else str(task.status)}\n"
            body += f"Priority: {task.priority.value if hasattr(task.priority, 'value') else str(task.priority)}\n\n"
            body += "Please ensure the task is updated or completed on time.\n\n"
            body += "Best regards,\nMonolith Automator"
            
            await send_email_notification(user.email, subject, body)
            
    logger.info(f"Deadline notification check complete. Notified assignees for {len(tasks)} tasks.")