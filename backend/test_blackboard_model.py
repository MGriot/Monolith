from app.models.blackboard import Blackboard
from app.schemas.blackboard import BlackboardCreate
import uuid

def test_model_loading():
    print("Testing Blackboard model loading...")
    b = Blackboard(
        id=uuid.uuid4(),
        title="Test Sketch",
        data={"elements": []},
        project_id=uuid.uuid4(),
        owner_id=uuid.uuid4()
    )
    print(f"Model instantiated: {b.title}")

def test_schema_loading():
    print("Testing Blackboard schema loading...")
    s = BlackboardCreate(
        title="Test Schema",
        data={"elements": []},
        project_id=uuid.uuid4()
    )
    print(f"Schema instantiated: {s.title}")

if __name__ == "__main__":
    test_model_loading()
    test_schema_loading()
    print("Success!")
