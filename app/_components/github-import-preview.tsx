'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronDown,
  ExternalLink,
  EyeOff,
  FolderGit2,
  FolderPlus,
  GitCommitHorizontal,
  Link2,
  ListPlus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { CommitImportPlan, PlannedProject, PlannedTask, Project } from '@/types';
import { useDismissOnBack } from '@/components';
import { useOnClickOutside, useResetOnHide } from '@/hooks';
import { cn, createId } from '@/utils';
import { ProgressInput } from '.';

type GithubImportPreviewProps = {
  plan: CommitImportPlan;
  todayProjects: ReadonlyArray<Project>;
  onChange: (plan: CommitImportPlan) => void;
  // 저장소를 분류 대상에서 뺀다(개인 프로젝트 등) — 다음 가져오기부터는 조회하지 않는다
  onExcludeRepo: (repo: string) => void;
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
  onChange,
  onExcludeRepo,
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
          onChangeTarget={(value) => changeTarget(project, value)}
          onRename={(name) => updateProject(project.key, (p) => ({ ...p, name }))}
          onUpdateTask={(taskKey, updater) => updateTask(project.key, taskKey, updater)}
          onExcludeRepo={onExcludeRepo}
        />
      ))}
    </div>
  );
}

type BadgeProps = { isNew: boolean; newLabel: string; existingLabel: string };

function StatusBadge({ isNew, newLabel, existingLabel }: Readonly<BadgeProps>) {
  const Icon = isNew ? FolderPlus : Link2;
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold',
        isNew
          ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
          : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
      )}
    >
      <Icon size={11} aria-hidden />
      {isNew ? newLabel : existingLabel}
    </span>
  );
}

type ProjectBlockProps = {
  project: PlannedProject;
  namedProjects: ReadonlyArray<Project>;
  onChangeTarget: (value: string) => void;
  onRename: (name: string) => void;
  onUpdateTask: (taskKey: string, updater: (task: PlannedTask) => PlannedTask) => void;
  onExcludeRepo: (repo: string) => void;
};

function ProjectBlock({
  project,
  namedProjects,
  onChangeTarget,
  onRename,
  onUpdateTask,
  onExcludeRepo,
}: Readonly<ProjectBlockProps>) {
  const isNew = project.existingProjectId === null;
  const source = namedProjects.find((p) => p.id === project.existingProjectId);

  return (
    <section className="rounded-lg border border-zinc-200 p-3 sm:p-4 dark:border-zinc-700/50">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <StatusBadge isNew={isNew} newLabel="새 프로젝트" existingLabel="기존 프로젝트에 추가" />
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
        {project.repos.map((repo) => (
          <li
            key={repo}
            className="flex max-w-full items-center gap-1 rounded-md bg-zinc-50 py-0.5 pr-0.5 pl-1.5 text-[11px] text-zinc-500 dark:bg-zinc-900/60 dark:text-zinc-400"
          >
            <FolderGit2 size={12} className="shrink-0" aria-hidden />
            <span className="truncate font-mono" title={repo}>
              {repo}
            </span>
            <button
              type="button"
              onClick={() => onExcludeRepo(repo)}
              title="이 저장소를 분류 대상에서 빼요. 다음 가져오기부터 커밋을 불러오지 않아요."
              className="flex shrink-0 items-center gap-0.5 rounded px-1 py-0.5 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
            >
              <EyeOff size={11} aria-hidden />
              제외
            </button>
          </li>
        ))}
      </ul>

      <div className="ml-2 space-y-4 sm:ml-4">
        {project.tasks.map((task) => (
          <TaskBlock
            key={task.key}
            task={task}
            previousProgress={source?.tasks.find((t) => t.id === task.existingTaskId)?.progress ?? null}
            onUpdate={(updater) => onUpdateTask(task.key, updater)}
          />
        ))}
      </div>
    </section>
  );
}

type TaskBlockProps = {
  task: PlannedTask;
  // 기존 작업이면 폼에 적혀 있던 진행률 — 바뀌는지 보여준다
  previousProgress: number | null;
  onUpdate: (updater: (task: PlannedTask) => PlannedTask) => void;
};

function TaskBlock({ task, previousProgress, onUpdate }: Readonly<TaskBlockProps>) {
  const isNew = task.existingTaskId === null;
  const progressChanged = previousProgress !== null && previousProgress !== task.progress;
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
    <div className={cn('transition-opacity', !task.included && 'opacity-50')}>
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        {/* 이 작업을 폼에 반영할지 — 세부 항목과 헷갈리지 않게 작업 머리줄 맨 앞에 둔다 */}
        <label className="flex cursor-pointer items-center gap-1.5 rounded-md py-0.5 pr-1.5 text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
          <input
            type="checkbox"
            checked={task.included}
            onChange={(e) => onUpdate((t) => ({ ...t, included: e.target.checked }))}
            className="size-3.5 cursor-pointer accent-blue-600"
          />
          가져오기
        </label>
        <StatusBadge isNew={isNew} newLabel="새 작업" existingLabel="기존 작업에 추가" />
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

  useOnClickOutside(containerRef, () => setIsOpen(false));
  useResetOnHide(() => setIsOpen(false));
  useDismissOnBack(isOpen, () => setIsOpen(false));

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // 다이얼로그까지 닫히지 않게 드롭다운에서 멈춘다
        e.stopPropagation();
        setIsOpen(false);
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [isOpen]);

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
