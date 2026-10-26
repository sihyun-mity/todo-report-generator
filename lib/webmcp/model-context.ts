import type { WebMcpModelContext, WebMcpTool, WebMcpToolResult } from '@/types';

// 최신 스펙(`document.modelContext`)을 우선하고 초기 프리뷰(`navigator.modelContext`)로 폴백한다.
// 지원하지 않는 브라우저 / SSR 에서는 null.
export function getModelContext(): WebMcpModelContext | null {
  if (typeof document === 'undefined') return null;
  return document.modelContext ?? navigator.modelContext ?? null;
}

// 도구들을 등록하고 signal 이 abort 되면 모두 해제한다.
// 구현마다 해제 방식이 달라(signal / 반환된 `unregister()` / `unregisterTool(name)`) 셋 다 처리한다.
// 등록 실패(권한 없는 iframe 등)는 앱 동작과 무관하므로 경고만 남긴다.
export function registerWebMcpTools(tools: ReadonlyArray<WebMcpTool>, signal: AbortSignal): void {
  const modelContext = getModelContext();
  if (!modelContext) return;

  for (const tool of tools) {
    try {
      const registration = modelContext.registerTool(tool, { signal });
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
