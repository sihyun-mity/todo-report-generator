'use client';

import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { GripVertical, ListPlus, Trash2 } from 'lucide-react';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Task } from '@/types';
import { cn, createId } from '@/utils';
import { useAgentHighlightStore } from '@/stores';
import { useSignalEffect } from '@/hooks';
import { ProgressInput, TaskDetailItem, type RemoveOptions } from '.';

export type TaskFocusField = 'content' | 'progress' | 'detail';

type TaskItemProps = {
  task: Task;
  // 접근성 이름 접두어 (예: "금일 프로젝트 1 작업 2")
  label: string;
  onUpdate: (updates: Partial<Task>) => void;
  onRemove: () => void;
  canRemove: boolean;
  onAddDetail: (detailId: string) => void;
  onUpdateDetail: (detailId: string, content: string) => void;
  onRemoveDetail: (detailId: string, options?: RemoveOptions) => void;
  onContentEnter?: () => void;
  onContentBackspaceEmpty?: () => void;
  onProgressEnter?: () => void;
  focusField?: TaskFocusField | null;
  // focusField가 'detail'일 때 포커스할 세부 항목 id.
  focusDetailId?: string;
  focusNonce?: number;
};

// 세부 항목(소분류) 포커스 신호 — nonce가 바뀔 때마다 해당 항목으로 포커스를 옮긴다.
type DetailFocus = {
  detailId: string;
  nonce: number;
};

// 한글 IME 조합 중 입력은 조합 확정용이므로 우리 핸들러를 트리거하지 않는다.
const isComposingKey = (e: KeyboardEvent<HTMLInputElement>) => e.nativeEvent.isComposing || e.keyCode === 229;

export const TaskItem = ({
  task,
  label,
  onUpdate,
  onRemove,
  canRemove,
  onAddDetail,
  onUpdateDetail,
  onRemoveDetail,
  onContentEnter,
  onContentBackspaceEmpty,
  onProgressEnter,
  focusField,
  focusDetailId,
  focusNonce,
}: Readonly<TaskItemProps>) => {
  const contentRef = useRef<HTMLInputElement>(null);
  const progressInputRef = useRef<HTMLInputElement>(null);
  const [detailFocus, setDetailFocus] = useState<DetailFocus | null>(null);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    // 드래그 중인 행은 다른 행 위에 떠 있는 효과
    zIndex: isDragging ? 10 : undefined,
  };

  useSignalEffect(focusField ? `${focusField}|${focusNonce ?? 0}` : null, () => {
    if (focusField === 'content') contentRef.current?.focus();
    else if (focusField === 'progress') progressInputRef.current?.focus();
  });

  const handleContentKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (isComposingKey(e)) return;
    if (e.key === 'Backspace') {
      // 빈 입력 상태에서 Backspace는 작업 삭제 + 이전 항목 포커스 이동을 트리거한다.
      if (task.content === '' && onContentBackspaceEmpty) {
        e.preventDefault();
        onContentBackspaceEmpty();
      }
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      onContentEnter?.();
    }
  };

  const focusDetail = (detailId: string) => {
    setDetailFocus((prev) => ({ detailId, nonce: (prev?.nonce ?? 0) + 1 }));
  };

  // 외부(실행 취소 토스트 등)에서 특정 세부 항목으로 보내는 포커스 신호를 내부 detailFocus로 합친다.
  // effect 안에서 setState하지 않고(react-hooks/set-state-in-effect), anchor state + 렌더 중 비교로
  // "prop nonce가 바뀐 렌더"에서 1회만 보정한다. 내부 신호(추가·Enter·Backspace)와 nonce 카운터가
  // 달라 단순 비교로는 최신 신호를 가릴 수 없으므로, 외부 신호를 내부 카운터로 흡수해 하나로 만든다.
  const [externalNonceAnchor, setExternalNonceAnchor] = useState(focusNonce);
  if (focusNonce !== externalNonceAnchor) {
    setExternalNonceAnchor(focusNonce);
    if (focusField === 'detail' && focusDetailId) focusDetail(focusDetailId);
  }

  // 작업 내용이 비어 있으면 세부 항목을 붙일 상위 항목이 없는 셈이라, 보고서 텍스트에
  // `- 작업 내용 (0%)` 플레이스홀더 아래 세부 항목만 매달린 깨진 양식이 만들어진다.
  // 추가 버튼과 Enter 로 이어 만드는 경로 양쪽 모두를 이 값으로 막는다.
  const canAddDetail = task.content.trim() !== '';

  // 새 세부 항목의 ID를 먼저 생성해 focus 대상으로 기록한 뒤 추가한다 (작업 추가와 동일한 패턴).
  const handleAddDetail = () => {
    if (!canAddDetail) return;
    const newDetailId = createId();
    focusDetail(newDetailId);
    onAddDetail(newDetailId);
  };

  const handleDetailEnter = (index: number) => {
    const nextDetail = task.details[index + 1];
    if (nextDetail) focusDetail(nextDetail.id);
    else handleAddDetail();
  };

  // 빈 세부 항목에서 Backspace: 삭제 + 이전 세부 항목(또는 작업 내용)으로 포커스 이동.
  // 세부 항목은 최소 개수 제약이 없어 마지막 하나도 삭제할 수 있다.
  const handleDetailBackspaceEmpty = (detailId: string, index: number) => {
    if (index > 0) focusDetail(task.details[index - 1].id);
    else contentRef.current?.focus();
    // 빈 세부 항목이라 복원해도 의미가 없으므로 silent로 토스트를 띄우지 않는다.
    onRemoveDetail(detailId, { silent: true });
  };

  // SortableContext items는 참조가 안정적이어야 한다 — 매 렌더 새 배열이면 dnd-kit이 매 프레임
  // "항목 변경"으로 오인해(itemsHaveChanged) 변위되는 세부 항목의 transition을 꺼 애니메이션 없이 점프한다.
  const detailIds = useMemo(() => task.details.map((d) => d.id), [task.details]);
  const isAgentChanged = useAgentHighlightStore((s) => s.ids.has(task.id));

  return (
    <div ref={setNodeRef} style={style}>
      <div
        // AI 도우미가 바꾼 작업이면 잠깐 강조한다. key 로 다시 그리지 않는다 — 입력칸이 다시 마운트돼 포커스를 잃는다.
        className={cn('flex items-center gap-1 rounded-md sm:gap-1.5', isAgentChanged && 'animate-agent-flash')}
      >
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label="작업 순서 변경"
          title="드래그해서 순서 변경"
          className="shrink-0 cursor-grab touch-none rounded-md p-1 text-zinc-300 transition-colors hover:bg-zinc-100 hover:text-zinc-500 active:cursor-grabbing dark:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
        >
          <GripVertical size={14} />
        </button>
        <input
          ref={contentRef}
          type="text"
          placeholder="작업 내용"
          aria-label={`${label} 내용`}
          value={task.content}
          enterKeyHint="next"
          onChange={(e) => onUpdate({ content: e.target.value })}
          onBlur={(e) => onUpdate({ content: e.target.value.trim() })}
          onKeyDown={handleContentKeyDown}
          className="min-w-0 flex-1 rounded-md border border-zinc-200 bg-transparent px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 sm:px-3 dark:border-zinc-700/50 dark:bg-input/30 dark:text-zinc-200 dark:focus:border-blue-500/50"
        />
        <ProgressInput
          ref={progressInputRef}
          value={task.progress}
          onChange={(progress) => onUpdate({ progress })}
          onEnter={onProgressEnter}
          ariaLabel={`${label} 진행률(%)`}
        />
        <button
          type="button"
          onClick={handleAddDetail}
          disabled={!canAddDetail}
          aria-label={`${label}에 세부 항목 추가`}
          className="shrink-0 cursor-pointer rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-blue-50 hover:text-blue-500 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-zinc-400 dark:hover:bg-blue-950/30"
          title={canAddDetail ? '세부 항목 추가' : '작업 내용을 먼저 입력해주세요'}
        >
          <ListPlus size={16} />
        </button>
        <button
          onClick={onRemove}
          aria-label={`${label} 삭제`}
          className="shrink-0 cursor-pointer rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-red-950/30"
          disabled={!canRemove}
          title="작업 삭제"
        >
          <Trash2 size={16} />
        </button>
      </div>
      {task.details.length > 0 && (
        // 세부 항목은 작업 내용 input 시작선에 맞춰 한 단계 더 들여쓴다 (grip 버튼 폭 + gap).
        <div className="mt-2 ml-6 space-y-2 sm:ml-8">
          {/* 세부 항목 정렬·작업 간 이동은 상위 ProjectBoard의 단일 DndContext가 처리한다.
              여기서는 SortableContext 등록만 담당한다. */}
          <SortableContext items={detailIds} strategy={verticalListSortingStrategy}>
            {task.details.map((detail, index) => (
              <TaskDetailItem
                key={detail.id}
                detail={detail}
                label={`${label} 세부 항목 ${index + 1}`}
                onUpdate={(content) => onUpdateDetail(detail.id, content)}
                onRemove={() => onRemoveDetail(detail.id)}
                onEnter={() => handleDetailEnter(index)}
                onBackspaceEmpty={() => handleDetailBackspaceEmpty(detail.id, index)}
                isFocused={detailFocus?.detailId === detail.id}
                focusNonce={detailFocus?.detailId === detail.id ? detailFocus.nonce : 0}
              />
            ))}
          </SortableContext>
        </div>
      )}
    </div>
  );
};

// DragOverlay에서 그릴 정적 미리보기 — 진행률 input/preset 팝업 등 인터랙션 없는 단순 형태.
export const TaskItemPreview = ({ task }: Readonly<{ task: Task }>) => (
  <div className="pointer-events-none rounded-md bg-white shadow-lg dark:bg-zinc-900">
    <div className="flex items-center gap-1 sm:gap-1.5">
      <span className="shrink-0 p-1 text-zinc-300 dark:text-zinc-600">
        <GripVertical size={14} />
      </span>
      <div className="min-w-0 flex-1 truncate rounded-md border border-zinc-200 px-2 py-1.5 text-sm text-zinc-700 sm:px-3 dark:border-zinc-700/50 dark:text-zinc-200">
        {task.content || '작업 내용'}
      </div>
      <div className="w-14 shrink-0 rounded-md border border-zinc-200 py-1.5 pr-2 pl-1 text-right text-sm text-zinc-500 sm:w-20 dark:border-zinc-700/50 dark:text-zinc-400">
        {task.progress}%
      </div>
    </div>
    {/* 작업을 드래그하면 세부 항목도 함께 따라간다 — 몇 개가 딸려 오는지 미리보기에 표시한다. */}
    {task.details.length > 0 && (
      <div className="mt-1 ml-6 truncate text-xs text-zinc-400 sm:ml-8 dark:text-zinc-500">
        · 세부 항목 {task.details.length}개
      </div>
    )}
  </div>
);
