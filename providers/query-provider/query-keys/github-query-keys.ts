import { createQueryKeys } from '@lukemorales/query-key-factory';
import { fetchGithubCommitAuthors, fetchGithubCommits, getGithubConnection } from '@/actions';

/**
 * GitHub 커밋 가져오기 관련 쿼리 키 모음.
 *
 * - `connection()` / `commits(sinceMs, untilMs)` 는 Server Action 을 호출한다. 토큰은 httpOnly 봉인 쿠키에 있어 브라우저로 오지 않는다.
 * - `memory(userId)` / `plan(commitsUpdatedAt)` / `aiAvailability()` 은 키만 정의한다 — 분류는 브라우저 온디바이스 AI 로 돌려 queryFn 을 호출부에서 넘긴다.
 */
export const github = createQueryKeys('github', {
  /** GitHub 계정 연결 여부와 login */
  connection: () => ({
    queryKey: ['connection'],
    queryFn: getGithubConnection,
  }),
  /** sinceMs ~ untilMs(null 이면 지금) 사이에 본인과 extraAuthors 가 작성한 커밋(제외한 저장소 빼고) */
  commits: (
    sinceMs: number,
    untilMs: number | null,
    excludedRepos: ReadonlyArray<string>,
    extraAuthors: ReadonlyArray<string>
  ) => ({
    queryKey: [sinceMs, untilMs ?? 'now', excludedRepos, extraAuthors],
    queryFn: () => fetchGithubCommits(sinceMs, untilMs, excludedRepos, extraAuthors),
  }),
  /** 작성자 추가 자동완성 후보 — 연결한 계정이 접근할 수 있는 저장소의 최근 커밋 작성자(본인 제외) */
  commitAuthors: (untilMs: number | null, excludedRepos: ReadonlyArray<string>) => ({
    queryKey: [untilMs ?? 'now', excludedRepos],
    queryFn: () => fetchGithubCommitAuthors(untilMs, excludedRepos),
  }),
  /** 회원의 커밋 가져오기 보정 메모리 — 브라우저 Supabase 클라이언트로 읽어 queryFn 을 호출부에서 넘긴다 */
  memory: (userId: string | null) => ({
    // 키 원소로 null 을 쓸 수 없어 게스트(조회하지 않음)는 빈 문자열로 둔다
    queryKey: [userId ?? ''],
  }),
  /** 이 브라우저의 온디바이스 AI(Prompt API) 사용 가능 상태 — 분류 전 안내 여부를 정한다 */
  aiAvailability: () => ({
    queryKey: ['ai-availability'],
  }),
  /** 가져온 커밋 묶음(조회 시각으로 구분)에 대한 분류 결과 */
  plan: (commitsUpdatedAt: number) => ({
    queryKey: [commitsUpdatedAt],
  }),
});
