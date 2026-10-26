// Chrome 내장 Prompt API(Gemini Nano) 공통 래퍼 — 커밋 분류(`lib/commit-classifier`)와 앱 안 채팅(`lib/prompt-api/agent-chat`)이 함께 쓴다.

// Gemini Nano 는 한국어를 공식 지원 언어로 받지 않는다 — `ko` 로 선언하면 availability 가 'unavailable'.
// 영어로 선언하고 한국어를 그대로 넣는다(PoC 에서 한국어 이해·생성에는 문제가 없었다).
export const PROMPT_API_OPTIONS: LanguageModelCreateOptions = {
  expectedInputs: [{ type: 'text', languages: ['en'] }],
  expectedOutputs: [{ type: 'text', languages: ['en'] }],
};

export const getPromptApiAvailability = async (): Promise<LanguageModelAvailability> => {
  if (typeof LanguageModel === 'undefined') return 'unavailable';
  try {
    return await LanguageModel.availability(PROMPT_API_OPTIONS);
  } catch {
    return 'unavailable';
  }
};

// 모델 내려받기. Chrome 은 'downloadable' 상태의 create() 에 사용자 활성화(클릭)를 요구하므로
// 반드시 버튼 클릭 핸들러에서 호출한다. 수 GB 라 어떤 흐름에서도 자동으로 시작하지 않는다.
export const downloadPromptModel = async (onDownloadProgress: (ratio: number) => void): Promise<void> => {
  const session = await LanguageModel.create({
    ...PROMPT_API_OPTIONS,
    monitor(monitor) {
      monitor.addEventListener('downloadprogress', (event) => onDownloadProgress(event.loaded));
    },
  });
  session.destroy();
};

// 같은 모델로 프롬프트를 동시에 돌리면 뒤 요청이 수 분간 멈추는 현상이 있다. 세션이 달라도(커밋 분류 중 채팅 등) 겹치지 않게
// 탭 전체에서 모델 호출을 한 줄로 세운다. 앞 호출이 실패해도 다음 호출은 돈다.
// 커밋 분류는 호출을 하나씩 기다리며 넣어 큐에 늘 한 건만 있다 — 채팅이 끼어들면 지금 호출 하나만 기다리고 그 뒤로는 번갈아 돈다.
// 둘 다 느려지므로 누가 모델을 쓰고 있는지(owner) 세어 두고, 채팅은 다른 작업과 나눠 쓰는 중이면 생각 과정에 알린다.
let modelQueue: Promise<unknown> = Promise.resolve();

export type ModelOwner = 'chat' | 'notes' | 'commit-import';

// 주인별 대기·실행 중 호출 수
const modelHolders = new Map<ModelOwner, number>();

export const withModelLock = <T>(run: () => Promise<T>, owner: ModelOwner = 'chat'): Promise<T> => {
  modelHolders.set(owner, (modelHolders.get(owner) ?? 0) + 1);
  const release = () => modelHolders.set(owner, (modelHolders.get(owner) ?? 1) - 1);
  const next = modelQueue.then(run, run).finally(release);
  modelQueue = next.catch(() => undefined);
  return next;
};

// 지금 모델을 쓰고 있거나 기다리는 다른 작업 — 없으면 null
export const otherModelOwner = (self: ModelOwner): ModelOwner | null =>
  [...modelHolders].find(([owner, count]) => owner !== self && count > 0)?.[0] ?? null;

// 스트리밍 응답을 끝까지 읽는다. 청크는 직전 청크 이후 새로 생성된 부분(delta)이라 이어 붙이고, 지금까지의 원문을 매번 넘긴다.
// maxChars 를 넘으면 생성을 멈추고 거기까지 돌려준다 — 길이 제한 없는 답변에서 작은 모델이 수천 토큰을 이어 쓰며
// 몇 분씩 모델을 붙잡고 화면이 멈췄다
export const readPromptStream = async (
  stream: ReadableStream<string>,
  onText: (text: string) => void,
  maxChars = Infinity
) => {
  const reader = stream.getReader();
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return text;
    text += value;
    onText(text);
    if (text.length >= maxChars) {
      await reader.cancel();
      return text;
    }
  }
};

// onText 를 주면 응답을 스트리밍으로 받아 지금까지 생성된 원문(JSON 조각)을 매번 넘긴다 — 분류 중 "AI 생각" 표시용.
export type JsonAsker = <T>(prompt: string, schema: object, onText?: (text: string) => void) => Promise<T>;

// 세션 하나를 만들고 질문마다 clone 해 쓴다(앞 질문의 문맥이 섞이지 않게). 호출은 withModelLock 으로 직렬로 한다.
// availability 가 'available' 일 때만 호출한다(다운로드는 downloadPromptModel 로 따로).
// signal 이 중단되면 진행 중인 응답을 끊고 대기열에 남은 질문은 모델에 보내지 않는다(AbortError 로 끝난다).
export const openPromptSession = async ({
  signal,
  timeoutMs,
  owner = 'commit-import',
}: Readonly<{ signal?: AbortSignal; timeoutMs: number; owner?: ModelOwner }>): Promise<{
  ask: JsonAsker;
  close: () => void;
}> => {
  const base = await LanguageModel.create({ ...PROMPT_API_OPTIONS, signal });

  const ask: JsonAsker = <T>(prompt: string, schema: object, onText?: (text: string) => void) =>
    withModelLock(async () => {
      signal?.throwIfAborted();
      const session = await base.clone({ signal });
      try {
        const timeout = AbortSignal.timeout(timeoutMs);
        const options = {
          responseConstraint: schema,
          signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
        };
        const raw = onText
          ? await readPromptStream(session.promptStreaming(prompt, options), onText)
          : await session.prompt(prompt, options);
        return JSON.parse(raw) as T;
      } finally {
        session.destroy();
      }
    }, owner);

  return { ask, close: () => base.destroy() };
};
