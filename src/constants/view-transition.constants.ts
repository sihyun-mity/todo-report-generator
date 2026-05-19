/**
 * ViewTransition 으로 매핑되는 navigation 방향 타입의 단일 출처.
 *
 * 새 타입을 추가하면 `<PageViewTransition>` 의 enter/exit map 이 자동 확장되고,
 * `view-transitions.css` 의 `::view-transition-old(.<name>)` 셀렉터만 더하면 동작한다.
 *
 * - nav-forward : 상위 → 하위 진입 (iOS push). 새 화면이 오른쪽에서 슬라이드 인.
 * - nav-back    : 하위 → 상위 복귀 (iOS pop). 새 화면이 왼쪽에서 슬라이드 인.
 * - nav-fade    : 자동 추론으로는 쓰이지 않는 cross-fade. 필요 시 호출자가 명시.
 */
export const NAV_TRANSITION_TYPES = ['nav-forward', 'nav-back', 'nav-fade'] as const;

/**
 * `<ViewTransition>` 및 popstate 전환이 공유하는 page-shell group 이름.
 * `view-transitions.css` 의 `::view-transition-group(page-shell)` 셀렉터와 짝.
 */
export const DEFAULT_PAGE_VIEW_TRANSITION_NAME = 'page-shell';

/**
 * layout 의 page-shell 컨테이너 div 에 부여하는 DOM id.
 * popstate(브라우저 back/forward) 전환 엔진이 이 요소를 찾아 `view-transition-name` 을 부여한다.
 */
export const PAGE_SHELL_ELEMENT_ID = 'app-page-shell';
