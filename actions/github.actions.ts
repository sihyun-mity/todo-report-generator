'use server';

import { cookies } from 'next/headers';
import {
  GITHUB_COMMIT_AUTHOR_LOOKBACK_DAYS,
  GITHUB_COMMIT_EXTRA_AUTHORS_LIMIT,
  GITHUB_COMMITS_CLASSIFY_LIMIT,
  GITHUB_COMMITS_MAX_LOOKBACK_DAYS,
  GITHUB_IMPORT_INTENT_COOKIE,
  GITHUB_IMPORT_OAUTH_SCOPES,
} from '@/constants';
import { GithubApiError, inspectGithubToken, listAuthoredCommitsSince, listCommitAuthorsSince } from '@/lib/github/api';
import { parseGithubImportIntent } from '@/lib/github/import-intent';
import {
  clearGithubToken,
  createGithubTokenCookie,
  readGithubToken,
  refreshGithubToken,
} from '@/lib/github/token-cookie';
import { createClient } from '@/lib/supabase/server';
import type {
  GithubCaptureResult,
  GithubCommitAuthorsResult,
  GithubCommitsResult,
  GithubConnection,
  GithubFailureReason,
  GithubTokenPayload,
} from '@/types';
import { normalizeCommitAuthor, sameCommitAuthor } from '@/utils';

// 커밋 가져오기는 로그인 회원 전용이다. 게스트·stale 토큰은 getUser() 가 던질 수 있어 비회원으로 본다.
async function getMemberId(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * 연결 의도 쿠키가 남은 채 돌아왔을 때(= `/auth/callback` 을 거치지 않음) 세션 쿠키의 provider token 을 받아 둔다.
 *
 * Supabase 가 redirectTo 대신 Site URL(`/?code=...`)로 돌려보내면 브라우저 클라이언트가 그 자리에서 코드를 교환해
 * 콜백의 토큰 저장이 건너뛰어진다. 교환된 세션은 provider token 을 함께 쿠키에 담으므로 서버가 그것을 직접 읽는다
 * (토큰이 앱 JS 를 거치지 않는다). 의도 쿠키는 결과와 관계없이 지운다.
 */
export async function captureGithubImportToken(): Promise<GithubCaptureResult> {
  const cookieStore = await cookies();
  const intent = parseGithubImportIntent(cookieStore.get(GITHUB_IMPORT_INTENT_COOKIE)?.value);
  cookieStore.delete(GITHUB_IMPORT_INTENT_COOKIE);
  if (!intent) return 'no_intent';

  const supabase = await createClient();
  let userId: string | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id ?? null;
  } catch {
    userId = null;
  }
  // 실패 사유만 남긴다(토큰 값은 남기지 않는다) — 로컬/운영에서 연결이 안 될 때 원인을 바로 볼 수 있게
  const fail = (reason: Exclude<GithubCaptureResult, 'connected' | 'no_intent'>) => {
    console.warn(`[github-import] 토큰 저장 실패: ${reason}`);
    return reason;
  };
  if (!userId) return fail('members_only');
  if (userId !== intent.userId) return fail('account_mismatch');

  const { data: sessionData } = await supabase.auth.getSession();
  const providerToken = sessionData.session?.provider_token;
  if (!providerToken) return fail('missing_token');

  try {
    const { login, scopes } = await inspectGithubToken(providerToken);
    if (!scopes.includes(GITHUB_IMPORT_OAUTH_SCOPES)) return fail('missing_scope');
    const cookie = await createGithubTokenCookie({ accessToken: providerToken, login, userId });
    cookieStore.set(cookie.name, cookie.value, cookie.options);
    return 'connected';
  } catch {
    return fail('github_error');
  }
}

/** 봉인 쿠키에 이 회원의 GitHub 토큰이 있는지와 연결된 계정 login 을 반환한다. 토큰 값은 절대 내보내지 않는다. */
export async function getGithubConnection(): Promise<GithubConnection> {
  const userId = await getMemberId();
  const token = userId ? await readGithubToken(userId) : null;
  return token ? { connected: true, login: token.login } : { connected: false };
}

type GithubFailure = { ok: false; reason: GithubFailureReason; message: string };

// 회원이고 GitHub 를 연결했으면 토큰, 아니면 실패 결과
async function requireGithubToken(): Promise<GithubTokenPayload | GithubFailure> {
  const userId = await getMemberId();
  if (!userId) return { ok: false, reason: 'members_only', message: '로그인한 회원만 사용할 수 있어요.' };
  const token = await readGithubToken(userId);
  if (!token) return { ok: false, reason: 'not_connected', message: 'GitHub 계정을 먼저 연결해 주세요.' };
  return token;
}

// 조회 실패를 사용자 안내로 바꾼다. 401 이면 토큰 쿠키도 비운다.
async function toGithubFailure(error: unknown, failedMessage: string): Promise<GithubFailure> {
  if (error instanceof GithubApiError && error.status === 401) {
    // 사용자가 GitHub 에서 승인을 철회했거나 토큰이 폐기된 경우 — 쿠키도 비운다
    await clearGithubToken();
    return { ok: false, reason: 'unauthorized', message: 'GitHub 연결이 만료되었습니다. 다시 연결해 주세요.' };
  }
  if (error instanceof GithubApiError && error.rateLimited) {
    return {
      ok: false,
      reason: 'rate_limited',
      message: 'GitHub API 호출 한도를 넘었습니다. 잠시 후 다시 시도해 주세요.',
    };
  }
  return { ok: false, reason: 'failed', message: failedMessage };
}

// 범위 끝(지금을 넘지 않게)과, 지금까지 조회하면 null 인 until
function rangeEnd(untilMs: number | null) {
  const now = Date.now();
  const end = typeof untilMs === 'number' && Number.isFinite(untilMs) ? Math.min(untilMs, now) : now;
  // 지금까지 조회하면 until 을 두지 않는다(조회 중에 생긴 커밋도 담는다)
  return { end, until: end < now ? new Date(end) : null };
}

const toRepoSet = (repos: ReadonlyArray<string>) =>
  new Set((Array.isArray(repos) ? repos : []).filter((r): r is string => typeof r === 'string').slice(0, 200));

/**
 * `sinceMs` ~ `untilMs`(null 이면 지금) 사이에 본인이 작성한 커밋을 최근 push 된 저장소에서 모은다.
 * `extraAuthors`(GitHub 사용자 이름·이메일)가 있으면 그 작성자의 커밋도 함께 모은다 — 커밋 작성 이메일이 GitHub 계정에
 * 연결돼 있지 않은 경우(예: GitLab 에서 옮겨 온 저장소) 등. 조회 범위는 연결한 계정이 접근할 수 있는 저장소 그대로다.
 * 조회 기간은 범위 끝에서 `GITHUB_COMMITS_MAX_LOOKBACK_DAYS` 까지로 잘라 API 호출 수를 제한하고,
 * 분류할 커밋은 최근 `GITHUB_COMMITS_CLASSIFY_LIMIT` 건만 남긴다(뺀 개수는 `omitted` 로 알려 미리보기에서 안내한다).
 * `excludedRepos`(사용자가 분류에서 뺀 저장소)는 조회하지 않는다.
 */
export async function fetchGithubCommits(
  sinceMs: number,
  untilMs: number | null,
  excludedRepos: ReadonlyArray<string> = [],
  extraAuthors: ReadonlyArray<string> = []
): Promise<GithubCommitsResult> {
  const token = await requireGithubToken();
  if ('ok' in token) return token;

  const { end, until } = rangeEnd(untilMs);
  const floor = end - GITHUB_COMMITS_MAX_LOOKBACK_DAYS * 86_400_000;
  const since = new Date(Math.min(Math.max(Number.isFinite(sinceMs) ? sinceMs : floor, floor), end));

  try {
    const authors: Array<string> = [];
    for (const raw of Array.isArray(extraAuthors) ? extraAuthors : []) {
      const author = typeof raw === 'string' ? normalizeCommitAuthor(raw) : null;
      if (!author || sameCommitAuthor(author, token.login) || authors.some((a) => sameCommitAuthor(a, author)))
        continue;
      authors.push(author);
      if (authors.length >= GITHUB_COMMIT_EXTRA_AUTHORS_LIMIT) break;
    }
    // 작성 시각 오름차순이라 뒤쪽이 최근 커밋이다
    const found = await listAuthoredCommitsSince(
      token.accessToken,
      [token.login, ...authors],
      since,
      until,
      toRepoSet(excludedRepos)
    );
    const commits = found.slice(-GITHUB_COMMITS_CLASSIFY_LIMIT);
    // 쓰는 동안은 연결을 유지한다 — 마지막으로 가져온 때부터 GITHUB_TOKEN_TTL_SECONDS 동안 안 쓰면 끊긴다
    await refreshGithubToken(token);
    return {
      ok: true,
      login: token.login,
      extraAuthors: authors,
      since: since.toISOString(),
      until: until?.toISOString() ?? null,
      clipped: since.getTime() === floor && sinceMs < floor,
      omitted: found.length - commits.length,
      commits,
    };
  } catch (error) {
    return toGithubFailure(error, '커밋을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
  }
}

/**
 * 작성자 추가 자동완성 후보 — 범위 끝(`untilMs`, null 이면 지금)에서 `GITHUB_COMMIT_AUTHOR_LOOKBACK_DAYS` 동안
 * 연결한 계정이 접근할 수 있는 저장소(제외한 저장소 빼고)의 기본 브랜치에 커밋한 작성자. 연결한 계정 본인은 뺀다.
 * 커밋 내용은 내보내지 않고 작성자 식별값·이름·커밋 수·저장소만 돌려준다.
 */
export async function fetchGithubCommitAuthors(
  untilMs: number | null,
  excludedRepos: ReadonlyArray<string> = []
): Promise<GithubCommitAuthorsResult> {
  const token = await requireGithubToken();
  if ('ok' in token) return token;

  const { end, until } = rangeEnd(untilMs);
  const since = new Date(end - GITHUB_COMMIT_AUTHOR_LOOKBACK_DAYS * 86_400_000);
  try {
    const authors = await listCommitAuthorsSince(token.accessToken, since, until, toRepoSet(excludedRepos));
    return { ok: true, authors: authors.filter((a) => !sameCommitAuthor(a.author, token.login)) };
  } catch (error) {
    return toGithubFailure(error, '작성자 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
  }
}

/**
 * 이 브라우저에 보관한 토큰만 지운다. 토큰은 로그인용 GitHub OAuth App 의 승인이라 GitHub 쪽 승인을
 * 철회하면 GitHub 로그인까지 다시 승인해야 하므로 건드리지 않는다(필요하면 GitHub 설정에서 직접 철회).
 */
export async function disconnectGithub(): Promise<void> {
  await clearGithubToken();
}
