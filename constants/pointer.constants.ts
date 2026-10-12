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
 * 마지막 scroll 이벤트 이후 이 시간(ms)이 지나야 스크롤이 끝난 것으로 보고
 * 커서 아래 요소를 다시 판정한다. 스크롤 중에는 항상 기본 도트 모양을 유지해
 * 인터랙션 영역이 커서를 지나갈 때마다 하이라이트가 변하지 않게 한다.
 */
export const CUSTOM_POINTER_SCROLL_IDLE_MS = 140;

/**
 * 터치 종료 후 pointerType 'mouse' 이벤트를 계속 무시하는 시간(ms).
 * 일부 안드로이드 브라우저(인앱 웹뷰·DeX 등)는 터치를 'mouse' 로 보고하므로,
 * 터치 세션 중과 직후엔 mouse 포인터 이벤트를 신뢰할 수 없다.
 */
export const CUSTOM_POINTER_TOUCH_SUPPRESS_MS = 800;

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

/**
 * 포인터를 숨길 외부 콘텐츠 프레임 — 안쪽이 별도 문서(browsing context)라
 * 커서가 들어가는 순간부터 부모 문서에 pointermove 가 더 이상 오지 않는다.
 * (프레임 안에서는 그 문서의 네이티브 커서가 대신 그려진다.)
 */
export const CUSTOM_POINTER_EXTERNAL_FRAME_SELECTOR = ['iframe', 'frame', 'embed', 'object'].join(', ');

/**
 * 마지막 포인터 이벤트 후 이 시간 동안 아무 이벤트도 오지 않으면 프레임 진입을 의심하고 확인한다(ms).
 * 교차 출처 프레임은 별도 프로세스라 커서가 들어가도 부모 문서에 경계 이벤트조차 오지 않는
 * 브라우저가 있다(실측: Chromium). 그 경우 "이벤트가 끊긴 것" 자체가 유일한 단서다.
 */
export const CUSTOM_POINTER_FRAME_IDLE_MS = 180;

/**
 * 프레임 경계 판정에 더하는 여유(px)의 하한·상한.
 * 마지막 pointermove 샘플은 실제 경계보다 조금 바깥에서 끊기는데, 그 간격은 커서가 경계를 넘을 때의
 * 한 샘플 이동 폭이다. 직전 이동 폭에 가속 여지를 얹어(FRAME_EDGE_SCALE) 이 범위로 자른다 —
 * 천천히 움직이다 멈춘 커서에는 여유가 거의 붙지 않아, 프레임 옆에 멈춰 있을 뿐인 커서를
 * 잘못 숨기지 않는다.
 */
export const CUSTOM_POINTER_FRAME_EDGE_SCALE = 2;
export const CUSTOM_POINTER_FRAME_EDGE_MIN = 16;
export const CUSTOM_POINTER_FRAME_EDGE_MAX = 96;
