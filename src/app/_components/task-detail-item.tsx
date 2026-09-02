'use client';

import { useEffect, useRef, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import type { TaskDetail } from '@/types';

type TaskDetailItemProps = {
  detail: TaskDetail;
  onUpdate: (content: string) => void;
  onRemove: () => void;
  onEnter?: () => void;
  onBackspaceEmpty?: () => void;
  // 외부에서 보내는 포커스 신호. nonce가 바뀔 때만 동작한다.
  isFocused?: boolean;
  focusNonce?: number;
};

// 한글 IME 조합 중 입력은 조합 확정용이므로 우리 핸들러를 트리거하지 않는다.
const isComposingKey = (e: KeyboardEvent<HTMLInputElement>) => e.nativeEvent.isComposing || e.keyCode === 229;

// 작업(중분류) 아래에 붙는 세부 항목(소분류) 한 줄.
// 진행률이 없고 내용만 갖기 때문에 작업 행보다 한 단계 작은 크기로 렌더한다.
export const TaskDetailItem = ({
  detail,
  onUpdate,
  onRemove,
  onEnter,
  onBackspaceEmpty,
  isFocused,
  focusNonce,
}: Readonly<TaskDetailItemProps>) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isFocused) inputRef.current?.focus();
  }, [isFocused, focusNonce]);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (isComposingKey(e)) return;
    if (e.key === 'Backspace') {
      // 빈 입력 상태에서 Backspace는 세부 항목 삭제 + 이전 항목 포커스 이동을 트리거한다.
      if (detail.content === '' && onBackspaceEmpty) {
        e.preventDefault();
        onBackspaceEmpty();
      }
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      onEnter?.();
    }
  };

  return (
    <div className="flex items-center gap-1 sm:gap-1.5">
      <span aria-hidden className="shrink-0 px-1 text-xs text-zinc-300 dark:text-zinc-600">
        ·
      </span>
      <input
        ref={inputRef}
        type="text"
        placeholder="세부 내용"
        value={detail.content}
        enterKeyHint="next"
        onChange={(e) => onUpdate(e.target.value)}
        onBlur={(e) => onUpdate(e.target.value.trim())}
        onKeyDown={handleKeyDown}
        className="min-w-0 flex-1 rounded-md border border-zinc-200 bg-transparent px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-500 sm:px-2.5 sm:text-sm dark:border-zinc-700/50 dark:bg-input/20 dark:text-zinc-300 dark:focus:border-blue-500/50"
      />
      <button
        type="button"
        onClick={onRemove}
        title="세부 항목 삭제"
        className="shrink-0 cursor-pointer rounded-md p-1 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
      >
        <X size={14} />
      </button>
    </div>
  );
};
