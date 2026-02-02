import sys
import os
# Add the backend directory to sys.path
sys.path.append(os.path.join(os.getcwd(), "backend"))

from app.schemas.task import Task, TaskCreate, TaskShortCreate
from app.core.enums import Status, Priority
from datetime import datetime
import uuid

def test_recursive_schema():
    project_id = uuid.uuid4()
    
    # 1. Test Deeply Nested Task (Response Model)
    # Level 3 -> Level 2 -> Level 1 (Task)
    l3 = Task(
        id=uuid.uuid4(), title="L3", project_id=project_id, 
        status=Status.TODO, priority=Priority.LOW,
        created_at=datetime.utcnow(), updated_at=datetime.utcnow(),
        subtasks=[]
    )
    
    l2 = Task(
        id=uuid.uuid4(), title="L2", project_id=project_id, 
        status=Status.TODO, priority=Priority.MEDIUM,
        created_at=datetime.utcnow(), updated_at=datetime.utcnow(),
        subtasks=[l3]
    )
    
    l1 = Task(
        id=uuid.uuid4(), title="L1", project_id=project_id, 
        status=Status.IN_PROGRESS, priority=Priority.HIGH,
        created_at=datetime.utcnow(), updated_at=datetime.utcnow(),
        subtasks=[l2]
    )
    
    assert len(l1.subtasks) == 1
    assert l1.subtasks[0].title == "L2"
    assert len(l1.subtasks[0].subtasks) == 1
    assert l1.subtasks[0].subtasks[0].title == "L3"
    print("Recursive Task response schema check passed.")

    # 2. Test TaskCreate with recursive subtasks
    create_in = TaskCreate(
        title="Root",
        project_id=project_id,
        subtasks=[
            TaskShortCreate(
                title="Child 1",
                subtasks=[
                    TaskShortCreate(title="Grandchild 1.1")
                ]
            )
        ]
    )
    
    assert create_in.subtasks[0].title == "Child 1"
    assert create_in.subtasks[0].subtasks[0].title == "Grandchild 1.1"
    print("TaskCreate recursive schema check passed.")

if __name__ == "__main__":
    try:
        test_recursive_schema()
        print("All recursive schema verification checks passed.")
    except Exception as e:
        print(f"Recursive schema verification failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
