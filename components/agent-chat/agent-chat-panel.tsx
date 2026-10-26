'use client';

import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowUp,
  Check,
  Cpu,
  Download,
  Lightbulb,
  Loader2,
  Maximize2,
  Mic,
  Minimize2,
  NotebookPen,
  RotateCcw,
  Shuffle,
  Sparkles,
  Square,
  Undo2,
} from 'lucide-react';
import type { AgentChatLayout, AgentChatMessage, AgentNotesDraft } from '@/types';
import {
  AGENT_NOTES_MAX_CHARS,
  AGENT_CHANGE_VISIBLE_LINES,
  AGENT_CHAT_EXAMPLE_COUNT,
  AGENT_CHAT_EXAMPLE_ROTATE_MS,
  AGENT_CHAT_EXAMPLES,
} from '@/constants';
import { useDismissLayer } from '@/hooks';
import { cn } from '@/utils';
import { CloseButton, useDismissOnBack } from '..';
import { ReportLivePreview, useAgentRecommendations, useSpeechInput } from '.';

type Props = {
  availability: LanguageModelAvailability | null;
  // 모델 내려받는 중이면 0~1, 아니면 null
  downloadProgress: number | null;
  messages: ReadonlyArray<AgentChatMessage>;
  // 지금 등록된 도구 이름 — 화면에 맞는 추천 질문만 보여 준다
  toolNames: ReadonlyArray<string>;
  isRunning: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  onReset: () => void;
  onClose: () => void;
  onDownload: () => void;
  onAnswerConfirm: (id: string, ok: boolean) => void;
  // 변경 카드의 되돌리기
  onUndo: (id: string) => void;
  // 컨텍스트 창이 모자라 앞부분 대화를 AI 에게 넘기지 못한 적이 있다
  isContextTrimmed: boolean;
  layout: AgentChatLayout;
  onToggleLayout: () => void;
  // 메모로 보고서 쓰기 — 보고서 작성 화면에서만 쓸 수 있다
  canWriteFromNotes: boolean;
  onSubmitNotes: (notes: string) => void;
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

// 모바일(sm 미만)은 하단 시트, 그 이상은 우측 하단 떠 있는 패널.
// 페이지를 가리지 않는 비모달 창이라 배경을 깔지 않는다 — 도구가 폼을 채우는 모습을 옆에서 보면서 대화한다.
// 그래서 바깥 클릭으로는 닫지 않고(폼을 만지다 닫히지 않게) Esc·back·X 로만 닫는다.
export function AgentChatPanel({
  availability,
  downloadProgress,
  messages,
  toolNames,
  isRunning,
  onSend,
  onStop,
  onReset,
  onClose,
  onDownload,
  onAnswerConfirm,
  onUndo,
  isContextTrimmed,
  layout,
  onToggleLayout,
  canWriteFromNotes,
  onSubmitNotes,
  onApplyDraft,
  onDiscardDraft,
}: Readonly<Props>) {
  const panelRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputId = useId();
  const [draft, setDraft] = useState('');
  // 예시는 열 때마다 무작위 순서로 — "다른 예시"를 누르면 seed 를 바꿔 다시 섞는다
  const [exampleSeed, setExampleSeed] = useState(() => Math.floor(Math.random() * 2147483648));
  const [exampleTick, setExampleTick] = useState(0);
  // 먼저 권하는 일 — 패널은 열렸을 때만(클라이언트) 렌더되므로 여기서 계산한다. 늘 렌더되는 AgentAssistant 에서 부르면
  // 지금 시각(new Date)이 서버 프리렌더 중에 읽혀 Cache Components 규칙에 걸린다.
  const recommendations = useAgentRecommendations(toolNames, canWriteFromNotes);
  // 메모로 보고서 쓰기 입력 — 채팅 입력과 따로 둔다(메모는 길고, 보내면 초안 카드가 된다)
  const [isNotesMode, setIsNotesMode] = useState(false);
  const [notes, setNotes] = useState('');

  // 받아쓰기는 지금 쓰는 칸(채팅 입력 / 메모)에 이어 붙인다 — 시작할 때 있던 글은 그대로 두고 뒤에 붙인다
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

  // 대화 중 예시 칩을 돌려 가며 바꿔, 할 수 있는 일을 조금씩 보여 준다.
  // 입력칸 안내 문구로 돌리지 않는 이유: 입력칸이 내용 길이에 맞춰 늘어나(field-sizing) 긴 예시마다 높이가 출렁인다.
  useEffect(() => {
    const timer = setInterval(() => setExampleTick((t) => t + 1), AGENT_CHAT_EXAMPLE_ROTATE_MS);
    return () => clearInterval(timer);
  }, []);

  useDismissLayer(panelRef, onClose, { outsideClick: false });
  useDismissOnBack(true, onClose);

  // 새 내용이 오면 맨 아래로 따라간다 — 위로 올려 읽는 중이면(바닥에서 멀면) 그대로 둔다
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 160) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const submit = (text: string) => {
    if (isRunning || text.trim() === '') return;
    onSend(text);
    setDraft('');
  };

  const submitNotes = () => {
    if (isRunning || notes.trim() === '') return;
    speech.stop();
    onSubmitNotes(notes);
    setNotes('');
    setIsNotesMode(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // 한글 조합 중 Enter 는 조합 확정이므로 보내지 않는다
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    submit(draft);
  };

  const isReady = availability === 'available';
  // 지금 화면에 도구가 있는 예시만 — 다른 화면의 기능을 권하지 않는다
  const examples = shuffleBySeed(
    AGENT_CHAT_EXAMPLES.filter((e) => toolNames.includes(e.tool)).map((e) => e.text),
    exampleSeed
  );
  const rotatingExample = examples.length > 0 ? examples[exampleTick % examples.length] : null;

  return (
    <section
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-label="AI 도우미"
      className={cn(
        'fixed z-45 flex flex-col bg-white dark:bg-zinc-900',
        layout === 'docked'
          ? // AI 모드: lg 미만은 전체 화면, lg 이상은 오른쪽 전체 높이 열(AgentLayoutShell 의 lg:pr-[440px] 과 맞춘다)
            'inset-0 h-dvh lg:left-auto lg:w-[440px] lg:border-l lg:border-zinc-200 lg:dark:border-zinc-800'
          : 'inset-x-0 bottom-0 h-[80dvh] rounded-t-2xl border border-zinc-200 shadow-2xl sm:inset-x-auto sm:right-4 sm:bottom-4 sm:h-[min(680px,calc(100dvh-6rem))] sm:w-[400px] sm:rounded-2xl dark:border-zinc-800'
      )}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <header className="flex items-center gap-2 border-b border-zinc-100 py-2.5 pr-2.5 pl-4 dark:border-zinc-800">
        <Sparkles size={16} className="shrink-0 text-blue-500" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">AI 도우미</h2>
          <p className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">
            이 기기 안의 AI가 답하고, 화면의 기능을 대신 실행해요
          </p>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={onReset}
            aria-label="새 대화"
            title="새 대화"
            className="inline-flex shrink-0 items-center justify-center rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <RotateCcw size={14} aria-hidden />
          </button>
        )}
        <button
          type="button"
          onClick={onToggleLayout}
          aria-label={layout === 'docked' ? '작게 보기' : 'AI 모드로 크게 보기'}
          title={layout === 'docked' ? '작게 보기' : 'AI 모드로 크게 보기'}
          className="inline-flex shrink-0 items-center justify-center rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
        >
          {layout === 'docked' ? <Minimize2 size={14} aria-hidden /> : <Maximize2 size={14} aria-hidden />}
        </button>
        <CloseButton size="sm" onClick={onClose} />
      </header>

      {layout === 'docked' && isReady && toolNames.includes('get_current_report') && <ReportLivePreview />}

      <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 select-text">
        {!isReady ? (
          <AvailabilityNotice availability={availability} downloadProgress={downloadProgress} onDownload={onDownload} />
        ) : messages.length === 0 ? (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
              무엇을 도와드릴까요? 보고서를 채우거나 지난 기록을 정리하는 등 이 화면에서 할 수 있는 일을 말로 시켜
              보세요.{canWriteFromNotes && ' 오늘 한 일을 메모처럼 적으면 보고서로 정리해 드려요.'} AI가 바꾼 내용은
              바로 되돌릴 수 있어요.
            </p>
            {recommendations.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-zinc-400 dark:text-zinc-500">추천</p>
                <ul className="space-y-1.5">
                  {recommendations.map((r) => (
                    <li key={r.text}>
                      <button
                        type="button"
                        onClick={() => (r.action === 'notes' ? setIsNotesMode(true) : submit(r.text))}
                        className="flex w-full items-start gap-2 rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-2 text-left transition-colors hover:bg-blue-50 dark:border-blue-900/50 dark:bg-blue-950/30 dark:hover:bg-blue-950/50"
                      >
                        {r.action === 'notes' ? (
                          <NotebookPen size={14} className="mt-0.5 shrink-0 text-blue-500" aria-hidden />
                        ) : (
                          <Sparkles size={14} className="mt-0.5 shrink-0 text-blue-500" aria-hidden />
                        )}
                        <span className="min-w-0">
                          <span className="block text-xs font-semibold text-zinc-800 dark:text-zinc-100">{r.text}</span>
                          <span className="block text-[11px] text-zinc-500 dark:text-zinc-400">{r.reason}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {examples.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold text-zinc-400 dark:text-zinc-500">이렇게 말해 보세요</p>
                  {examples.length > AGENT_CHAT_EXAMPLE_COUNT && (
                    <button
                      type="button"
                      onClick={() => setExampleSeed((seed) => seed + 1)}
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
              </div>
            )}
          </div>
        ) : (
          <ul className="space-y-3">
            {isContextTrimmed && (
              <li className="rounded-lg bg-zinc-50 px-3 py-2 text-[11px] leading-relaxed text-zinc-500 dark:bg-zinc-800/60 dark:text-zinc-400">
                대화가 길어져 앞부분은 AI가 더 기억하지 못해요. 처음부터 다시 하려면 새 대화를 시작해 주세요.
              </li>
            )}
            {messages.map((message) => (
              <li key={message.id}>
                <ChatMessage
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
                생각하는 중...
              </li>
            )}
          </ul>
        )}
      </div>

      {isReady && !isNotesMode && messages.length > 0 && !isRunning && rotatingExample && (
        // 대화 중에도 다른 기능을 알 수 있게 예시 하나를 돌려 가며 보여 준다. 누르면 보내지 않고 입력칸에 채운다.
        <button
          type="button"
          onClick={() => setDraft(rotatingExample)}
          className="mx-3 flex items-center gap-1.5 truncate rounded-lg px-2 py-1 text-left text-[11px] text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
        >
          <Lightbulb size={12} className="shrink-0" aria-hidden />
          <span className="truncate">이렇게도 말해 보세요 · {rotatingExample}</span>
        </button>
      )}

      {isReady && isNotesMode && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submitNotes();
          }}
          className="space-y-2 border-t border-zinc-100 p-3 dark:border-zinc-800"
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
            className="w-full resize-none rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-blue-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500"
          />
          <div className="flex items-center gap-2">
            {speech.isSupported && (
              <MicButton isListening={speech.isListening} disabled={isRunning} onClick={toggleSpeech} />
            )}
            <button
              type="button"
              onClick={() => {
                speech.stop();
                setIsNotesMode(false);
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
      )}

      {isReady && !isNotesMode && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit(draft);
          }}
          className="flex items-end gap-2 border-t border-zinc-100 p-3 dark:border-zinc-800"
        >
          {canWriteFromNotes && (
            <button
              type="button"
              onClick={() => setIsNotesMode(true)}
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
            id={inputId}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder="AI 도우미에게 부탁할 일을 적어 주세요"
            className="max-h-32 min-h-10 min-w-0 flex-1 resize-none rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-blue-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500"
            style={{ fieldSizing: 'content' } as React.CSSProperties}
          />
          {speech.isSupported && !isRunning && (
            <MicButton isListening={speech.isListening} disabled={isRunning} onClick={toggleSpeech} />
          )}
          {isRunning ? (
            <button
              type="button"
              onClick={onStop}
              aria-label="응답 멈추기"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-200 text-zinc-700 transition-colors hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-600"
            >
              <Square size={14} fill="currentColor" aria-hidden />
            </button>
          ) : (
            <button
              type="submit"
              disabled={draft.trim() === ''}
              aria-label="보내기"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-white transition-colors hover:bg-zinc-800 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
            >
              <ArrowUp size={16} aria-hidden />
            </button>
          )}
        </form>
      )}
    </section>
  );
}

type ChatMessageProps = {
  message: AgentChatMessage;
  isRunning: boolean;
  onAnswerConfirm: (id: string, ok: boolean) => void;
  onUndo: (id: string) => void;
  onApplyDraft: (id: string) => void;
  onDiscardDraft: (id: string) => void;
};

function ChatMessage({
  message,
  isRunning,
  onAnswerConfirm,
  onUndo,
  onApplyDraft,
  onDiscardDraft,
}: Readonly<ChatMessageProps>) {
  switch (message.role) {
    case 'user':
      return (
        <div className="flex justify-end">
          <p className="w-fit max-w-[85%] rounded-2xl rounded-br-md bg-blue-500 px-3.5 py-2 text-sm whitespace-pre-wrap text-white">
            {message.text}
          </p>
        </div>
      );
    case 'assistant':
      return (
        // w-fit: 블록 요소라 짧은 답도 최대 폭까지 늘어나던 것을 글 길이에 맞춘다. 모델이 끝에 붙이는 빈 줄은 떼어 낸다.
        <p className="w-fit max-w-[90%] rounded-2xl rounded-bl-md bg-zinc-100 px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100">
          {message.text.trim()}
          {message.streaming && (
            <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-current align-middle" />
          )}
        </p>
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
              {status === 'approved' ? '승인했어요' : '취소했어요'}
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

type AvailabilityNoticeProps = Pick<Props, 'availability' | 'downloadProgress' | 'onDownload'>;

// 모델을 쓸 수 있을 때만 대화를 연다. 미지원 브라우저·모델 미설치를 구분해 안내하고, 다운로드는 버튼 클릭으로만 시작한다.
function AvailabilityNotice({ availability, downloadProgress, onDownload }: Readonly<AvailabilityNoticeProps>) {
  if (availability === null)
    return (
      <p className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
        <Loader2 size={16} className="animate-spin" aria-hidden />
        온디바이스 AI를 확인하는 중...
      </p>
    );

  const canDownload = availability === 'downloadable' || availability === 'downloading';
  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
          <Cpu size={18} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {canDownload
              ? '이 기기에 온디바이스 AI 모델이 아직 없어요'
              : '이 브라우저에서는 온디바이스 AI를 쓸 수 없어요'}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            {canDownload
              ? 'AI 도우미는 Chrome에 내장된 AI 모델로 이 기기 안에서 답해요. 대화 내용은 외부로 보내지 않아요. 처음 한 번만 받으며, 용량이 커서 몇 분 걸릴 수 있어요.'
              : 'AI 도우미는 Chrome 데스크톱 최신 버전에 내장된 AI 모델로 동작해요. 기기 사양에 따라 쓸 수 없을 수도 있어요. 보고서 작성은 AI 없이도 그대로 쓸 수 있어요.'}
          </p>
        </div>
      </div>
      {canDownload &&
        (downloadProgress === null ? (
          <button
            type="button"
            onClick={onDownload}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            <Download size={16} aria-hidden />
            {availability === 'downloading' ? '내려받기 진행 상황 보기' : 'AI 모델 받기'}
          </button>
        ) : (
          <div className="space-y-1.5" role="status">
            <div className="h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div
                className="h-full rounded-full bg-blue-500 transition-[width]"
                style={{ width: `${Math.round(downloadProgress * 100)}%` }}
              />
            </div>
            <p className="text-center text-[11px] text-zinc-500 dark:text-zinc-400">
              AI 모델을 내려받는 중... {Math.round(downloadProgress * 100)}%
            </p>
          </div>
        ))}
    </div>
  );
}

type ChangeCardProps = {
  lines: ReadonlyArray<string>;
  undo?: 'available' | 'done' | 'stale';
  isRunning: boolean;
  onUndo: () => void;
};

// 도구가 바꾼 내용 — 무엇이 바뀌었는지 줄로 보여 주고 되돌리기를 단다. 길면 접어 두고 펼칠 수 있다.
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
            disabled={isRunning}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-blue-600 transition-colors hover:bg-blue-50 disabled:opacity-40 dark:text-blue-400 dark:hover:bg-blue-950/40"
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

type MicButtonProps = { isListening: boolean; disabled: boolean; onClick: () => void };

function MicButton({ isListening, disabled, onClick }: Readonly<MicButtonProps>) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={isListening}
      aria-label={isListening ? '받아쓰기 멈추기' : '음성으로 입력'}
      title={isListening ? '받아쓰기 멈추기' : '음성으로 입력'}
      className={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors disabled:opacity-40',
        isListening
          ? 'animate-pulse bg-red-500 text-white'
          : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100'
      )}
    >
      <Mic size={16} aria-hidden />
    </button>
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
            disabled={isRunning}
            className="flex-1 rounded-lg bg-zinc-100 px-3 py-2 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-200 disabled:opacity-40 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            버리기
          </button>
          <button
            type="button"
            onClick={onApply}
            disabled={isRunning}
            className="flex-1 rounded-lg bg-blue-500 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-600 disabled:opacity-40"
          >
            폼에 추가
          </button>
        </div>
      ) : (
        <p className="mt-2 text-[11px] font-semibold text-zinc-400 dark:text-zinc-500">
          {status === 'applied' ? '폼에 추가했어요' : '버렸어요'}
        </p>
      )}
    </div>
  );
}
