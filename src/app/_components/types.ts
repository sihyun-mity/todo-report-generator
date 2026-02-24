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

export interface ReportHistoryItem {
  id: string;
  month: string;
  day: string;
  content: string;
  todayProjects: Project[];
  tomorrowProjects: Project[];
  timestamp: number;
}
