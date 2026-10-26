'use client';

import { useId, useMemo, useState } from 'react';
import { CalendarDays, Github, Plus, Sun } from 'lucide-react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Project, Task } from '@/types';
import { cn, createId, hasProjectContent } from '@/utils';
import { ProjectItem } from '.';

type Accent = 'today' | 'tomorrow';

// 보조기술·DOM 기반 에이전트가 같은 모양의 입력칸들을 구분할 수 있도록 접근성 이름 앞에 붙이는 버킷 이름.
const ACCENT_LABELS: Record<Accent, string> = { today: '금일', tomorrow: '익일' };

// 외부에서 ProjectList로 보내는 포커스 신호. nonce가 변할 때마다 트리거된다.
export type ProjectListFocusRequest =
  | { kind: 'project'; projectId: string; nonce: number }
  | { kind: 'task'; projectId: string; taskId: string; nonce: number }
  | { kind: 'detail'; projectId: string; taskId: string; detailId: string; nonce: number };

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
  onAddDetail: (projectId: string, taskId: string, detailId: string) => void;
  onUpdateDetail: (projectId: string, taskId: string, detailId: string, content: string) => void;
  onRemoveDetail: (projectId: string, taskId: string, detailId: string, options?: RemoveOptions) => void;
  onImportIncomplete?: () => void;
  onImportGithub?: () => void;
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
  onAddDetail,
  onUpdateDetail,
  onRemoveDetail,
  onImportIncomplete,
  onImportGithub,
  focusRequest,
}: Readonly<ProjectListProps>) => {
  const [lastAddedProjectId, setLastAddedProjectId] = useState<string | null>(null);
  const headingId = useId();
  const sectionLabel = ACCENT_LABELS[accent];
  // 버킷 전체를 droppable로 등록 — 비어 있어도 다른 버킷에서 끌어온 프로젝트를 받을 수 있다.
  const { setNodeRef: setDroppableRef } = useDroppable({ id: accent });
  // Backspace 삭제 후 이전 항목 포커스, 또는 외부 focusRequest를 sync 받는 통합 상태.
  const [projectFocus, setProjectFocus] = useState<{
    projectId: string;
    field: 'name' | 'last-task' | 'task' | 'detail';
    taskId?: string;
    detailId?: string;
    nonce: number;
  } | null>(null);

  // 외부 focusRequest의 nonce가 바뀔 때마다 내부 projectFocus로 동기화한다.
  // effect 대신 anchor state + 렌더 중 비교로 처리한다 (마운트 시점에 이미 들어와 있는 요청도 처리되도록 초기값은 undefined).
  const [syncedFocusNonce, setSyncedFocusNonce] = useState<number | undefined>(undefined);
  if (focusRequest && focusRequest.nonce !== syncedFocusNonce) {
    setSyncedFocusNonce(focusRequest.nonce);
    if (focusRequest.kind === 'project') {
      setProjectFocus({ projectId: focusRequest.projectId, field: 'name', nonce: focusRequest.nonce });
    } else if (focusRequest.kind === 'task') {
      setProjectFocus({
        projectId: focusRequest.projectId,
        field: 'task',
        taskId: focusRequest.taskId,
        nonce: focusRequest.nonce,
      });
    } else {
      setProjectFocus({
        projectId: focusRequest.projectId,
        field: 'detail',
        taskId: focusRequest.taskId,
        detailId: focusRequest.detailId,
        nonce: focusRequest.nonce,
      });
    }
  }

  // 새로 추가된 프로젝트의 ID를 상위에서 받기 전에 미리 생성해두고,
  // 같은 ID를 전달해 ProjectItem에서 autoFocus가 트리거되도록 한다
  const handleAddProject = () => {
    const newProjectId = createId();
    setLastAddedProjectId(newProjectId);
    onAddProject(newProjectId);
  };

  // 드래그 정렬·버킷 간 이동은 상위 ProjectBoard의 단일 DndContext가 처리한다.
  // 여기서는 SortableContext와 droppable 컨테이너 등록만 담당한다.

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
  // 버킷의 모든 프로젝트를 다른 버킷으로 옮겨 비어버린 상태 — drop 안내 placeholder를 보여준다.
  const isVacant = projects.length === 0;
  // SortableContext에 넘기는 items는 참조가 안정적이어야 한다 — dnd-kit useSortable이 items의
  // 참조 동일성으로 "항목 변경"을 감지해 변경 프레임에 transition을 끄기 때문(itemsHaveChanged).
  // 매 렌더 새 배열을 넘기면 드래그 중 변위 항목이 disabledTransition으로 애니메이션 없이 점프한다.
  const projectIds = useMemo(() => projects.map((p) => p.id), [projects]);

  return (
    <section aria-labelledby={headingId} className="mb-8 w-full">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className={cn('h-5 w-1 rounded-full', accentStyles.stripe)} aria-hidden />
          <span className={cn('flex h-7 w-7 items-center justify-center rounded-md', accentStyles.iconWrap)}>
            <Icon size={14} />
          </span>
          <h2 id={headingId} className="text-xl font-bold text-zinc-800 dark:text-zinc-200">
            {title}
          </h2>
        </div>
        <div className="flex gap-2">
          {onImportGithub && (
            // AI 분류 기능이라 무지개 빛으로 강조한다. 반투명 배경 아래로 무지개가 비친다.
            // 테두리(1px)만큼 안쪽 여백을 줄여 다른 버튼과 크기를 맞춘다.
            <span className="rainbow-glow rounded-md">
              <button
                onClick={onImportGithub}
                className="flex cursor-pointer items-center gap-1 rounded-[5px] bg-white/80 px-[11px] py-[3px] text-sm font-semibold text-zinc-900 backdrop-blur-sm transition-colors hover:bg-white/65 dark:bg-zinc-900/75 dark:text-white dark:hover:bg-zinc-900/60"
              >
                <Github size={16} /> GitHub에서 가져오기
              </button>
            </span>
          )}
          {onImportIncomplete && (
            <button
              onClick={onImportIncomplete}
              aria-label="금일 미완료 업무를 익일로 가져오기"
              className="flex cursor-pointer items-center gap-1 rounded-md bg-blue-50 px-3 py-1 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50"
            >
              <Plus size={16} /> 미완료 업무 가져오기
            </button>
          )}
          <button
            onClick={handleAddProject}
            aria-label={`${sectionLabel} 업무에 프로젝트 추가`}
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
      <SortableContext items={projectIds} strategy={verticalListSortingStrategy}>
        <div ref={setDroppableRef} className="space-y-6">
          {isVacant ? (
            <div className="flex min-h-24 items-center justify-center rounded-lg border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-400 dark:border-zinc-700 dark:text-zinc-500">
              새 프로젝트를 추가하거나 여기로 프로젝트를 끌어다 놓으세요.
            </div>
          ) : (
            projects.map((project, index) => (
              <ProjectItem
                key={project.id}
                project={project}
                label={`${sectionLabel} 프로젝트 ${index + 1}`}
                onUpdateName={(name) => onUpdateProjectName(project.id, name)}
                onRemove={() => onRemoveProject(project.id)}
                canRemove={projects.length > 1}
                onAddTask={(taskId) => onAddTask(project.id, taskId)}
                onUpdateTask={(taskId, updates) => onUpdateTask(project.id, taskId, updates)}
                onRemoveTask={(taskId, options) => onRemoveTask(project.id, taskId, options)}
                onAddDetail={(taskId, detailId) => onAddDetail(project.id, taskId, detailId)}
                onUpdateDetail={(taskId, detailId, content) => onUpdateDetail(project.id, taskId, detailId, content)}
                onRemoveDetail={(taskId, detailId, options) => onRemoveDetail(project.id, taskId, detailId, options)}
                onBackspaceEmpty={() => handleProjectBackspaceEmpty(project.id)}
                autoFocus={project.id === lastAddedProjectId}
                externalFocusField={projectFocus?.projectId === project.id ? projectFocus.field : null}
                externalFocusTaskId={projectFocus?.projectId === project.id ? projectFocus.taskId : undefined}
                externalFocusDetailId={projectFocus?.projectId === project.id ? projectFocus.detailId : undefined}
                externalFocusNonce={projectFocus?.projectId === project.id ? projectFocus.nonce : 0}
              />
            ))
          )}
        </div>
      </SortableContext>
    </section>
  );
};
