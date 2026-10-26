// WebMCP 진입점. 최신 스펙은 `document.modelContext`, 초기 프리뷰(Chrome 146~149)는 `navigator.modelContext`.
// 지원하지 않는 브라우저에서는 둘 다 undefined 다.
interface Document {
  readonly modelContext?: import('@/types').WebMcpModelContext;
}

interface Navigator {
  readonly modelContext?: import('@/types').WebMcpModelContext;
}
