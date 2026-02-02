export interface User {
  id: string;
  full_name: string;
  email: string;
}

export interface Subtask {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  start_date?: string;
  due_date?: string;
  deadline_at?: string;
  is_milestone?: boolean;
  topic?: string;
  type?: string;
  blocked_by_ids?: string[];
  sort_index?: number;
  task_id?: string;
  assignees?: User[];
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
  attachments?: string[];
  assignees?: User[];
  subtasks?: Subtask[];
  sort_index?: number;
  project_id?: string;
}

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