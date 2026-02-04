export interface Task {
  id: string;
  content: string;
  progress: number;
}

export interface Project {
  id: string;
  name: string;
  tasks: Task[];
}

export type TargetType = 'today' | 'tomorrow';
