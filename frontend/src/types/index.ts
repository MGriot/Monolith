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
  description?: string | null;
  status: string;
  priority: string;
  topic?: string | null;
  type?: string | null;
  start_date?: string | null;
  due_date?: string | null;
  deadline_at?: string | null;
  completed_at?: string | null;
  is_milestone?: boolean;
  blocked_by_ids?: string[];
  blocked_by?: Dependency[];
  blocking?: Dependency[];
  attachments?: string[];
  assignees?: User[];
  subtasks?: Task[];
  sort_index?: number;
  project_id?: string;
  parent_id?: string | null;
  topic_id?: string | null;
  type_id?: string | null;
  topic_ids?: string[];
  type_ids?: string[];
  topics?: Topic[];
  types?: WorkType[];
  topic_ref?: Topic | null;
  type_ref?: WorkType | null;
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
  topic: string | null;
  type: string | null;
  topic_id?: string | null;
  type_id?: string | null;
  topic_ids?: string[];
  type_ids?: string[];
  topics?: Topic[];
  types?: WorkType[];
  topic_ref?: Topic | null;
  type_ref?: WorkType | null;
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
  color: string;
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

export interface Idea {
  id: string;
  project_id: string;
  author_id?: string | null;
  title: string;
  description?: string | null;
  status: 'Proposed' | 'Approved' | 'Rejected' | 'Converted';
  converted_task_id?: string | null;
  created_at: string;
  updated_at: string;
  author?: User | null;
  comments?: IdeaComment[];
}

export interface IdeaComment {
  id: string;
  idea_id: string;
  author_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  author?: User | null;
}


