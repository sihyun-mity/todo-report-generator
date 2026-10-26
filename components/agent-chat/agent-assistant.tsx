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
import { useResetOnHide } from '@/hooks';
import {
  downloadPromptModel,
  getPromptApiAvailability,
  hasRequestExpression,
  looksLikeWorkNotes,
  runAgentChatTurn,
  structureNotes,
} from '@/lib/prompt-api';
import { agentToolsFor } from '@/lib/webmcp';
import { useAgentChatStore, useAgentToolsStore, useReportFormStore } from '@/stores';
import { createId } from '@/utils';
import { AgentPanel, useAgentSuggestions, useGlobalAgentTools } from '.';

// 모델이 던진 오류를 사용자 문구로 바꾼다
const errorMessage = (error: unknown) => {
  if (error instanceof DOMException && error.name === 'QuotaExceededError')
    return '대화가 길어져 AI가 더 읽을 수 없어요. 새 대화를 시작해 주세요.';
  if (error instanceof DOMException && error.name === 'TimeoutError')
    return 'AI 응답이 너무 오래 걸려 멈췄어요. 다시 시도해 주세요.';
  return 'AI 응답을 만들지 못했어요. 다시 시도해 주세요.';
};

// (app) 그룹 레이아웃에 한 번 마운트되는 서비스 에이전트 — 전역 도구를 등록하고, 대화·상황 제안·빠른 작업을 들고 있다.
// 레이아웃이 화면 이동에도 유지되므로 대화는 (app) 화면 사이를 오가도 이어진다. 대화 응답은 Chrome 내장 모델(Gemini Nano)이
// 이 기기에서 만들고, 상황 제안·빠른 작업은 모델 없이 도구를 바로 실행한다(모델이 없는 브라우저에서도 동작).
export function AgentAssistant() {
  useGlobalAgentTools();

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
  // 대화 안 확인 카드의 응답 대기 — 카드 id → resolve
  const pendingConfirms = useRef(new Map<string, (ok: boolean) => void>());
  // 변경 카드의 되돌리기 — 도구 메시지 id → undo
  const undoFns = useRef(new Map<string, NonNullable<AgentChange['undo']>>());

  // 처리하지 않은 후속 동작 수를 store 에 알린다 — 패널을 접어 두었을 때 상단바가 "확인 필요"를 띄운다
  const followUps = messages.filter((m) => (m.role === 'confirm' || m.role === 'draft') && m.status === 'pending');
  const followUpCount = followUps.length;
  const followUpId = followUps.at(-1)?.id ?? null;
  useEffect(() => {
    useAgentChatStore.getState().setFollowUp(followUpCount, followUpId);
  }, [followUpCount, followUpId]);

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
    if (abortRef.current === controller) abortRef.current = null;
  };

  // 입력창 하나로 부탁과 업무 메모를 함께 받는다. 분명한 메모는 규칙(looksLikeWorkNotes)으로 바로 메모 정리로 보내고,
  // 그 밖에는 채팅으로 보내 의도 분류가 메모(work_notes)라고 하면 거기서 메모 정리로 넘긴다.
  const send = async (text: string) => {
    if (isRunning || text.trim() === '') return;
    if (canWriteFromNotes && looksLikeWorkNotes(text)) {
      void submitNotes(text);
      return;
    }
    const controller = begin();

    const history: Array<AgentChatTurn> = [...turns, { role: 'user', text: text.trim() }];
    setTurns(history);
    setMessages((prev) => [...prev, { id: createId(), role: 'user', text: text.trim() }]);

    let toolMessageId: string | null = null;
    let answerId: string | null = null;
    // 도구가 실행 중에 알린 변경 — 도구가 끝나면 그 메시지에 붙인다
    let pendingChange: AgentChange | null = null;
    try {
      const { turns: added, route } = await runAgentChatTurn({
        history,
        // 부탁 표현("~해줘" 등)이 있으면 업무 메모 의도를 아예 후보에서 뺀다 — 앞 대화가 메모 위주면 모델이
        // "지난주 보고서 요약해줘"까지 메모로 골랐다
        canWriteFromNotes: canWriteFromNotes && !hasRequestExpression(text),
        getTools: () => agentToolsFor(useAgentToolsStore.getState().tools, 'chat'),
        context: {
          confirm: requestConfirm,
          reportChange: (change) => {
            pendingChange = change;
          },
        },
        onContextTrim: () => setIsContextTrimmed(true),
        signal: controller.signal,
        onToolStart: (tool) => {
          const id = createId();
          toolMessageId = id;
          pendingChange = null;
          setMessages((prev) => [...prev, { id, role: 'tool', title: tool.title, status: 'running' }]);
        },
        onToolEnd: (_tool, result) => {
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
      if (route === 'notes') {
        // 부탁이 아니라 업무 메모였다 — 메모 정리가 대화 기록을 메모 턴으로 남기므로 방금 넣은 사용자 턴은 되돌린다
        setTurns(turns);
        await showNotesDraft(text, controller);
      } else setTurns([...history, ...added]);
    } catch (error) {
      if (toolMessageId) patchMessage(toolMessageId, { status: 'error' });
      if (!controller.signal.aborted) {
        console.error('[agent-chat]', error);
        setMessages((prev) => [...prev, { id: createId(), role: 'error', text: errorMessage(error) }]);
      }
    } finally {
      if (answerId) patchMessage(answerId, { streaming: false });
      end(controller);
    }
  };

  // 업무 메모를 정리해 보고서 초안 카드로 보여 준다. 폼에는 사용자가 "폼에 추가"를 눌러야 들어간다.
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
      // "폼에 추가"를 눌러야 들어간다 — 초안 카드로 눈을 끈다
      useAgentChatStore.getState().attend('message', draftId);
      setTurns((prev) => [
        ...prev,
        { role: 'user', text: `[The user wrote work notes to turn into a report]\n${notes.trim()}` },
        { role: 'assistant', text: '메모를 정리해 보고서 초안을 만들었어요. 확인하고 폼에 추가해 주세요.' },
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
    if (isRunning || notes.trim() === '') return;
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
      if (!tool) toast.error('보고서 작성 화면에서만 폼에 넣을 수 있어요.');
      return;
    }
    const controller = begin();
    const toolMessageId = createId();
    // 실행 중 도구가 알린 변경(콜백에서 채운다)
    const captured: { change: AgentChange | null } = { change: null };
    setMessages((prev) => [
      ...prev,
      { id: toolMessageId, role: 'tool', title: '메모 초안을 폼에 추가', status: 'running' },
    ]);
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
  };

  // 변경 카드의 되돌리기. 그사이 사용자가 직접 고쳤으면 덮어쓰지 않고 알린다. 모델도 알 수 있게 대화 기록에 남긴다.
  const undoChange = (id: string) => {
    const undo = undoFns.current.get(id);
    if (!undo || isRunning) return;
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
    if (isRunning) return;
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
      // 바꾸는 것 없이 끝난 결과(예: 가져올 미완료 업무 없음)는 사용자에게도 알린다
      if (result.isError) setMessages((prev) => [...prev, { id: createId(), role: 'error', text }]);
      else if (!applied && /"changed":false/.test(text)) {
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
        },
      ]);
    } catch (error) {
      console.error('[agent-tool]', error);
      patchMessage(toolMessageId, { status: 'error' });
    } finally {
      end(controller);
    }
  };

  // 상황 제안·빠른 작업·홈 입력창이 넘긴 할 일을 처리한다
  const runAction = (action: AgentAction) => {
    if (action.type === 'prompt') void send(action.text);
    else if (action.type === 'tool') void runTool(action.tool, action.title, action.input);
    else if (action.text) void submitNotes(action.text);
    // 메모 내용 없이 온 할 일(예: "오늘 한 일 적어서 보고서 쓰기" 제안)은 입력칸으로 데려간다 — 적으면 메모로 알아본다
    else useAgentChatStore.getState().reveal();
  };

  // 제안을 실행하면 이번 세션에서는 다시 권하지 않는다
  const runSuggestion = (suggestion: AgentSuggestion) => {
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
