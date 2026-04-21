import logging
from typing import List, Dict, Optional, Set
from datetime import datetime, timedelta
from uuid import UUID
from app.schemas.task import Task
from app.core.enums import DependencyType

logger = logging.getLogger(__name__)

def calculate_cpm(tasks: List[Task]):
    """
    Calculates Critical Path and Slack for a set of tasks using a full Two-Pass method (Forward and Backward).
    Handles FS, SS, FF, and SF dependencies with lag days.
    """
    if not tasks:
        return tasks

    # 1. Prepare Data: Flatten all tasks for global path analysis
    all_tasks: Dict[UUID, Task] = {}
    
    def flatten(t_list: List[Task]):
        for t in t_list:
            all_tasks[t.id] = t
            if t.subtasks:
                flatten(t.subtasks)
    
    flatten(tasks)
    
    if not all_tasks:
        return tasks

    # Calculate durations (in days)
    durations: Dict[UUID, int] = {}
    for tid, t in all_tasks.items():
        if t.completed_at:
            durations[tid] = 0 # Completed tasks have no remaining duration for pathing
        elif t.due_date and t.start_date:
            # Nominal duration. If same day, count as 1 day to represent effort/span
            durations[tid] = max(1, (t.due_date - t.start_date).days)
        else:
            durations[tid] = 1 # Default nominal duration

    # 2. Forward Pass: Calculate Earliest Start (ES) and Earliest Finish (EF)
    es: Dict[UUID, datetime] = {}
    ef: Dict[UUID, datetime] = {}
    
    # Project start baseline
    project_start = min(
        (t.start_date for t in all_tasks.values() if t.start_date), 
        default=datetime.utcnow()
    )

    successors_of: Dict[UUID, List] = {tid: [] for tid in all_tasks}
    memo_ef: Dict[UUID, datetime] = {}
    solving_forward: Set[UUID] = set()

    def resolve_forward(tid: UUID) -> datetime:
        if tid in memo_ef:
            return memo_ef[tid]
        
        if tid in solving_forward:
            # Cycle safety
            return project_start + timedelta(days=durations.get(tid, 1))
        
        solving_forward.add(tid)
        task = all_tasks[tid]
        
        # ES starts as planned start or project start
        current_es = task.start_date or project_start
        
        # Predecessor constraints
        if task.blocked_by:
            for dep in task.blocked_by:
                pred_id = dep.predecessor_id
                if pred_id not in all_tasks:
                    continue
                
                # Register for backward pass
                successors_of[pred_id].append((tid, dep))
                
                # Recursive call
                p_ef = resolve_forward(pred_id)
                p_es = es.get(pred_id, project_start)
                lag = timedelta(days=dep.lag_days or 0)
                
                # Calculate constraint on ES
                if dep.type == DependencyType.FS or not dep.type:
                    current_es = max(current_es, p_ef + lag)
                elif dep.type == DependencyType.SS:
                    current_es = max(current_es, p_es + lag)
                elif dep.type == DependencyType.FF:
                    # EF_succ = EF_pred + lag => ES_succ = EF_pred + lag - duration
                    target_ef = p_ef + lag
                    current_es = max(current_es, target_ef - timedelta(days=durations[tid]))
                elif dep.type == DependencyType.SF:
                    # EF_succ = ES_pred + lag => ES_succ = ES_pred + lag - duration
                    target_ef = p_es + lag
                    current_es = max(current_es, target_ef - timedelta(days=durations[tid]))

        es[tid] = current_es
        current_ef = current_es + timedelta(days=durations[tid])
        ef[tid] = current_ef
        memo_ef[tid] = current_ef
        
        solving_forward.remove(tid)
        return current_ef

    for tid in all_tasks:
        resolve_forward(tid)

    # 3. Backward Pass: Calculate Latest Finish (LF) and Latest Start (LS)
    ls: Dict[UUID, datetime] = {}
    lf: Dict[UUID, datetime] = {}
    
    # Project end anchor
    project_finish = max(ef.values(), default=datetime.utcnow())
    # Use project deadline if available
    first_task = next(iter(all_tasks.values()))
    if first_task.project and first_task.project.due_date:
        project_finish = max(project_finish, first_task.project.due_date)

    memo_ls: Dict[UUID, datetime] = {}
    solving_backward: Set[UUID] = set()

    def resolve_backward(tid: UUID) -> datetime:
        if tid in memo_ls:
            return memo_ls[tid]
            
        if tid in solving_backward:
            return project_finish - timedelta(days=durations.get(tid, 1))

        solving_backward.add(tid)
        task = all_tasks[tid]
        
        # LF starts at project end or hard deadline
        current_lf = project_finish
        if task.deadline_at:
            current_lf = min(current_lf, task.deadline_at)
            
        # Successor constraints
        deps_as_pred = successors_of.get(tid, [])
        if deps_as_pred:
            constraints = []
            for s_id, dep in deps_as_pred:
                s_ls = resolve_backward(s_id)
                s_lf = lf.get(s_id, project_finish)
                lag = timedelta(days=dep.lag_days or 0)
                
                if dep.type == DependencyType.FS or not dep.type:
                    constraints.append(s_ls - lag)
                elif dep.type == DependencyType.SS:
                    # LS_pred = LS_succ - lag => LF_pred = LS_succ - lag + duration
                    constraints.append(s_ls - lag + timedelta(days=durations[tid]))
                elif dep.type == DependencyType.FF:
                    constraints.append(s_lf - lag)
                elif dep.type == DependencyType.SF:
                    # LS_pred = LF_succ - lag => LF_pred = LF_succ - lag + duration
                    constraints.append(s_lf - lag + timedelta(days=durations[tid]))
            
            if constraints:
                current_lf = min(current_lf, *constraints)

        lf[tid] = current_lf
        current_ls = current_lf - timedelta(days=durations[tid])
        ls[tid] = current_ls
        memo_ls[tid] = current_ls
        
        solving_backward.remove(tid)
        return current_ls

    for tid in all_tasks:
        resolve_backward(tid)

    # 4. Results: Calculate Slack/Float and Mark Critical Path
    for tid, task in all_tasks.items():
        # Slack = LS - ES
        float_delta = ls[tid] - es[tid]
        task.slack_days = float_delta.days
        
        # A task is critical if it has zero or negative slack
        task.is_critical = (task.slack_days <= 0)
        
        # Optional: update schema with calculated EF if needed, 
        # but usually we leave planned dates untouched.
        # task.calculated_ef = ef[tid]

    return tasks
