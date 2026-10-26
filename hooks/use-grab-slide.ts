'use client';

import { useCallback } from 'react';

import styles from '@/hooks/use-grab-slide.module.scss';

// 이만큼 움직여야 끌기로 본다 — 그보다 작으면 평범한 클릭으로 둔다
const GRAB_SLIDE_THRESHOLD_PX = 10;

// 가로로 넘치는 줄을 마우스로 끌어 스크롤한다(터치는 브라우저 기본 스크롤을 그대로 쓴다).
// 끌었다 놓으면 그 클릭은 자식(칩 버튼 등)에 전달하지 않는다 — 넘기려다 칩이 실행되지 않게.
// 끌기 상태는 렌더와 무관하므로 state 가 아니라 ref 콜백 안의 지역 변수로 두고, 리스너는 ref 정리 함수(React 19)로 뗀다.
export function useGrabSlide() {
  const ref = useCallback((node: HTMLElement | null) => {
    if (!node) return;
    let isDown = false;
    let moved = false;
    let startX = 0;
    let startScrollLeft = 0;

    const onDown = (event: MouseEvent) => {
      if (event.button !== 0) return;
      isDown = true;
      moved = false;
      startX = event.pageX;
      startScrollLeft = node.scrollLeft;
    };
    // 줄 밖으로 나가도 끌기가 이어지도록 이동·놓기는 window 에서 받는다
    const onMove = (event: MouseEvent) => {
      if (!isDown) return;
      const walk = event.pageX - startX;
      if (!moved && Math.abs(walk) <= GRAB_SLIDE_THRESHOLD_PX) return;
      moved = true;
      event.preventDefault();
      node.scrollLeft = startScrollLeft - walk;
    };
    const onUp = () => {
      isDown = false;
    };
    // 캡처 단계에서 막아야 자식 버튼의 onClick 까지 내려가지 않는다
    const onClick = (event: MouseEvent) => {
      if (!moved) return;
      moved = false;
      event.preventDefault();
      event.stopPropagation();
    };
    // 링크·이미지의 기본 끌어 놓기가 끌기 스크롤을 가로채지 않게 한다
    const onDragStart = (event: DragEvent) => event.preventDefault();

    node.addEventListener('mousedown', onDown);
    node.addEventListener('click', onClick, true);
    node.addEventListener('dragstart', onDragStart);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      node.removeEventListener('mousedown', onDown);
      node.removeEventListener('click', onClick, true);
      node.removeEventListener('dragstart', onDragStart);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  return { ref, style: styles.container };
}
