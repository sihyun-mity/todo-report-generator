import type { SetStateAction } from 'react';

export type Task = {
  id: string;
  content: string;
  progress: number;
};

export type Project = {
  id: string;
  name: string;
  tasks: Array<Task>;
};

export type ReportHistoryItem = {
  id: string;
  month: string;
  day: string;
  content: string;
  todayProjects: Array<Project>;
  tomorrowProjects: Array<Project>;
  timestamp: number;
};

export type ReportDate = {
  month: string;
  day: string;
};

export type ReportTextData = {
  month: string;
  day: string;
  todayProjects: ReadonlyArray<Project>;
  tomorrowProjects: ReadonlyArray<Project>;
};

export type ParsedReport = {
  month: string;
  day: string;
  todayProjects: Array<Project>;
  tomorrowProjects: Array<Project>;
};

export type ProjectsBucket = 'today' | 'tomorrow';

export type ReportFormStore = {
  reportDate: ReportDate;
  today: Array<Project>;
  tomorrow: Array<Project>;
  hasHydratedFromHistory: boolean;
  setReportDate: (date: ReportDate) => void;
  setBucket: (bucket: ProjectsBucket, updater: SetStateAction<Array<Project>>) => void;
  addProject: (bucket: ProjectsBucket, id?: string) => void;
  removeProject: (bucket: ProjectsBucket, projectId: string) => void;
  updateProjectName: (bucket: ProjectsBucket, projectId: string, name: string) => void;
  addTask: (bucket: ProjectsBucket, projectId: string, id?: string) => void;
  removeTask: (bucket: ProjectsBucket, projectId: string, taskId: string) => void;
  updateTask: (bucket: ProjectsBucket, projectId: string, taskId: string, updates: Partial<Task>) => void;
  markHydratedFromHistory: () => void;
  resetForm: () => void;
  resetSession: () => void;
};

export type ReportHistoryMode = 'loading' | 'user' | 'guest';

export type ReportHistoryAddArgs = {
  month: string;
  day: string;
  todayProjects: ReadonlyArray<Project>;
  tomorrowProjects: ReadonlyArray<Project>;
};

export type ReportHistoryStore = {
  history: Array<ReportHistoryItem>;
  isLoaded: boolean;
  mode: ReportHistoryMode;
  hasLocalBackup: boolean;
  userId: string | null;
  initialize: () => Promise<void>;
  addHistory: (data: ReportHistoryAddArgs) => Promise<void>;
  deleteHistory: (id: string) => Promise<void>;
  importFromLocalStorage: () => Promise<{ imported: number }>;
  reset: () => void;
};
