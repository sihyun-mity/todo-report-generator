import type {
  AgentTool,
  AgentToolContext,
  AgentToolSurface,
  AgentToolUnavailable,
  WebMcpModelContext,
  WebMcpTool,
  WebMcpToolResult,
} from '@/types';
import { confirm } from '@/stores';

// 최신 스펙(`document.modelContext`)을 우선하고 초기 프리뷰(`navigator.modelContext`)로 폴백한다.
// 지원하지 않는 브라우저 / SSR 에서는 null.
export function getModelContext(): WebMcpModelContext | null {
  if (typeof document === 'undefined') return null;
  return document.modelContext ?? navigator.modelContext ?? null;
}

// 경로(WebMCP / 채팅)에 노출할 도구만 고른다. surfaces 를 생략한 도구는 둘 다에 노출된다.
export const agentToolsFor = (tools: ReadonlyArray<AgentTool>, surface: AgentToolSurface) =>
  tools.filter((tool) => !tool.surfaces || tool.surfaces.includes(surface));

// WebMCP 로 부른 도구는 화면의 확인 다이얼로그로 승인을 받는다 (채팅은 대화 안 카드로 따로 묻는다).
const WEBMCP_CONTEXT: AgentToolContext = { confirm };

// 공통 도구 정의를 브라우저에 넘기는 형태로 바꾼다 — 채팅 전용 필드(title)는 뺀다.
const toWebMcpTool = ({ name, description, inputSchema, annotations, execute }: AgentTool): WebMcpTool => ({
  name,
  description,
  inputSchema,
  annotations,
  execute: (input) => execute(input ?? {}, WEBMCP_CONTEXT),
});

// 도구들을 등록하고 signal 이 abort 되면 모두 해제한다.
// 구현마다 해제 방식이 달라(signal / 반환된 `unregister()` / `unregisterTool(name)`) 셋 다 처리한다.
// 등록 실패(권한 없는 iframe 등)는 앱 동작과 무관하므로 경고만 남긴다.
export function registerWebMcpTools(tools: ReadonlyArray<AgentTool>, signal: AbortSignal): void {
  const modelContext = getModelContext();
  if (!modelContext) return;

  for (const tool of agentToolsFor(tools, 'webmcp')) {
    try {
      const registration = modelContext.registerTool(toWebMcpTool(tool), { signal });
      if (registration instanceof Promise) {
        registration.catch((err) => console.warn(`WebMCP 도구 등록 실패: ${tool.name}`, err));
      }
      signal.addEventListener('abort', () => {
        if (hasUnregister(registration)) registration.unregister();
        else modelContext.unregisterTool?.(tool.name);
      });
    } catch (err) {
      console.warn(`WebMCP 도구 등록 실패: ${tool.name}`, err);
    }
  }
}

const hasUnregister = (value: unknown): value is { unregister: () => void } =>
  typeof value === 'object' && value !== null && typeof (value as { unregister?: unknown }).unregister === 'function';

export const toolText = (data: unknown): WebMcpToolResult => ({
  content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data) }],
});

export const toolError = (message: string): WebMcpToolResult => ({
  content: [{ type: 'text', text: message }],
  isError: true,
});

// 요청한 대상이 없어 할 수 없을 때 — 못 한 이유와 대신 해 줄 수 있는 일을 묻는 문장을 함께 돌려준다.
// 채팅은 이 결과를 받으면 다른 도구로 대신하지 않고 이 두 문장으로 되묻는다(parseToolUnavailable). WebMCP 에이전트는 JSON 으로 읽는다.
export const toolUnavailable = (unavailable: AgentToolUnavailable): WebMcpToolResult => ({
  content: [{ type: 'text', text: JSON.stringify({ unavailable: true, ...unavailable }) }],
  isError: true,
});

export const parseToolUnavailable = (result: WebMcpToolResult): AgentToolUnavailable | null => {
  if (!result.isError) return null;
  try {
    const data = JSON.parse(result.content.map((c) => c.text).join('')) as Partial<AgentToolUnavailable> & {
      unavailable?: unknown;
    };
    return data.unavailable === true && typeof data.reason === 'string' && typeof data.offer === 'string'
      ? { reason: data.reason, offer: data.offer }
      : null;
  } catch {
    return null;
  }
};
