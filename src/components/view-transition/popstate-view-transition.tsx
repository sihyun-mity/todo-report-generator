'use client';

/**
 * 브라우저 back/forward (popstate) 에 View Transition 을 적용하는 자체 엔진.
 *
 * 배경
 * - `Link` / `router.push` 같은 push 네비게이션은 Next 의 navigation action 이
 *   `addTransitionType()` 을 호출해 React transition 으로 처리하므로 `<PageViewTransition>`
 *   (React `<ViewTransition>`) 이 자동으로 애니메이션한다.
 * - 그러나 back/forward 는 Next 가 RESTORE 를 **의도적으로 urgent(비-transition) 업데이트**로
 *   처리한다 ("we don't want to add any delay on a back/forward nav"). urgent 업데이트는 React
 *   `<ViewTransition>` 이 애니메이션하지 않으므로 popstate 전환은 무애니메이션이었다.
 *
 * 해결 — 라우터 이벤트와 분리해 우리가 직접 전환을 구동한다. native View Transition API 를
 * 그대로 쓰므로 기존 view-transitions.css 키프레임을 100% 재사용한다.
 *
 * 1. 모듈 로드 시점에 `history.pushState/replaceState` 에 단조 증가 인덱스를 스탬프해 둔다.
 *    popstate 의 `event.state` 인덱스를 직전 위치와 비교하면 back/forward 방향을 알 수 있다.
 * 2. popstate 리스너를 모듈 로드 시점에 등록한다 → Next 의 `useEffect` 리스너보다 먼저 실행된다.
 *    라우트가 실제로 바뀌는 popstate 면 `stopImmediatePropagation()` 으로 Next 의 즉시 RESTORE 를
 *    막고 우리가 인수한다.
 * 3. `document.startViewTransition(update)` 를 호출한다. 브라우저가 OLD 스냅샷을 캡처한 뒤
 *    `update` 콜백이 실행되는데, 그 안에서 popstate 를 **재발생**시킨다. 재발생된 이벤트는 Next 의
 *    RESTORE 를 트리거하고, Next 의 DOM 교체는 이제 VT 캡처 윈도우 안에서 일어난다.
 * 4. `update` 가 반환한 promise 는 새 라우트가 React 에 commit 될 때까지(= `<PopstateViewTransitionNotifier>`
 *    가 보고할 때까지) 대기한다. 그 시점에 브라우저가 NEW 스냅샷을 캡처하고 애니메이션을 실행한다.
 *
 * 적용 범위: 브라우저 back/forward 버튼, `router.back()`/`router.forward()`(native history 위임
 * → popstate), `window.history.back()` 직접 호출.
 *
 * 네이티브 UA 전환 중복 방지 (iOS swipe-back / Android 예측 뒤로가기 등)
 * - 브라우저가 back/forward 에 자체 전환 애니메이션(미리보기)을 이미 그렸다면 거기에 우리
 *   View Transition 까지 얹으면 전환이 중복된다.
 * - 정밀 신호: Navigation API `navigate` 이벤트의 `hasUAVisualTransition` 이 `true` 면 우리
 *   전환을 인수하지 않는다.
 * - 폴백: Navigation API 미지원 브라우저에서는 플랫폼 휴리스틱으로 WebKit 의 비-programmatic
 *   popstate 를 인수하지 않는다.
 */

import { usePathname } from 'next/navigation';
import { useIsomorphicLayoutEffect } from 'usehooks-ts';
import { getBackStackSize } from '@/components/back-stack/back-stack';
import { DEFAULT_PAGE_VIEW_TRANSITION_NAME, PAGE_SHELL_ELEMENT_ID } from '@/constants';
import { normalizePath } from '@/utils';

/** 새 라우트 commit 보고가 끝내 오지 않을 때(네비게이션 중단/에러) 전환을 풀어주는 안전 타임아웃. */
const READY_TIMEOUT_MS = 700;

/** history.state 에 스탬프하는 위치 인덱스 키. Next 내부 키와 충돌하지 않는 prefix 사용. */
const HISTORY_IDX_KEY = '__vtHistoryIdx';

type HistoryDirection = 'nav-back' | 'nav-forward';

type ViewTransitionLike = { readonly finished: Promise<unknown> };
type StartViewTransition = (callback: () => unknown) => ViewTransitionLike;

/** programmatic 네비게이션 / UA 전환 신호를 유효하다고 볼 시간 창. */
const PROGRAMMATIC_NAV_WINDOW_MS = 500;

/**
 * Navigation API `navigate` 이벤트의 일부. lib.dom 타입에 `hasUAVisualTransition` 이 아직 없을 수
 * 있어 최소 형태만 직접 정의한다.
 */
type NavigateEventLike = Event & {
  readonly navigationType?: string;
  readonly hasUAVisualTransition?: boolean;
};

/**
 * 폴백 전용 — Navigation API 가 없거나 `hasUAVisualTransition` 을 보고하지 않는 구형 브라우저에서
 * 네이티브 제스처 백을 추정하기 위한 플랫폼 휴리스틱.
 * iOS 의 모든 브라우저는 WebKit 기반이라 swipe-back 이 네이티브로 애니메이션된다.
 */
const isNativeGestureBackPlatformFallback = ((): boolean => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /AppleWebKit/.test(ua) && !/(Chrome|Chromium|Android|Edg\/)/.test(ua);
})();

// ─── 모듈 전역 상태 ──────────────────────────────────────────────────────────
/** 지금까지 발생한 pushState 횟수 = 가장 깊은 위치 인덱스. */
let navCounter = 0;
/** 현재 history 위치의 인덱스. */
let currentIdx = 0;
/** React 가 마지막으로 commit 한 라우트. notifier 가 갱신. */
let lastCommittedPath = '';
/**
 * history idx → 떠날 당시의 스크롤 위치 맵. 다음에 그 entry 로 되돌아올 때 복원해 NEW 스냅샷이
 * 올바른 viewport 상태에서 캡처되도록 한다.
 *
 * 우리가 `history.scrollRestoration = 'manual'` 로 브라우저 자동 복원을 꺼두므로 (이유는
 * `installScrollRestorationOverride` 참조) popstate 의 모든 스크롤은 우리가 명시 관리한다.
 */
const scrollByIdx = new Map<number, { readonly x: number; readonly y: number }>();
/**
 * popstate 이후 새 라우트 commit 시점에 복원할 스크롤 작업. 인수 여부와 무관하게 모든
 * popstate 에서 설정되고, notifier 가 라우트 commit 을 감지하면 소비한다.
 *
 * 인수된 popstate 는 `pending` 경로(scroll 복원 + OLD shift override + ready resolve)가
 * 우선 처리되므로 이 항목은 unused 가 된다. UA 제스처 백처럼 우리가 인수하지 않는 popstate
 * 에서만 실제로 쓰여, `'manual'` 모드 하에서도 스크롤이 정확히 복원되도록 한다.
 *
 * `destPath` 가 commit 된 pathname 과 일치할 때만 적용 → 그 사이 push 가 끼어들면 stale 처리해
 * 잘못된 entry 의 스크롤이 적용되지 않게 한다.
 */
let pendingPopstateRestore: { readonly idx: number; readonly destPath: string } | null = null;
/** 진행 중인 popstate 전환이 새 라우트 commit 을 기다리는 중이면 설정된다. */
let pending: {
  readonly destPath: string;
  readonly resolve: () => void;
  /** 전환 시작 시점(=OLD 캡처 직전)의 스크롤. OLD shift 재계산에 사용. */
  readonly oldScrollY: number;
} | null = null;
/** popstate 전환이 진행 중인지. 중첩 인수 방지. */
let transitionInFlight = false;
/** 우리가 redispatch 한 합성 popstate 인지 표시 — true 면 리스너는 그대로 흘려보낸다. */
let reentrant = false;
/**
 * `history.back/forward/go` 가 JS 로 호출된 시각. 직후의 popstate 는 programmatic 으로 판정한다.
 * 0 이면 미설정. 네이티브 제스처 백은 JS 함수를 호출하지 않으므로 이 값이 갱신되지 않는다.
 */
let programmaticNavAt = 0;
/**
 * 직전 traverse `navigate` 이벤트가 보고한 UA 시각 전환 정보. popstate 직전에 갱신되고
 * `onPopState` 에서 한 번 소비된다. `supported: false` 면 `hasUAVisualTransition` 미보고 브라우저.
 */
let lastTraverseNavigate: {
  readonly supported: boolean;
  readonly hasUAVisualTransition: boolean;
  readonly at: number;
} | null = null;

// ─── history 인덱스 패치 ─────────────────────────────────────────────────────

/**
 * `history.pushState/replaceState` 를 감싸 매 entry 에 위치 인덱스를 스탬프한다.
 *
 * 모듈 로드 시점(= 어떤 useEffect 보다도 먼저)에 패치하므로, 이후 Next 의 app-router 가
 * useEffect 에서 pushState/replaceState 를 다시 패치해도 Next 의 래퍼가 우리 래퍼를 감싼다
 * (Next → ours → native). 따라서 Next 가 state 를 정제하더라도 그 다음 단계인 우리 래퍼가
 * 인덱스를 다시 박으므로 스탬프가 항상 살아남는다.
 */
function installHistoryIndexPatch(): void {
  type PatchedHistory = History & { __vtIdxPatched?: boolean };
  const history = window.history as PatchedHistory;
  if (history.__vtIdxPatched) return;
  history.__vtIdxPatched = true;

  // 새로고침 등으로 이미 스탬프된 entry 에 복귀한 경우 그 인덱스를 이어받는다.
  const initialState = window.history.state as Record<string, unknown> | null;
  const initialIdx =
    initialState && typeof initialState[HISTORY_IDX_KEY] === 'number' ? (initialState[HISTORY_IDX_KEY] as number) : 0;
  navCounter = initialIdx;
  currentIdx = initialIdx;
  lastCommittedPath = normalizePath(window.location.pathname);

  const originalPush = window.history.pushState.bind(window.history);
  const originalReplace = window.history.replaceState.bind(window.history);

  window.history.pushState = function patchedPushState(data, unused, url) {
    // 새 entry 로 떠나기 직전에 현재 entry 의 스크롤을 기록 → 나중에 back 으로 돌아올 때 복원.
    saveScrollForIdx(currentIdx);
    // 미소비 popstate restore 가 있다면 stale: push 가 끼어들었으므로 폐기 (잘못된 entry 적용 방지).
    pendingPopstateRestore = null;
    navCounter += 1;
    currentIdx = navCounter;
    return originalPush({ ...data, [HISTORY_IDX_KEY]: currentIdx }, unused, url);
  };
  // replace 는 같은 위치를 덮어쓰는 것이므로 인덱스를 증가시키지 않고 currentIdx 를 유지한다.
  window.history.replaceState = function patchedReplaceState(data, unused, url) {
    return originalReplace({ ...data, [HISTORY_IDX_KEY]: currentIdx }, unused, url);
  };

  // back/forward/go 를 감싸 "JS 가 일으킨 네비게이션" 임을 기록한다 — `router.back()` /
  // `router.forward()` / `window.history.back()` 은 결국 이 함수들을 호출하므로, 직후의 popstate 를
  // 네이티브 제스처 백과 구분할 수 있다 (네이티브 제스처는 이 JS 함수를 거치지 않는다).
  const originalBack = window.history.back.bind(window.history);
  const originalForward = window.history.forward.bind(window.history);
  const originalGo = window.history.go.bind(window.history);
  window.history.back = function patchedBack() {
    programmaticNavAt = Date.now();
    return originalBack();
  };
  window.history.forward = function patchedForward() {
    programmaticNavAt = Date.now();
    return originalForward();
  };
  window.history.go = function patchedGo(delta) {
    programmaticNavAt = Date.now();
    return originalGo(delta);
  };
}

// ─── 스크롤 위치 저장/복원 ───────────────────────────────────────────────────

function saveScrollForIdx(idx: number): void {
  scrollByIdx.set(idx, { x: window.scrollX, y: window.scrollY });
}

function getSavedScrollForIdx(idx: number): { readonly x: number; readonly y: number } {
  return scrollByIdx.get(idx) ?? { x: 0, y: 0 };
}

/**
 * pop 케이스의 OLD shift 보정값을 설정한다.
 *
 * `page-view-transition.tsx` 가 패치한 `startViewTransition` 은 호출 시점에
 * `--vt-old-shift: -OLD_scrollY` 를 박는데, 이는 NEW 가 항상 scroll 0(=push) 인
 * 전제다. pop 으로 돌아온 NEW 페이지가 0 이 아닌 saved scroll 로 복원되면 view-transition-group
 * 박스가 NEW 기준(top:-NEW_scrollY)으로 잡혀 OLD 스냅샷이 잘못된 위치(NEW 의 중간)에 그려진다.
 *
 * 올바른 공식: translateY = NEW_scrollY - OLD_scrollY. 이 값으로 덮어쓴다.
 * NEW 캡처 직전(=ready resolve 직전)에 호출해야 키프레임이 정확한 값으로 시작한다.
 */
function applyPopOldShiftOverride(oldScrollY: number, newScrollY: number): void {
  document.documentElement.style.setProperty('--vt-old-shift', `${Math.round(newScrollY - oldScrollY)}px`);
}

// ─── popstate 인수 ───────────────────────────────────────────────────────────

/** 스크롤 캡처 패치가 적용된 `document.startViewTransition` 을 돌려준다. 미지원 시 null. */
function getStartViewTransition(): StartViewTransition | null {
  const fn = (document as Document & { startViewTransition?: StartViewTransition }).startViewTransition;
  return typeof fn === 'function' ? fn.bind(document) : null;
}

/**
 * 합성 popstate 를 발생시켜 Next(및 나머지 리스너)가 실제 네비게이션을 수행하게 한다.
 * `reentrant` 플래그로 우리 리스너는 이 이벤트를 그대로 흘려보낸다.
 */
function redispatchPopstate(): void {
  reentrant = true;
  try {
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
  } finally {
    reentrant = false;
  }
}

function takeOverPopstate(args: {
  readonly direction: HistoryDirection;
  readonly destPath: string;
  readonly shell: HTMLElement;
  readonly startViewTransition: StartViewTransition;
}): void {
  const { direction, destPath, shell, startViewTransition } = args;
  const directionClass = `vt-${direction}`;

  transitionInFlight = true;
  // OLD 캡처 직전의 스크롤 — NEW commit 시점에 OLD shift 를 NEW-OLD 공식으로 재계산하는 데 필요.
  const oldScrollY = window.scrollY;
  // page-shell 그룹 분리: layout 의 컨테이너 div 가 OLD/NEW 스냅샷 단위가 되어 슬라이드가
  // 컨테이너 안에 한정된다 (React `<ViewTransition name="page-shell">` 의 push 경로와 동일).
  shell.style.viewTransitionName = DEFAULT_PAGE_VIEW_TRANSITION_NAME;
  // `:root.vt-nav-*` 셀렉터로 view-transitions.css 의 push/pop 키프레임을 매칭시킨다.
  document.documentElement.classList.add(directionClass);

  let resolveReady: () => void = () => {};
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });
  pending = { destPath, resolve: resolveReady, oldScrollY };

  const fallbackTimer = window.setTimeout(resolveReady, READY_TIMEOUT_MS);

  const cleanup = (): void => {
    window.clearTimeout(fallbackTimer);
    shell.style.viewTransitionName = '';
    document.documentElement.classList.remove(directionClass);
    transitionInFlight = false;
    if (pending && pending.resolve === resolveReady) pending = null;
  };

  try {
    // update 콜백은 브라우저가 OLD 스냅샷을 캡처한 직후 실행된다. 여기서 popstate 를
    // 재발생시키면 Next 의 RESTORE DOM 교체가 VT 캡처 윈도우 안에서 일어나고, NEW 스냅샷은
    // ready(= 새 라우트 commit) 까지 미뤄진다.
    const transition = startViewTransition(() => {
      redispatchPopstate();
      return ready;
    });
    Promise.resolve(transition.finished).finally(cleanup);
  } catch {
    // startViewTransition 자체가 실패하면 네비게이션을 잃지 않도록 즉시 위임한다.
    cleanup();
    redispatchPopstate();
  }
}

function onPopState(event: PopStateEvent): void {
  // 우리가 redispatch 한 합성 이벤트 — Next 로 그대로 흘려보낸다.
  if (reentrant) return;

  // 1) 방향 판정 + 인덱스 갱신. 인수 여부와 무관하게 항상 먼저 수행해 추적 상태를 정확히 유지한다.
  const destState = event.state as Record<string, unknown> | null;
  const destIdx =
    destState && typeof destState[HISTORY_IDX_KEY] === 'number' ? (destState[HISTORY_IDX_KEY] as number) : null;

  let historyDirection: HistoryDirection | null = null;
  if (destIdx !== null) {
    // currentIdx 갱신 전: 떠나는 entry 의 스크롤을 기록 → 다음에 그 entry 로 돌아올 때 복원.
    saveScrollForIdx(currentIdx);
    if (destIdx < currentIdx) historyDirection = 'nav-back';
    else if (destIdx > currentIdx) historyDirection = 'nav-forward';
    currentIdx = destIdx;
    // 인수 여부와 무관하게 복원 작업을 예약. 인수되는 경로는 `pending` 이 우선 처리하므로
    // 이 값은 unused 가 되지만, UA 제스처 백처럼 인수하지 않는 popstate 에서는 notifier 가
    // 이 값을 보고 스크롤만 복원한다 (`'manual'` 모드 하에서 브라우저 자동 복원 부재 보정).
    pendingPopstateRestore = { idx: destIdx, destPath: normalizePath(window.location.pathname) };
  }

  // programmatic 플래그 / UA 전환 정보는 popstate 당 한 번만 소비한다.
  const isProgrammatic = programmaticNavAt !== 0 && Date.now() - programmaticNavAt < PROGRAMMATIC_NAV_WINDOW_MS;
  programmaticNavAt = 0;
  const navInfo = lastTraverseNavigate;
  lastTraverseNavigate = null;

  // 2) 인수 조건 검사 — 하나라도 어긋나면 기본 동작(Next 의 즉시 RESTORE)에 맡긴다.
  if (historyDirection === null) return; //                방향 불명 (앱 외부에서 만든 entry 등)
  if (getBackStackSize() > 0) return; //                   모달/바텀시트 sentinel pop — back-stack 처리
  if (transitionInFlight) return; //                       직전 전환이 아직 진행 중
  // UA(브라우저)가 이미 자체 전환(미리보기)을 그렸으면 우리 전환을 얹지 않는다 → 중복 방지.
  if (navInfo !== null && navInfo.supported && Date.now() - navInfo.at < PROGRAMMATIC_NAV_WINDOW_MS) {
    if (navInfo.hasUAVisualTransition) return; //          UA 가 이미 시각 전환 수행 → skip
  } else if (isNativeGestureBackPlatformFallback && !isProgrammatic) {
    return; //                                             폴백: WebKit 네이티브 제스처 백으로 간주
  }
  const startViewTransition = getStartViewTransition();
  if (!startViewTransition) return; //                     View Transition 미지원 환경

  const destPath = normalizePath(window.location.pathname);
  if (destPath === lastCommittedPath) return; //           라우트 변경 없음 (해시/쿼리)

  const shell = document.getElementById(PAGE_SHELL_ELEMENT_ID);
  if (!(shell instanceof HTMLElement)) return; //          page-shell 컨테이너 부재

  // 3) 인수 — Next 의 즉시 RESTORE 를 막고 VT 안에서 다시 발생시킨다.
  event.stopImmediatePropagation();
  takeOverPopstate({ direction: historyDirection, destPath, shell, startViewTransition });
}

/**
 * notifier 가 호출한다. React 가 새 라우트를 commit 하면 대기 중인 popstate 전환의
 * NEW 스냅샷 캡처를 진행시킨다.
 *
 * 이 시점에 (1) 목적지 entry 의 저장된 스크롤을 동기 복원하고, (2) OLD shift 를 pop 공식으로
 * 덮어쓴 뒤 ready 를 resolve 한다. 브라우저는 ready resolve 직후 NEW 스냅샷을 캡처하므로,
 * 두 작업이 캡처보다 먼저 실행되어 "A 가 잠깐 scroll 0 으로 보였다가 복원되는" 깜빡임을 차단한다.
 *
 * useLayoutEffect 에서 호출하면 React commit 직후 paint 전에 실행되므로, Next App Router 가
 * urgent RESTORE 로 DOM 만 바꾸고 스크롤은 미복원인 한 프레임 동안의 잘못된 viewport 가
 * 사용자에게 노출되지 않는다.
 */
function reportRouteCommitted(path: string): void {
  lastCommittedPath = path;
  if (pending && pending.destPath === path) {
    // 인수된 popstate: 스크롤 복원 + OLD shift 재계산 + ready resolve (NEW 캡처 진행).
    const dest = getSavedScrollForIdx(currentIdx);
    window.scrollTo(dest.x, dest.y);
    applyPopOldShiftOverride(pending.oldScrollY, dest.y);
    pending.resolve();
    pending = null;
    pendingPopstateRestore = null;
    return;
  }
  if (pendingPopstateRestore && pendingPopstateRestore.destPath === path) {
    // 비-인수 popstate (UA 제스처 백, 모달 close 외 라우트 변경 등): 스크롤만 복원.
    // 'manual' 모드 하에서 브라우저 자동 복원이 없으므로 우리가 직접 옮긴다.
    const dest = getSavedScrollForIdx(pendingPopstateRestore.idx);
    window.scrollTo(dest.x, dest.y);
    pendingPopstateRestore = null;
  }
}

// ─── 설치 (모듈 로드 시점, 클라이언트에서만) ─────────────────────────────────

/**
 * Navigation API `navigate` 이벤트를 관찰해 traverse(back/forward) 네비게이션의
 * `hasUAVisualTransition` 을 기록한다. `navigate` 는 짝이 되는 `popstate` 직전에 발생하므로,
 * `onPopState` 가 이 값을 읽어 UA 가 이미 전환을 그렸는지 정밀 판정한다.
 */
function installNavigateObserver(): void {
  const navigation = (window as Window & { navigation?: EventTarget }).navigation;
  if (!navigation) return; // Navigation API 미지원 → 폴백 휴리스틱 사용
  navigation.addEventListener('navigate', (event: Event) => {
    const navigateEvent = event as NavigateEventLike;
    if (navigateEvent.navigationType !== 'traverse') return;
    const flag = navigateEvent.hasUAVisualTransition;
    lastTraverseNavigate = {
      // 일부 브라우저는 Navigation API 는 있어도 `hasUAVisualTransition` 은 미보고 → supported=false.
      supported: typeof flag === 'boolean',
      hasUAVisualTransition: flag === true,
      at: Date.now(),
    };
  });
}

/**
 * `history.scrollRestoration` 을 `'manual'` 로 강제한다.
 *
 * 기본값 `'auto'` 에서 Chromium 등은 popstate 처리 도중 브라우저 자동 스크롤 복원을 끼워넣어
 * `SVT:call ~ OLD 캡처` 사이에 `window.scrollY` 가 바뀌어 버린다. 그 결과:
 *   - OLD 가 사용자가 보던 위치(B at 0)가 아닌 다른 스크롤(B at NEW_savedY) 에서 캡처돼
 *     슬라이드 아웃되는 OLD 가 시각적으로 점프
 *   - `oldScrollY` 추적값(SVT:call 직전 sync scrollY) 과 실제 OLD 캡처 scrollY 가 어긋나
 *     OLD shift 보정 공식이 잘못된 값을 산출
 *
 * `'manual'` 로 바꿔 브라우저가 끼어들지 못하게 하고, 모든 스크롤 복원은 우리가:
 *   - 인수 popstate: `reportRouteCommitted` 의 `pending` 경로
 *   - 비-인수 popstate (UA 제스처 등): `reportRouteCommitted` 의 `pendingPopstateRestore` 경로
 *   - push: Next 의 ScrollAndFocusHandler (기존대로)
 *
 * Next 의 layout-router 가 후에 다시 `'manual'` 을 덮어쓸 수도 있지만 (현재 버전은 그렇지 않음)
 * 결과는 동일.
 */
function installScrollRestorationOverride(): void {
  if (!('scrollRestoration' in window.history)) return;
  window.history.scrollRestoration = 'manual';
}

function installPopstateViewTransition(): void {
  if (typeof window === 'undefined') return;
  type FlaggedWindow = Window & { __vtPopstateInstalled?: boolean };
  const w = window as FlaggedWindow;
  if (w.__vtPopstateInstalled) return;
  w.__vtPopstateInstalled = true;

  installScrollRestorationOverride();
  installHistoryIndexPatch();
  installNavigateObserver();
  // 모듈 로드 시점 등록 → Next 의 useEffect 리스너보다 먼저 실행되어
  // stopImmediatePropagation() 으로 그들의 처리를 가로챌 수 있다.
  window.addEventListener('popstate', onPopState);
}

installPopstateViewTransition();

// ─── notifier 컴포넌트 ───────────────────────────────────────────────────────

/**
 * 라우트 commit 시점을 popstate 전환 엔진에 보고하는 effect-only 컴포넌트.
 * `usePathname()` 이 바뀌면 = React 가 새 라우트를 commit 했다는 뜻이므로, 대기 중인
 * popstate 전환이 그 시점에 NEW 스냅샷을 캡처하도록 한다.
 *
 * root layout 에 한 번 마운트한다.
 */
export function PopstateViewTransitionNotifier(): null {
  const pathname = usePathname();
  // useLayoutEffect: React commit 직후 paint 전에 실행 — Next 의 urgent RESTORE 가 DOM 만 바꾸고
  // 스크롤은 미복원인 상태로 paint 되는 한 프레임을 차단한다. NEW 스냅샷 캡처(=ready resolve 후)
  // 전에 동기적으로 스크롤이 복원되도록 보장.
  useIsomorphicLayoutEffect(() => {
    reportRouteCommitted(normalizePath(pathname));
  }, [pathname]);
  return null;
}
