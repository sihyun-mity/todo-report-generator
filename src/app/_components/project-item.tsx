'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { Project, Task } from '@/types';
import { createId } from '@/utils';
import { TaskItem, type TaskFocusField } from '.';

type ProjectItemProps = {
  project: Project;
  onUpdateName: (name: string) => void;
  onRemove: () => void;
  onAddTask: (taskId: string) => void;
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void;
  onRemoveTask: (taskId: string) => void;
  canRemove: boolean;
  autoFocus?: boolean;
};

type TaskFocus = {
  taskId: string;
  field: TaskFocusField;
  nonce: number;
};

// 한글 IME 조합 중 Enter는 조합 확정용이므로 우리 핸들러를 트리거하지 않는다.
const isCompositionEnter = (e: KeyboardEvent<HTMLInputElement>) => e.nativeEvent.isComposing || e.keyCode === 229;

export const ProjectItem = ({
  project,
  onUpdateName,
  onRemove,
  onAddTask,
  onUpdateTask,
  onRemoveTask,
  canRemove,
  autoFocus,
}: Readonly<ProjectItemProps>) => {
  const [taskFocus, setTaskFocus] = useState<TaskFocus | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus && nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, [autoFocus]);

  const focusTask = (taskId: string, field: TaskFocusField) => {
    setTaskFocus((prev) => ({ taskId, field, nonce: (prev?.nonce ?? 0) + 1 }));
  };

  // 새 태스크의 ID를 먼저 생성하여 focus 대상으로 기록한 뒤 추가한다.
  const handleAddTask = () => {
    const newTaskId = createId();
    focusTask(newTaskId, 'content');
    onAddTask(newTaskId);
  };

  const handleNameKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || isCompositionEnter(e)) return;
    e.preventDefault();
    const firstTask = project.tasks[0];
    if (firstTask) {
      focusTask(firstTask.id, 'content');
    } else {
      handleAddTask();
    }
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

  return (
    <div className="rounded-lg border border-zinc-200 p-3 sm:p-4 dark:border-zinc-700/50">
      <div className="mb-4 flex items-center gap-2">
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
        {project.tasks.map((task, index) => (
          <TaskItem
            key={task.id}
            task={task}
            onUpdate={(updates) => onUpdateTask(task.id, updates)}
            onRemove={() => onRemoveTask(task.id)}
            canRemove={project.tasks.length > 1}
            onContentEnter={() => handleTaskContentEnter(task.id, index)}
            onProgressEnter={() => handleTaskProgressEnter(index)}
            focusField={taskFocus?.taskId === task.id ? taskFocus.field : null}
            focusNonce={taskFocus?.taskId === task.id ? taskFocus.nonce : 0}
          />
        ))}
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
