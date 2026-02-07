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
  completed_at?: string;
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
  topic_id?: string;
  type_id?: string;
  topic_ids?: string[];
  type_ids?: string[];
  topics?: Topic[];
  types?: WorkType[];
  topic_ref?: Topic;
  type_ref?: WorkType;
  project?: Project;
  wbs_code?: string;
  is_critical?: boolean;
  slack_days?: number;
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
  topic_id?: string;
  type_id?: string;
  topic_ids?: string[];
  type_ids?: string[];
  topics?: Topic[];
  types?: WorkType[];
  topic_ref?: Topic;
  type_ref?: WorkType;
  tags?: string[];
  members?: User[];
}

export interface Topic {
  id: string;
  name: string;
  color: string;
  is_active: boolean;
}

export interface WorkType {
  id: string;
  name: string;
  icon?: string;
  is_active: boolean;
}

export interface ProjectTemplate {
  id: string;
  name: string;
  description?: string;
  tasks_json: any[];
  is_active: boolean;
  owner_id: string;
}
