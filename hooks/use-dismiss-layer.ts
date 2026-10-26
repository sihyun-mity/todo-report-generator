'use client';

import type { RefObject } from 'react';
import { useEffect, useRef } from 'react';

type Options = {
  /** 열려 있는 동안만 true 로 둔다. 닫힌 메뉴가 층으로 남으면 맨 위 자리를 차지해 아래 창의 닫기를 가로챈다. 기본 true. */
  enabled?: boolean;
  /** 바깥 클릭으로 닫을지. false 여도 층은 차지해 바깥 클릭이 아래 창까지 내려가지 않는다. 기본 true. */
  outsideClick?: boolean;
  /** Esc 로 닫을지. false 여도 층은 차지해 Esc 가 아래 창까지 내려가지 않는다. 기본 true. */
  escape?: boolean;
};

type Layer = {
  readonly ref: RefObject<HTMLElement | null>;
  readonly onDismiss: RefObject<() => void>;
  readonly options: RefObject<Required<Omit<Options, 'enabled'>>>;
};

// 열린 순서대로 쌓인 닫기 층(모달·다이얼로그·팝오버·드롭다운). 바깥 클릭·Esc 한 번에 **맨 위 층 하나만** 닫는다 —
// 모달 안 팝오버가 열린 채 모달 밖을 누르거나 Esc 를 누르면 팝오버만 닫히고 모달은 남는다(back 키의 BackStack 과 같은 규칙).
const layers: Array<Layer> = [];
// 바깥 클릭은 누른 곳과 뗀 곳이 모두 그 층 바깥일 때만 인정한다 — 창 안에서 텍스트를 드래그하다 밖에서 놓아도 닫히지 않게.
let pressedOutside: Layer | null = null;

const isOutside = (layer: Layer, target: EventTarget | null) => {
  const el = layer.ref.current;
  return !!el && !el.contains(target as Node);
};

// 마우스 보조 버튼(가운데·오른쪽·뒤로·앞으로)은 바깥 클릭으로 보지 않는다. 특히 게이밍 마우스의 뒤로가기 버튼(button 3)은
// mouseup 직후 브라우저 history back 을 일으키는데, 이를 바깥 클릭으로 처리하면 모달이 back 이 아닌 경로로 닫혀 stale
// sentinel 이 남고, 이어서 실제 페이지가 뒤로 가버린다. 좌클릭(button 0)만 dismiss 트리거로 인정한다.
const onMouseDown = (event: MouseEvent) => {
  const top = layers.at(-1);
  pressedOutside = event.button === 0 && top && isOutside(top, event.target) ? top : null;
};

const onMouseUp = (event: MouseEvent) => {
  const top = layers.at(-1);
  const pressed = pressedOutside;
  pressedOutside = null;
  if (event.button !== 0 || !top || pressed !== top || !isOutside(top, event.target)) return;
  if (top.options.current.outsideClick) top.onDismiss.current();
};

// 캡처 단계에서 받아 맨 위 층만 닫고 전파를 멈춘다 — 아래 창이나 다른 Esc 리스너가 같은 키로 함께 닫히지 않게.
// 한글 조합 중 Esc 는 조합 취소이므로 넘긴다.
const onKeyDown = (event: KeyboardEvent) => {
  if (event.key !== 'Escape' || event.isComposing || event.keyCode === 229) return;
  const top = layers.at(-1);
  if (!top) return;
  event.stopPropagation();
  if (top.options.current.escape) top.onDismiss.current();
};

const listen = (on: boolean) => {
  if (on) {
    document.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('mouseup', onMouseUp, true);
    document.addEventListener('keydown', onKeyDown, true);
  } else {
    document.removeEventListener('mousedown', onMouseDown, true);
    document.removeEventListener('mouseup', onMouseUp, true);
    document.removeEventListener('keydown', onKeyDown, true);
  }
};

/**
 * 바깥 클릭·Esc 로 닫히는 창(모달·다이얼로그·팝오버·드롭다운)을 닫기 층에 올린다. `ref` 는 창 본문(바깥 판정 기준)이다.
 * 열린 순서대로 쌓아 맨 위 층 하나에만 닫기를 전달한다. 배경 `onClick` 이나 개별 `keydown` 리스너로 닫지 말 것 —
 * 층을 거치지 않으면 겹친 창이 함께 닫힌다. 브라우저 back 은 `useDismissOnBack` 이 따로 맡는다.
 */
export function useDismissLayer<T extends HTMLElement = HTMLElement>(
  ref: RefObject<T | null>,
  onDismiss: () => void,
  { enabled = true, outsideClick = true, escape = true }: Readonly<Options> = {}
): void {
  // 최신 값을 리스너(effect 밖)에서 읽기 위한 ref — 렌더마다 다시 등록하면 층 순서가 바뀐다.
  const onDismissRef = useRef(onDismiss);
  const optionsRef = useRef({ outsideClick, escape });
  useEffect(() => {
    onDismissRef.current = onDismiss;
    optionsRef.current = { outsideClick, escape };
  });

  useEffect(() => {
    if (!enabled) return;
    const layer: Layer = { ref, onDismiss: onDismissRef, options: optionsRef };
    layers.push(layer);
    if (layers.length === 1) listen(true);
    return () => {
      const index = layers.indexOf(layer);
      if (index !== -1) layers.splice(index, 1);
      if (pressedOutside === layer) pressedOutside = null;
      if (layers.length === 0) listen(false);
    };
  }, [ref, enabled]);
}
