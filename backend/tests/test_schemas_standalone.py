import sys
import os
# Add the backend directory to sys.path
sys.path.append(os.path.join(os.getcwd(), "backend"))

from app.schemas.task import TaskCreate, SubtaskCreate, DependencyCreate, Task
from app.core.enums import Status, Priority, DependencyType
from datetime import datetime
import uuid

def test_schemas():
    # Test DependencyCreate
    dep_in = DependencyCreate(
        successor_id=uuid.uuid4(),
        predecessor_id=uuid.uuid4(),
        type=DependencyType.SS,
        lag_days=5
    )
    assert dep_in.lag_days == 5
    print("DependencyCreate schema check passed.")

    # Test TaskCreate with new fields
    task_in = TaskCreate(
        title="Milestone Task",
        project_id=uuid.uuid4(),
        is_milestone=True,
        deadline_at=datetime.utcnow()
    )
    assert task_in.is_milestone is True
    print("TaskCreate schema check passed.")

    # Test SubtaskCreate with new fields
    subtask_in = SubtaskCreate(
        title="Subtask",
        task_id=uuid.uuid4(),
        is_milestone=False
    )
    assert subtask_in.is_milestone is False
    print("SubtaskCreate schema check passed.")

if __name__ == "__main__":
    try:
        test_schemas()
        print("All schema verification checks passed.")
    except Exception as e:
        print(f"Schema verification failed: {e}")
        sys.exit(1)
