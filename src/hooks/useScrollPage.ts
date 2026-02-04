'use client';

import { useRef, useState } from 'react';

export default function useScrollPage() {
  const element = useRef<HTMLDivElement | null>(null);
  const [page, setPage] = useState<number>(1);

  const initElement = (node: HTMLDivElement) => {
    if (element.current) {
      removeListener();
    }

    if (node) {
      element.current = node;
      addListener();
    }
  };

  const countScrollPage = () => {
    if (!element.current) {
      return;
    }

    setPage(+(element.current.scrollLeft / element.current.offsetWidth).toFixed(0) + 1);
  };

  const changePage = (v: number, options?: { behavior?: ScrollBehavior }) => {
    if (element.current) {
      element.current.scrollTo({
        left: element.current.offsetWidth * (v - 1),
        behavior: options?.behavior ?? 'smooth',
      });
    }
  };

  const addListener = () => {
    if (element.current) {
      element.current.addEventListener('scroll', countScrollPage);
      element.current.addEventListener('resize', countScrollPage);
    }
  };

  const removeListener = () => {
    if (element.current) {
      element.current.removeEventListener('scroll', countScrollPage);
      element.current.removeEventListener('resize', countScrollPage);
    }
  };

  return { ref: initElement, page, changePage };
}
