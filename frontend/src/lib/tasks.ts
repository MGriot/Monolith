// Helpers for the task tree the API returns (each task carries its `subtasks`).

export interface TaskNode {
  id: string;
  subtasks?: TaskNode[] | null;
}

interface WalkOptions<T> {
  /** Reorder each list of siblings before it is walked (the API order is kept otherwise). */
  order?: (siblings: T[]) => T[];
  /** Return false to skip a task's subtasks. */
  descend?: (task: T) => boolean;
}

/** Depth-first walk, parents before their subtasks; `level` is 0 for the tasks passed in. */
export function walkTasks<T extends TaskNode>(
  tasks: T[],
  visit: (task: T, parent: T | undefined, level: number) => void,
  { order, descend }: WalkOptions<T> = {},
): void {
  const walk = (list: T[], parent: T | undefined, level: number) => {
    for (const task of order ? order(list) : list) {
      visit(task, parent, level);
      if (task.subtasks?.length && (!descend || descend(task))) walk(task.subtasks as T[], task, level + 1);
    }
  };
  walk(tasks, undefined, 0);
}

/** Depth-first flat list of tasks and all their descendants. */
export function flattenTasks<T extends TaskNode>(tasks: T[]): T[] {
  const out: T[] = [];
  walkTasks(tasks, (task) => out.push(task));
  return out;
}

/** The task with this id anywhere in the tree, or null. */
export function findTask<T extends TaskNode>(tasks: T[], id: string): T | null {
  for (const task of tasks) {
    if (task.id === id) return task;
    const found = task.subtasks?.length ? findTask(task.subtasks as T[], id) : null;
    if (found) return found;
  }
  return null;
}

/** Ids of the task and all its descendants; empty when the id is not in the tree. */
export function subtreeIds(tasks: TaskNode[], id: string): Set<string> {
  const root = findTask(tasks, id);
  return new Set(root ? flattenTasks([root]).map((t) => t.id) : []);
}

/** Copy of the tree with `patch` applied to the task with this id (at any depth); untouched branches are reused. */
export function patchTask<T extends TaskNode>(tasks: T[], id: string, patch: Partial<T>): T[] {
  let changed = false;
  const next = tasks.map((task) => {
    if (task.id === id) {
      changed = true;
      return { ...task, ...patch };
    }
    if (!task.subtasks?.length) return task;
    const subtasks = patchTask(task.subtasks as T[], id, patch);
    if (subtasks === task.subtasks) return task;
    changed = true;
    return { ...task, subtasks };
  });
  return changed ? next : tasks;
}
