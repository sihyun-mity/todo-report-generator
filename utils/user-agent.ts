export type ParsedUserAgent = {
  browser: string;
  os: string;
};

// auth.sessions.user_agent 문자열을 사람이 읽을 수 있는 브라우저/OS 라벨로 환산한다.
// 외부 의존성 없이 대표적인 환경만 가볍게 식별한다 (정밀 분석이 목적이 아님).
export function parseUserAgent(ua: string | null | undefined): ParsedUserAgent {
  if (!ua) {
    return { browser: '알 수 없는 브라우저', os: '알 수 없는 기기' };
  }

  const os = (() => {
    if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
    if (/Android/i.test(ua)) return 'Android';
    if (/Windows NT/i.test(ua)) return 'Windows';
    if (/Mac OS X|Macintosh/i.test(ua)) return 'macOS';
    if (/CrOS/i.test(ua)) return 'ChromeOS';
    if (/Linux/i.test(ua)) return 'Linux';
    return '알 수 없는 기기';
  })();

  const browser = (() => {
    // Edge·Opera·Samsung은 UA에 Chrome 토큰도 함께 담으므로 먼저 검사한다.
    if (/Edg(?:A|iOS)?\//i.test(ua)) return 'Edge';
    if (/OPR\/|Opera/i.test(ua)) return 'Opera';
    if (/SamsungBrowser/i.test(ua)) return 'Samsung Internet';
    if (/Firefox\/|FxiOS\//i.test(ua)) return 'Firefox';
    if (/Chrome\/|CriOS\//i.test(ua)) return 'Chrome';
    if (/Safari\//i.test(ua)) return 'Safari';
    return '알 수 없는 브라우저';
  })();

  return { browser, os };
}

// iOS·Android 등 모바일 OS 여부 (기기 아이콘 분기에 사용)
export function isMobileOs(os: string): boolean {
  return os === 'iOS' || os === 'Android';
}
