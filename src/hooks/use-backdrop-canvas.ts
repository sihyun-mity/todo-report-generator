'use client';

import { useEffect, useRef } from 'react';

// 배경 이펙트 캔버스 엔진.
// rAF 루프 / DPR 스케일 / 리사이즈 / 라이트·다크 테마 / prefers-reduced-motion /
// 포인터 입력 플러밍을 한 곳에서 처리하고, 이펙트(src/app/_components/backdrop/)는
// frame() 그리기에만 집중한다.

export type BackdropTheme = 'light' | 'dark';

export type BackdropEnv = {
  ctx: CanvasRenderingContext2D;
  /** 리사이즈 시 같은 객체가 갱신된다 — 이펙트는 매 프레임 참조만 하면 된다 */
  size: { width: number; height: number };
  theme: () => BackdropTheme;
  /** window 기준 포인터 위치. active=false 면 커서가 화면 밖 */
  pointer: { x: number; y: number; active: boolean };
};

export type BackdropEffect = {
  /** 매 프레임 update + draw. dt 는 초 단위(최대 0.033 클램프) */
  frame: (dt: number, elapsed: number) => void;
  resize?: () => void;
  pointerDown?: (x: number, y: number) => void;
};

export type BackdropEffectFactory = (env: BackdropEnv) => BackdropEffect;

const MAX_DPR = 2;

export function useBackdropCanvas(factory: BackdropEffectFactory | null) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !factory) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    const env: BackdropEnv = {
      ctx,
      size: { width: 0, height: 0 },
      theme: () => (document.documentElement.classList.contains('dark') ? 'dark' : 'light'),
      pointer: { x: 0, y: 0, active: false },
    };

    let rafId = 0;
    let lastTime = 0;
    let elapsed = 0;

    const resize = () => {
      env.size.width = window.innerWidth;
      env.size.height = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      canvas.width = Math.floor(env.size.width * dpr);
      canvas.height = Math.floor(env.size.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    const effect = factory(env);

    const drawStaticFrame = () => {
      lastTime = 0;
      env.pointer.active = false;
      ctx.clearRect(0, 0, env.size.width, env.size.height);
      effect.frame(0.016, elapsed);
    };

    const loop = (time: number) => {
      const dt = lastTime === 0 ? 0.016 : Math.min((time - lastTime) / 1000, 0.033);
      lastTime = time;
      elapsed += dt;
      effect.frame(dt, elapsed);
      rafId = requestAnimationFrame(loop);
    };

    const startOrStop = () => {
      cancelAnimationFrame(rafId);
      if (reducedMotionQuery.matches) {
        drawStaticFrame();
        return;
      }
      lastTime = 0;
      rafId = requestAnimationFrame(loop);
    };

    const handleResize = () => {
      resize();
      effect.resize?.();
      if (reducedMotionQuery.matches) drawStaticFrame();
    };

    const handlePointerMove = (event: PointerEvent) => {
      env.pointer.x = event.clientX;
      env.pointer.y = event.clientY;
      env.pointer.active = true;
    };

    const handlePointerLeave = () => {
      env.pointer.active = false;
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (reducedMotionQuery.matches) return;
      effect.pointerDown?.(event.clientX, event.clientY);
    };

    startOrStop();

    reducedMotionQuery.addEventListener('change', startOrStop);
    window.addEventListener('resize', handleResize);
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerdown', handlePointerDown, { passive: true });
    document.documentElement.addEventListener('pointerleave', handlePointerLeave);

    return () => {
      cancelAnimationFrame(rafId);
      reducedMotionQuery.removeEventListener('change', startOrStop);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerdown', handlePointerDown);
      document.documentElement.removeEventListener('pointerleave', handlePointerLeave);
      // 다음 시안이 이전 그림 위에 그리지 않도록 비운다
      ctx.clearRect(0, 0, env.size.width, env.size.height);
    };
  }, [factory]);

  return canvasRef;
}
