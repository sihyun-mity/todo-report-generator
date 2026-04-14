'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Project, Task } from './types';
import TaskItem from './task-item';

interface ProjectItemProps {
  project: Project;
  onUpdateName: (name: string) => void;
  onRemove: () => void;
  onAddTask: (taskId: string) => void;
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void;
  onRemoveTask: (taskId: string) => void;
  canRemove: boolean;
  autoFocus?: boolean;
}

const ProjectItem = ({
  project,
  onUpdateName,
  onRemove,
  onAddTask,
  onUpdateTask,
  onRemoveTask,
  canRemove,
  autoFocus,
}: ProjectItemProps) => {
  const [lastAddedTaskId, setLastAddedTaskId] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus && nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, [autoFocus]);

  const handleAddTask = () => {
    const newTaskId = Math.random().toString(36).substr(2, 9);
    setLastAddedTaskId(newTaskId);
    onAddTask(newTaskId);
  };

  return (
    <div className="rounded-lg border border-zinc-200 p-3 sm:p-4 dark:border-zinc-700/50">
      <div className="mb-4 flex items-center gap-2">
        <input
          ref={nameInputRef}
          type="text"
          placeholder="프로젝트명"
          value={project.name}
          onChange={(e) => onUpdateName(e.target.value)}
          onBlur={(e) => onUpdateName(e.target.value.trim())}
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
        {project.tasks.map((task) => (
          <TaskItem
            key={task.id}
            task={task}
            onUpdate={(updates) => onUpdateTask(task.id, updates)}
            onRemove={() => onRemoveTask(task.id)}
            canRemove={project.tasks.length > 1}
            autoFocus={task.id === lastAddedTaskId}
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

export default ProjectItem;
