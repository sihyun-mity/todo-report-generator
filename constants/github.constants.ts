// GitHub OAuth 액세스 토큰을 담는 봉인(iron-session) 쿠키. httpOnly 라 브라우저 JS 에서는 읽을 수 없다.
export const GITHUB_TOKEN_COOKIE_NAME = 'github_token';
// OAuth App 토큰은 만료가 없지만, 쿠키는 30일마다 다시 연결하게 해 노출 기간을 줄인다.
export const GITHUB_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;

// 로그인에 쓰는 Supabase GitHub OAuth App 을 그대로 쓰되, 연결할 때만 `repo` 스코프를 추가로 요청한다.
// 조직 비공개 저장소의 커밋을 읽으려면 OAuth App 에서는 `repo` 외에 선택지가 없다(읽기 전용 스코프 없음).
export const GITHUB_IMPORT_OAUTH_SCOPES = 'repo';

// `/auth/callback` 에 "커밋 가져오기 연결" 흐름임을 알리는 단기 쿠키(값: 연결을 시작한 회원 id + 복귀 경로).
// redirectTo 에 쿼리를 붙이면 Supabase Redirect URL 허용 목록과 어긋나 Site URL 로 떨어지므로
// redirectTo 는 로그인과 똑같이 `/auth/callback` 만 쓰고 의도는 쿠키로 넘긴다(`PENDING_NEWS_SEEN_COOKIE` 와 같은 방식).
export const GITHUB_IMPORT_INTENT_COOKIE = 'trg-github-import';
export const GITHUB_IMPORT_INTENT_MAX_AGE_SECONDS = 600;

// 연결 결과를 원래 화면으로 돌려보낼 때 쓰는 쿼리 키 (`?github=connected|denied|error`)
export const GITHUB_OAUTH_RESULT_PARAM = 'github';

// 커밋 수집 범위 상한 — 마지막 보고서가 아주 오래전이어도 이 기간까지만 거슬러 올라간다.
export const GITHUB_COMMITS_MAX_LOOKBACK_DAYS = 14;
// 최근 push 된 저장소 중 조회할 최대 개수 / 저장소당 조회할 최대 브랜치 수
export const GITHUB_MAX_REPOS = 20;
export const GITHUB_MAX_BRANCHES_PER_REPO = 10;

/** 예전 커밋 가져오기 보정 메모리 localStorage 키 접두어(`${접두어}:${회원 id}`). 지금은 DB 에 두고, 남은 기록을 옮길 때만 읽는다. */
export const COMMIT_IMPORT_MEMORY_STORAGE_KEY = 'commit-import-memory';
// 기억할 세부 항목 표기 보정 / 저장 대기 연결 최대 개수
export const COMMIT_IMPORT_DETAIL_EDIT_LIMIT = 20;
export const COMMIT_IMPORT_PENDING_LINK_LIMIT = 300;
// 세부 항목 표기 보정을 프롬프트 예시로 넘기는 개수
export const COMMIT_IMPORT_DETAIL_EXAMPLE_LIMIT = 8;
// 기억할 진행률 보정 최대 개수 / 진행률 유추 프롬프트에 예시로 넘기는 개수
export const COMMIT_IMPORT_PROGRESS_EDIT_LIMIT = 20;
export const COMMIT_IMPORT_PROGRESS_EXAMPLE_LIMIT = 8;
// 저장소 작업을 하나도 넣지 않고 적용한 횟수가 이만큼 연속되면 미리보기에서 그 저장소 제외를 제안한다
export const COMMIT_IMPORT_REPO_SKIP_SUGGEST_COUNT = 3;
// 진행률을 알 수 없을 때의 기본값 — 커밋이 있으면 대개 그 일은 끝난 것으로 본다
export const COMMIT_IMPORT_DEFAULT_PROGRESS = 100;
// 새 작업명 문체를 맞출 때 예시로 넘기는 과거 작업명 최대 개수
export const COMMIT_IMPORT_STYLE_SAMPLE_LIMIT = 12;
// 분류 프롬프트 1회 제한 시간. 모델 호출이 드물게 멈추는 경우를 끊어낸다.
export const COMMIT_CLASSIFY_PROMPT_TIMEOUT_MS = 30_000;
// AI 분류가 끝난 뒤 모든 단계가 완료된 모습을 보여 주고 결과 화면으로 넘어가기까지의 시간
export const COMMIT_CLASSIFY_COMPLETE_HOLD_MS = 700;
// 기존 작업 연결 임계 점수(0-10). PoC 3개 세트에서 일치 ≥7, 불일치 ≤5 로 갈렸다.
export const COMMIT_TASK_MATCH_THRESHOLD = 7;
