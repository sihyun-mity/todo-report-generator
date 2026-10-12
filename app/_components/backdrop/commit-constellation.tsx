'use client';

import { useBackdropCanvas } from '@/hooks';
import { createCommitConstellation } from '.';

// 홈(보고서 작성) 전용 배경 이펙트 캔버스.
// (app) layout 의 `isolate` 스태킹 컨텍스트 안에서 -z-10 으로 배경색 위·모든 콘텐츠 아래에 깔린다.
export function CommitConstellation() {
  const canvasRef = useBackdropCanvas(createCommitConstellation);

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none fixed inset-0 -z-10 h-full w-full" />;
}
