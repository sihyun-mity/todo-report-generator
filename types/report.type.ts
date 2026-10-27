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
  // 보고서 날짜의 연도. 텍스트 템플릿에는 월/일만 있어 연도를 따로 들고 다닌다.
  // 도입 이전 게스트 기록에는 없으므로 소비 측은 `reportItemDateKey`로 timestamp 연도에 폴백한다.
  year?: number;
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

// 오늘의 목표를 끌어 놓은 자리 — 그 프로젝트의 tasks 안 위치
export type TodayGoalDropTarget = { projectId: string; index: number };

export type ReportFormStore = {
  reportDate: ReportDate;
  today: Array<Project>;
  tomorrow: Array<Project>;
  // 오늘의 목표 — 직전 보고서의 익일 예정 중 아직 금일·익일로 옮기지 않은 작업(`utils/today-goals.ts`).
  // 보고서에는 들어가지 않고, 옮기지 않은 목표는 다음 날 출처가 바뀌며 사라진다.
  goals: Array<Project>;
  // 목표를 가져온 보고서의 날짜('YYYY-MM-DD'). 목표가 없으면 null.
  goalsSourceDateKey: string | null;
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
  // 세부 항목 정렬/이동은 작업 id 만으로 대상을 특정한다 — 작업 id 는 보드 전체에서 유일하므로
  // 프로젝트 id 를 함께 넘길 필요가 없다. bucket 은 set 할 배열을 고르기 위해 받는다.
  reorderDetails: (bucket: ProjectsBucket, taskId: string, fromId: string, toId: string) => void;
  // 세부 항목을 다른 작업(프로젝트·버킷도 넘나들 수 있음)으로 이동. toIndex는 대상 작업에서 삽입될 위치.
  moveDetailToTask: (
    fromBucket: ProjectsBucket,
    toBucket: ProjectsBucket,
    fromTaskId: string,
    toTaskId: string,
    detailId: string,
    toIndex: number
  ) => void;
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
  // 기록 복원 때 오늘의 목표를 정한다
  initGoals: (sourceDateKey: string | null, goals: Array<Project>) => void;
  setGoals: (updater: SetStateAction<Array<Project>>) => void;
  // 목표 작업을 금일·익일로 옮긴다. target 이 있으면(끌어 놓기) 그 프로젝트의 그 자리에, 없으면 같은 이름 프로젝트에 덧붙인다.
  // fillBlank 이 false 면 빈 프로젝트·빈 작업 줄을 채우지 않고 그 자리에 끼워 넣기만 한다(끌기 중 미리보기 — 놓을 때 정리한다).
  placeGoals: (
    taskIds: ReadonlyArray<string>,
    bucket: ProjectsBucket,
    target?: TodayGoalDropTarget,
    options?: { fillBlank?: boolean }
  ) => void;
  // 목표를 넘긴다(취소된 일) — 보고서에 넣지 않고 목록에서만 뺀다
  dismissGoals: (taskIds: ReadonlyArray<string>) => void;
  markHydratedFromHistory: () => void;
  resetForm: () => void;
  resetSession: () => void;
};

export type ReportHistoryMode = 'loading' | 'user' | 'guest';

export type ReportExportFormat = 'txt' | 'json';

export type ReportHistoryAddArgs = {
  // 생략하면 현재 연도로 저장한다.
  year?: number;
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
  // 내보내기용 전체 기록 조회 (보고서 날짜 오름차순). store 상태는 건드리지 않는다. 실패하면 null.
  fetchAllHistory: () => Promise<Array<ReportHistoryItem> | null>;
  reset: () => void;
};

// 보고서 폼 한 시점의 상태 — Nano 변경 카드의 차이 계산·되돌리기에 쓴다
export type ReportFormSnapshot = {
  reportDate: ReportDate;
  today: ReadonlyArray<Project>;
  tomorrow: ReadonlyArray<Project>;
};

// 오늘의 목표 중 넘긴 것(새로 고침 뒤 되살아나지 않게 이 기기에 둔다). owner = 회원 id 또는 'guest'
export type TodayGoalsStorage = {
  owner: string;
  dateKey: string;
  sourceDateKey: string;
  dismissed: Array<string>;
};
