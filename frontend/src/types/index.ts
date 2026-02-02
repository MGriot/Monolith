export interface User {
  id: string;
  full_name: string;
  email: string;
}

export interface Dependency {
  id: string;
  successor_id: string;
  predecessor_id: string;
  type: string;
  lag_days: number;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  topic?: string;
  type?: string;
  start_date?: string;
  due_date?: string;
  deadline_at?: string;
  is_milestone?: boolean;
  blocked_by_ids?: string[];
  blocked_by?: Dependency[];
  blocking?: Dependency[];
  attachments?: string[];
  assignees?: User[];
  subtasks?: Task[];
  sort_index?: number;
  project_id?: string;
  parent_id?: string;
  wbs_code?: string;
}

// Deprecated: use Task
export type Subtask = Task;

export interface Project {
  id: string;
  name: string;
  description: string;
  status: string;
  progress_percent: number;
  start_date: string;
  due_date: string;
  topic: string;
  type: string;
  tags?: string[];
}
