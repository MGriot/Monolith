from typing import List, Dict
from datetime import datetime, timedelta
from uuid import UUID
from app.schemas.task import Task

def calculate_cpm(tasks: List[Task]):
    """
    Calculates Critical Path and Slack for a set of tasks.
    Note: In this implementation, we use the already defined start_date and due_date.
    Slack is defined as the amount of time a task can be delayed without delaying the project finish
    or violating its dependencies.
    """
    if not tasks:
        return tasks

    # Flat list of all tasks for easy lookup
    all_tasks: Dict[UUID, Task] = {}
    def flatten(t_list: List[Task]):
        for t in t_list:
            all_tasks[t.id] = t
            if t.subtasks:
                flatten(t.subtasks)
    
    flatten(tasks)
    
    # 1. Forward Pass (not strictly needed since we have EF = due_date, 
    # but we need it to handle dependency constraints if we were scheduling).
    # Since we assume the user-provided dates ARE the schedule:
    # EF = due_date
    # ES = start_date
    
    # 2. Backward Pass
    # LF (Late Finish) for a task is the minimum LS of its successors.
    # For tasks with no successors, LF = project_finish_date (max of all due_dates).
    
    project_finish = max((t.due_date for t in all_tasks.values() if t.due_date), default=datetime.utcnow())
    
    # Initialize slack with a large number or relative to project finish
    for t in all_tasks.values():
        t.slack_days = 9999
        t.is_critical = False

    # Group dependencies
    # successor_id -> [predecessor_ids]
    # predecessor_id -> [successor_ids]
    successors_of: Dict[UUID, List[UUID]] = {tid: [] for tid in all_tasks}
    for t in all_tasks.values():
        preds = set()
        if t.blocked_by:
            for dep in t.blocked_by:
                preds.add(dep.predecessor_id)
        if t.blocked_by_ids:
            for p_id in t.blocked_by_ids:
                preds.add(p_id)
        
        for p_id in preds:
            if p_id in successors_of:
                successors_of[p_id].append(t.id)

    # Recursive function to calculate LF
    memo_lf: Dict[UUID, datetime] = {}

    def get_late_finish(task_id: UUID) -> datetime:
        if task_id in memo_lf:
            return memo_lf[task_id]
        
        task = all_tasks[task_id]
        successors = successors_of.get(task_id, [])
        
        if not successors:
            lf = project_finish
        else:
            # LF = min(Successor LS)
            # LS = successor.start_date - lag
            # In our simple model: LF = min(Successor.start_date)
            # We should also consider the task's own due_date as a constraint
            successor_starts = []
            for s_id in successors:
                s_task = all_tasks[s_id]
                if s_task.start_date:
                    successor_starts.append(s_task.start_date)
            
            lf = min(successor_starts) if successor_starts else project_finish
            
            # Constrain by its own due_date if it was explicitly set
            if task.due_date and task.due_date < lf:
                # This task has 'negative slack' if it's already past its dependency limit,
                # but for this calculation we'll use its due_date.
                pass 

        memo_lf[task_id] = lf
        return lf

    # Calculate Slack
    for tid, task in all_tasks.items():
        if not task.due_date:
            continue
            
        lf = get_late_finish(tid)
        # Slack = LF - EF (due_date)
        slack = (lf - task.due_date).days
        task.slack_days = max(0, slack)
        
    # Mark Critical Path (Slack == 0)
    for task in all_tasks.values():
        if task.slack_days == 0:
            task.is_critical = True
            
    return tasks
