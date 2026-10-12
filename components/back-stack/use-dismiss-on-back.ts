'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { pushBackHandler } from '@/components/back-stack/back-stack';

type Options = {
  /** false 면 등록을 건너뛴다. 절대 back 으로 닫혀선 안 되는 모달용 escape hatch. 기본 true. */
  enabled?: boolean;
};

/**
 * SSR 안전 layout effect.
 * 모달이 paint 되는 시점에 sentinel 이 history 에 박혀 있어야, 모달의 첫 프레임에 사용자가
 * back 을 눌러도 닫기 핸들러가 등록돼 있다. useEffect 로 늦게 push 하면 첫 프레임 race 가 생긴다.
 */
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * 모달 / 다이얼로그 / 바텀시트가 사용하는 훅.
 *
 * - `open === true && enabled !== false` 동안 BackStack 에 onClose 핸들러를 등록한다.
 * - 브라우저 back(안드 하드웨어 back 포함)으로 sentinel 이 pop 되면 onClose 가 호출된다.
 * - X / 오버레이 클릭 등 컴포넌트 내부 close 트리거는 평소처럼 onClose 를 직접 호출하면 되며,
 *   외부에서 props.open 이 false 로 바뀌어 cleanup 이 발화되는 시점에 sentinel entry 가 자동 정리된다.
 */
export function useDismissOnBack(open: boolean, onClose: () => void, { enabled = true }: Readonly<Options> = {}): void {
  // 최신 onClose 를 popstate 콜백(effect 밖)에서 읽기 위한 ref. 렌더 중에는 접근하지 않고
  // 매 commit 후 effect 에서만 갱신해 React 19 의 `react-hooks/refs` 룰을 따른다.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useIsomorphicLayoutEffect(() => {
    if (!enabled || !open) return;
    return pushBackHandler(() => onCloseRef.current());
  }, [open, enabled]);
}
