import pytest
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch
from uuid import uuid4

from app.core.summaries import SummaryGenerator
from app.models.task import Task
from app.models.user import User
from app.core.enums import Status

@pytest.fixture
def mock_db():
    return MagicMock()

@pytest.fixture
def summary_generator(mock_db):
    return SummaryGenerator(db=mock_db)

def test_get_user_tasks_due_soon(summary_generator, mock_db):
    user_id = uuid4()
    mock_tasks = [
        Task(id=uuid4(), title="Task 1", due_date=datetime.utcnow() + timedelta(days=2), status=Status.TODO),
        Task(id=uuid4(), title="Task 2", due_date=datetime.utcnow() - timedelta(days=1), status=Status.IN_PROGRESS)
    ]
    
    # Mock the execute/scalars chain
    mock_db.execute.return_value.scalars.return_value.all.return_value = mock_tasks
    
    tasks = summary_generator.get_user_tasks_due_soon(user_id)
    
    assert len(tasks) == 2
    assert tasks[0].title == "Task 1"
    assert tasks[1].title == "Task 2"
    mock_db.execute.assert_called_once()

def test_generate_user_weekly_summary_html_no_tasks(summary_generator):
    user = User(email="test@example.com", full_name="Test User")
    html = summary_generator.generate_user_weekly_summary_html(user, [])
    
    assert "Weekly Summary for Test User" in html
    assert "You have no pending tasks" in html

def test_generate_user_weekly_summary_html_with_tasks(summary_generator):
    user = User(email="test@example.com", full_name="Test User")
    now = datetime.utcnow()
    tasks = [
        Task(title="Overdue Task", due_date=now - timedelta(days=2)),
        Task(title="Future Task", due_date=now + timedelta(days=3))
    ]
    
    html = summary_generator.generate_user_weekly_summary_html(user, tasks)
    
    assert "Weekly Summary for Test User" in html
    assert "🔴 Overdue Tasks" in html
    assert "Overdue Task" in html
    assert "📅 Due Soon" in html
    assert "Future Task" in html
