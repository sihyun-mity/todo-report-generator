import { COMMIT_CLASSIFY_PROMPT_TIMEOUT_MS, COMMIT_IMPORT_AI_NOTICE_STORAGE_KEY } from '@/constants';

// Gemini Nano 는 한국어를 공식 지원 언어로 받지 않는다 — `ko` 로 선언하면 availability 가 'unavailable'.
// 영어로 선언하고 한국어 커밋 메시지를 그대로 넣는다(PoC 에서 한국어 이해에는 문제가 없었다).
const OPTIONS: LanguageModelCreateOptions = {
  expectedInputs: [{ type: 'text', languages: ['en'] }],
  expectedOutputs: [{ type: 'text', languages: ['en'] }],
};

export const getPromptApiAvailability = async (): Promise<LanguageModelAvailability> => {
  if (typeof LanguageModel === 'undefined') return 'unavailable';
  try {
    return await LanguageModel.availability(OPTIONS);
  } catch {
    return 'unavailable';
  }
};

// AI 를 쓸 수 없는 상태 — 분류 전에 한 번 안내한다. 내려받는 중('downloading')도 아직 쓸 수 없어 설치 안내로 묶는다.
export type PromptAiNoticeKind = 'downloadable' | 'unavailable';

export const promptAiNoticeKind = (availability: LanguageModelAvailability): PromptAiNoticeKind | null =>
  availability === 'available' ? null : availability === 'unavailable' ? 'unavailable' : 'downloadable';

// 같은 상태의 안내는 이 기기에서 한 번만 보여 준다. 상태가 바뀌면(예: 지원 브라우저에서 모델만 없음) 다시 안내한다.
// 저장소를 쓸 수 없으면 매번 안내하는 쪽으로 둔다.
export const hasSeenPromptAiNotice = (kind: PromptAiNoticeKind) => {
  try {
    return localStorage.getItem(COMMIT_IMPORT_AI_NOTICE_STORAGE_KEY) === kind;
  } catch {
    return false;
  }
};

export const markPromptAiNoticeSeen = (kind: PromptAiNoticeKind) => {
  try {
    localStorage.setItem(COMMIT_IMPORT_AI_NOTICE_STORAGE_KEY, kind);
  } catch {
    // 기억하지 못하면 다음에 다시 안내할 뿐이다
  }
};

// 모델 내려받기. Chrome 은 'downloadable' 상태의 create() 에 사용자 활성화(클릭)를 요구하므로
// 반드시 버튼 클릭 핸들러에서 호출한다. 수 GB 라 분류 흐름에서 자동으로 시작하지 않는다.
export const downloadPromptModel = async (onDownloadProgress: (ratio: number) => void): Promise<void> => {
  const session = await LanguageModel.create({
    ...OPTIONS,
    monitor(monitor) {
      monitor.addEventListener('downloadprogress', (event) => onDownloadProgress(event.loaded));
    },
  });
  session.destroy();
};

// onText 를 주면 응답을 스트리밍으로 받아 지금까지 생성된 원문(JSON 조각)을 매번 넘긴다 — 분류 중 "AI 생각" 표시용.
export type JsonAsker = <T>(prompt: string, schema: object, onText?: (text: string) => void) => Promise<T>;

// 세션 하나를 만들고 질문마다 clone 해 쓴다(앞 질문의 문맥이 섞이지 않게).
// 같은 모델로 프롬프트를 동시에 돌리면 뒤 요청이 수 분간 멈추는 현상이 있어 호출은 반드시 직렬로 한다.
// availability 가 'available' 일 때만 호출한다(다운로드는 downloadPromptModel 로 따로).
// signal 이 중단되면 진행 중인 응답을 끊고 대기열에 남은 질문은 모델에 보내지 않는다(AbortError 로 끝난다) —
// 다른 세션의 분류와 모델 호출이 겹치지 않게, 새로 분류하기 전에 이전 분류를 멈출 때 쓴다.
export const openPromptSession = async (signal?: AbortSignal): Promise<{ ask: JsonAsker; close: () => void }> => {
  const base = await LanguageModel.create({ ...OPTIONS, signal });

  let queue: Promise<unknown> = Promise.resolve();
  const ask: JsonAsker = <T>(prompt: string, schema: object, onText?: (text: string) => void) => {
    const run = async () => {
      signal?.throwIfAborted();
      const session = await base.clone({ signal });
      try {
        const timeout = AbortSignal.timeout(COMMIT_CLASSIFY_PROMPT_TIMEOUT_MS);
        const options = {
          responseConstraint: schema,
          signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
        };
        const raw = onText
          ? await readStream(session.promptStreaming(prompt, options), onText)
          : await session.prompt(prompt, options);
        return JSON.parse(raw) as T;
      } finally {
        session.destroy();
      }
    };
    const next = queue.then(run, run);
    queue = next.catch(() => undefined);
    return next;
  };

  return { ask, close: () => base.destroy() };
};

const readStream = async (stream: ReadableStream<string>, onText: (text: string) => void) => {
  const reader = stream.getReader();
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return text;
    text += value;
    onText(text);
  }
};
