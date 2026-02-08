import logging
from typing import List
from app.core.config import settings

logger = logging.getLogger(__name__)

async def send_email_notification(recipient: str, subject: str, body: str):
    """
    Asynchronously send an email notification.
    Stub implementation for now.
    """
    logger.info(f"Sending email to {recipient}")
    print(f"\n[EMAIL STUB] To: {recipient}\n[EMAIL STUB] Subject: {subject}\n[EMAIL STUB] Body:\n{body}\n")
    
    # In a real implementation, you would use a library like fastapi-mail or a background task with smtplib.
    # For now, we just log it.
    pass

async def notify_critical_update(user_email: str, title: str, message: str):
    """
    Send a critical update notification via email.
    """
    subject = f"[Monolith Planner] Critical Update: {title}"
    body = f"Hello,\n\nYou have a new critical update:\n\n{message}\n\nBest regards,\nMonolith Team"
    await send_email_notification(user_email, subject, body)
