import pytest
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch, AsyncMock
from uuid import uuid4

from app.core.summaries import SummaryGenerator
from app.models.task import Task
from app.models.user import User
from app.models.team import Team
from app.models.project import Project
from app.core.enums import Status, Priority

@pytest.fixture
def mock_db():
    mock = MagicMock()
    mock.execute = AsyncMock()
    return mock

@pytest.fixture
def summary_generator(mock_db):
    return SummaryGenerator(db=mock_db)

@pytest.mark.asyncio
async def test_get_user_tasks_due_soon(summary_generator, mock_db):
    user_id = uuid4()
    mock_tasks = [
        Task(id=uuid4(), title="Task 1", due_date=datetime.utcnow() + timedelta(days=2), status=Status.TODO),
        Task(id=uuid4(), title="Task 2", due_date=datetime.utcnow() - timedelta(days=1), status=Status.IN_PROGRESS)
    ]
    
    mock_db.execute.return_value.scalars.return_value.all.return_value = mock_tasks
    
    tasks = await summary_generator.get_user_tasks_due_soon(user_id)
    
    assert len(tasks) == 2
    assert tasks[0].title == "Task 1"
    assert tasks[1].title == "Task 2"
    mock_db.execute.assert_called_once()

def test_generate_user_weekly_summary_html(summary_generator):
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

@pytest.mark.asyncio
async def test_get_team_activity_summary(summary_generator, mock_db):
    team_id = uuid4()
    
    mock_db.execute.side_effect = [
        MagicMock(scalars=lambda: MagicMock(all=lambda: [uuid4(), uuid4()])), # member_ids
        MagicMock(scalar=lambda: 5), # completions
        MagicMock(scalar=lambda: 10), # new_tasks
        MagicMock(scalar=lambda: 2) # blockers
    ]
    
    summary = await summary_generator.get_team_activity_summary(team_id)
    
    assert summary["completions"] == 5
    assert summary["new_tasks"] == 10
    assert summary["blockers"] == 2
    assert summary["active_members"] == 2

def test_generate_team_summary_html(summary_generator):
    team = Team(name="Engineering")
    summary = {"completions": 5, "new_tasks": 10, "blockers": 2, "active_members": 4}
    
    html = summary_generator.generate_team_summary_html(team, summary)
    
    assert "Team Activity Summary: Engineering" in html
    assert "5 tasks finished" in html
    assert "10 tasks created" in html
    assert "2 active high-priority tasks" in html

@pytest.mark.asyncio
async def test_get_project_health_report(summary_generator, mock_db):
    project_id = uuid4()
    now = datetime.utcnow()
    mock_tasks = [
        Task(status=Status.DONE),
        Task(status=Status.DONE),
        Task(status=Status.TODO, due_date=now - timedelta(days=1)), # overdue
        Task(status=Status.IN_PROGRESS, due_date=now + timedelta(days=1))
    ]
    
    mock_db.execute.return_value.scalars.return_value.all.return_value = mock_tasks
    
    report = await summary_generator.get_project_health_report(project_id)
    
    assert report["completion_rate"] == 50.0
    assert report["overdue_count"] == 1
    assert report["total_tasks"] == 4
    assert report["done_tasks"] == 2

def test_generate_project_health_html(summary_generator):
    project = Project(name="Project Alpha", due_date=datetime.utcnow() + timedelta(days=10))
    report = {"completion_rate": 75.0, "overdue_count": 0, "total_tasks": 10, "done_tasks": 7}
    
    html = summary_generator.generate_project_health_html(project, report)
    
    assert "Project Health: Project Alpha" in html
    assert "75.0%" in html
    assert "Overdue Tasks: <b>0</b>" in html
    assert "10 days remaining" in html

@pytest.mark.asyncio
async def test_dispatch_all_summaries(summary_generator, mock_db):
    # Mocking dispatch_all_summaries internals
    with patch("app.core.summaries.send_email_notification", new_callable=AsyncMock) as mock_send:
        # Mocking db returns for users, teams, and projects
        mock_db.execute.side_effect = [
            MagicMock(scalars=lambda: MagicMock(all=lambda: [User(id=uuid4(), email="u@t.com")])), # users
            MagicMock(scalars=lambda: MagicMock(all=lambda: [Task(title="T1")])), # tasks for user
            MagicMock(scalars=lambda: MagicMock(all=lambda: [Team(id=uuid4(), name="T1", owner_id=uuid4())])), # teams
            MagicMock(scalars=lambda: MagicMock(all=lambda: [uuid4()])), # team members (for active count)
            MagicMock(scalar=lambda: 1), # completions
            MagicMock(scalar=lambda: 1), # new_tasks
            MagicMock(scalar=lambda: 1), # blockers
            MagicMock(scalar_one_or_none=lambda: User(email="o@t.com")), # team owner
            MagicMock(scalars=lambda: MagicMock(all=lambda: [Project(id=uuid4(), name="P1", owner_id=uuid4())])), # projects
            MagicMock(scalars=lambda: MagicMock(all=lambda: [Task(status=Status.DONE)])), # tasks for project
            MagicMock(scalar_one_or_none=lambda: User(email="po@t.com")), # project owner
        ]
        
        await summary_generator.dispatch_all_summaries()
        
        assert mock_send.call_count == 3 # User + Team + Project
