'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Toaster } from 'react-hot-toast';

// 화면 하단을 가리는 fixed 요소 셀렉터 — 토스트가 이 위로 떠야 한다
const BOTTOM_BLOCKING_SELECTORS: ReadonlyArray<string> = ['#report-mobile-copy-bar'];

// 차단 요소가 있을 때 그 위로 띄우는 여백 (px)
const BLOCKER_GAP_PX = 12;

// 차단 요소가 없을 때의 기본 토스트 bottom — safe-area 우선
const DEFAULT_BOTTOM = 'max(env(safe-area-inset-bottom), 2rem)';

const OBSERVED_ATTRIBUTE_FILTER: ReadonlyArray<string> = ['class', 'style', 'hidden'];

const getBottomBlockingElements = (): ReadonlyArray<HTMLElement> =>
  BOTTOM_BLOCKING_SELECTORS.map((selector) => document.querySelector(selector)).filter(
    (el): el is HTMLElement => el instanceof HTMLElement
  );

// 요소가 viewport 하단을 얼마나 가리는지(=요소 top부터 viewport 하단까지의 거리) 계산
const getViewportBottomCoverage = (element: HTMLElement) => {
  const rect = element.getBoundingClientRect();
  if (rect.height === 0 || rect.bottom <= 0 || rect.top >= window.innerHeight) return 0;
  return Math.max(0, window.innerHeight - rect.top);
};

export function ToasterProvider() {
  // null 이면 차단 요소 없음 → DEFAULT_BOTTOM 사용
  const [bottomOffsetPx, setBottomOffsetPx] = useState<number | null>(null);
  const observedElementsRef = useRef<ReadonlyArray<HTMLElement>>([]);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const updateRef = useRef<() => void>(() => {});
  const rafIdRef = useRef<number | null>(null);

  const updateBottomOffset = useCallback(() => {
    const elements = getBottomBlockingElements();
    const prev = observedElementsRef.current;
    const elementsChanged = prev.length !== elements.length || prev.some((p, i) => p !== elements[i]);

    if (elementsChanged) {
      resizeObserverRef.current?.disconnect();
      if (elements.length > 0) {
        resizeObserverRef.current = new ResizeObserver(() => updateRef.current());
        elements.forEach((el) => resizeObserverRef.current?.observe(el));
      }
      observedElementsRef.current = elements;
    }

    // 차단 요소가 없거나 모두 viewport를 실제로 가리지 않으면 (display:none 등) 기본 위치로
    const maxCoverage = elements.length === 0 ? 0 : Math.max(...elements.map(getViewportBottomCoverage));
    if (maxCoverage <= 0) {
      setBottomOffsetPx((prev) => (prev === null ? prev : null));
      return;
    }

    const next = maxCoverage + BLOCKER_GAP_PX;
    setBottomOffsetPx((prev) => (prev === next ? prev : next));
  }, []);

  // 잦은 DOM 변경에서도 1프레임 단위로 측정을 합쳐 과도한 연산/리렌더 방지
  const scheduleUpdate = useCallback(() => {
    if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      updateRef.current();
    });
  }, []);

  useEffect(() => {
    updateRef.current = updateBottomOffset;
  }, [updateBottomOffset]);

  useEffect(() => {
    scheduleUpdate();

    const mutationObserver = new MutationObserver(() => scheduleUpdate());
    mutationObserver.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [...OBSERVED_ATTRIBUTE_FILTER],
    });

    window.addEventListener('resize', scheduleUpdate);

    return () => {
      mutationObserver.disconnect();
      resizeObserverRef.current?.disconnect();
      if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
      window.removeEventListener('resize', scheduleUpdate);
    };
  }, [scheduleUpdate]);

  return (
    <Toaster
      position="bottom-center"
      reverseOrder={false}
      containerStyle={{
        bottom: bottomOffsetPx !== null ? `${bottomOffsetPx}px` : DEFAULT_BOTTOM,
        transition: 'bottom 150ms ease-out',
      }}
      toastOptions={{
        duration: 3000,
        style: {
          background: 'var(--toast-bg, #333)',
          color: 'var(--toast-color, #fff)',
          borderRadius: '10px',
          fontSize: '14px',
          border: '1px solid var(--toast-border, transparent)',
          // 데스크톱: 가능한 한 한 줄로 보이도록 넉넉히 / 모바일: 뷰포트 overflow 방지
          // 페이지 콘텐츠 최대폭(max-w-5xl = 64rem)을 넘지 않도록 720px 상한
          maxWidth: 'min(calc(100vw - 2rem), 720px)',
          width: 'fit-content',
        },
        success: {
          iconTheme: {
            primary: '#10B981',
            secondary: '#fff',
          },
        },
        error: {
          iconTheme: {
            primary: '#EF4444',
            secondary: '#fff',
          },
        },
      }}
    />
  );
}
