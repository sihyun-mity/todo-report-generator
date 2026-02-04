import React from 'react';
import { Plus } from 'lucide-react';
import { Project, Task } from './types';
import ProjectItem from './project-item';

interface ProjectListProps {
  title: string;
  projects: Project[];
  onAddProject: () => void;
  onRemoveProject: (projectId: string) => void;
  onUpdateProjectName: (projectId: string, name: string) => void;
  onAddTask: (projectId: string) => void;
  onUpdateTask: (projectId: string, taskId: string, updates: Partial<Task>) => void;
  onRemoveTask: (projectId: string, taskId: string) => void;
}

const ProjectList = ({
  title,
  projects,
  onAddProject,
  onRemoveProject,
  onUpdateProjectName,
  onAddTask,
  onUpdateTask,
  onRemoveTask,
}: ProjectListProps) => (
  <div className="mb-8 w-full">
    <div className="mb-4 flex items-center justify-between">
      <h2 className="text-xl font-bold text-zinc-800 dark:text-zinc-200">{title}</h2>
      <button
        onClick={onAddProject}
        className="flex cursor-pointer items-center gap-1 rounded-md bg-zinc-100 px-3 py-1 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
      >
        <Plus size={16} /> 프로젝트 추가
      </button>
    </div>
    <div className="space-y-6">
      {projects.map((project) => (
        <ProjectItem
          key={project.id}
          project={project}
          onUpdateName={(name) => onUpdateProjectName(project.id, name)}
          onRemove={() => onRemoveProject(project.id)}
          onAddTask={() => onAddTask(project.id)}
          onUpdateTask={(taskId, updates) => onUpdateTask(project.id, taskId, updates)}
          onRemoveTask={(taskId) => onRemoveTask(project.id, taskId)}
        />
      ))}
    </div>
  </div>
);

export default ProjectList;
