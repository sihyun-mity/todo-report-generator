'use client';

import { useEffect, useEffectEvent, useRef } from 'react';

/**
 * `signal` 이 새 값으로 바뀌었을 때만 `effect` 를 1회 실행한다. `null` 이면 대기 상태.
 *
 * 포커스 이동처럼 "신호가 올 때 한 번" 해야 하는 DOM 부수효과용.
 * Cache Components 에서는 페이지가 <Activity> 로 숨겨졌다가 다시 보일 때 effect 가 deps 와 무관하게
 * 재실행되는데, 신호 state 는 보존되므로 그대로 두면 마지막 포커스 대상이 재방문 때마다 다시 포커스된다
 * (모바일 키보드 노출·스크롤 점프). 마지막으로 처리한 신호를 ref 에 기억해(ref 는 숨김 동안 유지) 이를 막는다.
 */
export function useSignalEffect(signal: string | null, effect: () => void) {
  const appliedSignalRef = useRef<string | null>(null);
  const onSignal = useEffectEvent(effect);

  useEffect(() => {
    if (signal === null) {
      appliedSignalRef.current = null;
      return;
    }
    if (appliedSignalRef.current === signal) return;
    appliedSignalRef.current = signal;
    onSignal();
  }, [signal]);
}
