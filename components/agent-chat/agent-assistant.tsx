'use client';

import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import type { AgentChatMessage, AgentChatTurn, AgentToolContext } from '@/types';
import { useResetOnHide } from '@/hooks';
import { downloadPromptModel, getPromptApiAvailability, runAgentChatTurn } from '@/lib/prompt-api';
import { agentToolsFor } from '@/lib/webmcp';
import { useAgentChatStore, useAgentToolsStore } from '@/stores';
import { createId } from '@/utils';
import { AgentChatPanel, useGlobalAgentTools } from '.';

// 모델이 던진 오류를 사용자 문구로 바꾼다
const errorMessage = (error: unknown) => {
  if (error instanceof DOMException && error.name === 'QuotaExceededError')
    return '대화가 길어져 AI가 더 읽을 수 없어요. 새 대화를 시작해 주세요.';
  if (error instanceof DOMException && error.name === 'TimeoutError')
    return 'AI 응답이 너무 오래 걸려 멈췄어요. 다시 시도해 주세요.';
  return 'AI 응답을 만들지 못했어요. 다시 시도해 주세요.';
};

// (app) 그룹 레이아웃에 한 번 마운트되는 AI 도우미 — 전역 에이전트 도구를 등록하고 채팅 대화를 들고 있다.
// 레이아웃이 화면 이동에도 유지되므로 대화는 (app) 화면 사이를 오가도 이어진다. 응답은 Chrome 내장 모델(Gemini Nano)이 이 기기에서 만든다.
export function AgentAssistant() {
  useGlobalAgentTools();

  const isOpen = useAgentChatStore((s) => s.isOpen);
  const setOpen = useAgentChatStore((s) => s.setOpen);
  const tools = agentToolsFor(
    useAgentToolsStore((s) => s.tools),
    'chat'
  );

  const [messages, setMessages] = useState<Array<AgentChatMessage>>([]);
  const [turns, setTurns] = useState<Array<AgentChatTurn>>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [availability, setAvailability] = useState<LanguageModelAvailability | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  // 대화 안 확인 카드의 응답 대기 — 카드 id → resolve
  const pendingConfirms = useRef(new Map<string, (ok: boolean) => void>());

  // 열 때마다 가용성을 다시 본다 — 다른 화면(커밋 가져오기)에서 모델을 받았거나 브라우저 설정이 바뀌었을 수 있다
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    void getPromptApiAvailability().then((next) => {
      if (!cancelled) setAvailability(next);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

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
    setOpen(false);
  });

  // 확인이 필요한 도구는 확인 다이얼로그 대신 대화 안 카드로 묻는다. 패널이 닫혀 있으면 열어서 보여 준다.
  const requestConfirm: AgentToolContext['confirm'] = (options) =>
    new Promise<boolean>((resolve) => {
      const id = createId();
      pendingConfirms.current.set(id, resolve);
      setMessages((prev) => [...prev, { id, role: 'confirm', options, status: 'pending' }]);
      setOpen(true);
    });

  const answerConfirm = (id: string, ok: boolean) => {
    const resolve = pendingConfirms.current.get(id);
    if (!resolve) return;
    pendingConfirms.current.delete(id);
    patchMessage(id, { status: ok ? 'approved' : 'rejected' });
    resolve(ok);
  };

  const send = async (text: string) => {
    if (isRunning || text.trim() === '') return;
    const controller = new AbortController();
    abortRef.current = controller;
    setIsRunning(true);

    const history: Array<AgentChatTurn> = [...turns, { role: 'user', text: text.trim() }];
    setTurns(history);
    setMessages((prev) => [...prev, { id: createId(), role: 'user', text: text.trim() }]);

    let toolMessageId: string | null = null;
    let answerId: string | null = null;
    try {
      const added = await runAgentChatTurn({
        history,
        getTools: () => agentToolsFor(useAgentToolsStore.getState().tools, 'chat'),
        context: { confirm: requestConfirm },
        signal: controller.signal,
        onToolStart: (tool) => {
          const id = createId();
          toolMessageId = id;
          setMessages((prev) => [...prev, { id, role: 'tool', title: tool.title, status: 'running' }]);
        },
        onToolEnd: (_tool, result) => {
          if (toolMessageId) patchMessage(toolMessageId, { status: result.isError ? 'error' : 'done' });
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
      setTurns([...history, ...added]);
    } catch (error) {
      if (toolMessageId) patchMessage(toolMessageId, { status: 'error' });
      if (!controller.signal.aborted) {
        console.error('[agent-chat]', error);
        setMessages((prev) => [...prev, { id: createId(), role: 'error', text: errorMessage(error) }]);
      }
    } finally {
      if (answerId) patchMessage(answerId, { streaming: false });
      settleConfirms(false);
      setIsRunning(false);
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const reset = () => {
    stop();
    setMessages([]);
    setTurns([]);
  };

  // 패널을 닫으면 응답에 기다리던 확인은 취소로 본다 — 보이지 않는 카드가 도구 실행을 붙잡지 않게
  const close = () => {
    settleConfirms(false);
    setOpen(false);
  };

  // 클릭 핸들러에서만 호출한다 — Chrome 이 모델 다운로드 시작에 사용자 활성화를 요구한다
  const download = async () => {
    setDownloadProgress(0);
    try {
      await downloadPromptModel(setDownloadProgress);
      setAvailability(await getPromptApiAvailability());
    } catch {
      toast.error('온디바이스 AI 모델을 내려받지 못했습니다.');
    } finally {
      setDownloadProgress(null);
    }
  };

  if (!isOpen) return null;

  return (
    <AgentChatPanel
      availability={availability}
      downloadProgress={downloadProgress}
      messages={messages}
      toolNames={tools.map((t) => t.name)}
      isRunning={isRunning}
      onSend={send}
      onStop={stop}
      onReset={reset}
      onClose={close}
      onDownload={download}
      onAnswerConfirm={answerConfirm}
    />
  );
}
