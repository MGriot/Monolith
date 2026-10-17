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
    Queue an e-mail (see app/core/mailer.py). Delivery, retries and backoff happen in the outbox worker, so callers
    (digests, reminders, critical updates) are never blocked or failed by the mail server.
    """
    from app.core.mailer import enqueue_raw
    from app.db.session import AsyncSessionLocal

    try:
        async with AsyncSessionLocal() as db:
            await enqueue_raw(db, to=recipient, subject=subject, text=body, html=html_body, kind="notification")
            await db.commit()
    except Exception:
        # Queueing must not crash the request flow, but it must not be silent either.
        logger.exception("Could not queue e-mail notification to %s", recipient)

async def notify_critical_update(user_email: str, title: str, message: str):
    """
    Send a critical update notification via email.
    """
    subject = f"[Monolith Planner] Critical Update: {title}"
    body = f"Hello,\n\nYou have a new critical update:\n\n{message}\n\nBest regards,\nMonolith Team"
    await send_email_notification(user_email, subject, body)
