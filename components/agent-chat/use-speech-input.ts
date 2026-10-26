'use client';

import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { AGENT_VOICE_CLOUD_CONSENT_KEY } from '@/constants';
import { confirm } from '@/stores';

const getRecognitionCtor = () =>
  typeof window === 'undefined' ? undefined : (window.SpeechRecognition ?? window.webkitSpeechRecognition);

// 기기 안 인식을 쓸 수 있으면 그것으로, 아니면 브라우저 음성 인식 서비스(Chrome 은 Google 서버)로 인식한다.
// AI 대화는 이 기기 안에서만 처리된다고 알리고 있으므로, 서버로 보내는 경우는 처음 한 번 알리고 동의를 받는다.
// 기기 안 인식 언어 팩이 없으면(downloadable) 먼저 내려받아 본다 — 마이크 버튼 클릭 안에서 불러야 한다
const canRecognizeLocally = async (Ctor: AppSpeechRecognitionConstructor) => {
  const options = { langs: ['ko-KR'], processLocally: true };
  try {
    const status = await Ctor.available?.(options);
    if (status === 'available') return true;
    if ((status === 'downloadable' || status === 'downloading') && Ctor.install) return await Ctor.install(options);
    return false;
  } catch {
    return false;
  }
};

const hasCloudConsent = () => {
  try {
    return localStorage.getItem(AGENT_VOICE_CLOUD_CONSENT_KEY) === '1';
  } catch {
    return false;
  }
};

const saveCloudConsent = () => {
  try {
    localStorage.setItem(AGENT_VOICE_CLOUD_CONSENT_KEY, '1');
  } catch {
    // 기억하지 못하면 다음에 다시 물을 뿐이다
  }
};

// 받아쓰기. onText 에는 이번 받아쓰기에서 지금까지 인식한 전체 문장(확정 + 인식 중)을 넘긴다.
export function useSpeechInput(onText: (transcript: string) => void) {
  const [isSupported] = useState(() => !!getRecognitionCtor());
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<AppSpeechRecognition | null>(null);
  const onTextRef = useRef(onText);
  useEffect(() => {
    onTextRef.current = onText;
  });

  // 패널이 닫히면(언마운트) 받아쓰기도 멈춘다
  useEffect(() => () => recognitionRef.current?.abort(), []);

  const stop = () => recognitionRef.current?.stop();

  const start = async () => {
    const Ctor = getRecognitionCtor();
    if (!Ctor || recognitionRef.current) return;
    const local = await canRecognizeLocally(Ctor);
    if (!local && !hasCloudConsent()) {
      const ok = await confirm({
        title: '음성 입력',
        description:
          '이 브라우저는 기기 안에서 음성을 인식할 수 없어, 말한 내용이 브라우저의 음성 인식 서비스(Google)로 전송돼 글자로 바뀌어요.\nAI 도우미의 답변은 계속 이 기기 안에서만 만들어져요.',
        confirmText: '계속',
      });
      if (!ok) return;
      saveCloudConsent();
    }

    const recognition = new Ctor();
    recognition.lang = 'ko-KR';
    recognition.interimResults = true;
    recognition.continuous = false;
    if (local) recognition.processLocally = true;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? '')
        .join('');
      onTextRef.current(transcript.trim());
    };
    recognition.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed')
        toast.error('마이크 권한을 허용해야 음성으로 입력할 수 있어요.');
      else if (event.error !== 'no-speech' && event.error !== 'aborted') toast.error('음성을 인식하지 못했어요.');
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setIsListening(false);
    };
    recognitionRef.current = recognition;
    setIsListening(true);
    recognition.start();
  };

  return { isSupported, isListening, start, stop };
}
