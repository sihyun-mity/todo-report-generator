'use client';

import { useEffect } from 'react';
import {
  PRESS_FEEDBACK_EMPTY_SHADOW,
  PRESS_FEEDBACK_IGNORE_ATTRIBUTE_SELECTOR,
  PRESS_FEEDBACK_IGNORE_SELECTOR,
  PRESS_FEEDBACK_INSET,
  PRESS_FEEDBACK_MAX_SCALE,
  PRESS_FEEDBACK_MIN_SCALE,
  PRESS_FEEDBACK_RELEASE_MS,
  PRESS_FEEDBACK_SCALE_VARIABLE,
  PRESS_FEEDBACK_SELECTOR,
  PRESS_FEEDBACK_SHADOW_VARIABLE,
  PRESS_FEEDBACK_STATE_ATTRIBUTE,
  PRESS_FEEDBACK_STATE_OFF,
  PRESS_FEEDBACK_STATE_ON,
  PRESS_FEEDBACK_WATCHDOG_MS,
} from '@/constants';

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** 눌림 대상을 찾는다 — 중첩된 경우 가장 안쪽 요소가 잡힌다 */
function findPressTarget(node: EventTarget | null): HTMLElement | null {
  const element = node instanceof Element ? node : null;
  const candidate = element?.closest<HTMLElement>(PRESS_FEEDBACK_SELECTOR) ?? null;
  if (!candidate) return null;
  if (candidate.matches(PRESS_FEEDBACK_IGNORE_SELECTOR)) return null;
  // 자기 자신이든 조상이든 옵트아웃이 걸려 있으면 제외
  if (candidate.closest(PRESS_FEEDBACK_IGNORE_ATTRIBUTE_SELECTOR)) return null;
  return candidate;
}

/**
 * 요소 크기에 맞춘 축소 배율. 각 변이 대략 PRESS_FEEDBACK_INSET 만큼 들어가 보이도록 환산하고
 * 상·하한으로 자른다 — 큰 카드는 은은하게, 작은 버튼은 또렷하게 눌린다.
 * 인라인 요소(문단 안의 링크 등)는 변환이 적용되지 않으므로 축소를 포기하고 색상 강조만 남긴다.
 */
function resolvePressScale(target: HTMLElement, rect: DOMRect): number {
  if (window.getComputedStyle(target).display === 'inline') return 1;
  const longest = Math.max(rect.width, rect.height);
  if (longest <= 0) return 1;
  return clamp(1 - (PRESS_FEEDBACK_INSET * 2) / longest, PRESS_FEEDBACK_MIN_SCALE, PRESS_FEEDBACK_MAX_SCALE);
}

/**
 * 모바일 시스템 앱 스타일 눌림(press) 피드백.
 *
 * - 터치/클릭 시작: 대상 요소가 살짝 안으로 들어가고(scale) 색상 강조가 얹힌다
 * - 누른 채 대상 밖으로 벗어나면 강조 해제, 다시 들어오면 복귀 (네이티브와 동일한 동작)
 * - 스크롤 · pointercancel · 컨텍스트 메뉴 · 창 이탈: 즉시 해제
 * - 터치/클릭 완료: 해제
 *
 * 커서 하이라이트(`CustomPointer`)와 달리 포인터가 아니라 **요소 자체**를 변형하므로
 * 두 효과는 겹치지 않으며, 모바일 전용 연출이지만 데스크탑 마우스에서도 그대로 동작한다.
 * 스타일 정의는 `src/styles/press-feedback.css` 한 곳에 모여 있다.
 * 리렌더 없이 DOM 속성만 토글한다 — 포인터 이벤트마다 setState 하지 않는다.
 */
export function PressFeedback() {
  useEffect(() => {
    /** 현재 누르고 있는 대상 */
    let pressed: HTMLElement | null = null;
    /** 해제 전환이 재생 중인 대상들 → 전환이 끝나면 속성을 뗀다 (다른 요소 연타 시 겹칠 수 있어 Map) */
    const releaseTimers = new Map<HTMLElement, number>();
    let watchdogTimer = 0;
    let pointerId: number | null = null;
    /** 포인터가 대상 영역 안에 있는지 — 벗어나면 강조를 끄되 추적은 유지한다 */
    let inside = false;

    const cleanUp = (element: HTMLElement) => {
      element.removeAttribute(PRESS_FEEDBACK_STATE_ATTRIBUTE);
      element.style.removeProperty(PRESS_FEEDBACK_SCALE_VARIABLE);
      element.style.removeProperty(PRESS_FEEDBACK_SHADOW_VARIABLE);
      // 우리가 넣은 커스텀 프로퍼티만 있던 요소에 빈 style 속성이 남지 않게
      if (element.getAttribute('style') === '') element.removeAttribute('style');
    };

    /**
     * 요소 본래의 box-shadow 를 보관해 강조 그림자 뒤에 이어 붙일 수 있게 한다.
     * 이미 보관돼 있으면(해제 전환 중 다시 누른 경우) 다시 읽지 않는다 —
     * 그 시점의 계산값에는 우리가 얹은 강조 그림자가 이미 섞여 있어 중첩된다.
     */
    const captureOwnShadow = (element: HTMLElement) => {
      if (element.style.getPropertyValue(PRESS_FEEDBACK_SHADOW_VARIABLE)) return;
      const own = window.getComputedStyle(element).boxShadow;
      element.style.setProperty(
        PRESS_FEEDBACK_SHADOW_VARIABLE,
        own && own !== 'none' ? own : PRESS_FEEDBACK_EMPTY_SHADOW
      );
    };

    /** 해제 전환 대기열에서 빼낸다. finalize=true 면 속성까지 제거 */
    const stopReleasing = (element: HTMLElement, finalize: boolean) => {
      const timer = releaseTimers.get(element);
      if (timer === undefined) return;
      window.clearTimeout(timer);
      releaseTimers.delete(element);
      if (finalize) cleanUp(element);
    };

    const release = () => {
      window.clearInterval(watchdogTimer);
      watchdogTimer = 0;
      pointerId = null;
      inside = false;

      const element = pressed;
      pressed = null;
      if (!element) return;

      stopReleasing(element, false);
      element.setAttribute(PRESS_FEEDBACK_STATE_ATTRIBUTE, PRESS_FEEDBACK_STATE_OFF);
      releaseTimers.set(
        element,
        window.setTimeout(() => stopReleasing(element, true), PRESS_FEEDBACK_RELEASE_MS)
      );
    };

    const setInside = (next: boolean) => {
      if (!pressed || inside === next) return;
      inside = next;
      pressed.setAttribute(PRESS_FEEDBACK_STATE_ATTRIBUTE, next ? PRESS_FEEDBACK_STATE_ON : PRESS_FEEDBACK_STATE_OFF);
    };

    const handlePointerDown = (event: PointerEvent) => {
      // 멀티터치·연타 — 직전 대상을 먼저 해제하고 새 대상으로 넘어간다
      release();
      // 마우스는 주 버튼만 (보조 버튼은 컨텍스트 메뉴 등)
      if (event.pointerType === 'mouse' && event.button !== 0) return;

      const target = findPressTarget(event.target);
      if (!target) return;

      const rect = target.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      // 화면을 거의 다 덮는 영역은 눌림 효과가 과해서 제외한다
      if (rect.height > window.innerHeight * 0.7 && rect.width > window.innerWidth * 0.9) return;

      // 방금 뗀 요소를 다시 눌렀다면 되돌아가던 전환을 취소하고 곧바로 이어받는다
      stopReleasing(target, false);

      pressed = target;
      pointerId = event.pointerId;
      inside = true;
      // 계산값 읽기(captureOwnShadow)는 반드시 상태 속성을 붙이기 전에
      captureOwnShadow(target);
      target.style.setProperty(PRESS_FEEDBACK_SCALE_VARIABLE, `${resolvePressScale(target, rect)}`);
      target.setAttribute(PRESS_FEEDBACK_STATE_ATTRIBUTE, PRESS_FEEDBACK_STATE_ON);

      // 클릭으로 대상이 사라지면(다이얼로그 닫기 버튼 등) pointerup 이 창까지 올라오지 않는다
      watchdogTimer = window.setInterval(() => {
        if (!pressed?.isConnected) release();
      }, PRESS_FEEDBACK_WATCHDOG_MS);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!pressed || event.pointerId !== pointerId) return;
      const rect = pressed.getBoundingClientRect();
      setInside(
        event.clientX >= rect.left &&
          event.clientX <= rect.right &&
          event.clientY >= rect.top &&
          event.clientY <= rect.bottom
      );
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (pointerId !== null && event.pointerId !== pointerId) return;
      release();
    };

    // 스크롤이 시작되면 탭이 아니라 스크롤 제스처이므로 네이티브처럼 강조를 거둔다
    const handleRelease = () => release();

    // capture: stopPropagation 하는 위젯 안에서도 눌림/해제를 놓치지 않는다
    window.addEventListener('pointerdown', handlePointerDown, { capture: true, passive: true });
    window.addEventListener('pointermove', handlePointerMove, { capture: true, passive: true });
    window.addEventListener('pointerup', handlePointerUp, { capture: true, passive: true });
    window.addEventListener('pointercancel', handlePointerUp, { capture: true, passive: true });
    window.addEventListener('scroll', handleRelease, { capture: true, passive: true });
    window.addEventListener('contextmenu', handleRelease, true);
    window.addEventListener('dragstart', handleRelease, true);
    window.addEventListener('blur', handleRelease);
    document.addEventListener('visibilitychange', handleRelease);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('pointermove', handlePointerMove, true);
      window.removeEventListener('pointerup', handlePointerUp, true);
      window.removeEventListener('pointercancel', handlePointerUp, true);
      window.removeEventListener('scroll', handleRelease, true);
      window.removeEventListener('contextmenu', handleRelease, true);
      window.removeEventListener('dragstart', handleRelease, true);
      window.removeEventListener('blur', handleRelease);
      document.removeEventListener('visibilitychange', handleRelease);
      window.clearInterval(watchdogTimer);
      // 언마운트 시 눌린 채/되돌아가던 중 남은 속성까지 확실히 회수한다
      if (pressed) cleanUp(pressed);
      pressed = null;
      for (const element of [...releaseTimers.keys()]) stopReleasing(element, true);
    };
  }, []);

  return null;
}
