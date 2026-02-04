'use client';

import { type RefObject, useCallback, useLayoutEffect } from 'react';
import { IS_SERVER } from 'swr/_internal';

interface Props {
  focusedRef: RefObject<HTMLElement | null>;
  parentRef: RefObject<HTMLElement | null>;
  scrollOffset?: number;
  initialScroll?: boolean;
}

export default function useFocusScroll({ focusedRef, parentRef, scrollOffset = 0, initialScroll }: Props) {
  const scroll = useCallback(
    (behavior?: ScrollBehavior) => {
      if (parentRef.current && focusedRef.current) {
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
          behavior: (behavior ?? moveOffset > document.documentElement.clientWidth) ? 'instant' : 'smooth',
        });
      }
    },
    [focusedRef, parentRef, scrollOffset],
  );

  useLayoutEffect(() => {
    if (!IS_SERVER && initialScroll) scroll();
  }, [initialScroll, scroll]);

  return { scroll };
}
