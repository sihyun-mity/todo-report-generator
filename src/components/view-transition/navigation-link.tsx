'use client';

import NextLink from 'next/link';
import { usePathname } from 'next/navigation';
import type { ComponentProps } from 'react';
import { resolveTransitionTypes } from '@/utils';

type NextLinkProps = ComponentProps<typeof NextLink>;

/**
 * `next/link` 의 Link 를 감싸 View Transition 방향(`transitionTypes`)을 자동 주입한다.
 *
 * - `transitionTypes` 를 명시하면(빈 배열 포함) 그대로 사용한다.
 * - 생략하면 현재 경로 → href 경로의 depth 관계로 nav-forward / nav-back 을 자동 추론한다.
 *
 * 주입된 `transitionTypes` 는 Next 의 navigation transition 으로 전달되고, root layout 의
 * `<PageViewTransition>` 가 이를 받아 iOS 스타일 push/pop 슬라이드를 실행한다.
 */
export function Link({ transitionTypes: explicit, ...rest }: Readonly<NextLinkProps>) {
  const pathname = usePathname();
  const resolved = resolveTransitionTypes(pathname, rest.href, explicit);
  return <NextLink {...rest} transitionTypes={resolved} />;
}
