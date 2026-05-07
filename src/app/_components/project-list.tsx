'use client';

import { useEffect, useId, useState } from 'react';
import { CalendarDays, Plus, Sun } from 'lucide-react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Project, Task } from '@/types';
import { cn, createId, hasProjectContent } from '@/utils';
import { ProjectItem, ProjectItemPreview } from '.';

type Accent = 'today' | 'tomorrow';

// 외부에서 ProjectList로 보내는 포커스 신호. nonce가 변할 때마다 트리거된다.
export type ProjectListFocusRequest =
  | { kind: 'project'; projectId: string; nonce: number }
  | { kind: 'task'; projectId: string; taskId: string; nonce: number };

// silent: true 면 실행 취소 토스트를 띄우지 않고 조용히 삭제만 한다.
// 빈 항목 위에서 Backspace로 삭제하는 경로처럼 복원할 콘텐츠가 없는 경우에 사용.
export type RemoveOptions = { silent?: boolean };

type ProjectListProps = {
  title: string;
  accent: Accent;
  projects: ReadonlyArray<Project>;
  onAddProject: (projectId: string) => void;
  onRemoveProject: (projectId: string, options?: RemoveOptions) => void;
  onUpdateProjectName: (projectId: string, name: string) => void;
  onAddTask: (projectId: string, taskId: string) => void;
  onUpdateTask: (projectId: string, taskId: string, updates: Partial<Task>) => void;
  onRemoveTask: (projectId: string, taskId: string, options?: RemoveOptions) => void;
  onReorderProjects: (fromId: string, toId: string) => void;
  onReorderTasks: (projectId: string, fromId: string, toId: string) => void;
  onImportIncomplete?: () => void;
  focusRequest?: ProjectListFocusRequest | null;
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
  onReorderProjects,
  onReorderTasks,
  onImportIncomplete,
  focusRequest,
}: Readonly<ProjectListProps>) => {
  const [lastAddedProjectId, setLastAddedProjectId] = useState<string | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  // Backspace 삭제 후 이전 항목 포커스, 또는 외부 focusRequest를 sync 받는 통합 상태.
  const [projectFocus, setProjectFocus] = useState<{
    projectId: string;
    field: 'name' | 'last-task' | 'task';
    taskId?: string;
    nonce: number;
  } | null>(null);

  // 외부 focusRequest의 nonce가 바뀔 때마다 내부 projectFocus로 동기화한다.
  useEffect(() => {
    if (!focusRequest) return;
    setProjectFocus(
      focusRequest.kind === 'project'
        ? { projectId: focusRequest.projectId, field: 'name', nonce: focusRequest.nonce }
        : {
            projectId: focusRequest.projectId,
            field: 'task',
            taskId: focusRequest.taskId,
            nonce: focusRequest.nonce,
          }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest?.nonce]);
  // DndContext가 내부적으로 동적 id를 생성하면 SSR/CSR 사이에서 값이 달라져 hydration 경고가 난다.
  // useId로 안정적인 id를 부여해 SSR/CSR 양쪽에서 동일한 markup이 나오도록 한다.
  const dndContextId = useId();

  // 새로 추가된 프로젝트의 ID를 상위에서 받기 전에 미리 생성해두고,
  // 같은 ID를 전달해 ProjectItem에서 autoFocus가 트리거되도록 한다
  const handleAddProject = () => {
    const newProjectId = createId();
    setLastAddedProjectId(newProjectId);
    onAddProject(newProjectId);
  };

  // PointerSensor: 마우스/펜. 8px 이상 움직여야 드래그로 인식 → input 클릭/포커스와 충돌 방지.
  // TouchSensor: 모바일 터치. 200ms 길게 눌러야 드래그 시작 → 스크롤과 충돌 방지.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveProjectId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveProjectId(null);
    if (!over || active.id === over.id) return;
    onReorderProjects(String(active.id), String(over.id));
  };

  const handleDragCancel = () => setActiveProjectId(null);

  // 빈 프로젝트(이름·모든 작업 내용 비어있음)에서 Backspace 시 호출.
  // 이전 프로젝트가 있을 때만 삭제 + 그 프로젝트의 마지막 작업으로 포커스 이동.
  // 빈 항목이라 복원해도 의미가 없으므로 silent로 토스트를 띄우지 않는다.
  const handleProjectBackspaceEmpty = (projectId: string) => {
    const index = projects.findIndex((p) => p.id === projectId);
    if (index <= 0) return;
    const prevProject = projects[index - 1];
    setProjectFocus((prev) => ({
      projectId: prevProject.id,
      field: 'last-task',
      nonce: (prev?.nonce ?? 0) + 1,
    }));
    onRemoveProject(projectId, { silent: true });
  };

  const accentStyles = ACCENT_STYLES[accent];
  const Icon = accent === 'today' ? Sun : CalendarDays;

  // 빈 상태: 프로젝트가 하나뿐이고 내용도 비어 있을 때 가이드를 한 줄 띄운다
  const isEmpty = projects.length === 1 && !hasProjectContent(projects[0]);
  const projectIds = projects.map((p) => p.id);
  const activeProject = activeProjectId ? projects.find((p) => p.id === activeProjectId) : null;

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
      <DndContext
        id={dndContextId}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext items={projectIds} strategy={verticalListSortingStrategy}>
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
                onRemoveTask={(taskId, options) => onRemoveTask(project.id, taskId, options)}
                onReorderTasks={(fromId, toId) => onReorderTasks(project.id, fromId, toId)}
                onBackspaceEmpty={() => handleProjectBackspaceEmpty(project.id)}
                autoFocus={project.id === lastAddedProjectId}
                externalFocusField={projectFocus?.projectId === project.id ? projectFocus.field : null}
                externalFocusTaskId={projectFocus?.projectId === project.id ? projectFocus.taskId : undefined}
                externalFocusNonce={projectFocus?.projectId === project.id ? projectFocus.nonce : 0}
              />
            ))}
          </div>
        </SortableContext>
        <DragOverlay>{activeProject ? <ProjectItemPreview project={activeProject} /> : null}</DragOverlay>
      </DndContext>
    </div>
  );
};
