'use client';

import { type PropsWithChildren, type ViewTransitionClassPerType, ViewTransition } from 'react';
import { useIsClient } from 'usehooks-ts';
import { DEFAULT_PAGE_VIEW_TRANSITION_NAME, NAV_TRANSITION_TYPES } from '@/constants';

/**
 * NavTransitionType 와 동일 이름의 클래스를 pseudo 에 부여하기 위한 enter/exit map.
 * `<ViewTransition>` 가 transitionType 'nav-forward' 를 받으면 pseudo 에 `.nav-forward` 클래스가
 * 적용되고, view-transitions.css 의 `::view-transition-old(.nav-forward)` 셀렉터가 매칭된다.
 *
 * `default: 'none'` — 방향 타입 없이 발생한 navigation 은 directional 클래스를 부여하지 않는다
 * (Link / useRouter 가 모든 navigation 에 타입을 자동 주입하므로 사실상 닿지 않는 안전 폴백).
 */
const ENTER_EXIT_MAP: ViewTransitionClassPerType = {
  default: 'none',
  ...Object.fromEntries(NAV_TRANSITION_TYPES.map((t) => [t, t])),
};

/**
 * View Transition 시작/종료 시점에 `<html>` 을 후킹한다. push/pop/popstate 모든 경로의
 * 전환이 `document.startViewTransition` 한 곳을 통과하므로 여기 한 번에서 다음을 처리한다:
 *
 * 1. **스크롤 오프셋 (`--vt-old-shift`)**
 *    `page-shell` view-transition-name 은 페이지 콘텐츠 전체 높이를 갖는 div 에 붙어 있다.
 *    스크롤이 내려간 상태에서 navigation 하면 `::view-transition-group(page-shell)` 가
 *    NEW 페이지 기준(top:0)으로 즉시 스냅되며, OLD 스냅샷이 최상단으로 끌어올려져
 *    "스크롤이 풀린 채" 옆으로 넘어가는 부자연스러운 전환이 발생한다. startViewTransition
 *    호출 시점(=OLD 캡처 직전, 같은 프레임이라 스크롤 값이 변하지 않는다)의 window.scrollY 를
 *    음수 px 로 기록 → view-transitions.css 의 OLD 키프레임이 translateY 로 보정.
 *
 * 2. **입력 락 (`.vt-in-flight`)**
 *    전환이 진행되는 동안 `<html>` 에 클래스를 부여 → CSS 가 `pointer-events: none` 으로 입력 차단.
 *    네이티브 NavigationController 와 동일하게 애니메이션 도중 추가 네비게이션이 끼어들지 않게 한다.
 *    이 락이 없으면 (a) push 도중 다른 Link 클릭 시 React 가 새 transition 으로 직전 transition 을
 *    skip 시켜 화면이 끊기고, (b) popstate 인수 도중 forward push 가 발생하면 우리가 다루고 있던
 *    SVT 가 reject 되어 `popstate-view-transition` 의 큐/페닝 상태가 꼬인다.
 *    `prefers-reduced-motion` 환경은 transition 자체가 0.01ms 라 락도 같이 즉시 풀린다.
 */
function patchStartViewTransition(): void {
  if (typeof document === 'undefined') return;

  type PatchableDocument = Document & {
    startViewTransition?: ((...args: Array<unknown>) => { finished?: Promise<unknown> }) & {
      __vtPatched?: boolean;
    };
  };

  const doc = document as PatchableDocument;
  const original = doc.startViewTransition;
  if (typeof original !== 'function' || original.__vtPatched) return;

  const patched = function patchedStartViewTransition(this: Document, ...args: Array<unknown>) {
    const root = document.documentElement;
    root.style.setProperty('--vt-old-shift', `${-Math.round(window.scrollY)}px`);
    root.classList.add('vt-in-flight');

    const transition = original.apply(this, args);
    // 전환 종료(성공/스킵/실패) 후 흔적 제거 — 다음 렌더에 잔존 값이 새지 않도록.
    transition?.finished?.finally(() => {
      root.style.removeProperty('--vt-old-shift');
      root.classList.remove('vt-in-flight');
    });
    return transition;
  } as PatchableDocument['startViewTransition'];

  patched!.__vtPatched = true;
  doc.startViewTransition = patched;
}

// 'use client' 모듈이라 클라이언트에서만 실행된다. navigation 발생 전(모듈 import 시점)에
// 패치를 설치해 첫 전환부터 보정이 적용되도록 한다.
patchStartViewTransition();

type Props = PropsWithChildren<{
  /**
   * `<ViewTransition>` 에 부여될 group name. transition snapshot 단위가 되며 동일 이름의
   * `::view-transition-group(...)` CSS 셀렉터와 짝을 이룬다.
   */
  name?: string;
}>;

/**
 * Next 16 + React `<ViewTransition>` wrapper.
 *
 * Link · useRouter 가 주입한 `transitionTypes` 가 navigation 시 React transition 으로 전달되고,
 * 이 wrapper 가 트리에 있으면 React 가 commit 시점에 `document.startViewTransition` 을 자동
 * 호출해 `::view-transition-old(.nav-*)` / `::view-transition-new(.nav-*)` 셀렉터로 정의된
 * 슬라이드 애니메이션이 실행된다.
 *
 * SSR + 초기 hydration 단계에서는 fragment 로 children 만 패스해 RSC 트리와 정확히 일치시키고,
 * hydration 이 끝난 뒤(`useIsClient`) 비로소 ViewTransition wrapping 을 활성화한다. 이렇게 하지
 * 않으면 초기 페이지가 hydration 되기 전에 사용자가 다른 페이지로 navigation 했을 때
 * `<ViewTransition>` 가 만든 fiber 가 RSC 트리와 어긋나며 hydration 오류가 발생한다.
 */
export function PageViewTransition({ children, name = DEFAULT_PAGE_VIEW_TRANSITION_NAME }: Readonly<Props>) {
  const isClient = useIsClient();

  if (!isClient) {
    return <>{children}</>;
  }
  return (
    <ViewTransition enter={ENTER_EXIT_MAP} exit={ENTER_EXIT_MAP} name={name}>
      {children}
    </ViewTransition>
  );
}
