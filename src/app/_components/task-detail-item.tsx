'use client';

import { useEffect, useRef, type KeyboardEvent } from 'react';
import { GripVertical, Trash2 } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: detail.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    // 드래그 중인 행은 다른 행 위에 떠 있는 효과
    zIndex: isDragging ? 10 : undefined,
  };

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
    <div ref={setNodeRef} style={style} className="flex items-center gap-1 sm:gap-1.5">
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="세부 항목 순서 변경"
        title="드래그해서 순서 변경"
        className="shrink-0 cursor-grab touch-none rounded-md p-0.5 text-zinc-300 transition-colors hover:bg-zinc-100 hover:text-zinc-500 active:cursor-grabbing dark:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
      >
        <GripVertical size={12} />
      </button>
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
        <Trash2 size={14} />
      </button>
    </div>
  );
};

// DragOverlay에서 그릴 정적 미리보기 — 인터랙션 없는 단순 형태.
export const TaskDetailItemPreview = ({ detail }: Readonly<{ detail: TaskDetail }>) => (
  <div className="pointer-events-none flex items-center gap-1 rounded-md bg-white shadow-lg sm:gap-1.5 dark:bg-zinc-900">
    <span className="shrink-0 p-0.5 text-zinc-300 dark:text-zinc-600">
      <GripVertical size={12} />
    </span>
    <div className="min-w-0 flex-1 truncate rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-600 sm:px-2.5 sm:text-sm dark:border-zinc-700/50 dark:text-zinc-300">
      {detail.content || '세부 내용'}
    </div>
  </div>
);
