// GitHub OAuth 액세스 토큰을 담는 봉인(iron-session) 쿠키. httpOnly 라 브라우저 JS 에서는 읽을 수 없다.
export const GITHUB_TOKEN_COOKIE_NAME = 'github_token';
// OAuth App 토큰은 만료가 없지만, 쿠키는 30일 동안 커밋을 가져오지 않으면 끊어 노출 기간을 줄인다(가져올 때마다 다시 센다).
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

// 커밋 수집 범위 상한 — 마지막 보고서가 아주 오래전이어도 조회 범위 끝에서 이 기간까지만 거슬러 올라간다.
export const GITHUB_COMMITS_MAX_LOOKBACK_DAYS = 7;
// 한 번에 분류할 커밋 수 상한. 온디바이스 AI 는 직렬로만 돌고 호출 수가 커밋(묶음) 수에 비례하며,
// 새 작업 이름짓기 프롬프트에 묶음 전체가 들어가므로 넘치면 최근 커밋만 남긴다(금일 보고서에는 최근 작업이 더 중요하다).
export const GITHUB_COMMITS_CLASSIFY_LIMIT = 40;
// 최근 push 된 저장소 중 조회할 최대 개수 / 저장소당 조회할 최대 브랜치 수
export const GITHUB_MAX_REPOS = 20;
export const GITHUB_MAX_BRANCHES_PER_REPO = 10;

/** 예전 커밋 가져오기 보정 메모리 localStorage 키 접두어(`${접두어}:${회원 id}`). 지금은 DB 에 두고, 남은 기록을 옮길 때만 읽는다. */
export const COMMIT_IMPORT_MEMORY_STORAGE_KEY = 'commit-import-memory';
/** 온디바이스 AI 를 쓸 수 없을 때(모델 미설치·미지원 브라우저) 분류 전 안내를 이 기기에서 이미 확인했는지. 값은 확인한 상태('downloadable' | 'unavailable'). */
export const COMMIT_IMPORT_AI_NOTICE_STORAGE_KEY = 'trg:commit-import-ai-notice';
// 기억할 세부 항목 표기 보정 / 저장 대기 연결 최대 개수
export const COMMIT_IMPORT_DETAIL_EDIT_LIMIT = 20;
export const COMMIT_IMPORT_PENDING_LINK_LIMIT = 300;
// 세부 항목 표기 보정을 프롬프트 예시로 넘기는 개수
export const COMMIT_IMPORT_DETAIL_EXAMPLE_LIMIT = 8;
// 기억할 진행률 보정 최대 개수 / 진행률 유추 프롬프트에 예시로 넘기는 개수
export const COMMIT_IMPORT_PROGRESS_EDIT_LIMIT = 20;
export const COMMIT_IMPORT_PROGRESS_EXAMPLE_LIMIT = 8;
// 기억할 가져온 작업(등록 기록) 최대 개수 — 다음 가져오기에서 이미 등록한 작업을 알아보는 데 쓴다
export const COMMIT_IMPORT_IMPORTED_TASK_LIMIT = 60;
// 가져온 작업명과 등록 기록의 작업명(AI 원래 이름·사용자 최종 이름)이 이 유사도(글자 bigram Dice, 0-1) 이상이면 같은 작업으로 본다
export const COMMIT_IMPORT_SIMILAR_TASK_THRESHOLD = 0.7;
// 유사도가 이 값 이상 ~ 위 임계값 미만인 애매한 후보만 AI 에 묻는다(표현만 다른 같은 작업). 작업마다 묻는 후보 수 상한.
export const COMMIT_IMPORT_SIMILAR_TASK_AI_MIN = 0.2;
export const COMMIT_IMPORT_SIMILAR_TASK_AI_CANDIDATE_LIMIT = 5;
// AI 가 "같은 작업"이라고 볼 점수(0-10). 잘못 맞으면 실제 새 작업이 해제돼 빠지므로 작업 연결(7)보다 엄격하게 두고 두 번 채점한다.
export const COMMIT_IMPORT_SIMILAR_TASK_AI_SCORE = 8;
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
// 보정 메모리에 기억한 작업명(`저장소#scope` → 작업명)을 쓸지 확인하는 임계 점수(0-10). 후보가 그 작업 하나뿐이라 비교할
// 다른 작업이 없어 같은 영역이면 7-8 점을 쉽게 줬다 — 작업 연결(7)보다 높게 둔다. PoC(react-user-web 커밋, 같은 작업 12·
// 같은 영역 다른 작업 12건, 각 4회를 두 번 채점 쌍으로): 같은 작업 모두 8-10, 다른 작업 오통과 7 에서 5/24 → 8 에서 3/24.
// 같은 작업 최저점이 8 이라 여유가 없다 — 프롬프트를 바꾸면 다시 검증한다.
export const COMMIT_IMPORT_REMEMBERED_TASK_AI_SCORE = 8;
