export const NEWS_GUEST_STORAGE_KEY = 'trg:last-seen-news-id';
export const PASSKEY_BANNER_DISMISS_KEY = 'passkey_register_banner_dismissed';

// 게스트 → 서버 콜백을 거치는 인증 흐름(GitHub OAuth, 이메일 가입 인증)에서
// 마지막으로 본 새소식 id를 클라이언트가 redirect 직전에 잠시 옮겨두는 쿠키.
// 콜백이 user_news_reads 로 마이그레이션한 뒤 즉시 만료시킨다.
export const PENDING_NEWS_SEEN_COOKIE = 'trg-pending-news-seen';
export const PENDING_NEWS_SEEN_MAX_AGE_SECONDS = 60 * 60 * 24;
