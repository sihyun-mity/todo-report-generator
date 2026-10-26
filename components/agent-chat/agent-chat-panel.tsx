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
  RotateCcw,
  Shuffle,
  Sparkles,
  Square,
} from 'lucide-react';
import type { AgentChatMessage } from '@/types';
import { AGENT_CHAT_EXAMPLE_COUNT, AGENT_CHAT_EXAMPLE_ROTATE_MS, AGENT_CHAT_EXAMPLES } from '@/constants';
import { useDismissLayer } from '@/hooks';
import { cn } from '@/utils';
import { CloseButton, useDismissOnBack } from '..';

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
}: Readonly<Props>) {
  const panelRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputId = useId();
  const [draft, setDraft] = useState('');
  // 예시는 열 때마다 무작위 순서로 — "다른 예시"를 누르면 seed 를 바꿔 다시 섞는다
  const [exampleSeed, setExampleSeed] = useState(() => Math.floor(Math.random() * 2147483648));
  const [exampleTick, setExampleTick] = useState(0);

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
        'fixed inset-x-0 bottom-0 z-45 flex h-[80dvh] flex-col rounded-t-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900',
        'sm:inset-x-auto sm:right-4 sm:bottom-4 sm:h-[min(680px,calc(100dvh-6rem))] sm:w-[400px] sm:rounded-2xl'
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
        <CloseButton size="sm" onClick={onClose} />
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 select-text">
        {!isReady ? (
          <AvailabilityNotice availability={availability} downloadProgress={downloadProgress} onDownload={onDownload} />
        ) : messages.length === 0 ? (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
              무엇을 도와드릴까요? 보고서를 채우거나, 지난 기록을 찾아 정리하거나, 화면 모드를 바꾸는 등 이 화면에서 할
              수 있는 일을 말로 시켜 보세요.
            </p>
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
            {messages.map((message) => (
              <li key={message.id}>
                <ChatMessage message={message} onAnswerConfirm={onAnswerConfirm} />
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

      {isReady && messages.length > 0 && !isRunning && rotatingExample && (
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

      {isReady && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit(draft);
          }}
          className="flex items-end gap-2 border-t border-zinc-100 p-3 dark:border-zinc-800"
        >
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
            className="max-h-32 min-h-10 flex-1 resize-none rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-blue-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500"
            style={{ fieldSizing: 'content' } as React.CSSProperties}
          />
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
  onAnswerConfirm: (id: string, ok: boolean) => void;
};

function ChatMessage({ message, onAnswerConfirm }: Readonly<ChatMessageProps>) {
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
