'use client';

import { useCallback, useRef, useState } from 'react';

import styles from './index.module.scss';

export default function useGrabSlide() {
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
    // eslint-disable-next-line react-hooks/preserve-manual-memoization
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
    [isDown],
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
