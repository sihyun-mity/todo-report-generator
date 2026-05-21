'use client';

/**
 * 브라우저 back(안드로이드 하드웨어 back 포함)으로 모달·다이얼로그·바텀시트를 닫는 전역 stack.
 *
 * 작동 원리
 * - 모달이 열릴 때 `history.pushState` 로 sentinel entry 한 칸을 쌓고, stack 에 onClose 핸들러를 push 한다.
 * - 브라우저 back → sentinel pop → popstate 발생 → `handlePopstate` → stack top 의 onClose 호출.
 * - X 버튼·오버레이 클릭·props.open=false 토글 등 back 키가 아닌 경로로 닫히면(cleanup 이 stack 에서
 *   unregister) sentinel entry 는 history 에 그대로 남는다. 이 "stale sentinel" 의 개수를 모듈이
 *   `staleSentinelCount` 카운터로 누적해 두었다가, 사용자가 다음에 back 을 누를 때 `handlePopstate`
 *   가 카운트만큼 `history.back()` 으로 한 칸씩 자동 흡수한다 → 다이얼로그를 여러 개 연속으로 X 로
 *   닫아도 사용자는 back 한 번으로 실제 이전 화면에 도달한다 (모든 흡수는 동일 popstate chain 안에서 일어남).
 *
 *   cleanup 에서 곧장 `history.back()` 을 부르지 않는 이유: 같은 click 안에서 setOpen(false) 와
 *   router.push/replace 가 함께 호출되면(예: NewsDialog 의 "이전 소식 모두 보기" 링크) cleanup 은
 *   urgent commit 직후 sync 로 실행되는데, 이 시점엔 아직 router 의 history 반영 전이다. 여기서
 *   `history.back()` 을 부르면 router 가 entry 를 덮기 전에 pop 되어 popstate → Next 의
 *   ACTION_TRAVERSE 가 navigation 을 덮어쓰는 race 가 난다. 그래서 cleanup 은 history 를 건드리지
 *   않고 카운터만 +1 하며, 실제 정리는 다음 popstate(back) 시점으로 미룬다. router 가 동작한
 *   경우엔 entry 가 router 에 의해 덮여 sentinel 이 사라지므로 cleanup 은 카운트를 올리지 않으며,
 *   라우트 변경 시 `clearBackStackOnRouteChange` 가 카운터를 0 으로 리셋한다.
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
/**
 * router wrapper 등 외부가 sentinel pop 을 위해 `history.back()` 을 호출한 직후,
 * `handlePopstate` 가 그 popstate 를 그대로 흘려보내도록 하는 카운터. 0 보다 크면 첫 분기에서
 * 카운트를 -1 하고 즉시 return → stack/stale 흡수 분기가 발화하지 않는다.
 * `suppressNextPopstate(count)` 가 키운다.
 */
let suppressNextPop = 0;

/**
 * X·오버레이 등 back 외 경로로 닫혀 history 에 남아 있는 stale sentinel entry 수.
 * cleanup 마다 +1, `handlePopstate` 의 stale 분기가 한 번에 하나씩 `history.back()` 으로 흡수해 -1.
 *
 * boolean 이 아닌 카운터인 이유: 단일 페이지 안에서 다이얼로그 여러 개를 연속으로 X 로 닫으면
 * stale entry 가 누적된다. boolean 으로는 한 칸만 기억해 사용자가 뒤로가기 한 번에 entry 두 칸을
 * 모두 흡수하지 못하고 한 칸은 여전히 남아 화면 변화 없는 popstate 가 발생, 뒤로가기를 한 번 더
 * 눌러야 진짜 이전 페이지로 가는 문제가 있었다.
 */
let staleSentinelCount = 0;

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
 * cleanup 은 history 를 건드리지 않고 `staleSentinelCount` 만 +1 한다. 곧장 `history.back()` 을
 * 부르면 같은 click 에서 함께 호출되는 router.replace/push 와 race 가 나기 때문이다(모듈 상단 주석 참고).
 * 실제 정리는 다음 popstate(back) 시점의 `handlePopstate` 가 한다.
 */
export function pushBackHandler(onClose: () => void): () => void {
  if (!isClient()) return () => {};
  const id = nextId++;
  stack.push({ id, onClose });
  // 새 sentinel push 는 카운터를 건드리지 않는다 — 이전에 X 로 닫힌 다이얼로그들의 stale entry 는
  // history 깊이에 그대로 남아 있고 새 sentinel 은 그 위에 한 칸 더 쌓일 뿐. 사용자가 결국
  // 뒤로 가면 카운트만큼 한 칸씩 흡수해 누적된 stale 을 모두 정리한다.
  try {
    window.history.pushState({ [SENTINEL_KEY]: id }, '');
  } catch {
    // 일부 샌드박스 환경에서 pushState 가 막혀도 in-memory stack 자체는 동작시킨다.
  }
  return () => {
    const idx = stack.findIndex((h) => h.id === id);
    const alreadyPopped = idx === -1;
    if (!alreadyPopped) stack.splice(idx, 1);

    if (alreadyPopped) return; // popstate 가 이미 pop 함 → 이미 정리됨
    if (!isSentinelState(window.history.state, id)) return; // 다른 트리거(router 등)가 이미 덮음

    // back 키가 아닌 경로(X·오버레이·props.open=false)로 닫혔다. sentinel entry 는 history 에
    // 그대로 남아 흡수 대기가 된다. 카운터를 +1 해 다음 back 들에서 한 칸씩 `history.back()` 으로
    // 흡수한다 (history 는 건드리지 않아 router 와의 race 를 원천 차단).
    staleSentinelCount += 1;
  };
}

/**
 * 라우트(pathname)가 실제로 변경된 시점에 호출한다.
 * 상위 store 등이 자체 dismiss 를 수행하므로 onClose 는 호출하지 않고 stack 만 비운다.
 * 라우트가 바뀌면 직전 화면의 stale sentinel 은 더 이상 우리 책임이 아니므로 카운터도 0 으로 리셋한다.
 */
export function clearBackStackOnRouteChange(): void {
  stack = [];
  suppressNextPop = 0;
  staleSentinelCount = 0;
}

/**
 * 현재 활성 sentinel(=stack 에 등록된 닫기 핸들러) 개수.
 * router wrapper 가 `router.replace` 호출 시 sentinel 위에 있는지 판단하는 데 쓴다.
 */
export function getBackStackSize(): number {
  return stack.length;
}

/**
 * 다음 popstate 부터 count 개만큼 `handlePopstate` 가 흡수(=상위 동작 안 함)하도록 표시한다.
 *
 * 용도: router wrapper 가 다이얼로그 sentinel entry 를 pop 하기 위해 `history.back()` 을
 * 부르기 직전에 호출한다. 그렇지 않으면 `staleSentinelCount` 흡수 분기가 추가로 한 칸씩
 * `history.back()` 을 호출해 의도치 않게 두 칸 이상 뒤로 가버린다.
 */
export function suppressNextPopstate(count = 1): void {
  if (count <= 0) return;
  suppressNextPop += count;
}

/**
 * popstate 리스너 진입점.
 * 0) `suppressNextPop` 이 있으면(router wrapper 가 sentinel 을 pop 하려고 호출한 직후)
 *    카운트를 -1 하고 그대로 흘려보낸다. stack/stale 흡수가 발화하지 않게 막는다.
 * 1) stack 에 핸들러가 있으면 top 을 호출한다(열린 모달을 back 으로 닫음).
 * 2) stack 이 비었고 stale sentinel 카운트가 남아 있으면 → 그 한 칸을 `history.back()` 으로 흡수.
 *    카운터가 0 이 될 때까지 매 popstate 마다 한 칸씩 처리하므로 누적된 stale entry 도 사용자의
 *    back 한 번에 모두 정리된다 (각 자동 back 이 다시 popstate 를 발생시켜 이 분기를 재진입).
 * 3) stack 이 비었는데 새로 도착한 위치의 state 가 우리 sentinel 이면(라우트 push 후 잔존 sandwich)
 *    자동으로 한 칸 더 흡수한다. 연속된 sentinel 도 cascade 로 정리된다.
 */
export function handlePopstate(event: PopStateEvent): boolean {
  if (suppressNextPop > 0) {
    suppressNextPop -= 1;
    return false;
  }
  const top = stack.pop();
  if (top) {
    top.onClose();
    return true;
  }
  if (staleSentinelCount > 0) {
    // history 에 남아 있던 stale sentinel 한 칸을 흡수. 카운트가 더 있으면 이 `history.back()`
    // 으로 발생하는 다음 popstate 에서 이 분기로 재진입해 추가 흡수한다.
    staleSentinelCount -= 1;
    if (isClient()) {
      try {
        window.history.back();
      } catch {
        /* 더 이상 뒤로 갈 entry 가 없으면 흡수 종료 */
      }
    }
    return false;
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
