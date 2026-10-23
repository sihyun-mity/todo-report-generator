// Chrome 내장 Prompt API(Gemini Nano) 중 이 앱이 쓰는 부분만 선언한다.
// https://developer.chrome.com/docs/ai/prompt-api — Chrome 데스크톱 외 브라우저에는 `LanguageModel` 전역이 없다.

type LanguageModelAvailability = 'unavailable' | 'downloadable' | 'downloading' | 'available';

type LanguageModelExpected = { type: 'text'; languages?: ReadonlyArray<string> };

type LanguageModelMessage = { role: 'system' | 'user' | 'assistant'; content: string };

interface LanguageModelDownloadProgressEvent extends Event {
  readonly loaded: number;
}

interface LanguageModelMonitor extends EventTarget {
  addEventListener(type: 'downloadprogress', listener: (event: LanguageModelDownloadProgressEvent) => void): void;
}

type LanguageModelCreateOptions = {
  expectedInputs?: ReadonlyArray<LanguageModelExpected>;
  expectedOutputs?: ReadonlyArray<LanguageModelExpected>;
  initialPrompts?: ReadonlyArray<LanguageModelMessage>;
  signal?: AbortSignal;
  monitor?: (monitor: LanguageModelMonitor) => void;
};

type LanguageModelPromptOptions = {
  responseConstraint?: object;
  signal?: AbortSignal;
};

declare class LanguageModel {
  static availability(options?: LanguageModelCreateOptions): Promise<LanguageModelAvailability>;
  static create(options?: LanguageModelCreateOptions): Promise<LanguageModel>;
  prompt(input: string, options?: LanguageModelPromptOptions): Promise<string>;
  // 청크는 직전 청크 이후 새로 생성된 부분(delta)이다
  promptStreaming(input: string, options?: LanguageModelPromptOptions): ReadableStream<string>;
  clone(options?: { signal?: AbortSignal }): Promise<LanguageModel>;
  destroy(): void;
}
