export const CUSTOM_POINTER_ELEMENT_ID = 'custom-pointer';

/** `<html>` 에 붙어 네이티브 커서를 숨기고 커스텀 포인터를 활성화하는 클래스 */
export const CUSTOM_POINTER_ACTIVE_CLASS = 'custom-pointer-active';

/** 자유 이동 상태의 원형 도트 지름(px) */
export const CUSTOM_POINTER_DOT_SIZE = 18;

/** 인터랙션 요소 스냅 시 하이라이트가 요소 바깥으로 확장되는 여백(px) */
export const CUSTOM_POINTER_SNAP_PADDING = 4;

/** 스냅 상태에서 커서 움직임을 따라 하이라이트가 끌려가는 최대 거리(px) — iPadOS 시차 효과 */
export const CUSTOM_POINTER_PARALLAX_MAX = 3;

/** 텍스트 입력 위 I-beam 캐럿 모드의 바 너비(px) */
export const CUSTOM_POINTER_CARET_WIDTH = 2;

/**
 * 클릭 완료 후 커서 아래 요소를 매 프레임 재히트테스트하는 시간(ms).
 * 클릭이 일으키는 DOM 변경(작업 추가 등)은 이벤트 처리 이후에 커밋되므로,
 * pointerup 시점의 단발 판정으로는 새 레이아웃을 반영할 수 없다.
 */
export const CUSTOM_POINTER_CLICK_RECHECK_MS = 250;

/**
 * 포인터가 요소를 감싸는 하이라이트로 변형되는 스냅 대상.
 * `.cursor-pointer` 는 Tailwind 유틸을 단 커스텀 클릭 영역(카드 등)을 포괄한다.
 * 새로 만드는 요소가 여기에 안 걸리면 `data-pointer-snap` 을 붙여 옵트인한다.
 */
export const CUSTOM_POINTER_SNAP_SELECTOR = [
  'a[href]',
  'button',
  'input',
  'select',
  'summary',
  'label',
  '[role="button"]',
  '[role="menuitem"]',
  '[role="tab"]',
  '[role="option"]',
  '[role="switch"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '.cursor-pointer',
  '[data-pointer-snap]',
].join(', ');

/** 하이라이트 대신 I-beam 캐럿으로 표시할 텍스트 입력 요소 */
export const CUSTOM_POINTER_TEXT_SELECTOR = [
  'input:not([type])',
  'input[type="text"]',
  'input[type="email"]',
  'input[type="password"]',
  'input[type="search"]',
  'input[type="url"]',
  'input[type="tel"]',
  'input[type="number"]',
  'textarea',
  '[contenteditable="true"]',
  '[contenteditable="plaintext-only"]',
].join(', ');
