'use client';

import { type KeyboardEvent, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import {
  ArrowUp,
  ChevronsLeft,
  ChevronsRight,
  Github,
  Lightbulb,
  Loader2,
  NotebookPen,
  RotateCcw,
  Shuffle,
  Sparkles,
  Square,
} from 'lucide-react';
import type { AgentAction, AgentChatMessage, AgentQuickAction, AgentSuggestion } from '@/types';
import { AGENT_CHAT_EXAMPLE_COUNT, AGENT_CHAT_EXAMPLES, AGENT_NOTES_MAX_CHARS } from '@/constants';
import { useDismissLayer, useSignalEffect } from '@/hooks';
import { useAgentChatStore } from '@/stores';
import { cn } from '@/utils';
import { CloseButton, useDismissOnBack } from '..';
import {
  AgentActionChip,
  AgentAvailabilityNotice,
  AgentMessage,
  AgentMicButton,
  AgentSuggestionCard,
  AgentSuggestionHeading,
  ReportLivePreview,
  useSpeechInput,
} from '.';

type Props = {
  availability: LanguageModelAvailability | null;
  downloadProgress: number | null;
  messages: ReadonlyArray<AgentChatMessage>;
  // 지금 등록된(채팅에 보이는) 도구 이름 — 화면에 맞는 예시만 보여 준다
  toolNames: ReadonlyArray<string>;
  isRunning: boolean;
  isContextTrimmed: boolean;
  suggestions: ReadonlyArray<AgentSuggestion>;
  quickActions: ReadonlyArray<AgentQuickAction>;
  canWriteFromNotes: boolean;
  isNotesMode: boolean;
  onNotesModeChange: (isNotesMode: boolean) => void;
  onSend: (text: string) => void;
  onSubmitNotes: (notes: string) => void;
  onRunAction: (action: AgentAction) => void;
  onRunSuggestion: (suggestion: AgentSuggestion) => void;
  onDismissSuggestion: (suggestion: AgentSuggestion) => void;
  onStop: () => void;
  onReset: () => void;
  onDownload: () => void;
  onAnswerConfirm: (id: string, ok: boolean) => void;
  onUndo: (id: string) => void;
  onApplyDraft: (id: string) => void;
  onDiscardDraft: (id: string) => void;
};

// seed 로 섞은 순서 — 같은 seed 면 같은 순서라 렌더마다 바뀌지 않는다(선형 합동 생성기로 Fisher-Yates)
const shuffleBySeed = <T,>(items: ReadonlyArray<T>, seed: number): Array<T> => {
  const result = [...items];
  let state = seed;
  for (let i = result.length - 1; i > 0; i--) {
    state = (state * 1103515245 + 12345) % 2147483648;
    const j = state % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

// 예시를 섞는 seed — 패널은 서버에서도 렌더되므로 난수를 프리렌더에서 읽지 않는다(서버 0, 클라이언트는 처음 한 번 뽑은 값)
let clientExampleSeed: number | null = null;
const subscribeNever = () => () => {};
const getClientExampleSeed = () => (clientExampleSeed ??= Math.floor(Math.random() * 2147483648));
const getServerExampleSeed = () => 0;

const iconButtonClass =
  'inline-flex shrink-0 items-center justify-center rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-200';

// AI 도우미 패널 — 서비스 에이전트의 본체.
// - 데스크톱(lg 이상): 늘 오른쪽에 있다. 펼치면 400px 열, 접으면 56px 레일(아이콘·추천 개수)로 남는다 — 사라지지 않는다.
//   AgentLayoutShell 이 같은 너비(lg:pr-[400px] / lg:pr-14)만큼 본문을 밀어 나란히 보인다. 헤더(h-14 + 아래 테두리)는 상단바와 같은 높이라 줄이 맞는다.
// - 모바일(lg 미만): 전체 화면 시트. 상단바 버튼·⌘K·홈 입력창·제안 알약으로 연다. 폼이 가려지므로 작성 중인 보고서 미리보기를 위에 둔다.
// 비모달이라 배경을 깔지 않고, 바깥 클릭으로 닫지 않는다(모바일 시트만 Esc·back·X 로 닫는다).
export function AgentPanel({
  availability,
  downloadProgress,
  messages,
  toolNames,
  isRunning,
  isContextTrimmed,
  suggestions,
  quickActions,
  canWriteFromNotes,
  isNotesMode,
  onNotesModeChange,
  onSend,
  onSubmitNotes,
  onRunAction,
  onRunSuggestion,
  onDismissSuggestion,
  onStop,
  onReset,
  onDownload,
  onAnswerConfirm,
  onUndo,
  onApplyDraft,
  onDiscardDraft,
}: Readonly<Props>) {
  const isOpen = useAgentChatStore((s) => s.isOpen);
  const expanded = useAgentChatStore((s) => s.expanded);
  const focusSignal = useAgentChatStore((s) => s.focusSignal);
  const panelRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const inputId = useId();
  const [draft, setDraft] = useState('');
  const [notes, setNotes] = useState('');
  const baseSeed = useSyncExternalStore(subscribeNever, getClientExampleSeed, getServerExampleSeed);
  // "다른 예시"를 누를 때마다 더해 다시 섞는다
  const [seedOffset, setSeedOffset] = useState(0);
  const exampleSeed = baseSeed + seedOffset;

  const close = () => useAgentChatStore.getState().setOpen(false);
  // 모바일 시트만 닫기 층에 올린다 — 데스크톱 패널은 늘 있는 열이라 Esc 로 닫지 않는다
  useDismissLayer(panelRef, close, { enabled: isOpen, outsideClick: false });
  useDismissOnBack(isOpen, close);

  // ⌘K·홈 입력창 등에서 도우미를 부르면 입력칸으로 포커스를 옮긴다
  useSignalEffect(focusSignal > 0 ? String(focusSignal) : null, () => inputRef.current?.focus());

  // 새 내용이 오면 맨 아래로 따라간다 — 위로 올려 읽는 중이면(바닥에서 멀면) 그대로 둔다
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 160) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // 받아쓰기는 지금 쓰는 칸(채팅 입력 / 메모)에 이어 붙인다
  const speechBase = useRef('');
  const speech = useSpeechInput((transcript) => {
    const next = speechBase.current ? `${speechBase.current} ${transcript}` : transcript;
    if (isNotesMode) setNotes(next.slice(0, AGENT_NOTES_MAX_CHARS));
    else setDraft(next);
  });
  const toggleSpeech = () => {
    if (speech.isListening) {
      speech.stop();
      return;
    }
    speechBase.current = (isNotesMode ? notes : draft).trim();
    void speech.start();
  };

  const isReady = availability === 'available';
  const submit = (text: string) => {
    if (isRunning || !isReady || text.trim() === '') return;
    onSend(text);
    setDraft('');
  };
  const submitNotes = () => {
    if (isRunning || notes.trim() === '') return;
    speech.stop();
    onSubmitNotes(notes);
    setNotes('');
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // 한글 조합 중 Enter 는 조합 확정이므로 보내지 않는다
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    submit(draft);
  };

  const examples = isReady
    ? shuffleBySeed(
        AGENT_CHAT_EXAMPLES.filter((e) => toolNames.includes(e.tool)).map((e) => e.text),
        exampleSeed
      )
    : [];

  return (
    <aside
      ref={panelRef}
      aria-label="AI 도우미"
      className={cn(
        'z-45 flex-col bg-white dark:bg-zinc-950',
        isOpen ? 'fixed inset-0 flex h-dvh' : 'hidden',
        'lg:fixed lg:inset-y-0 lg:right-0 lg:left-auto lg:flex lg:h-dvh lg:border-l lg:border-zinc-200 lg:dark:border-zinc-800',
        expanded ? 'lg:w-[400px]' : 'lg:w-14'
      )}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {!expanded && (
        <AgentRail
          suggestionCount={suggestions.length}
          quickActions={quickActions}
          isRunning={isRunning}
          onExpand={() => useAgentChatStore.getState().setExpanded(true)}
          onRunAction={onRunAction}
        />
      )}

      <div className={cn('flex min-h-0 flex-1 flex-col', !expanded && 'lg:hidden')}>
        {/* 상단바와 같은 높이(h-14 + 아래 테두리) — 데스크톱에서 두 헤더의 줄이 이어진다 */}
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-zinc-200 pr-2.5 pl-4 dark:border-zinc-800">
          <Sparkles size={16} className="shrink-0 text-blue-500" aria-hidden />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">AI 도우미</h2>
            <p className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">
              다음 할 일을 추천하고, 말하면 대신 실행해요
            </p>
          </div>
          {messages.length > 0 && (
            <button type="button" onClick={onReset} aria-label="새 대화" title="새 대화" className={iconButtonClass}>
              <RotateCcw size={14} aria-hidden />
            </button>
          )}
          <button
            type="button"
            onClick={() => useAgentChatStore.getState().setExpanded(false)}
            aria-label="도우미 접기"
            title="도우미 접기"
            className={cn(iconButtonClass, 'hidden lg:inline-flex')}
          >
            <ChevronsRight size={16} aria-hidden />
          </button>
          <CloseButton size="sm" onClick={close} className="lg:hidden" />
        </header>

        {toolNames.includes('get_current_report') && <ReportLivePreview />}

        <div
          ref={scrollRef}
          className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 select-text"
        >
          <AgentAvailabilityNotice
            availability={availability}
            downloadProgress={downloadProgress}
            onDownload={onDownload}
          />

          {messages.length === 0 ? (
            <>
              {suggestions.length > 0 && (
                <section className="space-y-2">
                  <AgentSuggestionHeading>지금 추천</AgentSuggestionHeading>
                  <div className="space-y-2">
                    {suggestions.map((s) => (
                      <AgentSuggestionCard
                        key={s.id}
                        suggestion={s}
                        disabled={isRunning}
                        onRun={onRunSuggestion}
                        onDismiss={onDismissSuggestion}
                      />
                    ))}
                  </div>
                </section>
              )}
              {quickActions.length > 0 && (
                <section className="space-y-2">
                  <p className="text-[11px] font-semibold text-zinc-400 dark:text-zinc-500">빠른 작업</p>
                  <div className="flex flex-wrap gap-2">
                    {quickActions.map((a) => (
                      <AgentActionChip key={a.id} action={a} disabled={isRunning} onRun={onRunAction} />
                    ))}
                  </div>
                </section>
              )}
              {examples.length > 0 && (
                <section className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-semibold text-zinc-400 dark:text-zinc-500">이렇게 말해 보세요</p>
                    {examples.length > AGENT_CHAT_EXAMPLE_COUNT && (
                      <button
                        type="button"
                        onClick={() => setSeedOffset((offset) => offset + 1)}
                        className="flex items-center gap-1 rounded-full px-2 py-1 text-[11px] text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                      >
                        <Shuffle size={12} aria-hidden />
                        다른 예시
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {examples.slice(0, AGENT_CHAT_EXAMPLE_COUNT).map((text) => (
                      <button
                        key={text}
                        type="button"
                        onClick={() => submit(text)}
                        className="rounded-full border border-zinc-200 px-3 py-1.5 text-left text-xs text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      >
                        {text}
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </>
          ) : (
            <ul className="space-y-3">
              {isContextTrimmed && (
                <li className="rounded-lg bg-zinc-50 px-3 py-2 text-[11px] leading-relaxed text-zinc-500 dark:bg-zinc-800/60 dark:text-zinc-400">
                  대화가 길어져 앞부분은 AI가 더 기억하지 못해요. 처음부터 다시 하려면 새 대화를 시작해 주세요.
                </li>
              )}
              {messages.map((message) => (
                <li key={message.id}>
                  <AgentMessage
                    message={message}
                    isRunning={isRunning}
                    onAnswerConfirm={onAnswerConfirm}
                    onUndo={onUndo}
                    onApplyDraft={onApplyDraft}
                    onDiscardDraft={onDiscardDraft}
                  />
                </li>
              ))}
              {isRunning && messages.at(-1)?.role !== 'assistant' && (
                <li className="flex items-center gap-2 text-xs text-zinc-400 dark:text-zinc-500">
                  <Loader2 size={14} className="animate-spin" aria-hidden />
                  처리하는 중...
                </li>
              )}
            </ul>
          )}
        </div>

        {/* 대화 중에도 다음 할 일을 바로 고를 수 있게 — 상황 제안·빠른 작업을 입력칸 위 한 줄로 둔다 */}
        {messages.length > 0 && !isNotesMode && !isRunning && (suggestions.length > 0 || quickActions.length > 0) && (
          <div className="flex shrink-0 [scrollbar-width:none] gap-2 overflow-x-auto border-t border-zinc-100 px-3 py-2 dark:border-zinc-800">
            {suggestions.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onRunSuggestion(s)}
                title={s.reason}
                className="flex shrink-0 items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-950/70"
              >
                <Lightbulb size={12} aria-hidden />
                {s.title}
              </button>
            ))}
            {quickActions
              .filter((a) => !suggestions.some((s) => s.id === a.id))
              .map((a) => (
                <AgentActionChip key={a.id} action={a} onRun={onRunAction} />
              ))}
          </div>
        )}

        {isNotesMode ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              submitNotes();
            }}
            className="shrink-0 space-y-2 border-t border-zinc-200 p-3 dark:border-zinc-800"
          >
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                <NotebookPen size={14} aria-hidden />
                메모로 보고서 쓰기
              </p>
              <span className="text-[11px] text-zinc-400 tabular-nums">
                {notes.length}/{AGENT_NOTES_MAX_CHARS}
              </span>
            </div>
            <label htmlFor={`${inputId}-notes`} className="sr-only">
              보고서로 정리할 메모
            </label>
            <textarea
              id={`${inputId}-notes`}
              value={notes}
              onChange={(event) => setNotes(event.target.value.slice(0, AGENT_NOTES_MAX_CHARS))}
              rows={6}
              autoFocus
              placeholder={
                '오늘 한 일, 내일 할 일을 편하게 적어 주세요.\n예) 로그인 오류 고침, 결제 리팩터링 절반 진행, 내일은 QA 회귀 테스트'
              }
              className="w-full resize-none rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-blue-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
            />
            <div className="flex items-center gap-2">
              {speech.isSupported && (
                <AgentMicButton isListening={speech.isListening} disabled={isRunning} onClick={toggleSpeech} />
              )}
              <button
                type="button"
                onClick={() => {
                  speech.stop();
                  onNotesModeChange(false);
                }}
                className="ml-auto rounded-lg px-3 py-2 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={isRunning || notes.trim() === ''}
                className="rounded-lg bg-zinc-900 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-zinc-800 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
              >
                보고서로 정리
              </button>
            </div>
          </form>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              submit(draft);
            }}
            className="flex shrink-0 items-end gap-2 border-t border-zinc-200 p-3 dark:border-zinc-800"
          >
            {canWriteFromNotes && isReady && (
              <button
                type="button"
                onClick={() => onNotesModeChange(true)}
                disabled={isRunning}
                aria-label="메모로 보고서 쓰기"
                title="메모로 보고서 쓰기"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              >
                <NotebookPen size={16} aria-hidden />
              </button>
            )}
            <label htmlFor={inputId} className="sr-only">
              AI 도우미에게 보낼 메시지
            </label>
            <textarea
              ref={inputRef}
              id={inputId}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              disabled={!isReady}
              placeholder={isReady ? '무엇이든 부탁해 보세요 (⌘K)' : '위의 추천과 빠른 작업을 눌러 보세요'}
              className="max-h-32 min-h-10 min-w-0 flex-1 resize-none rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-blue-400 disabled:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:disabled:bg-zinc-900/50"
              style={{ fieldSizing: 'content' } as React.CSSProperties}
            />
            {isReady && speech.isSupported && !isRunning && (
              <AgentMicButton isListening={speech.isListening} disabled={isRunning} onClick={toggleSpeech} />
            )}
            {isRunning ? (
              <button
                type="button"
                onClick={onStop}
                aria-label="멈추기"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-200 text-zinc-700 transition-colors hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-600"
              >
                <Square size={14} fill="currentColor" aria-hidden />
              </button>
            ) : (
              isReady && (
                <button
                  type="submit"
                  disabled={draft.trim() === ''}
                  aria-label="보내기"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-white transition-colors hover:bg-zinc-800 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                >
                  <ArrowUp size={16} aria-hidden />
                </button>
              )
            )}
          </form>
        )}
      </div>
    </aside>
  );
}

type AgentRailProps = {
  suggestionCount: number;
  quickActions: ReadonlyArray<AgentQuickAction>;
  isRunning: boolean;
  onExpand: () => void;
  onRunAction: (action: AgentAction) => void;
};

// 데스크톱에서 접었을 때의 레일 — 사라지지 않고 펼치기·추천 개수·자주 쓰는 작업(GitHub 가져오기 먼저)을 아이콘으로 남긴다
function AgentRail({ suggestionCount, quickActions, isRunning, onExpand, onRunAction }: Readonly<AgentRailProps>) {
  const github = quickActions.find((a) => a.emphasis);
  return (
    <div className="hidden h-full flex-col items-center lg:flex">
      <div className="flex h-14 w-full shrink-0 items-center justify-center border-b border-zinc-200 dark:border-zinc-800">
        <button
          type="button"
          onClick={onExpand}
          aria-label="도우미 펼치기"
          title="도우미 펼치기 (⌘K)"
          className={iconButtonClass}
        >
          <ChevronsLeft size={16} aria-hidden />
        </button>
      </div>
      <div className="flex flex-col items-center gap-2 py-3">
        <button
          type="button"
          onClick={onExpand}
          aria-label={`AI 도우미 열기${suggestionCount > 0 ? `, 추천 ${suggestionCount}개` : ''}`}
          title="AI 도우미"
          className="relative flex h-10 w-10 items-center justify-center rounded-xl text-blue-500 transition-colors hover:bg-blue-50 dark:hover:bg-blue-950/40"
        >
          {isRunning ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <Sparkles size={18} aria-hidden />}
          {suggestionCount > 0 && !isRunning && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-500 px-1 text-[10px] font-bold text-white">
              {suggestionCount}
            </span>
          )}
        </button>
        {github && (
          <span className="rainbow-glow rounded-xl" title={github.label}>
            <button
              type="button"
              onClick={() => onRunAction(github.action)}
              disabled={isRunning}
              aria-label={github.label}
              className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-white/60 text-zinc-900 backdrop-blur-sm transition-colors hover:bg-white/45 disabled:opacity-50 dark:bg-zinc-900/50 dark:text-white dark:hover:bg-zinc-900/35"
            >
              <Github size={18} aria-hidden />
            </button>
          </span>
        )}
      </div>
    </div>
  );
}
