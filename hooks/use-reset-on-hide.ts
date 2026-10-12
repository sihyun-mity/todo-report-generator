'use client';

import { useEffectEvent, useLayoutEffect } from 'react';

/**
 * 컴포넌트가 화면에서 사라질 때(unmount 또는 Cache Components 의 <Activity> 숨김) `reset` 을 실행한다.
 *
 * Cache Components 에서는 다른 라우트로 이동해도 이전 페이지가 언마운트되지 않고 state 가 보존된다.
 * 열려 있던 팝오버·다이얼로그, 일시적인 오류 문구처럼 "다시 돌아왔을 때 남아 있으면 안 되는" state 를
 * 여기서 초기화한다. useLayoutEffect cleanup 은 숨김 직전에 동기 실행돼 stale state 가 비치지 않는다.
 * (작성 중인 입력처럼 보존이 이득인 state 는 넣지 않는다)
 */
export function useResetOnHide(reset: () => void) {
  const onHide = useEffectEvent(reset);
  useLayoutEffect(() => () => onHide(), []);
}
