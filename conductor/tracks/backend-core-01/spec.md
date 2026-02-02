# Specification: Core Backend Enhancements

## 1. Advanced Dependencies
### Requirements
- Support 4 types: Finish-to-Start (FS), Start-to-Start (SS), Finish-to-Finish (FF), Start-to-Finish (SF).
- Support "Lag" (lead/lag time in days).
- Validate for Circular Dependencies.

### Data Model
**New Table: `dependencies`**
```python
class DependencyType(str, Enum):
    FS = "FS"
    SS = "SS"
    FF = "FF"
    SF = "SF"

class Dependency(Base):
    __tablename__ = "dependencies"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    successor_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id"), nullable=False)
    predecessor_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id"), nullable=False)
    type = Column(SAEnum(DependencyType), default=DependencyType.FS)
    lag_days = Column(Integer, default=0)
    
    # Relationships to be added to Task model
```

### Validation
- **Cycle Detection:** Before adding a dependency `A -> B`, check if a path `B -> ... -> A` exists.

## 2. WBS (Work Breakdown Structure)
### Requirements
- Unified WBS code (e.g., "1", "1.1", "1.2", "2.1").
- Based on `sort_index` and hierarchy.

### Implementation Strategy
- **Computed Field:** Calculate WBS at runtime during API serialization.
- **Algorithm:**
    1. Fetch all tasks for project.
    2. Sort by `sort_index`.
    3. Assign index `i` (1-based).
    4. For each task, fetch subtasks, sort, assign `i.j`.

## 3. Missing Metadata
- Add `is_milestone` (bool) and `deadline_at` (datetime) to `Task` and `Subtask` models.
