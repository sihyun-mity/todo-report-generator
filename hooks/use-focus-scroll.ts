'use client';

import { type RefObject, useCallback, useLayoutEffect, useRef } from 'react';

const IS_SERVER = typeof window === 'undefined';

type Props = {
  focusedRef: RefObject<HTMLElement | null>;
  parentRef: RefObject<HTMLElement | null>;
  scrollOffset?: number;
  initialScroll?: boolean;
};

export function useFocusScroll({ focusedRef, parentRef, scrollOffset = 0, initialScroll }: Readonly<Props>) {
  // 첫 정렬(뒤쪽 항목이 선택된 채 진입 등)은 애니메이션 없이 즉시 — smooth 는 항목 간 이동에서만.
  const hasAlignedRef = useRef(false);

  const scroll = useCallback(
    (behavior?: ScrollBehavior) => {
      if (parentRef.current && focusedRef.current) {
        const isFirstAlign = !hasAlignedRef.current;
        hasAlignedRef.current = true;
        const startPadding = parseInt(getComputedStyle(parentRef.current).paddingLeft);
        const parentRect = parentRef.current.getBoundingClientRect();
        const targetRect = focusedRef.current.getBoundingClientRect();
        const targetPosition = targetRect.left - parentRect.left + parentRef.current.scrollLeft;

        // 첫번째 노드 예외 처리
        if (startPadding === targetPosition && parentRef.current.scrollLeft === 0) return;

        const targetOffset = targetPosition - scrollOffset;
        const currentOffset = parentRef.current.scrollLeft;
        const moveOffset = Math.abs(targetOffset - currentOffset);

        parentRef.current.scrollTo({
          left: targetOffset,
          behavior: isFirstAlign
            ? 'instant'
            : (behavior ?? (moveOffset > document.documentElement.clientWidth ? 'instant' : 'smooth')),
        });
      }
    },
    [focusedRef, parentRef, scrollOffset]
  );

  useLayoutEffect(() => {
    if (!IS_SERVER && initialScroll) scroll();
  }, [initialScroll, scroll]);

  return { scroll };
}
