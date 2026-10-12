'use client';

import type { RefObject } from 'react';
import { useEffect } from 'react';

export function useOnClickOutside<T extends HTMLElement = HTMLElement>(
  ref: RefObject<T | null>,
  handler: (event: MouseEvent | TouchEvent) => void,
  elementId?: string
): void {
  useEffect(() => {
    const listener = (event: MouseEvent | TouchEvent) => {
      // 마우스 보조 버튼(가운데·오른쪽·뒤로·앞으로)으로 발생한 mouseup 은 바깥 클릭으로 보지 않는다.
      // 특히 게이밍 마우스의 뒤로가기 버튼(button 3)은 mouseup 직후 브라우저 history back 을
      // 일으키는데, 이를 바깥 클릭으로 처리하면 모달이 back 이 아닌 경로로 닫혀 stale sentinel 이
      // 남고, 이어서 실제 페이지가 뒤로 가버린다. 좌클릭(button 0)만 dismiss 트리거로 인정한다.
      if ('button' in event && event.button !== 0) return;

      const el = ref?.current;
      if (!el || el.contains(event.target as Node)) {
        return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } else if (event.target && (event.target as any).id === elementId) {
        return;
      }
      handler(event);
    };

    document.addEventListener('mouseup', listener);

    return () => {
      document.removeEventListener('mouseup', listener);
    };
  }, [ref, handler, elementId]);
}
