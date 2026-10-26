'use client';

import { useState } from 'react';
import { AlertCircle, Brain, Check, ChevronDown, Loader2, NotebookPen, Undo2 } from 'lucide-react';
import type { AgentAction, AgentChatMessage, AgentNotesDraft, AgentThinkingStep } from '@/types';
import { AGENT_CHANGE_VISIBLE_LINES } from '@/constants';
import { cn } from '@/utils';
import { AgentActionChip } from '.';

// Nano 대화의 항목 하나 — 말풍선·생각 과정·도구 실행 줄(+변경 카드)·확인 카드·메모 초안·오류
type AgentMessageProps = {
  message: AgentChatMessage;
  isRunning: boolean;
  onAnswerConfirm: (id: string, ok: boolean) => void;
  onUndo: (id: string) => void;
  onApplyDraft: (id: string) => void;
  onDiscardDraft: (id: string) => void;
  // 답변 아래 다음 할 일 버튼을 눌렀다
  onRunAction: (action: AgentAction) => void;
};

export function AgentMessage({
  message,
  isRunning,
  onAnswerConfirm,
  onUndo,
  onApplyDraft,
  onDiscardDraft,
  onRunAction,
}: Readonly<AgentMessageProps>) {
  switch (message.role) {
    case 'thinking':
      return message.steps.length > 0 ? <ThinkingTrace steps={message.steps} done={message.done} /> : null;
    case 'user':
      return (
        // 멈춘 요청은 흐리게 두고 "중단됨"을 붙인다 — 다음 요청에는 이어지지 않는다는 것을 보여 준다
        <div className="flex flex-col items-end gap-1">
          <p
            className={cn(
              'w-fit max-w-[85%] rounded-2xl rounded-br-md px-3.5 py-2 text-sm whitespace-pre-wrap text-white',
              message.cancelled ? 'bg-blue-500/40 dark:bg-blue-500/30' : 'bg-blue-500'
            )}
          >
            {message.text}
          </p>
          {message.cancelled && <span className="text-[11px] text-zinc-400">중단됨 · 다음 요청에 이어지지 않아요</span>}
        </div>
      );
    case 'assistant':
      return (
        // w-fit: 블록 요소라 짧은 답도 최대 폭까지 늘어나던 것을 글 길이에 맞춘다. 모델이 끝에 붙이는 빈 줄은 떼어 낸다.
        <div className="space-y-2">
          <p className="w-fit max-w-[90%] rounded-2xl rounded-bl-md bg-zinc-100 px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100">
            {message.text.trim()}
            {message.streaming && (
              <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-current align-middle" />
            )}
          </p>
          {/* 다음 할 일 — 답변을 다 쓴 뒤에만. 줄바꿈해 칩마다 온전히 보이게 한다 */}
          {!message.streaming && message.actions && message.actions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {message.actions.map((a) => (
                <AgentActionChip key={a.id} action={a} busy={isRunning} onRun={onRunAction} />
              ))}
            </div>
          )}
        </div>
      );
    case 'tool':
      return (
        <div className="space-y-1.5">
          <p className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
            {message.status === 'running' ? (
              <Loader2 size={14} className="shrink-0 animate-spin" aria-hidden />
            ) : message.status === 'done' ? (
              <Check size={14} className="shrink-0 text-green-500" aria-hidden />
            ) : (
              <AlertCircle size={14} className="shrink-0 text-amber-500" aria-hidden />
            )}
            <span>
              {message.title}
              {message.status === 'running' ? ' 실행 중' : message.status === 'done' ? ' 완료' : ' 실패'}
            </span>
          </p>
          {message.changes && message.changes.length > 0 && (
            <ChangeCard
              lines={message.changes}
              undo={message.undo}
              isRunning={isRunning}
              onUndo={() => onUndo(message.id)}
            />
          )}
        </div>
      );
    case 'confirm': {
      const { options, status } = message;
      const isDanger = options.variant === 'danger';
      return (
        <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-700">
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{options.title}</p>
          {options.description && (
            <div className="mt-1 text-xs leading-relaxed whitespace-pre-wrap text-zinc-600 dark:text-zinc-300">
              {options.description}
            </div>
          )}
          {status === 'pending' ? (
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => onAnswerConfirm(message.id, false)}
                className="flex-1 rounded-lg bg-zinc-100 px-3 py-2 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
              >
                {options.cancelText ?? '취소'}
              </button>
              <button
                type="button"
                onClick={() => onAnswerConfirm(message.id, true)}
                className={cn(
                  'flex-1 rounded-lg px-3 py-2 text-xs font-semibold text-white transition-colors',
                  isDanger ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-500 hover:bg-blue-600'
                )}
              >
                {options.confirmText ?? '확인'}
              </button>
            </div>
          ) : (
            <p className="mt-2 text-[11px] font-semibold text-zinc-400 dark:text-zinc-500">
              {status === 'approved' ? '진행했어요' : '취소했어요'}
            </p>
          )}
        </div>
      );
    }
    case 'draft':
      return (
        <DraftCard
          draft={message.draft}
          status={message.status}
          isRunning={isRunning}
          onApply={() => onApplyDraft(message.id)}
          onDiscard={() => onDiscardDraft(message.id)}
        />
      );
    case 'error':
      return (
        <p className="flex items-start gap-2 text-xs text-red-600 dark:text-red-400">
          <AlertCircle size={14} className="mt-px shrink-0" aria-hidden />
          {message.text}
        </p>
      );
  }
}

type ChangeCardProps = {
  lines: ReadonlyArray<string>;
  undo?: 'available' | 'done' | 'stale';
  isRunning: boolean;
  onUndo: () => void;
};

// 도구가 바꾼 내용 — 무엇이 바뀌었는지 줄로 보여 주고 되돌리기를 단다. 길면 접어 두고 펼칠 수 있다.
// Nano가 거친 단계 — 응답이 몇 초씩 걸려 기다리는 동안 무엇을 하는지 보여 준다(GitHub 커밋 분류의 "AI가 생각하는 과정"처럼).
// 처리 중에는 펼쳐 두고, 끝나면 한 줄로 접는다(눌러서 다시 볼 수 있다).
function ThinkingTrace({ steps, done }: Readonly<{ steps: ReadonlyArray<AgentThinkingStep>; done: boolean }>) {
  // 사용자가 직접 펴거나 접었으면 그대로 둔다
  const [toggled, setToggled] = useState<boolean | null>(null);
  const open = toggled ?? !done;
  return (
    <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
      <button
        type="button"
        onClick={() => setToggled(!open)}
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-md py-0.5 font-medium transition-colors hover:text-zinc-700 dark:hover:text-zinc-200"
      >
        <Brain size={12} aria-hidden />
        {done ? `Nano가 생각한 과정 · ${steps.length}단계` : 'Nano가 생각하는 중'}
        <ChevronDown size={12} className={cn('transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <ol className="mt-1 space-y-1 border-l border-zinc-200 pl-3 dark:border-zinc-700">
          {steps.map((step) => (
            <li key={step.key} className="flex min-w-0 items-start gap-1.5">
              {step.status === 'running' ? (
                <Loader2 size={11} className="mt-0.5 shrink-0 animate-spin" aria-hidden />
              ) : (
                <Check size={11} className="mt-0.5 shrink-0 text-emerald-500" aria-hidden />
              )}
              <span className="min-w-0">
                <span className="text-zinc-600 dark:text-zinc-300">{step.label}</span>
                {step.detail && (
                  <span className="block truncate font-mono text-[10px] text-zinc-400 dark:text-zinc-500">
                    {step.detail}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function ChangeCard({ lines, undo, isRunning, onUndo }: Readonly<ChangeCardProps>) {
  const [isExpanded, setIsExpanded] = useState(false);
  const visible = isExpanded ? lines : lines.slice(0, AGENT_CHANGE_VISIBLE_LINES);
  const hidden = lines.length - visible.length;

  return (
    <div
      className={cn(
        'ml-5 rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-700',
        undo === 'done' && 'opacity-60'
      )}
    >
      <ul className="space-y-0.5 text-xs text-zinc-700 dark:text-zinc-200">
        {visible.map((line, index) => (
          <li
            key={`${index}-${line}`}
            className={cn(
              'break-all',
              line.startsWith('＋') && 'text-green-700 dark:text-green-400',
              line.startsWith('－') && 'text-red-600 line-through decoration-red-300 dark:text-red-400'
            )}
          >
            {line}
          </li>
        ))}
      </ul>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        {hidden > 0 ? (
          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            className="text-[11px] text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            외 {hidden}건 더 보기
          </button>
        ) : (
          <span />
        )}
        {undo === 'available' && (
          <button
            type="button"
            onClick={onUndo}
            // 처리 중에도 누를 수 있게 둔다(흐리게만) — 누르면 처리 중이라고 알린다
            aria-disabled={isRunning || undefined}
            className={cn(
              'flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-blue-600 transition-colors hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/40',
              isRunning && 'opacity-40'
            )}
          >
            <Undo2 size={12} aria-hidden />
            되돌리기
          </button>
        )}
        {undo === 'done' && <span className="text-[11px] text-zinc-400 dark:text-zinc-500">되돌렸어요</span>}
        {undo === 'stale' && (
          <span className="text-[11px] text-zinc-400 dark:text-zinc-500">이후 내용이 바뀌어 되돌릴 수 없어요</span>
        )}
      </div>
    </div>
  );
}

type DraftCardProps = {
  draft: AgentNotesDraft;
  status: 'pending' | 'applied' | 'discarded';
  isRunning: boolean;
  onApply: () => void;
  onDiscard: () => void;
};

// 메모를 정리한 보고서 초안 — 폼에 넣기 전에 확인한다. 넣은 뒤에는 변경 카드에서 되돌릴 수 있다.
function DraftCard({ draft, status, isRunning, onApply, onDiscard }: Readonly<DraftCardProps>) {
  const sections = [
    { label: '금일 업무 진행 현황', projects: draft.today },
    { label: '익일 업무 진행 예정', projects: draft.tomorrow },
  ].filter((section) => section.projects.length > 0);

  return (
    <div
      className={cn('rounded-xl border border-zinc-200 p-3 dark:border-zinc-700', status !== 'pending' && 'opacity-60')}
    >
      <p className="flex items-center gap-1.5 text-xs font-semibold text-zinc-800 dark:text-zinc-100">
        <NotebookPen size={14} aria-hidden />
        보고서 초안
      </p>
      <div className="mt-2 space-y-2">
        {sections.map((section) => (
          <div key={section.label}>
            <p className="text-[11px] font-semibold text-zinc-400 dark:text-zinc-500">{section.label}</p>
            <ul className="mt-1 space-y-1">
              {section.projects.map((project) => (
                <li key={project.name} className="text-xs text-zinc-700 dark:text-zinc-200">
                  <p className="font-semibold">{project.name}</p>
                  <ul className="ml-3">
                    {project.tasks.map((task) => (
                      <li key={task.content} className="flex justify-between gap-2">
                        <span className="min-w-0 break-all">· {task.content}</span>
                        <span className="shrink-0 text-zinc-400 tabular-nums">{task.progress}%</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {status === 'pending' ? (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onDiscard}
            className="flex-1 rounded-lg bg-zinc-100 px-3 py-2 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-200 disabled:opacity-40 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onApply}
            // 처리 중에도 누를 수 있게 둔다(흐리게만) — 누르면 처리 중이라고 알린다. 취소는 AI 를 쓰지 않아 늘 된다
            aria-disabled={isRunning || undefined}
            className={cn(
              'flex-1 rounded-lg bg-blue-500 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-600',
              isRunning && 'opacity-40'
            )}
          >
            추가
          </button>
        </div>
      ) : (
        <p className="mt-2 text-[11px] font-semibold text-zinc-400 dark:text-zinc-500">
          {status === 'applied' ? '보고서에 추가했어요' : '취소했어요'}
        </p>
      )}
    </div>
  );
}
