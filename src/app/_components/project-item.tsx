'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Project, Task } from '@/types';
import { createId } from '@/utils';
import { TaskItem, type RemoveOptions, type TaskFocusField } from '.';

type ProjectItemProps = {
  project: Project;
  onUpdateName: (name: string) => void;
  onRemove: () => void;
  onAddTask: (taskId: string) => void;
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void;
  onRemoveTask: (taskId: string, options?: RemoveOptions) => void;
  onReorderTasks: (fromId: string, toId: string) => void;
  onBackspaceEmpty?: () => void;
  canRemove: boolean;
  autoFocus?: boolean;
  // 외부(ProjectList)에서 명시적으로 트리거하는 포커스 신호. nonce가 바뀔 때만 동작한다.
  // 'task' 사용 시 externalFocusTaskId로 대상 작업을 지정한다.
  externalFocusField?: 'name' | 'last-task' | 'task' | null;
  externalFocusTaskId?: string;
  externalFocusNonce?: number;
};

type TaskFocus = {
  taskId: string;
  field: TaskFocusField;
  nonce: number;
};

// 한글 IME 조합 중 입력은 조합 확정용이므로 우리 핸들러를 트리거하지 않는다.
const isComposingKey = (e: KeyboardEvent<HTMLInputElement>) => e.nativeEvent.isComposing || e.keyCode === 229;

export const ProjectItem = ({
  project,
  onUpdateName,
  onRemove,
  onAddTask,
  onUpdateTask,
  onRemoveTask,
  onReorderTasks,
  onBackspaceEmpty,
  canRemove,
  autoFocus,
  externalFocusField,
  externalFocusTaskId,
  externalFocusNonce,
}: Readonly<ProjectItemProps>) => {
  const [taskFocus, setTaskFocus] = useState<TaskFocus | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  // DndContext가 자동 생성하는 id가 SSR/CSR에서 달라지면 hydration 경고가 난다 — useId로 고정.
  const tasksDndContextId = useId();

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: project.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  };

  // 작업 목록 정렬 전용 sensor — 프로젝트 sensor와 동일 정책.
  const taskSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    if (autoFocus && nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, [autoFocus]);

  const focusTask = (taskId: string, field: TaskFocusField) => {
    setTaskFocus((prev) => ({ taskId, field, nonce: (prev?.nonce ?? 0) + 1 }));
  };

  // 외부에서 보내는 포커스 신호 처리 — 프로젝트명, 마지막 작업, 또는 특정 작업으로 포커스 이동.
  // nonce가 바뀔 때마다 실행되어 같은 대상도 반복 포커스 가능하다.
  useEffect(() => {
    if (!externalFocusField || !externalFocusNonce) return;
    if (externalFocusField === 'name') {
      nameInputRef.current?.focus();
      return;
    }
    if (externalFocusField === 'task' && externalFocusTaskId) {
      focusTask(externalFocusTaskId, 'content');
      return;
    }
    const lastTask = project.tasks[project.tasks.length - 1];
    if (lastTask) focusTask(lastTask.id, 'content');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalFocusField, externalFocusTaskId, externalFocusNonce]);

  // 새 태스크의 ID를 먼저 생성하여 focus 대상으로 기록한 뒤 추가한다.
  const handleAddTask = () => {
    const newTaskId = createId();
    focusTask(newTaskId, 'content');
    onAddTask(newTaskId);
  };

  const handleNameKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (isComposingKey(e)) return;
    if (e.key === 'Backspace') {
      // 프로젝트명이 비어 있고 모든 작업 내용도 비어 있을 때만 프로젝트 삭제 + 이전 프로젝트로 포커스.
      if (project.name === '' && project.tasks.every((t) => t.content === '') && onBackspaceEmpty) {
        e.preventDefault();
        onBackspaceEmpty();
      }
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const firstTask = project.tasks[0];
      if (firstTask) {
        focusTask(firstTask.id, 'content');
      } else {
        handleAddTask();
      }
    }
  };

  // 빈 작업에서 Backspace: 작업 삭제 + 이전 작업(또는 프로젝트명)으로 포커스 이동.
  // 프로젝트당 최소 1개 작업 규칙은 유지 — 마지막 작업에서는 무시.
  // 빈 작업이라 복원해도 의미가 없으므로 silent로 토스트를 띄우지 않는다.
  const handleTaskContentBackspaceEmpty = (taskId: string, index: number) => {
    if (project.tasks.length <= 1) return;
    if (index > 0) {
      const prevTask = project.tasks[index - 1];
      focusTask(prevTask.id, 'content');
    } else {
      nameInputRef.current?.focus();
    }
    onRemoveTask(taskId, { silent: true });
  };

  const handleTaskContentEnter = (taskId: string, index: number) => {
    const task = project.tasks[index];
    // 기본값 0인 상태에서 Enter를 누르면 작성 완료로 간주해 진행률을 100으로 채운다.
    // 이미 사용자가 직접 다른 값을 넣은 경우엔 유지.
    if (task && task.progress === 0) {
      onUpdateTask(taskId, { progress: 100 });
    }
    const nextTask = project.tasks[index + 1];
    if (nextTask) {
      focusTask(nextTask.id, 'content');
    } else {
      handleAddTask();
    }
  };

  const handleTaskProgressEnter = (index: number) => {
    const nextTask = project.tasks[index + 1];
    if (nextTask) {
      focusTask(nextTask.id, 'content');
    } else {
      handleAddTask();
    }
  };

  const handleTasksDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    onReorderTasks(String(active.id), String(over.id));
  };

  const taskIds = project.tasks.map((t) => t.id);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-lg border border-zinc-200 p-3 sm:p-4 dark:border-zinc-700/50"
    >
      <div className="mb-4 flex items-center gap-1 sm:gap-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label="프로젝트 순서 변경"
          title="드래그해서 순서 변경"
          className="shrink-0 cursor-grab touch-none rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 active:cursor-grabbing dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
        >
          <GripVertical size={18} />
        </button>
        <input
          ref={nameInputRef}
          type="text"
          placeholder="프로젝트명"
          value={project.name}
          enterKeyHint="next"
          onChange={(e) => onUpdateName(e.target.value)}
          onBlur={(e) => onUpdateName(e.target.value.trim())}
          onKeyDown={handleNameKeyDown}
          className="flex-1 rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-base outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700/50 dark:bg-input/40 dark:text-zinc-100 dark:focus:border-blue-500/50"
        />
        <button
          onClick={onRemove}
          disabled={!canRemove}
          className="cursor-pointer rounded-md p-2 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-zinc-400 dark:hover:bg-red-950/30"
          title={canRemove ? '프로젝트 삭제' : '최소 하나의 프로젝트가 필요합니다'}
        >
          <Trash2 size={18} />
        </button>
      </div>
      <div className="ml-2 space-y-3 sm:ml-4">
        <DndContext
          id={tasksDndContextId}
          sensors={taskSensors}
          collisionDetection={closestCenter}
          onDragEnd={handleTasksDragEnd}
        >
          <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
            {project.tasks.map((task, index) => (
              <TaskItem
                key={task.id}
                task={task}
                onUpdate={(updates) => onUpdateTask(task.id, updates)}
                onRemove={() => onRemoveTask(task.id)}
                canRemove={project.tasks.length > 1}
                onContentEnter={() => handleTaskContentEnter(task.id, index)}
                onContentBackspaceEmpty={() => handleTaskContentBackspaceEmpty(task.id, index)}
                onProgressEnter={() => handleTaskProgressEnter(index)}
                focusField={taskFocus?.taskId === task.id ? taskFocus.field : null}
                focusNonce={taskFocus?.taskId === task.id ? taskFocus.nonce : 0}
              />
            ))}
          </SortableContext>
        </DndContext>
        <button
          onClick={handleAddTask}
          className="ml-2 flex cursor-pointer items-center gap-1 text-sm font-medium text-blue-500 transition-colors hover:text-blue-600 sm:ml-4"
        >
          <Plus size={14} /> 작업 추가
        </button>
      </div>
    </div>
  );
};

// DragOverlay에서 그릴 정적 미리보기 — 진행률 input/preset 팝업 등 인터랙션 없는 단순 형태.
export const ProjectItemPreview = ({ project }: Readonly<{ project: Project }>) => (
  <div className="pointer-events-none rounded-lg border border-zinc-200 bg-white p-3 shadow-lg sm:p-4 dark:border-zinc-700/50 dark:bg-zinc-900">
    <div className="mb-4 flex items-center gap-1 sm:gap-2">
      <span className="shrink-0 p-1.5 text-zinc-400">
        <GripVertical size={18} />
      </span>
      <div className="flex-1 truncate rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-base text-zinc-700 dark:border-zinc-700/50 dark:bg-input/40 dark:text-zinc-100">
        {project.name || '프로젝트명'}
      </div>
    </div>
    <div className="ml-2 space-y-2 text-sm text-zinc-500 sm:ml-4 dark:text-zinc-400">
      {project.tasks.slice(0, 3).map((task) => (
        <div key={task.id} className="truncate">
          - {task.content || '작업 내용'} ({task.progress}%)
        </div>
      ))}
      {project.tasks.length > 3 && <div className="truncate">…외 {project.tasks.length - 3}개</div>}
    </div>
  </div>
);
