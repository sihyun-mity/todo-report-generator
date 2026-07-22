// 새소식 노출 대상. DB `public.news.audience` 컬럼의 check 제약과 값이 1:1 대응한다.
export const NEWS_AUDIENCE = {
  /** 모두 — 로그인 회원과 비회원(게스트) 모두에게 노출 */
  ALL: 'all',
  /** 회원 전용 — 로그인한 사용자에게만 노출 */
  MEMBER: 'member',
  /** 비회원 전용 — 게스트/비인증 사용자에게만 노출 */
  GUEST: 'guest',
} as const;

export const NEWS_AUDIENCE_VALUES = [NEWS_AUDIENCE.ALL, NEWS_AUDIENCE.MEMBER, NEWS_AUDIENCE.GUEST] as const;
