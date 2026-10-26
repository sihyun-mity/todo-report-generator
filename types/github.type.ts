// 가져오기 대상 커밋 1건. message 는 첫 줄(제목)만 담는다.
export type GithubCommit = {
  sha: string;
  repo: string;
  message: string;
  url: string;
  // ISO 8601 (작성 시각)
  committedAt: string;
};

// 작성자 추가 자동완성 후보. GitHub 계정과 연결된 커밋은 login, 연결되지 않은 커밋은 작성 이메일로 모은다.
export type GithubCommitAuthor = {
  // `author` 필터에 넣을 값(login 또는 소문자 이메일)
  author: string;
  kind: 'login' | 'email';
  // 커밋에 적힌 작성자 이름(가장 최근 커밋 기준)
  name: string;
  commits: number;
  repos: Array<string>;
  // ISO 8601 — 가장 최근 커밋 작성 시각
  lastCommittedAt: string;
};

export type GithubCommitAuthorsResult =
  | { ok: true; authors: Array<GithubCommitAuthor> }
  | { ok: false; reason: GithubFailureReason; message: string };

export type GithubFailureReason = 'members_only' | 'not_connected' | 'unauthorized' | 'rate_limited' | 'failed';

export type GithubConnection = { connected: false } | { connected: true; login: string };

export type GithubCommitsResult =
  | {
      ok: true;
      login: string;
      // 연결한 계정 외에 함께 조회한 작성자(GitHub 사용자 이름·이메일) — 다듬고 중복을 뺀 값
      extraAuthors: Array<string>;
      since: string;
      // null 이면 지금까지
      until: string | null;
      // 요청한 시작 시각이 최대 조회 기간보다 오래돼 잘렸는지
      clipped: boolean;
      // 분류 상한(`GITHUB_COMMITS_CLASSIFY_LIMIT`)을 넘어 뺀 오래된 커밋 수
      omitted: number;
      commits: Array<GithubCommit>;
    }
  | {
      ok: false;
      reason: GithubFailureReason;
      message: string;
    };

// 의도 쿠키가 남은 채 돌아왔을 때 세션의 provider token 을 받아 둔 결과
export type GithubCaptureResult =
  | 'connected'
  | 'no_intent'
  | 'members_only'
  | 'account_mismatch'
  | 'missing_token'
  | 'missing_scope'
  | 'github_error';

// 커밋 가져오기 연결을 시작할 때 남기는 의도 쿠키 값
export type GithubImportIntent = {
  userId: string;
  next: string;
};

// 토큰을 받은 회원 id 를 함께 봉인한다. 같은 브라우저에서 다른 계정으로 로그인하면 쓰지 않는다.
export type GithubTokenPayload = {
  accessToken: string;
  login: string;
  userId: string;
};
