'use client';

import { useRef, useState, useSyncExternalStore } from 'react';
import { ArrowDown, ChevronsRight, Lightbulb, Loader2, RotateCcw, Shuffle, Sparkles } from 'lucide-react';
import type { AgentAction, AgentChatMessage, AgentQuickAction, AgentSuggestion } from '@/types';
import { AGENT_CHAT_EXAMPLE_COUNT, AGENT_CHAT_EXAMPLES } from '@/constants';
import { useDismissLayer, useFollowScroll, useGrabSlide, useSignalEffect } from '@/hooks';
import { useAgentChatStore } from '@/stores';
import { cn } from '@/utils';
import { CloseButton, useDismissOnBack } from '..';
import {
  AgentActionChip,
  AgentAvailabilityNotice,
  AgentMessage,
  AgentInputBox,
  AgentSuggestionCard,
  AgentSuggestionHeading,
  ReportLivePreview,
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
  onSend: (text: string) => void;
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

// 진행 중인 마지막 생각 단계
const currentStepLabel = (messages: ReadonlyArray<AgentChatMessage>) => {
  const thinking = messages.findLast((m) => m.role === 'thinking');
  return thinking?.role === 'thinking' ? thinking.steps.findLast((s) => s.status === 'running')?.label : undefined;
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

// Nano 패널 — 서비스 에이전트의 본체.
// - 데스크톱(lg 이상): 펼치면 오른쪽 400px 열로 붙고 AgentLayoutShell 이 같은 너비(lg:pr-[400px])만큼 본문을 민다.
//   헤더(h-14 + 아래 테두리)는 상단바와 같은 높이라 줄이 맞는다. 접으면 자리를 완전히 비운다 — 56px 레일로 남기던 때는
//   열 대부분이 비어 본문 폭만 깎았다. 접은 동안은 상단바의 AgentLauncher(입력 모양 버튼·⌘K)와 제안 알약이 진입점이다.
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
  onSend,
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
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const baseSeed = useSyncExternalStore(subscribeNever, getClientExampleSeed, getServerExampleSeed);
  // "다른 예시"를 누를 때마다 더해 다시 섞는다
  const [seedOffset, setSeedOffset] = useState(0);
  // 입력칸 위 가로 칩 줄 — 마우스 드래그로 스크롤
  const { ref: chipRowRef, style: chipRowStyle } = useGrabSlide();
  const exampleSeed = baseSeed + seedOffset;

  const close = () => useAgentChatStore.getState().setOpen(false);
  // 모바일 시트만 닫기 층에 올린다 — 데스크톱 패널은 늘 있는 열이라 Esc 로 닫지 않는다
  useDismissLayer(panelRef, close, { enabled: isOpen, outsideClick: false });
  useDismissOnBack(isOpen, close);

  // ⌘K·홈 입력창 등에서 Nano를 부르면 입력칸으로 포커스를 옮긴다
  useSignalEffect(focusSignal > 0 ? String(focusSignal) : null, () => inputRef.current?.focus());

  // 새 내용(메시지·스트리밍 답변·생각 과정 펼침)이 오면 맨 아래를 보고 있을 때만 따라간다 — GitHub 가져오기의 AI 생각 로그와 같다.
  // 위로 올려 읽는 중이면 위치를 건드리지 않고 맨 아래로 가는 버튼을 띄운다. 새 요청을 보내면 다시 따라간다.
  const lastUserMessageId = messages.findLast((m) => m.role === 'user')?.id ?? null;
  const {
    listRef: scrollRef,
    contentRef: scrollContentRef,
    isFollowing,
    handleScroll,
    scrollToBottom,
  } = useFollowScroll({ resumeKey: lastUserMessageId });

  // 눈을 끌 곳 — 후속 동작이 필요한 카드면 그 카드까지 스크롤한다(효과는 아래 오버레이가 nonce 마다 다시 그린다)
  const attention = useAgentChatStore((s) => s.attention);
  useSignalEffect(attention ? String(attention.nonce) : null, () => {
    if (attention?.target !== 'message' || !attention.messageId) return;
    scrollRef.current
      ?.querySelector(`[data-message-id="${attention.messageId}"]`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });

  // 아직 처리하지 않은 후속 동작 중 가장 최근 것 — 입력칸 위에 "무엇을 해야 하는지"를 고정해 보여 준다
  const followUp = messages.findLast((m) => (m.role === 'confirm' || m.role === 'draft') && m.status === 'pending');

  const isReady = availability === 'available';
  // 예시 칩은 바로 보낸다
  const submit = (text: string) => {
    if (!isReady) return;
    onSend(text);
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
      aria-label="Nano"
      className={cn(
        // 배경만 살짝 비치게 — 불투명하면 화면이 좁아 보인다는 피드백. 배치는 그대로라 본문·고정 요소는 예전처럼 패널 너비만큼 비켜 있다.
        // 데스크톱 패널 뒤에는 바깥 틀의 배경색과 화면 전체에 깔린 배경 이펙트(CommitConstellation)만 있어 점·선이 보이게 약하게만 흐리고,
        // 폼 위를 덮는 모바일 시트는 뒤 글이 겹쳐 읽히지 않게 강하게 흐린다. 패널 안에는 fixed 자식이 없어(다이얼로그는 Portal)
        // backdrop-filter 가 fixed 기준 상자가 되어도 영향이 없다 — fixed 자식을 새로 넣으면 Portal 로 뺀다
        'z-45 flex-col bg-white/85 backdrop-blur-xl dark:bg-zinc-950/85',
        'lg:bg-white/70 lg:backdrop-blur-xs lg:dark:bg-zinc-950/70',
        isOpen ? 'fixed inset-0 flex h-dvh' : 'hidden',
        // 데스크톱: 펼쳤을 때만 오른쪽 400px 열. 접으면 자리를 비우고 상단바의 AgentLauncher 로 다시 연다
        expanded
          ? 'lg:fixed lg:inset-y-0 lg:right-0 lg:left-auto lg:flex lg:h-dvh lg:w-[400px] lg:border-l lg:border-zinc-200 lg:dark:border-zinc-800'
          : 'lg:hidden'
      )}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* Nano로 넘어왔음을 알리는 테두리 빛 — nonce 를 key 로 다시 그려 매번 처음부터 재생한다(빈 장식 요소라 다시 그려도 상태가 없다) */}
      {attention && (
        <div
          key={attention.nonce}
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10 animate-agent-attention-edge"
        />
      )}
      <div className="flex min-h-0 flex-1 flex-col">
        {/* 상단바와 같은 높이(h-14 + 아래 테두리) — 데스크톱에서 두 헤더의 줄이 이어진다 */}
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-zinc-200 pr-2.5 pl-4 dark:border-zinc-800">
          <Sparkles size={16} className="shrink-0 text-blue-500" aria-hidden />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Nano</h2>
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
            aria-label="Nano 접기"
            title="Nano 접기"
            className={cn(iconButtonClass, 'hidden lg:inline-flex')}
          >
            <ChevronsRight size={16} aria-hidden />
          </button>
          <CloseButton size="sm" onClick={close} className="lg:hidden" />
        </header>

        {toolNames.includes('get_current_report') && <ReportLivePreview />}

        <div className="relative flex min-h-0 flex-1 flex-col">
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 select-text"
          >
            <div ref={scrollContentRef} className="space-y-4">
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
                            busy={isRunning}
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
                          <AgentActionChip key={a.id} action={a} busy={isRunning} onRun={onRunAction} />
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
                    <li key={message.id} data-message-id={message.id} className="relative">
                      {attention?.target === 'message' && attention.messageId === message.id && (
                        <span
                          key={attention.nonce}
                          aria-hidden
                          className="pointer-events-none absolute -inset-1 animate-agent-attention-ring rounded-2xl"
                        />
                      )}
                      <AgentMessage
                        message={message}
                        isRunning={isRunning}
                        onAnswerConfirm={onAnswerConfirm}
                        onUndo={onUndo}
                        onApplyDraft={onApplyDraft}
                        onDiscardDraft={onDiscardDraft}
                        onRunAction={onRunAction}
                      />
                    </li>
                  ))}
                  {isRunning && messages.at(-1)?.role !== 'assistant' && (
                    // 생각 과정 블록은 도구 줄 위에 남으므로, 맨 아래에는 지금 하고 있는 단계를 한 줄로 보여 준다
                    <li className="flex items-center gap-2 text-xs text-zinc-400 dark:text-zinc-500">
                      <Loader2 size={14} className="animate-spin" aria-hidden />
                      {currentStepLabel(messages) ?? '처리하는 중...'}
                    </li>
                  )}
                </ul>
              )}
            </div>
          </div>
          {!isFollowing && (
            <button
              type="button"
              onClick={scrollToBottom}
              aria-label="최신 내용 보기"
              title="최신 내용 보기"
              className="absolute bottom-2 left-1/2 flex size-8 -translate-x-1/2 items-center justify-center rounded-full border border-zinc-200 bg-white/95 text-zinc-600 shadow-md backdrop-blur hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/95 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              <ArrowDown size={16} aria-hidden />
            </button>
          )}
        </div>

        {/* 후속 동작 안내 — 확인 카드·초안이 기다리고 있으면 무엇을 해야 하는지 입력칸 위에 고정한다. 누르면 그 카드로 데려간다 */}
        {followUp && (
          <button
            type="button"
            onClick={() => useAgentChatStore.getState().attend('message', followUp.id)}
            className="mx-3 mt-2 flex shrink-0 items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-left text-xs text-amber-900 transition-colors hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-950/60"
          >
            <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-amber-500" aria-hidden />
            <span className="min-w-0 flex-1 truncate">
              {followUp.role === 'confirm'
                ? `${followUp.options.title} — 위 카드에서 ${followUp.options.confirmText ?? '확인'} 또는 취소를 눌러 주세요`
                : '보고서 초안을 확인하고 "추가"를 눌러 주세요'}
            </span>
            <span className="shrink-0 font-semibold">보기</span>
          </button>
        )}

        {/* 대화 중에도 다음 할 일을 바로 고를 수 있게 — 상황 제안·빠른 작업을 입력칸 위 한 줄로 둔다(후속 동작이 기다릴 때는 안내만 둔다) */}
        {messages.length > 0 && !isRunning && !followUp && (suggestions.length > 0 || quickActions.length > 0) && (
          // 마우스로도 끌어서 넘길 수 있게 한다(useGrabSlide) — 끌었으면 놓을 때의 클릭은 칩 실행으로 치지 않는다
          <div
            ref={chipRowRef}
            className={cn(
              'flex shrink-0 [scrollbar-width:none] gap-2 overflow-x-auto border-t border-zinc-100 px-3 py-2 dark:border-zinc-800',
              chipRowStyle
            )}
          >
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
                <AgentActionChip key={a.id} action={a} glow="ring" onRun={onRunAction} />
              ))}
          </div>
        )}

        <div className="shrink-0 border-t border-zinc-200 p-3 dark:border-zinc-800">
          <AgentInputBox
            textareaRef={inputRef}
            attentionKey={attention?.target === 'input' ? attention.nonce : null}
            placeholder={
              isReady
                ? canWriteFromNotes
                  ? '요청하거나 오늘 한 일을 적어 보세요'
                  : '무엇이든 부탁해 보세요'
                : '위의 추천과 빠른 작업을 눌러 보세요'
            }
            hint={isReady ? 'Enter 보내기 · Shift+Enter 줄바꿈 · ⌘K' : undefined}
            disabled={!isReady}
            isRunning={isRunning}
            onSubmit={onSend}
            onStop={onStop}
          />
        </div>
      </div>
    </aside>
  );
}
