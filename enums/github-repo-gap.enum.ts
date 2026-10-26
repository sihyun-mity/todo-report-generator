// 커밋 가져오기에서 저장소를 다 찾아보지 못한 이유. 위에서부터 우선한다(한 저장소에 여러 이유가 겹치면 앞의 것 하나만 알린다).
export const GITHUB_REPO_GAP = {
  /** 조직 SAML SSO 승인이 없어 403 — 아예 못 봄 */
  SSO: 'sso',
  /** 접근 권한 없음(403) — 아예 못 봄 */
  FORBIDDEN: 'forbidden',
  /** 저장소를 찾을 수 없음(404) — 아예 못 봄 */
  NOT_FOUND: 'not_found',
  /** Repository activities API 가 막혀 기본 브랜치만 봄 */
  ACTIVITY_FAILED: 'activity_failed',
  /** 작업(push) 기록이 한 페이지(100건)를 넘어 범위 안의 브랜치를 일부 못 봤을 수 있음 */
  ACTIVITY_FULL: 'activity_full',
  /** 브랜치가 `GITHUB_MAX_BRANCHES_PER_REPO` 를 넘어 최근 것만 봄 */
  BRANCHES: 'branches',
} as const;

export const GITHUB_REPO_GAP_VALUES = [
  GITHUB_REPO_GAP.SSO,
  GITHUB_REPO_GAP.FORBIDDEN,
  GITHUB_REPO_GAP.NOT_FOUND,
  GITHUB_REPO_GAP.ACTIVITY_FAILED,
  GITHUB_REPO_GAP.ACTIVITY_FULL,
  GITHUB_REPO_GAP.BRANCHES,
] as const;
