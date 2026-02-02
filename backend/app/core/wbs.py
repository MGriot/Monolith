from typing import List
from app.schemas.task import Task

def apply_wbs_codes(tasks: List[Task]) -> List[Task]:
    """
    Sorts tasks and their subtasks by sort_index and assigns WBS codes.
    Expects tasks to be Pydantic models with subtasks nested.
    """
    # 1. Sort top-level tasks
    tasks.sort(key=lambda x: (x.sort_index or 0, x.created_at))
    
    for i, task in enumerate(tasks, 1):
        task.wbs_code = str(i)
        
        # 2. Sort and index subtasks
        if task.subtasks:
            task.subtasks.sort(key=lambda x: (x.sort_index or 0, x.created_at))
            for j, subtask in enumerate(task.subtasks, 1):
                subtask.wbs_code = f"{task.wbs_code}.{j}"
                
    return tasks
