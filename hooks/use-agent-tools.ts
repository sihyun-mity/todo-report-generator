import { useEffect, useEffectEvent } from 'react';
import type { AgentTool } from '@/types';
import { registerWebMcpTools } from '@/lib/webmcp';
import { useAgentToolsStore } from '@/stores';

// 도구를 WebMCP(브라우저 에이전트)와 앱 안 채팅 레지스트리에 함께 등록한다. 정의는 createTools 한 곳에만 둔다.
// enabled 가 true 인 동안만 등록하고, 화면이 숨겨지면(Activity) effect cleanup 으로 둘 다 해제한다 — 다시 보이면 재등록된다.
// 도구는 등록 시점에 한 번 만들어지므로 execute 안에서는 store.getState() 나 useEffectEvent 로 최신 값을 읽는다.
export function useAgentTools(createTools: () => ReadonlyArray<AgentTool>, enabled: boolean) {
  const buildTools = useEffectEvent(createTools);

  useEffect(() => {
    if (!enabled) return;
    const tools = buildTools();
    const unregister = useAgentToolsStore.getState().register(tools);
    const controller = new AbortController();
    registerWebMcpTools(tools, controller.signal);
    return () => {
      controller.abort();
      unregister();
    };
  }, [enabled]);
}
