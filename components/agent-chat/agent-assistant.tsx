'use client';

import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import type {
  AgentAction,
  AgentChange,
  AgentChatMessage,
  AgentChatTurn,
  AgentSuggestion,
  AgentToolContext,
} from '@/types';
import { useHistoryAgentTools, useResetOnHide } from '@/hooks';
import {
  downloadPromptModel,
  getPromptApiAvailability,
  hasRequestExpression,
  looksLikeWorkNotes,
  runAgentChatTurn,
  structureNotes,
} from '@/lib/prompt-api';
import { agentToolsFor, parseToolUnavailable } from '@/lib/webmcp';
import { useAgentChatStore, useAgentToolsStore, useReportFormStore } from '@/stores';
import { createId } from '@/utils';
import { AgentPanel, useAgentSituation, useAgentSuggestions, useGlobalAgentTools } from '.';

// 대화에서 다룬 새소식(mentionedNewsId)을 이어 가는 도구 — 이 밖의 도구를 실행하면 "그거"가 가리키던 소식을 잊는다
const NEWS_TOOL_NAMES: ReadonlyArray<string> = ['list_news', 'get_news', 'open_news'];

// Nano가 물은 다음 할 일을 받아들이는 짧은 말("응", "보여줘", "네 열어주세요")
const ACCEPT_OFFER =
  /^(응|어|엉|네|넵|넹|예|좋아|좋아요|그래|그래요|ㅇㅇ|ㅇㅋ|오케이|ok|okay|yes|부탁해|부탁해요)?[\s,.!~]*(그거|그걸|그것|이거|그\s*소식)?\s*((보여|열어|띄워|해)\s*(줘|주세요|줄래|봐)|그렇게\s*해\s*(줘|주세요)|볼래|볼게|볼게요)?[\s.!~요]*$/i;

// 모델이 던진 오류를 사용자 문구로 바꾼다
const errorMessage = (error: unknown) => {
  if (error instanceof DOMException && error.name === 'QuotaExceededError')
    return '대화가 길어져 더 이어 갈 수 없어요. 새 대화를 시작해 주세요.';
  if (error instanceof DOMException && error.name === 'TimeoutError')
    return 'AI 응답이 너무 오래 걸려 멈췄어요. 다시 시도해 주세요.';
  return 'AI 응답을 만들지 못했어요. 다시 시도해 주세요.';
};

// (app) 그룹 레이아웃에 한 번 마운트되는 서비스 에이전트 — 전역 도구를 등록하고, 대화·상황 제안·빠른 작업을 들고 있다.
// 레이아웃이 화면 이동에도 유지되므로 대화는 (app) 화면 사이를 오가도 이어진다. 대화 응답은 Chrome 내장 모델(Gemini Nano)이
// 이 기기에서 만들고, 상황 제안·빠른 작업은 모델 없이 도구를 바로 실행한다(모델이 없는 브라우저에서도 동작).
export function AgentAssistant() {
  useGlobalAgentTools();
  useHistoryAgentTools();
  const getSituation = useAgentSituation();
  // 등록 시점에 한 번 만드는 개발용 회귀 실행기가 최신 함수를 부르게
  const situationRef = useRef(getSituation);
  useEffect(() => {
    situationRef.current = getSituation;
  });

  const setRunning = useAgentChatStore((s) => s.setRunning);
  const availability = useAgentChatStore((s) => s.availability);
  const { suggestions, quickActions } = useAgentSuggestions();
  const allTools = useAgentToolsStore((s) => s.tools);
  const tools = agentToolsFor(allTools, 'chat');
  // 메모 초안은 폼 반영 도구(fill_report, WebMCP 전용이지만 레지스트리에는 있다)로 넣는다 — 보고서 작성 화면에서만 있다
  const canWriteFromNotes = allTools.some((t) => t.name === 'fill_report');

  const [messages, setMessages] = useState<Array<AgentChatMessage>>([]);
  const [turns, setTurns] = useState<Array<AgentChatTurn>>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  // 컨텍스트 창에 맞추느라 앞부분 대화를 모델에게 넘기지 못한 적이 있는지
  const [isContextTrimmed, setIsContextTrimmed] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  // 마지막 답변이 "자세히 보시겠어요?"처럼 물은 다음 할 일 — 바로 다음 메시지가 받아들이는 말이면 모델 없이 실행한다
  const offeredRef = useRef<AgentAction | null>(null);
  // 대화 안 확인 카드의 응답 대기 — 카드 id → resolve
  const pendingConfirms = useRef(new Map<string, (ok: boolean) => void>());
  // 변경 카드의 되돌리기 — 도구 메시지 id → undo
  const undoFns = useRef(new Map<string, NonNullable<AgentChange['undo']>>());

  // 처리하지 않은 후속 동작 수를 store 에 알린다 — 패널을 접어 두었을 때 상단바가 "확인 필요"를 띄운다
  const followUps = messages.filter((m) => (m.role === 'confirm' || m.role === 'draft') && m.status === 'pending');
  const followUpCount = followUps.length;
  const followUpId = followUps.at(-1)?.id ?? null;
  const awaitingConfirm = followUps.some((m) => m.role === 'confirm');
  useEffect(() => {
    useAgentChatStore.getState().setFollowUp(followUpCount, followUpId, awaitingConfirm);
  }, [followUpCount, followUpId, awaitingConfirm]);

  // 처리 중에 들어온 다른 요청은 무시하지 않고 알린다(한 번에 하나만 처리한다)
  const notifyBusy = () => useAgentChatStore.getState().notifyBusy();

  // 데스크톱 패널을 접어 두었으면 그대로 — SSR·첫 렌더는 기본값(펼침)으로 맞추고 마운트 뒤에 적용한다
  useEffect(() => {
    useAgentChatStore.getState().restore();
  }, []);

  // 모델 가용성은 패널이 늘 보이므로 마운트 때 확인한다 — 홈 입력창·제안이 AI 필요 여부를 가른다
  useEffect(() => {
    let cancelled = false;
    void getPromptApiAvailability().then((next) => {
      if (!cancelled) useAgentChatStore.getState().setAvailability(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // 개발 모드 전용 Nano 회귀 시나리오 — 콘솔에서 `await window.__nanoEval({ runs: 3, only: ['중복'] })`.
  // 프롬프트·도구 설명·kind 를 바꾸면 돌린다(lib/prompt-api/agent-eval.ts). 배포 번들에는 싣지 않는다.
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    Object.assign(window, {
      __nanoEval: async (options: Readonly<{ runs?: number; only?: ReadonlyArray<string> }> = {}) => {
        const { runAgentEval } = await import('@/lib/prompt-api/agent-eval');
        return runAgentEval({
          ...options,
          getTools: () => agentToolsFor(useAgentToolsStore.getState().tools, 'chat'),
          getSituation: (scope) => situationRef.current(scope),
        });
      },
    });
  }, []);

  // ⌘K / Ctrl+K — 데스크톱은 패널을 펼치고 입력칸으로, 모바일은 시트를 열고 닫는다(한글 조합 중에는 넘긴다)
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k' || event.isComposing) return;
      event.preventDefault();
      const store = useAgentChatStore.getState();
      if (store.isOpen) store.setOpen(false);
      else store.reveal();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const patchMessage = (id: string, patch: Partial<AgentChatMessage>) =>
    setMessages((prev) => prev.map((m) => (m.id === id ? ({ ...m, ...patch } as AgentChatMessage) : m)));

  const settleConfirms = (ok: boolean) => {
    for (const [id, resolve] of pendingConfirms.current) {
      resolve(ok);
      patchMessage(id, { status: ok ? 'approved' : 'rejected' });
    }
    pendingConfirms.current.clear();
  };

  const stop = () => {
    abortRef.current?.abort();
    settleConfirms(false);
  };

  // 화면 밖으로 나가면(로그인 화면 등으로 이동해 레이아웃째 숨겨짐) 진행 중인 응답을 멈추고 패널을 닫아 둔다
  useResetOnHide(() => {
    stop();
    useAgentChatStore.getState().hide();
  });

  // 확인이 필요한 도구는 확인 다이얼로그 대신 대화 안 카드로 묻는다. 패널이 닫혀 있으면 열어서 보여 준다.
  const requestConfirm: AgentToolContext['confirm'] = (options) =>
    new Promise<boolean>((resolve) => {
      const id = createId();
      pendingConfirms.current.set(id, resolve);
      setMessages((prev) => [...prev, { id, role: 'confirm', options, status: 'pending' }]);
      // 사용자가 눌러야 진행된다 — Nano를 보여 주고 이 카드로 눈을 끈다
      const store = useAgentChatStore.getState();
      store.reveal({ attention: 'none' });
      store.attend('message', id);
    });

  const answerConfirm = (id: string, ok: boolean) => {
    const resolve = pendingConfirms.current.get(id);
    if (!resolve) return;
    pendingConfirms.current.delete(id);
    patchMessage(id, { status: ok ? 'approved' : 'rejected' });
    resolve(ok);
  };

  // 채팅·메모 정리가 함께 쓰는 처리 시작/끝 — 한 번에 하나만 돌고, 그동안 본문 조작을 막는다(AgentBusyGuard)
  const begin = () => {
    const controller = new AbortController();
    abortRef.current = controller;
    setIsRunning(true);
    setRunning(true);
    return controller;
  };
  const end = (controller: AbortController) => {
    settleConfirms(false);
    setIsRunning(false);
    setRunning(false);
    useAgentChatStore.getState().setFormLocked(false);
    if (abortRef.current === controller) abortRef.current = null;
  };

  // 입력창 하나로 부탁과 업무 메모를 함께 받는다. 분명한 메모는 규칙(looksLikeWorkNotes)으로 바로 메모 정리로 보내고,
  // 그 밖에는 채팅으로 보내 의도 분류가 메모(work_notes)라고 하면 거기서 메모 정리로 넘긴다.
  // fresh 면 앞 대화와 관계없는 독립 요청이라 앞 대화 기록 없이 시작한다(startFresh 참고).
  const send = async (text: string, { fresh = false }: Readonly<{ fresh?: boolean }> = {}) => {
    if (text.trim() === '') return;
    if (isRunning) {
      notifyBusy();
      return;
    }
    // Nano가 방금 "자세히 보시겠어요?"라고 물었고 받아들이는 말이면 그 버튼을 바로 실행한다 — 모델에 맡기면
    // "응"을 새 요청으로 보고 엉뚱한 의도로 갈라지곤 했다. 다른 말이면 묻던 것은 잊고 평소처럼 처리한다
    const offered = fresh ? null : offeredRef.current;
    offeredRef.current = null;
    if (offered && ACCEPT_OFFER.test(text.trim())) {
      setMessages((prev) => [...prev, { id: createId(), role: 'user', text: text.trim() }]);
      runAction(offered);
      return;
    }
    if (canWriteFromNotes && looksLikeWorkNotes(text)) {
      void submitNotes(text);
      return;
    }
    const controller = begin();

    // 이번 요청 전의 대화 기록 — 멈추거나 메모로 넘어가면 여기로 되돌린다
    let before: Array<AgentChatTurn> = fresh ? [] : turns;
    let history: Array<AgentChatTurn> = [...before, { role: 'user', text: text.trim() }];
    setTurns(history);
    const userMessageId = createId();
    // 생각 과정 — 단계가 오면 채운다(단계가 없으면 그리지 않는다)
    const thinkingId = createId();
    setMessages((prev) => [
      ...prev,
      { id: userMessageId, role: 'user', text: text.trim() },
      { id: thinkingId, role: 'thinking', steps: [], done: false },
    ]);

    let toolMessageId: string | null = null;
    let answerId: string | null = null;
    // 도구가 실행 중에 알린 변경 — 도구가 끝나면 그 메시지에 붙인다
    let pendingChange: AgentChange | null = null;
    try {
      const {
        turns: added,
        route,
        followUp,
      } = await runAgentChatTurn({
        history,
        // 부탁 표현("~해줘" 등)이 있으면 업무 메모 의도를 아예 후보에서 뺀다 — 앞 대화가 메모 위주면 모델이
        // "지난주 보고서 요약해줘"까지 메모로 골랐다
        canWriteFromNotes: canWriteFromNotes && !hasRequestExpression(text),
        getTools: () => agentToolsFor(useAgentToolsStore.getState().tools, 'chat'),
        getSituation,
        context: {
          confirm: requestConfirm,
          reportChange: (change) => {
            pendingChange = change;
          },
        },
        onContextTrim: () => setIsContextTrimmed(true),
        // 앞 대화와 관계없는 새 요청이라 모델이 앞 대화 없이 시작했다 — 화면의 앞 대화도 비운다(startFresh 와 같은 규칙:
        // 처리하지 않은 후속 동작(폼에 넣지 않은 초안·승인 대기 카드)이 있으면 화면은 두고 모델에 넘기는 기록만 새로 시작한다)
        onFreshStart: () => {
          useAgentChatStore.getState().setMentionedNewsId(null);
          before = [];
          history = history.slice(-1);
          setTurns(history);
          setIsContextTrimmed(false);
          if (followUpCount > 0) return;
          setMessages((prev) => {
            const start = prev.findIndex((m) => m.id === userMessageId);
            for (const m of prev.slice(0, start)) undoFns.current.delete(m.id);
            return prev.slice(start);
          });
        },
        // 폼을 바꾸는 요청으로 정해진 때부터만 본문을 잠근다(조회·요약·대화·저장은 잠그지 않는다)
        onFormLock: () => useAgentChatStore.getState().setFormLocked(true),
        onThinking: (step) =>
          setMessages((prev) =>
            prev.map((m) =>
              m.id === thinkingId && m.role === 'thinking'
                ? {
                    ...m,
                    steps: m.steps.some((s) => s.key === step.key)
                      ? m.steps.map((s) => (s.key === step.key ? step : s))
                      : [...m.steps, step],
                  }
                : m
            )
          ),
        signal: controller.signal,
        onToolStart: (tool) => {
          const id = createId();
          toolMessageId = id;
          pendingChange = null;
          setMessages((prev) => [...prev, { id, role: 'tool', title: tool.title, status: 'running' }]);
        },
        onToolEnd: (tool, result) => {
          // 대화가 새소식에서 다른 일로 넘어가면 "그거"는 더 이상 그 소식이 아니다
          if (!NEWS_TOOL_NAMES.includes(tool.name)) useAgentChatStore.getState().setMentionedNewsId(null);
          if (!toolMessageId) return;
          const change: AgentChange | null = pendingChange;
          if (change?.undo) undoFns.current.set(toolMessageId, change.undo);
          patchMessage(toolMessageId, {
            status: result.isError ? 'error' : 'done',
            ...(change ? { changes: change.lines, undo: change.undo ? 'available' : undefined } : {}),
          });
        },
        onAnswer: (answer) => {
          if (answerId) {
            patchMessage(answerId, { text: answer });
            return;
          }
          const id = createId();
          answerId = id;
          setMessages((prev) => [...prev, { id, role: 'assistant', text: answer, streaming: true }]);
        },
      });
      // 마지막 단계와 멈추기가 엇갈려 오류 없이 끝났어도 멈춘 요청으로 다룬다
      controller.signal.throwIfAborted();
      if (route === 'notes') {
        // 부탁이 아니라 업무 메모였다 — 메모 정리가 대화 기록을 메모 턴으로 남기므로 방금 넣은 사용자 턴은 되돌린다
        setTurns(before);
        await showNotesDraft(text, controller);
      } else {
        setTurns([...history, ...added]);
        // 답변 뒤에 다음 할 일 버튼을 단다. 한 줄 질문으로 물었으면 "응"만으로도 첫 버튼을 실행하게 기억해 둔다
        const answeredId = answerId as string | null;
        if (followUp && answeredId) patchMessage(answeredId, { actions: followUp.actions });
        offeredRef.current = followUp?.ask ? (followUp.actions[0]?.action ?? null) : null;
        // 빠진 정보를 되물었다 — 바로 답할 수 있게 입력칸으로 데려간다(다음 메시지가 그 답으로 이어진다)
        if (route === 'question') useAgentChatStore.getState().reveal({ attention: 'input' });
      }
    } catch (error) {
      if (toolMessageId) patchMessage(toolMessageId, { status: 'error' });
      if (controller.signal.aborted) {
        // 멈춘 요청은 대화 기록에서 뺀다 — 남겨 두면 다음 요청 때 모델이 답하지 않은 앞 요청까지 함께 처리하려 했다.
        // 대부분 잘못 보내 멈추고 다시 부탁하는 경우다. 이미 실행된 변경은 변경 카드의 되돌리기로 돌리고,
        // 모델은 프롬프트마다 지금 폼 상태를 새로 받으므로 따로 알리지 않는다.
        setTurns(before);
        patchMessage(userMessageId, { cancelled: true });
      } else {
        console.error('[agent-chat]', error);
        setMessages((prev) => [...prev, { id: createId(), role: 'error', text: errorMessage(error) }]);
      }
    } finally {
      if (answerId) patchMessage(answerId, { streaming: false });
      // 끝나면 생각 과정을 접는다 — 멈췄으면 진행 중이던 단계는 그대로 둔다
      setMessages((prev) =>
        prev.map((m) =>
          m.id === thinkingId && m.role === 'thinking'
            ? { ...m, done: true, steps: m.steps.map((s) => ({ ...s, status: 'done' as const })) }
            : m
        )
      );
      end(controller);
    }
  };

  // 업무 메모를 정리해 보고서 초안 카드로 보여 준다. 폼에는 사용자가 "추가"를 눌러야 들어간다.
  const showNotesDraft = async (notes: string, controller: AbortController) => {
    try {
      const { today, tomorrow } = useReportFormStore.getState();
      const projectNames = [...new Set([...today, ...tomorrow].map((p) => p.name.trim()).filter((n) => n !== ''))];
      const draft = await structureNotes(notes, projectNames, controller.signal);
      if (draft.today.length === 0 && draft.tomorrow.length === 0) {
        setMessages((prev) => [
          ...prev,
          {
            id: createId(),
            role: 'error',
            text: '메모에서 보고서에 넣을 작업을 찾지 못했어요. 조금 더 자세히 적거나, 하고 싶은 일을 "~해줘"처럼 부탁해 주세요.',
          },
        ]);
        return;
      }
      const draftId = createId();
      setMessages((prev) => [...prev, { id: draftId, role: 'draft', draft, status: 'pending' }]);
      // "추가"를 눌러야 들어간다 — 초안 카드로 눈을 끈다
      useAgentChatStore.getState().attend('message', draftId);
      setTurns((prev) => [
        ...prev,
        { role: 'user', text: `[The user wrote work notes to turn into a report]\n${notes.trim()}` },
        { role: 'assistant', text: '메모를 보고서 초안으로 정리했어요. 확인한 뒤 추가해 주세요.' },
      ]);
    } catch (error) {
      if (!controller.signal.aborted) {
        console.error('[agent-notes]', error);
        setMessages((prev) => [...prev, { id: createId(), role: 'error', text: errorMessage(error) }]);
      }
    }
  };

  // 메모로 보고서 쓰기(규칙으로 메모라고 본 글·메모가 담긴 할 일)
  const submitNotes = async (notes: string) => {
    if (notes.trim() === '') return;
    if (isRunning) {
      notifyBusy();
      return;
    }
    const controller = begin();
    setMessages((prev) => [...prev, { id: createId(), role: 'user', text: notes.trim() }]);
    try {
      await showNotesDraft(notes, controller);
    } finally {
      end(controller);
    }
  };

  // 초안을 폼에 덧붙인다 — 채팅 도구와 같은 경로(fill_report)라 변경 카드·되돌리기·바뀐 칸 강조가 그대로 따라온다
  const applyDraft = async (id: string) => {
    const message = messages.find((m) => m.id === id);
    const tool = useAgentToolsStore.getState().tools.find((t) => t.name === 'fill_report');
    if (message?.role !== 'draft' || message.status !== 'pending' || !tool || isRunning) {
      if (!tool) toast.error('초안은 보고서 작성 화면에서만 추가할 수 있어요.');
      else if (isRunning) notifyBusy();
      return;
    }
    const controller = begin();
    const toolMessageId = createId();
    // 실행 중 도구가 알린 변경(콜백에서 채운다)
    const captured: { change: AgentChange | null } = { change: null };
    setMessages((prev) => [...prev, { id: toolMessageId, role: 'tool', title: '보고서 초안 추가', status: 'running' }]);
    try {
      const result = await tool.execute(
        { today: message.draft.today, tomorrow: message.draft.tomorrow, mode: 'append' },
        {
          confirm: requestConfirm,
          reportChange: (next) => {
            captured.change = next;
          },
        }
      );
      const applied = captured.change;
      if (applied?.undo) undoFns.current.set(toolMessageId, applied.undo);
      patchMessage(toolMessageId, {
        status: result.isError ? 'error' : 'done',
        ...(applied ? { changes: applied.lines, undo: applied.undo ? 'available' : undefined } : {}),
      });
      if (!result.isError) {
        patchMessage(id, { status: 'applied' });
        setTurns((prev) => [...prev, { role: 'user', text: '[The user added the notes draft to the report form]' }]);
      }
    } finally {
      end(controller);
    }
  };

  const discardDraft = (id: string) => patchMessage(id, { status: 'discarded' });

  const reset = () => {
    stop();
    setMessages([]);
    setTurns([]);
    setIsContextTrimmed(false);
    undoFns.current.clear();
    offeredRef.current = null;
    useAgentChatStore.getState().setMentionedNewsId(null);
  };

  // 변경 카드의 되돌리기. 그사이 사용자가 직접 고쳤으면 덮어쓰지 않고 알린다. 모델도 알 수 있게 대화 기록에 남긴다.
  const undoChange = (id: string) => {
    const undo = undoFns.current.get(id);
    if (!undo) return;
    if (isRunning) {
      notifyBusy();
      return;
    }
    undoFns.current.delete(id);
    const ok = undo();
    patchMessage(id, { undo: ok ? 'done' : 'stale' });
    if (!ok) {
      toast.error('그사이 내용이 바뀌어 되돌리지 않았어요.');
      return;
    }
    const title = messages.find((m) => m.id === id && m.role === 'tool');
    setTurns((prev) => [
      ...prev,
      { role: 'user', text: `[The user undid this change: ${title?.role === 'tool' ? title.title : 'last change'}]` },
    ]);
    toast.success('변경을 되돌렸어요.');
  };

  // 상황 제안·빠른 작업이 고른 도구를 모델 없이 바로 실행한다 — 채팅 도구와 같은 context 라 확인 카드·변경 카드·되돌리기가 따라온다.
  // 결과는 모델도 알 수 있게 대화 기록에 도구 턴으로 남긴다.
  const runTool = async (name: string, title: string, input: Record<string, unknown> = {}) => {
    const tool = useAgentToolsStore.getState().tools.find((t) => t.name === name);
    if (!tool) {
      toast.error('이 화면에서는 할 수 없는 작업이에요.');
      return;
    }
    if (isRunning) {
      notifyBusy();
      return;
    }
    const controller = begin();
    const toolMessageId = createId();
    const captured: { change: AgentChange | null } = { change: null };
    setMessages((prev) => [...prev, { id: toolMessageId, role: 'tool', title, status: 'running' }]);
    try {
      const result = await tool.execute(input, {
        confirm: requestConfirm,
        reportChange: (next) => {
          captured.change = next;
        },
      });
      const applied = captured.change;
      if (applied?.undo) undoFns.current.set(toolMessageId, applied.undo);
      patchMessage(toolMessageId, {
        status: result.isError ? 'error' : 'done',
        ...(applied ? { changes: applied.lines, undo: applied.undo ? 'available' : undefined } : {}),
      });
      const text = result.content.map((c) => c.text).join('\n');
      // 바꾸는 것 없이 끝난 결과(예: 가져올 미완료 업무 없음)·화면 이동 결과·할 수 없는 이유는 사용자에게도 알린다
      const unavailable = parseToolUnavailable(result);
      if (unavailable)
        setMessages((prev) => [
          ...prev,
          { id: createId(), role: 'assistant', text: `${unavailable.reason} ${unavailable.offer}`, streaming: false },
        ]);
      else if (result.isError) setMessages((prev) => [...prev, { id: createId(), role: 'error', text }]);
      else if (!applied && (/"changed":false/.test(text) || tool.kind === 'navigate')) {
        const message = /"message":"([^"]+)"/.exec(text)?.[1];
        if (message)
          setMessages((prev) => [...prev, { id: createId(), role: 'assistant', text: message, streaming: false }]);
      }
      setTurns((prev) => [
        ...prev,
        { role: 'user', text: `[The user ran "${title}" from the suggestions]` },
        {
          role: 'tool',
          name,
          input,
          result: text,
          isError: !!result.isError,
          untrusted: !!tool.annotations?.untrustedContentHint,
          ...(tool.kind === 'read' ? {} : { changes: applied?.lines ?? [] }),
        },
      ]);
    } catch (error) {
      console.error('[agent-tool]', error);
      patchMessage(toolMessageId, { status: 'error' });
    } finally {
      end(controller);
    }
  };

  // AI 추천처럼 앞 대화와 관계없는 요청은 새 대화로 시작한다 — 앞 대화를 모델에 넘기면 지난 요청·지난 폼 상태가 섞여
  // 엉뚱한 기간을 정리하거나 앞 요청을 이어서 처리했다. 다만 사용자가 아직 처리하지 않은 후속 동작(폼에 넣지 않은 초안)이
  // 있으면 화면의 대화는 지우지 않고 모델에 넘기는 기록만 새로 시작한다(초안을 잃지 않게).
  const startFresh = (text: string) => {
    if (isRunning) {
      notifyBusy();
      return;
    }
    if (followUpCount === 0) reset();
    void send(text, { fresh: true });
  };

  // 상황 제안·빠른 작업·홈 입력창이 넘긴 할 일을 처리한다
  const runAction = (action: AgentAction) => {
    if (action.type === 'prompt') {
      if (action.fresh) startFresh(action.text);
      else void send(action.text);
    } else if (action.type === 'tool') void runTool(action.tool, action.title, action.input);
    else if (action.text) void submitNotes(action.text);
    // 메모 내용 없이 온 할 일(예: "오늘 한 일 적어서 보고서 쓰기" 제안)은 입력칸으로 데려간다 — 적으면 메모로 알아본다
    else useAgentChatStore.getState().reveal();
  };

  // 제안을 실행하면 이번 세션에서는 다시 권하지 않는다
  const runSuggestion = (suggestion: AgentSuggestion) => {
    // 처리 중이라 실행하지 못한 제안은 넘기지 않는다 — 끝난 뒤 다시 누를 수 있게
    if (isRunning) {
      notifyBusy();
      return;
    }
    useAgentChatStore.getState().dismiss(suggestion.id);
    runAction(suggestion.action);
  };

  // 다른 곳(홈 입력창·제안 알약)이 store 에 넘긴 할 일을 받는다 — 구독 콜백에서 최신 핸들러를 쓰도록 ref 로 둔다
  const runActionRef = useRef(runAction);
  useEffect(() => {
    runActionRef.current = runAction;
  });
  useEffect(
    () =>
      useAgentChatStore.subscribe((state, prev) => {
        if (state.request && state.request !== prev.request) runActionRef.current(state.request.action);
      }),
    []
  );

  // 클릭 핸들러에서만 호출한다 — Chrome 이 모델 다운로드 시작에 사용자 활성화를 요구한다
  const download = async () => {
    setDownloadProgress(0);
    try {
      await downloadPromptModel(setDownloadProgress);
      useAgentChatStore.getState().setAvailability(await getPromptApiAvailability());
    } catch {
      toast.error('온디바이스 AI 모델을 내려받지 못했습니다.');
    } finally {
      setDownloadProgress(null);
    }
  };

  return (
    <AgentPanel
      availability={availability}
      downloadProgress={downloadProgress}
      messages={messages}
      toolNames={tools.map((t) => t.name)}
      isRunning={isRunning}
      isContextTrimmed={isContextTrimmed}
      suggestions={suggestions}
      quickActions={quickActions}
      canWriteFromNotes={canWriteFromNotes}
      onSend={send}
      onRunAction={runAction}
      onRunSuggestion={runSuggestion}
      onDismissSuggestion={(suggestion) => useAgentChatStore.getState().dismiss(suggestion.id)}
      onStop={stop}
      onReset={reset}
      onDownload={download}
      onAnswerConfirm={answerConfirm}
      onUndo={undoChange}
      onApplyDraft={applyDraft}
      onDiscardDraft={discardDraft}
    />
  );
}
