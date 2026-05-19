'use client';

/**
 * 브라우저 back(안드로이드 하드웨어 back 포함)으로 모달·다이얼로그·바텀시트를 닫는 전역 stack.
 *
 * 작동 원리
 * - 모달이 열릴 때 `history.pushState` 로 sentinel entry 한 칸을 쌓고, stack 에 onClose 핸들러를 push 한다.
 * - 브라우저 back → sentinel pop → popstate 발생 → `handlePopstate` → stack top 의 onClose 호출.
 * - X 버튼·오버레이 클릭·props.open=false 토글 등 back 키가 아닌 경로로 닫히면(cleanup 이 stack 에서
 *   unregister) sentinel entry 는 history 에 그대로 남는다. 이 "stale sentinel" 이 현재 위치라는 것을
 *   모듈이 `staleSentinelOnCurrentEntry` 로 기억해 두었다가, 사용자가 다음에 back 을 누를 때
 *   `handlePopstate` 가 그 한 칸을 `history.back()` 으로 자동 흡수한다 → 사용자는 back 을 한 번만 눌러도
 *   실제 이전 화면에 도달한다.
 *
 *   cleanup 에서 곧장 `history.back()` 을 부르지 않는 이유: 같은 click 안에서 setOpen(false) 와
 *   router.push/replace 가 함께 호출되면(예: NewsDialog 의 "이전 소식 모두 보기" 링크) cleanup 은
 *   urgent commit 직후 sync 로 실행되는데, 이 시점엔 아직 router 의 history 반영 전이다. 여기서
 *   `history.back()` 을 부르면 router 가 entry 를 덮기 전에 pop 되어 popstate → Next 의
 *   ACTION_TRAVERSE 가 navigation 을 덮어쓰는 race 가 난다. 그래서 cleanup 은 history 를 건드리지
 *   않고 stale 표시만 남기며, 실제 정리는 다음 popstate(back) 시점으로 미룬다. router 가 동작한
 *   경우엔 entry 가 router 에 의해 덮여 sentinel 이 사라지므로 stale 표시 자체를 하지 않고,
 *   라우트 변경 시 `clearBackStackOnRouteChange` 가 표시를 지운다.
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
 * 현재 history 위치가 "stale sentinel"(모달이 back 키 외의 경로로 닫혀 sentinel entry 만 남은 자리)
 * 인지 여부. true 면 다음 popstate(back) 에서 `handlePopstate` 가 그 한 칸을 추가로 흡수한다.
 */
let staleSentinelOnCurrentEntry = false;

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
 * cleanup 은 history 를 건드리지 않고 "현재 위치가 stale sentinel" 표시(`staleSentinelOnCurrentEntry`)만
 * 남긴다. 곧장 `history.back()` 을 부르면 같은 click 에서 함께 호출되는 router.replace/push 와 race 가
 * 나기 때문이다(모듈 상단 주석 참고). 실제 정리는 다음 popstate(back) 시점의 `handlePopstate` 가 한다.
 */
export function pushBackHandler(onClose: () => void): () => void {
  if (!isClient()) return () => {};
  const id = nextId++;
  stack.push({ id, onClose });
  // 새 sentinel entry 로 이동한다 → 직전에 남아 있던 stale sentinel 위치를 벗어났다.
  staleSentinelOnCurrentEntry = false;
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
    // 그대로 남아 현재 위치가 stale sentinel 이 된다. 다음 back 에서 `handlePopstate` 가 이 한 칸을
    // 흡수하도록 표시만 남긴다 (history 는 건드리지 않아 router 와의 race 를 원천 차단).
    staleSentinelOnCurrentEntry = true;
  };
}

/**
 * 라우트(pathname)가 실제로 변경된 시점에 호출한다.
 * 상위 store 등이 자체 dismiss 를 수행하므로 onClose 는 호출하지 않고 stack 만 비운다.
 * 라우트가 바뀌면 직전 화면의 stale sentinel 은 더 이상 우리 책임이 아니므로 표시도 함께 지운다.
 */
export function clearBackStackOnRouteChange(): void {
  stack = [];
  staleSentinelOnCurrentEntry = false;
}

/**
 * popstate 리스너 진입점.
 * 1) stack 에 핸들러가 있으면 top 을 호출한다(열린 모달을 back 으로 닫음).
 * 2) stack 이 비었고 직전 위치가 stale sentinel(모달이 back 외 경로로 닫혀 남은 자리)이었으면 →
 *    그 한 칸을 `history.back()` 으로 흡수해 사용자가 back 한 번으로 실제 이전 화면에 도달하게 한다.
 * 3) stack 이 비었는데 새로 도착한 위치의 state 가 우리 sentinel 이면(라우트 push 후 잔존 sandwich)
 *    자동으로 한 칸 더 흡수한다. 연속된 sentinel 도 각 자동 back 이 다시 popstate 를 발생시켜
 *    cascade 로 정리된다.
 */
export function handlePopstate(event: PopStateEvent): boolean {
  const top = stack.pop();
  if (top) {
    // 열린 모달이 있다 → 현재 위치는 그 모달의 live sentinel 이지 stale 이 아니다.
    staleSentinelOnCurrentEntry = false;
    top.onClose();
    return true;
  }
  if (staleSentinelOnCurrentEntry) {
    // 직전 위치가 stale sentinel 이었다 → 그 한 칸을 추가로 흡수해 실제 이전 화면으로 보낸다.
    staleSentinelOnCurrentEntry = false;
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
