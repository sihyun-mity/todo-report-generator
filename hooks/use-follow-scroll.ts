'use client';

import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react';

// 맨 아래로 간주하는 여유(px) — 이 안에 있으면 새 내용을 따라 스크롤한다
const FOLLOW_THRESHOLD_PX = 24;

type Options<L extends HTMLElement, C extends HTMLElement> = {
  // 내용 높이가 바뀔 때 따라가기 전에 먼저 할 일(예: 목록 높이를 내용에 맞추기)
  onResize?: (list: L, content: C) => void;
  // 이 값이 바뀌면 위로 올려 읽던 중이어도 다시 따라간다(예: 사용자가 새 요청을 보냈을 때)
  resumeKey?: string | null;
};

/**
 * 스트리밍 로그·채팅처럼 내용이 계속 늘어나는 스크롤 목록을, 사용자가 맨 아래를 보고 있을 때만 따라 내려간다.
 *
 * 위로 올렸을 때만 따라가기를 멈추고, 맨 아래에 닿으면 다시 따라간다. 아래로 내려가는 스크롤(새 내용 따라가기·
 * 버튼의 부드러운 스크롤 도중)로는 멈추지 않는다 — 부드러운 스크롤 도중에 새 줄이 생기면 따라가기가 풀리지 않게.
 * 따라가기는 내용 요소의 ResizeObserver 콜백에서 한다 — 레이아웃 직후·그리기 전에 돌아 새 줄이 가려졌다 보이지 않는다.
 * `isFollowing` 이 false 면 맨 아래로 돌아가는 버튼(`scrollToBottom`)을 띄운다.
 */
export function useFollowScroll<L extends HTMLElement = HTMLDivElement, C extends HTMLElement = HTMLDivElement>({
  onResize,
  resumeKey = null,
}: Options<L, C> = {}) {
  const listRef = useRef<L | null>(null);
  const contentRef = useRef<C | null>(null);
  // ResizeObserver 콜백이 읽는 값은 ref, 버튼 표시는 state 로 둔다
  const followRef = useRef(true);
  const [isFollowing, setIsFollowing] = useState(true);
  const lastScrollTopRef = useRef(0);
  const [resumeAnchor, setResumeAnchor] = useState(resumeKey);
  const handleResize = useEffectEvent((list: L, content: C) => onResize?.(list, content));

  if (resumeKey !== resumeAnchor) {
    setResumeAnchor(resumeKey);
    setIsFollowing(true);
  }

  // 렌더 중 바뀐 따라가기(resumeKey)를 다음 ResizeObserver 콜백 전에 ref 로 옮긴다
  useLayoutEffect(() => {
    followRef.current = isFollowing;
  }, [isFollowing]);

  const setFollow = (value: boolean) => {
    followRef.current = value;
    setIsFollowing(value);
  };

  const handleScroll = () => {
    const list = listRef.current;
    if (!list) return;
    const isAtBottom = list.scrollHeight - list.scrollTop - list.clientHeight <= FOLLOW_THRESHOLD_PX;
    if (isAtBottom) setFollow(true);
    else if (list.scrollTop < lastScrollTopRef.current) setFollow(false);
    lastScrollTopRef.current = list.scrollTop;
  };

  const scrollToBottom = () => {
    const list = listRef.current;
    if (!list) return;
    setFollow(true);
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    list.scrollTo({ top: list.scrollHeight, behavior: reduceMotion ? 'auto' : 'smooth' });
  };

  useEffect(() => {
    const list = listRef.current;
    const content = contentRef.current;
    if (!list || !content) return;
    const observer = new ResizeObserver(() => {
      handleResize(list, content);
      if (followRef.current) list.scrollTop = list.scrollHeight;
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  return { listRef, contentRef, isFollowing, handleScroll, scrollToBottom };
}
