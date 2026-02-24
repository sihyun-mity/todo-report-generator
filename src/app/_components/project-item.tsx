import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Project, Task } from './types';
import TaskItem from './task-item';

interface ProjectItemProps {
  project: Project;
  onUpdateName: (name: string) => void;
  onRemove: () => void;
  onAddTask: () => void;
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void;
  onRemoveTask: (taskId: string) => void;
}

const ProjectItem = ({ project, onUpdateName, onRemove, onAddTask, onUpdateTask, onRemoveTask }: ProjectItemProps) => {
  return (
    <div className="rounded-lg border border-zinc-200 p-3 sm:p-4 dark:border-zinc-800">
      <div className="mb-4 flex items-center gap-2">
        <input
          type="text"
          placeholder="프로젝트명"
          value={project.name}
          onChange={(e) => onUpdateName(e.target.value)}
          onBlur={(e) => onUpdateName(e.target.value.trim())}
          className="flex-1 rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-base outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:text-zinc-100"
        />
        <button
          onClick={onRemove}
          className="cursor-pointer rounded-md p-2 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
          title="프로젝트 삭제"
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
          />
        ))}
        <button
          onClick={onAddTask}
          className="ml-2 flex cursor-pointer items-center gap-1 text-sm font-medium text-blue-500 transition-colors hover:text-blue-600 sm:ml-4"
        >
          <Plus size={14} /> 작업 추가
        </button>
      </div>
    </div>
  );
};

export default ProjectItem;
