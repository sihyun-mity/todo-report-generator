// Web Speech API(음성 인식) 중 이 앱이 쓰는 부분만 선언한다. TS 기본 DOM 타입에 SpeechRecognition 이 없다.
// Chrome 은 webkitSpeechRecognition 로도 제공한다. processLocally / available() 은 기기 안 인식(Chrome 139~) 옵션이다.

interface AppSpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface AppSpeechRecognitionErrorEvent extends Event {
  readonly error: string;
}

interface AppSpeechRecognition extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  processLocally?: boolean;
  onresult: ((event: AppSpeechRecognitionEvent) => void) | null;
  onerror: ((event: AppSpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface AppSpeechRecognitionConstructor {
  new (): AppSpeechRecognition;
  available?(options: { langs: ReadonlyArray<string>; processLocally: boolean }): Promise<string>;
  // 기기 안 인식 언어 팩을 내려받는다(사용자 클릭 안에서만)
  install?(options: { langs: ReadonlyArray<string>; processLocally: boolean }): Promise<boolean>;
}

interface Window {
  readonly SpeechRecognition?: AppSpeechRecognitionConstructor;
  readonly webkitSpeechRecognition?: AppSpeechRecognitionConstructor;
}
