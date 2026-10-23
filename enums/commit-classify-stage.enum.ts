// 커밋 분류 단계. 화면의 단계 목록이 이 순서대로 진행된다.
export const COMMIT_CLASSIFY_STAGE = {
  /** 온디바이스 AI 세션 준비(모델 적재) */
  PREPARE: 'prepare',
  /** 저장소 → 프로젝트 판정 */
  REPO: 'repo',
  /** 커밋 묶음 → 기존 작업 판정 */
  TASK: 'task',
  /** 새 작업 묶기 + 이름짓기 */
  NAMING: 'naming',
  /** 새 작업 진행률 유추 */
  PROGRESS: 'progress',
  /** 세부 항목 제안 + 표기 보정 */
  DETAIL: 'detail',
} as const;

export const COMMIT_CLASSIFY_STAGE_VALUES = [
  COMMIT_CLASSIFY_STAGE.PREPARE,
  COMMIT_CLASSIFY_STAGE.REPO,
  COMMIT_CLASSIFY_STAGE.TASK,
  COMMIT_CLASSIFY_STAGE.NAMING,
  COMMIT_CLASSIFY_STAGE.PROGRESS,
  COMMIT_CLASSIFY_STAGE.DETAIL,
] as const;
