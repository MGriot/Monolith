from typing import List
from app.schemas.task import Task

def apply_wbs_codes(tasks: List[Task], parent_code: str = "") -> List[Task]:
    """
    Recursively sorts tasks and their subtasks by sort_index and assigns WBS codes.
    Supports infinite nesting.
    """
    # Sort current level
    tasks.sort(key=lambda x: (x.sort_index or 0, x.created_at))
    
    for i, task in enumerate(tasks, 1):
        # Generate code: "1", "1.1", "1.1.1" etc.
        current_code = f"{parent_code}.{i}" if parent_code else str(i)
        task.wbs_code = current_code
        
        # Recurse into subtasks
        if task.subtasks:
            apply_wbs_codes(task.subtasks, current_code)
                
    return tasks
