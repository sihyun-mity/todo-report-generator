'use client';

/**
 * 브라우저 back(안드로이드 하드웨어 back 포함)으로 모달·다이얼로그·바텀시트를 닫는 전역 stack.
 *
 * 작동 원리
 * - 모달이 열릴 때 `history.pushState` 로 sentinel entry 한 칸을 쌓고, stack 에 onClose 핸들러를 push 한다.
 * - 브라우저 back → sentinel pop → popstate 발생 → `handlePopstate` → stack top 의 onClose 호출.
 * - X 버튼·오버레이 클릭 등으로 props.open 이 false 가 되어 cleanup 이 도는 경로에서는
 *   `history.back()` 을 부르지 않고 현재 entry 의 sentinel 마크만 `replaceState` 로 제거한다.
 *   → 같은 click 안에서 router.push/replace 가 함께 호출되는 경우(예: NewsDialog 의
 *     "이전 소식 모두 보기" 링크), React transition 이 commit 되며 호출하는 router 의
 *     `replaceState` 가 우리 cleanup 과 같은 entry 를 그대로 덮어 URL 만 바뀐다.
 *     `history.back()` 을 부르면 router 의 `replaceState` 이전에 entry 가 pop 되어 popstate →
 *     Next 의 ACTION_TRAVERSE 가 navigation 을 덮어쓰는 race 가 생기므로 그 경로를 원천 차단한다.
 * - 사용자가 X / 오버레이로 dismiss 후 back 키를 누르면, 마크가 제거된 stale sentinel entry 가
 *   한 칸 남아 있을 수 있다. `handlePopstate` 의 cascade 흡수 로직이 마크가 살아 있는 잔존
 *   entry 를 자동으로 한 칸 더 흡수한다.
 *
 * popstate View Transition 엔진(`popstate-view-transition.tsx`)과의 공존
 * - sentinel pushState 는 URL 을 바꾸지 않는다(`url` 미지정). popstate 엔진은
 *   `destPath === lastCommittedPath` 일 때 전환을 인수하지 않으므로, 다이얼로그 back-close 는
 *   페이지 전환 애니메이션을 트리거하지 않는다.
 * - popstate 엔진의 리스너는 모듈 로드 시점에, `BackButtonHandler` 의 리스너는 useEffect 에서
 *   등록된다(엔진이 먼저 실행). 실제 라우트 이동이면 엔진이 `stopImmediatePropagation` 으로
 *   가로채므로 두 경로가 섞이지 않고, sentinel back 이면 엔진이 그냥 흘려보내 `BackButtonHandler`
 *   가 처리한다.
 */

/** history.state 에 박는 sentinel 마크 키. popstate 엔진의 `__vtHistoryIdx` 와 공존한다. */
const SENTINEL_KEY = '__trgBackStack';

type BackHandler = {
  readonly id: number;
  readonly onClose: () => void;
};

let stack: Array<BackHandler> = [];
let nextId = 1;

const isClient = (): boolean => typeof window !== 'undefined';

const isSentinelState = (state: unknown, id?: number): boolean => {
  if (!state || typeof state !== 'object') return false;
  const value = (state as Record<string, unknown>)[SENTINEL_KEY];
  if (typeof value !== 'number') return false;
  return id == null || value === id;
};

/**
 * stack 에 닫기 핸들러를 push 하고 history sentinel 한 칸을 추가한다.
 * 반환된 unregister 는 외부 트리거(props.open=false / X 버튼 / 오버레이)로 인한 cleanup 경로에서 호출된다.
 *
 * cleanup 은 `history.back()` 을 부르지 않고 sentinel 마크만 제거한다 — 같은 click 에서 함께
 * 호출되는 router.replace/push 와의 race(모듈 상단 주석 참고)를 막기 위함이다.
 */
export function pushBackHandler(onClose: () => void): () => void {
  if (!isClient()) return () => {};
  const id = nextId++;
  stack.push({ id, onClose });
  try {
    window.history.pushState({ [SENTINEL_KEY]: id }, '');
  } catch {
    // 일부 샌드박스 환경에서 pushState 가 막혀도 in-memory stack 자체는 동작시킨다.
  }
  return () => {
    const idx = stack.findIndex((h) => h.id === id);
    const alreadyPopped = idx === -1;
    if (!alreadyPopped) stack.splice(idx, 1);

    if (alreadyPopped) return; // popstate 가 이미 pop 함 → history 를 건드리지 않는다
    if (!isSentinelState(window.history.state, id)) return; // 다른 트리거(router 등)가 이미 덮음

    // sentinel 마크만 제거하고 entry 자체는 남긴다. back() 을 부르지 않으므로 같은 click 에
    // 도는 router.replace/push 와 race 가 발생하지 않는다.
    try {
      window.history.replaceState({}, '');
    } catch {
      // replaceState 가 막힌 환경 — stale sentinel 은 다음 popstate 의 cascade 흡수에 맡긴다.
    }
  };
}

/**
 * 라우트(pathname)가 실제로 변경된 시점에 호출한다.
 * 상위 store 등이 자체 dismiss 를 수행하므로 onClose 는 호출하지 않고 stack 만 비운다.
 */
export function clearBackStackOnRouteChange(): void {
  stack = [];
}

/**
 * popstate 리스너 진입점.
 * 1) stack 에 핸들러가 있으면 top 을 호출한다.
 * 2) stack 이 비었는데 새 위치의 state 가 우리 sentinel 이면(라우트 push 후 잔존 sandwich),
 *    사용자가 back 한 번으로 진짜 prev 에 도달하도록 자동으로 한 칸 더 흡수한다.
 *    연속된 sentinel 도 각 자동 back 이 다시 popstate 를 발생시켜 cascade 로 정리된다.
 */
export function handlePopstate(event: PopStateEvent): boolean {
  const top = stack.pop();
  if (top) {
    top.onClose();
    return true;
  }
  if (isClient() && isSentinelState(event.state)) {
    try {
      window.history.back();
    } catch {
      /* 더 이상 뒤로 갈 entry 가 없으면 자동 정리 종료 */
    }
    return false;
  }
  return false;
}
