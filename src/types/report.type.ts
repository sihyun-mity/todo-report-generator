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
