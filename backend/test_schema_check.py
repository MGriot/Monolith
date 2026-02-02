import sys
import os
# Add the backend directory to sys.path
sys.path.append(os.path.join(os.getcwd(), "backend"))

from app.models.task import Task, Subtask
from app.models.dependency import Dependency
from app.core.enums import DependencyType
from datetime import datetime
import uuid

def test_models_exist():
    # Test Task attributes
    task = Task(
        title="Test Task",
        is_milestone=True,
        deadline_at=datetime.utcnow()
    )
    assert task.title == "Test Task"
    assert task.is_milestone is True
    assert isinstance(task.deadline_at, datetime)
    print("Task model check passed.")

    # Test Subtask attributes
    subtask = Subtask(
        title="Test Subtask",
        is_milestone=False,
        deadline_at=None
    )
    assert subtask.title == "Test Subtask"
    assert subtask.is_milestone is False
    print("Subtask model check passed.")

    # Test Dependency attributes
    dep = Dependency(
        successor_id=uuid.uuid4(),
        predecessor_id=uuid.uuid4(),
        type=DependencyType.FS,
        lag_days=2
    )
    assert dep.type == DependencyType.FS
    assert dep.lag_days == 2
    print("Dependency model check passed.")

if __name__ == "__main__":
    try:
        test_models_exist()
        print("All schema checks passed successfully.")
    except Exception as e:
        print(f"Schema check failed: {e}")
        sys.exit(1)
