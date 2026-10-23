// 가져오기 대상 커밋 1건. message 는 첫 줄(제목)만 담는다.
export type GithubCommit = {
  sha: string;
  repo: string;
  message: string;
  url: string;
  // ISO 8601 (작성 시각)
  committedAt: string;
};

export type GithubConnection = { connected: false } | { connected: true; login: string };

export type GithubCommitsResult =
  | { ok: true; login: string; since: string; commits: Array<GithubCommit> }
  | {
      ok: false;
      reason: 'members_only' | 'not_connected' | 'unauthorized' | 'rate_limited' | 'failed';
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
