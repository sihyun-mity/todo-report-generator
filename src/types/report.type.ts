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
  // 'YYYY-MM-DD' 문자열, 내림차순 — 캘린더 도트 / 페이지네이션 전체 범위 계산에 사용
  allReportDates: ReadonlyArray<string>;
  // 'YYYY-MM' 형식. 로그인 사용자 모드에서 이미 fetch한 월. 게스트 모드에서는 사용하지 않는다.
  loadedMonths: ReadonlySet<string>;
  // 'YYYY-MM' 형식. 현재 로딩 중인 월 — UI 스켈레톤 표시 등에 사용
  loadingMonths: ReadonlySet<string>;
  initialize: () => Promise<void>;
  // 로그인 사용자 모드에서 해당 월의 보고서를 fetch하여 캐시. 게스트/이미 로드된 월은 no-op.
  loadMonth: (year: number, month: number) => Promise<void>;
  addHistory: (data: ReportHistoryAddArgs) => Promise<void>;
  deleteHistory: (id: string) => Promise<void>;
  importFromLocalStorage: () => Promise<{ imported: number }>;
  reset: () => void;
};
