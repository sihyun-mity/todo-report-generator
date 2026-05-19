'use client';

import { useEffect, useState } from 'react';
import { waitForViewTransitionEnd } from '@/utils';

/**
 * controlled `open` 을 진행 중인 View Transition 이 끝날 때까지 지연시킨다.
 *
 * Why: 페이지 진입 effect 가 모달을 자동으로 여는 흐름에서, ViewTransition pseudo 스냅샷이
 * root 컨텐츠 위로 합성되는 동안 dim 이 깔리면 페이지가 dim 위로 잠깐 비쳐 보인다. 전환이
 * 끝난 뒤에 dim 이 올라오게 만들면 자연스럽다.
 *
 * 동작
 * - `open=false` → 즉시 false 를 돌려준다(닫기는 지연하지 않는다).
 * - `open=true`  → 진행 중인 view transition 애니메이션이 모두 끝난 뒤에야 true 가 된다.
 *
 * How to apply: 자동으로 열리는 모달의 controlled open 값을 이 hook 으로 한 번 통과시키면 된다.
 */
export function useDeferOpenDuringViewTransition(open: boolean): boolean {
  // open 이 false→true 로 바뀐 뒤, 진행 중이던 view transition 이 끝났는지.
  const [ready, setReady] = useState(false);
  // open 토글을 감지하기 위한 anchor. effect 안에서 setState 하지 않기 위해 렌더 중 비교한다.
  const [openAnchor, setOpenAnchor] = useState(open);

  if (openAnchor !== open) {
    // open 이 바뀌면 ready 를 리셋한다 — 다음 open 사이클이 다시 전환 종료를 기다리도록.
    setOpenAnchor(open);
    setReady(false);
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void waitForViewTransitionEnd().then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  return open && ready;
}
