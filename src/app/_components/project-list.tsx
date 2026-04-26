'use client';

import { useState } from 'react';
import { CalendarDays, Plus, Sun } from 'lucide-react';
import type { Project, Task } from '@/types';
import { cn, createId, hasProjectContent } from '@/utils';
import { ProjectItem } from '.';

type Accent = 'today' | 'tomorrow';

type ProjectListProps = {
  title: string;
  accent: Accent;
  projects: ReadonlyArray<Project>;
  onAddProject: (projectId: string) => void;
  onRemoveProject: (projectId: string) => void;
  onUpdateProjectName: (projectId: string, name: string) => void;
  onAddTask: (projectId: string, taskId: string) => void;
  onUpdateTask: (projectId: string, taskId: string, updates: Partial<Task>) => void;
  onRemoveTask: (projectId: string, taskId: string) => void;
  onImportIncomplete?: () => void;
};

const ACCENT_STYLES: Record<Accent, { stripe: string; iconWrap: string }> = {
  today: {
    stripe: 'bg-blue-500 dark:bg-blue-400',
    iconWrap: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  },
  tomorrow: {
    stripe: 'bg-emerald-500 dark:bg-emerald-400',
    iconWrap: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
  },
};

export const ProjectList = ({
  title,
  accent,
  projects,
  onAddProject,
  onRemoveProject,
  onUpdateProjectName,
  onAddTask,
  onUpdateTask,
  onRemoveTask,
  onImportIncomplete,
}: Readonly<ProjectListProps>) => {
  const [lastAddedProjectId, setLastAddedProjectId] = useState<string | null>(null);

  // 새로 추가된 프로젝트의 ID를 상위에서 받기 전에 미리 생성해두고,
  // 같은 ID를 전달해 ProjectItem에서 autoFocus가 트리거되도록 한다
  const handleAddProject = () => {
    const newProjectId = createId();
    setLastAddedProjectId(newProjectId);
    onAddProject(newProjectId);
  };

  const accentStyles = ACCENT_STYLES[accent];
  const Icon = accent === 'today' ? Sun : CalendarDays;

  // 빈 상태: 프로젝트가 하나뿐이고 내용도 비어 있을 때 가이드를 한 줄 띄운다
  const isEmpty = projects.length === 1 && !hasProjectContent(projects[0]);

  return (
    <div className="mb-8 w-full">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className={cn('h-5 w-1 rounded-full', accentStyles.stripe)} aria-hidden />
          <span className={cn('flex h-7 w-7 items-center justify-center rounded-md', accentStyles.iconWrap)}>
            <Icon size={14} />
          </span>
          <h2 className="text-xl font-bold text-zinc-800 dark:text-zinc-200">{title}</h2>
        </div>
        <div className="flex gap-2">
          {onImportIncomplete && (
            <button
              onClick={onImportIncomplete}
              className="flex cursor-pointer items-center gap-1 rounded-md bg-blue-50 px-3 py-1 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50"
            >
              <Plus size={16} /> 미완료 업무 가져오기
            </button>
          )}
          <button
            onClick={handleAddProject}
            className="flex cursor-pointer items-center gap-1 rounded-md bg-zinc-100 px-3 py-1 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
          >
            <Plus size={16} /> 프로젝트 추가
          </button>
        </div>
      </div>
      {isEmpty && (
        <p className="mb-3 text-xs text-zinc-400 dark:text-zinc-500">
          프로젝트명을 입력하고 작업을 한 줄씩 추가해 보세요.
        </p>
      )}
      <div className="space-y-6">
        {projects.map((project) => (
          <ProjectItem
            key={project.id}
            project={project}
            onUpdateName={(name) => onUpdateProjectName(project.id, name)}
            onRemove={() => onRemoveProject(project.id)}
            canRemove={projects.length > 1}
            onAddTask={(taskId) => onAddTask(project.id, taskId)}
            onUpdateTask={(taskId, updates) => onUpdateTask(project.id, taskId, updates)}
            onRemoveTask={(taskId) => onRemoveTask(project.id, taskId)}
            autoFocus={project.id === lastAddedProjectId}
          />
        ))}
      </div>
    </div>
  );
};
