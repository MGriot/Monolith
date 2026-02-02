import sys
import os
# Add the backend directory to sys.path
sys.path.append(os.path.join(os.getcwd(), "backend"))

from app.core.wbs import apply_wbs_codes
from app.schemas.task import Task, Subtask
from datetime import datetime
import uuid

def test_wbs_generation():
    # Mock some tasks and subtasks
    t1 = Task(
        id=uuid.uuid4(),
        title="Task 1",
        project_id=uuid.uuid4(),
        sort_index=10,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
        subtasks=[
            Subtask(id=uuid.uuid4(), title="ST 1.1", task_id=uuid.uuid4(), sort_index=5, created_at=datetime.utcnow(), updated_at=datetime.utcnow()),
            Subtask(id=uuid.uuid4(), title="ST 1.2", task_id=uuid.uuid4(), sort_index=15, created_at=datetime.utcnow(), updated_at=datetime.utcnow())
        ]
    )
    t2 = Task(
        id=uuid.uuid4(),
        title="Task 2",
        project_id=t1.project_id,
        sort_index=20,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
        subtasks=[]
    )
    
    tasks = [t2, t1] # Out of order
    apply_wbs_codes(tasks)
    
    # Check order and codes
    assert tasks[0].title == "Task 1"
    assert tasks[0].wbs_code == "1"
    assert tasks[0].subtasks[0].title == "ST 1.1"
    assert tasks[0].subtasks[0].wbs_code == "1.1"
    assert tasks[0].subtasks[1].wbs_code == "1.2"
    
    assert tasks[1].title == "Task 2"
    assert tasks[1].wbs_code == "2"
    
    print("WBS generation test passed.")

if __name__ == "__main__":
    try:
        test_wbs_generation()
    except Exception as e:
        print(f"WBS generation test failed: {e}")
        sys.exit(1)
