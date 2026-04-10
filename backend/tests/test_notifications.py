import pytest
from unittest.mock import MagicMock, patch
from app.core.notifications import EmailService

@pytest.fixture
def mock_settings():
    with patch("app.core.notifications.settings") as mock:
        mock.SMTP_HOST = "localhost"
        mock.SMTP_PORT = 1025
        mock.SMTP_USER = "user"
        mock.SMTP_PASSWORD = "password"
        mock.EMAILS_FROM_EMAIL = "noreply@test.com"
        yield mock

def test_send_email_success(mock_settings):
    with patch("smtplib.SMTP") as mock_smtp:
        # Configure the mock SMTP instance
        instance = mock_smtp.return_value.__enter__.return_value
        
        service = EmailService()
        service.send_email("recipient@test.com", "Subject", "Body")
        
        # Verify SMTP was initialized with correct host and port
        mock_smtp.assert_called_with("localhost", 1025)
        
        # Verify login was called
        instance.login.assert_called_with("user", "password")
        
        # Verify send_message was called
        args, kwargs = instance.send_message.call_args
        msg = args[0]
        assert msg["Subject"] == "Subject"
        assert msg["To"] == "recipient@test.com"
        assert msg["From"] == "noreply@test.com"
        assert msg.get_payload() == "Body"

def test_send_email_html(mock_settings):
    with patch("smtplib.SMTP") as mock_smtp:
        instance = mock_smtp.return_value.__enter__.return_value
        
        service = EmailService()
        service.send_email("recipient@test.com", "Subject", "Body", html_body="<h1>Body</h1>")
        
        args, kwargs = instance.send_message.call_args
        msg = args[0]
        assert msg.is_multipart()
        
        payloads = msg.get_payload()
        assert len(payloads) == 2
        assert payloads[0].get_content_type() == "text/plain"
        assert payloads[1].get_content_type() == "text/html"

def test_send_email_failure(mock_settings):
    with patch("smtplib.SMTP") as mock_smtp:
        instance = mock_smtp.return_value.__enter__.return_value
        instance.send_message.side_effect = Exception("SMTP Error")
        
        service = EmailService()
        with pytest.raises(Exception, match="SMTP Error"):
            service.send_email("recipient@test.com", "Subject", "Body")
