import type { NavTransitionType } from '@/types';

/**
 * 쿼리·해시를 제거하고 trailing slash 를 정리한 path 를 돌려준다.
 * depth 비교가 path segment 만 보도록 normalize 한다.
 */
export function normalizePath(input: string | undefined | null): string {
  if (!input) return '/';
  const noQuery = input.split('?')[0]?.split('#')[0] ?? '/';
  const stripped = noQuery || '/';
  return stripped.endsWith('/') && stripped !== '/' ? stripped.slice(0, -1) : stripped;
}

function segments(path: string): Array<string> {
  return path.split('/').filter(Boolean);
}

/**
 * iOS 스타일 push/pop 방향 판정.
 *
 * - target 이 current 의 prefix 면 pop (`/settings/email` → `/settings`)
 * - current 가 target 의 prefix 면 push (`/settings` → `/settings/email`)
 * - 그 외에는 segment depth 로 비교 (depth ↑ = push). depth ↓ 는 pop 으로 판정하지 않는다 —
 *   prefix 관계가 아닌 한 Link 이동은 히스토리 push 이므로 forward 로 본다.
 * - depth >= 2 인 동일 depth 경로에서 앞쪽 segment 가 모두 같고 마지막 segment 한 자리만 다르면
 *   (`/whats-new/1` ↔ `/whats-new/2`) 같은 라우트의 dynamic 인스턴스 swap 으로 보고 transition 을
 *   끈다 → undefined 반환.
 * - depth 동일 + prefix 무관 (`/login` ↔ `/signup` 등) 은 push 로 fallback.
 *   iOS 페이지 전환은 항상 슬라이드가 기본이고 fade 는 일반적이지 않다. fade 가 필요하면 호출자가
 *   `transitionTypes={['nav-fade']}` 로 명시한다.
 *
 * 같은 path 면 undefined 반환 → transition 미적용.
 */
export function computeNavTransitionType(currentRaw: string, targetRaw: string): NavTransitionType | undefined {
  const current = normalizePath(currentRaw);
  const target = normalizePath(targetRaw);

  if (current === target) return undefined;

  if (current === '/' && target !== '/') return 'nav-forward';
  if (target === '/' && current !== '/') return 'nav-back';

  const cSegs = segments(current);
  const tSegs = segments(target);

  const cPrefixOfT = tSegs.length > cSegs.length && cSegs.every((s, i) => s === tSegs[i]);
  if (cPrefixOfT) return 'nav-forward';

  const tPrefixOfC = cSegs.length > tSegs.length && tSegs.every((s, i) => s === cSegs[i]);
  if (tPrefixOfC) return 'nav-back';

  if (tSegs.length > cSegs.length) return 'nav-forward';

  // depth 동일 + depth >= 2 + 앞쪽 segment 모두 같고 마지막 segment 만 다름 — 같은 라우트의
  // dynamic 값 swap 으로 본다 (예: /whats-new/1 → /whats-new/2). 슬라이드가 어색하므로 transition off.
  if (cSegs.length >= 2) {
    const lastIdx = cSegs.length - 1;
    const leadingMatch = cSegs.slice(0, lastIdx).every((s, i) => s === tSegs[i]);
    if (leadingMatch && cSegs[lastIdx] !== tSegs[lastIdx]) return undefined;
  }

  // depth 동일 + 위 조건 미해당 (top-level 페이지 swap 등) — iOS 스타일에 맞게 push 로 통일.
  return 'nav-forward';
}

/**
 * href 가 string | UrlObject 어떤 형태든 path 만 뽑아낸다.
 *
 * UrlObject 에서 pathname 도 href 도 명시되지 않은 경우(같은 페이지에서 query/hash 만 갱신) 는
 * `fallback` 을 그대로 반환한다. 호출자가 currentPath 를 fallback 으로 넘기면
 * `computeNavTransitionType` 이 current === target 으로 보고 transition 을 끈다.
 */
export function extractHrefPath(href: unknown, fallback: string = '/'): string {
  if (typeof href === 'string') return href;
  if (href && typeof href === 'object') {
    const obj = href as { pathname?: string; href?: string };
    return obj.pathname ?? obj.href ?? fallback;
  }
  return fallback;
}

/**
 * Link / useRouter 가 navigation 시 넘길 `transitionTypes` 를 확정한다.
 * - explicit 이 주어지면(빈 배열 포함) 그대로 사용 — `[]` 는 transition 미적용 의도.
 * - explicit 이 undefined 면 current → target path 로 방향을 자동 추론한다.
 */
export function resolveTransitionTypes(
  currentPath: string,
  href: unknown,
  explicit: ReadonlyArray<string> | undefined
): Array<string> | undefined {
  if (explicit !== undefined) return [...explicit];
  // pathname 미명시(query/hash 만 변경) 인 경우 currentPath 를 fallback 으로 넘겨 같은 페이지로 처리.
  const targetPath = extractHrefPath(href, currentPath);
  const inferred = computeNavTransitionType(currentPath, targetPath);
  return inferred ? [inferred] : undefined;
}
