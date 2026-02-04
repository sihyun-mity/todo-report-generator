'use client';

import type { RefObject } from 'react';
import { useEffect } from 'react';

export default function useOnClickOutside<T extends HTMLElement = HTMLElement>(
  ref: RefObject<T | null>,
  handler: (event: MouseEvent | TouchEvent) => void,
  elementId?: string,
): void {
  useEffect(() => {
    const listener = (event: MouseEvent | TouchEvent) => {
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
