from app.models.whiteboard import Whiteboard
from app.schemas.whiteboard import WhiteboardCreate
from uuid import uuid4

def test_model_loading():
    print("Testing Whiteboard model loading...")
    b = Whiteboard(
        id=uuid4(),
        title="Test Whiteboard",
        data={"elements": []},
        project_id=uuid4(),
        owner_id=uuid4()
    )
    assert b.title == "Test Whiteboard"
    print("Model loading test passed.")

def test_schema_loading():
    print("Testing Whiteboard schema loading...")
    s = WhiteboardCreate(
        title="Test Whiteboard",
        data={"elements": []},
        project_id=uuid4()
    )
    assert s.title == "Test Whiteboard"
    print("Schema loading test passed.")

if __name__ == "__main__":
    test_model_loading()
    test_schema_loading()
