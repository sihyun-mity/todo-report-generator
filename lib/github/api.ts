import 'server-only';
import { GITHUB_MAX_BRANCHES_PER_REPO, GITHUB_MAX_REPOS } from '@/constants';
import type { GithubCommit } from '@/types';

const API = 'https://api.github.com';

export class GithubApiError extends Error {
  constructor(
    readonly status: number,
    readonly rateLimited: boolean,
    message: string
  ) {
    super(message);
  }
}

async function gh<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    const rateLimited = res.status === 429 || (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0');
    throw new GithubApiError(res.status, rateLimited, `GitHub API ${res.status} ${path.split('?')[0]}`);
  }
  return (await res.json()) as T;
}

// Supabase 가 OAuth 교환 직후 넘겨준 provider token 의 주인과 승인된 스코프.
// 평소 GitHub 로그인 토큰에는 `repo` 가 없으므로 호출부에서 스코프를 확인해 커밋 가져오기용으로만 받는다.
export async function inspectGithubToken(token: string): Promise<{ login: string; scopes: Array<string> }> {
  const res = await fetch(`${API}/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    cache: 'no-store',
  });
  if (!res.ok) throw new GithubApiError(res.status, false, `GitHub API ${res.status} /user`);
  const user = (await res.json()) as { login: string };
  const scopes = (res.headers.get('x-oauth-scopes') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return { login: user.login, scopes };
}

type RepoItem = { full_name: string; pushed_at: string | null; default_branch: string };
type ActivityItem = { ref: string; timestamp: string };
type CommitItem = {
  sha: string;
  html_url: string;
  parents: ReadonlyArray<unknown>;
  commit: { message: string; author: { date: string } | null; committer: { date: string } | null };
};

// 저장소에서 since 이후 본인이 push 한 브랜치. Repository activities API 가 막혀 있으면 기본 브랜치만 본다.
async function findPushedBranches(token: string, repo: RepoItem, login: string, since: Date): Promise<Array<string>> {
  const branches = new Set<string>([repo.default_branch]);
  try {
    const days = (Date.now() - since.getTime()) / 86_400_000;
    const period = days <= 1 ? 'day' : days <= 7 ? 'week' : 'month';
    const activity = await gh<Array<ActivityItem>>(
      token,
      `/repos/${repo.full_name}/activity?actor=${encodeURIComponent(login)}&activity_type=push&time_period=${period}&per_page=100`
    );
    for (const a of activity) {
      if (new Date(a.timestamp) < since || !a.ref.startsWith('refs/heads/')) continue;
      branches.add(a.ref.slice('refs/heads/'.length));
    }
  } catch (error) {
    if (error instanceof GithubApiError && (error.rateLimited || error.status === 401)) throw error;
  }
  return [...branches].slice(0, GITHUB_MAX_BRANCHES_PER_REPO);
}

// since ~ until(null 이면 지금) 사이에 본인이 작성한 커밋. 권한상으로는 저장소 전체를 읽을 수 있으므로 `author` 필터로 본인 것만 거른다.
export async function listMyCommitsSince(
  token: string,
  login: string,
  since: Date,
  until: Date | null,
  excludedRepos: ReadonlySet<string>
): Promise<Array<GithubCommit>> {
  const repos = await gh<Array<RepoItem>>(
    token,
    '/user/repos?sort=pushed&direction=desc&per_page=100&affiliation=owner,collaborator,organization_member'
  );
  // 사용자가 제외한 저장소는 브랜치·커밋 조회를 하지 않는다(호출 수도 아낀다)
  const recent = repos
    .filter((r) => r.pushed_at && new Date(r.pushed_at) >= since && !excludedRepos.has(r.full_name))
    .slice(0, GITHUB_MAX_REPOS);

  const sinceIso = since.toISOString();
  const untilQuery = until ? `&until=${until.toISOString()}` : '';
  const perRepo = await Promise.all(
    recent.map(async (repo) => {
      const branches = await findPushedBranches(token, repo, login, since);
      const found = new Map<string, GithubCommit>();
      for (const branch of branches) {
        let items: Array<CommitItem>;
        try {
          items = await gh<Array<CommitItem>>(
            token,
            `/repos/${repo.full_name}/commits?author=${encodeURIComponent(login)}&since=${sinceIso}${untilQuery}&sha=${encodeURIComponent(branch)}&per_page=100`
          );
        } catch (error) {
          // 빈 저장소(409) 등 저장소 단위 오류는 건너뛴다
          if (error instanceof GithubApiError && (error.rateLimited || error.status === 401)) throw error;
          continue;
        }
        for (const item of items) {
          // 머지 커밋은 실제 작업 내용이 아니므로 제외
          if (item.parents.length > 1 || found.has(item.sha)) continue;
          found.set(item.sha, {
            sha: item.sha,
            repo: repo.full_name,
            message: item.commit.message.split('\n')[0].trim(),
            url: item.html_url,
            committedAt: item.commit.author?.date ?? item.commit.committer?.date ?? sinceIso,
          });
        }
      }
      return [...found.values()];
    })
  );

  return perRepo.flat().sort((a, b) => a.committedAt.localeCompare(b.committedAt));
}
