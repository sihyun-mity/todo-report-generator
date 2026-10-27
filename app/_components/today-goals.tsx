'use client';

import { useId } from 'react';
import toast from 'react-hot-toast';
import { useDraggable } from '@dnd-kit/core';
import { CalendarDays, GripVertical, Sun, Target, X } from 'lucide-react';
import type { Project, ProjectsBucket, Task } from '@/types';
import { UNDO_TOAST_DURATION_MS } from '@/constants';
import { useAgentHighlightStore, useReportFormStore } from '@/stores';
import { cn, findPlacedTodayGoal, findTodayGoal } from '@/utils';

const BUCKET_SHORT: Record<ProjectsBucket, string> = { today: '금일', tomorrow: '익일' };

const dateLabel = (dateKey: string) => `${parseInt(dateKey.slice(5, 7), 10)}월 ${parseInt(dateKey.slice(8, 10), 10)}일`;

// 목표를 옮긴 뒤 들어간 작업을 잠깐 빛나게 한다 — 어디로 들어갔는지 보이게(같은 내용의 작업과 합쳐졌으면 그 작업)
export const placeGoalsWithFlash = (
  taskIds: ReadonlyArray<string>,
  bucket: ProjectsBucket,
  target?: Readonly<{ projectId: string; index: number }>
) => {
  const store = useReportFormStore.getState();
  const goals = taskIds.flatMap((id) => findTodayGoal(store.goals, id) ?? []);
  store.placeGoals(taskIds, bucket, target);
  const placed = useReportFormStore.getState()[bucket];
  const ids = goals.flatMap(
    ({ project, task }) => findPlacedTodayGoal(placed, { projectName: project.name, task })?.taskId ?? []
  );
  useAgentHighlightStore.getState().flash(ids);
};

// 넘긴 목표를 원래 자리로 되돌린다(실행 취소) — 그사이 다른 목표를 옮겼어도 그 목표만 돌아온다
const restoreGoal = (project: Project, task: Task, index: number) =>
  useReportFormStore.getState().setGoals((prev) => {
    const owner = prev.find((p) => p.id === project.id);
    if (!owner) return [...prev, { ...project, tasks: [task] }];
    const tasks = [...owner.tasks];
    tasks.splice(Math.min(index, tasks.length), 0, task);
    return prev.map((p) => (p.id === project.id ? { ...p, tasks } : p));
  });

const dismissGoal = (project: Project, task: Task) => {
  const index = project.tasks.findIndex((t) => t.id === task.id);
  useReportFormStore.getState().dismissGoals([task.id]);
  toast(
    (t) => (
      <span className="flex items-center gap-3 break-all">
        <span className="break-all">오늘의 목표 &quot;{task.content}&quot;을(를) 넘겼습니다.</span>
        <button
          onClick={() => {
            restoreGoal(project, task, index);
            toast.dismiss(t.id);
          }}
          className="shrink-0 cursor-pointer rounded-md bg-toast-border px-2 py-1 text-xs font-semibold transition-opacity hover:opacity-80"
        >
          실행 취소
        </button>
      </span>
    ),
    { duration: UNDO_TOAST_DURATION_MS }
  );
};

// 직전 보고서의 익일 업무 진행 예정을 오늘 할 일 후보로 보여 준다. 끌어서 금일·익일 업무의 원하는 자리에 놓거나 버튼으로 옮긴다.
// 옮기지 않은 목표는 보고서에 들어가지 않고 다음 날 사라진다(취소된 일). 끌어 놓기는 상위 ProjectBoard 의 DndContext 가 처리한다.
export function TodayGoals() {
  const headingId = useId();
  const goals = useReportFormStore((s) => s.goals);
  const sourceDateKey = useReportFormStore((s) => s.goalsSourceDateKey);
  if (goals.length === 0) return null;

  const count = goals.reduce((sum, p) => sum + p.tasks.length, 0);
  const allIds = goals.flatMap((p) => p.tasks.map((t) => t.id));

  // 금일·익일 업무와 같은 짜임(머리줄 → 안내 한 줄 → 카드)으로 둔다. 보라색은 머리줄 표식에만 쓰고, 카드는 색 없이 점선 테두리로
  // "아직 보고서에 들어가지 않은 임시 자리"임을 보인다 — 칸 전체를 보라색으로 칠하고 줄마다 파랑·초록 버튼을 두었더니 색이 너무 많았다
  return (
    <section aria-labelledby={headingId} className="mb-8 w-full">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="h-5 w-1 rounded-full bg-violet-500 dark:bg-violet-400" aria-hidden />
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-400">
            <Target size={14} />
          </span>
          <h2 id={headingId} className="text-xl font-bold text-zinc-800 dark:text-zinc-200">
            오늘의 목표
          </h2>
          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
            {count}
          </span>
        </div>
        <button
          onClick={() => placeGoalsWithFlash(allIds, 'today')}
          className="flex cursor-pointer items-center gap-1 rounded-md bg-blue-50 px-3 py-1 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50"
        >
          <Sun size={16} /> 모두 금일 업무로 옮기기
        </button>
      </div>
      <p className="mb-3 text-xs text-zinc-400 dark:text-zinc-500">
        {sourceDateKey ? `${dateLabel(sourceDateKey)} 보고서의 익일 업무 진행 예정이에요. ` : ''}
        끌어서 원하는 자리에 놓거나 금일·익일로 옮겨 주세요. 옮기지 않은 목표는 다음 날 사라져요.
      </p>
      <ul className="space-y-4 rounded-lg border border-dashed border-zinc-300 p-3 sm:p-4 dark:border-zinc-700">
        {goals.map((project) => (
          <li key={project.id}>
            <p className="mb-1.5 truncate text-sm font-semibold text-zinc-600 dark:text-zinc-300">
              {project.name || '이름 없는 프로젝트'}
            </p>
            <ul className="space-y-1.5">
              {project.tasks.map((task) => (
                <TodayGoalItem key={task.id} project={project} task={task} />
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TodayGoalItem({ project, task }: Readonly<{ project: Project; task: Task }>) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  const label = `오늘의 목표 ${project.name ? `${project.name} · ` : ''}${task.content}`;

  return (
    <li
      ref={setNodeRef}
      className={cn(
        'flex items-center gap-1 rounded-md border border-zinc-200 py-1 pr-1 pl-0.5 sm:gap-1.5 dark:border-zinc-700/50 dark:bg-input/30',
        isDragging && 'opacity-40'
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`${label} 끌어서 옮기기`}
        className="shrink-0 cursor-grab touch-none p-1 text-zinc-300 transition-colors hover:text-zinc-500 active:cursor-grabbing dark:text-zinc-600 dark:hover:text-zinc-400"
      >
        <GripVertical size={14} />
      </button>
      <div className="min-w-0 flex-1">
        {/* 좁은 화면에서 한 줄로 자르면 무슨 작업인지 알아보기 어려워 두 줄까지 보인다 */}
        <p className="line-clamp-2 text-sm break-all text-zinc-700 dark:text-zinc-200" title={task.content}>
          {task.content}
        </p>
        {task.details.length > 0 && (
          <p className="truncate text-xs text-zinc-400 dark:text-zinc-500">
            {task.details.map((d) => `· ${d.content}`).join('  ')}
          </p>
        )}
      </div>
      {task.progress > 0 && (
        <span className="hidden shrink-0 text-xs text-zinc-400 sm:inline dark:text-zinc-500">{task.progress}%</span>
      )}
      {(['today', 'tomorrow'] as const).map((bucket) => (
        <button
          key={bucket}
          type="button"
          onClick={() => placeGoalsWithFlash([task.id], bucket)}
          aria-label={`${label}을(를) ${BUCKET_SHORT[bucket]} 업무로 옮기기`}
          // 테두리 + 그 업무의 색 글자(금일 파랑·익일 초록), 가리키면 칠한다 — 줄마다 칠한 버튼 두 개는 목록이 어수선했고,
          // 무채색으로만 두니 버튼인지 눈에 들어오지 않았다
          className={cn(
            'flex shrink-0 cursor-pointer items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors',
            bucket === 'today'
              ? 'border-blue-200 text-blue-600 hover:bg-blue-50 dark:border-blue-800/70 dark:text-blue-400 dark:hover:bg-blue-900/30'
              : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-800/70 dark:text-emerald-400 dark:hover:bg-emerald-900/30'
          )}
        >
          {bucket === 'today' ? <Sun size={13} aria-hidden /> : <CalendarDays size={13} aria-hidden />}
          {BUCKET_SHORT[bucket]}
        </button>
      ))}
      <button
        type="button"
        onClick={() => dismissGoal(project, task)}
        aria-label={`${label} 넘기기`}
        title="오늘 하지 않는 목표 — 보고서에 넣지 않고 넘겨요"
        className="shrink-0 cursor-pointer rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
      >
        <X size={14} />
      </button>
    </li>
  );
}
