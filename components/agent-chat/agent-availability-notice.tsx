'use client';

import { Cpu, Download, Loader2 } from 'lucide-react';

type AgentAvailabilityNoticeProps = {
  availability: LanguageModelAvailability | null;
  // 모델 내려받는 중이면 0~1, 아니면 null
  downloadProgress: number | null;
  onDownload: () => void;
};

// AI 대화를 쓸 수 없을 때의 안내. 패널을 막지 않는 작은 안내로 둔다 — 상황 제안·빠른 작업은 모델 없이도 동작한다.
// 미지원 브라우저·모델 미설치를 구분하고, 다운로드는 버튼 클릭으로만 시작한다.
export function AgentAvailabilityNotice({
  availability,
  downloadProgress,
  onDownload,
}: Readonly<AgentAvailabilityNoticeProps>) {
  if (availability === 'available') return null;
  if (availability === null)
    return (
      <p className="flex items-center gap-2 rounded-xl bg-zinc-50 px-3 py-2.5 text-xs text-zinc-500 dark:bg-zinc-800/60 dark:text-zinc-400">
        <Loader2 size={14} className="animate-spin" aria-hidden />
        온디바이스 AI를 확인하는 중...
      </p>
    );

  const canDownload = availability === 'downloadable' || availability === 'downloading';
  return (
    <div className="space-y-2.5 rounded-xl bg-zinc-50 px-3 py-3 dark:bg-zinc-800/60">
      <div className="flex gap-2.5">
        <Cpu size={16} className="mt-0.5 shrink-0 text-blue-500" aria-hidden />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-100">
            {canDownload ? 'AI 대화를 쓰려면 온디바이스 모델이 필요해요' : '이 브라우저에서는 AI 대화를 쓸 수 없어요'}
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
            {canDownload
              ? 'Chrome에 내장된 AI 모델로 이 기기 안에서 답해요. 처음 한 번만 받으며 몇 분 걸릴 수 있어요. 추천과 빠른 작업은 지금도 쓸 수 있어요.'
              : 'AI 대화는 Chrome 데스크톱 최신 버전에서 동작해요. 추천과 빠른 작업은 그대로 쓸 수 있어요.'}
          </p>
        </div>
      </div>
      {canDownload &&
        (downloadProgress === null ? (
          <button
            type="button"
            onClick={onDownload}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            <Download size={14} aria-hidden />
            {availability === 'downloading' ? '내려받기 진행 상황 보기' : 'AI 모델 받기'}
          </button>
        ) : (
          <div className="space-y-1" role="status">
            <div className="h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
              <div
                className="h-full rounded-full bg-blue-500 transition-[width]"
                style={{ width: `${Math.round(downloadProgress * 100)}%` }}
              />
            </div>
            <p className="text-center text-[11px] text-zinc-500 dark:text-zinc-400">
              AI 모델을 내려받는 중... {Math.round(downloadProgress * 100)}%
            </p>
          </div>
        ))}
    </div>
  );
}
