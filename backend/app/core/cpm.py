import logging
from typing import List, Dict, Set, Tuple
from datetime import datetime, timedelta
from uuid import UUID
from app.schemas.task import Task
from app.core.enums import DependencyType

logger = logging.getLogger(__name__)

# (predecessor_id, dependency type, lag in days)
Link = Tuple[UUID, DependencyType, int]


def calculate_cpm(tasks: List[Task]):
    """
    Calculates Critical Path and Slack for a set of tasks using a full Two-Pass method (Forward and Backward).
    Handles FS, SS, FF, and SF dependencies with lag days.

    Scheduling model:
    - Tasks without predecessors start at their planned start date (or the project start).
    - Tasks with predecessors are scheduled as soon as their links allow, so the
      longest chain of work is found even when the plan has gaps between tasks.
    - Completed tasks keep their actual span (start -> completed_at).
    - The backward pass is anchored at the computed project finish, so the
      longest chain always has zero slack. A task's hard deadline can still
      tighten its latest finish (and push slack negative).
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

    # Predecessor links: explicit dependencies plus legacy blocked_by_ids (finish-to-start, no lag)
    preds_of: Dict[UUID, List[Link]] = {tid: [] for tid in all_tasks}
    for tid, t in all_tasks.items():
        seen: Set[UUID] = set()
        for dep in t.blocked_by or []:
            if dep.predecessor_id in all_tasks and dep.predecessor_id != tid:
                preds_of[tid].append((dep.predecessor_id, dep.type or DependencyType.FS, dep.lag_days or 0))
                seen.add(dep.predecessor_id)
        for pred_id in t.blocked_by_ids or []:
            if pred_id in all_tasks and pred_id != tid and pred_id not in seen:
                preds_of[tid].append((pred_id, DependencyType.FS, 0))
                seen.add(pred_id)

    successors_of: Dict[UUID, List[Tuple[UUID, DependencyType, int]]] = {tid: [] for tid in all_tasks}
    for tid, links in preds_of.items():
        for pred_id, dep_type, lag in links:
            successors_of[pred_id].append((tid, dep_type, lag))

    # Summary tasks (they have subtasks and no links of their own) are not activities: their window is just the
    # envelope of their children. Left in the network they would start at their planned date while the children are
    # pulled forward by their links, and a summary alone would look like the longest chain. They take their result
    # from their children instead (critical if any child is, slack = the smallest child slack).
    summary_ids: Set[UUID] = {
        tid for tid, t in all_tasks.items() if t.subtasks and not preds_of[tid] and not successors_of[tid]
    }
    network = [tid for tid in all_tasks if tid not in summary_ids]

    # Project start baseline
    project_start = min(
        (t.start_date for t in all_tasks.values() if t.start_date),
        default=datetime.utcnow()
    )

    # Calculate durations (in days)
    durations: Dict[UUID, timedelta] = {}
    for tid, t in all_tasks.items():
        if t.completed_at:
            actual_start = t.start_date or t.completed_at
            durations[tid] = max(timedelta(0), t.completed_at - actual_start)
        elif t.due_date and t.start_date:
            # Nominal duration. If same day, count as 1 day to represent effort/span
            durations[tid] = timedelta(days=max(1, (t.due_date - t.start_date).days))
        else:
            durations[tid] = timedelta(days=1)  # Default nominal duration

    # 2. Forward Pass: Calculate Earliest Start (ES) and Earliest Finish (EF)
    es: Dict[UUID, datetime] = {}
    ef: Dict[UUID, datetime] = {}
    solving_forward: Set[UUID] = set()

    def resolve_forward(tid: UUID) -> datetime:
        if tid in ef:
            return ef[tid]

        if tid in solving_forward:
            # Cycle safety
            return project_start + durations[tid]

        solving_forward.add(tid)
        task = all_tasks[tid]
        duration = durations[tid]

        if task.completed_at:
            # Completed work is fixed in time
            current_es = task.start_date or task.completed_at
        elif not preds_of[tid]:
            current_es = task.start_date or project_start
        else:
            current_es = None
            for pred_id, dep_type, lag_days in preds_of[tid]:
                p_ef = resolve_forward(pred_id)
                p_es = es.get(pred_id, project_start)
                lag = timedelta(days=lag_days)

                if dep_type == DependencyType.SS:
                    candidate = p_es + lag
                elif dep_type == DependencyType.FF:
                    # EF_succ = EF_pred + lag => ES_succ = EF_pred + lag - duration
                    candidate = p_ef + lag - duration
                elif dep_type == DependencyType.SF:
                    # EF_succ = ES_pred + lag => ES_succ = ES_pred + lag - duration
                    candidate = p_es + lag - duration
                else:  # FS
                    candidate = p_ef + lag
                current_es = candidate if current_es is None else max(current_es, candidate)

        es[tid] = current_es
        ef[tid] = current_es + duration

        solving_forward.remove(tid)
        return ef[tid]

    for tid in network:
        resolve_forward(tid)

    # 3. Backward Pass: Calculate Latest Finish (LF) and Latest Start (LS)
    project_finish = max(ef.values()) if ef else project_start

    ls: Dict[UUID, datetime] = {}
    lf: Dict[UUID, datetime] = {}
    solving_backward: Set[UUID] = set()

    def resolve_backward(tid: UUID) -> datetime:
        if tid in ls:
            return ls[tid]

        if tid in solving_backward:
            return project_finish - durations[tid]

        solving_backward.add(tid)
        task = all_tasks[tid]
        duration = durations[tid]

        # LF starts at project end or hard deadline
        current_lf = project_finish
        if task.deadline_at:
            current_lf = min(current_lf, task.deadline_at)

        # Successor constraints
        for s_id, dep_type, lag_days in successors_of[tid]:
            s_ls = resolve_backward(s_id)
            s_lf = lf.get(s_id, project_finish)
            lag = timedelta(days=lag_days)

            if dep_type == DependencyType.SS:
                # LS_pred = LS_succ - lag => LF_pred = LS_succ - lag + duration
                constraint = s_ls - lag + duration
            elif dep_type == DependencyType.FF:
                constraint = s_lf - lag
            elif dep_type == DependencyType.SF:
                # LS_pred = LF_succ - lag => LF_pred = LF_succ - lag + duration
                constraint = s_lf - lag + duration
            else:  # FS
                constraint = s_ls - lag
            current_lf = min(current_lf, constraint)

        lf[tid] = current_lf
        ls[tid] = current_lf - duration

        solving_backward.remove(tid)
        return ls[tid]

    for tid in network:
        resolve_backward(tid)

    # 4. Results: Calculate Slack/Float and Mark Critical Path
    for tid in network:
        task = all_tasks[tid]
        # Slack = LS - ES
        task.slack_days = (ls[tid] - es[tid]).days

        # A task is critical if it has zero or negative slack
        task.is_critical = task.slack_days <= 0

    def summarize(task: Task):
        slacks = []
        for child in task.subtasks or []:
            if child.id in summary_ids:
                summarize(child)
            if child.slack_days is not None:
                slacks.append(child.slack_days)
        task.slack_days = min(slacks) if slacks else None
        task.is_critical = bool(slacks) and task.slack_days <= 0

    for tid in summary_ids:
        summarize(all_tasks[tid])

    return tasks
