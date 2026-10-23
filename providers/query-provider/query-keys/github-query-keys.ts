import { createQueryKeys } from '@lukemorales/query-key-factory';
import { fetchGithubCommits, getGithubConnection } from '@/actions';

/**
 * GitHub 커밋 가져오기 관련 쿼리 키 모음.
 *
 * - `connection()` / `commits(sinceMs)` 는 Server Action 을 호출한다. 토큰은 httpOnly 봉인 쿠키에 있어 브라우저로 오지 않는다.
 * - `plan(commitsUpdatedAt)` 은 키만 정의한다 — 분류는 브라우저 온디바이스 AI 로 돌려 queryFn 을 호출부에서 넘긴다.
 */
export const github = createQueryKeys('github', {
  /** GitHub 계정 연결 여부와 login */
  connection: () => ({
    queryKey: ['connection'],
    queryFn: getGithubConnection,
  }),
  /** sinceMs 이후 본인이 작성한 커밋(제외한 저장소 빼고) */
  commits: (sinceMs: number, excludedRepos: ReadonlyArray<string>) => ({
    queryKey: [sinceMs, excludedRepos],
    queryFn: () => fetchGithubCommits(sinceMs, excludedRepos),
  }),
  /** 가져온 커밋 묶음(조회 시각으로 구분)에 대한 분류 결과 */
  plan: (commitsUpdatedAt: number) => ({
    queryKey: [commitsUpdatedAt],
  }),
});
