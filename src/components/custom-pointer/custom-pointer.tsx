'use client';

import { useEffect, useRef } from 'react';
import {
  CUSTOM_POINTER_ACTIVE_CLASS,
  CUSTOM_POINTER_CARET_WIDTH,
  CUSTOM_POINTER_CLICK_RECHECK_MS,
  CUSTOM_POINTER_DOT_SIZE,
  CUSTOM_POINTER_ELEMENT_ID,
  CUSTOM_POINTER_PARALLAX_MAX,
  CUSTOM_POINTER_SCROLL_IDLE_MS,
  CUSTOM_POINTER_SNAP_PADDING,
  CUSTOM_POINTER_SNAP_SELECTOR,
  CUSTOM_POINTER_TEXT_SELECTOR,
  CUSTOM_POINTER_TOUCH_SUPPRESS_MS,
} from '@/constants';

type PointerMode = 'dot' | 'snap' | 'caret';

type PointerShape = {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
  scale: number;
  opacity: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

/** '50%' 같은 % 반지름도 px 로 환산해 하이라이트 radius 를 요소 모양과 맞춘다 */
function resolveRadius(target: HTMLElement, width: number): number {
  const raw = window.getComputedStyle(target).borderTopLeftRadius;
  const value = Number.parseFloat(raw);
  if (Number.isNaN(value)) return 0;
  return raw.endsWith('%') ? (value / 100) * width : value;
}

/**
 * iPadOS(26 이전) 트랙패드 스타일 커스텀 포인터.
 *
 * - 평소: 커서를 따라다니는 반투명 원형 도트
 * - 인터랙션 요소 위: 요소를 감싸는 라운드 하이라이트로 변형 + 커서 방향으로 살짝 끌려가는 시차 효과
 * - 텍스트 입력 위: I-beam 캐럿 바
 * - 터치: iPadOS 처럼 화면을 만지는 순간 즉시 사라진다 — 하이브리드 기기나
 *   터치를 'mouse' 로 잘못 보고하는 브라우저에서도 touch 이벤트 기반으로 확실히 해제
 *
 * `(hover: hover) and (pointer: fine)` 환경에서만 활성화되며, 활성화 시 `<html>` 에
 * CUSTOM_POINTER_ACTIVE_CLASS 를 붙여 네이티브 커서를 숨긴다(스타일은 custom-pointer.css).
 * 매 프레임 상태는 리렌더 없이 DOM style 에 직접 쓴다 — pointermove 마다 setState 하지 않는다.
 */
export function CustomPointer() {
  const pointerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const pointer = pointerRef.current;
    if (!pointer) return;

    const finePointerMedia = window.matchMedia('(hover: hover) and (pointer: fine)');
    const reduceMotionMedia = window.matchMedia('(prefers-reduced-motion: reduce)');

    let rafId = 0;
    let active = false;
    let visible = false;
    let pressed = false;
    let mode: PointerMode = 'dot';
    let lastAppliedMode: PointerMode | null = null;
    let snapTarget: HTMLElement | null = null;
    let caretHeight = CUSTOM_POINTER_DOT_SIZE;
    let mouseX = -1000;
    let mouseY = -1000;
    let recheckUntil = 0;
    // 터치 세션 중(Infinity)·직후엔 pointerType 'mouse' 이벤트도 터치로 간주해 무시한다
    let touchSuppressUntil = 0;
    let scrolling = false;
    let scrollIdleTimer = 0;

    const shape: PointerShape = {
      x: -1000,
      y: -1000,
      width: CUSTOM_POINTER_DOT_SIZE,
      height: CUSTOM_POINTER_DOT_SIZE,
      radius: CUSTOM_POINTER_DOT_SIZE / 2,
      scale: 1,
      opacity: 0,
    };

    const retarget = (node: EventTarget | null) => {
      // 스크롤 중에는 항상 기본 도트 모양을 유지한다 — 인터랙션 영역이 커서를
      // 지나갈 때마다 하이라이트가 변하지 않게, 재판정은 스크롤이 멎은 뒤에만 한다
      if (scrolling) {
        mode = 'dot';
        snapTarget = null;
        return;
      }

      const element = node instanceof Element ? node : null;

      const caret = element?.closest<HTMLElement>(CUSTOM_POINTER_TEXT_SELECTOR) ?? null;
      if (caret && !caret.matches(':disabled, [aria-disabled="true"]')) {
        mode = 'caret';
        snapTarget = null;
        const fontSize = Number.parseFloat(window.getComputedStyle(caret).fontSize);
        caretHeight = Math.max(Number.isNaN(fontSize) ? 0 : fontSize * 1.5, CUSTOM_POINTER_DOT_SIZE);
        return;
      }

      const snap = element?.closest<HTMLElement>(CUSTOM_POINTER_SNAP_SELECTOR) ?? null;
      if (snap && !snap.matches(':disabled, [aria-disabled="true"]')) {
        const rect = snap.getBoundingClientRect();
        // 화면 대부분을 덮는 큰 클릭 영역은 하이라이트가 과해서 도트로 둔다
        const oversized = rect.width > window.innerWidth * 0.9 || rect.height > window.innerHeight * 0.5;
        if (!oversized) {
          mode = 'snap';
          snapTarget = snap;
          return;
        }
      }

      mode = 'dot';
      snapTarget = null;
    };

    /** 목표 상태 계산 → lerp → DOM 반영. 목표에 도달했으면 true */
    const applyFrame = (): boolean => {
      // 클릭이 일으킨 DOM 변경은 이벤트 이후에 커밋되므로, 클릭 직후 잠시 매 프레임 재판정한다
      if (recheckUntil !== 0) {
        if (visible && performance.now() <= recheckUntil) {
          retarget(document.elementFromPoint(mouseX, mouseY));
        } else {
          recheckUntil = 0;
        }
      }

      if (mode === 'snap' && snapTarget) {
        // 스냅 대상이 DOM 에서 사라졌거나(다이얼로그 닫힘 등) 레이아웃 변화로 커서가
        // 대상 밖으로 벗어났으면(목록에 행 추가로 밀림 등) 현재 좌표로 다시 히트 테스트
        const rect = snapTarget.getBoundingClientRect();
        const stale =
          !snapTarget.isConnected ||
          mouseX < rect.left ||
          mouseX > rect.right ||
          mouseY < rect.top ||
          mouseY > rect.bottom;
        if (stale) {
          retarget(document.elementFromPoint(mouseX, mouseY));
        }
      }

      let goalX = mouseX;
      let goalY = mouseY;
      let goalWidth = CUSTOM_POINTER_DOT_SIZE;
      let goalHeight = CUSTOM_POINTER_DOT_SIZE;
      let goalRadius = CUSTOM_POINTER_DOT_SIZE / 2;

      if (mode === 'snap' && snapTarget) {
        const rect = snapTarget.getBoundingClientRect();
        goalWidth = rect.width + CUSTOM_POINTER_SNAP_PADDING * 2;
        goalHeight = rect.height + CUSTOM_POINTER_SNAP_PADDING * 2;
        // 커서가 요소 안에서 움직이면 하이라이트가 커서 쪽으로 살짝 끌려간다
        const pullX = clamp((mouseX - (rect.left + rect.width / 2)) / Math.max(rect.width / 2, 1), -1, 1);
        const pullY = clamp((mouseY - (rect.top + rect.height / 2)) / Math.max(rect.height / 2, 1), -1, 1);
        goalX = rect.left + rect.width / 2 + pullX * CUSTOM_POINTER_PARALLAX_MAX;
        goalY = rect.top + rect.height / 2 + pullY * CUSTOM_POINTER_PARALLAX_MAX;
        goalRadius = clamp(resolveRadius(snapTarget, rect.width) + CUSTOM_POINTER_SNAP_PADDING, 4, goalHeight / 2);
      } else if (mode === 'caret') {
        goalWidth = CUSTOM_POINTER_CARET_WIDTH;
        goalHeight = caretHeight;
        goalRadius = CUSTOM_POINTER_CARET_WIDTH / 2;
      }

      const goalScale = pressed ? (mode === 'snap' ? 0.97 : 0.85) : 1;
      const goalOpacity = visible ? 1 : 0;

      const instant = reduceMotionMedia.matches;
      const positionT = instant ? 1 : 0.32;
      const shapeT = instant ? 1 : 0.24;

      shape.x = lerp(shape.x, goalX, positionT);
      shape.y = lerp(shape.y, goalY, positionT);
      shape.width = lerp(shape.width, goalWidth, shapeT);
      shape.height = lerp(shape.height, goalHeight, shapeT);
      shape.radius = lerp(shape.radius, goalRadius, shapeT);
      shape.scale = lerp(shape.scale, goalScale, shapeT);
      shape.opacity = lerp(shape.opacity, goalOpacity, instant ? 1 : 0.25);

      if (lastAppliedMode !== mode) {
        lastAppliedMode = mode;
        pointer.dataset.mode = mode;
      }

      pointer.style.width = `${shape.width}px`;
      pointer.style.height = `${shape.height}px`;
      pointer.style.borderRadius = `${shape.radius}px`;
      pointer.style.opacity = `${shape.opacity}`;
      pointer.style.transform = `translate3d(${shape.x - shape.width / 2}px, ${shape.y - shape.height / 2}px, 0) scale(${shape.scale})`;

      return (
        Math.abs(shape.x - goalX) < 0.3 &&
        Math.abs(shape.y - goalY) < 0.3 &&
        Math.abs(shape.width - goalWidth) < 0.3 &&
        Math.abs(shape.height - goalHeight) < 0.3 &&
        Math.abs(shape.scale - goalScale) < 0.005 &&
        Math.abs(shape.opacity - goalOpacity) < 0.01
      );
    };

    const tick = () => {
      const settled = applyFrame();
      // 스냅 중엔 스크롤·레이아웃 변화로 rect 가 계속 움직일 수 있어 루프를 유지하고,
      // 클릭 직후 재판정 구간에도 DOM 커밋을 기다리며 루프를 유지한다
      if (!settled || recheckUntil !== 0 || (mode === 'snap' && visible)) {
        rafId = window.requestAnimationFrame(tick);
      } else {
        rafId = 0;
      }
    };

    const schedule = () => {
      if (rafId === 0 && active) {
        rafId = window.requestAnimationFrame(tick);
      }
    };

    const hide = () => {
      visible = false;
      pressed = false;
      // 숨는 시점에 스냅/캐럿 상태를 완전히 해제해 하이라이트가 잔류하지 않게 한다
      mode = 'dot';
      snapTarget = null;
      recheckUntil = 0;
      schedule();
    };

    // 터치 입력 감지 시 — iPadOS 처럼 화면을 만지는 순간 포인터는 페이드 없이 즉시 사라진다
    const hideForTouch = () => {
      hide();
      shape.opacity = 0;
      pointer.style.opacity = '0';
    };

    const isTouchLike = (event: PointerEvent) =>
      event.pointerType !== 'mouse' || performance.now() < touchSuppressUntil;

    const handlePointerMove = (event: PointerEvent) => {
      if (isTouchLike(event)) {
        hideForTouch();
        return;
      }
      mouseX = event.clientX;
      mouseY = event.clientY;
      if (!visible) {
        visible = true;
        // 완전히 사라진 상태에서 다시 나타날 땐 화면을 가로질러 날아오지 않도록 즉시 이동
        if (shape.opacity < 0.05) {
          shape.x = mouseX;
          shape.y = mouseY;
        }
      }
      retarget(event.target);
      schedule();
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (isTouchLike(event)) {
        hideForTouch();
        return;
      }
      pressed = true;
      mouseX = event.clientX;
      mouseY = event.clientY;
      retarget(event.target);
      schedule();
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (isTouchLike(event)) {
        hideForTouch();
        return;
      }
      pressed = false;
      // 클릭 완료 — 결과로 DOM 이 바뀔 수 있으니 커서 아래 요소를 다시 판정한다
      recheckUntil = performance.now() + CUSTOM_POINTER_CLICK_RECHECK_MS;
      schedule();
    };

    // 일부 안드로이드 브라우저(인앱 웹뷰·DeX 등)는 터치를 pointerType 'mouse' 로 보고해
    // pointer 이벤트의 타입 검사를 통과한다. touch 이벤트는 실제 터치에서만 발생하므로
    // 이를 직접 구독해 어떤 기기에서든 터치 시작 즉시 하이라이트를 해제하고,
    // 터치 세션이 끝난 뒤에도 잠시 mouse 포인터 이벤트를 무시한다(잘못 보고된 잔여 이벤트 차단).
    const handleTouchStart = () => {
      touchSuppressUntil = Number.POSITIVE_INFINITY;
      hideForTouch();
    };

    const handleTouchEnd = (event: TouchEvent) => {
      if (event.touches.length > 0) return;
      touchSuppressUntil = performance.now() + CUSTOM_POINTER_TOUCH_SUPPRESS_MS;
    };

    const handleScroll = () => {
      if (!visible) return;
      // 스크롤 중에는 기본 도트로 고정하고, 멎은 뒤에 커서 아래 요소를 다시 히트 테스트
      scrolling = true;
      mode = 'dot';
      snapTarget = null;
      window.clearTimeout(scrollIdleTimer);
      scrollIdleTimer = window.setTimeout(() => {
        scrolling = false;
        if (!visible) return;
        retarget(document.elementFromPoint(mouseX, mouseY));
        schedule();
      }, CUSTOM_POINTER_SCROLL_IDLE_MS);
      schedule();
    };

    const enable = () => {
      if (active) return;
      active = true;
      document.documentElement.classList.add(CUSTOM_POINTER_ACTIVE_CLASS);
      window.addEventListener('pointermove', handlePointerMove, { passive: true });
      // capture: stopPropagation 하는 위젯 안에서도 눌림/이탈 상태를 놓치지 않는다
      window.addEventListener('pointerdown', handlePointerDown, true);
      window.addEventListener('pointerup', handlePointerUp, true);
      window.addEventListener('pointercancel', handlePointerUp, true);
      window.addEventListener('touchstart', handleTouchStart, { capture: true, passive: true });
      window.addEventListener('touchend', handleTouchEnd, { capture: true, passive: true });
      window.addEventListener('touchcancel', handleTouchEnd, { capture: true, passive: true });
      // 네이티브 드래그 중엔 OS 드래그 커서가 표시되므로 커스텀 포인터를 숨긴다
      window.addEventListener('dragstart', hide, true);
      window.addEventListener('blur', hide);
      document.documentElement.addEventListener('pointerleave', hide);
      window.addEventListener('scroll', handleScroll, { capture: true, passive: true });
      window.addEventListener('resize', handleScroll);
    };

    const disable = () => {
      if (!active) return;
      active = false;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('pointerup', handlePointerUp, true);
      window.removeEventListener('pointercancel', handlePointerUp, true);
      window.removeEventListener('touchstart', handleTouchStart, true);
      window.removeEventListener('touchend', handleTouchEnd, true);
      window.removeEventListener('touchcancel', handleTouchEnd, true);
      window.removeEventListener('dragstart', hide, true);
      window.removeEventListener('blur', hide);
      document.documentElement.removeEventListener('pointerleave', hide);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleScroll);
      window.cancelAnimationFrame(rafId);
      rafId = 0;
      window.clearTimeout(scrollIdleTimer);
      scrolling = false;
      visible = false;
      pressed = false;
      // 터치 도중 비활성화되면 touchend 를 못 받으므로, 억제 상태가 Infinity 로 굳지 않게 리셋
      touchSuppressUntil = 0;
      shape.opacity = 0;
      pointer.style.opacity = '0';
      document.documentElement.classList.remove(CUSTOM_POINTER_ACTIVE_CLASS);
    };

    const handleFinePointerChange = () => {
      if (finePointerMedia.matches) {
        enable();
      } else {
        disable();
      }
    };

    handleFinePointerChange();
    finePointerMedia.addEventListener('change', handleFinePointerChange);

    return () => {
      finePointerMedia.removeEventListener('change', handleFinePointerChange);
      disable();
    };
  }, []);

  return <div ref={pointerRef} id={CUSTOM_POINTER_ELEMENT_ID} aria-hidden="true" />;
}
