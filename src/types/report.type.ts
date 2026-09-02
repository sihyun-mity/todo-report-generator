import type { SetStateAction } from 'react';

// 작업(중분류) 아래에 붙는 세부 항목(소분류). 진행률 없이 내용만 갖는다.
export type TaskDetail = {
  id: string;
  content: string;
};

export type Task = {
  id: string;
  content: string;
  progress: number;
  details: Array<TaskDetail>;
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
  addDetail: (bucket: ProjectsBucket, projectId: string, taskId: string, id?: string) => void;
  removeDetail: (bucket: ProjectsBucket, projectId: string, taskId: string, detailId: string) => void;
  updateDetail: (bucket: ProjectsBucket, projectId: string, taskId: string, detailId: string, content: string) => void;
  reorderProjects: (bucket: ProjectsBucket, fromId: string, toId: string) => void;
  // 프로젝트를 다른 버킷(금일↔익일)으로 이동. toIndex는 대상 버킷에서 삽입될 위치.
  moveProjectToBucket: (
    fromBucket: ProjectsBucket,
    toBucket: ProjectsBucket,
    projectId: string,
    toIndex: number
  ) => void;
  reorderTasks: (bucket: ProjectsBucket, projectId: string, fromId: string, toId: string) => void;
  // 작업을 다른 프로젝트(버킷도 넘나들 수 있음)로 이동. toIndex는 대상 프로젝트에서 삽입될 위치.
  moveTaskToProject: (
    fromBucket: ProjectsBucket,
    fromProjectId: string,
    toBucket: ProjectsBucket,
    toProjectId: string,
    taskId: string,
    toIndex: number
  ) => void;
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
