import type { COMMIT_CLASSIFY_STAGE_VALUES } from '@/enums';
import type { GithubCommit } from '.';

// 가져올 세부 항목 1줄. suggested 는 AI 가 만든 원래 문구(사용자가 직접 추가한 줄이면 null)다.
// 사용자가 suggested 를 고쳤을 때만 표기 보정으로 기억한다(AI 문구를 사용자 보정으로 다시 배우지 않게).
export type PlannedDetail = {
  key: string;
  content: string;
  suggested: string | null;
};

// 폼의 기존 작업(existingTaskId)에 붙이거나 새 작업으로 추가할 작업 단위.
// commits 는 이 작업으로 분류된 근거 커밋이고, 세부 항목은 AI 가 필요하다고 판단할 때만 만든다.
export type PlannedTask = {
  key: string;
  existingTaskId: string | null;
  content: string;
  progress: number;
  // 새 작업에 처음 제안한 진행률(AI 유추 또는 기본값 100). 기존 작업은 폼의 진행률을 그대로 쓰므로 null.
  // 사용자가 이 값을 고쳤을 때만 진행률 보정으로 기억한다.
  suggestedProgress: number | null;
  // 이 작업을 폼에 반영할지
  included: boolean;
  commits: Array<GithubCommit>;
  details: Array<PlannedDetail>;
  // AI 가 처음 제안한 세부 항목 문구 — 미리보기에서 몇 개를 지웠는지 세어 다음 제안을 조절한다
  suggestedDetails: Array<string>;
};

// 폼의 기존 프로젝트(existingProjectId)에 붙이거나 새 프로젝트로 추가할 프로젝트 단위
export type PlannedProject = {
  key: string;
  existingProjectId: string | null;
  name: string;
  repos: Array<string>;
  tasks: Array<PlannedTask>;
};

export type CommitImportPlan = {
  projects: Array<PlannedProject>;
  // 'ai' = 온디바이스 AI 분류, 'rule' = 미지원 브라우저용 규칙 기반 분류
  classifier: 'ai' | 'rule';
  // 분류 시점의 Prompt API 상태. 'downloadable' 이면 미리보기에서 모델 내려받기를 제안한다.
  aiAvailability: LanguageModelAvailability;
};

export type CommitClassifyStage = (typeof COMMIT_CLASSIFY_STAGE_VALUES)[number];

// 분류 단계 하나의 진행. total 은 그 단계를 시작할 때 정해진다(재확인처럼 도중에 늘 수 있다).
export type ClassifyStageProgress = { done: number; total: number };

// stages 에 없는 단계는 아직 시작하지 않았다. current 가 null 이면 모든 단계가 끝났다.
export type ClassifyProgress = {
  current: CommitClassifyStage | null;
  stages: Partial<Record<CommitClassifyStage, ClassifyStageProgress>>;
};

// 폼에 들어간 항목과 원래 커밋의 연결. 보고서를 저장할 때 사용자가 고친 최종 표기를 찾는 데 쓴다.
export type CommitImportLink =
  | { kind: 'project'; repo: string; projectId: string }
  | { kind: 'task'; scopeKey: string; projectId: string; taskId: string }
  // original = AI 가 제안한 문구, inserted = 폼에 넣은 문구. 저장 시 inserted 와 다르면 사용자가 고친 것이다.
  | { kind: 'detail'; projectId: string; taskId: string; detailId: string; original: string; inserted: string }
  // 가져온 작업에 폼 반영 시점에 있던 세부 항목 id — 저장 시 여기 없는 줄은 사용자가 직접 추가한 것이다
  | { kind: 'details'; projectId: string; taskId: string; known: Array<string> }
  // 새 작업 진행률. suggested = 제안한 값, inserted = 폼에 넣은 값. 저장 시 inserted 와 다르면 사용자가 고친 것이다.
  | {
      kind: 'progress';
      projectId: string;
      taskId: string;
      task: string;
      commits: Array<string>;
      suggested: number;
      inserted: number;
    };

// 세부 항목 표기 보정 — AI 가 제안한 문구 → 사용자가 최종으로 쓴 문구
export type DetailEdit = { original: string; edited: string };

// 진행률 보정 — 이 커밋들로 만든 작업에 제안한 진행률 → 사용자가 최종으로 쓴 진행률
export type ProgressEdit = { task: string; commits: Array<string>; suggested: number; edited: number };

// 사용자별 보정 메모리(기기의 localStorage, 회원 id 별로 분리)
export type CommitImportMemory = {
  // 저장소 full_name → 사용자가 마지막으로 쓴 프로젝트명
  repoProjects: Record<string, string>;
  // `저장소#scope` → 사용자가 마지막으로 쓴 작업명
  scopeTasks: Record<string, string>;
  // 최근 세부 항목 표기 보정(최신순)
  detailEdits: Array<DetailEdit>;
  // AI 가 제안한 세부 항목을 사용자가 지운 횟수 / 그대로 둔(또는 고친) 횟수 / 사용자가 직접 추가한 줄 수
  // — 제안을 얼마나 아껴야 하는지의 신호. added 가 없으면 "아끼라"는 쪽으로만 기울어 되돌아오지 않는다.
  detailFeedback: { removed: number; kept: number; added: number };
  // 최근 새 작업 진행률 보정(최신순) — 다음 진행률 유추에 예시로 넘긴다
  progressEdits: Array<ProgressEdit>;
  // 분류에서 뺄 저장소(개인 프로젝트 등) — 커밋 조회부터 건너뛴다
  excludedRepos: Array<string>;
  // 저장소 → 그 저장소 작업을 하나도 넣지 않고 적용한 연속 횟수. 쌓이면 미리보기에서 제외를 제안한다(자동 제외는 안 한다)
  repoSkips: Record<string, number>;
  // 아직 보고서 저장으로 확정되지 않은 연결 — 저장 시 최종 표기를 읽어 위 항목에 반영한다
  pendingLinks: Array<CommitImportLink>;
};

export type StyleSample = {
  projectName: string;
  taskContent: string;
};

// 분류 중 화면에 보여 줄 AI 판단 과정의 한 단계. 같은 id 로 다시 오면 그 단계의 갱신이다.
export type ClassifyThought = {
  id: number;
  // 지금 무엇을 판단하는지
  title: string;
  // 모델이 생성 중인 응답에서 읽어 낸 내용(점수·요약·작업명 등) — 생성되는 대로 늘어난다
  lines: Array<string>;
  // 판단 결과. 있으면 이 단계가 끝난 것이다
  conclusion: string | null;
};
