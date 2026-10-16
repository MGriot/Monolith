import asyncio
import logging
import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import List, Optional
from app.core.config import settings

logger = logging.getLogger(__name__)

class EmailService:
    def __init__(self):
        self.smtp_host = settings.SMTP_HOST
        self.smtp_port = settings.SMTP_PORT
        self.smtp_user = settings.SMTP_USER
        self.smtp_password = settings.SMTP_PASSWORD
        self.from_email = settings.EMAILS_FROM_EMAIL

    def send_email(self, recipient: str, subject: str, body: str, html_body: Optional[str] = None):
        """
        Synchronously send an email notification using SMTP.
        Supports both text and optional HTML content.
        """
        logger.info(f"Preparing email to {recipient}")

        if html_body:
            msg = MIMEMultipart("alternative")
            msg.attach(MIMEText(body, "plain"))
            msg.attach(MIMEText(html_body, "html"))
        else:
            msg = MIMEText(body)

        msg["Subject"] = subject
        msg["From"] = self.from_email
        msg["To"] = recipient

        try:
            with smtplib.SMTP(self.smtp_host, self.smtp_port, timeout=settings.SMTP_TIMEOUT) as server:
                if settings.SMTP_STARTTLS or (self.smtp_user and self.smtp_password):
                    ctx = ssl.create_default_context()
                    if not settings.SMTP_VERIFY_TLS:
                        ctx.check_hostname = False
                        ctx.verify_mode = ssl.CERT_NONE
                    server.starttls(context=ctx)
                if self.smtp_user and self.smtp_password:
                    server.login(self.smtp_user, self.smtp_password)
                server.send_message(msg)
            logger.info(f"Email sent successfully to {recipient}")
        except Exception as e:
            logger.error(f"Failed to send email to {recipient}: {e}")
            raise e

email_service = EmailService()

async def send_email_notification(recipient: str, subject: str, body: str, html_body: Optional[str] = None):
    """
    Asynchronously send an email notification.
    Uses the EmailService for actual delivery.
    """
    # In a production environment, this should be offloaded to a background task (e.g., Celery or FastAPI BackgroundTasks)
    # For now, we call the synchronous service method.
    try:
        # smtplib is blocking: run it in a worker thread so the event loop is not stalled.
        await asyncio.to_thread(email_service.send_email, recipient, subject, body, html_body)
    except Exception:
        # Notification failures must not crash the request flow, but they must not be silent either.
        logger.exception("Email notification to %s failed", recipient)

async def notify_critical_update(user_email: str, title: str, message: str):
    """
    Send a critical update notification via email.
    """
    subject = f"[Monolith Planner] Critical Update: {title}"
    body = f"Hello,\n\nYou have a new critical update:\n\n{message}\n\nBest regards,\nMonolith Team"
    await send_email_notification(user_email, subject, body)
