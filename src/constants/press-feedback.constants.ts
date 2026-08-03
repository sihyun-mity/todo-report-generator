/**
 * 모바일 시스템 앱 스타일 눌림(press) 피드백 상수.
 * 커서 하이라이트(`pointer.constants.ts`)와는 별개 기능 — 이쪽은 커서가 아니라
 * **눌린 요소 자체**를 살짝 줄이고 톤을 얹는다. 데스크탑 마우스에서도 동작한다.
 */

/** 눌림 상태를 나타내는 DOM 속성. 값은 아래 두 가지 */
export const PRESS_FEEDBACK_STATE_ATTRIBUTE = 'data-pressed';

/** 누르고 있는 중 — 축소 + 색상 강조 */
export const PRESS_FEEDBACK_STATE_ON = 'on';

/**
 * 손을 뗀 직후 — 원래대로 돌아가는 전환이 재생되는 구간.
 * 속성을 곧바로 제거하면 transition 선언까지 함께 사라져 즉시 튕겨 돌아가므로,
 * 전환이 끝난 뒤(PRESS_FEEDBACK_RELEASE_MS)에 제거한다.
 */
export const PRESS_FEEDBACK_STATE_OFF = 'off';

/** JS 가 요소 크기에 맞춰 계산해 넣는 축소 배율 커스텀 프로퍼티 */
export const PRESS_FEEDBACK_SCALE_VARIABLE = '--press-scale';

/**
 * 눌리기 직전 요소가 가지고 있던 box-shadow 를 담아두는 커스텀 프로퍼티.
 * 색상 강조를 inset box-shadow 로 얹으면 요소 본래의 그림자(`shadow-lg` 등)가 통째로 덮이므로,
 * 원본 값을 여기 보관했다가 강조 그림자 뒤에 다시 이어 붙인다.
 */
export const PRESS_FEEDBACK_SHADOW_VARIABLE = '--press-shadow';

/** 본래 그림자가 없을 때 `PRESS_FEEDBACK_SHADOW_VARIABLE` 에 넣는 투명 그림자 */
export const PRESS_FEEDBACK_EMPTY_SHADOW = '0 0 #0000';

/**
 * 눌렸을 때 각 변이 안쪽으로 들어가 보이는 목표 거리(px).
 * 축소 배율은 `1 - (inset * 2) / 긴 변` 으로 환산해 큰 카드는 살짝, 작은 버튼은 또렷하게 들어간다.
 */
export const PRESS_FEEDBACK_INSET = 5;

/** 축소 배율 하한 — 작은 버튼이 과하게 쪼그라들지 않게 */
export const PRESS_FEEDBACK_MIN_SCALE = 0.94;

/** 축소 배율 상한 — 큰 카드에서도 최소한의 눌림감은 남게 */
export const PRESS_FEEDBACK_MAX_SCALE = 0.985;

/**
 * 해제 전환 길이(ms). `press-feedback.css` 의 해제 duration(200ms)보다 넉넉히 잡는다 —
 * 전환이 끝나기 전에 속성을 떼면 남은 구간이 잘려 튕겨 돌아간다.
 */
export const PRESS_FEEDBACK_RELEASE_MS = 240;

/**
 * 누르고 있는 동안 대상이 DOM 에 살아 있는지 확인하는 주기(ms).
 * 클릭으로 대상이 사라지면(다이얼로그 닫기 버튼 등) pointerup 이 창까지 올라오지 않아
 * 눌림 상태가 남을 수 있어 별도로 회수한다.
 */
export const PRESS_FEEDBACK_WATCHDOG_MS = 200;

/**
 * 눌림 효과를 줄 대상. 커서 하이라이트와 목적이 달라 목록을 따로 관리한다
 * (텍스트 입력은 제외 — 캐럿이 들어가는 필드가 줄어들면 어색하다).
 * 여기에 안 걸리는 커스텀 클릭 영역은 `data-press-target` 으로 옵트인한다.
 */
export const PRESS_FEEDBACK_SELECTOR = [
  'a[href]',
  'button',
  'select',
  'summary',
  'label[for]',
  'input[type="button"]',
  'input[type="submit"]',
  'input[type="reset"]',
  'input[type="checkbox"]',
  'input[type="radio"]',
  'input[type="file"]',
  '[role="button"]',
  '[role="menuitem"]',
  '[role="tab"]',
  '[role="option"]',
  '[role="switch"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '.cursor-pointer',
  '[data-press-target]',
].join(', ');

/** 대상에 걸렸더라도 눌림 효과를 주지 않을 요소 */
export const PRESS_FEEDBACK_IGNORE_SELECTOR = [':disabled', '[aria-disabled="true"]'].join(', ');

/** 이 속성이 붙은 요소와 그 하위는 눌림 효과에서 제외한다 */
export const PRESS_FEEDBACK_IGNORE_ATTRIBUTE_SELECTOR = '[data-press-ignore]';
