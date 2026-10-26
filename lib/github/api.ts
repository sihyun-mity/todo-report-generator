import 'server-only';
import { GITHUB_MAX_BRANCHES_PER_REPO, GITHUB_MAX_REPOS } from '@/constants';
import type { GithubCommit, GithubCommitAuthor } from '@/types';
import { isCommitAuthorEmail } from '@/utils';

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
  // 작성 이메일이 GitHub 계정에 연결돼 있으면 그 계정, 아니면 null
  author: { login: string } | null;
  commit: {
    message: string;
    author: { date: string; name?: string; email?: string } | null;
    committer: { date: string } | null;
  };
};

// 조회할 저장소 — 최근 push 된 순으로, since 이후 push 됐고 제외하지 않은 것만
async function listRecentRepos(token: string, since: Date, excludedRepos: ReadonlySet<string>) {
  const repos = await gh<Array<RepoItem>>(
    token,
    '/user/repos?sort=pushed&direction=desc&per_page=100&affiliation=owner,collaborator,organization_member'
  );
  return repos
    .filter((r) => r.pushed_at && new Date(r.pushed_at) >= since && !excludedRepos.has(r.full_name))
    .slice(0, GITHUB_MAX_REPOS);
}

// activity API 의 time_period 는 "지금부터 거슬러" 세는 창이라, 지난 날짜 보고서도 범위 끝이 아니라 since 가 들어가는
// 가장 작은 창을 고른다(month·quarter 는 달력 길이와 어긋나지 않게 짧게 잡는다). 1년보다 오래되면 창을 두지 않는다.
const ACTIVITY_PERIODS = [
  { period: 'day', days: 1 },
  { period: 'week', days: 7 },
  { period: 'month', days: 28 },
  { period: 'quarter', days: 89 },
  { period: 'year', days: 365 },
] as const;

function activityPeriodQuery(since: Date) {
  const days = (Date.now() - since.getTime()) / 86_400_000;
  const found = ACTIVITY_PERIODS.find((p) => days <= p.days);
  return found ? `&time_period=${found.period}` : '';
}

// 저장소에서 since 이후 작성자들(GitHub login)이 push 한 브랜치. Repository activities API 가 막혀 있으면 기본 브랜치만 본다.
// 이메일로만 받은 작성자는 push 주체를 알 수 없어 연결한 계정이 push 한 브랜치와 기본 브랜치에서 찾는다
// (GitLab 에서 옮겨 온 저장소처럼 예전 이메일로 작성한 커밋을 본인이 push 한 경우).
async function findPushedBranches(
  token: string,
  repo: RepoItem,
  actors: ReadonlyArray<string>,
  since: Date
): Promise<Array<string>> {
  const branches = new Set<string>([repo.default_branch]);
  const periodQuery = activityPeriodQuery(since);
  for (const actor of actors) {
    try {
      const activity = await gh<Array<ActivityItem>>(
        token,
        `/repos/${repo.full_name}/activity?actor=${encodeURIComponent(actor)}&activity_type=push${periodQuery}&per_page=100`
      );
      for (const a of activity) {
        if (new Date(a.timestamp) < since || !a.ref.startsWith('refs/heads/')) continue;
        branches.add(a.ref.slice('refs/heads/'.length));
      }
    } catch (error) {
      if (error instanceof GithubApiError && (error.rateLimited || error.status === 401)) throw error;
    }
  }
  return [...branches].slice(0, GITHUB_MAX_BRANCHES_PER_REPO);
}

// since ~ until(null 이면 지금) 사이에 `authors`(GitHub login 또는 이메일)가 작성한 커밋. 첫 작성자가 연결한 계정이다.
// 권한상으로는 저장소 전체를 읽을 수 있으므로 `author` 필터로 지정한 작성자 것만 거른다.
export async function listAuthoredCommitsSince(
  token: string,
  authors: ReadonlyArray<string>,
  since: Date,
  until: Date | null,
  excludedRepos: ReadonlySet<string>
): Promise<Array<GithubCommit>> {
  // 사용자가 제외한 저장소는 브랜치·커밋 조회를 하지 않는다(호출 수도 아낀다)
  const recent = await listRecentRepos(token, since, excludedRepos);
  const actors = authors.filter((a) => !isCommitAuthorEmail(a));

  const sinceIso = since.toISOString();
  const untilQuery = until ? `&until=${until.toISOString()}` : '';
  const perRepo = await Promise.all(
    recent.map(async (repo) => {
      const branches = await findPushedBranches(token, repo, actors, since);
      const found = new Map<string, GithubCommit>();
      for (const branch of branches) {
        for (const author of authors) {
          let items: Array<CommitItem>;
          try {
            items = await gh<Array<CommitItem>>(
              token,
              `/repos/${repo.full_name}/commits?author=${encodeURIComponent(author)}&since=${sinceIso}${untilQuery}&sha=${encodeURIComponent(branch)}&per_page=100`
            );
          } catch (error) {
            // 빈 저장소(409) 등 저장소 단위 오류는 건너뛴다
            if (error instanceof GithubApiError && (error.rateLimited || error.status === 401)) throw error;
            continue;
          }
          for (const item of items) {
            // 머지 커밋은 실제 작업 내용이 아니므로 제외. 같은 커밋이 여러 브랜치·작성자로 잡히면 한 번만 담는다.
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
      }
      return [...found.values()];
    })
  );

  return perRepo.flat().sort((a, b) => a.committedAt.localeCompare(b.committedAt));
}

// since ~ until 사이 기본 브랜치 커밋의 작성자 목록(작성자 추가 자동완성 후보). 저장소마다 커밋 목록을 한 번만 조회한다.
// GitHub 계정과 연결된 커밋은 login 으로, 연결되지 않은 커밋(예: 다른 곳에서 옮겨 온 저장소의 예전 이메일)은 이메일로 모은다.
// 머지 커밋도 센다 — 작성자를 찾는 것이 목적이라 내용은 보지 않는다.
export async function listCommitAuthorsSince(
  token: string,
  since: Date,
  until: Date | null,
  excludedRepos: ReadonlySet<string>
): Promise<Array<GithubCommitAuthor>> {
  const recent = await listRecentRepos(token, since, excludedRepos);
  const untilQuery = until ? `&until=${until.toISOString()}` : '';
  const authors = new Map<string, GithubCommitAuthor>();
  const perRepo = await Promise.all(
    recent.map(async (repo) => {
      try {
        return {
          repo: repo.full_name,
          items: await gh<Array<CommitItem>>(
            token,
            `/repos/${repo.full_name}/commits?since=${since.toISOString()}${untilQuery}&per_page=100`
          ),
        };
      } catch (error) {
        if (error instanceof GithubApiError && (error.rateLimited || error.status === 401)) throw error;
        return { repo: repo.full_name, items: [] };
      }
    })
  );
  for (const { repo, items } of perRepo) {
    // 최근 커밋부터 온다
    for (const item of items) {
      const email = item.commit.author?.email?.trim().toLowerCase();
      const login = item.author?.login;
      const key = login ?? email;
      if (!key) continue;
      const committedAt = item.commit.author?.date ?? '';
      const current = authors.get(key);
      if (current) {
        current.commits += 1;
        if (!current.repos.includes(repo)) current.repos.push(repo);
        if (committedAt > current.lastCommittedAt) {
          current.lastCommittedAt = committedAt;
          current.name = item.commit.author?.name?.trim() || current.name;
        }
        continue;
      }
      authors.set(key, {
        author: key,
        kind: login ? 'login' : 'email',
        name: item.commit.author?.name?.trim() ?? '',
        commits: 1,
        repos: [repo],
        lastCommittedAt: committedAt,
      });
    }
  }
  return [...authors.values()].sort(
    (a, b) => b.lastCommittedAt.localeCompare(a.lastCommittedAt) || b.commits - a.commits
  );
}
