'use client';

// 실제 ReportPreview의 padding/border/text-size 클래스를 그대로 사용해 line-height 기반 높이를 픽셀 단위까지 일치시킨다.
// 본문은 실제 보고서 텍스트가 9줄(설명 1 + 빈줄 + 섹션 1 + 프로젝트 1 + 작업 1 + 빈줄 + 섹션 1 + 프로젝트 1 + 작업 1)이므로
// 동일하게 9 라인을 점유한다.
export const ReportPreviewSkeleton = () => {
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-6 dark:border-zinc-700/50 dark:bg-card/50">
      {/* 헤더 — 실제와 동일 구조: h2(text-sm) + 날짜 부제(mt-0.5 text-xs) + 우측 글자수(text-[11px]) */}
      <div className="mb-4 flex items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold tracking-wider text-zinc-500 uppercase">미리보기</h2>
          <p className="mt-0.5 text-xs">
            <span className="inline-block w-24 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700">&nbsp;</span>
          </p>
        </div>
        <span className="text-[11px]">
          <span className="inline-block w-7 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700">&nbsp;</span>
        </span>
      </div>
      {/* 본문 — 실제 pre 의 p-4 + text-sm 그대로. 9 줄 분량을 차지해 동일한 높이가 된다. */}
      <div className="mb-6 rounded-lg border border-zinc-100 bg-white p-4 text-sm dark:border-zinc-700/30 dark:bg-background/50">
        <div className="animate-pulse">
          <div>
            <span className="inline-block w-2/3 rounded bg-zinc-200 dark:bg-zinc-700">&nbsp;</span>
          </div>
          <div>&nbsp;</div>
          <div>
            <span className="inline-block w-1/3 rounded bg-zinc-200 dark:bg-zinc-700">&nbsp;</span>
          </div>
          <div className="pl-4">
            <span className="inline-block w-1/3 rounded bg-zinc-200 dark:bg-zinc-700">&nbsp;</span>
          </div>
          <div className="pl-8">
            <span className="inline-block w-1/2 rounded bg-zinc-200 dark:bg-zinc-700">&nbsp;</span>
          </div>
          <div>&nbsp;</div>
          <div>
            <span className="inline-block w-1/3 rounded bg-zinc-200 dark:bg-zinc-700">&nbsp;</span>
          </div>
          <div className="pl-4">
            <span className="inline-block w-1/3 rounded bg-zinc-200 dark:bg-zinc-700">&nbsp;</span>
          </div>
          <div className="pl-8">
            <span className="inline-block w-1/2 rounded bg-zinc-200 dark:bg-zinc-700">&nbsp;</span>
          </div>
        </div>
      </div>
      {/* 복사하기 — 실제 py-3 + 기본 text-base font-semibold 그대로 (h-12 상당) */}
      <div className="mb-2 w-full animate-pulse rounded-lg bg-zinc-200 py-3 text-center font-semibold dark:bg-zinc-700">
        &nbsp;
      </div>
      {/* 초기화 — 실제 py-3 + text-sm font-medium 그대로 (h-11 상당) */}
      <div className="w-full animate-pulse rounded-lg bg-zinc-100 py-3 text-center text-sm font-medium dark:bg-zinc-800/50">
        &nbsp;
      </div>
    </div>
  );
};
