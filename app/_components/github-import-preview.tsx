'use client';

import { useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronDown,
  ExternalLink,
  EyeOff,
  FolderGit2,
  FolderPlus,
  GitCommitHorizontal,
  History,
  Link2,
  ListPlus,
  Sparkles,
  Target,
  Trash2,
} from 'lucide-react';
import type { CommitImportPlan, PlannedProject, PlannedTask, Project, Task } from '@/types';
import {
  COMMIT_IMPORT_DEFAULT_PROGRESS,
  COMMIT_IMPORT_REMEMBERED_TASK_AI_SCORE,
  COMMIT_IMPORT_SIMILAR_TASK_AI_SCORE,
  COMMIT_IMPORT_SIMILAR_TASK_THRESHOLD,
  COMMIT_REPO_MATCH_THRESHOLD,
  COMMIT_TASK_MATCH_THRESHOLD,
} from '@/constants';
import { HintBadge, useDismissOnBack } from '@/components';
import { useDismissLayer, useResetOnHide } from '@/hooks';
import { addsToExistingTask, cn, createId, dayLabel } from '@/utils';
import { ProgressInput } from '.';

type GithubImportPreviewProps = {
  plan: CommitImportPlan;
  todayProjects: ReadonlyArray<Project>;
  // todayProjects 중 오늘의 목표 작업 — 커밋이 붙으면 적용할 때 금일 업무로 옮겨진다
  goalTaskIds: ReadonlySet<string>;
  onChange: (plan: CommitImportPlan) => void;
  // 저장소를 분류 대상에서 뺀다(개인 프로젝트 등) — 다음 가져오기부터는 조회하지 않는다
  onExcludeRepo: (repo: string) => void;
  // 최근 연속으로 작업을 하나도 넣지 않은 저장소 — 칩에서 제외를 권한다
  suggestedExcludes: ReadonlyArray<string>;
};

const NEW_PROJECT_VALUE = '__new__';

const commitTime = (iso: string) =>
  new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(
    new Date(iso)
  );

// 폼(ProjectItem / TaskItem / TaskDetailItem)과 같은 입력 스타일을 쓴다
const projectInputClass =
  'min-w-0 flex-1 rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-base outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700/50 dark:bg-input/40 dark:text-zinc-100 dark:focus:border-blue-500/50';
const taskInputClass =
  'min-w-0 flex-1 rounded-md border border-zinc-200 bg-transparent px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 sm:px-3 dark:border-zinc-700/50 dark:bg-input/30 dark:text-zinc-200 dark:focus:border-blue-500/50';
const readonlyBoxClass =
  'min-w-0 flex-1 truncate rounded-md bg-zinc-100 text-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-300';

// 분류 결과 편집기. 커밋 포함 여부, 연결할 프로젝트, 새 작업/프로젝트 이름, 진행률을 고칠 수 있다.
export function GithubImportPreview({
  plan,
  todayProjects,
  goalTaskIds,
  onChange,
  onExcludeRepo,
  suggestedExcludes,
}: Readonly<GithubImportPreviewProps>) {
  const namedProjects = todayProjects.filter((p) => p.name.trim());

  const updateProject = (key: string, updater: (project: PlannedProject) => PlannedProject) =>
    onChange({ ...plan, projects: plan.projects.map((p) => (p.key === key ? updater(p) : p)) });

  const updateTask = (projectKey: string, taskKey: string, updater: (task: PlannedTask) => PlannedTask) =>
    updateProject(projectKey, (p) => ({ ...p, tasks: p.tasks.map((t) => (t.key === taskKey ? updater(t) : t)) }));

  // 연결 대상을 바꾸면 이전 프로젝트의 기존 작업 연결은 의미가 없으므로 새 작업으로 돌린다.
  const changeTarget = (project: PlannedProject, value: string) =>
    updateProject(project.key, (p) => {
      const target = value === NEW_PROJECT_VALUE ? null : (namedProjects.find((np) => np.id === value) ?? null);
      return {
        ...p,
        existingProjectId: target?.id ?? null,
        name: target?.name ?? (p.existingProjectId ? (p.repos[0]?.split('/').pop() ?? p.name) : p.name),
        tasks: p.tasks.map((t) =>
          target && target.tasks.some((tt) => tt.id === t.existingTaskId) ? t : { ...t, existingTaskId: null }
        ),
      };
    });

  return (
    <div className="space-y-4">
      {plan.projects.map((project) => (
        <ProjectBlock
          key={project.key}
          project={project}
          namedProjects={namedProjects}
          goalTaskIds={goalTaskIds}
          onChangeTarget={(value) => changeTarget(project, value)}
          onRename={(name) => updateProject(project.key, (p) => ({ ...p, name }))}
          onUpdateTask={(taskKey, updater) => updateTask(project.key, taskKey, updater)}
          onExcludeRepo={onExcludeRepo}
          suggestedExcludes={suggestedExcludes}
        />
      ))}
    </div>
  );
}

// 배지마다 기준·설명을 툴팁으로 단다(`HintBadge`). 분류 기준을 바꾸면 여기 문구도 함께 고친다.
const NEW_BADGE_CLASS = 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400';
const EXISTING_BADGE_CLASS = 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400';
const GOAL_BADGE_CLASS = 'bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400';
const SIMILAR_BADGE_CLASS = 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
const SIMILAR_NAME_PERCENT = Math.round(COMMIT_IMPORT_SIMILAR_TASK_THRESHOLD * 100);
const similarNameCriterion = `이름이 애매하게 비슷하면 AI 가 두 번 채점해 둘 다 ${COMMIT_IMPORT_SIMILAR_TASK_AI_SCORE}점 이상일 때`;

function ProjectStatusBadge({ isNew, isGoalProject }: Readonly<{ isNew: boolean; isGoalProject: boolean }>) {
  if (isNew)
    return (
      <HintBadge
        icon={FolderPlus}
        label="새 프로젝트"
        className={NEW_BADGE_CLASS}
        description="폼의 금일 업무에 없는 프로젝트예요. 적용하면 맨 아래에 새 프로젝트로 추가해요. 오른쪽 메뉴에서 폼의 다른 프로젝트로 바꿀 수 있어요."
        criteria={[
          '전에 이 저장소를 넣은 프로젝트가 지금 폼에 없을 때',
          `AI 가 폼의 어느 프로젝트에도 같은 제품이라고 두 번 모두 ${COMMIT_REPO_MATCH_THRESHOLD}점 이상을 주지 않았을 때`,
          'AI 를 쓸 수 없으면 저장소 이름과 같은 이름의 프로젝트가 폼에 없을 때',
        ]}
      />
    );
  if (isGoalProject)
    return (
      <HintBadge
        icon={Target}
        label="오늘의 목표 프로젝트"
        className={GOAL_BADGE_CLASS}
        description="오늘의 목표에만 있는 프로젝트예요. 적용하면 커밋이 붙은 목표를 금일 업무로 옮기면서 이 프로젝트도 금일 업무에 생겨요."
        criteria={['이 프로젝트의 작업이 모두 아직 옮기지 않은 오늘의 목표일 때']}
      />
    );
  return (
    <HintBadge
      icon={Link2}
      label="기존 프로젝트에 추가"
      className={EXISTING_BADGE_CLASS}
      description="폼에 있는 이 프로젝트에 작업을 더해요. 지금 적힌 작업은 지우거나 바꾸지 않아요."
      criteria={[
        '전에 이 저장소를 이 프로젝트에 넣은 적이 있을 때',
        `AI 가 같은 제품이라고 두 번 모두 ${COMMIT_REPO_MATCH_THRESHOLD}점 이상을 줬을 때`,
        'AI 를 쓸 수 없으면 저장소 이름과 프로젝트 이름이 같을 때',
      ]}
    />
  );
}

type TaskStatusBadgeProps = {
  task: PlannedTask;
  isNew: boolean;
  isGoal: boolean;
  addsNothing: boolean;
};

function TaskStatusBadge({ task, isNew, isGoal, addsNothing }: Readonly<TaskStatusBadgeProps>) {
  const name = `“${task.similarTo ?? task.content.trim()}”`;
  // 직전 보고서에 100% 로 보고한 작업 — 보고서를 저장한 뒤 커밋한 일을 미리 완료로 적어 둔 경우(예측 보고)
  if (task.similarTo !== null && task.reportedOn !== null)
    return (
      <HintBadge
        icon={History}
        label="이미 보고된 작업"
        className={SIMILAR_BADGE_CLASS}
        description={`${dayLabel(task.reportedOn)} 보고서에 ${name} 작업을 100%로 보고했어요. 그 보고서를 저장한 뒤에 한 커밋이라 미리 완료로 적어 둔 일로 보고 가져오기를 해제해 두었어요. 그 뒤에 이어서 한 일이면 "가져오기"를 체크해 주세요.`}
        criteria={[
          '직전 보고서 하나만 봐요 — 커밋을 그 보고서를 저장한 시각부터 가져와서예요',
          '같은 이름의 프로젝트에서 100%로 보고한 작업만 견줘요(진행 중이던 작업은 이어서 한 일이에요)',
          `작업 이름이 거의 같을 때(글자 ${SIMILAR_NAME_PERCENT}% 이상 일치)`,
          similarNameCriterion,
        ]}
      />
    );
  // 이 날짜에 이미 넣은 작업과 같은 새 작업
  if (task.similarTo !== null && isNew)
    return (
      <HintBadge
        icon={History}
        label="기존 작업과 유사"
        className={SIMILAR_BADGE_CLASS}
        description={`이 보고서 날짜에 이미 넣은 ${name} 작업과 같은 일로 보여 가져오기를 해제해 두었어요. 다른 작업이면 "가져오기"를 체크해 주세요.`}
        criteria={[
          '전에 가져와 넣은 작업과 같은 커밋이 있거나, 커밋 제목이 절반 이상 겹칠 때',
          `같은 저장소에서 전에 넣은 작업, 또는 폼의 같은 프로젝트 작업과 이름이 거의 같을 때(글자 ${SIMILAR_NAME_PERCENT}% 이상 일치)`,
          similarNameCriterion,
        ]}
      />
    );
  // 폼의 기존 작업에 붙었는데 이미 보고한 커밋뿐
  if (task.similarTo !== null)
    return (
      <HintBadge
        icon={History}
        label="이미 등록된 작업"
        className={SIMILAR_BADGE_CLASS}
        description={`폼의 ${name} 작업에 이미 보고한 커밋뿐이라 다시 넣지 않아요.`}
        criteria={[
          '붙은 커밋이 모두 이 날짜 보고서를 마지막으로 저장하기 전에 만든 커밋이거나',
          '이 날짜에 이미 가져와 넣은 커밋일 때',
          '새 커밋이 하나라도 섞여 있으면 이어서 한 일로 보고 그대로 가져와요',
        ]}
      />
    );
  if (isGoal)
    return (
      <HintBadge
        icon={Target}
        label="오늘의 목표 달성"
        className={GOAL_BADGE_CLASS}
        description={`오늘의 목표 ${name}와(과) 맞는 커밋이에요. 적용하면 이 목표를 금일 업무로 옮기고 커밋 내용을 더해요.`}
        criteria={[
          `AI 가 커밋 묶음과 커밋 하나하나 모두에 이 목표 ${COMMIT_TASK_MATCH_THRESHOLD}점 이상을 줬을 때(기존 작업에 붙이는 기준과 같아요)`,
          `목표의 진행률은 예정 값이라 새 작업처럼 ${COMMIT_IMPORT_DEFAULT_PROGRESS}%로 두어요`,
        ]}
      />
    );
  // 기존 작업과 이름이 같고 세부 항목도 진행률도 더하지 않으면 이미 넣은 작업과 다를 게 없다
  if (addsNothing)
    return (
      <HintBadge
        icon={History}
        label="이미 등록된 작업"
        className={SIMILAR_BADGE_CLASS}
        description={`폼에 같은 ${name} 작업이 있어 가져와도 바뀌는 게 없어 가져오기를 고를 수 없어요. 세부 항목을 넣거나 진행률을 바꾸면 그 내용만 반영돼요.`}
        criteria={['폼의 작업에 붙었고, 진행률이 그대로이며, 폼에 없는 세부 항목도 없을 때']}
      />
    );
  if (isNew)
    return (
      <HintBadge
        icon={FolderPlus}
        label="새 작업"
        className={NEW_BADGE_CLASS}
        description="폼에 없는 작업이라 새로 넣어요. 이름·진행률은 바로 고칠 수 있어요."
        criteria={[
          `AI 가 폼의 어느 작업에도 ${COMMIT_TASK_MATCH_THRESHOLD}점 이상을 주지 않은 커밋을 같은 작업끼리 묶어 이름을 지어요`,
          'AI 를 쓸 수 없으면 같은 scope 커밋끼리 묶고 첫 커밋 제목을 이름으로 써요',
          `진행률은 커밋 제목에 WIP·진행 중·1차처럼 미완성 신호가 분명할 때만 낮추고, 아니면 ${COMMIT_IMPORT_DEFAULT_PROGRESS}%예요`,
        ]}
      />
    );
  return (
    <HintBadge
      icon={Link2}
      label="기존 작업에 추가"
      className={EXISTING_BADGE_CLASS}
      description="폼에 있는 이 작업에 커밋을 붙여요. 진행률을 맞추고 폼에 없는 세부 항목만 더해요."
      criteria={[
        `AI 가 커밋 묶음과 커밋 하나하나 모두에 이 작업 ${COMMIT_TASK_MATCH_THRESHOLD}점 이상을 줬을 때`,
        `전에 같은 저장소·scope 커밋을 이 작업 이름으로 넣은 적이 있고 AI 가 두 번 모두 ${COMMIT_IMPORT_REMEMBERED_TASK_AI_SCORE}점 이상을 줬을 때`,
      ]}
    />
  );
}

type ProjectBlockProps = {
  project: PlannedProject;
  namedProjects: ReadonlyArray<Project>;
  goalTaskIds: ReadonlySet<string>;
  onChangeTarget: (value: string) => void;
  onRename: (name: string) => void;
  onUpdateTask: (taskKey: string, updater: (task: PlannedTask) => PlannedTask) => void;
  onExcludeRepo: (repo: string) => void;
  suggestedExcludes: ReadonlyArray<string>;
};

function ProjectBlock({
  project,
  namedProjects,
  goalTaskIds,
  onChangeTarget,
  onRename,
  onUpdateTask,
  onExcludeRepo,
  suggestedExcludes,
}: Readonly<ProjectBlockProps>) {
  const isNew = project.existingProjectId === null;
  const source = namedProjects.find((p) => p.id === project.existingProjectId);
  // 오늘의 목표만 담긴 프로젝트 — 아직 폼에 없고, 목표를 옮기면서 금일 업무에 생긴다
  const isGoalProject = !!source && source.tasks.every((t) => goalTaskIds.has(t.id));

  return (
    <section className="rounded-lg border border-zinc-200 p-3 sm:p-4 dark:border-zinc-700/50">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <ProjectStatusBadge isNew={isNew} isGoalProject={isGoalProject} />
        <ProjectTargetDropdown
          value={project.existingProjectId}
          projects={namedProjects}
          onChange={(projectId) => onChangeTarget(projectId ?? NEW_PROJECT_VALUE)}
        />
      </div>

      <div className="mb-1.5 flex items-center">
        {isNew ? (
          <input
            aria-label="새 프로젝트 이름"
            placeholder="프로젝트명"
            value={project.name}
            onChange={(e) => onRename(e.target.value)}
            className={projectInputClass}
          />
        ) : (
          <div className={cn(readonlyBoxClass, 'px-3 py-2 text-base')}>{source?.name ?? project.name}</div>
        )}
      </div>
      {/* 이 프로젝트로 분류된 저장소 — 개인 프로젝트처럼 보고서에 넣지 않을 저장소는 여기서 뺀다 */}
      <ul className="mb-4 flex flex-wrap gap-1.5">
        {project.repos.map((repo) => {
          const isSuggested = suggestedExcludes.includes(repo);
          return (
            <li
              key={repo}
              className={cn(
                'flex max-w-full items-center gap-1 rounded-md py-0.5 pr-0.5 pl-1.5 text-[11px]',
                isSuggested
                  ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400'
                  : 'bg-zinc-50 text-zinc-500 dark:bg-zinc-900/60 dark:text-zinc-400'
              )}
            >
              <FolderGit2 size={12} className="shrink-0" aria-hidden />
              <span className="truncate font-mono" title={repo}>
                {repo}
              </span>
              <button
                type="button"
                onClick={() => onExcludeRepo(repo)}
                title={
                  isSuggested
                    ? '최근 여러 번 이 저장소 작업을 넣지 않았어요. 빼 두면 다음 가져오기부터 커밋을 불러오지 않아요.'
                    : '이 저장소를 분류 대상에서 빼요. 다음 가져오기부터 커밋을 불러오지 않아요.'
                }
                className={cn(
                  'flex shrink-0 items-center gap-0.5 rounded px-1 py-0.5 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30',
                  isSuggested ? 'font-semibold text-amber-700 dark:text-amber-400' : 'text-zinc-400'
                )}
              >
                <EyeOff size={11} aria-hidden />
                {isSuggested ? '자주 빼는 저장소 · 제외' : '제외'}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="ml-2 space-y-4 sm:ml-4">
        {project.tasks.map((task) => (
          <TaskBlock
            key={task.key}
            task={task}
            isGoal={task.existingTaskId !== null && goalTaskIds.has(task.existingTaskId)}
            // 목표는 아직 폼에 없는 작업이라 견줄 폼 작업이 없다 — 옮기면서 그대로 들어가므로 진행률 변화·"이미 등록된 작업"으로 보지 않는다
            formTask={
              task.existingTaskId !== null && goalTaskIds.has(task.existingTaskId)
                ? undefined
                : source?.tasks.find((t) => t.id === task.existingTaskId)
            }
            onUpdate={(updater) => onUpdateTask(task.key, updater)}
          />
        ))}
      </div>
    </section>
  );
}

type TaskBlockProps = {
  task: PlannedTask;
  // 기존 작업이면 폼에 적혀 있는 그 작업 — 진행률이 바뀌는지, 더할 게 있는지 보여준다
  formTask: Task | undefined;
  // 오늘의 목표에 붙은 작업 — 적용하면 그 목표가 금일 업무로 옮겨진다
  isGoal: boolean;
  onUpdate: (updater: (task: PlannedTask) => PlannedTask) => void;
};

function TaskBlock({ task, formTask, isGoal, onUpdate }: Readonly<TaskBlockProps>) {
  const isNew = task.existingTaskId === null;
  const previousProgress = formTask?.progress ?? null;
  const progressChanged = previousProgress !== null && previousProgress !== task.progress;
  // 기존 작업과 이름이 같고 진행률도 그대로이며 폼에 없는 세부 항목도 없으면 가져와도 바뀌는 게 없다
  const addsNothing = !addsToExistingTask(task, formTask);
  // 실제로 폼에 반영되는지 — 체크박스는 이 값을 보여 준다
  const isIncluded = task.included && !addsNothing;
  const [isCommitsOpen, setIsCommitsOpen] = useState(false);
  // 방금 추가한 세부 항목으로 포커스를 보낸다(폼의 세부 항목 추가와 같은 흐름)
  const [focusDetailKey, setFocusDetailKey] = useState<string | null>(null);

  const addDetail = () => {
    const key = createId();
    setFocusDetailKey(key);
    onUpdate((t) => ({ ...t, details: [...t.details, { key, content: '', suggested: null }] }));
  };
  const updateDetail = (key: string, content: string) =>
    onUpdate((t) => ({ ...t, details: t.details.map((d) => (d.key === key ? { ...d, content } : d)) }));
  const removeDetail = (key: string) => onUpdate((t) => ({ ...t, details: t.details.filter((d) => d.key !== key) }));

  return (
    <div className={cn('transition-opacity', !isIncluded && 'opacity-50')}>
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        {/* 이 작업을 폼에 반영할지 — 세부 항목과 헷갈리지 않게 작업 머리줄 맨 앞에 둔다 */}
        {/* 실제 input 은 숨기고(sr-only) 그린 박스로 보여준다 — 커스텀 포인터가 input 과 label 을 따로 하이라이트하지 않고 머리줄 하나로 감싼다 */}
        {/* 더할 게 없는 동안(addsNothing)은 적용해도 빠지므로 해제·비활성으로 보인다. 사용자가 고른 값(included)은 두어,
            세부 항목을 넣거나 진행률을 바꾸면 그 값으로 돌아온다 */}
        <label
          className={cn(
            'flex items-center gap-1.5 rounded-md py-0.5 pr-1.5 pl-1 text-[11px] font-medium text-zinc-600 transition-colors has-focus-visible:ring-2 has-focus-visible:ring-blue-400 dark:text-zinc-300',
            addsNothing ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800'
          )}
        >
          <input
            type="checkbox"
            checked={isIncluded}
            disabled={addsNothing}
            onChange={(e) => onUpdate((t) => ({ ...t, included: e.target.checked }))}
            className="sr-only"
          />
          <span
            aria-hidden
            className={cn(
              'flex size-3.5 shrink-0 items-center justify-center rounded border transition-colors',
              isIncluded
                ? 'border-blue-600 bg-blue-600 text-white dark:border-blue-500 dark:bg-blue-500'
                : 'border-zinc-300 bg-white dark:border-zinc-600 dark:bg-zinc-800'
            )}
          >
            {isIncluded && <Check size={10} strokeWidth={3.5} />}
          </span>
          가져오기
        </label>
        <TaskStatusBadge task={task} isNew={isNew} isGoal={isGoal} addsNothing={addsNothing} />
        {progressChanged && (
          <span className="flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400">
            진행률 {previousProgress}% <ArrowRight size={10} aria-hidden /> {task.progress}%
          </span>
        )}
        <button
          type="button"
          onClick={() => setIsCommitsOpen((v) => !v)}
          aria-expanded={isCommitsOpen}
          className="ml-auto flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
        >
          <GitCommitHorizontal size={12} aria-hidden />
          커밋 {task.commits.length}개
          <ChevronDown size={11} className={cn('transition-transform', isCommitsOpen && 'rotate-180')} aria-hidden />
        </button>
      </div>

      {/* 폼의 작업 줄과 같은 구성: 작업 내용 · 진행률 · 세부 항목 추가 */}
      <div className="flex items-center gap-1 sm:gap-1.5">
        {isNew ? (
          <input
            aria-label="새 작업 이름"
            placeholder="작업 내용"
            value={task.content}
            disabled={!task.included}
            onChange={(e) => onUpdate((t) => ({ ...t, content: e.target.value }))}
            className={taskInputClass}
          />
        ) : (
          <div className={cn(readonlyBoxClass, 'px-2 py-1.5 text-sm sm:px-3')}>{task.content}</div>
        )}
        <ProgressInput value={task.progress} onChange={(progress) => onUpdate((t) => ({ ...t, progress }))} />
        <button
          type="button"
          onClick={addDetail}
          disabled={!task.included}
          title="세부 항목 추가"
          aria-label="세부 항목 추가"
          className="shrink-0 cursor-pointer rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-blue-50 hover:text-blue-500 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-zinc-400 dark:hover:bg-blue-950/30"
        >
          <ListPlus size={16} />
        </button>
      </div>

      {task.details.length > 0 && (
        // 폼의 세부 항목처럼 한 단계 들여 쓴다. AI 가 필요하다고 판단한 작업에만 미리 채워진다.
        <div className="mt-2 ml-4 space-y-2 sm:ml-6">
          {task.details.map((detail) => (
            <div key={detail.key} className="flex items-center gap-1 sm:gap-1.5">
              <span className="w-3 shrink-0 text-center text-xs text-zinc-300 dark:text-zinc-600" aria-hidden>
                ·
              </span>
              <input
                aria-label="세부 항목 내용"
                placeholder="세부 내용"
                value={detail.content}
                disabled={!task.included}
                autoFocus={detail.key === focusDetailKey}
                onChange={(e) => updateDetail(detail.key, e.target.value)}
                className="min-w-0 flex-1 rounded-md border border-zinc-200 bg-transparent px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-500 sm:px-2.5 sm:text-sm dark:border-zinc-700/50 dark:bg-input/20 dark:text-zinc-300 dark:focus:border-blue-500/50"
              />
              {detail.suggested !== null && detail.content === detail.suggested && (
                <span title="AI가 커밋을 보고 제안한 세부 항목이에요" className="shrink-0 text-emerald-500/70">
                  <Sparkles size={12} aria-hidden />
                </span>
              )}
              <button
                type="button"
                onClick={() => removeDetail(detail.key)}
                disabled={!task.included}
                title="세부 항목 삭제"
                aria-label="세부 항목 삭제"
                className="shrink-0 cursor-pointer rounded-md p-1 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-red-950/30"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {isCommitsOpen && (
        // 이 작업으로 분류된 근거 커밋 — 폼에는 들어가지 않는다
        <ul className="mt-2 space-y-0.5 rounded-md bg-zinc-50 p-1.5 dark:bg-zinc-900/60">
          {task.commits.map((commit) => (
            <li key={commit.sha} className="flex items-center gap-2 px-1 py-0.5">
              <span title={commit.message} className="min-w-0 flex-1 truncate text-xs text-zinc-500 dark:text-zinc-400">
                {commit.message}
              </span>
              <span className="hidden shrink-0 text-[11px] text-zinc-400 sm:inline dark:text-zinc-500">
                {commitTime(commit.committedAt)}
              </span>
              <a
                href={commit.url}
                target="_blank"
                rel="noreferrer"
                title="GitHub 에서 커밋 보기"
                className="flex shrink-0 items-center gap-0.5 rounded px-1 py-0.5 font-mono text-[11px] text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-blue-500 dark:text-zinc-500 dark:hover:bg-zinc-800"
              >
                {commit.sha.slice(0, 7)}
                <ExternalLink size={10} aria-hidden />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type ProjectTargetDropdownProps = {
  // null = 새 프로젝트로 추가
  value: string | null;
  projects: ReadonlyArray<Project>;
  onChange: (projectId: string | null) => void;
};

// 이 저장소의 커밋을 붙일 프로젝트를 고르는 드롭다운(내보내기 메뉴와 같은 팝오버 스타일).
function ProjectTargetDropdown({ value, projects, onChange }: Readonly<ProjectTargetDropdownProps>) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = projects.find((p) => p.id === value);

  useDismissLayer(containerRef, () => setIsOpen(false), { enabled: isOpen });
  useResetOnHide(() => setIsOpen(false));
  useDismissOnBack(isOpen, () => setIsOpen(false));

  const pick = (projectId: string | null) => {
    setIsOpen(false);
    if (projectId !== value) onChange(projectId);
  };

  const options: ReadonlyArray<{ id: string | null; label: string; hint: string }> = [
    ...projects.map((p) => ({
      id: p.id,
      label: p.name,
      hint: `작업 ${p.tasks.filter((t) => t.content.trim()).length}개`,
    })),
    { id: null, label: '새 프로젝트로 추가', hint: '폼 맨 아래에 새로 만들어요' },
  ];

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label="커밋을 추가할 프로젝트"
        className="flex max-w-48 items-center gap-1 rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700/50 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        <span className="truncate">{selected ? `${selected.name}에 추가` : '새 프로젝트로 추가'}</span>
        <ChevronDown size={12} className={cn('shrink-0 transition-transform', isOpen && 'rotate-180')} aria-hidden />
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-label="커밋을 추가할 프로젝트"
          className="absolute top-full right-0 z-20 mt-1 max-h-64 w-60 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
        >
          {projects.length > 0 && (
            <p className="px-3 pt-1.5 pb-1 text-[10px] font-semibold text-zinc-400 dark:text-zinc-500">
              금일 업무 프로젝트
            </p>
          )}
          {options.map((option) => {
            const isSelected = option.id === value;
            return (
              <button
                key={option.id ?? 'new'}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => pick(option.id)}
                className={cn(
                  'flex w-full items-start gap-2 rounded-md px-3 py-2 text-left transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800',
                  option.id === null && projects.length > 0 && 'mt-1 border-t border-zinc-100 dark:border-zinc-800'
                )}
              >
                {option.id === null ? (
                  <FolderPlus size={14} className="mt-0.5 shrink-0 text-blue-500" aria-hidden />
                ) : (
                  <Check
                    size={14}
                    className={cn('mt-0.5 shrink-0 text-blue-500', !isSelected && 'invisible')}
                    aria-hidden
                  />
                )}
                <span className="flex min-w-0 flex-col">
                  <span
                    className={cn(
                      'truncate text-xs font-semibold',
                      isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-800 dark:text-zinc-100'
                    )}
                  >
                    {option.label}
                  </span>
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{option.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
