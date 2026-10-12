// auth.sessions.user_agent / ip 는 GoTrue가 토큰 grant(로그인·리프레시) 요청의 헤더에서
// 추출해 매 grant마다 갱신한다. 토큰 리프레시가 서버(미들웨어·RSC)에서 일어나면 서버
// 런타임(node/undici)의 UA·IP가 기록돼 "로그인 기기 관리" 화면이 손상된 값을 보인다.
// 서버에서 만드는 Supabase 클라이언트에 원래 브라우저 요청의 UA·IP를 실어 GoTrue로
// 전달하기 위한 헬퍼 — createServerClient 옵션에 그대로 spread한다.

type ForwardedOption = { global?: { headers: Record<string, string> } };

export function forwardedHeadersOption(headers: Pick<Headers, 'get'>): ForwardedOption {
  const forwarded: Record<string, string> = {};

  const userAgent = headers.get('user-agent');
  if (userAgent) forwarded['User-Agent'] = userAgent;

  // Vercel이 세팅하는 x-real-ip가 신뢰 가능한 단일 클라이언트 IP다.
  // x-forwarded-for 맨 앞 값은 클라이언트가 위조해 끼워넣을 수 있어 폴백으로만 쓴다.
  const clientIp = headers.get('x-real-ip') ?? headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (clientIp) forwarded['X-Forwarded-For'] = clientIp;

  return Object.keys(forwarded).length > 0 ? { global: { headers: forwarded } } : {};
}
