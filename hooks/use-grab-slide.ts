'use client';

import { useCallback, useRef, useState } from 'react';

import styles from '@/hooks/use-grab-slide.module.scss';

/**
 * 마우스 드래그(grab + drag)로 가로 스크롤을 조작할 수 있게 해 주는 훅.
 *
 * - 마우스로 컨테이너를 누른 채 좌우로 끌면 스크롤이 이동한다.
 * - 드래그 거리가 10px 을 넘으면, 직후의 자식 노드 클릭 이벤트를 막아 "드래그 끝의 우발적 클릭" 을
 *   방지한다. 드래그 거리가 10px 이하라면 클릭이 정상 통과된다.
 * - 반환된 `ref` 는 ref 콜백으로, 노드가 바뀌면 자동으로 리스너를 재등록한다.
 * - `style` 은 `cursor: grab` 등 시각적 피드백을 주는 SCSS 모듈 클래스명이다.
 *
 * 터치 이벤트는 다루지 않으므로, 모바일/터치 디바이스에서는 브라우저 네이티브 스크롤이 그대로 동작한다.
 *
 * @returns `{ ref, style }`
 */
export function useGrabSlide() {
  const slider = useRef<HTMLDivElement | null>(null);
  const [isDown, setIsDown] = useState<boolean>(false);
  const startX = useRef<number>(0);
  const scrollLeft = useRef<number>(0);
  const style = styles.container;

  const initSlider = (node: HTMLDivElement) => {
    if (slider.current) {
      removeListener();
    }

    if (node) {
      slider.current = node;
      addListener();
    }
  };

  const preventEvent = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const onGrab = useCallback((e: MouseEvent) => {
    if (slider.current) {
      preventEvent(e);
      setIsDown(true);
      startX.current = e.pageX - slider.current.offsetLeft;
      scrollLeft.current = slider.current.scrollLeft;
    }
  }, []);

  const onSlideEnded = useCallback((e: MouseEvent) => {
    if (slider.current) {
      setIsDown(false);

      const endX = e.pageX - slider.current.offsetLeft;
      const childNodes = [...(slider.current?.childNodes || [])];
      const dragDiff = Math.abs(startX.current - endX);
      if (dragDiff > 10) {
        childNodes.forEach((child) => child.addEventListener('click', preventEvent));
      } else {
        childNodes.forEach((child) => child.removeEventListener('click', preventEvent));
      }
    }
  }, []);

  const onSlide = useCallback(
    (e: MouseEvent) => {
      if (!slider.current) return;

      preventEvent(e);
      if (!isDown) {
        return;
      }
      const x = e.pageX - slider.current.offsetLeft;
      const walk = x - startX.current;
      slider.current.scrollLeft = scrollLeft.current - walk;
    },
    [isDown]
  );

  const addListener = useCallback(() => {
    if (slider.current) {
      slider.current.addEventListener('mousedown', onGrab);
      slider.current.addEventListener('mouseleave', onSlideEnded);
      slider.current.addEventListener('mouseup', onSlideEnded);
      slider.current.addEventListener('mousemove', onSlide);
    }
  }, [onGrab, onSlide, onSlideEnded]);

  const removeListener = useCallback(() => {
    if (slider.current) {
      slider.current.removeEventListener('mousedown', onGrab);
      slider.current.removeEventListener('mouseleave', onSlideEnded);
      slider.current.removeEventListener('mouseup', onSlideEnded);
      slider.current.removeEventListener('mousemove', onSlide);
    }
  }, [onGrab, onSlide, onSlideEnded]);

  return { ref: initSlider, style };
}
